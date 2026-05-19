const Appointments = {
    currentDate: null,
    view: 'list',
    appointments: [],
    staff: [],
    services: [],
    customers: [],
    _dataLoaded: false,
    _editingId: null,
    _custPhone: '',
    _custId: null,
    _custName: '',
    _custTimer: null,

    init() {
        this.currentDate = this._todayStr();

        document.getElementById('apptPrevDay').addEventListener('click', () => this.changeDay(-1));
        document.getElementById('apptNextDay').addEventListener('click', () => this.changeDay(1));
        document.getElementById('apptTodayBtn').addEventListener('click', () => this.gotoToday());
        document.getElementById('apptNewBtn').addEventListener('click', () => this.openModal());
        document.getElementById('apptViewList').addEventListener('click', () => this.setView('list'));
        document.getElementById('apptViewDay').addEventListener('click', () => this.setView('day'));
        document.getElementById('apptBookingForm').addEventListener('submit', e => this.handleSubmit(e));
        document.getElementById('apptModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('apptCancelFormBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('apptService').addEventListener('change', e => this._onServiceChange(e.target.value));
        document.getElementById('apptBookingModal').addEventListener('click', e => {
            if (e.target === document.getElementById('apptBookingModal')) this.closeModal();
        });

        // Phone lookup
        document.getElementById('apptCustPhone').addEventListener('input', e => {
            clearTimeout(this._custTimer);
            this._custTimer = setTimeout(() => this._lookupCust(e.target.value.trim()), 400);
        });

        // Inline new-customer form
        document.getElementById('apptSaveNewCust').addEventListener('click', () => this._saveNewCust());
        document.getElementById('apptCancelNewCust').addEventListener('click', () => this._hideNewCust());

        this._buildHourSelect();
    },

    _buildHourSelect() {
        const sel = document.getElementById('apptHour');
        sel.innerHTML = '';
        for (let h = 7; h <= 21; h++) {
            const opt = document.createElement('option');
            opt.value = String(h).padStart(2, '0');
            const ampm   = h < 12 ? 'AM' : 'PM';
            const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
            opt.textContent = `${display} ${ampm}`;
            sel.appendChild(opt);
        }
    },

    async load() {
        if (!this._dataLoaded) {
            await this._loadReferenceData();
            this._dataLoaded = true;
        }
        await this._fetchAndRender();
    },

    async _loadReferenceData() {
        try {
            const [staffRes, svcRes, custRes] = await Promise.all([
                API.getStaff(), API.getServices(), API.getCustomers()
            ]);
            this.staff     = (staffRes.staff    || []).filter(s => s.status === 'active');
            this.services  = (svcRes.services   || []).filter(s => s.status === 'active');
            this.customers = custRes.customers  || [];
        } catch(e) {
            console.error('Appointments: failed to load reference data', e);
        }
    },

    async _fetchAndRender() {
        document.getElementById('apptDateDisplay').textContent = this._fmtDateDisplay(this.currentDate);
        document.getElementById('apptContent').innerHTML = '<div class="appt-loading">Loading…</div>';
        try {
            const res = await API.getAppointments(this.currentDate);
            this.appointments = res.appointments || [];
            this._render();
        } catch(e) {
            document.getElementById('apptContent').innerHTML =
                '<div class="appt-loading" style="color:#fc8181;">Failed to load appointments.</div>';
        }
    },

    _render() {
        this.view === 'day' ? this._renderDayView() : this._renderListView();
    },

    // ── List View ──────────────────────────────────────────────────────────────

    _renderListView() {
        if (!this.appointments.length) {
            document.getElementById('apptContent').innerHTML = `
                <div class="appt-empty">
                    <div class="appt-empty-icon">📅</div>
                    <div class="appt-empty-title">No appointments for this day</div>
                    <div class="appt-empty-sub">Tap "+ New Appointment" to book one</div>
                </div>`;
            return;
        }
        const rows = this.appointments.map(a => this._listRow(a)).join('');
        document.getElementById('apptContent').innerHTML = `<div class="appt-list">${rows}</div>`;
    },

    _listRow(a) {
        return `
        <div class="appt-list-row" data-id="${a.appointmentId}">
            <div class="appt-time-col">
                <div class="appt-time">${this._fmtTime(a.startTime)}</div>
                <div class="appt-dur">${a.durationMins}min</div>
            </div>
            <div class="appt-info-col">
                <div class="appt-customer-name">${this._esc(a.customerName) || '—'}</div>
                <div class="appt-detail-line">${this._esc(a.serviceName)} · ${this._esc(a.staffName)}</div>
                ${a.notes ? `<div class="appt-notes-line">${this._esc(a.notes)}</div>` : ''}
            </div>
            <div class="appt-right-col">
                ${this._badge(a.status)}
                <div class="appt-action-row">${this._actions(a)}</div>
            </div>
        </div>`;
    },

    // ── Day / Timeline View ────────────────────────────────────────────────────

    _renderDayView() {
        const slots = this._timeSlots();
        const bySlot = {};
        this.appointments.forEach(a => {
            const key = this._slotKey(a.startTime);
            (bySlot[key] = bySlot[key] || []).push(a);
        });

        const slotHtml = slots.map(slot => {
            const cards  = (bySlot[slot] || []).map(a => this._dayCard(a)).join('');
            const isHour = slot.endsWith(':00');
            return `
            <div class="appt-slot${isHour ? ' appt-slot-hour' : ''}"
                 data-slot="${slot}"
                 onclick="Appointments._onSlotClick(event,'${slot}')">
                <div class="appt-slot-time">${slot}</div>
                <div class="appt-slot-body">${cards}</div>
            </div>`;
        }).join('');

        document.getElementById('apptContent').innerHTML = `<div class="appt-day-view">${slotHtml}</div>`;
    },

    _dayCard(a) {
        return `
        <div class="appt-day-card appt-card-${a.status}" data-id="${a.appointmentId}"
             onclick="event.stopPropagation()">
            <div class="appt-day-card-top">
                <div>
                    <div class="appt-customer-name">${this._esc(a.customerName) || '—'}</div>
                    <div class="appt-detail-line">${this._esc(a.serviceName)} · ${this._esc(a.staffName)} · ${a.durationMins}min</div>
                    ${a.notes ? `<div class="appt-notes-line">${this._esc(a.notes)}</div>` : ''}
                </div>
                ${this._badge(a.status)}
            </div>
            <div class="appt-action-row">${this._actions(a)}</div>
        </div>`;
    },

    _onSlotClick(event, slot) {
        if (event.target.closest('.appt-day-card')) return;
        this.openModal(null, `${this.currentDate}T${slot}`);
    },

    // ── Status Badge & Action Buttons ──────────────────────────────────────────

    _badge(status) {
        const labels = { booked: 'Booked', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No Show' };
        return `<span class="appt-badge appt-badge-${status}">${labels[status] || status}</span>`;
    },

    _actions(a) {
        const id  = a.appointmentId;
        const btn = (cls, label, fn) =>
            `<button class="appt-act-btn ${cls}" onclick="event.stopPropagation();${fn}">${label}</button>`;

        switch(a.status) {
            case 'booked':
                return [
                    btn('appt-btn-confirm',  'Confirm',  `Appointments.setStatus('${id}','confirmed')`),
                    btn('appt-btn-edit',     'Edit',     `Appointments.openModal('${id}')`),
                    btn('appt-btn-cancel',   'Cancel',   `Appointments.doCancel('${id}')`)
                ].join('');
            case 'confirmed':
                return [
                    btn('appt-btn-complete', 'Complete', `Appointments.setStatus('${id}','completed')`),
                    btn('appt-btn-noshow',   'No Show',  `Appointments.setStatus('${id}','no-show')`),
                    btn('appt-btn-edit',     'Edit',     `Appointments.openModal('${id}')`),
                    btn('appt-btn-cancel',   'Cancel',   `Appointments.doCancel('${id}')`)
                ].join('');
            case 'completed':
                return a.billId
                    ? `<span class="appt-billed-tag">✓ Billed</span>`
                    : btn('appt-btn-bill', 'Create Bill', `Appointments.convertToBill('${id}')`);
            default:
                return '';
        }
    },

    // ── Customer Phone Lookup ──────────────────────────────────────────────────

    _lookupCust(phone, knownName) {
        const infoEl = document.getElementById('apptCustInfo');
        this._custPhone = phone;
        this._custId    = null;
        this._custName  = '';

        if (!phone) {
            infoEl.textContent = '';
            infoEl.style.color = '';
            this._hideNewCust();
            return;
        }

        // Edit path: caller already knows the name — skip API round-trip
        if (knownName) {
            this._custId   = phone;
            this._custName = knownName;
            infoEl.textContent = knownName;
            infoEl.style.color = '#38a169';
            this._hideNewCust();
            return;
        }

        const match = this.customers.find(c => String(c.phone).trim() === String(phone).trim());
        if (match) {
            this._custId   = String(match.phone).trim();
            this._custName = match.name;
            infoEl.textContent = match.name;
            infoEl.style.color = '#38a169';
            this._hideNewCust();
        } else if (phone.length >= 10) {
            infoEl.innerHTML = 'Customer not found — <a href="#" style="color:#667eea;" id="apptAddCustLink">Add new customer</a>';
            infoEl.style.color = '#e53e3e';
            const link = document.getElementById('apptAddCustLink');
            if (link) link.addEventListener('click', e => { e.preventDefault(); this._showNewCust(); });
        } else {
            infoEl.textContent = '';
            infoEl.style.color = '';
            this._hideNewCust();
        }
    },

    _showNewCust() {
        document.getElementById('apptNewCustBox').style.display = 'block';
        document.getElementById('apptNewCustName').value = '';
        setTimeout(() => document.getElementById('apptNewCustName').focus(), 50);
    },

    _hideNewCust() {
        document.getElementById('apptNewCustBox').style.display = 'none';
        document.getElementById('apptNewCustName').value = '';
    },

    async _saveNewCust() {
        const name  = document.getElementById('apptNewCustName').value.trim();
        const phone = document.getElementById('apptCustPhone').value.trim();
        if (!name || !phone) return;

        const btn = document.getElementById('apptSaveNewCust');
        btn.disabled    = true;
        btn.textContent = '…';
        try {
            const res = await API.addCustomer({ name, phone });
            if (res.status === 'success') {
                this.customers.push({ name, phone });
                this._custId   = String(phone).trim();
                this._custName = name;
                this._custPhone = phone;
                const infoEl = document.getElementById('apptCustInfo');
                infoEl.textContent = name;
                infoEl.style.color = '#38a169';
                this._hideNewCust();
            } else {
                alert(res.message || 'Error saving customer');
            }
        } catch(err) {
            alert('Error saving customer. Please try again.');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Add';
        }
    },

    // ── Modal ──────────────────────────────────────────────────────────────────

    openModal(appointmentId = null, prefillTime = null) {
        this._editingId = appointmentId;
        this._custPhone = '';
        this._custId    = null;
        this._custName  = '';

        document.getElementById('apptBookingForm').reset();
        document.getElementById('apptModalMsg').innerHTML = '';
        document.getElementById('apptCustInfo').textContent = '';
        document.getElementById('apptCustInfo').style.color = '';
        this._hideNewCust();

        document.getElementById('apptModalTitle').textContent =
            appointmentId ? 'Edit Appointment' : 'New Appointment';
        document.getElementById('apptSaveBtn').textContent =
            appointmentId ? 'Save Changes' : 'Book Appointment';

        this._fillDropdowns();

        if (appointmentId) {
            const a = this.appointments.find(x => x.appointmentId === appointmentId);
            if (a) {
                const phone = a.customerPhone || a.customerId;
                document.getElementById('apptCustPhone').value = phone;
                this._lookupCust(phone, a.customerName);

                document.getElementById('apptService').value  = a.serviceId;
                document.getElementById('apptStaff').value    = a.staffId;
                document.getElementById('apptDuration').value = a.durationMins;
                document.getElementById('apptNotes').value    = a.notes || '';

                const [d, t] = a.startTime.split('T');
                document.getElementById('apptDate').value = d || '';
                if (t) {
                    const [hh, mm] = t.split(':');
                    document.getElementById('apptHour').value   = hh;
                    document.getElementById('apptMinute').value = (mm || '00').substring(0, 2);
                }
            }
        } else {
            document.getElementById('apptDate').value = this.currentDate;
            if (prefillTime) {
                const t = prefillTime.split('T')[1];
                if (t) {
                    const [hh, mm] = t.split(':');
                    document.getElementById('apptHour').value   = hh;
                    document.getElementById('apptMinute').value = (mm || '00').substring(0, 2);
                }
            } else {
                const dt = this._defaultTime();
                document.getElementById('apptHour').value   = dt.hour;
                document.getElementById('apptMinute').value = dt.minute;
            }
        }

        document.getElementById('apptBookingModal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('apptBookingModal').style.display = 'none';
        this._editingId = null;
        this._custId    = null;
        this._custName  = '';
    },

    _fillDropdowns() {
        const svcSel = document.getElementById('apptService');
        svcSel.innerHTML = '<option value="">Select service…</option>' +
            this.services.map(s =>
                `<option value="${s.id}" data-dur="${s.duration || 60}">${this._esc(s.name)}</option>`
            ).join('');

        const staffSel = document.getElementById('apptStaff');
        staffSel.innerHTML = '<option value="">Select staff…</option>' +
            this.staff.map(s =>
                `<option value="${s.id}">${this._esc(s.name)}</option>`
            ).join('');
    },

    _onServiceChange(serviceId) {
        const opt = document.querySelector(`#apptService option[value="${serviceId}"]`);
        if (opt && opt.dataset.dur) {
            document.getElementById('apptDuration').value = opt.dataset.dur;
        }
    },

    _defaultTime() {
        const now = new Date();
        let h = now.getHours();
        let m = Math.ceil(now.getMinutes() / 15) * 15;
        if (m >= 60) { h += 1; m = 0; }
        h = Math.max(7, Math.min(h, 21));
        return { hour: String(h).padStart(2, '0'), minute: String(m).padStart(2, '0') };
    },

    // ── Form Submit ────────────────────────────────────────────────────────────

    async handleSubmit(e) {
        e.preventDefault();

        if (!this._custId) {
            UI.showMessage('apptModalMsg', 'Please enter a valid customer phone number.', 'error');
            document.getElementById('apptCustPhone').focus();
            return;
        }

        const saveBtn = document.getElementById('apptSaveBtn');
        saveBtn.disabled    = true;
        saveBtn.textContent = 'Saving…';

        const serviceId    = document.getElementById('apptService').value;
        const staffId      = document.getElementById('apptStaff').value;
        const date         = document.getElementById('apptDate').value;
        const hour         = document.getElementById('apptHour').value;
        const minute       = document.getElementById('apptMinute').value;
        const durationMins = Number(document.getElementById('apptDuration').value) || 60;
        const notes        = document.getElementById('apptNotes').value.trim();

        const service  = this.services.find(s => s.id === serviceId);
        const staffMem = this.staff.find(s => s.id === staffId);

        const payload = {
            customerId:    this._custId,
            customerName:  this._custName,
            customerPhone: this._custPhone || this._custId,
            serviceId,
            serviceName:   service?.name  || '',
            staffId,
            staffName:     staffMem?.name || '',
            startTime:     `${date}T${hour}:${minute}:00`,
            durationMins,
            notes,
            createdBy:     Auth.currentUser?.fullName || ''
        };

        try {
            const res = this._editingId
                ? await API.updateAppointment({ ...payload, appointmentId: this._editingId })
                : await API.saveAppointment(payload);

            if (res.status === 'success') {
                this.closeModal();
                await this._fetchAndRender();
                UI.showMessage('apptPageMsg',
                    this._editingId ? 'Appointment updated.' : 'Appointment booked!', 'success');
            } else {
                UI.showMessage('apptModalMsg', res.message || 'Failed to save.', 'error');
            }
        } catch(err) {
            UI.showMessage('apptModalMsg', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled    = false;
            saveBtn.textContent = this._editingId ? 'Save Changes' : 'Book Appointment';
        }
    },

    // ── Status Actions ─────────────────────────────────────────────────────────

    async setStatus(appointmentId, status) {
        UI.showLoading();
        try {
            const res = await API.updateAppointment({ appointmentId, status });
            if (res.status === 'success') {
                await this._fetchAndRender();
                const msgs = {
                    confirmed:  'Appointment confirmed.',
                    completed:  'Appointment completed.',
                    'no-show':  'Marked as no-show.',
                    cancelled:  'Appointment cancelled.'
                };
                UI.showMessage('apptPageMsg', msgs[status] || 'Status updated.', 'success');
            } else {
                UI.showMessage('apptPageMsg', res.message || 'Failed to update status.', 'error');
            }
        } catch(e) {
            UI.showMessage('apptPageMsg', 'Network error. Please try again.', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async doCancel(appointmentId) {
        if (!confirm('Cancel this appointment?')) return;
        await this.setStatus(appointmentId, 'cancelled');
    },

    convertToBill(appointmentId) {
        const a = this.appointments.find(x => x.appointmentId === appointmentId);
        if (!a) return;
        // Check BEFORE switchPage — switchPage adds 'billing' to _loaded immediately
        const alreadyLoaded = Navigation._loaded.has('billing');
        Navigation.switchPage('billing');
        if (alreadyLoaded) {
            Billing.prefillFromAppointment(a);
        } else {
            Billing._apptPrefill = a;
        }
        API.updateAppointment({ appointmentId, status: 'completed' }).catch(() => {});
    },

    // ── Navigation ─────────────────────────────────────────────────────────────

    changeDay(delta) {
        const d = new Date(this.currentDate + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        this.currentDate = this._dateStr(d);
        this._fetchAndRender();
    },

    gotoToday() {
        this.currentDate = this._todayStr();
        this._fetchAndRender();
    },

    setView(v) {
        this.view = v;
        document.getElementById('apptViewList').classList.toggle('active', v === 'list');
        document.getElementById('apptViewDay').classList.toggle('active', v === 'day');
        this._render();
    },

    // ── Helpers ────────────────────────────────────────────────────────────────

    _todayStr() { return this._dateStr(new Date()); },
    _dateStr(d) { return d.toISOString().split('T')[0]; },

    _fmtDateDisplay(ds) {
        const d        = new Date(ds + 'T00:00:00');
        const today    = this._todayStr();
        const tomorrow = this._dateStr(new Date(Date.now() + 86400000));
        const yest     = this._dateStr(new Date(Date.now() - 86400000));
        const short    = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        if (ds === today)    return `Today, ${short}`;
        if (ds === tomorrow) return `Tomorrow, ${short}`;
        if (ds === yest)     return `Yesterday, ${short}`;
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    },

    // Parse time directly from ISO string — avoids timezone shifting via new Date()
    _fmtTime(iso) {
        if (!iso) return '—';
        const t = iso.split('T')[1];
        if (!t) return '—';
        const [hh, mm] = t.split(':');
        const h      = parseInt(hh, 10);
        const suffix = h < 12 ? 'AM' : 'PM';
        const disp   = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${disp}:${mm || '00'} ${suffix}`;
    },

    // 15-minute slot resolution (8:00 → 21:00)
    _timeSlots() {
        const slots = [];
        for (let h = 8; h <= 21; h++) {
            for (const m of ['00', '15', '30', '45']) {
                if (h === 21 && m !== '00') continue;
                slots.push(`${String(h).padStart(2, '0')}:${m}`);
            }
        }
        return slots;
    },

    // Snap appointment time to nearest 15-min boundary for timeline placement
    _slotKey(iso) {
        if (!iso) return '08:00';
        const t = iso.split('T')[1];
        if (!t) return '08:00';
        const [hh, mmStr] = t.split(':');
        const h    = parseInt(hh, 10) || 8;
        const mm   = parseInt(mmStr, 10) || 0;
        const snap = Math.floor(mm / 15) * 15;
        return `${String(h).padStart(2, '0')}:${String(snap).padStart(2, '0')}`;
    },

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};
