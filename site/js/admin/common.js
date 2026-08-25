'use strict';

(() => {
  let csrfToken = '';
  let toastTimer = null;

  function showToast(message, type = 'info') {
    const toast = document.querySelector('[data-admin-toast]');
    if (!toast) return;
    toast.textContent = String(message || '');
    toast.dataset.type = type;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  async function api(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    if (!['GET', 'HEAD'].includes(method) && csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    const response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace('/admin/login');
      throw new Error('Требуется авторизация.');
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Не удалось выполнить запрос.');
    }

    return payload;
  }

  function applyUser(user) {
    const name = String(user?.name || 'Администратор').trim();
    document.querySelectorAll('[data-admin-name]').forEach((item) => {
      item.textContent = name;
    });
    document.querySelectorAll('[data-admin-avatar]').forEach((item) => {
      item.textContent = name.slice(0, 1).toUpperCase();
    });
  }

  function setSidebar(open) {
    document.querySelector('[data-admin-sidebar]')?.classList.toggle('is-open', open);
    document.querySelector('[data-sidebar-overlay]')?.classList.toggle('is-visible', open);
    document.body.classList.toggle('admin-menu-open', open);
  }

  async function loadSession() {
    const response = await fetch('/api/admin/auth/session', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      window.location.replace('/admin/login');
      return null;
    }

    if (!response.ok) throw new Error('Не удалось проверить сессию.');
    const payload = await response.json();
    csrfToken = String(payload.csrfToken || '');
    applyUser(payload.user);
    return payload;
  }

  async function logout() {
    try {
      await api('/api/admin/auth/logout', { method: 'POST' });
      window.location.replace('/admin/login');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function initShell() {
    document.querySelector('[data-sidebar-open]')?.addEventListener('click', () => setSidebar(true));
    document.querySelector('[data-sidebar-close]')?.addEventListener('click', () => setSidebar(false));
    document.querySelector('[data-sidebar-overlay]')?.addEventListener('click', () => setSidebar(false));
    document.querySelector('[data-admin-logout]')?.addEventListener('click', logout);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setSidebar(false);
    });
    return loadSession();
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  window.P19Admin = { api, initShell, showToast, formatDate };
})();
