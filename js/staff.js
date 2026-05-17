// Staff Module
const Staff = {
    editingId: null,
    
    init() {
        const form = document.getElementById('staffForm');
        const toggleBtn = document.getElementById('toggleStaffForm');
        const cancelBtn = document.getElementById('cancelStaffBtn');
        
        form.addEventListener('submit', (e) => this.handleSubmit(e));
        toggleBtn.addEventListener('click', () => this.toggleForm());
        cancelBtn.addEventListener('click', () => this.hideForm());
    },
    
    toggleForm() {
        const form = document.getElementById('staffForm');
        const toggleText = document.getElementById('staffFormToggleText');
        const isHidden = form.style.display === 'none';
        
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        
        if (!isHidden) {
            this.resetForm();
        }
    },
    
    hideForm() {
        document.getElementById('staffForm').style.display = 'none';
        document.getElementById('staffFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },
    
    resetForm() {
        this.editingId = null;
        document.getElementById('staffForm').reset();
        document.getElementById('saveStaffBtn').textContent = 'Save Staff Member';
    },
    
    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveStaffBtn');
        
        const data = {
            name: document.getElementById('staffName').value,
            phone: document.getElementById('staffPhone').value,
            email: document.getElementById('staffEmail').value,
            role: document.getElementById('staffRole').value,
            specialization: document.getElementById('staffSpecialization').value,
            status: document.getElementById('staffStatus').value
        };
        
        if (this.editingId) {
            data.id = this.editingId;
        }
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';
        
        try {
            const result = this.editingId 
                ? await API.updateStaff(data)
                : await API.addStaff(data);
            
            if (result.status === 'success') {
                UI.showMessage('staffMessage', result.message, 'success');
                this.hideForm();
                this.load();
                Dashboard.load();
            } else {
                UI.showMessage('staffMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('staffMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = this.editingId ? 'Update Staff Member' : 'Save Staff Member';
        }
    },
    
    async load() {
        const tbody = document.getElementById('staffTableBody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #a0aec0;">Loading...</td></tr>';
        
        try {
            const result = await API.getStaff();
            
            if (result.status === 'success' && result.staff.length > 0) {
                tbody.innerHTML = result.staff.map(staff => `
                    <tr>
                        <td>${staff.name}</td>
                        <td>${staff.phone}</td>
                        <td>${staff.email}</td>
                        <td>${staff.role}</td>
                        <td>${staff.specialization}</td>
                        <td><span class="status-badge status-${staff.status}">${staff.status}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn action-btn-edit" onclick="Staff.edit('${staff.id}')">Edit</button>
                                <button class="action-btn action-btn-delete" onclick="Staff.delete('${staff.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #a0aec0;">No staff members found</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #fc8181;">Error loading staff</td></tr>';
        }
    },
    
    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getStaff();
            const staff = result.staff.find(s => s.id === id);
            
            if (staff) {
                this.editingId = id;
                document.getElementById('staffName').value = staff.name;
                document.getElementById('staffPhone').value = staff.phone;
                document.getElementById('staffEmail').value = staff.email;
                document.getElementById('staffRole').value = staff.role;
                document.getElementById('staffSpecialization').value = staff.specialization;
                document.getElementById('staffStatus').value = staff.status;
                document.getElementById('saveStaffBtn').textContent = 'Update Staff Member';
                document.getElementById('staffForm').style.display = 'block';
                document.getElementById('staffFormToggleText').textContent = 'Hide Form';
                document.getElementById('staffForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (error) {
            UI.showMessage('staffMessage', 'Error loading staff member', 'error');
        } finally {
            UI.hideLoading();
        }
    },
    
    async delete(id) {
        if (!confirm('Are you sure you want to delete this staff member?')) return;
        
        UI.showLoading();
        try {
            const result = await API.deleteStaff(id);
            
            if (result.status === 'success') {
                UI.showMessage('staffMessage', result.message, 'success');
                this.load();
                Dashboard.load();
            } else {
                UI.showMessage('staffMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('staffMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
