// API Service - All backend communication
const API = {
    async call(action, data = {}) {
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({ action, ...data })
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    // Auth
    login(username, password) {
        return this.call('login', { username, password });
    },
    
    // Customers
    addCustomer(name, phone, submittedBy) {
        return this.call('add_customer', { name, phone, submittedBy });
    },
    
    getCustomers() {
        return this.call('get_customers');
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
    }
};
