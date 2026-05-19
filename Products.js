// Products sheet columns (0-based):
// id(0), name(1), category(2), uom(3), unitCost(4), retailPrice(5), gst(6),
// currentStock(7), baseStock(8), manufacturer(9), vendorName(10), vendorContact(11),
// status(12), vendorId(13)
//
// StockMovements sheet columns:
// movementId(0), date(1), productId(2), productName(3), type(4), refId(5),
// qty(6), unitCost(7), notes(8), createdAt(9)
//
// StockAudits sheet columns:
// auditId(0), auditDate(1), notes(2), createdAt(3)
//
// AuditItems sheet columns:
// itemId(0), auditId(1), productId(2), productName(3), systemQty(4),
// physicalQty(5), variance(6), unitCost(7), notes(8)

const Products = {
  getAll() {
    const cached = Utils.getCached('products');
    if (cached) return Utils.createResponse('success', 'Products retrieved', { products: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('success', 'Products retrieved', { products: [] });

    const data = sheet.getDataRange().getValues();
    const products = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      products.push({
        id: data[i][0], name: data[i][1], category: data[i][2], uom: data[i][3],
        unitCost: data[i][4], retailPrice: data[i][5], gst: data[i][6],
        currentStock: data[i][7], baseStock: data[i][8], manufacturer: data[i][9],
        vendorName: data[i][10], vendorContact: data[i][11], status: data[i][12],
        vendorId: data[i][13] || ''
      });
    }

    Utils.setCached('products', products);
    return Utils.createResponse('success', 'Products retrieved', { products });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found');

    const id = 'PRD' + Date.now();
    sheet.appendRow([
      id, data.name, data.category, data.uom,
      Number(data.unitCost) || 0, Number(data.retailPrice) || 0, Number(data.gst) || 0,
      Number(data.currentStock) || 0, Number(data.baseStock) || 0,
      data.manufacturer || '', data.vendorName || '', data.vendorContact || '',
      data.status || 'active', data.vendorId || ''
    ]);
    Utils.clearCached('products');
    return Utils.createResponse('success', 'Product added successfully', { id });
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
        sheet.getRange(i + 1, 5).setValue(Number(data.unitCost)     || 0);
        sheet.getRange(i + 1, 6).setValue(Number(data.retailPrice)  || 0);
        sheet.getRange(i + 1, 7).setValue(Number(data.gst)          || 0);
        sheet.getRange(i + 1, 8).setValue(Number(data.currentStock) || 0);
        sheet.getRange(i + 1, 9).setValue(Number(data.baseStock)    || 0);
        sheet.getRange(i + 1, 10).setValue(data.manufacturer  || '');
        sheet.getRange(i + 1, 11).setValue(data.vendorName    || '');
        sheet.getRange(i + 1, 12).setValue(data.vendorContact || '');
        sheet.getRange(i + 1, 13).setValue(data.status);
        sheet.getRange(i + 1, 14).setValue(data.vendorId || '');
        Utils.clearCached('products');
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
        Utils.clearCached('products');
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
        Utils.clearCached('products');
        return Utils.createResponse('success', 'Product deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Product not found');
  },

  // Receive stock: creates StockMovements rows, updates currentStock, updates POItems if poId given
  receiveStock(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const movSheet = ss.getSheetByName('StockMovements');
    const prodSheet = ss.getSheetByName('Products');
    if (!movSheet)  return Utils.createResponse('error', 'StockMovements sheet not found');
    if (!prodSheet) return Utils.createResponse('error', 'Products sheet not found');

    const items = data.items || [];
    if (!items.length) return Utils.createResponse('error', 'No items to receive');

    const receiptGroupId = 'RCP' + Date.now();
    const now = new Date().toISOString();
    const date = data.date || now.slice(0, 10);
    const prodData = prodSheet.getDataRange().getValues();

    items.forEach(item => {
      const qty = Number(item.qty) || 0;
      if (qty <= 0) return;
      const movId = 'MOV' + Date.now() + Math.random().toString(36).substr(2, 4);
      movSheet.appendRow([
        movId, date, item.productId, item.productName, 'receipt',
        receiptGroupId, qty, Number(item.unitCost) || 0,
        data.notes || '', now
      ]);

      // Update currentStock in Products sheet
      for (let i = 1; i < prodData.length; i++) {
        if (prodData[i][0] === item.productId) {
          const newStock = (Number(prodData[i][7]) || 0) + qty;
          prodSheet.getRange(i + 1, 8).setValue(newStock);
          prodData[i][7] = newStock; // update in-memory to handle duplicates
          break;
        }
      }

      // Update POItems qtyReceived if PO-linked
      if (data.poId) {
        PurchaseOrders._updateQtyReceived(data.poId, item.productId, qty);
      }
    });

    Utils.clearCached('products');
    return Utils.createResponse('success', 'Stock received', { receiptId: receiptGroupId });
  },

  // Returns all StockMovements rows, optionally filtered by productId
  getRegister(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StockMovements');
    if (!sheet) return Utils.createResponse('success', 'Register retrieved', { movements: [] });

    const rows = sheet.getDataRange().getValues();
    const movements = [];
    const filterProduct = (data && data.productId) ? data.productId : null;

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterProduct && rows[i][2] !== filterProduct) continue;
      movements.push({
        movementId: rows[i][0], date: rows[i][1], productId: rows[i][2],
        productName: rows[i][3], type: rows[i][4], refId: rows[i][5],
        qty: rows[i][6], unitCost: rows[i][7], notes: rows[i][8], createdAt: rows[i][9]
      });
    }
    return Utils.createResponse('success', 'Register retrieved', { movements });
  },

  // Save stock audit: writes AuditItems, creates StockMovements for variances, updates currentStock
  saveAudit(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ss.getSheetByName('StockAudits');
    const itemsSheet = ss.getSheetByName('AuditItems');
    const movSheet   = ss.getSheetByName('StockMovements');
    const prodSheet  = ss.getSheetByName('Products');
    if (!auditSheet) return Utils.createResponse('error', 'StockAudits sheet not found');
    if (!itemsSheet) return Utils.createResponse('error', 'AuditItems sheet not found');
    if (!movSheet)   return Utils.createResponse('error', 'StockMovements sheet not found');
    if (!prodSheet)  return Utils.createResponse('error', 'Products sheet not found');

    const auditId = 'AUD' + Date.now();
    const now = new Date().toISOString();
    auditSheet.appendRow([auditId, data.auditDate || now.slice(0, 10), data.notes || '', now]);

    const prodData = prodSheet.getDataRange().getValues();
    const items = data.items || [];

    items.forEach(item => {
      const systemQty   = Number(item.systemQty)   || 0;
      const physicalQty = Number(item.physicalQty) || 0;
      const variance    = physicalQty - systemQty;
      const itemId = 'AI' + Date.now() + Math.random().toString(36).substr(2, 4);

      itemsSheet.appendRow([
        itemId, auditId, item.productId, item.productName,
        systemQty, physicalQty, variance, Number(item.unitCost) || 0, item.notes || ''
      ]);

      if (variance !== 0) {
        const movId = 'MOV' + Date.now() + Math.random().toString(36).substr(2, 4);
        movSheet.appendRow([
          movId, data.auditDate || now.slice(0, 10), item.productId, item.productName,
          'audit', auditId, variance, Number(item.unitCost) || 0,
          'Stock audit adjustment', now
        ]);

        // Update currentStock
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][0] === item.productId) {
            prodSheet.getRange(i + 1, 8).setValue(physicalQty);
            prodData[i][7] = physicalQty;
            break;
          }
        }
      }
    });

    Utils.clearCached('products');
    return Utils.createResponse('success', 'Audit saved', { auditId });
  }
};
