'use strict';

(() => {
  const form = document.querySelector('[data-login-form]');
  if (!form) return;

  const errorBox = document.querySelector('[data-login-error]');
  const submit = document.querySelector('[data-login-submit]');
  const password = form.elements.password;

  document.querySelector('[data-password-toggle]')?.addEventListener('click', (event) => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'Скрыть' : 'Показать';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Входим…';

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: String(form.elements.email.value || '').trim(),
          password: String(password.value || ''),
          rememberMe: Boolean(form.elements.rememberMe.checked),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Не удалось войти.');
      window.location.replace('/admin');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });
})();
