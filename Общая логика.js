// ==================== FIREBASE КОНФИГУРАЦИЯ ====================
// Замените эти значения на свои из Firebase Console:
// Project settings → Add app → Web → скопируйте конфиг

const firebaseConfig = {
  apiKey: "AIzaSyBDp3pWmEEC-vRQTy63bvmfSpBC1WvaPm8",
  authDomain: "mirngortrans.firebaseapp.com",
  databaseURL: "https://mirngortrans-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mirngortrans",
  storageBucket: "mirngortrans.firebasestorage.app",
  messagingSenderId: "447944768770",
  appId: "1:447944768770:web:87aeb1a4f1fcaaa90d961b"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==================== ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЕЙ ====================
const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'Администратор' }
];

// Инициализация базы данных при первом запуске
database.ref('users').once('value', (snapshot) => {
  if (!snapshot.exists()) {
    database.ref('users').set(DEFAULT_USERS);
  }
});

// ==================== ИЕРАРХИЯ РОЛЕЙ ====================
const ROLE_HIERARCHY = {
  'admin': ['gendirector', 'zamdirektora', 'brigadir', 'driver'],
  'gendirector': ['zamdirektora', 'brigadir', 'driver'],
  'zamdirektora': ['zamdirektora', 'brigadir', 'driver'],
  'brigadir': [],
  'driver': []
};

const ROLE_NAMES = {
  'admin': 'Администратор',
  'gendirector': 'Генеральный директор',
  'zamdirektora': 'Заместитель директора',
  'brigadir': 'Бригадир',
  'driver': 'Водитель'
};

// ==================== СТАТУСЫ СОТРУДНИКОВ ====================
const STAFF_STATUSES = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  AFK: 'afk'
};

// ==================== ФУНКЦИИ РАБОТЫ С ДАННЫМИ ====================
function getCurrentUser() {
  return JSON.parse(localStorage.getItem('atp_current_user') || 'null');
}

function setCurrentUser(user) {
  localStorage.setItem('atp_current_user', JSON.stringify(user));
}

function clearCurrentUser() {
  localStorage.removeItem('atp_current_user');
}

function canCreateRole(currentUserRole, targetRole) {
  const allowedRoles = ROLE_HIERARCHY[currentUserRole] || [];
  return allowedRoles.includes(targetRole);
}

function getCreatableRoles(userRole) {
  const roles = ROLE_HIERARCHY[userRole] || [];
  return roles.map(role => ({
    value: role,
    name: ROLE_NAMES[role]
  }));
}

// ==================== АВТОРИЗАЦИЯ ====================
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

async function showLoginDialog() {
  const username = prompt('Введите логин:');
  if (!username) return;
  const password = prompt('Введите пароль:');
  if (!password) return;

  const snapshot = await database.ref('users').once('value');
  const users = snapshot.val() || [];
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

function logout() {
  const user = getCurrentUser();
  if (user) {
    removeFromLine(user.username);
  }
  clearCurrentUser();
  alert('Вы вышли из системы.');
  window.location.href = 'index.html';
}

// ==================== НАВИГАЦИЯ ====================
function updateLineMenuVisibility() {
  const lineLink = document.getElementById('lineMenuLink');
  if (!lineLink) return;
  const user = getCurrentUser();
  lineLink.style.display = user ? 'inline' : 'none';
}

function updateAdminMenuVisibility() {
  const adminLink = document.getElementById('adminMenuLink');
  if (!adminLink) return;
  const user = getCurrentUser();
  if (user && (user.role === 'admin' || user.role === 'gendirector' || user.role === 'zamdirektora')) {
    adminLink.style.display = 'inline';
  } else {
    adminLink.style.display = 'none';
  }
}

// ==================== РАБОТА С ЛИНИЕЙ ====================
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
}

// ==================== СТАТУСЫ (FIREBASE) ====================
async function getStaffWithStatuses() {
  const snapshot = await database.ref('staff_statuses').once('value');
  return snapshot.val() || [];
}

async function saveStaffWithStatuses(list) {
  await database.ref('staff_statuses').set(list);
}

async function setStaffStatus(username, name, status, afkReason = '') {
  let staffList = await getStaffWithStatuses();
  const now = getMoscowTime();
  const today = getMoscowDateOnly();

  if (status === STAFF_STATUSES.ONLINE) {
    const todayRecord = staffList.find(s => 
      s.username === username && s.exitDate === today
    );

    if (todayRecord) {
      todayRecord.status = STAFF_STATUSES.ONLINE;
      todayRecord.afkReason = '';
      todayRecord.lastUpdate = getMoscowDateString();
      todayRecord.lastUpdateRaw = now.toISOString();
      todayRecord.sessionStart = now.toISOString();
    } else {
      staffList.push({
        username, name,
        status: STAFF_STATUSES.ONLINE,
        afkReason: '',
        lastUpdate: getMoscowDateString(),
        lastUpdateRaw: now.toISOString(),
        totalSeconds: 0,
        exitDate: today,
        sessionStart: now.toISOString(),
        role: getCurrentUser()?.role || 'driver'
      });
    }
  } else {
    const activeRecord = staffList.find(s => 
      s.username === username && s.exitDate === today &&
      (s.status === STAFF_STATUSES.ONLINE || s.status === STAFF_STATUSES.AFK)
    );

    if (activeRecord) {
      if (activeRecord.status === STAFF_STATUSES.ONLINE && activeRecord.sessionStart) {
        const sessionStart = new Date(activeRecord.sessionStart);
        const sessionSeconds = Math.floor((now - sessionStart) / 1000);
        activeRecord.totalSeconds = (activeRecord.totalSeconds || 0) + sessionSeconds;
      }
      activeRecord.status = status;
      activeRecord.afkReason = status === STAFF_STATUSES.AFK ? afkReason : '';
      activeRecord.lastUpdate = getMoscowDateString();
      activeRecord.lastUpdateRaw = now.toISOString();
      activeRecord.sessionStart = null;
    }
  }

  await saveStaffWithStatuses(staffList);
  await checkMidnightSplit();
  sendStatusToVK(username, name, status, afkReason);
}

async function getStaffStatus(username) {
  const staffList = await getStaffWithStatuses();
  const today = getMoscowDateOnly();
  const todayRecord = staffList.find(s => 
    s.username === username && s.exitDate === today && s.status !== STAFF_STATUSES.OFFLINE
  );
  return todayRecord ? todayRecord.status : STAFF_STATUSES.OFFLINE;
}

async function getActiveTime(username) {
  const staffList = await getStaffWithStatuses();
  const today = getMoscowDateOnly();
  const todayRecord = staffList.find(s => 
    s.username === username && s.exitDate === today
  );
  if (!todayRecord) return '00:00:00';
  
  let totalSeconds = todayRecord.totalSeconds || 0;
  if (todayRecord.status === STAFF_STATUSES.ONLINE && todayRecord.sessionStart) {
    const now = getMoscowTime();
    const sessionStart = new Date(todayRecord.sessionStart);
    totalSeconds += Math.floor((now - sessionStart) / 1000);
  }
  return formatTime(totalSeconds);
}

async function checkMidnightSplit() {
  const staffList = await getStaffWithStatuses();
  const now = getMoscowTime();
  const today = getMoscowDateOnly();
  let changed = false;

  for (let i = staffList.length - 1; i >= 0; i--) {
    const staff = staffList[i];
    if (staff.status === STAFF_STATUSES.ONLINE && staff.sessionStart && staff.exitDate && staff.exitDate !== today) {
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

        staffList.push({
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
        });
        changed = true;
      }
    }
  }

  if (changed) {
    await saveStaffWithStatuses(staffList);
  }
}

// ==================== ОТПРАВКА В VK ====================
async function sendVKNotification(username, name, isOnline) {
  const VK_TOKEN = 'vk1.a.v_e2ZV1iTPRY5RUsYpvvDMfw23hVexj3Ib-QW_NByBRehluzzNhUa8ySr4H6PpORmX84ARHykftZSZwboZg8BYIK1KFBoGj82fx5QiwhvgkNg_foFIkSHAF-VyH-gCTYffh3bUSSIDeLcMWEfhPmrIH7Bi9g_aBkVwXTZ7f72ny_b-un-d8sUQ7rtzyphrlUGkITukguzhGKVmExIqGrrg';
  const VK_CHAT_ID = 2;
  
  const status = isOnline ? '🟢 ВЫШЕЛ НА ЛИНИЮ' : '🔴 УШЁЛ С ЛИНИИ';
  const message = `👤 ${name || username} ${status}. Всего на линии: ${getOnlineStaff().length}`;
  
  try {
    const url = 'https://api.vk.com/method/messages.send?' + new URLSearchParams({
      chat_id: VK_CHAT_ID, message, random_id: Math.floor(Math.random() * 999999),
      access_token: VK_TOKEN, v: '5.131'
    });
    await fetch(url);
  } catch (error) {
    console.error('Ошибка VK:', error);
  }
}

async function sendStatusToVK(username, name, status, afkReason = '') {
  const VK_TOKEN = 'vk1.a.v_e2ZV1iTPRY5RUsYpvvDMfw23hVexj3Ib-QW_NByBRehluzzNhUa8ySr4H6PpORmX84ARHykftZSZwboZg8BYIK1KFBoGj82fx5QiwhvgkNg_foFIkSHAF-VyH-gCTYffh3bUSSIDeLcMWEfhPmrIH7Bi9g_aBkVwXTZ7f72ny_b-un-d8sUQ7rtzyphrlUGkITukguzhGKVmExIqGrrg';
  const VK_CHAT_ID = 2;
  
  let statusEmoji, statusText;
  switch(status) {
    case STAFF_STATUSES.ONLINE:
      statusEmoji = '🟢'; statusText = 'ВЫШЕЛ НА ЛИНИЮ'; break;
    case STAFF_STATUSES.AFK:
      statusEmoji = '🟡'; statusText = `УШЁЛ В АФК (${afkReason})`; break;
    case STAFF_STATUSES.OFFLINE:
      statusEmoji = '🔴'; statusText = 'УШЁЛ С ЛИНИИ'; break;
  }
  
  const staffList = await getStaffWithStatuses();
  const onlineStaff = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE);
  
  let message = `${statusEmoji} ${name || username}: ${statusText}\n\n`;
  if (onlineStaff.length === 0) {
    message += 'На линии никого нет';
  } else {
    message += '🟢 На линии:\n';
    onlineStaff.forEach(s => { message += `• ${s.name}\n`; });
  }
  
  try {
    const url = 'https://api.vk.com/method/messages.send?' + new URLSearchParams({
      chat_id: VK_CHAT_ID, message, random_id: Math.floor(Math.random() * 999999),
      access_token: VK_TOKEN, v: '5.131'
    });
    await fetch(url);
  } catch (error) {
    console.error('Ошибка VK:', error);
  }
}

// ==================== МОСКОВСКОЕ ВРЕМЯ ====================
function getMoscowTime() {
  const now = new Date();
  const mskOffset = 180;
  const localOffset = now.getTimezoneOffset();
  return new Date(now.getTime() + (mskOffset + localOffset) * 60000);
}

function getMoscowDateString() {
  const msk = getMoscowTime();
  const dd = String(msk.getDate()).padStart(2, '0');
  const mm = String(msk.getMonth() + 1).padStart(2, '0');
  const yyyy = msk.getFullYear();
  const hh = String(msk.getHours()).padStart(2, '0');
  const min = String(msk.getMinutes()).padStart(2, '0');
  const ss = String(msk.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${min}:${ss}`;
}

function getMoscowDateOnly() {
  const msk = getMoscowTime();
  const dd = String(msk.getDate()).padStart(2, '0');
  const mm = String(msk.getMonth() + 1).padStart(2, '0');
  const yyyy = msk.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}