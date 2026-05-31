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

  // ── Private helpers ─────────────────────────────────────────────────────────

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
      if (String(r[16] || '') === 'voided') continue;

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
