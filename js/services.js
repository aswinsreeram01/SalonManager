const Services = {
    editingId: null,
    serviceGroups: [],
    _orgs: [],

    init() {
        document.getElementById('serviceForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('toggleServiceForm')?.addEventListener('click', () => this.toggleForm());
        document.getElementById('cancelServiceBtn')?.addEventListener('click', () => this.hideForm());
        document.getElementById('serviceIncludeChildren')?.addEventListener('change', () => this.load());
    },

    async _loadOrgs() {
        try {
            const result = await API.getOrganizations(Auth.currentUser?.orgId);
            this._orgs = (result.status === 'success' && result.organizations) || [];
        } catch (e) {
            this._orgs = [];
        }
        this._populateOrgDropdown();
    },

    _populateOrgDropdown() {
        const sel = document.getElementById('serviceOrgId');
        if (!sel) return;
        sel.innerHTML = this._orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
        sel.disabled = this._orgs.length < 2;
    },

    _orgName(orgId) {
        const org = this._orgs.find(o => o.id === orgId);
        return org ? org.name : (orgId || '—');
    },

    toggleForm() {
        const form = document.getElementById('serviceForm');
        const toggleText = document.getElementById('serviceFormToggleText');
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        if (!isHidden) this.resetForm();
    },

    hideForm() {
        document.getElementById('serviceForm').style.display = 'none';
        document.getElementById('serviceFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },

    resetForm() {
        this.editingId = null;
        document.getElementById('serviceForm').reset();
        document.getElementById('saveServiceBtn').textContent = 'Save Service';
        const orgSel = document.getElementById('serviceOrgId');
        if (orgSel) orgSel.value = Auth.currentUser?.orgId || '';
    },

    getGroupName(id) {
        const group = this.serviceGroups.find(g => g.id === id);
        return group ? group.name : (id || '-');
    },

    async load() {
        await this._loadOrgs();
        const tbody = document.getElementById('servicesTableBody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        const includeChildren = !!document.getElementById('serviceIncludeChildren')?.checked;

        try {
            const [sgResult, svResult] = await Promise.all([
                API.getServiceGroups(),
                API.getServices({ includeChildren })
            ]);

            if (sgResult.status === 'success') {
                this.serviceGroups = sgResult.serviceGroups;
                this.populateGroupDropdown();
            }

            if (svResult.status === 'success' && svResult.services.length > 0) {
                tbody.innerHTML = svResult.services.map(service => `
                    <tr>
                        <td>${service.name}</td>
                        <td>${this.getGroupName(service.serviceGroupId)}</td>
                        <td>${service.duration} mins</td>
                        <td>₹${service.defaultPrice}</td>
                        <td><span class="status-badge status-${service.status}">${service.status}</span></td>
                        <td>${this._orgName(service.orgId)}</td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn action-btn-edit" onclick="Services.edit('${service.id}')">Edit</button>
                                <button class="action-btn action-btn-delete" onclick="Services.delete('${service.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">No services found</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#fc8181;">Error loading services</td></tr>';
        }
    },

    populateGroupDropdown() {
        const select = document.getElementById('serviceGroupId');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Select Service Group</option>' +
            this.serviceGroups.filter(g => g.status === 'active')
                .map(g => `<option value="${g.id}">${g.name} (${g.gst}% GST)</option>`).join('');
        if (current) select.value = current;
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveServiceBtn');

        const data = {
            name: document.getElementById('serviceName').value,
            description: document.getElementById('serviceDescription').value,
            duration: document.getElementById('serviceDuration').value,
            serviceGroupId: document.getElementById('serviceGroupId').value,
            defaultPrice: document.getElementById('serviceDefaultPrice').value,
            status: document.getElementById('serviceStatus').value,
            targetOrgId: document.getElementById('serviceOrgId')?.value || ''
        };
        if (this.editingId) data.id = this.editingId;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = this.editingId
                ? await API.updateService(data)
                : await API.addService(data);
            if (result.status === 'success') {
                UI.showMessage('serviceMessage', result.message, 'success');
                this.hideForm();
                this.load();
            } else {
                UI.showMessage('serviceMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('serviceMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.editingId ? 'Update Service' : 'Save Service';
        }
    },

    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getServices();
            const service = result.services.find(s => s.id === id);
            if (service) {
                this.editingId = id;
                document.getElementById('serviceName').value = service.name;
                document.getElementById('serviceDescription').value = service.description || '';
                document.getElementById('serviceDuration').value = service.duration;
                document.getElementById('serviceGroupId').value = service.serviceGroupId || '';
                document.getElementById('serviceDefaultPrice').value = service.defaultPrice;
                document.getElementById('serviceStatus').value = service.status;
                const orgSel = document.getElementById('serviceOrgId');
                if (orgSel) orgSel.value = service.orgId || Auth.currentUser?.orgId || '';
                document.getElementById('saveServiceBtn').textContent = 'Update Service';
                document.getElementById('serviceForm').style.display = 'block';
                document.getElementById('serviceFormToggleText').textContent = 'Hide Form';
                document.getElementById('serviceForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (error) {
            UI.showMessage('serviceMessage', 'Error loading service', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async delete(id) {
        if (!confirm('Are you sure you want to delete this service?')) return;
        UI.showLoading();
        try {
            const result = await API.deleteService(id);
            if (result.status === 'success') {
                UI.showMessage('serviceMessage', result.message, 'success');
                this.load();
            } else {
                UI.showMessage('serviceMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('serviceMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
