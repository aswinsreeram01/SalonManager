// ProductGroups sheet columns (0-based):
// id(0), name(1), gstPct(2), hsnCode(3), unitIncentive(4), sortOrder(5), status(6)

const ProductGroups = {
  getAll() {
    const cached = Utils.getCached('product_groups');
    if (cached) return Utils.createResponse('success', 'Product groups retrieved', { productGroups: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('success', 'Product groups retrieved', { productGroups: [] });

    const data = sheet.getDataRange().getValues();
    const productGroups = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      productGroups.push({
        id:            data[i][0],
        name:          data[i][1],
        gstPct:        Number(data[i][2]) || 0,
        hsnCode:       data[i][3] || '',
        unitIncentive: Number(data[i][4]) || 0,
        sortOrder:     Number(data[i][5]) || 0,
        status:        data[i][6]
      });
    }

    productGroups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.name).localeCompare(String(b.name));
    });

    Utils.setCached('product_groups', productGroups);
    return Utils.createResponse('success', 'Product groups retrieved', { productGroups });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('error', 'ProductGroups sheet not found. Please create it with columns: id, name, gstPct, hsnCode, unitIncentive, sortOrder, status');

    const id = 'PGP' + Date.now();
    sheet.appendRow([
      id,
      data.name,
      Number(data.gstPct)        || 0,
      data.hsnCode               || '',
      Number(data.unitIncentive) || 0,
      Number(data.sortOrder)     || 0,
      data.status                || 'active'
    ]);
    Utils.clearCached('product_groups');
    return Utils.createResponse('success', 'Product group added successfully', { id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('error', 'ProductGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(Number(data.gstPct)        || 0);
        sheet.getRange(i + 1, 4).setValue(data.hsnCode               || '');
        sheet.getRange(i + 1, 5).setValue(Number(data.unitIncentive) || 0);
        sheet.getRange(i + 1, 6).setValue(Number(data.sortOrder)     || 0);
        sheet.getRange(i + 1, 7).setValue(data.status);
        Utils.clearCached('product_groups');
        return Utils.createResponse('success', 'Product group updated successfully');
      }
    }
    return Utils.createResponse('error', 'Product group not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductGroups');
    if (!sheet) return Utils.createResponse('error', 'ProductGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 7).setValue('inactive');
        Utils.clearCached('product_groups');
        return Utils.createResponse('success', 'Product group deactivated successfully');
      }
    }
    return Utils.createResponse('error', 'Product group not found');
  }
};
