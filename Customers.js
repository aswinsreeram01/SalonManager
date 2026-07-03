// Customers sheet columns (0-based):
// timestamp(0), name(1), phone(2), addedBy(3), orgId(4),
// pointsBalance(5), statusPoints(6), tier(7)

const Customers = {
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) return Utils.createResponse('error', 'Customers sheet not found. Please create it with columns: timestamp, name, phone, addedBy, orgId');

    const phone = Utils.normalizePhone(data.phone);
    if (!phone) return Utils.createResponse('error', 'Phone number required');

    const existing = sheet.getDataRange().getValues();
    const orgId = data.orgId || '';
    for (let i = 1; i < existing.length; i++) {
      if (Utils.normalizePhone(existing[i][2]) === phone) {
        const rowOrg = existing[i][4] || '';
        if (!orgId || !rowOrg || rowOrg === orgId) {
          return Utils.createResponse('error', 'A customer with this phone number already exists');
        }
      }
    }

    sheet.appendRow([new Date(), data.name, phone, data.userId || data.submittedBy || 'Unknown', orgId]);
    Utils.clearCached('customers_' + orgId);
    return Utils.createResponse('success', 'Customer added successfully', { phone });
  },

  loginByPhone(data) {
    const phone = Utils.normalizePhone(data.phone);
    if (!phone) return Utils.createResponse('error', 'Phone number required');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) return Utils.createResponse('error', 'Customer not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (Utils.normalizePhone(rows[i][2]) === phone) {
        return Utils.createResponse('success', 'Welcome back!', {
          name: rows[i][1],
          phone: Utils.normalizePhone(rows[i][2]),
          since: rows[i][0] instanceof Date ? rows[i][0].toISOString() : String(rows[i][0])
        });
      }
    }
    return Utils.createResponse('error', 'Phone number not found. Please visit the salon to register.');
  },

  getHistory(data) {
    const phone = Utils.normalizePhone(data.phone);
    if (!phone) return Utils.createResponse('error', 'Phone number required');

    const custSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!custSheet) return Utils.createResponse('error', 'Customer not found');

    const custRows = custSheet.getDataRange().getValues();
    let customerName = '';
    for (let i = 1; i < custRows.length; i++) {
      if (Utils.normalizePhone(custRows[i][2]) === phone) { customerName = custRows[i][1]; break; }
    }
    if (!customerName) return Utils.createResponse('error', 'Customer not found');

    const billSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
    const bills = [];
    if (billSheet) {
      const billData = billSheet.getDataRange().getValues();
      for (let i = 1; i < billData.length; i++) {
        if (!billData[i][0]) continue;
        if (billData[i][16] === 'void') continue;
        // Match by phone (customerId), not name — a rename or a shared name
        // between two customers previously mis-attributed bill history.
        if (Utils.normalizePhone(billData[i][1]) !== phone) continue;
        bills.push({
          billId: billData[i][0],
          date: String(billData[i][4]),
          servicesSubtotal: billData[i][5],
          retailSubtotal: billData[i][7],
          discount: billData[i][9],
          grandTotal: billData[i][11],
          paymentMode: billData[i][12],
          status: billData[i][16]
        });
      }
      bills.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    let lastBillItems = [];
    if (bills.length > 0) {
      const itemSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BillItems');
      if (itemSheet) {
        const itemRows = itemSheet.getDataRange().getValues();
        for (let i = 1; i < itemRows.length; i++) {
          if (itemRows[i][1] !== bills[0].billId) continue;
          lastBillItems.push({
            itemName: itemRows[i][4],
            staffName: itemRows[i][6],
            qty: itemRows[i][7],
            unitPrice: itemRows[i][8],
            lineTotal: itemRows[i][12],
            type: itemRows[i][2]
          });
        }
      }
    }

    return Utils.createResponse('success', 'History retrieved', { bills, customerName, lastBillItems });
  },

  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const cacheKey = 'customers_' + orgId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Customers retrieved', { customers: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) return Utils.createResponse('success', 'Customers retrieved', { customers: [] });

    const customerData = sheet.getDataRange().getValues();
    const customers = [];
    for (let i = 1; i < customerData.length; i++) {
      const rowOrg = customerData[i][4] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      const raw = customerData[i][0];
      customers.push({
        timestamp:     raw instanceof Date ? raw.toISOString() : String(raw),
        name:          customerData[i][1],
        phone:         Utils.normalizePhone(customerData[i][2]),
        addedBy:       customerData[i][3],
        orgId:         rowOrg,
        pointsBalance: Number(customerData[i][5]) || 0,
        statusPoints:  Number(customerData[i][6]) || 0,
        tier:          customerData[i][7] || ''
      });
    }

    Utils.setCached(cacheKey, customers);
    return Utils.createResponse('success', 'Customers retrieved', { customers });
  }
};
