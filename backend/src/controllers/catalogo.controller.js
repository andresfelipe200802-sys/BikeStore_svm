import * as catalogoService from '../services/catalogo.service.js';

export async function getCategorias(_req, res, next) {
  try {
    const datos = await catalogoService.listarCategoriasPublicas();
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function getProductos(req, res, next) {
  try {
    const { items, meta } = await catalogoService.listarProductosPublicos(req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function getProductoPorId(req, res, next) {
  try {
    const datos = await catalogoService.obtenerProductoPublico(req.validatedParams.id);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
