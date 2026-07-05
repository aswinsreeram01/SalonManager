// Vendors sheet columns (0-based):
// vendorId(0), name(1), contactPerson(2), phone(3), email(4), address(5),
// notes(6), status(7), orgId(8)

const Vendors = {
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('success', 'Vendors retrieved', { vendors: [] });
    const orgId = (data && data.orgId) || '';
    const includeChildren = !!(data && data.includeChildren);
    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;
    const rows = sheet.getDataRange().getValues();
    const vendors = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][8] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;
      vendors.push({
        vendorId: rows[i][0], name: rows[i][1], contactPerson: rows[i][2],
        phone: rows[i][3], email: rows[i][4], address: rows[i][5],
        notes: rows[i][6], status: rows[i][7], orgId: rowOrg
      });
    }
    return Utils.createResponse('success', 'Vendors retrieved', { vendors });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('error', 'Vendors sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }
    const id = 'VEN' + Date.now();
    sheet.appendRow([
      id, data.name, data.contactPerson || '', data.phone || '',
      data.email || '', data.address || '', data.notes || '', 'active',
      data.targetOrgId || data.orgId || ''
    ]);
    return Utils.createResponse('success', 'Vendor added', { vendorId: id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors');
    if (!sheet) return Utils.createResponse('error', 'Vendors sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.vendorId) {
        const oldOrgId = rows[i][8] || '';
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;
        sheet.getRange(i + 1, 2, 1, 7).setValues([[
          data.name, data.contactPerson || '', data.phone || '',
          data.email || '', data.address || '', data.notes || '', data.status || 'active'
        ]]);
        sheet.getRange(i + 1, 9).setValue(newOrgId);
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
