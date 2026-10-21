import { assertSafeProductionEnv, env } from './env.js';
import { prisma } from './prisma.js';
import { ensureSeed } from './seed.js';
import { createApp } from './app.js';
import { startCalendarReminder, stopCalendarReminder } from './lib/calendarReminder.js';
import { isSystemInitialized } from './lib/systemSettings.js';

async function bootstrap() {
  const initialized = await isSystemInitialized();
  assertSafeProductionEnv({ initialized });
  if (env.NODE_ENV !== 'production' || initialized) {
    await ensureSeed({ createAdminFromEnv: env.NODE_ENV !== 'production' });
  }
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`[Workloom] API server listening on ${env.NODE_ENV === 'production' ? env.APP_URL : `http://localhost:${env.PORT}`}`);
    if (!initialized && env.NODE_ENV === 'production') {
      console.log('[Workloom] 系统尚未初始化。请使用部署脚本输出的私密初始化链接完成配置。');
    }
    if (!env.MAIL_ENABLED) {
      const mailNotice =
        env.NODE_ENV === 'production'
          ? '[Workloom] MAIL_ENABLED=false；若已在网页初始化中配置 SMTP，将使用数据库中的加密配置。'
          : '[Workloom] MAIL_ENABLED=false，验证码邮件不可用；请配置 SMTP 后再测试注册、换绑邮箱或找回密码。';
      console.log(mailNotice);
    }
  });
  startCalendarReminder();
  process.on('SIGINT', async () => {
    stopCalendarReminder();
    await prisma.$disconnect();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('[Workloom] 启动失败:', err);
  process.exit(1);
});
