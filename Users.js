const Users = {
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const userData = sheet.getDataRange().getValues();
    const users = [];
    
    for (let i = 1; i < userData.length; i++) {
      users.push({
        id: userData[i][0],
        email: userData[i][1],
        fullName: userData[i][3],
        phone: userData[i][4],
        whatsapp: userData[i][5],
        orgId: userData[i][6],
        roleId: userData[i][7],
        status: userData[i][8]
      });
    }
    
    // Filter by org if needed
    if (data.userOrgId) {
      const orgsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
      const orgsData = orgsSheet.getDataRange().getValues();
      const allOrgs = [];
      
      for (let i = 1; i < orgsData.length; i++) {
        allOrgs.push({
          id: orgsData[i][0],
          parentId: orgsData[i][2] || null
        });
      }
      
      const allowedOrgIds = Organizations.getOrgAndChildren(data.userOrgId, allOrgs).map(o => o.id);
      const filteredUsers = users.filter(u => allowedOrgIds.includes(u.orgId));
      
      return Utils.createResponse('success', 'Users retrieved', { users: filteredUsers });
    }
    
    return Utils.createResponse('success', 'Users retrieved', { users: users });
  },
  
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const userId = 'USR' + Date.now();
    
    // Check if email already exists
    const existingData = sheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][1] === data.email) {
        return Utils.createResponse('error', 'Email already exists');
      }
    }
    
    sheet.appendRow([
      userId,
      data.email,
      Utils.hashPassword(data.password),
      data.fullName,
      data.phone,
      data.whatsapp,
      data.orgId,
      data.roleId,
      data.status || 'active'
    ]);
    
    return Utils.createResponse('success', 'User added successfully', { id: userId });
  },
  
  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const dataRange = sheet.getDataRange().getValues();
    
    // Check if email already exists for another user
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][1] === data.email && dataRange[i][0] !== data.id) {
        return Utils.createResponse('error', 'Email already exists');
      }
    }
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.email);
        if (data.password) {
          sheet.getRange(i + 1, 3).setValue(Utils.hashPassword(data.password));
        }
        sheet.getRange(i + 1, 4).setValue(data.fullName);
        sheet.getRange(i + 1, 5).setValue(data.phone);
        sheet.getRange(i + 1, 6).setValue(data.whatsapp);
        sheet.getRange(i + 1, 7).setValue(data.orgId);
        sheet.getRange(i + 1, 8).setValue(data.roleId);
        sheet.getRange(i + 1, 9).setValue(data.status);
        return Utils.createResponse('success', 'User updated successfully');
      }
    }
    
    return Utils.createResponse('error', 'User not found');
  },
  
  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        return Utils.createResponse('success', 'User deleted successfully');
      }
    }
    
    return Utils.createResponse('error', 'User not found');
  }
};