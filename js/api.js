// API Service - All backend communication
const API = {
    async call(action, data = {}) {
        try {
            const token = localStorage.getItem('sessionToken');
            const body = { action, ...data };
            if (token) body.sessionToken = token;

            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const result = await response.json();

            if (result.status === 'error' && result.message === 'Session expired. Please login again.') {
                UI.handleExpiredSession();
                throw new Error(result.message);
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
      
	// Authentication
	login(email, password) {
		return this.call('login', { email, password });
	},

	logout() {
		return this.call('logout');
	},
	
	requestPasswordReset(email) {
		return this.call('request_password_reset', { email });
	},
	
	validateResetToken(token) {
		return this.call('validate_reset_token', { token });
	},
	
	resetPassword(token, newPassword) {
		return this.call('reset_password', { token, newPassword });
	},
	
	// Organizations
	getOrganizations(userOrgId) {
		return this.call('get_organizations', { userOrgId });
	},
	
	addOrganization(data) {
		return this.call('add_organization', data);
	},
	
	updateOrganization(data) {
		return this.call('update_organization', data);
	},
	
	deleteOrganization(id) {
		return this.call('delete_organization', { id });
	},

	// Users
	getUsers(userOrgId) {
		return this.call('get_users', { userOrgId });
	},
	
	addUser(data) {
		return this.call('add_user', data);
	},
	
	updateUser(data) {
		return this.call('update_user', data);
	},
	
	deleteUser(id) {
		return this.call('delete_user', { id });
	},
	
	// Roles
	getRoles() {
		return this.call('get_roles');
	},
	
	addRole(data) {
		return this.call('add_role', data);
	},
	
	updateRole(data) {
		return this.call('update_role', data);
	},
	
	deleteRole(id) {
		return this.call('delete_role', { id });
	},
	
	// Permissions
	getPermissions(roleId) {
		return this.call('get_permissions', { roleId });
	},
	
	getUserPermissions(userId) {
		return this.call('get_user_permissions', { userId });
	},
	
	updatePermissions(roleId, permissions) {
		return this.call('update_permissions', { roleId, permissions });
	},

	// Products
	getProducts() {
		return this.call('get_products');
	},

	addProduct(data) {
		return this.call('add_product', data);
	},

	updateProduct(data) {
		return this.call('update_product', data);
	},

	updateProductStock(id, currentStock) {
		return this.call('update_product_stock', { id, currentStock });
	},

	deleteProduct(id) {
		return this.call('delete_product', { id });
	},

	// Service Groups
	getServiceGroups() {
		return this.call('get_service_groups');
	},

	addServiceGroup(data) {
		return this.call('add_service_group', data);
	},

	updateServiceGroup(data) {
		return this.call('update_service_group', data);
	},

	deleteServiceGroup(id) {
		return this.call('delete_service_group', { id });
	},

	// Customers
	getCustomers() {
		return this.call('get_customers');
	},

	addCustomer(data) {
		return this.call('add_customer', data);
	},
    
    // Services
    getServices() {
        return this.call('get_services');
    },
    
    addService(data) {
        return this.call('add_service', data);
    },
    
    updateService(data) {
        return this.call('update_service', data);
    },
    
    deleteService(id) {
        return this.call('delete_service', { id });
    },
    
    // Staff
    getStaff() {
        return this.call('get_staff');
    },
    
    addStaff(data) {
        return this.call('add_staff', data);
    },
    
    updateStaff(data) {
        return this.call('update_staff', data);
    },
    
    deleteStaff(id) {
        return this.call('delete_staff', { id });
    },
    
    // Price Books
    getPriceBooks() {
        return this.call('get_pricebooks');
    },
    
    addPriceBook(data) {
        return this.call('add_pricebook', data);
    },
    
    updatePriceBook(data) {
        return this.call('update_pricebook', data);
    },
    
    deletePriceBook(id) {
        return this.call('delete_pricebook', { id });
    },
    
    // Price Book Items
    getPriceBookItems(priceBookId) {
        return this.call('get_pricebook_items', { priceBookId });
    },
    
    addPriceBookItem(data) {
        return this.call('add_pricebook_item', data);
    },
    
    updatePriceBookItem(data) {
        return this.call('update_pricebook_item', data);
    },
    
    deletePriceBookItem(itemId) {
        return this.call('delete_pricebook_item', { itemId });
    },

    // Bills
    saveBill(data) {
        return this.call('save_bill', data);
    },

    voidBill(billId) {
        return this.call('void_bill', { billId });
    },

    getBills() {
        return this.call('get_bills');
    },

    getBillItems(billId) {
        return this.call('get_bill_items', { billId });
    },

    // Appointments
    getAppointments(date) {
        return this.call('get_appointments', { date });
    },

    saveAppointment(data) {
        return this.call('save_appointment', data);
    },

    updateAppointment(data) {
        return this.call('update_appointment', data);
    },

    // Expenses
    getExpenses() {
        return this.call('get_expenses');
    },

    saveExpense(data) {
        return this.call('save_expense', data);
    },

    updateExpense(data) {
        return this.call('update_expense', data);
    },

    voidExpense(expenseId) {
        return this.call('void_expense', { expenseId });
    },

    // Vendors
    getVendors() {
        return this.call('get_vendors');
    },

    addVendor(data) {
        return this.call('add_vendor', data);
    },

    updateVendor(data) {
        return this.call('update_vendor', data);
    },

    removeVendor(vendorId) {
        return this.call('remove_vendor', { vendorId });
    },

    // Purchase Orders
    getPurchaseOrders() {
        return this.call('get_purchase_orders');
    },

    createPurchaseOrder(data) {
        return this.call('create_purchase_order', data);
    },

    updatePOStatus(poId, status, notes) {
        return this.call('update_po_status', { poId, status, notes: notes || '' });
    },

    getPOItems(poId) {
        return this.call('get_po_items', { poId });
    },

    // Stock operations
    receiveStock(data) {
        return this.call('receive_stock', data);
    },

    getStockRegister(productId) {
        return this.call('get_stock_register', productId ? { productId } : {});
    },

    saveStockAudit(data) {
        return this.call('save_stock_audit', data);
    }
};
