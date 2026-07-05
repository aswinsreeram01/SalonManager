// WeeklySchedule.js — week-level shift & off-day planning per staff member
//
// Sheet columns (0-based):
//   scheduleId(0)  staffId(1)  weekStart(2)  shiftId(3)  offDays(4)  orgId(5)
//
// weekStart : ISO date string of the Monday of the week (YYYY-MM-DD)
// offDays   : comma-separated day abbreviations, e.g. "Fri,Sat,Sun"

const WeeklySchedule = {

  get(data) {
    const { orgId, weekStart, includeChildren } = data;
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('WeeklySchedule');
    if (!sheet) return Utils.createResponse('success', 'ok', { schedules: [] });

    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, !!includeChildren) : null;
    const rows      = sheet.getDataRange().getValues();
    const schedules = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = String(rows[i][5] || '');
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;
      const ws = rows[i][2] instanceof Date
        ? Utils.businessDate(rows[i][2])
        : String(rows[i][2] || '').slice(0, 10);
      if (weekStart && ws !== weekStart) continue;
      schedules.push({
        scheduleId: String(rows[i][0]),
        staffId:    String(rows[i][1]),
        weekStart:  ws,
        shiftId:    String(rows[i][3] || ''),
        offDays:    String(rows[i][4] || ''),
      });
    }
    return Utils.createResponse('success', 'ok', { schedules });
  },

  save(data) {
    const { orgId, weekStart, entries } = data;
    if (!weekStart || !Array.isArray(entries))
      return Utils.createResponse('error', 'weekStart and entries are required');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName('WeeklySchedule');
    if (!sheet) {
      sheet = ss.insertSheet('WeeklySchedule');
      sheet.appendRow(['scheduleId', 'staffId', 'weekStart', 'shiftId', 'offDays', 'orgId']);
    }

    const rows = sheet.getDataRange().getValues();

    // Build lookup: staffId → row index (1-based) for this week + org
    const existMap = {};
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = String(rows[i][5] || '');
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      const ws = rows[i][2] instanceof Date
        ? Utils.businessDate(rows[i][2])
        : String(rows[i][2] || '').slice(0, 10);
      if (ws === weekStart) existMap[String(rows[i][1])] = i + 1;
    }

    entries.forEach(entry => {
      const { staffId, shiftId, offDays } = entry;
      if (!staffId) return;
      if (existMap[staffId]) {
        const row = existMap[staffId];
        sheet.getRange(row, 4).setValue(shiftId  || '');
        sheet.getRange(row, 5).setValue(offDays  || '');
      } else {
        const scheduleId = 'SCH' + Date.now() + Math.random().toString(36).substr(2, 4);
        sheet.appendRow([scheduleId, staffId, weekStart, shiftId || '', offDays || '', orgId || '']);
        existMap[staffId] = true;  // prevent duplicates within the same batch
      }
    });

    return Utils.createResponse('success', 'Week plan saved');
  },
};
