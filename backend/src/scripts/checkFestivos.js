import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from '../config/db.js';
import { verificarCoberturaAnual } from '../utils/festivos.js';

export async function runCheckFestivos() {
  const status = await verificarCoberturaAnual(pool);
  if (status.warningNextYear) {
    console.warn(status.warningNextYear);
  }
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCheckFestivos()
    .then(async (status) => {
      console.log(
        `Cobertura festivo_colombia OK: ${status.currentYear}=${status.currentCount}, ${status.nextYear}=${status.nextCount}`
      );
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fallo verificando festivo_colombia:', err.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
