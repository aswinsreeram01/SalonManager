// Customers sheet columns (0-based):
// timestamp(0), name(1), phone(2), addedBy(3), orgId(4)

const Customers = {
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) return Utils.createResponse('error', 'Customers sheet not found. Please create it with columns: timestamp, name, phone, addedBy, orgId');

    const existing = sheet.getDataRange().getValues();
    const orgId = data.orgId || '';
    for (let i = 1; i < existing.length; i++) {
      if (String(existing[i][2]).trim() === String(data.phone).trim()) {
        const rowOrg = existing[i][4] || '';
        if (!orgId || !rowOrg || rowOrg === orgId) {
          return Utils.createResponse('error', 'A customer with this phone number already exists');
        }
      }
    }

    sheet.appendRow([new Date(), data.name, data.phone, data.userId || data.submittedBy || 'Unknown', orgId]);
    Utils.clearCached('customers_' + orgId);
    return Utils.createResponse('success', 'Customer added successfully', { phone: data.phone });
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
        timestamp: raw instanceof Date ? raw.toISOString() : String(raw),
        name:      customerData[i][1],
        phone:     customerData[i][2],
        addedBy:   customerData[i][3],
        orgId:     rowOrg
      });
    }

    Utils.setCached(cacheKey, customers);
    return Utils.createResponse('success', 'Customers retrieved', { customers });
  }
};
