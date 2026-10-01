import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './env.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { workspaceRouter } from './routes/workspace.js';
import { docRouter } from './routes/doc.js';
import { todoRouter } from './routes/todo.js';
import { tableRouter } from './routes/table.js';
import { fontRouter } from './routes/font.js';
import { adminRouter } from './routes/admin.js';
import { attachmentRouter } from './routes/attachment.js';
import { shareRouter } from './routes/share.js';
import { presenceRouter } from './routes/presence.js';
import { usersRouter } from './routes/users.js';
import { calendarRouter } from './routes/calendar.js';
import { mailRouter } from './routes/mail.js';
import { notificationRouter } from './routes/notification.js';
import { preferencesRouter } from './routes/preferences.js';
import { dashboardRouter } from './routes/dashboard.js';
import { recentRouter } from './routes/recent.js';
import { formRouter, publicFormRouter } from './routes/form.js';
import { sessionRouter } from './routes/sessions.js';
import { setupRouter } from './routes/setup.js';
import { cliRouter } from './routes/cli.js';
import { cliKeyRouter } from './routes/cliKey.js';
import { mcpRouter } from './routes/mcp.js';
import { UPLOAD_ROOT } from './lib/upload.js';
import { getPublicBrandSettings, isSystemInitialized } from './lib/systemSettings.js';
import { HttpError } from './lib/asyncHandler.js';

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function requestHost(req: express.Request) {
  const forwardedHost = firstHeader(req.headers['x-forwarded-host']);
  const host = forwardedHost ?? req.headers.host;
  return host?.split(',')[0]?.trim().toLowerCase();
}

function originMatchesRequestHost(origin: string, req: express.Request) {
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return originHost === requestHost(req);
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(env.APP_URLS);
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(
    cors((req, cb) => {
      const origin = req.headers.origin;
      cb(null, {
        origin: !origin || allowedOrigins.has(origin) || originMatchesRequestHost(origin, req),
        credentials: true,
      });
    }),
  );
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'Document Center API' });
  });

  app.use('/mcp', mcpRouter);

  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

  app.use('/api/setup', setupRouter);
  app.use('/api', (req, _res, next) => {
    isSystemInitialized()
      .then((initialized) => {
        if (initialized) return next();
        return next(new HttpError(503, '系统尚未初始化', 'SETUP_REQUIRED'));
      })
      .catch(next);
  });

  app.get('/api/public/settings', async (_req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await getPublicBrandSettings());
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/cli', cliRouter);
  app.use('/api/me', meRouter);
  app.use('/api/me/cli-key', cliKeyRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/workspaces', workspaceRouter);
  app.use('/api/docs', docRouter);
  app.use('/api/todos', todoRouter);
  app.use('/api/tables', tableRouter);
  app.use('/api/fonts', fontRouter);
  app.use('/api/attachments', attachmentRouter);
  app.use('/api/share', shareRouter);
  app.use('/api/presence', presenceRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/mail', mailRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/me/preferences', preferencesRouter);
  app.use('/api/me/sessions', sessionRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/recent', recentRouter);
  app.use('/api/forms', formRouter);
  app.use('/api/public/forms', publicFormRouter);
  app.use('/api/admin', adminRouter);

  // 生产环境托管前端 SPA：将构建产物拷到 server/public/
  if (env.NODE_ENV === 'production') {
    const staticDir = path.resolve(process.cwd(), 'public');
    if (fs.existsSync(staticDir)) {
      app.use(express.static(staticDir));
      app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        const index = path.join(staticDir, 'index.html');
        if (fs.existsSync(index)) return res.sendFile(index);
        return next();
      });
    }
  }

  app.use(errorHandler);
  return app;
}
