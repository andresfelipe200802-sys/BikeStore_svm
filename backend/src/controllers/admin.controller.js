import * as adminService from '../services/admin.service.js';

export async function getCategorias(_req, res, next) {
  try {
    const datos = await adminService.listarCategoriasAdmin();
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function postCategoria(req, res, next) {
  try {
    const datos = await adminService.crearCategoria(req.validatedBody);
    return res.status(201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function putCategoria(req, res, next) {
  try {
    const datos = await adminService.actualizarCategoria(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchEstadoCategoria(req, res, next) {
  try {
    const datos = await adminService.cambiarEstadoCategoria(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function deleteCategoria(req, res, next) {
  try {
    const datos = await adminService.eliminarCategoria(req.validatedParams.id);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getProductos(req, res, next) {
  try {
    const { items, meta } = await adminService.listarProductosAdmin(req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function postProducto(req, res, next) {
  try {
    const datos = await adminService.crearProducto(req.validatedBody);
    return res.status(201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function putProducto(req, res, next) {
  try {
    const datos = await adminService.actualizarProducto(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchEstadoProducto(req, res, next) {
  try {
    const datos = await adminService.cambiarEstadoProducto(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchExistenciasProducto(req, res, next) {
  try {
    const datos = await adminService.ajustarExistenciasProducto(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getUsuarios(req, res, next) {
  try {
    const { items, meta } = await adminService.listarUsuariosAdmin(req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function patchEstadoUsuario(req, res, next) {
  try {
    const datos = await adminService.cambiarEstadoUsuario(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchRolUsuario(req, res, next) {
  try {
    const datos = await adminService.cambiarRolUsuario(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getPedidos(req, res, next) {
  try {
    const { items, meta } = await adminService.listarPedidosAdmin(req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function patchEstadoPedido(req, res, next) {
  try {
    const datos = await adminService.cambiarEstadoPedidoAdmin(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchReembolsoPedido(req, res, next) {
  try {
    const datos = await adminService.confirmarReembolsoCancelacionPedido(req.validatedParams.id, req.validatedBody);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getRetractos(req, res, next) {
  try {
    const { items, meta } = await adminService.listarRetractosAdmin(req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function getRetracto(req, res, next) {
  try {
    const datos = await adminService.obtenerRetractoAdmin(req.validatedParams.id);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchDecisionRetracto(req, res, next) {
  try {
    const datos = await adminService.decidirRetractoAdmin(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchRecepcionRetracto(req, res, next) {
  try {
    const datos = await adminService.registrarRecepcionRetractoAdmin(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function patchReembolsoRetracto(req, res, next) {
  try {
    const datos = await adminService.confirmarReembolsoRetractoAdmin(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getResumenReportes(req, res, next) {
  try {
    const datos = await adminService.obtenerResumenReportes(req.validatedQuery);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getReporteVentas(req, res, next) {
  try {
    const datos = await adminService.obtenerReporteVentas(req.validatedQuery);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
