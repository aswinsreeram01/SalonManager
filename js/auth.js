// Authentication Module
const Auth = {
    currentUser: null,
    
    init() {
        const loginForm = document.getElementById('loginForm');
        const logoutBtn = document.getElementById('logoutBtn');
        
        loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        logoutBtn.addEventListener('click', () => this.handleLogout());
    },

	async handleLogin(e) {
		e.preventDefault();
		const loginBtn = document.getElementById('loginBtn');
		const username = document.getElementById('username').value.trim();
		const password = document.getElementById('password').value.trim();
		
		loginBtn.disabled = true;
		loginBtn.innerHTML = '<span class="spinner"></span>Authenticating...';
		
		// Show loading overlay with message
		UI.showLoading();
		
		try {
			const result = await API.login(username, password);
			
			if (result.status === 'success') {
				this.currentUser = result.username;
				this.showApp();
			} else {
				UI.showMessage('loginMessage', result.message, 'error');
			}
		} catch (error) {
			UI.showMessage('loginMessage', 'Network error. Please try again.', 'error');
		} finally {
			UI.hideLoading();
			loginBtn.disabled = false;
			loginBtn.innerHTML = 'Login';
		}
	}
    
    handleLogout() {
        this.currentUser = null;
        this.showLogin();
    },
    
    showApp() {
        document.getElementById('currentUser').textContent = this.currentUser;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').classList.add('active');
        Dashboard.load();
    },
    
    showLogin() {
        document.getElementById('appContainer').classList.remove('active');
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('loginForm').reset();
    }
};
