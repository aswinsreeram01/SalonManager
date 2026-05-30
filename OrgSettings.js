// OrgSettings sheet columns (0-based):
// key(0), value(1)

const OrgSettings = {
  _defaults: {
    salonName:            '',
    gstNumber:            '',
    currencySymbol:       '₹',
    defaultTargetPeriod:  'weekly',
    salaryPayDay:         10,
    defaultEligibleOffs:  4
  },

  get() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OrgSettings');
    if (!sheet) return Utils.createResponse('success', 'Org settings retrieved', { settings: Object.assign({}, this._defaults) });

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      // Sheet exists but has only a header (or is empty) — return defaults
      return Utils.createResponse('success', 'Org settings retrieved', { settings: Object.assign({}, this._defaults) });
    }

    const settings = Object.assign({}, this._defaults);
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const key   = String(data[i][0]);
      let   value = data[i][1];
      // Coerce numeric defaults to numbers
      if (key === 'salaryPayDay' || key === 'defaultEligibleOffs') {
        value = Number(value) || this._defaults[key];
      }
      settings[key] = value;
    }

    return Utils.createResponse('success', 'Org settings retrieved', { settings });
  },

  update(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('OrgSettings');
    if (!sheet) return Utils.createResponse('error', 'OrgSettings sheet not found');

    const sheetData = sheet.getDataRange().getValues();

    // Build a map of key → row index (1-based)
    const keyRowMap = {};
    for (let i = 1; i < sheetData.length; i++) {
      if (!sheetData[i][0]) continue;
      keyRowMap[String(sheetData[i][0])] = i + 1; // 1-based sheet row
    }

    const keys = Object.keys(data);
    for (let k = 0; k < keys.length; k++) {
      const key   = keys[k];
      const value = data[key];
      if (keyRowMap[key] !== undefined) {
        sheet.getRange(keyRowMap[key], 2).setValue(value);
      } else {
        sheet.appendRow([key, value]);
      }
    }

    return Utils.createResponse('success', 'Org settings updated successfully');
  }
};
