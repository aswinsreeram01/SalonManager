const Staff = {
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    const staffData = sheet.getDataRange().getValues();
    const staff = [];
    
    for (let i = 1; i < staffData.length; i++) {
      staff.push({
        id: staffData[i][0],
        userId: staffData[i][1],
        name: staffData[i][2],
        phone: staffData[i][3],
        email: staffData[i][4],
        aadharNumber: staffData[i][5],
        upiId: staffData[i][6],
        startDate: staffData[i][7],
        role: staffData[i][8],
        salary: staffData[i][9],
        allowance: staffData[i][10],
        incentiveStructure: staffData[i][11],
        specialization: staffData[i][12],
        status: staffData[i][13]
      });
    }
    
    return Utils.createResponse('success', 'Staff retrieved', { staff: staff });
  },
  
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    const staffId = 'STF' + Date.now();
    
    sheet.appendRow([
      staffId,
      data.userId || '',
      data.name,
      data.phone,
      data.email,
      data.aadharNumber,
      data.upiId,
      data.startDate,
      data.role,
      data.salary,
      data.allowance,
      data.incentiveStructure,
      data.specialization,
      data.status || 'active'
    ]);
    
    return Utils.createResponse('success', 'Staff member added successfully');
  },
  
  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.userId || '');
        sheet.getRange(i + 1, 3).setValue(data.name);
        sheet.getRange(i + 1, 4).setValue(data.phone);
        sheet.getRange(i + 1, 5).setValue(data.email);
        sheet.getRange(i + 1, 6).setValue(data.aadharNumber);
        sheet.getRange(i + 1, 7).setValue(data.upiId);
        sheet.getRange(i + 1, 8).setValue(data.startDate);
        sheet.getRange(i + 1, 9).setValue(data.role);
        sheet.getRange(i + 1, 10).setValue(data.salary);
        sheet.getRange(i + 1, 11).setValue(data.allowance);
        sheet.getRange(i + 1, 12).setValue(data.incentiveStructure);
        sheet.getRange(i + 1, 13).setValue(data.specialization);
        sheet.getRange(i + 1, 14).setValue(data.status);
        return Utils.createResponse('success', 'Staff member updated successfully');
      }
    }
    
    return Utils.createResponse('error', 'Staff member not found');
  },
  
  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        return Utils.createResponse('success', 'Staff member deleted successfully');
      }
    }
    
    return Utils.createResponse('error', 'Staff member not found');
  }
};