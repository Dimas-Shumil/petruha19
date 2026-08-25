'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { sendLeadNotification } = require('../services/mail.service');

const router = express.Router();
const MIN_FORM_TIME_MS = process.env.NODE_ENV === 'production' ? 2_000 : 0;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const leadSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(7).max(40),
    service: z.string().trim().min(2).max(120),
    car: z.string().trim().max(120).optional().default(''),
    message: z.string().trim().max(900).optional().default(''),
    website: z.string().trim().max(200).optional().default(''),
    page: z.string().trim().max(300).optional().default(''),
    form_time: z.number().int().positive(),
  })
  .strict();

const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Слишком много заявок. Попробуйте чуть позже.',
  },
});

function normalizeRussianPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return /^7\d{10}$/.test(digits) ? `+${digits}` : '';
}

function createFingerprint(data) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        phone: data.phone,
        service: data.service,
        car: data.car,
        comment: data.message,
      }),
    )
    .digest('hex');
}

function getRequestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .trim()
    .slice(0, 64);
}

function getUserAgent(req) {
  return String(req.get('user-agent') || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 500);
}

function looksLikeSpam(data) {
  const text = `${data.name} ${data.message}`.toLowerCase();
  const rules = [
    /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu,
    /(?:seo|сео|продвижени|раскрут|таргет|лидогенерац)\w*/iu,
    /(?:предлага\w*\s+услуг|создани\w*\s+сайт|разработк\w*\s+сайт)/iu,
  ];
  return rules.filter((rule) => rule.test(text)).length >= 2;
}

router.post('/send', sendLimiter, async (req, res, next) => {
  try {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Проверьте заполнение формы.',
      });
    }

    const data = parsed.data;
    const elapsed = Date.now() - data.form_time;

    if (elapsed < MIN_FORM_TIME_MS || elapsed > 2 * 60 * 60 * 1000) {
      return res.status(400).json({
        success: false,
        message: 'Обновите страницу и попробуйте ещё раз.',
      });
    }

    if (data.website || looksLikeSpam(data)) {
      return res.json({ success: true, message: 'Заявка отправлена.' });
    }

    const phone = normalizeRussianPhone(data.phone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Введите корректный номер телефона.',
      });
    }

    const normalizedData = { ...data, phone };
    const dedupFingerprint = createFingerprint(normalizedData);
    const duplicate = await prisma.lead.findFirst({
      where: {
        dedupFingerprint,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });

    if (duplicate) {
      return res.json({
        success: true,
        message: 'Заявка уже получена. Мы скоро свяжемся с вами.',
      });
    }

    const lead = await prisma.lead.create({
      data: {
        name: data.name.replace(/\s+/g, ' '),
        phone,
        service: data.service,
        car: data.car,
        comment: data.message,
        page: data.page,
        dedupFingerprint,
        ipAddress: getRequestIp(req),
        userAgent: getUserAgent(req),
        consentAccepted: true,
        consentAcceptedAt: new Date(),
      },
    });

    sendLeadNotification(lead).catch((error) => {
      console.error('Не удалось отправить email о заявке:', error.message || error);
    });

    return res.status(201).json({
      success: true,
      message: 'Спасибо! Заявка отправлена, мы скоро свяжемся с вами.',
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
