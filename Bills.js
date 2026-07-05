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
    // Serialize bill saves: multiple concurrent bills touching the same
    // product's stock or the same customer's loyalty balance would
    // otherwise read-modify-write on stale data and lose an update.
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (e) {
      return Utils.createResponse('error', 'System is busy processing another bill. Please try again.');
    }
    try {
      return this._saveLocked(data);
    } finally {
      lock.releaseLock();
    }
  },

  _saveLocked(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const billsSheet = ss.getSheetByName('Bills');
    const itemsSheet = ss.getSheetByName('BillItems');
    if (!billsSheet) return Utils.createResponse('error', 'Bills sheet not found');
    if (!itemsSheet) return Utils.createResponse('error', 'BillItems sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const rawItems = data.items || [];
    if (rawItems.length === 0) {
      return Utils.createResponse('error', 'A bill must have at least one item.');
    }

    const orgId  = data.targetOrgId || data.orgId || '';
    const userId = data.userId || '';
    // Canonical customer identity (E.164, +91 default) — used as both the
    // Bills.customerId key and the loyalty ledger key, so bill history and
    // loyalty always resolve the same customer the same way.
    const customerPhone = Utils.normalizePhone(data.customerPhone || data.customerId);

    // ── Server-authoritative line math ────────────────────────────────────
    // Unit price and GST% are cashier-entered and trusted as-is; every
    // derived number (line subtotal/GST/total, bill subtotals, discount,
    // loyalty earn/redeem, grand total) is computed here, not trusted from
    // the client. GST% is required per line.
    const items = [];
    for (const item of rawItems) {
      if (item.gstPct === '' || item.gstPct === null || item.gstPct === undefined) {
        return Utils.createResponse('error', 'GST% is required for "' + (item.itemName || 'an item') + '".');
      }
      const qty       = Number(item.qty) || 0;
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const gstPct    = Math.max(0, Number(item.gstPct) || 0);
      const lineSubtotal = Math.round(qty * unitPrice * 100) / 100;
      const lineGst      = Math.round(lineSubtotal * gstPct / 100 * 100) / 100;
      const lineTotal    = lineSubtotal + lineGst;
      items.push(Object.assign({}, item, { qty, unitPrice, gstPct, lineSubtotal, lineGst, lineTotal }));
    }

    const svcItems = items.filter(i => i.type === 'service');
    const prdItems = items.filter(i => i.type === 'product');
    const servicesSubtotal = svcItems.reduce((s, i) => s + i.lineSubtotal, 0);
    const servicesGst      = svcItems.reduce((s, i) => s + i.lineGst, 0);
    const retailSubtotal   = prdItems.reduce((s, i) => s + i.lineSubtotal, 0);
    const retailGst        = prdItems.reduce((s, i) => s + i.lineGst, 0);
    const baseAmt           = servicesSubtotal + servicesGst + retailSubtotal + retailGst;

    // Manual discount — recomputed from the entered type/input against the
    // server's own baseAmt (a % discount otherwise depends on client math).
    const discountType  = data.discountType === 'percent' ? 'percent' : 'value';
    const discountInput = Math.max(0, Number(data.discountInput) || 0);
    const manualDiscount = discountType === 'percent'
      ? Math.round(baseAmt * discountInput / 100 * 100) / 100
      : discountInput;

    const tip = Math.max(0, Number(data.tip) || 0);

    // Loyalty — authoritative earn + redemption (never trust client points/₹)
    const loyalty = LoyaltyPoints.calcForBill(items, customerPhone, data.redeemPoints);
    const discount = Math.round((manualDiscount + loyalty.redemptionValue) * 100) / 100;

    const grandTotal = Math.max(0, baseAmt - discount + tip);

    // Split payment must actually sum to the server's grand total.
    const paymentMode = data.paymentMode || 'Cash';
    const cashAmt = Number(data.cashAmt) || 0;
    const cardAmt = Number(data.cardAmt) || 0;
    const upiAmt  = Number(data.upiAmt)  || 0;
    if (paymentMode === 'Split' && Math.abs(cashAmt + cardAmt + upiAmt - grandTotal) > 0.01) {
      return Utils.createResponse('error', 'Split payment amounts (₹' + (cashAmt + cardAmt + upiAmt).toFixed(2) +
        ') do not add up to the grand total (₹' + grandTotal.toFixed(2) + ').');
    }

    const billId = 'BILL' + Date.now() + Math.random().toString(36).substr(2, 4);
    const date = new Date().toISOString();

    billsSheet.appendRow([
      billId, customerPhone, data.customerName || '', data.priceBookId || '', date,
      servicesSubtotal, servicesGst, retailSubtotal, retailGst,
      discount, tip, grandTotal,
      paymentMode, cashAmt, cardAmt, upiAmt,
      'active', discountType,
      userId, orgId
    ]);

    items.forEach(item => {
      const itemId = 'BI' + Date.now() + Math.random().toString(36).substr(2, 5);
      itemsSheet.appendRow([
        itemId, billId, item.type || '', item.itemId || '', item.itemName || '',
        item.staffId || '', item.staffName || '',
        item.qty, item.unitPrice, item.gstPct,
        item.lineSubtotal, item.lineGst, item.lineTotal,
        item.profProductId || '', item.profProductName || '',
        item.profQty !== '' && item.profQty !== undefined ? Number(item.profQty) : '',
        item.profUom || '', orgId
      ]);
    });

    this._deductStock(billId, Utils.businessDate(), items, userId, orgId);

    if (customerPhone) {
      LoyaltyPoints.processAfterBill(
        billId, customerPhone, data.customerName || '',
        loyalty.pointsToEarn, loyalty.redeemPointsApplied, orgId
      );
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
        // profQty is a USAGE quantity in the product's usageUom (e.g. 100 g
        // used from a 1000 g bottle), not inventory units. contentQty tells
        // us how much of the inventory unit that represents; blank/0 means
        // "whole unit per use" (legacy behavior — profQty deducted as-is).
        const usageQty = Number(item.profQty);
        if (usageQty > 0) {
          const i = prodIdx[item.profProductId];
          const unitCost   = i !== undefined ? (Number(prodData[i][4])  || 0) : 0;
          const contentQty = i !== undefined ? (Number(prodData[i][16]) || 0) : 0;
          const fraction = contentQty > 0 ? usageQty / contentQty : usageQty;
          deduct(item.profProductId, item.profProductName || '', fraction, unitCost);
        }
      }
    });

    Utils.clearCached('products_' + (orgId || ''));
  },

  // Reverses the stock deducted by _deductStock when a bill is voided.
  _restoreStock(billId, items, userId, orgId) {
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

    const restore = (productId, productName, qty) => {
      if (!productId || qty <= 0) return;
      const movId = 'MOV' + Date.now() + Math.random().toString(36).substr(2, 4);
      movSheet.appendRow([
        movId, Utils.businessDate(), productId, productName, 'billing',
        billId, qty, 0, 'Restored — bill ' + billId + ' voided', now, '', '',
        userId || '', orgId || ''
      ]);
      const i = prodIdx[productId];
      if (i !== undefined) {
        const newStock = (Number(prodData[i][7]) || 0) + qty;
        prodSheet.getRange(i + 1, 8).setValue(newStock);
        prodData[i][7] = newStock;
      }
    };

    items.forEach(item => {
      if (item.type === 'product' && item.itemId) {
        restore(item.itemId, item.itemName || '', Number(item.qty) || 0);
      }
      if (item.profProductId && item.profQty !== '' && item.profQty !== undefined) {
        // Must mirror _deductStock's fraction math exactly, or a void would
        // restore the wrong amount of stock for partially-used products.
        const usageQty = Number(item.profQty);
        if (usageQty > 0) {
          const i = prodIdx[item.profProductId];
          const contentQty = i !== undefined ? (Number(prodData[i][16]) || 0) : 0;
          const fraction = contentQty > 0 ? usageQty / contentQty : usageQty;
          restore(item.profProductId, item.profProductName || '', fraction);
        }
      }
    });

    Utils.clearCached('products_' + (orgId || ''));
  },

  voidBill(data) {
    // Same rationale as save(): voiding restores stock and reverses loyalty,
    // both read-modify-write, and must not interleave with a concurrent
    // save() or another void() touching the same product/customer.
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (e) {
      return Utils.createResponse('error', 'System is busy. Please try again.');
    }
    try {
      return this._voidBillLocked(data);
    } finally {
      lock.releaseLock();
    }
  },

  _voidBillLocked(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
    if (!sheet) return Utils.createResponse('error', 'Bills sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.billId) {
        if (dataRange[i][16] === 'void') {
          return Utils.createResponse('error', 'This bill has already been voided.');
        }

        const orgId = dataRange[i][19] || data.orgId || '';
        // _getItemsRaw's own "itemId" field is the BillItems row's PK, not
        // the product/service reference — that's "refId" (see js/history.js,
        // which remaps the same way). _restoreStock needs the reference id.
        const items = this._getItemsRaw(data.billId).map(i => ({
          type: i.type, itemId: i.refId, itemName: i.itemName, qty: i.qty,
          profProductId: i.profProductId, profProductName: i.profProductName, profQty: i.profQty
        }));

        sheet.getRange(i + 1, 17).setValue('void');

        // Reverse the side effects of the original save: give back the
        // stock that was deducted, and undo any loyalty earn/redeem tied
        // to this bill (balance may go temporarily negative if the
        // customer already spent points earned here — allowed by design).
        this._restoreStock(data.billId, items, data.userId || '', orgId);
        LoyaltyPoints.reverseForBill(data.billId, orgId);

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
    const includeChildren = !!(data && data.includeChildren);
    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;
    const billData = sheet.getDataRange().getValues();
    const bills = [];
    for (let i = 1; i < billData.length; i++) {
      if (!billData[i][0]) continue;
      // Re-derive the calendar day from the stored UTC instant via the
      // configured timezone — do NOT slice the raw ISO string's first 10
      // chars, which is the UTC date and can be a day off from the local
      // (Kolkata) date near midnight.
      const rawDate = Utils.businessDate(new Date(billData[i][4]));
      const billDate = new Date(rawDate + 'T00:00:00');
      if (billDate < fromDate) continue;
      if (toDate && billDate > toDate) continue;
      const rowOrg = billData[i][19] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;

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

  // Plain-array version shared by getItems (public) and voidBill (internal
  // stock/loyalty reversal). Note: this row's own "itemId" field is the
  // BillItems primary key, NOT the product/service reference — that's
  // "refId". See js/history.js, which remaps the same way when consuming
  // getItems' response.
  _getItemsRaw(billId) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BillItems');
    if (!sheet) return [];

    const rows = sheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === billId) {
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
    return items;
  },

  getItems(data) {
    return Utils.createResponse('success', 'Items retrieved', { items: this._getItemsRaw(data.billId) });
  }
};
