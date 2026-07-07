// Actions any authenticated admin user may call regardless of their role's
// permission matrix. 'change_own_password' is reserved for a future
// self-service password change action (not yet implemented) so it stays
// ungated the moment it's added.
const ALWAYS_ALLOWED_ACTIONS = ['logout', 'change_own_password'];

// action -> [menuItem, 'read' | 'update']. 'update' covers add/edit/delete.
// menuItem is either a page-level key (e.g. 'billing') for pages with no
// tabs, or a 'page:tab' composite key (e.g. 'staff:hr-payroll') for pages
// broken into tabs — this lets a role be granted e.g. every Staff & HR tab
// except Payroll. menuItem may also be an ARRAY of alternative keys; the
// caller passes if they have the requested access on ANY one of them — used
// where the same read powers more than one tab of the same page (e.g. the
// Vendors directory backs dropdowns on several Products tabs).
// Public actions (see publicActions below) and staff-portal actions (see
// STAFF_ACTIONS) are authenticated by a different mechanism and are not
// listed here.
const ACTION_PERMISSIONS = {
  // Customers
  get_customers: ['customers:cust-list', 'read'],
  add_customer: ['customers:cust-list', 'update'],

  // Loyalty (Loyalty Programme + Happy Hour tabs on the Customers page).
  // get_loyalty_config backs the initial load of BOTH tabs, so either tab's
  // read is enough; the two saves are owned by their own tab specifically.
  get_loyalty_config: [['customers:cust-loyalty', 'customers:cust-happyhour'], 'read'],
  update_loyalty_config: ['customers:cust-loyalty', 'update'],
  update_happy_hour_config: ['customers:cust-happyhour', 'update'],
  toggle_happy_hour: ['customers:cust-happyhour', 'update'],

  // Service Groups / Services / Price Books (tabs under the Services page).
  // get_service_groups also backs the Service Catalog tab's grouping, and
  // get_services also backs the Price Books tab's service picker.
  get_service_groups: [['services:svc-groups', 'services:svc-catalog'], 'read'],
  add_service_group: ['services:svc-groups', 'update'],
  update_service_group: ['services:svc-groups', 'update'],
  delete_service_group: ['services:svc-groups', 'update'],
  get_services: [['services:svc-catalog', 'services:svc-pricebooks'], 'read'],
  add_service: ['services:svc-catalog', 'update'],
  update_service: ['services:svc-catalog', 'update'],
  delete_service: ['services:svc-catalog', 'update'],
  get_pricebooks: ['services:svc-pricebooks', 'read'],
  add_pricebook: ['services:svc-pricebooks', 'update'],
  update_pricebook: ['services:svc-pricebooks', 'update'],
  delete_pricebook: ['services:svc-pricebooks', 'update'],
  get_pricebook_items: ['services:svc-pricebooks', 'read'],
  add_pricebook_item: ['services:svc-pricebooks', 'update'],
  update_pricebook_item: ['services:svc-pricebooks', 'update'],
  delete_pricebook_item: ['services:svc-pricebooks', 'update'],

  // Products, Vendors, Purchase Orders, Receive Stock, Stock Register/Audit
  // (all tabs under the Products page). get_products and get_vendors back
  // dropdowns on several sibling tabs, so their read is OR'd across every
  // tab that actually consumes them; get_purchase_orders/get_po_items/
  // get_stock_register are shared between Purchase Orders/Receive Stock/
  // Stock Audit for the same reason.
  get_products: [['products:products', 'products:purchase-orders', 'products:receive-stock', 'products:stock-register', 'products:stock-audit'], 'read'],
  add_product: ['products:products', 'update'],
  update_product: ['products:products', 'update'],
  update_product_stock: ['products:products', 'update'],
  delete_product: ['products:products', 'update'],
  receive_stock: ['products:receive-stock', 'update'],
  get_stock_register: [['products:stock-register', 'products:receive-stock', 'products:stock-audit'], 'read'],
  save_stock_audit: ['products:stock-audit', 'update'],
  get_product_groups: ['products:product-groups', 'read'],
  add_product_group: ['products:product-groups', 'update'],
  update_product_group: ['products:product-groups', 'update'],
  delete_product_group: ['products:product-groups', 'update'],
  get_purchase_orders: [['products:purchase-orders', 'products:receive-stock'], 'read'],
  create_purchase_order: ['products:purchase-orders', 'update'],
  update_po_status: ['products:purchase-orders', 'update'],
  get_po_items: [['products:purchase-orders', 'products:receive-stock'], 'read'],

  // Vendors (now a tab under Products, between Products and Purchase Orders)
  get_vendors: [['products:products', 'products:vendors', 'products:purchase-orders', 'products:receive-stock'], 'read'],
  add_vendor: ['products:vendors', 'update'],
  update_vendor: ['products:vendors', 'update'],
  remove_vendor: ['products:vendors', 'update'],

  // Staff, Advances, Shifts, Attendance, Quick Entry, Payroll (tabs under
  // the Staff & HR page). get_staff and get_shifts back dropdowns and grids
  // on sibling tabs, so their read is OR'd accordingly. Advances and
  // Payroll's own actions are deliberately NOT shared with any other tab,
  // so a role can be denied either specifically while keeping every other tab.
  //
  // Comp Plans and Staff Salary are nested sub-tabs INSIDE Payroll (not
  // their own top-level Staff & HR tab), and are gated purely by
  // staff:hr-payroll — same permission as Payroll itself, no separate key.
  // update_staff is OR'd with staff:hr-payroll because the Staff Salary
  // sub-tab reuses this same action to save salary/allowance/comp plan.
  //
  // Quick Entry used to be a sub-tab nested inside Attendance & OT, gated
  // purely by staff:hr-attendance; it's now its own top-level tab with its
  // own key. get_attendance/save_attendance are shared by both (Week Grid
  // AND Quick Entry both read/write StaffAttendance), so they're OR'd across
  // both keys — a role with only one of the two tabs still works correctly.
  // upsert_payroll_from_attendance is Quick-Entry-specific (Week Grid never
  // calls it), so it's gated on staff:hr-quickentry alone.
  get_staff: [['staff:hr-staff', 'staff:hr-attendance', 'staff:hr-quickentry', 'staff:hr-payroll'], 'read'],
  add_staff: ['staff:hr-staff', 'update'],
  update_staff: [['staff:hr-staff', 'staff:hr-payroll'], 'update'],
  reset_staff_pin: ['staff:hr-staff', 'update'],
  delete_staff: ['staff:hr-staff', 'update'],
  // OR'd with staff:hr-payroll — the Payroll Review modal's Remaining
  // Balance field reads the outstanding advance balance too.
  get_advances: [['staff:hr-advances', 'staff:hr-payroll'], 'read'],
  add_advance: ['staff:hr-advances', 'update'],
  get_incentive_profiles: ['staff:hr-payroll', 'read'],
  add_incentive_profile: ['staff:hr-payroll', 'update'],
  update_incentive_profile: ['staff:hr-payroll', 'update'],
  delete_incentive_profile: ['staff:hr-payroll', 'update'],
  get_shifts: [['staff:hr-shifts', 'staff:hr-attendance'], 'read'],
  save_shift: ['staff:hr-shifts', 'update'],
  get_attendance: [['staff:hr-attendance', 'staff:hr-quickentry'], 'read'],
  save_attendance: [['staff:hr-attendance', 'staff:hr-quickentry'], 'update'],
  get_week_schedule: ['staff:hr-attendance', 'read'],
  save_week_schedule: ['staff:hr-attendance', 'update'],
  upsert_payroll_from_attendance: ['staff:hr-quickentry', 'update'],
  // Deliberately their own permission, not OR'd with staff:hr-payroll — these
  // only return specific fields (never the full breakdown), so a
  // Quick-Entry-only role can see/re-enter them without Payroll access.
  get_payroll_overrides: ['staff:hr-quickentry', 'read'],
  get_payroll_summary: ['staff:hr-quickentry', 'read'],
  update_payroll_row: ['staff:hr-payroll', 'update'],
  get_payroll: ['staff:hr-payroll', 'read'],

  // HR Approvals (its own sidebar page)
  get_pending_attendance: ['hrapprovals', 'read'],
  approve_attendance: ['hrapprovals', 'update'],
  reject_attendance: ['hrapprovals', 'update'],
  get_pending_advances: ['hrapprovals', 'read'],
  approve_advance: ['hrapprovals', 'update'],
  disburse_advance: ['hrapprovals', 'update'],
  reject_advance: ['hrapprovals', 'update'],

  // Organizations / Users / Roles / Permissions
  get_organizations: ['organizations', 'read'],
  add_organization: ['organizations', 'update'],
  update_organization: ['organizations', 'update'],
  delete_organization: ['organizations', 'update'],
  get_users: ['users', 'read'],
  add_user: ['users', 'update'],
  update_user: ['users', 'update'],
  delete_user: ['users', 'update'],
  get_roles: ['roles', 'read'],
  add_role: ['roles', 'update'],
  update_role: ['roles', 'update'],
  delete_role: ['roles', 'update'],
  get_permissions: ['permissions', 'read'],
  get_user_permissions: ['permissions', 'read'],
  update_permissions: ['permissions', 'update'],

  // Bills (billing = create; history = browse/void)
  save_bill: ['billing', 'update'],
  get_bills: ['history', 'read'],
  get_bill_items: ['history', 'read'],
  void_bill: ['history', 'update'],

  // Appointments
  get_appointments: ['appointments', 'read'],
  save_appointment: ['appointments', 'update'],
  update_appointment: ['appointments', 'update'],

  // Expenses
  get_expenses: ['expenses', 'read'],
  save_expense: ['expenses', 'update'],
  update_expense: ['expenses', 'update'],
  void_expense: ['expenses', 'update'],

  // Settings (Org Settings + Sheet Setup, both live on the Settings page)
  get_org_settings: ['settings', 'read'],
  update_org_settings: ['settings', 'update'],
  // Portal visibility lives on the Permissions page, so it's governed by the
  // permissions page permission rather than settings.
  get_portal_visibility: ['permissions', 'read'],
  update_portal_visibility: ['permissions', 'update'],
  get_setup_status: ['settings', 'read'],
  run_setup: ['settings', 'update'],
  refresh_summary_sheet: ['settings', 'update']
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // ── Staff portal: own session type, handled before admin switch ────────
    const STAFF_ACTIONS = [
      'staff_login', 'staff_logout',
      'get_staff_dashboard', 'get_pending_items', 'confirm_bill_items', 'change_staff_pin',
      'log_attendance', 'get_my_attendance', 'request_advance', 'get_my_advances',
      'get_my_payslips', 'approve_my_payslip', 'get_portal_config', 'get_my_profile'
    ];
    if (STAFF_ACTIONS.includes(action)) {
      if (action !== 'staff_login') {
        const staffSession = Utils.validateStaffSession(data.sessionToken);
        if (!staffSession) {
          return Utils.createResponse('error', 'Staff session expired. Please login again.', { staffSessionExpired: true });
        }
        data.staffId = staffSession.staffId;
        data.orgId   = staffSession.orgId;
      }
      switch (action) {
        case 'staff_login':          return StaffPortal.login(data);
        case 'staff_logout':         return StaffPortal.logout(data);
        case 'get_staff_dashboard':  return StaffPortal.getDashboard(data);
        case 'get_pending_items':    return StaffPortal.getPendingItems(data);
        case 'confirm_bill_items':   return StaffPortal.confirmItems(data);
        case 'change_staff_pin':     return StaffPortal.changePin(data);
        case 'log_attendance':       return StaffPortal.logAttendance(data);
        case 'get_my_attendance':    return StaffPortal.getMyAttendance(data);
        case 'request_advance':      return StaffPortal.requestAdvance(data);
        case 'get_my_advances':      return StaffPortal.getMyAdvances(data);
        case 'get_my_payslips':      return StaffPortal.getMyPayslips(data);
        case 'approve_my_payslip':   return StaffPortal.approveMyPayslip(data);
        case 'get_portal_config':    return StaffPortal.getPortalConfig(data);
        case 'get_my_profile':       return StaffPortal.getMyProfile(data);
      }
    }

    // ── Admin app: regular session validation ──────────────────────────────
    const publicActions = ['login', 'request_password_reset', 'validate_reset_token', 'reset_password',
                           'customer_login', 'get_customer_history', 'get_customer_loyalty', 'get_loyalty_ledger'];
    if (!publicActions.includes(action)) {
      const session = Utils.validateSession(data.sessionToken);
      if (!session) {
        return Utils.createResponse('error', 'Session expired. Please login again.');
      }
      data.orgId  = session.orgId  || '';
      data.userId = session.userId || '';
      // NOTE: deliberately NOT writing session.roleId onto `data.roleId` —
      // Permissions.js already uses data.roleId for a different purpose (the
      // role being VIEWED/EDITED in the Permissions matrix screen, sent
      // explicitly by the client). Overwriting it here would silently break
      // that screen. The caller's own role for the access-control check
      // below is kept in a local variable instead.
      const callerRoleId = session.roleId || '';

      // get_organizations doubles as the lightweight "my org + descendants"
      // picker used by every add/update form's Organization field and every
      // grid's "Include sub-orgs" toggle (data.userOrgId set). That use case
      // must work for every role regardless of whether they have the
      // 'organizations' management permission — mirrors the precedent in
      // Auth.login, which already resolves orgName directly for the same
      // reason (a role without Organizations access still needs to see its
      // own org's name). The unscoped full-directory read (the actual
      // Organizations management screen, no userOrgId) still goes through
      // the normal RBAC check below.
      const isScopedOrgLookup = action === 'get_organizations' && !!data.userOrgId;

      // ── Role-based access control ────────────────────────────────────────
      // Every admin action (other than the always-allowed ones below) must be
      // tagged in ACTION_PERMISSIONS with the menu item it belongs to and
      // whether it's a read or an update (add/edit/delete). No hardcoded
      // "Owner" bypass — a role simply has every box ticked in the
      // Permissions matrix. Unmapped actions fail CLOSED (denied), not open,
      // so a new action added here without a matching entry below is a
      // build-time bug to fix, not a silent access hole.
      if (!ALWAYS_ALLOWED_ACTIONS.includes(action) && !isScopedOrgLookup) {
        const rule = ACTION_PERMISSIONS[action];
        if (!rule) {
          return Utils.createResponse('error', 'This action is not configured for access control (' + action + ').');
        }
        const [menuItemSpec, kind] = rule;
        const menuItems = Array.isArray(menuItemSpec) ? menuItemSpec : [menuItemSpec];
        const allowed = menuItems.some(menuItem => Permissions.check(callerRoleId, menuItem, kind));
        if (!allowed) {
          return Utils.createResponse('error', 'You do not have permission to perform this action.');
        }
      }
    }

    switch(action) {
      // Auth
      case 'login':
        return Auth.login(data);
      case 'logout':
        return Auth.logout(data);
      case 'request_password_reset':
        return Auth.requestPasswordReset(data);
      case 'validate_reset_token':
        return Auth.validateResetToken(data);
      case 'reset_password':
        return Auth.resetPassword(data);

      // Customers
      case 'add_customer':
        return Customers.add(data);
      case 'get_customers':
        return Customers.getAll(data);
      case 'customer_login':
        return Customers.loginByPhone(data);
      case 'get_customer_history':
        return Customers.getHistory(data);

      // Loyalty
      case 'get_loyalty_config':     return LoyaltyPoints.getConfig();
      case 'update_loyalty_config':  return LoyaltyPoints.updateConfig(data);
      case 'update_happy_hour_config': return LoyaltyPoints.updateConfig(data);
      case 'toggle_happy_hour':      return LoyaltyPoints.toggleHappyHour(data);
      case 'get_customer_loyalty':   return LoyaltyPoints.getCustomerLoyalty(data);
      case 'get_loyalty_ledger':     return LoyaltyPoints.getLedger(data);

      // Service Groups
      case 'get_service_groups':
        return ServiceGroups.getAll(data);
      case 'add_service_group':
        return ServiceGroups.add(data);
      case 'update_service_group':
        return ServiceGroups.update(data);
      case 'delete_service_group':
        return ServiceGroups.remove(data);

      // Products
      case 'get_products':
        return Products.getAll(data);
      case 'add_product':
        return Products.add(data);
      case 'update_product':
        return Products.update(data);
      case 'update_product_stock':
        return Products.updateStock(data);
      case 'delete_product':
        return Products.remove(data);
      case 'receive_stock':
        return Products.receiveStock(data);
      case 'get_stock_register':
        return Products.getRegister(data);
      case 'save_stock_audit':
        return Products.saveAudit(data);

      // Vendors
      case 'get_vendors':
        return Vendors.getAll(data);
      case 'add_vendor':
        return Vendors.add(data);
      case 'update_vendor':
        return Vendors.update(data);
      case 'remove_vendor':
        return Vendors.remove(data);

      // Purchase Orders
      case 'get_purchase_orders':
        return PurchaseOrders.getAll(data);
      case 'create_purchase_order':
        return PurchaseOrders.create(data);
      case 'update_po_status':
        return PurchaseOrders.updateStatus(data);
      case 'get_po_items':
        return PurchaseOrders.getItems(data);

      // Services
      case 'get_services':
        return Services.getAll(data);
      case 'add_service':
        return Services.add(data);
      case 'update_service':
        return Services.update(data);
      case 'delete_service':
        return Services.remove(data);

      // Staff
      case 'get_staff':
        return Staff.getAll(data);
      case 'add_staff':
        return Staff.add(data);
      case 'update_staff':
        return Staff.update(data);
      case 'delete_staff':
        return Staff.remove(data);
      case 'reset_staff_pin':
        return Staff.resetPin(data);

      // Price Books
      case 'get_pricebooks':
        return PriceBooks.getAll(data);
      case 'add_pricebook':
        return PriceBooks.add(data);
      case 'update_pricebook':
        return PriceBooks.update(data);
      case 'delete_pricebook':
        return PriceBooks.remove(data);
      case 'get_pricebook_items':
        return PriceBooks.getItems(data);
      case 'add_pricebook_item':
        return PriceBooks.addItem(data);
      case 'update_pricebook_item':
        return PriceBooks.updateItem(data);
      case 'delete_pricebook_item':
        return PriceBooks.removeItem(data);

      // Organizations
      case 'get_organizations':
        return Organizations.getAll(data);
      case 'add_organization':
        return Organizations.add(data);
      case 'update_organization':
        return Organizations.update(data);
      case 'delete_organization':
        return Organizations.remove(data);

      // Users
      case 'get_users':
        return Users.getAll(data);
      case 'add_user':
        return Users.add(data);
      case 'update_user':
        return Users.update(data);
      case 'delete_user':
        return Users.remove(data);

      // Roles
      case 'get_roles':
        return Roles.getAll();
      case 'add_role':
        return Roles.add(data);
      case 'update_role':
        return Roles.update(data);
      case 'delete_role':
        return Roles.remove(data);

      // Permissions
      case 'get_permissions':
        return Permissions.getByRole(data);
      case 'get_user_permissions':
        return Permissions.getByUser(data);
      case 'update_permissions':
        return Permissions.updateBulk(data);

      // Bills
      case 'save_bill':
        return Bills.save(data);
      case 'void_bill':
        return Bills.voidBill(data);
      case 'get_bills':
        return Bills.getAll(data);
      case 'get_bill_items':
        return Bills.getItems(data);

      // Appointments
      case 'get_appointments':
        return Appointments.getByDate(data);
      case 'save_appointment':
        return Appointments.save(data);
      case 'update_appointment':
        return Appointments.update(data);

      // Expenses
      case 'get_expenses':
        return Expenses.getAll(data);
      case 'save_expense':
        return Expenses.save(data);
      case 'update_expense':
        return Expenses.update(data);
      case 'void_expense':
        return Expenses.voidExpense(data);

      // Product Groups
      case 'get_product_groups': return ProductGroups.getAll(data);
      case 'add_product_group': return ProductGroups.add(data);
      case 'update_product_group': return ProductGroups.update(data);
      case 'delete_product_group': return ProductGroups.remove(data);

      // Incentive Profiles
      case 'get_incentive_profiles': return IncentiveProfiles.getAll(data);
      case 'add_incentive_profile': return IncentiveProfiles.add(data);
      case 'update_incentive_profile': return IncentiveProfiles.update(data);
      case 'delete_incentive_profile': return IncentiveProfiles.remove(data);

      // Org Settings
      case 'get_org_settings': return OrgSettings.get();
      case 'update_org_settings': return OrgSettings.update(data);
      case 'get_portal_visibility': return OrgSettings.getPortalVisibility();
      case 'update_portal_visibility': return OrgSettings.updatePortalVisibility(data);

      // Shifts & Attendance
      case 'get_shifts':          return Attendance.getShifts(data);
      case 'save_shift':          return Attendance.saveShift(data);
      case 'get_attendance':      return Attendance.getAttendance(data);
      case 'save_attendance':     return Attendance.saveAttendance(data);
      case 'get_week_schedule':   return WeeklySchedule.get(data);
      case 'save_week_schedule':  return WeeklySchedule.save(data);

      // Advances
      case 'get_advances': return Attendance.getAdvances(data);
      case 'add_advance': return Attendance.addAdvance(data);

      // Weekly Incentive

      // HR Approvals
      case 'get_pending_attendance': return HRApprovals.getPendingAttendance(data);
      case 'approve_attendance':     return HRApprovals.approveAttendance(data);
      case 'reject_attendance':      return HRApprovals.rejectAttendance(data);
      case 'get_pending_advances':   return HRApprovals.getPendingAdvances(data);
      case 'approve_advance':        return HRApprovals.approveAdvance(data);
      case 'disburse_advance':       return HRApprovals.disburseAdvance(data);
      case 'reject_advance':         return HRApprovals.rejectAdvance(data);

      // Payroll
      case 'upsert_payroll_from_attendance': return Payroll.upsertFromAttendance(data);
      case 'get_payroll_overrides': return Payroll.getOverrides(data);
      case 'get_payroll_summary': return Payroll.getSummaryForMonth(data);
      case 'update_payroll_row': return Payroll.updateRow(data);
      case 'get_payroll': return Payroll.getAll(data);

      // Setup / Sheet Scaffolding
      case 'get_setup_status':      return Setup.getStatus();
      case 'run_setup':             return Setup.run(data);
      case 'refresh_summary_sheet': return Setup.refreshSummary();

      default:
        return Utils.createResponse('error', 'Invalid action');
    }

  } catch(error) {
    return Utils.createResponse('error', error.toString());
  }
}
