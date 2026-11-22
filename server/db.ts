import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

function buildPoolConfig(): pg.PoolConfig {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 5432);
  const database = process.env.DB_NAME || 'postgres';
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const useSsl = process.env.DB_SSL !== 'false';

  if (!host || !user || !password) {
    throw new Error(
      'Database configuration missing. Set DB_HOST, DB_USER, and DB_PASSWORD in environment variables.'
    );
  }

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

let poolInstance: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new Pool(buildPoolConfig());
    poolInstance.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err.message);
    });
  }
  return poolInstance;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors if connection already terminated
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface HttpError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function createHttpError(
  statusCode: number,
  message: string,
  details?: unknown
): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = statusCode;
  if (details !== undefined) {
    err.details = details;
  }
  return err;
}

export function mapPgError(err: unknown): HttpError {
  if (err && typeof err === 'object' && 'statusCode' in err && typeof (err as HttpError).statusCode === 'number') {
    return err as HttpError;
  }
  const pgErr = err as { code?: string; message?: string; constraint?: string; detail?: string };
  if (pgErr?.code) {
    switch (pgErr.code) {
      case '23505':
        return createHttpError(409, 'A record with this unique value already exists.', {
          constraint: pgErr.constraint,
        });
      case '23503':
        return createHttpError(400, 'Referenced record does not exist or cannot be removed while referenced.');
      case '23514':
        return createHttpError(400, 'Database constraint check failed for the provided values.', {
          constraint: pgErr.constraint,
        });
      case 'P0001':
      case 'P0002':
      case 'P0003':
      case 'P0004':
        return createHttpError(400, pgErr.message || 'Assignment eligibility check failed.');
      case 'P0005':
      case 'P0006':
        return createHttpError(409, pgErr.message || 'Scheduling conflict detected.');
    }
  }
  return createHttpError(500, 'Internal server error.');
}
