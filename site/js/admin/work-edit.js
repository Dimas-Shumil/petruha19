'use strict';

(() => {
  const admin = window.P19Admin;
  const form = document.querySelector('[data-work-form]');
  if (!admin || !form) return;

  const pathPart = window.location.pathname.split('/').filter(Boolean).at(-1);
  let workId = pathPart === 'new' ? null : Number(pathPart);
  let work = null;
  let slugTouched = Boolean(workId);
  const uploadInputs = [...document.querySelectorAll('[data-upload-section] input[type="file"]')];

  const field = (name) => form.elements[name];
  const services = [
    'Полный окрас',
    'Локальный ремонт',
    'Подбор цвета',
    'Покраска элемента',
    'Восстановление после ДТП',
    'Покраска дисков',
  ];

  function slugify(value) {
    const map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
      з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
      п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
      ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    };
    return String(value || '')
      .toLowerCase()
      .split('')
      .map((char) => map[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  function getPayload() {
    return {
      title: field('title').value.trim(),
      slug: field('slug').value.trim(),
      car: field('car').value.trim(),
      service: field('service').value,
      shortDescription: field('shortDescription').value.trim(),
      description: field('description').value.trim(),
      seoTitle: field('seoTitle').value.trim(),
      seoDescription: field('seoDescription').value.trim(),
      durationDays: field('durationDays').value
        ? Number(field('durationDays').value)
        : null,
      location: field('location').value.trim() || 'Абакан',
      isPublished: field('isPublished').checked,
      showOnHome: field('showOnHome').checked,
      sortOrder: Number(field('sortOrder').value || 100),
    };
  }

  function setValue(name, value) {
    const element = field(name);
    if (!element) return;
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = value ?? '';
  }

  function getImages(kind) {
    return (work?.images || []).filter((image) => image.kind === kind);
  }

  function renderImageSlot(kind, container) {
    container.replaceChildren();
    const images = getImages(kind);

    if (!images.length) {
      const empty = document.createElement('span');
      empty.className = 'admin-upload-empty';
      empty.textContent = kind === 'GALLERY' ? 'Галерея пока пустая' : 'Фото не загружено';
      container.append(empty);
      return;
    }

    for (const image of images) {
      const card = document.createElement('article');
      card.className = 'admin-upload-image';
      const picture = document.createElement('img');
      picture.src = image.imagePath;
      picture.alt = image.alt || '';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Удалить';
      remove.addEventListener('click', () => deleteImage(image.id));
      card.append(picture, remove);
      container.append(card);
    }
  }

  function renderImages() {
    renderImageSlot('AFTER', document.querySelector('[data-images-after]'));
    renderImageSlot('BEFORE', document.querySelector('[data-images-before]'));
    renderImageSlot('GALLERY', document.querySelector('[data-images-gallery]'));
  }

  function syncPublishingControls() {
    const published = field('isPublished').checked;
    field('showOnHome').disabled = !published;
    if (!published) field('showOnHome').checked = false;
  }

  function unlockUploads() {
    uploadInputs.forEach((input) => {
      input.disabled = false;
    });
    document.querySelector('[data-upload-lock]')?.setAttribute('hidden', '');
    document.querySelector('[data-upload-section]')?.classList.add('is-ready');
  }

  function applyWork(item) {
    work = item;
    workId = item.id;
    document.querySelector('[data-editor-title]').textContent = item.title || 'Редактирование работы';
    for (const name of [
      'title', 'slug', 'car', 'service', 'shortDescription', 'description',
      'seoTitle', 'seoDescription', 'durationDays', 'location', 'isPublished',
      'showOnHome', 'sortOrder',
    ]) {
      setValue(name, item[name]);
    }
    document.querySelector('[data-work-delete]').hidden = false;
    unlockUploads();
    syncPublishingControls();
    renderImages();
  }

  async function loadWork() {
    if (!workId) return;
    const payload = await admin.api(`/api/admin/works/${workId}`);
    applyWork(payload.item);
  }

  async function saveWork(event) {
    event.preventDefault();
    const button = document.querySelector('[data-work-save]');
    button.disabled = true;

    try {
      const payload = getPayload();
      const response = await admin.api(
        workId ? `/api/admin/works/${workId}` : '/api/admin/works',
        {
          method: workId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      admin.showToast('Работа сохранена.', 'success');
      if (!workId) {
        window.location.replace(`/admin/works/${response.item.id}`);
        return;
      }
      applyWork(response.item);
    } catch (error) {
      admin.showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function uploadImages(kind, input) {
    if (!workId || !input.files.length) return;
    const data = new FormData();
    data.set('kind', kind);
    for (const file of input.files) data.append('images', file);

    input.disabled = true;
    try {
      const response = await admin.api(`/api/admin/works/${workId}/images`, {
        method: 'POST',
        body: data,
      });
      applyWork(response.item);
      input.value = '';
      admin.showToast('Фотографии загружены.', 'success');
    } catch (error) {
      admin.showToast(error.message, 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function deleteImage(imageId) {
    if (!window.confirm('Удалить фотографию?')) return;
    try {
      const response = await admin.api(`/api/admin/works/${workId}/images/${imageId}`, {
        method: 'DELETE',
      });
      applyWork(response.item);
      admin.showToast('Фотография удалена.', 'success');
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  }

  async function deleteWork() {
    if (!workId || !window.confirm('Удалить работу и все её фотографии?')) return;
    try {
      await admin.api(`/api/admin/works/${workId}`, { method: 'DELETE' });
      window.location.replace('/admin/works');
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  }

  field('title').addEventListener('input', () => {
    if (!slugTouched) field('slug').value = slugify(field('title').value);
  });
  field('slug').addEventListener('input', () => {
    slugTouched = true;
    field('slug').value = slugify(field('slug').value);
  });
  field('isPublished').addEventListener('change', syncPublishingControls);
  form.addEventListener('submit', saveWork);
  document.querySelector('[data-work-delete]')?.addEventListener('click', deleteWork);
  document.querySelector('[data-upload-after]')?.addEventListener('change', (event) =>
    uploadImages('AFTER', event.currentTarget),
  );
  document.querySelector('[data-upload-before]')?.addEventListener('change', (event) =>
    uploadImages('BEFORE', event.currentTarget),
  );
  document.querySelector('[data-upload-gallery]')?.addEventListener('change', (event) =>
    uploadImages('GALLERY', event.currentTarget),
  );

  for (const service of services) {
    const option = document.createElement('option');
    option.value = service;
    option.textContent = service;
    field('service').append(option);
  }

  syncPublishingControls();

  (async () => {
    try {
      await admin.initShell();
      await loadWork();
    } catch (error) {
      admin.showToast(error.message, 'error');
    }
  })();
})();
