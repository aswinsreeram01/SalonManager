const Users = {
  getAll(data) {
    let allUsers = Utils.getCached('users');
    if (!allUsers) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
      if (!sheet) return Utils.createResponse('success', 'Users retrieved', { users: [] });

      const userData = sheet.getDataRange().getValues();
      allUsers = [];
      for (let i = 1; i < userData.length; i++) {
        allUsers.push({
          id: userData[i][0], email: userData[i][1], fullName: userData[i][3],
          phone: userData[i][4], whatsapp: userData[i][5],
          orgId: userData[i][6], roleId: userData[i][7], status: userData[i][8]
        });
      }
      Utils.setCached('users', allUsers);
    }

    // Opt-in "sub-orgs" scoping, matching every other entity — own org only
    // by default, own org + descendants when includeChildren is requested.
    const orgId = data.orgId || data.userOrgId || '';
    const includeChildren = !!data.includeChildren;
    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;
    const users = allowedOrgIds ? allUsers.filter(u => u.orgId && allowedOrgIds.has(u.orgId)) : allUsers;
    return Utils.createResponse('success', 'Users retrieved', { users });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!sheet) return Utils.createResponse('error', 'Users sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const existingData = sheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][1] === data.email) return Utils.createResponse('error', 'Email already exists');
    }

    const orgId = data.targetOrgId || data.orgId || '';
    const userId = 'USR' + Date.now();
    sheet.appendRow([userId, data.email, Utils.hashPassword(data.password),
                     data.fullName, data.phone, data.whatsapp, orgId, data.roleId, data.status || 'active']);
    Utils.clearCached('users');
    return Utils.createResponse('success', 'User added successfully', { id: userId });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!sheet) return Utils.createResponse('error', 'Users sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][1] === data.email && dataRange[i][0] !== data.id) {
        return Utils.createResponse('error', 'Email already exists');
      }
    }
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        const oldOrgId = dataRange[i][6] || '';
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;
        sheet.getRange(i + 1, 2).setValue(data.email);
        if (data.password) sheet.getRange(i + 1, 3).setValue(Utils.hashPassword(data.password));
        sheet.getRange(i + 1, 4).setValue(data.fullName);
        sheet.getRange(i + 1, 5).setValue(data.phone);
        sheet.getRange(i + 1, 6).setValue(data.whatsapp);
        sheet.getRange(i + 1, 7).setValue(newOrgId);
        sheet.getRange(i + 1, 8).setValue(data.roleId);
        sheet.getRange(i + 1, 9).setValue(data.status);
        Utils.clearCached('users');
        return Utils.createResponse('success', 'User updated successfully');
      }
    }
    return Utils.createResponse('error', 'User not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!sheet) return Utils.createResponse('error', 'Users sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        Utils.clearCached('users');
        return Utils.createResponse('success', 'User deleted successfully');
      }
    }
    return Utils.createResponse('error', 'User not found');
  }
};
