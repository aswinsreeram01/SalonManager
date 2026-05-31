function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // ── Staff portal: own session type, handled before admin switch ────────
    const STAFF_ACTIONS = [
      'staff_login', 'staff_logout',
      'get_staff_dashboard', 'get_pending_items', 'confirm_bill_items', 'change_staff_pin'
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
      }
    }

    // ── Admin app: regular session validation ──────────────────────────────
    const publicActions = ['login', 'request_password_reset', 'validate_reset_token', 'reset_password'];
    if (!publicActions.includes(action)) {
      const session = Utils.validateSession(data.sessionToken);
      if (!session) {
        return Utils.createResponse('error', 'Session expired. Please login again.');
      }
      data.orgId  = session.orgId  || '';
      data.userId = session.userId || '';
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
        return Vendors.getAll();
      case 'add_vendor':
        return Vendors.add(data);
      case 'update_vendor':
        return Vendors.update(data);
      case 'remove_vendor':
        return Vendors.remove(data);

      // Purchase Orders
      case 'get_purchase_orders':
        return PurchaseOrders.getAll();
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
        return Expenses.getAll();
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
      case 'get_shifts': return Attendance.getShifts();
      case 'save_shift': return Attendance.saveShift(data);
      case 'get_allocations': return Attendance.getAllocations(data);
      case 'save_allocation': return Attendance.saveAllocation(data);
      case 'get_attendance': return Attendance.getAttendance(data);
      case 'save_attendance': return Attendance.saveAttendance(data);

      // Advances
      case 'get_advances': return Attendance.getAdvances(data);
      case 'add_advance': return Attendance.addAdvance(data);

      // Weekly Incentive
      case 'save_weekly_incentive': return Attendance.saveWeeklyIncentive(data);
      case 'get_weekly_incentives': return Attendance.getWeeklyIncentives(data);

      // Payroll
      case 'calculate_payroll': return Payroll.calculate(data);
      case 'save_payroll': return Payroll.save(data);
      case 'get_payroll': return Payroll.getAll(data);
      case 'update_payroll_status': return Payroll.updateStatus(data);

      // Setup / Sheet Scaffolding
      case 'get_setup_status': return Setup.getStatus();
      case 'run_setup':        return Setup.run(data);

      default:
        return Utils.createResponse('error', 'Invalid action');
    }

  } catch(error) {
    return Utils.createResponse('error', error.toString());
  }
}
