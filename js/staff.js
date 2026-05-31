// Staff / HR Module
const Staff = {

  // ─── State ───────────────────────────────────────────────────────────────────

  _staff:            [],
  _profiles:         [],
  _shifts:           [],
  _attendance:       [],
  _weekScheduleData: {},
  _currentWeekStart: null,
  _loadedPeriod:     '',
  _keepWeekStart:    false,
  _editingId:        null,
  _profEditingId:    null,
  _shiftEditingId:   null,
  _attData:          null,
  _payCalcResults:   [],

  // ─── Init ────────────────────────────────────────────────────────────────────

  init() {
    // Tab switching
    document.querySelectorAll('#staff .prod-tab').forEach(btn =>
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab))
    );

    // ── Staff tab ──
    document.getElementById('hrStaffAddBtn').addEventListener('click', () => this.openStaffForm());
    document.getElementById('hrStaffCancelBtn').addEventListener('click', () => this.closeStaffForm());
    document.getElementById('hrStaffForm').addEventListener('submit', e => this.handleStaffSubmit(e));
    document.getElementById('hrStaffSearch').addEventListener('input', () => this._renderStaff());
    document.getElementById('hrAdvSaveBtn').addEventListener('click', () => this.addAdvance());

    // ── Profiles tab ──
    document.getElementById('hrProfAddBtn').addEventListener('click', () => this.openProfForm());
    document.getElementById('hrProfCancelBtn').addEventListener('click', () => this.closeProfForm());
    document.getElementById('hrProfForm').addEventListener('submit', e => this.handleProfSubmit(e));

    // ── Shifts tab ──
    document.getElementById('hrShiftAddBtn').addEventListener('click', () => this.openShiftForm());
    document.getElementById('hrShiftCancelBtn').addEventListener('click', () => this.closeShiftForm());
    document.getElementById('hrShiftForm').addEventListener('submit', e => this.handleShiftSubmit(e));

    // ── Attendance tab ──
    document.getElementById('hrAttLoadBtn').addEventListener('click', () => this.loadAttendance());
    document.getElementById('hrAttPrevWeek').addEventListener('click', () => this._prevWeek());
    document.getElementById('hrAttNextWeek').addEventListener('click', () => this._nextWeek());

    // ── Payroll tab ──
    document.getElementById('hrPayCalcBtn').addEventListener('click', () => this.calculatePayroll());
    document.getElementById('hrPaySaveBtn').addEventListener('click', () => this.savePayroll());
    document.getElementById('hrPayHistFilter').addEventListener('change', () => this.loadPayrollHistory());

    // ── Attendance modal ──
    document.getElementById('hrAttModalSaveBtn').addEventListener('click',   () => this.saveAttendanceRecord());
    document.getElementById('hrAttModalCancelBtn').addEventListener('click', () => this.closeAttModal());
    document.getElementById('hrAttModalEditBtn').addEventListener('click',   () => this._enterAttEditMode());
    document.getElementById('hrAttModalBackBtn').addEventListener('click',   () => this._setAttViewMode(true));
    document.getElementById('hrAttStatus').addEventListener('change', e => this._onAttStatusChange(e.target.value));

    // Default month values
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const attMonthEl = document.getElementById('hrAttMonth');
    if (attMonthEl) attMonthEl.value = ym;
    const payPeriodEl = document.getElementById('hrPayPeriod');
    if (payPeriodEl) payPeriodEl.value = ym;
    const payHistEl = document.getElementById('hrPayHistFilter');
    if (payHistEl) payHistEl.value = ym;
  },

  // ─── Tab switching ───────────────────────────────────────────────────────────

  _switchTab(tab) {
    document.querySelectorAll('#staff .prod-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.querySelectorAll('#staff .prod-tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'prod-tab-' + tab)
    );
    if (tab === 'hr-attendance') this.loadAttendance();
    if (tab === 'hr-payroll')    this.loadPayrollHistory();
  },

  // ─── Load ────────────────────────────────────────────────────────────────────

  async load() {
    UI.showLoading();
    try {
      await Promise.all([
        this._loadStaff(),
        this._loadProfiles(),
        this._loadShifts()
      ]);
    } catch(e) {
      UI.showMessage('staffMessage', 'Failed to load HR data', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  async _loadStaff() {
    try {
      const res = await API.getStaff();
      if (res.status === 'success') {
        this._staff = res.staff || [];
        this._renderStaff();
      }
    } catch(e) {
      UI.showMessage('staffMessage', 'Failed to load staff', 'error');
    }
  },

  async _loadProfiles() {
    try {
      const res = await API.getIncentiveProfiles();
      if (res.status === 'success') {
        this._profiles = res.incentiveProfiles || [];
        this._renderProfiles();
        this._populateProfileDropdown();
      }
    } catch(e) {
      // non-fatal — profiles may not exist yet
    }
  },

  async _loadShifts() {
    try {
      const res = await API.getShifts();
      if (res.status === 'success') {
        this._shifts = res.shifts || [];
        this._renderShifts();
      }
    } catch(e) {
      // non-fatal
    }
  },

  // ─── TAB 1: STAFF ────────────────────────────────────────────────────────────

  _renderStaff() {
    const q = (document.getElementById('hrStaffSearch').value || '').toLowerCase().trim();
    let list = this._staff;
    if (q) {
      list = list.filter(s =>
        (s.name  || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.role  || '').toLowerCase().includes(q)
      );
    }
    const tbody = document.getElementById('hrStaffTableBody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;padding:24px;">No staff found</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(s => {
      const profile = this._profiles.find(p => p.id === s.profileId || p.profileId === s.profileId);
      const profileName = profile ? this._esc(profile.name) : '—';
      const typeBadge = this._staffTypeBadge(s.staffType);
      return `<tr>
        <td>
          <div style="font-weight:500;">${this._esc(s.name)}</div>
          ${s.phone ? `<div style="font-size:11px;color:#a0aec0;">${this._esc(s.phone)}</div>` : ''}
        </td>
        <td>${this._esc(s.role || '—')}</td>
        <td>${typeBadge}</td>
        <td>${profileName}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(s.salary)}</td>
        <td><span class="status-badge status-${s.status}">${s.status}</span></td>
        <td>
          <button class="action-btn action-btn-edit"   onclick="Staff.openStaffForm('${s.id}')">Edit</button>
          <button class="action-btn action-btn-delete" onclick="Staff.deleteStaff('${s.id}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },

  _staffTypeBadge(type) {
    const map = {
      fulltime:   'background:#c6f6d5;color:#22543d;',
      parttime:   'background:#bee3f8;color:#2c5282;',
      freelancer: 'background:#fefcbf;color:#744210;',
      intern:     'background:#e9d8fd;color:#553c9a;'
    };
    const style = map[type] || 'background:#edf2f7;color:#4a5568;';
    return `<span class="status-badge" style="${style}">${type || '—'}</span>`;
  },

  async openStaffForm(id) {
    this._editingId = id || null;
    document.getElementById('hrStaffFormTitle').textContent = id ? 'Edit Staff Member' : 'Add Staff Member';
    document.getElementById('hrStaffSaveBtn').textContent   = id ? 'Update Staff Member' : 'Save Staff Member';
    document.getElementById('hrStaffForm').reset();
    document.getElementById('hrAdvanceSection').style.display = 'none';

    // Refresh profile dropdown
    this._populateProfileDropdown();

    if (id) {
      const s = this._staff.find(x => x.id === id);
      if (s) {
        document.getElementById('hrStaffName').value           = s.name           || '';
        document.getElementById('hrStaffPhone').value          = s.phone          || '';
        document.getElementById('hrStaffEmail').value          = s.email          || '';
        document.getElementById('hrStaffAadhar').value         = s.aadharNumber   || '';
        document.getElementById('hrStaffUpi').value            = s.upiId          || '';
        document.getElementById('hrStaffStartDate').value      = s.startDate      || '';
        document.getElementById('hrStaffRole').value           = s.role           || '';
        document.getElementById('hrStaffType').value           = s.staffType      || '';
        document.getElementById('hrStaffSalary').value         = s.salary         || '';
        document.getElementById('hrStaffAllowance').value      = s.allowance      || '';
        document.getElementById('hrStaffSpecialization').value = s.specialization || '';
        document.getElementById('hrStaffStatus').value         = s.status         || 'active';
        document.getElementById('hrStaffProfileId').value      = s.profileId      || '';
        document.getElementById('hrStaffTargetPeriod').value   = s.targetPeriod   || '';
      }

      // Show advance section
      const advName = this._staff.find(x => x.id === id);
      document.getElementById('hrAdvanceName').textContent = advName ? advName.name : '';
      document.getElementById('hrAdvanceSection').style.display = 'block';
      await this._loadAdvances(id);
    }

    const card = document.getElementById('hrStaffFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeStaffForm() {
    document.getElementById('hrStaffFormCard').style.display = 'none';
    document.getElementById('hrStaffForm').reset();
    document.getElementById('hrAdvanceSection').style.display = 'none';
    this._editingId = null;
  },

  async handleStaffSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('hrStaffSaveBtn');
    const data = {
      name:              document.getElementById('hrStaffName').value.trim(),
      phone:             document.getElementById('hrStaffPhone').value.trim(),
      email:             document.getElementById('hrStaffEmail').value.trim(),
      aadharNumber:      document.getElementById('hrStaffAadhar').value.trim(),
      upiId:             document.getElementById('hrStaffUpi').value.trim(),
      startDate:         document.getElementById('hrStaffStartDate').value,
      role:              document.getElementById('hrStaffRole').value.trim(),
      staffType:         document.getElementById('hrStaffType').value,
      salary:            parseFloat(document.getElementById('hrStaffSalary').value) || 0,
      allowance:         parseFloat(document.getElementById('hrStaffAllowance').value) || 0,
      specialization:    document.getElementById('hrStaffSpecialization').value.trim(),
      status:            document.getElementById('hrStaffStatus').value,
      profileId:         document.getElementById('hrStaffProfileId').value,
      targetPeriod:      document.getElementById('hrStaffTargetPeriod').value,
      incentiveStructure: ''
    };
    if (this._editingId) data.id = this._editingId;

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = this._editingId
        ? await API.updateStaff(data)
        : await API.addStaff(data);

      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || (this._editingId ? 'Staff updated.' : 'Staff added.'), 'success');
        this.closeStaffForm();
        await this._loadStaff();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error saving staff member', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },

  async deleteStaff(id) {
    if (!confirm('Are you sure you want to delete this staff member? This cannot be undone.')) return;
    UI.showLoading();
    try {
      const res = await API.deleteStaff(id);
      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || 'Staff deleted.', 'success');
        await this._loadStaff();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error deleting staff', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Network error', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  _populateProfileDropdown() {
    const sel = document.getElementById('hrStaffProfileId');
    if (!sel) return;
    const active = this._profiles.filter(p => p.status === 'active');
    sel.innerHTML = '<option value="">No Profile</option>' +
      active.map(p => `<option value="${p.id || p.profileId}">${this._esc(p.name)}</option>`).join('');
  },


  // ── Advances ──

  async _loadAdvances(staffId) {
    const tbody  = document.getElementById('hrAdvanceTableBody');
    const balEl  = document.getElementById('hrAdvanceBalance');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;">Loading…</td></tr>';
    try {
      const res = await API.getAdvances(staffId);
      if (res.status === 'success') {
        const advances = res.advances || [];
        const balance  = res.outstandingBalance || 0;
        balEl.textContent = this._fmt(balance);
        if (!advances.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;">No advance entries</td></tr>';
          return;
        }
        let running = 0;
        tbody.innerHTML = advances.map(a => {
          const amt = parseFloat(a.amount) || 0;
          running += (a.type === 'repayment' ? -amt : amt);
          const typeStyle = a.type === 'repayment'
            ? 'background:#c6f6d5;color:#22543d;'
            : 'background:#fed7d7;color:#c53030;';
          return `<tr>
            <td style="white-space:nowrap;">${this._fmtDate(a.date)}</td>
            <td><span class="status-badge" style="${typeStyle}">${a.type}</span></td>
            <td style="text-align:right;white-space:nowrap;">${this._fmt(amt)}</td>
            <td>${this._esc(a.notes || '—')}</td>
            <td style="text-align:right;white-space:nowrap;font-weight:600;">${this._fmt(running)}</td>
          </tr>`;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#fc8181;">Failed to load advances</td></tr>';
      }
    } catch(err) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#fc8181;">Error loading advances</td></tr>';
    }
  },

  async addAdvance() {
    const date   = document.getElementById('hrAdvDate').value;
    const type   = document.getElementById('hrAdvType').value;
    const amount = parseFloat(document.getElementById('hrAdvAmount').value) || 0;
    const notes  = document.getElementById('hrAdvNotes').value.trim();
    const btn    = document.getElementById('hrAdvSaveBtn');

    if (!date)      { UI.showMessage('staffMessage', 'Please select a date for the advance entry.', 'error'); return; }
    if (amount <= 0){ UI.showMessage('staffMessage', 'Amount must be greater than zero.', 'error'); return; }
    if (!this._editingId) return;

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const res = await API.addAdvance({ staffId: this._editingId, date, type, amount, notes });
      if (res.status === 'success') {
        UI.showMessage('staffMessage', 'Advance entry added.', 'success');
        document.getElementById('hrAdvDate').value   = '';
        document.getElementById('hrAdvAmount').value = '';
        document.getElementById('hrAdvNotes').value  = '';
        await this._loadAdvances(this._editingId);
      } else {
        UI.showMessage('staffMessage', res.message || 'Error adding advance entry', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error adding advance entry', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Entry';
    }
  },

  // ─── TAB 2: INCENTIVE PROFILES ───────────────────────────────────────────────

  _renderProfiles() {
    const tbody = document.getElementById('hrProfTableBody');
    if (!this._profiles.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a0aec0;padding:24px;">No incentive profiles found</td></tr>';
      return;
    }
    tbody.innerHTML = this._profiles.map(p => {
      const pid = p.id || p.profileId;
      const l1  = this._fmtTarget(p.l1Type || p.hrProfL1Type, p.l1Value || p.hrProfL1Value);
      const l2  = this._fmtTarget(p.l2Type || p.hrProfL2Type, p.l2Value || p.hrProfL2Value);
      const brackets = `${p.xPct || p.hrProfXPct || 0}% / ${p.yPct || p.hrProfYPct || 0}% / ${p.zPct || p.hrProfZPct || 0}%`;
      return `<tr>
        <td style="font-weight:500;">${this._esc(p.name)}</td>
        <td>${this._esc(p.profileType || p.type || '—')}</td>
        <td>${this._esc(p.revenueBase || '—')}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(p.otRate || p.hrProfOtRate)}/hr</td>
        <td>${this._esc(l1)}</td>
        <td>${this._esc(l2)}</td>
        <td style="font-size:12px;white-space:nowrap;">${this._esc(brackets)}</td>
        <td><span class="status-badge status-${p.status}">${p.status}</span></td>
        <td>
          <button class="action-btn action-btn-edit"   onclick="Staff.openProfForm('${pid}')">Edit</button>
          <button class="action-btn action-btn-delete" onclick="Staff.deleteProfile('${pid}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },

  openProfForm(id) {
    this._profEditingId = id || null;
    document.getElementById('hrProfFormTitle').textContent = id ? 'Edit Profile' : 'Add Profile';
    document.getElementById('hrProfSaveBtn').textContent   = id ? 'Update Profile' : 'Save Profile';
    document.getElementById('hrProfForm').reset();

    if (id) {
      const p = this._profiles.find(x => (x.id || x.profileId) === id);
      if (p) {
        document.getElementById('hrProfName').value        = p.name            || '';
        document.getElementById('hrProfType').value        = p.profileType || p.type || '';
        document.getElementById('hrProfRevenueBase').value = p.revenueBase     || '';
        document.getElementById('hrProfOtRate').value      = p.otRate || p.hrProfOtRate || '';
        document.getElementById('hrProfL1Type').value      = p.l1Type || p.hrProfL1Type || '';
        document.getElementById('hrProfL1Value').value     = p.l1Value || p.hrProfL1Value || '';
        document.getElementById('hrProfL2Type').value      = p.l2Type || p.hrProfL2Type || '';
        document.getElementById('hrProfL2Value').value     = p.l2Value || p.hrProfL2Value || '';
        document.getElementById('hrProfXPct').value        = p.xPct || p.hrProfXPct || '';
        document.getElementById('hrProfYPct').value        = p.yPct || p.hrProfYPct || '';
        document.getElementById('hrProfZPct').value        = p.zPct || p.hrProfZPct || '';
        document.getElementById('hrProfStatus').value      = p.status || 'active';
      }
    }

    const card = document.getElementById('hrProfFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeProfForm() {
    document.getElementById('hrProfFormCard').style.display = 'none';
    document.getElementById('hrProfForm').reset();
    this._profEditingId = null;
  },

  async handleProfSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('hrProfSaveBtn');
    const data = {
      name:        document.getElementById('hrProfName').value.trim(),
      profileType: document.getElementById('hrProfType').value,
      revenueBase: document.getElementById('hrProfRevenueBase').value,
      otRate:      parseFloat(document.getElementById('hrProfOtRate').value) || 0,
      l1Type:      document.getElementById('hrProfL1Type').value,
      l1Value:     parseFloat(document.getElementById('hrProfL1Value').value) || 0,
      l2Type:      document.getElementById('hrProfL2Type').value,
      l2Value:     parseFloat(document.getElementById('hrProfL2Value').value) || 0,
      xPct:        parseFloat(document.getElementById('hrProfXPct').value) || 0,
      yPct:        parseFloat(document.getElementById('hrProfYPct').value) || 0,
      zPct:        parseFloat(document.getElementById('hrProfZPct').value) || 0,
      status:      document.getElementById('hrProfStatus').value
    };
    if (this._profEditingId) data.id = this._profEditingId;

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = this._profEditingId
        ? await API.updateIncentiveProfile(data)
        : await API.addIncentiveProfile(data);

      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || (this._profEditingId ? 'Profile updated.' : 'Profile added.'), 'success');
        this.closeProfForm();
        await this._loadProfiles();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error saving profile', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error saving profile', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },

  async deleteProfile(id) {
    if (!confirm('Delete this incentive profile? Any staff using it will lose their profile assignment.')) return;
    UI.showLoading();
    try {
      const res = await API.deleteIncentiveProfile(id);
      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || 'Profile deleted.', 'success');
        await this._loadProfiles();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error deleting profile', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error deleting profile', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // ─── TAB 3: SHIFTS ───────────────────────────────────────────────────────────

  _renderShifts() {
    const tbody = document.getElementById('hrShiftTableBody');
    if (!this._shifts.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:24px;">No shifts found</td></tr>';
      return;
    }
    tbody.innerHTML = this._shifts.map(s => {
      const sid = s.id || s.shiftId;
      return `<tr>
        <td style="font-weight:500;">${this._esc(s.name)}</td>
        <td style="white-space:nowrap;">${this._esc(s.startTime || s.hrShiftStart || '—')}</td>
        <td style="white-space:nowrap;">${this._esc(s.endTime   || s.hrShiftEnd   || '—')}</td>
        <td><span class="status-badge status-${s.status}">${s.status}</span></td>
        <td>
          <button class="action-btn action-btn-edit" onclick="Staff.openShiftForm('${sid}')">Edit</button>
        </td>
      </tr>`;
    }).join('');
  },

  openShiftForm(id) {
    this._shiftEditingId = id || null;
    document.getElementById('hrShiftFormTitle').textContent = id ? 'Edit Shift' : 'Add Shift';
    document.getElementById('hrShiftSaveBtn').textContent   = id ? 'Update Shift' : 'Save Shift';
    document.getElementById('hrShiftForm').reset();

    if (id) {
      const s = this._shifts.find(x => (x.id || x.shiftId) === id);
      if (s) {
        document.getElementById('hrShiftName').value   = s.name       || '';
        document.getElementById('hrShiftStart').value  = s.startTime  || s.hrShiftStart  || '';
        document.getElementById('hrShiftEnd').value    = s.endTime    || s.hrShiftEnd    || '';
        document.getElementById('hrShiftStatus').value = s.status     || 'active';
      }
    }

    const card = document.getElementById('hrShiftFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeShiftForm() {
    document.getElementById('hrShiftFormCard').style.display = 'none';
    document.getElementById('hrShiftForm').reset();
    this._shiftEditingId = null;
  },

  async handleShiftSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('hrShiftSaveBtn');
    const data = {
      name:      document.getElementById('hrShiftName').value.trim(),
      startTime: document.getElementById('hrShiftStart').value,
      endTime:   document.getElementById('hrShiftEnd').value,
      status:    document.getElementById('hrShiftStatus').value
    };
    if (this._shiftEditingId) data.shiftId = this._shiftEditingId;

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = await API.saveShift(data);
      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || (this._shiftEditingId ? 'Shift updated.' : 'Shift added.'), 'success');
        this.closeShiftForm();
        await this._loadShifts();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error saving shift', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error saving shift', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },



  // ─── TAB 4: ATTENDANCE ───────────────────────────────────────────────────────

  async loadAttendance() {
    const monthEl = document.getElementById('hrAttMonth');
    const period  = monthEl ? monthEl.value : '';
    const msgEl   = document.getElementById('hrAttMessage');

    if (!period) { this._showInlineMsg(msgEl, 'Please select a month.', 'error'); return; }

    const [year, month] = period.split('-').map(Number);
    const fromDate = `${period}-01`;
    const lastDay  = new Date(year, month, 0).getDate();
    const toDate   = `${period}-${String(lastDay).padStart(2, '0')}`;

    // Set week start: only reset when period changes or never loaded
    if (!this._keepWeekStart || this._loadedPeriod !== period) {
      this._currentWeekStart = this._getMonday(new Date(year, month - 1, 1));
    }
    this._keepWeekStart = false;
    this._loadedPeriod  = period;

    const btn = document.getElementById('hrAttLoadBtn');
    btn.disabled = true; btn.textContent = 'Loading…';

    try {
      const [staffRes, attRes] = await Promise.all([
        API.getStaff(),
        API.getAttendance({ fromDate, toDate })
      ]);
      this._attendance = attRes.status === 'success' ? (attRes.attendance || []) : [];
      if (staffRes.status === 'success') this._staff = staffRes.staff || this._staff;
      await this._renderWeekGrid();
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error loading attendance data', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Load';
    }
  },

  _getMonday(date) {
    const d   = new Date(date);
    const day = d.getDay();                    // 0=Sun … 6=Sat
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  },

  _weekLabel() {
    if (!this._currentWeekStart) return '—';
    const end = new Date(this._currentWeekStart);
    end.setDate(end.getDate() + 6);
    const s = this._currentWeekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const e = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${s} – ${e}`;
  },

  async _prevWeek() {
    if (!this._currentWeekStart) return;
    const prev = new Date(this._currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    this._currentWeekStart = prev;
    const needPeriod = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    if (needPeriod !== this._loadedPeriod) {
      document.getElementById('hrAttMonth').value = needPeriod;
      this._keepWeekStart = true;
      await this.loadAttendance();
    } else {
      await this._renderWeekGrid();
    }
  },

  async _nextWeek() {
    if (!this._currentWeekStart) return;
    const next = new Date(this._currentWeekStart);
    next.setDate(next.getDate() + 7);
    this._currentWeekStart = next;
    const needPeriod = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    if (needPeriod !== this._loadedPeriod) {
      document.getElementById('hrAttMonth').value = needPeriod;
      this._keepWeekStart = true;
      await this.loadAttendance();
    } else {
      await this._renderWeekGrid();
    }
  },

  _isPastWeek() {
    if (!this._currentWeekStart) return true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return this._currentWeekStart < this._getMonday(today);
  },

  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  async _loadWeekSchedule() {
    const weekStart = this._dateStr(this._currentWeekStart);
    try {
      const res = await API.call('get_week_schedule', { weekStart });
      this._weekScheduleData = {};
      if (res.status === 'success') {
        (res.schedules || []).forEach(s => {
          this._weekScheduleData[s.staffId] = {
            shiftId: s.shiftId || '',
            offDays: s.offDays ? s.offDays.split(',').filter(Boolean) : []
          };
        });
      }
    } catch(e) { this._weekScheduleData = {}; }
  },

  async _renderWeekGrid() {
    const wrap    = document.getElementById('hrAttGridWrap');
    const labelEl = document.getElementById('hrAttWeekLabel');
    if (labelEl) labelEl.textContent = this._weekLabel();

    if (!this._currentWeekStart) {
      wrap.innerHTML = '<p style="text-align:center;color:#a0aec0;padding:24px;">Select a month and click Load.</p>';
      document.getElementById('hrAttPlanWrap').style.display = 'none';
      return;
    }

    // Load week schedule (for plan UI and future auto-select)
    await this._loadWeekSchedule();

    const activeStaff = this._staff.filter(s => s.status === 'active');
    if (!activeStaff.length) {
      wrap.innerHTML = '<p style="text-align:center;color:#a0aec0;padding:24px;">No active staff members.</p>';
      return;
    }

    // Fri=5, Sat=6, Sun=0 are all weekends (highlighted + double-count)
    const isWeekendDay = dow => dow === 0 || dow === 5 || dow === 6;

    // Build 7-day window (Mon–Sun)
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const days = dayNames.map((name, i) => {
      const d = new Date(this._currentWeekStart);
      d.setDate(d.getDate() + i);
      const dow = d.getDay();
      return {
        name,
        dateStr: this._dateStr(d),
        dow,
        isWeekend: isWeekendDay(dow),
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }) + ' ' + d.getDate()
      };
    });

    // Render week plan (current/future weeks only)
    this._renderWeekPlan(activeStaff, days);

    const attMap = {};
    (this._attendance || []).forEach(a => { attMap[a.staffId + '|' + a.date] = a; });

    const statusCfg = {
      present:    { abbr: 'P', bg: '#c6f6d5', color: '#276749' },
      absent:     { abbr: 'A', bg: '#fed7d7', color: '#9b2c2c' },
      'half-day': { abbr: 'H', bg: '#fefcbf', color: '#975a16' }
    };
    const wkBg = '#fef9e7';  // weekend column tint for empty cells

    const dayHeaders = days.map(d =>
      `<th style="min-width:48px;text-align:center;font-size:12px;padding:6px 4px;${d.isWeekend ? `background:${wkBg};` : ''}">${d.label}</th>`
    ).join('');

    const rows = activeStaff.map(s => {
      let daysOff = 0, otHrs = 0;
      const cells = days.map(d => {
        const rec = attMap[s.id + '|' + d.dateStr];
        if (rec) {
          const st  = rec.dayStatus || 'present';
          const cfg = statusCfg[st] || { abbr: '?', bg: '#edf2f7', color: '#4a5568' };
          // Weekends (Fri/Sat/Sun): absent=2 days, half-day=1 day
          if (st === 'absent')   daysOff += d.isWeekend ? 2 : 1;
          if (st === 'half-day') daysOff += d.isWeekend ? 1 : 0.5;
          otHrs += parseFloat(rec.otHours) || 0;
          return `<td style="text-align:center;background:${cfg.bg};color:${cfg.color};font-weight:700;font-size:13px;cursor:pointer;min-width:48px;padding:6px 4px;"
            onclick="Staff.openAttModal('${s.id}','${d.dateStr}')" title="${st}">${cfg.abbr}</td>`;
        }
        return `<td style="text-align:center;color:#cbd5e0;font-size:13px;cursor:pointer;min-width:48px;padding:6px 4px;${d.isWeekend ? `background:${wkBg};` : ''}"
          onclick="Staff.openAttModal('${s.id}','${d.dateStr}')" title="No record">–</td>`;
      }).join('');

      return `<tr>
        <td style="white-space:nowrap;font-weight:500;min-width:130px;padding:6px 8px;position:sticky;left:0;background:#fff;z-index:1;border-right:2px solid #e2e8f0;">${this._esc(s.name)}</td>
        ${cells}
        <td style="text-align:center;font-weight:600;white-space:nowrap;background:#f7fafc;padding:6px 8px;">${daysOff % 1 === 0 ? daysOff : daysOff.toFixed(1)}</td>
        <td style="text-align:center;font-weight:600;white-space:nowrap;background:#f7fafc;padding:6px 8px;">${otHrs.toFixed(1)}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead><tr>
        <th style="text-align:left;min-width:130px;padding:6px 8px;position:sticky;left:0;background:#f7fafc;z-index:2;border-right:2px solid #e2e8f0;">Staff</th>
        ${dayHeaders}
        <th style="min-width:60px;text-align:center;background:#f7fafc;padding:6px 8px;">Days Off</th>
        <th style="min-width:60px;text-align:center;background:#f7fafc;padding:6px 8px;">OT hrs</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  },

  _renderWeekPlan(activeStaff, days) {
    const planWrap = document.getElementById('hrAttPlanWrap');
    if (!planWrap) return;

    if (this._isPastWeek()) {
      planWrap.style.display = 'none';
      return;
    }

    planWrap.style.display = 'block';
    const shiftOpts = `<option value="">No shift</option>` +
      this._shifts.map(sh => {
        const sid = sh.shiftId || sh.id;
        return `<option value="${this._esc(sid)}">${this._esc(sh.name)}</option>`;
      }).join('');

    const headerCells = days.map(d =>
      `<th style="text-align:center;padding:5px 4px;font-size:12px;min-width:44px;${d.isWeekend ? 'color:#b7791f;' : ''}">${d.name}</th>`
    ).join('');

    const rows = activeStaff.map(s => {
      const sched = this._weekScheduleData[s.id] || { shiftId: '', offDays: [] };
      const shiftSel = shiftOpts.replace(
        `value="${this._esc(sched.shiftId)}"`,
        `value="${this._esc(sched.shiftId)}" selected`
      );
      const dayCells = days.map((d, i) =>
        `<td style="text-align:center;padding:5px 4px;">
          <input type="checkbox" id="wpOff-${s.id}-${i}" ${sched.offDays.includes(d.name) ? 'checked' : ''}>
        </td>`
      ).join('');
      return `<tr>
        <td style="padding:5px 8px;white-space:nowrap;font-weight:500;">${this._esc(s.name)}</td>
        <td style="padding:5px 8px;">
          <select id="wpShift-${s.id}" style="font-size:13px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:4px;min-width:100px;">${shiftSel}</select>
        </td>
        ${dayCells}
      </tr>`;
    }).join('');

    planWrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4 style="margin:0;color:#2d3748;font-size:14px;font-weight:700;">Week Plan <span style="font-weight:400;color:#718096;font-size:12px;">(shift &amp; planned off days)</span></h4>
        <div style="display:flex;align-items:center;gap:10px;">
          <div id="wpMsg" style="font-size:13px;"></div>
          <button class="btn btn-primary" id="wpSaveBtn" onclick="Staff.saveWeekSchedule()" style="padding:7px 18px;">Save Week Plan</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-size:13px;width:100%;">
          <thead><tr>
            <th style="text-align:left;padding:5px 8px;min-width:130px;">Staff</th>
            <th style="padding:5px 8px;min-width:110px;">Shift</th>
            ${headerCells}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  async saveWeekSchedule() {
    const weekStart   = this._dateStr(this._currentWeekStart);
    const activeStaff = this._staff.filter(s => s.status === 'active');
    const dayNames    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    const entries = activeStaff.map(s => {
      const shiftSel = document.getElementById(`wpShift-${s.id}`);
      const offDays  = dayNames.filter((_, i) => {
        const cb = document.getElementById(`wpOff-${s.id}-${i}`);
        return cb && cb.checked;
      });
      return { staffId: s.id, shiftId: shiftSel ? shiftSel.value : '', offDays: offDays.join(',') };
    });

    const btn   = document.getElementById('wpSaveBtn');
    const msgEl = document.getElementById('wpMsg');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const res = await API.call('save_week_schedule', { weekStart, entries });
      if (res.status !== 'success') throw new Error(res.message);
      if (msgEl) { msgEl.textContent = 'Saved ✓'; msgEl.style.color = '#276749'; setTimeout(() => { msgEl.textContent = ''; }, 3000); }
      await this._loadWeekSchedule();
    } catch(e) {
      if (msgEl) { msgEl.textContent = e.message; msgEl.style.color = '#c53030'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Week Plan'; }
    }
  },

  openAttModal(staffId, date) {
    const staffMem  = this._staff.find(s => s.id === staffId);
    const staffName = staffMem ? staffMem.name : staffId;
    const rec       = (this._attendance || []).find(a => a.staffId === staffId && a.date === date);

    this._attData = { staffId, date, attendanceId: rec ? (rec.attendanceId || null) : null };

    document.getElementById('hrAttModalTitle').textContent = `${staffName} — ${date}`;
    document.getElementById('hrAttModalMsg').innerHTML = '';

    // Populate view fields
    document.getElementById('hrAttViewIn').textContent  = rec && rec.clockIn  ? rec.clockIn  : '—';
    document.getElementById('hrAttViewOut').textContent = rec && rec.clockOut ? rec.clockOut : '—';
    document.getElementById('hrAttViewHrs').textContent = rec && rec.hoursWorked != null
      ? Number(rec.hoursWorked).toFixed(2) + ' hrs' : '—';
    document.getElementById('hrAttViewOT').textContent  = rec && rec.otHours != null
      ? Number(rec.otHours).toFixed(2) + ' hrs' : '—';
    document.getElementById('hrAttViewStatus').textContent = rec ? (rec.dayStatus || '—') : '—';
    document.getElementById('hrAttViewNotes').textContent  = rec && rec.notes ? rec.notes : '—';

    // Always open in view mode
    this._setAttViewMode(true);
    document.getElementById('hrAttModal').style.display = 'flex';
  },

  _setAttViewMode(viewMode) {
    document.getElementById('hrAttViewPanel').style.display  = viewMode ? 'block' : 'none';
    document.getElementById('hrAttEditPanel').style.display  = viewMode ? 'none'  : 'block';
    document.getElementById('hrAttViewBtns').style.display   = viewMode ? 'flex'  : 'none';
    document.getElementById('hrAttEditBtns').style.display   = viewMode ? 'none'  : 'flex';
    document.getElementById('hrAttModalMsg').innerHTML = '';
  },

  _enterAttEditMode() {
    const rec = (this._attendance || []).find(a =>
      a.staffId === this._attData.staffId && a.date === this._attData.date);

    const status = rec ? (rec.dayStatus || 'present') : 'present';
    document.getElementById('hrAttClockIn').value  = rec ? (rec.clockIn   || '') : '';
    document.getElementById('hrAttClockOut').value = rec ? (rec.clockOut  || '') : '';
    document.getElementById('hrAttStatus').value   = status;
    document.getElementById('hrAttNotes').value    = rec ? (rec.notes     || '') : '';

    this._onAttStatusChange(status);
    this._setAttViewMode(false);
  },

  _onAttStatusChange(status) {
    const isAbsent = (status || document.getElementById('hrAttStatus').value) === 'absent';
    const inEl  = document.getElementById('hrAttClockIn');
    const outEl = document.getElementById('hrAttClockOut');
    inEl.disabled  = isAbsent;
    outEl.disabled = isAbsent;
    const grayStyle = 'background:#f0f4f8;color:#a0aec0;cursor:not-allowed;';
    const normStyle = '';
    inEl.style.cssText  = isAbsent ? grayStyle : normStyle;
    outEl.style.cssText = isAbsent ? grayStyle : normStyle;
  },

  closeAttModal() {
    document.getElementById('hrAttModal').style.display = 'none';
    this._attData = null;
  },

  async saveAttendanceRecord() {
    if (!this._attData) return;
    const { staffId, date } = this._attData;
    const dayStatus = document.getElementById('hrAttStatus').value;
    const clockIn   = dayStatus === 'absent' ? '' : document.getElementById('hrAttClockIn').value;
    const clockOut  = dayStatus === 'absent' ? '' : document.getElementById('hrAttClockOut').value;
    const notes     = document.getElementById('hrAttNotes').value.trim();
    const msgEl     = document.getElementById('hrAttModalMsg');
    const btn       = document.getElementById('hrAttModalSaveBtn');

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const res = await API.saveAttendance([{ staffId, date, clockIn, clockOut, dayStatus, notes }]);
      if (res.status === 'success') {
        // Reload attendance data so the view panel shows updated values
        await this.loadAttendance();
        // Update view fields with what was just saved
        document.getElementById('hrAttViewIn').textContent     = clockIn  || '—';
        document.getElementById('hrAttViewOut').textContent    = clockOut || '—';
        document.getElementById('hrAttViewStatus').textContent = dayStatus || '—';
        document.getElementById('hrAttViewNotes').textContent  = notes    || '—';
        // Recalc hrs/OT for the view panel (OT = max(0, hrs - 9))
        if (clockIn && clockOut) {
          const toM = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
          const hrs = Math.max(0, (toM(clockOut) - toM(clockIn)) / 60);
          document.getElementById('hrAttViewHrs').textContent = hrs.toFixed(2) + ' hrs';
          document.getElementById('hrAttViewOT').textContent  = Math.max(0, hrs - 9).toFixed(2) + ' hrs';
        } else {
          document.getElementById('hrAttViewHrs').textContent = '—';
          document.getElementById('hrAttViewOT').textContent  = '—';
        }
        this._setAttViewMode(true);
      } else {
        this._showInlineMsg(msgEl, res.message || 'Error saving attendance', 'error');
      }
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error saving attendance', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  },

  // ─── TAB 5: PAYROLL ──────────────────────────────────────────────────────────

  async calculatePayroll() {
    const period       = document.getElementById('hrPayPeriod').value;
    const payableDays  = parseInt(document.getElementById('hrPayPayableDays').value, 10) || 26;
    const eligibleOffs = parseInt(document.getElementById('hrPayEligibleOffs').value, 10) || 4;
    const msgEl        = document.getElementById('hrPayMessage');
    const btn          = document.getElementById('hrPayCalcBtn');

    if (!period) { this._showInlineMsg(msgEl, 'Please select a payroll period.', 'error'); return; }

    const activeStaff = this._staff.filter(s => s.status === 'active');
    if (!activeStaff.length) { this._showInlineMsg(msgEl, 'No active staff found.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Calculating…';
    document.getElementById('hrPayCalcWrap').style.display = 'none';
    this._payCalcResults = [];

    try {
      const results = await Promise.all(
        activeStaff.map(s =>
          API.calculatePayroll({
            staffId:        s.id,
            period,
            payableDays,
            eligibleOffs,
            advanceDeducted: 0
          }).then(res => {
            if (res.status === 'success') {
              return { ...res, staffId: s.id, staffName: s.name };
            }
            return {
              staffId:        s.id,
              staffName:      s.name,
              baseSalary:     s.salary || 0,
              daysOff:        0,
              excessLeaves:   0,
              leaveDeduction: 0,
              adjustedBase:   s.salary || 0,
              otPay:          0,
              totalIncentive: 0,
              advanceDeducted: 0,
              netPay:         s.salary || 0,
              period,
              error:          res.message || 'Calculation failed'
            };
          }).catch(() => ({
            staffId:        s.id,
            staffName:      s.name,
            baseSalary:     s.salary || 0,
            daysOff:        0,
            excessLeaves:   0,
            leaveDeduction: 0,
            adjustedBase:   s.salary || 0,
            otPay:          0,
            totalIncentive: 0,
            advanceDeducted: 0,
            netPay:         s.salary || 0,
            period,
            error:          'Network error'
          }))
        )
      );

      this._payCalcResults = results;
      this._renderPayCalcTable();
      document.getElementById('hrPayCalcWrap').style.display = 'block';
      this._showInlineMsg(msgEl, `Payroll calculated for ${results.length} staff member(s).`, 'success');
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error calculating payroll', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Calculate for All Staff';
    }
  },

  _renderPayCalcTable() {
    const tbody = document.getElementById('hrPayCalcBody');
    if (!this._payCalcResults.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#a0aec0;padding:24px;">No results</td></tr>';
      return;
    }
    tbody.innerHTML = this._payCalcResults.map((r, idx) => {
      const errorNote = r.error ? `<div style="font-size:11px;color:#e53e3e;">${this._esc(r.error)}</div>` : '';
      return `<tr>
        <td>
          <div style="font-weight:500;">${this._esc(r.staffName || r.staffId)}</div>
          ${errorNote}
        </td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(r.baseSalary)}</td>
        <td style="text-align:center;">${r.daysOff || 0}</td>
        <td style="text-align:center;">${r.excessLeaves || 0}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(r.leaveDeduction)}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(r.adjustedBase)}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(r.otPay)}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(r.totalIncentive)}</td>
        <td style="text-align:center;">
          <input type="number" class="pay-adv-input" data-idx="${idx}"
            value="${r.advanceDeducted || 0}" min="0" step="1"
            style="width:80px;text-align:right;"
            oninput="Staff._onAdvInputChange(this)">
        </td>
        <td style="text-align:right;white-space:nowrap;font-weight:600;" id="hrPayNet_${idx}">${this._fmt(r.netPay)}</td>
      </tr>`;
    }).join('');
  },

  _onAdvInputChange(input) {
    const idx    = parseInt(input.dataset.idx, 10);
    const result = this._payCalcResults[idx];
    if (!result) return;
    const newAdv    = parseFloat(input.value) || 0;
    const oldAdv    = result.advanceDeducted || 0;
    const newNetPay = (result.netPay || 0) - (newAdv - oldAdv);
    const netCell   = document.getElementById(`hrPayNet_${idx}`);
    if (netCell) netCell.textContent = this._fmt(newNetPay);
  },

  async savePayroll() {
    const btn   = document.getElementById('hrPaySaveBtn');
    const msgEl = document.getElementById('hrPayMessage');

    if (!this._payCalcResults.length) {
      this._showInlineMsg(msgEl, 'No payroll data to save. Please calculate first.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await Promise.all(
        this._payCalcResults.map((result, idx) => {
          const advInput = document.querySelector(`.pay-adv-input[data-idx="${idx}"]`);
          const newAdv   = advInput ? (parseFloat(advInput.value) || 0) : (result.advanceDeducted || 0);
          const oldAdv   = result.advanceDeducted || 0;
          const updatedResult = {
            ...result,
            advanceDeducted: newAdv,
            netPay:          (result.netPay || 0) - (newAdv - oldAdv)
          };
          return API.savePayroll(updatedResult);
        })
      );

      this._showInlineMsg(msgEl, 'Payroll saved successfully.', 'success');
      document.getElementById('hrPayCalcWrap').style.display = 'none';
      this._payCalcResults = [];
      await this.loadPayrollHistory();
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error saving payroll', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Payroll';
    }
  },

  async loadPayrollHistory() {
    const period = (document.getElementById('hrPayHistFilter').value || '').trim();
    const tbody  = document.getElementById('hrPayHistBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;">Loading…</td></tr>';
    try {
      const res = await API.getPayroll({ period });
      if (res.status === 'success') {
        this._renderPayrollHistory(res.payroll || res.records || []);
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#fc8181;">Failed to load payroll history</td></tr>';
      }
    } catch(err) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#fc8181;">Error loading payroll history</td></tr>';
    }
  },

  _renderPayrollHistory(records) {
    const tbody = document.getElementById('hrPayHistBody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;padding:24px;">No payroll records found</td></tr>';
      return;
    }
    const sorted = [...records].sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')) || String(a.staffName || '').localeCompare(String(b.staffName || '')));
    tbody.innerHTML = sorted.map(r => {
      const pid = r.payrollId || r.id;
      const statusBadge = this._payrollStatusBadge(r.status);
      const approveBtn = r.status === 'draft'
        ? `<button class="action-btn" style="background:#bee3f8;color:#2c5282;" onclick="Staff.approvePayroll('${pid}','approved')">Approve</button>`
        : '';
      const paidBtn = r.status === 'approved'
        ? `<button class="action-btn" style="background:#c6f6d5;color:#22543d;" onclick="Staff.approvePayroll('${pid}','paid')">Mark Paid</button>`
        : '';
      return `<tr>
        <td style="font-weight:500;">${this._esc(r.staffName || r.staffId || '—')}</td>
        <td style="white-space:nowrap;">${this._esc(r.period || '—')}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600;">${this._fmt(r.netPay)}</td>
        <td>${statusBadge}</td>
        <td>
          ${approveBtn}
          ${paidBtn}
        </td>
      </tr>`;
    }).join('');
  },

  _payrollStatusBadge(status) {
    const map = {
      draft:    'background:#edf2f7;color:#4a5568;',
      approved: 'background:#bee3f8;color:#2c5282;',
      paid:     'background:#c6f6d5;color:#22543d;',
      voided:   'background:#fed7d7;color:#c53030;'
    };
    return `<span class="status-badge" style="${map[status] || ''}">${status || '—'}</span>`;
  },

  async approvePayroll(payrollId, status) {
    const label = status === 'paid' ? 'Mark this payroll as Paid?' : 'Approve this payroll?';
    if (!confirm(label)) return;
    UI.showLoading();
    try {
      const res = await API.updatePayrollStatus({ payrollId, status });
      if (res.status === 'success') {
        UI.showMessage('staffMessage', `Payroll ${status === 'paid' ? 'marked as paid' : 'approved'}.`, 'success');
        await this.loadPayrollHistory();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error updating payroll status', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error updating payroll status', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _fmt(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _fmtTarget(type, value) {
    return type === 'salary_pct'
      ? `${value}% of salary`
      : `₹${Number(value || 0).toLocaleString('en-IN')}`;
  },

  _fmtDate(ds) {
    if (!ds) return '—';
    const d = new Date(String(ds).slice(0, 10) + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  _showInlineMsg(el, text, type) {
    if (!el) return;
    const color = type === 'success' ? '#276749' : type === 'error' ? '#9b2c2c' : '#2c5282';
    const bg    = type === 'success' ? '#c6f6d5' : type === 'error' ? '#fed7d7' : '#bee3f8';
    el.innerHTML = `<div style="padding:10px 14px;border-radius:6px;background:${bg};color:${color};font-size:13px;margin-bottom:8px;">${this._esc(text)}</div>`;
    setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
  }
};
