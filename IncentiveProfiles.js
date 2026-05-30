// IncentiveProfiles sheet columns (0-based):
// profileId(0), profileName(1), profileType(2), revenueBase(3), otHourlyRate(4),
// l1Type(5), l1Value(6), l2Type(7), l2Value(8), xPct(9), yPct(10), zPct(11), status(12), orgId(13)

const IncentiveProfiles = {
  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const cacheKey = 'incentive_profiles_' + orgId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Incentive profiles retrieved', { incentiveProfiles: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('IncentiveProfiles');
    if (!sheet) return Utils.createResponse('success', 'Incentive profiles retrieved', { incentiveProfiles: [] });

    const rows = sheet.getDataRange().getValues();
    const incentiveProfiles = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const rowOrg = rows[i][13] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      incentiveProfiles.push({
        profileId:     rows[i][0],
        profileName:   rows[i][1],
        profileType:   rows[i][2],
        revenueBase:   rows[i][3],
        otHourlyRate:  Number(rows[i][4]) || 0,
        l1Type:        rows[i][5],
        l1Value:       Number(rows[i][6]) || 0,
        l2Type:        rows[i][7],
        l2Value:       Number(rows[i][8]) || 0,
        xPct:          Number(rows[i][9])  || 0,
        yPct:          Number(rows[i][10]) || 0,
        zPct:          Number(rows[i][11]) || 0,
        status:        rows[i][12],
        orgId:         rowOrg
      });
    }

    Utils.setCached(cacheKey, incentiveProfiles);
    return Utils.createResponse('success', 'Incentive profiles retrieved', { incentiveProfiles });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('IncentiveProfiles');
    if (!sheet) return Utils.createResponse('error', 'IncentiveProfiles sheet not found');

    const profileId = data.profileId || ('PROF' + Date.now());
    sheet.appendRow([
      profileId,
      data.profileName,
      data.profileType   || 'service_provider',
      data.revenueBase   || 'individual',
      Number(data.otHourlyRate) || 0,
      data.l1Type        || 'fixed',
      Number(data.l1Value) || 0,
      data.l2Type        || 'fixed',
      Number(data.l2Value) || 0,
      Number(data.xPct)  || 0,
      Number(data.yPct)  || 0,
      Number(data.zPct)  || 0,
      data.status        || 'active',
      data.orgId         || ''
    ]);
    Utils.clearCached('incentive_profiles_' + (data.orgId || ''));
    return Utils.createResponse('success', 'Incentive profile added successfully', { profileId });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('IncentiveProfiles');
    if (!sheet) return Utils.createResponse('error', 'IncentiveProfiles sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.profileId) {
        sheet.getRange(i + 1, 2).setValue(data.profileName);
        sheet.getRange(i + 1, 3).setValue(data.profileType   || 'service_provider');
        sheet.getRange(i + 1, 4).setValue(data.revenueBase   || 'individual');
        sheet.getRange(i + 1, 5).setValue(Number(data.otHourlyRate) || 0);
        sheet.getRange(i + 1, 6).setValue(data.l1Type        || 'fixed');
        sheet.getRange(i + 1, 7).setValue(Number(data.l1Value) || 0);
        sheet.getRange(i + 1, 8).setValue(data.l2Type        || 'fixed');
        sheet.getRange(i + 1, 9).setValue(Number(data.l2Value) || 0);
        sheet.getRange(i + 1, 10).setValue(Number(data.xPct) || 0);
        sheet.getRange(i + 1, 11).setValue(Number(data.yPct) || 0);
        sheet.getRange(i + 1, 12).setValue(Number(data.zPct) || 0);
        sheet.getRange(i + 1, 13).setValue(data.status);
        Utils.clearCached('incentive_profiles_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Incentive profile updated successfully');
      }
    }
    return Utils.createResponse('error', 'Incentive profile not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('IncentiveProfiles');
    if (!sheet) return Utils.createResponse('error', 'IncentiveProfiles sheet not found');

    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.profileId) {
        sheet.getRange(i + 1, 13).setValue('inactive');
        Utils.clearCached('incentive_profiles_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Incentive profile deactivated successfully');
      }
    }
    return Utils.createResponse('error', 'Incentive profile not found');
  },

  seedDefaults() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('IncentiveProfiles');

    if (!sheet) return;
    const allData = sheet.getDataRange().getValues();
    if (allData.length > 1 && allData[1][0]) return;

    const seeds = [
      ['PROF_SP_STD', 'Service Provider — Standard', 'service_provider', 'individual',
        50, 'salary_pct', 150, 'salary_pct', 350, 1, 1.5, 2, 'active', ''],
      ['PROF_MGR_STD', 'Manager — Standard', 'manager', 'org',
        50, 'fixed', 75000, 'fixed', 200000, 0.5, 0.75, 1, 'active', ''],
      ['PROF_HK_STD', 'Housekeeping — Standard', 'housekeeping', 'individual',
        50, 'fixed', 0, 'fixed', 0, 0, 0, 0, 'active', '']
    ];

    seeds.forEach(row => sheet.appendRow(row));
    Utils.clearCached('incentive_profiles_');
  }
};
