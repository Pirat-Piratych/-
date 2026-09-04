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

  if (!user) {
    if (notAuthMessage) notAuthMessage.style.display = 'block';
    if (lineContent) lineContent.style.display = 'none';
    return;
  }

  if (notAuthMessage) notAuthMessage.style.display = 'none';
  if (lineContent) lineContent.style.display = 'block';
  await populateStaffFilter();

  async function populateStaffFilter() {
    const trigger = document.getElementById('filterTrigger');
    const options = document.getElementById('filterOptions');
    const text = document.getElementById('filterText');
    const hidden = document.getElementById('staffFilterSimple');
    
    if (!trigger || !options || !text || !hidden) return;
    
    const snapshot = await database.ref('users').once('value');
    const users = (snapshot.val() || []).filter(u => u.role !== 'admin');
    
    options.innerHTML = '<div class="custom-select-option selected" data-value="all">Все сотрудники</div>';
    users.forEach(u => {
      options.innerHTML += `<div class="custom-select-option" data-value="${u.username}">${u.name}</div>`;
    });
    
    trigger.onclick = () => {
      trigger.classList.toggle('active');
      options.classList.toggle('open');
    };
    
    options.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.onclick = async () => {
        text.textContent = opt.textContent;
        hidden.value = opt.dataset.value;
        options.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        trigger.classList.remove('active');
        options.classList.remove('open');
        
        await loadStaffTable();
        await updateStaffLists();
      };
    });
    
    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !options.contains(e.target)) {
        trigger.classList.remove('active');
        options.classList.remove('open');
      }
    });
  }

  await updateAllStats();
  updateStatusButtons();
  await loadStaffTable();

  setInterval(async () => {
    await updateAllStats();
    await updateStaffLists();
  }, 1000);

  document.getElementById('btnOnline')?.addEventListener('click', async () => {
    await setStaffStatus(user.username, user.name, STAFF_STATUSES.ONLINE);
    await updateAllStats();
    updateStatusButtons();
    await loadStaffTable();
  });

  document.getElementById('btnAFK')?.addEventListener('click', async () => {
    const currentStatus = await getStaffStatus(user.username);
    if (currentStatus !== STAFF_STATUSES.ONLINE) {
      showMessage('ℹ️', 'Уведомление', 'Вы не на линии. Сначала нажмите «Вышел на линию».');
      return;
    }
    afkReasonModal.style.display = 'flex';
  });

  document.getElementById('btnOffline')?.addEventListener('click', () => {
    showConfirm('Подтверждение', 'Вы уверены, что хотите уйти с линии?', async () => {
      await setStaffStatus(user.username, user.name, STAFF_STATUSES.OFFLINE);
      await updateAllStats();
      updateStatusButtons();
      await loadStaffTable();
    });
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
    const staffList = await getStaffWithStatuses();
    const targetStaff = staffList.find(s => s.username === username);
    
    if (!targetStaff) return;
    
    if (targetStaff.role !== 'admin') {
      showMessage('ℹ️', 'Уведомление', 'Удалять можно только записи администратора.');
      return;
    }
    
    showConfirm('Подтверждение', `Удалить запись о сотруднике "${targetStaff.name}"?`, async () => {
      const updatedList = staffList.filter(s => s.username !== username);
      await saveStaffWithStatuses(updatedList);
      await updateAllStats();
      await loadStaffTable();
    });
  };

  async function updateAllStats() {
    const staffList = await getStaffWithStatuses();
    const onlineCount = staffList.filter(s => s.status === STAFF_STATUSES.ONLINE).length;
    const afkCount = staffList.filter(s => s.status === STAFF_STATUSES.AFK).length;
    
    const snapshot = await database.ref('users').once('value');
    const allUsers = (snapshot.val() || []).filter(u => u.role !== 'admin');
    
    if (onlineCountSpan) onlineCountSpan.textContent = onlineCount;
    if (afkCountSpan) afkCountSpan.textContent = afkCount;
    if (totalCountSpan) totalCountSpan.textContent = allUsers.length;
    
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

    if (currentStatus === STAFF_STATUSES.ONLINE) {
      if (btnOnline) { btnOnline.disabled = true; btnOnline.style.opacity = '0.6'; btnOnline.style.cursor = 'not-allowed'; }
    } else if (currentStatus === STAFF_STATUSES.AFK) {
      if (btnAFK) { btnAFK.disabled = true; btnAFK.style.opacity = '0.6'; btnAFK.style.cursor = 'not-allowed'; }
    } else if (currentStatus === STAFF_STATUSES.OFFLINE) {
      if (btnAFK) { btnAFK.disabled = true; btnAFK.style.opacity = '0.6'; btnAFK.style.cursor = 'not-allowed'; }
      if (btnOffline) { btnOffline.disabled = true; btnOffline.style.opacity = '0.6'; btnOffline.style.cursor = 'not-allowed'; }
    }
  }

  async function loadStaffTable() {
    if (!staffTableBody) return;
    
    let staffList = await getStaffWithStatuses();
    const filter = document.getElementById('staffFilterSimple');
    if (filter && filter.value !== 'all') {
      staffList = staffList.filter(s => s.username === filter.value);
    }
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
        rows.push(`
          <tr style="${rowStyle}">
            <td>${staff.name}</td>
            <td>${exitDate}</td>
            <td><strong>${activeTime}</strong></td>
            <td>${ROLE_NAMES[staff.role] || staff.role}</td>
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
      onlineList.innerHTML = onlineStaff.length === 0 
        ? '<em style="color: #94a3b8;">Никого нет</em>' 
        : onlineStaff.map(s => `<div class="staff-chip">${s.name}</div>`).join('');
    }
    
    const afkList = document.getElementById('afkList');
    if (afkList) {
      afkList.innerHTML = afkStaff.length === 0 
        ? '<em style="color: #94a3b8;">Никого нет</em>' 
        : afkStaff.map(s => `<div class="staff-chip">${s.name} <span style="font-size:0.8rem;">(${s.afkReason || 'не указана'})</span></div>`).join('');
    }
    
    const offlineList = document.getElementById('offlineList');
    if (offlineList) {
      offlineList.innerHTML = offlineStaff.length === 0 
        ? '<em style="color: #94a3b8;">Никого нет</em>' 
        : offlineStaff.map(s => `<div class="staff-chip">${s.name}</div>`).join('');
    }
  }
}