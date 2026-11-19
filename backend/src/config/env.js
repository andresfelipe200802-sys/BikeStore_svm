import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function parseTrustProxy(raw) {
  if (raw === undefined || raw === null) return false;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return trimmed;
}

export function deriveDevRefreshReplayKey(jwtSecret) {
  return Buffer.from(
    crypto.hkdfSync('sha256', jwtSecret, 'bikestore-dev-replay-salt', 'refresh-replay-key-v1', 32)
  ).toString('hex');
}

export function loadEnv(sourceEnv = process.env, { ignoreTestRunner = false } = {}) {
  const runningTestRunner =
    !ignoreTestRunner &&
    (sourceEnv.npm_lifecycle_event === 'test' ||
      process.execArgv.includes('--test') ||
      process.argv.some((a) => a.includes(`${path.sep}tests${path.sep}`) || a.includes('/tests/')));
  const nodeEnv = runningTestRunner ? 'test' : sourceEnv.NODE_ENV || 'development';
  const isTest = nodeEnv === 'test';
  const isProduction = nodeEnv === 'production';
  const databaseUrl = isTest ? sourceEnv.TEST_DATABASE_URL : sourceEnv.DATABASE_URL;

  const missing = [];
  const jwtSecret = sourceEnv.JWT_SECRET || '';
  if (!jwtSecret || jwtSecret.trim().length < 16) {
    missing.push('JWT_SECRET (mínimo 16 caracteres)');
  }
  if (!databaseUrl) {
    missing.push(isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL');
  }

  const rawReplayKey = sourceEnv.REFRESH_REPLAY_KEY?.trim() || '';
  let refreshReplayKey = rawReplayKey;
  if (isProduction) {
    if (!rawReplayKey || rawReplayKey.length < 32 || rawReplayKey === jwtSecret) {
      missing.push('REFRESH_REPLAY_KEY (obligatoria en producción, >= 32 caracteres y distinta de JWT_SECRET)');
    }
  } else if (rawReplayKey) {
    if (rawReplayKey.length < 32 || rawReplayKey === jwtSecret) {
      missing.push('REFRESH_REPLAY_KEY (>= 32 caracteres y distinta de JWT_SECRET)');
    }
  } else if (jwtSecret && jwtSecret.trim().length >= 16) {
    refreshReplayKey = deriveDevRefreshReplayKey(jwtSecret);
  }

  const smtpTransport = (sourceEnv.SMTP_TRANSPORT || 'json').trim();
  const smtpHost = sourceEnv.SMTP_HOST?.trim() || '';
  const smtpUser = sourceEnv.SMTP_USER?.trim() || '';
  const smtpPass = sourceEnv.SMTP_PASS?.trim() || '';

  if (isProduction && smtpTransport === 'smtp') {
    if (!smtpHost) missing.push('SMTP_HOST');
    if (!smtpUser) missing.push('SMTP_USER');
    if (!smtpPass) missing.push('SMTP_PASS');
  }

  if (missing.length > 0) {
    throw new Error(`Configuración inválida. Faltan variables obligatorias: ${missing.join(', ')}`);
  }

  const bcryptRounds = Number.parseInt(sourceEnv.BCRYPT_ROUNDS || '10', 10);
  if (!Number.isFinite(bcryptRounds) || bcryptRounds < 10) {
    throw new Error('BCRYPT_ROUNDS debe ser un entero >= 10');
  }

  const rawCookieSecure = sourceEnv.COOKIE_SECURE?.trim().toLowerCase();
  const cookieSecure = isProduction ? rawCookieSecure !== 'false' : rawCookieSecure === 'true';

  const corsOriginRaw = sourceEnv.CORS_ORIGIN || 'http://localhost:5173';
  const corsOrigins = corsOriginRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    NODE_ENV: nodeEnv,
    IS_TEST: isTest,
    PORT: Number.parseInt(sourceEnv.PORT || '3000', 10),
    TRUST_PROXY: parseTrustProxy(sourceEnv.TRUST_PROXY),
    COOKIE_SECURE: cookieSecure,
    DATABASE_URL: sourceEnv.DATABASE_URL || '',
    TEST_DATABASE_URL: sourceEnv.TEST_DATABASE_URL || '',
    ACTIVE_DATABASE_URL: databaseUrl,
    DB_POOL_MAX: Number.parseInt(sourceEnv.DB_POOL_MAX || '10', 10),
    DB_SSL: sourceEnv.DB_SSL === 'true',
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: sourceEnv.JWT_EXPIRES_IN || '15m',
    REFRESH_REPLAY_KEY: refreshReplayKey,
    BCRYPT_ROUNDS: bcryptRounds,
    CORS_ORIGIN: corsOriginRaw,
    CORS_ORIGINS: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5173'],
    FRONTEND_URL: sourceEnv.FRONTEND_URL || 'http://localhost:5173',
    SMTP_TRANSPORT: smtpTransport,
    SMTP_HOST: smtpHost || 'sandbox.smtp.mailtrap.io',
    SMTP_PORT: Number.parseInt(sourceEnv.SMTP_PORT || '2525', 10),
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
    SMTP_FROM: sourceEnv.SMTP_FROM || 'BikeStore <no-responder@bikestore.local>',
    RESERVA_SWEEP_INTERVAL_MS: Number.parseInt(sourceEnv.RESERVA_SWEEP_INTERVAL_MS || '60000', 10),
    RATE_LIMIT_WINDOW_MS: Number.parseInt(sourceEnv.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX: Number.parseInt(sourceEnv.RATE_LIMIT_MAX || '10', 10),
  };
}

export const env = loadEnv();
export default env;
