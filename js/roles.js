const Roles = {
    editingId: null,

    init() {
        document.getElementById('roleForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('toggleRoleForm')?.addEventListener('click', () => this.toggleForm());
        document.getElementById('cancelRoleBtn')?.addEventListener('click', () => this.hideForm());
    },

    toggleForm() {
        const form = document.getElementById('roleForm');
        const toggleText = document.getElementById('roleFormToggleText');
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        if (!isHidden) this.resetForm();
    },

    hideForm() {
        document.getElementById('roleForm').style.display = 'none';
        document.getElementById('roleFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },

    resetForm() {
        this.editingId = null;
        document.getElementById('roleForm').reset();
        document.getElementById('saveRoleBtn').textContent = 'Save Role';
    },

    async load() {
        const tbody = document.getElementById('rolesTableBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        try {
            const result = await API.getRoles();
            if (result.status === 'success' && result.roles.length > 0) {
                tbody.innerHTML = result.roles.map(role => `
                    <tr>
                        <td>${role.name}</td>
                        <td>${role.description || '-'}</td>
                        <td><span class="status-badge status-${role.status}">${role.status}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn action-btn-edit" onclick="Roles.edit('${role.id}')">Edit</button>
                                <button class="action-btn action-btn-delete" onclick="Roles.delete('${role.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;">No roles found</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#fc8181;">Error loading roles</td></tr>';
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveRoleBtn');
        const data = {
            name: document.getElementById('roleName').value,
            description: document.getElementById('roleDescription').value,
            status: document.getElementById('roleStatus').value
        };
        if (this.editingId) data.id = this.editingId;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = this.editingId ? await API.updateRole(data) : await API.addRole(data);
            if (result.status === 'success') {
                UI.showMessage('roleMessage', result.message, 'success');
                this.hideForm();
                await this.load();
            } else {
                UI.showMessage('roleMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('roleMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.editingId ? 'Update Role' : 'Save Role';
        }
    },

    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getRoles();
            const role = result.roles.find(r => r.id === id);
            if (role) {
                this.editingId = id;
                document.getElementById('roleName').value = role.name;
                document.getElementById('roleDescription').value = role.description || '';
                document.getElementById('roleStatus').value = role.status;
                document.getElementById('saveRoleBtn').textContent = 'Update Role';
                document.getElementById('roleForm').style.display = 'block';
                document.getElementById('roleFormToggleText').textContent = 'Hide Form';
                document.getElementById('roleForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {
            UI.showMessage('roleMessage', 'Error loading role', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async delete(id) {
        if (!confirm('Are you sure you want to delete this role? Users with this role will lose access.')) return;
        UI.showLoading();
        try {
            const result = await API.deleteRole(id);
            if (result.status === 'success') {
                UI.showMessage('roleMessage', result.message, 'success');
                await this.load();
            } else {
                UI.showMessage('roleMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('roleMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
