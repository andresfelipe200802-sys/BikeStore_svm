import * as retractosService from '../services/retractos.service.js';

export async function solicitarRetracto(req, res, next) {
  try {
    const datos = await retractosService.solicitarRetracto(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function listarRetractos(req, res, next) {
  try {
    const { items, meta } = await retractosService.listarRetractosCliente(req.usuario.id_usuario, req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function obtenerRetracto(req, res, next) {
  try {
    const datos = await retractosService.obtenerRetractoCliente(req.usuario.id_usuario, req.validatedParams.id);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
