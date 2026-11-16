import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function loadEnv() {
  const runningTestRunner =
    process.env.npm_lifecycle_event === 'test' ||
    process.execArgv.includes('--test') ||
    process.argv.some((a) => a.includes(`${path.sep}tests${path.sep}`) || a.includes('/tests/'));
  const nodeEnv = runningTestRunner ? 'test' : (process.env.NODE_ENV || 'development');
  const isTest = nodeEnv === 'test';
  const databaseUrl = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

  const missing = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
    missing.push('JWT_SECRET (mínimo 16 caracteres)');
  }
  if (!databaseUrl) {
    missing.push(isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL');
  }

  if (missing.length > 0) {
    throw new Error(`Configuración inválida. Faltan variables obligatorias: ${missing.join(', ')}`);
  }

  const bcryptRounds = Number.parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  if (!Number.isFinite(bcryptRounds) || bcryptRounds < 10) {
    throw new Error('BCRYPT_ROUNDS debe ser un entero >= 10');
  }

  return {
    NODE_ENV: nodeEnv,
    IS_TEST: isTest,
    PORT: Number.parseInt(process.env.PORT || '3000', 10),
    DATABASE_URL: process.env.DATABASE_URL || '',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || '',
    ACTIVE_DATABASE_URL: databaseUrl,
    DB_POOL_MAX: Number.parseInt(process.env.DB_POOL_MAX || '10', 10),
    DB_SSL: process.env.DB_SSL === 'true',
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
    BCRYPT_ROUNDS: bcryptRounds,
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    SMTP_TRANSPORT: process.env.SMTP_TRANSPORT || (isTest ? 'json' : 'json'),
    SMTP_HOST: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
    SMTP_PORT: Number.parseInt(process.env.SMTP_PORT || '2525', 10),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || 'BikeStore <no-responder@bikestore.local>',
    RESERVA_SWEEP_INTERVAL_MS: Number.parseInt(process.env.RESERVA_SWEEP_INTERVAL_MS || '60000', 10),
    RATE_LIMIT_WINDOW_MS: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX: Number.parseInt(process.env.RATE_LIMIT_MAX || '10', 10),
  };
}

export const env = loadEnv();
export default env;
