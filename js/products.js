const Products = {
    editingId: null,
    products: [],

    init() {
        document.getElementById('productForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('toggleProductForm').addEventListener('click', () => this.toggleForm());
        document.getElementById('cancelProductBtn').addEventListener('click', () => this.hideForm());
    },

    toggleForm() {
        const form = document.getElementById('productForm');
        const toggleText = document.getElementById('productFormToggleText');
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        if (!isHidden) this.resetForm();
    },

    hideForm() {
        document.getElementById('productForm').style.display = 'none';
        document.getElementById('productFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },

    resetForm() {
        this.editingId = null;
        document.getElementById('productForm').reset();
        document.getElementById('productGst').value = '18';
        document.getElementById('productCurrentStock').value = '0';
        document.getElementById('productBaseStock').value = '0';
        document.getElementById('saveProductBtn').textContent = 'Save Product';
    },

    stockCell(current, base) {
        const curr = Number(current) || 0;
        const bas  = Number(base)    || 0;
        if (bas === 0) return `<span style="color:#718096;">${curr}</span>`;
        if (curr < bas) {
            return `<span style="color:#e53e3e;font-weight:600;" title="Below reorder point">${curr} / ${bas} &#9888;</span>`;
        }
        return `<span style="color:#38a169;">${curr} / ${bas}</span>`;
    },

    async load() {
        const tbody = document.getElementById('productsTableBody');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        try {
            const result = await API.getProducts();
            if (result.status !== 'success') {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#fc8181;">${result.message}</td></tr>`;
                return;
            }
            this.products = result.products;

            const lowCount = result.products.filter(p =>
                p.status === 'active' && Number(p.baseStock) > 0 && Number(p.currentStock) < Number(p.baseStock)
            ).length;
            const indicator = document.getElementById('lowStockIndicator');
            if (indicator) {
                indicator.textContent = lowCount > 0 ? `⚠ ${lowCount} item(s) below reorder point` : '';
                indicator.style.display = lowCount > 0 ? 'block' : 'none';
            }

            if (result.products.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a0aec0;">No products found</td></tr>';
                return;
            }

            tbody.innerHTML = result.products.map(p => `
                <tr>
                    <td>
                        <div style="font-weight:500;">${p.name}</div>
                        ${p.manufacturer ? `<div style="font-size:11px;color:#a0aec0;">${p.manufacturer}</div>` : ''}
                    </td>
                    <td>
                        <span class="status-badge" style="${p.category === 'Retail' ? 'background:#c6f6d5;color:#22543d;' : 'background:#bee3f8;color:#2c5282;'}">
                            ${p.category}
                        </span>
                    </td>
                    <td>${p.uom}</td>
                    <td style="text-align:right;">
                        <div>₹${Number(p.unitCost).toFixed(2)}</div>
                        ${p.category === 'Retail' && p.retailPrice ? `<div style="font-size:11px;color:#718096;">Retail: ₹${Number(p.retailPrice).toFixed(2)}</div>` : ''}
                    </td>
                    <td style="text-align:center;">${p.gst}%</td>
                    <td style="text-align:center;">${this.stockCell(p.currentStock, p.baseStock)}</td>
                    <td>
                        ${p.vendorName ? `<div style="font-size:13px;">${p.vendorName}</div>` : '<span style="color:#a0aec0;">-</span>'}
                        ${p.vendorContact ? `<div style="font-size:11px;color:#718096;">${p.vendorContact}</div>` : ''}
                    </td>
                    <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn action-btn-edit" onclick="Products.edit('${p.id}')">Edit</button>
                            <button class="action-btn" style="background:#e9d8fd;color:#553c9a;" onclick="Products.adjustStock('${p.id}', ${JSON.stringify(p.name)}, ${Number(p.currentStock)})">Stock</button>
                            <button class="action-btn action-btn-delete" onclick="Products.delete('${p.id}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#fc8181;">Error loading products</td></tr>';
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('saveProductBtn');
        const data = {
            name:          document.getElementById('productName').value,
            category:      document.getElementById('productCategory').value,
            uom:           document.getElementById('productUom').value,
            unitCost:      document.getElementById('productUnitCost').value,
            retailPrice:   document.getElementById('productRetailPrice').value,
            gst:           document.getElementById('productGst').value,
            currentStock:  document.getElementById('productCurrentStock').value,
            baseStock:     document.getElementById('productBaseStock').value,
            manufacturer:  document.getElementById('productManufacturer').value,
            vendorName:    document.getElementById('productVendorName').value,
            vendorContact: document.getElementById('productVendorContact').value,
            status:        document.getElementById('productStatus').value
        };
        if (this.editingId) data.id = this.editingId;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';
        try {
            const result = this.editingId
                ? await API.updateProduct(data)
                : await API.addProduct(data);
            if (result.status === 'success') {
                UI.showMessage('productMessage', result.message, 'success');
                this.hideForm();
                await this.load();
            } else {
                UI.showMessage('productMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('productMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = this.editingId ? 'Update Product' : 'Save Product';
        }
    },

    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getProducts();
            const p = result.products.find(p => p.id === id);
            if (p) {
                this.editingId = id;
                document.getElementById('productName').value          = p.name;
                document.getElementById('productCategory').value      = p.category;
                document.getElementById('productUom').value           = p.uom;
                document.getElementById('productUnitCost').value      = p.unitCost;
                document.getElementById('productRetailPrice').value   = p.retailPrice || '';
                document.getElementById('productGst').value           = p.gst || 0;
                document.getElementById('productCurrentStock').value  = p.currentStock || 0;
                document.getElementById('productBaseStock').value     = p.baseStock || 0;
                document.getElementById('productManufacturer').value  = p.manufacturer || '';
                document.getElementById('productVendorName').value    = p.vendorName || '';
                document.getElementById('productVendorContact').value = p.vendorContact || '';
                document.getElementById('productStatus').value        = p.status;
                document.getElementById('saveProductBtn').textContent = 'Update Product';
                document.getElementById('productForm').style.display = 'block';
                document.getElementById('productFormToggleText').textContent = 'Hide Form';
                document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {
            UI.showMessage('productMessage', 'Error loading product', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async adjustStock(id, name, currentStock) {
        const input = prompt(`Adjust stock for "${name}"\nCurrent stock: ${currentStock}\n\nEnter new stock quantity:`);
        if (input === null) return;
        const newStock = parseFloat(input);
        if (isNaN(newStock) || newStock < 0) {
            alert('Please enter a valid number (0 or greater).');
            return;
        }
        UI.showLoading();
        try {
            const result = await API.updateProductStock(id, newStock);
            if (result.status === 'success') {
                UI.showMessage('productMessage', `Stock updated for "${name}"`, 'success');
                await this.load();
            } else {
                UI.showMessage('productMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('productMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async delete(id) {
        if (!confirm('Are you sure you want to delete this product?')) return;
        UI.showLoading();
        try {
            const result = await API.deleteProduct(id);
            if (result.status === 'success') {
                UI.showMessage('productMessage', result.message, 'success');
                await this.load();
            } else {
                UI.showMessage('productMessage', result.message, 'error');
            }
        } catch (e) {
            UI.showMessage('productMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    generatePO() {
        const belowBase = this.products.filter(p =>
            p.status === 'active' &&
            Number(p.baseStock) > 0 &&
            Number(p.currentStock) < Number(p.baseStock)
        );

        if (belowBase.length === 0) {
            UI.showMessage('productMessage', 'All active products are at or above reorder points. No purchase orders needed.', 'success');
            return;
        }

        // Group by vendor
        const byVendor = {};
        belowBase.forEach(p => {
            const vendor = p.vendorName || 'Unknown Vendor';
            if (!byVendor[vendor]) byVendor[vendor] = { contact: p.vendorContact || '', items: [] };
            const qty = Number(p.baseStock) - Number(p.currentStock);
            byVendor[vendor].items.push({
                name: p.name, category: p.category, uom: p.uom,
                qty, unitCost: Number(p.unitCost), gst: Number(p.gst),
                subtotal: qty * Number(p.unitCost)
            });
        });

        let vendorBlocks = '';
        let grandTotal   = 0;
        const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        Object.entries(byVendor).forEach(([vendorName, vendor]) => {
            const subtotal  = vendor.items.reduce((s, i) => s + i.subtotal, 0);
            const gstAmt    = vendor.items.reduce((s, i) => s + (i.subtotal * i.gst / 100), 0);
            const total     = subtotal + gstAmt;
            grandTotal += total;

            vendorBlocks += `
                <div class="po-vendor-block">
                    <div class="po-vendor-header">
                        <div>
                            <strong style="font-size:15px;">${vendorName}</strong>
                            ${vendor.contact ? `<span style="color:#718096;margin-left:12px;font-size:13px;">&#9990; ${vendor.contact}</span>` : ''}
                        </div>
                        <strong style="color:#667eea;font-size:15px;">₹${total.toFixed(2)}</strong>
                    </div>
                    <div class="table-container">
                        <table class="po-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th style="text-align:center;">Qty to Order</th>
                                    <th style="text-align:right;">Unit Cost</th>
                                    <th style="text-align:right;">GST%</th>
                                    <th style="text-align:right;">Subtotal</th>
                                    <th style="text-align:right;">GST Amt</th>
                                    <th style="text-align:right;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vendor.items.map(item => {
                                    const gst = item.subtotal * item.gst / 100;
                                    return `<tr>
                                        <td>${item.name}</td>
                                        <td><span style="font-size:11px;padding:2px 6px;border-radius:3px;${item.category === 'Retail' ? 'background:#c6f6d5;color:#22543d;' : 'background:#bee3f8;color:#2c5282;'}">${item.category}</span></td>
                                        <td style="text-align:center;font-weight:600;">${item.qty} ${item.uom}</td>
                                        <td style="text-align:right;">₹${item.unitCost.toFixed(2)}</td>
                                        <td style="text-align:right;">${item.gst}%</td>
                                        <td style="text-align:right;">₹${item.subtotal.toFixed(2)}</td>
                                        <td style="text-align:right;">₹${gst.toFixed(2)}</td>
                                        <td style="text-align:right;font-weight:600;">₹${(item.subtotal + gst).toFixed(2)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="font-weight:600;background:#f7fafc;">
                                    <td colspan="5" style="text-align:right;padding:8px 12px;">Vendor Total</td>
                                    <td style="text-align:right;padding:8px 12px;">₹${subtotal.toFixed(2)}</td>
                                    <td style="text-align:right;padding:8px 12px;">₹${gstAmt.toFixed(2)}</td>
                                    <td style="text-align:right;padding:8px 12px;color:#667eea;">₹${total.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>`;
        });

        document.getElementById('poContent').innerHTML = `
            <div style="color:#718096;font-size:13px;margin-bottom:20px;">
                Generated: ${today} &nbsp;·&nbsp;
                ${belowBase.length} product(s) below reorder point &nbsp;·&nbsp;
                ${Object.keys(byVendor).length} vendor(s)
            </div>
            ${vendorBlocks}
            <div style="text-align:right;font-size:20px;font-weight:700;color:#2d3748;padding:20px 0 0;border-top:2px solid #e2e8f0;margin-top:8px;">
                Grand Total (incl. GST): ₹${grandTotal.toFixed(2)}
            </div>`;

        document.getElementById('poCard').style.display = 'block';
        document.getElementById('poCard').scrollIntoView({ behavior: 'smooth' });
    },

    closePO() {
        document.getElementById('poCard').style.display = 'none';
    },

    printPO() {
        window.print();
    }
};
