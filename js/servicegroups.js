const ServiceGroups = {
    editingId: null,

    init() {
        document.getElementById('serviceGroupForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('toggleServiceGroupForm').addEventListener('click', () => this.toggleForm());
        document.getElementById('cancelServiceGroupBtn').addEventListener('click', () => this.hideForm());
    },

    toggleForm() {
        const form = document.getElementById('serviceGroupForm');
        const toggleText = document.getElementById('serviceGroupFormToggleText');
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        if (!isHidden) this.resetForm();
    },

    hideForm() {
        document.getElementById('serviceGroupForm').style.display = 'none';
        document.getElementById('serviceGroupFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },

    resetForm() {
        this.editingId = null;
        document.getElementById('serviceGroupForm').reset();
        document.getElementById('saveServiceGroupBtn').textContent = 'Save Group';
    },

    async load() {
        const tbody = document.getElementById('serviceGroupsTableBody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        try {
            const result = await API.getServiceGroups();
            if (result.status === 'success' && result.serviceGroups.length > 0) {
                tbody.innerHTML = result.serviceGroups.map(g => `
                    <tr>
                        <td style="font-weight:500;">${g.name}</td>
                        <td>${g.description || '-'}</td>
                        <td>${g.gst != null ? g.gst + '%' : '-'}</td>
                        <td><span class="status-badge status-${g.status}">${g.status}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn action-btn-edit" onclick="ServiceGroups.edit('${g.id}')">Edit</button>
                                <button class="action-btn action-btn-delete" onclick="ServiceGroups.delete('${g.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;">No service groups found</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#fc8181;">Error loading service groups</td></tr>';
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveServiceGroupBtn');
        const data = {
            name: document.getElementById('serviceGroupName').value,
            description: document.getElementById('serviceGroupDescription').value,
            gst: document.getElementById('serviceGroupGst').value,
            status: document.getElementById('serviceGroupStatus').value
        };
        if (this.editingId) data.id = this.editingId;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = this.editingId
                ? await API.updateServiceGroup(data)
                : await API.addServiceGroup(data);
            if (result.status === 'success') {
                UI.showMessage('serviceGroupMessage', result.message, 'success');
                this.hideForm();
                await this.load();
            } else {
                UI.showMessage('serviceGroupMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('serviceGroupMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.editingId ? 'Update Group' : 'Save Group';
        }
    },

    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getServiceGroups();
            const group = result.serviceGroups.find(g => g.id === id);
            if (group) {
                this.editingId = id;
                document.getElementById('serviceGroupName').value = group.name;
                document.getElementById('serviceGroupDescription').value = group.description || '';
                document.getElementById('serviceGroupGst').value = group.gst || 0;
                document.getElementById('serviceGroupStatus').value = group.status;
                document.getElementById('saveServiceGroupBtn').textContent = 'Update Group';
                document.getElementById('serviceGroupForm').style.display = 'block';
                document.getElementById('serviceGroupFormToggleText').textContent = 'Hide Form';
                document.getElementById('serviceGroupForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {
            UI.showMessage('serviceGroupMessage', 'Error loading service group', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async delete(id) {
        if (!confirm('Are you sure you want to delete this service group?')) return;
        UI.showLoading();
        try {
            const result = await API.deleteServiceGroup(id);
            if (result.status === 'success') {
                UI.showMessage('serviceGroupMessage', result.message, 'success');
                await this.load();
            } else {
                UI.showMessage('serviceGroupMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('serviceGroupMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
