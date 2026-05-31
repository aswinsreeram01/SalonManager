// HRApprovals.js — manager-side approval for attendance and advance requests
//
// StaffAttendance (0-based):
//   0 attendanceId  1 staffId  2 date  3 shiftId  4 clockIn  5 clockOut
//   6 hoursWorked   7 otHours  8 dayStatus  9 notes  10 createdAt  11 orgId  12 status
//
// StaffAdvance (0-based):
//   0 advanceId  1 staffId  2 date  3 type  4 amount  5 notes
//   6 runningBalance  7 createdAt  8 orgId  9 status  10 approvedAmount  11 paymentMode
//
// Staff (0-based):
//   0 id  2 name  3 phone  8 role  12 specialization  13 status  17 orgId

const HRApprovals = {

  // ── Attendance approvals ──────────────────────────────────────────────────

  // Returns:
  //   pending   — rows with status='pending' for the given date
  //   absent    — active staff with no attendance record for the given date
  //   shifts    — all shifts (for dropdowns)
  //   staffMap  — id → { name, shiftId } for quick reference
  getPendingAttendance(data) {
    const { orgId } = data;
    const tz    = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const date  = String(data.date || today);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shiftMap = this._buildShiftMap(ss, orgId);
    const staffMap = this._buildStaffMap(ss, orgId);
    const allocMap = this._buildAllocMap(ss, orgId, date);

    const attSheet = ss.getSheetByName('StaffAttendance');
    const pending  = [];
    const presentIds = new Set();

    if (attSheet) {
      const rows = attSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        const rowOrg = String(r[11] || '');
        if (orgId && rowOrg && rowOrg !== orgId) continue;

        const d = r[2];
        const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
        if (dateStr !== date) continue;

        const staffId = String(r[1]);
        const status  = String(r[12] || 'approved');
        presentIds.add(staffId);

        if (status === 'pending' || status === 'rejected') {
          const shiftId   = String(r[3] || '');
          const shiftInfo = shiftMap[shiftId] || null;
          const otCalc    = this._calcHours(String(r[4]), String(r[5]), shiftInfo);
          pending.push({
            attendanceId: String(r[0]),
            staffId,
            staffName:    staffMap[staffId] ? staffMap[staffId].name : staffId,
            date,
            shiftId,
            shiftName:    shiftInfo ? shiftInfo.name : '',
            clockIn:      String(r[4] || ''),
            clockOut:     String(r[5] || ''),
            hoursWorked:  otCalc.hoursWorked,
            otHours:      otCalc.otHours,
            dayStatus:    String(r[8] || 'present'),
            notes:        String(r[9] || ''),
            status,
          });
        }
      }
    }

    // Absent: active staff with no record for this date
    const absent = [];
    Object.values(staffMap).forEach(staff => {
      if (presentIds.has(staff.id)) return;
      const shiftId   = allocMap[staff.id] || '';
      const shiftInfo = shiftMap[shiftId] || null;
      absent.push({
        staffId:   staff.id,
        staffName: staff.name,
        shiftId,
        shiftName: shiftInfo ? shiftInfo.name : '',
        date,
      });
    });

    absent.sort((a, b) => a.staffName.localeCompare(b.staffName));

    return Utils.createResponse('success', 'Pending attendance loaded', {
      pending,
      absent,
      shifts: Object.values(shiftMap),
      date,
    });
  },

  approveAttendance(data) {
    const { orgId } = data;
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAttendance');
    if (!sheet) return Utils.createResponse('error', 'StaffAttendance sheet not found');

    const shiftMap = this._buildShiftMap(ss, orgId);

    // Support both single record and bulk
    const records = Array.isArray(data.records) ? data.records : [data];
    const rows    = sheet.getDataRange().getValues();
    const tz      = Session.getScriptTimeZone();
    const now     = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
    let   approved = 0;

    records.forEach(rec => {
      const shiftInfo = shiftMap[String(rec.shiftId || '')] || null;
      const otCalc    = this._calcHours(String(rec.clockIn || ''), String(rec.clockOut || ''), shiftInfo);
      const clockIn   = String(rec.clockIn  || '');
      const clockOut  = String(rec.clockOut || '');
      const dayStatus = String(rec.dayStatus || (clockIn ? 'present' : 'absent'));

      if (rec.attendanceId) {
        // Update existing row
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) !== String(rec.attendanceId)) continue;
          sheet.getRange(i + 1, 4).setValue(rec.shiftId || '');
          sheet.getRange(i + 1, 5).setValue(clockIn);
          sheet.getRange(i + 1, 6).setValue(clockOut);
          sheet.getRange(i + 1, 7).setValue(otCalc.hoursWorked);
          sheet.getRange(i + 1, 8).setValue(otCalc.otHours);
          sheet.getRange(i + 1, 9).setValue(dayStatus);
          sheet.getRange(i + 1, 10).setValue(rec.notes || '');
          sheet.getRange(i + 1, 13).setValue('approved');
          approved++;
          break;
        }
      } else {
        // New row (manager creating record for absent staff or missing record)
        const date = String(rec.date || '');
        if (!date || !rec.staffId) return;

        // Check if a row already exists for this staff+date (maybe status=rejected)
        let found = false;
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][1]) !== String(rec.staffId)) continue;
          const d = rows[i][2];
          const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
          if (dateStr !== date) continue;
          sheet.getRange(i + 1, 4).setValue(rec.shiftId || '');
          sheet.getRange(i + 1, 5).setValue(clockIn);
          sheet.getRange(i + 1, 6).setValue(clockOut);
          sheet.getRange(i + 1, 7).setValue(otCalc.hoursWorked);
          sheet.getRange(i + 1, 8).setValue(otCalc.otHours);
          sheet.getRange(i + 1, 9).setValue(dayStatus);
          sheet.getRange(i + 1, 10).setValue(rec.notes || '');
          sheet.getRange(i + 1, 13).setValue('approved');
          found = true;
          approved++;
          break;
        }
        if (!found) {
          const attendanceId = 'ATT' + Date.now() + Math.random().toString(36).substr(2, 4);
          sheet.appendRow([
            attendanceId, rec.staffId, date, rec.shiftId || '',
            clockIn, clockOut,
            otCalc.hoursWorked, otCalc.otHours,
            dayStatus, rec.notes || '',
            now, orgId, 'approved'
          ]);
          approved++;
        }
      }
    });

    return Utils.createResponse('success', `${approved} record(s) approved`, { approved });
  },

  rejectAttendance(data) {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAttendance');
    if (!sheet) return Utils.createResponse('error', 'StaffAttendance sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(data.attendanceId)) continue;
      sheet.getRange(i + 1, 13).setValue('rejected');
      return Utils.createResponse('success', 'Attendance rejected');
    }
    return Utils.createResponse('error', 'Record not found');
  },

  // ── Advance approvals ─────────────────────────────────────────────────────

  // Returns pending (status='pending') and approved (status='approved', awaiting disbursal)
  getPendingAdvances(data) {
    const { orgId } = data;
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAdvance');
    const staffMap = this._buildStaffMap(ss, orgId);

    if (!sheet) return Utils.createResponse('success', 'ok', { pending: [], approved: [] });

    const rows    = sheet.getDataRange().getValues();
    const pending  = [];
    const approved = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      const rowOrg = String(r[8] || '');
      if (orgId && rowOrg && rowOrg !== orgId) continue;

      const status = String(r[9] || 'disbursed');
      if (status !== 'pending' && status !== 'approved') continue;

      const d = r[2];
      const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      const staffId = String(r[1]);
      const rec = {
        advanceId:      String(r[0]),
        staffId,
        staffName:      staffMap[staffId] ? staffMap[staffId].name : staffId,
        date:           dateStr,
        type:           String(r[3] || 'advance'),
        amount:         Number(r[4]) || 0,
        notes:          String(r[5] || ''),
        createdAt:      String(r[7] || ''),
        status,
        approvedAmount: Number(r[10]) || 0,
        paymentMode:    String(r[11] || ''),
      };

      if (status === 'pending')  pending.push(rec);
      if (status === 'approved') approved.push(rec);
    }

    pending.sort( (a, b) => a.createdAt.localeCompare(b.createdAt));
    approved.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return Utils.createResponse('success', 'Pending advances loaded', { pending, approved });
  },

  approveAdvance(data) {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('error', 'StaffAdvance sheet not found');

    const approvedAmount = Number(data.approvedAmount) || 0;
    if (approvedAmount <= 0) return Utils.createResponse('error', 'Approved amount must be greater than zero');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(data.advanceId)) continue;
      if (String(rows[i][9] || 'disbursed') !== 'pending')
        return Utils.createResponse('error', 'This request is not in pending state');
      sheet.getRange(i + 1, 10).setValue('approved');
      sheet.getRange(i + 1, 11).setValue(approvedAmount);
      return Utils.createResponse('success', 'Advance approved', { approvedAmount });
    }
    return Utils.createResponse('error', 'Advance record not found');
  },

  disburseAdvance(data) {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('error', 'StaffAdvance sheet not found');

    const paymentMode = String(data.paymentMode || '').trim();
    if (!paymentMode) return Utils.createResponse('error', 'Payment mode is required');

    const rows = sheet.getDataRange().getValues();
    let targetRow  = -1;
    let targetData = null;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(data.advanceId)) continue;
      if (String(rows[i][9] || 'disbursed') !== 'approved')
        return Utils.createResponse('error', 'This request must be approved before disbursal');
      targetRow  = i + 1;
      targetData = rows[i];
      break;
    }
    if (targetRow < 0) return Utils.createResponse('error', 'Advance record not found');

    const staffId        = String(targetData[1]);
    const approvedAmount = Number(targetData[10]) || Number(targetData[4]) || 0;
    const type           = String(targetData[3] || 'advance');

    // Recompute running balance from all DISBURSED rows for this staff
    let runningBalance = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) !== staffId) continue;
      const st = String(rows[i][9] || 'disbursed');
      if (st !== 'disbursed') continue;
      const amt = Number(rows[i][4]) || 0;
      runningBalance += rows[i][3] === 'advance' ? amt : -amt;
    }

    const newBalance = type === 'advance' ? runningBalance + approvedAmount : runningBalance - approvedAmount;

    sheet.getRange(targetRow, 5).setValue(approvedAmount);    // update amount to approvedAmount
    sheet.getRange(targetRow, 7).setValue(newBalance);        // runningBalance
    sheet.getRange(targetRow, 10).setValue('disbursed');
    sheet.getRange(targetRow, 11).setValue(approvedAmount);
    sheet.getRange(targetRow, 12).setValue(paymentMode);

    return Utils.createResponse('success', 'Advance disbursed', { newBalance, approvedAmount, paymentMode });
  },

  rejectAdvance(data) {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('error', 'StaffAdvance sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(data.advanceId)) continue;
      sheet.getRange(i + 1, 10).setValue('rejected');
      return Utils.createResponse('success', 'Advance rejected');
    }
    return Utils.createResponse('error', 'Record not found');
  },

  // ── Private helpers ──────────────────────────────────────────────────────────

  _buildShiftMap(ss, orgId) {
    const sheet = ss.getSheetByName('Shifts');
    const map   = {};
    if (!sheet) return map;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = String(rows[i][6] || '');
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      map[String(rows[i][0])] = {
        shiftId:   String(rows[i][0]),
        name:      String(rows[i][1] || ''),
        startTime: String(rows[i][2] || '09:00'),
        endTime:   String(rows[i][3] || '18:00'),
        breakMins: Number(rows[i][4]) || 0,
      };
    }
    return map;
  },

  // Returns map of staffId → { id, name }  (only active staff)
  _buildStaffMap(ss, orgId) {
    const sheet = ss.getSheetByName('Staff');
    const map   = {};
    if (!sheet) return map;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = String(rows[i][17] || '');
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      const status = String(rows[i][13] || '').toLowerCase();
      if (status !== 'active') continue;
      map[String(rows[i][0])] = { id: String(rows[i][0]), name: String(rows[i][2] || '') };
    }
    return map;
  },

  // Returns map of staffId → shiftId for a given date (most recent allocation)
  _buildAllocMap(ss, orgId, dateStr) {
    const sheet = ss.getSheetByName('StaffShiftAllocation');
    const map   = {};
    if (!sheet) return map;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const staffId = String(rows[i][1]);
      const from = rows[i][3] instanceof Date ? rows[i][3].toISOString().slice(0, 10) : String(rows[i][3] || '').slice(0, 10);
      const to   = rows[i][4] instanceof Date ? rows[i][4].toISOString().slice(0, 10) : String(rows[i][4] || '').slice(0, 10);
      if (from && dateStr < from) continue;
      if (to   && dateStr > to)   continue;
      map[staffId] = String(rows[i][2]);  // shiftId
    }
    return map;
  },

  // Returns { hoursWorked, otHours } given clockIn/Out strings and a shiftInfo object
  _calcHours(clockIn, clockOut, shiftInfo) {
    if (!clockIn || !clockOut) return { hoursWorked: 0, otHours: 0 };
    const breakMins  = shiftInfo ? shiftInfo.breakMins : 0;
    const shiftStart = shiftInfo ? this._toMinutes(shiftInfo.startTime) : 0;
    const shiftEnd   = shiftInfo ? this._toMinutes(shiftInfo.endTime)   : 0;
    const shiftMins  = Math.max(0, shiftEnd - shiftStart - breakMins);
    const shiftHours = shiftMins / 60;

    const workedMins = this._toMinutes(clockOut) - this._toMinutes(clockIn) - breakMins;
    const hoursWorked = Math.max(0, workedMins / 60);
    const otHours     = Math.max(0, hoursWorked - shiftHours);
    return { hoursWorked: Math.round(hoursWorked * 100) / 100, otHours: Math.round(otHours * 100) / 100 };
  },

  _toMinutes(timeStr) {
    const t = String(timeStr || '');
    const parts = t.split(':');
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  },
};
