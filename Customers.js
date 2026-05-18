const Customers = {
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) return Utils.createResponse('error', 'Customers sheet not found. Please create it with columns: timestamp, name, phone, addedBy');

    sheet.appendRow([
      new Date(),
      data.name,
      data.phone,
      data.submittedBy || 'Unknown'
    ]);

    return Utils.createResponse('success', 'Customer added successfully');
  },

  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) return Utils.createResponse('success', 'Customers retrieved', { customers: [] });

    const customerData = sheet.getDataRange().getValues();
    const customers = [];

    for (let i = 1; i < customerData.length; i++) {
      const raw = customerData[i][0];
      const timestamp = raw instanceof Date ? raw.toISOString() : String(raw);
      customers.push({
        timestamp,
        name: customerData[i][1],
        phone: customerData[i][2],
        addedBy: customerData[i][3]
      });
    }

    return Utils.createResponse('success', 'Customers retrieved', { customers });
  }
};