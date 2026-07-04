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
    // otThresholdHours moved to IncentiveProfiles (per-profile, since it can
    // vary by staff member) — see IncentiveProfiles.buildOTThresholdMap.
    // A legacy 'otThresholdHours' row may still exist in old OrgSettings
    // sheets; it's harmless and no longer read by any code.
  },

  // Plain-object settings read, shared by get() (public) and other backend
  // modules that need a config value without going through a wrapped
  // ContentService response (e.g. Utils.computeHoursAndOT).
  _getRaw() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OrgSettings');
    if (!sheet) return Object.assign({}, this._defaults);

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return Object.assign({}, this._defaults); // header-only or empty

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
    return settings;
  },

  get() {
    return Utils.createResponse('success', 'Org settings retrieved', { settings: this._getRaw() });
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
