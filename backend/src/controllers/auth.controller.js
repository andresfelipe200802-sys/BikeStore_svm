import * as authService from '../services/auth.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../utils/cookies.js';

function extractClientMeta(req) {
  const rawIp = typeof req.ip === 'string' ? req.ip.trim() : '';
  const ipOrigen = rawIp ? rawIp.slice(0, 64) : null;
  const rawUa = req.get('user-agent');
  const userAgent = typeof rawUa === 'string' && rawUa.trim() ? rawUa.trim().slice(0, 255) : null;
  return { ipOrigen, userAgent };
}

export async function registro(req, res, next) {
  try {
    const datos = await authService.registrarCliente(req.validatedBody);
    return res.status(201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { ipOrigen, userAgent } = extractClientMeta(req);
    const { refreshToken, ...datos } = await authService.iniciarSesion({
      ...req.validatedBody,
      ipOrigen,
      userAgent,
    });
    setRefreshCookie(res, refreshToken);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { ipOrigen, userAgent } = extractClientMeta(req);
    const refreshToken = getRefreshCookie(req);
    const idempotencyKey = req.get('Idempotency-Key');

    const result = await authService.refrescarSesion({
      refreshToken,
      idempotencyKey,
      ipOrigen,
      userAgent,
    });

    if (result.clearCookie) {
      clearRefreshCookie(res);
    }
    if (result.outcome === 'ERROR') {
      throw new AppError(result.status, result.codigo, result.mensaje);
    }

    setRefreshCookie(res, result.refreshToken);
    return res.status(200).json({
      ok: true,
      datos: {
        token: result.token,
        expires_in: result.expires_in,
        rotacion_uid: result.rotacion_uid,
        usuario: result.usuario,
        replayed: result.replayed,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const result = await authService.cerrarSesion({
      authorization: req.headers.authorization,
      refreshToken: getRefreshCookie(req),
    });
    if (result.clearCookie) {
      clearRefreshCookie(res);
    }
    if (result.error) {
      throw result.error;
    }
    return res.status(200).json({ ok: true, datos: result.datos });
  } catch (err) {
    return next(err);
  }
}

export async function recuperar(req, res, next) {
  try {
    const datos = await authService.solicitarRecuperacion(req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function restablecer(req, res, next) {
  try {
    const datos = await authService.restablecerContrasena(req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
