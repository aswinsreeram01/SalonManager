// Bills sheet columns (0-based):
// billId(0), customerId(1), customerName(2), priceBookId(3), createdAt(4),
// servicesSubtotal(5), servicesGst(6), retailSubtotal(7), retailGst(8),
// discount(9), tip(10), grandTotal(11), paymentMode(12),
// cashAmt(13), cardAmt(14), upiAmt(15), status(16), discountType(17),
// createdBy(18), orgId(19)
//
// BillItems sheet columns (0-based):
// billItemId(0), billId(1), type(2), refId(3), itemName(4), staffId(5), staffName(6),
// qty(7), unitPrice(8), gstPct(9), lineSubtotal(10), lineGst(11), lineTotal(12),
// profProductId(13), profProductName(14), profQty(15), profUom(16), orgId(17)

const Bills = {
  save(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const billsSheet = ss.getSheetByName('Bills');
    const itemsSheet = ss.getSheetByName('BillItems');
    if (!billsSheet) return Utils.createResponse('error', 'Bills sheet not found');
    if (!itemsSheet) return Utils.createResponse('error', 'BillItems sheet not found');

    const billId = 'BILL' + Date.now();
    const date = new Date().toISOString();
    const items = data.items || [];
    const orgId  = data.orgId  || '';
    const userId = data.userId || '';

    const svcItems = items.filter(i => i.type === 'service');
    const prdItems = items.filter(i => i.type === 'product');
    const servicesSubtotal = svcItems.reduce((s, i) => s + (Number(i.lineSubtotal) || 0), 0);
    const servicesGst      = svcItems.reduce((s, i) => s + (Number(i.lineGst) || 0), 0);
    const retailSubtotal   = prdItems.reduce((s, i) => s + (Number(i.lineSubtotal) || 0), 0);
    const retailGst        = prdItems.reduce((s, i) => s + (Number(i.lineGst) || 0), 0);
    const discount         = Number(data.discount) || 0;
    const tip              = Number(data.tip) || 0;
    const grandTotal       = servicesSubtotal + servicesGst + retailSubtotal + retailGst - discount + tip;

    billsSheet.appendRow([
      billId, data.customerId || '', data.customerName || '', data.priceBookId || '', date,
      servicesSubtotal, servicesGst, retailSubtotal, retailGst,
      discount, tip, grandTotal,
      data.paymentMode || 'Cash',
      Number(data.cashAmt) || 0, Number(data.cardAmt) || 0, Number(data.upiAmt) || 0,
      'active', data.discountType || 'value',
      userId, orgId
    ]);

    items.forEach(item => {
      const itemId = 'BI' + Date.now() + Math.random().toString(36).substr(2, 5);
      itemsSheet.appendRow([
        itemId, billId, item.type || '', item.itemId || '', item.itemName || '',
        item.staffId || '', item.staffName || '',
        Number(item.qty) || 1, Number(item.unitPrice) || 0,
        Number(item.gstPct) || 0,
        Number(item.lineSubtotal) || 0, Number(item.lineGst) || 0, Number(item.lineTotal) || 0,
        item.profProductId || '', item.profProductName || '',
        item.profQty !== '' && item.profQty !== undefined ? Number(item.profQty) : '',
        item.profUom || '', orgId
      ]);
    });

    this._deductStock(billId, date.slice(0, 10), items, userId, orgId);

    // Loyalty: earn points and process any redemption
    const pointsToEarn  = Number(data.pointsToEarn)  || 0;
    const redeemPoints  = Number(data.redeemPoints)   || 0;
    const customerPhone = data.customerPhone || data.customerId || '';
    if (customerPhone) {
      LoyaltyPoints.processAfterBill(billId, customerPhone, data.customerName || '', pointsToEarn, redeemPoints, orgId);
    }

    return Utils.createResponse('success', 'Bill saved successfully', { billId, grandTotal });
  },

  _deductStock(billId, date, items, userId, orgId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const movSheet  = ss.getSheetByName('StockMovements');
    const prodSheet = ss.getSheetByName('Products');
    if (!movSheet || !prodSheet) return;

    const prodData = prodSheet.getDataRange().getValues();
    const now = new Date().toISOString();

    const prodIdx = {};
    for (let i = 1; i < prodData.length; i++) {
      if (prodData[i][0]) prodIdx[prodData[i][0]] = i;
    }

    // GAP 10 fix: allow currentStock to go negative — keeps it in sync with StockMovements running balance
    const deduct = (productId, productName, qty, unitCost) => {
      if (!productId || qty <= 0) return;
      const movId = 'MOV' + Date.now() + Math.random().toString(36).substr(2, 4);
      movSheet.appendRow([
        movId, date, productId, productName, 'billing',
        billId, -qty, unitCost || 0, 'Sold/used in bill', now, '', '',
        userId || '', orgId || ''
      ]);
      const i = prodIdx[productId];
      if (i !== undefined) {
        const newStock = (Number(prodData[i][7]) || 0) - qty;
        prodSheet.getRange(i + 1, 8).setValue(newStock);
        prodData[i][7] = newStock;
      }
    };

    items.forEach(item => {
      if (item.type === 'product' && item.itemId) {
        const i = prodIdx[item.itemId];
        const unitCost = i !== undefined ? (Number(prodData[i][4]) || 0) : 0;
        deduct(item.itemId, item.itemName || '', Number(item.qty) || 1, unitCost);
      }
      if (item.profProductId && item.profQty !== '' && item.profQty !== undefined) {
        const profQty = Number(item.profQty);
        if (profQty > 0) {
          deduct(item.profProductId, item.profProductName || '', profQty, 0);
        }
      }
    });

    Utils.clearCached('products_' + (orgId || ''));
  },

  voidBill(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
    if (!sheet) return Utils.createResponse('error', 'Bills sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.billId) {
        sheet.getRange(i + 1, 17).setValue('void');
        return Utils.createResponse('success', 'Bill voided successfully');
      }
    }
    return Utils.createResponse('error', 'Bill not found');
  },

  // GAP 6 fix: accept optional fromDate / toDate; defaults to last 90 days when omitted.
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
    if (!sheet) return Utils.createResponse('success', 'Bills retrieved', { bills: [] });

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    defaultFrom.setHours(0, 0, 0, 0);

    const fromDate = (data && data.fromDate)
      ? new Date(data.fromDate + 'T00:00:00')
      : defaultFrom;
    const toDate = (data && data.toDate)
      ? new Date(data.toDate + 'T23:59:59')
      : null;

    const orgId = (data && data.orgId) || '';
    const billData = sheet.getDataRange().getValues();
    const bills = [];
    for (let i = 1; i < billData.length; i++) {
      if (!billData[i][0]) continue;
      const rawDate = String(billData[i][4]).slice(0, 10);
      const billDate = new Date(rawDate + 'T00:00:00');
      if (billDate < fromDate) continue;
      if (toDate && billDate > toDate) continue;
      const rowOrg = billData[i][19] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;

      bills.push({
        billId: billData[i][0], customerId: billData[i][1], customerName: billData[i][2],
        priceBookId: billData[i][3], date: String(billData[i][4]),
        servicesSubtotal: billData[i][5], servicesGst: billData[i][6],
        retailSubtotal: billData[i][7], retailGst: billData[i][8],
        discount: billData[i][9], tip: billData[i][10], grandTotal: billData[i][11],
        paymentMode: billData[i][12], cashAmt: billData[i][13],
        cardAmt: billData[i][14], upiAmt: billData[i][15],
        status: billData[i][16], discountType: billData[i][17] || 'value',
        createdBy: billData[i][18] || '', orgId: rowOrg
      });
    }
    return Utils.createResponse('success', 'Bills retrieved', { bills });
  },

  getItems(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BillItems');
    if (!sheet) return Utils.createResponse('success', 'Items retrieved', { items: [] });

    const rows = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === data.billId) {
        items.push({
          itemId: rows[i][0], billId: rows[i][1], type: rows[i][2], refId: rows[i][3],
          itemName: rows[i][4], staffId: rows[i][5], staffName: rows[i][6],
          qty: rows[i][7], unitPrice: rows[i][8], gstPct: rows[i][9],
          lineSubtotal: rows[i][10], lineGst: rows[i][11], lineTotal: rows[i][12],
          profProductId: rows[i][13] || '', profProductName: rows[i][14] || '',
          profQty: rows[i][15] !== undefined && rows[i][15] !== '' ? rows[i][15] : '',
          profUom: rows[i][16] || ''
        });
      }
    }
    return Utils.createResponse('success', 'Items retrieved', { items });
  }
};
