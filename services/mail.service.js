'use strict';

const nodemailer = require('nodemailer');

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '').trim().toLowerCase(),
  );
}

function isMailConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
      String(process.env.SMTP_USER || '').trim() &&
      String(process.env.SMTP_PASS || '') &&
      String(process.env.TO_EMAIL || '').trim(),
  );
}

const transporter = isMailConfigured()
  ? nodemailer.createTransport({
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
    })
  : null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (symbol) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[symbol]);
}

async function sendLeadNotification(lead) {
  if (!transporter) return { sent: false, reason: 'not_configured' };

  const createdAt = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Krasnoyarsk',
  }).format(lead.createdAt);

  const subject = `Новая заявка PETRUHA19: ${lead.service}`.replace(/[\r\n]/g, ' ');
  const text = [
    'Новая заявка с сайта PETRUHA19',
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    `Услуга: ${lead.service}`,
    `Автомобиль: ${lead.car || '—'}`,
    `Комментарий: ${lead.comment || '—'}`,
    `Дата: ${createdAt}`,
  ].join('\n');

  const html = `
    <div style="max-width:640px;background:#080808;color:#f4f0e4;padding:32px;font-family:Arial,sans-serif;border:1px solid #f5c21b">
      <div style="color:#f5c21b;font-weight:800;letter-spacing:.12em">PETRUHA19</div>
      <h1 style="margin:14px 0 24px;font-size:28px">Новая заявка</h1>
      <p><b>Имя:</b> ${escapeHtml(lead.name)}</p>
      <p><b>Телефон:</b> ${escapeHtml(lead.phone)}</p>
      <p><b>Услуга:</b> ${escapeHtml(lead.service)}</p>
      <p><b>Автомобиль:</b> ${escapeHtml(lead.car || '—')}</p>
      <p><b>Комментарий:</b> ${escapeHtml(lead.comment || '—')}</p>
      <p style="color:#969696">${escapeHtml(createdAt)}</p>
    </div>`;

  await transporter.sendMail({
    from: `"PETRUHA19 сайт" <${process.env.SMTP_USER}>`,
    to: String(process.env.TO_EMAIL).trim(),
    subject,
    text,
    html,
  });

  return { sent: true };
}

module.exports = { isMailConfigured, sendLeadNotification };
