// Хранилище пользователей (только служебный админ)
const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'Администратор' }
];

// Инициализация localStorage при первом запуске
if (!localStorage.getItem('atp_users')) {
  localStorage.setItem('atp_users', JSON.stringify(DEFAULT_USERS));
}

// Иерархия ролей (кто кого может создавать)
const ROLE_HIERARCHY = {
  'admin': ['admin', 'zamdirektora', 'brigadir', 'driver'],           // Админ может всех
  'zamdirektora': ['brigadir', 'driver'],                              // Зам может бригадиров и водителей
  'brigadir': [],                                              // Бригадир никого
  'driver': []                                                         // Водитель никого
};

// Названия должностей
const ROLE_NAMES = {
  'admin': 'Администратор',
  'zamdirektora': 'Заместитель директора',
  'brigadir': 'Бригадир',
  'driver': 'Водитель'
};

// Получить текущего пользователя
function getCurrentUser() {
  return JSON.parse(localStorage.getItem('atp_current_user') || 'null');
}

// Сохранить текущего пользователя
function setCurrentUser(user) {
  localStorage.setItem('atp_current_user', JSON.stringify(user));
}

// Очистить текущего пользователя
function clearCurrentUser() {
  localStorage.removeItem('atp_current_user');
}

// Проверка на админа
function isAdmin() {
  const user = getCurrentUser();
  return user && user.role === 'admin';
}

// Проверка, может ли пользователь создавать другие роли
function canCreateRole(currentUserRole, targetRole) {
  const allowedRoles = ROLE_HIERARCHY[currentUserRole] || [];
  return allowedRoles.includes(targetRole);
}

// Получить список ролей, которые пользователь может создавать
function getCreatableRoles(userRole) {
  const roles = ROLE_HIERARCHY[userRole] || [];
  return roles.map(role => ({
    value: role,
    name: ROLE_NAMES[role]
  }));
}

// Инициализация области авторизации
function initAuth() {
  const authArea = document.getElementById('authArea');
  if (!authArea) return;

  const user = getCurrentUser();

  if (user) {
    authArea.innerHTML = `
      <span class="user-badge">👤 ${user.name || user.username} (${ROLE_NAMES[user.role] || user.role})</span>
      <button id="logoutBtn" class="btn-logout">Выйти</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);
  } else {
    authArea.innerHTML = `<a href="#" id="loginBtn" class="btn-login">Войти</a>`;
    document.getElementById('loginBtn').addEventListener('click', (e) => {
      e.preventDefault();
      showLoginDialog();
    });
  }
}

// Диалог входа
function showLoginDialog() {
  const username = prompt('Введите логин:');
  if (!username) return;
  const password = prompt('Введите пароль:');
  if (!password) return;

  const users = JSON.parse(localStorage.getItem('atp_users') || '[]');
  const found = users.find(u => u.username === username && u.password === password);

  if (found) {
    const user = { username: found.username, name: found.name, role: found.role };
    setCurrentUser(user);
    alert(`Добро пожаловать, ${found.name || found.username}! (${ROLE_NAMES[found.role]})`);
    location.reload();
  } else {
    alert('❌ Неверный логин или пароль.');
  }
}

// Выход
function logout() {
  const user = getCurrentUser();
  if (user) {
    removeFromLine(user.username);
  }
  clearCurrentUser();
  alert('Вы вышли из системы.');
  window.location.href = 'index.html';
}

// Показать/скрыть ссылку "Выход на маршруты"
function updateLineMenuVisibility() {
  const lineLink = document.getElementById('lineMenuLink');
  if (!lineLink) return;
  
  const user = getCurrentUser();
  if (user) {
    lineLink.style.display = 'inline';
  } else {
    lineLink.style.display = 'none';
  }
}

// Показать/скрыть ссылку "Админ-панель"
function updateAdminMenuVisibility() {
  const adminLink = document.getElementById('adminMenuLink');
  if (!adminLink) return;
  
  const user = getCurrentUser();
  // Админ-панель доступна admin и zamdirektora
  if (user && (user.role === 'admin' || user.role === 'zamdirektora')) {
    adminLink.style.display = 'inline';
  } else {
    adminLink.style.display = 'none';
  }
}

// Функции для работы с линией
function getOnlineStaff() {
  return JSON.parse(localStorage.getItem('atp_online_staff') || '[]');
}

function saveOnlineStaff(list) {
  localStorage.setItem('atp_online_staff', JSON.stringify(list));
}

function isUserOnline(username) {
  return getOnlineStaff().some(u => u.username === username);
}

function addToLine(username, name) {
  const list = getOnlineStaff();
  if (!list.find(u => u.username === username)) {
    list.push({ username, name, time: getMoscowDateString() });
    saveOnlineStaff(list);
    sendVKNotification(username, name, true);
  }
}

function removeFromLine(username) {
  let list = getOnlineStaff();
  const user = list.find(u => u.username === username);
  list = list.filter(u => u.username !== username);
  saveOnlineStaff(list);
  
  // Отправляем уведомление только если это не админ
  if (user) {
    const currentUser = JSON.parse(localStorage.getItem('atp_users') || '[]').find(u => u.username === username);
    if (!currentUser || currentUser.role !== 'admin') {
      sendVKNotification(username, user.name, false);
    }
  }
}

// Реальная отправка в VK
async function sendVKNotification(username, name, isOnline) {
  const VK_TOKEN = 'vk1.a.v_e2ZV1iTPRY5RUsYpvvDMfw23hVexj3Ib-QW_NByBRehluzzNhUa8ySr4H6PpORmX84ARHykftZSZwboZg8BYIK1KFBoGj82fx5QiwhvgkNg_foFIkSHAF-VyH-gCTYffh3bUSSIDeLcMWEfhPmrIH7Bi9g_aBkVwXTZ7f72ny_b-un-d8sUQ7rtzyphrlUGkITukguzhGKVmExIqGrrg';
  const VK_CHAT_ID = 2;
  
  const status = isOnline ? '🟢 ВЫШЕЛ НА ЛИНИЮ' : '🔴 УШЁЛ С ЛИНИИ';
  const message = `👤 ${name || username} ${status}. Всего на линии: ${getOnlineStaff().length}`;
  
  console.log(`[VK Чат]: ${message}`);
  
  try {
    const url = 'https://api.vk.com/method/messages.send?' + new URLSearchParams({
      chat_id: VK_CHAT_ID,
      message: message,
      random_id: Math.floor(Math.random() * 999999),
      access_token: VK_TOKEN,
      v: '5.131'
    });
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.response) {
      console.log('✅ Сообщение отправлено в беседу VK');
    } else {
      console.error('❌ Ошибка VK API:', data.error);
    }
  } catch (error) {
    console.error('❌ Ошибка отправки:', error);
  }
}
// Статусы сотрудников
const STAFF_STATUSES = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  AFK: 'afk'
};

// Причины АФК
const AFK_REASONS = [
  'Обед',
  'Поломка',
  'Заправка',
  'Медицинский перерыв',
  'Совещание',
  'Другое'
];

// Получить список сотрудников со статусами
function getStaffWithStatuses() {
  return JSON.parse(localStorage.getItem('atp_staff_statuses') || '[]');
}

// Сохранить статусы
function saveStaffWithStatuses(list) {
  localStorage.setItem('atp_staff_statuses', JSON.stringify(list));
}

// Установить статус сотрудника
function setStaffStatus(username, name, status, afkReason = '') {
  let staffList = getStaffWithStatuses();
  const now = getMoscowTime();
  const today = getMoscowDateOnly();
  
  if (status === STAFF_STATUSES.ONLINE) {
    // Ищем ЛЮБУЮ запись этого сотрудника за сегодня
    const todayRecord = staffList.find(s => 
      s.username === username && 
      s.exitDate === today
    );
    
    if (todayRecord) {
      // Уже есть запись за сегодня — просто обновляем статус на онлайн
      todayRecord.status = STAFF_STATUSES.ONLINE;
      todayRecord.afkReason = '';
      todayRecord.lastUpdate = getMoscowDateString();
      todayRecord.lastUpdateRaw = now.toISOString();
      todayRecord.sessionStart = now.toISOString();
      // НЕ сбрасываем totalSeconds — оно сохраняется с предыдущих сессий
      
      const idx = staffList.indexOf(todayRecord);
      staffList[idx] = todayRecord;
    } else {
      // Нет записи за сегодня — создаём новую
      const newRecord = {
        username: username,
        name: name,
        status: STAFF_STATUSES.ONLINE,
        afkReason: '',
        lastUpdate: getMoscowDateString(),
        lastUpdateRaw: now.toISOString(),
        totalSeconds: 0,
        exitDate: today,
        sessionStart: now.toISOString(),
        role: getCurrentUser()?.role || 'driver'
      };
      staffList.push(newRecord);
    }
    
  } else if (status === STAFF_STATUSES.AFK) {
    // АФК
    const activeRecord = staffList.find(s => 
      s.username === username && 
      s.exitDate === today &&
      s.status === STAFF_STATUSES.ONLINE
    );
    
    if (activeRecord) {
      // Добавляем время текущей онлайн-сессии
      if (activeRecord.sessionStart) {
        const sessionStart = new Date(activeRecord.sessionStart);
        const sessionSeconds = Math.floor((now - sessionStart) / 1000);
        activeRecord.totalSeconds = (activeRecord.totalSeconds || 0) + sessionSeconds;
      }
      
      activeRecord.status = STAFF_STATUSES.AFK;
      activeRecord.afkReason = afkReason;
      activeRecord.lastUpdate = getMoscowDateString();
      activeRecord.lastUpdateRaw = now.toISOString();
      activeRecord.sessionStart = null;
      
      const idx = staffList.indexOf(activeRecord);
      staffList[idx] = activeRecord;
    }
    
  } else if (status === STAFF_STATUSES.OFFLINE) {
    // Ушёл с линии
    const activeRecord = staffList.find(s => 
      s.username === username && 
      s.exitDate === today &&
      (s.status === STAFF_STATUSES.ONLINE || s.status === STAFF_STATUSES.AFK)
    );
    
    if (activeRecord) {
      // Добавляем время если был онлайн
      if (activeRecord.status === STAFF_STATUSES.ONLINE && activeRecord.sessionStart) {
        const sessionStart = new Date(activeRecord.sessionStart);
        const sessionSeconds = Math.floor((now - sessionStart) / 1000);
        activeRecord.totalSeconds = (activeRecord.totalSeconds || 0) + sessionSeconds;
      }
      
      activeRecord.status = STAFF_STATUSES.OFFLINE;
      activeRecord.afkReason = '';
      activeRecord.lastUpdate = getMoscowDateString();
      activeRecord.lastUpdateRaw = now.toISOString();
      activeRecord.sessionStart = null;
      // totalSeconds НЕ сбрасываем — сохраняется для истории дня
      
      const idx = staffList.indexOf(activeRecord);
      staffList[idx] = activeRecord;
    }
  }

  saveStaffWithStatuses(staffList);
  checkMidnightSplit();
  sendStatusToVK(username, name, status, afkReason);
}

// Проверка и разделение записей при переходе через полночь
function checkMidnightSplit() {
  const staffList = getStaffWithStatuses();
  const now = getMoscowTime();
  const today = getMoscowDateOnly();
  let changed = false;
  
  for (let i = staffList.length - 1; i >= 0; i--) {
    const staff = staffList[i];
    
    if (staff.status === STAFF_STATUSES.ONLINE && staff.sessionStart && staff.exitDate) {
      if (staff.exitDate !== today) {
        const sessionStart = new Date(staff.sessionStart);
        const midnight = new Date(sessionStart);
        midnight.setDate(midnight.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);
        
        if (now >= midnight) {
          const secondsBeforeMidnight = Math.floor((midnight - sessionStart) / 1000);
          if (secondsBeforeMidnight > 0) {
            staff.totalSeconds = (staff.totalSeconds || 0) + secondsBeforeMidnight;
          }
          staff.status = STAFF_STATUSES.OFFLINE;
          staff.lastUpdate = `${staff.exitDate}, 23:59:59`;
          staff.lastUpdateRaw = midnight.toISOString();
          staff.sessionStart = null;
          staffList[i] = staff;
          
          const newRecord = {
            username: staff.username,
            name: staff.name,
            status: STAFF_STATUSES.ONLINE,
            afkReason: '',
            lastUpdate: getMoscowDateString(),
            lastUpdateRaw: now.toISOString(),
            totalSeconds: 0,
            exitDate: today,
            sessionStart: now.toISOString(),
            role: staff.role
          };
          staffList.push(newRecord);
          changed = true;
        }
      }
    }
  }
  
  if (changed) {
    saveStaffWithStatuses(staffList);
  }
}

// Получить статус конкретного сотрудника
// Получить статус конкретного сотрудника (по активной записи)
// Получить статус конкретного сотрудника (по записи за сегодня)
function getStaffStatus(username) {
  const staffList = getStaffWithStatuses();
  const today = getMoscowDateOnly();
  
  const todayRecord = staffList.find(s => 
    s.username === username && 
    s.exitDate === today &&
    s.status !== STAFF_STATUSES.OFFLINE
  );
  
  return todayRecord ? todayRecord.status : STAFF_STATUSES.OFFLINE;
}

// Форматирование времени из секунд в ЧЧ:ММ:СС
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return '00:00:00';
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Получить активное время сотрудника (включая текущую сессию)
// Получить активное время сотрудника (только текущая активная сессия)
// Получить активное время сотрудника (по записи за сегодня)
function getActiveTime(username) {
  const staffList = getStaffWithStatuses();
  const today = getMoscowDateOnly();
  
  // Ищем запись этого сотрудника за сегодня (любой статус)
  const todayRecord = staffList.find(s => 
    s.username === username && 
    s.exitDate === today
  );
  
  if (!todayRecord) return '00:00:00';
  
  let totalSeconds = todayRecord.totalSeconds || 0;
  
  // Если сейчас онлайн — добавляем время текущей сессии
  if (todayRecord.status === STAFF_STATUSES.ONLINE && todayRecord.sessionStart) {
    const now = getMoscowTime();
    const sessionStart = new Date(todayRecord.sessionStart);
    const currentSessionSeconds = Math.floor((now - sessionStart) / 1000);
    totalSeconds += currentSessionSeconds;
  }
  
  return formatTime(totalSeconds);
}

// Отправка статуса в ВК
async function sendStatusToVK(username, name, status, afkReason = '') {
  const VK_TOKEN = 'vk1.a.v_e2ZV1iTPRY5RUsYpvvDMfw23hVexj3Ib-QW_NByBRehluzzNhUa8ySr4H6PpORmX84ARHykftZSZwboZg8BYIK1KFBoGj82fx5QiwhvgkNg_foFIkSHAF-VyH-gCTYffh3bUSSIDeLcMWEfhPmrIH7Bi9g_aBkVwXTZ7f72ny_b-un-d8sUQ7rtzyphrlUGkITukguzhGKVmExIqGrrg';
  const VK_CHAT_ID = 2;
  
  let statusEmoji, statusText;
  
  switch(status) {
    case STAFF_STATUSES.ONLINE:
      statusEmoji = '🟢';
      statusText = 'ВЫШЕЛ НА ЛИНИЮ';
      break;
    case STAFF_STATUSES.AFK:
      statusEmoji = '🟡';
      statusText = `УШЁЛ НА АФК (${afkReason})`;
      break;
    case STAFF_STATUSES.OFFLINE:
      statusEmoji = '🔴';
      statusText = 'УШЁЛ С ЛИНИИ';
      break;
  }
  
  // Получаем только тех, кто на линии
  const staffList = getStaffWithStatuses();
  const onlineStaff = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE);
  
  let message = `${statusEmoji} ${name || username}: ${statusText}\n\n`;
  
  // Пишем только про тех, кто на линии
  if (onlineStaff.length === 0) {
    message += `На линии никого нет`;
  } else {
    message += `🟢 На линии:\n`;
    onlineStaff.forEach(s => {
      message += `• ${s.name}\n`;
    });
  }
  
  console.log(`[VK Чат]: ${message}`);
  
  try {
    const url = 'https://api.vk.com/method/messages.send?' + new URLSearchParams({
      chat_id: VK_CHAT_ID,
      message: message,
      random_id: Math.floor(Math.random() * 999999),
      access_token: VK_TOKEN,
      v: '5.131'
    });
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.response) {
      console.log('✅ Статус отправлен в беседу VK');
    } else {
      console.error('❌ Ошибка VK API:', data.error);
    }
  } catch (error) {
    console.error('❌ Ошибка отправки:', error);
  }
}

// Удалить статус сотрудника (при удалении из системы)
function removeStaffStatus(username) {
  let staffList = getStaffWithStatuses();
  staffList = staffList.filter(s => s.username !== username);
  saveStaffWithStatuses(staffList);
}
// Получить текущую дату и время по МСК
function getMoscowTime() {
  const now = new Date();
  // Москва UTC+3
  const mskOffset = 3 * 60; // 3 часа в минутах
  const localOffset = now.getTimezoneOffset(); // местное смещение в минутах
  const mskTime = new Date(now.getTime() + (mskOffset + localOffset) * 60000);
  return mskTime;
}

// Форматирование даты по МСК
function getMoscowDateString() {
  const msk = getMoscowTime();
  const day = String(msk.getDate()).padStart(2, '0');
  const month = String(msk.getMonth() + 1).padStart(2, '0');
  const year = msk.getFullYear();
  const hours = String(msk.getHours()).padStart(2, '0');
  const minutes = String(msk.getMinutes()).padStart(2, '0');
  const seconds = String(msk.getSeconds()).padStart(2, '0');
  return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
}

// Только дата по МСК
function getMoscowDateOnly() {
  const msk = getMoscowTime();
  const day = String(msk.getDate()).padStart(2, '0');
  const month = String(msk.getMonth() + 1).padStart(2, '0');
  const year = msk.getFullYear();
  return `${day}.${month}.${year}`;
}