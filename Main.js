// Actions any authenticated admin user may call regardless of their role's
// permission matrix. 'change_own_password' is reserved for a future
// self-service password change action (not yet implemented) so it stays
// ungated the moment it's added.
const ALWAYS_ALLOWED_ACTIONS = ['logout', 'change_own_password'];

// action -> [menuItem, 'read' | 'update']. 'update' covers add/edit/delete.
// Menu items are page-level, matching the sidebar/pages/*.html structure.
// Public actions (see publicActions below) and staff-portal actions (see
// STAFF_ACTIONS) are authenticated by a different mechanism and are not
// listed here.
const ACTION_PERMISSIONS = {
  // Customers
  get_customers: ['customers', 'read'],
  add_customer: ['customers', 'update'],

  // Loyalty (configured from the Customers page)
  get_loyalty_config: ['customers', 'read'],
  update_loyalty_config: ['customers', 'update'],
  toggle_happy_hour: ['customers', 'update'],

  // Service Groups / Services / Price Books (all under the Services page)
  get_service_groups: ['services', 'read'],
  add_service_group: ['services', 'update'],
  update_service_group: ['services', 'update'],
  delete_service_group: ['services', 'update'],
  get_services: ['services', 'read'],
  add_service: ['services', 'update'],
  update_service: ['services', 'update'],
  delete_service: ['services', 'update'],
  get_pricebooks: ['services', 'read'],
  add_pricebook: ['services', 'update'],
  update_pricebook: ['services', 'update'],
  delete_pricebook: ['services', 'update'],
  get_pricebook_items: ['services', 'read'],
  add_pricebook_item: ['services', 'update'],
  update_pricebook_item: ['services', 'update'],
  delete_pricebook_item: ['services', 'update'],

  // Products, Product Groups, Purchase Orders, Stock (all under the Products page)
  get_products: ['products', 'read'],
  add_product: ['products', 'update'],
  update_product: ['products', 'update'],
  update_product_stock: ['products', 'update'],
  delete_product: ['products', 'update'],
  receive_stock: ['products', 'update'],
  get_stock_register: ['products', 'read'],
  save_stock_audit: ['products', 'update'],
  get_product_groups: ['products', 'read'],
  add_product_group: ['products', 'update'],
  update_product_group: ['products', 'update'],
  delete_product_group: ['products', 'update'],
  get_purchase_orders: ['products', 'read'],
  create_purchase_order: ['products', 'update'],
  update_po_status: ['products', 'update'],
  get_po_items: ['products', 'read'],

  // Vendors (its own sidebar page)
  get_vendors: ['vendors', 'read'],
  add_vendor: ['vendors', 'update'],
  update_vendor: ['vendors', 'update'],
  remove_vendor: ['vendors', 'update'],

  // Staff, Incentive Profiles, Shifts, Schedule, Attendance, Advances,
  // Weekly Incentive, Payroll (all tabs under the Staff page)
  get_staff: ['staff', 'read'],
  add_staff: ['staff', 'update'],
  update_staff: ['staff', 'update'],
  delete_staff: ['staff', 'update'],
  get_incentive_profiles: ['staff', 'read'],
  add_incentive_profile: ['staff', 'update'],
  update_incentive_profile: ['staff', 'update'],
  delete_incentive_profile: ['staff', 'update'],
  get_shifts: ['staff', 'read'],
  save_shift: ['staff', 'update'],
  get_attendance: ['staff', 'read'],
  save_attendance: ['staff', 'update'],
  get_week_schedule: ['staff', 'read'],
  save_week_schedule: ['staff', 'update'],
  get_advances: ['staff', 'read'],
  add_advance: ['staff', 'update'],
  save_weekly_incentive: ['staff', 'update'],
  get_weekly_incentives: ['staff', 'read'],
  calculate_payroll: ['staff', 'read'],
  save_payroll: ['staff', 'update'],
  get_payroll: ['staff', 'read'],
  update_payroll_status: ['staff', 'update'],

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
      'log_attendance', 'get_my_attendance', 'request_advance', 'get_my_advances'
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

      // ── Role-based access control ────────────────────────────────────────
      // Every admin action (other than the always-allowed ones below) must be
      // tagged in ACTION_PERMISSIONS with the menu item it belongs to and
      // whether it's a read or an update (add/edit/delete). No hardcoded
      // "Owner" bypass — a role simply has every box ticked in the
      // Permissions matrix. Unmapped actions fail CLOSED (denied), not open,
      // so a new action added here without a matching entry below is a
      // build-time bug to fix, not a silent access hole.
      if (!ALWAYS_ALLOWED_ACTIONS.includes(action)) {
        const rule = ACTION_PERMISSIONS[action];
        if (!rule) {
          return Utils.createResponse('error', 'This action is not configured for access control (' + action + ').');
        }
        const [menuItem, kind] = rule;
        if (!Permissions.check(callerRoleId, menuItem, kind)) {
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
      case 'save_weekly_incentive': return Attendance.saveWeeklyIncentive(data);
      case 'get_weekly_incentives': return Attendance.getWeeklyIncentives(data);

      // HR Approvals
      case 'get_pending_attendance': return HRApprovals.getPendingAttendance(data);
      case 'approve_attendance':     return HRApprovals.approveAttendance(data);
      case 'reject_attendance':      return HRApprovals.rejectAttendance(data);
      case 'get_pending_advances':   return HRApprovals.getPendingAdvances(data);
      case 'approve_advance':        return HRApprovals.approveAdvance(data);
      case 'disburse_advance':       return HRApprovals.disburseAdvance(data);
      case 'reject_advance':         return HRApprovals.rejectAdvance(data);

      // Payroll
      case 'calculate_payroll': return Payroll.calculate(data);
      case 'save_payroll': return Payroll.save(data);
      case 'get_payroll': return Payroll.getAll(data);
      case 'update_payroll_status': return Payroll.updateStatus(data);

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
