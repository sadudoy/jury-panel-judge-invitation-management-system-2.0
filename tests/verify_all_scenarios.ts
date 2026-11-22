import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.ts';
import { getPool } from '../server/db.ts';

function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  return setCookieHeader.split(';')[0];
}

async function main(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  async function req(
    path: string,
    opts: {
      method?: string;
      cookie?: string;
      csrf?: string;
      origin?: string;
      body?: unknown;
    } = {}
  ) {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
    if (opts.origin) headers['Origin'] = opts.origin;

    const res = await fetch(`${base}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, headers: res.headers, json };
  }

  const pool = getPool();

  try {
    // Clean database state before running comprehensive integration suite
    await pool.query(
      'TRUNCATE judge_attendance, judge_assignments, judge_availability, judge_invitations, competition_slots, competitions, judges, user_sessions, activity_logs, users RESTART IDENTITY CASCADE'
    );

    // -------------------------------------------------------------------------
    // Bootstrap Admin & Security Checks (Auth, CSRF, Origin, Role Isolation)
    // -------------------------------------------------------------------------
    const setup = await req('/api/auth/setup-admin', {
      method: 'POST',
      body: {
        fullName: 'Fest Chief Admin',
        email: 'admin@baust.edu.bd',
        password: 'AdminPassword123!',
      },
    });
    assert.equal(setup.status, 201);
    const adminCookie = extractCookie(setup.headers.get('set-cookie'));
    const adminCsrf = setup.json.csrfToken;

    // Cross-origin mutation rejected
    const badOrigin = await req('/api/judges', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      origin: 'https://evil.example.com',
      body: {},
    });
    assert.equal(badOrigin.status, 403);

    // Missing CSRF rejected
    const badCsrf = await req('/api/judges', {
      method: 'POST',
      cookie: adminCookie,
      body: {},
    });
    assert.equal(badCsrf.status, 403);

    // Unauthenticated rejected
    const unauth = await req('/api/dashboard/summary');
    assert.equal(unauth.status, 401);

    // Create Judges with Portal Accounts
    const createJudge = async (payload: Record<string, unknown>) => {
      const r = await req('/api/judges', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { ...payload, createAccount: true, password: 'JudgePassword123!' },
      });
      assert.equal(r.status, 201);
      return r.json.judge;
    };

    const loginJudge = async (email: string) => {
      const r = await req('/api/auth/login', {
        method: 'POST',
        body: { email, password: 'JudgePassword123!', expectedRole: 'JUDGE' },
      });
      assert.equal(r.status, 200);
      return {
        cookie: extractCookie(r.headers.get('set-cookie')),
        csrf: r.json.csrfToken as string,
      };
    };

    const jAcceptedUnassigned = await createJudge({
      name: 'Prof. Unassigned Accepted',
      email: 'j1@du.ac.bd',
      designation: 'Professor',
      institution: 'Dhaka University',
      judgeType: 'EXTERNAL',
    });
    const jRejected = await createJudge({
      name: 'Dr. Decliner',
      email: 'j2@buet.ac.bd',
      designation: 'Associate Professor',
      institution: 'BUET',
      judgeType: 'EXTERNAL',
    });
    const jExpired = await createJudge({
      name: 'Eng. Late Responder',
      email: 'j3@tech.com',
      designation: 'Principal Engineer',
      institution: 'Tech Corp',
      judgeType: 'EXTERNAL',
    });
    const jDeclineAssign = await createJudge({
      name: 'Dr. Assignment Decliner',
      email: 'j4@cuet.ac.bd',
      designation: 'Assistant Professor',
      institution: 'CUET',
      judgeType: 'EXTERNAL',
    });
    const jWithdraw = await createJudge({
      name: 'Dr. Withdrawer',
      email: 'j5@ruet.ac.bd',
      designation: 'Professor',
      institution: 'RUET',
      judgeType: 'EXTERNAL',
    });
    const jAbsentExt = await createJudge({
      name: 'Mr. Absent External',
      email: 'j6@industry.com',
      designation: 'CTO',
      institution: 'Dhaka Systems',
      judgeType: 'EXTERNAL',
    });
    const jFacBackup1 = await createJudge({
      name: 'Dr. Faculty Backup 1',
      email: 'f1@baust.edu.bd',
      designation: 'Associate Professor',
      institution: 'BAUST',
      judgeType: 'FACULTY',
    });
    const jFacBackup2 = await createJudge({
      name: 'Lec. Faculty Backup 2',
      email: 'f2@baust.edu.bd',
      designation: 'Lecturer',
      institution: 'BAUST',
      judgeType: 'FACULTY',
    });
    const jDeact = await createJudge({
      name: 'Lec. Deactivated',
      email: 'f3@baust.edu.bd',
      designation: 'Lecturer',
      institution: 'BAUST',
      judgeType: 'FACULTY',
    });

    // Create Competitions & Slots
    const comp1 = (
      await req('/api/competitions', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { name: 'Robotics Arena', requiredPrimaryJudges: 2, status: 'OPEN' },
      })
    ).json.competition;

    const comp2 = (
      await req('/api/competitions', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { name: 'Software Hackathon', requiredPrimaryJudges: 1, status: 'OPEN' },
      })
    ).json.competition;

    const compCancel = (
      await req('/api/competitions', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { name: 'Cancelled Contest', requiredPrimaryJudges: 1, status: 'OPEN' },
      })
    ).json.competition;

    const slot1 = (
      await req('/api/slots', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: {
          competitionId: comp1.id,
          slotLabel: 'Final Round',
          startTime: '2026-12-15T09:00:00Z',
          endTime: '2026-12-15T11:00:00Z',
          venue: 'Auditorium',
        },
      })
    ).json.slot;

    // Overlaps Slot 1 (10:00-12:00 vs 09:00-11:00)
    const slot2Overlap = (
      await req('/api/slots', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: {
          competitionId: comp2.id,
          slotLabel: 'Morning Demo',
          startTime: '2026-12-15T10:00:00Z',
          endTime: '2026-12-15T12:00:00Z',
          venue: 'CSE Lab 1',
        },
      })
    ).json.slot;

    // Non-overlapping afternoon slot
    const slot3Later = (
      await req('/api/slots', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: {
          competitionId: compCancel.id,
          slotLabel: 'Afternoon Heat',
          startTime: '2026-12-15T14:00:00Z',
          endTime: '2026-12-15T16:00:00Z',
          venue: 'Seminar Hall',
        },
      })
    ).json.slot;

    // Send invitations to all except jExpired (handled separately for deadline test)
    const futureDeadline = new Date(Date.now() + 7 * 86400_000).toISOString();
    const invBulk = await req('/api/invitations/send', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        judgeIds: [
          jAcceptedUnassigned.id,
          jRejected.id,
          jDeclineAssign.id,
          jWithdraw.id,
          jAbsentExt.id,
          jFacBackup1.id,
          jFacBackup2.id,
          jDeact.id,
        ],
        expirationDate: futureDeadline,
      },
    });
    assert.equal(invBulk.status, 201);
    assert.equal(invBulk.json.sent.length, 8);

    // -------------------------------------------------------------------------
    // SCENARIO 1: Judge accepts invitation but is never assigned
    // -------------------------------------------------------------------------
    const s1Auth = await loginJudge(jAcceptedUnassigned.email);
    const s1Resp = await req('/api/judge/invitation/respond', {
      method: 'POST',
      cookie: s1Auth.cookie,
      csrf: s1Auth.csrf,
      body: { decision: 'ACCEPTED', note: 'Glad to join' },
    });
    assert.equal(s1Resp.status, 200);
    assert.equal(s1Resp.json.invitation.response_status, 'ACCEPTED');
    const s1Assigns = await req('/api/judge/assignments', { cookie: s1Auth.cookie });
    assert.equal(s1Assigns.json.assignments.length, 0);

    // -------------------------------------------------------------------------
    // SCENARIO 2: Judge rejects invitation (cannot be assigned)
    // -------------------------------------------------------------------------
    const s2Auth = await loginJudge(jRejected.email);
    const s2Resp = await req('/api/judge/invitation/respond', {
      method: 'POST',
      cookie: s2Auth.cookie,
      csrf: s2Auth.csrf,
      body: { decision: 'REJECTED', note: 'Out of station' },
    });
    assert.equal(s2Resp.status, 200);
    assert.equal(s2Resp.json.invitation.response_status, 'REJECTED');
    const s2AssignTry = await req('/api/assignments', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { judgeId: jRejected.id, slotId: slot1.id, role: 'PRIMARY' },
    });
    assert.equal(s2AssignTry.status, 400);

    // -------------------------------------------------------------------------
    // SCENARIO 3: Judge doesn't respond before the deadline -> auto-expires
    // -------------------------------------------------------------------------
    const nearFuture = new Date(Date.now() + 2000).toISOString();
    const invExpSend = await req('/api/invitations/send', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { judgeIds: [jExpired.id], expirationDate: nearFuture },
    });
    assert.equal(invExpSend.status, 201);
    const expInvId = invExpSend.json.sent[0].invitationId;
    // Force sent_date & expiration_date into the past to simulate an invitation sent 2 days ago whose deadline elapsed
    await pool.query(
      "UPDATE judge_invitations SET sent_date = NOW() - INTERVAL '2 days', expiration_date = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [expInvId]
    );
    const s3Auth = await loginJudge(jExpired.email);
    const s3LateTry = await req('/api/judge/invitation/respond', {
      method: 'POST',
      cookie: s3Auth.cookie,
      csrf: s3Auth.csrf,
      body: { decision: 'ACCEPTED' },
    });
    assert.equal(s3LateTry.status, 409);
    const s3Check = await req('/api/judge/invitation', { cookie: s3Auth.cookie });
    assert.equal(s3Check.json.invitation.response_status, 'EXPIRED');

    // Accept remaining judges
    const s4Auth = await loginJudge(jDeclineAssign.email);
    const s5Auth = await loginJudge(jWithdraw.email);
    const s6Auth = await loginJudge(jAbsentExt.email);
    const f1Auth = await loginJudge(jFacBackup1.email);
    const f2Auth = await loginJudge(jFacBackup2.email);
    const deactAuth = await loginJudge(jDeact.email);

    for (const auth of [s4Auth, s5Auth, s6Auth, f1Auth, f2Auth, deactAuth]) {
      const r = await req('/api/judge/invitation/respond', {
        method: 'POST',
        cookie: auth.cookie,
        csrf: auth.csrf,
        body: { decision: 'ACCEPTED' },
      });
      assert.equal(r.status, 200);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 4: Judge accepts invitation but declines an assignment
    // -------------------------------------------------------------------------
    const a4 = (
      await req('/api/assignments', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { judgeId: jDeclineAssign.id, slotId: slot1.id, role: 'PRIMARY' },
      })
    ).json.assignment;

    // Verify Judge A cannot respond to Judge B's assignment (privacy/isolation)
    const crossJudgeTry = await req(`/api/judge/assignments/${a4.id}/respond`, {
      method: 'POST',
      cookie: s5Auth.cookie,
      csrf: s5Auth.csrf,
      body: { decision: 'DECLINE' },
    });
    assert.equal(crossJudgeTry.status, 403);

    const decRes = await req(`/api/judge/assignments/${a4.id}/respond`, {
      method: 'POST',
      cookie: s4Auth.cookie,
      csrf: s4Auth.csrf,
      body: { decision: 'DECLINE', note: 'Topic mismatch' },
    });
    assert.equal(decRes.status, 200);
    assert.equal(decRes.json.assignment.assignment_status, 'DECLINED');

    // -------------------------------------------------------------------------
    // SCENARIO 5: Judge accepts assignment then later withdraws
    // -------------------------------------------------------------------------
    const a5 = (
      await req('/api/assignments', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { judgeId: jWithdraw.id, slotId: slot1.id, role: 'PRIMARY' },
      })
    ).json.assignment;
    const acc5 = await req(`/api/judge/assignments/${a5.id}/respond`, {
      method: 'POST',
      cookie: s5Auth.cookie,
      csrf: s5Auth.csrf,
      body: { decision: 'ACCEPT' },
    });
    assert.equal(acc5.json.assignment.assignment_status, 'CONFIRMED');
    const wd5 = await req(`/api/judge/assignments/${a5.id}/respond`, {
      method: 'POST',
      cookie: s5Auth.cookie,
      csrf: s5Auth.csrf,
      body: { decision: 'WITHDRAW', note: 'Medical emergency' },
    });
    assert.equal(wd5.status, 200);
    assert.equal(wd5.json.assignment.assignment_status, 'WITHDRAWN');

    // -------------------------------------------------------------------------
    // SCENARIO 6 & 7: Judge accepts assignment, doesn't attend -> Backup activated
    // -------------------------------------------------------------------------
    const a6 = (
      await req('/api/assignments', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { judgeId: jAbsentExt.id, slotId: slot1.id, role: 'PRIMARY' },
      })
    ).json.assignment;
    await req(`/api/judge/assignments/${a6.id}/respond`, {
      method: 'POST',
      cookie: s6Auth.cookie,
      csrf: s6Auth.csrf,
      body: { decision: 'ACCEPT' },
    });

    // Pre-assign Faculty Backup 1 on Slot 1
    const aBackup1 = (
      await req('/api/assignments', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { judgeId: jFacBackup1.id, slotId: slot1.id, role: 'BACKUP' },
      })
    ).json.assignment;
    assert.equal(aBackup1.assignment_status, 'STANDBY');

    // Mark jAbsentExt ABSENT
    const markAbs = await req('/api/attendance/mark', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { assignmentId: a6.id, attendanceStatus: 'ABSENT', remarks: 'No show at 9:15 AM' },
    });
    assert.equal(markAbs.status, 200);
    assert.equal(markAbs.json.needsBackup, true);

    // -------------------------------------------------------------------------
    // SCENARIO 8: Backup judge is ALSO unavailable -> dynamically select Faculty Backup 2
    // -------------------------------------------------------------------------
    await req('/api/attendance/mark', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { assignmentId: aBackup1.id, attendanceStatus: 'ABSENT', remarks: 'Backup unavailable' },
    });

    // Attempting to activate ABSENT standby backup must fail cleanly
    const badActivate = await req(`/api/assignments/${a6.id}/replace`, {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { backupAssignmentId: aBackup1.id },
    });
    assert.equal(badActivate.status, 409);

    // Query backup-candidates & dynamically activate jFacBackup2
    const cands = await req(`/api/assignments/${a6.id}/backup-candidates`, { cookie: adminCookie });
    assert.ok(
      cands.json.availableFacultyJudges.some((f: any) => f.judge_id === jFacBackup2.id),
      'Faculty Backup 2 must be listed as dynamic candidate'
    );
    const dynRep = await req(`/api/assignments/${a6.id}/replace`, {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { facultyJudgeId: jFacBackup2.id, reason: 'Primary & standby absent; dynamic faculty activated' },
    });
    assert.equal(dynRep.status, 200);
    assert.equal(dynRep.json.replacedOriginal.assignment_status, 'REPLACED');
    assert.equal(dynRep.json.activatedReplacement.assignment_status, 'ACTIVATED_BACKUP');
    assert.equal(dynRep.json.activatedReplacement.replaces_assignment_id, a6.id);

    // -------------------------------------------------------------------------
    // SCENARIO 9: Original judge arrives after their replacement
    // -------------------------------------------------------------------------
    const lateKeep = await req(`/api/assignments/${a6.id}/late-arrival`, {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { resolution: 'KEEP_REPLACEMENT', note: 'Arrived 45 mins late; replacement retained' },
    });
    assert.equal(lateKeep.status, 200);

    // Verify historical records preserved (declined + withdrawn + replaced + activated backup all exist)
    const slot1Detail = await req(`/api/slots/${slot1.id}`, { cookie: adminCookie });
    const statuses = slot1Detail.json.assignments.map((a: any) => a.assignment_status);
    assert.ok(statuses.includes('DECLINED'));
    assert.ok(statuses.includes('WITHDRAWN'));
    assert.ok(statuses.includes('REPLACED'));
    assert.ok(statuses.includes('ACTIVATED_BACKUP'));

    // -------------------------------------------------------------------------
    // SCENARIO 10: Judge assigned to two overlapping competitions (blocked)
    // -------------------------------------------------------------------------
    const overlapTry = await req('/api/assignments', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { judgeId: jFacBackup2.id, slotId: slot2Overlap.id, role: 'PRIMARY' },
    });
    assert.equal(overlapTry.status, 409);

    const overlapBackupTry = await req('/api/assignments', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { judgeId: jFacBackup1.id, slotId: slot2Overlap.id, role: 'BACKUP' },
    });
    assert.equal(overlapBackupTry.status, 409);

    // -------------------------------------------------------------------------
    // SCENARIO 11: Competition time changes after judges have been assigned
    // -------------------------------------------------------------------------
    // Assign jDeact (free in afternoon) to slot3Later (14:00-16:00) and jFacBackup2 to slot1 (09:00-11:00)
    const aDeactAfternoon = (
      await req('/api/assignments', {
        method: 'POST',
        cookie: adminCookie,
        csrf: adminCsrf,
        body: { judgeId: jDeact.id, slotId: slot3Later.id, role: 'PRIMARY' },
      })
    ).json.assignment;
    // Also assign jFacBackup2 as BACKUP on slot3Later (non-overlapping 14:00-16:00)
    await req('/api/assignments', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { judgeId: jFacBackup2.id, slotId: slot3Later.id, role: 'BACKUP' },
    });

    // Try moving slot3Later to 10:00-12:00 (overlaps jFacBackup2's slot1 09:00-11:00!)
    const reschedBlocked = await req(`/api/slots/${slot3Later.id}`, {
      method: 'PUT',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        slotLabel: 'Morning Rescheduled',
        startTime: '2026-12-15T10:00:00Z',
        endTime: '2026-12-15T12:00:00Z',
        venue: 'Seminar Hall',
        conflictResolution: 'BLOCK',
      },
    });
    assert.equal(reschedBlocked.status, 409);
    assert.equal(reschedBlocked.json.details.conflicts.length, 1);

    // Now reschedule with WITHDRAW_CONFLICTING
    const reschedForce = await req(`/api/slots/${slot3Later.id}`, {
      method: 'PUT',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        slotLabel: 'Morning Rescheduled',
        startTime: '2026-12-15T10:00:00Z',
        endTime: '2026-12-15T12:00:00Z',
        venue: 'Seminar Hall',
        conflictResolution: 'WITHDRAW_CONFLICTING',
      },
    });
    assert.equal(reschedForce.status, 200);
    assert.equal(reschedForce.json.slot.status, 'RESCHEDULED');
    assert.equal(reschedForce.json.withdrawnConflictingAssignments.length, 1);

    // -------------------------------------------------------------------------
    // SCENARIO 13: Judge account deactivated while assignments exist
    // -------------------------------------------------------------------------
    const deactRes = await req(`/api/judges/${jDeact.id}/deactivate`, {
      method: 'PATCH',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { reason: 'Left university' },
    });
    assert.equal(deactRes.status, 200);
    assert.equal(deactRes.json.cancelledAssignments.length, 1);
    assert.equal(deactRes.json.cancelledAssignments[0].id, aDeactAfternoon.id);

    // Deactivated judge's active session must be immediately invalidated
    const deactMe = await req('/api/judge/dashboard', { cookie: deactAuth.cookie });
    assert.equal(deactMe.status, 401);

    // -------------------------------------------------------------------------
    // SCENARIO 12: Competition cancelled after assignments created
    // -------------------------------------------------------------------------
    // Assign jAcceptedUnassigned to slot2Overlap first, then cancel comp2
    await req('/api/assignments', {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { judgeId: jAcceptedUnassigned.id, slotId: slot2Overlap.id, role: 'PRIMARY' },
    });
    const cancelComp = await req(`/api/competitions/${comp2.id}/cancel`, {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { reason: 'Insufficient student teams' },
    });
    assert.equal(cancelComp.status, 200);
    assert.equal(cancelComp.json.cancelledSlotsCount, 1);
    assert.equal(cancelComp.json.cancelledAssignmentsCount, 1);

    // Verify Reports & Dashboard endpoints return consistent data
    const rep = await req('/api/reports/overview', { cookie: adminCookie });
    assert.equal(rep.status, 200);
    assert.ok(rep.json.replacementsReport.length >= 1);

    const dash = await req('/api/dashboard/summary', { cookie: adminCookie });
    assert.equal(dash.status, 200);
    assert.equal(dash.json.metrics.total_judges, 9);

    console.log('ALL 13 SCENARIOS + SECURITY + TRANSACTION TESTS PASSED!');

    // Leave clean database state after verification
    await pool.query(
      'TRUNCATE judge_attendance, judge_assignments, judge_availability, judge_invitations, competition_slots, competitions, judges, user_sessions, activity_logs, users RESTART IDENTITY CASCADE'
    );
  } finally {
    server.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('PHASE 3 INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
