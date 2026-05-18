const Permissions = {
  getByRole(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    const permData = sheet.getDataRange().getValues();
    const permissions = [];
    
    for (let i = 1; i < permData.length; i++) {
      if (permData[i][1] === data.roleId) {
        permissions.push({
          id: permData[i][0],
          roleId: permData[i][1],
          menuItem: permData[i][2],
          canAccess: permData[i][3]
        });
      }
    }
    
    return Utils.createResponse('success', 'Permissions retrieved', { permissions: permissions });
  },
  
  getByUser(data) {
    // Get user's role
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let userRoleId = null;
    
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][0] === data.userId) {
        userRoleId = usersData[i][7];
        break;
      }
    }
    
    if (!userRoleId) {
      return Utils.createResponse('error', 'User not found');
    }
    
    return this.getByRole({ roleId: userRoleId });
  },
  
  updateBulk(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    
    data.permissions.forEach(perm => {
      const permData = sheet.getDataRange().getValues();
      let found = false;
      
      for (let i = 1; i < permData.length; i++) {
        if (permData[i][1] === data.roleId && permData[i][2] === perm.menuItem) {
          sheet.getRange(i + 1, 4).setValue(perm.canAccess);
          found = true;
          break;
        }
      }
      
      // If permission doesn't exist, create it
      if (!found) {
        const permId = 'PERM' + Date.now() + Math.random();
        sheet.appendRow([permId, data.roleId, perm.menuItem, perm.canAccess]);
      }
    });
    
    return Utils.createResponse('success', 'Permissions updated successfully');
  }
};