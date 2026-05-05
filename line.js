function initLinePage() {
  const user = getCurrentUser();
  const notAuthMessage = document.getElementById('notAuthMessage');
  const lineContent = document.getElementById('lineContent');
  const onlineCountSpan = document.getElementById('onlineCount');
  const afkCountSpan = document.getElementById('afkCount');
  const totalCountSpan = document.getElementById('totalCount');
  const currentStatusSpan = document.getElementById('currentStatus');
  const currentActiveSpan = document.getElementById('currentActive');
  const staffTableBody = document.getElementById('staffTableBody');
  const afkReasonModal = document.getElementById('afkReasonModal');
  const afkReasonSelect = document.getElementById('afkReasonSelect');
  const clearTableBtn = document.getElementById('clearTableBtn');

  if (!user) {
    if (notAuthMessage) notAuthMessage.style.display = 'block';
    if (lineContent) lineContent.style.display = 'none';
    return;
  }

  if (notAuthMessage) notAuthMessage.style.display = 'none';
  if (lineContent) lineContent.style.display = 'block';

  updateAllStats();
  updateStatusButtons();
  loadStaffTable();

  // Автообновление времени каждую секунду
  // Автообновление времени и проверка полуночи каждые 30 секунд
setInterval(() => {
  updateAllStats();
  loadStaffTable();
  checkMidnightSplit(); // Проверка перехода через полночь
}, 1000);

  document.getElementById('btnOnline')?.addEventListener('click', () => {
    setStaffStatus(user.username, user.name, STAFF_STATUSES.ONLINE);
    updateAllStats();
    updateStatusButtons();
    loadStaffTable();
  });

  document.getElementById('btnAFK')?.addEventListener('click', () => {
    afkReasonModal.style.display = 'flex';
  });

  document.getElementById('btnOffline')?.addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите уйти с линии?')) {
      setStaffStatus(user.username, user.name, STAFF_STATUSES.OFFLINE);
      updateAllStats();
      updateStatusButtons();
      loadStaffTable();
    }
  });

  document.getElementById('confirmAFK')?.addEventListener('click', () => {
    const reason = afkReasonSelect.value || 'Другое';
    setStaffStatus(user.username, user.name, STAFF_STATUSES.AFK, reason);
    afkReasonModal.style.display = 'none';
    updateAllStats();
    updateStatusButtons();
    loadStaffTable();
  });

  document.getElementById('cancelAFK')?.addEventListener('click', () => {
    afkReasonModal.style.display = 'none';
  });

  // Кнопка удаления конкретного сотрудника из таблицы
  window.deleteStaffFromTable = function(username) {
    if (!confirm(`Удалить запись о сотруднике "${username}" из таблицы статусов?`)) return;
    
    let staffList = getStaffWithStatuses();
    staffList = staffList.filter(s => s.username !== username);
    saveStaffWithStatuses(staffList);
    
    updateAllStats();
    loadStaffTable();
  };

  // Кнопка полной очистки таблицы (только для admin)
  if (clearTableBtn) {
    clearTableBtn.addEventListener('click', () => {
      if (!confirm('Вы уверены, что хотите очистить ВСЮ таблицу статусов? Это действие нельзя отменить.')) return;
      
      saveStaffWithStatuses([]);
      updateAllStats();
      loadStaffTable();
      
      alert('✅ Таблица статусов полностью очищена.');
    });
  }

  function updateAllStats() {
    const staffList = getStaffWithStatuses();
    const onlineCount = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE).length;
    const afkCount = staffList.filter(s => s.status === STAFF_STATUSES.AFK).length;
    
    if (onlineCountSpan) onlineCountSpan.textContent = onlineCount;
    if (afkCountSpan) afkCountSpan.textContent = afkCount;
    if (totalCountSpan) totalCountSpan.textContent = staffList.length;
    
    const currentStatus = getStaffStatus(user.username);
    const activeTime = getActiveTime(user.username);
    
    if (currentStatusSpan) {
      switch(currentStatus) {
        case STAFF_STATUSES.ONLINE:
          currentStatusSpan.innerHTML = '🟢 На линии';
          break;
        case STAFF_STATUSES.AFK:
          const staff = getStaffWithStatuses().find(s => s.username === user.username);
          currentStatusSpan.innerHTML = `🟡 АФК (${staff?.afkReason || 'Не указана'})`;
          break;
        case STAFF_STATUSES.OFFLINE:
          currentStatusSpan.innerHTML = '🔴 Не на линии';
          break;
      }
    }
    
    if (currentActiveSpan) {
      currentActiveSpan.textContent = activeTime;
    }
  }

  function updateStatusButtons() {
    const currentStatus = getStaffStatus(user.username);
    const btnOnline = document.getElementById('btnOnline');
    const btnAFK = document.getElementById('btnAFK');
    const btnOffline = document.getElementById('btnOffline');

    // Сначала разблокируем все кнопки
    [btnOnline, btnAFK, btnOffline].forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });

    // Блокируем активную кнопку
    switch(currentStatus) {
      case STAFF_STATUSES.ONLINE:
        if (btnOnline) {
          btnOnline.disabled = true;
          btnOnline.style.opacity = '0.6';
          btnOnline.style.cursor = 'not-allowed';
        }
        break;
      case STAFF_STATUSES.AFK:
        if (btnAFK) {
          btnAFK.disabled = true;
          btnAFK.style.opacity = '0.6';
          btnAFK.style.cursor = 'not-allowed';
        }
        break;
      case STAFF_STATUSES.OFFLINE:
        if (btnOffline) {
          btnOffline.disabled = true;
          btnOffline.style.opacity = '0.6';
          btnOffline.style.cursor = 'not-allowed';
        }
        break;
    }
  }

  function loadStaffTable() {
    if (!staffTableBody) return;
    
    const staffList = getStaffWithStatuses();
    const currentUserRole = getCurrentUser()?.role;
    
    if (staffList.length === 0) {
      staffTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Нет активных сотрудников</td></tr>';
    } else {
      staffTableBody.innerHTML = staffList.map(staff => {
        let rowStyle = '';
        switch(staff.status) {
          case STAFF_STATUSES.ONLINE:
            rowStyle = 'background-color: #f0fdf4;';
            break;
          case STAFF_STATUSES.AFK:
            rowStyle = 'background-color: #fef3c7;';
            break;
          case STAFF_STATUSES.OFFLINE:
            rowStyle = 'background-color: #fef2f2;';
            break;
        }
        
        const activeTime = getActiveTime(staff.username);
        const exitDate = staff.exitDate || '—';
        
        const deleteButton = (currentUserRole === 'admin') 
          ? `<button class="btn-danger" onclick="deleteStaffFromTable('${staff.username}')" title="Удалить запись">❌</button>`
          : '';
        
        return `
          <tr style="${rowStyle}">
            <td>${staff.name}</td>
            <td>${exitDate}</td>
            <td><strong>${activeTime}</strong></td>
            <td>${ROLE_NAMES[staff.role] || staff.role}</td>
            <td>${deleteButton}</td>
          </tr>
        `;
      }).join('');
    }
    
    // Обновляем списки по статусам
    updateStaffLists();
  }
  // Новая функция для отображения списков
  function updateStaffLists() {
    const staffList = getStaffWithStatuses();
    const onlineStaff = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE);
    const afkStaff = staffList.filter(s => s.status === STAFF_STATUSES.AFK);
    const offlineStaff = staffList.filter(s => s.status === STAFF_STATUSES.OFFLINE);
    
    // Блок "На линии"
    const onlineList = document.getElementById('onlineList');
    if (onlineList) {
      if (onlineStaff.length === 0) {
        onlineList.innerHTML = '<em style="color: #94a3b8;">Никого нет</em>';
      } else {
        onlineList.innerHTML = onlineStaff.map(s => 
          `<div class="staff-chip">${s.name} <span style="font-size:0.8rem;">(${ROLE_NAMES[s.role] || s.role})</span></div>`
        ).join('');
      }
    }
    
    // Блок "АФК"
    const afkList = document.getElementById('afkList');
    if (afkList) {
      if (afkStaff.length === 0) {
        afkList.innerHTML = '<em style="color: #94a3b8;">Никого нет</em>';
      } else {
        afkList.innerHTML = afkStaff.map(s => 
          `<div class="staff-chip">${s.name} <span style="font-size:0.8rem;">(${s.afkReason || 'не указана'})</span></div>`
        ).join('');
      }
    }
    
    // Блок "Не на линии"
    const offlineList = document.getElementById('offlineList');
    if (offlineList) {
      if (offlineStaff.length === 0) {
        offlineList.innerHTML = '<em style="color: #94a3b8;">Никого нет</em>';
      } else {
        offlineList.innerHTML = offlineStaff.map(s => 
          `<div class="staff-chip">${s.name}</div>`
        ).join('');
      }
    }
  }
}