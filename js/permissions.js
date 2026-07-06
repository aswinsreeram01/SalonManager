const Permissions = {
    // Page-level menu items — one entry per sidebar page. Dashboard is
    // intentionally omitted: it's always accessible (see Main.js
    // ALWAYS_ALLOWED_ACTIONS) since it has no dedicated backend action of
    // its own (it reads from Staff/Billing, which are gated separately).
    //
    // Pages with tabs carry a `tabs` array instead of their own Read/Update
    // checkboxes — permissions for those are set per tab (composite
    // 'page:tab' keys), so a role can be granted every tab under Staff & HR
    // except Payroll, for example. Tabs marked "also used by ..." are read
    // by another page too (e.g. Billing needs Products + Price Books data)
    // — removing read access there can break that other page for this role.
    menuItems: [
        { key: 'billing',       label: 'Billing' },
        { key: 'history',       label: 'Bill History' },
        { key: 'appointments',  label: 'Appointments' },
        { key: 'expenses',      label: 'Expenses' },
        { key: 'services', label: 'Services', tabs: [
            { key: 'svc-groups',     label: 'Service Groups' },
            { key: 'svc-catalog',    label: 'Service Catalog (also used by Billing)' },
            { key: 'svc-pricebooks', label: 'Price Books (also used by Billing)' },
        ]},
        { key: 'products', label: 'Products', tabs: [
            { key: 'product-groups', label: 'Product Groups (also used by Billing)' },
            { key: 'products',       label: 'Products (also used by Billing)' },
            { key: 'vendors',        label: 'Vendors' },
            { key: 'purchase-orders',label: 'Purchase Orders' },
            { key: 'receive-stock',  label: 'Receive Stock' },
            { key: 'stock-register', label: 'Stock Register' },
            { key: 'stock-audit',    label: 'Stock Audit' },
        ]},
        { key: 'staff', label: 'Staff & HR', tabs: [
            { key: 'hr-staff',      label: 'Staff (also used by Billing/Appointments/Dashboard)' },
            { key: 'hr-advances',   label: 'Advances' },
            { key: 'hr-shifts',     label: 'Shifts' },
            { key: 'hr-attendance', label: 'Attendance & OT' },
            { key: 'hr-quickentry', label: 'Quick Entry' },
            { key: 'hr-payroll',    label: 'Payroll (also covers its Staff Salary and Comp Plans sub-tabs)' },
        ]},
        { key: 'hrapprovals',   label: 'HR Approvals' },
        { key: 'customers', label: 'Customers', tabs: [
            { key: 'cust-list',      label: 'Customers (also used by Billing/Appointments)' },
            { key: 'cust-loyalty',   label: 'Loyalty Programme' },
            { key: 'cust-happyhour', label: 'Happy Hour' },
        ]},
        { key: 'organizations', label: 'Organizations' },
        { key: 'users',         label: 'Users' },
        { key: 'roles',         label: 'Roles' },
        { key: 'permissions',   label: 'Permissions' },
        { key: 'settings',      label: 'Settings (Sheet Setup)' },
    ],

    // Staff Portal tabs / Customer Portal sections the admin can toggle.
    // Keys must match OrgSettings.STAFF_PORTAL_TABS / CUSTOMER_PORTAL_SECTIONS
    // on the backend and the ids the two portals use.
    staffPortalTabs: [
        { key: 'records',    label: 'My Records' },
        { key: 'pending',    label: 'Pending Confirmation' },
        { key: 'attendance', label: 'Attendance' },
        { key: 'advance',    label: 'Advance' },
        { key: 'payslips',   label: 'Payslips' },
    ],
    customerPortalSections: [
        { key: 'loyalty',   label: 'Loyalty Card (Gems & tier)' },
        { key: 'summary',   label: 'Visit Summary (visits / spend / savings)' },
        { key: 'lastVisit', label: 'Last Visit' },
        { key: 'history',   label: 'All Visits (history)' },
    ],

    init() {
        document.getElementById('permRoleSelect').addEventListener('change', () => this.loadMatrix());
        document.getElementById('savePermissionsBtn').addEventListener('click', () => this.save());
        document.querySelectorAll('#permissions .sub-tab').forEach(btn =>
            btn.addEventListener('click', () => this._switchSubTab(btn.dataset.subtab)));
        document.getElementById('savePortalStaffBtn').addEventListener('click', () => this.savePortalVisibility('staff'));
        document.getElementById('savePortalCustBtn').addEventListener('click', () => this.savePortalVisibility('customer'));
    },

    _switchSubTab(subtab) {
        document.querySelectorAll('#permissions .sub-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.subtab === subtab));
        document.querySelectorAll('#permissions .sub-tab-panel').forEach(p =>
            p.classList.toggle('active', p.id === 'sub-tab-' + subtab));
    },

    async load() {
        document.getElementById('permMatrix').style.display = 'none';
        this.loadPortalVisibility();
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

            const rowFor = (menuKey, label, indent) => {
                const perm = existing.find(p => p.menuItem === menuKey);
                // No entry yet = deny (fail closed) — matches server-side enforcement.
                const canRead   = perm ? (perm.canRead === true || perm.canRead === 'TRUE') : false;
                const canUpdate = perm ? (perm.canUpdate === true || perm.canUpdate === 'TRUE') : false;
                return `
                    <tr>
                        <td style="font-weight:500;${indent ? 'padding-left:32px;font-weight:400;' : ''}">${label}</td>
                        <td style="text-align:center;">
                            <label class="toggle">
                                <input type="checkbox" data-menu="${menuKey}" data-kind="read" ${canRead ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </td>
                        <td style="text-align:center;">
                            <label class="toggle">
                                <input type="checkbox" data-menu="${menuKey}" data-kind="update" ${canUpdate ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </td>
                    </tr>
                `;
            };

            document.getElementById('permMatrixBody').innerHTML = this.menuItems.map(item => {
                if (!item.tabs) return rowFor(item.key, item.label, false);
                const groupHeader = `
                    <tr>
                        <td colspan="3" style="font-weight:700;color:#2d3748;background:#f7fafc;padding-top:12px;">${item.label}</td>
                    </tr>`;
                const tabRows = item.tabs.map(tab => rowFor(`${item.key}:${tab.key}`, tab.label, true)).join('');
                return groupHeader + tabRows;
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
    },

    // ── Portal visibility (Staff Portal / Customer Portal sub-tabs) ─────────

    async loadPortalVisibility() {
        try {
            const res = await API.getPortalVisibility();
            const staffOn = (res.status === 'success' && Array.isArray(res.staffTabs))
                ? res.staffTabs : this.staffPortalTabs.map(t => t.key);
            const custOn = (res.status === 'success' && Array.isArray(res.customerSections))
                ? res.customerSections : this.customerPortalSections.map(s => s.key);
            this._renderPortalToggles('permStaffTabsList', this.staffPortalTabs, staffOn);
            this._renderPortalToggles('permCustSectionsList', this.customerPortalSections, custOn);
        } catch (e) {
            document.getElementById('permStaffTabsList').innerHTML =
                '<p class="muted" style="color:#fc8181;">Failed to load portal settings.</p>';
            document.getElementById('permCustSectionsList').innerHTML =
                '<p class="muted" style="color:#fc8181;">Failed to load portal settings.</p>';
        }
    },

    _renderPortalToggles(containerId, defs, enabledKeys) {
        document.getElementById(containerId).innerHTML = defs.map(d => `
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;">
                <span style="font-size:14px;color:#2d3748;">${d.label}</span>
                <label class="toggle" style="margin:0;">
                    <input type="checkbox" data-portal-key="${d.key}" ${enabledKeys.includes(d.key) ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </label>
        `).join('');
    },

    async savePortalVisibility(kind) {
        const containerId = kind === 'staff' ? 'permStaffTabsList' : 'permCustSectionsList';
        const btn = document.getElementById(kind === 'staff' ? 'savePortalStaffBtn' : 'savePortalCustBtn');
        const enabled = [...document.querySelectorAll(`#${containerId} input[data-portal-key]:checked`)]
            .map(cb => cb.dataset.portalKey);

        if (!enabled.length) {
            UI.showMessage('permissionMessage',
                kind === 'staff' ? 'At least one staff portal tab must remain enabled.'
                                 : 'At least one customer portal section must remain enabled.', 'error');
            return;
        }

        btn.disabled = true;
        const orig = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span>Saving...';
        try {
            const payload = kind === 'staff' ? { staffTabs: enabled } : { customerSections: enabled };
            const res = await API.updatePortalVisibility(payload);
            if (res.status === 'success') {
                UI.showMessage('permissionMessage', 'Portal visibility saved — applies on the next portal sign-in.', 'success');
            } else {
                UI.showMessage('permissionMessage', res.message || 'Error saving portal visibility', 'error');
            }
        } catch (e) {
            UI.showMessage('permissionMessage', 'Network error saving portal visibility', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    }
};
