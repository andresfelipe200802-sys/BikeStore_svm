import * as carritoService from '../services/carrito.service.js';
import { requireUuidIdempotencyKey } from '../utils/idempotency.js';

export async function getCarrito(req, res, next) {
  try {
    const datos = await carritoService.obtenerCarrito(req.usuario.id_usuario);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function fusionarCarrito(req, res, next) {
  try {
    const idemKey = requireUuidIdempotencyKey(req.get('Idempotency-Key'));
    const datos = await carritoService.fusionarCarrito(req.usuario.id_usuario, req.validatedBody, idemKey);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function addItem(req, res, next) {
  try {
    const datos = await carritoService.agregarItemCarrito(req.usuario.id_usuario, req.validatedBody);
    return res.status(201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function updateItem(req, res, next) {
  try {
    const datos = await carritoService.actualizarCantidadItem(
      req.usuario.id_usuario,
      req.validatedParams.id_producto,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function deleteItem(req, res, next) {
  try {
    const datos = await carritoService.eliminarItemCarrito(
      req.usuario.id_usuario,
      req.validatedParams.id_producto
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
