// Customers Module — customer list, plus Loyalty Programme and Happy Hour
// settings (moved here from Settings since both are customer-facing and the
// permission gating now lives under 'customers').
const Customers = {
    _activeTab: 'cust-list',
    _loyaltyCfg: null,
    _orgs: [],

    init() {
        document.getElementById('customerForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('customerIncludeChildren')?.addEventListener('change', () => this.loadCustomers());

        document.querySelectorAll('#customers .prod-tab').forEach(btn => {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
        });

        document.getElementById('loyaltySaveBtn')?.addEventListener('click', () => this.saveLoyaltyProgramme());
        document.getElementById('loyaltyHHSaveBtn')?.addEventListener('click', () => this.saveHappyHour());
        document.getElementById('loyaltyHHToggleBtn')?.addEventListener('click', () => this._toggleHappyHourNow());
        document.getElementById('loyaltyHHAddRow')?.addEventListener('click', () => this._addHHRow());
    },

    // Org picker is optional — a role with Customers access but no
    // Organizations access simply won't see it (form still works fine).
    // Scoped to the caller's own org + descendants, not every org.
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
        const sel = document.getElementById('customerOrgId');
        if (!sel) return;
        sel.innerHTML = this._orgs.map(o => `<option value="${o.id}">${this._esc(o.name)}</option>`).join('');
        sel.value = Auth.currentUser?.orgId || '';
        // A leaf org (no descendants) has nothing to pick between — grey it out.
        sel.disabled = this._orgs.length < 2;
    },

    _orgName(orgId) {
        const org = this._orgs.find(o => o.id === orgId);
        return org ? org.name : (orgId || '—');
    },

    _switchTab(tab) {
        this._activeTab = tab;
        document.querySelectorAll('#customers .prod-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('#customers .prod-tab-panel').forEach(p =>
            p.classList.toggle('active', p.id === 'prod-tab-' + tab));
    },

    async load() {
        // Orgs must load BEFORE loadCustomers renders — otherwise the grid
        // can render with _orgs still empty (whenever the orgs request is
        // the slowest of the three), showing raw org IDs instead of names.
        await this._loadOrgs();
        await Promise.all([this.loadCustomers(), this.loadLoyalty()]);
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveCustomerBtn');

        const name = document.getElementById('customerName').value;
        const phone = document.getElementById('customerPhone').value;
        // The Org field always holds a real org now (own org, or a
        // descendant explicitly picked) — always send it. Customers.add
        // validates it's within the caller's own org + descendants.
        const targetOrgId = document.getElementById('customerOrgId')?.value || '';

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = await API.addCustomer({ name, phone, targetOrgId, submittedBy: Auth.currentUser?.fullName || 'Unknown' });

            if (result.status === 'success') {
                UI.showMessage('customerMessage', result.message, 'success');
                document.getElementById('customerForm').reset();
                this._populateOrgDropdown();
                this.loadCustomers();
            } else {
                UI.showMessage('customerMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('customerMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Add Customer';
        }
    },

    async loadCustomers() {
        const tbody = document.getElementById('customersTableBody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #a0aec0;">Loading...</td></tr>';

        try {
            const includeChildren = document.getElementById('customerIncludeChildren')?.checked || false;
            const result = await API.getCustomers({ includeChildren });

            if (result.status === 'success' && result.customers.length > 0) {
                tbody.innerHTML = result.customers.map(customer => {
                    const date = new Date(customer.timestamp);
                    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    return `
                        <tr>
                            <td>${formattedDate}</td>
                            <td>${customer.name}</td>
                            <td>${customer.phone}</td>
                            <td>${customer.addedBy}</td>
                            <td>${this._esc(this._orgName(customer.orgId))}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #a0aec0;">No customers found</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #fc8181;">Error loading customers</td></tr>';
        }
    },

    // ── Loyalty Programme + Happy Hour ──────────────────────────────────────
    // Moved from Settings: two separate tabs/save buttons now, but both read
    // from and write to the same backend loyalty config object, so each save
    // must carry over the other's fields from this._loyaltyCfg to avoid
    // clobbering them.

    async loadLoyalty() {
        try {
            const res = await API.getLoyaltyConfig();
            if (res.status !== 'success') return;
            this._loyaltyCfg = res.loyalty || {};
            this._renderLoyalty();
        } catch (e) { /* silently ignore on page load */ }
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
            UI.showMessage('customerMessage', !isLive ? 'Happy Hour started.' : 'Happy Hour stopped.', 'success');
        } catch (err) {
            UI.showMessage('customerMessage', 'Failed to toggle Happy Hour: ' + err.message, 'error');
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

    // Owns: enabled, points name, earn rate, expiry, redemption, tiers.
    // Carries over happy-hour fields untouched from the last loaded config,
    // since the Happy Hour tab has its own separate save button.
    async saveLoyaltyProgramme() {
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

        const prev = this._loyaltyCfg || {};
        const loyalty = {
            enabled:             !!(get('loyaltyEnabled')?.checked),
            pointsName:          get('loyaltyPointsName')?.value.trim()       || 'Points',
            baseEarnRate:        parseFloat(get('loyaltyBaseEarnRate')?.value) || 1,
            expiryMonths:        parseInt(get('loyaltyExpiryMonths')?.value, 10) || 12,
            redemptionRate:      parseFloat(get('loyaltyRedemptionRate')?.value)  || 100,
            redemptionValue:     parseFloat(get('loyaltyRedemptionValue')?.value) || 1,
            minRedemption:       parseInt(get('loyaltyMinRedemption')?.value, 10) || 100,
            tiers,
            happyHourActive:     !!prev.happyHourActive,
            happyHourUntil:      prev.happyHourUntil || '',
            happyHourMultiplier: prev.happyHourMultiplier ?? 2,
            happyHourSchedules:  prev.happyHourSchedules || []
        };

        const btn = get('loyaltySaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const res = await API.updateLoyaltyConfig(loyalty);
            if (res.status !== 'success') throw new Error(res.message);
            this._loyaltyCfg = loyalty;
            UI.showMessage('customerMessage', 'Loyalty Programme saved.', 'success');
        } catch (err) {
            UI.showMessage('customerMessage', 'Failed to save Loyalty Programme: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Loyalty Programme'; }
        }
    },

    // Owns: multiplier, recurring schedule. Carries over loyalty-programme
    // fields untouched from the last loaded config. The manual on/off toggle
    // is separately owned by _toggleHappyHourNow (toggleHappyHour action),
    // not this save — carry that over too so saving the schedule here
    // doesn't silently cancel an in-progress happy hour.
    async saveHappyHour() {
        const get = id => document.getElementById(id);

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

        const prev = this._loyaltyCfg || {};
        const loyalty = {
            enabled:             !!prev.enabled,
            pointsName:          prev.pointsName || 'Points',
            baseEarnRate:        prev.baseEarnRate ?? 1,
            expiryMonths:        prev.expiryMonths ?? 12,
            redemptionRate:      prev.redemptionRate ?? 100,
            redemptionValue:     prev.redemptionValue ?? 1,
            minRedemption:       prev.minRedemption ?? 100,
            tiers:               prev.tiers || [],
            happyHourActive:     !!prev.happyHourActive,
            happyHourUntil:      prev.happyHourUntil || '',
            happyHourMultiplier: parseFloat(get('loyaltyHHMultiplier')?.value) || 2,
            happyHourSchedules:  schedule
        };

        const btn = get('loyaltyHHSaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const res = await API.updateHappyHourConfig(loyalty);
            if (res.status !== 'success') throw new Error(res.message);
            this._loyaltyCfg = loyalty;
            UI.showMessage('customerMessage', 'Happy Hour settings saved.', 'success');
        } catch (err) {
            UI.showMessage('customerMessage', 'Failed to save Happy Hour settings: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Happy Hour'; }
        }
    },

    _esc(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
};
