import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Router } from 'express';
import { createHttpError, mapPgError, query, withTransaction } from '../db.ts';
import {
  expireOverdueInvitations,
  logActivity,
  optionalString,
  parsePositiveInt,
  requireAuth,
  requireEmail,
  requireRole,
  requireString,
  verifyCsrfAndOrigin,
} from '../security.ts';

const router = Router();

const TEMP_PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_PW_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const TEMP_PW_DIGITS = '23456789';
const TEMP_PW_SYMBOLS = '@#$%&*!?';
const TEMP_PW_ALL = TEMP_PW_UPPER + TEMP_PW_LOWER + TEMP_PW_DIGITS + TEMP_PW_SYMBOLS;

function generateTemporaryPassword(length = 14): string {
  const chars: string[] = [
    TEMP_PW_UPPER[crypto.randomInt(TEMP_PW_UPPER.length)],
    TEMP_PW_LOWER[crypto.randomInt(TEMP_PW_LOWER.length)],
    TEMP_PW_DIGITS[crypto.randomInt(TEMP_PW_DIGITS.length)],
    TEMP_PW_SYMBOLS[crypto.randomInt(TEMP_PW_SYMBOLS.length)],
  ];
  for (let i = chars.length; i < length; i++) {
    chars.push(TEMP_PW_ALL[crypto.randomInt(TEMP_PW_ALL.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

function parseCsvRecords(csvText: string): string[][] {
  const input = csvText.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') {
        i++;
      }
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell !== '')) {
        records.push(row);
      }
      row = [];
    } else if (ch === '\n') {
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell !== '')) {
        records.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    throw createHttpError(400, 'Malformed CSV: unterminated quoted field.');
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    records.push(row);
  }

  return records;
}

const CSV_HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  full_name: 'name',
  fullname: 'name',
  judge_name: 'name',
  email: 'email',
  email_address: 'email',
  e_mail: 'email',
  phone: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  contact: 'phone',
  judge_type: 'judgeType',
  judgetype: 'judgeType',
  type: 'judgeType',
  category: 'judgeType',
  designation: 'designation',
  title: 'designation',
  position: 'designation',
  institution: 'institution',
  organization: 'institution',
  org: 'institution',
  affiliation: 'institution',
  university: 'institution',
  expertise: 'expertise',
  areas_of_expertise: 'expertise',
  specialization: 'expertise',
  skills: 'expertise',
};

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

router.use(requireAuth, requireRole('ADMIN'), verifyCsrfAndOrigin);

router.get('/', async (req, res, next) => {
  try {
    await expireOverdueInvitations();

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const judgeType = typeof req.query.judgeType === 'string' ? req.query.judgeType.trim() : '';
    const isActiveParam = typeof req.query.isActive === 'string' ? req.query.isActive.trim() : '';
    const invitationStatus =
      typeof req.query.invitationStatus === 'string' ? req.query.invitationStatus.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(
        `(j.name ILIKE $${idx} OR j.email ILIKE $${idx} OR j.institution ILIKE $${idx} OR j.designation ILIKE $${idx})`
      );
    }

    if (judgeType === 'EXTERNAL' || judgeType === 'FACULTY') {
      params.push(judgeType);
      conditions.push(`j.judge_type = $${params.length}`);
    }

    if (isActiveParam === 'true' || isActiveParam === 'false') {
      params.push(isActiveParam === 'true');
      conditions.push(`j.is_active = $${params.length}`);
    }

    if (invitationStatus) {
      if (invitationStatus === 'NOT_INVITED') {
        conditions.push('ji.id IS NULL');
      } else {
        params.push(invitationStatus);
        conditions.push(`ji.response_status = $${params.length}`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
         j.id,
         j.user_id,
         j.name,
         j.email,
         j.phone,
         j.designation,
         j.institution,
         j.judge_type,
         j.expertise,
         j.is_active,
         j.deactivated_at,
         j.created_at,
         (u.id IS NOT NULL) AS has_account,
         COALESCE(u.is_active, FALSE) AS user_is_active,
         u.last_login_at,
         ji.id AS invitation_id,
         ji.response_status AS invitation_status,
         ji.sent_date AS invitation_sent_date,
         ji.expiration_date AS invitation_expiration_date,
         ji.response_date AS invitation_response_date,
         COUNT(ja.id) FILTER (
           WHERE ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
         )::int AS active_assignments_count,
         COUNT(ja.id)::int AS total_assignments_count
       FROM judges j
       LEFT JOIN users u ON u.id = j.user_id
       LEFT JOIN judge_invitations ji ON ji.judge_id = j.id
       LEFT JOIN judge_assignments ja ON ja.judge_id = j.id
       ${whereClause}
       GROUP BY j.id, u.id, u.is_active, u.last_login_at, ji.id
       ORDER BY j.is_active DESC, j.created_at DESC`,
      params
    );

    res.json({ judges: result.rows });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const judgeId = parsePositiveInt(req.params.id, 'judgeId');
    await expireOverdueInvitations();

    const judgeRes = await query(
      `SELECT
         j.*,
         (u.id IS NOT NULL) AS has_account,
         u.is_active AS user_is_active,
         u.last_login_at
       FROM judges j
       LEFT JOIN users u ON u.id = j.user_id
       WHERE j.id = $1`,
      [judgeId]
    );

    if (judgeRes.rows.length === 0) {
      throw createHttpError(404, 'Judge not found.');
    }

    const invRes = await query('SELECT * FROM judge_invitations WHERE judge_id = $1', [judgeId]);

    const assignmentsRes = await query(
      `SELECT
         ja.*,
         cs.slot_label,
         cs.start_time,
         cs.end_time,
         cs.venue,
         cs.status AS slot_status,
         c.id AS competition_id,
         c.name AS competition_name,
         c.status AS competition_status,
         att.attendance_status,
         att.marked_time,
         att.remarks AS attendance_remarks,
         orig_j.name AS replaced_judge_name
       FROM judge_assignments ja
       JOIN competition_slots cs ON cs.id = ja.slot_id
       JOIN competitions c ON c.id = cs.competition_id
       LEFT JOIN judge_attendance att ON att.assignment_id = ja.id
       LEFT JOIN judge_assignments orig_ja ON orig_ja.id = ja.replaces_assignment_id
       LEFT JOIN judges orig_j ON orig_j.id = orig_ja.judge_id
       WHERE ja.judge_id = $1
       ORDER BY cs.start_time ASC, ja.created_at DESC`,
      [judgeId]
    );

    const availabilityRes = await query(
      `SELECT
         jav.*,
         cs.slot_label,
         cs.start_time,
         cs.end_time,
         c.name AS competition_name
       FROM judge_availability jav
       JOIN competition_slots cs ON cs.id = jav.slot_id
       JOIN competitions c ON c.id = cs.competition_id
       WHERE jav.judge_id = $1
       ORDER BY cs.start_time ASC`,
      [judgeId]
    );

    const activityRes = await query(
      `SELECT *
       FROM activity_logs
       WHERE (entity_type = 'JUDGE' AND entity_id = $1)
          OR (details->>'judgeId' = $2)
       ORDER BY created_at DESC
       LIMIT 30`,
      [judgeId, String(judgeId)]
    );

    res.json({
      judge: judgeRes.rows[0],
      invitation: invRes.rows[0] || null,
      assignments: assignmentsRes.rows,
      availability: availabilityRes.rows,
      activityLogs: activityRes.rows,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = requireString(req.body?.name, 'Full name', 255);
    const email = requireEmail(req.body?.email, 'Email');
    const phone = optionalString(req.body?.phone, 50);
    const designation = requireString(req.body?.designation, 'Designation', 255);
    const institution = requireString(req.body?.institution, 'Institution', 255);
    const rawJudgeType = typeof req.body?.judgeType === 'string' ? req.body.judgeType.trim().toUpperCase() : '';
    if (rawJudgeType !== 'EXTERNAL' && rawJudgeType !== 'FACULTY') {
      throw createHttpError(400, 'Judge type must be EXTERNAL or FACULTY.');
    }
    const judgeType = rawJudgeType as 'EXTERNAL' | 'FACULTY';
    const expertise = optionalString(req.body?.expertise, 1000);

    const suppliedPassword =
      typeof req.body?.password === 'string' && req.body.password.trim() !== '' ? req.body.password : null;

    let temporaryPassword: string | null = null;
    let plainPasswordForHashing: string;

    if (suppliedPassword !== null) {
      if (suppliedPassword.length < 8 || suppliedPassword.length > 128) {
        throw createHttpError(400, 'Account password must be between 8 and 128 characters long.');
      }
      plainPasswordForHashing = suppliedPassword;
    } else {
      temporaryPassword = generateTemporaryPassword(14);
      plainPasswordForHashing = temporaryPassword;
    }

    const passwordHash = await bcrypt.hash(plainPasswordForHashing, 12);

    const created = await withTransaction(async (client) => {
      const dupUser = await client.query<{ id: number }>(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      const dupJudge = await client.query<{ id: number }>(
        'SELECT id FROM judges WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      if (dupUser.rows.length > 0 || dupJudge.rows.length > 0) {
        throw createHttpError(409, `A judge or user account with email "${email}" already exists.`);
      }

      const userRes = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, role, full_name, is_active)
         VALUES ($1, $2, 'JUDGE', $3, TRUE)
         RETURNING id`,
        [email, passwordHash, name]
      );
      const userId = userRes.rows[0].id;

      const judgeRes = await client.query(
        `INSERT INTO judges (user_id, name, email, phone, designation, institution, judge_type, expertise, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         RETURNING *`,
        [userId, name, email, phone, designation, institution, judgeType, expertise]
      );

      const judge = judgeRes.rows[0];

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'JUDGE_CREATED',
        entityType: 'JUDGE',
        entityId: judge.id,
        details: {
          judgeId: judge.id,
          userId,
          judgeType,
          accountAutoCreated: true,
          source: 'MANUAL',
        },
      });

      return {
        ...judge,
        has_account: true,
        user_is_active: true,
        invitation_status: null,
      };
    });

    res.status(201).json({
      judge: created,
      accountCreated: true,
      passwordWasAutoGenerated: temporaryPassword !== null,
      temporaryPassword,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

interface ParsedImportRow {
  rowNumber: number;
  name: string;
  email: string;
  phone: string | null;
  judgeType: 'EXTERNAL' | 'FACULTY';
  designation: string;
  institution: string;
  expertise: string | null;
}

interface ImportIssue {
  rowNumber: number;
  name: string;
  email: string;
  reason: string;
}

router.post('/bulk-import', async (req, res, next) => {
  try {
    let rawRows: Array<{ rowNumber: number; data: Record<string, unknown> }> = [];

    if (typeof req.body?.csvText === 'string') {
      const csvText = req.body.csvText;
      if (!csvText.trim()) {
        throw createHttpError(400, 'CSV content cannot be empty.');
      }
      if (csvText.length > 512_000) {
        throw createHttpError(400, 'CSV file is too large (maximum 500 KB).');
      }
      const records = parseCsvRecords(csvText);
      if (records.length < 2) {
        throw createHttpError(400, 'CSV must include a header row and at least one judge row.');
      }

      const headerKeys = records[0].map((h) => CSV_HEADER_ALIASES[normalizeHeaderKey(h)] || '');
      const requiredHeaders = ['name', 'email', 'judgeType', 'designation', 'institution'];
      const missingHeaders = requiredHeaders.filter((reqKey) => !headerKeys.includes(reqKey));
      if (missingHeaders.length > 0) {
        throw createHttpError(
          400,
          `Missing required CSV columns: ${missingHeaders.join(', ')}. Expected headers: name, email, phone, judge_type, designation, institution.`
        );
      }

      const dataRecords = records.slice(1);
      if (dataRecords.length > 200) {
        throw createHttpError(400, 'Bulk import supports at most 200 rows per upload.');
      }

      rawRows = dataRecords.map((cols, idx) => {
        const obj: Record<string, unknown> = {};
        headerKeys.forEach((mappedKey, colIdx) => {
          if (mappedKey && cols[colIdx] !== undefined) {
            obj[mappedKey] = cols[colIdx];
          }
        });
        return { rowNumber: idx + 2, data: obj };
      });
    } else if (Array.isArray(req.body?.rows)) {
      if (req.body.rows.length === 0) {
        throw createHttpError(400, 'No judge rows were provided for import.');
      }
      if (req.body.rows.length > 200) {
        throw createHttpError(400, 'Bulk import supports at most 200 rows per upload.');
      }
      rawRows = req.body.rows.map((row: unknown, idx: number) => ({
        rowNumber: idx + 1,
        data: row && typeof row === 'object' ? (row as Record<string, unknown>) : {},
      }));
    } else {
      throw createHttpError(400, 'Provide either csvText or rows for bulk import.');
    }

    const errors: ImportIssue[] = [];
    const duplicates: ImportIssue[] = [];
    const candidates: ParsedImportRow[] = [];
    const seenEmails = new Set<string>();

    for (const item of rawRows) {
      const d = item.data;
      const rawName = typeof d.name === 'string' ? d.name.trim() : '';
      const rawEmail = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
      const rawPhone = typeof d.phone === 'string' ? d.phone.trim() : '';
      const rawType = typeof d.judgeType === 'string' ? d.judgeType.trim().toUpperCase() : '';
      const rawDesignation = typeof d.designation === 'string' ? d.designation.trim() : '';
      const rawInstitution = typeof d.institution === 'string' ? d.institution.trim() : '';
      const rawExpertise = typeof d.expertise === 'string' ? d.expertise.trim() : '';

      const rowReasons: string[] = [];
      if (!rawName) rowReasons.push('Full name is required');
      else if (rawName.length > 255) rowReasons.push('Full name exceeds 255 characters');

      if (!rawEmail) rowReasons.push('Email is required');
      else if (rawEmail.length > 255 || !EMAIL_FORMAT_REGEX.test(rawEmail)) {
        rowReasons.push('Invalid email format');
      }

      if (rawPhone.length > 50) rowReasons.push('Phone exceeds 50 characters');

      if (rawType !== 'EXTERNAL' && rawType !== 'FACULTY') {
        rowReasons.push('Judge type must be EXTERNAL or FACULTY');
      }

      if (!rawDesignation) rowReasons.push('Designation is required');
      else if (rawDesignation.length > 255) rowReasons.push('Designation exceeds 255 characters');

      if (!rawInstitution) rowReasons.push('Institution is required');
      else if (rawInstitution.length > 255) rowReasons.push('Institution exceeds 255 characters');

      if (rawExpertise.length > 1000) rowReasons.push('Expertise exceeds 1000 characters');

      if (rowReasons.length > 0) {
        errors.push({
          rowNumber: item.rowNumber,
          name: rawName || '—',
          email: rawEmail || '—',
          reason: `${rowReasons.join('; ')}.`,
        });
        continue;
      }

      if (seenEmails.has(rawEmail)) {
        duplicates.push({
          rowNumber: item.rowNumber,
          name: rawName,
          email: rawEmail,
          reason: 'Duplicate email appears earlier in this CSV file.',
        });
        continue;
      }
      seenEmails.add(rawEmail);

      candidates.push({
        rowNumber: item.rowNumber,
        name: rawName,
        email: rawEmail,
        phone: rawPhone || null,
        judgeType: rawType as 'EXTERNAL' | 'FACULTY',
        designation: rawDesignation,
        institution: rawInstitution,
        expertise: rawExpertise || null,
      });
    }

    const toInsert: Array<ParsedImportRow & { temporaryPassword: string; passwordHash: string }> = [];

    if (candidates.length > 0) {
      const candidateEmails = candidates.map((c) => c.email);
      const existingRes = await query<{ email: string }>(
        `SELECT LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1::text[])
         UNION
         SELECT LOWER(email) AS email FROM judges WHERE LOWER(email) = ANY($1::text[])`,
        [candidateEmails]
      );
      const existingSet = new Set(existingRes.rows.map((r) => r.email));

      const nonDuplicateCandidates: ParsedImportRow[] = [];
      for (const c of candidates) {
        if (existingSet.has(c.email)) {
          duplicates.push({
            rowNumber: c.rowNumber,
            name: c.name,
            email: c.email,
            reason: 'A judge or user account with this email already exists.',
          });
        } else {
          nonDuplicateCandidates.push(c);
        }
      }

      // Hash unique temporary passwords in small concurrent batches
      const BATCH_SIZE = 6;
      for (let i = 0; i < nonDuplicateCandidates.length; i += BATCH_SIZE) {
        const chunk = nonDuplicateCandidates.slice(i, i + BATCH_SIZE);
        const hashedChunk = await Promise.all(
          chunk.map(async (c) => {
            const temporaryPassword = generateTemporaryPassword(14);
            const passwordHash = await bcrypt.hash(temporaryPassword, 12);
            return { ...c, temporaryPassword, passwordHash };
          })
        );
        toInsert.push(...hashedChunk);
      }
    }

    const created: Array<{
      rowNumber: number;
      judge: Record<string, unknown>;
      temporaryPassword: string;
    }> = [];

    if (toInsert.length > 0) {
      await withTransaction(async (client) => {
        for (const item of toInsert) {
          await client.query('SAVEPOINT bulk_judge_row');
          try {
            const userRes = await client.query<{ id: number }>(
              `INSERT INTO users (email, password_hash, role, full_name, is_active)
               VALUES ($1, $2, 'JUDGE', $3, TRUE)
               RETURNING id`,
              [item.email, item.passwordHash, item.name]
            );
            const userId = userRes.rows[0].id;

            const judgeRes = await client.query(
              `INSERT INTO judges (user_id, name, email, phone, designation, institution, judge_type, expertise, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
               RETURNING *`,
              [
                userId,
                item.name,
                item.email,
                item.phone,
                item.designation,
                item.institution,
                item.judgeType,
                item.expertise,
              ]
            );

            await client.query('RELEASE SAVEPOINT bulk_judge_row');
            created.push({
              rowNumber: item.rowNumber,
              judge: {
                ...judgeRes.rows[0],
                has_account: true,
                user_is_active: true,
                invitation_status: null,
              },
              temporaryPassword: item.temporaryPassword,
            });
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT bulk_judge_row');
            await client.query('RELEASE SAVEPOINT bulk_judge_row');
            const pgErr = err as { code?: string };
            if (pgErr?.code === '23505') {
              duplicates.push({
                rowNumber: item.rowNumber,
                name: item.name,
                email: item.email,
                reason: 'A judge or user account with this email already exists.',
              });
            } else {
              throw err;
            }
          }
        }

        if (created.length > 0) {
          await logActivity(client, {
            actorUserId: req.auth!.userId,
            actorRole: 'ADMIN',
            action: 'JUDGES_BULK_IMPORTED',
            entityType: 'JUDGE',
            entityId: null,
            details: {
              totalRows: rawRows.length,
              createdCount: created.length,
              skippedDuplicateCount: duplicates.length,
              invalidCount: errors.length,
              judgeIds: created.map((c) => Number(c.judge.id)),
            },
          });
        }
      });
    }

    res.status(created.length > 0 ? 201 : 200).json({
      summary: {
        totalRows: rawRows.length,
        createdCount: created.length,
        skippedDuplicateCount: duplicates.length,
        invalidCount: errors.length,
      },
      created,
      duplicates,
      errors,
    });
  } catch (err) {
    next(mapPgError(err));
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const judgeId = parsePositiveInt(req.params.id, 'judgeId');
    const name = requireString(req.body?.name, 'Name', 255);
    const email = requireEmail(req.body?.email, 'Email');
    const phone = optionalString(req.body?.phone, 50);
    const designation = requireString(req.body?.designation, 'Designation', 255);
    const institution = requireString(req.body?.institution, 'Institution', 255);
    const judgeType = req.body?.judgeType;
    if (judgeType !== 'EXTERNAL' && judgeType !== 'FACULTY') {
      throw createHttpError(400, 'judgeType must be EXTERNAL or FACULTY.');
    }
    const expertise = optionalString(req.body?.expertise, 1000);

    const updated = await withTransaction(async (client) => {
      const existing = await client.query<{ id: number; user_id: number | null; judge_type: string }>(
        'SELECT id, user_id, judge_type FROM judges WHERE id = $1 FOR UPDATE',
        [judgeId]
      );
      if (existing.rows.length === 0) {
        throw createHttpError(404, 'Judge not found.');
      }

      const linkedUserId = existing.rows[0].user_id;
      const dupJudge = await client.query<{ id: number }>(
        'SELECT id FROM judges WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
        [email, judgeId]
      );
      const dupUser = await client.query<{ id: number }>(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND ($2::int IS NULL OR id <> $2) LIMIT 1',
        [email, linkedUserId]
      );
      if (dupJudge.rows.length > 0 || dupUser.rows.length > 0) {
        throw createHttpError(409, `Another judge or user account already uses email "${email}".`);
      }

      if (existing.rows[0].judge_type === 'FACULTY' && judgeType === 'EXTERNAL') {
        const activeBackupRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt
           FROM judge_assignments
           WHERE judge_id = $1
             AND role = 'BACKUP'
             AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')`,
          [judgeId]
        );
        if (Number(activeBackupRes.rows[0].cnt) > 0) {
          throw createHttpError(
            409,
            'Cannot change judge type from FACULTY to EXTERNAL while active BACKUP assignments exist.'
          );
        }
      }

      const resJudge = await client.query(
        `UPDATE judges
            SET name = $1,
                email = $2,
                phone = $3,
                designation = $4,
                institution = $5,
                judge_type = $6,
                expertise = $7,
                updated_at = NOW()
          WHERE id = $8
          RETURNING *`,
        [name, email, phone, designation, institution, judgeType, expertise, judgeId]
      );

      if (existing.rows[0].user_id) {
        await client.query(
          `UPDATE users
              SET email = $1,
                  full_name = $2,
                  updated_at = NOW()
            WHERE id = $3`,
          [email, name, existing.rows[0].user_id]
        );
      }

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'JUDGE_UPDATED',
        entityType: 'JUDGE',
        entityId: judgeId,
        details: { judgeId, judgeType },
      });

      return resJudge.rows[0];
    });

    res.json({ judge: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

// Create or reset login credentials for a judge (no public registration)
router.post('/:id/account', async (req, res, next) => {
  try {
    const judgeId = parsePositiveInt(req.params.id, 'judgeId');
    const autoGenerate = Boolean(req.body?.autoGenerate);
    let temporaryPassword: string | null = null;
    let plainPassword: string;

    if (autoGenerate && (!req.body?.password || String(req.body.password).trim() === '')) {
      temporaryPassword = generateTemporaryPassword(14);
      plainPassword = temporaryPassword;
    } else {
      plainPassword = requireString(req.body?.password, 'Password', 128);
      if (plainPassword.length < 8) {
        throw createHttpError(400, 'Password must be at least 8 characters long.');
      }
    }

    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const result = await withTransaction(async (client) => {
      const judgeRes = await client.query<{
        id: number;
        user_id: number | null;
        name: string;
        email: string;
        is_active: boolean;
      }>('SELECT id, user_id, name, email, is_active FROM judges WHERE id = $1 FOR UPDATE', [judgeId]);

      if (judgeRes.rows.length === 0) {
        throw createHttpError(404, 'Judge not found.');
      }

      const judge = judgeRes.rows[0];
      let userId = judge.user_id;
      let mode: 'CREATED' | 'RESET' = 'RESET';

      if (userId) {
        await client.query(
          `UPDATE users
              SET password_hash = $1,
                  email = $2,
                  full_name = $3,
                  is_active = $4,
                  updated_at = NOW()
            WHERE id = $5`,
          [passwordHash, judge.email, judge.name, judge.is_active, userId]
        );
        // Revoke old sessions when password is reset
        await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      } else {
        const dupUser = await client.query<{ id: number }>(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
          [judge.email]
        );
        if (dupUser.rows.length > 0) {
          throw createHttpError(409, `A user account with email "${judge.email}" already exists.`);
        }

        mode = 'CREATED';
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO users (email, password_hash, role, full_name, is_active)
           VALUES ($1, $2, 'JUDGE', $3, $4)
           RETURNING id`,
          [judge.email, passwordHash, judge.name, judge.is_active]
        );
        userId = inserted.rows[0].id;
        await client.query('UPDATE judges SET user_id = $1, updated_at = NOW() WHERE id = $2', [
          userId,
          judgeId,
        ]);
      }

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: mode === 'CREATED' ? 'JUDGE_ACCOUNT_CREATED' : 'JUDGE_PASSWORD_RESET',
        entityType: 'JUDGE',
        entityId: judgeId,
        details: { judgeId, userId, autoGenerated: temporaryPassword !== null },
      });

      return {
        judgeId,
        userId,
        email: judge.email,
        mode,
        passwordWasAutoGenerated: temporaryPassword !== null,
        temporaryPassword,
      };
    });

    res.json(result);
  } catch (err) {
    next(mapPgError(err));
  }
});

// Scenario 13: Deactivate judge while assignments exist (preserves history, frees active positions)
router.patch('/:id/deactivate', async (req, res, next) => {
  try {
    const judgeId = parsePositiveInt(req.params.id, 'judgeId');
    const reason = optionalString(req.body?.reason, 500) || 'Judge account deactivated by administrator';

    const outcome = await withTransaction(async (client) => {
      const judgeRes = await client.query<{
        id: number;
        user_id: number | null;
        is_active: boolean;
      }>('SELECT id, user_id, is_active FROM judges WHERE id = $1 FOR UPDATE', [judgeId]);

      if (judgeRes.rows.length === 0) {
        throw createHttpError(404, 'Judge not found.');
      }

      const judge = judgeRes.rows[0];
      if (!judge.is_active) {
        throw createHttpError(409, 'Judge is already deactivated.');
      }

      await client.query(
        `UPDATE judges
            SET is_active = FALSE,
                deactivated_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [judgeId]
      );

      if (judge.user_id) {
        await client.query(
          'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
          [judge.user_id]
        );
        await client.query('DELETE FROM user_sessions WHERE user_id = $1', [judge.user_id]);
      }

      // Cancel PENDING invitation if present (preserve ACCEPTED/REJECTED/EXPIRED history)
      const invRes = await client.query<{ id: number }>(
        `UPDATE judge_invitations
            SET response_status = 'CANCELLED',
                response_note = COALESCE(response_note, $2),
                updated_at = NOW()
          WHERE judge_id = $1
            AND response_status = 'PENDING'
          RETURNING id`,
        [judgeId, reason]
      );

      // Transition active/standby assignments to CANCELLED_DEACTIVATED without deleting historical rows
      const cancelledAssignments = await client.query<{ id: number; slot_id: number; role: string }>(
        `UPDATE judge_assignments
            SET assignment_status = 'CANCELLED_DEACTIVATED',
                status_reason = $2,
                updated_at = NOW()
          WHERE judge_id = $1
            AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
          RETURNING id, slot_id, role`,
        [judgeId, reason]
      );

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'JUDGE_DEACTIVATED',
        entityType: 'JUDGE',
        entityId: judgeId,
        details: {
          judgeId,
          reason,
          cancelledAssignmentsCount: cancelledAssignments.rows.length,
          cancelledPendingInvitation: invRes.rows.length > 0,
        },
      });

      return {
        judgeId,
        deactivated: true,
        cancelledAssignments: cancelledAssignments.rows,
      };
    });

    res.json(outcome);
  } catch (err) {
    next(mapPgError(err));
  }
});

router.patch('/:id/reactivate', async (req, res, next) => {
  try {
    const judgeId = parsePositiveInt(req.params.id, 'judgeId');

    const updated = await withTransaction(async (client) => {
      const judgeRes = await client.query<{ id: number; user_id: number | null; is_active: boolean }>(
        'SELECT id, user_id, is_active FROM judges WHERE id = $1 FOR UPDATE',
        [judgeId]
      );
      if (judgeRes.rows.length === 0) {
        throw createHttpError(404, 'Judge not found.');
      }

      const judge = judgeRes.rows[0];
      if (judge.is_active) {
        throw createHttpError(409, 'Judge is already active.');
      }

      const resJudge = await client.query(
        `UPDATE judges
            SET is_active = TRUE,
                deactivated_at = NULL,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [judgeId]
      );

      if (judge.user_id) {
        await client.query('UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [
          judge.user_id,
        ]);
      }

      await logActivity(client, {
        actorUserId: req.auth!.userId,
        actorRole: 'ADMIN',
        action: 'JUDGE_REACTIVATED',
        entityType: 'JUDGE',
        entityId: judgeId,
        details: { judgeId },
      });

      return resJudge.rows[0];
    });

    res.json({ judge: updated });
  } catch (err) {
    next(mapPgError(err));
  }
});

export default router;
