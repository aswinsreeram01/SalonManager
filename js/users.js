const Users = {
    editingId: null,
    roles: [],
    orgs: [],

    init() {
        document.getElementById('userForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('toggleUserForm').addEventListener('click', () => this.toggleForm());
        document.getElementById('cancelUserBtn').addEventListener('click', () => this.hideForm());
    },

    toggleForm() {
        const form = document.getElementById('userForm');
        const toggleText = document.getElementById('userFormToggleText');
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        if (!isHidden) this.resetForm();
    },

    hideForm() {
        document.getElementById('userForm').style.display = 'none';
        document.getElementById('userFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },

    resetForm() {
        this.editingId = null;
        document.getElementById('userForm').reset();
        document.getElementById('saveUserBtn').textContent = 'Save User';
        document.getElementById('userPasswordHint').textContent = '(required)';
        document.getElementById('selfEditWarning').style.display = 'none';
        document.getElementById('userRole').disabled = false;
        document.getElementById('userStatus').disabled = false;
    },

    async load() {
        await Promise.all([this.loadDropdowns(), this.loadUsers()]);
    },

    async loadDropdowns() {
        try {
            const [rolesResult, orgsResult] = await Promise.all([
                API.getRoles(),
                API.getOrganizations(Auth.currentUser.orgId)
            ]);
            if (rolesResult.status === 'success') this.roles = rolesResult.roles;
            if (orgsResult.status === 'success') this.orgs = orgsResult.organizations;
            this.populateDropdowns();
        } catch (e) {
            console.error('Error loading dropdowns:', e);
        }
    },

    populateDropdowns() {
        document.getElementById('userRole').innerHTML =
            '<option value="">Select Role</option>' +
            this.roles.filter(r => r.status === 'active')
                .map(r => `<option value="${r.id}">${r.name}</option>`).join('');

        document.getElementById('userOrg').innerHTML =
            '<option value="">Select Organization</option>' +
            this.orgs.filter(o => o.status === 'active')
                .map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    },

    getRoleName(roleId) {
        const role = this.roles.find(r => r.id === roleId);
        return role ? role.name : roleId || '-';
    },

    getOrgName(orgId) {
        const org = this.orgs.find(o => o.id === orgId);
        return org ? org.name : orgId || '-';
    },

    async loadUsers() {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        try {
            const result = await API.getUsers(Auth.currentUser.orgId);
            if (result.status === 'success' && result.users.length > 0) {
                tbody.innerHTML = result.users.map(user => `
                    <tr>
                        <td>${user.fullName}</td>
                        <td>${user.email}</td>
                        <td>${this.getRoleName(user.roleId)}</td>
                        <td>${this.getOrgName(user.orgId)}</td>
                        <td><span class="status-badge status-${user.status}">${user.status}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn action-btn-edit" onclick="Users.edit('${user.id}')">Edit</button>
                                ${user.id !== Auth.currentUser.userId
                                    ? `<button class="action-btn action-btn-delete" onclick="Users.delete('${user.id}')">Delete</button>`
                                    : ''}
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;">No users found</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#fc8181;">Error loading users</td></tr>';
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveUserBtn');
        const password = document.getElementById('userPassword').value;

        if (!this.editingId && !password) {
            UI.showMessage('userMessage', 'Password is required for new users', 'error');
            return;
        }

        const data = {
            fullName: document.getElementById('userFullName').value,
            email: document.getElementById('userEmail').value,
            phone: document.getElementById('userPhone').value,
            whatsapp: document.getElementById('userWhatsapp').value,
            orgId: document.getElementById('userOrg').value,
            roleId: document.getElementById('userRole').value,
            status: document.getElementById('userStatus').value
        };
        if (password) data.password = password;
        if (this.editingId) data.id = this.editingId;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = this.editingId ? await API.updateUser(data) : await API.addUser(data);
            if (result.status === 'success') {
                UI.showMessage('userMessage', result.message, 'success');
                this.hideForm();
                await this.loadUsers();
            } else {
                UI.showMessage('userMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('userMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.editingId ? 'Update User' : 'Save User';
        }
    },

    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getUsers(Auth.currentUser.orgId);
            const user = result.users.find(u => u.id === id);
            if (user) {
                this.editingId = id;
                document.getElementById('userFullName').value = user.fullName;
                document.getElementById('userEmail').value = user.email;
                document.getElementById('userPassword').value = '';
                document.getElementById('userPhone').value = user.phone || '';
                document.getElementById('userWhatsapp').value = user.whatsapp || '';
                document.getElementById('userOrg').value = user.orgId || '';
                document.getElementById('userRole').value = user.roleId || '';
                document.getElementById('userStatus').value = user.status;
                document.getElementById('saveUserBtn').textContent = 'Update User';
                document.getElementById('userPasswordHint').textContent = '(leave blank to keep current)';

                if (id === Auth.currentUser.userId) {
                    document.getElementById('selfEditWarning').style.display = 'block';
                    document.getElementById('userRole').disabled = true;
                    document.getElementById('userStatus').disabled = true;
                }

                document.getElementById('userForm').style.display = 'block';
                document.getElementById('userFormToggleText').textContent = 'Hide Form';
                document.getElementById('userForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {
            UI.showMessage('userMessage', 'Error loading user', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async delete(id) {
        if (!confirm('Are you sure you want to delete this user?')) return;
        UI.showLoading();
        try {
            const result = await API.deleteUser(id);
            if (result.status === 'success') {
                UI.showMessage('userMessage', result.message, 'success');
                await this.loadUsers();
            } else {
                UI.showMessage('userMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('userMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
