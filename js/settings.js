// Settings page — Sheet setup/verification
const Settings = {
    _statusData: null,
    _spreadsheetUrl: null,

    init() {
        document.getElementById('setupRefreshBtn')?.addEventListener('click', () => this.loadSetupStatus());
        document.getElementById('setupSummaryBtn')?.addEventListener('click', () => this.refreshSummarySheet());
    },

    async load() {
        await this.loadSetupStatus();
    },

    // ── Sheet Setup ──────────────────────────────────────────────────────────────

    async loadSetupStatus() {
        const card = document.getElementById('setupStatusCard');
        if (card) card.innerHTML = '<p class="muted">Checking sheets…</p>';
        try {
            const res = await API.getSetupStatus();
            if (res.status !== 'success') throw new Error(res.message);
            this._statusData      = res.results || [];
            this._spreadsheetUrl  = res.spreadsheetUrl || null;
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

        const summary = `
            <div class="setup-summary">
                <span class="badge badge-success">✅ ${counts.ok} OK</span>
                <span class="badge badge-danger">❌ ${counts.missing} Missing</span>
                <span class="badge badge-warning">⚠️ ${counts.missing_columns} Missing columns</span>
            </div>`;

        // Group results
        const groups = {};
        results.forEach(r => {
            if (!groups[r.group]) groups[r.group] = [];
            groups[r.group].push(r);
        });

        let html = summary;

        if (hasIssues) {
            html += `
                <div class="setup-actions-bar">
                    <label><input type="checkbox" id="setupSelectAll" checked> Select all fixable</label>
                    <button class="btn btn-primary btn-sm" id="setupRunBtn">Run Setup</button>
                </div>`;
        } else {
            html += '<p class="setup-all-ok">All sheets are present and correctly structured.</p>';
        }

        html += `
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
                    ? `<input type="checkbox" class="setup-check"
                         data-sheet="${this._esc(r.sheet)}"
                         data-action="${r.status === 'missing' ? 'create' : 'add_columns'}" checked>`
                    : '';

                const statusBadge = {
                    ok:              '<span class="badge badge-success">OK</span>',
                    missing:         '<span class="badge badge-danger">Missing</span>',
                    missing_columns: '<span class="badge badge-warning">Missing columns</span>'
                }[r.status] || r.status;

                html += `<tr class="${r.status === 'ok' ? 'setup-row-ok' : ''}">
                    <td>${checkbox}</td>
                    <td><strong>${this._esc(r.sheet)}</strong></td>
                    <td class="muted">${this._esc(groupName)}</td>
                    <td>${statusBadge}</td>
                    <td class="setup-detail">${this._buildDrilldown(r)}</td>
                </tr>`;
            });
        });

        html += '</tbody></table></div>';
        card.innerHTML = html;

        card.querySelector('#setupRunBtn')?.addEventListener('click', () => this.runSetup());
        card.querySelector('#setupSelectAll')?.addEventListener('change', e => this._toggleAll(e.target.checked));
    },

    // Builds the <details> drill-down for any sheet row.
    // Col 1 = schema fields, Col 2 = existing columns in sheet (or — if missing).
    _buildDrilldown(r) {
        const exp = r.expected || [];
        const act = r.existing || [];
        const len = Math.max(exp.length, act.length);

        const sheetLink = (r.sheetId != null && this._spreadsheetUrl)
            ? `<a href="${this._spreadsheetUrl}#gid=${r.sheetId}" target="_blank" class="sheet-link">Open in Sheets ↗</a>`
            : (r.status === 'missing' ? '<span class="muted">Sheet not created yet</span>' : '');

        let summaryLabel;
        if (r.status === 'missing') {
            summaryLabel = `${exp.length} fields (not created)`;
        } else if (r.status === 'missing_columns') {
            summaryLabel = `${exp.length} expected / ${act.length} in sheet — ${r.missingCols.length} missing`;
        } else {
            summaryLabel = `${exp.length} fields ✓`;
        }

        let rows = '';
        for (let i = 0; i < len; i++) {
            const schemaVal = exp[i] || '';
            const sheetVal  = act[i] || '';

            const schemaCell = schemaVal
                ? `<code class="${i < act.length ? 'dc-schema' : 'dc-schema dc-missing'}">${this._esc(schemaVal)}</code>`
                : '';
            const sheetCell = sheetVal
                ? `<code class="dc-sheet">${this._esc(sheetVal)}</code>`
                : (r.status !== 'missing' ? '<span class="dc-absent">—</span>' : '');

            const rowClass = !schemaVal ? 'dc-row-extra'
                           : !sheetVal  ? 'dc-row-missing'
                           : '';

            rows += `<tr class="${rowClass}">
                <td class="dc-num">${i + 1}</td>
                <td>${schemaCell}</td>
                <td>${sheetCell}</td>
            </tr>`;
        }

        return `<details class="diff-details">
            <summary class="diff-summary">${summaryLabel}</summary>
            <div class="dc-wrap">
                ${sheetLink}
                <table class="dc-table">
                    <thead><tr>
                        <th class="dc-num">#</th>
                        <th>Schema field</th>
                        <th>Column in sheet</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </details>`;
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

            await this.loadSetupStatus();
        } catch (err) {
            UI.showMessage('settingsMessage', 'Setup failed: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Run Setup'; }
        }
    },

    async refreshSummarySheet() {
        const btn = document.getElementById('setupSummaryBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
        try {
            const res = await API.refreshSummarySheet();
            if (res.status !== 'success') throw new Error(res.message);
            UI.showMessage('settingsMessage', res.message || '📋 Index sheet refreshed.', 'success');
        } catch(err) {
            UI.showMessage('settingsMessage', 'Failed: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '📋 Refresh Summary Sheet'; }
        }
    },

    _esc(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
};
