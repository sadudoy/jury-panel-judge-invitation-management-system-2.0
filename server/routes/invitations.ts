import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  expireOverdueInvitations,
  logActivity,
  parsePositiveInt,
  requireAuth,
  requireIsoDate,
  requireRole,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'), verifyCsrfAndOrigin);

router.get('/', async (req, res, next) => {
  try {
    await expireOverdueInvitations();

    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const judgeType = typeof req.query.judgeType === 'string' ? req.query.judgeType.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`ji.response_status = $${params.length}`);
    }

    if (judgeType === 'EXTERNAL' || judgeType === 'FACULTY') {
      params.push(judgeType);
      conditions.push(`j.judge_type = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(`(j.name ILIKE $${idx} OR j.email ILIKE $${idx} OR j.institution ILIKE $${idx})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
         ji.*,
         j.name AS judge_name,
         j.email AS judge_email,
         j.phone AS judge_phone,
         j.designation,
         j.institution,
         j.judge_type,
         j.is_active AS judge_is_active,
         u.full_name AS sent_by_admin_name,
         COUNT(ja.id) FILTER (
           WHERE ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
         )::int AS active_assignments_count
       FROM judge_invitations ji
       JOIN judges j ON j.id = ji.judge_id
       LEFT JOIN users u ON u.id = ji.sent_by_admin_id
       LEFT JOIN judge_assignments ja ON ja.judge_id = j.id
       ${whereClause}
       GROUP BY ji.id, j.id, u.full_name
       ORDER BY ji.sent_date DESC`,
      params
    );

    res.json({ invitations: result.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const rawIds = req.body?.judgeIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      throw createHttpError(400, 'judgeIds must be a non-empty array of judge IDs.');
    }

    const judgeIds = Array.from(new Set(rawIds.map((id) => parsePositiveInt(id, 'judgeId'))));
    const expirationDate = requireIsoDate(req.body?.expirationDate, 'expirationDate');

    if (expirationDate.getTime() <= Date.now()) {
      throw createHttpError(400, 'Expiration deadline must be in the future.');
    }

    const results = await withTransaction(async (client) => {
      await expireOverdueInvitations(client);

      const sent: Array<{ judgeId: number; invitationId: number; action: string }> = [];
      const skipped: Array<{ judgeId: number; reason: string }> = [];

      for (const judgeId of judgeIds) {
        const judgeRes = await client.query<{ id: number; name: string; is_active: boolean }>(
          'SELECT id, name, is_active FROM judges WHERE id = $1 FOR UPDATE',
          [judgeId]
        );
        if (judgeRes.rows.length === 0) {
          skipped.push({ judgeId, reason: 'Judge does not exist.' });
          continue;
        }
        if (!judgeRes.rows[0].is_active) {
          skipped.push({ judgeId, reason: 'Judge account is deactivated.' });
          continue;
        }

        const existingRes = await client.query<{ id: number; response_status: string }>(
          'SELECT id, response_status FROM judge_invitations WHERE judge_id = $1 FOR UPDATE',
          [judgeId]
        );

        if (existingRes.rows.length === 0) {
          const inserted = await client.query<{ id: number }>(
            `INSERT INTO judge_invitations (judge_id, sent_by_admin_id, sent_date, expiration_date, response_status)
             VALUES ($1, $2, NOW(), $3, 'PENDING')
             RETURNING id`,
            [judgeId, req.auth!.userId, expirationDate]
          );
          await logActivity(client, {
            actorUserId: req.auth!.userId,
            actorRole: 'ADMIN',
            action: 'INVITATION_SENT',
            entityType: 'INVITATION',
            entityId: inserted.rows[0].id,
            details: { judgeId, expirationDate: expirationDate.toISOString() },
          });
          sent.push({ judgeId, invitationId: inserted.rows[0].id, action: 'CREATED' });
        } else {
          const existing = existingRes.rows[0];
          if (existing.response_status === 'EXPIRED' || existing.response_status === 'CANCELLED') {
            await client.query(
              `UPDATE judge_invitations
                  SET response_status = 'PENDING',
                      expiration_date = $1,
                      last_resent_date = NOW(),
                      resend_count = resend_count + 1,
                      response_date = NULL,
                      response_note = NULL,
                      sent_by_admin_id = $2,
                      updated_at = NOW()
                WHERE id = $3`,
              [expirationDate, req.auth!.userId, existing.id]
            );
            await logActivity(client, {
              actorUserId: req.auth!.userId,
              actorRole: 'ADMIN',
              action: 'INVITATION_REOPENED',
              entityType: 'INVITATION',
              entityId: existing.id,
              details: { judgeId, previousStatus: existing.response_status, expirationDate: expirationDate.toISOString() },
            });
            sent.push({ judgeId, invitationId: existing.id, action: 'REOPENED' });
          } else {
            skipped.push({
              judgeId,
              reason: `Judge already has a fest invitation with status ${existing.response_status}.`,
            });
          }
        }
      }

      if (sent.length === 0 && judgeIds.length === 1) {
        throw createHttpError(409, skipped[0]?.reason || 'Invitation could not be sent.');
      }

      return { sent, skipped };
    });

    res.status(results.sent.length > 0 ? 201 : 200).json(results);
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/:id/resend', async (req, res, next) => {
  try {
    const invitationId = parsePositiveInt(req.params.id, 'invitationId');
    const expirationDate = requireIsoDate(req.body?.expirationDate, 'expirationDate');
    if (expirationDate.getTime() <= Date.now()) {
      throw createHttpError(400, 'New expiration deadline must be in the future.');
    }

    const updated = await withTransaction(async (client) => {
      await expireOverdueInvitations(client);

      const invRes = await client.query<{
        id: number;
        judge_id: number;
        response_status: string;
        judge_active: boolean;
      }>(
        `SELECT ji.id, ji.judge_id, ji.response_status, j.is_active AS judge_active
         FROM judge_invitations ji
         JOIN judges j ON j.id = ji.judge_id
         WHERE ji.id = $1
         FOR UPDATE`,
        [invitationId]
      );

      if (invRes.rows.length === 0) {
        throw createHttpError(404, 'Invitation not found.');
      }

      const inv = invRes.rows[0];
      if (!inv.judge_active) {
        throw createHttpError(409, 'Cannot resend invitation to a deactivated judge.');
      }
      if (inv.response_status === 'ACCEPTED' || inv.response_status === 'REJECTED') {
        throw createHttpError(
          409,
          `Cannot resend an invitation that has already been ${inv.response_status}.`
        );
      }

      const resUpd = await client.query(
        `UPDATE judge_invitations
            SET response_status = 'PENDING',
                expiration_date = $1,
                last_resent_date = NOW(),
                resend_count = resend_count + 1,
                sent_by_admin_id = $2,
                updated_at = NOW()
          WHERE id = $3
          RETURNING *`,
        [expirationDate, req.auth!.userId, invitationId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'INVITATION_RESENT',
        entityType: 'INVITATION',
        entityId: invitationId,
        details: {
          judgeId: inv.judge_id,
          previousStatus: inv.response_status,
          expirationDate: expirationDate.toISOString(),
        },
      });

      return resUpd.rows[0];
    });

    res.json({ invitation: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const invitationId = parsePositiveInt(req.params.id, 'invitationId');

    const updated = await withTransaction(async (client) => {
      const invRes = await client.query<{ id: number; judge_id: number; response_status: string }>(
        'SELECT id, judge_id, response_status FROM judge_invitations WHERE id = $1 FOR UPDATE',
        [invitationId]
      );
      if (invRes.rows.length === 0) {
        throw createHttpError(404, 'Invitation not found.');
      }

      const inv = invRes.rows[0];
      if (inv.response_status === 'CANCELLED') {
        throw createHttpError(409, 'Invitation is already cancelled.');
      }
      if (inv.response_status === 'REJECTED') {
        throw createHttpError(409, 'Cannot cancel an invitation that was already rejected by the judge.');
      }

      const activeAssignments = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM judge_assignments
         WHERE judge_id = $1
           AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')`,
        [inv.judge_id]
      );

      if (Number(activeAssignments.rows[0].cnt) > 0) {
        throw createHttpError(
          409,
          'Cannot cancel invitation while judge has active slot assignments. Withdraw or replace assignments first.'
        );
      }

      const resUpd = await client.query(
        `UPDATE judge_invitations
            SET response_status = 'CANCELLED',
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [invitationId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'INVITATION_CANCELLED',
        entityType: 'INVITATION',
        entityId: invitationId,
        details: { judgeId: inv.judge_id, previousStatus: inv.response_status },
      });

      return resUpd.rows[0];
    });

    res.json({ invitation: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/expire-overdue', async (_req, res, next) => {
  try {
    const expiredCount = await expireOverdueInvitations();
    res.json({ expiredCount });
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
