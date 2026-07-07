// StaffPortal.js — login, dashboard and item-level confirmation for staff members
//
// Staff table (0-based):   0 id  2 name  3 phone  8 role  12 specialization  13 status  17 orgId  18 staffPin
// BillItems table (0-based):
//   0  billItemId   1  billId     2  type      4  itemName
//   5  staffId      7  qty        8  unitPrice  12 lineTotal
//   17 orgId        18 staffConfirmed  (NEW — ISO timestamp when confirmed, empty = pending)
// Bills table (0-based):
//   0  billId  2  customerName  4  createdAt  11 grandTotal  12 paymentMode  16 status  19 orgId

const StaffPortal = {

  // ── Authentication ──────────────────────────────────────────────────────────

  login(data) {
    const phone = String(data.phone || '').replace(/\s+/g, '');
    const pin   = String(data.pin   || '').trim();
    if (!phone || !pin)
      return Utils.createResponse('error', 'Phone and PIN are required');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('error', 'Staff data unavailable');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const row        = rows[i];
      const staffPhone = String(row[3] || '').replace(/\s+/g, '');
      if (staffPhone !== phone) continue;

      const status = String(row[13] || '').toLowerCase();
      if (status !== 'active')
        return Utils.createResponse('error', 'Your account is not active. Please contact the admin.');

      const storedPin    = String(row[18] || '').trim();
      const effectivePin = storedPin || staffPhone.slice(-4);
      if (effectivePin !== pin)
        return Utils.createResponse('error', 'Invalid PIN');

      const staffId = String(row[0]);
      const orgId   = String(row[17] || '');
      const token   = Utils.createStaffSession(staffId, orgId);

      return Utils.createResponse('success', 'Login successful', {
        sessionToken:   token,
        staffId,
        staffName:      String(row[2]  || ''),
        phone:          staffPhone,
        orgId,
        role:           String(row[8]  || ''),
        specialization: String(row[12] || ''),
        pinIsDefault:   !storedPin,
      });
    }
    return Utils.createResponse('error', 'Phone number not found');
  },

  logout(data) {
    Utils.invalidateSession(data.sessionToken);
    return Utils.createResponse('success', 'Logged out');
  },

  changePin(data) {
    const { staffId, currentPin, newPin } = data;
    if (!newPin || String(newPin).length < 4)
      return Utils.createResponse('error', 'New PIN must be at least 4 digits');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('error', 'Staff data unavailable');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== staffId) continue;

      const staffPhone   = String(rows[i][3] || '').replace(/\s+/g, '');
      const storedPin    = String(rows[i][18] || '').trim();
      const effectivePin = storedPin || staffPhone.slice(-4);

      if (effectivePin !== String(currentPin || '').trim())
        return Utils.createResponse('error', 'Current PIN is incorrect');

      sheet.getRange(i + 1, 19).setValue(String(newPin));
      return Utils.createResponse('success', 'PIN changed successfully');
    }
    return Utils.createResponse('error', 'Staff record not found');
  },

  // ── Dashboard: records for a date range ────────────────────────────────────

  getDashboard(data) {
    const { staffId, orgId } = data;
    const tz    = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    const rawFrom = data.fromDate || today;
    const rawTo   = data.toDate   || today;
    const from    = this._dayStart(rawFrom);
    const to      = this._dayEnd(rawTo);

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Build valid bill set
    const billMap = this._buildBillMap(ss, orgId, from, to, tz);

    // Collect items
    const { services, products } = this._collectItems(ss, staffId, orgId, billMap);

    const serviceTotal = services.reduce((s, x) => s + x.lineTotal, 0);
    const productTotal = products.reduce((s, x) => s + x.lineTotal, 0);

    return Utils.createResponse('success', 'Dashboard loaded', {
      services,
      products,
      serviceTotal,
      productTotal,
      grandTotal: serviceTotal + productTotal,
      fromDate: rawFrom,
      toDate:   rawTo,
    });
  },

  // ── Pending items: all unconfirmed items across all dates ───────────────────

  getPendingItems(data) {
    const { staffId, orgId } = data;
    const tz = Session.getScriptTimeZone();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // All bills (no date filter)
    const billMap = this._buildBillMap(ss, orgId, null, null, tz);

    const itemsSheet = ss.getSheetByName('BillItems');
    if (!itemsSheet) return Utils.createResponse('success', 'No items', { pending: [], count: 0 });

    const rows    = itemsSheet.getDataRange().getValues();
    const pending = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[5] || '').trim() !== staffId) continue;

      const itemOrgId = String(r[17] || '');
      if (orgId && itemOrgId && itemOrgId !== orgId) continue;

      const confirmed = String(r[18] || '').trim();
      if (confirmed) continue; // already confirmed

      const billId = String(r[1] || '');
      const bill   = billMap[billId];
      if (!bill) continue; // voided or not found

      const type = String(r[2] || '').trim();
      pending.push({
        billItemId:   String(r[0]  || ''),
        billId,
        type,
        itemName:     String(r[4]  || ''),
        qty:          Number(r[7]  || 1),
        unitPrice:    Number(r[8]  || 0),
        lineTotal:    Number(r[12] || 0),
        customerName: bill.customerName,
        createdAt:    bill.createdAt,
        dateOnly:     bill.dateOnly,
      });
    }

    // Sort most recent first
    pending.sort((a, b) => (b.dateOnly + b.createdAt).localeCompare(a.dateOnly + a.createdAt));

    return Utils.createResponse('success', 'Pending items loaded', {
      pending,
      count: pending.length,
    });
  },

  // ── Confirm specific bill items ─────────────────────────────────────────────

  confirmItems(data) {
    const { staffId, orgId, billItemIds } = data;
    if (!Array.isArray(billItemIds) || !billItemIds.length)
      return Utils.createResponse('error', 'No items specified');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('BillItems');
    if (!sheet) return Utils.createResponse('error', 'BillItems sheet not found');

    const rows        = sheet.getDataRange().getValues();
    const idsToConfirm = new Set(billItemIds.map(String));
    const tz          = Session.getScriptTimeZone();
    const confirmedAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
    let confirmed     = 0;

    for (let i = 1; i < rows.length; i++) {
      const row    = rows[i];
      const itemId = String(row[0]);
      if (!idsToConfirm.has(itemId)) continue;

      // Security: this item must belong to this staff + org
      if (String(row[5] || '').trim() !== staffId) continue;
      const itemOrgId = String(row[17] || '');
      if (orgId && itemOrgId && itemOrgId !== orgId) continue;

      sheet.getRange(i + 1, 19).setValue(confirmedAt); // col 19 = staffConfirmed
      confirmed++;
    }

    return Utils.createResponse('success', `${confirmed} item(s) confirmed`, { confirmed, confirmedAt });
  },

  // ── Attendance: self-log (today only) ─────────────────────────────────────

  logAttendance(data) {
    const { staffId, orgId } = data;
    const tz      = Session.getScriptTimeZone();
    const today   = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    // Frozen once this month's payroll is approved/paid — same rule the
    // admin-side attendance editors enforce.
    if (Payroll._isPeriodLocked(staffId, today.slice(0, 7))) {
      return Utils.createResponse('error', 'This month\'s payroll has already been finalized — attendance can no longer be changed. Please contact your manager.');
    }
    const clockIn  = String(data.clockIn  || '').trim();
    const clockOut = String(data.clockOut || '').trim();
    const notes    = String(data.notes    || '').trim();
    const shiftId  = String(data.shiftId  || '').trim();

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAttendance');
    if (!sheet) return Utils.createResponse('error', 'Attendance sheet not found');

    const rows = sheet.getDataRange().getValues();

    // Find existing record for staffId + today
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[1]) !== staffId) continue;
      const d = r[2];
      const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
      if (dateStr !== today) continue;

      const currentStatus = String(r[12] || 'approved');
      if (currentStatus === 'approved') {
        return Utils.createResponse('error', 'Your attendance for today has already been approved and cannot be changed.');
      }

      // Update the existing pending/rejected row
      sheet.getRange(i + 1, 4).setValue(shiftId);
      sheet.getRange(i + 1, 5).setValue(clockIn);
      sheet.getRange(i + 1, 6).setValue(clockOut);
      sheet.getRange(i + 1, 9).setValue('present');
      sheet.getRange(i + 1, 10).setValue(notes);
      sheet.getRange(i + 1, 13).setValue('pending');
      return Utils.createResponse('success', 'Attendance updated — awaiting manager approval', {
        attendanceId: String(r[0]), date: today, clockIn, clockOut, status: 'pending'
      });
    }

    // New record for today
    const attendanceId = 'ATT' + Date.now() + Math.random().toString(36).substr(2, 4);
    const now = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
    sheet.appendRow([
      attendanceId, staffId, today, shiftId,
      clockIn, clockOut,
      0, 0,          // hoursWorked/otHours computed by manager at approval
      'present', notes,
      now, orgId, 'pending'
    ]);
    return Utils.createResponse('success', 'Attendance logged — awaiting manager approval', {
      attendanceId, date: today, clockIn, clockOut, status: 'pending'
    });
  },

  getMyAttendance(data) {
    const { staffId, orgId } = data;
    const tz    = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    // last 14 days
    const fromDate = (() => {
      const d = new Date(); d.setDate(d.getDate() - 13);
      return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    })();

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAttendance');
    if (!sheet) return Utils.createResponse('success', 'ok', { todayRecord: null, history: [] });

    // Build shift lookup
    const shiftMap = this._buildShiftMap(ss, orgId);

    const rows   = sheet.getDataRange().getValues();
    let todayRecord = null;
    const history   = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[1]) !== staffId) continue;
      const d = r[2];
      const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
      if (dateStr < fromDate) continue;

      const rec = {
        attendanceId: String(r[0]),
        date:         dateStr,
        shiftId:      String(r[3] || ''),
        shiftName:    shiftMap[String(r[3] || '')] ? shiftMap[String(r[3] || '')].name : '',
        clockIn:      String(r[4] || ''),
        clockOut:     String(r[5] || ''),
        hoursWorked:  Number(r[6]) || 0,
        otHours:      Number(r[7]) || 0,
        dayStatus:    String(r[8] || ''),
        notes:        String(r[9] || ''),
        status:       String(r[12] || 'approved'),
      };

      if (dateStr === today) todayRecord = rec;
      else history.push(rec);
    }

    history.sort((a, b) => b.date.localeCompare(a.date));

    return Utils.createResponse('success', 'Attendance loaded', {
      todayRecord, history,
      shifts: Object.values(shiftMap),
    });
  },

  // ── Advances: self-request ─────────────────────────────────────────────────

  requestAdvance(data) {
    const { staffId, orgId } = data;
    const amount = Number(data.amount) || 0;
    const notes  = String(data.notes || '').trim();
    if (amount <= 0) return Utils.createResponse('error', 'Amount must be greater than zero');

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('error', 'StaffAdvance sheet not found');

    const rows = sheet.getDataRange().getValues();
    // Check for existing pending or approved request
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) !== staffId) continue;
      const status = String(rows[i][9] || 'disbursed');
      if (status === 'pending' || status === 'approved') {
        return Utils.createResponse('error', 'You already have a pending or approved advance request. Please wait for it to be processed.');
      }
    }

    const tz  = Session.getScriptTimeZone();
    const now = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
    const today = now.slice(0, 10);

    // Running balance = last known disbursed balance
    let runningBalance = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) !== staffId) continue;
      const status = String(rows[i][9] || 'disbursed');
      if (status === 'disbursed') runningBalance = Number(rows[i][6]) || 0;
    }

    const advanceId = 'ADV' + Date.now();
    sheet.appendRow([
      advanceId, staffId, today, 'advance',
      amount, notes,
      runningBalance, // balance not yet updated until disbursed
      now, orgId,
      'pending', 0, ''
    ]);

    return Utils.createResponse('success', 'Advance request submitted — awaiting manager approval', {
      advanceId, amount, status: 'pending'
    });
  },

  getMyAdvances(data) {
    const { staffId } = data;

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('StaffAdvance');
    if (!sheet) return Utils.createResponse('success', 'ok', { advances: [], balance: 0, hasPending: false });

    const rows    = sheet.getDataRange().getValues();
    const advances = [];
    let balance    = 0;
    let hasPending = false;

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (String(rows[i][1]) !== staffId) continue;
      const d = rows[i][2];
      const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
      const status  = String(rows[i][9] || 'disbursed');
      const amount  = Number(rows[i][4]) || 0;

      advances.push({
        advanceId:      String(rows[i][0]),
        date:           dateStr,
        type:           String(rows[i][3] || 'advance'),
        amount,
        notes:          String(rows[i][5] || ''),
        runningBalance: Number(rows[i][6]) || 0,
        createdAt:      String(rows[i][7] || ''),
        status,
        approvedAmount: Number(rows[i][10]) || 0,
        paymentMode:    String(rows[i][11] || ''),
      });

      if (status === 'pending' || status === 'approved') hasPending = true;
      if (status === 'disbursed') {
        balance += rows[i][3] === 'advance' ? amount : -amount;
      }
    }

    advances.sort((a, b) => b.date.localeCompare(a.date));

    return Utils.createResponse('success', 'Advances loaded', { advances, balance, hasPending });
  },

  // Which portal tabs this deployment has enabled (Permissions > Staff
  // Portal on the admin app). Fetched right after login so changes apply on
  // the next sign-in / dashboard load without redeploying the portal.
  getPortalConfig() {
    return Utils.createResponse('success', 'Portal config', {
      enabledTabs: OrgSettings._portalVisibilityRaw().staffTabs
    });
  },

  // View-only profile for the logged-in staff member. Deliberately no
  // update counterpart yet — which fields staff may edit themselves is
  // still an open product decision; everything stays admin-managed.
  getMyProfile(data) {
    const { staffId } = data;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('error', 'Staff data unavailable');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== staffId) continue;
      const r = rows[i];
      const orgId = String(r[17] || '');
      const org = Organizations._getAllRaw().find(o => o.id === orgId);
      const rawStart = r[7];
      return Utils.createResponse('success', 'Profile loaded', {
        profile: {
          name:         String(r[2] || ''),
          phone:        String(r[3] || ''),
          email:        String(r[4] || ''),
          aadharNumber: String(r[5] || ''),
          upiId:        String(r[6] || ''),
          startDate:    rawStart instanceof Date
            ? Utilities.formatDate(rawStart, Session.getScriptTimeZone(), 'yyyy-MM-dd')
            : String(rawStart || ''),
          role:         String(r[8] || ''),
          staffType:    String(r[14] || ''),
          status:       String(r[13] || ''),
          orgName:      org ? org.name : ''
        }
      });
    }
    return Utils.createResponse('error', 'Staff record not found');
  },

  // ── Payslips: view + approve own payroll records ───────────────────────────
  // Status flow (admin side): draft → review → approved → paid. Staff see a
  // record once the admin moves it to 'review'; approving it moves it to
  // 'approved', after which it stays visible here as history (and 'paid'
  // records remain visible permanently). Draft/voided records never appear.

  getMyPayslips(data) {
    const { staffId } = data;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('success', 'No payslips', { payslips: [] });

    const VISIBLE = ['review', 'approved', 'paid'];
    const rows = sheet.getDataRange().getValues();
    const payslips = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (String(rows[i][1]) !== staffId) continue;
      const status = String(rows[i][21] || '').toLowerCase();
      if (!VISIBLE.includes(status)) continue;
      payslips.push(Payroll._rowToBreakdown(rows[i]));
    }

    payslips.sort((a, b) => String(b.period).localeCompare(String(a.period)));
    return Utils.createResponse('success', 'Payslips loaded', { payslips });
  },

  approveMyPayslip(data) {
    const { staffId } = data;
    const payrollId = String(data.payrollId || '');
    if (!payrollId) return Utils.createResponse('error', 'payrollId is required');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('error', 'Payroll sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== payrollId) continue;
      // Own record only, and only while it's awaiting review — staff can't
      // touch any other status transition.
      if (String(rows[i][1]) !== staffId) {
        return Utils.createResponse('error', 'This payslip does not belong to you.');
      }
      if (String(rows[i][21] || '').toLowerCase() !== 'review') {
        return Utils.createResponse('error', 'This payslip is not awaiting your approval.');
      }
      sheet.getRange(i + 1, 22).setValue('approved');
      return Utils.createResponse('success', 'Payslip approved', { payrollId });
    }
    return Utils.createResponse('error', 'Payslip not found');
  },

  // ── Private helpers ─────────────────────────────────────────────────────────

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
      };
    }
    return map;
  },

  // Returns map of billId → { customerName, createdAt, dateOnly, paymentMode }
  // Pass from/to = null for no date filter
  _buildBillMap(ss, orgId, from, to, tz) {
    const sheet = ss.getSheetByName('Bills');
    if (!sheet) return {};

    const rows = sheet.getDataRange().getValues();
    const map  = {};

    for (let i = 1; i < rows.length; i++) {
      const r      = rows[i];
      const rowOrg = String(r[19] || '');
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      if (String(r[16] || '') === 'void') continue;

      let createdAt;
      try { createdAt = new Date(r[4]); } catch (e) { continue; }
      if (isNaN(createdAt)) continue;
      if (from && createdAt < from) continue;
      if (to   && createdAt > to)   continue;

      const billId = String(r[0]);
      map[billId]  = {
        customerName: String(r[2]  || '—'),
        createdAt:    Utilities.formatDate(createdAt, tz, 'dd-MMM-yyyy HH:mm'),
        dateOnly:     Utilities.formatDate(createdAt, tz, 'yyyy-MM-dd'),
        paymentMode:  String(r[12] || ''),
      };
    }
    return map;
  },

  _collectItems(ss, staffId, orgId, billMap) {
    const sheet    = ss.getSheetByName('BillItems');
    const services = [];
    const products = [];
    if (!sheet) return { services, products };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const r      = rows[i];
      const billId = String(r[1] || '');
      if (!billMap[billId]) continue;
      if (String(r[5] || '').trim() !== staffId) continue;

      const itemOrgId = String(r[17] || '');
      if (orgId && itemOrgId && itemOrgId !== orgId) continue;

      const bill = billMap[billId];
      const item = {
        billItemId:     String(r[0]  || ''),
        billId,
        itemName:       String(r[4]  || ''),
        qty:            Number(r[7]  || 1),
        unitPrice:      Number(r[8]  || 0),
        lineTotal:      Number(r[12] || 0),
        customerName:   bill.customerName,
        createdAt:      bill.createdAt,
        paymentMode:    bill.paymentMode,
        staffConfirmed: String(r[18] || '').trim(),
      };

      const type = String(r[2] || '').trim();
      if (type === 'service')      services.push(item);
      else if (type === 'product') products.push(item);
    }
    return { services, products };
  },

  _dayStart(dateStr) {
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0); return d;
  },
  _dayEnd(dateStr) {
    const d = new Date(dateStr); d.setHours(23, 59, 59, 999); return d;
  }
};
