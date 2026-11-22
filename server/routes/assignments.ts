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

router.get('/', async (req, res, next) => {
  try {
    const slotId = req.query.slotId ? parsePositiveInt(req.query.slotId, 'slotId') : null;
    const competitionId = req.query.competitionId
      ? parsePositiveInt(req.query.competitionId, 'competitionId')
      : null;
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const assignmentStatus =
      typeof req.query.assignmentStatus === 'string' ? req.query.assignmentStatus.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (slotId) {
      params.push(slotId);
      conditions.push(`ja.slot_id = $${params.length}`);
    }
    if (competitionId) {
      params.push(competitionId);
      conditions.push(`c.id = $${params.length}`);
    }
    if (role === 'PRIMARY' || role === 'BACKUP') {
      params.push(role);
      conditions.push(`ja.role = $${params.length}`);
    }
    if (assignmentStatus) {
      params.push(assignmentStatus);
      conditions.push(`ja.assignment_status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
         ja.*,
         j.name AS judge_name,
         j.email AS judge_email,
         j.designation,
         j.institution,
         j.judge_type,
         j.is_active AS judge_is_active,
         cs.slot_label,
         cs.start_time,
         cs.end_time,
         cs.venue,
         cs.status AS slot_status,
         c.id AS competition_id,
         c.name AS competition_name,
         c.required_primary_judges,
         c.status AS competition_status,
         GREATEST(
           0,
           c.required_primary_judges - (
             SELECT COUNT(*)::int
             FROM judge_assignments ja_fill
             WHERE ja_fill.slot_id = cs.id
               AND (
                 (ja_fill.role = 'PRIMARY' AND ja_fill.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
                 OR ja_fill.assignment_status = 'ACTIVATED_BACKUP'
               )
           )
         )::int AS slot_vacant_positions,
         att.attendance_status,
         att.marked_time,
         orig_j.name AS replaced_judge_name,
         rep_ja.id AS replacement_assignment_id,
         rep_j.name AS replacement_judge_name
       FROM judge_assignments ja
       JOIN judges j ON j.id = ja.judge_id
       JOIN competition_slots cs ON cs.id = ja.slot_id
       JOIN competitions c ON c.id = cs.competition_id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       LEFT JOIN judge_assignments orig_ja ON orig_ja.id = ja.replaces_assignment_id
       LEFT JOIN judges orig_j ON orig_j.id = orig_ja.judge_id
       LEFT JOIN judge_assignments rep_ja ON rep_ja.replaces_assignment_id = ja.id
         AND rep_ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP')
       LEFT JOIN judges rep_j ON rep_j.id = rep_ja.judge_id
       ${whereClause}
       ORDER BY cs.start_time ASC, ja.role ASC, ja.assigned_at DESC`,
      params
    );

    res.json({ assignments: result.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Eligible accepted judges for a slot with availability & overlapping conflict warnings
router.get('/eligible/:slotId', async (req, res, next) => {
  try {
    const slotId = parsePositiveInt(req.params.slotId, 'slotId');

    const slotRes = await query<{
      id: number;
      start_time: Date;
      end_time: Date;
      status: string;
      competition_status: string;
    }>(
      `SELECT cs.id, cs.start_time, cs.end_time, cs.status, c.status AS competition_status
       FROM competition_slots cs
       JOIN competitions c ON c.id = cs.competition_id
       WHERE cs.id = $1`,
      [slotId]
    );
    if (slotRes.rows.length === 0) {
      throw createHttpError(404, 'Competition slot not found.');
    }
    const slot = slotRes.rows[0];

    const judgesRes = await query(
      `SELECT
         j.id,
         j.name,
         j.email,
         j.designation,
         j.institution,
         j.judge_type,
         j.expertise,
         COALESCE(jav.availability_status, 'UNSPECIFIED') AS availability_status,
         jav.note AS availability_note,
         EXISTS (
           SELECT 1
           FROM judge_assignments ja_same
           WHERE ja_same.judge_id = j.id
             AND ja_same.slot_id = $1
             AND ja_same.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
         ) AS already_assigned_to_slot,
         (
           SELECT COUNT(*)::int
           FROM judge_assignments ja_cnt
           WHERE ja_cnt.judge_id = j.id
             AND ja_cnt.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
         ) AS total_active_assignments,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'assignmentId', ja_conf.id,
                 'slotId', cs_conf.id,
                 'slotLabel', cs_conf.slot_label,
                 'competitionName', c_conf.name,
                 'role', ja_conf.role,
                 'assignmentStatus', ja_conf.assignment_status,
                 'startTime', cs_conf.start_time,
                 'endTime', cs_conf.end_time
               )
             )
             FROM judge_assignments ja_conf
             JOIN competition_slots cs_conf ON cs_conf.id = ja_conf.slot_id
             JOIN competitions c_conf ON c_conf.id = cs_conf.competition_id
             WHERE ja_conf.judge_id = j.id
               AND ja_conf.slot_id <> $1
               AND ja_conf.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
               AND cs_conf.status <> 'CANCELLED'
               AND cs_conf.start_time < $3
               AND cs_conf.end_time > $2
           ),
           '[]'::json
         ) AS conflicting_slots
       FROM judges j
       JOIN judge_invitations ji ON ji.judge_id = j.id AND ji.response_status = 'ACCEPTED'
       LEFT JOIN judge_availability jav ON jav.judge_id = j.id AND jav.slot_id = $1
       WHERE j.is_active = TRUE
       ORDER BY j.judge_type ASC, j.name ASC`,
      [slotId, slot.start_time, slot.end_time]
    );

    const eligible = judgesRes.rows.map((row) => ({
      ...row,
      has_conflict: Array.isArray(row.conflicting_slots) && row.conflicting_slots.length > 0,
    }));

    res.json({ slot, eligibleJudges: eligible });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Create an assignment (PRIMARY or BACKUP) with full transactional validation
router.post('/', async (req, res, next) => {
  try {
    const judgeId = parsePositiveInt(req.body?.judgeId, 'judgeId');
    const slotId = parsePositiveInt(req.body?.slotId, 'slotId');
    const role = req.body?.role;
    if (role !== 'PRIMARY' && role !== 'BACKUP') {
      throw createHttpError(400, 'role must be PRIMARY or BACKUP.');
    }

    const created = await withTransaction(async (client) => {
      // Lock judge and slot to prevent concurrent race conditions on conflict/capacity
      const judgeRes = await client.query<{
        id: number;
        name: string;
        judge_type: 'EXTERNAL' | 'FACULTY';
        is_active: boolean;
      }>('SELECT id, name, judge_type, is_active FROM judges WHERE id = $1 FOR UPDATE', [judgeId]);

      if (judgeRes.rows.length === 0) {
        throw createHttpError(404, 'Judge not found.');
      }
      const judge = judgeRes.rows[0];
      if (!judge.is_active) {
        throw createHttpError(400, 'Cannot assign a deactivated judge.');
      }
      if (role === 'BACKUP' && judge.judge_type !== 'FACULTY') {
        throw createHttpError(400, 'Only FACULTY judges can be designated as BACKUP judges.');
      }

      const invRes = await client.query<{ response_status: string }>(
        'SELECT response_status FROM judge_invitations WHERE judge_id = $1 FOR UPDATE',
        [judgeId]
      );
      if (invRes.rows.length === 0 || invRes.rows[0].response_status !== 'ACCEPTED') {
        throw createHttpError(
          400,
          'Only judges who have ACCEPTED their fest invitation can receive assignments.'
        );
      }

      const slotRes = await client.query<{
        id: number;
        slot_label: string;
        start_time: Date;
        end_time: Date;
        status: string;
        competition_id: number;
        required_primary_judges: number;
        competition_status: string;
      }>(
        `SELECT cs.*, c.required_primary_judges, c.status AS competition_status
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
      if (slot.status === 'CANCELLED' || slot.competition_status === 'CANCELLED') {
        throw createHttpError(409, 'Cannot assign judges to a cancelled competition or slot.');
      }

      const dupRes = await client.query<{ id: number; assignment_status: string }>(
        `SELECT id, assignment_status
         FROM judge_assignments
         WHERE judge_id = $1 AND slot_id = $2
           AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')`,
        [judgeId, slotId]
      );
      if (dupRes.rows.length > 0) {
        throw createHttpError(409, 'This judge already has an active or standby assignment for this slot.');
      }

      const conflictRes = await client.query<{
        slot_id: number;
        slot_label: string;
        competition_name: string;
        start_time: Date;
        end_time: Date;
        role: string;
      }>(
        `SELECT
           cs.id AS slot_id,
           cs.slot_label,
           c.name AS competition_name,
           cs.start_time,
           cs.end_time,
           ja.role
         FROM judge_assignments ja
         JOIN competition_slots cs ON cs.id = ja.slot_id
         JOIN competitions c ON c.id = cs.competition_id
         WHERE ja.judge_id = $1
           AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
           AND cs.status <> 'CANCELLED'
           AND cs.start_time < $3
           AND cs.end_time > $2`,
        [judgeId, slot.start_time, slot.end_time]
      );

      if (conflictRes.rows.length > 0) {
        throw createHttpError(
          409,
          `Scheduling conflict: ${judge.name} is already assigned to an overlapping slot (${conflictRes.rows[0].competition_name} – ${conflictRes.rows[0].slot_label}).`,
          { conflicts: conflictRes.rows }
        );
      }

      if (role === 'PRIMARY') {
        const capRes = await client.query<{ filled: string }>(
          `SELECT COUNT(*) AS filled
           FROM judge_assignments
           WHERE slot_id = $1
             AND (
               (role = 'PRIMARY' AND assignment_status IN ('ASSIGNED', 'CONFIRMED'))
               OR assignment_status = 'ACTIVATED_BACKUP'
             )`,
          [slotId]
        );
        if (Number(capRes.rows[0].filled) >= slot.required_primary_judges) {
          throw createHttpError(
            409,
            `Primary judge positions for this slot are already full (${slot.required_primary_judges}/${slot.required_primary_judges}). Assign as BACKUP or increase required judges.`
          );
        }
      }

      const initialStatus = role === 'BACKUP' ? 'STANDBY' : 'ASSIGNED';
      const inserted = await client.query(
        `INSERT INTO judge_assignments
           (judge_id, slot_id, role, response_status, assignment_status, assigned_by_admin_id)
         VALUES ($1, $2, $3, 'PENDING', $4, $5)
         RETURNING *`,
        [judgeId, slotId, role, initialStatus, req.auth!.userId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'ASSIGNMENT_CREATED',
        entityType: 'ASSIGNMENT',
        entityId: inserted.rows[0].id,
        details: { judgeId, slotId, role, assignmentStatus: initialStatus },
      });

      return inserted.rows[0];
    });

    res.status(201).json({ assignment: created });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Admin marks an assignment withdrawn (preserves record & history)
router.post('/:id/withdraw', async (req, res, next) => {
  try {
    const assignmentId = parsePositiveInt(req.params.id, 'assignmentId');
    const reason =
      optionalString(req.body?.reason, 500) || 'Assignment withdrawn by administrator';

    const updated = await withTransaction(async (client) => {
      const existing = await client.query<{
        id: number;
        judge_id: number;
        slot_id: number;
        assignment_status: string;
      }>(
        'SELECT id, judge_id, slot_id, assignment_status FROM judge_assignments WHERE id = $1 FOR UPDATE',
        [assignmentId]
      );

      if (existing.rows.length === 0) {
        throw createHttpError(404, 'Assignment not found.');
      }

      const cur = existing.rows[0];
      if (
        !['ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP'].includes(cur.assignment_status)
      ) {
        throw createHttpError(
          409,
          `Cannot withdraw assignment from status ${cur.assignment_status}.`
        );
      }

      const resUpd = await client.query(
        `UPDATE judge_assignments
            SET assignment_status = 'WITHDRAWN',
                status_reason = $1,
                updated_at = NOW()
          WHERE id = $2
          RETURNING *`,
        [reason, assignmentId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'ASSIGNMENT_WITHDRAWN_BY_ADMIN',
        entityType: 'ASSIGNMENT',
        entityId: assignmentId,
        details: { judgeId: cur.judge_id, slotId: cur.slot_id, reason },
      });

      return resUpd.rows[0];
    });

    res.json({ assignment: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

// List pre-assigned standby backups & dynamic available faculty candidates for replacing an assignment
router.get('/:id/backup-candidates', async (req, res, next) => {
  try {
    const assignmentId = parsePositiveInt(req.params.id, 'assignmentId');

    const targetRes = await query<{
      id: number;
      slot_id: number;
      judge_id: number;
      start_time: Date;
      end_time: Date;
    }>(
      `SELECT ja.id, ja.slot_id, ja.judge_id, cs.start_time, cs.end_time
       FROM judge_assignments ja
       JOIN competition_slots cs ON cs.id = ja.slot_id
       WHERE ja.id = $1`,
      [assignmentId]
    );
    if (targetRes.rows.length === 0) {
      throw createHttpError(404, 'Target assignment not found.');
    }

    const target = targetRes.rows[0];

    const standbyRes = await query(
      `SELECT
         ja.id AS backup_assignment_id,
         ja.judge_id,
         ja.response_status,
         ja.assignment_status,
         j.name,
         j.email,
         j.designation,
         j.institution,
         j.phone,
         att.attendance_status,
         COALESCE(jav.availability_status, 'UNSPECIFIED') AS availability_status
       FROM judge_assignments ja
       JOIN judges j ON j.id = ja.judge_id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       LEFT JOIN judge_availability jav ON jav.judge_id = j.id AND jav.slot_id = $1
       WHERE ja.slot_id = $1
         AND ja.role = 'BACKUP'
         AND ja.assignment_status = 'STANDBY'
         AND j.is_active = TRUE
       ORDER BY
         CASE WHEN COALESCE(att.attendance_status, 'NONE') = 'ABSENT' THEN 1 ELSE 0 END,
         CASE WHEN ja.response_status = 'ACCEPTED' THEN 0 ELSE 1 END,
         j.name ASC`,
      [target.slot_id]
    );

    const dynamicFacultyRes = await query(
      `SELECT
         j.id AS judge_id,
         j.name,
         j.email,
         j.designation,
         j.institution,
         j.phone,
         j.expertise,
         COALESCE(jav.availability_status, 'UNSPECIFIED') AS availability_status,
         (
           SELECT COUNT(*)::int
           FROM judge_assignments ja_cnt
           WHERE ja_cnt.judge_id = j.id
             AND ja_cnt.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
         ) AS active_assignments_count
       FROM judges j
       JOIN judge_invitations ji ON ji.judge_id = j.id AND ji.response_status = 'ACCEPTED'
       LEFT JOIN judge_availability jav ON jav.judge_id = j.id AND jav.slot_id = $1
       WHERE j.judge_type = 'FACULTY'
         AND j.is_active = TRUE
         AND j.id <> $4
         AND NOT EXISTS (
           SELECT 1
           FROM judge_assignments ja_same
           WHERE ja_same.judge_id = j.id
             AND ja_same.slot_id = $1
             AND ja_same.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
         )
         AND NOT EXISTS (
           SELECT 1
           FROM judge_assignments ja_conf
           JOIN competition_slots cs_conf ON cs_conf.id = ja_conf.slot_id
           WHERE ja_conf.judge_id = j.id
             AND ja_conf.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
             AND cs_conf.status <> 'CANCELLED'
             AND cs_conf.start_time < $3
             AND cs_conf.end_time > $2
         )
       ORDER BY
         CASE COALESCE(jav.availability_status, 'UNSPECIFIED')
           WHEN 'AVAILABLE' THEN 0
           WHEN 'UNSPECIFIED' THEN 1
           WHEN 'TENTATIVE' THEN 2
           ELSE 3
         END,
         active_assignments_count ASC,
         j.name ASC`,
      [target.slot_id, target.start_time, target.end_time, target.judge_id]
    );

    res.json({
      standbyBackups: standbyRes.rows,
      availableFacultyJudges: dynamicFacultyRes.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Scenarios 7 & 8: Activate pre-assigned backup OR dynamically replace with an available faculty judge
router.post('/:id/replace', async (req, res, next) => {
  try {
    const targetAssignmentId = parsePositiveInt(req.params.id, 'assignmentId');
    const backupAssignmentId = req.body?.backupAssignmentId
      ? parsePositiveInt(req.body.backupAssignmentId, 'backupAssignmentId')
      : null;
    const facultyJudgeId = req.body?.facultyJudgeId
      ? parsePositiveInt(req.body.facultyJudgeId, 'facultyJudgeId')
      : null;
    const reason =
      optionalString(req.body?.reason, 500) || 'Primary judge replaced by faculty backup';

    if ((!backupAssignmentId && !facultyJudgeId) || (backupAssignmentId && facultyJudgeId)) {
      throw createHttpError(
        400,
        'Provide exactly one of backupAssignmentId or facultyJudgeId.'
      );
    }

    const result = await withTransaction(async (client) => {
      const targetRes = await client.query<{
        id: number;
        judge_id: number;
        slot_id: number;
        role: string;
        assignment_status: string;
        start_time: Date;
        end_time: Date;
        slot_status: string;
        comp_status: string;
      }>(
        `SELECT ja.*, cs.start_time, cs.end_time, cs.status AS slot_status, c.status AS comp_status
         FROM judge_assignments ja
         JOIN competition_slots cs ON cs.id = ja.slot_id
         JOIN competitions c ON c.id = cs.competition_id
         WHERE ja.id = $1
         FOR UPDATE OF ja`,
        [targetAssignmentId]
      );

      if (targetRes.rows.length === 0) {
        throw createHttpError(404, 'Original assignment not found.');
      }

      const target = targetRes.rows[0];
      if (target.slot_status === 'CANCELLED' || target.comp_status === 'CANCELLED') {
        throw createHttpError(409, 'Cannot replace an assignment on a cancelled competition or slot.');
      }
      if (target.assignment_status === 'REPLACED') {
        throw createHttpError(409, 'This assignment has already been replaced.');
      }
      if (['CANCELLED_SLOT', 'CANCELLED_DEACTIVATED', 'COMPLETED'].includes(target.assignment_status)) {
        throw createHttpError(
          409,
          `Cannot replace an assignment in status ${target.assignment_status}.`
        );
      }

      // Check if an active replacement already points to this target assignment
      const existingRep = await client.query<{ id: number }>(
        `SELECT id
         FROM judge_assignments
         WHERE replaces_assignment_id = $1
           AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP')`,
        [targetAssignmentId]
      );
      if (existingRep.rows.length > 0) {
        throw createHttpError(409, 'An active replacement already exists for this assignment.');
      }

      // Preserve original assignment & transition it to REPLACED
      const replacedOriginal = await client.query(
        `UPDATE judge_assignments
            SET assignment_status = 'REPLACED',
                status_reason = $1,
                updated_at = NOW()
          WHERE id = $2
          RETURNING *`,
        [reason, targetAssignmentId]
      );

      let activatedReplacement;

      if (backupAssignmentId) {
        const backupRes = await client.query<{
          id: number;
          judge_id: number;
          slot_id: number;
          role: string;
          assignment_status: string;
          judge_type: string;
          judge_active: boolean;
          attendance_status: string | null;
        }>(
          `SELECT ja.*, j.judge_type, j.is_active AS judge_active, att.attendance_status
           FROM judge_assignments ja
           JOIN judges j ON j.id = ja.judge_id
           LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
           WHERE ja.id = $1
           FOR UPDATE OF ja`,
          [backupAssignmentId]
        );

        if (backupRes.rows.length === 0) {
          throw createHttpError(404, 'Backup assignment not found.');
        }

        const backup = backupRes.rows[0];
        if (backup.slot_id !== target.slot_id) {
          throw createHttpError(400, 'Backup assignment belongs to a different competition slot.');
        }
        if (backup.role !== 'BACKUP' || backup.assignment_status !== 'STANDBY') {
          throw createHttpError(409, 'Selected backup assignment is not currently on STANDBY.');
        }
        if (!backup.judge_active || backup.judge_type !== 'FACULTY') {
          throw createHttpError(409, 'Backup judge must be an active FACULTY judge.');
        }
        if (backup.attendance_status === 'ABSENT') {
          throw createHttpError(409, 'Selected backup judge is marked ABSENT and cannot be activated.');
        }

        const updBackup = await client.query(
          `UPDATE judge_assignments
              SET assignment_status = 'ACTIVATED_BACKUP',
                  response_status = 'ACCEPTED',
                  replaces_assignment_id = $1,
                  responded_at = COALESCE(responded_at, NOW()),
                  status_reason = $2,
                  updated_at = NOW()
            WHERE id = $3
            RETURNING *`,
          [targetAssignmentId, reason, backupAssignmentId]
        );
        activatedReplacement = updBackup.rows[0];
      } else if (facultyJudgeId) {
        const judgeRes = await client.query<{
          id: number;
          name: string;
          judge_type: string;
          is_active: boolean;
        }>('SELECT id, name, judge_type, is_active FROM judges WHERE id = $1 FOR UPDATE', [
          facultyJudgeId,
        ]);

        if (judgeRes.rows.length === 0) {
          throw createHttpError(404, 'Faculty judge not found.');
        }
        const faculty = judgeRes.rows[0];
        if (!faculty.is_active || faculty.judge_type !== 'FACULTY') {
          throw createHttpError(400, 'Replacement judge must be an active FACULTY judge.');
        }

        const invRes = await client.query<{ response_status: string }>(
          'SELECT response_status FROM judge_invitations WHERE judge_id = $1',
          [facultyJudgeId]
        );
        if (invRes.rows.length === 0 || invRes.rows[0].response_status !== 'ACCEPTED') {
          throw createHttpError(400, 'Replacement faculty judge must have an ACCEPTED invitation.');
        }

        const dupRes = await client.query<{ id: number }>(
          `SELECT id
           FROM judge_assignments
           WHERE judge_id = $1 AND slot_id = $2
             AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')`,
          [facultyJudgeId, target.slot_id]
        );
        if (dupRes.rows.length > 0) {
          throw createHttpError(409, 'Selected faculty judge is already assigned to this slot.');
        }

        const conflictRes = await client.query<{ slot_label: string }>(
          `SELECT cs.slot_label
           FROM judge_assignments ja
           JOIN competition_slots cs ON cs.id = ja.slot_id
           WHERE ja.judge_id = $1
             AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
             AND cs.status <> 'CANCELLED'
             AND cs.start_time < $3
             AND cs.end_time > $2`,
          [facultyJudgeId, target.start_time, target.end_time]
        );
        if (conflictRes.rows.length > 0) {
          throw createHttpError(
            409,
            `Faculty judge ${faculty.name} has an overlapping assignment (${conflictRes.rows[0].slot_label}).`
          );
        }

        const insBackup = await client.query(
          `INSERT INTO judge_assignments
             (judge_id, slot_id, role, response_status, assignment_status, replaces_assignment_id, assigned_by_admin_id, responded_at, status_reason)
           VALUES ($1, $2, 'BACKUP', 'ACCEPTED', 'ACTIVATED_BACKUP', $3, $4, NOW(), $5)
           RETURNING *`,
          [facultyJudgeId, target.slot_id, targetAssignmentId, req.auth!.userId, reason]
        );
        activatedReplacement = insBackup.rows[0];
      }

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'BACKUP_ACTIVATED_REPLACEMENT',
        entityType: 'ASSIGNMENT',
        entityId: activatedReplacement.id,
        details: {
          replacesAssignmentId: targetAssignmentId,
          slotId: target.slot_id,
          replacementJudgeId: activatedReplacement.judge_id,
          originalJudgeId: target.judge_id,
          mode: backupAssignmentId ? 'PREASSIGNED_BACKUP' : 'DYNAMIC_FACULTY',
          reason,
        },
      });

      return {
        replacedOriginal: replacedOriginal.rows[0],
        activatedReplacement,
      };
    });

    res.json(result);
  } catch (err) {
    next(mapPgError(err));
  }
});

// Scenario 9: Original judge arrives after their replacement has already been activated
router.post('/:id/late-arrival', async (req, res, next) => {
  try {
    const originalAssignmentId = parsePositiveInt(req.params.id, 'assignmentId');
    const resolution = req.body?.resolution;
    if (resolution !== 'KEEP_REPLACEMENT' && resolution !== 'RESTORE_ORIGINAL') {
      throw createHttpError(400, 'resolution must be KEEP_REPLACEMENT or RESTORE_ORIGINAL.');
    }
    const note = optionalString(req.body?.note, 500);

    const outcome = await withTransaction(async (client) => {
      const origRes = await client.query<{
        id: number;
        judge_id: number;
        slot_id: number;
        assignment_status: string;
      }>(
        'SELECT id, judge_id, slot_id, assignment_status FROM judge_assignments WHERE id = $1 FOR UPDATE',
        [originalAssignmentId]
      );
      if (origRes.rows.length === 0) {
        throw createHttpError(404, 'Original assignment not found.');
      }

      const orig = origRes.rows[0];
      if (orig.assignment_status !== 'REPLACED') {
        throw createHttpError(409, 'Late-arrival resolution applies only to REPLACED assignments.');
      }

      const repRes = await client.query<{ id: number; judge_id: number }>(
        `SELECT id, judge_id
         FROM judge_assignments
         WHERE replaces_assignment_id = $1
           AND assignment_status IN ('ACTIVATED_BACKUP', 'CONFIRMED', 'ASSIGNED')
         FOR UPDATE`,
        [originalAssignmentId]
      );
      if (repRes.rows.length === 0) {
        throw createHttpError(409, 'No active replacement assignment found for this original assignment.');
      }
      const rep = repRes.rows[0];

      const remark =
        note ||
        (resolution === 'KEEP_REPLACEMENT'
          ? 'Original judge arrived late after backup activation; replacement retained.'
          : 'Original judge arrived late and was restored to active judging; backup returned to standby.');

      await client.query(
        `INSERT INTO judge_attendance (assignment_id, attendance_status, marked_time, marked_by_admin_id, remarks)
         VALUES ($1, 'LATE', NOW(), $2, $3)
         ON CONFLICT (assignment_id) DO UPDATE
           SET attendance_status = 'LATE',
               marked_time = NOW(),
               marked_by_admin_id = EXCLUDED.marked_by_admin_id,
               remarks = EXCLUDED.remarks,
               updated_at = NOW()`,
        [originalAssignmentId, req.auth!.userId, remark]
      );

      if (resolution === 'RESTORE_ORIGINAL') {
        await client.query(
          `UPDATE judge_assignments
              SET assignment_status = 'STANDBY',
                  replaces_assignment_id = NULL,
                  status_reason = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [remark, rep.id]
        );
        await client.query(
          `UPDATE judge_assignments
              SET assignment_status = 'CONFIRMED',
                  status_reason = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [remark, originalAssignmentId]
        );
      }

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'LATE_ARRIVAL_AFTER_REPLACEMENT',
        entityType: 'ASSIGNMENT',
        entityId: originalAssignmentId,
        details: {
          resolution,
          replacementAssignmentId: rep.id,
          originalJudgeId: orig.judge_id,
          replacementJudgeId: rep.judge_id,
          remark,
        },
      });

      return {
        originalAssignmentId,
        replacementAssignmentId: rep.id,
        resolution,
        remark,
      };
    });

    res.json(outcome);
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
