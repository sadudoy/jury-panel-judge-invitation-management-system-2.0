import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  expireOverdueInvitations,
  logActivity,
  optionalString,
  parsePositiveInt,
  requireAuth,
  requireRole,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

// All routes strictly scoped to authenticated JUDGE and their own req.auth.judgeId
router.use(requireAuth, requireRole('JUDGE'), verifyCsrfAndOrigin);

router.get('/dashboard', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    await expireOverdueInvitations();

    const [profileRes, invRes, assignStatsRes, upcomingRes] = await Promise.all([
      query(
        `SELECT id, name, email, phone, designation, institution, judge_type, expertise, is_active
         FROM judges
         WHERE id = $1`,
        [judgeId]
      ),
      query('SELECT * FROM judge_invitations WHERE judge_id = $1', [judgeId]),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE assignment_status IN ('ASSIGNED', 'STANDBY') AND response_status = 'PENDING')::int AS pending_confirmation,
           COUNT(*) FILTER (WHERE assignment_status IN ('CONFIRMED', 'ACTIVATED_BACKUP'))::int AS confirmed_assignments,
           COUNT(*) FILTER (WHERE role = 'BACKUP' AND assignment_status = 'STANDBY')::int AS standby_assignments,
           COUNT(*) FILTER (WHERE assignment_status IN ('DECLINED', 'WITHDRAWN', 'REPLACED', 'CANCELLED_SLOT'))::int AS historical_assignments
         FROM judge_assignments
         WHERE judge_id = $1`,
        [judgeId]
      ),
      query(
        `SELECT
           ja.id,
           ja.role,
           ja.response_status,
           ja.assignment_status,
           cs.slot_label,
           cs.start_time,
           cs.end_time,
           cs.venue,
           c.name AS competition_name
         FROM judge_assignments ja
         JOIN competition_slots cs ON cs.id = ja.slot_id
         JOIN competitions c ON c.id = cs.competition_id
         WHERE ja.judge_id = $1
           AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
           AND cs.status <> 'CANCELLED'
         ORDER BY cs.start_time ASC`,
        [judgeId]
      ),
    ]);

    res.json({
      profile: profileRes.rows[0],
      invitation: invRes.rows[0] || null,
      stats: assignStatsRes.rows[0],
      upcomingAssignments: upcomingRes.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    const result = await query(
      `SELECT id, name, email, phone, designation, institution, judge_type, expertise, is_active, created_at
       FROM judges
       WHERE id = $1`,
      [judgeId]
    );
    if (result.rows.length === 0) {
      throw createHttpError(404, 'Judge profile not found.');
    }
    res.json({ profile: result.rows[0] });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    const phone = optionalString(req.body?.phone, 50);
    const expertise = optionalString(req.body?.expertise, 1000);
    const designation = optionalString(req.body?.designation, 255);
    const institution = optionalString(req.body?.institution, 255);

    const updated = await withTransaction(async (client) => {
      const cur = await client.query<{ designation: string; institution: string }>(
        'SELECT designation, institution FROM judges WHERE id = $1 FOR UPDATE',
        [judgeId]
      );
      if (cur.rows.length === 0) {
        throw createHttpError(404, 'Judge profile not found.');
      }

      const resUpd = await client.query(
        `UPDATE judges
            SET phone = $1,
                expertise = $2,
                designation = COALESCE($3, designation),
                institution = COALESCE($4, institution),
                updated_at = NOW()
          WHERE id = $5
          RETURNING id, name, email, phone, designation, institution, judge_type, expertise, is_active`,
        [phone, expertise, designation, institution, judgeId]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'JUDGE',
        action: 'JUDGE_PROFILE_UPDATED',
        entityType: 'JUDGE',
        entityId: judgeId,
      });

      return resUpd.rows[0];
    });

    res.json({ profile: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/invitation', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    await expireOverdueInvitations();

    const invRes = await query(
      `SELECT
         ji.*,
         u.full_name AS sent_by_admin_name
       FROM judge_invitations ji
       LEFT JOIN users u ON u.id = ji.sent_by_admin_id
       WHERE ji.judge_id = $1`,
      [judgeId]
    );

    res.json({ invitation: invRes.rows[0] || null });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/invitation/respond', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    const decision = req.body?.decision;
    if (decision !== 'ACCEPTED' && decision !== 'REJECTED') {
      throw createHttpError(400, 'decision must be ACCEPTED or REJECTED.');
    }
    const note = optionalString(req.body?.note, 1000);

    const updated = await withTransaction(async (client) => {
      await expireOverdueInvitations(client);

      const invRes = await client.query<{
        id: number;
        response_status: string;
        expiration_date: Date;
      }>(
        'SELECT id, response_status, expiration_date FROM judge_invitations WHERE judge_id = $1 FOR UPDATE',
        [judgeId]
      );

      if (invRes.rows.length === 0) {
        throw createHttpError(404, 'No invitation found for your account.');
      }

      const inv = invRes.rows[0];
      if (inv.response_status === 'EXPIRED') {
        throw createHttpError(409, 'This invitation has expired because the response deadline passed.');
      }
      if (inv.response_status === 'CANCELLED') {
        throw createHttpError(409, 'This invitation was cancelled by the administrator.');
      }
      if (inv.response_status !== 'PENDING') {
        throw createHttpError(
          409,
          `You have already responded to this invitation (${inv.response_status}).`
        );
      }

      const resUpd = await client.query(
        `UPDATE judge_invitations
            SET response_status = $1,
                response_date = NOW(),
                response_note = $2,
                updated_at = NOW()
          WHERE id = $3
          RETURNING *`,
        [decision, note, inv.id]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'JUDGE',
        action: decision === 'ACCEPTED' ? 'INVITATION_ACCEPTED' : 'INVITATION_REJECTED',
        entityType: 'INVITATION',
        entityId: inv.id,
        details: { judgeId, note },
      });

      return resUpd.rows[0];
    });

    res.json({ invitation: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/assignments', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;

    const result = await query(
      `SELECT
         ja.*,
         cs.slot_label,
         cs.start_time,
         cs.end_time,
         cs.venue,
         cs.status AS slot_status,
         c.id AS competition_id,
         c.name AS competition_name,
         c.description AS competition_description,
         c.status AS competition_status,
         att.attendance_status,
         att.marked_time
       FROM judge_assignments ja
       JOIN competition_slots cs ON cs.id = ja.slot_id
       JOIN competitions c ON c.id = cs.competition_id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       WHERE ja.judge_id = $1
       ORDER BY cs.start_time ASC, ja.created_at DESC`,
      [judgeId]
    );

    res.json({ assignments: result.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Scenarios 4 & 5: Judge accepts, declines, or withdraws from an individual assignment
router.post('/assignments/:id/respond', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    const assignmentId = parsePositiveInt(req.params.id, 'assignmentId');
    const decision = req.body?.decision;
    if (decision !== 'ACCEPT' && decision !== 'DECLINE' && decision !== 'WITHDRAW') {
      throw createHttpError(400, 'decision must be ACCEPT, DECLINE, or WITHDRAW.');
    }
    const note = optionalString(req.body?.note, 1000);

    const updated = await withTransaction(async (client) => {
      const assignRes = await client.query<{
        id: number;
        judge_id: number;
        slot_id: number;
        role: string;
        response_status: string;
        assignment_status: string;
        slot_status: string;
        comp_status: string;
      }>(
        `SELECT ja.*, cs.status AS slot_status, c.status AS comp_status
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
      if (assign.judge_id !== judgeId) {
        throw createHttpError(403, 'You can only respond to your own assignments.');
      }
      if (assign.slot_status === 'CANCELLED' || assign.comp_status === 'CANCELLED') {
        throw createHttpError(409, 'This competition or slot has been cancelled.');
      }

      if (decision === 'ACCEPT') {
        if (assign.response_status !== 'PENDING' || !['ASSIGNED', 'STANDBY'].includes(assign.assignment_status)) {
          throw createHttpError(409, 'Only pending assignments can be accepted.');
        }
        const nextStatus = assign.role === 'BACKUP' ? 'STANDBY' : 'CONFIRMED';
        const resUpd = await client.query(
          `UPDATE judge_assignments
              SET response_status = 'ACCEPTED',
                  assignment_status = $1,
                  responded_at = NOW(),
                  response_note = $2,
                  updated_at = NOW()
            WHERE id = $3
            RETURNING *`,
          [nextStatus, note, assignmentId]
        );
        await logActivity(client, {
          actorUserId: req.auth!.userId,
          actorRole: 'JUDGE',
          action: 'ASSIGNMENT_ACCEPTED',
          entityType: 'ASSIGNMENT',
          entityId: assignmentId,
          details: { judgeId, slotId: assign.slot_id, role: assign.role },
        });
        return resUpd.rows[0];
      }

      if (decision === 'DECLINE') {
        if (assign.response_status !== 'PENDING' || !['ASSIGNED', 'STANDBY'].includes(assign.assignment_status)) {
          throw createHttpError(409, 'Only pending assignments can be declined. Use WITHDRAW for confirmed assignments.');
        }
        const resUpd = await client.query(
          `UPDATE judge_assignments
              SET response_status = 'DECLINED',
                  assignment_status = 'DECLINED',
                  responded_at = NOW(),
                  response_note = $1,
                  status_reason = COALESCE($1, 'Declined by judge'),
                  updated_at = NOW()
            WHERE id = $2
            RETURNING *`,
          [note, assignmentId]
        );
        await logActivity(client, {
          actorUserId: req.auth!.userId,
          actorRole: 'JUDGE',
          action: 'ASSIGNMENT_DECLINED',
          entityType: 'ASSIGNMENT',
          entityId: assignmentId,
          details: { judgeId, slotId: assign.slot_id, note },
        });
        return resUpd.rows[0];
      }

      // WITHDRAW
      if (!['ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP'].includes(assign.assignment_status)) {
        throw createHttpError(409, `Cannot withdraw from assignment status ${assign.assignment_status}.`);
      }

      const resUpd = await client.query(
        `UPDATE judge_assignments
            SET assignment_status = 'WITHDRAWN',
                status_reason = COALESCE($1, 'Withdrawn by judge'),
                updated_at = NOW()
          WHERE id = $2
          RETURNING *`,
        [note, assignmentId]
      );
      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'JUDGE',
        action: 'ASSIGNMENT_WITHDRAWN_BY_JUDGE',
        entityType: 'ASSIGNMENT',
        entityId: assignmentId,
        details: { judgeId, slotId: assign.slot_id, note },
      });
      return resUpd.rows[0];
    });

    res.json({ assignment: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/schedule', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;

    const [myScheduleRes, availableSlotsRes] = await Promise.all([
      query(
        `SELECT
           ja.id AS assignment_id,
           ja.role,
           ja.response_status,
           ja.assignment_status,
           cs.id AS slot_id,
           cs.slot_label,
           cs.start_time,
           cs.end_time,
           cs.venue,
           cs.status AS slot_status,
           c.id AS competition_id,
           c.name AS competition_name,
           c.status AS competition_status
         FROM judge_assignments ja
         JOIN competition_slots cs ON cs.id = ja.slot_id
         JOIN competitions c ON c.id = cs.competition_id
         WHERE ja.judge_id = $1
           AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
           AND cs.status <> 'CANCELLED'
           AND c.status <> 'CANCELLED'
         ORDER BY cs.start_time ASC`,
        [judgeId]
      ),
      query(
        `SELECT
           cs.id AS slot_id,
           cs.slot_label,
           cs.start_time,
           cs.end_time,
           cs.venue,
           cs.status AS slot_status,
           c.id AS competition_id,
           c.name AS competition_name,
           COALESCE(jav.availability_status, 'UNSPECIFIED') AS availability_status,
           jav.note AS availability_note
         FROM competition_slots cs
         JOIN competitions c ON c.id = cs.competition_id
         LEFT JOIN judge_availability jav ON jav.slot_id = cs.id AND jav.judge_id = $1
         WHERE cs.status <> 'CANCELLED' AND c.status <> 'CANCELLED'
         ORDER BY cs.start_time ASC`,
        [judgeId]
      ),
    ]);

    res.json({
      mySchedule: myScheduleRes.rows,
      slotsWithAvailability: availableSlotsRes.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/availability', async (req, res, next) => {
  try {
    const judgeId = req.auth!.judgeId!;
    const slotId = parsePositiveInt(req.body?.slotId, 'slotId');
    const availabilityStatus = req.body?.availabilityStatus;
    if (!['AVAILABLE', 'UNAVAILABLE', 'TENTATIVE'].includes(availabilityStatus)) {
      throw createHttpError(400, 'availabilityStatus must be AVAILABLE, UNAVAILABLE, or TENTATIVE.');
    }
    const note = optionalString(req.body?.note, 500);

    const slotCheck = await query('SELECT id FROM competition_slots WHERE id = $1', [slotId]);
    if (slotCheck.rows.length === 0) {
      throw createHttpError(404, 'Competition slot not found.');
    }

    const resAvail = await query(
      `INSERT INTO judge_availability (judge_id, slot_id, availability_status, note, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (judge_id, slot_id) DO UPDATE
         SET availability_status = EXCLUDED.availability_status,
             note = EXCLUDED.note,
             updated_at = NOW()
       RETURNING *`,
      [judgeId, slotId, availabilityStatus, note]
    );

    res.json({ availability: resAvail.rows[0] });
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
