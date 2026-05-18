const PriceBooks = {
  getAll(data) {
    const cached = Utils.getCached('pricebooks');
    if (cached) return Utils.createResponse('success', 'Price books retrieved', { priceBooks: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    if (!sheet) return Utils.createResponse('success', 'Price books retrieved', { priceBooks: [] });

    const pbData = sheet.getDataRange().getValues();
    const priceBooks = [];
    for (let i = 1; i < pbData.length; i++) {
      priceBooks.push({ id: pbData[i][0], name: pbData[i][1], description: pbData[i][2], status: pbData[i][3] });
    }

    Utils.setCached('pricebooks', priceBooks);
    return Utils.createResponse('success', 'Price books retrieved', { priceBooks });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    if (!sheet) return Utils.createResponse('error', 'PriceBooks sheet not found');

    const priceBookId = 'PB' + Date.now();
    sheet.appendRow([priceBookId, data.name, data.description, data.status || 'active']);
    Utils.clearCached('pricebooks');
    return Utils.createResponse('success', 'Price book added successfully', { id: priceBookId });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    if (!sheet) return Utils.createResponse('error', 'PriceBooks sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description);
        sheet.getRange(i + 1, 4).setValue(data.status);
        Utils.clearCached('pricebooks');
        return Utils.createResponse('success', 'Price book updated successfully');
      }
    }
    return Utils.createResponse('error', 'Price book not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBooks');
    if (!sheet) return Utils.createResponse('error', 'PriceBooks sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        this.deleteAllItems(data.id);
        Utils.clearCached('pricebooks');
        Utils.clearCached('pb_items_' + data.id);
        return Utils.createResponse('success', 'Price book deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Price book not found');
  },

  deleteAllItems(priceBookId) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    if (!sheet) return;
    const itemsData = sheet.getDataRange().getValues();
    for (let i = itemsData.length - 1; i >= 1; i--) {
      if (itemsData[i][1] === priceBookId) sheet.deleteRow(i + 1);
    }
  },

  getItems(data) {
    const cacheKey = 'pb_items_' + data.priceBookId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Price book items retrieved', { items: cached });

    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    if (!itemsSheet) return Utils.createResponse('success', 'Price book items retrieved', { items: [] });

    // Use cached services if available to avoid a second sheet read
    let servicesMap = {};
    const cachedServices = Utils.getCached('services');
    if (cachedServices) {
      cachedServices.forEach(s => {
        servicesMap[s.id] = { name: s.name, serviceGroupId: s.serviceGroupId, defaultPrice: s.defaultPrice };
      });
    } else {
      const servicesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Services');
      if (servicesSheet) {
        const servicesData = servicesSheet.getDataRange().getValues();
        for (let i = 1; i < servicesData.length; i++) {
          servicesMap[servicesData[i][0]] = {
            name: servicesData[i][1], serviceGroupId: servicesData[i][4], defaultPrice: servicesData[i][5]
          };
        }
      }
    }

    const itemsData = itemsSheet.getDataRange().getValues();
    const items = [];

    for (let i = 1; i < itemsData.length; i++) {
      if (itemsData[i][1] === data.priceBookId) {
        const serviceId = itemsData[i][2];
        const service = servicesMap[serviceId] || {};
        items.push({
          itemId: itemsData[i][0], priceBookId: itemsData[i][1], serviceId,
          serviceName: service.name || 'Unknown', serviceGroupId: service.serviceGroupId || '',
          price: itemsData[i][3], isDefault: false
        });
      }
    }

    for (const serviceId in servicesMap) {
      if (!items.find(item => item.serviceId === serviceId)) {
        items.push({
          itemId: null, priceBookId: data.priceBookId, serviceId,
          serviceName: servicesMap[serviceId].name, serviceGroupId: servicesMap[serviceId].serviceGroupId || '',
          price: servicesMap[serviceId].defaultPrice, isDefault: true
        });
      }
    }

    Utils.setCached(cacheKey, items);
    return Utils.createResponse('success', 'Price book items retrieved', { items });
  },

  addItem(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    if (!sheet) return Utils.createResponse('error', 'PriceBookItems sheet not found');

    const itemId = 'PBI' + Date.now();
    sheet.appendRow([itemId, data.priceBookId, data.serviceId, data.price]);
    Utils.clearCached('pb_items_' + data.priceBookId);
    return Utils.createResponse('success', 'Price added successfully');
  },

  updateItem(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    if (!sheet) return Utils.createResponse('error', 'PriceBookItems sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.itemId) {
        sheet.getRange(i + 1, 4).setValue(data.price);
        Utils.clearCached('pb_items_' + dataRange[i][1]); // dataRange[i][1] is priceBookId
        return Utils.createResponse('success', 'Price updated successfully');
      }
    }
    return Utils.createResponse('error', 'Price book item not found');
  },

  removeItem(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceBookItems');
    if (!sheet) return Utils.createResponse('error', 'PriceBookItems sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.itemId) {
        const priceBookId = dataRange[i][1];
        sheet.deleteRow(i + 1);
        Utils.clearCached('pb_items_' + priceBookId);
        return Utils.createResponse('success', 'Price deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Price book item not found');
  }
};
