// PurchaseOrders sheet columns (0-based):
// poId(0), vendorId(1), vendorName(2), poDate(3), expectedDate(4),
// status(5), notes(6), createdAt(7), createdBy(8), orgId(9)
//
// POItems sheet columns (0-based):
// itemId(0), poId(1), productId(2), productName(3), uom(4),
// qtyOrdered(5), qtyReceived(6), unitCost(7), orgId(8)

const PurchaseOrders = {
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PurchaseOrders');
    if (!sheet) return Utils.createResponse('success', 'POs retrieved', { pos: [] });
    const orgId = (data && data.orgId) || '';
    const rows = sheet.getDataRange().getValues();
    const pos = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][9] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      pos.push({
        poId: rows[i][0], vendorId: rows[i][1], vendorName: rows[i][2],
        poDate: rows[i][3], expectedDate: rows[i][4], status: rows[i][5],
        notes: rows[i][6], createdAt: rows[i][7],
        createdBy: rows[i][8] || '', orgId: rowOrg
      });
    }
    return Utils.createResponse('success', 'POs retrieved', { pos });
  },

  getItems(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('POItems');
    if (!sheet) return Utils.createResponse('success', 'Items retrieved', { items: [] });
    const rows = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === data.poId) {
        items.push({
          itemId: rows[i][0], poId: rows[i][1], productId: rows[i][2],
          productName: rows[i][3], uom: rows[i][4],
          qtyOrdered: rows[i][5], qtyReceived: rows[i][6], unitCost: rows[i][7]
        });
      }
    }
    return Utils.createResponse('success', 'Items retrieved', { items });
  },

  create(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const poSheet = ss.getSheetByName('PurchaseOrders');
    const itemsSheet = ss.getSheetByName('POItems');
    if (!poSheet) return Utils.createResponse('error', 'PurchaseOrders sheet not found');
    if (!itemsSheet) return Utils.createResponse('error', 'POItems sheet not found');

    const poId = 'PO' + Date.now();
    const now = new Date().toISOString();
    const orgId  = data.orgId  || '';
    const userId = data.userId || '';

    poSheet.appendRow([
      poId, data.vendorId || '', data.vendorName || '',
      data.poDate || now.slice(0, 10), data.expectedDate || '',
      'draft', data.notes || '', now, userId, orgId
    ]);

    (data.items || []).forEach(item => {
      const itemId = 'POI' + Date.now() + Math.random().toString(36).substr(2, 4);
      itemsSheet.appendRow([
        itemId, poId, item.productId || '', item.productName || '', item.uom || '',
        Number(item.qtyOrdered) || 0, 0, Number(item.unitCost) || 0, orgId
      ]);
    });

    return Utils.createResponse('success', 'Purchase Order created', { poId });
  },

  updateStatus(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PurchaseOrders');
    if (!sheet) return Utils.createResponse('error', 'PurchaseOrders sheet not found');
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.poId) {
        sheet.getRange(i + 1, 6).setValue(data.status);
        if (data.notes !== undefined && data.notes !== '') {
          sheet.getRange(i + 1, 7).setValue(data.notes);
        }
        return Utils.createResponse('success', 'PO updated');
      }
    }
    return Utils.createResponse('error', 'PO not found');
  },

  // Called by Products.receiveStock to update qtyReceived on each POItem
  _updateQtyReceived(poId, productId, qtyAdded) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const itemsSheet = ss.getSheetByName('POItems');
    if (!itemsSheet) return;

    const rows = itemsSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === poId && rows[i][2] === productId) {
        const newReceived = (Number(rows[i][6]) || 0) + qtyAdded;
        itemsSheet.getRange(i + 1, 7).setValue(newReceived);
        break;
      }
    }

    const poSheet = ss.getSheetByName('PurchaseOrders');
    if (!poSheet) return;
    const poRows = poSheet.getDataRange().getValues();
    for (let i = 1; i < poRows.length; i++) {
      if (poRows[i][0] === poId) {
        const updatedItems = itemsSheet.getDataRange().getValues();
        let fullyReceived = true;
        let anyReceived = false;
        for (let j = 1; j < updatedItems.length; j++) {
          if (updatedItems[j][1] !== poId) continue;
          const ordered  = Number(updatedItems[j][5]) || 0;
          const received = Number(updatedItems[j][6]) || 0;
          if (received > 0) anyReceived = true;
          if (received < ordered) fullyReceived = false;
        }
        const newStatus = fullyReceived ? 'received' : (anyReceived ? 'partial' : poRows[i][5]);
        poSheet.getRange(i + 1, 6).setValue(newStatus);
        break;
      }
    }
  }
};
