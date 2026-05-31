// Main App Controller

// ── AppState: spreadsheet URL + sheet GIDs (lazy-loaded once) ────────────────
const AppState = {
    spreadsheetUrl: null,
    sheetGids: {},
    _loaded: false,

    async loadSheetGids() {
        if (this._loaded) return;
        try {
            const res = await API.getSetupStatus();
            if (res.status !== 'success') return;
            this.spreadsheetUrl = res.spreadsheetUrl || null;
            (res.results || []).forEach(r => {
                if (r.sheetId != null) this.sheetGids[r.sheet] = r.sheetId;
            });
            this._loaded = true;
            Navigation._updateHeader(Navigation._currentPage);
        } catch (e) { /* silent — sheets link stays hidden */ }
    },

    getSheetUrl(sheetName) {
        if (!this.spreadsheetUrl || !sheetName) return null;
        const gid = this.sheetGids[sheetName];
        return gid != null ? `${this.spreadsheetUrl}#gid=${gid}` : this.spreadsheetUrl;
    }
};

// ── Page metadata ─────────────────────────────────────────────────────────────
const PAGE_TITLES = {
    home:          'Salon Manager',
    dashboard:     'Dashboard',
    billing:       'New Bill',
    history:       'Bill History',
    appointments:  'Appointments',
    expenses:      'Expenses',
    services:      'Services',
    products:      'Products',
    vendors:       'Vendors',
    staff:         'Staff & HR',
    customers:     'Customers',
    organizations: 'Org & Config',
    users:         'Users',
    roles:         'Roles',
    permissions:   'Permissions',
    settings:      'Sheet Setup',
};

// Primary Google Sheet for each page (used for the Sheets link)
const PAGE_SHEETS = {
    billing:       'Bills',
    history:       'Bills',
    appointments:  'Appointments',
    expenses:      'Expenses',
    services:      'Services',
    products:      'Products',
    vendors:       'Vendors',
    staff:         'Staff',
    customers:     'Customers',
    organizations: 'Organizations',
    users:         'Users',
    roles:         'Roles',
    permissions:   'Permissions',
};

// ── Tile configuration ────────────────────────────────────────────────────────
const TILE_CONFIG = [
    { section: 'Daily Operations' },
    { page: 'billing',       label: 'New Bill',     emoji: '🧾', color: '#6366f1' },
    { page: 'appointments',  label: 'Appointments', emoji: '📅', color: '#0ea5e9' },
    { page: 'history',       label: 'Bill History', emoji: '📋', color: '#7c3aed' },
    { page: 'expenses',      label: 'Expenses',     emoji: '💸', color: '#f59e0b' },
    { section: 'Catalogue & Inventory' },
    { page: 'services',      label: 'Services',     emoji: '✂️',  color: '#10b981' },
    { page: 'products',      label: 'Products',     emoji: '📦', color: '#06b6d4' },
    { page: 'vendors',       label: 'Vendors',      emoji: '🏪', color: '#f97316' },
    { section: 'People' },
    { page: 'staff',         label: 'Staff & HR',   emoji: '👥', color: '#ec4899' },
    { page: 'customers',     label: 'Customers',    emoji: '🧑', color: '#14b8a6' },
    { section: 'Administration' },
    { page: 'organizations', label: 'Org & Config', emoji: '🏢', color: '#64748b' },
    { page: 'users',         label: 'Users',        emoji: '👤', color: '#7c3aed' },
    { page: 'roles',         label: 'Roles',        emoji: '🛡️',  color: '#9333ea' },
    { page: 'permissions',   label: 'Permissions',  emoji: '🔑', color: '#475569' },
    { page: 'settings',      label: 'Sheet Setup',  emoji: '⚙️',  color: '#94a3b8' },
];

// ── UI helpers ────────────────────────────────────────────────────────────────
const UI = {
    _bgMode: false,

    showLoading() {
        if (this._bgMode) return;
        document.getElementById('loadingOverlay')?.classList.add('show');
    },

    hideLoading() {
        if (this._bgMode) return;
        document.getElementById('loadingOverlay')?.classList.remove('show');
    },

    showMessage(elementId, text, type = 'info') {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = text;
        element.className = `message ${type} show`;
        setTimeout(() => element.classList.remove('show'), 5000);
    },

    handleExpiredSession() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('sessionToken');
        Auth.currentUser = null;
        Auth.showLogin();
        UI.showMessage('loginMessage', 'Your session has expired. Please login again.', 'error');
    }
};

// ── Navigation ────────────────────────────────────────────────────────────────
const Navigation = {
    _loaded: new Set(),
    _currentPage: 'home',
    _hiddenTiles: new Set(), // pages hidden by permissions

    init() {
        // Back button
        document.getElementById('backBtn')?.addEventListener('click', () => {
            this.switchPage('home');
        });

        // Bottom nav buttons
        document.querySelectorAll('.bottom-nav-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => this.switchPage(btn.dataset.page));
        });

        // Quick links (dashboard cards etc.)
        document.querySelectorAll('.quick-link').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                this.switchPage(link.dataset.page);
            });
        });

        // Render home on first load
        this._renderHome();

        // Lazy-load sheet GIDs for the Sheets button
        AppState.loadSheetGids();
    },

    _renderHome() {
        const container = document.getElementById('homeContent');
        if (!container) return;

        const user = Auth.currentUser;
        const greeting = _timeGreeting();
        const name = user?.fullName?.split(' ')[0] || user?.email || 'there';
        const org  = user?.orgName || '';

        let html = `
            <div class="home-top">
                <div class="home-greeting">${greeting}, ${name} 👋</div>
                ${org ? `<div class="home-org">${org}</div>` : ''}
            </div>`;

        let inGrid = false;
        TILE_CONFIG.forEach(item => {
            if (item.section) {
                if (inGrid) { html += '</div>'; inGrid = false; }
                html += `<div class="tile-section-label">${item.section}</div>
                         <div class="tile-grid">`;
                inGrid = true;
                return;
            }
            if (this._hiddenTiles.has(item.page)) return;
            html += `
                <button class="tile-card" data-page="${item.page}"
                        style="--tile-color:${item.color}">
                    <span class="tile-emoji">${item.emoji}</span>
                    <span class="tile-label">${item.label}</span>
                </button>`;
        });
        if (inGrid) html += '</div>';

        container.innerHTML = html;

        // Attach tile click handlers
        container.querySelectorAll('.tile-card[data-page]').forEach(card => {
            card.addEventListener('click', () => this.switchPage(card.dataset.page));
        });
    },

    switchPage(page) {
        this._currentPage = page;

        // Bottom nav active state
        document.querySelectorAll('.bottom-nav-btn[data-page]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        // Show/hide content sections
        document.querySelectorAll('.content-section').forEach(section => {
            if (section.id === page) {
                section.classList.add('active');
                // Load module data on first visit
                if (page !== 'home' && !this._loaded.has(page)) {
                    this._loaded.add(page);
                    this._callLoad(page);
                }
            } else {
                section.classList.remove('active');
            }
        });

        // Update header
        this._updateHeader(page);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'instant' });
    },

    _updateHeader(page) {
        const titleEl   = document.getElementById('pageTitleHeader');
        const backBtn   = document.getElementById('backBtn');
        const sheetsBtn = document.getElementById('sheetsBtn');

        if (titleEl) titleEl.textContent = PAGE_TITLES[page] || 'Salon Manager';

        const isHome = page === 'home';
        if (backBtn)   backBtn.style.display   = isHome ? 'none' : 'flex';

        // Sheets link
        if (sheetsBtn) {
            const sheetName = PAGE_SHEETS[page];
            const url = sheetName ? AppState.getSheetUrl(sheetName) : null;
            if (url && !isHome) {
                sheetsBtn.href = url;
                sheetsBtn.style.display = 'inline-flex';
            } else {
                sheetsBtn.style.display = 'none';
            }
        }
    },

    startPreload() {
        setTimeout(() => this._runPreload(), 1500);
    },

    async _runPreload() {
        const queue = [
            'billing', 'history',
            'services', 'products', 'staff', 'customers',
            'users', 'roles', 'permissions', 'organizations'
        ];
        for (const page of queue) {
            if (this._loaded.has(page)) continue;
            this._loaded.add(page);
            UI._bgMode = true;
            try {
                await this._callLoad(page);
            } catch (e) {
                this._loaded.delete(page);
            } finally {
                UI._bgMode = false;
            }
            await new Promise(r => setTimeout(r, 200));
        }
    },

    _callLoad(page) {
        const map = {
            dashboard:     () => Dashboard.load(),
            billing:       () => Billing.load(),
            history:       () => History.load(),
            appointments:  () => Appointments.load(),
            expenses:      () => Expenses.load(),
            vendors:       () => Vendors.load(),
            services:      () => Promise.all([ServiceGroups.load(), Services.load(), PriceBooks.load()]),
            products:      () => Products.load(),
            staff:         () => Staff.load(),
            customers:     () => Customers.load(),
            users:         () => Users.load(),
            roles:         () => Roles.load(),
            permissions:   () => Permissions.load(),
            organizations: () => Organizations.load(),
            settings:      () => Settings.load(),
        };
        return (map[page] || (() => Promise.resolve()))();
    },

    applyPermissions(permissions) {
        if (!permissions || permissions.length === 0) return;
        permissions.forEach(p => {
            if (p.canAccess === false) this._hiddenTiles.add(p.menuItem);
        });
        // Re-render home so hidden tiles are removed
        this._renderHome();
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _timeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
    Navigation.init();
    Billing.init();
    History.init();
    Services.init();
    Staff.init();
    Customers.init();
    PriceBooks.init();
    Products.init();
    ProductGroups.init();
    ServiceGroups.init();
    Organizations.init();
    Users.init();
    Roles.init();
    Permissions.init();
    Appointments.init();
    Expenses.init();
    Vendors.init();
    Settings.init();

    // ── Services section tab switching ──────────────────────
    document.querySelectorAll('#services .prod-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('#services .prod-tab').forEach(b =>
                b.classList.toggle('active', b === btn));
            document.querySelectorAll('#services .prod-tab-panel').forEach(p =>
                p.classList.toggle('active', p.id === `prod-tab-${tab}`));
        });
    });
});
