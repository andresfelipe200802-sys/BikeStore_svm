import * as pedidosService from '../services/pedidos.service.js';
import { requireUuidIdempotencyKey } from '../utils/idempotency.js';

export async function crearPedido(req, res, next) {
  try {
    const datos = await pedidosService.crearPedidoDesdeCarrito(req.usuario.id_usuario, req.validatedBody);
    return res.status(201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function listarPedidos(req, res, next) {
  try {
    const { items, meta } = await pedidosService.listarPedidosCliente(req.usuario.id_usuario, req.validatedQuery);
    return res.status(200).json({ ok: true, datos: items, meta });
  } catch (err) {
    return next(err);
  }
}

export async function obtenerPedido(req, res, next) {
  try {
    const datos = await pedidosService.obtenerDetallePedidoCliente(req.usuario.id_usuario, req.validatedParams.id);
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function pagarPedido(req, res, next) {
  try {
    const idemKey = req.get('Idempotency-Key')?.trim() || null;
    const datos = await pedidosService.ejecutarPagoSimulado(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody,
      idemKey
    );
    return res.status(datos.replayed ? 200 : 201).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function cancelarPedido(req, res, next) {
  try {
    const datos = await pedidosService.cancelarPedidoCliente(
      req.usuario.id_usuario,
      req.validatedParams.id,
      req.validatedBody
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}

export async function volverAlCarrito(req, res, next) {
  try {
    const idemKey = requireUuidIdempotencyKey(req.get('Idempotency-Key'));
    const datos = await pedidosService.volverPedidoAlCarrito(
      req.usuario.id_usuario,
      req.validatedParams.id,
      idemKey
    );
    return res.status(200).json({ ok: true, datos });
  } catch (err) {
    return next(err);
  }
}
