// ServiceGroups sheet columns (0-based):
// id(0), name(1), description(2), gstPct(3), sacCode(4), countForTarget(5),
// directIncentivePct(6), sortOrder(7), status(8)

const ServiceGroups = {
  getAll() {
    const cached = Utils.getCached('service_groups');
    if (cached) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: [] });

    const data = sheet.getDataRange().getValues();
    const serviceGroups = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      serviceGroups.push({
        id:                 data[i][0],
        name:               data[i][1],
        description:        data[i][2],
        gstPct:             data[i][3],
        sacCode:            data[i][4] || '',
        countForTarget:     data[i][5] === true || data[i][5] === 'TRUE',
        directIncentivePct: Number(data[i][6]) || 0,
        sortOrder:          Number(data[i][7]) || 0,
        status:             data[i][8]
      });
    }

    serviceGroups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.name).localeCompare(String(b.name));
    });

    Utils.setCached('service_groups', serviceGroups);
    return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found. Please create it with columns: id, name, description, gstPct, sacCode, countForTarget, directIncentivePct, sortOrder, status');

    const id = 'SGP' + Date.now();
    sheet.appendRow([
      id,
      data.name,
      data.description         || '',
      Number(data.gstPct)      || 0,
      data.sacCode             || '',
      data.countForTarget      === true || data.countForTarget === 'TRUE' ? true : false,
      Number(data.directIncentivePct) || 0,
      Number(data.sortOrder)   || 0,
      data.status              || 'active'
    ]);
    Utils.clearCached('service_groups');
    return Utils.createResponse('success', 'Service group added successfully', { id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description         || '');
        sheet.getRange(i + 1, 4).setValue(Number(data.gstPct)      || 0);
        sheet.getRange(i + 1, 5).setValue(data.sacCode             || '');
        sheet.getRange(i + 1, 6).setValue(data.countForTarget === true || data.countForTarget === 'TRUE' ? true : false);
        sheet.getRange(i + 1, 7).setValue(Number(data.directIncentivePct) || 0);
        sheet.getRange(i + 1, 8).setValue(Number(data.sortOrder)   || 0);
        sheet.getRange(i + 1, 9).setValue(data.status);
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
        sheet.getRange(i + 1, 9).setValue('inactive');
        Utils.clearCached('service_groups');
        return Utils.createResponse('success', 'Service group deactivated successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  }
};
