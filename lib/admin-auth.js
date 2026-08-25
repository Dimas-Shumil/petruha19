'use strict';

const crypto = require('node:crypto');
const argon2 = require('argon2');

const ADMIN_SESSION_COOKIE = 'p19_admin_session';
const ADMIN_CSRF_COOKIE = 'p19_admin_csrf';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

function normalizeAdminEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashOpaqueToken(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function createOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function validateAdminPassword(password) {
  const normalized = String(password || '');

  if (normalized.length < 12 || normalized.length > 256) {
    throw new Error('Пароль должен содержать от 12 до 256 символов.');
  }

  return normalized;
}

async function hashAdminPassword(password) {
  return argon2.hash(validateAdminPassword(password), ARGON2_OPTIONS);
}

async function verifyAdminPassword(password, passwordHash) {
  try {
    return await argon2.verify(String(passwordHash || ''), String(password || ''));
  } catch {
    return false;
  }
}

async function consumePasswordVerificationCost(password) {
  await argon2.hash(String(password || ''), ARGON2_OPTIONS);
}

function getCookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || '');

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    if (pair.slice(0, separatorIndex).trim() !== name) continue;

    try {
      return decodeURIComponent(pair.slice(separatorIndex + 1).trim());
    } catch {
      return '';
    }
  }

  return '';
}

function getSessionDurationMs(rememberMe) {
  return rememberMe
    ? ADMIN_REMEMBER_SESSION_TTL_MS
    : ADMIN_SESSION_TTL_MS;
}

function getCookieOptions(maxAge, httpOnly) {
  const options = {
    httpOnly,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };

  if (Number.isFinite(maxAge)) options.maxAge = maxAge;
  return options;
}

function setAdminAuthCookies(res, sessionToken, csrfToken, durationMs) {
  res.cookie(
    ADMIN_SESSION_COOKIE,
    sessionToken,
    getCookieOptions(durationMs, true),
  );
  res.cookie(
    ADMIN_CSRF_COOKIE,
    csrfToken,
    getCookieOptions(durationMs, false),
  );
}

function clearAdminAuthCookies(res) {
  res.clearCookie(ADMIN_SESSION_COOKIE, getCookieOptions(undefined, true));
  res.clearCookie(ADMIN_CSRF_COOKIE, getCookieOptions(undefined, false));
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  normalizeAdminEmail,
  hashOpaqueToken,
  createOpaqueToken,
  safeEqualStrings,
  hashAdminPassword,
  verifyAdminPassword,
  consumePasswordVerificationCost,
  getCookieValue,
  getSessionDurationMs,
  setAdminAuthCookies,
  clearAdminAuthCookies,
};
