// ServiceGroups sheet columns (0-based):
// id(0), name(1), description(2), gstPct(3), sacCode(4), countForTarget(5) — DEPRECATED, see below,
// directIncentivePct(6), sortOrder(7), status(8), orgId(9), pointsEligible(10),
// excludeFromTarget(11)
//
// excludeFromTarget replaces countForTarget: target-revenue eligibility is
// now opt-OUT (every service group counts toward target unless explicitly
// excluded) instead of opt-IN. countForTarget(5) is kept in the sheet for
// history but no longer read/written — see migrateExcludeFromTarget below
// for the one-time backfill that preserved existing behavior when this
// switched over.

const ServiceGroups = {
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
        directIncentivePct: Number(rows[i][6]) || 0,
        sortOrder:          Number(rows[i][7]) || 0,
        status:             rows[i][8],
        orgId:              rowOrg,
        pointsEligible:     rows[i][10] === true || rows[i][10] === 'TRUE',
        excludeFromTarget:  rows[i][11] === true || rows[i][11] === 'TRUE'
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
      Number(data.directIncentivePct) || 0,
      Number(data.sortOrder)   || 0,
      data.status              || 'active',
      orgId,
      data.pointsEligible      === true || data.pointsEligible === 'TRUE' ? true : false,
      data.excludeFromTarget   === true || data.excludeFromTarget === 'TRUE' ? true : false
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
        sheet.getRange(i + 1, 7).setValue(Number(data.directIncentivePct) || 0);
        sheet.getRange(i + 1, 8).setValue(Number(data.sortOrder)   || 0);
        sheet.getRange(i + 1, 9).setValue(data.status);
        sheet.getRange(i + 1, 10).setValue(newOrgId);
        sheet.getRange(i + 1, 11).setValue(data.pointsEligible === true || data.pointsEligible === 'TRUE' ? true : false);
        sheet.getRange(i + 1, 12).setValue(data.excludeFromTarget === true || data.excludeFromTarget === 'TRUE' ? true : false);
        Utils.clearCached('service_groups_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('service_groups_' + newOrgId);
        return Utils.createResponse('success', 'Service group updated successfully');
      }
    }
    return Utils.createResponse('error', 'Service group not found');
  },

  // ── One-time migration: countForTarget -> excludeFromTarget ──────────────
  // Run manually from the Apps Script editor (select migrateExcludeFromTarget,
  // click Run) ONCE after deploying the opt-out target model. Sets
  // excludeFromTarget = !countForTarget on every existing row, which
  // preserves today's behavior exactly — nothing changes for existing
  // groups until an admin explicitly re-checks the (renamed) box. Safe to
  // re-run: skips any row that already has excludeFromTarget set.
  migrateExcludeFromTarget() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceGroups');
    if (!sheet) { Logger.log('ServiceGroups sheet not found'); return; }

    const rows = sheet.getDataRange().getValues();
    let migrated = 0;
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (rows[i][11] === true || rows[i][11] === 'TRUE') continue; // already migrated
      const countedForTarget = rows[i][5] === true || rows[i][5] === 'TRUE';
      sheet.getRange(i + 1, 12).setValue(!countedForTarget);
      migrated++;
    }
    Utils.clearCached('service_groups_');
    Logger.log('Migrated ' + migrated + ' service group(s) to excludeFromTarget');
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
