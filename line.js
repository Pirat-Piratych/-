async function initLinePage() {
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

  await updateAllStats();
  updateStatusButtons();
  await loadStaffTable();

  setInterval(async () => {
    await updateAllStats();
    await loadStaffTable();
  }, 1000);

  document.getElementById('btnOnline')?.addEventListener('click', async () => {
    await setStaffStatus(user.username, user.name, STAFF_STATUSES.ONLINE);
    await updateAllStats();
    updateStatusButtons();
    await loadStaffTable();
  });

  document.getElementById('btnAFK')?.addEventListener('click', () => {
    afkReasonModal.style.display = 'flex';
  });

  document.getElementById('btnOffline')?.addEventListener('click', async () => {
    if (confirm('Вы уверены, что хотите уйти с линии?')) {
      await setStaffStatus(user.username, user.name, STAFF_STATUSES.OFFLINE);
      await updateAllStats();
      updateStatusButtons();
      await loadStaffTable();
    }
  });

  document.getElementById('confirmAFK')?.addEventListener('click', async () => {
    const reason = afkReasonSelect.value || 'Другое';
    await setStaffStatus(user.username, user.name, STAFF_STATUSES.AFK, reason);
    afkReasonModal.style.display = 'none';
    await updateAllStats();
    updateStatusButtons();
    await loadStaffTable();
  });

  document.getElementById('cancelAFK')?.addEventListener('click', () => {
    afkReasonModal.style.display = 'none';
  });

  window.deleteStaffFromTable = async function(username) {
    if (!confirm(`Удалить запись о сотруднике "${username}" из таблицы статусов?`)) return;
    
    let staffList = await getStaffWithStatuses();
    staffList = staffList.filter(s => s.username !== username);
    await saveStaffWithStatuses(staffList);
    
    await updateAllStats();
    await loadStaffTable();
  };

  if (clearTableBtn) {
    clearTableBtn.addEventListener('click', async () => {
      if (!confirm('Вы уверены, что хотите очистить ВСЮ таблицу статусов?')) return;
      
      await saveStaffWithStatuses([]);
      await updateAllStats();
      await loadStaffTable();
      
      alert('✅ Таблица статусов полностью очищена.');
    });
  }

  async function updateAllStats() {
    const staffList = await getStaffWithStatuses();
    const onlineCount = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE).length;
    const afkCount = staffList.filter(s => s.status === STAFF_STATUSES.AFK).length;
    
    if (onlineCountSpan) onlineCountSpan.textContent = onlineCount;
    if (afkCountSpan) afkCountSpan.textContent = afkCount;
    if (totalCountSpan) totalCountSpan.textContent = staffList.length;
    
    const currentStatus = await getStaffStatus(user.username);
    const activeTime = await getActiveTime(user.username);
    
    if (currentStatusSpan) {
      switch(currentStatus) {
        case STAFF_STATUSES.ONLINE:
          currentStatusSpan.innerHTML = '🟢 На линии';
          break;
        case STAFF_STATUSES.AFK:
          const staff = staffList.find(s => s.username === user.username);
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

  async function updateStatusButtons() {
    const currentStatus = await getStaffStatus(user.username);
    const btnOnline = document.getElementById('btnOnline');
    const btnAFK = document.getElementById('btnAFK');
    const btnOffline = document.getElementById('btnOffline');

    [btnOnline, btnAFK, btnOffline].forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });

    switch(currentStatus) {
      case STAFF_STATUSES.ONLINE:
        if (btnOnline) { btnOnline.disabled = true; btnOnline.style.opacity = '0.6'; btnOnline.style.cursor = 'not-allowed'; }
        break;
      case STAFF_STATUSES.AFK:
        if (btnAFK) { btnAFK.disabled = true; btnAFK.style.opacity = '0.6'; btnAFK.style.cursor = 'not-allowed'; }
        break;
      case STAFF_STATUSES.OFFLINE:
        if (btnOffline) { btnOffline.disabled = true; btnOffline.style.opacity = '0.6'; btnOffline.style.cursor = 'not-allowed'; }
        break;
    }
  }

  async function loadStaffTable() {
    if (!staffTableBody) return;
    
    const staffList = await getStaffWithStatuses();
    const currentUserRole = getCurrentUser()?.role;
    
    if (staffList.length === 0) {
      staffTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Нет активных сотрудников</td></tr>';
    } else {
      const rows = [];
      for (const staff of staffList) {
        let rowStyle = '';
        switch(staff.status) {
          case STAFF_STATUSES.ONLINE: rowStyle = 'background-color: #f0fdf4;'; break;
          case STAFF_STATUSES.AFK: rowStyle = 'background-color: #fef3c7;'; break;
          case STAFF_STATUSES.OFFLINE: rowStyle = 'background-color: #fef2f2;'; break;
        }
        
        const activeTime = await getActiveTime(staff.username);
        const exitDate = staff.exitDate || '—';
        
        const deleteButton = (currentUserRole === 'admin') 
          ? `<button class="btn-danger" onclick="deleteStaffFromTable('${staff.username}')" title="Удалить запись">❌</button>`
          : '';
        
        rows.push(`
          <tr style="${rowStyle}">
            <td>${staff.name}</td>
            <td>${exitDate}</td>
            <td><strong>${activeTime}</strong></td>
            <td>${ROLE_NAMES[staff.role] || staff.role}</td>
            <td>${deleteButton}</td>
          </tr>
        `);
      }
      staffTableBody.innerHTML = rows.join('');
    }
    
    await updateStaffLists();
  }

  async function updateStaffLists() {
    const staffList = await getStaffWithStatuses();
    const onlineStaff = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE);
    const afkStaff = staffList.filter(s => s.status === STAFF_STATUSES.AFK);
    const offlineStaff = staffList.filter(s => s.status === STAFF_STATUSES.OFFLINE);
    
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