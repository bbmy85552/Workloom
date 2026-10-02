import { prisma } from './prisma.js';
import { env } from './env.js';
import { hashPassword } from './lib/hash.js';

export async function ensureSeed(options: { createAdminFromEnv?: boolean } = {}) {
  const createAdminFromEnv = options.createAdminFromEnv ?? true;
  const adminEmail = env.ADMIN_EMAIL.toLowerCase();
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin && createAdminFromEnv) {
    const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: env.ADMIN_NAME,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.workspace.create({
      data: { name: '默认空间', ownerId: admin.id, kind: 'PRIVATE' },
    });
    if (env.NODE_ENV === 'production') {
      console.log(`[Workloom] 已创建默认管理员账号: ${adminEmail}`);
    } else {
      console.log(`[Workloom] 已创建默认管理员账号: ${adminEmail} / ${env.ADMIN_PASSWORD}`);
    }
  }
  if (!admin) {
    admin = await prisma.user.findFirst({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (!admin) return;
  const publicWs = await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' } });
  if (!publicWs) {
    await prisma.workspace.create({
      data: { name: '公共知识库', ownerId: admin.id, kind: 'PUBLIC' },
    });
    console.log('[Workloom] 已创建系统级公共知识库');
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  ensureSeed()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
