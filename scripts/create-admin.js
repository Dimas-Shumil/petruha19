'use strict';

require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const prisma = require('../lib/prisma');
const {
  normalizeAdminEmail,
  hashAdminPassword,
} = require('../lib/admin-auth');

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const name = String(await rl.question('Имя администратора: ')).trim();
    const email = normalizeAdminEmail(await rl.question('Email: '));
    const password = String(await rl.question('Пароль (минимум 12 символов): '));

    if (name.length < 2 || !email.includes('@')) {
      throw new Error('Проверьте имя и email.');
    }

    const passwordHash = await hashAdminPassword(password);
    const user = await prisma.adminUser.upsert({
      where: { email },
      create: {
        name,
        email,
        passwordHash,
        role: 'OWNER',
        isActive: true,
      },
      update: {
        name,
        passwordHash,
        role: 'OWNER',
        isActive: true,
      },
    });

    console.log(`Администратор ${user.email} готов.`);
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
