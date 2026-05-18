// Authentication Module
const Auth = {
  currentUser: null,
  
  init() {
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const sendResetBtn = document.getElementById('sendResetBtn');
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    
    // Restore session from localStorage
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      this.showApp();
    }
    
    if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());
    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', (e) => this.showForgotPassword(e));
    if (sendResetBtn) sendResetBtn.addEventListener('click', () => this.handlePasswordReset());
    if (cancelResetBtn) cancelResetBtn.addEventListener('click', () => this.hideForgotPassword());
  },
  
  async handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const loginBtn = e.target.querySelector('button[type="submit"]');
    
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Authenticating ...';
    
	// Show loading overlay with message
	UI.showLoading();
	
    try {
      const result = await API.login(email, password);
      
      if (result.status === 'success') {
        this.currentUser = {
          userId: result.userId,
          email: result.email,
          fullName: result.fullName,
          phone: result.phone,
          whatsapp: result.whatsapp,
          orgId: result.orgId,
          roleId: result.roleId,
          permissions: result.permissions || []
        };

        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
        localStorage.setItem('sessionToken', result.sessionToken);

        this.showApp();
        UI.showMessage('loginMessage', 'Login successful!', 'success');
      } else {
        UI.showMessage('loginMessage', result.message || 'Login failed', 'error');
      }
    } catch (error) {
      UI.showMessage('loginMessage', 'Network error. Please try again.', 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = 'Login';
    }
  },
  
  async handleLogout() {
    try { await API.logout(); } catch(e) {}
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionToken');
    this.currentUser = null;
    this.showLogin();
    UI.showMessage('loginMessage', 'Logged out successfully', 'success');
  },
  
  showLogin() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('appSection').style.display = 'none';
    document.getElementById('loginForm').reset();
  },
  
  showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan) userNameSpan.textContent = this.currentUser.fullName;
    Navigation.applyPermissions(this.currentUser.permissions);
  },
  
  showForgotPassword(e) {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotPasswordLink').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'block';
    document.getElementById('resetEmail').focus();
  },
  
  hideForgotPassword() {
    document.getElementById('forgotPasswordForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('forgotPasswordLink').style.display = 'block';
    document.getElementById('resetEmail').value = '';
    document.getElementById('loginMessage').innerHTML = '';
  },
  
  async handlePasswordReset() {
    const email = document.getElementById('resetEmail').value.trim();
    
    if (!email) {
      UI.showMessage('loginMessage', 'Please enter your email address', 'error');
      return;
    }
    
    const sendBtn = document.getElementById('sendResetBtn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner"></span> Sending...';
    
    try {
      const result = await API.requestPasswordReset(email);
      
      if (result.status === 'success') {
        UI.showMessage('loginMessage', 'Reset link sent! Check your email.', 'success');
        setTimeout(() => {
          this.hideForgotPassword();
        }, 2000);
      } else {
        UI.showMessage('loginMessage', result.message || 'Failed to send reset link', 'error');
      }
    } catch (error) {
      UI.showMessage('loginMessage', 'Network error. Please try again.', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = 'Send Reset Link';
    }
  }
};
