// Staff Portal — client-side controller
// Talks to the same GAS endpoint as the admin app, using staff_ actions.

const SP_CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbyHS6cKdtLisAb3MOgn2a_xKZYGrdvIJGz-0MfDdK3NISlBmMnmsDraOot2ocAfnFNDvw/exec'
};

// ── API wrapper ───────────────────────────────────────────────────────────────
const StaffAPI = {
    async call(action, data = {}) {
        const token = localStorage.getItem('staffSessionToken');
        const body  = { action, ...data };
        if (token) body.sessionToken = token;
        const res = await fetch(SP_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        if (json.staffSessionExpired || (json.status === 'error' && json.message?.includes('Staff session expired'))) {
            StaffApp.handleExpiredSession();
            throw new Error(json.message);
        }
        return json;
    },

    login(phone, pin)                    { return this.call('staff_login',         { phone, pin }); },
    logout()                             { return this.call('staff_logout'); },
    getDashboard(fromDate, toDate)       { return this.call('get_staff_dashboard',  { fromDate, toDate }); },
    confirmDay(date, notes)              { return this.call('confirm_staff_day',    { date, notes }); },
    changePin(currentPin, newPin)        { return this.call('change_staff_pin',     { currentPin, newPin }); },
};

// ── App controller ────────────────────────────────────────────────────────────
const StaffApp = {
    currentStaff: null,

    init() {
        // Restore session
        const saved = localStorage.getItem('staffUser');
        if (saved) {
            this.currentStaff = JSON.parse(saved);
            this.showDashboard();
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

        // Date filter
        document.getElementById('dashFilterBtn')
            .addEventListener('click', () => this.loadDashboard());

        // Confirm day
        document.getElementById('confirmDayBtn')
            .addEventListener('click', () => this.handleConfirm());

        // Change PIN
        document.getElementById('changePinBtn')
            .addEventListener('click', () => this.togglePinForm());
        document.getElementById('changePinForm')
            .addEventListener('submit', e => { e.preventDefault(); this.handleChangePin(); });
        document.getElementById('cancelPinBtn')
            .addEventListener('click', () => this.togglePinForm(false));

        // Set default date range to today
        const today = _isoToday();
        document.getElementById('dashFromDate').value = today;
        document.getElementById('dashToDate').value   = today;
    },

    async handleLogin() {
        const phone = document.getElementById('staffPhone').value.trim();
        const pin   = document.getElementById('staffPinInput').value.trim();
        const btn   = document.getElementById('staffLoginBtn');
        const msg   = document.getElementById('staffLoginMessage');

        btn.disabled = true;
        btn.textContent = 'Signing in…';
        _clearMsg(msg);

        try {
            const res = await StaffAPI.login(phone, pin);
            if (res.status !== 'success') {
                _showMsg(msg, res.message, 'error');
                return;
            }
            this.currentStaff = {
                staffId:        res.staffId,
                staffName:      res.staffName,
                phone:          res.phone,
                orgId:          res.orgId,
                role:           res.role,
                specialization: res.specialization,
            };
            localStorage.setItem('staffUser',         JSON.stringify(this.currentStaff));
            localStorage.setItem('staffSessionToken', res.sessionToken);

            this.showDashboard();
            this.loadDashboard();

            // Prompt PIN change if still on default
            if (res.pinIsDefault) {
                setTimeout(() => {
                    _showMsg(document.getElementById('dashMessage'),
                        '⚠️ You are using the default PIN (last 4 digits of your phone). Please change it for security.',
                        'warning');
                }, 600);
            }
        } catch (err) {
            _showMsg(msg, 'Login failed. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    },

    handleLogout() {
        StaffAPI.logout().catch(() => {});
        localStorage.removeItem('staffUser');
        localStorage.removeItem('staffSessionToken');
        this.currentStaff = null;
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

    async loadDashboard() {
        const from = document.getElementById('dashFromDate').value;
        const to   = document.getElementById('dashToDate').value;
        if (!from || !to) return;

        const loading = document.getElementById('dashLoading');
        const content = document.getElementById('dashContent');
        loading.style.display = 'block';
        content.style.display = 'none';
        _clearMsg(document.getElementById('dashMessage'));

        try {
            const res = await StaffAPI.getDashboard(from, to);
            if (res.status !== 'success') throw new Error(res.message);
            this.renderDashboard(res);
            content.style.display = 'block';
        } catch (err) {
            _showMsg(document.getElementById('dashMessage'), 'Failed to load: ' + err.message, 'error');
        } finally {
            loading.style.display = 'none';
        }
    },

    renderDashboard(data) {
        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Summary chips
        document.getElementById('statServicesCount').textContent  = data.services.length;
        document.getElementById('statServicesTotal').textContent  = fmt(data.serviceTotal);
        document.getElementById('statProductsCount').textContent  = data.products.length;
        document.getElementById('statProductsTotal').textContent  = fmt(data.productTotal);
        document.getElementById('statGrandTotal').textContent     = fmt(data.grandTotal);

        // Services table
        const svcEl = document.getElementById('staffServicesBody');
        if (data.services.length) {
            svcEl.innerHTML = data.services.map((s, i) => `
                <tr>
                    <td class="sp-num">${i + 1}</td>
                    <td><strong>${_esc(s.itemName)}</strong></td>
                    <td>${_esc(s.customerName)}</td>
                    <td class="sp-num">${s.qty}</td>
                    <td class="sp-num sp-amt">${fmt(s.lineTotal)}</td>
                    <td class="sp-muted sp-time">${_esc(s.createdAt)}</td>
                </tr>`).join('');
        } else {
            svcEl.innerHTML = '<tr><td colspan="6" class="sp-empty">No services in this period</td></tr>';
        }

        // Products table
        const proEl = document.getElementById('staffProductsBody');
        if (data.products.length) {
            proEl.innerHTML = data.products.map((p, i) => `
                <tr>
                    <td class="sp-num">${i + 1}</td>
                    <td><strong>${_esc(p.itemName)}</strong></td>
                    <td>${_esc(p.customerName)}</td>
                    <td class="sp-num">${p.qty}</td>
                    <td class="sp-num sp-amt">${fmt(p.lineTotal)}</td>
                    <td class="sp-muted sp-time">${_esc(p.createdAt)}</td>
                </tr>`).join('');
        } else {
            proEl.innerHTML = '<tr><td colspan="6" class="sp-empty">No products in this period</td></tr>';
        }

        // Confirmation state — check if today (single-day) is confirmed
        const fromDate = document.getElementById('dashFromDate').value;
        const toDate   = document.getElementById('dashToDate').value;
        const isSingleDay = fromDate === toDate;
        const confirmCard = document.getElementById('confirmCard');
        const confirmBtn  = document.getElementById('confirmDayBtn');
        const confirmInfo = document.getElementById('confirmInfo');

        if (isSingleDay) {
            confirmCard.style.display = 'block';
            const conf = data.confirmations.find(c => c.date === fromDate);
            if (conf) {
                confirmInfo.innerHTML = `<div class="sp-confirmed-badge">✅ Confirmed on ${_esc(conf.confirmedAt)}</div>`;
                confirmBtn.textContent = 'Re-confirm';
                confirmBtn.className   = 'sp-btn sp-btn-secondary';
            } else {
                confirmInfo.innerHTML = '<p class="sp-confirm-hint">Review the records above and tap to confirm they are correct.</p>';
                confirmBtn.textContent = '✓ Confirm Today\'s Records';
                confirmBtn.className   = 'sp-btn sp-btn-confirm';
            }
            confirmBtn.dataset.confirmDate = fromDate;
        } else {
            confirmCard.style.display = 'none';
        }
    },

    async handleConfirm() {
        const btn  = document.getElementById('confirmDayBtn');
        const date = btn.dataset.confirmDate;
        if (!date) return;

        btn.disabled    = true;
        btn.textContent = 'Confirming…';
        try {
            const res = await StaffAPI.confirmDay(date, '');
            if (res.status !== 'success') throw new Error(res.message);
            // Reload to refresh confirmation badge
            await this.loadDashboard();
        } catch (err) {
            _showMsg(document.getElementById('dashMessage'), 'Confirmation failed: ' + err.message, 'error');
            btn.disabled    = false;
            btn.textContent = '✓ Confirm Today\'s Records';
        }
    },

    togglePinForm(show) {
        const card = document.getElementById('changePinCard');
        const isVisible = card.style.display === 'block';
        const forceState = show !== undefined ? show : !isVisible;
        card.style.display = forceState ? 'block' : 'none';
        document.getElementById('changePinBtn').textContent = forceState ? '✕ Cancel' : '🔑 Change PIN';
        if (forceState) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    async handleChangePin() {
        const currentPin = document.getElementById('currentPinInput').value.trim();
        const newPin     = document.getElementById('newPinInput').value.trim();
        const confirmPin = document.getElementById('confirmNewPinInput').value.trim();
        const msg        = document.getElementById('pinMessage');

        if (newPin !== confirmPin) { _showMsg(msg, 'New PINs do not match', 'error'); return; }
        if (newPin.length < 4)    { _showMsg(msg, 'PIN must be at least 4 digits', 'error'); return; }

        const btn = document.getElementById('savePinBtn');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
            const res = await StaffAPI.changePin(currentPin, newPin);
            if (res.status !== 'success') throw new Error(res.message);
            _showMsg(msg, 'PIN changed successfully!', 'success');
            document.getElementById('changePinForm').reset();
            setTimeout(() => this.togglePinForm(false), 1500);
        } catch (err) {
            _showMsg(msg, err.message, 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Save PIN';
        }
    },

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
            document.getElementById('staffNameHeader').textContent = s.staffName || 'Staff Portal';
            document.getElementById('staffRoleHeader').textContent = [s.role, s.specialization].filter(Boolean).join(' · ');
        }
    }
};

// ── Utility helpers ───────────────────────────────────────────────────────────
function _isoToday() {
    const d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}
function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className   = `sp-message sp-message-${type}`;
    el.style.display = 'block';
    if (type !== 'error') setTimeout(() => { el.style.display = 'none'; }, 5000);
}
function _clearMsg(el) {
    if (!el) return;
    el.textContent   = '';
    el.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => StaffApp.init());
