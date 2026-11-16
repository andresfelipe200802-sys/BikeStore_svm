import app from './app.js';
import { closePool, pool } from './config/db.js';
import env from './config/env.js';
import { startExpiracionJob, stopExpiracionJob } from './jobs/expiracionReservas.job.js';
import { verificarCoberturaAnual } from './utils/festivos.js';

let server;

async function startServer() {
  // Validación fail-fast del año actual y WARN si falta el año siguiente en festivo_colombia
  const festivoStatus = await verificarCoberturaAnual(pool);
  if (festivoStatus.warningNextYear) {
    console.warn(festivoStatus.warningNextYear);
  }

  server = app.listen(env.PORT, () => {
    console.log(`BikeStore API escuchando en http://localhost:${env.PORT}`);
  });

  startExpiracionJob();
}

async function shutdown(signal) {
  console.log(`Recibida señal ${signal}. Cerrando servidor ordenadamente...`);
  stopExpiracionJob();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch(async (err) => {
  console.error('Error fatal al iniciar servidor BikeStore:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
