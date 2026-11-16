import * as authService from '../services/auth.service.js';

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
    const datos = await authService.iniciarSesion(req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const datos = await authService.cerrarSesion(req.usuario.id_usuario);
    return res.status(200).json({ ok: true, datos });
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
