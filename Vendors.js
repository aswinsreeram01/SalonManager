const Vendors = {
  getAll() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('success', 'Vendors retrieved', { vendors: [] });
    const data = sheet.getDataRange().getValues();
    const vendors = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      vendors.push({
        vendorId: data[i][0], name: data[i][1], contactPerson: data[i][2],
        phone: data[i][3], email: data[i][4], address: data[i][5],
        notes: data[i][6], status: data[i][7]
      });
    }
    return Utils.createResponse('success', 'Vendors retrieved', { vendors });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('error', 'Vendors sheet not found');
    const id = 'VEN' + Date.now();
    sheet.appendRow([
      id, data.name, data.contactPerson || '', data.phone || '',
      data.email || '', data.address || '', data.notes || '', 'active'
    ]);
    return Utils.createResponse('success', 'Vendor added', { vendorId: id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('error', 'Vendors sheet not found');
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.vendorId) {
        sheet.getRange(i + 1, 2, 1, 7).setValues([[
          data.name, data.contactPerson || '', data.phone || '',
          data.email || '', data.address || '', data.notes || '', data.status || 'active'
        ]]);
        return Utils.createResponse('success', 'Vendor updated');
      }
    }
    return Utils.createResponse('error', 'Vendor not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('error', 'Vendors sheet not found');
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.vendorId) {
        sheet.getRange(i + 1, 8).setValue('inactive');
        return Utils.createResponse('success', 'Vendor removed');
      }
    }
    return Utils.createResponse('error', 'Vendor not found');
  }
};
