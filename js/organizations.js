// Organizations Module
const Organizations = {
  editingId: null,
  _orgSettings: null,

  init() {
    const form = document.getElementById('organizationForm');
    const toggleBtn = document.getElementById('toggleOrganizationForm');
    const cancelBtn = document.getElementById('cancelOrganizationBtn');

    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleForm());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideForm());
    }

    document.getElementById('orgSettingsForm')?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveOrgSettings();
    });
  },
  
  toggleForm() {
    const form = document.getElementById('organizationForm');
    const toggleText = document.getElementById('organizationFormToggleText');
    const isHidden = form.style.display === 'none';
    
    form.style.display = isHidden ? 'block' : 'none';
    toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
    
    if (!isHidden) {
      this.resetForm();
    }
  },
  
  hideForm() {
    document.getElementById('organizationForm').style.display = 'none';
    document.getElementById('organizationFormToggleText').textContent = 'Show Form';
    this.resetForm();
  },
  
  resetForm() {
    this.editingId = null;
    document.getElementById('organizationForm').reset();
    document.getElementById('saveOrganizationBtn').textContent = 'Save Organization';
  },
  
  async handleSubmit(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('saveOrganizationBtn');
    
    const data = {
      name: document.getElementById('organizationName').value,
      parentId: document.getElementById('organizationParent').value || null,
      type: document.getElementById('organizationType').value,
      status: document.getElementById('organizationStatus').value
    };
    
    if (this.editingId) {
      data.id = this.editingId;
    }
    
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>Saving...';
    
    try {
      const result = this.editingId 
        ? await API.updateOrganization(data)
        : await API.addOrganization(data);
      
      if (result.status === 'success') {
        UI.showMessage('organizationMessage', result.message, 'success');
        this.hideForm();
        await this.load();
      } else {
        UI.showMessage('organizationMessage', result.message, 'error');
      }
    } catch (error) {
      UI.showMessage('organizationMessage', 'Network error. Please try again.', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = this.editingId ? 'Update Organization' : 'Save Organization';
    }
  },
  
  async load() {
    await Promise.all([this._loadOrgList(), this.loadOrgSettings()]);
  },

  async _loadOrgList() {
    const tbody = document.getElementById('organizationsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #a0aec0;">Loading...</td></tr>';
    
    try {
      const result = await API.getOrganizations(Auth.currentUser?.orgId);

      if (result.status === 'success' && result.organizations.length > 0) {
        await this.populateParentDropdown(result.organizations);

        tbody.innerHTML = result.organizations.map(org => `
          <tr>
            <td>${org.name}</td>
            <td>${org.parentId ? this.getOrgName(org.parentId, result.organizations) : '-'}</td>
            <td>${org.type}</td>
            <td><span class="status-badge status-${org.status}">${org.status}</span></td>
            <td>
              <div class="action-btns">
                <button class="action-btn action-btn-edit" onclick="Organizations.edit('${org.id}')">Edit</button>
                <button class="action-btn action-btn-delete" onclick="Organizations.delete('${org.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #a0aec0;">No organizations found</td></tr>';
      }
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #fc8181;">Error loading organizations</td></tr>';
    }
  },
  
  getOrgName(orgId, allOrgs) {
    const org = allOrgs.find(o => o.id === orgId);
    return org ? org.name : 'Unknown';
  },
  
  async populateParentDropdown(orgs) {
    const select = document.getElementById('organizationParent');
    if (!select) return;
    
    select.innerHTML = '<option value="">None (Root Level)</option>';
    
    orgs.forEach(org => {
      const option = document.createElement('option');
      option.value = org.id;
      option.textContent = org.name;
      select.appendChild(option);
    });
  },
  
  async edit(id) {
    UI.showLoading();
    try {
      const result = await API.getOrganizations(Auth.currentUser.orgId);
      const org = result.organizations.find(o => o.id === id);
      
      if (org) {
        this.editingId = id;
        document.getElementById('organizationName').value = org.name;
        document.getElementById('organizationParent').value = org.parentId || '';
        document.getElementById('organizationType').value = org.type;
        document.getElementById('organizationStatus').value = org.status;
        document.getElementById('saveOrganizationBtn').textContent = 'Update Organization';
        document.getElementById('organizationForm').style.display = 'block';
        document.getElementById('organizationFormToggleText').textContent = 'Hide Form';
        document.getElementById('organizationForm').scrollIntoView({ behavior: 'smooth' });
      }
    } catch (error) {
      UI.showMessage('organizationMessage', 'Error loading organization', 'error');
    } finally {
      UI.hideLoading();
    }
  },
  
  async delete(id) {
    if (!confirm('Are you sure you want to delete this organization? This will fail if it has child organizations.')) return;

    UI.showLoading();
    try {
      const result = await API.deleteOrganization(id);

      if (result.status === 'success') {
        UI.showMessage('organizationMessage', result.message, 'success');
        await this._loadOrgList();
      } else {
        UI.showMessage('organizationMessage', result.message, 'error');
      }
    } catch (error) {
      UI.showMessage('organizationMessage', 'Network error', 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // ── Org Settings ─────────────────────────────────────────────────────────────

  async loadOrgSettings() {
    try {
      const res = await API.getOrgSettings();
      if (res.status !== 'success') return;
      this._orgSettings = res.settings || {};
      this._renderOrgSettings();
    } catch (err) {
      console.error('Failed to load org settings:', err);
    }
  },

  _renderOrgSettings() {
    const s = this._orgSettings || {};
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    setVal('orgSalonName',      s.salonName           || '');
    setVal('orgGstNumber',      s.gstNumber           || '');
    setVal('orgCurrencySymbol', s.currencySymbol      || '₹');
    setVal('orgSalaryPayDay',   s.salaryPayDay        ?? 10);
    setVal('orgDefaultOffs',    s.defaultEligibleOffs ?? 4);
    const tpEl = document.getElementById('orgDefaultTargetPeriod');
    if (tpEl) tpEl.value = s.defaultTargetPeriod || 'weekly';
  },

  async saveOrgSettings() {
    const payload = {
      salonName:           document.getElementById('orgSalonName')?.value.trim()      || '',
      gstNumber:           document.getElementById('orgGstNumber')?.value.trim()      || '',
      currencySymbol:      document.getElementById('orgCurrencySymbol')?.value.trim() || '₹',
      salaryPayDay:        Number(document.getElementById('orgSalaryPayDay')?.value)  || 10,
      defaultEligibleOffs: Number(document.getElementById('orgDefaultOffs')?.value)   || 4,
      defaultTargetPeriod: document.getElementById('orgDefaultTargetPeriod')?.value   || 'weekly'
    };

    const btn = document.getElementById('orgSettingsSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const res = await API.updateOrgSettings(payload);
      if (res.status !== 'success') throw new Error(res.message);
      this._orgSettings = { ...this._orgSettings, ...payload };
      UI.showMessage('organizationMessage', 'Organisation settings saved.', 'success');
    } catch (err) {
      UI.showMessage('organizationMessage', 'Save failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
    }
  }
};
