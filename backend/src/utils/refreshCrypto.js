import crypto from 'node:crypto';
import env from '../config/env.js';
import { sha256Hex } from './password.js';

const PAYLOAD_VERSION = 'v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveReplayAesKey(parentTokenHash, idempotencyKey) {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(env.REFRESH_REPLAY_KEY, 'utf8'),
      Buffer.from(String(parentTokenHash), 'utf8'),
      Buffer.from(String(idempotencyKey), 'utf8'),
      32
    )
  );
}

function buildReplayAad({ idUsuario, familiaId, parentTokenHash, idempotencyKey }) {
  return Buffer.from(
    `${idUsuario}|${familiaId}|${parentTokenHash}|${sha256Hex(idempotencyKey)}`,
    'utf8'
  );
}

/**
 * Cifra el token hijo T2 con AES-256-GCM + HKDF-SHA256 ligado a (idUsuario, familiaId, parentTokenHash, idempotencyKey).
 */
export function encryptReplayToken({ childToken, idUsuario, familiaId, parentTokenHash, idempotencyKey }) {
  const key = deriveReplayAesKey(parentTokenHash, idempotencyKey);
  const aad = buildReplayAad({ idUsuario, familiaId, parentTokenHash, idempotencyKey });
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(String(childToken), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    PAYLOAD_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/**
 * Descifra y verifica el token hijo T2 cifrado con encryptReplayToken. Lanza error si falla autenticación AEAD.
 */
export function decryptReplayToken({ encryptedPayload, idUsuario, familiaId, parentTokenHash, idempotencyKey }) {
  if (typeof encryptedPayload !== 'string' || !encryptedPayload) {
    throw new Error('Carga cifrada de replay vacía.');
  }
  const parts = encryptedPayload.split(':');
  if (parts.length !== 4 || parts[0] !== PAYLOAD_VERSION) {
    throw new Error('Formato de carga cifrada de replay inválido.');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const authTag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
    throw new Error('Longitudes AEAD de replay inválidas.');
  }

  const key = deriveReplayAesKey(parentTokenHash, idempotencyKey);
  const aad = buildReplayAad({ idUsuario, familiaId, parentTokenHash, idempotencyKey });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
