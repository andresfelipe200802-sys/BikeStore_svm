import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function getJwtExpiresInSeconds() {
  const raw = String(env.JWT_EXPIRES_IN || '15m').trim();
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return 900;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}

export function signAccessToken({ id_usuario, rol, token_version }) {
  return jwt.sign(
    {
      sub: id_usuario,
      rol,
      tv: token_version,
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.JWT_EXPIRES_IN,
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  });
}
