const Expenses = {
  _expenses: [],
  _editingId: null,

  CATEGORIES: [
    'Rent', 'Utilities', 'Staff Salary', 'Supplies',
    'Equipment', 'Marketing', 'Maintenance', 'Miscellaneous'
  ],

  CAT_COLORS: {
    'Rent':          '#e53e3e',
    'Utilities':     '#dd6b20',
    'Staff Salary':  '#d69e2e',
    'Supplies':      '#38a169',
    'Equipment':     '#3182ce',
    'Marketing':     '#805ad5',
    'Maintenance':   '#319795',
    'Miscellaneous': '#718096'
  },

  init() {
    document.getElementById('expAddBtn').addEventListener('click', () => this.openForm());
    document.getElementById('expCancelFormBtn').addEventListener('click', () => this.closeForm());
    document.getElementById('expenseForm').addEventListener('submit', e => this.handleSubmit(e));

    document.getElementById('expDatePreset').addEventListener('change', e => {
      document.getElementById('expCustomRange').style.display =
        e.target.value === 'custom' ? 'flex' : 'none';
      if (e.target.value !== 'custom') this._applyAndRender();
    });
    document.getElementById('expCustomFrom').addEventListener('change', () => this._applyAndRender());
    document.getElementById('expCustomTo').addEventListener('change', () => this._applyAndRender());
    document.getElementById('expCategoryFilter').addEventListener('change', () => this._applyAndRender());
    document.getElementById('expPaymentFilter').addEventListener('change', () => this._applyAndRender());
  },

  async load() {
    UI.showLoading();
    try {
      const res = await API.getExpenses();
      if (res.status === 'success') {
        this._expenses = res.expenses || [];
        this._applyAndRender();
      } else {
        UI.showMessage('expMessage', res.message || 'Failed to load expenses', 'error');
      }
    } catch(e) {
      UI.showMessage('expMessage', 'Failed to load expenses', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  _applyAndRender() {
    const filtered = this._filter(this._expenses);
    this._renderSummary(filtered);
    this._renderList(filtered);
  },

  _filter(expenses) {
    const preset  = document.getElementById('expDatePreset').value;
    const catF    = document.getElementById('expCategoryFilter').value;
    const payF    = document.getElementById('expPaymentFilter').value;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let from = null, to = null;

    if (preset === 'week') {
      from = new Date(today); from.setDate(today.getDate() - today.getDay());
      to   = new Date(from);  to.setDate(from.getDate() + 6); to.setHours(23,59,59);
    } else if (preset === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    } else if (preset === 'lastmonth') {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    } else if (preset === 'year') {
      from = new Date(today.getFullYear(), 0, 1);
      to   = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
    } else if (preset === 'custom') {
      const cf = document.getElementById('expCustomFrom').value;
      const ct = document.getElementById('expCustomTo').value;
      if (cf) from = new Date(cf);
      if (ct) { to = new Date(ct); to.setHours(23, 59, 59); }
    }

    return expenses.filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      if (catF && e.category !== catF) return false;
      if (payF && e.paymentMode !== payF) return false;
      return true;
    });
  },

  _renderSummary(expenses) {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    document.getElementById('expSummaryTotal').textContent = this._fmt(total);
    document.getElementById('expSummaryCount').textContent = expenses.length;

    const byCategory = {};
    expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    document.getElementById('expBreakdownBody').innerHTML = sorted.length
      ? sorted.map(([cat, amt]) => {
          const pct   = total > 0 ? ((amt / total) * 100).toFixed(1) : '0.0';
          const color = this.CAT_COLORS[cat] || '#718096';
          return `<tr>
            <td><span class="exp-cat-badge" style="background:${color}20;color:${color}">${cat}</span></td>
            <td style="text-align:right;font-weight:600;">${this._fmt(amt)}</td>
            <td style="text-align:right;color:#718096;">${pct}%</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="3" style="text-align:center;color:#a0aec0;padding:16px;">No data</td></tr>';
  },

  _renderList(expenses) {
    const tbody = document.getElementById('expListBody');
    if (!expenses.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0;padding:24px;">No expenses found</td></tr>';
      return;
    }
    const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sorted.map(e => {
      const color = this.CAT_COLORS[e.category] || '#718096';
      return `<tr>
        <td style="white-space:nowrap;">${this._fmtDate(e.date)}</td>
        <td><span class="exp-cat-badge" style="background:${color}20;color:${color}">${this._esc(e.category)}</span></td>
        <td>${this._esc(e.vendor || '—')}</td>
        <td>${this._esc(e.description || '—')}</td>
        <td style="text-align:right;font-weight:600;white-space:nowrap;">${this._fmt(e.amount)}</td>
        <td style="white-space:nowrap;">${this._esc(e.paymentMode || '—')}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;margin-right:4px;" onclick="Expenses.doEdit('${e.expenseId}')">Edit</button>
          <button class="btn" style="padding:4px 10px;font-size:12px;background:#fed7d7;color:#c53030;border:none;border-radius:6px;cursor:pointer;" onclick="Expenses.doVoid('${e.expenseId}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },

  openForm(expenseId) {
    this._editingId = expenseId || null;
    document.getElementById('expFormTitle').textContent = expenseId ? 'Edit Expense' : 'Add Expense';
    document.getElementById('expSaveBtn').textContent = expenseId ? 'Update Expense' : 'Save Expense';
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = new Date().toISOString().slice(0, 10);

    if (expenseId) {
      const e = this._expenses.find(x => x.expenseId === expenseId);
      if (e) {
        document.getElementById('expDate').value        = e.date;
        document.getElementById('expCategory').value    = e.category;
        document.getElementById('expVendor').value      = e.vendor;
        document.getElementById('expDescription').value = e.description;
        document.getElementById('expAmount').value      = e.amount;
        document.getElementById('expPaymentMode').value = e.paymentMode;
        document.getElementById('expRefNo').value       = e.referenceNo;
        document.getElementById('expNotes').value       = e.notes;
      }
    }

    const card = document.getElementById('expFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeForm() {
    document.getElementById('expFormCard').style.display = 'none';
    document.getElementById('expenseForm').reset();
    this._editingId = null;
  },

  async handleSubmit(e) {
    e.preventDefault();
    const data = {
      date:        document.getElementById('expDate').value,
      category:    document.getElementById('expCategory').value,
      vendor:      document.getElementById('expVendor').value.trim(),
      description: document.getElementById('expDescription').value.trim(),
      amount:      parseFloat(document.getElementById('expAmount').value) || 0,
      paymentMode: document.getElementById('expPaymentMode').value,
      referenceNo: document.getElementById('expRefNo').value.trim(),
      notes:       document.getElementById('expNotes').value.trim()
    };

    const btn = document.getElementById('expSaveBtn');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const res = this._editingId
        ? await API.updateExpense({ ...data, expenseId: this._editingId })
        : await API.saveExpense(data);

      if (res.status === 'success') {
        UI.showMessage('expMessage', this._editingId ? 'Expense updated.' : 'Expense saved.', 'success');
        this.closeForm();
        await this.load();
      } else {
        UI.showMessage('expMessage', res.message || 'Error saving expense', 'error');
      }
    } catch(err) {
      UI.showMessage('expMessage', 'Error saving expense', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },

  doEdit(expenseId) {
    this.openForm(expenseId);
  },

  async doVoid(expenseId) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    UI.showLoading();
    try {
      const res = await API.voidExpense(expenseId);
      if (res.status === 'success') {
        UI.showMessage('expMessage', 'Expense deleted.', 'success');
        await this.load();
      } else {
        UI.showMessage('expMessage', res.message || 'Error deleting expense', 'error');
      }
    } catch(err) {
      UI.showMessage('expMessage', 'Error deleting expense', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  _fmt(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _fmtDate(ds) {
    if (!ds) return '—';
    const d = new Date(ds + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
