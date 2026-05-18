const Services = {
  getAll(data) {
    const cached = Utils.getCached('services');
    if (cached) return Utils.createResponse('success', 'Services retrieved', { services: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('success', 'Services retrieved', { services: [] });

    const serviceData = sheet.getDataRange().getValues();
    const services = [];
    for (let i = 1; i < serviceData.length; i++) {
      services.push({
        id:             serviceData[i][0],
        name:           serviceData[i][1],
        description:    serviceData[i][2],
        duration:       serviceData[i][3],
        serviceGroupId: serviceData[i][4],
        defaultPrice:   serviceData[i][5],
        status:         serviceData[i][6]
      });
    }

    Utils.setCached('services', services);
    return Utils.createResponse('success', 'Services retrieved', { services });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('error', 'Services sheet not found');

    const serviceId = 'SRV' + Date.now();
    sheet.appendRow([serviceId, data.name, data.description || '', data.duration,
                     data.serviceGroupId || '', data.defaultPrice, data.status || 'active']);
    Utils.clearCached('services');
    return Utils.createResponse('success', 'Service added successfully');
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('error', 'Services sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description || '');
        sheet.getRange(i + 1, 4).setValue(data.duration);
        sheet.getRange(i + 1, 5).setValue(data.serviceGroupId || '');
        sheet.getRange(i + 1, 6).setValue(data.defaultPrice);
        sheet.getRange(i + 1, 7).setValue(data.status);
        Utils.clearCached('services');
        return Utils.createResponse('success', 'Service updated successfully');
      }
    }
    return Utils.createResponse('error', 'Service not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('error', 'Services sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        Utils.clearCached('services');
        return Utils.createResponse('success', 'Service deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Service not found');
  }
};
