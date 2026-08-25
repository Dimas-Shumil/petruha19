'use strict';

const path = require('node:path');
const express = require('express');
const { loadAdminSession } = require('../middleware/auth');

const router = express.Router();
const adminPagesDir = path.join(__dirname, '..', 'admin-pages');

function sendAdminPage(res, fileName) {
  res.set('Cache-Control', 'no-store');
  return res.sendFile(path.join(adminPagesDir, fileName));
}

function requireAdminPage(req, res, next) {
  if (!req.adminAuth) return res.redirect('/admin/login');
  return next();
}

router.use(loadAdminSession);

router.get('/login', (req, res) => {
  if (req.adminAuth) return res.redirect('/admin');
  return sendAdminPage(res, 'login.html');
});

router.get('/', requireAdminPage, (req, res) => {
  return sendAdminPage(res, 'dashboard.html');
});

router.get('/leads', requireAdminPage, (req, res) => {
  return sendAdminPage(res, 'leads.html');
});

router.get('/works', requireAdminPage, (req, res) => {
  return sendAdminPage(res, 'works.html');
});

router.get('/works/new', requireAdminPage, (req, res) => {
  return sendAdminPage(res, 'work-edit.html');
});

router.get('/works/:id', requireAdminPage, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.redirect('/admin/works');
  return sendAdminPage(res, 'work-edit.html');
});

module.exports = router;
