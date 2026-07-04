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
    staff:         'Staff',
    hrapprovals:   'StaffAttendance',
    customers:     'Customers',
    organizations: 'Organizations',
    users:         'Users',
    roles:         'Roles',
    permissions:   'Permissions',
};

// ── Tile configuration ────────────────────────────────────────────────────────
// Colors are deliberately muted/deep — they tint the tile icon chips and
// stroke the icons; loud saturated hues undercut the refined look.
const TILE_CONFIG = [
    { section: 'Daily Operations' },
    { page: 'billing',       label: 'New Bill',     emoji: '🧾', color: '#5a67c8' },
    { page: 'appointments',  label: 'Appointments', emoji: '📅', color: '#2b6cb0' },
    { page: 'history',       label: 'Bill History', emoji: '📋', color: '#6b46c1' },
    { page: 'expenses',      label: 'Expenses',     emoji: '💸', color: '#b7791f' },
    { section: 'Catalogue & Inventory' },
    { page: 'services',      label: 'Services',     emoji: '✂️',  color: '#2f855a' },
    { page: 'products',      label: 'Products',     emoji: '📦', color: '#2c7a7b' },
    { section: 'People' },
    { page: 'staff',         label: 'Staff & HR',   emoji: '👥', color: '#b83280' },
    { page: 'hrapprovals',   label: 'Approvals',    emoji: '📋', color: '#3f9142' },
    { page: 'customers',     label: 'Customers',    emoji: '🧑', color: '#0987a0' },
    { section: 'Administration' },
    { page: 'organizations', label: 'Org & Config', emoji: '🏢', color: '#4a5568' },
    { page: 'users',         label: 'Users',        emoji: '👤', color: '#805ad5' },
    { page: 'roles',         label: 'Roles',        emoji: '🛡️',  color: '#553c9a' },
    { page: 'permissions',   label: 'Permissions',  emoji: '🔑', color: '#718096' },
    { page: 'settings',      label: 'Sheet Setup',  emoji: '⚙️',  color: '#8b7355' },
];

// ── Monoline icons (Feather-style, stroke inherits currentColor) ─────────────
// One icon per page, shared by the sidebar nav (injected over the emoji
// fallbacks in index.html) and the home tile chips. Keyed by page id.
const _icon = paths =>
    `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${paths}</svg>`;

const NAV_ICONS = {
    home:          _icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    billing:       _icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    appointments:  _icon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    history:       _icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    expenses:      _icon('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    services:      _icon('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'),
    products:      _icon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    staff:         _icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    hrapprovals:   _icon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    customers:     _icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    organizations: _icon('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
    users:         _icon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'),
    roles:         _icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    permissions:   _icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    settings:      _icon('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
};

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
                // Sidebar is full-height, so the header starts at its right
                // edge and must slide back to the viewport edge with it.
                document.querySelector('.header')?.classList.toggle('expanded');
            }
        });
        backdrop?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            backdrop.classList.remove('show');
        });

        // Sidebar nav items — wire clicks and swap the emoji placeholders
        // for the monoline icon set (emoji stays as a fallback for any
        // page without an entry in NAV_ICONS).
        document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
            btn.addEventListener('click', () => this.switchPage(btn.dataset.page));
            const iconEl = btn.querySelector('.nav-icon');
            if (iconEl && NAV_ICONS[btn.dataset.page]) iconEl.innerHTML = NAV_ICONS[btn.dataset.page];
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
        const dateLine = new Date().toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long'
        });

        // Org name lives in the header on the home page, so it isn't
        // repeated here; the date line takes its place.
        let html = `
            <div class="home-top">
                <div class="home-date">${dateLine}</div>
                <div class="home-greeting">${greeting}, ${name}</div>
            </div>`;

        // Group into sections first so a section whose every page is hidden
        // (e.g. no access to either Services or Products) never renders its
        // label or an empty grid.
        const sections = [];
        let current = null;
        TILE_CONFIG.forEach(item => {
            if (item.section) {
                current = { label: item.section, items: [] };
                sections.push(current);
            } else if (current) {
                current.items.push(item);
            }
        });

        sections.forEach(section => {
            const visibleItems = section.items.filter(item => !this._hiddenTiles.has(item.page));
            if (!visibleItems.length) return;
            html += `<div class="tile-section-label">${section.label}</div><div class="tile-grid">`;
            visibleItems.forEach(item => {
                const iconHtml = NAV_ICONS[item.page]
                    ? `<span class="tile-icon">${NAV_ICONS[item.page]}</span>`
                    : `<span class="tile-emoji">${item.emoji}</span>`;
                html += `
                    <button class="tile-card" data-page="${item.page}"
                            style="--tile-color:${item.color}">
                        ${iconHtml}
                        <span class="tile-label">${item.label}</span>
                    </button>`;
            });
            html += '</div>';
        });

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

        // On Home, show the logged-in user's org name instead of the generic
        // app name (falls back to it if the org name isn't available yet).
        if (titleEl) {
            titleEl.textContent = page === 'home'
                ? ((Auth.currentUser && Auth.currentUser.orgName) || 'Salon Manager')
                : (PAGE_TITLES[page] || 'Salon Manager');
        }

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

    // Pages broken into tabs (see js/permissions.js MENU_STRUCTURE) — their
    // permission rows are all composite 'page:tab' keys, not a flat 'page'
    // row, so page-level (sidebar/tile) readability has to be derived from
    // "is any child tab readable" rather than a single row lookup.
    _TABBED_PAGES: ['products', 'staff', 'customers', 'services'],

    applyPermissions(permissions) {
        // Server enforces access by canRead/canUpdate now; a menu item with
        // no row (or canRead !== true) means the role has no read access —
        // hide its tile so users aren't sent to a page that will error out.
        // Dashboard has no entry in TILE_CONFIG's page list and no dedicated
        // backend action, so it's unaffected here (always reachable).
        const perms = permissions || [];
        const readableFlat = new Set(perms
            .filter(p => p.canRead === true || p.canRead === 'TRUE')
            .map(p => p.menuItem));

        const readable = new Set(readableFlat);
        this._TABBED_PAGES.forEach(page => {
            const anyTabReadable = [...readableFlat].some(key => key.startsWith(page + ':'));
            if (anyTabReadable) readable.add(page);
        });

        this._hiddenTiles = new Set(
            TILE_CONFIG.filter(item => item.page && !readable.has(item.page)).map(item => item.page)
        );
        // Re-render home so hidden tiles are removed
        this._renderHome();

        // Sidebar: hide nav-items with no read access, and hide the whole
        // section (title + wrapper) when every item inside it is hidden.
        // The Home section has no data-page items to hide, so it's
        // unaffected — always reachable, matching the always-open dashboard.
        document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
            const page = btn.dataset.page;
            btn.style.display = (page === 'home' || readable.has(page)) ? '' : 'none';
        });
        document.querySelectorAll('.sidebar .nav-section').forEach(section => {
            const items = section.querySelectorAll('.nav-item[data-page]');
            if (!items.length) return; // no page items (e.g. a title-only section) — leave as-is
            const anyVisible = [...items].some(btn => btn.style.display !== 'none');
            section.style.display = anyVisible ? '' : 'none';
        });

        this.applyTabPermissions(perms);
    },

    // Hides individual tab buttons/panels within a tabbed page when the role
    // lacks read access to that specific tab (e.g. Payroll under Staff & HR),
    // even though the page itself remains reachable via its other tabs.
    applyTabPermissions(permissions) {
        const canRead = new Set((permissions || [])
            .filter(p => p.canRead === true || p.canRead === 'TRUE')
            .map(p => p.menuItem));

        this._TABBED_PAGES.forEach(page => {
            const container = document.getElementById(page);
            if (!container) return;

            let firstVisibleTab = null;
            let activeIsVisible = false;
            container.querySelectorAll('.prod-tab[data-tab]').forEach(btn => {
                const tabKey = btn.dataset.tab;
                const visible = canRead.has(`${page}:${tabKey}`);
                btn.style.display = visible ? '' : 'none';
                const panel = container.querySelector(`#prod-tab-${tabKey}`);
                if (panel && !visible) panel.style.display = 'none';
                else if (panel) panel.style.removeProperty('display');
                if (visible && !firstVisibleTab) firstVisibleTab = btn;
                if (visible && btn.classList.contains('active')) activeIsVisible = true;
            });
            // If the tab that would normally be active on load has no read
            // access, fall back to the first tab the role can actually see
            // so the page doesn't land on a blank/hidden panel.
            if (!activeIsVisible && firstVisibleTab) firstVisibleTab.click();
        });
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
    'services','products','staff','hrapprovals',
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
