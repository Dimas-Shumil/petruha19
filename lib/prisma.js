'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = global.__petruha19Prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__petruha19Prisma = prisma;
}

module.exports = prisma;
