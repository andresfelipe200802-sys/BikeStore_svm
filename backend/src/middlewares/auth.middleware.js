import { query } from '../config/db.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './error.middleware.js';

export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'Se requiere un token de autenticación válido.');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'TOKEN_INVALIDO', 'Token inválido o expirado.');
    }

    const userId = Number(payload.sub);
    const tokenVersion = Number(payload.tv);
    if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'Estructura de token inválida.');
    }

    const { rows } = await query(
      `SELECT u.id_usuario, u.correo, u.estado_usuario, u.token_version, r.nombre AS rol
       FROM usuario u
       JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
       JOIN rol r ON r.id_rol = ur.id_rol
       WHERE u.id_usuario = $1`,
      [userId]
    );

    if (rows.length === 0) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'Usuario no encontrado.');
    }

    const user = rows[0];
    if (user.estado_usuario !== 'ACTIVO') {
      throw new AppError(403, 'USUARIO_INACTIVO', 'La cuenta se encuentra inactiva. Contacte al administrador.');
    }

    if (user.token_version !== tokenVersion || user.rol !== payload.rol) {
      throw new AppError(401, 'SESION_REVOCADA', 'La sesión ha sido revocada. Inicie sesión nuevamente.');
    }

    req.usuario = {
      id_usuario: user.id_usuario,
      correo: user.correo,
      rol: user.rol,
      token_version: user.token_version,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}
