const Staff = {
  getAll(data) {
    const orgId = (data && data.orgId) || '';
    const cacheKey = 'staff_' + orgId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return Utils.createResponse('success', 'Staff retrieved', { staff: cached });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('success', 'Staff retrieved', { staff: [] });

    const staffData = sheet.getDataRange().getValues();
    const staff = [];
    for (let i = 1; i < staffData.length; i++) {
      if (!staffData[i][0]) continue;
      const rowOrg = staffData[i][17] || '';
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      staff.push({
        id: staffData[i][0], userId: staffData[i][1], name: staffData[i][2],
        phone: staffData[i][3], email: staffData[i][4], aadharNumber: staffData[i][5],
        upiId: staffData[i][6], startDate: staffData[i][7], role: staffData[i][8],
        salary: staffData[i][9], allowance: staffData[i][10],
        incentiveStructure: staffData[i][11], specialization: staffData[i][12], status: staffData[i][13],
        staffType: staffData[i][14] || 'service_provider', profileId: staffData[i][15] || '',
        targetPeriod: staffData[i][16] || 'monthly', orgId: rowOrg
      });
    }

    Utils.setCached(cacheKey, staff);
    return Utils.createResponse('success', 'Staff retrieved', { staff });
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('error', 'Staff sheet not found');

    const staffId = 'STF' + Date.now();
    sheet.appendRow([staffId, data.userId || '', data.name, data.phone, data.email,
                     data.aadharNumber, data.upiId, data.startDate, data.role,
                     data.salary, data.allowance, data.incentiveStructure,
                     data.specialization, data.status || 'active',
                     data.staffType || 'service_provider', data.profileId || '',
                     data.targetPeriod || 'monthly', data.orgId || '']);
    Utils.clearCached('staff_' + (data.orgId || ''));
    return Utils.createResponse('success', 'Staff member added successfully');
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('error', 'Staff sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        const oldOrgId = dataRange[i][17] || '';
        // targetOrgId is the explicit "move to this org" value from an org
        // picker. data.orgId is NOT usable here — Main.js's session
        // middleware overwrites it with the CALLER's own org on every
        // request, so using it would silently reassign every cross-org edit
        // to the editor's own org instead of leaving it alone.
        const newOrgId = data.targetOrgId !== undefined ? (data.targetOrgId || '') : oldOrgId;

        sheet.getRange(i + 1, 2).setValue(data.userId || '');
        sheet.getRange(i + 1, 3).setValue(data.name);
        sheet.getRange(i + 1, 4).setValue(data.phone);
        sheet.getRange(i + 1, 5).setValue(data.email);
        sheet.getRange(i + 1, 6).setValue(data.aadharNumber);
        sheet.getRange(i + 1, 7).setValue(data.upiId);
        sheet.getRange(i + 1, 8).setValue(data.startDate);
        sheet.getRange(i + 1, 9).setValue(data.role);
        sheet.getRange(i + 1, 10).setValue(data.salary);
        sheet.getRange(i + 1, 11).setValue(data.allowance);
        sheet.getRange(i + 1, 12).setValue(data.incentiveStructure);
        sheet.getRange(i + 1, 13).setValue(data.specialization);
        sheet.getRange(i + 1, 14).setValue(data.status);
        sheet.getRange(i + 1, 15).setValue(data.staffType    || 'service_provider');
        sheet.getRange(i + 1, 16).setValue(data.profileId    || '');
        sheet.getRange(i + 1, 17).setValue(data.targetPeriod || 'monthly');
        sheet.getRange(i + 1, 18).setValue(newOrgId);

        Utils.clearCached('staff_' + oldOrgId);
        if (newOrgId !== oldOrgId) Utils.clearCached('staff_' + newOrgId);
        return Utils.createResponse('success', 'Staff member updated successfully');
      }
    }
    return Utils.createResponse('error', 'Staff member not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
    if (!sheet) return Utils.createResponse('error', 'Staff sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        Utils.clearCached('staff_' + (data.orgId || ''));
        return Utils.createResponse('success', 'Staff member deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Staff member not found');
  }
};
