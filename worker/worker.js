// ==================== КОНСТАНТЫ ====================
const VK_API = 'https://api.vk.com/method';
const VK_VERSION = '5.131';

// ==================== ГЛАВНЫЙ ОБРАБОТЧИК ====================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS для запросов с сайта (GitHub Pages)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ---------- VK Callback API ----------
    if (url.pathname === '/vk-callback') {
      return handleVKCallback(request, env, corsHeaders);
    }

    // ---------- Сайт просит отправить сообщение в беседу ----------
    if (url.pathname === '/send-status' && request.method === 'POST') {
      return handleSendStatus(request, env, corsHeaders);
    }

    // ---------- Проверка, что Worker жив ----------
    if (url.pathname === '/' || url.pathname === '') {
      return new Response('ATP bot is running', { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};

// ==================== VK CALLBACK ====================
async function handleVKCallback(request, env, corsHeaders) {
  // GET — VK проверяет сервер (подтверждение)
  if (request.method === 'GET') {
    return new Response(env.VK_CONFIRMATION, { headers: corsHeaders });
  }

  // POST — VK присылает события
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400, headers: corsHeaders });
  }

  // Проверка secret (защита от подделки)
  if (env.VK_SECRET && body.secret !== env.VK_SECRET) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  // Подтверждение сервера (VK присылает type: confirmation)
  if (body.type === 'confirmation') {
    return new Response(env.VK_CONFIRMATION, { headers: corsHeaders });
  }

  // Новое сообщение (в т.ч. нажатие кнопки)
  if (body.type === 'message_new') {
    await handleMessageNew(body.object.message, env);
  }

  // VK всегда ждёт "ok"
  return new Response('ok', { headers: corsHeaders });
}

// ==================== ОБРАБОТКА СООБЩЕНИЯ ИЗ БЕСЕДЫ ====================
async function handleMessageNew(message, env) {
  const fromId = message.from_id;       // VK ID нажавшего
  const peerId = message.peer_id;       // ID беседы
  const payload = message.payload;      // данные кнопки

  // Если это не нажатие кнопки — игнорируем
  if (!payload || !payload.cmd) {
    // Можно ответить на текстовые команды, если нужно
    return;
  }

  const cmd = payload.cmd; // 'online' | 'afk' | 'offline'
  const statusMap = {
    online: 'online',
    afk: 'afk',
    offline: 'offline',
  };
  const newStatus = statusMap[cmd];
  if (!newStatus) return;

  // Ищем сотрудника по VK ID в Firebase
  const employees = await fbGet(env, 'users');
  const list = Array.isArray(employees) ? employees : Object.values(employees || {});
  const emp = list.find(e => String(e.vkId) === String(fromId));

  if (!emp) {
    await vkSend(env, peerId, `❌ Ваш VK не привязан к аккаунту АТП. Обратитесь к администратору.`);
    return;
  }

  // Обновляем статус в Firebase
  await updateStatusInFirebase(env, emp.username, emp.name, emp.role, newStatus);

  // Отвечаем в беседу
  const statusText = {
    online: '🟢 на линии',
    afk: '🟡 АФК',
    offline: '🔴 ушёл с линии',
  }[newStatus];

  const staffList = await getStaffStatuses(env);
  const onlineCount = staffList.filter(s => s.status === 'online').length;

  await vkSend(env, peerId,
    `✅ ${emp.name}: ${statusText}\n👥 Всего на линии: ${onlineCount}`
  );
}

// ==================== ОБНОВЛЕНИЕ СТАТУСА В FIREBASE ====================
async function updateStatusInFirebase(env, username, name, role, status) {
  const today = getMoscowDate();
  const now = new Date().toISOString();

  // Читаем все статусы
  const all = await fbGet(env, 'staff_statuses');
  let list = Array.isArray(all) ? all : Object.values(all || {});

  const todayRecord = list.find(s => s.username === username && s.exitDate === today);

  if (status === 'online') {
    if (todayRecord) {
      todayRecord.status = 'online';
      todayRecord.afkReason = '';
      todayRecord.lastUpdate = getMoscowDateTime();
      todayRecord.lastUpdateRaw = now;
      todayRecord.sessionStart = now;
    } else {
      list.push({
        username, name,
        vkId: null,               // vkId берётся из users, тут не нужен
        status: 'online',
        afkReason: '',
        lastUpdate: getMoscowDateTime(),
        lastUpdateRaw: now,
        totalSeconds: 0,
        exitDate: today,
        sessionStart: now,
        role: role || 'driver',
      });
    }
  } else {
    if (todayRecord) {
      if (todayRecord.status === 'online' && todayRecord.sessionStart) {
        const sessionSec = Math.floor((Date.now() - new Date(todayRecord.sessionStart).getTime()) / 1000);
        todayRecord.totalSeconds = (todayRecord.totalSeconds || 0) + Math.max(0, sessionSec);
      }
      todayRecord.status = status;
      todayRecord.afkReason = status === 'afk' ? 'Из беседы ВК' : '';
      todayRecord.lastUpdate = getMoscowDateTime();
      todayRecord.lastUpdateRaw = now;
      todayRecord.sessionStart = null;
    }
  }

  // Записываем обратно
  await fbSet(env, 'staff_statuses', list);
}

// ==================== САЙТ → WORKER → БЕСЕДА ====================
async function handleSendStatus(request, env, corsHeaders) {
  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResp({ error: 'Bad JSON' }, 400, corsHeaders);
  }

  const { username, name, status, afkReason } = data;
  if (!username || !status) {
    return jsonResp({ error: 'username и status обязательны' }, 400, corsHeaders);
  }

  const statusEmoji = { online: '🟢', afk: '🟡', offline: '🔴' }[status] || '⚪';
  const statusText = {
    online: 'ВЫШЕЛ НА ЛИНИЮ',
    afk: `УШЁЛ В АФК${afkReason ? ` (${afkReason})` : ''}`,
    offline: 'УШЁЛ С ЛИНИИ',
  }[status] || status;

  // Получаем список онлайн
  const staffList = await getStaffStatuses(env);
  const online = staffList.filter(s => s.status === 'online');

  let message = `${statusEmoji} ${name || username}: ${statusText}\n\n`;
  if (online.length === 0) {
    message += 'На линии никого нет';
  } else {
    message += '🟢 На линии:\n' + online.map(s => `• ${s.name}`).join('\n');
  }

  await vkSend(env, env.VK_CHAT_ID, message);

  return jsonResp({ ok: true }, 200, corsHeaders);
}

// ==================== FIREBASE REST ====================
async function fbGet(env, path) {
  const r = await fetch(`${env.FIREBASE_URL}/${path}.json`);
  if (!r.ok) return null;
  return await r.json();
}

async function fbSet(env, path, value) {
  const r = await fetch(`${env.FIREBASE_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  return r.ok;
}

async function getStaffStatuses(env) {
  const data = await fbGet(env, 'staff_statuses');
  if (!data) return [];
  return Array.isArray(data) ? data : Object.values(data);
}

// ==================== VK API ====================
async function vkSend(env, peerId, message) {
  const params = new URLSearchParams({
    peer_id: peerId,
    message: message,
    random_id: Math.floor(Math.random() * 1e9),
    access_token: env.VK_TOKEN,
    v: VK_VERSION,
  });

  const r = await fetch(`${VK_API}/messages.send?${params}`);
  return r.ok;
}

// ==================== МОСКОВСКОЕ ВРЕМЯ ====================
function getMoscowTime() {
  const now = new Date();
  return new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
}

function getMoscowDate() {
  const msk = getMoscowTime();
  const dd = String(msk.getDate()).padStart(2, '0');
  const mm = String(msk.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${msk.getFullYear()}`;
}

function getMoscowDateTime() {
  const msk = getMoscowTime();
  const dd = String(msk.getDate()).padStart(2, '0');
  const mm = String(msk.getMonth() + 1).padStart(2, '0');
  const yyyy = msk.getFullYear();
  const hh = String(msk.getHours()).padStart(2, '0');
  const mi = String(msk.getMinutes()).padStart(2, '0');
  const ss = String(msk.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${mi}:${ss}`;
}

// ==================== УТИЛИТЫ ====================
function jsonResp(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}