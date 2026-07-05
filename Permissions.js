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
  },

  // ── One-time migration: page-level -> tab-level permissions ──────────────
  // Run manually from the Apps Script editor (select migrateToTabPermissions,
  // click Run) ONCE after deploying the tab-level permission model for
  // Products/Staff/Customers/Services. Copies each role's existing
  // page-level grant (e.g. 'staff' canRead/canUpdate) onto every new tab key
  // under that page (e.g. 'staff:hr-staff' .. 'staff:hr-payroll') so nobody
  // loses access on deploy — admins can then narrow down individual tabs
  // (e.g. uncheck Payroll) from the Roles > Permissions screen afterward.
  // Safe to re-run: skips any (roleId, tabKey) pair that already has a row.
  _TAB_MIGRATION_MAP: {
    products: ['products:product-groups', 'products:products', 'products:vendors',
               'products:purchase-orders', 'products:receive-stock',
               'products:stock-register', 'products:stock-audit'],
    // Vendors used to be its own top-level page, before it moved to be a
    // Products tab — carry its old grant onto the new products:vendors key too.
    vendors:   ['products:vendors'],
    // 'staff:hr-profiles' (Comp Plans) is no longer its own tab key — it's
    // now nested inside Payroll and gated by staff:hr-payroll alone, so it's
    // deliberately not in this list; any old rows for it are simply unread.
    staff:     ['staff:hr-staff', 'staff:hr-advances',
                'staff:hr-shifts', 'staff:hr-attendance', 'staff:hr-payroll'],
    customers: ['customers:cust-list', 'customers:cust-loyalty', 'customers:cust-happyhour'],
    services:  ['services:svc-groups', 'services:svc-catalog', 'services:svc-pricebooks']
  },

  migrateToTabPermissions() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (!sheet) { Logger.log('Permissions sheet not found'); return; }

    const rows = sheet.getDataRange().getValues();
    const existingKeys = new Set(); // "roleId|menuItem"
    for (let i = 1; i < rows.length; i++) {
      existingKeys.add(rows[i][1] + '|' + rows[i][2]);
    }

    const toAdd = [];
    for (let i = 1; i < rows.length; i++) {
      const roleId    = rows[i][1];
      const menuItem  = rows[i][2];
      const canRead   = rows[i][3] === true || rows[i][3] === 'TRUE';
      const canUpdate = rows[i][4] === true || rows[i][4] === 'TRUE';
      const newTabs = this._TAB_MIGRATION_MAP[menuItem];
      if (!newTabs) continue;

      newTabs.forEach(tabKey => {
        const key = roleId + '|' + tabKey;
        if (existingKeys.has(key)) return; // already has its own row — don't overwrite a deliberate choice
        existingKeys.add(key); // avoid double-adding if two old rows map to the same new tab (products + vendors both -> products:vendors)
        toAdd.push([
          'PERM' + Date.now() + Math.random(),
          roleId, tabKey, canRead, canUpdate
        ]);
      });
    }

    if (toAdd.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, 5).setValues(toAdd);
    }

    // Clear every role's permission caches so the new rows take effect immediately.
    const roleIds = new Set();
    for (let i = 1; i < rows.length; i++) roleIds.add(rows[i][1]);
    roleIds.forEach(roleId => {
      Utils.clearCached('perms_' + roleId);
      Utils.clearCached('permmap_' + roleId);
    });

    Logger.log('Migration complete: added ' + toAdd.length + ' tab-level permission rows across ' + roleIds.size + ' roles.');
  },

  // ── One-time migration: Quick Entry split out of Attendance & OT ─────────
  // Run manually from the Apps Script editor ONCE after deploying the
  // Quick Entry top-level tab (select runQuickEntryPermissionMigration in
  // the function dropdown — this method itself is invisible there, see
  // that wrapper's comment). Copies each role's existing staff:hr-attendance
  // canRead/canUpdate onto a new staff:hr-quickentry row, preserving
  // today's access — admins can then narrow either tab down independently
  // from Roles > Permissions. Safe to re-run: skips roles that already have
  // their own staff:hr-quickentry row.
  migrateQuickEntryPermission() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Permissions');
    if (!sheet) { Logger.log('Permissions sheet not found'); return; }

    const rows = sheet.getDataRange().getValues();
    const existingKeys = new Set();
    for (let i = 1; i < rows.length; i++) existingKeys.add(rows[i][1] + '|' + rows[i][2]);

    const toAdd = [];
    for (let i = 1; i < rows.length; i++) {
      const roleId = rows[i][1];
      if (rows[i][2] !== 'staff:hr-attendance') continue;
      const key = roleId + '|staff:hr-quickentry';
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      const canRead   = rows[i][3] === true || rows[i][3] === 'TRUE';
      const canUpdate = rows[i][4] === true || rows[i][4] === 'TRUE';
      toAdd.push(['PERM' + Date.now() + Math.random(), roleId, 'staff:hr-quickentry', canRead, canUpdate]);
    }

    if (toAdd.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, 5).setValues(toAdd);
    }

    const roleIds = new Set();
    for (let i = 1; i < rows.length; i++) roleIds.add(rows[i][1]);
    roleIds.forEach(roleId => {
      Utils.clearCached('perms_' + roleId);
      Utils.clearCached('permmap_' + roleId);
    });

    Logger.log('Migration complete: added staff:hr-quickentry to ' + toAdd.length + ' role(s).');
  }
};
