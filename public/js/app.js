(function () {
  const state = { config: null, user: null, socket: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formObject(form) {
    const fd = new FormData(form);
    const out = {};
    for (const [k, v] of fd.entries()) {
      if (out[k] !== undefined) out[k] = [].concat(out[k], v);
      else out[k] = v;
    }
    return out;
  }

  function noticeHtml(type, message, opts) {
    if (!message) return '';
    const busy = opts && opts.loading ? '<span class="spinner" aria-hidden="true"></span>' : '';
    return `<div class="notice ${esc(type || 'info')}" role="${type === 'error' ? 'alert' : 'status'}" aria-live="polite">${busy}<span>${esc(message)}</span></div>`;
  }
  function setNotice(el, type, message, opts) {
    if (!el) return;
    el.innerHTML = noticeHtml(type, message, opts);
  }
  function setLoading(el, message) { setNotice(el, 'info', message || 'Loading…', { loading: true }); }

  async function api(path, opts) {
    opts = opts || {};
    const method = (opts.method || 'GET').toUpperCase();
    const headers = { 'X-Requested-With': 'fetch', ...(opts.headers || {}) };
    const hasBody = opts.body != null;
    if (hasBody && !(opts.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { credentials: 'same-origin', ...opts, method, headers });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (res.status === 401 || data.error?.code === 'UNAUTHORIZED') {
      const here = window.location.pathname;
      if (!/^\/(login|register|\/?$)/.test(here)) {
        window.location.href = `/login?next=${encodeURIComponent(here + window.location.search)}&reason=session`;
        throw Object.assign(new Error('Session expired'), { data, status: res.status, handled: true });
      }
    }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error?.message || `Request failed (${res.status})`);
      err.data = data; err.status = res.status;
      throw err;
    }
    return data;
  }

  async function loadConfig() {
    if (state.config) return state.config;
    try { state.config = (await api('/api/v1/config/public')).data; }
    catch (_) { state.config = { appName: 'IIUC Live Campus Map', registrationEnabled: true, features: {} }; }
    return state.config;
  }

  async function loadSession() {
    try { state.user = (await api('/api/v1/auth/me')).data.user; }
    catch (_) { state.user = null; }
    return state.user;
  }

  function roleHome(user) {
    if (!user) return '/login';
    if (user.role === 'admin') return '/admin';
    return '/dashboard';
  }

  function navItems(user, cfg) {
    const publicItems = [
      { href: '/', label: 'Home' },
      { href: '/map', label: 'Map' },
    ];
    if (!user) {
      publicItems.push({ href: '/login', label: 'Login' });
      if (cfg?.registrationEnabled !== false) publicItems.push({ href: '/register', label: 'Register' });
      return publicItems;
    }
    const items = [
      { href: roleHome(user), label: user.role === 'admin' ? 'Admin' : 'Dashboard' },
      { href: '/map', label: 'Map' },
      { href: '/live-location', label: 'Live Location' },
      { href: '/profile', label: 'Profile' },
      { href: '/settings', label: 'Settings' },
    ];
    if (user.role === 'admin') items.splice(1, 0, { href: '/admin', label: 'Admin' });
    return items;
  }

  function updateBadges() {
    const online = $('#badge-online');
    if (online) {
      online.className = `badge ${navigator.onLine ? 'ok' : 'err'}`;
      online.textContent = navigator.onLine ? 'Online' : 'Offline';
    }
    const session = $('#badge-session');
    if (session) {
      session.className = `badge ${state.user ? 'ok' : 'warn'}`;
      session.textContent = state.user ? `${state.user.display_name} (${state.user.role})` : 'Not signed in';
    }
    const socket = $('#badge-socket');
    if (socket) {
      if (!state.user) { socket.className = 'badge'; socket.textContent = 'Socket: idle'; }
      else if (state.socket?.connected) { socket.className = 'badge ok'; socket.textContent = 'Socket: connected'; }
      else if (state.socket) { socket.className = 'badge warn'; socket.textContent = 'Socket: connecting'; }
      else { socket.className = 'badge'; socket.textContent = 'Socket: not started'; }
    }
  }

  async function logout() {
    try { await api('/api/v1/auth/logout', { method: 'POST' }); } catch (_) {}
    window.location.href = '/';
  }

  async function renderShell(opts) {
    opts = opts || {};
    const cfg = await loadConfig();
    if (opts.publicOnly) state.user = null; else await loadSession();
    if (opts.requireAuth && !state.user) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}&reason=auth`;
      return { redirected: true };
    }
    if (opts.roles && state.user && !opts.roles.includes(state.user.role)) {
      const main = $('[data-main]') || $('main');
      if (main) main.innerHTML = `<div class="card"><h2>Access denied</h2><p class="muted">Your role does not have access to this page.</p><p><a href="${esc(roleHome(state.user))}">Go to your dashboard</a></p></div>`;
      return { denied: true };
    }

    document.title = document.title.includes(cfg.appName) ? document.title : `${document.title} - ${cfg.appName}`;
    const appName = $('#app-name'); if (appName) appName.textContent = cfg.appName;
    $$('[data-app-name]').forEach((el) => { el.textContent = cfg.appName; });

    const nav = $('#app-nav') || $('header nav.row') || $('header nav');
    if (nav) {
      const items = navItems(state.user, cfg);
      const current = window.location.pathname.replace(/\/$/, '') || '/';
      const logoutBtn = state.user ? `<button type="button" class="secondary" data-logout>Logout</button>` : '';
      nav.innerHTML = items.map((i) => `<a href="${esc(i.href)}"${(i.href.replace(/\/$/, '') || '/') === current ? ' aria-current="page"' : ''}>${esc(i.label)}</a>`).join('') + logoutBtn;
      nav.querySelector('[data-logout]')?.addEventListener('click', logout);
    }

    const side = $('#side-nav');
    if (side && state.user) {
      const items = navItems(state.user, cfg);
      const current = window.location.pathname.replace(/\/$/, '') || '/';
      side.innerHTML = items.map((i) => `<a href="${esc(i.href)}"${(i.href.replace(/\/$/, '') || '/') === current ? ' aria-current="page"' : ''}>${esc(i.label)}</a>`).join('');
    }

    updateBadges();
    window.addEventListener('online', updateBadges);
    window.addEventListener('offline', updateBadges);
    return { config: cfg, user: state.user };
  }

  function connectSocket(onUpdate) {
    if (!window.io || !state.user) { updateBadges(); return null; }
    if (state.socket) return state.socket;
    const socket = window.io({ withCredentials: true, reconnectionAttempts: 8, timeout: 10000 });
    state.socket = socket;
    socket.on('connect', updateBadges);
    socket.on('disconnect', updateBadges);
    socket.on('connect_error', () => { updateBadges(); onUpdate?.('error'); });
    socket.on('location:updated', () => onUpdate?.('location'));
    socket.on('location:removed', () => onUpdate?.('location'));
    updateBadges();
    return socket;
  }

  window.IIUC = { $, $$, esc, api, formObject, setNotice, noticeHtml, setLoading, loadConfig, loadSession, renderShell, roleHome, logout, connectSocket, state };
  window.api = api; window.$ = $; window.esc = esc; // compatibility for existing pages
})();
