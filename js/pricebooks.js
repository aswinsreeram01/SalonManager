// Price Books Module
const PriceBooks = {
    editingId: null,
    currentPriceBookId: null,
    _orgs: [],

    init() {
        const form = document.getElementById('priceBookForm');
        const toggleBtn = document.getElementById('togglePriceBookForm');
        const cancelBtn = document.getElementById('cancelPriceBookBtn');

        form.addEventListener('submit', (e) => this.handleSubmit(e));
        toggleBtn.addEventListener('click', () => this.toggleForm());
        cancelBtn.addEventListener('click', () => this.hideForm());
        document.getElementById('priceBookIncludeChildren')?.addEventListener('change', () => this.load());
    },

    async _loadOrgs() {
        try {
            const result = await API.getOrganizations(Auth.currentUser?.orgId);
            this._orgs = (result.status === 'success' && result.organizations) || [];
        } catch (e) {
            this._orgs = [];
        }
        this._populateOrgDropdown();
    },

    _populateOrgDropdown() {
        const sel = document.getElementById('priceBookOrgId');
        if (!sel) return;
        sel.innerHTML = this._orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
        sel.disabled = this._orgs.length < 2;
    },

    _orgName(orgId) {
        const org = this._orgs.find(o => o.id === orgId);
        return org ? org.name : (orgId || '—');
    },
    
    toggleForm() {
        const form = document.getElementById('priceBookForm');
        const toggleText = document.getElementById('priceBookFormToggleText');
        const isHidden = form.style.display === 'none';
        
        form.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? 'Hide Form' : 'Show Form';
        
        if (!isHidden) {
            this.resetForm();
        }
    },
    
    hideForm() {
        document.getElementById('priceBookForm').style.display = 'none';
        document.getElementById('priceBookFormToggleText').textContent = 'Show Form';
        this.resetForm();
    },
    
    resetForm() {
        this.editingId = null;
        document.getElementById('priceBookForm').reset();
        document.getElementById('savePriceBookBtn').textContent = 'Save Price Book';
        const orgSel = document.getElementById('priceBookOrgId');
        if (orgSel) orgSel.value = Auth.currentUser?.orgId || '';
    },

    async handleSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById('savePriceBookBtn');

        const data = {
            name: document.getElementById('priceBookName').value,
            description: document.getElementById('priceBookDescription').value,
            status: document.getElementById('priceBookStatus').value,
            targetOrgId: document.getElementById('priceBookOrgId')?.value || ''
        };
        
        if (this.editingId) {
            data.id = this.editingId;
        }
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>Saving...';
        
        try {
            const result = this.editingId 
                ? await API.updatePriceBook(data)
                : await API.addPriceBook(data);
            
            if (result.status === 'success') {
                UI.showMessage('priceBookMessage', result.message, 'success');
                this.hideForm();
                this.load();
            } else {
                UI.showMessage('priceBookMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('priceBookMessage', 'Network error. Please try again.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = this.editingId ? 'Update Price Book' : 'Save Price Book';
        }
    },
    
    async load() {
        await this._loadOrgs();
        const tbody = document.getElementById('priceBooksTableBody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #a0aec0;">Loading...</td></tr>';
        const includeChildren = !!document.getElementById('priceBookIncludeChildren')?.checked;

        try {
            const result = await API.getPriceBooks({ includeChildren });

            if (result.status === 'success' && result.priceBooks.length > 0) {
                tbody.innerHTML = result.priceBooks.map(pb => `
                    <tr>
                        <td>${pb.name}</td>
                        <td>${pb.description || '-'}</td>
                        <td><span class="status-badge status-${pb.status}">${pb.status}</span></td>
                        <td>${this._orgName(pb.orgId)}</td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn action-btn-edit" onclick="PriceBooks.viewItems('${pb.id}', '${pb.name}')">Manage Prices</button>
                                <button class="action-btn action-btn-edit" onclick="PriceBooks.edit('${pb.id}')">Edit</button>
                                <button class="action-btn action-btn-delete" onclick="PriceBooks.delete('${pb.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #a0aec0;">No price books found</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #fc8181;">Error loading price books</td></tr>';
        }
    },

    async edit(id) {
        UI.showLoading();
        try {
            const result = await API.getPriceBooks();
            const priceBook = result.priceBooks.find(pb => pb.id === id);

            if (priceBook) {
                this.editingId = id;
                document.getElementById('priceBookName').value = priceBook.name;
                document.getElementById('priceBookDescription').value = priceBook.description;
                document.getElementById('priceBookStatus').value = priceBook.status;
                const orgSel = document.getElementById('priceBookOrgId');
                if (orgSel) orgSel.value = priceBook.orgId || Auth.currentUser?.orgId || '';
                document.getElementById('savePriceBookBtn').textContent = 'Update Price Book';
                document.getElementById('priceBookForm').style.display = 'block';
                document.getElementById('priceBookFormToggleText').textContent = 'Hide Form';
                document.getElementById('priceBookForm').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (error) {
            UI.showMessage('priceBookMessage', 'Error loading price book', 'error');
        } finally {
            UI.hideLoading();
        }
    },
    
    async delete(id) {
        if (!confirm('Are you sure you want to delete this price book? All associated prices will be deleted.')) return;
        
        UI.showLoading();
        try {
            const result = await API.deletePriceBook(id);
            
            if (result.status === 'success') {
                UI.showMessage('priceBookMessage', result.message, 'success');
                this.load();
            } else {
                UI.showMessage('priceBookMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('priceBookMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    },
    
    async viewItems(priceBookId, priceBookName) {
        this.currentPriceBookId = priceBookId;
        document.getElementById('priceBookItemsTitle').textContent = `${priceBookName} - Service Prices`;
        document.getElementById('priceBooksList').style.display = 'none';
        document.getElementById('priceBookItems').style.display = 'block';
        await this.loadItems();
        await this.loadServiceDropdown();
    },
    
    backToPriceBooks() {
        document.getElementById('priceBookItems').style.display = 'none';
        document.getElementById('priceBooksList').style.display = 'block';
        this.currentPriceBookId = null;
    },
    
    async loadItems() {
        const tbody = document.getElementById('priceBookItemsTableBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #a0aec0;">Loading...</td></tr>';
        
        try {
            const result = await API.getPriceBookItems(this.currentPriceBookId);
            
            if (result.status === 'success' && result.items.length > 0) {
				tbody.innerHTML = result.items.map(item => `
					<tr>
						<td>${item.serviceName}</td>
						<td>${item.category || '-'}</td>
						<td>
						<input type="number" 
								value="${item.price}" 
								step="0.01" 
								class="price-input" 
								data-item-id="${item.itemId}"
								data-service-id="${item.serviceId}"
								data-is-default="${item.isDefault}"
								onchange="PriceBooks.updatePrice('${item.itemId}', '${item.serviceId}', this.value, ${item.isDefault})">
						${item.isDefault ? '<span style="color: #718096; font-size: 12px; margin-left: 8px;">(Default)</span>' : ''}
						</td>
						<td>
						${!item.isDefault ? `<button class="action-btn action-btn-delete" onclick="PriceBooks.deleteItem('${item.itemId}')">Delete</button>` : ''}
						</td>
					</tr>
				`).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #a0aec0;">No prices defined yet</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #fc8181;">Error loading prices</td></tr>';
        }
    },
    
    async loadServiceDropdown() {
        const select = document.getElementById('priceBookItemService');
        select.innerHTML = '<option value="">Select Service</option>';
        
        try {
            const result = await API.getServices();
            
            if (result.status === 'success') {
                result.services.forEach(service => {
                    if (service.status === 'active') {
                        const option = document.createElement('option');
                        option.value = service.id;
                        option.textContent = `${service.name} (${service.category || 'No category'})`;
                        select.appendChild(option);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading services:', error);
        }
    },
    
    async addItemToCurrentPriceBook() {
        const serviceId = document.getElementById('priceBookItemService').value;
        const price = document.getElementById('priceBookItemPrice').value;
        
        if (!serviceId || !price) {
            UI.showMessage('priceBookItemMessage', 'Please select a service and enter a price', 'error');
            return;
        }
        
        UI.showLoading();
        try {
            const result = await API.addPriceBookItem({
                priceBookId: this.currentPriceBookId,
                serviceId: serviceId,
                price: parseFloat(price)
            });
            
            if (result.status === 'success') {
                UI.showMessage('priceBookItemMessage', result.message, 'success');
                document.getElementById('priceBookItemService').value = '';
                document.getElementById('priceBookItemPrice').value = '';
                await this.loadItems();
            } else {
                UI.showMessage('priceBookItemMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('priceBookItemMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    },
    
	async updatePrice(itemId, serviceId, newPrice, isDefault) {
		UI.showLoading();
		try {
			let result;
			if (isDefault) {
			// Converting default to custom price
			result = await API.addPriceBookItem({
				priceBookId: this.currentPriceBookId,
				serviceId: serviceId,
				price: parseFloat(newPrice)
			});
			} else {
			// Updating existing custom price
			result = await API.updatePriceBookItem({
				itemId: itemId,
				price: parseFloat(newPrice)
			});
			}
			
			if (result.status === 'success') {
			UI.showMessage('priceBookItemMessage', result.message, 'success');
			await this.loadItems();
			} else {
			UI.showMessage('priceBookItemMessage', result.message, 'error');
			await this.loadItems();
			}
		} catch (error) {
			UI.showMessage('priceBookItemMessage', 'Network error', 'error');
		} finally {
			UI.hideLoading();
		}
	},

    async deleteItem(itemId) {
        if (!confirm('Are you sure you want to delete this price?')) return;
        
        UI.showLoading();
        try {
            const result = await API.deletePriceBookItem(itemId);
            
            if (result.status === 'success') {
                UI.showMessage('priceBookItemMessage', result.message, 'success');
                await this.loadItems();
            } else {
                UI.showMessage('priceBookItemMessage', result.message, 'error');
            }
        } catch (error) {
            UI.showMessage('priceBookItemMessage', 'Network error', 'error');
        } finally {
            UI.hideLoading();
        }
    }
};
