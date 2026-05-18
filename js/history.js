const History = {
    init() {},

    async load() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">Loading...</td></tr>';
        try {
            const result = await API.getBills();
            const bills = (result.bills || []).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (bills.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;">No bills found</td></tr>';
                return;
            }
            tbody.innerHTML = bills.map(b => {
                const d = b.date ? new Date(b.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—';
                return `<tr>
                    <td>${d}</td>
                    <td style="font-size:12px;color:#718096;">${b.billId}</td>
                    <td>${b.customerName || '—'}</td>
                    <td style="text-align:right;font-weight:600;">₹${Number(b.grandTotal||0).toFixed(2)}</td>
                    <td>${b.paymentMode || '—'}</td>
                    <td><span class="status-badge status-${b.status}">${b.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn action-btn-edit" onclick="History.viewBill('${b.billId}')">View</button>
                            ${b.status === 'active' ? `<button class="action-btn action-btn-delete" onclick="History.voidBill('${b.billId}')">Void</button>` : ''}
                        </div>
                    </td>
                </tr>`;
            }).join('');
        } catch(e) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#fc8181;">Error loading bills</td></tr>';
        }
    },

    async viewBill(billId) {
        UI.showLoading();
        try {
            const [billsRes, itemsRes] = await Promise.all([
                API.getBills(),
                API.getBillItems(billId)
            ]);
            const bill = (billsRes.bills || []).find(b => b.billId === billId);
            if (!bill) { alert('Bill not found'); return; }
            const items = (itemsRes.items || []).map(i => ({
                type: i.type, itemId: i.refId, itemName: i.itemName,
                staffName: i.staffName, qty: Number(i.qty),
                unitPrice: Number(i.unitPrice), gstPct: Number(i.gstPct),
                lineSubtotal: Number(i.lineSubtotal), lineGst: Number(i.lineGst), lineTotal: Number(i.lineTotal)
            }));
            const payload = {
                customerName: bill.customerName || '—',
                priceBookName: '',
                discount: Number(bill.discount) || 0,
                discountType: bill.discountType || 'value',
                discountInput: 0,
                tip: Number(bill.tip) || 0,
                paymentMode: bill.paymentMode || 'Cash',
                cashAmt: Number(bill.cashAmt) || 0,
                cardAmt: Number(bill.cardAmt) || 0,
                upiAmt:  Number(bill.upiAmt)  || 0,
                items
            };
            Billing.renderInvoice(bill.billId, payload, bill.grandTotal, () => {});
        } catch(e) {
            UI.showMessage('historyMessage', 'Error loading bill details. Please try again.', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async voidBill(billId) {
        if (!confirm(`Void bill ${billId}?\n\nThis action cannot be undone.`)) return;
        UI.showLoading();
        try {
            const result = await API.voidBill(billId);
            if (result.status === 'success') {
                UI.showMessage('historyMessage', 'Bill voided successfully.', 'success');
                Navigation._loaded.delete('history');
                await this.load();
            } else {
                UI.showMessage('historyMessage', result.message, 'error');
            }
        } catch(e) {
            UI.showMessage('historyMessage', 'Network error. Please try again.', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
