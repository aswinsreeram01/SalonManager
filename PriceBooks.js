const PriceBooks = {
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    const pbData = sheet.getDataRange().getValues();
    const priceBooks = [];
    
    for (let i = 1; i < pbData.length; i++) {
      priceBooks.push({
        id: pbData[i][0],
        name: pbData[i][1],
        description: pbData[i][2],
        status: pbData[i][3]
      });
    }
    
    return Utils.createResponse('success', 'Price books retrieved', { priceBooks: priceBooks });
  },
  
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    const priceBookId = 'PB' + Date.now();
    
    sheet.appendRow([
      priceBookId,
      data.name,
      data.description,
      data.status || 'active'
    ]);
    
    return Utils.createResponse('success', 'Price book added successfully', { id: priceBookId });
  },
  
  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description);
        sheet.getRange(i + 1, 4).setValue(data.status);
        return Utils.createResponse('success', 'Price book updated successfully');
      }
    }
    
    return Utils.createResponse('error', 'Price book not found');
  },
  
  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        this.deleteAllItems(data.id);
        return Utils.createResponse('success', 'Price book deleted successfully');
      }
    }
    
    return Utils.createResponse('error', 'Price book not found');
  },
  
  deleteAllItems(priceBookId) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    const itemsData = sheet.getDataRange().getValues();
    
    for (let i = itemsData.length - 1; i >= 1; i--) {
      if (itemsData[i][1] === priceBookId) {
        sheet.deleteRow(i + 1);
      }
    }
  },
  
  getItems(data) {
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    const servicesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
    
    const itemsData = itemsSheet.getDataRange().getValues();
    const servicesData = servicesSheet.getDataRange().getValues();
    
    // Build services map with default prices
    const servicesMap = {};
    for (let i = 1; i < servicesData.length; i++) {
      servicesMap[servicesData[i][0]] = {
        name: servicesData[i][1],
        category: servicesData[i][4],
        defaultPrice: servicesData[i][5]
      };
    }
    
    const items = [];
    
    // Get items for this price book
    for (let i = 1; i < itemsData.length; i++) {
      if (itemsData[i][1] === data.priceBookId) {
        const serviceId = itemsData[i][2];
        const service = servicesMap[serviceId] || {};
        
        items.push({
          itemId: itemsData[i][0],
          priceBookId: itemsData[i][1],
          serviceId: serviceId,
          serviceName: service.name || 'Unknown',
          category: service.category || '',
          price: itemsData[i][3],
          isDefault: false
        });
      }
    }
    
    // Add services not in price book with default prices
    for (let serviceId in servicesMap) {
      const existingItem = items.find(item => item.serviceId === serviceId);
      if (!existingItem) {
        items.push({
          itemId: null,
          priceBookId: data.priceBookId,
          serviceId: serviceId,
          serviceName: servicesMap[serviceId].name,
          category: servicesMap[serviceId].category,
          price: servicesMap[serviceId].defaultPrice,
          isDefault: true
        });
      }
    }
    
    return Utils.createResponse('success', 'Price book items retrieved', { items: items });
  },
  
  addItem(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    const itemId = 'PBI' + Date.now();
    
    sheet.appendRow([
      itemId,
      data.priceBookId,
      data.serviceId,
      data.price
    ]);
    
    return Utils.createResponse('success', 'Price added successfully');
  },
  
  updateItem(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.itemId) {
        sheet.getRange(i + 1, 4).setValue(data.price);
        return Utils.createResponse('success', 'Price updated successfully');
      }
    }
    
    return Utils.createResponse('error', 'Price book item not found');
  },
  
  removeItem(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.itemId) {
        sheet.deleteRow(i + 1);
        return Utils.createResponse('success', 'Price deleted successfully');
      }
    }
    
    return Utils.createResponse('error', 'Price book item not found');
  }
};