'use strict';

(() => {
  const grid = document.querySelector('[data-portfolio-grid]');
  const empty = document.querySelector('[data-portfolio-empty]');
  if (!grid || !empty) return;

  function createImage(src, alt) {
    const image = document.createElement('img');
    image.src = src;
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    return image;
  }

  function createCard(work) {
    const card = document.createElement('a');
    card.className = 'portfolio-work';
    card.id = `work-${work.id}`;
    card.href = `/portfolio/${encodeURIComponent(work.slug)}`;
    card.setAttribute('aria-label', `Смотреть работу ${work.title}`);

    const media = document.createElement('div');
    media.className = 'portfolio-work__media';
    const afterWrap = document.createElement('div');
    const beforeWrap = document.createElement('div');
    afterWrap.append(createImage(work.after.imagePath, work.after.alt || `${work.car} после ремонта`));
    beforeWrap.append(createImage(work.before.imagePath, work.before.alt || `${work.car} до ремонта`));
    const afterLabel = document.createElement('span');
    afterLabel.className = 'is-after';
    afterLabel.textContent = 'После';
    const beforeLabel = document.createElement('span');
    beforeLabel.className = 'is-before';
    beforeLabel.textContent = 'До';
    afterWrap.append(afterLabel);
    beforeWrap.append(beforeLabel);
    media.append(afterWrap, beforeWrap);

    const body = document.createElement('div');
    body.className = 'portfolio-work__body';
    const service = document.createElement('span');
    service.className = 'portfolio-work__service';
    service.textContent = work.service;
    const title = document.createElement('h2');
    title.textContent = work.title;
    const text = document.createElement('p');
    text.textContent = work.shortDescription || work.description || work.car;
    const meta = document.createElement('div');
    meta.className = 'portfolio-work__meta';
    const duration = document.createElement('span');
    duration.textContent = work.durationDays ? `${work.durationDays} дней` : 'Срок индивидуально';
    const location = document.createElement('span');
    location.textContent = work.location || 'Абакан';
    meta.append(duration, location);
    const details = document.createElement('span');
    details.className = 'portfolio-work__link';
    details.textContent = 'Смотреть работу →';
    body.append(service, title, text, meta, details);
    card.append(media, body);
    return card;
  }

  async function load() {
    try {
      const response = await fetch('/api/works?limit=50', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('works_error');
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      grid.replaceChildren(...items.map(createCard));
      empty.hidden = items.length > 0;
    } catch {
      empty.hidden = false;
      empty.textContent = 'Не удалось загрузить работы. Обновите страницу чуть позже.';
    }
  }

  load();
})();
