import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import type pg from 'pg';
import { getPool, withTransaction } from '../server/db.ts';

dotenv.config();

const DEMO_PASSWORD = process.env.DEMO_JUDGE_PASSWORD || 'DemoJudge@2026';
const DEMO_TAG = '[Demo]';

interface DemoJudgeDef {
  key: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  institution: string;
  judgeType: 'EXTERNAL' | 'FACULTY';
  expertise: string;
}

const DEMO_JUDGES: DemoJudgeDef[] = [
  // 7 External Judges
  {
    key: 'tanvir',
    name: 'Dr. Tanvir Ahmed Chowdhury',
    email: 'tanvir.chowdhury@demo.ext.org',
    phone: '+8801711-000101',
    designation: 'Professor, Dept. of CSE',
    institution: 'BUET',
    judgeType: 'EXTERNAL',
    expertise: 'Algorithms, Competitive Programming, Graph Theory',
  },
  {
    key: 'nusrat',
    name: 'Nusrat Jahan Mim',
    email: 'nusrat.mim@demo.ext.org',
    phone: '+8801711-000102',
    designation: 'Principal Software Architect',
    institution: 'Brain Station 23',
    judgeType: 'EXTERNAL',
    expertise: 'Distributed Systems, Cloud Architecture, Hackathons',
  },
  {
    key: 'farhan',
    name: 'Engr. Farhan Sadik',
    email: 'farhan.sadik@demo.ext.org',
    phone: '+8801711-000103',
    designation: 'Senior Robotics Lead',
    institution: 'TigerIT Bangladesh',
    judgeType: 'EXTERNAL',
    expertise: 'Embedded Systems, Autonomous Robotics, ROS',
  },
  {
    key: 'mahbubul',
    name: 'Dr. Mahbubul Alam',
    email: 'mahbubul.alam@demo.ext.org',
    phone: '+8801711-000104',
    designation: 'Associate Professor, Dept. of CSE',
    institution: 'RUET',
    judgeType: 'EXTERNAL',
    expertise: 'Software Engineering, AI Systems, Project Evaluation',
  },
  {
    key: 'tasnim',
    name: 'Tasnim Tabassum',
    email: 'tasnim.tabassum@demo.ext.org',
    phone: '+8801711-000105',
    designation: 'Lead Product Designer',
    institution: 'Pathao',
    judgeType: 'EXTERNAL',
    expertise: 'UI/UX Design, Design Systems, Human-Computer Interaction',
  },
  {
    key: 'rafiqul',
    name: 'Rafiqul Islam Khan',
    email: 'rafiqul.khan@demo.ext.org',
    phone: '+8801711-000106',
    designation: 'Esports & Game Engine Director',
    institution: 'Riseup Labs',
    judgeType: 'EXTERNAL',
    expertise: 'Game Design, Competitive Esports, Unity',
  },
  {
    key: 'sadia',
    name: 'Sadia Afrin',
    email: 'sadia.afrin@demo.ext.org',
    phone: '+8801711-000107',
    designation: 'Senior ML Engineer',
    institution: 'Enosis Solutions',
    judgeType: 'EXTERNAL',
    expertise: 'Machine Learning, Data Engineering, Computer Vision',
  },
  // 7 Internal Faculty Judges (BAUST)
  {
    key: 'kamal',
    name: 'Prof. Dr. Kamal Uddin',
    email: 'kamal.uddin@demo.baust.edu.bd',
    phone: '+8801722-000201',
    designation: 'Professor & Head, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'Algorithms, Compiler Design, Competitive Programming',
  },
  {
    key: 'farzana',
    name: 'Dr. Farzana Yasmin',
    email: 'farzana.yasmin@demo.baust.edu.bd',
    phone: '+8801722-000202',
    designation: 'Associate Professor, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'IoT, Robotics, Microcontrollers',
  },
  {
    key: 'tariqul',
    name: 'Md. Tariqul Islam',
    email: 'tariqul.islam@demo.baust.edu.bd',
    phone: '+8801722-000203',
    designation: 'Assistant Professor, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'Full-Stack Web, Databases, Hackathons',
  },
  {
    key: 'sharmin',
    name: 'Sharmin Akter',
    email: 'sharmin.akter@demo.baust.edu.bd',
    phone: '+8801722-000204',
    designation: 'Assistant Professor, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'HCI, UI/UX, Software Quality Assurance',
  },
  {
    key: 'mehedi',
    name: 'Mehedi Hasan',
    email: 'mehedi.hasan@demo.baust.edu.bd',
    phone: '+8801722-000205',
    designation: 'Lecturer, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'Competitive Programming, Data Structures',
  },
  {
    key: 'nabila',
    name: 'Nabila Rahman',
    email: 'nabila.rahman@demo.baust.edu.bd',
    phone: '+8801722-000206',
    designation: 'Lecturer, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'Computer Graphics, Game Development, Multimedia',
  },
  {
    key: 'asif',
    name: 'Asif Mahmud',
    email: 'asif.mahmud@demo.baust.edu.bd',
    phone: '+8801722-000207',
    designation: 'Lecturer, Dept. of CSE',
    institution: 'BAUST',
    judgeType: 'FACULTY',
    expertise: 'Networking, Cybersecurity, Project Mentoring',
  },
];

interface DemoCompetitionDef {
  key: string;
  name: string;
  description: string;
  requiredPrimaryJudges: number;
  status: 'DRAFT' | 'OPEN' | 'ONGOING' | 'COMPLETED';
}

const DEMO_COMPETITIONS: DemoCompetitionDef[] = [
  {
    key: 'prog',
    name: 'Programming Contest',
    description: `${DEMO_TAG} Inter-university algorithmic problem solving and ICPC-style jury evaluation at CSE Labs & Auditorium.`,
    requiredPrimaryJudges: 2,
    status: 'ONGOING',
  },
  {
    key: 'proj',
    name: 'Project Showcasing',
    description: `${DEMO_TAG} Hardware, IoT, and software engineering capstone showcase and live jury scoring.`,
    requiredPrimaryJudges: 2,
    status: 'ONGOING',
  },
  {
    key: 'robo',
    name: 'Robotics Competition',
    description: `${DEMO_TAG} Autonomous line follower and obstacle-course robotics arena trials at Multipurpose Hall.`,
    requiredPrimaryJudges: 2,
    status: 'OPEN',
  },
  {
    key: 'hack',
    name: 'Hackathon',
    description: `${DEMO_TAG} 24-hour rapid prototyping challenge with architecture review and final team pitch.`,
    requiredPrimaryJudges: 2,
    status: 'OPEN',
  },
  {
    key: 'uiux',
    name: 'UI/UX Design Competition',
    description: `${DEMO_TAG} Human-centered product design sprint, wireframing, and interactive prototype critique.`,
    requiredPrimaryJudges: 2,
    status: 'OPEN',
  },
  {
    key: 'gaming',
    name: 'Gaming Competition',
    description: `${DEMO_TAG} Competitive esports finals and student-developed game mechanics evaluation.`,
    requiredPrimaryJudges: 1,
    status: 'OPEN',
  },
];

interface DemoSlotDef {
  key: string;
  compKey: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  venue: string;
  status: 'SCHEDULED' | 'COMPLETED';
}

const DEMO_SLOTS: DemoSlotDef[] = [
  {
    key: 'prog_prelim',
    compKey: 'prog',
    slotLabel: 'Preliminary Round',
    startTime: '2026-12-18T09:00:00+06:00',
    endTime: '2026-12-18T11:30:00+06:00',
    venue: 'CSE Lab 1 & 2',
    status: 'COMPLETED',
  },
  {
    key: 'prog_final',
    compKey: 'prog',
    slotLabel: 'Final Contest',
    startTime: '2026-12-18T14:00:00+06:00',
    endTime: '2026-12-18T17:00:00+06:00',
    venue: 'Central Auditorium',
    status: 'SCHEDULED',
  },
  {
    key: 'proj_hw',
    compKey: 'proj',
    slotLabel: 'Hardware & IoT Track',
    startTime: '2026-12-18T09:30:00+06:00',
    endTime: '2026-12-18T12:30:00+06:00',
    venue: 'Academic Block B Atrium',
    status: 'SCHEDULED',
  },
  {
    key: 'proj_sw',
    compKey: 'proj',
    slotLabel: 'Software & AI Track',
    startTime: '2026-12-19T09:30:00+06:00',
    endTime: '2026-12-19T12:30:00+06:00',
    venue: 'Seminar Hall 201',
    status: 'SCHEDULED',
  },
  {
    key: 'robo_final',
    compKey: 'robo',
    slotLabel: 'Line Follower Finals',
    startTime: '2026-12-18T14:00:00+06:00',
    endTime: '2026-12-18T17:00:00+06:00',
    venue: 'BAUST Multipurpose Hall',
    status: 'SCHEDULED',
  },
  {
    key: 'hack_pitch',
    compKey: 'hack',
    slotLabel: 'Final Pitch & Demo',
    startTime: '2026-12-19T14:00:00+06:00',
    endTime: '2026-12-19T17:00:00+06:00',
    venue: 'Central Auditorium',
    status: 'SCHEDULED',
  },
  {
    key: 'uiux_jury',
    compKey: 'uiux',
    slotLabel: 'Design Critique & Jury',
    startTime: '2026-12-19T09:30:00+06:00',
    endTime: '2026-12-19T12:00:00+06:00',
    venue: 'Design Studio Lab 3',
    status: 'SCHEDULED',
  },
  {
    key: 'gaming_final',
    compKey: 'gaming',
    slotLabel: 'Grand Finals',
    startTime: '2026-12-19T14:30:00+06:00',
    endTime: '2026-12-19T17:30:00+06:00',
    venue: 'Student Activity Center',
    status: 'SCHEDULED',
  },
];

async function upsertDemoJudge(
  client: pg.PoolClient,
  def: DemoJudgeDef,
  passwordHash: string
): Promise<{ judgeId: number; created: boolean }> {
  const existingJudge = await client.query<{ id: number; user_id: number | null }>(
    'SELECT id, user_id FROM judges WHERE LOWER(email) = LOWER($1)',
    [def.email]
  );

  if (existingJudge.rows.length > 0) {
    return { judgeId: existingJudge.rows[0].id, created: false };
  }

  let userId: number;
  const existingUser = await client.query<{ id: number }>(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [def.email]
  );

  if (existingUser.rows.length > 0) {
    userId = existingUser.rows[0].id;
  } else {
    const insUser = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, role, full_name, is_active)
       VALUES ($1, $2, 'JUDGE', $3, TRUE)
       RETURNING id`,
      [def.email, passwordHash, def.name]
    );
    userId = insUser.rows[0].id;
  }

  const insJudge = await client.query<{ id: number }>(
    `INSERT INTO judges (user_id, name, email, phone, designation, institution, judge_type, expertise, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
     RETURNING id`,
    [
      userId,
      def.name,
      def.email,
      def.phone,
      def.designation,
      def.institution,
      def.judgeType,
      def.expertise,
    ]
  );

  return { judgeId: insJudge.rows[0].id, created: true };
}

async function upsertDemoCompetition(
  client: pg.PoolClient,
  def: DemoCompetitionDef
): Promise<{ compId: number; created: boolean }> {
  const existing = await client.query<{ id: number; description: string | null }>(
    'SELECT id, description FROM competitions WHERE name = $1',
    [def.name]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.description?.includes(DEMO_TAG)) {
      return { compId: row.id, created: false };
    }
    // Preserve any real competition with the same name by using a clearly marked demo title
    const demoName = `${def.name} (Demo)`;
    const existingDemo = await client.query<{ id: number }>(
      'SELECT id FROM competitions WHERE name = $1',
      [demoName]
    );
    if (existingDemo.rows.length > 0) {
      return { compId: existingDemo.rows[0].id, created: false };
    }
    const ins = await client.query<{ id: number }>(
      `INSERT INTO competitions (name, description, required_primary_judges, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [demoName, def.description, def.requiredPrimaryJudges, def.status]
    );
    return { compId: ins.rows[0].id, created: true };
  }

  const ins = await client.query<{ id: number }>(
    `INSERT INTO competitions (name, description, required_primary_judges, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [def.name, def.description, def.requiredPrimaryJudges, def.status]
  );
  return { compId: ins.rows[0].id, created: true };
}

async function upsertDemoSlot(
  client: pg.PoolClient,
  compId: number,
  def: DemoSlotDef
): Promise<{ slotId: number; created: boolean }> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM competition_slots WHERE competition_id = $1 AND slot_label = $2',
    [compId, def.slotLabel]
  );
  if (existing.rows.length > 0) {
    return { slotId: existing.rows[0].id, created: false };
  }

  const ins = await client.query<{ id: number }>(
    `INSERT INTO competition_slots (competition_id, slot_label, start_time, end_time, venue, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [compId, def.slotLabel, def.startTime, def.endTime, def.venue, def.status]
  );
  return { slotId: ins.rows[0].id, created: true };
}

async function ensureInvitation(
  client: pg.PoolClient,
  judgeId: number,
  spec: {
    responseStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    sentOffsetDays: number;
    expOffsetDays: number;
    respondedOffsetDays?: number;
    note?: string;
  }
): Promise<boolean> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM judge_invitations WHERE judge_id = $1',
    [judgeId]
  );
  if (existing.rows.length > 0) {
    return false;
  }

  const now = Date.now();
  const sentDate = new Date(now + spec.sentOffsetDays * 86400_000);
  const expDate = new Date(now + spec.expOffsetDays * 86400_000);
  const respDate =
    spec.respondedOffsetDays !== undefined
      ? new Date(now + spec.respondedOffsetDays * 86400_000)
      : null;

  await client.query(
    `INSERT INTO judge_invitations
       (judge_id, sent_by_admin_id, sent_date, expiration_date, response_status, response_date, response_note)
     VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
    [judgeId, sentDate, expDate, spec.responseStatus, respDate, spec.note || null]
  );
  return true;
}

async function ensureAssignment(
  client: pg.PoolClient,
  spec: {
    judgeId: number;
    slotId: number;
    role: 'PRIMARY' | 'BACKUP';
    responseStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED';
    assignmentStatus:
      | 'ASSIGNED'
      | 'CONFIRMED'
      | 'DECLINED'
      | 'WITHDRAWN'
      | 'REPLACED'
      | 'STANDBY'
      | 'ACTIVATED_BACKUP';
    replacesAssignmentId?: number | null;
    reason?: string;
    responseNote?: string;
  }
): Promise<{ assignmentId: number; created: boolean }> {
  const existing = await client.query<{ id: number }>(
    `SELECT id
     FROM judge_assignments
     WHERE judge_id = $1
       AND slot_id = $2
       AND role = $3
       AND assignment_status = $4`,
    [spec.judgeId, spec.slotId, spec.role, spec.assignmentStatus]
  );
  if (existing.rows.length > 0) {
    return { assignmentId: existing.rows[0].id, created: false };
  }

  const respondedAt = spec.responseStatus === 'PENDING' ? null : new Date();
  const ins = await client.query<{ id: number }>(
    `INSERT INTO judge_assignments
       (judge_id, slot_id, role, response_status, assignment_status, replaces_assignment_id, assigned_by_admin_id, responded_at, response_note, status_reason)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)
     RETURNING id`,
    [
      spec.judgeId,
      spec.slotId,
      spec.role,
      spec.responseStatus,
      spec.assignmentStatus,
      spec.replacesAssignmentId ?? null,
      respondedAt,
      spec.responseNote || null,
      spec.reason || null,
    ]
  );

  return { assignmentId: ins.rows[0].id, created: true };
}

async function ensureAttendance(
  client: pg.PoolClient,
  assignmentId: number,
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
  remarks: string
): Promise<boolean> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM judge_attendance WHERE assignment_id = $1',
    [assignmentId]
  );
  if (existing.rows.length > 0) {
    return false;
  }

  await client.query(
    `INSERT INTO judge_attendance (assignment_id, attendance_status, marked_time, marked_by_admin_id, remarks)
     VALUES ($1, $2, NOW(), NULL, $3)`,
    [assignmentId, status, remarks]
  );
  return true;
}

async function ensureAvailability(
  client: pg.PoolClient,
  judgeId: number,
  slotId: number,
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'TENTATIVE',
  note: string
): Promise<void> {
  await client.query(
    `INSERT INTO judge_availability (judge_id, slot_id, availability_status, note)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (judge_id, slot_id) DO NOTHING`,
    [judgeId, slotId, status, note]
  );
}

async function seedDemo(): Promise<void> {
  const pool = getPool();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  try {
    const summary = await withTransaction(async (client) => {
      const judgeMap = new Map<string, number>();
      let judgesCreated = 0;

      for (const j of DEMO_JUDGES) {
        const res = await upsertDemoJudge(client, j, passwordHash);
        judgeMap.set(j.key, res.judgeId);
        if (res.created) judgesCreated += 1;
      }

      const compMap = new Map<string, number>();
      let compsCreated = 0;

      for (const c of DEMO_COMPETITIONS) {
        const res = await upsertDemoCompetition(client, c);
        compMap.set(c.key, res.compId);
        if (res.created) compsCreated += 1;
      }

      const slotMap = new Map<string, number>();
      let slotsCreated = 0;

      for (const s of DEMO_SLOTS) {
        const compId = compMap.get(s.compKey)!;
        const res = await upsertDemoSlot(client, compId, s);
        slotMap.set(s.key, res.slotId);
        if (res.created) slotsCreated += 1;
      }

      // Invitations covering ACCEPTED, REJECTED, PENDING, EXPIRED
      let invitationsCreated = 0;
      const acceptedKeys = [
        'tanvir',
        'nusrat',
        'farhan',
        'mahbubul',
        'tasnim',
        'kamal',
        'farzana',
        'tariqul',
        'sharmin',
        'mehedi',
        'nabila',
      ];
      for (const k of acceptedKeys) {
        if (
          await ensureInvitation(client, judgeMap.get(k)!, {
            responseStatus: 'ACCEPTED',
            sentOffsetDays: -5,
            expOffsetDays: 5,
            respondedOffsetDays: -3,
            note: `${DEMO_TAG} Honored to serve on the BAUST CSE Fest jury panel.`,
          })
        ) {
          invitationsCreated += 1;
        }
      }

      if (
        await ensureInvitation(client, judgeMap.get('rafiqul')!, {
          responseStatus: 'REJECTED',
          sentOffsetDays: -6,
          expOffsetDays: 4,
          respondedOffsetDays: -4,
          note: `${DEMO_TAG} Prior international summit commitment on December 18–19.`,
        })
      ) {
        invitationsCreated += 1;
      }

      if (
        await ensureInvitation(client, judgeMap.get('asif')!, {
          responseStatus: 'PENDING',
          sentOffsetDays: -2,
          expOffsetDays: 6,
          note: undefined,
        })
      ) {
        invitationsCreated += 1;
      }

      if (
        await ensureInvitation(client, judgeMap.get('sadia')!, {
          responseStatus: 'EXPIRED',
          sentOffsetDays: -10,
          expOffsetDays: -2,
          note: undefined,
        })
      ) {
        invitationsCreated += 1;
      }

      // Declared Availability for accepted judges (including unassigned Nabila Rahman)
      await ensureAvailability(client, judgeMap.get('nabila')!, slotMap.get('gaming_final')!, 'AVAILABLE', `${DEMO_TAG} Available for Gaming Finals.`);
      await ensureAvailability(client, judgeMap.get('nabila')!, slotMap.get('proj_sw')!, 'AVAILABLE', `${DEMO_TAG} Available for Software Track.`);
      await ensureAvailability(client, judgeMap.get('mehedi')!, slotMap.get('prog_prelim')!, 'AVAILABLE', `${DEMO_TAG} On campus all morning.`);
      await ensureAvailability(client, judgeMap.get('tariqul')!, slotMap.get('robo_final')!, 'AVAILABLE', `${DEMO_TAG} Standby for Robotics Hall.`);
      await ensureAvailability(client, judgeMap.get('tasnim')!, slotMap.get('gaming_final')!, 'UNAVAILABLE', `${DEMO_TAG} Conflict with design debrief.`);

      // Assignments (Strictly non-overlapping for every judge!)
      let assignmentsCreated = 0;
      let attendanceCreated = 0;

      const trackAssign = async (
        spec: Parameters<typeof ensureAssignment>[1]
      ): Promise<number> => {
        const res = await ensureAssignment(client, spec);
        if (res.created) assignmentsCreated += 1;
        return res.assignmentId;
      };

      const trackAtt = async (
        assignmentId: number,
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
        remarks: string
      ) => {
        if (await ensureAttendance(client, assignmentId, status, remarks)) {
          attendanceCreated += 1;
        }
      };

      // --- Slot 1A: Programming Contest Preliminary (Dec 18 09:00-11:30) ---
      const a1aTanvir = await trackAssign({
        judgeId: judgeMap.get('tanvir')!,
        slotId: slotMap.get('prog_prelim')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAtt(a1aTanvir, 'PRESENT', `${DEMO_TAG} Checked in at CSE Lab 1 on schedule.`);

      const a1aKamal = await trackAssign({
        judgeId: judgeMap.get('kamal')!,
        slotId: slotMap.get('prog_prelim')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAtt(a1aKamal, 'LATE', `${DEMO_TAG} Arrived 12 minutes after kickoff; completed full evaluation.`);

      const a1aMehedi = await trackAssign({
        judgeId: judgeMap.get('mehedi')!,
        slotId: slotMap.get('prog_prelim')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });
      await trackAtt(a1aMehedi, 'PRESENT', `${DEMO_TAG} Standby faculty present on-site.`);

      // --- Slot 2A: Project Showcasing Hardware (Dec 18 09:30-12:30) ---
      const a2aMahbubul = await trackAssign({
        judgeId: judgeMap.get('mahbubul')!,
        slotId: slotMap.get('proj_hw')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAtt(a2aMahbubul, 'PRESENT', `${DEMO_TAG} Evaluated all 14 IoT booths.`);

      // Farhan Sadik was primary, marked ABSENT, and REPLACED by Faculty Backup Farzana Yasmin!
      const a2aFarhanReplaced = await trackAssign({
        judgeId: judgeMap.get('farhan')!,
        slotId: slotMap.get('proj_hw')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'REPLACED',
        reason: `${DEMO_TAG} Absent at venue start; standby faculty backup activated.`,
      });
      await trackAtt(a2aFarhanReplaced, 'ABSENT', `${DEMO_TAG} Flight delay prevented morning arrival.`);

      const a2aFarzanaActivated = await trackAssign({
        judgeId: judgeMap.get('farzana')!,
        slotId: slotMap.get('proj_hw')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'ACTIVATED_BACKUP',
        replacesAssignmentId: a2aFarhanReplaced,
        reason: `${DEMO_TAG} Activated standby backup for absent external judge.`,
      });
      await trackAtt(a2aFarzanaActivated, 'PRESENT', `${DEMO_TAG} Assumed primary hardware judging duties.`);

      const a2aTariqulStandby = await trackAssign({
        judgeId: judgeMap.get('tariqul')!,
        slotId: slotMap.get('proj_hw')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });
      await trackAtt(a2aTariqulStandby, 'EXCUSED', `${DEMO_TAG} Excused due to emergency invigilation duty.`);

      // --- Slot 1B: Programming Contest Final (Dec 18 14:00-17:00) ---
      await trackAssign({
        judgeId: judgeMap.get('tanvir')!,
        slotId: slotMap.get('prog_final')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAssign({
        judgeId: judgeMap.get('kamal')!,
        slotId: slotMap.get('prog_final')!,
        role: 'PRIMARY',
        responseStatus: 'PENDING',
        assignmentStatus: 'ASSIGNED',
      });
      await trackAssign({
        judgeId: judgeMap.get('mehedi')!,
        slotId: slotMap.get('prog_final')!,
        role: 'BACKUP',
        responseStatus: 'PENDING',
        assignmentStatus: 'STANDBY',
      });

      // --- Slot 3A: Robotics Competition Finals (Dec 18 14:00-17:00) ---
      // Historical declined row + one unreplaced ABSENT primary ready for live backup activation demo
      await trackAssign({
        judgeId: judgeMap.get('mahbubul')!,
        slotId: slotMap.get('robo_final')!,
        role: 'PRIMARY',
        responseStatus: 'DECLINED',
        assignmentStatus: 'DECLINED',
        responseNote: `${DEMO_TAG} Travel schedule conflict for afternoon finals.`,
        reason: `${DEMO_TAG} Declined by judge prior to schedule lock.`,
      });

      const a3aFarhanAbsent = await trackAssign({
        judgeId: judgeMap.get('farhan')!,
        slotId: slotMap.get('robo_final')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAtt(a3aFarhanAbsent, 'ABSENT', `${DEMO_TAG} Pending replacement activation from Backup Desk.`);

      const a3aFarzana = await trackAssign({
        judgeId: judgeMap.get('farzana')!,
        slotId: slotMap.get('robo_final')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAtt(a3aFarzana, 'PRESENT', `${DEMO_TAG} Checking track calibration at Multipurpose Hall.`);

      await trackAssign({
        judgeId: judgeMap.get('tariqul')!,
        slotId: slotMap.get('robo_final')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });

      // --- Slot 2B: Project Showcasing Software & AI (Dec 19 09:30-12:30) ---
      // 1/2 Primary filled + 1 WITHDRAWN primary (demonstrates withdrawn queue & 1 vacant seat)
      await trackAssign({
        judgeId: judgeMap.get('nusrat')!,
        slotId: slotMap.get('proj_sw')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAssign({
        judgeId: judgeMap.get('tariqul')!,
        slotId: slotMap.get('proj_sw')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'WITHDRAWN',
        reason: `${DEMO_TAG} Judge withdrew due to thesis defense committee overlap.`,
      });
      await trackAssign({
        judgeId: judgeMap.get('farzana')!,
        slotId: slotMap.get('proj_sw')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });

      // --- Slot 5A: UI/UX Design Competition (Dec 19 09:30-12:00) ---
      await trackAssign({
        judgeId: judgeMap.get('tasnim')!,
        slotId: slotMap.get('uiux_jury')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAssign({
        judgeId: judgeMap.get('sharmin')!,
        slotId: slotMap.get('uiux_jury')!,
        role: 'PRIMARY',
        responseStatus: 'PENDING',
        assignmentStatus: 'ASSIGNED',
      });
      await trackAssign({
        judgeId: judgeMap.get('mehedi')!,
        slotId: slotMap.get('uiux_jury')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });

      // --- Slot 4A: Hackathon Final Pitch (Dec 19 14:00-17:00) ---
      await trackAssign({
        judgeId: judgeMap.get('nusrat')!,
        slotId: slotMap.get('hack_pitch')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAssign({
        judgeId: judgeMap.get('tariqul')!,
        slotId: slotMap.get('hack_pitch')!,
        role: 'PRIMARY',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'CONFIRMED',
      });
      await trackAssign({
        judgeId: judgeMap.get('sharmin')!,
        slotId: slotMap.get('hack_pitch')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });

      // --- Slot 6A: Gaming Competition Grand Finals (Dec 19 14:30-17:30) ---
      // Declined primary -> 0/1 Primary (1 vacant) + Standby backup
      await trackAssign({
        judgeId: judgeMap.get('tasnim')!,
        slotId: slotMap.get('gaming_final')!,
        role: 'PRIMARY',
        responseStatus: 'DECLINED',
        assignmentStatus: 'DECLINED',
        responseNote: `${DEMO_TAG} Outside primary UI/UX judging track.`,
        reason: `${DEMO_TAG} Declined by judge.`,
      });
      await trackAssign({
        judgeId: judgeMap.get('mehedi')!,
        slotId: slotMap.get('gaming_final')!,
        role: 'BACKUP',
        responseStatus: 'ACCEPTED',
        assignmentStatus: 'STANDBY',
      });

      if (
        judgesCreated > 0 ||
        compsCreated > 0 ||
        slotsCreated > 0 ||
        invitationsCreated > 0 ||
        assignmentsCreated > 0 ||
        attendanceCreated > 0
      ) {
        await client.query(
          `INSERT INTO activity_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
           VALUES (NULL, 'SYSTEM', 'DEMO_DATA_SEEDED', 'SYSTEM', NULL, $1::jsonb)`,
          [
            JSON.stringify({
              demoTag: DEMO_TAG,
              judgesCreated,
              compsCreated,
              slotsCreated,
              invitationsCreated,
              assignmentsCreated,
              attendanceCreated,
            }),
          ]
        );
      }

      return {
        judgesCreated,
        compsCreated,
        slotsCreated,
        invitationsCreated,
        assignmentsCreated,
        attendanceCreated,
      };
    });

    console.log('[seed-demo] Idempotent demo seed finished:', summary);
  } finally {
    await pool.end();
  }
}

seedDemo().catch((err) => {
  console.error('[seed-demo] Failed:', err);
  process.exit(1);
});
