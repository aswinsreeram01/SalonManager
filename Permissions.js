// Permissions sheet columns (0-based):
// id(0), roleId(1), menuItem(2), canRead(3), canUpdate(4)
//   canUpdate covers add/edit/delete for that menu item.
// A role with no row for a given menuItem is treated as canRead=false,
// canUpdate=false (fail closed) — see Permissions.check().

const Permissions = {
  // Plain-array read shared by getByRole/getByUser (public, wrapped in
  // createResponse) and Auth.login (needs the raw array directly — do NOT
  // read .permissions off getByRole's return value, that's a
  // ContentService.TextOutput and has no such property; every login would
  // silently receive an empty permissions list).
  // forceRefresh: true bypasses the cache — used at login so a permission
  // change takes effect on the very next login instead of waiting out the
  // cache TTL.
  _getByRoleRaw(roleId, forceRefresh) {
    const cacheKey = 'perms_' + roleId;
    if (!forceRefresh) {
      const cached = Utils.getCached(cacheKey);
      if (cached) return cached;
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (!sheet) return [];

    const permData = sheet.getDataRange().getValues();
    const permissions = [];
    for (let i = 1; i < permData.length; i++) {
      if (permData[i][1] === roleId) {
        permissions.push({
          id: permData[i][0], roleId: permData[i][1], menuItem: permData[i][2],
          canRead:   permData[i][3] === true || permData[i][3] === 'TRUE',
          canUpdate: permData[i][4] === true || permData[i][4] === 'TRUE'
        });
      }
    }

    Utils.setCached(cacheKey, permissions);
    return permissions;
  },

  getByRole(data) {
    return Utils.createResponse('success', 'Permissions retrieved', {
      permissions: this._getByRoleRaw(data.roleId)
    });
  },

  getByUser(data) {
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!usersSheet) return Utils.createResponse('error', 'User not found');

    const usersData = usersSheet.getDataRange().getValues();
    let userRoleId = null;
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][0] === data.userId) { userRoleId = usersData[i][7]; break; }
    }
    if (!userRoleId) return Utils.createResponse('error', 'User not found');
    return this.getByRole({ roleId: userRoleId });
  },

  updateBulk(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (!sheet) return Utils.createResponse('error', 'Permissions sheet not found');

    // Read the sheet once, not once per permission item
    const permData = sheet.getDataRange().getValues();

    data.permissions.forEach(perm => {
      const canRead   = !!perm.canRead;
      const canUpdate = !!perm.canUpdate;
      let found = false;
      for (let i = 1; i < permData.length; i++) {
        if (permData[i][1] === data.roleId && permData[i][2] === perm.menuItem) {
          sheet.getRange(i + 1, 4, 1, 2).setValues([[canRead, canUpdate]]);
          permData[i][3] = canRead;
          permData[i][4] = canUpdate;
          found = true;
          break;
        }
      }
      if (!found) {
        const permId = 'PERM' + Date.now() + Math.random();
        sheet.appendRow([permId, data.roleId, perm.menuItem, canRead, canUpdate]);
      }
    });

    Utils.clearCached('perms_' + data.roleId);
    Utils.clearCached('permmap_' + data.roleId);
    return Utils.createResponse('success', 'Permissions updated successfully');
  },

  // ── Server-side enforcement lookup ──────────────────────────────────────
  // Returns { menuItem: { canRead, canUpdate }, ... } for a role, cached.
  _getRolePermMap(roleId) {
    const cacheKey = 'permmap_' + roleId;
    const cached = Utils.getCached(cacheKey);
    if (cached) return cached;

    const map = {};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (sheet) {
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] !== roleId) continue;
        map[rows[i][2]] = {
          canRead:   rows[i][3] === true || rows[i][3] === 'TRUE',
          canUpdate: rows[i][4] === true || rows[i][4] === 'TRUE'
        };
      }
    }
    Utils.setCached(cacheKey, map);
    return map;
  },

  // kind: 'read' | 'update'. Fails closed: no row for (roleId, menuItem) => false.
  check(roleId, menuItem, kind) {
    if (!roleId || !menuItem) return false;
    const map = this._getRolePermMap(roleId);
    const entry = map[menuItem];
    if (!entry) return false;
    return kind === 'update' ? !!entry.canUpdate : !!entry.canRead;
  }
};
