const Billing = {
    _nextRowId: 0,
    customers: [],
    staff: [],
    services: [],
    products: [],
    priceBooks: [],
    pbItemsCache: {},
    rows: [],
    selectedCustomerId: null,
    selectedCustomerName: '',
    selectedPriceBookId: null,
    _phoneDebounce: null,

    init() {
        document.getElementById('billingPhone').addEventListener('input', e => {
            clearTimeout(this._phoneDebounce);
            this._phoneDebounce = setTimeout(() => this.lookupCustomer(e.target.value.trim()), 600);
        });
        document.getElementById('billingPriceBook').addEventListener('change', e => {
            this.onPriceBookChange(e.target.value);
        });
        document.getElementById('billingDiscount').addEventListener('input', () => this.recalcTotals());
        document.getElementById('billingTip').addEventListener('input', () => this.recalcTotals());
        document.querySelectorAll('input[name="paymentMode"]').forEach(r => {
            r.addEventListener('change', () => this.onPaymentModeChange(r.value));
        });
        document.getElementById('newCustomerForm').addEventListener('submit', e => this.saveNewCustomer(e));
        document.getElementById('cancelNewCustomer').addEventListener('click', () => this.closeNewCustomerModal());
    },

    async load() {
        UI.showLoading();
        try {
            const [custRes, staffRes, svcRes, sgRes, prodRes, pbRes] = await Promise.all([
                API.getCustomers(),
                API.getStaff(),
                API.getServices(),
                API.getServiceGroups(),
                API.getProducts(),
                API.getPriceBooks()
            ]);
            this.customers = custRes.customers || [];
            this.staff = (staffRes.staff || []).filter(s => s.status === 'active');

            const sgMap = {};
            (sgRes.serviceGroups || []).forEach(sg => { sgMap[sg.id] = sg; });
            this.services = (svcRes.services || [])
                .filter(s => s.status === 'active')
                .map(s => ({ ...s, gstPct: Number((sgMap[s.serviceGroupId] || {}).gst) || 0 }));

            this.products = (prodRes.products || []).filter(p => p.status === 'active' && p.category === 'Retail');
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
        document.getElementById('billingPhone').value = '';
        document.getElementById('billingCustomerName').textContent = '';
        document.getElementById('billingPriceBook').value = '';
        document.getElementById('billingDiscount').value = '';
        document.getElementById('billingTip').value = '';
        const cashRadio = document.querySelector('input[name="paymentMode"][value="Cash"]');
        if (cashRadio) cashRadio.checked = true;
        this.onPaymentModeChange('Cash');
        this.addRow();
        this.recalcTotals();
    },

    lookupCustomer(phone) {
        const nameEl = document.getElementById('billingCustomerName');
        if (!phone) {
            this.selectedCustomerId = null;
            this.selectedCustomerName = '';
            nameEl.textContent = '';
            return;
        }
        // c.phone may be a number from Google Sheets — compare as strings
        const customer = this.customers.find(c => String(c.phone).trim() === String(phone).trim());
        if (customer) {
            this.selectedCustomerId = String(customer.phone).trim(); // use phone as unique key
            this.selectedCustomerName = customer.name;
            nameEl.textContent = customer.name;
            nameEl.style.color = '#38a169';
        } else if (phone.length >= 10) {
            this.selectedCustomerId = null;
            this.selectedCustomerName = '';
            nameEl.textContent = 'Customer not found — ';
            nameEl.style.color = '#e53e3e';
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = 'Add new customer';
            link.style.color = '#667eea';
            link.onclick = e => { e.preventDefault(); this.showNewCustomerModal(phone); };
            nameEl.appendChild(link);
        } else {
            this.selectedCustomerId = null;
            nameEl.textContent = '';
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
        const name = document.getElementById('newCustomerName').value.trim();
        const phone = document.getElementById('newCustomerPhone').value.trim();
        if (!name || !phone) return;
        const btn = document.getElementById('saveNewCustomerBtn');
        btn.disabled = true;
        try {
            const result = await API.addCustomer({ name, phone });
            if (result.status === 'success') {
                const newCust = { name, phone };
                this.customers.push(newCust);
                this.selectedCustomerId = String(phone).trim(); // use phone as unique key
                this.selectedCustomerName = name;
                const nameEl = document.getElementById('billingCustomerName');
                nameEl.textContent = name;
                nameEl.style.color = '#38a169';
                this.closeNewCustomerModal();
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
        if (!pbId) {
            this.rows.forEach(row => {
                if (row.type === 'service' && row.itemId) {
                    row.unitPrice = this.getPriceForService(row.itemId);
                    this.recalcRow(row);
                }
            });
            this.renderRows();
            this.recalcTotals();
            return;
        }
        if (!this.pbItemsCache[pbId]) {
            UI.showLoading();
            try {
                const result = await API.getPriceBookItems(pbId);
                const cache = {};
                (result.items || []).filter(i => !i.isDefault).forEach(i => {
                    cache[i.serviceId] = Number(i.price);
                });
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
        return {
            rowId: this._nextRowId++,
            type: 'service', itemId: '', itemName: '',
            staffId: '', staffName: '',
            qty: 1, unitPrice: 0, gstPct: 0,
            lineSubtotal: 0, lineGst: 0, lineTotal: 0
        };
    },

    addRow() {
        this.rows.push(this._newRow());
        this.renderRows();
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
        row.type = type;
        row.itemId = ''; row.itemName = '';
        row.unitPrice = 0; row.gstPct = 0;
        this.recalcRow(row);
        this.renderRows();
        this.recalcTotals();
    },

    onItemChange(rowId, itemId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row || !itemId) return;
        row.itemId = itemId;
        if (row.type === 'service') {
            const svc = this.services.find(s => s.id === itemId);
            if (svc) {
                row.itemName = svc.name;
                row.unitPrice = this.getPriceForService(itemId);
                row.gstPct = svc.gstPct || 0;
            }
        } else {
            const prod = this.products.find(p => p.id === itemId);
            if (prod) {
                row.itemName = prod.name;
                row.unitPrice = Number(prod.retailPrice) || 0;
                row.gstPct = Number(prod.gst) || 0;
            }
        }
        this.recalcRow(row);
        this.renderRows();
        this.recalcTotals();
    },

    onStaffChange(rowId, staffId) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        const s = this.staff.find(st => st.id === staffId);
        row.staffId = staffId;
        row.staffName = s ? s.name : '';
    },

    onQtyChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        row.qty = Math.max(0, Number(val) || 0);
        this.recalcRow(row);
        this._updateRowTotals(rowId);
        this.recalcTotals();
    },

    onPriceChange(rowId, val) {
        const row = this.rows.find(r => r.rowId === rowId);
        if (!row) return;
        row.unitPrice = Math.max(0, Number(val) || 0);
        this.recalcRow(row);
        this._updateRowTotals(rowId);
        this.recalcTotals();
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
            const svcOpts = this.services.map(s =>
                `<option value="${s.id}" ${row.itemId === s.id ? 'selected' : ''}>${s.name}</option>`
            ).join('');
            const prdOpts = this.products.map(p =>
                `<option value="${p.id}" ${row.itemId === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('');
            const staffOpts = this.staff.map(s =>
                `<option value="${s.id}" ${row.staffId === s.id ? 'selected' : ''}>${s.name}</option>`
            ).join('');
            const itemOpts = row.type === 'service'
                ? `<option value="">Select service…</option>${svcOpts}`
                : `<option value="">Select product…</option>${prdOpts}`;

            return `<tr data-row="${row.rowId}">
                <td style="text-align:center;color:#a0aec0;width:32px;">${idx + 1}</td>
                <td>
                    <select class="bill-select" onchange="Billing.onTypeChange(${row.rowId}, this.value)">
                        <option value="service" ${row.type === 'service' ? 'selected' : ''}>Service</option>
                        <option value="product" ${row.type === 'product' ? 'selected' : ''}>Product</option>
                    </select>
                </td>
                <td>
                    <select class="bill-select bill-item-select" onchange="Billing.onItemChange(${row.rowId}, this.value)">
                        ${itemOpts}
                    </select>
                </td>
                <td>
                    <select class="bill-select" onchange="Billing.onStaffChange(${row.rowId}, this.value)">
                        <option value="">— None —</option>
                        ${staffOpts}
                    </select>
                </td>
                <td>
                    <input type="number" class="bill-input" value="${row.qty}" min="0" step="1"
                        oninput="Billing.onQtyChange(${row.rowId}, this.value)"
                        style="width:60px;text-align:center;">
                </td>
                <td>
                    <input type="number" class="bill-input" value="${row.unitPrice || ''}" min="0" step="0.01"
                        oninput="Billing.onPriceChange(${row.rowId}, this.value)"
                        style="width:90px;text-align:right;" placeholder="0.00">
                </td>
                <td style="text-align:center;color:#718096;white-space:nowrap;">${row.gstPct}%</td>
                <td style="text-align:right;" class="cell-subtotal">₹${row.lineSubtotal.toFixed(2)}</td>
                <td style="text-align:right;" class="cell-gst">₹${row.lineGst.toFixed(2)}</td>
                <td style="text-align:right;font-weight:600;" class="cell-total">₹${row.lineTotal.toFixed(2)}</td>
                <td style="text-align:center;width:32px;">
                    ${this.rows.length > 1
                        ? `<button class="bill-del-btn" onclick="Billing.removeRow(${row.rowId})" title="Remove row">✕</button>`
                        : ''}
                </td>
            </tr>`;
        }).join('');
    },

    recalcTotals() {
        const svcRows = this.rows.filter(r => r.type === 'service');
        const prdRows = this.rows.filter(r => r.type === 'product');
        const svcSub  = svcRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const svcGst  = svcRows.reduce((s, r) => s + r.lineGst, 0);
        const prdSub  = prdRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const prdGst  = prdRows.reduce((s, r) => s + r.lineGst, 0);
        const disc    = Math.max(0, Number(document.getElementById('billingDiscount').value) || 0);
        const tip     = Math.max(0, Number(document.getElementById('billingTip').value) || 0);
        const grand   = svcSub + svcGst + prdSub + prdGst - disc + tip;
        const fmt = v => '₹' + v.toFixed(2);
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
        set('sumSvcSubtotal', svcSub);
        set('sumSvcGst', svcGst);
        set('sumPrdSubtotal', prdSub);
        set('sumPrdGst', prdGst);
        set('sumGrandTotal', grand);
    },

    onPaymentModeChange(mode) {
        const splitDiv = document.getElementById('splitInputs');
        if (splitDiv) splitDiv.style.display = mode === 'Split' ? 'block' : 'none';
    },

    _getGrandTotal() {
        const el = document.getElementById('sumGrandTotal');
        return el ? parseFloat(el.textContent.replace('₹', '')) || 0 : 0;
    },

    validate() {
        // 1. Customer required
        if (!this.selectedCustomerId) {
            UI.showMessage('billingMessage', 'Please enter a customer phone number and select a customer.', 'error');
            document.getElementById('billingPhone').focus();
            return false;
        }

        // 2. At least one item required
        const filledRows = this.rows.filter(r => r.itemId);
        if (filledRows.length === 0) {
            UI.showMessage('billingMessage', 'Please add at least one service or product.', 'error');
            return false;
        }

        // 3. All fields in each item row are required
        for (let i = 0; i < filledRows.length; i++) {
            const r = filledRows[i];
            const rowNum = this.rows.indexOf(r) + 1;
            if (!r.itemId) {
                UI.showMessage('billingMessage', `Row ${rowNum}: Please select a service or product.`, 'error');
                return false;
            }
            if (!r.staffId) {
                UI.showMessage('billingMessage', `Row ${rowNum} (${r.itemName}): Please select a staff member.`, 'error');
                return false;
            }
            if (!r.qty || r.qty <= 0) {
                UI.showMessage('billingMessage', `Row ${rowNum} (${r.itemName}): Quantity must be greater than 0.`, 'error');
                return false;
            }
            if (r.unitPrice === '' || r.unitPrice === null || r.unitPrice === undefined || isNaN(r.unitPrice)) {
                UI.showMessage('billingMessage', `Row ${rowNum} (${r.itemName}): Please enter a valid price.`, 'error');
                return false;
            }
        }

        // 4. Split payment must equal grand total
        const mode = (document.querySelector('input[name="paymentMode"]:checked') || {}).value;
        if (mode === 'Split') {
            const cash  = Number(document.getElementById('splitCash').value) || 0;
            const card  = Number(document.getElementById('splitCard').value) || 0;
            const upi   = Number(document.getElementById('splitUpi').value) || 0;
            const grand = this._getGrandTotal();
            if (cash + card + upi === 0) {
                UI.showMessage('billingMessage', 'Please enter the split payment amounts.', 'error');
                return false;
            }
            if (Math.abs(cash + card + upi - grand) > 0.01) {
                UI.showMessage('billingMessage',
                    `Split total ₹${(cash+card+upi).toFixed(2)} does not match Grand Total ₹${grand.toFixed(2)}. Please adjust the amounts.`, 'error');
                return false;
            }
        }

        return true;
    },

    async save() {
        if (!this.validate()) return;
        const mode  = (document.querySelector('input[name="paymentMode"]:checked') || {}).value || 'Cash';
        const disc  = Math.max(0, Number(document.getElementById('billingDiscount').value) || 0);
        const tip   = Math.max(0, Number(document.getElementById('billingTip').value) || 0);
        const grand = this._getGrandTotal();
        const filledRows = this.rows.filter(r => r.itemId && r.qty > 0);
        const pbName = (this.priceBooks.find(pb => pb.id === this.selectedPriceBookId) || {}).name || '';

        const payload = {
            customerId: this.selectedCustomerId,
            customerName: this.selectedCustomerName,
            priceBookId: this.selectedPriceBookId || '',
            priceBookName: pbName,
            discount: disc, tip,
            paymentMode: mode,
            cashAmt: mode === 'Cash'  ? grand : (mode === 'Split' ? (Number(document.getElementById('splitCash').value) || 0) : 0),
            cardAmt: mode === 'Card'  ? grand : (mode === 'Split' ? (Number(document.getElementById('splitCard').value) || 0) : 0),
            upiAmt:  mode === 'UPI'   ? grand : (mode === 'Split' ? (Number(document.getElementById('splitUpi').value) || 0) : 0),
            items: filledRows
        };

        const btn = document.getElementById('saveBillBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Saving…';
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
            btn.disabled = false;
            btn.textContent = 'Save & Generate Invoice';
        }
    },

    renderInvoice(billId, data, grandTotal) {
        const today   = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const svcRows = (data.items || []).filter(i => i.type === 'service');
        const prdRows = (data.items || []).filter(i => i.type === 'product');
        const svcSub  = svcRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const svcGst  = svcRows.reduce((s, r) => s + r.lineGst, 0);
        const prdSub  = prdRows.reduce((s, r) => s + r.lineSubtotal, 0);
        const prdGst  = prdRows.reduce((s, r) => s + r.lineGst, 0);

        const rowHtml = (rows, offset) => rows.map((r, i) => `
            <tr>
                <td style="color:#a0aec0;">${offset + i + 1}</td>
                <td>${r.itemName}</td>
                <td>${r.staffName || '—'}</td>
                <td style="text-align:center;">${r.qty}</td>
                <td style="text-align:right;">₹${Number(r.unitPrice).toFixed(2)}</td>
                <td style="text-align:center;">${r.gstPct}%</td>
                <td style="text-align:right;">₹${Number(r.lineTotal).toFixed(2)}</td>
            </tr>`).join('');

        let paymentLine = data.paymentMode;
        if (data.paymentMode === 'Split') {
            const parts = [];
            if (data.cashAmt > 0) parts.push(`Cash ₹${Number(data.cashAmt).toFixed(2)}`);
            if (data.cardAmt > 0) parts.push(`Card ₹${Number(data.cardAmt).toFixed(2)}`);
            if (data.upiAmt  > 0) parts.push(`UPI ₹${Number(data.upiAmt).toFixed(2)}`);
            paymentLine = parts.join(' + ');
        }

        document.getElementById('invoiceContent').innerHTML = `
            <div class="inv-header">
                <div>
                    <div class="inv-salon-name">Salon Manager</div>
                    ${data.priceBookName ? `<div style="color:#718096;font-size:13px;margin-top:4px;">${data.priceBookName}</div>` : ''}
                </div>
                <div class="inv-meta">
                    <div><strong>Invoice #</strong> ${billId}</div>
                    <div>${dateStr}</div>
                    <div>${timeStr}</div>
                </div>
            </div>
            <div class="inv-customer"><strong>Bill To:</strong> ${data.customerName}</div>
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>#</th><th>Item</th><th>Staff</th>
                        <th style="text-align:center;">Qty</th>
                        <th style="text-align:right;">Price</th>
                        <th style="text-align:center;">GST%</th>
                        <th style="text-align:right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${svcRows.length > 0 ? `<tr class="inv-section-header"><td colspan="7">Services</td></tr>${rowHtml(svcRows, 0)}` : ''}
                    ${prdRows.length > 0 ? `<tr class="inv-section-header"><td colspan="7">Retail Products</td></tr>${rowHtml(prdRows, svcRows.length)}` : ''}
                </tbody>
            </table>
            <div class="inv-totals">
                ${svcSub > 0 ? `<div class="inv-total-row"><span>Services Subtotal</span><span>₹${svcSub.toFixed(2)}</span></div>` : ''}
                ${svcGst > 0 ? `<div class="inv-total-row"><span>Services GST</span><span>₹${svcGst.toFixed(2)}</span></div>` : ''}
                ${prdSub > 0 ? `<div class="inv-total-row"><span>Retail Subtotal</span><span>₹${prdSub.toFixed(2)}</span></div>` : ''}
                ${prdGst > 0 ? `<div class="inv-total-row"><span>Retail GST</span><span>₹${prdGst.toFixed(2)}</span></div>` : ''}
                ${data.discount > 0 ? `<div class="inv-total-row"><span>Discount</span><span style="color:#e53e3e;">−₹${Number(data.discount).toFixed(2)}</span></div>` : ''}
                ${data.tip > 0 ? `<div class="inv-total-row"><span>Tip</span><span>₹${Number(data.tip).toFixed(2)}</span></div>` : ''}
                <div class="inv-total-row inv-grand-total"><span>GRAND TOTAL</span><span>₹${Number(grandTotal).toFixed(2)}</span></div>
                <div class="inv-total-row" style="color:#718096;font-size:13px;margin-top:4px;"><span>Payment</span><span>${paymentLine}</span></div>
            </div>
            <div class="inv-footer">Thank you for your visit!</div>`;

        document.getElementById('invoiceOverlay').style.display = 'flex';
    },

    printInvoice() {
        document.body.classList.add('printing-invoice');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-invoice'), 500);
    },

    closeInvoice() {
        document.getElementById('invoiceOverlay').style.display = 'none';
        Navigation._loaded.delete('billing');
        this.resetBill();
    }
};
