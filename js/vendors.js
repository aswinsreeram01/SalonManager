const Vendors = {
  _vendors: [],
  _editingId: null,

  init() {
    document.getElementById('venAddBtn').addEventListener('click', () => this.openForm());
    document.getElementById('venCancelBtn').addEventListener('click', () => this.closeForm());
    document.getElementById('vendorForm').addEventListener('submit', e => this.handleSubmit(e));
    document.getElementById('venSearch').addEventListener('input', () => this._render());
    document.getElementById('venStatusFilter').addEventListener('change', () => this._render()); // GAP 12
  },

  async load() {
    UI.showLoading();
    try {
      const res = await API.getVendors();
      if (res.status === 'success') {
        this._vendors = res.vendors || [];
        this._render();
      } else {
        UI.showMessage('venMessage', res.message || 'Failed to load vendors', 'error');
      }
    } catch(e) {
      UI.showMessage('venMessage', 'Failed to load vendors', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  _render() {
    // GAP 12 fix: apply status filter (defaults to 'active') before search
    const statusF = document.getElementById('venStatusFilter').value; // '' | 'active' | 'inactive'
    const q       = (document.getElementById('venSearch').value || '').toLowerCase();
    let list = statusF ? this._vendors.filter(v => v.status === statusF) : this._vendors;
    if (q) list = list.filter(v => v.name.toLowerCase().includes(q) || (v.phone || '').includes(q));

    const tbody = document.getElementById('venTableBody');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:24px;">${q ? 'No vendors match search' : 'No vendors yet'}</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(v => `<tr>
      <td style="font-weight:500;">${this._esc(v.name)}</td>
      <td>${this._esc(v.contactPerson || '—')}</td>
      <td>${this._esc(v.phone || '—')}</td>
      <td>${this._esc(v.email || '—')}</td>
      <td><span class="status-badge status-${v.status}">${v.status}</span></td>
      <td>
        <button class="action-btn action-btn-edit" onclick="Vendors.openForm('${v.vendorId}')">Edit</button>
        <button class="action-btn action-btn-delete" onclick="Vendors.doRemove('${v.vendorId}')">Remove</button>
      </td>
    </tr>`).join('');
  },

  openForm(vendorId) {
    this._editingId = vendorId || null;
    document.getElementById('venFormTitle').textContent = vendorId ? 'Edit Vendor' : 'Add Vendor';
    document.getElementById('venSaveBtn').textContent   = vendorId ? 'Update Vendor' : 'Save Vendor';
    document.getElementById('vendorForm').reset();

    if (vendorId) {
      const v = this._vendors.find(x => x.vendorId === vendorId);
      if (v) {
        document.getElementById('venName').value          = v.name;
        document.getElementById('venContactPerson').value = v.contactPerson || '';
        document.getElementById('venPhone').value         = v.phone || '';
        document.getElementById('venEmail').value         = v.email || '';
        document.getElementById('venAddress').value       = v.address || '';
        document.getElementById('venNotes').value         = v.notes || '';
        document.getElementById('venStatus').value        = v.status || 'active';
      }
    }

    const card = document.getElementById('venFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeForm() {
    document.getElementById('venFormCard').style.display = 'none';
    document.getElementById('vendorForm').reset();
    this._editingId = null;
  },

  async handleSubmit(e) {
    e.preventDefault();
    const data = {
      name:          document.getElementById('venName').value.trim(),
      contactPerson: document.getElementById('venContactPerson').value.trim(),
      phone:         document.getElementById('venPhone').value.trim(),
      email:         document.getElementById('venEmail').value.trim(),
      address:       document.getElementById('venAddress').value.trim(),
      notes:         document.getElementById('venNotes').value.trim(),
      status:        document.getElementById('venStatus').value
    };

    const btn = document.getElementById('venSaveBtn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = this._editingId
        ? await API.updateVendor({ ...data, vendorId: this._editingId })
        : await API.addVendor(data);

      if (res.status === 'success') {
        if (this._editingId) {
          const idx = this._vendors.findIndex(x => x.vendorId === this._editingId);
          if (idx >= 0) this._vendors[idx] = { ...this._vendors[idx], ...data };
        } else {
          this._vendors.push({ ...data, vendorId: res.vendorId || ('VEN' + Date.now()) });
        }
        this.closeForm();
        this._render();
        this._syncToProducts(); // GAP 11
        UI.showMessage('venMessage', this._editingId ? 'Vendor updated.' : 'Vendor added.', 'success');
      } else {
        UI.showMessage('venMessage', res.message || 'Error saving vendor', 'error');
      }
    } catch(err) {
      UI.showMessage('venMessage', 'Error saving vendor', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  },

  async doRemove(vendorId) {
    if (!confirm('Remove this vendor? This cannot be undone.')) return;
    this._vendors = this._vendors.filter(v => v.vendorId !== vendorId);
    this._render();
    this._syncToProducts(); // GAP 11
    try {
      const res = await API.removeVendor(vendorId);
      if (res.status === 'success') {
        UI.showMessage('venMessage', 'Vendor removed.', 'success');
      } else {
        UI.showMessage('venMessage', res.message || 'Error removing vendor', 'error');
        await this.load();
        this._syncToProducts();
      }
    } catch(err) {
      UI.showMessage('venMessage', 'Error removing vendor', 'error');
      await this.load();
      this._syncToProducts();
    }
  },

  // GAP 11 fix: push the latest vendor list into Products so the PO vendor dropdown
  // and the product-form vendor dropdown stay current without a full page reload.
  _syncToProducts() {
    if (typeof Products !== 'undefined' && Navigation._loaded && Navigation._loaded.has('products')) {
      Products._vendors = this._vendors.slice();
      Products._populateVendorDropdowns();
    }
  },

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
};
