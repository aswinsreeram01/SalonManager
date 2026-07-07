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
  _payrollRows:      [],
  _payReviewId:      null,
  _payRevAdvanceBase: null,
  _attSumStaffId:    null,
  _attSumPeriod:     null,
  _attSumOverrides:  null,
  _attSumOriginal:   {},
  _quickEntryPeriod:  null,
  _quickEntrySummary: {},
  _advStaffId:       null,

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
    document.getElementById('hrStaffIncludeChildren').addEventListener('change', () => this._loadStaff());

    // ── Advances tab ──
    document.getElementById('hrAdvStaff').addEventListener('change', () => this._onAdvStaffChange());
    document.getElementById('hrAdvSaveBtn').addEventListener('click', () => this.addAdvance());

    // ── Profiles tab ──
    document.getElementById('hrProfAddBtn').addEventListener('click', () => this.openProfForm());
    document.getElementById('hrProfCancelBtn').addEventListener('click', () => this.closeProfForm());
    document.getElementById('hrProfForm').addEventListener('submit', e => this.handleProfSubmit(e));
    document.getElementById('hrProfIncludeChildren')?.addEventListener('change', () => this._loadProfiles());

    // ── Shifts tab ──
    document.getElementById('hrShiftAddBtn').addEventListener('click', () => this.openShiftForm());
    document.getElementById('hrShiftCancelBtn').addEventListener('click', () => this.closeShiftForm());
    document.getElementById('hrShiftForm').addEventListener('submit', e => this.handleShiftSubmit(e));
    document.getElementById('hrShiftIncludeChildren')?.addEventListener('change', () => this._loadShifts());

    // ── Attendance tab ──
    document.getElementById('hrAttLoadBtn').addEventListener('click', () => this.loadAttendance());
    document.getElementById('hrAttPrevWeek').addEventListener('click', () => this._prevWeek());
    document.getElementById('hrAttNextWeek').addEventListener('click', () => this._nextWeek());

    // ── Payroll tab ──
    document.getElementById('hrPayPeriod').addEventListener('change', () => this.loadPayrollForMonth());
    document.getElementById('hrPayIncludeChildren').addEventListener('change', () => this.loadPayrollForMonth());

    // ── Payroll review modal ──
    document.getElementById('hrPayRevCalcBtn').addEventListener('click', () => this.calculatePayrollReview());
    document.getElementById('hrPayRevDownloadBtn').addEventListener('click', () => this.downloadPayslip());
    document.getElementById('hrPayRevPayBtn').addEventListener('click', () => this.payViaUpi());
    document.getElementById('hrPayRevSendReviewBtn').addEventListener('click', () => this._payrollStatusTransition('review'));
    document.getElementById('hrPayRevApproveBtn').addEventListener('click', () => this._payrollStatusTransition('approved'));
    document.getElementById('hrPayRevMarkPaidBtn').addEventListener('click', () => this._payrollStatusTransition('paid'));
    document.getElementById('hrPayRevBackBtn').addEventListener('click', () => this._payrollStatusBack());
    document.getElementById('hrPayRevVoidBtn').addEventListener('click', () => {
      if (confirm('Void this payroll record? It will drop out of the normal workflow.')) {
        this._payrollStatusTransition('voided');
      }
    });
    document.getElementById('hrPayRevCloseBtn').addEventListener('click', () => this.closePayrollReview());
    document.getElementById('hrPayReviewCloseX').addEventListener('click', () => this.closePayrollReview());
    document.getElementById('hrPayRevExplainClose').addEventListener('click', () => {
      document.getElementById('hrPayRevExplainWrap').style.display = 'none';
    });
    document.querySelectorAll('#hrPayReviewModal .calc-help-btn').forEach(btn =>
      btn.addEventListener('click', () => this._showCalcExplanation(btn.dataset.calcField))
    );
    document.getElementById('hrPayRevPayableDays').addEventListener('input', () => this._recalcLeaveAllowancePreview());
    document.getElementById('hrPayRevEligOffs').addEventListener('input', () => this._recalcLeaveAllowancePreview());
    document.getElementById('hrPayRevPayUnused').addEventListener('change', () => this._recalcLeaveAllowancePreview());
    document.getElementById('hrPayRevAdvDeduct').addEventListener('input', () => this._syncAdvanceFields('deduct'));
    document.getElementById('hrPayRevRemainingBalance').addEventListener('input', () => this._syncAdvanceFields('remain'));

    // ── Payroll sub-tabs (Payroll / Staff Salary / Comp Plans) ──
    document.querySelectorAll('#prod-tab-hr-payroll .sub-tab').forEach(btn =>
      btn.addEventListener('click', () => this._switchPaySubTab(btn.dataset.subtab))
    );

    // ── Quick Entry tab ──
    document.getElementById('hrQeMonth').addEventListener('change', () => this.loadQuickEntryGrid());
    document.getElementById('hrAttSumSaveBtn').addEventListener('click', () => this._saveAttSummary());
    document.getElementById('hrQeModalCloseX').addEventListener('click', () => this.closeQuickEntryModal());

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
    const qeMonthEl = document.getElementById('hrQeMonth');
    if (qeMonthEl) qeMonthEl.value = ym;
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
    if (tab === 'hr-quickentry') this.loadQuickEntryGrid();
    if (tab === 'hr-payroll')    this.loadPayrollForMonth();
    if (tab === 'hr-advances')   this._populateAdvStaffDropdown();
  },

  // ─── Load ────────────────────────────────────────────────────────────────────

  async load() {
    UI.showLoading();
    try {
      // Orgs must be loaded BEFORE the others render — each of their render
      // functions calls _orgName() as soon as its own fetch resolves, so
      // running this in the same Promise.all race let staff/profiles/shifts
      // finish first and render raw org IDs instead of names whenever the
      // orgs request was the slowest of the four.
      await this._loadOrgs();
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

  // Org picker is optional — a role with Staff access but no Organizations
  // access simply won't see it (form still works fine). Scoped to the
  // caller's own org + descendants, not every org in the system.
  async _loadOrgs() {
    try {
      const res = await API.getOrganizations(Auth.currentUser?.orgId);
      this._orgs = res.status === 'success' ? (res.organizations || []) : [];
    } catch (e) {
      this._orgs = [];
    }
    this._populateOrgDropdown();
  },

  _populateOrgDropdown() {
    const opts = (this._orgs || []).map(o => `<option value="${o.id}">${this._esc(o.name)}</option>`).join('');
    const disabled = (this._orgs || []).length < 2;
    // A leaf org (no descendants) has nothing to pick between — grey it out
    // rather than hide it, so the form still shows which org the record is in.
    ['hrStaffOrgId', 'hrProfOrgId', 'hrShiftOrgId'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = opts;
      sel.disabled = disabled;
    });
  },

  _orgName(orgId) {
    const org = (this._orgs || []).find(o => o.id === orgId);
    return org ? org.name : (orgId || '—');
  },

  async _loadStaff() {
    try {
      const includeChildren = document.getElementById('hrStaffIncludeChildren')?.checked || false;
      const res = await API.getStaff({ includeChildren });
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
      const includeChildren = document.getElementById('hrProfIncludeChildren')?.checked || false;
      const res = await API.getIncentiveProfiles({ includeChildren });
      if (res.status === 'success') {
        this._profiles = res.incentiveProfiles || [];
        this._renderProfiles();
      }
    } catch(e) {
      // non-fatal — profiles may not exist yet
    }
  },

  async _loadShifts() {
    try {
      const includeChildren = document.getElementById('hrShiftIncludeChildren')?.checked || false;
      const res = await API.getShifts({ includeChildren });
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:24px;">No staff found</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(s => {
      const typeBadge = this._staffTypeBadge(s.staffType);
      return `<tr>
        <td>
          <div style="font-weight:500;">${this._esc(s.name)}</div>
          ${s.phone ? `<div style="font-size:11px;color:#a0aec0;">${this._esc(s.phone)}</div>` : ''}
        </td>
        <td>${this._esc(s.role || '—')}</td>
        <td>${typeBadge}</td>
        <td><span class="status-badge status-${s.status}">${s.status}</span></td>
        <td>${this._esc(this._orgName(s.orgId))}</td>
        <td>
          <button class="action-btn action-btn-edit"   onclick="Staff.openStaffForm('${s.id}')">Edit</button>
          <button class="action-btn" style="background:#fffbeb;color:#744210;" onclick="Staff.resetStaffPin('${s.id}')" title="Clears the portal PIN — they sign in with the last 4 digits of their phone again">Reset PIN</button>
          <button class="action-btn action-btn-delete" onclick="Staff.deleteStaff('${s.id}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },

  async resetStaffPin(id) {
    const s = (this._staff || []).find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Reset the Staff Portal PIN for ${s.name}?\n\nThey will sign in with the default PIN again (last 4 digits of their phone number) and can set a new one from the portal.`)) return;
    try {
      const res = await API.resetStaffPin(id);
      UI.showMessage('staffMessage', res.message || (res.status === 'success' ? 'PIN reset.' : 'Error resetting PIN'),
        res.status === 'success' ? 'success' : 'error');
    } catch (e) {
      UI.showMessage('staffMessage', 'Network error resetting PIN', 'error');
    }
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

    // Org field defaults to the record's current org when editing, or the
    // current user's own org for a brand-new staff member — never blank.
    let recordOrgId = Auth.currentUser?.orgId || '';

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
        document.getElementById('hrStaffNotes').value           = s.specialization || '';
        document.getElementById('hrStaffStatus').value         = s.status         || 'active';
        recordOrgId = s.orgId || recordOrgId;
      }
    }
    const orgSel = document.getElementById('hrStaffOrgId');
    if (orgSel) orgSel.value = recordOrgId;

    const card = document.getElementById('hrStaffFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeStaffForm() {
    document.getElementById('hrStaffFormCard').style.display = 'none';
    document.getElementById('hrStaffForm').reset();
    this._editingId = null;
  },

  async handleStaffSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('hrStaffSaveBtn');
    // Base Salary, Allowances, and Comp Plan are managed on the Staff Salary
    // tab now, not this form. Staff.update() overwrites every column from
    // this payload with no partial-update fallback, so an edit made here
    // must carry forward whatever was already set for those 3 fields — new
    // staff simply start at 0/blank until someone sets them on that tab.
    const existing = this._editingId ? this._staff.find(x => x.id === this._editingId) : null;
    const data = {
      name:              document.getElementById('hrStaffName').value.trim(),
      phone:             document.getElementById('hrStaffPhone').value.trim(),
      email:             document.getElementById('hrStaffEmail').value.trim(),
      aadharNumber:      document.getElementById('hrStaffAadhar').value.trim(),
      upiId:             document.getElementById('hrStaffUpi').value.trim(),
      startDate:         document.getElementById('hrStaffStartDate').value,
      role:              document.getElementById('hrStaffRole').value.trim(),
      staffType:         document.getElementById('hrStaffType').value,
      salary:            existing ? existing.salary    : 0,
      allowance:         existing ? existing.allowance : 0,
      profileId:         existing ? existing.profileId : '',
      specialization:    document.getElementById('hrStaffNotes').value.trim(),
      status:            document.getElementById('hrStaffStatus').value,
      incentiveStructure: ''
    };
    if (this._editingId) data.id = this._editingId;
    // The Org field always holds a real org now (own org, or a descendant
    // explicitly picked) — always send it. Staff.add/update validates it's
    // within the caller's own org + descendants before writing it.
    data.targetOrgId = document.getElementById('hrStaffOrgId')?.value || '';

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

  // ── Staff Salary (own sub-tab under Payroll) ────────────────────────────────
  // Base Salary, Allowances, and Comp Plan — moved off the Add/Edit Staff form.
  // Existing staff only: no add-new here, matching the requirement that this
  // tab can't create staff records.

  _renderStaffSalaryTable() {
    const tbody = document.getElementById('hrSalaryTableBody');
    if (!tbody) return;
    if (!this._staff.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:24px;">No staff found</td></tr>';
      return;
    }
    const activeProfiles = this._profiles.filter(p => p.status === 'active');
    const profileOpts = selected => '<option value="">No Comp Plan</option>' +
      activeProfiles.map(p => {
        const pid = p.id || p.profileId;
        return `<option value="${pid}" ${pid === selected ? 'selected' : ''}>${this._esc(p.profileName || p.name)}</option>`;
      }).join('');

    const sorted = [...this._staff].sort((a, b) => a.name.localeCompare(b.name));
    tbody.innerHTML = sorted.map(s => `
      <tr data-staff-id="${s.id}">
        <td style="font-weight:500;">${this._esc(s.name)}${s.status !== 'active' ? ' <span class="muted" style="font-size:11px;">(inactive)</span>' : ''}</td>
        <td>${this._esc(s.phone || '—')}</td>
        <td><input type="number" class="sal-salary-input" min="0" step="0.01" value="${s.salary || 0}" style="width:110px;"></td>
        <td><input type="number" class="sal-allow-input" min="0" step="0.01" value="${s.allowance || 0}" style="width:110px;"></td>
        <td><select class="sal-profile-input">${profileOpts(s.profileId)}</select></td>
        <td><button class="action-btn action-btn-edit" onclick="Staff._saveStaffSalaryRow('${s.id}', this)">Save</button></td>
      </tr>
    `).join('');
  },

  async _saveStaffSalaryRow(staffId, btn) {
    const row = document.querySelector(`#hrSalaryTableBody tr[data-staff-id="${staffId}"]`);
    const existing = this._staff.find(s => s.id === staffId);
    if (!row || !existing) return;

    const salary    = parseFloat(row.querySelector('.sal-salary-input').value) || 0;
    const allowance = parseFloat(row.querySelector('.sal-allow-input').value)  || 0;
    const profileId = row.querySelector('.sal-profile-input').value;

    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      // Full-record update — Staff.update() has no partial-update path, so
      // every other field must come along unchanged from the cached record.
      const res = await API.updateStaff({ ...existing, id: staffId, salary, allowance, profileId });
      if (res.status === 'success') {
        existing.salary = salary;
        existing.allowance = allowance;
        existing.profileId = profileId;
        UI.showMessage('staffMessage', 'Salary details updated.', 'success');
      } else {
        UI.showMessage('staffMessage', res.message || 'Error saving salary details', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error saving salary details', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  },

  // ── Advances (own tab) ───────────────────────────────────────────────────────

  _populateAdvStaffDropdown() {
    const sel = document.getElementById('hrAdvStaff');
    if (!sel) return;
    const current = sel.value;
    const sorted = [...this._staff].sort((a, b) => a.name.localeCompare(b.name));
    sel.innerHTML = '<option value="">Select staff</option>' +
      sorted.map(s => `<option value="${s.id}">${this._esc(s.name)}${s.status !== 'active' ? ' (inactive)' : ''}</option>`).join('');
    if (current) sel.value = current;
  },

  async _onAdvStaffChange() {
    const staffId = document.getElementById('hrAdvStaff').value;
    const wrap = document.getElementById('hrAdvLedgerWrap');
    const hint = document.getElementById('hrAdvEmptyHint');
    this._advStaffId = staffId || null;

    if (!staffId) {
      wrap.style.display = 'none';
      hint.style.display = 'block';
      return;
    }
    wrap.style.display = 'block';
    hint.style.display = 'none';
    await this._loadAdvances(staffId);
  },

  async _loadAdvances(staffId) {
    const tbody  = document.getElementById('hrAdvanceTableBody');
    const balEl  = document.getElementById('hrAdvanceBalance');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">Loading…</td></tr>';
    try {
      const res = await API.getAdvances(staffId);
      if (res.status === 'success') {
        const advances = res.advances || [];
        const balance  = res.outstandingBalance || 0;
        balEl.textContent = this._fmt(balance);
        if (!advances.length) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">No advance entries</td></tr>';
          return;
        }
        const statusMap = {
          disbursed: 'background:#c6f6d5;color:#22543d;',
          approved:  'background:#bee3f8;color:#2c5282;',
          pending:   'background:#fefcbf;color:#744210;',
          rejected:  'background:#fed7d7;color:#c53030;'
        };
        // Running balance mirrors the backend's outstandingBalance math: only
        // disbursed rows move the total. Pending/approved/rejected rows still
        // show in the ledger for visibility, but skip the accumulation — this
        // used to add every row regardless of status, which could make the
        // last row's running total disagree with the balance shown above it.
        let running = 0;
        tbody.innerHTML = advances.map(a => {
          const amt = parseFloat(a.amount) || 0;
          const status = a.status || 'disbursed';
          if (status === 'disbursed') running += (a.type === 'repayment' ? -amt : amt);
          const typeStyle = a.type === 'repayment'
            ? 'background:#c6f6d5;color:#22543d;'
            : 'background:#fed7d7;color:#c53030;';
          return `<tr>
            <td style="white-space:nowrap;">${this._fmtDate(a.date)}</td>
            <td><span class="status-badge" style="${typeStyle}">${a.type}</span></td>
            <td style="text-align:right;white-space:nowrap;">${this._fmt(amt)}</td>
            <td>${this._esc(a.notes || '—')}</td>
            <td><span class="status-badge" style="${statusMap[status] || ''}">${status}</span></td>
            <td>${this._esc(a.paymentMode || '—')}</td>
            <td style="text-align:right;white-space:nowrap;font-weight:600;">${this._fmt(running)}</td>
          </tr>`;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#fc8181;">Failed to load advances</td></tr>';
      }
    } catch(err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#fc8181;">Error loading advances</td></tr>';
    }
  },

  async addAdvance() {
    const date        = document.getElementById('hrAdvDate').value;
    const type        = document.getElementById('hrAdvType').value;
    const amount      = parseFloat(document.getElementById('hrAdvAmount').value) || 0;
    const paymentMode = document.getElementById('hrAdvPaymentMode').value;
    const notes       = document.getElementById('hrAdvNotes').value.trim();
    const btn         = document.getElementById('hrAdvSaveBtn');
    const msgEl       = document.getElementById('hrAdvMessage');

    if (!this._advStaffId) { this._showInlineMsg(msgEl, 'Please select a staff member first.', 'error'); return; }
    if (!date)         { this._showInlineMsg(msgEl, 'Please select a date for the advance entry.', 'error'); return; }
    if (amount <= 0)   { this._showInlineMsg(msgEl, 'Amount must be greater than zero.', 'error'); return; }
    if (!paymentMode)  { this._showInlineMsg(msgEl, 'Please select a payment mode.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const res = await API.addAdvance({ staffId: this._advStaffId, date, type, amount, paymentMode, notes });
      if (res.status === 'success') {
        this._showInlineMsg(msgEl, 'Advance entry added.', 'success');
        document.getElementById('hrAdvDate').value         = '';
        document.getElementById('hrAdvAmount').value       = '';
        document.getElementById('hrAdvPaymentMode').value  = '';
        document.getElementById('hrAdvNotes').value        = '';
        await this._loadAdvances(this._advStaffId);
      } else {
        this._showInlineMsg(msgEl, res.message || 'Error adding advance entry', 'error');
      }
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error adding advance entry', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Entry';
    }
  },

  // ─── TAB 2: INCENTIVE PROFILES ───────────────────────────────────────────────

  _renderProfiles() {
    const tbody = document.getElementById('hrProfTableBody');
    if (!this._profiles.length) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#a0aec0;padding:24px;">No comp plans found</td></tr>';
      return;
    }
    tbody.innerHTML = this._profiles.map(p => {
      const pid = p.id || p.profileId;
      const l1  = this._fmtTarget(p.l1Type || p.hrProfL1Type, p.l1Value || p.hrProfL1Value);
      const l2  = this._fmtTarget(p.l2Type || p.hrProfL2Type, p.l2Value || p.hrProfL2Value);
      const brackets = `${p.xPct || p.hrProfXPct || 0}% / ${p.yPct || p.hrProfYPct || 0}% / ${p.zPct || p.hrProfZPct || 0}%`;
      return `<tr>
        <td style="font-weight:500;">${this._esc(p.profileName || p.name)}</td>
        <td>${this._esc(p.profileType || p.type || '—')}</td>
        <td>${this._esc(p.revenueBase || '—')}</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(p.otHourlyRate ?? p.otRate ?? p.hrProfOtRate)}/hr · ${p.otThresholdHours ?? 9}h/day</td>
        <td style="text-align:right;white-space:nowrap;">${p.eligibleOffs ?? 4}/mo</td>
        <td style="text-align:right;white-space:nowrap;">${this._fmt(p.defaultProductIncentive ?? 0)}</td>
        <td style="text-align:right;white-space:nowrap;">${p.flatIncentivePct ?? 0}%</td>
        <td style="white-space:nowrap;">${this._esc(l1)} → ${this._esc(l2)}<span class="kv-sub">${this._esc(brackets)}</span></td>
        <td><span class="status-badge status-${p.status}">${p.status}</span></td>
        <td>${this._esc(this._orgName(p.orgId))}</td>
        <td>
          <button class="action-btn action-btn-edit"   onclick="Staff.openProfForm('${pid}')">Edit</button>
          <button class="action-btn action-btn-delete" onclick="Staff.deleteProfile('${pid}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },

  openProfForm(id) {
    this._profEditingId = id || null;
    document.getElementById('hrProfFormTitle').textContent = id ? 'Edit Comp Plan' : 'Add Comp Plan';
    document.getElementById('hrProfSaveBtn').textContent   = id ? 'Update Comp Plan' : 'Save Comp Plan';
    document.getElementById('hrProfForm').reset();
    let recordOrgId = Auth.currentUser?.orgId || '';

    if (id) {
      const p = this._profiles.find(x => (x.id || x.profileId) === id);
      if (p) {
        document.getElementById('hrProfName').value        = p.profileName || p.name || '';
        document.getElementById('hrProfType').value        = p.profileType || p.type || '';
        document.getElementById('hrProfRevenueBase').value = p.revenueBase     || '';
        document.getElementById('hrProfOtRate').value      = p.otHourlyRate ?? p.otRate ?? p.hrProfOtRate ?? '';
        document.getElementById('hrProfOtThreshold').value = p.otThresholdHours ?? 9;
        document.getElementById('hrProfEligibleOffs').value = p.eligibleOffs ?? 4;
        document.getElementById('hrProfDefaultProductIncentive').value = p.defaultProductIncentive ?? 0;
        document.getElementById('hrProfFlatIncentivePct').value = p.flatIncentivePct ?? 0;
        document.getElementById('hrProfL1Type').value      = p.l1Type || p.hrProfL1Type || '';
        document.getElementById('hrProfL1Value').value     = p.l1Value || p.hrProfL1Value || '';
        document.getElementById('hrProfL2Type').value      = p.l2Type || p.hrProfL2Type || '';
        document.getElementById('hrProfL2Value').value     = p.l2Value || p.hrProfL2Value || '';
        document.getElementById('hrProfXPct').value        = p.xPct || p.hrProfXPct || '';
        document.getElementById('hrProfYPct').value        = p.yPct || p.hrProfYPct || '';
        document.getElementById('hrProfZPct').value        = p.zPct || p.hrProfZPct || '';
        document.getElementById('hrProfStatus').value      = p.status || 'active';
        recordOrgId = p.orgId || recordOrgId;
      }
    }
    const profOrgSel = document.getElementById('hrProfOrgId');
    if (profOrgSel) profOrgSel.value = recordOrgId;

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
      profileName:   document.getElementById('hrProfName').value.trim(),
      profileType:   document.getElementById('hrProfType').value,
      revenueBase:   document.getElementById('hrProfRevenueBase').value,
      otHourlyRate:  parseFloat(document.getElementById('hrProfOtRate').value) || 0,
      otThresholdHours: parseFloat(document.getElementById('hrProfOtThreshold').value) || 9,
      eligibleOffs:  parseInt(document.getElementById('hrProfEligibleOffs').value, 10) || 4,
      defaultProductIncentive: parseFloat(document.getElementById('hrProfDefaultProductIncentive').value) || 0,
      flatIncentivePct: parseFloat(document.getElementById('hrProfFlatIncentivePct').value) || 0,
      l1Type:        document.getElementById('hrProfL1Type').value,
      l1Value:       parseFloat(document.getElementById('hrProfL1Value').value) || 0,
      l2Type:        document.getElementById('hrProfL2Type').value,
      l2Value:       parseFloat(document.getElementById('hrProfL2Value').value) || 0,
      xPct:          parseFloat(document.getElementById('hrProfXPct').value) || 0,
      yPct:          parseFloat(document.getElementById('hrProfYPct').value) || 0,
      zPct:          parseFloat(document.getElementById('hrProfZPct').value) || 0,
      status:        document.getElementById('hrProfStatus').value,
      targetOrgId:   document.getElementById('hrProfOrgId')?.value || ''
    };
    if (this._profEditingId) data.profileId = this._profEditingId;

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = this._profEditingId
        ? await API.updateIncentiveProfile(data)
        : await API.addIncentiveProfile(data);

      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || (this._profEditingId ? 'Comp Plan updated.' : 'Comp Plan added.'), 'success');
        this.closeProfForm();
        await this._loadProfiles();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error saving comp plan', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error saving comp plan', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },

  async deleteProfile(id) {
    if (!confirm('Delete this comp plan? Any staff using it will lose their comp plan assignment.')) return;
    UI.showLoading();
    try {
      const res = await API.deleteIncentiveProfile(id);
      if (res.status === 'success') {
        UI.showMessage('staffMessage', res.message || 'Comp Plan deleted.', 'success');
        await this._loadProfiles();
      } else {
        UI.showMessage('staffMessage', res.message || 'Error deleting comp plan', 'error');
      }
    } catch(err) {
      UI.showMessage('staffMessage', 'Error deleting comp plan', 'error');
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
        <td>${this._esc(this._orgName(s.orgId))}</td>
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
    let recordOrgId = Auth.currentUser?.orgId || '';

    if (id) {
      const s = this._shifts.find(x => (x.id || x.shiftId) === id);
      if (s) {
        document.getElementById('hrShiftName').value   = s.name       || '';
        document.getElementById('hrShiftStart').value  = s.startTime  || s.hrShiftStart  || '';
        document.getElementById('hrShiftEnd').value    = s.endTime    || s.hrShiftEnd    || '';
        document.getElementById('hrShiftStatus').value = s.status     || 'active';
        recordOrgId = s.orgId || recordOrgId;
      }
    }
    const shiftOrgSel = document.getElementById('hrShiftOrgId');
    if (shiftOrgSel) shiftOrgSel.value = recordOrgId;

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
      status:    document.getElementById('hrShiftStatus').value,
      targetOrgId: document.getElementById('hrShiftOrgId')?.value || ''
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
    const msgEl   = document.getElementById('hrAttMessage');

    // Auto-set to current month if nothing selected
    const today = new Date();
    const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (monthEl && !monthEl.value) monthEl.value = currentPeriod;

    const period = monthEl ? monthEl.value : '';
    if (!period) { this._showInlineMsg(msgEl, 'Please select a month.', 'error'); return; }

    const [year, month] = period.split('-').map(Number);
    const fromDate = `${period}-01`;
    const lastDay  = new Date(year, month, 0).getDate();
    const toDate   = `${period}-${String(lastDay).padStart(2, '0')}`;

    // Set week start: if viewing current month (and not navigating), land on current week
    if (!this._keepWeekStart || this._loadedPeriod !== period) {
      if (period === currentPeriod) {
        this._currentWeekStart = this._getMonday(today);
      } else {
        this._currentWeekStart = this._getMonday(new Date(year, month - 1, 1));
      }
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
      const dayCells = days.map((d, i) => {
        const isOff = sched.offDays.includes(d.name) ? 1 : 0;
        return `<td style="text-align:center;padding:5px 4px;">
          <button type="button" id="wpOff-${s.id}-${i}" data-off="${isOff}"
            onclick="Staff._toggleOffDay(this)"
            style="border:none;cursor:pointer;border-radius:50%;width:28px;height:28px;font-size:14px;line-height:28px;padding:0;
              background:${isOff ? '#fed7d7' : '#c6f6d5'};color:${isOff ? '#9b2c2c' : '#276749'};
              font-weight:700;transition:background 0.15s,color 0.15s;">${isOff ? '✗' : '✓'}</button>
        </td>`;
      }).join('');
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

  _toggleOffDay(btn) {
    const isOff = btn.dataset.off === '1' ? 0 : 1;
    btn.dataset.off = String(isOff);
    btn.textContent = isOff ? '✗' : '✓';
    btn.style.background = isOff ? '#fed7d7' : '#c6f6d5';
    btn.style.color       = isOff ? '#9b2c2c' : '#276749';
  },

  async saveWeekSchedule() {
    const weekStart   = this._dateStr(this._currentWeekStart);
    const activeStaff = this._staff.filter(s => s.status === 'active');
    const dayNames    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const msgEl = document.getElementById('wpMsg');

    // Validate: all staff must have a shift selected
    const missing = activeStaff.filter(s => {
      const sel = document.getElementById(`wpShift-${s.id}`);
      return !sel || !sel.value;
    });
    if (missing.length) {
      if (msgEl) {
        msgEl.textContent = `Please select a shift for: ${missing.map(s => s.name).join(', ')}`;
        msgEl.style.color = '#c53030';
      }
      return;
    }

    const entries = activeStaff.map(s => {
      const shiftSel = document.getElementById(`wpShift-${s.id}`);
      const offDays  = dayNames.filter((_, i) => {
        const btn = document.getElementById(`wpOff-${s.id}-${i}`);
        return btn && btn.dataset.off === '1';
      });
      return { staffId: s.id, shiftId: shiftSel ? shiftSel.value : '', offDays: offDays.join(',') };
    });

    const btn = document.getElementById('wpSaveBtn');
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

  openAttModal(staffId, date, mode) {
    const staffMem  = this._staff.find(s => s.id === staffId);
    const staffName = staffMem ? staffMem.name : staffId;
    const rec       = (this._attendance || []).find(a => a.staffId === staffId && a.date === date);

    this._attData = { staffId, date, attendanceId: rec ? (rec.attendanceId || null) : null, mode: mode || 'grid' };

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
        // Reload attendance data so the view panel shows updated values —
        // which view depends on which one opened this modal.
        if (this._attData.mode === 'summary') {
          await this._loadAttSummary();
        } else {
          await this.loadAttendance();
        }
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
  // This page never creates Payroll rows — Quick Entry (Attendance & OT >
  // Quick Entry) does that when attendance is saved for a staff+period. This
  // page only lists whatever rows already exist for the selected month and
  // lets a reviewer edit/reconcile the editable fields, one row at a time.

  async loadPayrollForMonth() {
    const period = document.getElementById('hrPayPeriod').value;
    const tbody  = document.getElementById('hrPayTableBody');
    const msgEl  = document.getElementById('hrPayMessage');
    if (!period) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;">Select a month to load payroll records.</td></tr>'; return; }

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;">Loading…</td></tr>';
    try {
      const res = await API.getPayroll({ period, includeChildren: document.getElementById('hrPayIncludeChildren')?.checked || false });
      if (res.status === 'success') {
        this._payrollRows = res.payroll || [];
        this._renderPayrollTable();
      } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#fc8181;">Failed to load payroll records</td></tr>';
      }
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error loading payroll records', 'error');
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#fc8181;">Error loading payroll records</td></tr>';
    }
  },

  _renderPayrollTable() {
    const tbody = document.getElementById('hrPayTableBody');
    const rows  = this._payrollRows || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;padding:24px;">No payroll records for this month yet — run Quick Entry for a staff member first.</td></tr>';
      return;
    }
    const sorted = [...rows].sort((a, b) => String(a.staffName || '').localeCompare(String(b.staffName || '')));

    tbody.innerHTML = sorted.map(r => `<tr data-payroll-id="${r.payrollId}">
        <td style="font-weight:500;white-space:nowrap;">${this._esc(r.staffName || r.staffId)}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600;">${this._fmt(r.netPay)}</td>
        <td>${this._payrollStatusBadge(r.status)}</td>
        <td>
          <button class="action-btn action-btn-edit" onclick="Staff.openPayrollReview('${r.payrollId}')">Review</button>
        </td>
      </tr>`).join('');
  },

  _payrollStatusBadge(status) {
    const map = {
      draft:    'background:#edf2f7;color:#4a5568;',
      review:   'background:#fefcbf;color:#975a16;',
      approved: 'background:#bee3f8;color:#2c5282;',
      paid:     'background:#c6f6d5;color:#22543d;',
      voided:   'background:#fed7d7;color:#c53030;'
    };
    return `<span class="status-badge" style="${map[status] || ''}">${this._esc(status || 'draft')}</span>`;
  },

  // ── Payroll Review modal ──────────────────────────────────────────────────

  async openPayrollReview(payrollId) {
    const r = (this._payrollRows || []).find(x => x.payrollId === payrollId);
    if (!r) return;
    this._payReviewId = payrollId;
    this._payRevOutstandingBalance = 0;

    document.getElementById('hrPayReviewTitle').textContent = `Payroll Review — ${r.staffName || r.staffId} (${r.period})`;
    document.getElementById('hrPayReviewMsg').innerHTML = '';
    document.getElementById('hrPayRevExplainWrap').style.display = 'none';
    this._renderPayrollReviewReadonly(r);

    document.getElementById('hrPayRevPayableDays').value = r.payableDays ?? '';
    document.getElementById('hrPayRevEligOffs').value     = r.eligibleOffs ?? '';
    document.getElementById('hrPayRevPayUnused').checked  = !!r.payUnusedLeaves;
    document.getElementById('hrPayRevUnusedReason').value = r.unusedLeavesReason || '';
    document.getElementById('hrPayRevNotes').value        = r.notes || '';
    document.getElementById('hrPayRevAdvDeduct').value = '';
    document.getElementById('hrPayRevRemainingBalance').value = '';

    this._updatePayReviewActions(r);
    document.getElementById('hrPayRevAdvOutstanding').textContent = '· Outstanding: —';
    document.getElementById('hrPayReviewModal').style.display = 'flex';

    // Advance model: the ledger is only reconciled when a record is marked
    // PAID, so the base the two fields split depends on status — for a paid
    // record the recorded deduction is already in the ledger (base = live
    // outstanding + that deduction); for anything earlier the ledger is
    // untouched (base = live outstanding alone). Deduction defaults to
    // what's already recorded on the row, or "pay it all off" for a record
    // with no deduction yet.
    const rowDeducted = Number(r.advanceDeducted) || 0;
    const ledgerReconciled = r.status === 'paid';
    try {
      const advRes = await API.getAdvances(r.staffId);
      if (this._payReviewId !== payrollId) return; // user opened another record meanwhile
      const live = advRes.status === 'success' ? (advRes.outstandingBalance || 0) : 0;
      this._payRevAdvanceBase = live + (ledgerReconciled ? rowDeducted : 0);
    } catch (e) {
      if (this._payReviewId !== payrollId) return;
      // Balance unavailable — fall back to just the recorded deduction so a
      // Calculate can't over- or under-deduct based on a number we never got.
      this._payRevAdvanceBase = rowDeducted;
    }
    document.getElementById('hrPayRevAdvOutstanding').textContent = `· Outstanding: ${this._fmt(this._payRevAdvanceBase)}`;
    const deduct = rowDeducted > 0 ? rowDeducted : this._payRevAdvanceBase;
    document.getElementById('hrPayRevAdvDeduct').value = deduct;
    document.getElementById('hrPayRevRemainingBalance').value = Math.round((this._payRevAdvanceBase - deduct) * 100) / 100;
  },

  // Workflow-driven button visibility + field locking. The status flow is
  // draft → review → approved → paid, with Back walking one step backwards
  // and Void available from any non-draft state. Figures are editable ONLY
  // in review — the only status with a save button (Calculate & Save).
  _updatePayReviewActions(r) {
    const status = r.status || 'draft';
    this._setPayReviewLock(status !== 'review');

    document.getElementById('hrPayRevStatusBadge').innerHTML = this._payrollStatusBadge(status);

    const show = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
    show('hrPayRevSendReviewBtn', status === 'draft');
    show('hrPayRevCalcBtn',       status === 'review');
    show('hrPayRevApproveBtn',    status === 'review');
    show('hrPayRevMarkPaidBtn',   status === 'approved');
    show('hrPayRevBackBtn',       ['review', 'approved', 'paid'].includes(status));
    show('hrPayRevVoidBtn',       ['review', 'approved', 'paid'].includes(status));

    const payBtn = document.getElementById('hrPayRevPayBtn');
    const staffMem = (this._staff || []).find(s => s.id === r.staffId);
    const upiId = staffMem ? String(staffMem.upiId || '').trim() : '';
    if (status === 'approved') {
      const payable = (Number(r.netPay) || 0) > 0;
      payBtn.style.display = '';
      payBtn.disabled = !upiId || !payable;
      payBtn.title = !upiId ? 'No UPI ID on file for this staff member'
        : !payable ? 'Net Payable must be greater than zero'
        : 'Opens your UPI app (mobile only)';
    } else {
      payBtn.style.display = 'none';
    }
  },

  // Status-only transition — deliberately does NOT save pending form edits
  // (Calculate & Save is the only save path). Marking paid additionally
  // sends the SAVED row's remaining balance so the advance ledger reconciles
  // from what was signed off, never from unsaved edits on screen.
  async _payrollStatusTransition(newStatus) {
    const payrollId = this._payReviewId;
    const r = (this._payrollRows || []).find(x => x.payrollId === payrollId);
    if (!r) return;
    const msgEl = document.getElementById('hrPayReviewMsg');

    const data = { payrollId, status: newStatus };
    if (newStatus === 'paid') {
      const rowDeducted = Number(r.advanceDeducted) || 0;
      data.remainingBalance = Math.round(((this._payRevAdvanceBase || 0) - rowDeducted) * 100) / 100;
    }

    try {
      const res = await API.updatePayrollRow(data);
      if (res.status === 'success' && res.payroll) {
        const row = res.payroll;
        const idx = (this._payrollRows || []).findIndex(x => x.payrollId === payrollId);
        if (idx >= 0) this._payrollRows[idx] = row;
        this._renderPayrollReviewReadonly(row);
        this._updatePayReviewActions(row);
        this._renderPayrollTable();
        this._showInlineMsg(msgEl, `Status changed to ${row.status}.`, 'success');
      } else {
        this._showInlineMsg(msgEl, res.message || 'Error changing status', 'error');
      }
    } catch (err) {
      this._showInlineMsg(msgEl, 'Network error changing status', 'error');
    }
  },

  _payrollStatusBack() {
    const r = (this._payrollRows || []).find(x => x.payrollId === this._payReviewId);
    if (!r) return;
    const prev = { review: 'draft', approved: 'review', paid: 'approved' }[r.status];
    if (prev) this._payrollStatusTransition(prev);
  },

  // A paid record is final — the server rejects numeric edits, so gray the
  // inputs out rather than letting the user edit and then fail on save.
  // Status and Notes stay editable (voiding a paid record is allowed).
  _setPayReviewLock(locked) {
    ['hrPayRevPayableDays', 'hrPayRevEligOffs', 'hrPayRevAdvDeduct', 'hrPayRevRemainingBalance',
     'hrPayRevPayUnused', 'hrPayRevUnusedReason']
      .forEach(id => { document.getElementById(id).disabled = locked; });
  },

  // Deduction and Remaining Balance always sum to the advance base (live
  // outstanding + the row's already-recorded deduction) snapshotted when the
  // modal opened or last saved — editing one live-updates the other.
  _syncAdvanceFields(source) {
    const base = this._payRevAdvanceBase || 0;
    const deductEl = document.getElementById('hrPayRevAdvDeduct');
    const remainEl = document.getElementById('hrPayRevRemainingBalance');
    if (source === 'deduct') {
      const deduct = parseFloat(deductEl.value) || 0;
      remainEl.value = Math.round((base - deduct) * 100) / 100;
    } else {
      const remain = parseFloat(remainEl.value) || 0;
      deductEl.value = Math.round((base - remain) * 100) / 100;
    }
  },

  // Leave Allowance recalculates live in the browser as Eligible Offs or
  // Payable Days change — mirrors the exact server formula so what's shown
  // here matches what Calculate will persist, without waiting for a round trip.
  _recalcLeaveAllowancePreview() {
    const r = (this._payrollRows || []).find(x => x.payrollId === this._payReviewId);
    if (!r) return;
    const payableDays = parseFloat(document.getElementById('hrPayRevPayableDays').value) || 0;
    const eligibleOffs = parseFloat(document.getElementById('hrPayRevEligOffs').value) || 0;
    const excessLeaves = Math.max(0, (r.totalDaysOff || 0) - eligibleOffs);
    const leaveDeduction = payableDays > 0 ? excessLeaves * (r.baseSalary / payableDays) : 0;
    document.getElementById('hrPayRevLeaveDeduct').textContent = this._fmt(leaveDeduction);

    // Unused Leave Pay previews live too — same server formula: unused offs
    // × (base salary ÷ calendar days of the month).
    const [pyr, pmo] = String(r.period || '').split('-').map(Number);
    const calDays = (pyr && pmo) ? new Date(pyr, pmo, 0).getDate() : 30;
    const unusedOffs = Math.max(0, eligibleOffs - (r.totalDaysOff || 0));
    const paysUnused = document.getElementById('hrPayRevPayUnused').checked;
    const unusedLeavePay = paysUnused && calDays > 0 ? unusedOffs * (r.baseSalary / calDays) : 0;
    document.getElementById('hrPayRevUnusedLeavePay').textContent = this._fmt(unusedLeavePay);
  },

  _renderPayrollReviewReadonly(r) {
    document.getElementById('hrPayRevSalary').textContent = this._fmt((r.baseSalary || 0) + (r.allowances || 0));

    // Show the actual absence dates (as day-of-month numbers, since the
    // month is already in the modal title), with the count alongside.
    const absCell = (id, dateList) => {
      const dates = (dateList || '').split(',').filter(Boolean);
      const el = document.getElementById(id);
      if (!dates.length) { el.textContent = '—'; return; }
      const days = dates.map(d => Number(d.slice(8, 10))).sort((a, b) => a - b).join(', ');
      el.innerHTML = `${dates.length}<span class="kv-sub">${days}</span>`;
    };
    absCell('hrPayRevWdFull', r.weekdayAbsentDates);
    absCell('hrPayRevWdHalf', r.weekdayHalfDayDates);
    absCell('hrPayRevWeFull', r.weekendAbsentDates);
    absCell('hrPayRevWeHalf', r.weekendHalfDayDates);
    document.getElementById('hrPayRevDaysOff').textContent = r.totalDaysOff ?? 0;

    const [yr, mo] = String(r.period || '').split('-').map(Number);
    document.getElementById('hrPayRevWorkingDays').textContent = (yr && mo) ? new Date(yr, mo, 0).getDate() : '—';

    document.getElementById('hrPayRevLeaveDeduct').textContent = this._fmt(r.leaveDeduction);
    document.getElementById('hrPayRevUnusedLeavePay').textContent = this._fmt(r.unusedLeavePay);

    document.getElementById('hrPayRevOt').textContent = `${r.otHours ?? 0}h / ${this._fmt(r.otPay)}`;
    document.getElementById('hrPayRevSvcValueDisplay').textContent = this._fmt(r.serviceIncentive);
    document.getElementById('hrPayRevServiceIncentive').textContent = this._fmt(r.targetIncentive);
    // Make Up Value only has a single revenue figure to show when it was a
    // manual entry — the bill-scanned path sums (line revenue x pct) per
    // Flat-mode Service Group independently, so there's no one number to
    // display as "the" revenue used in that case.
    document.getElementById('hrPayRevMakeupValueDisplay').textContent =
      (r.makeupValue !== '' && r.makeupValue != null) ? this._fmt(r.makeupValue) : '— (from billing)';
    document.getElementById('hrPayRevMakeupIncentive').textContent = this._fmt(r.makeupIncentive);
    document.getElementById('hrPayRevProdCountDisplay').textContent = (r.productCount !== '' && r.productCount != null) ? r.productCount : '—';
    document.getElementById('hrPayRevProductsIncentive').textContent = this._fmt(r.productIncentive);

    document.getElementById('hrPayRevTipsDisplay').textContent =
      (r.tipsOverride !== '' && r.tipsOverride != null) ? this._fmt(r.tipsOverride) : '—';

    document.getElementById('hrPayRevNetPay').textContent = this._fmt(r.netPay);
  },

  // Shows the exact formula + real numbers behind one of the read-only
  // calculated fields, using whatever is currently in this._payrollRows for
  // the record being reviewed (i.e. as of the last load/Calculate, not
  // necessarily reflecting unsaved edits still sitting in the input fields).
  _showCalcExplanation(field) {
    const r = (this._payrollRows || []).find(x => x.payrollId === this._payReviewId);
    const wrap = document.getElementById('hrPayRevExplainWrap');
    const textEl = document.getElementById('hrPayRevExplainText');
    if (!r || !wrap || !textEl) return;
    textEl.textContent = this._buildCalcExplanation(field, r);
    wrap.style.display = 'block';
    // The explain box sits at the top of the modal — a "?" clicked further
    // down would otherwise show nothing visible on screen.
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _buildCalcExplanation(field, r) {
    const staff = (this._staff || []).find(s => s.id === r.staffId);
    const profile = staff ? (this._profiles || []).find(p => (p.id || p.profileId) === staff.profileId) : null;
    const fmt = n => this._fmt(n || 0);

    switch (field) {
      case 'base':
        return `Base Salary and Allowances are set directly on the Staff Salary tab for ${r.staffName || r.staffId}.\n\n`
          + `Salary = Base Salary (${fmt(r.baseSalary)}) + Allowances (${fmt(r.allowances)}) = ${fmt((r.baseSalary || 0) + (r.allowances || 0))}`;

      case 'workingDays': {
        const [yr, mo] = String(r.period || '').split('-').map(Number);
        const days = (yr && mo) ? new Date(yr, mo, 0).getDate() : 0;
        return `Working Days is simply the number of calendar days in ${r.period || 'the selected month'}.\n\nWorking Days = ${days}`;
      }

      case 'daysOff': {
        const wdAbsent = (r.weekdayAbsentDates || '').split(',').filter(Boolean);
        const weAbsent = (r.weekendAbsentDates || '').split(',').filter(Boolean);
        const wdHalf   = (r.weekdayHalfDayDates || '').split(',').filter(Boolean);
        const weHalf   = (r.weekendHalfDayDates || '').split(',').filter(Boolean);
        const list = (arr) => arr.length ? arr.join(', ') : 'none';
        return `Only days explicitly marked 'absent' or 'half-day' count — a day with no attendance record is assumed present (9 hours, no OT).\n\n`
          + `Weekday absences (Mon–Thu), 1 day each: ${wdAbsent.length} — ${list(wdAbsent)}\n`
          + `Weekend absences (Fri/Sat/Sun), 2 days each: ${weAbsent.length} — ${list(weAbsent)}\n`
          + `Weekday half-days (Mon–Thu), 0.5 day each: ${wdHalf.length} — ${list(wdHalf)}\n`
          + `Weekend half-days (Fri/Sat/Sun), 1 day each: ${weHalf.length} — ${list(weHalf)}\n\n`
          + `Calculated Days of Absence = ${wdAbsent.length} + (${weAbsent.length} × 2) + (${wdHalf.length} × 0.5) + (${weHalf.length} × 1) = ${r.totalDaysOff}`;
      }

      case 'leaveDeduct': {
        const excess = Math.max(0, (r.totalDaysOff || 0) - (r.eligibleOffs || 0));
        const perDay = r.payableDays ? r.baseSalary / r.payableDays : 0;
        return `Excess Leaves = max(0, Days Off (${r.totalDaysOff}) − Eligible Offs (${r.eligibleOffs})) = ${excess}\n`
          + `Per-day rate = Base Salary (${fmt(r.baseSalary)}) ÷ Payable Days (${r.payableDays}) = ${fmt(perDay)}\n\n`
          + `Leave Deduction = ${excess} × ${fmt(perDay)} = ${fmt(r.leaveDeduction)}`;
      }

      case 'unusedLeavePay': {
        const [uyr, umo] = String(r.period || '').split('-').map(Number);
        const calDays = (uyr && umo) ? new Date(uyr, umo, 0).getDate() : 30;
        const unused = Math.max(0, (r.eligibleOffs || 0) - (r.totalDaysOff || 0));
        if (!r.payUnusedLeaves) {
          return `"Approve Unused Leave Allowance" is not ticked for this record, so Unused Leave Pay = 0.\n\n`
            + `If ticked, it would pay Unused Offs (max(0, Eligible Offs (${r.eligibleOffs}) − Days Off (${r.totalDaysOff})) = ${unused}) `
            + `× Base Salary (${fmt(r.baseSalary)}) ÷ Calendar Days (${calDays}).`;
        }
        return `The manager attested this staff member skipped eligible offs on instruction`
          + (r.unusedLeavesReason ? ` — "${r.unusedLeavesReason}"` : '') + `.\n\n`
          + `Unused Offs = max(0, Eligible Offs (${r.eligibleOffs}) − Days Off (${r.totalDaysOff})) = ${unused}\n`
          + `Per-day rate = Base Salary (${fmt(r.baseSalary)}) ÷ Calendar Days (${calDays}) = ${fmt(calDays > 0 ? r.baseSalary / calDays : 0)}\n\n`
          + `Unused Leave Pay = ${unused} × ${fmt(calDays > 0 ? r.baseSalary / calDays : 0)} = ${fmt(r.unusedLeavePay)}`;
      }

      case 'ot': {
        const rate = r.otHours > 0 ? r.otPay / r.otHours : (profile ? profile.otHourlyRate : 0);
        return `OT Hours are hours worked beyond the Comp Plan's OT threshold each day.\n\n`
          + `OT Pay = OT Hours (${r.otHours}) × OT Hourly Rate (${fmt(rate)}/hr${profile ? ', from Comp Plan' : ''})\n= ${fmt(r.otPay)}`;
      }

      case 'serviceIncentive': {
        const revenue = r.serviceIncentive || 0;
        let targetExplain = 'No Comp Plan found for this staff member — Service Incentive = 0.';
        if (profile) {
          const L1 = profile.l1Type === 'salary_pct' ? r.baseSalary * profile.l1Value / 100 : profile.l1Value;
          const L2 = profile.l2Type === 'salary_pct' ? r.baseSalary * profile.l2Value / 100 : profile.l2Value;
          if (revenue < L1) {
            targetExplain = `Service Value (${fmt(revenue)}) is below L1 (${fmt(L1)}) → Service Incentive = 0`;
          } else if (revenue < L2) {
            targetExplain = `Service Value (${fmt(revenue)}) is between L1 (${fmt(L1)}) and L2 (${fmt(L2)}):\n`
              + `L1 × X% (${profile.xPct}%) + (Service Value − L1) × Y% (${profile.yPct}%)\n`
              + `= ${fmt(L1 * profile.xPct / 100)} + ${fmt((revenue - L1) * profile.yPct / 100)} = ${fmt(r.targetIncentive)}`;
          } else {
            targetExplain = `Service Value (${fmt(revenue)}) is above L2 (${fmt(L2)}):\n`
              + `L1 × X% + (L2 − L1) × Y% + (Service Value − L2) × Z% (${profile.zPct}%)\n`
              + `= ${fmt(L1 * profile.xPct / 100)} + ${fmt((L2 - L1) * profile.yPct / 100)} + ${fmt((revenue - L2) * profile.zPct / 100)} = ${fmt(r.targetIncentive)}`;
          }
        }
        return targetExplain;
      }

      case 'makeupIncentive': {
        if (r.makeupValue !== '' && r.makeupValue != null) {
          const flatPct = profile ? (profile.flatIncentivePct || 0) : 0;
          return `Make Up Value is a manually entered REVENUE figure, same as Service Value — not a final amount.\n`
            + `Make Up Incentive = Make Up Value (${fmt(r.makeupValue)}) × Comp Plan Flat Incentive % (${flatPct}%)\n`
            + `= ${fmt(r.makeupIncentive)}`;
        }
        return `Make Up Incentive: sum of (line revenue × applicable flat %) across Flat-mode Service Groups this staff member billed — `
          + `each group uses its own override % if set, else the Comp Plan's Flat Incentive %.\n= ${fmt(r.makeupIncentive)}`;
      }

      case 'productsIncentive': {
        const rate = profile ? (profile.defaultProductIncentive || 0) : 0;
        const count = (r.productCount !== '' && r.productCount != null) ? r.productCount : 0;
        return `Product Count is a manual entry with no specific Product Group to pull a per-unit rate from, so it always uses the Comp Plan's Default Product Incentive rate.\n\n`
          + `Products Incentive = Product Count (${count}) × Default Product Incentive (${fmt(rate)}/unit) = ${fmt(r.productIncentive)}`;
      }

      case 'netPay':
        return `Net Payable = Salary (${fmt((r.baseSalary || 0) + (r.allowances || 0))}) − Leave Deduction (${fmt(r.leaveDeduction)}) + OT Pay (${fmt(r.otPay)})\n`
          + `  + Incentives (${fmt(r.totalIncentive)}) + Tips (${fmt(r.tipsOverride)}) + Unused Leave Pay (${fmt(r.unusedLeavePay)}) − Advance Deducted (${fmt(r.advanceDeducted)})\n`
          + `= ${fmt(r.netPay)}`;

      default:
        return '';
    }
  },

  closePayrollReview() {
    document.getElementById('hrPayReviewModal').style.display = 'none';
    document.getElementById('hrPayRevExplainWrap').style.display = 'none';
    this._payReviewId = null;
  },

  // 'YYYY-MM' → 'June 2026'
  _periodLabel(period) {
    const [yr, mo] = String(period || '').split('-').map(Number);
    if (!yr || !mo) return String(period || '');
    return new Date(yr, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  },

  // Opens the phone's UPI app with payee, amount, and note pre-filled — the
  // user reviews and completes the payment inside the UPI app; nothing is
  // paid automatically. Only reachable for APPROVED records with a UPI ID
  // on file (_updatePayReviewActions gates the button).
  payViaUpi() {
    const r = (this._payrollRows || []).find(x => x.payrollId === this._payReviewId);
    if (!r) return;
    const staffMem = (this._staff || []).find(s => s.id === r.staffId);
    const upiId = staffMem ? String(staffMem.upiId || '').trim() : '';
    const netPay = Math.round((Number(r.netPay) || 0) * 100) / 100;
    if (!upiId || netPay <= 0) return;

    const caption = `${r.staffName || ''} ${this._periodLabel(r.period)} Salary`.trim();
    window.location.href = `upi://pay?pa=${encodeURIComponent(upiId)}`
      + `&pn=${encodeURIComponent(r.staffName || 'Staff')}`
      + `&am=${netPay.toFixed(2)}&cu=INR`
      + `&tn=${encodeURIComponent(caption)}`;
  },

  // Renders a clean fixed-width payslip offscreen and downloads it as a PNG.
  // html2canvas is loaded lazily from CDN on first use — the app itself
  // stays dependency-free for everyone who never downloads a payslip.
  async downloadPayslip() {
    const r = (this._payrollRows || []).find(x => x.payrollId === this._payReviewId);
    if (!r) return;
    const btn = document.getElementById('hrPayRevDownloadBtn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Preparing…';
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('html2canvas failed to load'));
          document.head.appendChild(s);
        });
      }
      const node = this._buildPayslipNode(r);
      document.body.appendChild(node);
      try {
        const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `Payslip-${String(r.staffName || r.staffId).replace(/\s+/g, '')}-${r.period}.png`;
        a.click();
      } finally {
        node.remove();
      }
    } catch (e) {
      this._showInlineMsg(document.getElementById('hrPayReviewMsg'),
        'Could not generate the payslip image — check your internet connection and try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  },

  _buildPayslipNode(r) {
    const esc = s => this._esc(s);
    const fmt = n => this._fmt(n || 0);
    const row = (label, value, opts = {}) =>
      `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #edf2f7;font-size:14px;">
        <span style="color:${opts.bold ? '#2d3748;font-weight:700' : '#718096'};">${label}</span>
        <span style="font-weight:${opts.bold ? 700 : 600};color:${opts.negative ? '#c53030' : '#2d3748'};">${opts.negative ? '− ' : ''}${value}</span>
      </div>`;

    const node = document.createElement('div');
    node.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;background:#ffffff;padding:36px;font-family:Segoe UI,Arial,sans-serif;color:#2d3748;';
    node.innerHTML = `
      <div style="border-bottom:3px solid #667eea;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:baseline;">
        <div>
          <div style="font-size:22px;font-weight:700;">${esc(this._orgName(r.orgId) || 'Salon Manager')}</div>
          <div style="font-size:13px;color:#718096;margin-top:2px;">Payslip — ${esc(this._periodLabel(r.period))}</div>
        </div>
        <div style="font-size:16px;font-weight:700;">${esc(r.staffName || r.staffId)}</div>
      </div>

      <div style="font-size:12px;color:#718096;margin-bottom:14px;">
        Payable Days: <b style="color:#2d3748;">${r.payableDays ?? '—'}</b> ·
        Days of Absence: <b style="color:#2d3748;">${r.totalDaysOff ?? 0}</b> ·
        Eligible Offs: <b style="color:#2d3748;">${r.eligibleOffs ?? 0}</b>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#4a5568;margin:14px 0 4px;">Earnings</div>
      ${row('Base Salary', fmt(r.baseSalary))}
      ${row('Allowances', fmt(r.allowances))}
      ${row(`Overtime (${r.otHours ?? 0}h)`, fmt(r.otPay))}
      ${row('Service Incentive', fmt(r.targetIncentive))}
      ${row('Make Up Incentive', fmt(r.makeupIncentive))}
      ${row('Products Incentive', fmt(r.productIncentive))}
      ${row('Tips', fmt(r.tipsOverride))}
      ${(Number(r.unusedLeavePay) || 0) > 0 ? row('Unused Leave Pay', fmt(r.unusedLeavePay)) : ''}

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#4a5568;margin:14px 0 4px;">Deductions</div>
      ${row('Leave Deduction', fmt(r.leaveDeduction), { negative: true })}
      ${row('Advance Deducted', fmt(r.advanceDeducted), { negative: true })}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:3px solid #667eea;">
        <span style="font-size:16px;font-weight:700;">Net Payable</span>
        <span style="font-size:24px;font-weight:700;color:#667eea;">${fmt(r.netPay)}</span>
      </div>

      <div style="font-size:11px;color:#a0aec0;margin-top:18px;">Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Status: ${esc(r.status || 'draft')}</div>
    `;
    return node;
  },

  async calculatePayrollReview() {
    const payrollId = this._payReviewId;
    if (!payrollId) return;
    const msgEl = document.getElementById('hrPayReviewMsg');

    const val = id => {
      const el = document.getElementById(id);
      if (!el) return undefined;
      const raw = el.value.trim();
      return raw === '' ? '' : (parseFloat(raw) || 0);
    };

    // Service Value, Make Up Value, Product Count, and Tips are no longer
    // editable from this modal (Quick Entry owns them) — deliberately
    // omitted here so update_payroll_row falls back to preserving whatever
    // is already on the row, rather than being sent as blanks and clearing them.
    // Status is deliberately NOT sent — Calculate & Save only exists in
    // review status, and transitions happen via the workflow buttons.
    const data = {
      payrollId,
      payableDays:      val('hrPayRevPayableDays'),
      eligibleOffs:     val('hrPayRevEligOffs'),
      advanceDeducted:  val('hrPayRevAdvDeduct'),
      remainingBalance: val('hrPayRevRemainingBalance'),
      payUnusedLeaves:  document.getElementById('hrPayRevPayUnused').checked,
      unusedLeavesReason: document.getElementById('hrPayRevUnusedReason').value.trim(),
      notes:  document.getElementById('hrPayRevNotes').value.trim()
    };

    const btn = document.getElementById('hrPayRevCalcBtn');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Calculating…';

    try {
      const res = await API.updatePayrollRow(data);
      if (res.status === 'success' && res.payroll) {
        const row = res.payroll;
        const idx = (this._payrollRows || []).findIndex(x => x.payrollId === payrollId);
        if (idx >= 0) this._payrollRows[idx] = row;
        this._renderPayrollReviewReadonly(row);
        this._updatePayReviewActions(row);
        document.getElementById('hrPayRevExplainWrap').style.display = 'none';
        this._renderPayrollTable();
        if (isPaid && row.status === 'voided') {
          this._showInlineMsg(msgEl, 'Voided. Note: the advance repayment recorded when this was paid has NOT been reversed — add a manual entry on the Advances tab if needed.', 'warning');
        } else if (row.status === 'paid') {
          this._showInlineMsg(msgEl, 'Saved and marked paid — the advance ledger has been reconciled.', 'success');
        } else {
          this._showInlineMsg(msgEl, 'Recalculated and saved.', 'success');
        }

        // The ledger may have changed — rebuild the advance base from the
        // saved row + fresh balance so a repeat Calculate is a no-op instead
        // of re-deducting or wiping the recorded deduction.
        const rowDeducted = Number(row.advanceDeducted) || 0;
        try {
          const advRes = await API.getAdvances(row.staffId);
          if (this._payReviewId !== payrollId) return;
          const live = advRes.status === 'success' ? (advRes.outstandingBalance || 0) : 0;
          this._payRevAdvanceBase = live + (row.status === 'paid' ? rowDeducted : 0);
        } catch (e) {
          if (this._payReviewId !== payrollId) return;
          this._payRevAdvanceBase = rowDeducted;
        }
        document.getElementById('hrPayRevAdvOutstanding').textContent = `· Outstanding: ${this._fmt(this._payRevAdvanceBase)}`;
        document.getElementById('hrPayRevAdvDeduct').value = rowDeducted;
        document.getElementById('hrPayRevRemainingBalance').value = Math.round((this._payRevAdvanceBase - rowDeducted) * 100) / 100;
      } else {
        this._showInlineMsg(msgEl, res.message || 'Error calculating payroll', 'error');
      }
    } catch(err) {
      this._showInlineMsg(msgEl, 'Network error calculating payroll', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },

  _switchPaySubTab(subtab) {
    document.querySelectorAll('#prod-tab-hr-payroll .sub-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.subtab === subtab));
    document.querySelectorAll('#prod-tab-hr-payroll .sub-tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'sub-tab-' + subtab));
    if (subtab === 'hr-pay-salary') this._renderStaffSalaryTable();
  },

  // ─── TAB: QUICK ENTRY ────────────────────────────────────────────────────────
  // A month-first grid across every active staff member, sourced from that
  // staff's payroll row for the month (blank where none exists yet) — even
  // for a role with Quick Entry access but no Payroll tab access, since
  // get_payroll_summary is gated on staff:hr-quickentry alone. Clicking
  // Update opens the same single-staff calendar + overrides editor as
  // before, now in a modal instead of being the tab's whole content.

  async loadQuickEntryGrid() {
    const period = document.getElementById('hrQeMonth').value;
    const tbody  = document.getElementById('hrQeTableBody');
    const msgEl  = document.getElementById('hrQeMessage');
    if (!period) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a0aec0;">Select a month to load.</td></tr>'; return; }

    this._quickEntryPeriod = period;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a0aec0;">Loading…</td></tr>';

    try {
      const res = await API.getPayrollSummary({ period });
      const summaryByStaffId = {};
      (res.status === 'success' ? (res.summary || []) : []).forEach(s => { summaryByStaffId[s.staffId] = s; });
      this._quickEntrySummary = summaryByStaffId;
      this._renderQuickEntryGrid();
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error loading payroll summary', 'error');
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#fc8181;">Error loading payroll summary</td></tr>';
    }
  },

  _renderQuickEntryGrid() {
    const tbody = document.getElementById('hrQeTableBody');
    const active = (this._staff || []).filter(s => s.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!active.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a0aec0;padding:24px;">No active staff found.</td></tr>';
      return;
    }

    const dash = v => (v === '' || v === null || v === undefined) ? '—' : v;
    tbody.innerHTML = active.map(s => {
      const r = this._quickEntrySummary[s.id];
      return `<tr>
        <td style="font-weight:500;white-space:nowrap;">${this._esc(s.name)}</td>
        <td style="text-align:right;">${r ? r.weekdayAbsence : '—'}</td>
        <td style="text-align:right;">${r ? r.weekendAbsence : '—'}</td>
        <td style="text-align:right;">${r ? r.otHours : '—'}</td>
        <td style="text-align:right;">${r ? dash(r.serviceValue) : '—'}</td>
        <td style="text-align:right;">${r ? dash(r.makeupValue) : '—'}</td>
        <td style="text-align:right;">${r ? dash(r.productCount) : '—'}</td>
        <td style="text-align:right;">${r ? dash(r.tipsOverride) : '—'}</td>
        <td><button class="action-btn action-btn-edit" onclick="Staff.openQuickEntryUpdate('${s.id}')">Update</button></td>
      </tr>`;
    }).join('');
  },

  openQuickEntryUpdate(staffId) {
    const staff = (this._staff || []).find(s => s.id === staffId);
    const period = this._quickEntryPeriod;
    if (!staff || !period) return;

    this._attSumStaffId = staffId;
    this._attSumPeriod  = period;
    document.getElementById('hrAttSumModalTitle').textContent = `Quick Entry — ${staff.name} (${period})`;
    document.getElementById('hrAttSumMessage').innerHTML = '';
    document.getElementById('hrAttSumCalWrap').innerHTML = '<p class="muted" style="text-align:center;padding:24px;">Loading…</p>';
    document.getElementById('hrQeModal').style.display = 'flex';
    this._loadAttSummary();
  },

  closeQuickEntryModal() {
    document.getElementById('hrQeModal').style.display = 'none';
    this._attSumStaffId = null;
    this._attSumPeriod  = null;
  },

  async _loadAttSummary() {
    const staffId = this._attSumStaffId;
    const period  = this._attSumPeriod;
    const msgEl   = document.getElementById('hrAttSumMessage');
    if (!staffId || !period) return;

    const [year, month] = period.split('-').map(Number);
    const fromDate = `${period}-01`;
    const lastDay  = new Date(year, month, 0).getDate();
    const toDate   = `${period}-${String(lastDay).padStart(2, '0')}`;

    try {
      const [attRes, ovrRes] = await Promise.all([
        API.getAttendance({ fromDate, toDate }),
        // Gated on staff:hr-quickentry alone (not staff:hr-payroll) — a
        // Quick-Entry-only role can still see/re-enter these values.
        API.getPayrollOverrides({ staffId, period }).catch(() => ({ status: 'error' }))
      ]);
      this._attendance = attRes.status === 'success' ? (attRes.attendance || []) : [];
      this._attSumOverrides = ovrRes.status === 'success' ? ovrRes : { found: false };
      this._renderAttSummaryCalendar();
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error loading attendance data', 'error');
    }
  },

  _renderAttSummaryCalendar() {
    const wrap    = document.getElementById('hrAttSumCalWrap');
    const stats   = document.getElementById('hrAttSumStats');
    const saveWrap = document.getElementById('hrAttSumSaveWrap');
    const staffId = this._attSumStaffId;
    const period  = this._attSumPeriod;
    if (!staffId || !period) return;

    const [year, month] = period.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDow    = new Date(year, month - 1, 1).getDay(); // 0=Sun..6=Sat

    const statusCfg = {
      present:    { abbr: 'Present',  bg: '#c6f6d5', color: '#276749' },
      absent:     { abbr: 'Absent',   bg: '#fed7d7', color: '#9b2c2c' },
      'half-day': { abbr: 'Half-day', bg: '#fefcbf', color: '#975a16' }
    };

    this._attSumOriginal = {}; // dateStr -> { dayStatus, otHours } for editable (unclocked) days only

    // Fri/Sat/Sun — same weekend definition the Attendance tab's week grid
    // uses (isWeekendDay there), highlighted in red here per request.
    const isWeekendDow = dow => dow === 0 || dow === 5 || dow === 6;

    const dowHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      .map((d, dow) => `<div class="att-cal-dow${isWeekendDow(dow) ? ' weekend' : ''}">${d}</div>`).join('');

    const emptyCells = Array.from({ length: firstDow }, () => '<div class="att-cal-day empty"></div>').join('');

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${period}-${String(day).padStart(2, '0')}`;
      const dow = new Date(year, month - 1, day).getDay();
      const isWeekend = isWeekendDow(dow);
      const weekendClass = isWeekend ? ' weekend' : '';
      const rec = (this._attendance || []).find(a => a.staffId === staffId && a.date === dateStr);
      const hasClockData = !!(rec && (rec.clockIn || rec.clockOut));

      if (hasClockData) {
        const st  = rec.dayStatus || 'present';
        const cfg = statusCfg[st] || { abbr: st, bg: '#edf2f7', color: '#4a5568' };
        const ot  = parseFloat(rec.otHours) || 0;
        const otHtml = ot > 0 ? `<div class="att-cal-ot">+${ot.toFixed(1)}h OT</div>` : '';
        // data-status/data-ot let _recalcAttSumStats() read locked cells the
        // same way it reads editable ones, for a single live-recompute path.
        return `<div class="att-cal-day locked${weekendClass}" style="background:${cfg.bg};" data-status="${st}" data-ot="${ot}"
          onclick="Staff.openAttModal('${staffId}','${dateStr}','summary')" title="Clocked ${rec.clockIn || '?'}–${rec.clockOut || '?'} — click to view/edit">
          <div class="att-cal-daynum">${day}</div>
          <div class="att-cal-status" style="color:${cfg.color};">${cfg.abbr}</div>
          ${otHtml}
        </div>`;
      }

      // Editable: no clock-in/out on record — may still have a prior manual
      // status/OT entry (rec exists but hasClockData is false), or nothing at all.
      const status  = rec ? (rec.dayStatus || 'present') : 'present';
      const otHours = rec ? (parseFloat(rec.otHours) || 0) : 0;
      this._attSumOriginal[dateStr] = { dayStatus: status, otHours };

      // Shade to match the selected status, same colors as locked cells —
      // updates live via _onAttSumStatusChange as the dropdown is changed.
      const editableBg = status === 'absent' ? statusCfg.absent.bg
        : status === 'half-day' ? statusCfg['half-day'].bg
        : '#f7fafc';

      const opt = (val, label) => `<option value="${val}" ${status === val ? 'selected' : ''}>${label}</option>`;
      return `<div class="att-cal-day editable${weekendClass}" data-date="${dateStr}" style="background:${editableBg};">
        <div class="att-cal-daynum">${day}</div>
        <select class="attsum-status-select" data-date="${dateStr}" onchange="Staff._onAttSumStatusChange(this)">
          ${opt('present', 'Present')}${opt('half-day', 'Half-day')}${opt('absent', 'Absent')}
        </select>
        <input type="number" class="attsum-ot-input" data-date="${dateStr}" min="0" step="0.5"
          value="${otHours}" ${status === 'absent' ? 'disabled' : ''}
          oninput="Staff._recalcAttSumStats()">
      </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="att-cal-dow-row">${dowHeaders}</div>
      <div class="att-cal-grid">${emptyCells}${dayCells}</div>
    `;

    saveWrap.style.display = 'block';
    // Payroll override fields pre-populate from that staff's existing
    // payroll row for the period, if one exists — even for a role with
    // Quick Entry access but no Payroll tab access (get_payroll_overrides
    // is gated separately). A field left blank on the existing row (never
    // set) stays blank here too, rather than showing 0.
    const overridesWrap = document.getElementById('hrAttSumPayrollOverrides');
    if (overridesWrap) {
      overridesWrap.style.display = 'block';
      const ovr = this._attSumOverrides && this._attSumOverrides.found ? this._attSumOverrides : null;
      const fieldMap = {
        hrAttSumServiceValue: 'serviceValue',
        hrAttSumMakeupValue:  'makeupValue',
        hrAttSumProductCount: 'productCount',
        hrAttSumTips:         'tipsOverride'
      };
      Object.entries(fieldMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = ovr ? ovr[key] : '';
        el.value = (val === '' || val === null || val === undefined) ? '' : val;
      });
      document.getElementById('hrAttSumPayUnused').checked = !!(ovr && ovr.payUnusedLeaves);
      document.getElementById('hrAttSumUnusedReason').value = (ovr && ovr.unusedLeavesReason) || '';
    }
    this._recalcAttSumStats();
  },

  // Reads the CURRENT state of every day cell in the grid (including
  // unsaved edits) and redraws the stats strip — called on load and again
  // on every status/OT change so the counts never wait for a Save.
  _recalcAttSumStats() {
    const stats = document.getElementById('hrAttSumStats');
    if (!stats) return;

    let weekdayAbsence = 0, weekendAbsence = 0, totalOt = 0;
    document.querySelectorAll('#hrAttSumCalWrap .att-cal-day:not(.empty)').forEach(cell => {
      const isWeekend = cell.classList.contains('weekend');
      let status, ot;
      if (cell.classList.contains('editable')) {
        status = cell.querySelector('.attsum-status-select').value;
        ot = status === 'absent' ? 0 : (parseFloat(cell.querySelector('.attsum-ot-input').value) || 0);
      } else {
        status = cell.dataset.status || 'present';
        ot = parseFloat(cell.dataset.ot) || 0;
      }

      const absenceAmount = status === 'absent' ? 1 : status === 'half-day' ? 0.5 : 0;
      if (absenceAmount) {
        if (isWeekend) weekendAbsence += absenceAmount;
        else weekdayAbsence += absenceAmount;
      }
      totalOt += ot;
    });

    const fmtDays = n => (n % 1 === 0 ? n : n.toFixed(1));
    stats.style.display = 'flex';
    stats.innerHTML = `
      <div class="att-sum-stat" style="color:#9b2c2c;">Weekday Absence: ${fmtDays(weekdayAbsence)}</div>
      <div class="att-sum-stat" style="color:#9b2c2c;">Weekend Absence: ${fmtDays(weekendAbsence)}</div>
      <div class="att-sum-stat" style="color:#2b6cb0;">Total OT: ${totalOt.toFixed(1)}h</div>
    `;
  },

  _onAttSumStatusChange(selectEl) {
    const cell = selectEl.closest('.att-cal-day');
    const otInput = cell ? cell.querySelector('.attsum-ot-input') : null;
    if (!otInput) return;

    // Shade to match the newly selected status — same colors used for
    // locked (already-clocked) days, so the whole grid reads consistently.
    const bgByStatus = { absent: '#fed7d7', 'half-day': '#fefcbf', present: '#f7fafc' };
    if (cell) cell.style.background = bgByStatus[selectEl.value] || '#f7fafc';

    if (selectEl.value === 'absent') {
      otInput.disabled = true;
      otInput.value = 0;
    } else {
      otInput.disabled = false;
    }
    this._recalcAttSumStats();
  },

  // Reads a Payroll override input and returns its parsed value, or
  // undefined if left blank — undefined (not '') means "field omitted from
  // the request", which upsert_payroll_from_attendance treats as "leave
  // whatever's already on the payroll row untouched" rather than clearing it.
  _readOverrideField(id) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const raw = el.value.trim();
    return raw === '' ? undefined : (parseFloat(raw) || 0);
  },

  async _saveAttSummary() {
    const staffId = this._attSumStaffId;
    const period  = this._attSumPeriod;
    const msgEl    = document.getElementById('hrAttSumMessage');
    if (!staffId || !period) return;

    const records = [];
    document.querySelectorAll('#hrAttSumCalWrap .att-cal-day.editable').forEach(cell => {
      const dateStr = cell.dataset.date;
      const dayStatus = cell.querySelector('.attsum-status-select').value;
      const otHours   = dayStatus === 'absent' ? 0 : (parseFloat(cell.querySelector('.attsum-ot-input').value) || 0);
      const original  = this._attSumOriginal[dateStr] || { dayStatus: 'present', otHours: 0 };
      if (dayStatus !== original.dayStatus || otHours !== original.otHours) {
        records.push({ staffId, date: dateStr, dayStatus, otHours, manualOnly: true });
      }
    });

    const overrides = {
      serviceValue: this._readOverrideField('hrAttSumServiceValue'),
      makeupValue:  this._readOverrideField('hrAttSumMakeupValue'),
      productCount: this._readOverrideField('hrAttSumProductCount'),
      tipsOverride: this._readOverrideField('hrAttSumTips'),
      // Checkbox state is always explicit (checked or not), so always send
      // both — unlike the numeric overrides where blank means "preserve".
      payUnusedLeaves: document.getElementById('hrAttSumPayUnused').checked,
      unusedLeavesReason: document.getElementById('hrAttSumUnusedReason').value.trim()
    };
    const hasOverrides = Object.values(overrides).some(v => v !== undefined);

    if (!records.length && !hasOverrides) { this._showInlineMsg(msgEl, 'No changes to save.', 'info'); return; }

    const btn = document.getElementById('hrAttSumSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (records.length) {
        const res = await API.saveAttendance(records);
        if (res.status !== 'success') {
          this._showInlineMsg(msgEl, res.message || 'Error saving changes', 'error');
          return;
        }
        const errors = res.errors || [];
        if (errors.length) {
          this._showInlineMsg(msgEl, `Saved ${res.saved} day(s). ${errors.length} skipped — already have clock-in/out data.`, 'warning');
        }
      }

      // Attendance-derived payroll fields always recompute here; the four
      // override fields only go along for the ride when actually filled in.
      const payRes = await API.upsertPayrollFromAttendance({ staffId, period, ...overrides });
      if (payRes.status === 'success') {
        this._showInlineMsg(msgEl, 'Saved.', 'success');
      } else {
        this._showInlineMsg(msgEl, payRes.message || 'Attendance saved, but payroll could not be updated.', 'warning');
      }
      await this._loadAttSummary();
      // Keep the underlying grid in sync so it shows the new numbers once
      // this modal is closed, without needing a full page reload.
      if (period === this._quickEntryPeriod) await this.loadQuickEntryGrid();
    } catch(err) {
      this._showInlineMsg(msgEl, 'Error saving changes', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
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
