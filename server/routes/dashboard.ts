import bcrypt from 'bcrypt';
import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  expireOverdueInvitations,
  logActivity,
  requireAuth,
  requireEmail,
  requireRole,
  requireString,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'), verifyCsrfAndOrigin);

router.get('/dashboard/summary', async (_req, res, next) => {
  try {
    await expireOverdueInvitations();

    const [judgeStats, invStats, compStats, assignStats, attStats, slotBreakdown, recentActivity] =
      await Promise.all([
        query(`
          SELECT
            COUNT(*)::int AS total_judges,
            COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_judges,
            COUNT(*) FILTER (WHERE judge_type = 'EXTERNAL')::int AS external_judges,
            COUNT(*) FILTER (WHERE judge_type = 'FACULTY')::int AS faculty_judges
          FROM judges
        `),
        query(`
          SELECT
            COUNT(*)::int AS invitations_sent,
            COUNT(*) FILTER (WHERE response_status = 'PENDING')::int AS pending_invitations,
            COUNT(*) FILTER (WHERE response_status = 'ACCEPTED')::int AS accepted_invitations,
            COUNT(*) FILTER (WHERE response_status = 'REJECTED')::int AS rejected_invitations,
            COUNT(*) FILTER (WHERE response_status = 'EXPIRED')::int AS expired_invitations,
            COUNT(*) FILTER (WHERE response_status = 'CANCELLED')::int AS cancelled_invitations
          FROM judge_invitations
        `),
        query(`
          SELECT
            COUNT(*)::int AS total_competitions,
            COUNT(*) FILTER (WHERE status <> 'CANCELLED')::int AS active_competitions,
            COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_competitions
          FROM competitions
        `),
        query(`
          SELECT
            COUNT(*) FILTER (
              WHERE role = 'PRIMARY' AND assignment_status IN ('ASSIGNED', 'CONFIRMED')
            )::int AS primary_assignments,
            COUNT(*) FILTER (
              WHERE role = 'BACKUP' AND assignment_status = 'STANDBY'
            )::int AS backup_assignments,
            COUNT(*) FILTER (
              WHERE assignment_status = 'ACTIVATED_BACKUP'
            )::int AS activated_backup_assignments
          FROM judge_assignments
        `),
        query(`
          SELECT
            COUNT(*) FILTER (WHERE attendance_status = 'PRESENT')::int AS present_judges,
            COUNT(*) FILTER (WHERE attendance_status = 'ABSENT')::int AS absent_judges,
            COUNT(*) FILTER (WHERE attendance_status = 'LATE')::int AS late_judges,
            COUNT(*) FILTER (WHERE attendance_status = 'EXCUSED')::int AS excused_judges
          FROM judge_attendance
        `),
        query(`
          SELECT
            cs.id AS slot_id,
            cs.slot_label,
            cs.start_time,
            cs.end_time,
            cs.venue,
            cs.status AS slot_status,
            c.id AS competition_id,
            c.name AS competition_name,
            c.required_primary_judges,
            c.status AS competition_status,
            COUNT(ja.id) FILTER (
              WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
                 OR ja.assignment_status = 'ACTIVATED_BACKUP'
            )::int AS filled_primary,
            COUNT(ja.id) FILTER (
              WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY'
            )::int AS standby_backups,
            COUNT(ja.id) FILTER (
              WHERE att.attendance_status = 'ABSENT' AND ja.assignment_status <> 'REPLACED'
            )::int AS unreplaced_absences
          FROM competition_slots cs
          JOIN competitions c ON c.id = cs.competition_id
          LEFT JOIN judge_assignments ja ON ja.slot_id = cs.id
          LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
          WHERE cs.status <> 'CANCELLED' AND c.status <> 'CANCELLED'
          GROUP BY cs.id, c.id
          ORDER BY cs.start_time ASC
        `),
        query(`
          SELECT
            al.*,
            u.full_name AS actor_name
          FROM activity_logs al
          LEFT JOIN users u ON u.id = al.actor_user_id
          ORDER BY al.created_at DESC
          LIMIT 15
        `),
      ]);

    const slotSummaries = slotBreakdown.rows.map((s) => ({
      ...s,
      vacant_positions: Math.max(0, Number(s.required_primary_judges) - Number(s.filled_primary)),
    }));

    const vacantPositions = slotSummaries.reduce((acc, s) => acc + s.vacant_positions, 0);

    res.json({
      metrics: {
        ...judgeStats.rows[0],
        ...invStats.rows[0],
        ...compStats.rows[0],
        ...assignStats.rows[0],
        ...attStats.rows[0],
        vacant_positions: vacantPositions,
      },
      slotSummaries,
      recentActivity: recentActivity.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/reports/overview', async (_req, res, next) => {
  try {
    await expireOverdueInvitations();

    const [competitionReport, judgeWorkload, replacementsReport] = await Promise.all([
      query(`
        SELECT
          c.id,
          c.name,
          c.status,
          c.required_primary_judges,
          COUNT(DISTINCT cs.id) FILTER (WHERE cs.status <> 'CANCELLED')::int AS active_slots,
          COUNT(ja.id) FILTER (
            WHERE (ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED'))
               OR ja.assignment_status = 'ACTIVATED_BACKUP'
          )::int AS filled_primary,
          COUNT(ja.id) FILTER (WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY')::int AS standby_backups,
          COUNT(ja.id) FILTER (WHERE ja.assignment_status = 'ACTIVATED_BACKUP')::int AS activated_backups,
          COUNT(ja.id) FILTER (WHERE ja.assignment_status = 'REPLACED')::int AS replaced_count,
          COUNT(ja.id) FILTER (WHERE ja.assignment_status IN ('WITHDRAWN', 'DECLINED'))::int AS declined_or_withdrawn,
          COUNT(att.id) FILTER (WHERE att.attendance_status = 'PRESENT')::int AS present_count,
          COUNT(att.id) FILTER (WHERE att.attendance_status = 'ABSENT')::int AS absent_count,
          COUNT(att.id) FILTER (WHERE att.attendance_status = 'LATE')::int AS late_count
        FROM competitions c
        LEFT JOIN competition_slots cs ON cs.competition_id = c.id
        LEFT JOIN judge_assignments ja ON ja.slot_id = cs.id
        LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
        GROUP BY c.id
        ORDER BY c.name ASC
      `),
      query(`
        SELECT
          j.id,
          j.name,
          j.email,
          j.judge_type,
          j.institution,
          j.is_active,
          COALESCE(ji.response_status, 'NOT_INVITED') AS invitation_status,
          COUNT(ja.id) FILTER (
            WHERE ja.role = 'PRIMARY' AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED')
          )::int AS active_primary_slots,
          COUNT(ja.id) FILTER (
            WHERE ja.role = 'BACKUP' AND ja.assignment_status = 'STANDBY'
          )::int AS standby_backup_slots,
          COUNT(ja.id) FILTER (
            WHERE ja.assignment_status = 'ACTIVATED_BACKUP'
          )::int AS activated_backup_slots,
          COUNT(ja.id) FILTER (
            WHERE ja.assignment_status IN ('WITHDRAWN', 'DECLINED', 'REPLACED')
          )::int AS historical_exceptions
        FROM judges j
        LEFT JOIN judge_invitations ji ON ji.judge_id = j.id
        LEFT JOIN judge_assignments ja ON ja.judge_id = j.id
        GROUP BY j.id, ji.response_status
        ORDER BY j.name ASC
      `),
      query(`
        SELECT
          rep.id AS replacement_assignment_id,
          rep.assigned_at,
          rep.status_reason,
          rep_j.name AS replacement_judge_name,
          rep_j.judge_type AS replacement_judge_type,
          orig.id AS original_assignment_id,
          orig_j.name AS original_judge_name,
          orig_j.judge_type AS original_judge_type,
          orig_att.attendance_status AS original_attendance,
          cs.slot_label,
          c.name AS competition_name
        FROM judge_assignments rep
        JOIN judges rep_j ON rep_j.id = rep.judge_id
        JOIN judge_assignments orig ON orig.id = rep.replaces_assignment_id
        JOIN judges orig_j ON orig_j.id = orig.judge_id
        JOIN competition_slots cs ON cs.id = rep.slot_id
        JOIN competitions c ON c.id = cs.competition_id
        LEFT JOIN judge_attendance orig_att ON orig_att.assignment_id = orig.id
        ORDER BY rep.updated_at DESC
      `),
    ]);

    res.json({
      competitionReport: competitionReport.rows,
      judgeWorkload: judgeWorkload.rows,
      replacementsReport: replacementsReport.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const entityType =
      typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';

    const params: unknown[] = [];
    let whereClause = '';
    if (entityType) {
      params.push(entityType);
      whereClause = `WHERE al.entity_type = $1`;
    }
    params.push(limit);

    const logs = await query(
      `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ activityLogs: logs.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/settings/summary', async (_req, res, next) => {
  try {
    const [admins, counts] = await Promise.all([
      query(
        `SELECT id, email, full_name, is_active, last_login_at, created_at
         FROM users
         WHERE role = 'ADMIN'
         ORDER BY created_at ASC`
      ),
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM user_sessions WHERE expires_at > NOW()) AS active_sessions,
          (SELECT COUNT(*)::int FROM activity_logs) AS total_audit_events,
          (SELECT COUNT(*)::int FROM schema_migrations) AS applied_migrations
      `),
    ]);

    res.json({
      admins: admins.rows,
      system: counts.rows[0],
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/settings/admins', async (req, res, next) => {
  try {
    const fullName = requireString(req.body?.fullName, 'Full name', 255);
    const email = requireEmail(req.body?.email, 'Email');
    const password = requireString(req.body?.password, 'Password', 128);
    if (password.length < 8) {
      throw createHttpError(400, 'Password must be at least 8 characters long.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, is_active)
         VALUES ($1, $2, 'ADMIN', $3, TRUE)
         RETURNING id, email, full_name, role, is_active, created_at`,
        [email, passwordHash, fullName]
      );
      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'ADMIN_USER_CREATED',
        entityType: 'USER',
        entityId: inserted.rows[0].id,
        details: { email },
      });
      return inserted.rows[0];
    });

    res.status(201).json({ admin: created });
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
