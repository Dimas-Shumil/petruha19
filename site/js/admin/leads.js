'use strict';

(() => {
  const admin = window.P19Admin;
  if (!admin) return;

  const state = { status: 'ALL', q: '', page: 1, current: null };
  const statusMeta = {
    NEW: ['Новая', 'is-new'],
    IN_PROGRESS: ['В работе', 'is-progress'],
    COMPLETED: ['Завершена', 'is-completed'],
    CANCELLED: ['Отменена', 'is-cancelled'],
  };

  const body = document.querySelector('[data-leads-body]');
  const empty = document.querySelector('[data-leads-empty]');
  const search = document.querySelector('[data-leads-search]');
  const modal = document.querySelector('[data-lead-modal]');
  let searchTimer = null;

  function createCell(value) {
    const cell = document.createElement('td');
    cell.textContent = String(value || '—');
    return cell;
  }

  function render(items) {
    body.replaceChildren();
    empty.hidden = items.length > 0;

    for (const lead of items) {
      const row = document.createElement('tr');
      row.tabIndex = 0;
      row.append(
        createCell(lead.publicNumber),
        createCell(lead.name),
        createCell(lead.phone),
        createCell(lead.service),
      );

      const statusCell = document.createElement('td');
      const meta = statusMeta[lead.status] || [lead.status, ''];
      const badge = document.createElement('span');
      badge.className = `admin-status ${meta[1]}`;
      badge.textContent = meta[0];
      statusCell.append(badge);
      row.append(statusCell, createCell(admin.formatDate(lead.createdAt)));

      const open = () => openLead(lead.id);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') open();
      });
      body.append(row);
    }
  }

  async function loadList() {
    const params = new URLSearchParams({
      status: state.status,
      q: state.q,
      page: String(state.page),
      limit: '20',
    });
    const payload = await admin.api(`/api/admin/leads?${params}`);
    render(payload.items || []);

    const counts = payload.counts || {};
    document.querySelectorAll('[data-status-count]').forEach((element) => {
      const status = element.dataset.statusCount;
      element.textContent = status === 'ALL'
        ? String(Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0))
        : String(counts[status] || 0);
    });
  }

  function setDetail(name, value) {
    const element = modal.querySelector(`[data-lead-${name}]`);
    if (element) element.textContent = String(value || '—');
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('admin-modal-open');
    state.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    history.replaceState({}, '', url);
  }

  async function openLead(id) {
    try {
      const payload = await admin.api(`/api/admin/leads/${id}`);
      const lead = payload.item;
      state.current = lead;
      setDetail('number', lead.publicNumber);
      setDetail('name', lead.name);
      setDetail('phone', lead.phone);
      setDetail('service', lead.service);
      setDetail('car', lead.car);
      setDetail('comment', lead.comment);
      setDetail('date', admin.formatDate(lead.createdAt));
      const phoneLink = modal.querySelector('[data-lead-phone-link]');
      phoneLink.href = `tel:${lead.phone}`;
      modal.querySelector('[data-lead-status]').value = lead.status;
      modal.querySelector('[data-lead-note]').value = lead.internalComment || '';
      modal.hidden = false;
      document.body.classList.add('admin-modal-open');
      const url = new URL(window.location.href);
      url.searchParams.set('open', String(id));
      history.replaceState({}, '', url);
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  }

  async function saveLead() {
    if (!state.current) return;
    const button = modal.querySelector('[data-lead-save]');
    button.disabled = true;

    try {
      await admin.api(`/api/admin/leads/${state.current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: modal.querySelector('[data-lead-status]').value,
          internalComment: modal.querySelector('[data-lead-note]').value.trim(),
        }),
      });
      admin.showToast('Заявка обновлена.', 'success');
      closeModal();
      await loadList();
    } catch (error) {
      admin.showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deleteLead() {
    if (!state.current || !window.confirm('Удалить заявку без возможности восстановления?')) return;

    try {
      await admin.api(`/api/admin/leads/${state.current.id}`, { method: 'DELETE' });
      admin.showToast('Заявка удалена.', 'success');
      closeModal();
      await loadList();
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  }

  document.querySelectorAll('[data-leads-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.status = button.dataset.leadsStatus;
      state.page = 1;
      document.querySelectorAll('[data-leads-status]').forEach((item) =>
        item.classList.toggle('is-active', item === button),
      );
      await loadList();
    });
  });

  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      state.q = search.value.trim();
      state.page = 1;
      await loadList();
    }, 280);
  });
  modal?.querySelector('[data-modal-close]')?.addEventListener('click', closeModal);
  modal?.querySelector('[data-modal-backdrop]')?.addEventListener('click', closeModal);
  modal?.querySelector('[data-lead-save]')?.addEventListener('click', saveLead);
  modal?.querySelector('[data-lead-delete]')?.addEventListener('click', deleteLead);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  (async () => {
    try {
      await admin.initShell();
      await loadList();
      const openId = Number(new URLSearchParams(window.location.search).get('open'));
      if (Number.isSafeInteger(openId) && openId > 0) await openLead(openId);
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  })();
})();
