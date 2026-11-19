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

const RETRYABLE_PG_CODES = new Set(['40P01', '40001']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta fn(client) dentro de una transacción PostgreSQL en UTC con ROLLBACK automático
 * y reintentos con backoff + jitter ante errores transitorios 40P01 / 40001.
 * IMPORTANTE: no ejecutar efectos secundarios externos dentro de fn(client).
 */
export async function withTransaction(fn, { maxRetries = 3 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("SET TIME ZONE 'UTC'");
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rbErr) {
          console.error('Error ejecutando ROLLBACK:', rbErr.message);
        }
      }
      if (RETRYABLE_PG_CODES.has(err?.code) && attempt < maxRetries) {
        const delayMs = 15 * 2 ** attempt + Math.floor(Math.random() * 20);
        await sleep(delayMs);
        continue;
      }
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}

export async function closePool() {
  await pool.end();
}
