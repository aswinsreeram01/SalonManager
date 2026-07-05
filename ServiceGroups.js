// ServiceGroups sheet columns (0-based):
// id(0), name(1), description(2), gstPct(3), sacCode(4), countForTarget(5),
// directIncentivePct(6), sortOrder(7), status(8), orgId(9), pointsEligible(10)

const ServiceGroups = {
  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const includeChildren = !!(data && data.includeChildren);
    let cached = null;
    if (!includeChildren) {
      cached = Utils.getCached('service_groups_' + orgId);
      if (cached) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: cached });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: [] });

    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;

    const rows = sheet.getDataRange().getValues();
    const serviceGroups = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][9] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;
      serviceGroups.push({
        id:                 rows[i][0],
        name:               rows[i][1],
        description:        rows[i][2],
        gstPct:             rows[i][3],
        sacCode:            rows[i][4] || '',
        countForTarget:     rows[i][5] === true || rows[i][5] === 'TRUE',
        directIncentivePct: Number(rows[i][6]) || 0,
        sortOrder:          Number(rows[i][7]) || 0,
        status:             rows[i][8],
        orgId:              rowOrg,
        pointsEligible:     rows[i][10] === true || rows[i][10] === 'TRUE'
      });
    }

    serviceGroups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.name).localeCompare(String(b.name));
    });

    if (!includeChildren) Utils.setCached('service_groups_' + orgId, serviceGroups);
    return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found. Please create it with columns: id, name, description, gstPct, sacCode, countForTarget, directIncentivePct, sortOrder, status, orgId');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }
    const orgId = data.targetOrgId || data.orgId || '';

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
      data.status              || 'active',
      orgId,
      data.pointsEligible      === true || data.pointsEligible === 'TRUE' ? true : false
    ]);
    Utils.clearCached('service_groups_' + orgId);
    return Utils.createResponse('success', 'Service group added successfully', { id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        const oldOrgId = sheetData[i][9] || '';
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description         || '');
        sheet.getRange(i + 1, 4).setValue(Number(data.gstPct)      || 0);
        sheet.getRange(i + 1, 5).setValue(data.sacCode             || '');
        sheet.getRange(i + 1, 6).setValue(data.countForTarget === true || data.countForTarget === 'TRUE' ? true : false);
        sheet.getRange(i + 1, 7).setValue(Number(data.directIncentivePct) || 0);
        sheet.getRange(i + 1, 8).setValue(Number(data.sortOrder)   || 0);
        sheet.getRange(i + 1, 9).setValue(data.status);
        sheet.getRange(i + 1, 10).setValue(newOrgId);
        sheet.getRange(i + 1, 11).setValue(data.pointsEligible === true || data.pointsEligible === 'TRUE' ? true : false);
        Utils.clearCached('service_groups_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('service_groups_' + newOrgId);
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
        Utils.clearCached('service_groups_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Service group deactivated successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  }
};
