import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  logActivity,
  optionalString,
  parsePositiveInt,
  requireAuth,
  requireRole,
  requireString,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'), verifyCsrfAndOrigin);

const VALID_COMP_STATUSES = ['DRAFT', 'OPEN', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;

router.get('/', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `WITH slot_stats AS (
         SELECT
           cs.competition_id,
           cs.id AS slot_id,
           cs.status AS slot_status,
           COUNT(ja.id) FILTER (
             WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
                OR ja.assignment_status = 'ACTIVATED_BACKUP'
           )::int AS filled_primary_count,
           COUNT(ja.id) FILTER (
             WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY'
           )::int AS standby_backup_count
         FROM competition_slots cs
         LEFT JOIN judge_assignments ja ON ja.slot_id = cs.id
         GROUP BY cs.competition_id, cs.id, cs.status
       )
       SELECT
         c.*,
         COUNT(ss.slot_id)::int AS total_slots,
         COUNT(ss.slot_id) FILTER (WHERE ss.slot_status <> 'CANCELLED')::int AS active_slots,
         COALESCE(SUM(ss.filled_primary_count) FILTER (WHERE ss.slot_status <> 'CANCELLED'), 0)::int AS filled_primary_positions,
         COALESCE(SUM(ss.standby_backup_count) FILTER (WHERE ss.slot_status <> 'CANCELLED'), 0)::int AS standby_backup_positions,
         CASE
           WHEN c.status = 'CANCELLED' THEN 0
           ELSE COALESCE(
             SUM(GREATEST(0, c.required_primary_judges - ss.filled_primary_count))
               FILTER (WHERE ss.slot_status <> 'CANCELLED'),
             0
           )::int
         END AS vacant_positions
       FROM competitions c
       LEFT JOIN slot_stats ss ON ss.competition_id = c.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      params
    );

    res.json({ competitions: result.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const competitionId = parsePositiveInt(req.params.id, 'competitionId');

    const compRes = await query('SELECT * FROM competitions WHERE id = $1', [competitionId]);
    if (compRes.rows.length === 0) {
      throw createHttpError(404, 'Competition not found.');
    }

    const slotsRes = await query(
      `SELECT
         cs.*,
         COUNT(ja.id) FILTER (
           WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
              OR ja.assignment_status = 'ACTIVATED_BACKUP'
         )::int AS filled_primary_count,
         COUNT(ja.id) FILTER (
           WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY'
         )::int AS standby_backup_count
       FROM competition_slots cs
       LEFT JOIN judge_assignments ja ON ja.slot_id = cs.id
       WHERE cs.competition_id = $1
       GROUP BY cs.id
       ORDER BY cs.start_time ASC`,
      [competitionId]
    );

    res.json({
      competition: compRes.rows[0],
      slots: slotsRes.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = requireString(req.body?.name, 'Competition name', 255);
    const description = optionalString(req.body?.description, 2000);
    const requiredPrimaryJudges = parsePositiveInt(
      req.body?.requiredPrimaryJudges,
      'requiredPrimaryJudges'
    );
    const status = req.body?.status || 'OPEN';
    if (!VALID_COMP_STATUSES.includes(status) || status === 'CANCELLED') {
      throw createHttpError(400, 'Invalid initial competition status.');
    }

    const created = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO competitions (name, description, required_primary_judges, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, description, requiredPrimaryJudges, status]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'COMPETITION_CREATED',
        entityType: 'COMPETITION',
        entityId: inserted.rows[0].id,
        details: { name, requiredPrimaryJudges, status },
      });

      return inserted.rows[0];
    });

    res.status(201).json({ competition: created });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const competitionId = parsePositiveInt(req.params.id, 'competitionId');
    const name = requireString(req.body?.name, 'Competition name', 255);
    const description = optionalString(req.body?.description, 2000);
    const requiredPrimaryJudges = parsePositiveInt(
      req.body?.requiredPrimaryJudges,
      'requiredPrimaryJudges'
    );
    const status = req.body?.status;
    if (!VALID_COMP_STATUSES.includes(status)) {
      throw createHttpError(400, 'Invalid competition status.');
    }
    if (status === 'CANCELLED') {
      throw createHttpError(400, 'Use POST /api/competitions/:id/cancel to cancel a competition.');
    }

    const updated = await withTransaction(async (client) => {
      const existing = await client.query<{ id: number; status: string }>(
        'SELECT id, status FROM competitions WHERE id = $1 FOR UPDATE',
        [competitionId]
      );
      if (existing.rows.length === 0) {
        throw createHttpError(404, 'Competition not found.');
      }
      if (existing.rows[0].status === 'CANCELLED') {
        throw createHttpError(409, 'Cancelled competitions cannot be reopened via edit.');
      }

      const resUpd = await client.query(
        `UPDATE competitions
            SET name = $1,
                description = $2,
                required_primary_judges = $3,
                status = $4,
                updated_at = NOW()
          WHERE id = $5
          RETURNING *`,
        [name, description, requiredPrimaryJudges, status, competitionId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'COMPETITION_UPDATED',
        entityType: 'COMPETITION',
        entityId: competitionId,
        details: { name, requiredPrimaryJudges, status },
      });

      return resUpd.rows[0];
    });

    res.json({ competition: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Scenario 12: Cancel competition after assignments have been created (preserves all records)
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const competitionId = parsePositiveInt(req.params.id, 'competitionId');
    const reason =
      optionalString(req.body?.reason, 1000) || 'Competition cancelled by administrator';

    const outcome = await withTransaction(async (client) => {
      const compRes = await client.query<{ id: number; status: string; name: string }>(
        'SELECT id, status, name FROM competitions WHERE id = $1 FOR UPDATE',
        [competitionId]
      );
      if (compRes.rows.length === 0) {
        throw createHttpError(404, 'Competition not found.');
      }
      if (compRes.rows[0].status === 'CANCELLED') {
        throw createHttpError(409, 'Competition is already cancelled.');
      }

      const updatedComp = await client.query(
        `UPDATE competitions
            SET status = 'CANCELLED',
                cancellation_reason = $1,
                cancelled_at = NOW(),
                updated_at = NOW()
          WHERE id = $2
          RETURNING *`,
        [reason, competitionId]
      );

      const cancelledSlots = await client.query<{ id: number }>(
        `UPDATE competition_slots
            SET status = 'CANCELLED',
                updated_at = NOW()
          WHERE competition_id = $1
            AND status <> 'CANCELLED'
          RETURNING id`,
        [competitionId]
      );

      const slotIds = cancelledSlots.rows.map((s) => s.id);
      let cancelledAssignmentsCount = 0;

      if (slotIds.length > 0) {
        const cancelledAssignments = await client.query<{ id: number }>(
          `UPDATE judge_assignments
              SET assignment_status = 'CANCELLED_SLOT',
                  status_reason = $1,
                  updated_at = NOW()
            WHERE slot_id = ANY($2::int[])
              AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
            RETURNING id`,
          [reason, slotIds]
        );
        cancelledAssignmentsCount = cancelledAssignments.rows.length;
      }

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'COMPETITION_CANCELLED',
        entityType: 'COMPETITION',
        entityId: competitionId,
        details: {
          competitionName: compRes.rows[0].name,
          reason,
          cancelledSlotsCount: slotIds.length,
          cancelledAssignmentsCount,
        },
      });

      return {
        competition: updatedComp.rows[0],
        cancelledSlotsCount: slotIds.length,
        cancelledAssignmentsCount,
      };
    });

    res.json(outcome);
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
