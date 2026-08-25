'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
} = require('../middleware/auth');
const {
  workImageUpload,
  saveWorkImage,
  removeManagedWorkImage,
  MAX_WORK_IMAGES_PER_REQUEST,
} = require('../lib/upload');

const router = express.Router();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_KINDS = ['AFTER', 'BEFORE', 'GALLERY'];

const listQuerySchema = z.object({
  status: z.enum(['ALL', 'PUBLISHED', 'DRAFT']).optional().default('ALL'),
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const nullableDuration = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.number().int().min(1).max(365).nullable(),
);

const workPayloadSchema = z
  .object({
    title: z.string().trim().min(2).max(180),
    slug: z.string().trim().min(2).max(120).regex(SLUG_PATTERN),
    car: z.string().trim().min(2).max(160),
    service: z.string().trim().min(2).max(160),
    shortDescription: z.string().trim().max(500).optional().default(''),
    description: z.string().trim().max(10_000).optional().default(''),
    seoTitle: z.string().trim().max(180).optional().default(''),
    seoDescription: z.string().trim().max(320).optional().default(''),
    durationDays: nullableDuration.optional().default(null),
    location: z.string().trim().min(2).max(120).optional().default('Абакан'),
    isPublished: z.boolean().optional().default(false),
    showOnHome: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(0).max(1_000_000).optional().default(100),
  })
  .strict();

function validateSameOrigin(req, res, next) {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) return next();

  try {
    const ownOrigin = new URL(`${req.protocol}://${req.get('host') || ''}`).origin;
    if (new URL(origin).origin !== ownOrigin) {
      return res.status(403).json({ message: 'Источник запроса не разрешён.' });
    }
  } catch {
    return res.status(403).json({ message: 'Источник запроса не разрешён.' });
  }

  return next();
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function mapWork(work) {
  return {
    ...work,
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
    images: (work.images || []).map((image) => ({
      ...image,
      createdAt: image.createdAt.toISOString(),
      updatedAt: image.updatedAt.toISOString(),
    })),
  };
}

async function getWork(id) {
  return prisma.work.findUnique({
    where: { id },
    include: {
      images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });
}

function hasRequiredImages(images) {
  return (
    images.some((image) => image.kind === 'AFTER') &&
    images.some((image) => image.kind === 'BEFORE')
  );
}

router.use(loadAdminSession, requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Проверьте параметры списка.' });
    }

    const { status, q, page, limit } = parsed.data;
    const where = {};

    if (status === 'PUBLISHED') where.isPublished = true;
    if (status === 'DRAFT') where.isPublished = false;
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { car: { contains: q } },
        { service: { contains: q } },
        { slug: { contains: q } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.work.count({ where }),
      prisma.work.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          images: {
            where: { kind: { in: ['AFTER', 'BEFORE'] } },
            orderBy: { id: 'asc' },
          },
        },
      }),
    ]);

    return res.json({
      items: items.map(mapWork),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
    const work = await getWork(id);
    if (!work) return res.status(404).json({ message: 'Работа не найдена.' });
    return res.json({ item: mapWork(work) });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/',
  validateSameOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const parsed = workPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues?.[0]?.message || 'Проверьте данные работы.',
        });
      }

      if (parsed.data.isPublished) {
        return res.status(400).json({
          message: 'Сначала сохраните работу и загрузите фотографии После и До.',
        });
      }

      if (parsed.data.showOnHome) {
        return res.status(400).json({
          message: 'Сначала сохраните работу, загрузите фотографии и опубликуйте её.',
        });
      }

      const work = await prisma.work.create({ data: parsed.data });
      return res.status(201).json({ ok: true, item: mapWork({ ...work, images: [] }) });
    } catch (error) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: 'Такой slug уже используется.' });
      }
      return next(error);
    }
  },
);

router.patch(
  '/:id',
  validateSameOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
      const parsed = workPayloadSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues?.[0]?.message || 'Проверьте данные работы.',
        });
      }

      if (parsed.data.isPublished) {
        const images = await prisma.workImage.findMany({ where: { workId: id } });
        if (!hasRequiredImages(images)) {
          return res.status(400).json({
            message: 'Для публикации загрузите фотографии После и До.',
          });
        }
      }


      if (parsed.data.showOnHome && !parsed.data.isPublished) {
        return res.status(400).json({
          message: 'На главной можно показывать только опубликованную работу.',
        });
      }

      await prisma.work.update({ where: { id }, data: parsed.data });
      const work = await getWork(id);
      return res.json({ ok: true, item: mapWork(work) });
    } catch (error) {
      if (error?.code === 'P2025') {
        return res.status(404).json({ message: 'Работа не найдена.' });
      }
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: 'Такой slug уже используется.' });
      }
      return next(error);
    }
  },
);

router.post(
  '/:id/images',
  validateSameOrigin,
  requireAdminCsrf,
  (req, res, next) => {
    workImageUpload(req, res, (error) => (error ? next(error) : next()));
  },
  async (req, res, next) => {
    const savedPaths = [];

    try {
      const id = parsePositiveId(req.params.id);
      const kind = String(req.body.kind || '').toUpperCase();
      if (!id) return res.status(400).json({ message: 'Некорректный ID.' });
      if (!IMAGE_KINDS.includes(kind)) {
        return res.status(400).json({ message: 'Некорректный тип фотографии.' });
      }

      const work = await prisma.work.findUnique({ where: { id } });
      if (!work) return res.status(404).json({ message: 'Работа не найдена.' });
      const files = Array.isArray(req.files) ? req.files : [];

      if (!files.length) {
        return res.status(400).json({ message: 'Выберите фотографии.' });
      }
      if (kind !== 'GALLERY' && files.length !== 1) {
        return res.status(400).json({ message: 'Для После или До выберите один файл.' });
      }

      if (kind === 'GALLERY') {
        const currentCount = await prisma.workImage.count({
          where: { workId: id, kind: 'GALLERY' },
        });
        if (currentCount + files.length > 12) {
          return res.status(400).json({ message: 'В галерее может быть максимум 12 фото.' });
        }
      }

      for (const file of files.slice(0, MAX_WORK_IMAGES_PER_REQUEST)) {
        savedPaths.push(await saveWorkImage(file.buffer));
      }

      const oldImages =
        kind === 'GALLERY'
          ? []
          : await prisma.workImage.findMany({ where: { workId: id, kind } });

      await prisma.$transaction(async (tx) => {
        if (kind !== 'GALLERY') {
          await tx.workImage.deleteMany({ where: { workId: id, kind } });
        }

        for (const [index, imagePath] of savedPaths.entries()) {
          await tx.workImage.create({
            data: {
              workId: id,
              kind,
              imagePath,
              alt: `${work.title} — ${kind === 'AFTER' ? 'после' : kind === 'BEFORE' ? 'до' : 'фото работы'}`,
              sortOrder: kind === 'GALLERY' ? 100 + index : 0,
            },
          });
        }
      });

      await Promise.allSettled(
        oldImages.map((image) => removeManagedWorkImage(image.imagePath)),
      );

      return res.status(201).json({ ok: true, item: mapWork(await getWork(id)) });
    } catch (error) {
      await Promise.allSettled(savedPaths.map(removeManagedWorkImage));
      return next(error);
    }
  },
);

router.delete(
  '/:id/images/:imageId',
  validateSameOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const workId = parsePositiveId(req.params.id);
      const imageId = parsePositiveId(req.params.imageId);
      if (!workId || !imageId) {
        return res.status(400).json({ message: 'Некорректный ID.' });
      }

      const image = await prisma.workImage.findFirst({
        where: { id: imageId, workId },
      });
      if (!image) return res.status(404).json({ message: 'Фото не найдено.' });

      await prisma.workImage.delete({ where: { id: imageId } });
      await removeManagedWorkImage(image.imagePath);
      return res.json({ ok: true, item: mapWork(await getWork(workId)) });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:id',
  validateSameOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Некорректный ID.' });

      const work = await getWork(id);
      if (!work) return res.status(404).json({ message: 'Работа не найдена.' });

      const imagePaths = work.images.map((image) => image.imagePath);
      await prisma.work.delete({ where: { id } });
      await Promise.all(imagePaths.map(removeManagedWorkImage));

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
