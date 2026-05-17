// Main App Controller
const UI = {
    showLoading() {
        document.getElementById('loadingOverlay').classList.add('show');
    },
    
    hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('show');
    },
    
    showMessage(elementId, text, type) {
        const element = document.getElementById(elementId);
        element.textContent = text;
        element.className = `message ${type} show`;
        setTimeout(() => {
            element.classList.remove('show');
        }, 5000);
    }
};

const Navigation = {
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
            item.addEventListener('click', () => this.switchPage(item.dataset.page));
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
                // Load data when switching to certain pages
                if (page === 'services') Services.load();
                if (page === 'staff') Staff.load();
                if (page === 'customers') Customers.load();
            } else {
                section.classList.remove('active');
            }
        });
        
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebar').classList.add('collapsed');
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
    Navigation.init();
    Services.init();
    Staff.init();
    Customers.init();
});
