const Bills = {
  save(data) {
    const billsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BillItems');
    if (!billsSheet) return Utils.createResponse('error', 'Bills sheet not found');
    if (!itemsSheet) return Utils.createResponse('error', 'BillItems sheet not found');

    const billId = 'BILL' + Date.now();
    const date = new Date().toISOString();
    const items = data.items || [];

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
      'active', data.discountType || 'value'
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
        item.profUom || ''
      ]);
    });

    return Utils.createResponse('success', 'Bill saved successfully', { billId, grandTotal });
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

  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
    if (!sheet) return Utils.createResponse('success', 'Bills retrieved', { bills: [] });

    const billData = sheet.getDataRange().getValues();
    const bills = [];
    for (let i = 1; i < billData.length; i++) {
      bills.push({
        billId: billData[i][0], customerId: billData[i][1], customerName: billData[i][2],
        priceBookId: billData[i][3], date: String(billData[i][4]),
        servicesSubtotal: billData[i][5], servicesGst: billData[i][6],
        retailSubtotal: billData[i][7], retailGst: billData[i][8],
        discount: billData[i][9], tip: billData[i][10], grandTotal: billData[i][11],
        paymentMode: billData[i][12], cashAmt: billData[i][13],
        cardAmt: billData[i][14], upiAmt: billData[i][15],
        status: billData[i][16], discountType: billData[i][17] || 'value'
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
