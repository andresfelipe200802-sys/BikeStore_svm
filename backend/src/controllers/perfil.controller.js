import * as perfilService from '../services/perfil.service.js';

export async function getPerfil(req, res, next) {
  try {
    const datos = await perfilService.obtenerPerfil(req.usuario.id_usuario);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function putPerfil(req, res, next) {
  try {
    const datos = await perfilService.actualizarPerfil(req.usuario.id_usuario, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchContrasena(req, res, next) {
  try {
    const datos = await perfilService.cambiarContrasena(req.usuario.id_usuario, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
