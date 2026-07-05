const Billing = {
    _nextRowId: 0,
    customers: [],
    staff: [],
    services: [],
    products: [],       // retail — used in product-type bill rows
    profProducts: [],   // professional — used for service consumption tracking
    priceBooks: [],
    pbItemsCache: {},
    rows: [],
    selectedCustomerId: null,
    selectedCustomerName: '',
    selectedPriceBookId: null,
    _phoneDebounce: null,
    _invoiceCloseCallback: null,
    _apptPrefill: null,
    // Loyalty state
    loyaltyConfig: null,
    customerLoyalty: null,
    sgEligible: {},    // serviceGroupId → true/false
    pgEligible: {},    // productGroupId → true/false
    _orgs: [],

    init() {
        document.getElementById('billingPhone').addEventListener('input', e => {
            clearTimeout(this._phoneDebounce);
            this._phoneDebounce = setTimeout(() => this.lookupCustomer(e.target.value.trim()), 600);
        });
        document.getElementById('billingPriceBook').addEventListener('change', e => {
            this.onPriceBookChange(e.target.value);
        });
        document.getElementById('discountType').addEventListener('change', () => this.recalcTotals());
        document.getElementById('billingDiscount').addEventListener('input', () => this.recalcTotals());
        document.getElementById('billingTip').addEventListener('input', () => this.recalcTotals());
        document.querySelectorAll('input[name="paymentMode"]').forEach(r => {
            r.addEventListener('change', () => {
                const mode = document.querySelector('input[name="paymentMode"]:checked').value;
                this.onPaymentModeChange(mode);
                this.liveValidate();
            });
        });
        ['splitCash', 'splitCard', 'splitUpi'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.liveValidate());
        });
        document.getElementById('newCustomerForm').addEventListener('submit', e => this.saveNewCustomer(e));
        document.getElementById('cancelNewCustomer').addEventListener('click', () => this.closeNewCustomerModal());
        document.getElementById('billingRedeemPoints')?.addEventListener('input', () => this.recalcTotals());
    },

    async load() {
        UI.showLoading();
        try {
            const [custRes, staffRes, svcRes, sgRes, prodRes, pbRes, pgRes, loyaltyRes] = await Promise.all([
                API.getCustomers(), API.getStaff(), API.getServices(),
                API.getServiceGroups(), API.getProducts(), API.getPriceBooks(),
                API.getProductGroups(), API.getLoyaltyConfig()
            ]);
            this.customers = custRes.customers || [];
            this.staff = (staffRes.staff || []).filter(s => s.status === 'active');
            const sgMap = {};
            (sgRes.serviceGroups || []).forEach(sg => {
                sgMap[sg.id] = sg;
                this.sgEligible[sg.id] = !!sg.pointsEligible;
            });
            (pgRes.productGroups || []).forEach(pg => {
                this.pgEligible[pg.id] = !!pg.pointsEligible;
            });
            this.services = (svcRes.services || [])
                .filter(s => s.status === 'active')
                .map(s => ({ ...s, gstPct: Number((sgMap[s.serviceGroupId] || {}).gstPct || (sgMap[s.serviceGroupId] || {}).gst) || 0 }));
            this.products     = (prodRes.products || []).filter(p => p.status === 'active' && p.category === 'Retail');
            this.profProducts = (prodRes.products || []).filter(p => p.status === 'active' && p.category === 'Professional');
            this.priceBooks = (pbRes.priceBooks || []).filter(pb => pb.status === 'active');
            this.loyaltyConfig = loyaltyRes?.loyalty || null;
            const pbSelect = document.getElementById('billingPriceBook');
            pbSelect.innerHTML = '<option value="">No Price Book (use defaults)</option>' +
                this.priceBooks.map(pb => `<option value="${pb.id}">${pb.name}</option>`).join('');

            try {
                const orgRes = await API.getOrganizations(Auth.currentUser?.orgId);
                this._orgs = orgRes.status === 'success' ? (orgRes.organizations || []) : [];
            } catch (e) {
                this._orgs = [];
            }
            const orgSel = document.getElementById('billingOrgId');
            if (orgSel) {
                orgSel.innerHTML = this._orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
                orgSel.disabled = this._orgs.length < 2;
            }

            this.resetBill();
            if (this._apptPrefill) {
                this.prefillFromAppointment(this._apptPrefill);
                this._apptPrefill = null;
            }
        } catch(e) {
            // GAP 4 fix: discard any pending appointment prefill — if data never loaded,
            // the prefill would silently fire on the next successful load with stale data.
            this._apptPrefill = null;
            UI.showMessage('billingMessage', 'Error loading billing data. Please refresh.', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    prefillFromAppointment(appt) {
        // Set customer phone and trigger lookup
        const phoneEl = document.getElementById('billingPhone');
        if (phoneEl && appt.customerPhone) {
            phoneEl.value = appt.customerPhone;
            this.lookupCustomer(appt.customerPhone);
        }
        // Populate the first row with the appointment service + staff
        if (!this.rows.length) this.addRow();
        const row = this.rows[0];
        row.type = 'service';
        const svc = this.services.find(s => s.id === appt.serviceId);
        if (svc) {
            row.itemId    = svc.id;
            row.itemName  = svc.name;
            row.unitPrice = this.getPriceForService(svc.id);
            row.gstPct    = svc.gstPct || 0;
        } else if (appt.serviceName) {
            row.itemName  = appt.serviceName;
        }
        const staffMem = this.staff.find(s => s.id === appt.staffId);
        if (staffMem) {
            row.staffId   = staffMem.id;
            row.staffName = staffMem.name;
        }
        this.recalcRow(row);
        this.renderRows();
        this.recalcTotals();
    },

    resetBill() {
        this.rows = [];
        this._nextRowId = 0;
        this.selectedCustomerId = null;
        this.selectedCustomerName = '';
        this.selectedPriceBookId = null;
        this.customerLoyalty = null;
        const phoneEl = document.getElementById('billingPhone');
        if (phoneEl) { phoneEl.value = ''; phoneEl.classList.remove('field-error'); }
        const nameEl = document.getElementById('billingCustomerName');
        if (nameEl) nameEl.textContent = '';
        const pbEl = document.getElementById('billingPriceBook');
        if (pbEl) pbEl.value = '';
        const orgEl = document.getElementById('billingOrgId');
        if (orgEl) orgEl.value = Auth.currentUser?.orgId || '';
        const dtEl = document.getElementById('discountType');
        if (dtEl) dtEl.value = 'value';
        const discEl = document.getElementById('billingDiscount');
        if (discEl) discEl.value = '';
        const tipEl = document.getElementById('billingTip');
        if (tipEl) tipEl.value = '';
        const redeemEl = document.getElementById('billingRedeemPoints');
        if (redeemEl) redeemEl.value = '';
        const cashRadio = document.querySelector('input[name="paymentMode"][value="Cash"]');
        if (cashRadio) cashRadio.checked = true;
        this.onPaymentModeChange('Cash');
        this._hideLoyaltyBar();
        this.addRow();
        this.recalcTotals();
    },

    _hideLoyaltyBar() {
        const bar = document.getElementById('billingLoyaltyBar');
        if (bar) bar.style.display = 'none';
        const redeemRow = document.getElementById('loyaltyRedeemRow');
        if (redeemRow) redeemRow.style.display = 'none';
        const earnRow = document.getElementById('loyaltyEarnRow');
        if (earnRow) earnRow.style.display = 'none';
    },

    // Mirrors Utils.normalizePhone on the backend (E.164, +91 default) so
    // client-side matching against the canonical phones returned by
    // get_customers stays correct regardless of how the cashier types it.
    _normalizePhone(phone) {
        if (!phone) return '';
        const raw = String(phone).trim();
        if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '');
        let digits = raw.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
        if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
        if (digits.length === 10) return '+91' + digits;
        return digits ? '+' + digits : '';
    },

    lookupCustomer(phone) {
        const nameEl  = document.getElementById('billingCustomerName');
        const phoneEl = document.getElementById('billingPhone');
        if (!phone) {
            this.selectedCustomerId = null;
            this.selectedCustomerName = '';
            this.customerLoyalty = null;
            if (nameEl)  nameEl.textContent = '';
            if (phoneEl) phoneEl.classList.remove('field-error');
            this._hideLoyaltyBar();
            this.liveValidate();
            return;
        }
        const customer = this.customers.find(c => this._normalizePhone(c.phone) === this._normalizePhone(phone));
        if (customer) {
            this.selectedCustomerId   = this._normalizePhone(customer.phone);
            this.selectedCustomerName = customer.name;
            if (nameEl)  { nameEl.textContent = customer.name; nameEl.style.color = '#38a169'; }
            if (phoneEl) phoneEl.classList.remove('field-error');
            this._loadCustomerLoyalty(this._normalizePhone(customer.phone));
        } else if (phone.length >= 10) {
            this.selectedCustomerId   = null;
            this.selectedCustomerName = '';
            this.customerLoyalty = null;
            this._hideLoyaltyBar();
            if (nameEl) {
                nameEl.textContent = 'Customer not found — ';
                nameEl.style.color = '#e53e3e';
                const link = document.createElement('a');
                link.href = '#'; link.textContent = 'Add new customer'; link.style.color = '#667eea';
                link.onclick = e => { e.preventDefault(); this.showNewCustomerModal(phone); };
                nameEl.appendChild(link);
            }
            if (phoneEl) phoneEl.classList.add('field-error');
        } else {
            this.selectedCustomerId = null;
            this.customerLoyalty = null;
            if (nameEl)  nameEl.textContent = '';
            if (phoneEl) phoneEl.classList.remove('field-error');
            this._hideLoyaltyBar();
        }
        this.liveValidate();
    },

    async _loadCustomerLoyalty(phone) {
        if (!this.loyaltyConfig?.enabled) { this._hideLoyaltyBar(); return; }
        try {
            const res = await API.getCustomerLoyalty(phone);
            this.customerLoyalty = res?.loyalty || null;
        } catch(e) { this.customerLoyalty = null; }
        this._renderLoyaltyBar();
        this.recalcTotals();
    },

    _renderLoyaltyBar() {
        const bar = document.getElementById('billingLoyaltyBar');
        if (!bar || !this.customerLoyalty) { this._hideLoyaltyBar(); return; }
        const loy = this.customerLoyalty;
        const tierColors = ['#cd7f32','#a8a9ad','#ffd700','#b9f2ff'];
        const tierIdx = loy.tierIndex >= 0 ? loy.tierIndex : 0;
        const bg  = tierColors[Math.min(tierIdx, tierColors.length - 1)];

        const badge = document.getElementById('billingTierBadge');
        if (badge) { badge.textContent = loy.tier; badge.style.cssText = `background:${bg};color:white;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;`; }

        const balEl = document.getElementById('billingPointsBalance');
        if (balEl) balEl.textContent = loy.pointsBalance.toLocaleString('en-IN');

        const nameEl = document.getElementById('billingPointsName');
        if (nameEl) nameEl.textContent = loy.pointsName || 'points';

        const hhBadge = document.getElementById('billingHHBadge');
        if (hhBadge) {
            hhBadge.style.display = loy.isHappyHour ? 'inline-flex' : 'none';
            const multEl = document.getElementById('billingHHMult');
            if (multEl) multEl.textContent = loy.hhMultiplier || 2;
        }

        bar.style.display = 'flex';

        // Show redemption row if they have points
        const redeemRow = document.getElementById('loyaltyRedeemRow');
        const ptsNameEl = document.getElementById('loyaltyPointsName');
        if (redeemRow) {
            redeemRow.style.display = loy.pointsBalance > 0 ? 'flex' : 'none';
            if (ptsNameEl) ptsNameEl.textContent = loy.pointsName || 'Points';
        }
    },

    showNewCustomerModal(phone) {
        document.getElementById('newCustomerPhone').value = phone;
        document.getElementById('newCustomerName').value = '';
        document.getElementById('newCustomerModal').style.display = 'flex';
        setTimeout(() => document.getElementById('newCustomerName').focus(), 50);
    },

    closeNewCustomerModal() {
        document.getElementById('newCustomerModal').style.display = 'none';
    },

    async saveNewCustomer(e) {
        e.preventDefault();
        const name  = document.getElementById('newCustomerName').value.trim();
        const phone = document.getElementById('newCustomerPhone').value.trim();
        if (!name || !phone) return;
        const btn = document.getElementById('saveNewCustomerBtn');
        btn.disabled = true;
        try {
            const result = await API.addCustomer({ name, phone });
            if (result.status === 'success') {
                const canonicalPhone = result.phone || this._normalizePhone(phone);
                this.customers.push({ name, phone: canonicalPhone });
                this.selectedCustomerId   = canonicalPhone;
                this.selectedCustomerName = name;
                const nameEl = document.getElementById('billingCustomerName');
                if (nameEl) { nameEl.textContent = name; nameEl.style.color = '#38a169'; }
                const phoneEl = document.getElementById('billingPhone');
                if (phoneEl) phoneEl.classList.remove('field-error');
                this.closeNewCustomerModal();
                this.liveValidate();
            } else {
                alert(result.message);
            }
        } catch(err) {
            alert('Error saving customer. Please try again.');
        } finally {
            btn.disabled = false;
        }
    },

    async onPriceBookChange(pbId) {
        this.selectedPriceBookId = pbId || null;
        if (pbId && !this.pbItemsCache[pbId]) {
            UI.showLoading();
            try {
                const result = await API.getPriceBookItems(pbId);
                const cache = {};
                (result.items || []).filter(i => !i.isDefault).forEach(i => { cache[i.serviceId] = Number(i.price); });
                this.pbItemsCache[pbId] = cache;
            } catch(e) {
                this.pbItemsCache[pbId] = {};
            } finally {
                UI.hideLoading();
            }
        }
        this.rows.forEach(row => {
            if (row.type === 'service' && row.itemId) {
                row.unitPrice = this.getPriceForService(row.itemId);
                this.recalcRow(row);
            }
        });
        this.renderRows();
        this.recalcTotals();
    },

    getPriceForService(serviceId) {
        if (this.selectedPriceBookId && this.pbItemsCache[this.selectedPriceBookId]) {
            const p = this.pbItemsCache[this.selectedPriceBookId][serviceId];
            if (p !== undefined) return p;
        }
        const svc = this.services.find(s => s.id === serviceId);
        return svc ? Number(svc.defaultPrice) : 0;
    },

    _newRow() {
        return { rowId: this._nextRowId++, type: 'service', itemId: '', itemName: '',
                 staffId: '', staffName: '', qty: 1, unitPrice: 0, gstPct: 0,
                 lineSubtotal: 0, lineGst: 0, lineTotal: 0,
                 profProductId: '', profProductName: '', profQty: '', profUom: '' };
    },

    addRow() {
        this.rows.push(this._newRow());
        this.renderRows();
        this.liveValidate();
    },

    removeRow(rowId) {
        this.rows = this.rows.filter(r => r.rowId !== rowId);
        if (this.rows.length === 0) this.rows.push(this._newRow());
        this.renderRows();
        this.recalcTotals();
    },

    onTypeChange(rowId, type) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        row.type = type; row.itemId = ''; row.itemName = ''; row.unitPrice = 0; row.gstPct = 0;
        row.profProductId = ''; row.profProductName = ''; row.profQty = ''; row.profUom = '';
        this.recalcRow(row); this.renderRows(); this.recalcTotals();
    },

    onItemChange(rowId, itemId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        row.itemId = itemId;
        if (!itemId) { row.itemName = ''; row.unitPrice = 0; row.gstPct = 0; }
        else if (row.type === 'service') {
            const svc = this.services.find(s => s.id === itemId);
            if (svc) { row.itemName = svc.name; row.unitPrice = this.getPriceForService(itemId); row.gstPct = svc.gstPct || 0; }
        } else {
            const prod = this.products.find(p => p.id === itemId);
            if (prod) { row.itemName = prod.name; row.unitPrice = Number(prod.retailPrice) || 0; row.gstPct = Number(prod.gst) || 0; }
        }
        this.recalcRow(row); this.renderRows(); this.recalcTotals();
    },

    onStaffChange(rowId, staffId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        const s = this.staff.find(st => st.id === staffId);
        row.staffId = staffId; row.staffName = s ? s.name : '';
        this.liveValidate();
    },

    onQtyChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        row.qty = Math.max(0, Number(val) || 0);
        this.recalcRow(row); this._updateRowTotals(rowId); this.recalcTotals();
    },

    onPriceChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        row.unitPrice = Math.max(0, Number(val) || 0);
        this.recalcRow(row); this._updateRowTotals(rowId); this.recalcTotals();
    },

    onGstChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        // Keep '' distinguishable from 0 so liveValidate can block an emptied GST field.
        row.gstPct = val === '' ? '' : Math.max(0, Number(val) || 0);
        this.recalcRow(row); this._updateRowTotals(rowId); this.recalcTotals();
    },

    onProfProductChange(rowId, productId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        const prod = this.profProducts.find(p => p.id === productId);
        row.profProductId   = productId;
        row.profProductName = prod ? prod.name : '';
        // Prefer the product's usage unit (e.g. "g" for a bottle inventoried
        // in "each") so staff enter how much was used, not how many bottles.
        // Falls back to the inventory UOM when usageUom isn't configured.
        row.profUom         = prod ? (prod.usageUom || prod.uom || '') : '';
        if (!productId) row.profQty = '';
        const subRow = document.querySelector(`tr[data-row-prof="${rowId}"]`);
        if (!subRow) return;
        const qtyInput = subRow.querySelector('input[type="number"]');
        const uomCell  = subRow.querySelector('.prof-uom');
        if (qtyInput) {
            qtyInput.disabled     = !productId;
            qtyInput.style.opacity = productId ? '1' : '0.4';
            if (!productId) qtyInput.value = '';
        }
        if (uomCell) uomCell.textContent = row.profUom || '—';
        this._checkStockWarnings();
    },

    onProfQtyChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (row) row.profQty = val;
        this._checkStockWarnings();
    },

    // Non-blocking advisory: warns if this bill would take a product's stock
    // to/below its reorder point (or negative), using the stock snapshot
    // loaded when billing opened — may be slightly stale if another till
    // sold the same product seconds ago, which is fine for an advisory.
    // Mirrors Bills._deductStock's fractional math for professional-product
    // usage so the warning matches what will actually happen on save.
    _checkStockWarnings() {
        const warnEl = document.getElementById('billingStockWarning');
        if (!warnEl) return;

        const deltaByProduct = {}; // productId -> inventory units this bill will deduct
        this.rows.forEach(row => {
            if (row.type === 'product' && row.itemId && row.qty > 0) {
                deltaByProduct[row.itemId] = (deltaByProduct[row.itemId] || 0) + row.qty;
            }
            if (row.profProductId && row.profQty !== '' && row.profQty !== undefined) {
                const usageQty = Number(row.profQty);
                if (usageQty > 0) {
                    const prod = this.profProducts.find(p => p.id === row.profProductId);
                    const contentQty = prod ? Number(prod.contentQty) || 0 : 0;
                    const fraction = contentQty > 0 ? usageQty / contentQty : usageQty;
                    deltaByProduct[row.profProductId] = (deltaByProduct[row.profProductId] || 0) + fraction;
                }
            }
        });

        const warnings = [];
        Object.keys(deltaByProduct).forEach(productId => {
            const prod = this.products.find(p => p.id === productId) || this.profProducts.find(p => p.id === productId);
            if (!prod) return;
            const projected = (Number(prod.currentStock) || 0) - deltaByProduct[productId];
            const base = Number(prod.baseStock) || 0;
            if (projected < 0) {
                warnings.push(`${prod.name}: would go negative (${projected.toFixed(2)} left)`);
            } else if (base > 0 && projected <= base) {
                warnings.push(`${prod.name}: would drop to ${projected.toFixed(2)} (reorder at ${base})`);
            }
        });

        if (warnings.length) {
            warnEl.innerHTML = '⚠️ Low stock after this bill — ' + warnings.join(' · ');
            warnEl.style.display = 'block';
        } else {
            warnEl.style.display = 'none';
        }
    },

    recalcRow(row) {
        const gstPct = (row.gstPct === '' || row.gstPct === null || row.gstPct === undefined) ? 0 : Number(row.gstPct);
        row.lineSubtotal = Math.round(row.qty * row.unitPrice * 100) / 100;
        row.lineGst      = Math.round(row.lineSubtotal * gstPct / 100 * 100) / 100;
        row.lineTotal    = row.lineSubtotal + row.lineGst;
    },

    _updateRowTotals(rowId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        const tr = document.querySelector(`tr[data-row="${rowId}"]`);
        if (!tr) return;
        tr.querySelector('.cell-subtotal').textContent = '₹' + row.lineSubtotal.toFixed(2);
        tr.querySelector('.cell-gst').textContent      = '₹' + row.lineGst.toFixed(2);
        tr.querySelector('.cell-total').textContent    = '₹' + row.lineTotal.toFixed(2);
    },

    renderRows() {
        const tbody = document.getElementById('billingItemsBody');
        if (!tbody) return;
        tbody.innerHTML = this.rows.map((row, idx) => {
            const svcOpts   = this.services.map(s => `<option value="${s.id}" ${row.itemId === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
            const prdOpts   = this.products.map(p => `<option value="${p.id}" ${row.itemId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
            const staffOpts = this.staff.map(s => `<option value="${s.id}" ${row.staffId === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
            const itemOpts  = row.type === 'service'
                ? `<option value="">Select service…</option>${svcOpts}`
                : `<option value="">Select product…</option>${prdOpts}`;
            const staffBorder = (row.itemId && !row.staffId) ? 'border-color:#e53e3e;' : '';
            const qtyBorder   = (row.itemId && row.qty <= 0)  ? 'border-color:#e53e3e;' : '';

            const mainRow = `<tr data-row="${row.rowId}" data-type="${row.type}">
                <td style="text-align:center;color:#a0aec0;width:28px;">${idx + 1}</td>
                <td><select class="bill-select" onchange="Billing.onTypeChange(${row.rowId}, this.value)">
                    <option value="service" ${row.type==='service'?'selected':''}>Service</option>
                    <option value="product" ${row.type==='product'?'selected':''}>Product</option>
                </select></td>
                <td><select class="bill-select bill-item-select" onchange="Billing.onItemChange(${row.rowId}, this.value)">${itemOpts}</select></td>
                <td><select class="bill-select" style="${staffBorder}" onchange="Billing.onStaffChange(${row.rowId}, this.value)">
                    <option value="">— Select —</option>${staffOpts}
                </select></td>
                <td><input type="number" class="bill-input bill-qty" value="${row.qty}" min="0" step="1"
                    style="width:58px;text-align:center;${qtyBorder}" oninput="Billing.onQtyChange(${row.rowId}, this.value)"></td>
                <td><input type="number" class="bill-input" value="${row.unitPrice||''}" min="0" step="0.01"
                    style="width:88px;text-align:right;" placeholder="0.00" oninput="Billing.onPriceChange(${row.rowId}, this.value)"></td>
                <td><input type="number" class="bill-input bill-gst" value="${row.gstPct}" min="0" max="100" step="0.01"
                    style="width:64px;text-align:center;${row.itemId && row.gstPct === '' ? 'border-color:#e53e3e;' : ''}"
                    placeholder="%" oninput="Billing.onGstChange(${row.rowId}, this.value)"></td>
                <td style="text-align:right;" class="cell-subtotal">₹${row.lineSubtotal.toFixed(2)}</td>
                <td style="text-align:right;" class="cell-gst">₹${row.lineGst.toFixed(2)}</td>
                <td style="text-align:right;font-weight:600;" class="cell-total">₹${row.lineTotal.toFixed(2)}</td>
                <td style="text-align:center;width:28px;">${this.rows.length > 1
                    ? `<button class="bill-del-btn" onclick="Billing.removeRow(${row.rowId})" title="Remove">✕</button>` : ''}</td>
            </tr>`;

            if (row.type !== 'service') return mainRow;

            const profOpts     = this.profProducts.map(p =>
                `<option value="${p.id}" ${row.profProductId === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('');
            const qtyDisabled  = !row.profProductId ? 'disabled' : '';
            const qtyOpacity   = !row.profProductId ? 'opacity:0.4;' : '';
            const noProfProds  = this.profProducts.length === 0
                ? `<option value="" disabled>No professional products added</option>` : '';

            const subRow = `<tr data-row-prof="${row.rowId}" style="background:#f7fafc;">
                <td style="text-align:center;color:#cbd5e0;font-size:11px;padding:3px 6px 6px;">↳</td>
                <td colspan="10" style="padding:3px 8px 6px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span style="font-size:12px;color:#718096;white-space:nowrap;">Product used:</span>
                        <select class="bill-select prof-prod-select"
                                onchange="Billing.onProfProductChange(${row.rowId}, this.value)">
                            <option value="">— None —</option>
                            ${noProfProds}${profOpts}
                        </select>
                        <input type="number" class="bill-input prof-qty-input" min="0" step="0.01" value="${row.profQty || ''}"
                               style="${qtyOpacity}" placeholder="Qty"
                               oninput="Billing.onProfQtyChange(${row.rowId}, this.value)" ${qtyDisabled}>
                        <span class="prof-uom" style="font-size:12px;color:#4a5568;min-width:32px;">${row.profUom || '—'}</span>
                    </div>
                </td>
            </tr>`;

            return mainRow + subRow;
        }).join('');
    },

    recalcTotals() {
        this._checkStockWarnings();
        const svcRows = this.rows.filter(r => r.type === 'service');
        const prdRows = this.rows.filter(r => r.type === 'product');
        const svcSub  = svcRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const svcGst  = svcRows.reduce((s, r) => s + r.lineGst, 0);
        const prdSub  = prdRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const prdGst  = prdRows.reduce((s, r) => s + r.lineGst, 0);
        const baseAmt = svcSub + svcGst + prdSub + prdGst;

        const discType  = (document.getElementById('discountType')  || {}).value || 'value';
        const discInput = Math.max(0, Number((document.getElementById('billingDiscount') || {}).value) || 0);
        const disc      = discType === 'percent' ? Math.round(baseAmt * discInput / 100 * 100) / 100 : discInput;

        const discAmtEl = document.getElementById('sumDiscountAmt');
        if (discAmtEl) discAmtEl.textContent = disc > 0 ? `−₹${disc.toFixed(2)}` : '₹0.00';

        // Loyalty redemption
        const loy        = this.loyaltyConfig;
        const custLoy    = this.customerLoyalty;
        let redeemDisc   = 0;
        if (loy?.enabled && custLoy) {
            const redeemPts  = Math.max(0, Math.floor(Number((document.getElementById('billingRedeemPoints') || {}).value) || 0));
            const maxRedeem  = Math.min(redeemPts, custLoy.pointsBalance || 0);
            const rate       = Number(loy.redemptionRate)  || 100;
            const val        = Number(loy.redemptionValue) || 10;
            redeemDisc       = Math.floor(maxRedeem / rate) * val;
            const redeemAmtEl = document.getElementById('sumRedeemAmt');
            if (redeemAmtEl) redeemAmtEl.textContent = redeemDisc > 0 ? `−₹${redeemDisc.toFixed(2)}` : '₹0.00';
        }

        const tip   = Math.max(0, Number((document.getElementById('billingTip') || {}).value) || 0);
        const grand = Math.max(0, baseAmt - disc - redeemDisc + tip);

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = '₹' + v.toFixed(2); };
        set('sumSvcSubtotal', svcSub); set('sumSvcGst', svcGst);
        set('sumPrdSubtotal', prdSub); set('sumPrdGst', prdGst);
        set('sumGrandTotal', grand);

        // Points-to-earn preview
        if (loy?.enabled && custLoy) {
            const earnRow = document.getElementById('loyaltyEarnRow');
            const pts = this._calcPointsToEarn(svcRows, prdRows, custLoy, loy);
            const earnSpan = document.getElementById('sumPointsToEarn');
            const nameSpan = document.getElementById('sumPointsName');
            if (earnSpan) earnSpan.textContent = pts.toLocaleString('en-IN');
            if (nameSpan) nameSpan.textContent = loy.pointsName || 'points';
            if (earnRow) earnRow.style.display = pts > 0 ? 'block' : 'none';
        }

        this.liveValidate();
    },

    _calcPointsToEarn(svcRows, prdRows, custLoy, loy) {
        const baseRate  = Number(loy.baseEarnRate) || 10;
        const tierMult  = Number(custLoy.tierMult) || 1;
        const hhMult    = custLoy.isHappyHour ? (Number(loy.happyHourMultiplier) || 2) : 1;
        let eligible    = 0;
        svcRows.forEach(r => { if (r.itemId && this.sgEligible[this._getSvcGroupId(r.itemId)]) eligible += r.lineSubtotal; });
        prdRows.forEach(r => { if (r.itemId && this.pgEligible[this._getProdGroupId(r.itemId)]) eligible += r.lineSubtotal; });
        return Math.floor(eligible / 100) * baseRate * tierMult * hhMult;
    },

    _getSvcGroupId(serviceId) {
        const svc = this.services.find(s => s.id === serviceId);
        return svc ? svc.serviceGroupId : '';
    },

    _getProdGroupId(productId) {
        const prod = this.products.find(p => p.id === productId);
        return prod ? (prod.groupId || '') : '';
    },

    liveValidate() {
        const checks = [];
        checks.push({ ok: !!this.selectedCustomerId, msg: 'Select a customer by phone number' });
        const filledRows = this.rows.filter(r => r.itemId);
        // GAP 5 fix: rows that have a name but no itemId come from appointment prefill where
        // the service has been deactivated. Detect them and show a specific, actionable message
        // instead of the confusing generic "Add at least one service or product".
        const orphanRows = this.rows.filter(r => !r.itemId && r.itemName);
        orphanRows.forEach(row => {
            const n = this.rows.indexOf(row) + 1;
            checks.push({ ok: false, msg: `Row ${n}: "${row.itemName}" is no longer active — please select a different service or product` });
        });
        checks.push({ ok: filledRows.length > 0 && orphanRows.length === 0, msg: 'Add at least one service or product' });
        filledRows.forEach(row => {
            const n = this.rows.indexOf(row) + 1;
            if (!row.staffId)       checks.push({ ok: false, msg: `Row ${n} (${row.itemName}): Select a staff member` });
            if (!row.qty || row.qty <= 0) checks.push({ ok: false, msg: `Row ${n} (${row.itemName}): Qty must be > 0` });
            if (row.gstPct === '' || row.gstPct === null || row.gstPct === undefined)
                checks.push({ ok: false, msg: `Row ${n} (${row.itemName}): GST% is required` });
        });
        const mode = (document.querySelector('input[name="paymentMode"]:checked') || {}).value;
        if (mode === 'Split') {
            const cash  = Number((document.getElementById('splitCash') || {}).value) || 0;
            const card  = Number((document.getElementById('splitCard') || {}).value) || 0;
            const upi   = Number((document.getElementById('splitUpi')  || {}).value) || 0;
            const grand = this._getGrandTotal();
            if (cash + card + upi === 0)
                checks.push({ ok: false, msg: 'Enter the split payment amounts' });
            else if (Math.abs(cash + card + upi - grand) > 0.01)
                checks.push({ ok: false, msg: `Split total ₹${(cash+card+upi).toFixed(2)} must equal Grand Total ₹${grand.toFixed(2)}` });
            else
                checks.push({ ok: true, msg: 'Split amounts balance' });
        }
        const allOk = checks.every(c => c.ok);
        const saveBtn = document.getElementById('saveBillBtn');
        if (saveBtn) saveBtn.disabled = !allOk;
        const listEl = document.getElementById('billingValidationList');
        if (listEl) {
            if (allOk) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
            else {
                listEl.style.display = 'block';
                listEl.innerHTML = '<ul class="validation-list">' +
                    checks.map(c => `<li class="${c.ok ? 'v-ok' : 'v-err'}">${c.ok ? '✓' : '✗'} ${c.msg}</li>`).join('') +
                    '</ul>';
            }
        }
        return allOk;
    },

    onPaymentModeChange(mode) {
        const el = document.getElementById('splitInputs');
        if (el) el.style.display = mode === 'Split' ? 'block' : 'none';
    },

    _getGrandTotal() {
        const el = document.getElementById('sumGrandTotal');
        return el ? parseFloat(el.textContent.replace('₹','')) || 0 : 0;
    },

    _getDiscountData() {
        const discType  = (document.getElementById('discountType')  || {}).value || 'value';
        const discInput = Math.max(0, Number((document.getElementById('billingDiscount') || {}).value) || 0);
        if (discType === 'percent') {
            const base = this.rows.reduce((s, r) => s + r.lineSubtotal + r.lineGst, 0);
            return { discountType: 'percent', discountInput: discInput, discount: Math.round(base * discInput / 100 * 100) / 100 };
        }
        return { discountType: 'value', discountInput: discInput, discount: discInput };
    },

    save() {
        if (!this.liveValidate()) return;
        this.showConfirmation();
    },

    showConfirmation() {
        const content = document.getElementById('billConfirmContent');
        if (!content) return;
        const filledRows = this.rows.filter(r => r.itemId && r.qty > 0);
        const svcRows = filledRows.filter(r => r.type === 'service');
        const prdRows = filledRows.filter(r => r.type === 'product');
        const svcSub  = svcRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const svcGst  = svcRows.reduce((s, r) => s + r.lineGst, 0);
        const prdSub  = prdRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const prdGst  = prdRows.reduce((s, r) => s + r.lineGst, 0);
        const { discountType, discountInput, discount } = this._getDiscountData();
        const tip   = Math.max(0, Number((document.getElementById('billingTip') || {}).value) || 0);
        const grand = this._getGrandTotal();
        const mode  = (document.querySelector('input[name="paymentMode"]:checked') || {}).value || 'Cash';
        const today = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
        const pbName = (this.priceBooks.find(pb => pb.id === this.selectedPriceBookId) || {}).name || '';

        const rowsHtml = rows => rows.map(r => `<tr>
            <td style="padding:7px 10px;">
                ${r.itemName}
                ${r.type === 'service' && r.profProductId
                    ? `<div style="font-size:11px;color:#718096;margin-top:2px;">↳ ${r.profProductName}${r.profQty ? ` &times; ${r.profQty} ${r.profUom}` : ''}</div>`
                    : ''}
            </td>
            <td style="padding:7px 10px;">${r.staffName||'—'}</td>
            <td style="padding:7px 10px;text-align:center;">${r.qty}</td>
            <td style="padding:7px 10px;text-align:right;">₹${Number(r.unitPrice).toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:center;">${r.gstPct}%</td>
            <td style="padding:7px 10px;text-align:right;font-weight:600;">₹${Number(r.lineTotal).toFixed(2)}</td>
        </tr>`).join('');

        let payLine = mode;
        if (mode === 'Split') {
            const c = Number((document.getElementById('splitCash')||{}).value)||0;
            const ca= Number((document.getElementById('splitCard')||{}).value)||0;
            const u = Number((document.getElementById('splitUpi') ||{}).value)||0;
            const parts = [];
            if (c  > 0) parts.push(`Cash ₹${c.toFixed(2)}`);
            if (ca > 0) parts.push(`Card ₹${ca.toFixed(2)}`);
            if (u  > 0) parts.push(`UPI ₹${u.toFixed(2)}`);
            payLine = parts.join(' + ');
        }
        const discLabel = discountType === 'percent' ? `Discount (${discountInput}%)` : 'Discount';
        const sumRow = (label, val, style='') => `<div class="conf-sum-row" ${style}><span>${label}</span><span>${val}</span></div>`;

        content.innerHTML = `
            <div style="background:#f7fafc;border-radius:8px;padding:14px 16px;margin-bottom:16px;font-size:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><strong>Customer</strong><span>${this.selectedCustomerName}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><strong>Date</strong><span>${today}</span></div>
                ${pbName ? `<div style="display:flex;justify-content:space-between;"><strong>Price Book</strong><span>${pbName}</span></div>` : ''}
            </div>
            <div class="table-container" style="margin-bottom:16px;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="background:#f7fafc;">
                        <th style="padding:7px 10px;text-align:left;">Item</th>
                        <th style="padding:7px 10px;text-align:left;">Staff</th>
                        <th style="padding:7px 10px;text-align:center;">Qty</th>
                        <th style="padding:7px 10px;text-align:right;">Price</th>
                        <th style="padding:7px 10px;text-align:center;">GST</th>
                        <th style="padding:7px 10px;text-align:right;">Total</th>
                    </tr></thead>
                    <tbody>
                        ${svcRows.length > 0 ? `<tr><td colspan="6" style="padding:5px 10px;background:#ebf8ff;font-size:11px;font-weight:700;color:#2b6cb0;letter-spacing:.05em;">SERVICES</td></tr>${rowsHtml(svcRows)}` : ''}
                        ${prdRows.length > 0 ? `<tr><td colspan="6" style="padding:5px 10px;background:#f0fff4;font-size:11px;font-weight:700;color:#276749;letter-spacing:.05em;">RETAIL PRODUCTS</td></tr>${rowsHtml(prdRows)}` : ''}
                    </tbody>
                </table>
            </div>
            <div style="border-top:2px solid #e2e8f0;padding-top:12px;">
                ${svcSub > 0 ? sumRow('Services Subtotal', '₹'+svcSub.toFixed(2)) : ''}
                ${svcGst > 0 ? sumRow('Services GST', '₹'+svcGst.toFixed(2)) : ''}
                ${prdSub > 0 ? sumRow('Retail Subtotal', '₹'+prdSub.toFixed(2)) : ''}
                ${prdGst > 0 ? sumRow('Retail GST', '₹'+prdGst.toFixed(2)) : ''}
                ${discount > 0 ? sumRow(discLabel, `<span style="color:#e53e3e;">−₹${discount.toFixed(2)}</span>`) : ''}
                ${(() => { const loy = this.loyaltyConfig; const custLoy = this.customerLoyalty; if (!loy?.enabled || !custLoy) return ''; const rp = Math.min(Math.max(0,Math.floor(Number((document.getElementById('billingRedeemPoints')||{}).value)||0)),custLoy.pointsBalance||0); const rd = rp > 0 ? Math.floor(rp/(Number(loy.redemptionRate)||100))*(Number(loy.redemptionValue)||10) : 0; return rd > 0 ? sumRow(`Redeem (${rp.toLocaleString('en-IN')} ${loy.pointsName||'pts'})`, `<span style="color:#38a169;">−₹${rd.toFixed(2)}</span>`) : ''; })()}
                ${tip > 0 ? sumRow('Tip', '₹'+tip.toFixed(2)) : ''}
                <div class="conf-sum-row" style="font-size:18px;font-weight:700;color:#2d3748;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:6px;">
                    <span>GRAND TOTAL</span><span style="color:#667eea;">₹${grand.toFixed(2)}</span>
                </div>
                ${sumRow('Payment', payLine, 'style="color:#718096;font-size:13px;"')}
            </div>`;
        document.getElementById('billConfirmModal').style.display = 'flex';
    },

    closeConfirmation() {
        document.getElementById('billConfirmModal').style.display = 'none';
    },

    async _doSave() {
        this.closeConfirmation();
        const mode = (document.querySelector('input[name="paymentMode"]:checked') || {}).value || 'Cash';
        const { discountType, discountInput, discount } = this._getDiscountData();
        const tip   = Math.max(0, Number((document.getElementById('billingTip') || {}).value) || 0);
        const grand = this._getGrandTotal();
        const filledRows = this.rows.filter(r => r.itemId && r.qty > 0);
        const pbName = (this.priceBooks.find(pb => pb.id === this.selectedPriceBookId) || {}).name || '';

        // Loyalty — redemption and points to earn
        const loy         = this.loyaltyConfig;
        const custLoy     = this.customerLoyalty;
        const redeemPts   = loy?.enabled && custLoy
            ? Math.min(Math.max(0, Math.floor(Number((document.getElementById('billingRedeemPoints')||{}).value)||0)), custLoy.pointsBalance||0)
            : 0;
        const redeemDisc  = redeemPts > 0
            ? Math.floor(redeemPts / (Number(loy.redemptionRate)||100)) * (Number(loy.redemptionValue)||10)
            : 0;
        const svcFilled   = filledRows.filter(r => r.type === 'service');
        const prdFilled   = filledRows.filter(r => r.type === 'product');
        const pointsToEarn = loy?.enabled && custLoy
            ? this._calcPointsToEarn(svcFilled, prdFilled, custLoy, loy)
            : 0;

        const payload = {
            customerId: this.selectedCustomerId,
            customerPhone: this.selectedCustomerId,
            customerName: this.selectedCustomerName,
            priceBookId: this.selectedPriceBookId || '',
            priceBookName: pbName,
            discount: discount + redeemDisc, discountType, discountInput, tip,
            paymentMode: mode,
            cashAmt: mode === 'Cash' ? grand : (mode === 'Split' ? (Number((document.getElementById('splitCash')||{}).value)||0) : 0),
            cardAmt: mode === 'Card' ? grand : (mode === 'Split' ? (Number((document.getElementById('splitCard')||{}).value)||0) : 0),
            upiAmt:  mode === 'UPI'  ? grand : (mode === 'Split' ? (Number((document.getElementById('splitUpi') ||{}).value)||0) : 0),
            items: filledRows,
            pointsToEarn,
            redeemPoints: redeemPts,
            targetOrgId: document.getElementById('billingOrgId')?.value || ''
        };
        const btn = document.getElementById('saveBillBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Saving…'; }
        try {
            const result = await API.saveBill(payload);
            if (result.status === 'success') {
                this.renderInvoice(result.billId, payload, result.grandTotal);
            } else {
                UI.showMessage('billingMessage', result.message, 'error');
            }
        } catch(e) {
            UI.showMessage('billingMessage', 'Network error. Please try again.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save & Generate Invoice'; }
            this.liveValidate();
        }
    },

    // ── Invoice Template Settings ──────────────────────────────────────────────

    _getInvoiceSettings() {
        try { return JSON.parse(localStorage.getItem('invoiceSettings') || '{}'); } catch(e) { return {}; }
    },

    openTemplateSettings() {
        const s = this._getInvoiceSettings();
        document.getElementById('invSetSalonName').value  = s.salonName  || '';
        document.getElementById('invSetAddress').value    = s.address    || '';
        document.getElementById('invSetPhone').value      = s.phone      || '';
        document.getElementById('invSetGstNumber').value  = s.gstNumber  || '';
        document.getElementById('invSetFooterText').value = s.footerText || '';
        document.getElementById('invoiceSettingsModal').style.display = 'flex';
    },

    saveTemplateSettings() {
        const settings = {
            salonName:  document.getElementById('invSetSalonName').value.trim(),
            address:    document.getElementById('invSetAddress').value.trim(),
            phone:      document.getElementById('invSetPhone').value.trim(),
            gstNumber:  document.getElementById('invSetGstNumber').value.trim(),
            footerText: document.getElementById('invSetFooterText').value.trim()
        };
        localStorage.setItem('invoiceSettings', JSON.stringify(settings));
        document.getElementById('invoiceSettingsModal').style.display = 'none';
    },

    // ── Invoice Rendering ──────────────────────────────────────────────────────

    renderInvoice(billId, data, grandTotal, closeCallback) {
        this._invoiceCloseCallback = closeCallback || null;
        const closeBtn = document.getElementById('invoiceCloseBtn');
        if (closeBtn) closeBtn.textContent = closeCallback ? 'Close' : 'Close & New Bill';

        const s = this._getInvoiceSettings();
        const salonName  = s.salonName  || 'Salon Manager';
        const footerText = s.footerText || 'Thank you for your visit!';

        const today   = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
        const timeStr = today.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
        const svcRows = (data.items||[]).filter(i => i.type==='service');
        const prdRows = (data.items||[]).filter(i => i.type==='product');
        const svcSub  = svcRows.reduce((s,r) => s + r.lineSubtotal, 0);
        const svcGst  = svcRows.reduce((s,r) => s + r.lineGst, 0);
        const prdSub  = prdRows.reduce((s,r) => s + r.lineSubtotal, 0);
        const prdGst  = prdRows.reduce((s,r) => s + r.lineGst, 0);
        const discount      = Number(data.discount)      || 0;
        const discountType  = data.discountType  || 'value';
        const discountInput = Number(data.discountInput) || 0;

        const rowHtml = (rows, offset) => rows.map((r,i) => `<tr>
            <td style="color:#a0aec0;">${offset+i+1}</td>
            <td>${r.itemName}</td><td>${r.staffName||'—'}</td>
            <td style="text-align:center;">${r.qty}</td>
            <td style="text-align:right;">₹${Number(r.unitPrice).toFixed(2)}</td>
            <td style="text-align:center;">${r.gstPct}%</td>
            <td style="text-align:right;">₹${Number(r.lineTotal).toFixed(2)}</td>
        </tr>`).join('');

        let payLine = data.paymentMode;
        if (data.paymentMode === 'Split') {
            const parts = [];
            if (data.cashAmt > 0) parts.push(`Cash ₹${Number(data.cashAmt).toFixed(2)}`);
            if (data.cardAmt > 0) parts.push(`Card ₹${Number(data.cardAmt).toFixed(2)}`);
            if (data.upiAmt  > 0) parts.push(`UPI ₹${Number(data.upiAmt).toFixed(2)}`);
            payLine = parts.join(' + ');
        }
        const discLabel = discountType === 'percent' && discountInput > 0 ? `Discount (${discountInput}%)` : 'Discount';

        document.getElementById('invoiceContent').innerHTML = `
            <div class="inv-header">
                <div>
                    <div class="inv-salon-name">${salonName}</div>
                    ${s.address    ? `<div style="font-size:12px;color:#718096;margin-top:3px;white-space:pre-line;">${s.address}</div>` : ''}
                    ${s.phone      ? `<div style="font-size:12px;color:#718096;">Tel: ${s.phone}</div>` : ''}
                    ${s.gstNumber  ? `<div style="font-size:12px;color:#718096;">GST: ${s.gstNumber}</div>` : ''}
                    ${data.priceBookName ? `<div style="color:#718096;font-size:13px;margin-top:4px;">${data.priceBookName}</div>` : ''}
                </div>
                <div class="inv-meta">
                    <div><strong>Invoice #</strong> ${billId}</div>
                    <div>${dateStr}</div><div>${timeStr}</div>
                </div>
            </div>
            <div class="inv-customer"><strong>Bill To:</strong> ${data.customerName}</div>
            <table class="inv-items-table">
                <thead><tr>
                    <th>#</th><th>Item</th><th>Staff</th>
                    <th style="text-align:center;">Qty</th>
                    <th style="text-align:right;">Price</th>
                    <th style="text-align:center;">GST%</th>
                    <th style="text-align:right;">Total</th>
                </tr></thead>
                <tbody>
                    ${svcRows.length>0 ? `<tr class="inv-section-header"><td colspan="7">Services</td></tr>${rowHtml(svcRows,0)}` : ''}
                    ${prdRows.length>0 ? `<tr class="inv-section-header"><td colspan="7">Retail Products</td></tr>${rowHtml(prdRows,svcRows.length)}` : ''}
                </tbody>
            </table>
            <div class="inv-totals">
                ${svcSub>0 ? `<div class="inv-total-row"><span>Services Subtotal</span><span>₹${svcSub.toFixed(2)}</span></div>` : ''}
                ${svcGst>0 ? `<div class="inv-total-row"><span>Services GST</span><span>₹${svcGst.toFixed(2)}</span></div>` : ''}
                ${prdSub>0 ? `<div class="inv-total-row"><span>Retail Subtotal</span><span>₹${prdSub.toFixed(2)}</span></div>` : ''}
                ${prdGst>0 ? `<div class="inv-total-row"><span>Retail GST</span><span>₹${prdGst.toFixed(2)}</span></div>` : ''}
                ${discount>0 ? `<div class="inv-total-row"><span>${discLabel}</span><span style="color:#e53e3e;">−₹${discount.toFixed(2)}</span></div>` : ''}
                ${data.tip>0 ? `<div class="inv-total-row"><span>Tip</span><span>₹${Number(data.tip).toFixed(2)}</span></div>` : ''}
                <div class="inv-total-row inv-grand-total"><span>GRAND TOTAL</span><span>₹${Number(grandTotal).toFixed(2)}</span></div>
                <div class="inv-total-row" style="color:#718096;font-size:13px;margin-top:4px;"><span>Payment</span><span>${payLine}</span></div>
            </div>
            <div class="inv-footer">${footerText}</div>`;
        document.getElementById('invoiceOverlay').style.display = 'flex';
    },

    printInvoice() {
        document.body.classList.add('printing-invoice');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-invoice'), 500);
    },

    closeInvoice() {
        document.getElementById('invoiceOverlay').style.display = 'none';
        if (this._invoiceCloseCallback) {
            this._invoiceCloseCallback();
            this._invoiceCloseCallback = null;
        } else {
            Navigation._loaded.delete('billing');
            this.resetBill();
        }
    }
};
