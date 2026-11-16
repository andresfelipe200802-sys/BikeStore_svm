import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, withTransaction } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../../sql');

export async function runMigrations() {
  const files = (await fs.readdir(SQL_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sqlText = await fs.readFile(path.join(SQL_DIR, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sqlText);
    });
    console.log(`Migración aplicada: ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Error aplicando migraciones SQL:', err);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
