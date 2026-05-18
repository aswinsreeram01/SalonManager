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
    },

    async load() {
        UI.showLoading();
        try {
            const [custRes, staffRes, svcRes, sgRes, prodRes, pbRes] = await Promise.all([
                API.getCustomers(), API.getStaff(), API.getServices(),
                API.getServiceGroups(), API.getProducts(), API.getPriceBooks()
            ]);
            this.customers = custRes.customers || [];
            this.staff = (staffRes.staff || []).filter(s => s.status === 'active');
            const sgMap = {};
            (sgRes.serviceGroups || []).forEach(sg => { sgMap[sg.id] = sg; });
            this.services = (svcRes.services || [])
                .filter(s => s.status === 'active')
                .map(s => ({ ...s, gstPct: Number((sgMap[s.serviceGroupId] || {}).gst) || 0 }));
            this.products     = (prodRes.products || []).filter(p => p.status === 'active' && p.category === 'Retail');
            this.profProducts = (prodRes.products || []).filter(p => p.status === 'active' && p.category === 'Professional');
            this.priceBooks = (pbRes.priceBooks || []).filter(pb => pb.status === 'active');
            const pbSelect = document.getElementById('billingPriceBook');
            pbSelect.innerHTML = '<option value="">No Price Book (use defaults)</option>' +
                this.priceBooks.map(pb => `<option value="${pb.id}">${pb.name}</option>`).join('');
            this.resetBill();
        } catch(e) {
            UI.showMessage('billingMessage', 'Error loading billing data. Please refresh.', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    resetBill() {
        this.rows = [];
        this._nextRowId = 0;
        this.selectedCustomerId = null;
        this.selectedCustomerName = '';
        this.selectedPriceBookId = null;
        const phoneEl = document.getElementById('billingPhone');
        if (phoneEl) { phoneEl.value = ''; phoneEl.classList.remove('field-error'); }
        const nameEl = document.getElementById('billingCustomerName');
        if (nameEl) nameEl.textContent = '';
        const pbEl = document.getElementById('billingPriceBook');
        if (pbEl) pbEl.value = '';
        const dtEl = document.getElementById('discountType');
        if (dtEl) dtEl.value = 'value';
        const discEl = document.getElementById('billingDiscount');
        if (discEl) discEl.value = '';
        const tipEl = document.getElementById('billingTip');
        if (tipEl) tipEl.value = '';
        const cashRadio = document.querySelector('input[name="paymentMode"][value="Cash"]');
        if (cashRadio) cashRadio.checked = true;
        this.onPaymentModeChange('Cash');
        this.addRow();
        this.recalcTotals();
    },

    lookupCustomer(phone) {
        const nameEl  = document.getElementById('billingCustomerName');
        const phoneEl = document.getElementById('billingPhone');
        if (!phone) {
            this.selectedCustomerId = null;
            this.selectedCustomerName = '';
            if (nameEl)  nameEl.textContent = '';
            if (phoneEl) phoneEl.classList.remove('field-error');
            this.liveValidate();
            return;
        }
        const customer = this.customers.find(c => String(c.phone).trim() === String(phone).trim());
        if (customer) {
            this.selectedCustomerId   = String(customer.phone).trim();
            this.selectedCustomerName = customer.name;
            if (nameEl)  { nameEl.textContent = customer.name; nameEl.style.color = '#38a169'; }
            if (phoneEl) phoneEl.classList.remove('field-error');
        } else if (phone.length >= 10) {
            this.selectedCustomerId   = null;
            this.selectedCustomerName = '';
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
            if (nameEl)  nameEl.textContent = '';
            if (phoneEl) phoneEl.classList.remove('field-error');
        }
        this.liveValidate();
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
                this.customers.push({ name, phone });
                this.selectedCustomerId   = String(phone).trim();
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

    onProfProductChange(rowId, productId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        const prod = this.profProducts.find(p => p.id === productId);
        row.profProductId   = productId;
        row.profProductName = prod ? prod.name : '';
        row.profUom         = prod ? (prod.uom || '') : '';
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
    },

    onProfQtyChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (row) row.profQty = val;
    },

    recalcRow(row) {
        row.lineSubtotal = Math.round(row.qty * row.unitPrice * 100) / 100;
        row.lineGst      = Math.round(row.lineSubtotal * row.gstPct / 100 * 100) / 100;
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

            const mainRow = `<tr data-row="${row.rowId}">
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
                <td style="text-align:center;color:#718096;">${row.gstPct}%</td>
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
                        <select class="bill-select" style="font-size:12px;flex:1;min-width:140px;max-width:220px;"
                                onchange="Billing.onProfProductChange(${row.rowId}, this.value)">
                            <option value="">— None —</option>
                            ${noProfProds}${profOpts}
                        </select>
                        <input type="number" class="bill-input" min="0" step="0.01" value="${row.profQty || ''}"
                               style="width:70px;font-size:12px;${qtyOpacity}" placeholder="Qty"
                               oninput="Billing.onProfQtyChange(${row.rowId}, this.value)" ${qtyDisabled}>
                        <span class="prof-uom" style="font-size:12px;color:#4a5568;min-width:32px;">${row.profUom || '—'}</span>
                    </div>
                </td>
            </tr>`;

            return mainRow + subRow;
        }).join('');
    },

    recalcTotals() {
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

        const tip   = Math.max(0, Number((document.getElementById('billingTip') || {}).value) || 0);
        const grand = Math.max(0, baseAmt - disc + tip);

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = '₹' + v.toFixed(2); };
        set('sumSvcSubtotal', svcSub); set('sumSvcGst', svcGst);
        set('sumPrdSubtotal', prdSub); set('sumPrdGst', prdGst);
        set('sumGrandTotal', grand);
        this.liveValidate();
    },

    liveValidate() {
        const checks = [];
        checks.push({ ok: !!this.selectedCustomerId, msg: 'Select a customer by phone number' });
        const filledRows = this.rows.filter(r => r.itemId);
        checks.push({ ok: filledRows.length > 0, msg: 'Add at least one service or product' });
        filledRows.forEach(row => {
            const n = this.rows.indexOf(row) + 1;
            if (!row.staffId)       checks.push({ ok: false, msg: `Row ${n} (${row.itemName}): Select a staff member` });
            if (!row.qty || row.qty <= 0) checks.push({ ok: false, msg: `Row ${n} (${row.itemName}): Qty must be > 0` });
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
        const payload = {
            customerId: this.selectedCustomerId,
            customerName: this.selectedCustomerName,
            priceBookId: this.selectedPriceBookId || '',
            priceBookName: pbName,
            discount, discountType, discountInput, tip,
            paymentMode: mode,
            cashAmt: mode === 'Cash' ? grand : (mode === 'Split' ? (Number((document.getElementById('splitCash')||{}).value)||0) : 0),
            cardAmt: mode === 'Card' ? grand : (mode === 'Split' ? (Number((document.getElementById('splitCard')||{}).value)||0) : 0),
            upiAmt:  mode === 'UPI'  ? grand : (mode === 'Split' ? (Number((document.getElementById('splitUpi') ||{}).value)||0) : 0),
            items: filledRows
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
