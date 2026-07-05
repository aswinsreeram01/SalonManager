// ProductGroups sheet columns (0-based):
// id(0), name(1), gstPct(2), hsnCode(3), unitIncentive(4), sortOrder(5), status(6), orgId(7), pointsEligible(8)

const ProductGroups = {
  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const includeChildren = !!(data && data.includeChildren);
    let cached = null;
    if (!includeChildren) {
      cached = Utils.getCached('product_groups_' + orgId);
      if (cached) return Utils.createResponse('success', 'Product groups retrieved', { productGroups: cached });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('success', 'Product groups retrieved', { productGroups: [] });

    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;

    const rows = sheet.getDataRange().getValues();
    const productGroups = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][7] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;
      productGroups.push({
        id:             rows[i][0],
        name:           rows[i][1],
        gstPct:         Number(rows[i][2]) || 0,
        hsnCode:        rows[i][3] || '',
        unitIncentive:  Number(rows[i][4]) || 0,
        sortOrder:      Number(rows[i][5]) || 0,
        status:         rows[i][6],
        orgId:          rowOrg,
        pointsEligible: rows[i][8] === true || rows[i][8] === 'TRUE'
      });
    }

    productGroups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.name).localeCompare(String(b.name));
    });

    if (!includeChildren) Utils.setCached('product_groups_' + orgId, productGroups);
    return Utils.createResponse('success', 'Product groups retrieved', { productGroups });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('error', 'ProductGroups sheet not found. Please create it with columns: id, name, gstPct, hsnCode, unitIncentive, sortOrder, status, orgId');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }
    const orgId = data.targetOrgId || data.orgId || '';

    const id = 'PGP' + Date.now();
    sheet.appendRow([
      id,
      data.name,
      Number(data.gstPct)        || 0,
      data.hsnCode               || '',
      Number(data.unitIncentive) || 0,
      Number(data.sortOrder)     || 0,
      data.status                || 'active',
      orgId,
      data.pointsEligible        === true || data.pointsEligible === 'TRUE' ? true : false
    ]);
    Utils.clearCached('product_groups_' + orgId);
    return Utils.createResponse('success', 'Product group added successfully', { id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('error', 'ProductGroups sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        const oldOrgId = sheetData[i][7] || '';
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(Number(data.gstPct)        || 0);
        sheet.getRange(i + 1, 4).setValue(data.hsnCode               || '');
        sheet.getRange(i + 1, 5).setValue(Number(data.unitIncentive) || 0);
        sheet.getRange(i + 1, 6).setValue(Number(data.sortOrder)     || 0);
        sheet.getRange(i + 1, 7).setValue(data.status);
        sheet.getRange(i + 1, 8).setValue(newOrgId);
        sheet.getRange(i + 1, 9).setValue(data.pointsEligible === true || data.pointsEligible === 'TRUE' ? true : false);
        Utils.clearCached('product_groups_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('product_groups_' + newOrgId);
        return Utils.createResponse('success', 'Product group updated successfully');
      }
    }
    return Utils.createResponse('error', 'Product group not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('error', 'ProductGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 7).setValue('inactive');
        Utils.clearCached('product_groups_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Product group deactivated successfully');
      }
    }
    return Utils.createResponse('error', 'Product group not found');
  }
};
