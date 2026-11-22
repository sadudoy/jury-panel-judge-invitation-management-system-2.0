import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  logActivity,
  optionalString,
  parsePositiveInt,
  requireAuth,
  requireIsoDate,
  requireRole,
  requireString,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'), verifyCsrfAndOrigin);

router.get('/', async (req, res, next) => {
  try {
    const competitionId = req.query.competitionId
      ? parsePositiveInt(req.query.competitionId, 'competitionId')
      : null;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (competitionId) {
      params.push(competitionId);
      conditions.push(`cs.competition_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`cs.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
         cs.*,
         c.name AS competition_name,
         c.required_primary_judges,
         c.status AS competition_status,
         COUNT(ja.id) FILTER (
           WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
              OR ja.assignment_status = 'ACTIVATED_BACKUP'
         )::int AS filled_primary_count,
         COUNT(ja.id) FILTER (
           WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY'
         )::int AS standby_backup_count,
         CASE
           WHEN cs.status = 'CANCELLED' OR c.status = 'CANCELLED' THEN 0
           ELSE GREATEST(
             0,
             c.required_primary_judges - COUNT(ja.id) FILTER (
               WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
                  OR ja.assignment_status = 'ACTIVATED_BACKUP'
             )::int
           )
         END AS vacant_positions
       FROM competition_slots cs
       JOIN competitions c ON c.id = cs.competition_id
       LEFT JOIN judge_assignments ja ON ja.slot_id = cs.id
       ${whereClause}
       GROUP BY cs.id, c.id
       ORDER BY cs.start_time ASC`,
      params
    );

    res.json({ slots: result.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const slotId = parsePositiveInt(req.params.id, 'slotId');

    const slotRes = await query(
      `SELECT
         cs.*,
         c.name AS competition_name,
         c.description AS competition_description,
         c.required_primary_judges,
         c.status AS competition_status
       FROM competition_slots cs
       JOIN competitions c ON c.id = cs.competition_id
       WHERE cs.id = $1`,
      [slotId]
    );

    if (slotRes.rows.length === 0) {
      throw createHttpError(404, 'Competition slot not found.');
    }

    const assignmentsRes = await query(
      `SELECT
         ja.*,
         j.name AS judge_name,
         j.email AS judge_email,
         j.phone AS judge_phone,
         j.designation,
         j.institution,
         j.judge_type,
         j.is_active AS judge_is_active,
         att.attendance_status,
         att.marked_time,
         att.remarks AS attendance_remarks,
         orig_j.name AS replaced_judge_name,
         rep_ja.id AS replacement_assignment_id,
         rep_j.name AS replacement_judge_name
       FROM judge_assignments ja
       JOIN judges j ON j.id = ja.judge_id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       LEFT JOIN judge_assignments orig_ja ON orig_ja.id = ja.replaces_assignment_id
       LEFT JOIN judges orig_j ON orig_j.id = orig_ja.judge_id
       LEFT JOIN judge_assignments rep_ja ON rep_ja.replaces_assignment_id = ja.id
         AND rep_ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP')
       LEFT JOIN judges rep_j ON rep_j.id = rep_ja.judge_id
       WHERE ja.slot_id = $1
       ORDER BY
         CASE WHEN ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP', 'STANDBY') THEN 0 ELSE 1 END,
         ja.role ASC,
         ja.assigned_at ASC`,
      [slotId]
    );

    res.json({
      slot: slotRes.rows[0],
      assignments: assignmentsRes.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/', async (req, res, next) => {
  try {
    const competitionId = parsePositiveInt(req.body?.competitionId, 'competitionId');
    const slotLabel = requireString(req.body?.slotLabel, 'Slot label', 150);
    const startTime = requireIsoDate(req.body?.startTime, 'startTime');
    const endTime = requireIsoDate(req.body?.endTime, 'endTime');
    const venue = requireString(req.body?.venue, 'Venue', 255);

    if (endTime.getTime() <= startTime.getTime()) {
      throw createHttpError(400, 'Slot end_time must be strictly after start_time.');
    }

    const created = await withTransaction(async (client) => {
      const compRes = await client.query<{ id: number; status: string }>(
        'SELECT id, status FROM competitions WHERE id = $1 FOR UPDATE',
        [competitionId]
      );
      if (compRes.rows.length === 0) {
        throw createHttpError(404, 'Competition not found.');
      }
      if (compRes.rows[0].status === 'CANCELLED') {
        throw createHttpError(409, 'Cannot add slots to a cancelled competition.');
      }

      const inserted = await client.query(
        `INSERT INTO competition_slots (competition_id, slot_label, start_time, end_time, venue, status)
         VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
         RETURNING *`,
        [competitionId, slotLabel, startTime, endTime, venue]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'SLOT_CREATED',
        entityType: 'SLOT',
        entityId: inserted.rows[0].id,
        details: { competitionId, slotLabel, venue, startTime: startTime.toISOString(), endTime: endTime.toISOString() },
      });

      return inserted.rows[0];
    });

    res.status(201).json({ slot: created });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Scenario 11: Modify slot schedule after judges have been assigned (detects & surfaces/resolves overlaps)
router.put('/:id', async (req, res, next) => {
  try {
    const slotId = parsePositiveInt(req.params.id, 'slotId');
    const slotLabel = requireString(req.body?.slotLabel, 'Slot label', 150);
    const startTime = requireIsoDate(req.body?.startTime, 'startTime');
    const endTime = requireIsoDate(req.body?.endTime, 'endTime');
    const venue = requireString(req.body?.venue, 'Venue', 255);
    const conflictResolution =
      req.body?.conflictResolution === 'WITHDRAW_CONFLICTING' ? 'WITHDRAW_CONFLICTING' : 'BLOCK';

    if (endTime.getTime() <= startTime.getTime()) {
      throw createHttpError(400, 'Slot end_time must be strictly after start_time.');
    }

    const result = await withTransaction(async (client) => {
      const slotRes = await client.query<{
        id: number;
        competition_id: number;
        start_time: Date;
        end_time: Date;
        status: string;
        comp_status: string;
      }>(
        `SELECT cs.*, c.status AS comp_status
         FROM competition_slots cs
         JOIN competitions c ON c.id = cs.competition_id
         WHERE cs.id = $1
         FOR UPDATE OF cs`,
        [slotId]
      );

      if (slotRes.rows.length === 0) {
        throw createHttpError(404, 'Competition slot not found.');
      }

      const slot = slotRes.rows[0];
      if (slot.status === 'CANCELLED' || slot.comp_status === 'CANCELLED') {
        throw createHttpError(409, 'Cancelled slots cannot be rescheduled.');
      }

      // Detect any assigned judges on this slot who would overlap with another active assignment
      const conflictsRes = await client.query<{
        assignment_id: number;
        judge_id: number;
        judge_name: string;
        role: string;
        conflicting_slot_id: number;
        conflicting_slot_label: string;
        conflicting_competition: string;
        conflicting_start: Date;
        conflicting_end: Date;
      }>(
        `SELECT
           ja1.id AS assignment_id,
           j.id AS judge_id,
           j.name AS judge_name,
           ja1.role,
           cs2.id AS conflicting_slot_id,
           cs2.slot_label AS conflicting_slot_label,
           c2.name AS conflicting_competition,
           cs2.start_time AS conflicting_start,
           cs2.end_time AS conflicting_end
         FROM judge_assignments ja1
         JOIN judges j ON j.id = ja1.judge_id
         JOIN judge_assignments ja2 ON ja2.judge_id = ja1.judge_id AND ja2.id <> ja1.id
         JOIN competition_slots cs2 ON cs2.id = ja2.slot_id
         JOIN competitions c2 ON c2.id = cs2.competition_id
         WHERE ja1.slot_id = $1
           AND ja1.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
           AND ja2.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
           AND cs2.status <> 'CANCELLED'
           AND cs2.start_time < $3
           AND cs2.end_time > $2`,
        [slotId, startTime, endTime]
      );

      if (conflictsRes.rows.length > 0 && conflictResolution === 'BLOCK') {
        throw createHttpError(
          409,
          'Rescheduling creates overlapping assignments for one or more assigned judges.',
          { conflicts: conflictsRes.rows }
        );
      }

      const withdrawnAssignmentIds: number[] = [];
      if (conflictsRes.rows.length > 0 && conflictResolution === 'WITHDRAW_CONFLICTING') {
        const conflictIds = Array.from(new Set(conflictsRes.rows.map((c) => c.assignment_id)));
        await client.query(
          `UPDATE judge_assignments
              SET assignment_status = 'WITHDRAWN',
                  status_reason = 'Automatically withdrawn due to slot reschedule conflict',
                  updated_at = NOW()
            WHERE id = ANY($1::int[])`,
          [conflictIds]
        );
        withdrawnAssignmentIds.push(...conflictIds);
      }

      const timeChanged =
        new Date(slot.start_time).getTime() !== startTime.getTime() ||
        new Date(slot.end_time).getTime() !== endTime.getTime();

      const nextStatus =
        slot.status === 'COMPLETED' ? 'COMPLETED' : timeChanged ? 'RESCHEDULED' : slot.status;

      const updatedRes = await client.query(
        `UPDATE competition_slots
            SET slot_label = $1,
                start_time = $2,
                end_time = $3,
                venue = $4,
                status = $5,
                updated_at = NOW()
          WHERE id = $6
          RETURNING *`,
        [slotLabel, startTime, endTime, venue, nextStatus, slotId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: timeChanged ? 'SLOT_RESCHEDULED' : 'SLOT_UPDATED',
        entityType: 'SLOT',
        entityId: slotId,
        details: {
          slotLabel,
          venue,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          withdrawnAssignmentIds,
        },
      });

      return {
        slot: updatedRes.rows[0],
        withdrawnConflictingAssignments: withdrawnAssignmentIds,
      };
    });

    res.json(result);
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const slotId = parsePositiveInt(req.params.id, 'slotId');
    const reason = optionalString(req.body?.reason, 500) || 'Slot cancelled by administrator';

    const outcome = await withTransaction(async (client) => {
      const slotRes = await client.query<{ id: number; status: string }>(
        'SELECT id, status FROM competition_slots WHERE id = $1 FOR UPDATE',
        [slotId]
      );
      if (slotRes.rows.length === 0) {
        throw createHttpError(404, 'Competition slot not found.');
      }
      if (slotRes.rows[0].status === 'CANCELLED') {
        throw createHttpError(409, 'Slot is already cancelled.');
      }

      const updatedSlot = await client.query(
        `UPDATE competition_slots
            SET status = 'CANCELLED',
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [slotId]
      );

      const cancelledAssignments = await client.query<{ id: number }>(
        `UPDATE judge_assignments
            SET assignment_status = 'CANCELLED_SLOT',
                status_reason = $1,
                updated_at = NOW()
          WHERE slot_id = $2
            AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
          RETURNING id`,
        [reason, slotId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'SLOT_CANCELLED',
        entityType: 'SLOT',
        entityId: slotId,
        details: {
          reason,
          cancelledAssignmentsCount: cancelledAssignments.rows.length,
        },
      });

      return {
        slot: updatedSlot.rows[0],
        cancelledAssignmentsCount: cancelledAssignments.rows.length,
      };
    });

    res.json(outcome);
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
