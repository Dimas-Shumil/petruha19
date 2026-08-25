'use strict';

(() => {
  const admin = window.P19Admin;
  if (!admin) return;

  const statusMeta = {
    NEW: ['Новая', 'is-new'],
    IN_PROGRESS: ['В работе', 'is-progress'],
    COMPLETED: ['Завершена', 'is-completed'],
    CANCELLED: ['Отменена', 'is-cancelled'],
  };

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value ?? 0);
  }

  function renderLeads(items) {
    const body = document.querySelector('[data-dashboard-leads]');
    const empty = document.querySelector('[data-dashboard-empty]');
    body.replaceChildren();
    empty.hidden = items.length > 0;

    for (const lead of items) {
      const row = document.createElement('tr');
      const meta = statusMeta[lead.status] || [lead.status, ''];

      for (const value of [lead.publicNumber, lead.name, lead.service]) {
        const cell = document.createElement('td');
        cell.textContent = value || '—';
        row.append(cell);
      }

      const statusCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `admin-status ${meta[1]}`;
      badge.textContent = meta[0];
      statusCell.append(badge);
      row.append(statusCell);

      const dateCell = document.createElement('td');
      dateCell.textContent = admin.formatDate(lead.createdAt);
      row.append(dateCell);
      row.addEventListener('click', () => {
        window.location.href = `/admin/leads?open=${lead.id}`;
      });
      body.append(row);
    }
  }

  async function init() {
    try {
      await admin.initShell();
      const payload = await admin.api('/api/admin/dashboard');
      setText('[data-metric-new]', payload.metrics.newLeads);
      setText('[data-metric-progress]', payload.metrics.inProgressLeads);
      setText('[data-metric-works]', payload.metrics.totalWorks);
      setText('[data-metric-published]', payload.metrics.publishedWorks);
      setText('[data-status-total]', payload.statuses.total);
      renderLeads(payload.recentLeads || []);
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  }

  init();
})();
