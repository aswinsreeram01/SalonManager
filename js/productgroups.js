const ProductGroups = {
    _groups: [],
    _editingId: null,

    init() {
        document.getElementById('pgAddBtn').addEventListener('click', () => this.openForm(null));
        document.getElementById('pgCancelBtn').addEventListener('click', () => this.closeForm());
        document.getElementById('pgForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('pgSearch').addEventListener('input', () => this._render());
    },

    async load() {
        const tbody = document.getElementById('pgTableBody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        try {
            const result = await API.getProductGroups();
            if (result.status === 'success') {
                this._groups = result.productGroups || [];
            } else {
                this._groups = [];
                UI.showMessage('pgMessage', result.message || 'Failed to load product groups.', 'error');
            }
        } catch (e) {
            this._groups = [];
            UI.showMessage('pgMessage', 'Network error loading product groups.', 'error');
        }
        this._render();
    },

    _render() {
        const tbody = document.getElementById('pgTableBody');
        const query = (document.getElementById('pgSearch').value || '').trim().toLowerCase();

        const filtered = query
            ? this._groups.filter(g =>
                (g.name || '').toLowerCase().includes(query) ||
                (g.hsnCode || '').toLowerCase().includes(query)
              )
            : this._groups;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">No product groups found</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(g => `
            <tr>
                <td style="font-weight:500;">${this._esc(g.name)}</td>
                <td>${g.gstPct != null ? this._esc(g.gstPct) + '%' : '-'}</td>
                <td>${g.hsnCode ? this._esc(g.hsnCode) : '-'}</td>
                <td>${g.unitIncentive != null ? '&#8377;' + this._esc(g.unitIncentive) : '-'}</td>
                <td>${g.sortOrder != null ? this._esc(g.sortOrder) : '-'}</td>
                <td><span class="status-badge status-${this._esc(g.status)}">${this._esc(g.status)}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn action-btn-edit" onclick="ProductGroups.openForm('${this._esc(g.id)}')">Edit</button>
                        <button class="action-btn action-btn-delete" onclick="ProductGroups.doRemove('${this._esc(g.id)}')">Remove</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    openForm(groupId) {
        this._editingId = groupId || null;
        const formCard = document.getElementById('pgFormCard');
        const formTitle = document.getElementById('pgFormTitle');
        const saveBtn = document.getElementById('pgSaveBtn');
        const form = document.getElementById('pgForm');

        form.reset();

        if (this._editingId) {
            const group = this._groups.find(g => g.id === this._editingId);
            if (group) {
                formTitle.textContent = 'Edit Product Group';
                saveBtn.textContent = 'Update Group';
                document.getElementById('pgName').value = group.name || '';
                document.getElementById('pgGstPct').value = group.gstPct != null ? group.gstPct : '';
                document.getElementById('pgHsnCode').value = group.hsnCode || '';
                document.getElementById('pgUnitIncentive').value = group.unitIncentive != null ? group.unitIncentive : '';
                document.getElementById('pgSortOrder').value = group.sortOrder != null ? group.sortOrder : '';
                document.getElementById('pgStatus').value = group.status || 'active';
            }
        } else {
            formTitle.textContent = 'Add Product Group';
            saveBtn.textContent = 'Save Group';
            document.getElementById('pgStatus').value = 'active';
        }

        formCard.style.display = 'block';
        formCard.scrollIntoView({ behavior: 'smooth' });
    },

    closeForm() {
        document.getElementById('pgFormCard').style.display = 'none';
        document.getElementById('pgForm').reset();
        this._editingId = null;
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('pgSaveBtn');

        const data = {
            name: document.getElementById('pgName').value.trim(),
            gstPct: parseFloat(document.getElementById('pgGstPct').value) || 0,
            hsnCode: document.getElementById('pgHsnCode').value.trim(),
            unitIncentive: parseFloat(document.getElementById('pgUnitIncentive').value) || 0,
            sortOrder: parseInt(document.getElementById('pgSortOrder').value, 10) || 0,
            status: document.getElementById('pgStatus').value
        };

        if (!data.name) {
            UI.showMessage('pgMessage', 'Group name is required.', 'error');
            return;
        }

        if (this._editingId) data.id = this._editingId;

        // Optimistic update
        let prevGroups = this._groups.slice();
        if (this._editingId) {
            this._groups = this._groups.map(g => g.id === this._editingId ? { ...g, ...data } : g);
        } else {
            // Temporary placeholder until server confirms with real id
            this._groups = [...this._groups, { ...data, id: '__optimistic__' }];
        }
        this._render();

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';

        try {
            const result = this._editingId
                ? await API.updateProductGroup(data)
                : await API.addProductGroup(data);

            if (result.status === 'success') {
                UI.showMessage('pgMessage', result.message || 'Saved successfully.', 'success');
                this.closeForm();
                // Reload authoritative data from server
                await this.load();
            } else {
                // Revert optimistic update
                this._groups = prevGroups;
                this._render();
                UI.showMessage('pgMessage', result.message || 'Failed to save.', 'error');
            }
        } catch (err) {
            // Revert optimistic update
            this._groups = prevGroups;
            this._render();
            UI.showMessage('pgMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this._editingId ? 'Update Group' : 'Save Group';
        }
    },

    async doRemove(id) {
        if (!confirm('Are you sure you want to remove this product group?')) return;

        const prevGroups = this._groups.slice();
        this._groups = this._groups.filter(g => g.id !== id);
        this._render();

        try {
            const result = await API.deleteProductGroup(id);
            if (result.status === 'success') {
                UI.showMessage('pgMessage', result.message || 'Product group removed.', 'success');
            } else {
                // Revert
                this._groups = prevGroups;
                this._render();
                UI.showMessage('pgMessage', result.message || 'Failed to remove product group.', 'error');
            }
        } catch (err) {
            // Revert
            this._groups = prevGroups;
            this._render();
            UI.showMessage('pgMessage', 'Network error. Please try again.', 'error');
        }
    },

    _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};
