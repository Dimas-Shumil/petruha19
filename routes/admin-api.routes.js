'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
} = require('../middleware/auth');

const router = express.Router();
const LEAD_STATUSES = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const listQuerySchema = z.object({
  status: z.enum(['ALL', ...LEAD_STATUSES]).optional().default('ALL'),
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const leadUpdateSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    internalComment: z.string().trim().max(3000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Нет данных для обновления.',
  });

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

function createLeadNumber(lead) {
  return `P19-${lead.createdAt.getFullYear()}-${String(lead.id).padStart(4, '0')}`;
}

function mapLead(lead) {
  return {
    ...lead,
    publicNumber: createLeadNumber(lead),
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    consentAcceptedAt: lead.consentAcceptedAt?.toISOString() || null,
  };
}

router.use(loadAdminSession, requireAdminAuth);

router.get('/dashboard', async (req, res, next) => {
  try {
    const [leadGroups, totalWorks, publishedWorks, recentLeads] =
      await Promise.all([
        prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.work.count(),
        prisma.work.count({ where: { isPublished: true } }),
        prisma.lead.findMany({
          take: 8,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ]);

    const statusCount = (status) =>
      Number(leadGroups.find((item) => item.status === status)?._count?._all || 0);
    const totalLeads = leadGroups.reduce(
      (total, item) => total + Number(item._count?._all || 0),
      0,
    );

    return res.json({
      metrics: {
        newLeads: statusCount('NEW'),
        inProgressLeads: statusCount('IN_PROGRESS'),
        totalWorks,
        publishedWorks,
      },
      statuses: {
        new: statusCount('NEW'),
        inProgress: statusCount('IN_PROGRESS'),
        completed: statusCount('COMPLETED'),
        cancelled: statusCount('CANCELLED'),
        total: totalLeads,
      },
      recentLeads: recentLeads.map(mapLead),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/leads', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Проверьте параметры списка.' });
    }

    const { status, q, page, limit } = parsed.data;
    const where = {};

    if (status !== 'ALL') where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { service: { contains: q } },
        { car: { contains: q } },
        { comment: { contains: q } },
      ];
    }

    const [total, items, groups] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    return res.json({
      items: items.map(mapLead),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      counts: Object.fromEntries(
        LEAD_STATUSES.map((item) => [
          item,
          Number(groups.find((group) => group.status === item)?._count?._all || 0),
        ]),
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/leads/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный ID.' });

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ message: 'Заявка не найдена.' });

    return res.json({ item: mapLead(lead) });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/leads/:id',
  validateSameOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Некорректный ID.' });

      const parsed = leadUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues?.[0]?.message || 'Проверьте данные.',
        });
      }

      const lead = await prisma.lead.update({
        where: { id },
        data: parsed.data,
      });

      return res.json({ ok: true, item: mapLead(lead) });
    } catch (error) {
      if (error?.code === 'P2025') {
        return res.status(404).json({ message: 'Заявка не найдена.' });
      }
      return next(error);
    }
  },
);

router.delete(
  '/leads/:id',
  validateSameOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Некорректный ID.' });

      await prisma.lead.delete({ where: { id } });
      return res.json({ ok: true });
    } catch (error) {
      if (error?.code === 'P2025') {
        return res.status(404).json({ message: 'Заявка не найдена.' });
      }
      return next(error);
    }
  },
);

module.exports = router;
