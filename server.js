'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const prisma = require('./lib/prisma');
const apiRouter = require('./routes/api.routes');
const publicRouter = require('./routes/public.routes');
const authRouter = require('./routes/auth.routes');
const adminRouter = require('./routes/admin.routes');
const adminApiRouter = require('./routes/admin-api.routes');
const adminWorksRouter = require('./routes/admin-works.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.SITE_ORIGIN,
  'https://petruha19.ru',
  'https://www.petruha19.ru',
].filter(Boolean);

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '').trim().toLowerCase(),
  );
}

function isSmtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
      String(process.env.SMTP_USER || '').trim() &&
      String(process.env.SMTP_PASS || '') &&
      String(process.env.TO_EMAIL || '').trim(),
  );
}

async function reportSmtpStatus() {
  if (!isSmtpConfigured()) {
    console.log('SMTP не настроен — заявки сохраняются только в базе');
    return;
  }

  const smtpTransporter = nodemailer.createTransport({
    host: String(process.env.SMTP_HOST).trim(),
    port: Number(process.env.SMTP_PORT) || 465,
    secure: parseBoolean(process.env.SMTP_SECURE),
    auth: {
      user: String(process.env.SMTP_USER).trim(),
      pass: String(process.env.SMTP_PASS),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await smtpTransporter.verify();
    console.log('SMTP готов к отправке писем');
  } catch (error) {
    console.error(`SMTP недоступен: ${error.message || error}`);
  } finally {
    smtpTransporter.close();
  }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS blocked'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    credentials: true,
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: isProduction ? '1h' : 0,
    etag: true,
  }),
);
app.use(
  '/site',
  express.static(path.join(__dirname, 'site'), {
    maxAge: isProduction ? '7d' : 0,
    etag: true,
  }),
);

app.get('/health', async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ success: true, database: 'ok' });
  } catch (error) {
    return next(error);
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  return res.sendFile(path.join(__dirname, 'robots.txt'));
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const works = await prisma.work.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const origin = (() => {
      try {
        return new URL(process.env.SITE_ORIGIN || 'https://petruha19.ru').origin;
      } catch {
        return 'https://petruha19.ru';
      }
    })();
    const staticUrls = ['/', '/portfolio', '/privacy-policy'];
    const entries = [
      ...staticUrls.map((pathname) => `<url><loc>${origin}${pathname}</loc></url>`),
      ...works.map((work) => `<url><loc>${origin}/portfolio/${encodeURIComponent(work.slug)}</loc><lastmod>${work.updatedAt.toISOString()}</lastmod></url>`),
    ];
    res.type('application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`);
  } catch (error) {
    return next(error);
  }
});

app.use('/api/admin/auth', authRouter);
app.use('/api/admin/works', adminWorksRouter);
app.use('/api/admin', adminApiRouter);
app.use('/api', apiRouter);
app.use('/api', publicRouter);
app.use('/admin', adminRouter);

function sendPublicPage(res, fileName) {
  return res.sendFile(path.join(__dirname, 'public', fileName));
}

app.get('/', (req, res) => sendPublicPage(res, 'index.html'));
app.get(['/portfolio', '/portfolio.html'], (req, res) =>
  sendPublicPage(res, 'portfolio.html'),
);
app.get('/portfolio/:slug', (req, res, next) => {
  const slug = String(req.params.slug || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return next();
  return sendPublicPage(res, 'work.html');
});
app.get(['/contacts', '/contacts.html'], (req, res) => res.redirect(302, '/#contacts'));
app.get(['/privacy-policy', '/privacy-policy.html'], (req, res) =>
  sendPublicPage(res, 'privacy-policy.html'),
);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`PETRUHA19 server started: http://localhost:${PORT}`);
  void reportSmtpStatus();
});

async function shutdown(signal) {
  console.log(`${signal}: stopping PETRUHA19`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
