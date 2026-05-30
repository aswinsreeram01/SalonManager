// Main App Controller
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

const Navigation = {
    _loaded: new Set(),

    init() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar    = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        const backdrop   = document.getElementById('sidebarBackdrop');

        // ── Sidebar helpers ──────────────────────────────────
        const isMobile = () => window.innerWidth < 768;

        const openSidebar = () => {
            sidebar.classList.add('open');
            sidebar.classList.remove('collapsed');
            if (isMobile() && backdrop) backdrop.classList.add('show');
            if (!isMobile()) mainContent.classList.remove('expanded');
        };

        const closeSidebar = () => {
            sidebar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('show');
            if (!isMobile()) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('expanded');
            }
        };

        const toggleSidebar = () => {
            const isOpen = isMobile()
                ? sidebar.classList.contains('open')
                : !sidebar.classList.contains('collapsed');
            isOpen ? closeSidebar() : openSidebar();
        };

        menuToggle.addEventListener('click', toggleSidebar);
        if (backdrop) backdrop.addEventListener('click', closeSidebar);

        // ── Desktop nav items ────────────────────────────────
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (item.classList.contains('active')) this._loaded.delete(page);
                this.switchPage(page);
                if (isMobile()) closeSidebar();
            });
        });

        // ── Quick links ──────────────────────────────────────
        document.querySelectorAll('.quick-link').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                this.switchPage(link.dataset.page);
            });
        });

        // ── Mobile bottom nav ────────────────────────────────
        document.querySelectorAll('.mob-nav-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => this.switchPage(btn.dataset.page));
        });

        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleSidebar);
    },

    switchPage(page) {
        // Update desktop nav active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Update mobile bottom nav active state
        document.querySelectorAll('.mob-nav-btn[data-page]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        // Show the right content section and trigger load
        document.querySelectorAll('.content-section').forEach(section => {
            if (section.id === page) {
                section.classList.add('active');
                if (!this._loaded.has(page)) {
                    this._loaded.add(page);
                    if (page === 'dashboard')      Dashboard.load();
                    if (page === 'billing')        Billing.load();
                    if (page === 'products')       Products.load();
                    if (page === 'services') {
                        ServiceGroups.load();
                        Services.load();
                        PriceBooks.load();
                    }
                    if (page === 'staff')          Staff.load();
                    if (page === 'customers')      Customers.load();
                    if (page === 'organizations')  Organizations.load();
                    if (page === 'users')          Users.load();
                    if (page === 'roles')          Roles.load();
                    if (page === 'permissions')    Permissions.load();
                    if (page === 'history')        History.load();
                    if (page === 'appointments')   Appointments.load();
                    if (page === 'expenses')       Expenses.load();
                    if (page === 'vendors')        Vendors.load();
                    if (page === 'settings')       Settings.load();
                }
            } else {
                section.classList.remove('active');
            }
        });
    },

    startPreload() {
        setTimeout(() => this._runPreload(), 1000);
    },

    async _runPreload() {
        const queue = [
            'billing',
            'history',
            'services', 'products', 'staff', 'customers',
            'users', 'roles', 'permissions', 'organizations'
        ];
        for (const page of queue) {
            if (this._loaded.has(page)) continue;
            this._loaded.add(page);
            UI._bgMode = true;
            try {
                await this._callLoad(page);
            } catch(e) {
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
            organizations: () => Organizations.load()
        };
        return (map[page] || (() => Promise.resolve()))();
    },

    applyPermissions(permissions) {
        if (!permissions || permissions.length === 0) return;
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            const page = item.dataset.page;
            const perm = permissions.find(p => p.menuItem === page);
            if (perm && perm.canAccess === false) item.style.display = 'none';
        });
    }
};

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
