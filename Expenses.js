// Expenses sheet columns (0-based):
// expenseId(0), date(1), category(2), vendor(3), description(4), amount(5),
// paymentMode(6), referenceNo(7), notes(8), createdAt(9), createdBy(10),
// status(11), orgId(12)

const Expenses = {
  _sheet() {
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Expenses');
  },

  _rowToObj(r) {
    return {
      expenseId:   r[0],
      date:        String(r[1]),
      category:    r[2],
      vendor:      r[3] || '',
      description: r[4] || '',
      amount:      Number(r[5]) || 0,
      paymentMode: r[6] || '',
      referenceNo: r[7] || '',
      notes:       r[8] || '',
      createdAt:   String(r[9]),
      createdBy:   r[10] || '',
      status:      r[11] || 'active',
      orgId:       r[12] || ''
    };
  },

  getAll(data) {
    const sheet = this._sheet();
    if (!sheet) return Utils.createResponse('success', 'Expenses retrieved', { expenses: [] });

    const orgId = (data && data.orgId) || '';
    const rows = sheet.getDataRange().getValues();
    const expenses = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = this._rowToObj(rows[i]);
      if (obj.status === 'void') continue;
      if (orgId && obj.orgId && obj.orgId !== orgId) continue;
      expenses.push(obj);
    }
    return Utils.createResponse('success', 'Expenses retrieved', { expenses });
  },

  save(data) {
    const sheet = this._sheet();
    if (!sheet) return Utils.createResponse('error', 'Expenses sheet not found');

    const expenseId = 'EXP' + Date.now();
    const createdAt = new Date().toISOString();

    sheet.appendRow([
      expenseId,
      data.date || '',
      data.category || '',
      data.vendor || '',
      data.description || '',
      Number(data.amount) || 0,
      data.paymentMode || '',
      data.referenceNo || '',
      data.notes || '',
      createdAt,
      data.userId || data.createdBy || '',
      'active',
      data.orgId || ''
    ]);

    return Utils.createResponse('success', 'Expense saved', { expenseId });
  },

  update(data) {
    const sheet = this._sheet();
    if (!sheet) return Utils.createResponse('error', 'Expenses sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.expenseId) {
        const r = i + 1;
        sheet.getRange(r, 2).setValue(data.date);
        sheet.getRange(r, 3).setValue(data.category);
        sheet.getRange(r, 4).setValue(data.vendor || '');
        sheet.getRange(r, 5).setValue(data.description || '');
        sheet.getRange(r, 6).setValue(Number(data.amount) || 0);
        sheet.getRange(r, 7).setValue(data.paymentMode || '');
        sheet.getRange(r, 8).setValue(data.referenceNo || '');
        sheet.getRange(r, 9).setValue(data.notes || '');
        return Utils.createResponse('success', 'Expense updated');
      }
    }
    return Utils.createResponse('error', 'Expense not found');
  },

  voidExpense(data) {
    const sheet = this._sheet();
    if (!sheet) return Utils.createResponse('error', 'Expenses sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.expenseId) {
        sheet.getRange(i + 1, 12).setValue('void');
        return Utils.createResponse('success', 'Expense deleted');
      }
    }
    return Utils.createResponse('error', 'Expense not found');
  }
};
