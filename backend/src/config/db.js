import pg from 'pg';
import env from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.ACTIVE_DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  options: '-c timezone=UTC',
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Ejecuta fn(client) dentro de una transacción PostgreSQL en UTC con ROLLBACK automático ante fallo.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("SET TIME ZONE 'UTC'");
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('Error ejecutando ROLLBACK:', rbErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
