// Customers Module
const Customers = {
    init() {
        document.getElementById('customerForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
    },
    
    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveCustomerBtn');
        
        const name = document.getElementById('customerName').value;
        const phone = document.getElementById('customerPhone').value;
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';
        
        try {
            const result = await API.addCustomer({ name, phone, submittedBy: Auth.currentUser?.fullName || 'Unknown' });
            
            if (result.status === 'success') {
                UI.showMessage('customerMessage', result.message, 'success');
                document.getElementById('customerForm').reset();
                this.load();
            } else {
                UI.showMessage('customerMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('customerMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Add Customer';
        }
    },
    
    async load() {
        const tbody = document.getElementById('customersTableBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #a0aec0;">Loading...</td></tr>';
        
        try {
            const result = await API.getCustomers();
            
            if (result.status === 'success' && result.customers.length > 0) {
                tbody.innerHTML = result.customers.map(customer => {
                    const date = new Date(customer.timestamp);
                    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    return `
                        <tr>
                            <td>${formattedDate}</td>
                            <td>${customer.name}</td>
                            <td>${customer.phone}</td>
                            <td>${customer.addedBy}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #a0aec0;">No customers found</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #fc8181;">Error loading customers</td></tr>';
        }
    }
};
