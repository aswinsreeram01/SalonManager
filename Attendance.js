// Shifts sheet columns (0-based):
// shiftId(0), name(1), startTime(2), endTime(3), breakMins(4), status(5)
//
// StaffShiftAllocation sheet columns (0-based):
// allocationId(0), staffId(1), shiftId(2), effectiveFrom(3), effectiveTo(4)
//
// StaffAttendance sheet columns (0-based):
// attendanceId(0), staffId(1), date(2), shiftId(3), clockIn(4), clockOut(5),
// hoursWorked(6), otHours(7), dayStatus(8), notes(9), createdAt(10)
//
// StaffAdvance sheet columns (0-based):
// advanceId(0), staffId(1), date(2), type(3), amount(4), notes(5), runningBalance(6), createdAt(7)
//
// WeeklyIncentive sheet columns (0-based):
// snapshotId(0), staffId(1), weekStart(2), weekEnd(3), revenueBase(4),
// targetIncentive(5), directIncentive(6), productIncentive(7), totalIncentive(8),
// status(9), calculatedAt(10)

// Safely extract HH:mm from a cell value that may be a Date object or a string.
function _fmtTime(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}:\d{2})/);
  return m ? m[1] : s;
}

const Attendance = {

  // ── Shifts ────────────────────────────────────────────────────────────────

  getShifts(data) {
    const orgId = (data && data.orgId) || '';
    const cacheKey = 'shifts_' + orgId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Shifts retrieved', { shifts: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Shifts');
    if (!sheet) return Utils.createResponse('success', 'Shifts retrieved', { shifts: [] });

    const rows = sheet.getDataRange().getValues();
    const shifts = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][6] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      shifts.push({
        shiftId:   rows[i][0],
        name:      rows[i][1],
        startTime: _fmtTime(rows[i][2]),
        endTime:   _fmtTime(rows[i][3]),
        status:    rows[i][5],
        orgId:     rowOrg
      });
    }

    Utils.setCached(cacheKey, shifts);
    return Utils.createResponse('success', 'Shifts retrieved', { shifts });
  },

  saveShift(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Shifts');
    if (!sheet) return Utils.createResponse('error', 'Shifts sheet not found');

    if (data.shiftId) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 1; i < sheetData.length; i++) {
        if (sheetData[i][0] === data.shiftId) {
          sheet.getRange(i + 1, 2).setValue(data.name);
          sheet.getRange(i + 1, 3).setValue(data.startTime);
          sheet.getRange(i + 1, 4).setValue(data.endTime);
          sheet.getRange(i + 1, 5).setValue(Number(data.breakMins) || 0);
          sheet.getRange(i + 1, 6).setValue(data.status || 'active');
          Utils.clearCached('shifts_' + (data.orgId || ''));
          return Utils.createResponse('success', 'Shift updated successfully', { shiftId: data.shiftId });
        }
      }
      return Utils.createResponse('error', 'Shift not found');
    }

    const shiftId = 'SHF' + Date.now();
    sheet.appendRow([
      shiftId,
      data.name,
      data.startTime,
      data.endTime,
      Number(data.breakMins) || 0,
      data.status || 'active',
      data.orgId || ''
    ]);
    Utils.clearCached('shifts_' + (data.orgId || ''));
    return Utils.createResponse('success', 'Shift saved successfully', { shiftId });
  },

  // ── Allocations ───────────────────────────────────────────────────────────

  getAllocations(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffShiftAllocation');
    if (!sheet) return Utils.createResponse('success', 'Allocations retrieved', { allocations: [] });

    const rows = sheet.getDataRange().getValues();
    const filterStaffId = (data && data.staffId) ? data.staffId : null;
    const allocations = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterStaffId && rows[i][1] !== filterStaffId) continue;
      allocations.push({
        allocationId:  rows[i][0],
        staffId:       rows[i][1],
        shiftId:       rows[i][2],
        effectiveFrom: rows[i][3] instanceof Date ? Utils.businessDate(rows[i][3]) : String(rows[i][3]).slice(0, 10),
        effectiveTo:   rows[i][4] instanceof Date ? Utils.businessDate(rows[i][4]) : String(rows[i][4]).slice(0, 10)
      });
    }

    return Utils.createResponse('success', 'Allocations retrieved', { allocations });
  },

  saveAllocation(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffShiftAllocation');
    if (!sheet) return Utils.createResponse('error', 'StaffShiftAllocation sheet not found');

    if (data.allocationId) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 1; i < sheetData.length; i++) {
        if (sheetData[i][0] === data.allocationId) {
          sheet.getRange(i + 1, 2).setValue(data.staffId);
          sheet.getRange(i + 1, 3).setValue(data.shiftId);
          sheet.getRange(i + 1, 4).setValue(data.effectiveFrom || '');
          sheet.getRange(i + 1, 5).setValue(data.effectiveTo   || '');
          return Utils.createResponse('success', 'Allocation updated successfully', { allocationId: data.allocationId });
        }
      }
      return Utils.createResponse('error', 'Allocation not found');
    }

    const allocationId = 'ALC' + Date.now();
    sheet.appendRow([
      allocationId,
      data.staffId,
      data.shiftId,
      data.effectiveFrom || '',
      data.effectiveTo   || '',
      '',
      data.orgId         || ''
    ]);
    return Utils.createResponse('success', 'Allocation saved successfully', { allocationId });
  },

  // ── Attendance ────────────────────────────────────────────────────────────

  getAttendance(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffAttendance');
    if (!sheet) return Utils.createResponse('success', 'Attendance retrieved', { attendance: [] });

    const rows = sheet.getDataRange().getValues();
    const filterStaffId = (data && data.staffId) ? data.staffId : null;
    const fromDate      = (data && data.fromDate) ? data.fromDate : null;
    const toDate        = (data && data.toDate)   ? data.toDate   : null;
    const attendance    = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterStaffId && rows[i][1] !== filterStaffId) continue;

      const d = rows[i][2];
      const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
      if (fromDate && dateStr < fromDate) continue;
      if (toDate   && dateStr > toDate)   continue;

      attendance.push({
        attendanceId: rows[i][0],
        staffId:      rows[i][1],
        date:         dateStr,
        shiftId:      rows[i][3],
        clockIn:      _fmtTime(rows[i][4]),
        clockOut:     _fmtTime(rows[i][5]),
        hoursWorked:  Number(rows[i][6]) || 0,
        otHours:      Number(rows[i][7]) || 0,
        dayStatus:    rows[i][8],
        notes:        rows[i][9],
        createdAt:    rows[i][10],
        orgId:        String(rows[i][11] || ''),
        status:       String(rows[i][12] || 'approved'),
      });
    }

    return Utils.createResponse('success', 'Attendance retrieved', { attendance });
  },

  saveAttendance(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffAttendance');
    if (!sheet) return Utils.createResponse('error', 'StaffAttendance sheet not found');

    // OT threshold now lives on each staff member's Incentive Profile (was a
    // single company-wide OrgSettings value) — build the staffId lookup once
    // for this batch rather than re-reading the sheets per record.
    const otThresholdMap = IncentiveProfiles.buildOTThresholdMap(data.orgId);
    const records = Array.isArray(data.records) ? data.records : [data];
    const existingRows = sheet.getDataRange().getValues();

    // Build lookup: staffId+date → sheet row index (1-based)
    const existingMap = {};
    for (let i = 1; i < existingRows.length; i++) {
      if (!existingRows[i][0]) continue;
      const d = existingRows[i][2];
      const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
      existingMap[existingRows[i][1] + '|' + dateStr] = i + 1; // 1-based
    }

    let saved = 0;
    const errors = [];
    const now = new Date().toISOString();

    records.forEach(rec => {
      const recDate = rec.date instanceof Date ? Utils.businessDate(rec.date) : String(rec.date).slice(0, 10);
      const key = rec.staffId + '|' + recDate;
      const existingRow = existingMap[key];

      // manualOnly: from the Payroll > Attendance & OT Summary bulk-edit grid,
      // which only ever edits days with no clock-in/out on record (that grid
      // sets a status + a direct OT-hours override instead of clock times).
      // Re-check server-side too — never let it silently blank out a day that
      // already has real clock-in/out data recorded some other way (e.g. the
      // Staff Portal self-check-in) since that's a different source of truth.
      if (rec.manualOnly) {
        if (existingRow) {
          const existingClockIn  = existingRows[existingRow - 1][4];
          const existingClockOut = existingRows[existingRow - 1][5];
          if (existingClockIn || existingClockOut) {
            errors.push({ staffId: rec.staffId, date: recDate, message: 'Has clock-in/out data — edit from the Attendance tab instead.' });
            return;
          }
          sheet.getRange(existingRow, 8).setValue(Number(rec.otHours) || 0);
          sheet.getRange(existingRow, 9).setValue(rec.dayStatus || 'present');
        } else {
          const attendanceId = 'ATT' + Date.now() + Math.random().toString(36).substr(2, 4);
          sheet.appendRow([
            attendanceId, rec.staffId, recDate, '', '', '', 0,
            Number(rec.otHours) || 0, rec.dayStatus || 'present', rec.notes || '',
            now, data.orgId || '', 'approved'
          ]);
        }
        saved++;
        return;
      }

      const otThreshold = otThresholdMap[rec.staffId] || 9;
      const { hoursWorked, otHours } = Utils.computeHoursAndOT(rec.clockIn, rec.clockOut, otThreshold);

      if (existingRow) {
        sheet.getRange(existingRow, 4).setValue(rec.shiftId);
        sheet.getRange(existingRow, 5).setValue(rec.clockIn   || '');
        sheet.getRange(existingRow, 6).setValue(rec.clockOut  || '');
        sheet.getRange(existingRow, 7).setValue(hoursWorked);
        sheet.getRange(existingRow, 8).setValue(otHours);
        sheet.getRange(existingRow, 9).setValue(rec.dayStatus || '');
        sheet.getRange(existingRow, 10).setValue(rec.notes   || '');
      } else {
        const attendanceId = 'ATT' + Date.now() + Math.random().toString(36).substr(2, 4);
        sheet.appendRow([
          attendanceId,
          rec.staffId,
          recDate,
          rec.shiftId,
          rec.clockIn    || '',
          rec.clockOut   || '',
          hoursWorked,
          otHours,
          rec.dayStatus  || '',
          rec.notes      || '',
          now,
          data.orgId     || '',
          'approved'
        ]);
      }
      saved++;
    });

    return Utils.createResponse('success', 'Attendance saved', { saved, errors });
  },

  // ── Advances ──────────────────────────────────────────────────────────────

  getAdvances(data) {
    if (!data || !data.staffId) return Utils.createResponse('error', 'staffId is required');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('success', 'Advances retrieved', { advances: [], outstandingBalance: 0 });

    const rows = sheet.getDataRange().getValues();
    const advances = [];
    let outstandingBalance = 0;

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (rows[i][1] !== data.staffId) continue;
      const d = rows[i][2];
      const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
      advances.push({
        advanceId:       rows[i][0],
        staffId:         rows[i][1],
        date:            dateStr,
        type:            rows[i][3],
        amount:          Number(rows[i][4]) || 0,
        notes:           rows[i][5],
        runningBalance:  Number(rows[i][6]) || 0,
        createdAt:       rows[i][7],
        orgId:           String(rows[i][8] || ''),
        status:          String(rows[i][9] || 'disbursed'),
        approvedAmount:  Number(rows[i][10]) || 0,
        paymentMode:     String(rows[i][11] || ''),
      });
    }

    // Sort by date ascending
    advances.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Outstanding balance = only disbursed rows count
    advances.forEach(r => {
      const status = r.status || 'disbursed';
      if (status === 'disbursed') {
        outstandingBalance += r.type === 'advance' ? r.amount : -r.amount;
      }
    });

    return Utils.createResponse('success', 'Advances retrieved', { advances, outstandingBalance });
  },

  addAdvance(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('error', 'StaffAdvance sheet not found');

    // Compute running balance from existing rows for this staff
    const rows = sheet.getDataRange().getValues();
    let runningBalance = 0;
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (rows[i][1] !== data.staffId) continue;
      runningBalance = Number(rows[i][6]) || 0; // last known running balance
    }
    const amount = Number(data.amount) || 0;
    const newBalance = data.type === 'advance' ? runningBalance + amount : runningBalance - amount;

    const advanceId = 'ADV' + Date.now();
    const now = new Date().toISOString();
    sheet.appendRow([
      advanceId,
      data.staffId,
      data.date || now.slice(0, 10),
      data.type,
      amount,
      data.notes || '',
      newBalance,
      now,
      data.orgId || '',
      'disbursed',
      amount,
      data.paymentMode || ''
    ]);

    return Utils.createResponse('success', 'Advance recorded successfully', { advanceId, runningBalance: newBalance });
  },

  // ── Weekly Incentive ──────────────────────────────────────────────────────

  saveWeeklyIncentive(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WeeklyIncentive');
    if (!sheet) return Utils.createResponse('error', 'WeeklyIncentive sheet not found');

    const targetIncentive  = Number(data.targetIncentive)  || 0;
    const directIncentive  = Number(data.directIncentive)  || 0;
    const productIncentive = Number(data.productIncentive) || 0;
    const totalIncentive   = targetIncentive + directIncentive + productIncentive;
    const now = new Date().toISOString();

    // Upsert: look for existing row with same staffId + weekStart
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const ws = rows[i][2] instanceof Date ? Utils.businessDate(rows[i][2]) : String(rows[i][2]).slice(0, 10);
      if (rows[i][1] === data.staffId && ws === data.weekStart) {
        sheet.getRange(i + 1, 4).setValue(data.weekEnd          || '');
        sheet.getRange(i + 1, 5).setValue(data.revenueBase      || '');
        sheet.getRange(i + 1, 6).setValue(targetIncentive);
        sheet.getRange(i + 1, 7).setValue(directIncentive);
        sheet.getRange(i + 1, 8).setValue(productIncentive);
        sheet.getRange(i + 1, 9).setValue(totalIncentive);
        sheet.getRange(i + 1, 10).setValue(data.status          || 'draft');
        sheet.getRange(i + 1, 11).setValue(now);
        return Utils.createResponse('success', 'Weekly incentive updated', { snapshotId: rows[i][0] });
      }
    }

    const snapshotId = 'WKI' + Date.now() + Math.random().toString(36).substr(2, 4);
    sheet.appendRow([
      snapshotId,
      data.staffId,
      data.weekStart       || '',
      data.weekEnd         || '',
      data.revenueBase     || '',
      targetIncentive,
      directIncentive,
      productIncentive,
      totalIncentive,
      data.status          || 'draft',
      now,
      data.orgId           || ''
    ]);

    return Utils.createResponse('success', 'Weekly incentive saved', { snapshotId });
  },

  getWeeklyIncentives(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WeeklyIncentive');
    if (!sheet) return Utils.createResponse('success', 'Weekly incentives retrieved', { weeklyIncentives: [] });

    const rows = sheet.getDataRange().getValues();
    const filterStaffId = (data && data.staffId)  ? data.staffId  : null;
    const fromDate      = (data && data.fromDate)  ? data.fromDate : null;
    const weeklyIncentives = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterStaffId && rows[i][1] !== filterStaffId) continue;

      const ws = rows[i][2] instanceof Date ? Utils.businessDate(rows[i][2]) : String(rows[i][2]).slice(0, 10);
      if (fromDate && ws < fromDate) continue;

      const we = rows[i][3] instanceof Date ? Utils.businessDate(rows[i][3]) : String(rows[i][3]).slice(0, 10);

      weeklyIncentives.push({
        snapshotId:        rows[i][0],
        staffId:           rows[i][1],
        weekStart:         ws,
        weekEnd:           we,
        revenueBase:       rows[i][4],
        targetIncentive:   Number(rows[i][5]) || 0,
        directIncentive:   Number(rows[i][6]) || 0,
        productIncentive:  Number(rows[i][7]) || 0,
        totalIncentive:    Number(rows[i][8]) || 0,
        status:            rows[i][9],
        calculatedAt:      rows[i][10]
      });
    }

    return Utils.createResponse('success', 'Weekly incentives retrieved', { weeklyIncentives });
  }
};
