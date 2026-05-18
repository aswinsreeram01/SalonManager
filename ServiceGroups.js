const ServiceGroups = {
  getAll() {
    const cached = Utils.getCached('service_groups');
    if (cached) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: [] });

    const data = sheet.getDataRange().getValues();
    const serviceGroups = [];
    for (let i = 1; i < data.length; i++) {
      serviceGroups.push({ id: data[i][0], name: data[i][1], description: data[i][2], gst: data[i][3], status: data[i][4] });
    }

    Utils.setCached('service_groups', serviceGroups);
    return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found. Please create it with columns: id, name, description, gst, status');

    const id = 'SGP' + Date.now();
    sheet.appendRow([id, data.name, data.description || '', data.gst || 0, data.status || 'active']);
    Utils.clearCached('service_groups');
    return Utils.createResponse('success', 'Service group added successfully');
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description || '');
        sheet.getRange(i + 1, 4).setValue(data.gst || 0);
        sheet.getRange(i + 1, 5).setValue(data.status);
        Utils.clearCached('service_groups');
        return Utils.createResponse('success', 'Service group updated successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        Utils.clearCached('service_groups');
        return Utils.createResponse('success', 'Service group deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  }
};
