const Permissions = {
    // Page-level menu items — one entry per sidebar page. Dashboard is
    // intentionally omitted: it's always accessible (see Main.js
    // ALWAYS_ALLOWED_ACTIONS) since it has no dedicated backend action of
    // its own (it reads from Staff/Billing, which are gated separately).
    menuItems: [
        { key: 'billing',       label: 'Billing' },
        { key: 'history',       label: 'Bill History' },
        { key: 'appointments',  label: 'Appointments' },
        { key: 'expenses',      label: 'Expenses' },
        { key: 'services',      label: 'Services (Groups, Catalog, Price Books)' },
        { key: 'products',      label: 'Products (Groups, Stock, Purchase Orders)' },
        { key: 'vendors',       label: 'Vendors' },
        { key: 'staff',         label: 'Staff (Profiles, Shifts, Attendance, Payroll)' },
        { key: 'hrapprovals',   label: 'HR Approvals' },
        { key: 'customers',     label: 'Customers' },
        { key: 'organizations', label: 'Organizations' },
        { key: 'users',         label: 'Users' },
        { key: 'roles',         label: 'Roles' },
        { key: 'permissions',   label: 'Permissions' },
        { key: 'settings',      label: 'Settings (Loyalty, Sheet Setup)' },
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
                // No entry yet = deny (fail closed) — matches server-side enforcement.
                const canRead   = perm ? (perm.canRead === true || perm.canRead === 'TRUE') : false;
                const canUpdate = perm ? (perm.canUpdate === true || perm.canUpdate === 'TRUE') : false;
                return `
                    <tr>
                        <td style="font-weight:500;">${item.label}</td>
                        <td style="text-align:center;">
                            <label class="toggle">
                                <input type="checkbox" data-menu="${item.key}" data-kind="read" ${canRead ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </td>
                        <td style="text-align:center;">
                            <label class="toggle">
                                <input type="checkbox" data-menu="${item.key}" data-kind="update" ${canUpdate ? 'checked' : ''}>
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

        const byMenu = {};
        document.querySelectorAll('#permMatrixBody input[type="checkbox"]').forEach(cb => {
            const menu = cb.dataset.menu;
            if (!byMenu[menu]) byMenu[menu] = { menuItem: menu, canRead: false, canUpdate: false };
            if (cb.dataset.kind === 'read') byMenu[menu].canRead = cb.checked;
            else byMenu[menu].canUpdate = cb.checked;
        });
        const permissions = Object.values(byMenu);

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
