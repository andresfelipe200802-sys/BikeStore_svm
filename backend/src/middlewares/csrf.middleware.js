import env from '../config/env.js';
import { getRefreshCookie } from '../utils/cookies.js';
import { AppError } from './error.middleware.js';

function assertCsrfOriginAndHeader(req) {
  const origin = req.get('Origin')?.trim() || '';
  const requestedWith = req.get('X-Requested-With');
  if (!origin || !env.CORS_ORIGINS.includes(origin) || requestedWith !== 'BikeStore') {
    throw new AppError(
      403,
      'CSRF_ORIGEN_INVALIDO',
      'Origen o cabecera de seguridad CSRF inválida para esta operación.'
    );
  }
}

export function csrfRefreshMiddleware(req, _res, next) {
  try {
    assertCsrfOriginAndHeader(req);
    return next();
  } catch (err) {
    return next(err);
  }
}

export function csrfLogoutMiddleware(req, _res, next) {
  try {
    if (getRefreshCookie(req) !== null) {
      assertCsrfOriginAndHeader(req);
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
