const Products = {
  getAll() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('success', 'Products retrieved', { products: [] });

    const data = sheet.getDataRange().getValues();
    const products = [];
    for (let i = 1; i < data.length; i++) {
      products.push({
        id:            data[i][0],
        name:          data[i][1],
        category:      data[i][2],
        uom:           data[i][3],
        unitCost:      data[i][4],
        retailPrice:   data[i][5],
        gst:           data[i][6],
        currentStock:  data[i][7],
        baseStock:     data[i][8],
        manufacturer:  data[i][9],
        vendorName:    data[i][10],
        vendorContact: data[i][11],
        status:        data[i][12]
      });
    }
    return Utils.createResponse('success', 'Products retrieved', { products });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found. Please create it with columns: id, name, category, uom, unitCost, retailPrice, gst, currentStock, baseStock, manufacturer, vendorName, vendorContact, status');

    const id = 'PRD' + Date.now();
    sheet.appendRow([
      id,
      data.name,
      data.category,
      data.uom,
      Number(data.unitCost)    || 0,
      Number(data.retailPrice) || 0,
      Number(data.gst)         || 0,
      Number(data.currentStock)|| 0,
      Number(data.baseStock)   || 0,
      data.manufacturer  || '',
      data.vendorName    || '',
      data.vendorContact || '',
      data.status || 'active'
    ]);
    return Utils.createResponse('success', 'Product added successfully');
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.category);
        sheet.getRange(i + 1, 4).setValue(data.uom);
        sheet.getRange(i + 1, 5).setValue(Number(data.unitCost)    || 0);
        sheet.getRange(i + 1, 6).setValue(Number(data.retailPrice) || 0);
        sheet.getRange(i + 1, 7).setValue(Number(data.gst)         || 0);
        sheet.getRange(i + 1, 8).setValue(Number(data.currentStock)|| 0);
        sheet.getRange(i + 1, 9).setValue(Number(data.baseStock)   || 0);
        sheet.getRange(i + 1, 10).setValue(data.manufacturer  || '');
        sheet.getRange(i + 1, 11).setValue(data.vendorName    || '');
        sheet.getRange(i + 1, 12).setValue(data.vendorContact || '');
        sheet.getRange(i + 1, 13).setValue(data.status);
        return Utils.createResponse('success', 'Product updated successfully');
      }
    }
    return Utils.createResponse('error', 'Product not found');
  },

  updateStock(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 8).setValue(Number(data.currentStock) || 0);
        return Utils.createResponse('success', 'Stock updated successfully');
      }
    }
    return Utils.createResponse('error', 'Product not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        return Utils.createResponse('success', 'Product deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Product not found');
  }
};
