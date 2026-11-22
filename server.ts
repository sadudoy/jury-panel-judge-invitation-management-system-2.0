import dotenv from 'dotenv';
import { createApp } from './server/app.ts';
import { getPool } from './server/db.ts';
import { expireOverdueInvitations } from './server/security.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const app = createApp();

async function start(): Promise<void> {
  try {
    await getPool().query('SELECT 1');
    console.log('[db] Connected to PostgreSQL.');
  } catch (err) {
    console.error('[db] Initial connection warning:', (err as Error).message);
  }

  // Periodic background expiration check every 60 seconds
  const timer = setInterval(() => {
    expireOverdueInvitations().catch((err) => {
      console.error('[scheduler] Auto-expire check failed:', (err as Error).message);
    });
  }, 60_000);
  timer.unref();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] BAUST CSE Fest Judge Management System listening on port ${PORT}`);
  });
}

start();
