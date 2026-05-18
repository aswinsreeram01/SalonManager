const Customers = {
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    
    sheet.appendRow([
      new Date(),
      data.name,
      data.phone,
      data.submittedBy || 'Unknown'
    ]);
    
    return Utils.createResponse('success', 'Customer added successfully');
  },
  
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    const customerData = sheet.getDataRange().getValues();
    const customers = [];
    
    for (let i = 1; i < customerData.length; i++) {
      customers.push({
        timestamp: customerData[i][0],
        name: customerData[i][1],
        phone: customerData[i][2],
        addedBy: customerData[i][3]
      });
    }
    
    return Utils.createResponse('success', 'Customers retrieved', { customers: customers });
  }
};