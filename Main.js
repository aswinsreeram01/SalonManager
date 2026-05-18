function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    const publicActions = ['login', 'request_password_reset', 'validate_reset_token', 'reset_password'];
    if (!publicActions.includes(action)) {
      const userId = Utils.validateSession(data.sessionToken);
      if (!userId) {
        return Utils.createResponse('error', 'Session expired. Please login again.');
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

      // Service Groups
      case 'get_service_groups':
        return ServiceGroups.getAll(data);
      case 'add_service_group':
        return ServiceGroups.add(data);
      case 'update_service_group':
        return ServiceGroups.update(data);
      case 'delete_service_group':
        return ServiceGroups.remove(data);
      
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
      
      default:
        return Utils.createResponse('error', 'Invalid action');
    }
    
  } catch(error) {
    return Utils.createResponse('error', error.toString());
  }
}