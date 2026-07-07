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
  },

  // ── Portal visibility ───────────────────────────────────────────────────
  // Which tabs/sections the staff and customer portals show. Stored as two
  // comma-joined OrgSettings keys of ENABLED ids; a missing key means
  // "everything enabled" (the default for fresh installs). Global, like
  // every other OrgSettings key — not per-org.

  // Note: the saved comma-joined list is ORDERED — its order is the display
  // order in the portal (Permissions > Staff/Customer Portal has ↑/↓).
  STAFF_PORTAL_TABS:        ['records', 'pending', 'attendance', 'advance', 'payslips', 'profile'],
  CUSTOMER_PORTAL_SECTIONS: ['loyalty', 'summary', 'lastVisit', 'history', 'profile'],

  // Plain-object read for backend modules (StaffPortal, Customers) — arrays
  // of enabled ids, defaulting to all when the key was never saved.
  _portalVisibilityRaw() {
    const s = this._getRaw();
    const parse = (v, all) => {
      if (v === undefined || v === null || String(v) === '') return all.slice();
      return String(v).split(',').map(x => x.trim()).filter(x => all.includes(x));
    };
    return {
      staffTabs:        parse(s.staffPortalTabs, this.STAFF_PORTAL_TABS),
      customerSections: parse(s.customerPortalSections, this.CUSTOMER_PORTAL_SECTIONS)
    };
  },

  getPortalVisibility() {
    return Utils.createResponse('success', 'Portal visibility retrieved', this._portalVisibilityRaw());
  },

  updatePortalVisibility(data) {
    const staffTabs = Array.isArray(data.staffTabs)
      ? data.staffTabs.filter(t => this.STAFF_PORTAL_TABS.includes(t)) : null;
    const customerSections = Array.isArray(data.customerSections)
      ? data.customerSections.filter(s => this.CUSTOMER_PORTAL_SECTIONS.includes(s)) : null;

    // At least one tab/section must stay on — an empty portal is a lockout,
    // not a configuration.
    if (staffTabs && !staffTabs.length) {
      return Utils.createResponse('error', 'At least one staff portal tab must remain enabled.');
    }
    if (customerSections && !customerSections.length) {
      return Utils.createResponse('error', 'At least one customer portal section must remain enabled.');
    }

    // Only the two visibility keys are written — never the raw request data,
    // which carries middleware fields (sessionToken, orgId, userId, action).
    const updates = {};
    if (staffTabs)        updates.staffPortalTabs        = staffTabs.join(',');
    if (customerSections) updates.customerPortalSections = customerSections.join(',');
    if (!Object.keys(updates).length) {
      return Utils.createResponse('error', 'Nothing to update');
    }
    return this.update(updates);
  }
};
