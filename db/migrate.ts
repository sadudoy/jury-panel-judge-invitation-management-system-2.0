import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getPool, withTransaction } from '../server/db.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRes = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename ASC'
  );
  const appliedSet = new Set(appliedRes.rows.map((r) => r.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[migrate] Skipping already applied: ${file}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`[migrate] Applying ${file}...`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    appliedCount += 1;
    console.log(`[migrate] Applied ${file}`);
  }

  console.log(`[migrate] Done. New migrations applied: ${appliedCount}`);
  await pool.end();
}

runMigrations().catch((err) => {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
});
