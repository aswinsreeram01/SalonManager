// Local calendar date "yyyy-MM-dd" (NOT toISOString, which is UTC and can
// be a day off from local near midnight — matches _hraToday in hrapprovals.js).
function _prodToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const Products = {
  // State
  _products:   [],
  _vendors:    [],
  _pos:        [],
  _movements:  [],
  _editingId:  null,
  _venEditingId: null,
  _activeTab:  'products',

  // ─── Init ────────────────────────────────────────────────────────────────────

  init() {
    // Tab switching (scoped to #products so other sections can reuse same CSS classes)
    document.querySelectorAll('#products .prod-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
    });

    // Products tab
    document.getElementById('prodAddBtn').addEventListener('click', () => this._openProdForm());
    document.getElementById('prodCancelBtn').addEventListener('click', () => this._closeProdForm());
    document.getElementById('prodForm').addEventListener('submit', e => this._handleProdSubmit(e));
    document.getElementById('prodSearch').addEventListener('input', () => this._renderProducts());
    document.getElementById('prodCatFilter').addEventListener('change', () => this._renderProducts());
    document.getElementById('prodCategory').addEventListener('change', () => this._toggleProfessionalFields());

    // Vendors tab
    document.getElementById('venAddBtn').addEventListener('click', () => this._openVenForm());
    document.getElementById('venCancelBtn').addEventListener('click', () => this._closeVenForm());
    document.getElementById('vendorForm').addEventListener('submit', e => this._handleVenSubmit(e));
    document.getElementById('venSearch').addEventListener('input', () => this._renderVendors());
    document.getElementById('venStatusFilter').addEventListener('change', () => this._renderVendors());

    // Purchase Orders tab
    document.getElementById('poCreateBtn').addEventListener('click', () => this._openPOForm());
    document.getElementById('poCancelBtn').addEventListener('click', () => this._closePOForm());
    document.getElementById('poForm').addEventListener('submit', e => this._handlePOSubmit(e));
    document.getElementById('poVendorSelect').addEventListener('change', () => this._onPOVendorChange());
    document.getElementById('poAddItemBtn').addEventListener('click', () => this._addPOItem());
    document.getElementById('poSmartSuggestBtn').addEventListener('click', () => this._smartSuggestPO());

    // Receive Stock tab  (GAP 1 fix: listener is on the radio inputs, not the wrapper div — see below)
    document.getElementById('rcvPoSelect').addEventListener('change', () => this._loadPOItems());
    document.getElementById('rcvAddItemBtn').addEventListener('click', () => this._addRcvItem());
    document.getElementById('rcvForm').addEventListener('submit', e => this._handleRcvSubmit(e));

    // Stock Register tab
    document.getElementById('regProductFilter').addEventListener('change', () => this._renderRegister());
    document.getElementById('regTypeFilter').addEventListener('change', () => this._renderRegister());
    document.getElementById('regFromDate').addEventListener('change', () => this._renderRegister());
    document.getElementById('regToDate').addEventListener('change', () => this._renderRegister());

    // Stock Audit tab
    document.getElementById('auditLoadBtn').addEventListener('click', () => this._loadAuditTable());
    document.getElementById('auditForm').addEventListener('submit', e => this._handleAuditSubmit(e));

    // Receive Stock mode radio buttons (GAP 1 fix — wire to actual radio inputs, not the wrapper div)
    document.querySelectorAll('input[name="rcvMode"]').forEach(r =>
      r.addEventListener('change', () => this._onRcvModeChange())
    );

    // Set default dates
    const today = _prodToday();
    document.getElementById('rcvDate').value   = today;
    document.getElementById('auditDate').value = today;
  },

  // ─── Load ────────────────────────────────────────────────────────────────────

  async load() {
    UI.showLoading();
    try {
      const [prodRes, venRes, poRes, regRes] = await Promise.all([
        API.getProducts(),
        API.getVendors(),
        API.getPurchaseOrders(),
        API.getStockRegister()
      ]);
      if (prodRes.status === 'success') this._products  = prodRes.products  || [];
      if (venRes.status  === 'success') this._vendors   = venRes.vendors    || [];
      if (poRes.status   === 'success') this._pos       = poRes.pos         || [];
      if (regRes.status  === 'success') this._movements = regRes.movements  || [];

      // Org picker is optional — a role with Products access but no
      // Organizations access simply won't see it (form still works fine).
      try {
        const orgRes = await API.getOrganizations();
        this._orgs = orgRes.status === 'success' ? (orgRes.organizations || []) : [];
      } catch (e) {
        this._orgs = [];
      }
      this._populateOrgDropdown();

      this._populateVendorDropdowns();
      this._populateProductDropdowns();
      this._renderProducts();
      this._renderVendors();
      this._renderPOs();
      this._renderRegister();
    } catch(e) {
      UI.showMessage('prodMessage', 'Failed to load products data', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // ─── Tab switching ───────────────────────────────────────────────────────────

  _switchTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('#products .prod-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('#products .prod-tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'prod-tab-' + tab));
    if (tab === 'receive-stock') this._setupRcvTab();
    if (tab === 'stock-register') this._renderRegister();
  },

  // ─── PRODUCTS TAB ────────────────────────────────────────────────────────────

  _populateOrgDropdown() {
    const group = document.getElementById('prodOrgGroup');
    const sel   = document.getElementById('prodOrgId');
    if (!sel || !group) return;
    // Only worth showing when there's more than one org to move a product between.
    if (this._orgs.length < 2) { group.style.display = 'none'; return; }
    sel.innerHTML = '<option value="">Keep current</option>' +
      this._orgs.map(o => `<option value="${o.id}">${this._esc(o.name)}</option>`).join('');
    group.style.display = '';
  },

  _populateVendorDropdowns() {
    const opts = '<option value="">No Vendor</option>' +
      this._vendors.filter(v => v.status === 'active')
        .map(v => `<option value="${v.vendorId}">${this._esc(v.name)}</option>`).join('');
    ['prodVendorId', 'poVendorSelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  },

  _populateProductDropdowns() {
    const active = this._products.filter(p => p.status === 'active');
    // Register filter
    const regEl = document.getElementById('regProductFilter');
    if (regEl) {
      regEl.innerHTML = '<option value="">All Products</option>' +
        active.map(p => `<option value="${p.id}">${this._esc(p.name)}</option>`).join('');
    }
  },

  _renderProducts() {
    const q   = (document.getElementById('prodSearch').value || '').toLowerCase();
    const cat = document.getElementById('prodCatFilter').value;

    let list = this._products.filter(p => p.status !== 'deleted');
    if (cat) list = list.filter(p => p.category === cat);
    if (q)   list = list.filter(p => p.name.toLowerCase().includes(q) ||
                                     (p.manufacturer || '').toLowerCase().includes(q));

    const lowCount = this._products.filter(p =>
      p.status === 'active' && Number(p.baseStock) > 0 && Number(p.currentStock) < Number(p.baseStock)
    ).length;
    const ind = document.getElementById('prodLowStockBadge');
    if (ind) {
      ind.textContent = lowCount > 0 ? `${lowCount} below reorder` : '';
      ind.style.display = lowCount > 0 ? 'inline-block' : 'none';
    }

    const tbody = document.getElementById('prodTableBody');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#a0aec0;padding:24px;">No products found</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(p => {
      const vendor = this._vendors.find(v => v.vendorId === p.vendorId);
      const vendorName = vendor ? vendor.name : (p.vendorName || '—');
      return `<tr>
        <td>
          <div style="font-weight:500;">${this._esc(p.name)}</div>
          ${p.manufacturer ? `<div style="font-size:11px;color:#a0aec0;">${this._esc(p.manufacturer)}</div>` : ''}
        </td>
        <td><span class="status-badge" style="${p.category==='Retail'?'background:#c6f6d5;color:#22543d;':'background:#bee3f8;color:#2c5282;'}">${p.category}</span></td>
        <td>${p.uom}</td>
        <td style="text-align:right;">
          <div>₹${Number(p.unitCost).toFixed(2)}</div>
          ${p.category==='Retail'&&p.retailPrice?`<div style="font-size:11px;color:#718096;">Retail: ₹${Number(p.retailPrice).toFixed(2)}</div>`:''}
        </td>
        <td style="text-align:center;">${p.gst}%</td>
        <td style="text-align:center;">${this._stockCell(p.currentStock, p.baseStock)}</td>
        <td>${this._esc(vendorName)}</td>
        <td>
          <button class="action-btn action-btn-edit" onclick="Products._openProdForm('${p.id}')">Edit</button>
          <button class="action-btn action-btn-delete" onclick="Products._deleteProd('${p.id}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },

  _toggleProfessionalFields() {
    const isProf = document.getElementById('prodCategory').value === 'Professional';
    ['prodContentQtyGroup', 'prodUsageUomGroup', 'prodUsageHint'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isProf ? '' : 'none';
    });
  },

  _stockCell(curr, base) {
    curr = Number(curr) || 0;
    base = Number(base) || 0;
    if (base === 0) return `<span style="color:#718096;">${curr}</span>`;
    if (curr < base) return `<span style="color:#e53e3e;font-weight:600;" title="Below reorder">${curr} / ${base} &#9888;</span>`;
    return `<span style="color:#38a169;">${curr} / ${base}</span>`;
  },

  _openProdForm(id) {
    this._editingId = id || null;
    document.getElementById('prodFormTitle').textContent = id ? 'Edit Product' : 'Add Product';
    document.getElementById('prodSaveBtn').textContent   = id ? 'Update Product' : 'Save Product';
    document.getElementById('prodForm').reset();
    document.getElementById('prodGst').value = '18';
    document.getElementById('prodCurrentStock').value = '0';
    document.getElementById('prodBaseStock').value = '0';

    if (id) {
      const p = this._products.find(x => x.id === id);
      if (p) {
        document.getElementById('prodName').value         = p.name;
        document.getElementById('prodCategory').value     = p.category;
        document.getElementById('prodUom').value          = p.uom;
        document.getElementById('prodUnitCost').value     = p.unitCost;
        document.getElementById('prodRetailPrice').value  = p.retailPrice || '';
        document.getElementById('prodGst').value          = p.gst || 18;
        document.getElementById('prodCurrentStock').value = p.currentStock || 0;
        document.getElementById('prodBaseStock').value    = p.baseStock || 0;
        document.getElementById('prodManufacturer').value = p.manufacturer || '';
        document.getElementById('prodVendorId').value     = p.vendorId || '';
        document.getElementById('prodStatus').value       = p.status;
        document.getElementById('prodContentQty').value   = p.contentQty || '';
        document.getElementById('prodUsageUom').value     = p.usageUom || '';
      }
    }

    this._toggleProfessionalFields();

    const card = document.getElementById('prodFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _closeProdForm() {
    document.getElementById('prodFormCard').style.display = 'none';
    document.getElementById('prodForm').reset();
    this._editingId = null;
  },

  async _handleProdSubmit(e) {
    e.preventDefault();
    const vendorId = document.getElementById('prodVendorId').value;
    const vendor = this._vendors.find(v => v.vendorId === vendorId);
    const data = {
      name:         document.getElementById('prodName').value.trim(),
      category:     document.getElementById('prodCategory').value,
      uom:          document.getElementById('prodUom').value,
      unitCost:     parseFloat(document.getElementById('prodUnitCost').value) || 0,
      retailPrice:  parseFloat(document.getElementById('prodRetailPrice').value) || 0,
      gst:          parseFloat(document.getElementById('prodGst').value) || 0,
      currentStock: parseFloat(document.getElementById('prodCurrentStock').value) || 0,
      baseStock:    parseFloat(document.getElementById('prodBaseStock').value) || 0,
      manufacturer: document.getElementById('prodManufacturer').value.trim(),
      vendorId:     vendorId,
      vendorName:   vendor ? vendor.name : '',
      vendorContact: vendor ? vendor.phone : '',
      status:       document.getElementById('prodStatus').value,
      contentQty:   parseFloat(document.getElementById('prodContentQty').value) || 0,
      usageUom:     document.getElementById('prodUsageUom').value
    };
    // Only send targetOrgId when the admin explicitly picked a different
    // org — an empty/untouched picker must never reach the backend as ''
    // (that would look like "unassign from every org" and make the product
    // visible/editable across all outlets). See Products.update in Products.js.
    const orgPick = document.getElementById('prodOrgId')?.value;
    if (orgPick) data.targetOrgId = orgPick;
    if (this._editingId) data.id = this._editingId;

    const btn = document.getElementById('prodSaveBtn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = this._editingId
        ? await API.updateProduct(data)
        : await API.addProduct(data);

      if (res.status === 'success') {
        if (this._editingId) {
          const idx = this._products.findIndex(x => x.id === this._editingId);
          if (idx >= 0) this._products[idx] = { ...this._products[idx], ...data };
        } else {
          this._products.push({ ...data, id: res.id || ('PRD' + Date.now()) });
        }
        this._closeProdForm();
        this._renderProducts();
        this._populateProductDropdowns();
        UI.showMessage('prodMessage', this._editingId ? 'Product updated.' : 'Product saved.', 'success');
      } else {
        UI.showMessage('prodMessage', res.message || 'Error saving product', 'error');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error saving product', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  },

  async _deleteProd(id) {
    if (!confirm('Delete this product?')) return;
    this._products = this._products.filter(p => p.id !== id);
    this._renderProducts();
    try {
      const res = await API.deleteProduct(id);
      if (res.status !== 'success') {
        UI.showMessage('prodMessage', res.message || 'Error deleting product', 'error');
        await this.load();
      } else {
        UI.showMessage('prodMessage', 'Product deleted.', 'success');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error deleting product', 'error');
      await this.load();
    }
  },

  // ─── VENDORS TAB ─────────────────────────────────────────────────────────────

  _renderVendors() {
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
        <button class="action-btn action-btn-edit" onclick="Products._openVenForm('${v.vendorId}')">Edit</button>
        <button class="action-btn action-btn-delete" onclick="Products._removeVendor('${v.vendorId}')">Remove</button>
      </td>
    </tr>`).join('');
  },

  _openVenForm(vendorId) {
    this._venEditingId = vendorId || null;
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

  _closeVenForm() {
    document.getElementById('venFormCard').style.display = 'none';
    document.getElementById('vendorForm').reset();
    this._venEditingId = null;
  },

  async _handleVenSubmit(e) {
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
      const res = this._venEditingId
        ? await API.updateVendor({ ...data, vendorId: this._venEditingId })
        : await API.addVendor(data);

      if (res.status === 'success') {
        if (this._venEditingId) {
          const idx = this._vendors.findIndex(x => x.vendorId === this._venEditingId);
          if (idx >= 0) this._vendors[idx] = { ...this._vendors[idx], ...data };
        } else {
          this._vendors.push({ ...data, vendorId: res.vendorId || ('VEN' + Date.now()) });
        }
        this._closeVenForm();
        this._renderVendors();
        this._populateVendorDropdowns();
        UI.showMessage('venMessage', this._venEditingId ? 'Vendor updated.' : 'Vendor added.', 'success');
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

  async _removeVendor(vendorId) {
    if (!confirm('Remove this vendor? This cannot be undone.')) return;
    this._vendors = this._vendors.filter(v => v.vendorId !== vendorId);
    this._renderVendors();
    this._populateVendorDropdowns();
    try {
      const res = await API.removeVendor(vendorId);
      if (res.status === 'success') {
        UI.showMessage('venMessage', 'Vendor removed.', 'success');
      } else {
        UI.showMessage('venMessage', res.message || 'Error removing vendor', 'error');
        await this.load();
      }
    } catch(err) {
      UI.showMessage('venMessage', 'Error removing vendor', 'error');
      await this.load();
    }
  },

  // ─── PURCHASE ORDERS TAB ─────────────────────────────────────────────────────

  _renderPOs() {
    const tbody = document.getElementById('poTableBody');
    if (!this._pos.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a0aec0;padding:24px;">No purchase orders yet</td></tr>';
      return;
    }
    const sorted = [...this._pos].sort((a, b) => String(b.poDate).localeCompare(String(a.poDate)));
    tbody.innerHTML = sorted.map(po => {
      const badge = this._poStatusBadge(po.status);
      return `<tr>
        <td style="font-family:monospace;font-size:12px;">${this._esc(po.poId)}</td>
        <td style="font-weight:500;">${this._esc(po.vendorName || '—')}</td>
        <td>${this._fmtDate(po.poDate)}</td>
        <td>${po.expectedDate ? this._fmtDate(po.expectedDate) : '—'}</td>
        <td>${badge}</td>
        <td>
          <button class="action-btn action-btn-edit" onclick="Products._viewPO('${po.poId}')">View</button>
          ${po.status === 'draft' ? `<button class="action-btn" style="background:#bee3f8;color:#2c5282;" onclick="Products._markPOSent('${po.poId}')">Mark Sent</button>` : ''}
          ${(po.status === 'draft'||po.status === 'sent') ? `<button class="action-btn action-btn-delete" onclick="Products._cancelPO('${po.poId}')">Cancel</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  },

  _poStatusBadge(status) {
    const map = {
      draft:    'background:#edf2f7;color:#4a5568;',
      sent:     'background:#bee3f8;color:#2c5282;',
      partial:  'background:#fefcbf;color:#744210;',
      received: 'background:#c6f6d5;color:#22543d;',
      cancelled:'background:#fed7d7;color:#c53030;'
    };
    return `<span class="status-badge" style="${map[status]||''}">${status}</span>`;
  },

  _openPOForm() {
    document.getElementById('poFormCard').style.display = 'block';
    document.getElementById('poForm').reset();
    document.getElementById('poDate').value = _prodToday();
    document.getElementById('poItemsBody').innerHTML = '';
    this._addPOItem();
    document.getElementById('poFormCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _closePOForm() {
    document.getElementById('poFormCard').style.display = 'none';
    document.getElementById('poForm').reset();
  },

  _onPOVendorChange() {
    // Smart suggest button becomes active only when vendor selected
    const vendorId = document.getElementById('poVendorSelect').value;
    document.getElementById('poSmartSuggestBtn').disabled = !vendorId;
  },

  _smartSuggestPO() {
    const vendorId = document.getElementById('poVendorSelect').value;
    const below = this._products.filter(p =>
      p.status === 'active' && p.vendorId === vendorId &&
      Number(p.baseStock) > 0 && Number(p.currentStock) < Number(p.baseStock)
    );
    if (!below.length) {
      UI.showMessage('prodMessage', 'No products below reorder for this vendor.', 'info');
      return;
    }
    document.getElementById('poItemsBody').innerHTML = '';
    below.forEach(p => {
      const qty = Number(p.baseStock) - Number(p.currentStock);
      this._addPOItem({ productId: p.id, productName: p.name, uom: p.uom, qty, unitCost: p.unitCost });
    });
  },

  _addPOItem(prefill) {
    const tbody = document.getElementById('poItemsBody');
    const row = document.createElement('tr');
    const productOpts = this._products.filter(p => p.status === 'active')
      .map(p => `<option value="${p.id}" data-uom="${p.uom}" data-cost="${p.unitCost}">${this._esc(p.name)}</option>`).join('');

    row.innerHTML = `
      <td><select class="po-item-product" style="width:100%;min-width:160px;">
        <option value="">Select product</option>${productOpts}
      </select></td>
      <td><input type="text" class="po-item-uom" style="width:60px;" placeholder="uom" readonly></td>
      <td><input type="number" class="po-item-qty" style="width:70px;" min="1" step="1" value="${prefill?prefill.qty:1}"></td>
      <td><input type="number" class="po-item-cost" style="width:90px;" min="0" step="0.01" placeholder="0.00" value="${prefill?prefill.unitCost:''}"></td>
      <td><button type="button" class="action-btn action-btn-delete" onclick="this.closest('tr').remove()">✕</button></td>`;

    const sel = row.querySelector('.po-item-product');
    if (prefill) sel.value = prefill.productId;
    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      row.querySelector('.po-item-uom').value  = opt.dataset.uom  || '';
      row.querySelector('.po-item-cost').value = opt.dataset.cost || '';
    });
    // Fill UOM if prefill
    if (prefill) {
      row.querySelector('.po-item-uom').value  = prefill.uom     || '';
      row.querySelector('.po-item-cost').value = prefill.unitCost || '';
    }
    tbody.appendChild(row);
  },

  async _handlePOSubmit(e) {
    e.preventDefault();
    const vendorId   = document.getElementById('poVendorSelect').value;
    const vendor     = this._vendors.find(v => v.vendorId === vendorId);
    const poDate     = document.getElementById('poDate').value;
    const expDate    = document.getElementById('poExpectedDate').value;
    const notes      = document.getElementById('poNotes').value.trim();

    const rows = document.querySelectorAll('#poItemsBody tr');
    const items = [];
    let valid = true;
    rows.forEach(row => {
      const productId = row.querySelector('.po-item-product').value;
      const qty       = parseFloat(row.querySelector('.po-item-qty').value) || 0;
      const unitCost  = parseFloat(row.querySelector('.po-item-cost').value) || 0;
      const uom       = row.querySelector('.po-item-uom').value;
      if (!productId || qty <= 0) { valid = false; return; }
      const prod = this._products.find(p => p.id === productId);
      items.push({ productId, productName: prod ? prod.name : '', uom, qtyOrdered: qty, unitCost });
    });

    if (!vendorId)    { UI.showMessage('prodMessage', 'Please select a vendor.', 'error'); return; }
    if (!items.length){ UI.showMessage('prodMessage', 'Please add at least one item.', 'error'); return; }
    if (!valid)       { UI.showMessage('prodMessage', 'Fill in all item rows or remove empty ones.', 'error'); return; }

    const btn = document.getElementById('poSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const res = await API.createPurchaseOrder({
        vendorId, vendorName: vendor ? vendor.name : '', poDate, expectedDate: expDate, notes, items
      });
      if (res.status === 'success') {
        this._pos.push({
          poId: res.poId, vendorId, vendorName: vendor ? vendor.name : '',
          poDate, expectedDate: expDate, status: 'draft', notes
        });
        this._closePOForm();
        this._renderPOs();
        UI.showMessage('prodMessage', 'Purchase Order created.', 'success');
      } else {
        UI.showMessage('prodMessage', res.message || 'Error creating PO', 'error');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error creating PO', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create PO';
    }
  },

  async _viewPO(poId) {
    UI.showLoading();
    try {
      const res = await API.getPOItems(poId);
      if (res.status !== 'success') { UI.showMessage('prodMessage', 'Could not load PO items', 'error'); return; }
      const po = this._pos.find(p => p.poId === poId);
      const items = res.items || [];
      const rows = items.map(i => `<tr>
        <td>${this._esc(i.productName)}</td>
        <td style="text-align:center;">${i.uom}</td>
        <td style="text-align:center;">${i.qtyOrdered}</td>
        <td style="text-align:center;">${i.qtyReceived}</td>
        <td style="text-align:right;">₹${Number(i.unitCost).toFixed(2)}</td>
        <td style="text-align:right;">₹${(Number(i.unitCost)*Number(i.qtyOrdered)).toFixed(2)}</td>
      </tr>`).join('');

      document.getElementById('poDetailTitle').textContent = `PO — ${po ? po.vendorName : poId}`;
      document.getElementById('poDetailMeta').textContent =
        `${poId} · Date: ${this._fmtDate(po ? po.poDate : '')} · Status: ${po ? po.status : ''}`;
      document.getElementById('poDetailBody').innerHTML = rows || '<tr><td colspan="6" style="text-align:center;color:#a0aec0;">No items</td></tr>';
      document.getElementById('poDetailCard').style.display = 'block';
      document.getElementById('poDetailCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch(err) {
      UI.showMessage('prodMessage', 'Error loading PO', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  closePODetail() {
    document.getElementById('poDetailCard').style.display = 'none';
  },

  async _markPOSent(poId) {
    if (!confirm('Mark this PO as Sent?')) return;
    try {
      const res = await API.updatePOStatus(poId, 'sent');
      if (res.status === 'success') {
        const po = this._pos.find(p => p.poId === poId);
        if (po) po.status = 'sent';
        this._renderPOs();
        UI.showMessage('prodMessage', 'PO marked as Sent.', 'success');
      } else {
        UI.showMessage('prodMessage', res.message || 'Error updating PO', 'error');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error updating PO', 'error');
    }
  },

  async _cancelPO(poId) {
    if (!confirm('Cancel this Purchase Order?')) return;
    try {
      const res = await API.updatePOStatus(poId, 'cancelled');
      if (res.status === 'success') {
        const po = this._pos.find(p => p.poId === poId);
        if (po) po.status = 'cancelled';
        this._renderPOs();
        UI.showMessage('prodMessage', 'PO cancelled.', 'success');
      } else {
        UI.showMessage('prodMessage', res.message || 'Error cancelling PO', 'error');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error cancelling PO', 'error');
    }
  },

  // ─── RECEIVE STOCK TAB ───────────────────────────────────────────────────────

  _setupRcvTab() {
    this._onRcvModeChange();
    // Populate PO dropdown with sent/partial POs
    const poSel = document.getElementById('rcvPoSelect');
    const eligiblePOs = this._pos.filter(p => p.status === 'sent' || p.status === 'partial');
    poSel.innerHTML = '<option value="">Select Purchase Order</option>' +
      eligiblePOs.map(p => `<option value="${p.poId}">${this._esc(p.poId)} — ${this._esc(p.vendorName||'')}</option>`).join('');
    // Vendor dropdown
    const venSel = document.getElementById('rcvVendorSelect');
    venSel.innerHTML = '<option value="">Select Vendor</option>' +
      this._vendors.filter(v => v.status === 'active')
        .map(v => `<option value="${v.vendorId}">${this._esc(v.name)}</option>`).join('');
  },

  _onRcvModeChange() {
    const mode = document.querySelector('input[name="rcvMode"]:checked').value;
    document.getElementById('rcvPoRow').style.display    = mode === 'po' ? '' : 'none';
    document.getElementById('rcvVendorRow').style.display = mode === 'direct' ? '' : 'none';
    document.getElementById('rcvItemsBody').innerHTML = '';
    if (mode === 'direct') this._addRcvItem();
  },

  async _loadPOItems() {
    const poId = document.getElementById('rcvPoSelect').value;
    if (!poId) return;
    UI.showLoading();
    try {
      const res = await API.getPOItems(poId);
      if (res.status !== 'success') { UI.showMessage('prodMessage', 'Could not load PO items', 'error'); return; }
      const tbody = document.getElementById('rcvItemsBody');
      tbody.innerHTML = '';
      (res.items || []).forEach(item => {
        const remaining = Math.max(0, Number(item.qtyOrdered) - Number(item.qtyReceived));
        this._addRcvItem({
          productId: item.productId, productName: item.productName,
          qty: remaining, unitCost: item.unitCost, readonly: true
        });
      });
    } catch(err) {
      UI.showMessage('prodMessage', 'Error loading PO items', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  _addRcvItem(prefill) {
    const tbody = document.getElementById('rcvItemsBody');
    const row = document.createElement('tr');
    const isReadonly = prefill && prefill.readonly;

    if (isReadonly) {
      row.dataset.productId = prefill.productId;
      row.innerHTML = `
        <td style="font-weight:500;">${this._esc(prefill.productName)}</td>
        <td><input type="number" class="rcv-item-qty" style="width:80px;" min="0" step="0.01" value="${prefill.qty}" data-pid="${prefill.productId}" data-pname="${this._esc(prefill.productName)}"></td>
        <td><input type="number" class="rcv-item-cost" style="width:90px;" min="0" step="0.01" value="${prefill.unitCost}"></td>`;
    } else {
      const productOpts = this._products.filter(p => p.status === 'active')
        .map(p => `<option value="${p.id}" data-cost="${p.unitCost}">${this._esc(p.name)}</option>`).join('');
      row.innerHTML = `
        <td><select class="rcv-item-product" style="width:100%;min-width:160px;">
          <option value="">Select product</option>${productOpts}
        </select></td>
        <td><input type="number" class="rcv-item-qty" style="width:80px;" min="0" step="0.01" value="1"></td>
        <td><input type="number" class="rcv-item-cost" style="width:90px;" min="0" step="0.01" placeholder="0.00"></td>
        <td><button type="button" class="action-btn action-btn-delete" onclick="this.closest('tr').remove()">✕</button></td>`;
      const sel = row.querySelector('.rcv-item-product');
      sel.addEventListener('change', () => {
        const opt = sel.options[sel.selectedIndex];
        row.querySelector('.rcv-item-cost').value = opt.dataset.cost || '';
      });
    }
    tbody.appendChild(row);
  },

  async _handleRcvSubmit(e) {
    e.preventDefault();
    const mode    = document.querySelector('input[name="rcvMode"]:checked').value;
    const poId    = mode === 'po' ? document.getElementById('rcvPoSelect').value : '';
    const date    = document.getElementById('rcvDate').value;
    const notes   = document.getElementById('rcvNotes').value.trim();

    const rows = document.querySelectorAll('#rcvItemsBody tr');
    const items = [];
    rows.forEach(row => {
      let productId, productName, qty, unitCost;
      const sel = row.querySelector('.rcv-item-product');
      if (sel) {
        productId   = sel.value;
        productName = sel.options[sel.selectedIndex]?.text || '';
      } else {
        const qtyInput = row.querySelector('.rcv-item-qty');
        productId   = qtyInput ? qtyInput.dataset.pid   : '';
        productName = qtyInput ? qtyInput.dataset.pname : '';
      }
      const qtyEl  = row.querySelector('.rcv-item-qty');
      const costEl = row.querySelector('.rcv-item-cost');
      qty      = parseFloat(qtyEl  ? qtyEl.value  : 0) || 0;
      unitCost = parseFloat(costEl ? costEl.value : 0) || 0;
      if (productId && qty > 0) items.push({ productId, productName, qty, unitCost });
    });

    if (!items.length) { UI.showMessage('prodMessage', 'No valid items to receive.', 'error'); return; }

    // GAP 8 fix: capture vendor for direct receipts so StockMovements rows are traceable
    let vendorId = '', vendorName = '';
    if (mode === 'direct') {
      const sel = document.getElementById('rcvVendorSelect');
      vendorId = sel ? sel.value : '';
      const vendor = this._vendors.find(v => v.vendorId === vendorId);
      vendorName = vendor ? vendor.name : '';
    }

    const btn = document.getElementById('rcvSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const res = await API.receiveStock({ poId, date, notes, items, vendorId, vendorName });
      if (res.status === 'success') {
        // Update local product stocks
        items.forEach(item => {
          const p = this._products.find(x => x.id === item.productId);
          if (p) p.currentStock = (Number(p.currentStock) || 0) + item.qty;
        });
        // Update PO status if applicable
        if (poId) {
          // reload from backend is simpler for PO status
          const poRes = await API.getPurchaseOrders();
          if (poRes.status === 'success') this._pos = poRes.pos || [];
          this._renderPOs();
        }
        // Append to movements for register
        const regRes = await API.getStockRegister();
        if (regRes.status === 'success') this._movements = regRes.movements || [];

        document.getElementById('rcvForm').reset();
        document.getElementById('rcvDate').value = _prodToday();
        document.getElementById('rcvItemsBody').innerHTML = '';
        this._renderProducts();
        this._renderRegister();
        UI.showMessage('prodMessage', 'Stock received successfully.', 'success');
      } else {
        UI.showMessage('prodMessage', res.message || 'Error receiving stock', 'error');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error receiving stock', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Receipt';
    }
  },

  // ─── STOCK REGISTER TAB ──────────────────────────────────────────────────────

  _renderRegister() {
    const productId = document.getElementById('regProductFilter').value;
    const typeF     = document.getElementById('regTypeFilter').value;
    const from      = document.getElementById('regFromDate').value;
    const to        = document.getElementById('regToDate').value;

    let list = [...this._movements];
    if (productId) list = list.filter(m => m.productId === productId);
    if (typeF)     list = list.filter(m => m.type === typeF);
    if (from)      list = list.filter(m => String(m.date).slice(0,10) >= from);
    if (to)        list = list.filter(m => String(m.date).slice(0,10) <= to);

    list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));

    const drillMode = !!productId;
    const thead = document.getElementById('regThead');
    const tbody = document.getElementById('regTableBody');

    if (drillMode) {
      thead.innerHTML = `<tr>
        <th>Date</th><th>Type</th><th>Reference</th>
        <th style="text-align:right;">Qty In</th>
        <th style="text-align:right;">Qty Out</th>
        <th style="text-align:right;">Running Balance</th>
        <th>Notes</th>
      </tr>`;
    } else {
      thead.innerHTML = `<tr>
        <th>Date</th><th>Product</th><th>Type</th><th>Reference</th>
        <th style="text-align:right;">Qty</th><th>Notes</th>
      </tr>`;
    }

    if (!list.length) {
      const cols = drillMode ? 7 : 6;
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:#a0aec0;padding:24px;">No movements found</td></tr>`;
      return;
    }

    if (drillMode) {
      // Find initial balance before date range
      let balance = 0;
      if (from) {
        this._movements
          .filter(m => m.productId === productId && String(m.date).slice(0,10) < from)
          .sort((a,b) => String(a.date).localeCompare(String(b.date)))
          .forEach(m => balance += Number(m.qty) || 0);
      }
      tbody.innerHTML = list.map(m => {
        const qty = Number(m.qty) || 0;
        balance += qty;
        const qIn  = qty > 0 ? `<span style="color:#38a169;font-weight:600;">+${qty}</span>` : '';
        const qOut = qty < 0 ? `<span style="color:#e53e3e;font-weight:600;">${qty}</span>` : '';
        const balColor = balance < 0 ? 'color:#e53e3e;' : '';
        return `<tr>
          <td style="white-space:nowrap;">${this._fmtDate(m.date)}</td>
          <td>${this._typeBadge(m.type)}</td>
          <td style="font-family:monospace;font-size:11px;">${this._esc(m.refId||'—')}</td>
          <td style="text-align:right;">${qIn}</td>
          <td style="text-align:right;">${qOut}</td>
          <td style="text-align:right;font-weight:600;${balColor}">${balance}</td>
          <td style="font-size:12px;color:#718096;">${this._esc(m.notes||'')}</td>
        </tr>`;
      }).join('');
    } else {
      tbody.innerHTML = list.map(m => {
        const qty = Number(m.qty) || 0;
        const qtyDisplay = qty > 0
          ? `<span style="color:#38a169;font-weight:600;">+${qty}</span>`
          : `<span style="color:#e53e3e;font-weight:600;">${qty}</span>`;
        return `<tr>
          <td style="white-space:nowrap;">${this._fmtDate(m.date)}</td>
          <td style="font-weight:500;">${this._esc(m.productName||'')}</td>
          <td>${this._typeBadge(m.type)}</td>
          <td style="font-family:monospace;font-size:11px;">${this._esc(m.refId||'—')}</td>
          <td style="text-align:right;">${qtyDisplay}</td>
          <td style="font-size:12px;color:#718096;">${this._esc(m.notes||'')}</td>
        </tr>`;
      }).join('');
    }
  },

  _typeBadge(type) {
    const map = {
      receipt: 'background:#c6f6d5;color:#22543d;',
      billing: 'background:#fed7d7;color:#c53030;',
      audit:   'background:#fefcbf;color:#744210;',
      manual:  'background:#e9d8fd;color:#553c9a;'
    };
    return `<span class="status-badge" style="${map[type]||''}">${type||'—'}</span>`;
  },

  // ─── STOCK AUDIT TAB ─────────────────────────────────────────────────────────

  // GAP 2 fix: always fetch fresh product data before building the audit table so
  // System Qty reflects actual current stock, not the stale page-load snapshot.
  async _loadAuditTable() {
    const btn = document.getElementById('auditLoadBtn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      const res = await API.getProducts();
      if (res.status === 'success') this._products = res.products || [];
    } catch(e) {
      // fall through — use cached data and warn the user
      UI.showMessage('prodMessage', 'Could not refresh stock data — showing cached values.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Load Products';
    }

    const tbody = document.getElementById('auditTableBody');
    const active = this._products.filter(p => p.status === 'active');
    if (!active.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#a0aec0;padding:24px;">No active products</td></tr>';
      return;
    }
    tbody.innerHTML = active.map(p => `<tr data-pid="${p.id}" data-pname="${this._esc(p.name)}" data-cost="${p.unitCost}">
      <td style="font-weight:500;">${this._esc(p.name)}</td>
      <td style="text-align:center;">${p.uom}</td>
      <td style="text-align:center;" class="audit-sys-qty">${Number(p.currentStock)||0}</td>
      <td style="text-align:center;">
        <input type="number" class="audit-phys-qty" min="0" step="0.01"
          style="width:80px;text-align:center;"
          value="${Number(p.currentStock)||0}"
          oninput="Products._updateVariance(this)">
      </td>
      <td style="text-align:center;" class="audit-variance">0</td>
    </tr>`).join('');
    document.getElementById('auditFormSection').style.display = 'block';
  },

  _updateVariance(input) {
    const row = input.closest('tr');
    const sys = parseFloat(row.querySelector('.audit-sys-qty').textContent) || 0;
    const phy = parseFloat(input.value) || 0;
    const variance = phy - sys;
    const cell = row.querySelector('.audit-variance');
    cell.textContent = variance === 0 ? '0' : (variance > 0 ? `+${variance}` : `${variance}`);
    cell.style.color = variance === 0 ? '#718096' : (variance > 0 ? '#38a169' : '#e53e3e');
    cell.style.fontWeight = variance !== 0 ? '600' : '';
  },

  async _handleAuditSubmit(e) {
    e.preventDefault();
    const auditDate = document.getElementById('auditDate').value;
    const notes     = document.getElementById('auditNotes').value.trim();

    const rows = document.querySelectorAll('#auditTableBody tr[data-pid]');
    const items = [];
    rows.forEach(row => {
      const productId   = row.dataset.pid;
      const productName = row.dataset.pname;
      const unitCost    = parseFloat(row.dataset.cost) || 0;
      const systemQty   = parseFloat(row.querySelector('.audit-sys-qty').textContent) || 0;
      const physicalQty = parseFloat(row.querySelector('.audit-phys-qty').value) || 0;
      items.push({ productId, productName, systemQty, physicalQty, unitCost });
    });

    if (!items.length) { UI.showMessage('prodMessage', 'Load products first.', 'error'); return; }

    const btn = document.getElementById('auditSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const res = await API.saveStockAudit({ auditDate, notes, items });
      if (res.status === 'success') {
        // Update local stocks
        items.forEach(item => {
          const p = this._products.find(x => x.id === item.productId);
          if (p) p.currentStock = item.physicalQty;
        });
        // Reload movements
        const regRes = await API.getStockRegister();
        if (regRes.status === 'success') this._movements = regRes.movements || [];

        document.getElementById('auditTableBody').innerHTML = '';
        document.getElementById('auditFormSection').style.display = 'none';
        document.getElementById('auditForm').reset();
        document.getElementById('auditDate').value = _prodToday();
        this._renderProducts();
        this._renderRegister();
        UI.showMessage('prodMessage', 'Audit saved and stock updated.', 'success');
      } else {
        UI.showMessage('prodMessage', res.message || 'Error saving audit', 'error');
      }
    } catch(err) {
      UI.showMessage('prodMessage', 'Error saving audit', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Audit';
    }
  },

  // ─── Utilities ───────────────────────────────────────────────────────────────

  _fmtDate(ds) {
    if (!ds) return '—';
    const d = new Date(String(ds).slice(0,10) + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
};
