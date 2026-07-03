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
    hrapprovals:   'Approvals',
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
    hrapprovals:   'StaffAttendance',
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
    { page: 'hrapprovals',   label: 'Approvals',    emoji: '📋', color: '#0ea5e9' },
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
        // Sidebar hamburger toggle
        const sidebar     = document.getElementById('sidebar');
        const backdrop    = document.getElementById('sidebarBackdrop');
        const mainContent = document.getElementById('mainContent');
        document.getElementById('menuToggle')?.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                sidebar.classList.toggle('open');
                backdrop.classList.toggle('show');
            } else {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
            }
        });
        backdrop?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            backdrop.classList.remove('show');
        });

        // Sidebar nav items
        document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
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

        // Sidebar active state
        document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        // Close mobile sidebar on navigate
        if (window.innerWidth < 768) {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarBackdrop')?.classList.remove('show');
        }

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
        const sheetsBtn = document.getElementById('sheetsBtn');

        if (titleEl) titleEl.textContent = PAGE_TITLES[page] || 'Salon Manager';

        const isHome = page === 'home';

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
            hrapprovals:   () => HRApprovals.load(),
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
        // Server enforces access by canRead/canUpdate now; a menu item with
        // no row (or canRead !== true) means the role has no read access —
        // hide its tile so users aren't sent to a page that will error out.
        // Dashboard has no entry in TILE_CONFIG's page list and no dedicated
        // backend action, so it's unaffected here (always reachable).
        const readable = new Set((permissions || [])
            .filter(p => p.canRead === true || p.canRead === 'TRUE')
            .map(p => p.menuItem));

        this._hiddenTiles = new Set(
            TILE_CONFIG.filter(item => item.page && !readable.has(item.page)).map(item => item.page)
        );
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

// ── Page HTML loader ─────────────────────────────────────────────────────────
// Fetches all page HTML files in parallel and injects them before init() runs.
// Pages are small static files; parallel HTTP/2 fetch completes in ~100ms.
const PAGE_HTML = [
    'dashboard','billing','history','appointments','expenses',
    'services','products','vendors','staff','hrapprovals',
    'customers','organizations','users','roles','permissions','settings'
];

async function _loadPageHTML() {
    await Promise.all(PAGE_HTML.map(async page => {
        try {
            const r = await fetch(`pages/${page}.html`);
            if (r.ok) {
                const el = document.getElementById(page);
                if (el) el.innerHTML = await r.text();
            }
        } catch(e) { /* page file missing — content section stays empty */ }
    }));
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch and inject all page HTML before init() — needed so event listeners
    // attached in init() find their DOM elements.
    await _loadPageHTML();

    // Wrap every init in its own try/catch so a single failure can't abort the chain.
    const _init = (mod, name) => { try { mod.init(); } catch(e) { console.error(`${name}.init() failed:`, e); } };

    _init(Auth,          'Auth');
    _init(Navigation,    'Navigation');
    _init(Billing,       'Billing');
    _init(History,       'History');
    _init(Services,      'Services');
    _init(Staff,         'Staff');
    _init(Customers,     'Customers');
    _init(PriceBooks,    'PriceBooks');
    _init(Products,      'Products');
    _init(ProductGroups, 'ProductGroups');
    _init(ServiceGroups, 'ServiceGroups');
    _init(Organizations, 'Organizations');
    _init(Users,         'Users');
    _init(Roles,         'Roles');
    _init(Permissions,   'Permissions');
    _init(Appointments,  'Appointments');
    _init(Expenses,      'Expenses');
    _init(Vendors,       'Vendors');
    _init(Settings,      'Settings');
    _init(HRApprovals,   'HRApprovals');

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
