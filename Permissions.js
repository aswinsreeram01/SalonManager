const Permissions = {
  getByRole(data) {
    const cacheKey = 'perms_' + data.roleId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Permissions retrieved', { permissions: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (!sheet) return Utils.createResponse('success', 'Permissions retrieved', { permissions: [] });

    const permData = sheet.getDataRange().getValues();
    const permissions = [];
    for (let i = 1; i < permData.length; i++) {
      if (permData[i][1] === data.roleId) {
        permissions.push({
          id: permData[i][0], roleId: permData[i][1],
          menuItem: permData[i][2], canAccess: permData[i][3]
        });
      }
    }

    Utils.setCached(cacheKey, permissions);
    return Utils.createResponse('success', 'Permissions retrieved', { permissions });
  },

  getByUser(data) {
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!usersSheet) return Utils.createResponse('error', 'User not found');

    const usersData = usersSheet.getDataRange().getValues();
    let userRoleId = null;
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][0] === data.userId) { userRoleId = usersData[i][7]; break; }
    }
    if (!userRoleId) return Utils.createResponse('error', 'User not found');
    return this.getByRole({ roleId: userRoleId });
  },

  updateBulk(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (!sheet) return Utils.createResponse('error', 'Permissions sheet not found');

    // Read the sheet once, not once per permission item
    const permData = sheet.getDataRange().getValues();

    data.permissions.forEach(perm => {
      let found = false;
      for (let i = 1; i < permData.length; i++) {
        if (permData[i][1] === data.roleId && permData[i][2] === perm.menuItem) {
          sheet.getRange(i + 1, 4).setValue(perm.canAccess);
          permData[i][3] = perm.canAccess;
          found = true;
          break;
        }
      }
      if (!found) {
        const permId = 'PERM' + Date.now() + Math.random();
        sheet.appendRow([permId, data.roleId, perm.menuItem, perm.canAccess]);
      }
    });

    Utils.clearCached('perms_' + data.roleId);
    return Utils.createResponse('success', 'Permissions updated successfully');
  }
};
