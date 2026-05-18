const Organizations = {
  getAll(data) {
    let allOrgs = Utils.getCached('orgs');
    if (!allOrgs) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
      if (!sheet) return Utils.createResponse('success', 'Organizations retrieved', { organizations: [] });

      const orgData = sheet.getDataRange().getValues();
      allOrgs = [];
      for (let i = 1; i < orgData.length; i++) {
        allOrgs.push({
          id: orgData[i][0], name: orgData[i][1], parentId: orgData[i][2] || null,
          type: orgData[i][3], status: orgData[i][4]
        });
      }
      Utils.setCached('orgs', allOrgs);
    }

    if (data.userOrgId) {
      const allowed = this.getOrgAndChildren(data.userOrgId, allOrgs);
      return Utils.createResponse('success', 'Organizations retrieved', { organizations: allowed });
    }
    return Utils.createResponse('success', 'Organizations retrieved', { organizations: allOrgs });
  },

  getOrgAndChildren(orgId, allOrgs) {
    const result = [];
    const org = allOrgs.find(o => o.id === orgId);
    if (org) {
      result.push(org);
      allOrgs.filter(o => o.parentId === orgId).forEach(child => {
        result.push(...this.getOrgAndChildren(child.id, allOrgs));
      });
    }
    return result;
  },

  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    if (!sheet) return Utils.createResponse('error', 'Organizations sheet not found');

    const orgId = 'ORG' + Date.now();
    sheet.appendRow([orgId, data.name, data.parentId || '', data.type, data.status || 'active']);
    Utils.clearCached('orgs');
    return Utils.createResponse('success', 'Organization added successfully', { id: orgId });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    if (!sheet) return Utils.createResponse('error', 'Organizations sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.parentId || '');
        sheet.getRange(i + 1, 4).setValue(data.type);
        sheet.getRange(i + 1, 5).setValue(data.status);
        Utils.clearCached('orgs');
        return Utils.createResponse('success', 'Organization updated successfully');
      }
    }
    return Utils.createResponse('error', 'Organization not found');
  },

  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    if (!sheet) return Utils.createResponse('error', 'Organizations sheet not found');

    const dataRange = sheet.getDataRange().getValues();
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][2] === data.id) {
        return Utils.createResponse('error', 'Cannot delete organization with child organizations');
      }
    }
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        Utils.clearCached('orgs');
        return Utils.createResponse('success', 'Organization deleted successfully');
      }
    }
    return Utils.createResponse('error', 'Organization not found');
  }
};
