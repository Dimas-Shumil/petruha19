'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');

const router = express.Router();

function mapWork(work) {
  const after = work.images.find((image) => image.kind === 'AFTER') || null;
  const before = work.images.find((image) => image.kind === 'BEFORE') || null;
  const gallery = work.images.filter((image) => image.kind === 'GALLERY');

  return {
    id: work.id,
    title: work.title,
    slug: work.slug,
    car: work.car,
    service: work.service,
    shortDescription: work.shortDescription,
    description: work.description,
    seoTitle: work.seoTitle,
    seoDescription: work.seoDescription,
    durationDays: work.durationDays,
    location: work.location,
    showOnHome: work.showOnHome,
    after,
    before,
    gallery,
    createdAt: work.createdAt.toISOString(),
  };
}

router.get('/works', async (req, res, next) => {
  try {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
      featured: z.enum(['true', 'false']).optional().default('false'),
    }).safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректный лимит.' });
    }

    const items = await prisma.work.findMany({
      where: {
        isPublished: true,
        ...(parsed.data.featured === 'true' ? { showOnHome: true } : {}),
        images: {
          some: { kind: 'AFTER' },
        },
      },
      take: parsed.data.limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    return res.json({ items: items.filter((item) =>
      item.images.some((image) => image.kind === 'BEFORE'),
    ).map(mapWork) });
  } catch (error) {
    return next(error);
  }
});

router.get('/works/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ message: 'Некорректный адрес работы.' });
    }

    const work = await prisma.work.findFirst({
      where: { slug, isPublished: true },
      include: {
        images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (
      !work ||
      !work.images.some((image) => image.kind === 'AFTER') ||
      !work.images.some((image) => image.kind === 'BEFORE')
    ) {
      return res.status(404).json({ message: 'Работа не найдена.' });
    }
    return res.json({ item: mapWork(work) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
