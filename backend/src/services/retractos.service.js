import { query, withTransaction } from '../config/db.js';
import { AppError } from '../middlewares/error.middleware.js';
import { fromCents, multiplyCents } from '../utils/decimal.js';
import { containsSensitiveCardData } from '../utils/documento.js';
import { calcularFechaLimiteRetractoBogota, obtenerVentanaFestivosRetracto } from '../utils/festivos.js';

export async function solicitarRetracto(idUsuario, idPedido, { motivo, datos_reembolso, items }) {
  if (containsSensitiveCardData(datos_reembolso)) {
    throw new AppError(400, 'VALIDACION_INVALIDA', 'No incluyas números completos de tarjeta ni CVV en datos_reembolso.');
  }

  return withTransaction(async (client) => {
    // 1. Bloquear pedido del cliente y confirmar estado ENTREGADO
    const pedRes = await client.query(
      `SELECT id_pedido, id_usuario, total, estado_pedido, fecha_entrega
       FROM pedido
       WHERE id_pedido = $1 AND id_usuario = $2
       FOR UPDATE`,
      [idPedido, idUsuario]
    );
    if (pedRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
    }
    const pedido = pedRes.rows[0];
    if (pedido.estado_pedido !== 'ENTREGADO' || !pedido.fecha_entrega) {
      throw new AppError(
        409,
        'TRANSICION_ESTADO_INVALIDA',
        'El derecho de retracto legal aplica únicamente sobre pedidos en estado ENTREGADO.'
      );
    }

    // 2. Validar cobertura festivos y plazo de 5 días hábiles en America/Bogota
    const holidaySet = await obtenerVentanaFestivosRetracto(client, pedido.fecha_entrega);
    const fechaLimitePlazo = calcularFechaLimiteRetractoBogota(pedido.fecha_entrega, holidaySet, 5);
    if (Date.now() >= fechaLimitePlazo.getTime()) {
      throw new AppError(
        409,
        'PLAZO_RETRACTO_VENCIDO',
        'El plazo legal de 5 días hábiles para ejercer el derecho de retracto ha vencido.'
      );
    }

    // 3. Bloquear detalle_pedido del pedido en orden ascendente de id_producto y validar saldo no reclamado / no dañado
    const detRes = await client.query(
      `SELECT id_detalle_pedido, id_producto, cantidad, precio_unitario
       FROM detalle_pedido
       WHERE id_pedido = $1
       ORDER BY id_producto ASC
       FOR UPDATE`,
      [idPedido]
    );
    const detMap = new Map(detRes.rows.map((d) => [d.id_detalle_pedido, d]));

    // Unidades ya comprometidas en retractos activos/completados o rechazadas tras inspección física por daño
    const usedRes = await client.query(
      `SELECT dr.id_detalle_pedido, COALESCE(SUM(dr.cantidad_devuelta), 0)::INTEGER AS comprometidas
       FROM detalle_retracto dr
       JOIN retracto r ON r.id_retracto = dr.id_retracto
       WHERE r.id_pedido = $1
         AND (r.estado_retracto <> 'RECHAZADO' OR r.fecha_recepcion_fisica IS NOT NULL)
       GROUP BY dr.id_detalle_pedido`,
      [idPedido]
    );
    const usedMap = new Map(usedRes.rows.map((u) => [u.id_detalle_pedido, u.comprometidas]));

    const seenDetalleIds = new Set();
    let montoInicialCents = 0;
    const preparedLines = [];

    for (const reqItem of items) {
      if (seenDetalleIds.has(reqItem.id_detalle_pedido)) {
        throw new AppError(400, 'VALIDACION_INVALIDA', 'No repitas la misma línea detalle_pedido en una solicitud.');
      }
      seenDetalleIds.add(reqItem.id_detalle_pedido);

      const det = detMap.get(reqItem.id_detalle_pedido);
      if (!det) {
        throw new AppError(404, 'RECURSO_NO_ENCONTRADO', `La línea de pedido #${reqItem.id_detalle_pedido} no pertenece a este pedido.`);
      }

      const yaComprometido = usedMap.get(det.id_detalle_pedido) || 0;
      const disponible = det.cantidad - yaComprometido;
      if (reqItem.cantidad > disponible) {
        throw new AppError(
          409,
          'CANTIDAD_RETRACTO_EXCEDIDA',
          `La cantidad solicitada (${reqItem.cantidad}) excede el saldo disponible (${Math.max(0, disponible)}) para el producto.`
        );
      }

      const subtotalCents = multiplyCents(det.precio_unitario, reqItem.cantidad);
      montoInicialCents += subtotalCents;
      preparedLines.push({
        id_detalle_pedido: det.id_detalle_pedido,
        cantidad_devuelta: reqItem.cantidad,
        subtotal_reembolso: fromCents(subtotalCents),
      });
    }

    // Determinar tipo_retracto (TOTAL si cubre el 100 % del pedido sin solicitudes previas comprometidas)
    const totalOrderUnits = detRes.rows.reduce((acc, d) => acc + d.cantidad, 0);
    const totalPrevCommitted = [...usedMap.values()].reduce((acc, n) => acc + n, 0);
    const totalNowRequested = preparedLines.reduce((acc, l) => acc + l.cantidad_devuelta, 0);
    const tipoRetracto = totalPrevCommitted === 0 && totalNowRequested === totalOrderUnits ? 'TOTAL' : 'PARCIAL';

    const retIns = await client.query(
      `INSERT INTO retracto (
         id_pedido, id_usuario, tipo_retracto, motivo, datos_reembolso,
         estado_retracto, estado_reembolso, monto_reembolso, fecha_limite_reembolso
       ) VALUES ($1, $2, $3, $4, $5, 'SOLICITADO', 'PENDIENTE_REEMBOLSO', $6, CURRENT_TIMESTAMP + INTERVAL '15 days')
       RETURNING id_retracto, id_pedido, tipo_retracto, estado_retracto, estado_reembolso, monto_reembolso, fecha_solicitud, fecha_limite_reembolso`,
      [idPedido, idUsuario, tipoRetracto, motivo.trim(), datos_reembolso.trim(), fromCents(montoInicialCents)]
    );
    const retracto = retIns.rows[0];

    const detalles = [];
    for (const line of preparedLines) {
      const drIns = await client.query(
        `INSERT INTO detalle_retracto (id_retracto, id_detalle_pedido, cantidad_devuelta, subtotal_reembolso)
         VALUES ($1, $2, $3, $4)
         RETURNING id_detalle_retracto, id_detalle_pedido, cantidad_devuelta, cantidad_buen_estado, cantidad_danada, subtotal_reembolso, estado_inspeccion`,
        [retracto.id_retracto, line.id_detalle_pedido, line.cantidad_devuelta, line.subtotal_reembolso]
      );
      detalles.push(drIns.rows[0]);
    }

    return { ...retracto, detalles };
  });
}

export async function listarRetractosCliente(idUsuario, { page, limit }) {
  const countRes = await query(`SELECT COUNT(*)::INTEGER AS total FROM retracto WHERE id_usuario = $1`, [idUsuario]);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT id_retracto, id_pedido, tipo_retracto, estado_retracto, estado_reembolso,
            monto_reembolso, fecha_solicitud, fecha_limite_reembolso, fecha_recepcion_fisica, fecha_reembolso
     FROM retracto
     WHERE id_usuario = $1
     ORDER BY fecha_solicitud DESC, id_retracto DESC
     LIMIT $2 OFFSET $3`,
    [idUsuario, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit, total, total_paginas: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function obtenerRetractoCliente(idUsuario, idRetracto) {
  const { rows } = await query(
    `SELECT * FROM retracto WHERE id_retracto = $1 AND id_usuario = $2`,
    [idRetracto, idUsuario]
  );
  if (rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Solicitud de retracto no encontrada.');
  }

  const detallesRes = await query(
    `SELECT dr.*, dp.id_producto, p.nombre AS producto_nombre, dp.precio_unitario
     FROM detalle_retracto dr
     JOIN detalle_pedido dp ON dp.id_detalle_pedido = dr.id_detalle_pedido
     JOIN producto p ON p.id_producto = dp.id_producto
     WHERE dr.id_retracto = $1
     ORDER BY dr.id_detalle_retracto ASC`,
    [idRetracto]
  );

  return { ...rows[0], detalles: detallesRes.rows };
}
