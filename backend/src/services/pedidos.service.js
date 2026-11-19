import { query, withTransaction } from '../config/db.js';
import { expirarPedidoSiVencido } from '../jobs/expiracionReservas.job.js';
import { AppError } from '../middlewares/error.middleware.js';
import { fromCents, multiplyCents, toCents } from '../utils/decimal.js';
import { containsSensitiveCardData } from '../utils/documento.js';
import { requireUuidIdempotencyKey } from '../utils/idempotency.js';
import { sha256Hex } from '../utils/password.js';
import {
  aplicarFusionEnCarritoBloqueado,
  bloquearDetalleCarritoMap,
  ensureCarritoActivoLocked,
  leerResumenCarrito,
} from './carrito.service.js';

async function expirarPendienteVencidoPreTx(idUsuario) {
  await withTransaction(async (client) => {
    await client.query(`SELECT id_usuario FROM usuario WHERE id_usuario = $1 FOR UPDATE`, [idUsuario]);
    const pendRes = await client.query(
      `SELECT id_pedido, fecha_expiracion, (fecha_expiracion <= CURRENT_TIMESTAMP) AS vencido_db
       FROM pedido
       WHERE id_usuario = $1 AND estado_pedido = 'PENDIENTE'
       FOR UPDATE`,
      [idUsuario]
    );
    if (pendRes.rows.length > 0) {
      const pend = pendRes.rows[0];
      if (pend.vencido_db || new Date(pend.fecha_expiracion).getTime() <= Date.now()) {
        await expirarPedidoSiVencido(client, pend.id_pedido);
      }
    }
  });
}

export async function crearPedidoDesdeCarrito(idUsuario, { direccion_envio }) {
  // Pre-transacción para expirar pedido PENDIENTE vencido y evitar rollback en 409 o bloqueo cruzado de productos
  await expirarPendienteVencidoPreTx(idUsuario);

  let outcome;
  for (let pass = 0; pass < 2; pass += 1) {
    outcome = await withTransaction(async (client) => {
      await client.query(`SELECT id_usuario FROM usuario WHERE id_usuario = $1 FOR UPDATE`, [idUsuario]);

      // 1. Bloquear carrito ACTIVO del cliente y su detalle
      const cartRes = await client.query(
        `SELECT id_carrito FROM carrito WHERE id_usuario = $1 AND estado = 'ACTIVO' FOR UPDATE`,
        [idUsuario]
      );
      if (cartRes.rows.length === 0) {
        throw new AppError(400, 'VALIDACION_INVALIDA', 'No tienes productos en tu carrito activo.');
      }
      const idCarrito = cartRes.rows[0].id_carrito;

      const itemsRes = await client.query(
        `SELECT id_detalle_carrito, id_producto, cantidad, precio_unidad
         FROM detalle_carrito
         WHERE id_carrito = $1
         ORDER BY id_producto ASC
         FOR UPDATE`,
        [idCarrito]
      );
      if (itemsRes.rows.length === 0) {
        throw new AppError(400, 'VALIDACION_INVALIDA', 'El carrito está vacío.');
      }

      // 2. Verificar que no haya pedido PENDIENTE vigente (si venció en el instante previo, reintentar pre-tx)
      const pendRes = await client.query(
        `SELECT id_pedido, fecha_expiracion, (fecha_expiracion <= CURRENT_TIMESTAMP) AS vencido_db
         FROM pedido
         WHERE id_usuario = $1 AND estado_pedido = 'PENDIENTE'
         FOR UPDATE`,
        [idUsuario]
      );
      if (pendRes.rows.length > 0) {
        const pend = pendRes.rows[0];
        if (pend.vencido_db || new Date(pend.fecha_expiracion).getTime() <= Date.now()) {
          return { needsPreExpire: true };
        }
        throw new AppError(
          409,
          'PEDIDO_PENDIENTE_ACTIVO',
          `Ya tienes un pedido pendiente (#${pend.id_pedido}). Paga o cancélalo antes de crear uno nuevo.`
        );
      }

      // 3. Bloquear productos en orden ascendente por id_producto (jerarquía fija, FOR NO KEY UPDATE OF p)
      const productIds = itemsRes.rows.map((i) => i.id_producto);
      const prodRes = await client.query(
        `SELECT p.id_producto, p.nombre, p.precio, p.existencias, p.estado AS prod_estado, c.estado AS cat_estado
         FROM producto p
         JOIN categoria c ON c.id_categoria = p.id_categoria
         WHERE p.id_producto = ANY($1::INTEGER[])
         ORDER BY p.id_producto ASC
         FOR NO KEY UPDATE OF p`,
        [productIds]
      );
      const prodMap = new Map(prodRes.rows.map((p) => [p.id_producto, p]));

      // 4. Validar disponibilidad y detectar cambios de precio antes de descontar stock
      let priceChanged = false;
      for (const item of itemsRes.rows) {
        const prod = prodMap.get(item.id_producto);
        if (!prod || !prod.prod_estado || !prod.cat_estado) {
          throw new AppError(
            409,
            'STOCK_INSUFICIENTE',
            `El producto #${item.id_producto} o su categoría ya no se encuentran activos.`
          );
        }
        if (toCents(item.precio_unidad) !== toCents(prod.precio)) {
          priceChanged = true;
          await client.query(
            `UPDATE detalle_carrito SET precio_unidad = $2 WHERE id_detalle_carrito = $1`,
            [item.id_detalle_carrito, prod.precio]
          );
        }
      }

      if (priceChanged) {
        await client.query(`UPDATE carrito SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_carrito = $1`, [idCarrito]);
        const carritoActualizado = await leerResumenCarrito(client, idCarrito);
        return { priceUpdated: true, carrito: carritoActualizado };
      }

      let totalCents = 0;
      for (const item of itemsRes.rows) {
        const prod = prodMap.get(item.id_producto);
        if (prod.existencias < item.cantidad) {
          throw new AppError(
            409,
            'STOCK_INSUFICIENTE',
            `Existencias insuficientes para '${prod.nombre}'. Disponibles: ${prod.existencias}.`
          );
        }
        totalCents += multiplyCents(prod.precio, item.cantidad);
      }

      // 5. Descontar inventario en orden ascendente y crear pedido + detalle
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE producto SET existencias = existencias - $2 WHERE id_producto = $1`,
          [item.id_producto, item.cantidad]
        );
      }

      const pedIns = await client.query(
        `INSERT INTO pedido (id_usuario, direccion_envio, total, estado_pedido, fecha_expiracion)
         VALUES ($1, $2, $3, 'PENDIENTE', CURRENT_TIMESTAMP + INTERVAL '15 minutes')
         RETURNING id_pedido, id_usuario, direccion_envio, total, estado_pedido, fecha_pedido, fecha_expiracion`,
        [idUsuario, direccion_envio.trim(), fromCents(totalCents)]
      );
      const pedido = pedIns.rows[0];

      const detalles = [];
      for (const item of itemsRes.rows) {
        const prod = prodMap.get(item.id_producto);
        const detIns = await client.query(
          `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario)
           VALUES ($1, $2, $3, $4)
           RETURNING id_detalle_pedido, id_producto, cantidad, precio_unitario`,
          [pedido.id_pedido, item.id_producto, item.cantidad, prod.precio]
        );
        detalles.push({ ...detIns.rows[0], nombre: prod.nombre });
      }

      await client.query(
        `UPDATE carrito SET estado = 'CONVERTIDO', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_carrito = $1`,
        [idCarrito]
      );

      return { priceUpdated: false, pedido: { ...pedido, detalles } };
    });

    if (outcome.needsPreExpire && pass === 0) {
      await expirarPendienteVencidoPreTx(idUsuario);
      continue;
    }
    break;
  }

  if (outcome.needsPreExpire) {
    throw new AppError(409, 'PEDIDO_PENDIENTE_ACTIVO', 'Tienes un pedido pendiente en proceso de expiración. Intenta nuevamente.');
  }

  if (outcome.priceUpdated) {
    throw new AppError(
      409,
      'PRECIO_ACTUALIZADO',
      'El precio de uno o más productos varió desde que los agregaste al carrito. Revisa los nuevos valores y confirma nuevamente.',
      { carrito: outcome.carrito }
    );
  }

  return outcome.pedido;
}

export async function listarPedidosCliente(idUsuario, { page, limit }) {
  const countRes = await query(`SELECT COUNT(*)::INTEGER AS total FROM pedido WHERE id_usuario = $1`, [idUsuario]);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT id_pedido, direccion_envio, total, estado_pedido, fecha_pedido, fecha_expiracion,
            fecha_envio, fecha_entrega, fecha_cancelacion, estado_reembolso_cancelacion
     FROM pedido
     WHERE id_usuario = $1
     ORDER BY fecha_pedido DESC, id_pedido DESC
     LIMIT $2 OFFSET $3`,
    [idUsuario, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit, total, total_paginas: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function obtenerDetallePedidoCliente(idUsuario, idPedido) {
  const pedRes = await query(
    `SELECT id_pedido, id_usuario, direccion_envio, total, estado_pedido, fecha_pedido, fecha_expiracion,
            fecha_envio, fecha_entrega, fecha_cancelacion, motivo_cancelacion,
            estado_reembolso_cancelacion, datos_reembolso_cancelacion,
            fecha_limite_reembolso_cancelacion, fecha_reembolso_cancelacion
     FROM pedido
     WHERE id_pedido = $1 AND id_usuario = $2`,
    [idPedido, idUsuario]
  );
  if (pedRes.rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
  }

  const detallesRes = await query(
    `SELECT dp.id_detalle_pedido, dp.id_producto, p.nombre, p.imagen_url, dp.cantidad, dp.precio_unitario
     FROM detalle_pedido dp
     JOIN producto p ON p.id_producto = dp.id_producto
     WHERE dp.id_pedido = $1
     ORDER BY dp.id_detalle_pedido ASC`,
    [idPedido]
  );

  const pagosRes = await query(
    `SELECT id_pago, metodo_pago, referencia_simulada, numero_intento, monto, estado_pago, motivo_resultado, fecha_pago
     FROM pago
     WHERE id_pedido = $1
     ORDER BY numero_intento ASC`,
    [idPedido]
  );

  const retractosRes = await query(
    `SELECT id_retracto, tipo_retracto, estado_retracto, estado_reembolso, monto_reembolso, fecha_solicitud
     FROM retracto
     WHERE id_pedido = $1
     ORDER BY fecha_solicitud DESC`,
    [idPedido]
  );

  return {
    ...pedRes.rows[0],
    detalles: detallesRes.rows,
    pagos: pagosRes.rows,
    retractos: retractosRes.rows,
  };
}

export async function ejecutarPagoSimulado(idUsuario, idPedido, payload, idempotencyKey) {
  const refNorm = payload.referencia_simulada.trim();
  const payloadHash = sha256Hex(JSON.stringify({ metodo_pago: payload.metodo_pago, referencia_simulada: refNorm }));

  const result = await withTransaction(async (client) => {
    // 1. Bloquear pedido primero (evita condición de carrera 23505 en Idempotency-Key)
    const pedRes = await client.query(
      `SELECT id_pedido, id_usuario, total, estado_pedido, fecha_expiracion,
              (fecha_expiracion <= CURRENT_TIMESTAMP) AS vencido_db
       FROM pedido
       WHERE id_pedido = $1 AND id_usuario = $2
       FOR UPDATE`,
      [idPedido, idUsuario]
    );
    if (pedRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
    }
    const pedido = pedRes.rows[0];

    // 2. Verificar idempotencia antes de evaluar estado/intento
    if (idempotencyKey) {
      const idemRes = await client.query(
        `SELECT id_pago, metodo_pago, referencia_simulada, numero_intento, monto, estado_pago, payload_hash, motivo_resultado, fecha_pago
         FROM pago
         WHERE id_pedido = $1 AND clave_idempotencia = $2`,
        [idPedido, idempotencyKey]
      );
      if (idemRes.rows.length > 0) {
        const prev = idemRes.rows[0];
        if (prev.payload_hash !== payloadHash) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'La cabecera Idempotency-Key fue reutilizada con datos diferentes.');
        }
        return {
          replayed: true,
          expired: false,
          pago: prev,
          estado_pedido: pedido.estado_pedido,
        };
      }
    }

    // 3. Validar estado vigente y expiración
    if (pedido.estado_pedido === 'PAGADO' || pedido.estado_pedido === 'ENVIADO' || pedido.estado_pedido === 'ENTREGADO') {
      throw new AppError(409, 'PEDIDO_YA_PAGADO', 'El pedido ya cuenta con un pago aprobado.');
    }
    if (pedido.estado_pedido === 'CANCELADO') {
      throw new AppError(409, 'RESERVA_EXPIRADA', 'El pedido se encuentra cancelado o su reserva ya expiró.');
    }

    if (pedido.vencido_db || new Date(pedido.fecha_expiracion).getTime() <= Date.now()) {
      await expirarPedidoSiVencido(client, idPedido);
      return { expired: true };
    }

    const paidRes = await client.query(
      `SELECT 1 FROM pago WHERE id_pedido = $1 AND estado_pago IN ('APROBADO', 'REEMBOLSADO')`,
      [idPedido]
    );
    if (paidRes.rows.length > 0) {
      throw new AppError(409, 'PEDIDO_YA_PAGADO', 'El pedido ya tiene un pago aprobado.');
    }

    // 4. Determinación estrictamente en backend del simulador síncrono
    const aprobado = !refNorm.endsWith('00');
    const estadoPago = aprobado ? 'APROBADO' : 'RECHAZADO';
    const motivoResultado = aprobado
      ? 'Pago simulado aprobado en transacción síncrona'
      : 'Pago simulado rechazado (referencia terminada en 00)';

    const attemptRes = await client.query(
      `SELECT COALESCE(MAX(numero_intento), 0)::INTEGER + 1 AS next_attempt FROM pago WHERE id_pedido = $1`,
      [idPedido]
    );
    const numeroIntento = attemptRes.rows[0].next_attempt;

    const pagoIns = await client.query(
      `INSERT INTO pago (
         id_pedido, metodo_pago, referencia_simulada, numero_intento, monto,
         estado_pago, clave_idempotencia, payload_hash, motivo_resultado
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id_pago, id_pedido, metodo_pago, referencia_simulada, numero_intento, monto, estado_pago, motivo_resultado, fecha_pago`,
      [idPedido, payload.metodo_pago, refNorm, numeroIntento, pedido.total, estadoPago, idempotencyKey, payloadHash, motivoResultado]
    );

    if (aprobado) {
      await client.query(`UPDATE pedido SET estado_pedido = 'PAGADO' WHERE id_pedido = $1`, [idPedido]);
    }

    return {
      replayed: false,
      expired: false,
      pago: pagoIns.rows[0],
      estado_pedido: aprobado ? 'PAGADO' : 'PENDIENTE',
    };
  });

  if (result.expired) {
    throw new AppError(409, 'RESERVA_EXPIRADA', 'La reserva de 15 minutos expiró; el pedido fue cancelado y el inventario liberado.');
  }

  return {
    pago: result.pago,
    estado_pedido: result.estado_pedido,
    replayed: result.replayed,
  };
}

export async function cancelarPedidoCliente(idUsuario, idPedido, { motivo_cancelacion, datos_reembolso }) {
  if (datos_reembolso && containsSensitiveCardData(datos_reembolso)) {
    throw new AppError(400, 'VALIDACION_INVALIDA', 'No incluyas números completos de tarjeta ni CVV en los datos de reembolso.');
  }

  return withTransaction(async (client) => {
    const pedRes = await client.query(
      `SELECT id_pedido, id_usuario, total, estado_pedido
       FROM pedido
       WHERE id_pedido = $1 AND id_usuario = $2
       FOR UPDATE`,
      [idPedido, idUsuario]
    );
    if (pedRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
    }

    const pedido = pedRes.rows[0];
    if (pedido.estado_pedido !== 'PENDIENTE' && pedido.estado_pedido !== 'PAGADO') {
      throw new AppError(
        409,
        'TRANSICION_ESTADO_INVALIDA',
        `No es posible cancelar un pedido en estado ${pedido.estado_pedido}.`
      );
    }

    const wasPaid = pedido.estado_pedido === 'PAGADO';
    if (wasPaid && (!datos_reembolso || datos_reembolso.trim().length < 5)) {
      throw new AppError(400, 'VALIDACION_INVALIDA', 'Debes indicar datos de reembolso válidos para cancelar un pedido pagado.');
    }

    const detRes = await client.query(
      `SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = $1 ORDER BY id_producto ASC FOR UPDATE`,
      [idPedido]
    );
    const prodIds = detRes.rows.map((d) => d.id_producto);
    if (prodIds.length > 0) {
      await client.query(
        `SELECT id_producto FROM producto WHERE id_producto = ANY($1::INTEGER[]) ORDER BY id_producto ASC FOR NO KEY UPDATE`,
        [prodIds]
      );
      for (const item of detRes.rows) {
        await client.query(`UPDATE producto SET existencias = existencias + $2 WHERE id_producto = $1`, [
          item.id_producto,
          item.cantidad,
        ]);
      }
    }

    const upd = await client.query(
      `UPDATE pedido
       SET estado_pedido = 'CANCELADO',
           fecha_cancelacion = CURRENT_TIMESTAMP,
           motivo_cancelacion = $2,
           cancelado_por = $3,
           estado_reembolso_cancelacion = $4::varchar,
           datos_reembolso_cancelacion = $5,
           fecha_limite_reembolso_cancelacion = CASE WHEN $4::varchar = 'PENDIENTE_REEMBOLSO' THEN CURRENT_TIMESTAMP + INTERVAL '15 days' ELSE NULL END
       WHERE id_pedido = $1
       RETURNING id_pedido, estado_pedido, fecha_cancelacion, motivo_cancelacion, estado_reembolso_cancelacion, fecha_limite_reembolso_cancelacion`,
      [
        idPedido,
        motivo_cancelacion ? motivo_cancelacion.trim() : null,
        idUsuario,
        wasPaid ? 'PENDIENTE_REEMBOLSO' : 'NO_APLICA',
        wasPaid ? datos_reembolso.trim() : null,
      ]
    );

    return upd.rows[0];
  });
}

export async function volverPedidoAlCarrito(idUsuario, idPedido, idempotencyKey) {
  const normalizedKey = requireUuidIdempotencyKey(idempotencyKey);

  // Fase A (tx1): usuario FOR UPDATE -> pedido FOR UPDATE
  // Valida existencia, conflictos de clave, replay exacto sin tocar carrito, o expiración perezosa con COMMIT.
  const phaseA = await withTransaction(async (client) => {
    await client.query(`SELECT id_usuario FROM usuario WHERE id_usuario = $1 FOR UPDATE`, [idUsuario]);

    const pedRes = await client.query(
      `SELECT id_pedido, estado_pedido, fecha_expiracion, fecha_cancelacion,
              clave_idempotencia_carrito, resultado_devolucion_carrito,
              (fecha_expiracion <= CURRENT_TIMESTAMP) AS vencido_db
       FROM pedido
       WHERE id_usuario = $1
         AND (id_pedido = $2 OR clave_idempotencia_carrito = $3)
       ORDER BY id_pedido ASC
       FOR UPDATE`,
      [idUsuario, idPedido, normalizedKey]
    );

    const target = pedRes.rows.find((r) => r.id_pedido === idPedido) || null;
    const conflictOrder =
      pedRes.rows.find((r) => r.id_pedido !== idPedido && r.clave_idempotencia_carrito === normalizedKey) || null;

    if (!target) {
      return { action: 'ERROR', status: 404, codigo: 'RECURSO_NO_ENCONTRADO', mensaje: 'Pedido no encontrado.' };
    }
    if (conflictOrder) {
      return {
        action: 'ERROR',
        status: 409,
        codigo: 'IDEMPOTENCY_CONFLICT',
        mensaje: 'La clave de idempotencia fue usada para otro pedido.',
      };
    }
    if (target.clave_idempotencia_carrito === normalizedKey) {
      return {
        action: 'REPLAY',
        resultado: { ...target.resultado_devolucion_carrito, replayed: true },
      };
    }
    if (target.clave_idempotencia_carrito !== null) {
      return {
        action: 'ERROR',
        status: 409,
        codigo: 'TRANSICION_ESTADO_INVALIDA',
        mensaje: 'Este pedido ya fue devuelto al carrito anteriormente.',
      };
    }

    let estadoActual = target.estado_pedido;
    if (
      estadoActual === 'PENDIENTE' &&
      (target.vencido_db || new Date(target.fecha_expiracion).getTime() <= Date.now())
    ) {
      const expiro = await expirarPedidoSiVencido(client, idPedido);
      if (expiro) {
        estadoActual = 'CANCELADO';
      }
    }

    if (estadoActual !== 'CANCELADO') {
      return {
        action: 'ERROR',
        status: 409,
        codigo: 'TRANSICION_ESTADO_INVALIDA',
        mensaje: 'Solo puedes volver al carrito pedidos en estado CANCELADO.',
      };
    }

    return { action: 'MERGE' };
  });

  if (phaseA.action === 'REPLAY') {
    return phaseA.resultado;
  }
  if (phaseA.action === 'ERROR') {
    throw new AppError(phaseA.status, phaseA.codigo, phaseA.mensaje);
  }

  // Fase B (tx2): usuario -> carrito -> detalle_carrito ASC -> pedido -> detalle_pedido ASC -> producto ASC FOR NO KEY UPDATE OF p
  return withTransaction(async (client) => {
    await client.query(`SELECT id_usuario FROM usuario WHERE id_usuario = $1 FOR UPDATE`, [idUsuario]);
    const idCarrito = await ensureCarritoActivoLocked(client, idUsuario);
    const existingMap = await bloquearDetalleCarritoMap(client, idCarrito);

    const pedRes = await client.query(
      `SELECT id_pedido, estado_pedido, fecha_cancelacion,
              clave_idempotencia_carrito, resultado_devolucion_carrito
       FROM pedido
       WHERE id_usuario = $1
         AND (id_pedido = $2 OR clave_idempotencia_carrito = $3)
       ORDER BY id_pedido ASC
       FOR UPDATE`,
      [idUsuario, idPedido, normalizedKey]
    );

    const target = pedRes.rows.find((r) => r.id_pedido === idPedido) || null;
    const conflictOrder =
      pedRes.rows.find((r) => r.id_pedido !== idPedido && r.clave_idempotencia_carrito === normalizedKey) || null;

    if (!target) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
    }
    if (conflictOrder) {
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia fue usada para otro pedido.');
    }
    if (target.clave_idempotencia_carrito === normalizedKey) {
      return { ...target.resultado_devolucion_carrito, replayed: true };
    }
    if (target.clave_idempotencia_carrito !== null) {
      throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', 'Este pedido ya fue devuelto al carrito anteriormente.');
    }
    if (target.estado_pedido !== 'CANCELADO' || target.fecha_cancelacion === null) {
      throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', 'Solo puedes volver al carrito pedidos en estado CANCELADO.');
    }

    const detRes = await client.query(
      `SELECT id_producto, cantidad
       FROM detalle_pedido
       WHERE id_pedido = $1
       ORDER BY id_producto ASC
       FOR UPDATE`,
      [idPedido]
    );

    const resultado = await aplicarFusionEnCarritoBloqueado(client, idCarrito, existingMap, detRes.rows);

    await client.query(
      `UPDATE pedido
       SET clave_idempotencia_carrito = $2,
           fecha_devolucion_carrito = CURRENT_TIMESTAMP,
           resultado_devolucion_carrito = $3::jsonb
       WHERE id_pedido = $1`,
      [idPedido, normalizedKey, JSON.stringify(resultado)]
    );

    return { ...resultado, replayed: false };
  });
}
