import jwt from 'jsonwebtoken';
import env from '../config/env.js';

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
