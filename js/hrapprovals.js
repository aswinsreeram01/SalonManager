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
        const date  = document.getElementById('hraAttDate').value || _hraToday();
        this._date  = date;
        const msgEl = document.getElementById('hraAttMessage');
        _hraMsg(msgEl, '', '');

        document.getElementById('hraAttContent').style.display = 'none';
        document.getElementById('hraAttLoading').style.display = 'block';

        try {
            const res = await API.call('get_pending_attendance', { date });
            if (res.status !== 'success') throw new Error(res.message);
            this._shifts = res.shifts || [];
            this._renderPendingAttendance(res.pending || []);
            this._renderAbsentAttendance(res.absent   || []);
            document.getElementById('hraAttContent').style.display = 'block';
        } catch (err) {
            _hraMsg(msgEl, 'Failed to load: ' + err.message, 'error');
        } finally {
            document.getElementById('hraAttLoading').style.display = 'none';
        }
    },

    _shiftOptions(selectedId) {
        return `<option value="">No shift</option>` +
            this._shifts.map(s =>
                `<option value="${_hEsc(s.shiftId)}" ${s.shiftId === selectedId ? 'selected' : ''}>${_hEsc(s.name)}</option>`
            ).join('');
    },

    _renderPendingAttendance(pending) {
        const wrap  = document.getElementById('hraPendingAttWrap');
        const count = document.getElementById('hraPendingAttCount');
        count.textContent = pending.length;

        if (!pending.length) {
            wrap.innerHTML = '<p class="hra-empty">No pending submissions for this date ✅</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Hrs</th>
            <th>OT</th>
            <th>Shift</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${pending.map(r => `
              <tr id="hraAttRow-${_hEsc(r.attendanceId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td><input type="time" class="hra-time-in"  data-id="${_hEsc(r.attendanceId)}" value="${_hEsc(r.clockIn)}"></td>
                <td><input type="time" class="hra-time-out" data-id="${_hEsc(r.attendanceId)}" value="${_hEsc(r.clockOut)}"></td>
                <td class="hra-num hra-hours-worked" data-id="${_hEsc(r.attendanceId)}">${Number(r.hoursWorked || 0).toFixed(2)}</td>
                <td class="hra-num hra-ot-hours"     data-id="${_hEsc(r.attendanceId)}">${Number(r.otHours || 0).toFixed(2)}</td>
                <td>
                  <select class="hra-shift-sel" data-id="${_hEsc(r.attendanceId)}" style="min-width:90px;">
                    ${this._shiftOptions(r.shiftId)}
                  </select>
                </td>
                <td><span class="hra-badge hra-badge-${_hEsc(r.status)}">${_hEsc(r.status)}</span></td>
                <td>
                  <div class="hra-btn-group">
                    <button class="btn btn-primary hra-btn-sm"
                      onclick="HRApprovals.approveAttendanceRow('${_hEsc(r.attendanceId)}','${_hEsc(r.staffId)}',this)">✓</button>
                    <button class="btn btn-danger hra-btn-sm"
                      onclick="HRApprovals.rejectAttendanceRow('${_hEsc(r.attendanceId)}',this)">✕</button>
                  </div>
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
        const row = document.getElementById(`hraAttRow-${attendanceId}`);
        if (!row) return;
        const clockIn  = row.querySelector('.hra-time-in').value;
        const clockOut = row.querySelector('.hra-time-out').value;
        const shiftSel = row.querySelector('.hra-shift-sel');
        const shiftId  = shiftSel ? shiftSel.value : '';
        const shift    = this._shifts.find(s => s.shiftId === shiftId) || null;

        const { hoursWorked, otHours } = _hraCalcHours(clockIn, clockOut, shift);
        row.querySelector('.hra-hours-worked').textContent = Number(hoursWorked || 0).toFixed(2);
        row.querySelector('.hra-ot-hours').textContent     = Number(otHours || 0).toFixed(2);
    },

    async approveAttendanceRow(attendanceId, staffId, btn) {
        const row      = document.getElementById(`hraAttRow-${attendanceId}`);
        const clockIn  = row.querySelector('.hra-time-in').value;
        const clockOut = row.querySelector('.hra-time-out').value;
        const shiftSel = row.querySelector('.hra-shift-sel');
        const shiftId  = shiftSel ? shiftSel.value : '';
        const msgEl    = document.getElementById('hraAttMessage');

        _hraBtnLoading(btn, true);
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
            _hraBtnLoading(btn, false, '✓');
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    async rejectAttendanceRow(attendanceId, btn) {
        const msgEl = document.getElementById('hraAttMessage');
        _hraBtnLoading(btn, true);
        try {
            const res = await API.call('reject_attendance', { attendanceId });
            if (res.status !== 'success') throw new Error(res.message);
            const row = document.getElementById(`hraAttRow-${attendanceId}`);
            if (row) {
                row.querySelector('.hra-badge').textContent = 'rejected';
                row.querySelector('.hra-badge').className  = 'hra-badge hra-badge-rejected';
                row.querySelector('.hra-btn-group').innerHTML = '<span style="color:#a0aec0;font-size:12px;">Rejected</span>';
            }
            _hraMsg(msgEl, 'Attendance rejected.', 'info');
        } catch (err) {
            _hraBtnLoading(btn, false, '✕');
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    _renderAbsentAttendance(absent) {
        const wrap  = document.getElementById('hraAbsentWrap');
        const count = document.getElementById('hraAbsentCount');
        count.textContent = absent.length;

        if (!absent.length) {
            wrap.innerHTML = '<p class="hra-empty">All active staff have logged attendance ✅</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Hrs</th>
            <th>OT</th>
            <th>Shift</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${absent.map(r => `
              <tr id="hraAbsRow-${_hEsc(r.staffId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td><input type="time" class="hra-abs-in"  data-staffid="${_hEsc(r.staffId)}" value=""></td>
                <td><input type="time" class="hra-abs-out" data-staffid="${_hEsc(r.staffId)}" value=""></td>
                <td class="hra-num hra-abs-hrs"  data-staffid="${_hEsc(r.staffId)}">0.00</td>
                <td class="hra-num hra-abs-ot"   data-staffid="${_hEsc(r.staffId)}">0.00</td>
                <td>
                  <select class="hra-shift-sel-abs" data-staffid="${_hEsc(r.staffId)}" style="min-width:90px;">
                    ${this._shiftOptions(r.shiftId)}
                  </select>
                </td>
                <td>
                  <div class="hra-btn-group">
                    <button class="btn btn-primary hra-btn-sm"
                      onclick="HRApprovals.approveAbsent('${_hEsc(r.staffId)}',this)">Save</button>
                    <button class="btn btn-danger hra-btn-sm"
                      onclick="HRApprovals.markAbsent('${_hEsc(r.staffId)}',this)">Absent</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;

        // Live OT recalculation for absent rows
        wrap.querySelectorAll('.hra-abs-in, .hra-abs-out, .hra-shift-sel-abs').forEach(el => {
            el.addEventListener('change', () => this._recalcAbsOT(el.dataset.staffid));
        });
    },

    _recalcAbsOT(staffId) {
        const row = document.getElementById(`hraAbsRow-${staffId}`);
        if (!row) return;
        const clockIn  = row.querySelector('.hra-abs-in').value;
        const clockOut = row.querySelector('.hra-abs-out').value;
        const shiftSel = row.querySelector('.hra-shift-sel-abs');
        const shiftId  = shiftSel ? shiftSel.value : '';
        const shift    = this._shifts.find(s => s.shiftId === shiftId) || null;

        const { hoursWorked, otHours } = _hraCalcHours(clockIn, clockOut, shift);
        row.querySelector('.hra-abs-hrs').textContent = Number(hoursWorked || 0).toFixed(2);
        row.querySelector('.hra-abs-ot').textContent  = Number(otHours || 0).toFixed(2);
    },

    async approveAbsent(staffId, btn) {
        const row      = document.getElementById(`hraAbsRow-${staffId}`);
        const shiftId  = row.querySelector('.hra-shift-sel-abs').value;
        const clockIn  = row.querySelector('.hra-abs-in').value;
        const clockOut = row.querySelector('.hra-abs-out').value;
        const msgEl    = document.getElementById('hraAttMessage');

        if (!clockIn || !clockOut) {
            _hraMsg(msgEl, 'Enter both Clock In and Clock Out to save as present, or use Absent.', 'error');
            return;
        }

        _hraBtnLoading(btn, true);
        try {
            const res = await API.call('approve_attendance', {
                records: [{ staffId, date: this._date, shiftId, clockIn, clockOut, dayStatus: 'present' }]
            });
            if (res.status !== 'success') throw new Error(res.message);
            row.remove();
            const remaining = document.querySelectorAll('#hraAbsentWrap tbody tr').length;
            document.getElementById('hraAbsentCount').textContent = remaining;
            _hraMsg(msgEl, 'Marked present.', 'success');
        } catch (err) {
            _hraBtnLoading(btn, false, 'Save');
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    async markAbsent(staffId, btn) {
        const row     = document.getElementById(`hraAbsRow-${staffId}`);
        const shiftId = row.querySelector('.hra-shift-sel-abs').value;
        const msgEl   = document.getElementById('hraAttMessage');

        _hraBtnLoading(btn, true);
        try {
            const res = await API.call('approve_attendance', {
                records: [{ staffId, date: this._date, shiftId, clockIn: '', clockOut: '', dayStatus: 'absent' }]
            });
            if (res.status !== 'success') throw new Error(res.message);
            row.remove();
            const remaining = document.querySelectorAll('#hraAbsentWrap tbody tr').length;
            document.getElementById('hraAbsentCount').textContent = remaining;
            _hraMsg(msgEl, 'Marked absent.', 'info');
        } catch (err) {
            _hraBtnLoading(btn, false, 'Absent');
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
            wrap.innerHTML = '<p class="hra-empty">No pending advance requests ✅</p>';
            return;
        }

        wrap.innerHTML = `
        <table class="hra-table">
          <thead><tr>
            <th>Staff</th><th>Date</th><th>Requested</th><th>Approve (₹)</th><th>Notes</th><th></th>
          </tr></thead>
          <tbody>
            ${pending.map(r => `
              <tr id="hraAdvRow-${_hEsc(r.advanceId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td style="white-space:nowrap;">${_hEsc(r.date)}</td>
                <td class="hra-num">${fmt(r.amount)}</td>
                <td>
                  <input type="number" class="hra-approve-amt" data-id="${_hEsc(r.advanceId)}"
                    value="${Number(r.amount || 0)}" min="1" step="0.01" style="width:100px;padding:5px 7px;border:1px solid #e2e8f0;border-radius:5px;font-size:13px;">
                </td>
                <td style="color:#718096;font-size:12px;">${_hEsc(r.notes)}</td>
                <td>
                  <div class="hra-btn-group">
                    <button class="btn btn-primary hra-btn-sm"
                      onclick="HRApprovals.approveAdvanceRow('${_hEsc(r.advanceId)}',this)">Approve</button>
                    <button class="btn btn-danger hra-btn-sm"
                      onclick="HRApprovals.rejectAdvanceRow('${_hEsc(r.advanceId)}',this)">Reject</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    async approveAdvanceRow(advanceId, btn) {
        const row            = document.getElementById(`hraAdvRow-${advanceId}`);
        const approvedAmount = parseFloat(row.querySelector('.hra-approve-amt').value) || 0;
        const msgEl          = document.getElementById('hraAdvMessage');

        _hraBtnLoading(btn, true);
        try {
            const res = await API.call('approve_advance', { advanceId, approvedAmount });
            if (res.status !== 'success') throw new Error(res.message);
            _hraMsg(msgEl, 'Advance approved — ready to disburse.', 'success');
            await this.loadAdvances();
        } catch (err) {
            _hraBtnLoading(btn, false, 'Approve');
            _hraMsg(msgEl, err.message, 'error');
        }
    },

    async rejectAdvanceRow(advanceId, btn) {
        const msgEl = document.getElementById('hraAdvMessage');
        _hraBtnLoading(btn, true);
        try {
            const res = await API.call('reject_advance', { advanceId });
            if (res.status !== 'success') throw new Error(res.message);
            _hraMsg(msgEl, 'Advance rejected.', 'info');
            await this.loadAdvances();
        } catch (err) {
            _hraBtnLoading(btn, false, 'Reject');
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
            <th>Staff</th><th>Date</th><th>Requested</th><th>Approved</th><th>Notes</th><th>Via</th><th></th>
          </tr></thead>
          <tbody>
            ${approved.map(r => `
              <tr id="hraAdvDisRow-${_hEsc(r.advanceId)}">
                <td><strong>${_hEsc(r.staffName)}</strong></td>
                <td style="white-space:nowrap;">${_hEsc(r.date)}</td>
                <td class="hra-num">${fmt(r.amount)}</td>
                <td class="hra-num"><strong>${fmt(r.approvedAmount)}</strong></td>
                <td style="color:#718096;font-size:12px;">${_hEsc(r.notes)}</td>
                <td>
                  <select class="hra-pay-mode" data-id="${_hEsc(r.advanceId)}" style="padding:5px 7px;border:1px solid #e2e8f0;border-radius:5px;font-size:13px;min-width:80px;">
                    <option value="">Select</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </td>
                <td>
                  <button class="btn btn-primary hra-btn-sm"
                    onclick="HRApprovals.disburseAdvanceRow('${_hEsc(r.advanceId)}',this)">Disburse</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    async disburseAdvanceRow(advanceId, btn) {
        const row         = document.getElementById(`hraAdvDisRow-${advanceId}`);
        const paymentMode = row.querySelector('.hra-pay-mode').value;
        const msgEl       = document.getElementById('hraAdvMessage');
        if (!paymentMode) {
            _hraMsg(msgEl, 'Select a payment mode before disbursing.', 'error');
            return;
        }
        _hraBtnLoading(btn, true);
        try {
            const res = await API.call('disburse_advance', { advanceId, paymentMode });
            if (res.status !== 'success') throw new Error(res.message);
            const bal = Number(res.newBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            _hraMsg(msgEl, `Disbursed via ${paymentMode}. New balance: ₹${bal}.`, 'success');
            await this.loadAdvances();
        } catch (err) {
            _hraBtnLoading(btn, false, 'Disburse');
            _hraMsg(msgEl, err.message, 'error');
        }
    },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
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
// Disable a button and show "…" while an async action is in-flight.
// Call with loading=false to restore; pass label for the restored text.
function _hraBtnLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
        btn._hraLabel = btn.textContent;
        btn.disabled  = true;
        btn.textContent = '…';
        btn.style.opacity = '0.7';
    } else {
        btn.disabled  = false;
        btn.textContent = label || btn._hraLabel || btn.textContent;
        btn.style.opacity = '';
    }
}
// OT = max(0, hoursWorked − 9). Shift breakMins still apply to hoursWorked calc.
function _hraCalcHours(clockIn, clockOut, shift) {
    if (!clockIn || !clockOut) return { hoursWorked: 0, otHours: 0 };
    const toMins    = t => { const [h, m] = (String(t || '')).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const breakMins = shift ? (Number(shift.breakMins) || 0) : 0;
    const worked    = Math.max(0, toMins(clockOut) - toMins(clockIn) - breakMins);
    const hoursWorked = Math.round((worked / 60) * 100) / 100;
    const otHours     = Math.round(Math.max(0, hoursWorked - 9) * 100) / 100;
    return { hoursWorked, otHours };
}
