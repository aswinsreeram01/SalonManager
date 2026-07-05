const Organizations = {
  // Plain-array read shared by getAll and by every other entity's org-scoping
  // logic (isWithinScope/scopeOrgIds below) — do NOT read .organizations off
  // getAll's return value, that's a ContentService.TextOutput.
  _getAllRaw() {
    let allOrgs = Utils.getCached('orgs');
    if (!allOrgs) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
      if (!sheet) return [];

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
    return allOrgs;
  },

  getAll(data) {
    const allOrgs = this._getAllRaw();
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

  // ── Shared org-scoping helpers (used by every entity's add/update/getAll) ──

  // Server-side check for a client-picked targetOrgId: is it the caller's own
  // org, or a genuine descendant of it? Never trust targetOrgId without this
  // — a caller could otherwise pass any orgId string and reassign/create a
  // record in an org they have no relationship to.
  isWithinScope(callerOrgId, targetOrgId) {
    if (!targetOrgId) return true; // no reassignment requested
    if (targetOrgId === callerOrgId) return true;
    if (!callerOrgId) return false;
    const allOrgs = this._getAllRaw();
    return this.getOrgAndChildren(callerOrgId, allOrgs).some(o => o.id === targetOrgId);
  },

  // Set of org ids a read should include: just the caller's own org by
  // default (matches today's exact-match behavior), or the caller's org plus
  // every descendant when includeChildren is true (the opt-in "sub-orgs"
  // toggle on a grid). Returns null when callerOrgId is blank (no org
  // context at all — e.g. a global/unscoped role) so callers can skip
  // filtering entirely, same as today.
  scopeOrgIds(callerOrgId, includeChildren) {
    if (!callerOrgId) return null;
    if (!includeChildren) return new Set([callerOrgId]);
    const allOrgs = this._getAllRaw();
    return new Set(this.getOrgAndChildren(callerOrgId, allOrgs).map(o => o.id));
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
