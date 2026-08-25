'use strict';

(() => {
  const admin = window.P19Admin;
  if (!admin) return;

  const state = { status: 'ALL', q: '' };
  const list = document.querySelector('[data-works-list]');
  const empty = document.querySelector('[data-works-empty]');
  const search = document.querySelector('[data-works-search]');
  let searchTimer = null;

  function findImage(work, kind) {
    return (work.images || []).find((image) => image.kind === kind)?.imagePath || '';
  }

  function makeImage(src, alt) {
    const image = document.createElement('img');
    image.src = src;
    image.alt = alt;
    image.loading = 'lazy';
    return image;
  }

  function render(items) {
    list.replaceChildren();
    empty.hidden = items.length > 0;

    for (const work of items) {
      const card = document.createElement('article');
      card.className = 'admin-work-card';

      const media = document.createElement('a');
      media.className = 'admin-work-card__media';
      media.href = `/admin/works/${work.id}`;
      const after = findImage(work, 'AFTER');
      const before = findImage(work, 'BEFORE');

      if (after) media.append(makeImage(after, `${work.title} после`));
      if (before) media.append(makeImage(before, `${work.title} до`));
      if (!after && !before) {
        const placeholder = document.createElement('span');
        placeholder.textContent = 'Фотографии ещё не загружены';
        media.append(placeholder);
      }

      const body = document.createElement('div');
      body.className = 'admin-work-card__body';
      const meta = document.createElement('div');
      meta.className = 'admin-work-card__meta';
      const service = document.createElement('span');
      service.textContent = work.service;
      const status = document.createElement('span');
      status.className = work.isPublished ? 'is-published' : 'is-draft';
      status.textContent = work.isPublished ? 'Опубликовано' : 'Черновик';
      meta.append(service, status);
      if (work.showOnHome) {
        const featured = document.createElement('span');
        featured.className = 'is-featured';
        featured.textContent = 'На главной';
        meta.append(featured);
      }

      const title = document.createElement('h2');
      title.textContent = work.title;
      const description = document.createElement('p');
      description.textContent = work.shortDescription || work.car;
      const link = document.createElement('a');
      link.className = 'admin-secondary-button';
      link.href = `/admin/works/${work.id}`;
      link.textContent = 'Редактировать';
      body.append(meta, title, description, link);
      card.append(media, body);
      list.append(card);
    }
  }

  async function loadWorks() {
    const params = new URLSearchParams({
      status: state.status,
      q: state.q,
      limit: '50',
    });
    const payload = await admin.api(`/api/admin/works?${params}`);
    render(payload.items || []);
  }

  document.querySelectorAll('[data-works-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.status = button.dataset.worksStatus;
      document.querySelectorAll('[data-works-status]').forEach((item) =>
        item.classList.toggle('is-active', item === button),
      );
      await loadWorks();
    });
  });

  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      state.q = search.value.trim();
      await loadWorks();
    }, 280);
  });

  (async () => {
    try {
      await admin.initShell();
      await loadWorks();
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  })();
})();
