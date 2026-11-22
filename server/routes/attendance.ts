import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  logActivity,
  optionalString,
  parsePositiveInt,
  requireAuth,
  requireRole,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'), verifyCsrfAndOrigin);

const VALID_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

router.get('/', async (req, res, next) => {
  try {
    const slotId = req.query.slotId ? parsePositiveInt(req.query.slotId, 'slotId') : null;
    const competitionId = req.query.competitionId
      ? parsePositiveInt(req.query.competitionId, 'competitionId')
      : null;

    const conditions: string[] = ["cs.status <> 'CANCELLED'", "c.status <> 'CANCELLED'"];
    const params: unknown[] = [];

    if (slotId) {
      params.push(slotId);
      conditions.push(`cs.id = $${params.length}`);
    }
    if (competitionId) {
      params.push(competitionId);
      conditions.push(`c.id = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const recordsRes = await query(
      `SELECT
         ja.id AS assignment_id,
         ja.judge_id,
         ja.slot_id,
         ja.role,
         ja.response_status,
         ja.assignment_status,
         ja.replaces_assignment_id,
         j.name AS judge_name,
         j.email AS judge_email,
         j.phone AS judge_phone,
         j.judge_type,
         j.designation,
         j.institution,
         cs.slot_label,
         cs.start_time,
         cs.end_time,
         cs.venue,
         c.id AS competition_id,
         c.name AS competition_name,
         c.required_primary_judges,
         att.id AS attendance_id,
         att.attendance_status,
         att.marked_time,
         att.remarks AS attendance_remarks,
         admin_u.full_name AS marked_by_admin_name,
         orig_j.name AS replaced_judge_name,
         rep_ja.id AS replacement_assignment_id,
         rep_j.name AS replacement_judge_name
       FROM judge_assignments ja
       JOIN judges j ON j.id = ja.judge_id
       JOIN competition_slots cs ON cs.id = ja.slot_id
       JOIN competitions c ON c.id = cs.competition_id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       LEFT JOIN users admin_u ON admin_u.id = att.marked_by_admin_id
       LEFT JOIN judge_assignments orig_ja ON orig_ja.id = ja.replaces_assignment_id
       LEFT JOIN judges orig_j ON orig_j.id = orig_ja.judge_id
       LEFT JOIN judge_assignments rep_ja ON rep_ja.replaces_assignment_id = ja.id
         AND rep_ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP')
       LEFT JOIN judges rep_j ON rep_j.id = rep_ja.judge_id
       ${whereClause}
         AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP', 'REPLACED', 'WITHDRAWN')
       ORDER BY cs.start_time ASC, c.name ASC, ja.role ASC, j.name ASC`,
      params
    );

    const slotSummaryRes = await query(
      `SELECT
         cs.id AS slot_id,
         cs.slot_label,
         cs.start_time,
         cs.end_time,
         cs.venue,
         c.id AS competition_id,
         c.name AS competition_name,
         c.required_primary_judges,
         COUNT(ja.id) FILTER (
           WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
              OR ja.assignment_status = 'ACTIVATED_BACKUP'
         )::int AS filled_primary,
         COUNT(ja.id) FILTER (
           WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY'
         )::int AS standby_backups,
         COUNT(ja.id) FILTER (
           WHERE att.attendance_status = 'PRESENT'
             AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP', 'STANDBY')
         )::int AS present_count,
         COUNT(ja.id) FILTER (
           WHERE att.attendance_status = 'ABSENT'
         )::int AS absent_count,
         COUNT(ja.id) FILTER (
           WHERE ja.assignment_status = 'ACTIVATED_BACKUP'
         )::int AS activated_replacements_count
       FROM competition_slots cs
       JOIN competitions c ON c.id = cs.competition_id
       LEFT JOIN judge_assignments ja ON ja.slot_id = cs.id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       ${whereClause}
       GROUP BY cs.id, c.id
       ORDER BY cs.start_time ASC`,
      params
    );

    const slotSummaries = slotSummaryRes.rows.map((s) => ({
      ...s,
      vacant_positions: Math.max(0, Number(s.required_primary_judges) - Number(s.filled_primary)),
    }));

    res.json({
      records: recordsRes.rows,
      slotSummaries,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/mark', async (req, res, next) => {
  try {
    const assignmentId = parsePositiveInt(req.body?.assignmentId, 'assignmentId');
    const attendanceStatus = req.body?.attendanceStatus;
    if (!VALID_ATTENDANCE_STATUSES.includes(attendanceStatus)) {
      throw createHttpError(
        400,
        'attendanceStatus must be PRESENT, ABSENT, LATE, or EXCUSED.'
      );
    }
    const remarks = optionalString(req.body?.remarks, 500);

    const result = await withTransaction(async (client) => {
      const assignRes = await client.query<{
        id: number;
        judge_id: number;
        slot_id: number;
        role: string;
        assignment_status: string;
        slot_status: string;
        comp_status: string;
      }>(
        `SELECT ja.id, ja.judge_id, ja.slot_id, ja.role, ja.assignment_status,
                cs.status AS slot_status, c.status AS comp_status
         FROM judge_assignments ja
         JOIN competition_slots cs ON cs.id = ja.slot_id
         JOIN competitions c ON c.id = cs.competition_id
         WHERE ja.id = $1
         FOR UPDATE OF ja`,
        [assignmentId]
      );

      if (assignRes.rows.length === 0) {
        throw createHttpError(404, 'Assignment not found.');
      }

      const assign = assignRes.rows[0];
      if (assign.slot_status === 'CANCELLED' || assign.comp_status === 'CANCELLED') {
        throw createHttpError(409, 'Cannot mark attendance for a cancelled slot or competition.');
      }
      if (['DECLINED', 'CANCELLED_SLOT', 'CANCELLED_DEACTIVATED'].includes(assign.assignment_status)) {
        throw createHttpError(
          409,
          `Cannot mark attendance for an assignment with status ${assign.assignment_status}.`
        );
      }

      const attRes = await client.query(
        `INSERT INTO judge_attendance (assignment_id, attendance_status, marked_time, marked_by_admin_id, remarks)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (assignment_id) DO UPDATE
           SET attendance_status = EXCLUDED.attendance_status,
               marked_time = NOW(),
               marked_by_admin_id = EXCLUDED.marked_by_admin_id,
               remarks = EXCLUDED.remarks,
               updated_at = NOW()
         RETURNING *`,
        [assignmentId, attendanceStatus, req.auth!.userId, remarks]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'ATTENDANCE_MARKED',
        entityType: 'ATTENDANCE',
        entityId: attRes.rows[0].id,
        details: {
          assignmentId,
          judgeId: assign.judge_id,
          slotId: assign.slot_id,
          attendanceStatus,
          remarks,
        },
      });

      const needsBackup =
        attendanceStatus === 'ABSENT' &&
        (assign.role === 'PRIMARY' || assign.assignment_status === 'ACTIVATED_BACKUP') &&
        assign.assignment_status !== 'REPLACED';

      return {
        attendance: attRes.rows[0],
        needsBackup,
      };
    });

    res.json(result);
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
