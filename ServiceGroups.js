// ServiceGroups sheet columns (0-based):
// id(0), name(1), description(2), gstPct(3), sacCode(4), countForTarget(5) — DEPRECATED, see below,
// directIncentivePct(6) — optional % override, see below,
// sortOrder(7), status(8), orgId(9), pointsEligible(10),
// excludeFromTarget(11) — DEPRECATED, see below,
// incentiveMode(12) — 'flat' | 'tiered' | 'none'. Replaces excludeFromTarget
// with a 3-way, mutually-exclusive choice of how this group's revenue
// contributes to incentives (see Payroll.js):
//   'flat'   — a flat % of revenue (this group's own directIncentivePct
//              override if set, else the staff's Comp Plan flatIncentivePct)
//   'tiered' — counts toward the Comp Plan's L1/L2/X/Y/Z target-incentive slabs
//   'none'   — no incentive at all from this group
// countForTarget(5) and excludeFromTarget(11) are kept in the sheet for
// history but no longer read/written — see migrateIncentiveMode below for
// the one-time backfill that preserved existing behavior when this switched
// over (excludeFromTarget=false -> 'tiered'; excludeFromTarget=true with a
// directIncentivePct set -> 'flat'; excludeFromTarget=true with none -> 'none').
//
// directIncentivePct(6) is stored BLANK when not set — distinct from an
// explicit 0. Blank means "fall back to the Comp Plan's flatIncentivePct"
// when incentiveMode is 'flat'; explicit 0 is a real value and must not
// fall back. Irrelevant when incentiveMode isn't 'flat'.

const ServiceGroups = {
  // '', null, undefined -> blank (no override, fall back to Comp Plan default).
  // Anything else, including 0, is a real explicit value.
  _normalizeDirectIncentivePct(v) {
    return v === '' || v === null || v === undefined ? '' : (Number(v) || 0);
  },

  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const includeChildren = !!(data && data.includeChildren);
    let cached = null;
    if (!includeChildren) {
      cached = Utils.getCached('service_groups_' + orgId);
      if (cached) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: cached });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups: [] });

    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;

    const rows = sheet.getDataRange().getValues();
    const serviceGroups = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][9] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;
      serviceGroups.push({
        id:                 rows[i][0],
        name:               rows[i][1],
        description:        rows[i][2],
        gstPct:             rows[i][3],
        sacCode:            rows[i][4] || '',
        directIncentivePct: rows[i][6] === '' || rows[i][6] === null || rows[i][6] === undefined ? '' : Number(rows[i][6]),
        sortOrder:          Number(rows[i][7]) || 0,
        status:             rows[i][8],
        orgId:              rowOrg,
        pointsEligible:     rows[i][10] === true || rows[i][10] === 'TRUE',
        incentiveMode:      rows[i][12] || 'tiered'
      });
    }

    serviceGroups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.name).localeCompare(String(b.name));
    });

    if (!includeChildren) Utils.setCached('service_groups_' + orgId, serviceGroups);
    return Utils.createResponse('success', 'Service groups retrieved', { serviceGroups });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found. Please create it with columns: id, name, description, gstPct, sacCode, countForTarget, directIncentivePct, sortOrder, status, orgId');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }
    const orgId = data.targetOrgId || data.orgId || '';

    const id = 'SGP' + Date.now();
    sheet.appendRow([
      id,
      data.name,
      data.description         || '',
      Number(data.gstPct)      || 0,
      data.sacCode             || '',
      '', // countForTarget — deprecated, no longer written
      this._normalizeDirectIncentivePct(data.directIncentivePct),
      Number(data.sortOrder)   || 0,
      data.status              || 'active',
      orgId,
      data.pointsEligible      === true || data.pointsEligible === 'TRUE' ? true : false,
      '', // excludeFromTarget — deprecated, no longer written
      data.incentiveMode       || 'tiered'
    ]);
    Utils.clearCached('service_groups_' + orgId);
    return Utils.createResponse('success', 'Service group added successfully', { id });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found');
    if (!Organizations.isWithinScope(data.orgId, data.targetOrgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        const oldOrgId = sheetData[i][9] || '';
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.description         || '');
        sheet.getRange(i + 1, 4).setValue(Number(data.gstPct)      || 0);
        sheet.getRange(i + 1, 5).setValue(data.sacCode             || '');
        // Column 6 (countForTarget) deliberately left untouched — deprecated, historical only.
        sheet.getRange(i + 1, 7).setValue(this._normalizeDirectIncentivePct(data.directIncentivePct));
        sheet.getRange(i + 1, 8).setValue(Number(data.sortOrder)   || 0);
        sheet.getRange(i + 1, 9).setValue(data.status);
        sheet.getRange(i + 1, 10).setValue(newOrgId);
        sheet.getRange(i + 1, 11).setValue(data.pointsEligible === true || data.pointsEligible === 'TRUE' ? true : false);
        // Column 12 (excludeFromTarget) deliberately left untouched — deprecated, historical only.
        sheet.getRange(i + 1, 13).setValue(data.incentiveMode || 'tiered');
        Utils.clearCached('service_groups_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('service_groups_' + newOrgId);
        return Utils.createResponse('success', 'Service group updated successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  },

  // ── One-time migration: excludeFromTarget -> incentiveMode ───────────────
  // Run manually from the Apps Script editor ONCE after deploying the 3-way
  // incentive mode (select runServiceGroupsIncentiveModeMigration in the
  // function dropdown — this method itself is invisible there, see that
  // wrapper's comment). Preserves each group's effective behavior exactly:
  //   excludeFromTarget=false                          -> 'tiered' (counted for target, as before)
  //   excludeFromTarget=true, directIncentivePct > 0    -> 'flat'   (kept its flat bonus)
  //   excludeFromTarget=true, no directIncentivePct     -> 'none'  (no incentive, as before)
  // Note: a group that had BOTH excludeFromTarget=false AND a nonzero
  // directIncentivePct previously got both a tiered-target contribution AND
  // a flat bonus simultaneously — the new model is mutually exclusive, so
  // that combination collapses to 'tiered' here (its flat bonus is no
  // longer applied). Review any such groups after migrating.
  // Safe to re-run: skips any row that already has incentiveMode set.
  migrateIncentiveMode() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) { Logger.log('ServiceGroups sheet not found'); return; }

    const rows = sheet.getDataRange().getValues();
    let migrated = 0;
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (rows[i][12]) continue; // already migrated
      const wasExcluded = rows[i][11] === true || rows[i][11] === 'TRUE';
      const directPct = Number(rows[i][6]) || 0;
      const mode = !wasExcluded ? 'tiered' : (directPct > 0 ? 'flat' : 'none');
      sheet.getRange(i + 1, 13).setValue(mode);
      migrated++;
    }
    Utils.clearCached('service_groups_');
    Logger.log('Migrated ' + migrated + ' service group(s) to incentiveMode');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) return Utils.createResponse('error', 'ServiceGroups sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) {
        sheet.getRange(i + 1, 9).setValue('inactive');
        Utils.clearCached('service_groups_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Service group deactivated successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  }
};

// Temporary top-level wrapper — the Apps Script editor's function-to-run
// dropdown can't see object methods. Select
// runServiceGroupsIncentiveModeMigration, click Run, ONCE, then delete this
// wrapper.
function runServiceGroupsIncentiveModeMigration() {
  ServiceGroups.migrateIncentiveMode();
}
