const Organizations = {
  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    const orgData = sheet.getDataRange().getValues();
    const orgs = [];
    
    for (let i = 1; i < orgData.length; i++) {
      orgs.push({
        id: orgData[i][0],
        name: orgData[i][1],
        parentId: orgData[i][2] || null,
        type: orgData[i][3],
        status: orgData[i][4]
      });
    }
    
    // If user has orgId, filter to show only their org and children
    if (data.userOrgId) {
      const allowedOrgs = this.getOrgAndChildren(data.userOrgId, orgs);
      return Utils.createResponse('success', 'Organizations retrieved', { organizations: allowedOrgs });
    }
    
    return Utils.createResponse('success', 'Organizations retrieved', { organizations: orgs });
  },
  
  getOrgAndChildren(orgId, allOrgs) {
    const result = [];
    const org = allOrgs.find(o => o.id === orgId);
    
    if (org) {
      result.push(org);
      
      // Find children recursively
      const children = allOrgs.filter(o => o.parentId === orgId);
      children.forEach(child => {
        result.push(...this.getOrgAndChildren(child.id, allOrgs));
      });
    }
    
    return result;
  },
  
  add(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    const orgId = 'ORG' + Date.now();
    
    sheet.appendRow([
      orgId,
      data.name,
      data.parentId || '',
      data.type,
      data.status || 'active'
    ]);
    
    return Utils.createResponse('success', 'Organization added successfully', { id: orgId });
  },
  
  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    const dataRange = sheet.getDataRange().getValues();
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(data.name);
        sheet.getRange(i + 1, 3).setValue(data.parentId || '');
        sheet.getRange(i + 1, 4).setValue(data.type);
        sheet.getRange(i + 1, 5).setValue(data.status);
        return Utils.createResponse('success', 'Organization updated successfully');
      }
    }
    
    return Utils.createResponse('error', 'Organization not found');
  },
  
  remove(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
    const dataRange = sheet.getDataRange().getValues();
    
    // Check if org has children
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][2] === data.id) {
        return Utils.createResponse('error', 'Cannot delete organization with child organizations');
      }
    }
    
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.id) {
        sheet.deleteRow(i + 1);
        return Utils.createResponse('success', 'Organization deleted successfully');
      }
    }
    
    return Utils.createResponse('error', 'Organization not found');
  }
};