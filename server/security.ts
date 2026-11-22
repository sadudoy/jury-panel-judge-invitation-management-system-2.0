import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type pg from 'pg';
import { createHttpError, getPool, query } from './db.ts';

export type UserRole = 'ADMIN' | 'JUDGE';

export interface AuthenticatedSession {
  sessionId: number;
  userId: number;
  email: string;
  fullName: string;
  role: UserRole;
  judgeId: number | null;
  judgeType: 'EXTERNAL' | 'FACULTY' | null;
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

export const SESSION_COOKIE_NAME = 'baust_sid';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type QueryExecutor = pg.Pool | pg.PoolClient;

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function setSessionCookie(res: Response, rawToken: string): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function createSession(
  executor: QueryExecutor,
  userId: number
): Promise<{ rawToken: string; csrfToken: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await executor.query(
    `INSERT INTO user_sessions (token_hash, user_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, csrfToken, expiresAt]
  );

  return { rawToken, csrfToken };
}

export async function loadAuthSession(req: Request): Promise<AuthenticatedSession | null> {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const res = await query<{
    session_id: number;
    user_id: number;
    email: string;
    full_name: string;
    role: UserRole;
    user_active: boolean;
    csrf_token: string;
    judge_id: number | null;
    judge_type: 'EXTERNAL' | 'FACULTY' | null;
    judge_active: boolean | null;
  }>(
    `SELECT
       us.id AS session_id,
       u.id AS user_id,
       u.email,
       u.full_name,
       u.role,
       u.is_active AS user_active,
       us.csrf_token,
       j.id AS judge_id,
       j.judge_type,
       j.is_active AS judge_active
     FROM user_sessions us
     JOIN users u ON u.id = us.user_id
     LEFT JOIN judges j ON j.user_id = u.id
     WHERE us.token_hash = $1
       AND us.expires_at > NOW()`,
    [tokenHash]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  if (!row.user_active || (row.role === 'JUDGE' && row.judge_active !== true)) {
    await query('DELETE FROM user_sessions WHERE id = $1', [row.session_id]);
    return null;
  }

  // Sliding touch (best-effort)
  query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1', [row.session_id]).catch(() => {});

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    judgeId: row.judge_id,
    judgeType: row.judge_type,
    csrfToken: row.csrf_token,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await loadAuthSession(req);
    if (!auth) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this resource.' });
      return;
    }
    if (req.auth.role === 'JUDGE' && !req.auth.judgeId) {
      res.status(403).json({ error: 'Judge profile is not linked to this account.' });
      return;
    }
    next();
  };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyCsrfAndOrigin(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  // Verify Origin if provided by browser
  const origin = req.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const expectedHost = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      if (expectedHost && originHost !== expectedHost) {
        res.status(403).json({ error: 'Cross-origin request rejected.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid Origin header.' });
      return;
    }
  }

  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const headerToken = req.get('x-csrf-token') || '';
  if (!headerToken || !timingSafeEqualStr(headerToken, req.auth.csrfToken)) {
    res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    return;
  }

  next();
}

export async function logActivity(
  executor: QueryExecutor,
  params: {
    actorUserId?: number | null;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId?: number | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await executor.query(
    `INSERT INTO activity_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      params.actorUserId ?? null,
      params.actorRole ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      JSON.stringify(params.details ?? {}),
    ]
  );
}

export async function expireOverdueInvitations(executor?: QueryExecutor): Promise<number> {
  const db = executor ?? getPool();
  const expired = await db.query<{ id: number; judge_id: number }>(
    `UPDATE judge_invitations
        SET response_status = 'EXPIRED',
            updated_at = NOW()
      WHERE response_status = 'PENDING'
        AND expiration_date <= NOW()
      RETURNING id, judge_id`
  );

  for (const row of expired.rows) {
    await logActivity(db, {
      actorUserId: null,
      actorRole: 'SYSTEM',
      action: 'INVITATION_AUTO_EXPIRED',
      entityType: 'INVITATION',
      entityId: row.id,
      details: { judgeId: row.judge_id },
    });
  }

  return expired.rows.length;
}

// Input validation helpers
export function parsePositiveInt(val: unknown, fieldName: string): number {
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    throw createHttpError(400, `${fieldName} must be a positive integer.`);
  }
  return num;
}

export function requireString(val: unknown, fieldName: string, maxLen = 500): string {
  if (typeof val !== 'string') {
    throw createHttpError(400, `${fieldName} is required.`);
  }
  const trimmed = val.trim();
  if (!trimmed) {
    throw createHttpError(400, `${fieldName} cannot be empty.`);
  }
  if (trimmed.length > maxLen) {
    throw createHttpError(400, `${fieldName} must be at most ${maxLen} characters.`);
  }
  return trimmed;
}

export function optionalString(val: unknown, maxLen = 2000): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') {
    throw createHttpError(400, 'Invalid text field.');
  }
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) {
    throw createHttpError(400, `Text field exceeds maximum length of ${maxLen}.`);
  }
  return trimmed;
}

export function requireEmail(val: unknown, fieldName = 'email'): string {
  const email = requireString(val, fieldName, 255).toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw createHttpError(400, `Invalid ${fieldName} address.`);
  }
  return email;
}

export function requireIsoDate(val: unknown, fieldName: string): Date {
  if (typeof val !== 'string' || !val.trim()) {
    throw createHttpError(400, `${fieldName} is required.`);
  }
  const parsed = new Date(val);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid ISO date/time.`);
  }
  return parsed;
}
