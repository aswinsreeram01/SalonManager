// Main App Controller
const UI = {
  showLoading() {
    document.getElementById('loadingOverlay')?.classList.add('show');
  },

  hideLoading() {
    document.getElementById('loadingOverlay')?.classList.remove('show');
  },

  showMessage(elementId, text, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.textContent = text;
    element.className = `message ${type} show`;

    setTimeout(() => {
      element.classList.remove('show');
    }, 5000);
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
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        const navItems = document.querySelectorAll('.nav-item');
        const quickLinks = document.querySelectorAll('.quick-link');

        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            sidebar.classList.toggle('open');
            mainContent.classList.toggle('expanded');
        });

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                // Re-clicking the active page forces a fresh data load
                if (item.classList.contains('active')) this._loaded.delete(page);
                this.switchPage(page);
            });
        });

        quickLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage(link.dataset.page);
            });
        });
    },

    switchPage(page) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.dataset.page === page) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            if (section.id === page) {
                section.classList.add('active');
                // Only load data on first visit; re-clicking the active nav item forces a refresh
                if (!this._loaded.has(page)) {
                    this._loaded.add(page);
                    if (page === 'billing')        Billing.load();
                    if (page === 'products')       Products.load();
                    if (page === 'servicegroups')  ServiceGroups.load();
                    if (page === 'services')       Services.load();
                    if (page === 'staff')          Staff.load();
                    if (page === 'customers')      Customers.load();
                    if (page === 'pricebooks')     PriceBooks.load();
                    if (page === 'organizations')  Organizations.load();
                    if (page === 'users')          Users.load();
                    if (page === 'roles')          Roles.load();
                    if (page === 'permissions')    Permissions.load();
                    if (page === 'history')        History.load();
                }
            } else {
                section.classList.remove('active');
            }
        });

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebar').classList.add('collapsed');
        }
    },

    applyPermissions(permissions) {
        if (!permissions || permissions.length === 0) return;
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            const page = item.dataset.page;
            const perm = permissions.find(p => p.menuItem === page);
            if (perm && perm.canAccess === false) {
                item.style.display = 'none';
            }
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
    ServiceGroups.init();
    Organizations.init();
    Users.init();
    Roles.init();
    Permissions.init();
});
