/**
 * Auth Module
 * Handles register, login, logout, token storage, nav rendering
 * Token stored in localStorage — never the password
 */

const Auth = (() => {

  const TOKEN_KEY = 'dw_token';
  const USER_KEY  = 'dw_user';

  // ── Storage helpers ─────────────────────────────────────────────────────────
  const saveSession = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const getUser  = () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
  };

  const isLoggedIn = () => !!getToken();

  // ── API calls ───────────────────────────────────────────────────────────────
  const register = async ({ name, email, password, ethereumAddress }) => {
    const btn = document.getElementById('submitBtn');
    setLoading(btn, true);
    clearAlert();

    try {
      const res  = await fetch(`${CONFIG.API_BASE}/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, password, ethereumAddress }),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert(data.details?.join('. ') || data.error, 'error');
        return;
      }

      saveSession(data.token, data.user);
      showToast('🎉 Account created! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);

    } catch (err) {
      showAlert('Network error. Is the server running?', 'error');
    } finally {
      setLoading(btn, false);
    }
  };

  const login = async (email, password) => {
    const btn = document.getElementById('submitBtn');
    setLoading(btn, true);
    clearAlert();

    try {
      const res  = await fetch(`${CONFIG.API_BASE}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert(data.error || 'Login failed', 'error');
        return;
      }

      saveSession(data.token, data.user);
      showToast('✅ Logged in! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);

    } catch (err) {
      showAlert('Network error. Is the server running?', 'error');
    } finally {
      setLoading(btn, false);
    }
  };

  const logout = async () => {
    try {
      // Notify backend (fire-and-forget)
      await fetch(`${CONFIG.API_BASE}/auth/logout`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch (_) { /* ignore network errors on logout */ }

    clearSession();
    window.location.href = 'login.html';
  };

  // ── Navbar auth rendering ───────────────────────────────────────────────────
  const renderNav = () => {
    const navAuth = document.getElementById('navAuth');
    if (!navAuth) return;

    const user = getUser();

    if (isLoggedIn() && user) {
      navAuth.innerHTML = `
        <div class="nav-user">
          <span class="user-name">👤 ${escapeHtml(user.name)}</span>
          <button onclick="Auth.logout()" class="btn btn-outline btn-sm">Sign Out</button>
        </div>
      `;
    } else {
      navAuth.innerHTML = `
        <a href="login.html"    class="btn btn-outline btn-sm">Sign In</a>
        <a href="register.html" class="btn btn-primary btn-sm">Register</a>
      `;
    }
  };

  // ── Protected page guard ────────────────────────────────────────────────────
  // Call on pages that require auth
  const requireAuth = () => {
    if (!isLoggedIn()) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    return true;
  };

  // ── Authorized fetch wrapper ────────────────────────────────────────────────
  const authFetch = async (url, options = {}) => {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };
    const res = await fetch(url, { ...options, headers });

    // Auto-logout on 401
    if (res.status === 401) {
      clearSession();
      window.location.href = 'login.html';
      return null;
    }
    return res;
  };

  // ── Password strength ───────────────────────────────────────────────────────
  const showPasswordStrength = (password) => {
    const bar  = document.getElementById('strengthBar');
    const fill = document.getElementById('strengthFill');
    if (!bar || !fill) return;

    bar.classList.remove('hidden');

    let score = 0;
    if (password.length >= 8)           score++;
    if (password.length >= 12)          score++;
    if (/[A-Z]/.test(password))         score++;
    if (/[0-9]/.test(password))         score++;
    if (/[^A-Za-z0-9]/.test(password))  score++;

    const levels = [
      { pct: '20%',  color: '#ff4444', label: 'Very weak' },
      { pct: '40%',  color: '#ff8800', label: 'Weak'      },
      { pct: '60%',  color: '#ffcc00', label: 'Fair'      },
      { pct: '80%',  color: '#88cc00', label: 'Good'      },
      { pct: '100%', color: '#00cc66', label: 'Strong'    },
    ];

    const level = levels[Math.max(0, score - 1)] || levels[0];
    fill.style.width      = level.pct;
    fill.style.background = level.color;
  };

  // ── UI helpers ──────────────────────────────────────────────────────────────
  const showAlert = (message, type = 'error') => {
    const box = document.getElementById('alertBox');
    if (!box) return;
    box.textContent = message;
    box.className   = `alert alert-${type}`;
    box.classList.remove('hidden');
  };

  const clearAlert = () => {
    const box = document.getElementById('alertBox');
    if (box) box.classList.add('hidden');
  };

  const setLoading = (btn, loading) => {
    if (!btn) return;
    btn.disabled   = loading;
    btn.textContent = loading ? '⏳ Please wait...' : btn.dataset.label || btn.textContent;
    if (!btn.dataset.label && !loading) {
      btn.textContent = btn.id === 'submitBtn' && document.getElementById('loginForm')
        ? 'Sign In' : 'Create Account';
    }
  };

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );

  // ── Init ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', renderNav);

  // Public API
  return {
    register, login, logout,
    isLoggedIn, getToken, getUser,
    requireAuth, authFetch,
    showPasswordStrength, renderNav,
  };

})();

window.Auth = Auth;
