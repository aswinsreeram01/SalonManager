const Roles = {
  getAll() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Roles');
    const roleData = sheet.getDataRange().getValues();
    const roles = [];
    
    for (let i = 1; i < roleData.length; i++) {
      roles.push({
        id: roleData[i][0],
        name: roleData[i][1],
        description: roleData[i][2],
        status: roleData[i][3]
      });
    }
    
    return Utils.createResponse('success', 'Roles retrieved', { roles: roles });
  },
  
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Roles');
    const roleId = 'ROLE' + Date.now();
    
    sheet.appendRow([
      roleId,
      data.name,
      data.description,
      data.status || 'active'
    ]);
    
    return Utils.createResponse('success', 'Role added successfully', { id: roleId });
  },
  
  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Roles');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description);
        sheet.getRange(i + 1, 4).setValue(data.status);
        return Utils.createResponse('success', 'Role updated successfully');
      }
    }
    
    return Utils.createResponse('error', 'Role not found');
  },
  
  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Roles');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        return Utils.createResponse('success', 'Role deleted successfully');
      }
    }
    
    return Utils.createResponse('error', 'Role not found');
  }
};