// Settings page — Sheet setup/verification + Org Settings
const Settings = {
    _statusData: null,   // last audit results from API
    _orgSettings: null,

    init() {
        document.getElementById('setupRunBtn')?.addEventListener('click', () => this.runSetup());
        document.getElementById('setupRefreshBtn')?.addEventListener('click', () => this.loadSetupStatus());
        document.getElementById('setupSelectAll')?.addEventListener('change', e => this._toggleAll(e.target.checked));
        document.getElementById('orgSettingsForm')?.addEventListener('submit', e => {
            e.preventDefault();
            this.saveOrgSettings();
        });
    },

    async load() {
        await Promise.all([this.loadSetupStatus(), this.loadOrgSettings()]);
    },

    // ── Sheet Setup ─────────────────────────────────────────────────────────────

    async loadSetupStatus() {
        const card = document.getElementById('setupStatusCard');
        if (card) card.innerHTML = '<p class="muted">Checking sheets…</p>';
        try {
            const res = await API.getSetupStatus();
            if (res.status !== 'success') throw new Error(res.message);
            this._statusData = res.results || [];
            this._renderStatus();
        } catch (err) {
            if (card) card.innerHTML = `<p class="error-text">Failed to load: ${err.message}</p>`;
        }
    },

    _renderStatus() {
        const card = document.getElementById('setupStatusCard');
        if (!card) return;
        const results = this._statusData || [];

        const counts = { ok: 0, missing: 0, missing_columns: 0 };
        results.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

        const hasIssues = counts.missing > 0 || counts.missing_columns > 0;

        // Summary badges
        const summary = `
            <div class="setup-summary">
                <span class="badge badge-success">✅ ${counts.ok} OK</span>
                <span class="badge badge-danger">❌ ${counts.missing} Missing</span>
                <span class="badge badge-warning">⚠️ ${counts.missing_columns} Missing columns</span>
            </div>`;

        if (!hasIssues) {
            card.innerHTML = summary + '<p class="setup-all-ok">All sheets are present and correctly structured.</p>';
            return;
        }

        // Group results by group
        const groups = {};
        results.forEach(r => {
            if (!groups[r.group]) groups[r.group] = [];
            groups[r.group].push(r);
        });

        let html = summary;

        html += `
            <div class="setup-actions-bar">
                <label><input type="checkbox" id="setupSelectAll" checked> Select all fixable</label>
                <button class="btn btn-primary btn-sm" id="setupRunBtn">Run Setup</button>
            </div>
            <div class="setup-table-wrap">
            <table class="setup-table">
                <thead><tr>
                    <th style="width:28px"></th>
                    <th>Sheet</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Details</th>
                </tr></thead>
                <tbody>`;

        Object.entries(groups).forEach(([groupName, rows]) => {
            rows.forEach(r => {
                const isFixable = r.canFix && r.status !== 'ok';
                const checkbox = isFixable
                    ? `<input type="checkbox" class="setup-check" data-sheet="${this._esc(r.sheet)}"
                         data-action="${r.status === 'missing' ? 'create' : 'add_columns'}" checked>`
                    : '';

                const statusBadge = {
                    ok:              '<span class="badge badge-success">OK</span>',
                    missing:         '<span class="badge badge-danger">Missing</span>',
                    missing_columns: '<span class="badge badge-warning">Missing columns</span>'
                }[r.status] || r.status;

                let detail = '';
                if (r.status === 'missing') {
                    detail = `Will create with ${r.expected.length} columns`;
                } else if (r.status === 'missing_columns') {
                    detail = `Will append: <code>${r.missingCols.join(', ')}</code>`;
                }

                html += `<tr class="${r.status === 'ok' ? 'setup-row-ok' : ''}">
                    <td>${checkbox}</td>
                    <td><strong>${this._esc(r.sheet)}</strong></td>
                    <td class="muted">${this._esc(groupName)}</td>
                    <td>${statusBadge}</td>
                    <td class="setup-detail">${detail}</td>
                </tr>`;
            });
        });

        html += '</tbody></table></div>';
        card.innerHTML = html;

        // Re-bind buttons and checkboxes (they're inside innerHTML)
        card.querySelector('#setupRunBtn')?.addEventListener('click', () => this.runSetup());
        card.querySelector('#setupSelectAll')?.addEventListener('change', e => this._toggleAll(e.target.checked));
    },

    _toggleAll(checked) {
        document.querySelectorAll('#setupStatusCard .setup-check')
            .forEach(cb => { cb.checked = checked; });
    },

    async runSetup() {
        const checks = document.querySelectorAll('#setupStatusCard .setup-check:checked');
        if (!checks.length) {
            UI.showMessage('settingsMessage', 'No sheets selected.', 'info');
            return;
        }

        const actions = Array.from(checks).map(cb => ({
            sheet:  cb.dataset.sheet,
            action: cb.dataset.action
        }));

        const btn = document.getElementById('setupRunBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }

        try {
            const res = await API.runSetup(actions);
            if (res.status !== 'success') throw new Error(res.message);

            const done   = res.done   || [];
            const errors = res.errors || [];
            const msgType = errors.length ? 'warning' : 'success';
            const msg = done.length
                ? `Done: ${done.join(' | ')}` + (errors.length ? ` | Errors: ${errors.join(' | ')}` : '')
                : (errors.length ? `Errors: ${errors.join(' | ')}` : 'Nothing done.');
            UI.showMessage('settingsMessage', msg, msgType);

            // Reload status to reflect changes
            await this.loadSetupStatus();
        } catch (err) {
            UI.showMessage('settingsMessage', 'Setup failed: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Run Setup'; }
        }
    },

    // ── Org Settings ────────────────────────────────────────────────────────────

    async loadOrgSettings() {
        try {
            const res = await API.getOrgSettings();
            if (res.status !== 'success') return;
            this._orgSettings = res.settings || {};
            this._renderOrgSettings();
        } catch (err) {
            console.error('Failed to load org settings:', err);
        }
    },

    _renderOrgSettings() {
        const s = this._orgSettings || {};
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val ?? '';
        };
        setVal('orgSalonName',       s.salonName       || '');
        setVal('orgGstNumber',       s.gstNumber        || '');
        setVal('orgCurrencySymbol',  s.currencySymbol   || '₹');
        setVal('orgSalaryPayDay',    s.salaryPayDay     ?? 10);
        setVal('orgDefaultOffs',     s.defaultEligibleOffs ?? 4);
        const tpEl = document.getElementById('orgDefaultTargetPeriod');
        if (tpEl) tpEl.value = s.defaultTargetPeriod || 'weekly';
    },

    async saveOrgSettings() {
        const payload = {
            salonName:            document.getElementById('orgSalonName')?.value.trim()      || '',
            gstNumber:            document.getElementById('orgGstNumber')?.value.trim()       || '',
            currencySymbol:       document.getElementById('orgCurrencySymbol')?.value.trim() || '₹',
            salaryPayDay:         Number(document.getElementById('orgSalaryPayDay')?.value)   || 10,
            defaultEligibleOffs:  Number(document.getElementById('orgDefaultOffs')?.value)    || 4,
            defaultTargetPeriod:  document.getElementById('orgDefaultTargetPeriod')?.value    || 'weekly'
        };

        const btn = document.getElementById('orgSettingsSaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const res = await API.updateOrgSettings(payload);
            if (res.status !== 'success') throw new Error(res.message);
            this._orgSettings = { ...this._orgSettings, ...payload };
            UI.showMessage('settingsMessage', 'Organisation settings saved.', 'success');
        } catch (err) {
            UI.showMessage('settingsMessage', 'Save failed: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
        }
    },

    _esc(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
};
