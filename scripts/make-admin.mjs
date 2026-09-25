/**
 * Grants the ADMIN role to an account.
 *
 * A bootstrap problem: the admin screen is guarded by the ADMIN role, and the
 * only way to grant that role is through the admin screen. Something outside
 * the app has to break the loop, and a script with database access is the
 * honest place for it — safer than a signup flag that ships to production, or a
 * seeded default admin with a known password.
 *
 * Chạy:  pnpm make:admin ban@example.com
 */
import { readEnvFile } from './lib/read-env.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/api/package.json'));

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Thiếu email.  Ví dụ:  pnpm make:admin ban@example.com');
  process.exitCode = 1;
} else {
  await main(email);
}

async function main(target) {
  // DATABASE_URL is read from .env directly so the script needs no dotenv step.
  const env = readEnvFile(resolve(root, '.env'));
  process.env.DATABASE_URL ??= env.DATABASE_URL;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: target },
      select: { id: true, email: true, role: true, profile: { select: { displayName: true } } },
    });

    if (!user) {
      console.error(`Không tìm thấy tài khoản ${target}.`);
      console.error('Đăng ký tài khoản đó trong app trước, rồi chạy lại lệnh này.');
      process.exitCode = 1;
      return;
    }

    if (user.role === 'ADMIN') {
      console.log(`${user.email} đã là quản trị viên rồi.`);
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    console.log(`${user.email} (${user.profile?.displayName ?? '—'}) giờ là quản trị viên.`);
    console.log('Đăng xuất rồi đăng nhập lại để token mang vai trò mới.');

    const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
    console.log(`Tổng số quản trị viên: ${admins}`);
  } finally {
    await prisma.$disconnect();
  }
}
