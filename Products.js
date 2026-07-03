// Products sheet columns (0-based):
// id(0), name(1), category(2), uom(3), unitCost(4), retailPrice(5), gst(6),
// currentStock(7), baseStock(8), manufacturer(9), vendorName(10), vendorContact(11),
// status(12), vendorId(13), groupId(14), orgId(15)
//
// StockMovements sheet columns:
// movementId(0), date(1), productId(2), productName(3), type(4), refId(5),
// qty(6), unitCost(7), notes(8), createdAt(9), vendorId(10), vendorName(11),
// createdBy(12), orgId(13)
//
// StockAudits sheet columns:
// auditId(0), auditDate(1), notes(2), createdAt(3), createdBy(4), orgId(5)
//
// AuditItems sheet columns:
// itemId(0), auditId(1), productId(2), productName(3), systemQty(4),
// physicalQty(5), variance(6), unitCost(7), notes(8), orgId(9)

const Products = {
  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const cacheKey = 'products_' + orgId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Products retrieved', { products: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('success', 'Products retrieved', { products: [] });

    const rows = sheet.getDataRange().getValues();
    const products = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][15] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      products.push({
        id: rows[i][0], name: rows[i][1], category: rows[i][2], uom: rows[i][3],
        unitCost: rows[i][4], retailPrice: rows[i][5], gst: rows[i][6],
        currentStock: rows[i][7], baseStock: rows[i][8], manufacturer: rows[i][9],
        vendorName: rows[i][10], vendorContact: rows[i][11], status: rows[i][12],
        vendorId: rows[i][13] || '',
        groupId:  rows[i][14] || '',
        orgId:    rowOrg,
        // Professional-product fractional usage — blank contentQty means
        // "whole unit per use" (legacy behavior), see Bills._deductStock.
        contentQty: Number(rows[i][16]) || 0,
        usageUom:   rows[i][17] || ''
      });
    }

    Utils.setCached(cacheKey, products);
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
      data.status || 'active', data.vendorId || '', data.groupId || '',
      data.orgId || '',
      Number(data.contentQty) || 0, data.usageUom || ''
    ]);
    Utils.clearCached('products_' + (data.orgId || ''));
    return Utils.createResponse('success', 'Product added successfully', { id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        const oldOrgId = sheetData[i][15] || '';
        // targetOrgId is the explicit "move to this org" value from an org
        // picker. data.orgId is NOT usable here — Main.js's session
        // middleware overwrites it with the CALLER's own org on every
        // request, so using it would silently reassign every cross-org edit
        // to the editor's own org instead of leaving it alone.
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;

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
        sheet.getRange(i + 1, 15).setValue(data.groupId  || '');
        sheet.getRange(i + 1, 16).setValue(newOrgId);
        sheet.getRange(i + 1, 17).setValue(Number(data.contentQty) || 0);
        sheet.getRange(i + 1, 18).setValue(data.usageUom || '');

        Utils.clearCached('products_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('products_' + newOrgId);
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
        Utils.clearCached('products_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Stock updated successfully');
      }
    }
    return Utils.createResponse('error', 'Product not found');
  },

  // GAP 3 fix: soft-delete (set status = 'deleted') instead of hard-deleting the row.
  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) return Utils.createResponse('error', 'Products sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 13).setValue('deleted');
        Utils.clearCached('products_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Product deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Product not found');
  },

  // Receive stock: creates StockMovements rows, updates currentStock, updates POItems if poId given
  receiveStock(data) {
    // Serialize against other stock-mutating calls (bill save/void, audits,
    // other receipts) so two concurrent writes to the same product's
    // currentStock can't read-modify-write on stale data.
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (e) {
      return Utils.createResponse('error', 'System is busy. Please try again.');
    }
    try {
      return this._receiveStockLocked(data);
    } finally {
      lock.releaseLock();
    }
  },

  _receiveStockLocked(data) {
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
    const vendorId   = data.vendorId   || '';
    const vendorName = data.vendorName || '';
    const orgId      = data.orgId      || '';
    const userId     = data.userId     || '';

    items.forEach(item => {
      const qty = Number(item.qty) || 0;
      if (qty <= 0) return;
      const movId = 'MOV' + Date.now() + Math.random().toString(36).substr(2, 4);
      movSheet.appendRow([
        movId, date, item.productId, item.productName, 'receipt',
        receiptGroupId, qty, Number(item.unitCost) || 0,
        data.notes || '', now, vendorId, vendorName, userId, orgId
      ]);

      for (let i = 1; i < prodData.length; i++) {
        if (prodData[i][0] === item.productId) {
          const newStock = (Number(prodData[i][7]) || 0) + qty;
          prodSheet.getRange(i + 1, 8).setValue(newStock);
          prodData[i][7] = newStock;
          break;
        }
      }

      if (data.poId) {
        PurchaseOrders._updateQtyReceived(data.poId, item.productId, qty);
      }
    });

    Utils.clearCached('products_' + orgId);
    return Utils.createResponse('success', 'Stock received', { receiptId: receiptGroupId });
  },

  // Returns all StockMovements rows, optionally filtered by productId and orgId
  getRegister(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StockMovements');
    if (!sheet) return Utils.createResponse('success', 'Register retrieved', { movements: [] });

    const rows = sheet.getDataRange().getValues();
    const movements = [];
    const filterProduct = (data && data.productId) ? data.productId : null;
    const orgId = (data && data.orgId) || '';

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterProduct && rows[i][2] !== filterProduct) continue;
      const rowOrg = rows[i][13] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      movements.push({
        movementId: rows[i][0], date: rows[i][1], productId: rows[i][2],
        productName: rows[i][3], type: rows[i][4], refId: rows[i][5],
        qty: rows[i][6], unitCost: rows[i][7], notes: rows[i][8], createdAt: rows[i][9],
        vendorId: rows[i][10] || '', vendorName: rows[i][11] || '',
        createdBy: rows[i][12] || '', orgId: rowOrg
      });
    }
    return Utils.createResponse('success', 'Register retrieved', { movements });
  },

  // Save stock audit: writes AuditItems, creates StockMovements for variances, updates currentStock
  saveAudit(data) {
    // Same rationale as receiveStock() — audits overwrite currentStock
    // directly and must not interleave with a concurrent stock mutation.
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (e) {
      return Utils.createResponse('error', 'System is busy. Please try again.');
    }
    try {
      return this._saveAuditLocked(data);
    } finally {
      lock.releaseLock();
    }
  },

  _saveAuditLocked(data) {
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
    const orgId  = data.orgId  || '';
    const userId = data.userId || '';
    auditSheet.appendRow([auditId, data.auditDate || now.slice(0, 10), data.notes || '', now, userId, orgId]);

    const prodData = prodSheet.getDataRange().getValues();
    const items = data.items || [];

    items.forEach(item => {
      const systemQty   = Number(item.systemQty)   || 0;
      const physicalQty = Number(item.physicalQty) || 0;
      const variance    = physicalQty - systemQty;
      const itemId = 'AI' + Date.now() + Math.random().toString(36).substr(2, 4);

      itemsSheet.appendRow([
        itemId, auditId, item.productId, item.productName,
        systemQty, physicalQty, variance, Number(item.unitCost) || 0, item.notes || '', orgId
      ]);

      if (variance !== 0) {
        const movId = 'MOV' + Date.now() + Math.random().toString(36).substr(2, 4);
        movSheet.appendRow([
          movId, data.auditDate || now.slice(0, 10), item.productId, item.productName,
          'audit', auditId, variance, Number(item.unitCost) || 0,
          'Stock audit adjustment', now, '', '', userId, orgId
        ]);

        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][0] === item.productId) {
            prodSheet.getRange(i + 1, 8).setValue(physicalQty);
            prodData[i][7] = physicalQty;
            break;
          }
        }
      }
    });

    Utils.clearCached('products_' + orgId);
    return Utils.createResponse('success', 'Audit saved', { auditId });
  }
};
