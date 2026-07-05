const Services = {
  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const includeChildren = !!(data && data.includeChildren);
    let cached = null;
    if (!includeChildren) {
      cached = Utils.getCached('services_' + orgId);
      if (cached) return Utils.createResponse('success', 'Services retrieved', { services: cached });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('success', 'Services retrieved', { services: [] });

    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;

    const serviceData = sheet.getDataRange().getValues();
    const services = [];
    for (let i = 1; i < serviceData.length; i++) {
      if (!serviceData[i][0]) continue;
      const rowOrg = serviceData[i][7] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;
      services.push({
        id:             serviceData[i][0],
        name:           serviceData[i][1],
        description:    serviceData[i][2],
        duration:       serviceData[i][3],
        serviceGroupId: serviceData[i][4],
        defaultPrice:   serviceData[i][5],
        status:         serviceData[i][6],
        orgId:          rowOrg
      });
    }

    if (!includeChildren) Utils.setCached('services_' + orgId, services);
    return Utils.createResponse('success', 'Services retrieved', { services });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('error', 'Services sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }
    const orgId = data.targetOrgId || data.orgId || '';

    const serviceId = 'SRV' + Date.now();
    sheet.appendRow([serviceId, data.name, data.description || '', data.duration,
                     data.serviceGroupId || '', data.defaultPrice, data.status || 'active',
                     orgId]);
    Utils.clearCached('services_' + orgId);
    return Utils.createResponse('success', 'Service added successfully');
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    if (!sheet) return Utils.createResponse('error', 'Services sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        const oldOrgId = dataRange[i][7] || '';
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description || '');
        sheet.getRange(i + 1, 4).setValue(data.duration);
        sheet.getRange(i + 1, 5).setValue(data.serviceGroupId || '');
        sheet.getRange(i + 1, 6).setValue(data.defaultPrice);
        sheet.getRange(i + 1, 7).setValue(data.status);
        sheet.getRange(i + 1, 8).setValue(newOrgId);
        Utils.clearCached('services_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('services_' + newOrgId);
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
        Utils.clearCached('services_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Service deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Service not found');
  }
};
