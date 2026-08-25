'use strict';

const prisma = require('../lib/prisma');
const {
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  hashOpaqueToken,
  safeEqualStrings,
  getCookieValue,
  clearAdminAuthCookies,
} = require('../lib/admin-auth');

async function loadAdminSession(req, res, next) {
  try {
    req.adminAuth = null;
    const sessionToken = getCookieValue(req, ADMIN_SESSION_COOKIE);

    if (!sessionToken) return next();

    const session = await prisma.adminSession.findUnique({
      where: { tokenHash: hashOpaqueToken(sessionToken) },
      select: {
        id: true,
        csrfTokenHash: true,
        expiresAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session) {
      clearAdminAuthCookies(res);
      return next();
    }

    if (session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
      await prisma.adminSession.deleteMany({ where: { id: session.id } });
      clearAdminAuthCookies(res);
      return next();
    }

    req.adminAuth = {
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt,
      user: session.user,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdminAuth(req, res, next) {
  if (!req.adminAuth) {
    return res.status(401).json({ message: 'Требуется авторизация.' });
  }

  return next();
}

function requireAdminCsrf(req, res, next) {
  if (!req.adminAuth) {
    return res.status(401).json({ message: 'Требуется авторизация.' });
  }

  const headerToken = String(req.get('x-csrf-token') || '').trim();
  const cookieToken = getCookieValue(req, ADMIN_CSRF_COOKIE);

  if (
    !headerToken ||
    !cookieToken ||
    !safeEqualStrings(headerToken, cookieToken) ||
    !safeEqualStrings(hashOpaqueToken(cookieToken), req.adminAuth.csrfTokenHash)
  ) {
    return res.status(403).json({ message: 'CSRF-проверка не пройдена.' });
  }

  return next();
}

module.exports = {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
};
