const Appointments = {
    currentDate: null,
    view: 'list',
    appointments: [],
    staff: [],
    services: [],
    customers: [],
    _dataLoaded: false,
    _editingId: null,

    init() {
        this.currentDate = this._todayStr();
        document.getElementById('apptPrevDay').addEventListener('click', () => this.changeDay(-1));
        document.getElementById('apptNextDay').addEventListener('click', () => this.changeDay(1));
        document.getElementById('apptTodayBtn').addEventListener('click', () => this.gotoToday());
        document.getElementById('apptNewBtn').addEventListener('click', () => this.openModal());
        document.getElementById('apptViewList').addEventListener('click', () => this.setView('list'));
        document.getElementById('apptViewDay').addEventListener('click', () => this.setView('day'));
        document.getElementById('apptBookingForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('apptModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('apptCancelFormBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('apptService').addEventListener('change', (e) => this._onServiceChange(e.target.value));
        document.getElementById('apptBookingModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('apptBookingModal')) this.closeModal();
        });
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
            this.staff     = (staffRes.staff      || []).filter(s => s.status === 'active');
            this.services  = (svcRes.services      || []).filter(s => s.status === 'active');
            this.customers = custRes.customers     || [];
        } catch (e) {
            console.error('Appointments: failed to load reference data', e);
        }
    },

    async _fetchAndRender() {
        document.getElementById('apptDateDisplay').textContent = this._fmtDateDisplay(this.currentDate);
        document.getElementById('apptContent').innerHTML =
            '<div class="appt-loading">Loading…</div>';
        try {
            const res = await API.getAppointments(this.currentDate);
            this.appointments = res.appointments || [];
            this._render();
        } catch (e) {
            document.getElementById('apptContent').innerHTML =
                '<div class="appt-loading" style="color:#fc8181;">Failed to load appointments.</div>';
        }
    },

    _render() {
        this.view === 'day' ? this._renderDayView() : this._renderListView();
    },

    // ── List View ──────────────────────────────────────────────────────────────

    _renderListView() {
        const appts = this.appointments;
        if (appts.length === 0) {
            document.getElementById('apptContent').innerHTML = `
                <div class="appt-empty">
                    <div class="appt-empty-icon">📅</div>
                    <div class="appt-empty-title">No appointments for this day</div>
                    <div class="appt-empty-sub">Tap "+ New Appointment" to book one</div>
                </div>`;
            return;
        }
        const rows = appts.map(a => this._listRow(a)).join('');
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
            const cards = (bySlot[slot] || []).map(a => this._dayCard(a)).join('');
            const isHour = slot.endsWith(':00');
            return `
            <div class="appt-slot${isHour ? ' appt-slot-hour' : ''}"
                 data-slot="${slot}"
                 onclick="Appointments._onSlotClick(event, '${slot}')">
                <div class="appt-slot-time">${slot}</div>
                <div class="appt-slot-body">${cards}</div>
            </div>`;
        }).join('');

        document.getElementById('apptContent').innerHTML =
            `<div class="appt-day-view">${slotHtml}</div>`;
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
        const id = a.appointmentId;
        const btn = (cls, label, fn) =>
            `<button class="appt-act-btn ${cls}" onclick="event.stopPropagation();${fn}">${label}</button>`;

        switch (a.status) {
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

    // ── Modal ──────────────────────────────────────────────────────────────────

    openModal(appointmentId = null, prefillTime = null) {
        this._editingId = appointmentId;
        document.getElementById('apptBookingForm').reset();
        document.getElementById('apptModalMsg').innerHTML = '';
        document.getElementById('apptModalTitle').textContent =
            appointmentId ? 'Edit Appointment' : 'New Appointment';
        document.getElementById('apptSaveBtn').textContent =
            appointmentId ? 'Save Changes' : 'Book Appointment';

        this._fillDropdowns();

        if (appointmentId) {
            const a = this.appointments.find(x => x.appointmentId === appointmentId);
            if (a) {
                document.getElementById('apptCustomer').value  = a.customerId;
                document.getElementById('apptService').value   = a.serviceId;
                document.getElementById('apptStaff').value     = a.staffId;
                const [d, t] = a.startTime.split('T');
                document.getElementById('apptDate').value      = d || '';
                document.getElementById('apptTime').value      = t ? t.substring(0, 5) : '';
                document.getElementById('apptDuration').value  = a.durationMins;
                document.getElementById('apptNotes').value     = a.notes || '';
            }
        } else {
            document.getElementById('apptDate').value = this.currentDate;
            if (prefillTime) {
                const t = prefillTime.split('T')[1];
                if (t) document.getElementById('apptTime').value = t.substring(0, 5);
            }
        }

        document.getElementById('apptBookingModal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('apptBookingModal').style.display = 'none';
        this._editingId = null;
    },

    _fillDropdowns() {
        const custSel = document.getElementById('apptCustomer');
        custSel.innerHTML = '<option value="">Select customer…</option>' +
            this.customers.map(c =>
                `<option value="${this._esc(c.phone)}">${this._esc(c.name)}${c.phone ? ' (' + c.phone + ')' : ''}</option>`
            ).join('');

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

    // ── Form Submit ────────────────────────────────────────────────────────────

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('apptSaveBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Saving…';

        const customerId   = document.getElementById('apptCustomer').value;
        const serviceId    = document.getElementById('apptService').value;
        const staffId      = document.getElementById('apptStaff').value;
        const date         = document.getElementById('apptDate').value;
        const time         = document.getElementById('apptTime').value;
        const durationMins = Number(document.getElementById('apptDuration').value) || 60;
        const notes        = document.getElementById('apptNotes').value.trim();

        const customer = this.customers.find(c => c.phone === customerId);
        const service  = this.services.find(s => s.id === serviceId);
        const staffMem = this.staff.find(s => s.id === staffId);

        const payload = {
            customerId,
            customerName:  customer?.name  || '',
            customerPhone: customer?.phone || customerId,
            serviceId,
            serviceName:   service?.name   || '',
            staffId,
            staffName:     staffMem?.name  || '',
            startTime:     `${date}T${time}:00`,
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
        } catch (err) {
            UI.showMessage('apptModalMsg', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this._editingId ? 'Save Changes' : 'Book Appointment';
        }
    },

    // ── Status Actions ─────────────────────────────────────────────────────────

    async setStatus(appointmentId, status) {
        try {
            const res = await API.updateAppointment({ appointmentId, status });
            if (res.status === 'success') await this._fetchAndRender();
        } catch (e) { console.error('setStatus failed', e); }
    },

    async doCancel(appointmentId) {
        if (!confirm('Cancel this appointment?')) return;
        await this.setStatus(appointmentId, 'cancelled');
    },

    convertToBill(appointmentId) {
        const a = this.appointments.find(x => x.appointmentId === appointmentId);
        if (!a) return;
        Navigation.switchPage('billing');
        if (Navigation._loaded.has('billing')) {
            Billing.prefillFromAppointment(a);
        } else {
            Billing._apptPrefill = a;
        }
        // Mark completed (fire-and-forget)
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

    _fmtTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    },

    _timeSlots() {
        const slots = [];
        for (let h = 8; h <= 21; h++) {
            slots.push(`${String(h).padStart(2, '0')}:00`);
            if (h < 21) slots.push(`${String(h).padStart(2, '0')}:30`);
        }
        return slots;
    },

    _slotKey(iso) {
        if (!iso) return '08:00';
        const d = new Date(iso);
        const h = d.getHours();
        const m = d.getMinutes() < 30 ? '00' : '30';
        return `${String(h).padStart(2, '0')}:${m}`;
    },

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};
