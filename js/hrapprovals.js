// HR Approvals — admin-side controller for attendance and advance approvals

const HRApprovals = {
    _shifts: [],
    _date:   '',

    init() {
        // Tab switching
        document.querySelectorAll('#hrapprovals .hra-tab').forEach(btn => {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
        });

        // Attendance: date picker + load button
        document.getElementById('hraAttDate')
            .addEventListener('change', () => this.loadAttendance());
        document.getElementById('hraAttLoadBtn')
            .addEventListener('click', () => this.loadAttendance());

        // Advances: load button
        document.getElementById('hraAdvLoadBtn')
            .addEventListener('click', () => this.loadAdvances());
    },

    load() {
        // Default date = today
        if (!document.getElementById('hraAttDate').value) {
            document.getElementById('hraAttDate').value = _hraToday();
        }
        this.loadAttendance();
        this.loadAdvances();
    },

    _switchTab(tab) {
        document.querySelectorAll('#hrapprovals .hra-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('hraTabAttendance').style.display = tab === 'attendance' ? 'block' : 'none';
        document.getElementById('hraTabAdvance').style.display    = tab === 'advance'    ? 'block' : 'none';
    },

    // ── Attendance Tab ─────────────────────────────────────────────────────────

    async loadAttendance() {
        const date = document.getElementById('hraAttDate').value || _hraToday();
        this._date = date;
        const msgEl = document.getElementById('hraAttMessage');
        _hraMsg(msgEl, '', '');

        document.getElementById('hraAttContent').style.display = 'none';
        document.getElementById('hraAttLoading').style.display = 'block';

        try {
            const res = await API.call('get_pending_attendance', { date });
            if (res.status !== 'success') throw new Error(res.message);

            this._shifts = res.shifts || [];
            this._renderPendingAttendance(res.pending || []);
            this._renderAbsentAttendance(res.absent  || []);
            document.getElementById('hraAttContent').style.display = 'block';
        } catch (err) {
            _hraMsg(msgEl, 'Failed to load: ' + err.message, 'error');
        } finally {
            document.getElementById('hraAttLoading').style.display = 'none';
        }
    },

    _shiftOptions(selectedId) {
        return this._shifts.map(s =>
            `<option value="${_hEsc(s.shiftId)}" ${s.shiftId === selectedId ? 'selected' : ''}>${_hEsc(s.name)}</option>`
        ).join('');
    },

    _renderPendingAttendance(pending) {
        const wrap  = document.getElementById('hraPendingAttWrap');
        const count = document.getElementById('hraPendingAttCount');
        count.textContent = pending.length;

        if (!pending.length) {
            wrap.innerHTML = '<p class="hra-empty">No pending submissions for this date. ✅</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th><th>Shift</th><th>Clock In</th><th>Clock Out</th>
            <th>Hrs Worked</th><th>OT Hrs</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${pending.map(r => `
              <tr id="hraAttRow-${_hEsc(r.attendanceId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td>
                  <select class="hra-shift-sel" data-id="${_hEsc(r.attendanceId)}">
                    ${this._shiftOptions(r.shiftId)}
                  </select>
                </td>
                <td><input type="time" class="hra-time-in"  data-id="${_hEsc(r.attendanceId)}" value="${_hEsc(r.clockIn)}"></td>
                <td><input type="time" class="hra-time-out" data-id="${_hEsc(r.attendanceId)}" value="${_hEsc(r.clockOut)}"></td>
                <td class="hra-hours-worked" data-id="${_hEsc(r.attendanceId)}">${r.hoursWorked.toFixed(2)}</td>
                <td class="hra-ot-hours"     data-id="${_hEsc(r.attendanceId)}">${r.otHours.toFixed(2)}</td>
                <td><span class="hra-badge hra-badge-${r.status}">${r.status}</span></td>
                <td class="hra-action-cell">
                  <button class="btn btn-primary hra-btn-sm"
                    onclick="HRApprovals.approveAttendanceRow('${_hEsc(r.attendanceId)}','${_hEsc(r.staffId)}')">
                    Approve</button>
                  <button class="btn btn-danger hra-btn-sm"
                    onclick="HRApprovals.rejectAttendanceRow('${_hEsc(r.attendanceId)}')">
                    Reject</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;

        // Live OT recalculation on time/shift change
        wrap.querySelectorAll('.hra-time-in, .hra-time-out, .hra-shift-sel').forEach(el => {
            el.addEventListener('change', () => this._recalcOT(el.dataset.id));
        });
    },

    _recalcOT(attendanceId) {
        const row      = document.getElementById(`hraAttRow-${attendanceId}`);
        if (!row) return;
        const clockIn  = row.querySelector('.hra-time-in').value;
        const clockOut = row.querySelector('.hra-time-out').value;
        const shiftId  = row.querySelector('.hra-shift-sel').value;
        const shift    = this._shifts.find(s => s.shiftId === shiftId);

        const { hoursWorked, otHours } = _hraCalcHours(clockIn, clockOut, shift);

        row.querySelector(`.hra-hours-worked`).textContent = hoursWorked.toFixed(2);
        row.querySelector(`.hra-ot-hours`).textContent     = otHours.toFixed(2);
    },

    async approveAttendanceRow(attendanceId, staffId) {
        const row     = document.getElementById(`hraAttRow-${attendanceId}`);
        const clockIn  = row.querySelector('.hra-time-in').value;
        const clockOut = row.querySelector('.hra-time-out').value;
        const shiftId  = row.querySelector('.hra-shift-sel').value;
        const msgEl    = document.getElementById('hraAttMessage');

        try {
            const res = await API.call('approve_attendance', {
                records: [{ attendanceId, staffId, date: this._date, shiftId, clockIn, clockOut }]
            });
            if (res.status !== 'success') throw new Error(res.message);
            row.remove();
            const remaining = document.querySelectorAll('#hraPendingAttWrap tbody tr').length;
            document.getElementById('hraPendingAttCount').textContent = remaining;
            _hraMsg(msgEl, 'Attendance approved.', 'success');
        } catch (err) {
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    async rejectAttendanceRow(attendanceId) {
        const msgEl = document.getElementById('hraAttMessage');
        try {
            const res = await API.call('reject_attendance', { attendanceId });
            if (res.status !== 'success') throw new Error(res.message);
            const row = document.getElementById(`hraAttRow-${attendanceId}`);
            if (row) {
                row.querySelector('.hra-badge').textContent = 'rejected';
                row.querySelector('.hra-badge').className  = 'hra-badge hra-badge-rejected';
                row.querySelector('.hra-action-cell').innerHTML = '<span style="color:#a0aec0;font-size:12px;">Rejected</span>';
            }
            _hraMsg(msgEl, 'Attendance rejected.', 'info');
        } catch (err) {
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    _renderAbsentAttendance(absent) {
        const wrap  = document.getElementById('hraAbsentWrap');
        const count = document.getElementById('hraAbsentCount');
        count.textContent = absent.length;

        if (!absent.length) {
            wrap.innerHTML = '<p class="hra-empty">All active staff have logged attendance. ✅</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th><th>Shift</th><th>Clock In</th><th>Clock Out</th><th>Action</th>
          </tr></thead>
          <tbody>
            ${absent.map(r => `
              <tr id="hraAbsRow-${_hEsc(r.staffId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td>
                  <select class="hra-shift-sel-abs" data-staffid="${_hEsc(r.staffId)}">
                    ${this._shiftOptions(r.shiftId)}
                  </select>
                </td>
                <td><input type="time" class="hra-abs-in"  data-staffid="${_hEsc(r.staffId)}" placeholder="leave blank if absent"></td>
                <td><input type="time" class="hra-abs-out" data-staffid="${_hEsc(r.staffId)}"></td>
                <td>
                  <button class="btn btn-primary hra-btn-sm"
                    onclick="HRApprovals.approveAbsent('${_hEsc(r.staffId)}')">
                    Mark Present / Absent</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    async approveAbsent(staffId) {
        const row      = document.getElementById(`hraAbsRow-${staffId}`);
        const shiftId  = row.querySelector('.hra-shift-sel-abs').value;
        const clockIn  = row.querySelector('.hra-abs-in').value;
        const clockOut = row.querySelector('.hra-abs-out').value;
        const msgEl    = document.getElementById('hraAttMessage');
        const dayStatus = (clockIn && clockOut) ? 'present' : 'absent';

        try {
            const res = await API.call('approve_attendance', {
                records: [{ staffId, date: this._date, shiftId, clockIn, clockOut, dayStatus }]
            });
            if (res.status !== 'success') throw new Error(res.message);
            row.remove();
            const remaining = document.querySelectorAll('#hraAbsentWrap tbody tr').length;
            document.getElementById('hraAbsentCount').textContent = remaining;
            _hraMsg(msgEl, `${dayStatus === 'present' ? 'Attendance approved' : 'Marked absent'}.`, 'success');
        } catch (err) {
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    // ── Advance Tab ───────────────────────────────────────────────────────────

    async loadAdvances() {
        const msgEl = document.getElementById('hraAdvMessage');
        _hraMsg(msgEl, '', '');

        document.getElementById('hraAdvContent').style.display = 'none';
        document.getElementById('hraAdvLoading').style.display = 'block';

        try {
            const res = await API.call('get_pending_advances', {});
            if (res.status !== 'success') throw new Error(res.message);
            this._renderPendingAdvances(res.pending  || []);
            this._renderApprovedAdvances(res.approved || []);
            document.getElementById('hraAdvContent').style.display = 'block';
        } catch (err) {
            _hraMsg(msgEl, 'Failed to load: ' + err.message, 'error');
        } finally {
            document.getElementById('hraAdvLoading').style.display = 'none';
        }
    },

    _renderPendingAdvances(pending) {
        const wrap  = document.getElementById('hraPendingAdvWrap');
        const count = document.getElementById('hraPendingAdvCount');
        count.textContent = pending.length;
        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (!pending.length) {
            wrap.innerHTML = '<p class="hra-empty">No pending advance requests. ✅</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th><th>Date</th><th>Requested</th><th>Approve Amount</th><th>Notes</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${pending.map(r => `
              <tr id="hraAdvRow-${_hEsc(r.advanceId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td>${_hEsc(r.date)}</td>
                <td class="hra-amt">${fmt(r.amount)}</td>
                <td>
                  <input type="number" class="hra-approve-amt" data-id="${_hEsc(r.advanceId)}"
                    value="${r.amount}" min="1" step="0.01" style="width:110px;">
                </td>
                <td>${_hEsc(r.notes)}</td>
                <td class="hra-action-cell">
                  <button class="btn btn-primary hra-btn-sm"
                    onclick="HRApprovals.approveAdvanceRow('${_hEsc(r.advanceId)}')">
                    Approve</button>
                  <button class="btn btn-danger hra-btn-sm"
                    onclick="HRApprovals.rejectAdvanceRow('${_hEsc(r.advanceId)}')">
                    Reject</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    async approveAdvanceRow(advanceId) {
        const row    = document.getElementById(`hraAdvRow-${advanceId}`);
        const approvedAmount = parseFloat(row.querySelector('.hra-approve-amt').value) || 0;
        const msgEl  = document.getElementById('hraAdvMessage');
        try {
            const res = await API.call('approve_advance', { advanceId, approvedAmount });
            if (res.status !== 'success') throw new Error(res.message);
            _hraMsg(msgEl, 'Advance approved — awaiting disbursal.', 'success');
            await this.loadAdvances();
        } catch (err) {
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    async rejectAdvanceRow(advanceId) {
        const msgEl = document.getElementById('hraAdvMessage');
        try {
            const res = await API.call('reject_advance', { advanceId });
            if (res.status !== 'success') throw new Error(res.message);
            _hraMsg(msgEl, 'Advance rejected.', 'info');
            await this.loadAdvances();
        } catch (err) {
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    _renderApprovedAdvances(approved) {
        const wrap  = document.getElementById('hraApprovedAdvWrap');
        const count = document.getElementById('hraApprovedAdvCount');
        count.textContent = approved.length;
        const fmt = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (!approved.length) {
            wrap.innerHTML = '<p class="hra-empty">No approved advances awaiting disbursal.</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th><th>Date</th><th>Requested</th><th>Approved</th><th>Notes</th>
            <th>Payment Mode</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${approved.map(r => `
              <tr id="hraAdvDisRow-${_hEsc(r.advanceId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td>${_hEsc(r.date)}</td>
                <td class="hra-amt">${fmt(r.amount)}</td>
                <td class="hra-amt"><strong>${fmt(r.approvedAmount)}</strong></td>
                <td>${_hEsc(r.notes)}</td>
                <td>
                  <select class="hra-pay-mode" data-id="${_hEsc(r.advanceId)}" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:5px;font-size:13px;">
                    <option value="">-- Select --</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </td>
                <td class="hra-action-cell">
                  <button class="btn btn-primary hra-btn-sm"
                    onclick="HRApprovals.disburseAdvanceRow('${_hEsc(r.advanceId)}')">
                    Disburse</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    async disburseAdvanceRow(advanceId) {
        const row         = document.getElementById(`hraAdvDisRow-${advanceId}`);
        const paymentMode = row.querySelector('.hra-pay-mode').value;
        const msgEl       = document.getElementById('hraAdvMessage');
        if (!paymentMode) {
            _hraMsg(msgEl, 'Please select a payment mode before disbursing.', 'error');
            return;
        }
        try {
            const res = await API.call('disburse_advance', { advanceId, paymentMode });
            if (res.status !== 'success') throw new Error(res.message);
            _hraMsg(msgEl, `Disbursed via ${paymentMode}. New balance: ₹${Number(res.newBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`, 'success');
            await this.loadAdvances();
        } catch (err) {
            _hraMsg(msgEl, err.message, 'error');
        }
    },
};

// ── Module helpers ───────────────────────────────────────────────────────────
function _hraToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _hEsc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _hraMsg(el, text, type) {
    if (!el) return;
    el.textContent   = text;
    el.className     = text ? `message ${type} show` : 'message';
    el.style.display = text ? 'block' : 'none';
}
function _hraCalcHours(clockIn, clockOut, shift) {
    if (!clockIn || !clockOut) return { hoursWorked: 0, otHours: 0 };
    const toMins  = t => { const [h, m] = (t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const breakMins  = shift ? (shift.breakMins || 0) : 0;
    const shiftMins  = shift ? Math.max(0, toMins(shift.endTime) - toMins(shift.startTime) - breakMins) : 0;
    const shiftHours = shiftMins / 60;
    const worked     = Math.max(0, toMins(clockOut) - toMins(clockIn) - breakMins);
    const hoursWorked = Math.round((worked / 60) * 100) / 100;
    const otHours     = Math.round(Math.max(0, hoursWorked - shiftHours) * 100) / 100;
    return { hoursWorked, otHours };
}
