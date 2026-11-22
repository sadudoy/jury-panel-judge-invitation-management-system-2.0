import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { type HttpError, query } from './db.ts';
import assignmentsRouter from './routes/assignments.ts';
import attendanceRouter from './routes/attendance.ts';
import authRouter from './routes/auth.ts';
import competitionsRouter from './routes/competitions.ts';
import dashboardRouter from './routes/dashboard.ts';
import invitationsRouter from './routes/invitations.ts';
import judgePortalRouter from './routes/judgePortal.ts';
import judgesRouter from './routes/judges.ts';
import slotsRouter from './routes/slots.ts';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers compatible with iframe embedding
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // Health check endpoint
  app.get('/api/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  // REST API routes
  app.use('/api/auth', authRouter);
  app.use('/api/judges', judgesRouter);
  app.use('/api/invitations', invitationsRouter);
  app.use('/api/competitions', competitionsRouter);
  app.use('/api/slots', slotsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/judge', judgePortalRouter);
  app.use('/api', dashboardRouter);

  // Unknown API routes return JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Serve local Lucide browser script without external CDN dependency
  app.get('/vendor/lucide.min.js', (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'node_modules/lucide/dist/umd/lucide.min.js'));
  });

  // Static Vanilla HTML5/CSS3/JS frontend
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // Fallback to index.html for client-side SPA routes (non-API GET requests)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Centralized error handler (never leaks internals or stack traces)
  app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      console.error('[api-error]', err.message);
    }
    const payload: { error: string; details?: unknown } = {
      error: status >= 500 ? 'Internal server error.' : err.message,
    };
    if (status < 500 && err.details !== undefined) {
      payload.details = err.details;
    }
    res.status(status).json(payload);
  });

  return app;
}
