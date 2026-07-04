// Settings page — Sheet setup/verification
const Settings = {
    _statusData: null,
    _spreadsheetUrl: null,

    init() {
        document.getElementById('setupRefreshBtn')?.addEventListener('click', () => this.loadSetupStatus());
        document.getElementById('setupSummaryBtn')?.addEventListener('click', () => this.refreshSummarySheet());
        document.getElementById('loyaltyHHAddRow')?.addEventListener('click', () => this._addHHRow());
        document.getElementById('loyaltySaveBtn')?.addEventListener('click', () => this.saveLoyalty());
        document.getElementById('loyaltyHHToggleBtn')?.addEventListener('click', () => this._toggleHappyHourNow());
        document.getElementById('genSettingsSaveBtn')?.addEventListener('click', () => this.saveGeneralSettings());
    },

    _loyaltyCfg: null,

    async load() {
        this.renderPortalLinks();
        await Promise.all([this.loadSetupStatus(), this.loadLoyalty(), this.loadGeneralSettings()]);
    },

    // ── Portal Links ─────────────────────────────────────────────────────────────

    // Resolved against the current document location rather than a
    // hardcoded domain, so this is correct whether the app is served from
    // GitHub Pages, a custom domain, or a local dev server.
    renderPortalLinks() {
        ['staffPortalLink', 'customerPortalLink'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const absoluteUrl = new URL(el.getAttribute('href'), document.baseURI).href;
            el.href = absoluteUrl;
            el.textContent = absoluteUrl;
        });
    },

    async copyPortalLink(elementId, btn) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const url = el.href;
        const original = btn.textContent;
        try {
            await navigator.clipboard.writeText(url);
            btn.textContent = 'Copied!';
        } catch (e) {
            // Clipboard API unavailable (e.g. non-HTTPS context) — fall back
            // to selecting the text so the user can copy manually.
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            btn.textContent = 'Select & copy';
        }
        setTimeout(() => { btn.textContent = original; }, 1800);
    },

    // ── General Settings ────────────────────────────────────────────────────────

    async loadGeneralSettings() {
        try {
            const res = await API.getOrgSettings();
            if (res.status !== 'success') return;
            const s = res.settings || {};
            const el = document.getElementById('genOTThreshold');
            if (el) el.value = s.otThresholdHours ?? 9;
        } catch (e) { /* silently ignore on settings load */ }
    },

    async saveGeneralSettings() {
        const btn = document.getElementById('genSettingsSaveBtn');
        const val = parseFloat(document.getElementById('genOTThreshold')?.value);
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const res = await API.updateOrgSettings({ otThresholdHours: (val > 0 ? val : 9) });
            if (res.status !== 'success') throw new Error(res.message);
            UI.showMessage('settingsMessage', 'General settings saved.', 'success');
        } catch (err) {
            UI.showMessage('settingsMessage', 'Failed to save: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save General Settings'; }
        }
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

    // ── Loyalty Settings ─────────────────────────────────────────────────────────

    async loadLoyalty() {
        try {
            const res = await API.getLoyaltyConfig();
            if (res.status !== 'success') return;
            this._loyaltyCfg = res.loyalty || {};
            this._renderLoyalty();
        } catch (e) { /* silently ignore on settings load */ }
    },

    _renderLoyalty() {
        const cfg = this._loyaltyCfg || {};
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        const chk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

        chk('loyaltyEnabled', cfg.enabled);
        set('loyaltyPointsName', cfg.pointsName || 'Points');
        set('loyaltyBaseEarnRate', cfg.baseEarnRate ?? 1);
        set('loyaltyExpiryMonths', cfg.expiryMonths ?? 12);
        set('loyaltyRedemptionRate', cfg.redemptionRate ?? 100);
        set('loyaltyRedemptionValue', cfg.redemptionValue ?? 1);
        set('loyaltyMinRedemption', cfg.minRedemption ?? 100);
        set('loyaltyHHMultiplier', cfg.happyHourMultiplier ?? 2);
        this._renderHHStatus(cfg);

        const tiers = cfg.tiers || [
            { name: 'Bronze',   threshold: 0,    multiplier: 1.0,  color: '#cd7f32' },
            { name: 'Silver',   threshold: 500,  multiplier: 1.25, color: '#a8a9ad' },
            { name: 'Gold',     threshold: 1500, multiplier: 1.5,  color: '#ffd700' },
            { name: 'Platinum', threshold: 3000, multiplier: 2.0,  color: '#b9f2ff' }
        ];
        const tbody = document.getElementById('loyaltyTiersBody');
        if (tbody) {
            tbody.innerHTML = tiers.map((t, i) => `
                <tr>
                    <td style="color:#718096;font-weight:600;">${i + 1}</td>
                    <td><input type="text" class="loy-tier-name" data-idx="${i}" value="${this._esc(t.name)}"
                        style="width:110px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;"></td>
                    <td><input type="number" class="loy-tier-thresh" data-idx="${i}" value="${t.threshold}"
                        style="width:100px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;" min="0" step="1"
                        ${i === 0 ? 'disabled title="Base tier always starts at 0"' : ''}></td>
                    <td><input type="number" class="loy-tier-mult" data-idx="${i}" value="${t.multiplier}"
                        style="width:80px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;" min="0.1" step="0.05"></td>
                    <td><input type="color" class="loy-tier-color" data-idx="${i}" value="${t.color || '#cccccc'}"
                        style="width:48px;height:32px;padding:2px;border:1px solid #e2e8f0;border-radius:4px;cursor:pointer;"></td>
                </tr>
            `).join('');
        }

        // Backend stores { days: ['mon',...], startTime, endTime, effectiveFrom }
        // (LoyaltyPoints._isHappyHour reads exactly this shape/key name). The
        // UI shows one row per day, so a multi-day rule becomes N rows here.
        const schedDiv = document.getElementById('loyaltyHHSchedule');
        if (schedDiv) {
            schedDiv.innerHTML = '';
            (cfg.happyHourSchedules || []).forEach(s => {
                const days = (s.days && s.days.length) ? s.days : [''];
                days.forEach(dayCode => {
                    const label = dayCode ? dayCode.charAt(0).toUpperCase() + dayCode.slice(1) : '';
                    this._addHHRow({ day: label, from: s.startTime, to: s.endTime, effectiveFrom: s.effectiveFrom });
                });
            });
        }
    },

    _renderHHStatus(cfg) {
        const statusEl = document.getElementById('loyaltyHHStatus');
        const btn      = document.getElementById('loyaltyHHToggleBtn');
        const durEl    = document.getElementById('loyaltyHHDuration');
        // getLoyaltyConfig() already returns the expiry-corrected live state
        // (see LoyaltyPoints.getConfig), so this boolean can be trusted as-is.
        const live = !!cfg.happyHourActive;
        if (statusEl) {
            if (live && cfg.happyHourUntil) {
                const until = new Date(cfg.happyHourUntil);
                statusEl.textContent = '🎉 Active until ' + until.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                statusEl.style.color = '#38a169';
            } else {
                statusEl.textContent = 'Not active';
                statusEl.style.color = '#718096';
            }
        }
        if (btn) btn.textContent = live ? 'Stop Happy Hour' : 'Start Happy Hour';
        if (durEl) durEl.style.display = live ? 'none' : '';
    },

    async _toggleHappyHourNow() {
        const btn = document.getElementById('loyaltyHHToggleBtn');
        const isLive = !!(this._loyaltyCfg || {}).happyHourActive;
        const duration = document.getElementById('loyaltyHHDuration')?.value || '2h';
        if (btn) btn.disabled = true;
        try {
            const res = await API.toggleHappyHour(!isLive, duration);
            if (res.status !== 'success') throw new Error(res.message);
            await this.loadLoyalty(); // refetch so the button/status reflect the authoritative server state
            UI.showMessage('settingsMessage', !isLive ? 'Happy Hour started.' : 'Happy Hour stopped.', 'success');
        } catch (err) {
            UI.showMessage('settingsMessage', 'Failed to toggle Happy Hour: ' + err.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    _addHHRow(data) {
        const schedDiv = document.getElementById('loyaltyHHSchedule');
        if (!schedDiv) return;
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const row = document.createElement('div');
        row.className = 'loy-hh-row';
        row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        row.innerHTML = `
            <select class="loy-hh-day" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;">
                ${days.map(d => `<option value="${d}" ${data && data.day === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
            <input type="time" class="loy-hh-from" value="${data ? data.from || '' : ''}" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;">
            <span style="font-size:13px;color:#718096;">to</span>
            <input type="time" class="loy-hh-to" value="${data ? data.to || '' : ''}" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;">
            <input type="date" class="loy-hh-eff" value="${data ? data.effectiveFrom || '' : ''}" title="Effective from (optional)" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;">
            <button type="button" style="background:none;border:none;color:#e53e3e;font-size:18px;cursor:pointer;line-height:1;" onclick="this.closest('.loy-hh-row').remove()">×</button>
        `;
        schedDiv.appendChild(row);
    },

    async saveLoyalty() {
        const get = id => document.getElementById(id);

        const tiers = [];
        document.querySelectorAll('#loyaltyTiersBody tr').forEach(tr => {
            tiers.push({
                name:       tr.querySelector('.loy-tier-name')?.value.trim()  || '',
                threshold:  parseFloat(tr.querySelector('.loy-tier-thresh')?.value) || 0,
                multiplier: parseFloat(tr.querySelector('.loy-tier-mult')?.value)   || 1,
                color:      tr.querySelector('.loy-tier-color')?.value || '#cccccc'
            });
        });
        if (tiers.length > 0) tiers[0].threshold = 0;

        // Must match LoyaltyPoints._isHappyHour's expected shape exactly:
        // { days: [...], startTime, endTime, effectiveFrom, effectiveUntil }.
        // One row = one day; a rule spanning multiple days is just several
        // rows with the same time window.
        const schedule = [];
        document.querySelectorAll('#loyaltyHHSchedule .loy-hh-row').forEach(row => {
            const dayLabel = row.querySelector('.loy-hh-day')?.value  || '';
            const from     = row.querySelector('.loy-hh-from')?.value || '';
            const to       = row.querySelector('.loy-hh-to')?.value   || '';
            const eff      = row.querySelector('.loy-hh-eff')?.value  || '';
            if (!dayLabel || !from || !to) return; // skip incomplete rows
            schedule.push({
                days: [dayLabel.toLowerCase()],
                startTime: from,
                endTime: to,
                effectiveFrom: eff || ''
            });
        });

        const loyalty = {
            enabled:             !!(get('loyaltyEnabled')?.checked),
            pointsName:          get('loyaltyPointsName')?.value.trim()       || 'Points',
            baseEarnRate:        parseFloat(get('loyaltyBaseEarnRate')?.value) || 1,
            expiryMonths:        parseInt(get('loyaltyExpiryMonths')?.value, 10) || 12,
            redemptionRate:      parseFloat(get('loyaltyRedemptionRate')?.value)  || 100,
            redemptionValue:     parseFloat(get('loyaltyRedemptionValue')?.value) || 1,
            minRedemption:       parseInt(get('loyaltyMinRedemption')?.value, 10) || 100,
            // The manual on/off toggle is owned by the dedicated Start/Stop
            // Happy Hour button (toggleHappyHour action), not this bulk save
            // — carry over whatever it last set so saving tiers/rates here
            // doesn't silently cancel an in-progress happy hour.
            happyHourActive:     !!(this._loyaltyCfg || {}).happyHourActive,
            happyHourUntil:      (this._loyaltyCfg || {}).happyHourUntil || '',
            happyHourMultiplier: parseFloat(get('loyaltyHHMultiplier')?.value) || 2,
            tiers,
            happyHourSchedules:  schedule
        };

        const btn = get('loyaltySaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const res = await API.updateLoyaltyConfig(loyalty);
            if (res.status !== 'success') throw new Error(res.message);
            this._loyaltyCfg = loyalty;
            UI.showMessage('settingsMessage', 'Loyalty settings saved.', 'success');
        } catch (err) {
            UI.showMessage('settingsMessage', 'Failed to save loyalty settings: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Loyalty Settings'; }
        }
    },

    _esc(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
};
