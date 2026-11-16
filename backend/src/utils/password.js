import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import env from '../config/env.js';

// Hash ficticio calculado una sola vez para igualar tiempos cuando el correo no existe en login
const DUMMY_HASH = bcrypt.hashSync('BikeStoreDummyPassword#2026', env.BCRYPT_ROUNDS);

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, env.BCRYPT_ROUNDS);
}

export async function comparePassword(plainPassword, storedHash) {
  return bcrypt.compare(plainPassword, storedHash);
}

export async function compareDummyPassword(plainPassword) {
  await bcrypt.compare(plainPassword, DUMMY_HASH);
  return false;
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function randomTokenHex(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}
