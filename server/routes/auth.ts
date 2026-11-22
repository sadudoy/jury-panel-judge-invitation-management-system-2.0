import bcrypt from 'bcrypt';
import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  clearSessionCookie,
  createSession,
  hashSessionToken,
  loadAuthSession,
  logActivity,
  requireAuth,
  requireEmail,
  requireString,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

router.get('/status', async (_req, res, next) => {
  try {
    const adminCountRes = await query<{ cnt: string }>(
      "SELECT COUNT(*) AS cnt FROM users WHERE role = 'ADMIN'"
    );
    const needsAdminSetup = Number(adminCountRes.rows[0].cnt) === 0;
    res.json({ needsAdminSetup });
  } catch (err) {
    next(mapPgError(err));
  }
});

// One-time initial admin claim route (only active when zero ADMIN accounts exist)
router.post('/setup-admin', async (req, res, next) => {
  try {
    const fullName = requireString(req.body?.fullName, 'Full name', 255);
    const email = requireEmail(req.body?.email, 'Email');
    const password = requireString(req.body?.password, 'Password', 128);
    if (password.length < 8) {
      throw createHttpError(400, 'Password must be at least 8 characters long.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await withTransaction(async (client) => {
      // Lock users table in SHARE ROW EXCLUSIVE mode to prevent concurrent race during bootstrap
      await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const existingAdmins = await client.query<{ cnt: string }>(
        "SELECT COUNT(*) AS cnt FROM users WHERE role = 'ADMIN'"
      );
      if (Number(existingAdmins.rows[0].cnt) > 0) {
        throw createHttpError(409, 'Initial administrator account has already been configured.');
      }

      const inserted = await client.query<{
        id: number;
        email: string;
        full_name: string;
        role: 'ADMIN';
      }>(
        `INSERT INTO users (email, password_hash, role, full_name, is_active, last_login_at)
         VALUES ($1, $2, 'ADMIN', $3, TRUE, NOW())
         RETURNING id, email, full_name, role`,
        [email, passwordHash, fullName]
      );

      const user = inserted.rows[0];
      const session = await createSession(client, user.id);

      await logActivity(client, {
        actorUserId: user.id,
        actorRole: 'ADMIN',
        action: 'ADMIN_BOOTSTRAP_SETUP',
        entityType: 'USER',
        entityId: user.id,
        details: { email: user.email },
      });

      return { user, session };
    });

    setSessionCookie(res, result.session.rawToken);
    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.full_name,
        role: result.user.role,
        judgeId: null,
        judgeType: null,
      },
      csrfToken: result.session.csrfToken,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = requireEmail(req.body?.email, 'Email');
    const password = requireString(req.body?.password, 'Password', 128);
    const expectedRole = req.body?.expectedRole;
    if (expectedRole !== undefined && expectedRole !== 'ADMIN' && expectedRole !== 'JUDGE') {
      throw createHttpError(400, 'Invalid expectedRole filter.');
    }

    const userRes = await query<{
      id: number;
      email: string;
      password_hash: string;
      role: 'ADMIN' | 'JUDGE';
      full_name: string;
      is_active: boolean;
      judge_id: number | null;
      judge_type: 'EXTERNAL' | 'FACULTY' | null;
      judge_active: boolean | null;
    }>(
      `SELECT
         u.id,
         u.email,
         u.password_hash,
         u.role,
         u.full_name,
         u.is_active,
         j.id AS judge_id,
         j.judge_type,
         j.is_active AS judge_active
       FROM users u
       LEFT JOIN judges j ON j.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    );

    if (userRes.rows.length === 0) {
      throw createHttpError(401, 'Invalid email or password.');
    }

    const user = userRes.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw createHttpError(401, 'Invalid email or password.');
    }

    if (!user.is_active || (user.role === 'JUDGE' && user.judge_active !== true)) {
      throw createHttpError(403, 'This account has been deactivated. Contact the Fest Administrator.');
    }

    if (expectedRole && user.role !== expectedRole) {
      throw createHttpError(
        403,
        expectedRole === 'ADMIN'
          ? 'This login portal is restricted to Administrators.'
          : 'This login portal is restricted to Judges.'
      );
    }

    const session = await withTransaction(async (client) => {
      await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      const created = await createSession(client, user.id);
      await logActivity(client, {
        actorUserId: user.id,
        actorRole: user.role,
        action: 'USER_LOGIN',
        entityType: 'USER',
        entityId: user.id,
        details: { role: user.role },
      });
      return created;
    });

    setSessionCookie(res, session.rawToken);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        judgeId: user.judge_id,
        judgeType: user.judge_type,
      },
      csrfToken: session.csrfToken,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken && typeof rawToken === 'string') {
      const tokenHash = hashSessionToken(rawToken);
      await query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
    }
    clearSessionCookie(res);
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const auth = await loadAuthSession(req);
    if (!auth) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    res.json({
      user: {
        id: auth.userId,
        email: auth.email,
        fullName: auth.fullName,
        role: auth.role,
        judgeId: auth.judgeId,
        judgeType: auth.judgeType,
      },
      csrfToken: auth.csrfToken,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/change-password', requireAuth, verifyCsrfAndOrigin, async (req, res, next) => {
  try {
    const currentPassword = requireString(req.body?.currentPassword, 'Current password', 128);
    const newPassword = requireString(req.body?.newPassword, 'New password', 128);
    if (newPassword.length < 8) {
      throw createHttpError(400, 'New password must be at least 8 characters long.');
    }

    const userRes = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.auth!.userId]
    );
    if (userRes.rows.length === 0) {
      throw createHttpError(404, 'User not found.');
    }

    const valid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!valid) {
      throw createHttpError(400, 'Current password is incorrect.');
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, req.auth!.userId]
      );
      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: 'PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: req.auth!.userId,
      });
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
