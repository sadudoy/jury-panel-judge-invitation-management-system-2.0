import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { getPool, withTransaction } from '../server/db.ts';

dotenv.config();

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function seedAdmin(): Promise<void> {
  const email = (getArg('--email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = getArg('--password') || process.env.ADMIN_PASSWORD || '';
  const fullName = (getArg('--name') || process.env.ADMIN_NAME || 'BAUST CSE Fest Admin').trim();

  if (!email || !password) {
    console.error(
      '[seed] Missing ADMIN_EMAIL or ADMIN_PASSWORD. Provide them via environment variables or --email / --password flags.'
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('[seed] Admin password must be at least 8 characters long.');
    process.exit(1);
  }

  const pool = getPool();

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await withTransaction(async (client) => {
      const existing = await client.query<{ id: number; role: string }>(
        'SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (existing.rows.length > 0) {
        const user = existing.rows[0];
        if (user.role !== 'ADMIN') {
          throw new Error(`A non-ADMIN user already exists with email ${email}.`);
        }
        await client.query(
          `UPDATE users
              SET password_hash = $1,
                  full_name = $2,
                  is_active = TRUE,
                  updated_at = NOW()
            WHERE id = $3`,
          [passwordHash, fullName, user.id]
        );
        console.log(`[seed] Updated existing admin account (${email}, id=${user.id}).`);
      } else {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO users (email, password_hash, role, full_name, is_active)
           VALUES ($1, $2, 'ADMIN', $3, TRUE)
           RETURNING id`,
          [email, passwordHash, fullName]
        );
        await client.query(
          `INSERT INTO activity_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
           VALUES ($1, 'ADMIN', 'ADMIN_SEEDED', 'USER', $1, $2::jsonb)`,
          [inserted.rows[0].id, JSON.stringify({ email })]
        );
        console.log(`[seed] Created initial admin account (${email}, id=${inserted.rows[0].id}).`);
      }
    });
  } finally {
    await pool.end();
  }
}

seedAdmin().catch((err) => {
  console.error('[seed] Seed failed:', err.message || err);
  process.exit(1);
});
