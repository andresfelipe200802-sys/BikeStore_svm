import { AppError } from './error.middleware.js';

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.usuario) {
      return next(new AppError(401, 'TOKEN_INVALIDO', 'Autenticación requerida.'));
    }
    if (!allowedRoles.includes(req.usuario.rol)) {
      return next(new AppError(403, 'ROL_NO_AUTORIZADO', 'No tiene permisos suficientes para acceder a este recurso.'));
    }
    return next();
  };
}
