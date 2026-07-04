// Staff Portal — client-side controller

const SP_CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycby_qrN8fwESrRWCuqP6qVLvKonb0R9IRzjUaXbEuy8wZbn9tXcLhTLVVrB-bCeHbGM-wg/exec'
};

// ── API wrapper ───────────────────────────────────────────────────────────────
const StaffAPI = {
    async call(action, data = {}) {
        const token = localStorage.getItem('staffSessionToken');
        const body  = { action, ...data };
        if (token) body.sessionToken = token;
        const res  = await fetch(SP_CONFIG.API_URL, { method: 'POST', body: JSON.stringify(body) });
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        if (json.staffSessionExpired ||
            (json.status === 'error' && json.message?.includes('Staff session expired'))) {
            StaffApp.handleExpiredSession();
            throw new Error(json.message);
        }
        return json;
    },
    login(phone, pin)              { return this.call('staff_login',        { phone, pin }); },
    logout()                       { return this.call('staff_logout'); },
    getDashboard(fromDate, toDate) { return this.call('get_staff_dashboard', { fromDate, toDate }); },
    getPendingItems()              { return this.call('get_pending_items'); },
    confirmItems(billItemIds)      { return this.call('confirm_bill_items',  { billItemIds }); },
    changePin(currentPin, newPin)  { return this.call('change_staff_pin',    { currentPin, newPin }); },
    logAttendance(d)               { return this.call('log_attendance',      d); },
    getMyAttendance()              { return this.call('get_my_attendance'); },
    requestAdvance(amount, notes)  { return this.call('request_advance',     { amount, notes }); },
    getMyAdvances()                { return this.call('get_my_advances'); },
};

// ── App controller ────────────────────────────────────────────────────────────
const StaffApp = {
    currentStaff:   null,
    _activeTab:     'records',
    _pendingItems:  [],
    _attShifts:     [],
    _todayRecord:   null,

    init() {
        // Restore session
        const saved = localStorage.getItem('staffUser');
        if (saved) {
            this.currentStaff = JSON.parse(saved);
            this.showDashboard();
            this.switchTab('records');
            this.loadDashboard();
        } else {
            this.showLogin();
        }

        // Login form
        document.getElementById('staffLoginForm')
            .addEventListener('submit', e => { e.preventDefault(); this.handleLogin(); });

        // Logout
        document.getElementById('staffLogoutBtn')
            .addEventListener('click', () => this.handleLogout());

        // Tab switching
        document.querySelectorAll('.sp-tab').forEach(btn =>
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab)));

        // Attendance tab
        document.getElementById('attSetIn')
            .addEventListener('click', () => {
                document.getElementById('attClockIn').value = _spNowTime();
            });
        document.getElementById('attSetOut')
            .addEventListener('click', () => {
                document.getElementById('attClockOut').value = _spNowTime();
            });
        document.getElementById('attSubmitBtn')
            .addEventListener('click', () => this.handleLogAttendance());

        // Advance tab
        document.getElementById('advSubmitBtn')
            .addEventListener('click', () => this.handleRequestAdvance());

        // Date filter
        document.getElementById('dashFilterBtn')
            .addEventListener('click', () => this.loadDashboard());

        // Pending tab actions
        document.getElementById('confirmAllBtn')
            .addEventListener('click', () => this.handleConfirmSelected(true));
        document.getElementById('confirmSelectedBtn')
            .addEventListener('click', () => this.handleConfirmSelected(false));
        document.getElementById('selectAllCheck')
            .addEventListener('change', e => this._toggleSelectAll(e.target.checked));

        // Change PIN — header button opens modal
        document.getElementById('changePinBtn')
            .addEventListener('click', () => this.openPinModal());
        document.getElementById('pinModalClose')
            .addEventListener('click', () => this.closePinModal());
        document.getElementById('pinModalOverlay')
            .addEventListener('click', e => { if (e.target === e.currentTarget) this.closePinModal(); });
        document.getElementById('changePinForm')
            .addEventListener('submit', e => { e.preventDefault(); this.handleChangePin(); });

        // Default date range = today
        const today = _isoToday();
        document.getElementById('dashFromDate').value = today;
        document.getElementById('dashToDate').value   = today;
    },

    // ── Login ─────────────────────────────────────────────────────────────────

    async handleLogin() {
        const phone = document.getElementById('staffPhone').value.trim();
        const pin   = document.getElementById('staffPinInput').value.trim();
        const btn   = document.getElementById('staffLoginBtn');
        const msg   = document.getElementById('staffLoginMessage');

        btn.disabled    = true;
        btn.textContent = 'Signing in…';
        _clearMsg(msg);

        try {
            const res = await StaffAPI.login(phone, pin);
            if (res.status !== 'success') { _showMsg(msg, res.message, 'error'); return; }

            this.currentStaff = {
                staffId: res.staffId, staffName: res.staffName,
                phone: res.phone, orgId: res.orgId,
                role: res.role, specialization: res.specialization,
            };
            localStorage.setItem('staffUser',         JSON.stringify(this.currentStaff));
            localStorage.setItem('staffSessionToken', res.sessionToken);

            this.showDashboard();
            this.switchTab('records');
            this.loadDashboard();

            if (res.pinIsDefault) {
                setTimeout(() => {
                    _showMsg(document.getElementById('dashMessage'),
                        '⚠️ You are using the default PIN (last 4 digits of your phone). Tap 🔑 Change PIN to set a secure PIN.',
                        'warning');
                }, 700);
            }
        } catch (err) {
            _showMsg(msg, 'Login failed. Please try again.', 'error');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Sign In';
        }
    },

    handleLogout() {
        StaffAPI.logout().catch(() => {});
        localStorage.removeItem('staffUser');
        localStorage.removeItem('staffSessionToken');
        this.currentStaff  = null;
        this._pendingItems = [];
        this.showLogin();
    },

    handleExpiredSession() {
        localStorage.removeItem('staffUser');
        localStorage.removeItem('staffSessionToken');
        this.currentStaff = null;
        this.showLogin();
        _showMsg(document.getElementById('staffLoginMessage'),
            'Your session expired. Please sign in again.', 'error');
    },

    // ── Tab switching ─────────────────────────────────────────────────────────

    switchTab(tab) {
        this._activeTab = tab;
        document.querySelectorAll('.sp-tab').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.tab === tab));
        document.getElementById('tab-records').style.display    = tab === 'records'    ? 'block' : 'none';
        document.getElementById('tab-pending').style.display    = tab === 'pending'    ? 'block' : 'none';
        document.getElementById('tab-attendance').style.display = tab === 'attendance' ? 'block' : 'none';
        document.getElementById('tab-advance').style.display    = tab === 'advance'    ? 'block' : 'none';
        if (tab === 'pending')    this.loadPendingItems();
        if (tab === 'attendance') this.loadAttendance();
        if (tab === 'advance')    this.loadAdvances();
    },

    // ── My Records tab ────────────────────────────────────────────────────────

    async loadDashboard() {
        const from = document.getElementById('dashFromDate').value;
        const to   = document.getElementById('dashToDate').value;
        if (!from || !to) return;

        const wrap    = document.getElementById('recordsContent');
        const loading = document.getElementById('recordsLoading');
        loading.style.display = 'block';
        wrap.style.display    = 'none';
        _clearMsg(document.getElementById('dashMessage'));

        try {
            const res = await StaffAPI.getDashboard(from, to);
            if (res.status !== 'success') throw new Error(res.message);
            this._renderRecords(res);
            wrap.style.display = 'block';
        } catch (err) {
            _showMsg(document.getElementById('dashMessage'), 'Failed to load: ' + err.message, 'error');
        } finally {
            loading.style.display = 'none';
        }
    },

    _renderRecords(data) {
        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        document.getElementById('statServicesCount').textContent = data.services.length;
        document.getElementById('statServicesTotal').textContent = fmt(data.serviceTotal);
        document.getElementById('statProductsCount').textContent = data.products.length;
        document.getElementById('statProductsTotal').textContent = fmt(data.productTotal);
        document.getElementById('statGrandTotal').textContent    = fmt(data.grandTotal);

        const mkRows = (items) => items.length
            ? items.map((s, i) => `
                <tr>
                    <td class="sp-num">${i + 1}</td>
                    <td><strong>${_esc(s.itemName)}</strong></td>
                    <td>${_esc(s.customerName)}</td>
                    <td class="sp-num">${s.qty}</td>
                    <td class="sp-num sp-amt">${fmt(s.lineTotal)}</td>
                    <td class="sp-muted sp-time">${_esc(s.createdAt)}</td>
                    <td class="sp-num">${s.staffConfirmed
                        ? `<span class="sp-confirmed-chip">✓</span>`
                        : `<span class="sp-pending-chip">—</span>`}</td>
                </tr>`).join('')
            : '<tr><td colspan="7" class="sp-empty">No items in this period</td></tr>';

        document.getElementById('staffServicesBody').innerHTML  = mkRows(data.services);
        document.getElementById('staffProductsBody').innerHTML  = mkRows(data.products);
    },

    // ── Pending Approval tab ──────────────────────────────────────────────────

    async loadPendingItems() {
        const wrap    = document.getElementById('pendingContent');
        const loading = document.getElementById('pendingLoading');
        loading.style.display = 'block';
        wrap.style.display    = 'none';
        _clearMsg(document.getElementById('pendingMessage'));

        try {
            const res = await StaffAPI.getPendingItems();
            if (res.status !== 'success') throw new Error(res.message);
            this._pendingItems = res.pending || [];
            this._renderPending();
            wrap.style.display = 'block';
        } catch (err) {
            _showMsg(document.getElementById('pendingMessage'), 'Failed to load: ' + err.message, 'error');
        } finally {
            loading.style.display = 'none';
        }
    },

    _renderPending() {
        const items      = this._pendingItems;
        const countEl    = document.getElementById('pendingCount');
        const badge      = document.getElementById('pendingBadge');
        const tbody      = document.getElementById('pendingTableBody');
        const emptyState = document.getElementById('pendingEmpty');
        const tableWrap  = document.getElementById('pendingTableWrap');
        const actionBar  = document.getElementById('pendingActionBar');

        countEl.textContent = items.length;
        if (badge) {
            badge.textContent   = items.length;
            badge.style.display = items.length ? 'inline-flex' : 'none';
        }

        if (!items.length) {
            tableWrap.style.display  = 'none';
            actionBar.style.display  = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        tableWrap.style.display  = 'block';
        actionBar.style.display  = 'flex';

        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        tbody.innerHTML = items.map(item => `
            <tr>
                <td class="sp-num">
                    <input type="checkbox" class="pending-check" data-id="${_esc(item.billItemId)}">
                </td>
                <td>
                    <span class="sp-type-badge sp-type-${item.type}">${item.type === 'service' ? '✂️' : '📦'}</span>
                    <strong>${_esc(item.itemName)}</strong>
                </td>
                <td>${_esc(item.customerName)}</td>
                <td class="sp-num">${item.qty}</td>
                <td class="sp-num sp-amt">${fmt(item.lineTotal)}</td>
                <td class="sp-muted sp-time">${_esc(item.createdAt)}</td>
            </tr>`).join('');

        // Keep select-all in sync
        document.getElementById('selectAllCheck').checked = false;
    },

    _toggleSelectAll(checked) {
        document.querySelectorAll('#pendingTableBody .pending-check')
            .forEach(cb => { cb.checked = checked; });
    },

    _getSelectedIds() {
        return Array.from(document.querySelectorAll('#pendingTableBody .pending-check:checked'))
            .map(cb => cb.dataset.id);
    },

    async handleConfirmSelected(all) {
        const ids = all
            ? this._pendingItems.map(i => i.billItemId)
            : this._getSelectedIds();

        if (!ids.length) {
            _showMsg(document.getElementById('pendingMessage'), 'No items selected.', 'info');
            return;
        }

        const confirmAllBtn  = document.getElementById('confirmAllBtn');
        const confirmSelBtn  = document.getElementById('confirmSelectedBtn');
        confirmAllBtn.disabled = true;
        confirmSelBtn.disabled = true;

        try {
            const res = await StaffAPI.confirmItems(ids);
            if (res.status !== 'success') throw new Error(res.message);
            _showMsg(document.getElementById('pendingMessage'),
                `✅ ${res.confirmed} item(s) confirmed.`, 'success');
            // Reload both tabs so the confirmed chips update too
            this._pendingItems = [];
            await this.loadPendingItems();
            // Reload records tab in background to refresh ✓ chips
            if (this._activeTab === 'records') this.loadDashboard();
        } catch (err) {
            _showMsg(document.getElementById('pendingMessage'), 'Failed: ' + err.message, 'error');
        } finally {
            confirmAllBtn.disabled = false;
            confirmSelBtn.disabled = false;
        }
    },

    // ── Attendance tab ────────────────────────────────────────────────────────

    async loadAttendance() {
        const msgEl   = document.getElementById('attMessage');
        const loading = document.getElementById('attHistLoading');
        const histWrap = document.getElementById('attHistWrap');
        _clearMsg(msgEl);
        loading.style.display   = 'block';
        histWrap.style.display  = 'none';

        try {
            const res = await StaffAPI.getMyAttendance();
            if (res.status !== 'success') throw new Error(res.message);
            this._attShifts    = res.shifts || [];
            this._todayRecord  = res.todayRecord || null;
            this._renderAttendanceToday(res.todayRecord);
            this._renderAttendanceHistory(res.history || []);
            histWrap.style.display = 'block';
        } catch (err) {
            _showMsg(msgEl, 'Failed to load: ' + err.message, 'error');
        } finally {
            loading.style.display = 'none';
        }
    },

    _renderAttendanceToday(rec) {
        const approvedView = document.getElementById('attApprovedView');
        const logView      = document.getElementById('attLogView');
        const banner       = document.getElementById('attStatusBanner');
        const submitBtn    = document.getElementById('attSubmitBtn');

        if (!rec) {
            approvedView.style.display = 'none';
            logView.style.display      = 'block';
            banner.style.display       = 'none';
            submitBtn.textContent      = 'Submit for Approval';
            document.getElementById('attClockIn').value  = '';
            document.getElementById('attClockOut').value = '';
            document.getElementById('attNotes').value    = '';
            return;
        }

        if (rec.status === 'approved') {
            approvedView.style.display = 'block';
            logView.style.display      = 'none';
            document.getElementById('attApprovedDetail').textContent =
                `${rec.clockIn || '—'} – ${rec.clockOut || '—'}  •  ${Number(rec.hoursWorked || 0).toFixed(2)} hrs`;
            return;
        }

        // pending or rejected
        approvedView.style.display = 'none';
        logView.style.display      = 'block';
        banner.style.display       = 'block';

        if (rec.status === 'pending') {
            banner.innerHTML = `<div class="sp-message sp-message-warning" style="display:block">⏳ Your attendance is pending manager approval. You can update and resubmit.</div>`;
        } else if (rec.status === 'rejected') {
            banner.innerHTML = `<div class="sp-message sp-message-error" style="display:block">❌ Your attendance was rejected. Please resubmit.</div>`;
        }

        // Pre-fill fields
        document.getElementById('attClockIn').value  = rec.clockIn  || '';
        document.getElementById('attClockOut').value = rec.clockOut || '';
        document.getElementById('attNotes').value    = rec.notes    || '';
        submitBtn.textContent = 'Update & Resubmit';
    },

    _renderAttendanceHistory(history) {
        const statusChip = s => {
            const m = { approved: ['#f0fff4','#276749'], pending: ['#fffbeb','#744210'], rejected: ['#fff5f5','#c53030'] };
            const [bg, fg] = m[s] || ['#f7fafc', '#4a5568'];
            return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;">${_esc(s)}</span>`;
        };
        const body = document.getElementById('attHistBody');
        if (!history.length) {
            body.innerHTML = '<tr><td colspan="7" class="sp-empty">No attendance in the last 14 days</td></tr>';
            return;
        }
        body.innerHTML = history.map(r => `
            <tr>
                <td>${_esc(r.date)}</td>
                <td>${_esc(r.shiftName || r.shiftId || '—')}</td>
                <td class="sp-muted">${_esc(r.clockIn  || '—')}</td>
                <td class="sp-muted">${_esc(r.clockOut || '—')}</td>
                <td class="sp-num">${r.hoursWorked.toFixed(2)}</td>
                <td class="sp-num">${r.otHours.toFixed(2)}</td>
                <td>${statusChip(r.status)}</td>
            </tr>`).join('');
    },

    async handleLogAttendance() {
        const clockIn  = document.getElementById('attClockIn').value;
        const clockOut = document.getElementById('attClockOut').value;
        const notes    = document.getElementById('attNotes').value.trim();
        const msgEl    = document.getElementById('attMessage');
        const btn      = document.getElementById('attSubmitBtn');

        if (!clockIn) { _showMsg(msgEl, 'Please enter your clock-in time.', 'error'); return; }

        btn.disabled    = true;
        btn.textContent = 'Submitting…';
        _clearMsg(msgEl);

        try {
            const res = await StaffAPI.logAttendance({ clockIn, clockOut, notes });
            if (res.status !== 'success') throw new Error(res.message);
            _showMsg(msgEl, '✅ ' + res.message, 'success');
            this.loadAttendance();
        } catch (err) {
            _showMsg(msgEl, err.message, 'error');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Submit for Approval';
        }
    },

    // ── Advance tab ───────────────────────────────────────────────────────────

    async loadAdvances() {
        const msgEl   = document.getElementById('advMessage');
        const loading = document.getElementById('advHistLoading');
        const histWrap = document.getElementById('advHistWrap');
        _clearMsg(msgEl);
        loading.style.display  = 'block';
        histWrap.style.display = 'none';

        try {
            const res = await StaffAPI.getMyAdvances();
            if (res.status !== 'success') throw new Error(res.message);
            this._renderAdvanceBalance(res.balance || 0);
            this._renderAdvanceRequestPanel(res.hasPending, res.advances || []);
            this._renderAdvanceHistory(res.advances || []);
            histWrap.style.display = 'block';
        } catch (err) {
            _showMsg(msgEl, 'Failed to load: ' + err.message, 'error');
        } finally {
            loading.style.display = 'none';
        }
    },

    _renderAdvanceBalance(balance) {
        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('advBalance').textContent = fmt(balance);
    },

    _renderAdvanceRequestPanel(hasPending, advances) {
        const notice  = document.getElementById('advPendingNotice');
        const form    = document.getElementById('advRequestForm');
        const submitBtn = document.getElementById('advSubmitBtn');

        if (hasPending) {
            const p = advances.find(a => a.status === 'pending' || a.status === 'approved');
            const statusText = p ? (p.status === 'approved' ? 'approved, awaiting disbursal' : 'pending manager approval') : 'in progress';
            notice.style.display = 'block';
            notice.textContent   = `⏳ You have a request ${statusText}. You can submit a new request only after the current one is disbursed or rejected.`;
            form.style.display   = 'none';
        } else {
            notice.style.display = 'none';
            form.style.display   = 'block';
            document.getElementById('advAmount').value = '';
            document.getElementById('advNotes').value  = '';
        }
    },

    _renderAdvanceHistory(advances) {
        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const list = document.getElementById('advHistList');
        if (!advances.length) {
            list.innerHTML = '<p class="sp-empty" style="text-align:center;color:#a0aec0;padding:20px 0;">No advance history</p>';
            return;
        }

        const statusChip = s => {
            const m = { disbursed: ['#f0fff4','#276749'], pending: ['#fffbeb','#744210'], approved: ['#ebf8ff','#2b6cb0'], rejected: ['#fff5f5','#c53030'] };
            const [bg, fg] = m[s] || ['#f7fafc','#4a5568'];
            return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;">${_esc(s)}</span>`;
        };

        list.innerHTML = advances.map(r => `
            <div style="border-bottom:1px solid #f0f4f8;padding:12px 0;display:grid;grid-template-columns:1fr auto;gap:6px;align-items:start;">
                <div>
                    <div style="font-size:13px;font-weight:600;color:#2d3748;">${_esc(r.date)}</div>
                    ${r.notes ? `<div style="font-size:12px;color:#718096;margin-top:2px;">${_esc(r.notes)}</div>` : ''}
                    ${r.status === 'approved' ? `<div style="font-size:12px;color:#2b6cb0;margin-top:2px;">Approved: ${fmt(r.approvedAmount)}</div>` : ''}
                    ${r.status === 'disbursed' ? `<div style="font-size:12px;color:#718096;margin-top:2px;">via ${_esc(r.paymentMode || '—')} · Balance: ${fmt(r.runningBalance)}</div>` : ''}
                </div>
                <div style="text-align:right;">
                    <div style="font-size:16px;font-weight:700;color:#2d3748;">${fmt(r.amount)}</div>
                    <div style="margin-top:4px;">${statusChip(r.status)}</div>
                </div>
            </div>`).join('');
    },

    async handleRequestAdvance() {
        const amount  = parseFloat(document.getElementById('advAmount').value) || 0;
        const notes   = document.getElementById('advNotes').value.trim();
        const msgEl   = document.getElementById('advMessage');
        const btn     = document.getElementById('advSubmitBtn');

        if (amount <= 0) { _showMsg(msgEl, 'Please enter a valid amount.', 'error'); return; }

        btn.disabled    = true;
        btn.textContent = 'Submitting…';
        _clearMsg(msgEl);

        try {
            const res = await StaffAPI.requestAdvance(amount, notes);
            if (res.status !== 'success') throw new Error(res.message);
            _showMsg(msgEl, '✅ Advance request submitted — awaiting manager approval.', 'success');
            this.loadAdvances();
        } catch (err) {
            _showMsg(msgEl, err.message, 'error');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Request Advance';
        }
    },

    // ── Change PIN modal ──────────────────────────────────────────────────────

    openPinModal() {
        document.getElementById('pinModalOverlay').style.display = 'flex';
        document.getElementById('changePinForm').reset();
        _clearMsg(document.getElementById('pinMessage'));
        document.getElementById('currentPinInput').focus();
    },

    closePinModal() {
        document.getElementById('pinModalOverlay').style.display = 'none';
    },

    async handleChangePin() {
        const currentPin = document.getElementById('currentPinInput').value.trim();
        const newPin     = document.getElementById('newPinInput').value.trim();
        const confirmPin = document.getElementById('confirmNewPinInput').value.trim();
        const msg        = document.getElementById('pinMessage');

        if (newPin !== confirmPin) { _showMsg(msg, 'New PINs do not match', 'error'); return; }
        if (newPin.length < 4)    { _showMsg(msg, 'PIN must be at least 4 digits', 'error'); return; }
        if (!/^\d+$/.test(newPin)) { _showMsg(msg, 'PIN must contain only digits', 'error'); return; }

        const btn = document.getElementById('savePinBtn');
        btn.disabled = true; btn.textContent = 'Saving…';

        try {
            const res = await StaffAPI.changePin(currentPin, newPin);
            if (res.status !== 'success') throw new Error(res.message);
            _showMsg(msg, '✅ PIN changed successfully!', 'success');
            setTimeout(() => this.closePinModal(), 1500);
        } catch (err) {
            _showMsg(msg, err.message, 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Save PIN';
        }
    },

    // ── Screen switching ──────────────────────────────────────────────────────

    showLogin() {
        document.getElementById('staffLoginSection').style.display = 'flex';
        document.getElementById('staffDashSection').style.display  = 'none';
        document.getElementById('staffLoginForm').reset();
    },

    showDashboard() {
        document.getElementById('staffLoginSection').style.display = 'none';
        document.getElementById('staffDashSection').style.display  = 'block';
        const s = this.currentStaff;
        if (s) {
            document.getElementById('staffNameHeader').textContent =
                s.staffName || 'Staff Portal';
            document.getElementById('staffRoleHeader').textContent =
                [s.role, s.specialization].filter(Boolean).join(' · ');
        }
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _showMsg(el, text, type) {
    if (!el) return;
    el.textContent   = text;
    el.className     = `sp-message sp-message-${type}`;
    el.style.display = 'block';
    if (type !== 'error' && type !== 'warning') setTimeout(() => { el.style.display = 'none'; }, 5000);
}
function _clearMsg(el) {
    if (!el) return;
    el.textContent   = '';
    el.style.display = 'none';
}

function _spNowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

document.addEventListener('DOMContentLoaded', () => StaffApp.init());
