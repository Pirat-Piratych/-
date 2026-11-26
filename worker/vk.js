// api/vk.js — Vercel Serverless Function
export default async function handler(req, res) {
  // Настройка CORS для сайта (GitHub Pages)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Получаем URL-путь (например, /api/vk или /api/vk-callback)
  // Чтобы Vercel понимал запросы и от ВК, и от сайта, мы будем ловить всё здесь
  const path = req.url.split('?')[0];

  // 1. Отправка статуса с сайта (fetch на /api/send-status)
  // Но так как у нас один файл, мы принимаем POST без специфичного пути от ВК
  if (req.method === 'POST' && req.body && req.body.cmd) {
    // Это запрос ОТ ВК (нажатие кнопки в беседе)
    return await handleVKCallback(req, res);
  }

  if (req.method === 'POST' && req.body && req.body.status) {
    // Это запрос ОТ САЙТА (смена статуса)
    return await handleSendStatus(req, res);
  }

  // 2. Подтверждение сервера ВК (когда нажимаете "Подтвердить" в настройках)
  if (req.method === 'POST' && req.body && req.body.type === 'confirmation') {
    // ВАЖНО: сюда нужно вставить строку, которую просит ВК
    return res.status(200).send(process.env.VK_CONFIRMATION || 'ok');
  }

  // Если пришли сюда через браузер (GET) — показываем, что бот жив
  if (req.method === 'GET') {
    return res.status(200).send('ATP bot is running on Vercel');
  }

  return res.status(404).send('Not found');
}

// ==================== ОБРАБОТКА СООБЩЕНИЙ ИЗ БЕСЕДЫ ====================
async function handleVKCallback(req, res) {
  const body = req.body;

  // Проверка секретного ключа (из настроек ВК и переменных Vercel)
  if (process.env.VK_SECRET && body.secret !== process.env.VK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  if (body.type === 'confirmation') {
    return res.status(200).send(process.env.VK_CONFIRMATION || 'ok');
  }

  if (body.type === 'message_new') {
    const message = body.object.message;
    const fromId = message.from_id;
    const peerId = message.peer_id;
    const payload = message.payload;

    // Если нажата кнопка (cmd: online/afk/offline)
    if (payload && payload.cmd) {
      const cmd = payload.cmd;
      const statusMap = { online: 'online', afk: 'afk', offline: 'offline' };
      const newStatus = statusMap[cmd];

      if (newStatus) {
        // Ищем сотрудника в Firebase по VK ID
        const employees = await fbGet('users');
        const list = Array.isArray(employees) ? employees : Object.values(employees || {});
        const emp = list.find(e => String(e.vkId) === String(fromId));

        if (!emp) {
          await vkSend(peerId, `❌ Ваш VK не привязан к аккаунту АТП. Обратитесь к администратору.`);
        } else {
          await updateStatusInFirebase(emp.username, emp.name, emp.role, newStatus);
          
          const statusText = { online: '🟢 на линии', afk: '🟡 АФК', offline: '🔴 ушёл с линии' }[newStatus];
          const staffList = await getStaffStatuses();
          const onlineCount = staffList.filter(s => s.status === 'online').length;

          await vkSend(peerId, `✅ ${emp.name}: ${statusText}\n👥 Всего на линии: ${onlineCount}`);
        }
      }
    }
  }

  // ВК всегда ждет ответ "ok"
  return res.status(200).send('ok');
}

// ==================== ОТПРАВКА СТАТУСА С САЙТА ====================
async function handleSendStatus(req, res) {
  const { username, name, status, afkReason } = req.body;
  if (!username || !status) return res.status(400).json({ error: 'username и status обязательны' });

  const statusEmoji = { online: '🟢', afk: '🟡', offline: '🔴' }[status] || '⚪';
  const statusText = { 
    online: 'ВЫШЕЛ НА ЛИНИЮ', 
    afk: `УШЁЛ В АФК${afkReason ? ` (${afkReason})` : ''}`, 
    offline: 'УШЁЛ С ЛИНИИ' 
  }[status] || status;

  const staffList = await getStaffStatuses();
  const online = staffList.filter(s => s.status === 'online');

  let message = `${statusEmoji} ${name || username}: ${statusText}\n\n`;
  message += online.length === 0 ? 'На линии никого нет' : '🟢 На линии:\n' + online.map(s => `• ${s.name}`).join('\n');

  await vkSend(process.env.VK_CHAT_ID, message);
  return res.status(200).json({ ok: true });
}

// ==================== FIREBASE ====================
async function updateStatusInFirebase(username, name, role, status) {
  const today = getMoscowDate();
  const now = new Date().toISOString();

  const all = await fbGet('staff_statuses');
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
        username, name, vkId: null, status: 'online', afkReason: '',
        lastUpdate: getMoscowDateTime(), lastUpdateRaw: now,
        totalSeconds: 0, exitDate: today, sessionStart: now, role: role || 'driver'
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
  await fbSet('staff_statuses', list);
}

async function fbGet(path) {
  const url = `${process.env.FIREBASE_URL}/${path}.json`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return await r.json();
}

async function fbSet(path, value) {
  const url = `${process.env.FIREBASE_URL}/${path}.json`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  return r.ok;
}

async function getStaffStatuses() {
  const data = await fbGet('staff_statuses');
  if (!data) return [];
  return Array.isArray(data) ? data : Object.values(data);
}

// ==================== VK API ====================
async function vkSend(peerId, message) {
  const params = new URLSearchParams({
    peer_id: peerId, message, random_id: Math.floor(Math.random() * 1e9),
    access_token: process.env.VK_TOKEN, v: '5.131',
  });
  await fetch(`https://api.vk.com/method/messages.send?${params}`);
}

// ==================== ВРЕМЯ ====================
function getMoscowTime() {
  const now = new Date();
  return new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
}

function getMoscowDate() {
  const msk = getMoscowTime();
  return `${String(msk.getDate()).padStart(2, '0')}.${String(msk.getMonth() + 1).padStart(2, '0')}.${msk.getFullYear()}`;
}

function getMoscowDateTime() {
  const msk = getMoscowTime();
  return `${getMoscowDate()}, ${String(msk.getHours()).padStart(2, '0')}:${String(msk.getMinutes()).padStart(2, '0')}:${String(msk.getSeconds()).padStart(2, '0')}`;
}
