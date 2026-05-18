const Permissions = {
    menuItems: [
        { key: 'dashboard',     label: 'Dashboard' },
        { key: 'servicegroups', label: 'Service Groups' },
        { key: 'services',      label: 'Service Catalog' },
        { key: 'pricebooks',    label: 'Price Books' },
        { key: 'products',      label: 'Products Inventory' },
        { key: 'staff',         label: 'Staff' },
        { key: 'customers',     label: 'Customers' },
        { key: 'billing',       label: 'New Bill' },
        { key: 'appointments',  label: 'Book Appointment' },
        { key: 'users',         label: 'Users' },
        { key: 'roles',         label: 'Roles' },
        { key: 'permissions',   label: 'Permissions' },
        { key: 'organizations', label: 'Organizations' },
    ],

    init() {
        document.getElementById('permRoleSelect').addEventListener('change', () => this.loadMatrix());
        document.getElementById('savePermissionsBtn').addEventListener('click', () => this.save());
    },

    async load() {
        document.getElementById('permMatrix').style.display = 'none';
        try {
            const result = await API.getRoles();
            const select = document.getElementById('permRoleSelect');
            const current = select.value;
            select.innerHTML = '<option value="">Choose a role to manage...</option>';
            if (result.status === 'success') {
                result.roles.filter(r => r.status === 'active').forEach(role => {
                    select.innerHTML += `<option value="${role.id}">${role.name}</option>`;
                });
            }
            // Restore selection if still valid
            if (current) {
                select.value = current;
                if (select.value) await this.loadMatrix();
            }
        } catch (e) {
            console.error('Error loading roles for permissions:', e);
        }
    },

    async loadMatrix() {
        const roleId = document.getElementById('permRoleSelect').value;
        if (!roleId) {
            document.getElementById('permMatrix').style.display = 'none';
            return;
        }
        UI.showLoading();
        try {
            const result = await API.getPermissions(roleId);
            const existing = result.status === 'success' ? result.permissions : [];

            document.getElementById('permMatrixBody').innerHTML = this.menuItems.map(item => {
                const perm = existing.find(p => p.menuItem === item.key);
                // Default to true (allow) if no permission entry exists yet
                const checked = perm ? (perm.canAccess === true || perm.canAccess === 'TRUE') : true;
                return `
                    <tr>
                        <td style="font-weight:500;">${item.label}</td>
                        <td>
                            <label class="toggle">
                                <input type="checkbox" data-menu="${item.key}" ${checked ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </td>
                    </tr>
                `;
            }).join('');

            document.getElementById('permMatrix').style.display = 'block';
        } catch (e) {
            UI.showMessage('permissionMessage', 'Error loading permissions', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async save() {
        const roleId = document.getElementById('permRoleSelect').value;
        if (!roleId) return;

        const permissions = Array.from(
            document.querySelectorAll('#permMatrixBody input[type="checkbox"]')
        ).map(cb => ({ menuItem: cb.dataset.menu, canAccess: cb.checked }));

        const saveBtn = document.getElementById('savePermissionsBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = await API.updatePermissions(roleId, permissions);
            if (result.status === 'success') {
                UI.showMessage('permissionMessage', 'Permissions saved successfully', 'success');
            } else {
                UI.showMessage('permissionMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('permissionMessage', 'Network error', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Permissions';
        }
    }
};
