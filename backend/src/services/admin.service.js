import { query, withTransaction } from '../config/db.js';
import { AppError } from '../middlewares/error.middleware.js';
import { fromCents, multiplyCents, toCents } from '../utils/decimal.js';
import { escapeLike } from '../utils/documento.js';

// ---------------- Categorías ----------------
export async function listarCategoriasAdmin() {
  const { rows } = await query(`SELECT * FROM categoria ORDER BY id_categoria ASC`);
  return rows;
}

export async function crearCategoria({ nombre, descripcion }) {
  const { rows } = await query(
    `INSERT INTO categoria (nombre, descripcion) VALUES ($1, $2) RETURNING *`,
    [nombre.trim(), descripcion ? descripcion.trim() : null]
  );
  return rows[0];
}

export async function actualizarCategoria(idCategoria, { nombre, descripcion }) {
  const { rows } = await query(
    `UPDATE categoria SET nombre = $2, descripcion = $3 WHERE id_categoria = $1 RETURNING *`,
    [idCategoria, nombre.trim(), descripcion ? descripcion.trim() : null]
  );
  if (rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Categoría no encontrada.');
  return rows[0];
}

export async function cambiarEstadoCategoria(idCategoria, { estado }) {
  const { rows } = await query(
    `UPDATE categoria SET estado = $2 WHERE id_categoria = $1 RETURNING *`,
    [idCategoria, estado]
  );
  if (rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Categoría no encontrada.');
  return rows[0];
}

export async function eliminarCategoria(idCategoria) {
  return withTransaction(async (client) => {
    const prod = await client.query(`SELECT 1 FROM producto WHERE id_categoria = $1 LIMIT 1`, [idCategoria]);
    if (prod.rows.length > 0) {
      throw new AppError(
        409,
        'CATEGORIA_CON_PRODUCTOS',
        'No se puede eliminar la categoría porque tiene productos asociados. Inactívala en su lugar.'
      );
    }
    const del = await client.query(`DELETE FROM categoria WHERE id_categoria = $1 RETURNING id_categoria`, [idCategoria]);
    if (del.rowCount === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Categoría no encontrada.');
    }
    return { eliminado: true, id_categoria: idCategoria };
  });
}

// ---------------- Productos ----------------
export async function listarProductosAdmin({ q, id_categoria, estado, page, limit }) {
  const conds = [];
  const params = [];

  if (id_categoria !== undefined) {
    params.push(id_categoria);
    conds.push(`p.id_categoria = $${params.length}`);
  }
  if (estado !== undefined) {
    params.push(estado);
    conds.push(`p.estado = $${params.length}`);
  }
  if (q && q.trim()) {
    params.push(`%${escapeLike(q.trim())}%`);
    conds.push(`(p.nombre ILIKE $${params.length} ESCAPE '\\' OR p.descripcion ILIKE $${params.length} ESCAPE '\\')`);
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const countRes = await query(`SELECT COUNT(*)::INTEGER AS total FROM producto p ${where}`, params);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT p.*, c.nombre AS categoria_nombre, c.estado AS categoria_estado
     FROM producto p
     JOIN categoria c ON c.id_categoria = p.id_categoria
     ${where}
     ORDER BY p.id_producto DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit, total, total_paginas: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function crearProducto(datos) {
  const catRes = await query(`SELECT id_categoria FROM categoria WHERE id_categoria = $1`, [datos.id_categoria]);
  if (catRes.rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'La categoría indicada no existe.');
  }

  const { rows } = await query(
    `INSERT INTO producto (id_categoria, nombre, descripcion, precio, existencias, imagen_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      datos.id_categoria,
      datos.nombre.trim(),
      datos.descripcion.trim(),
      fromCents(toCents(datos.precio)),
      datos.existencias,
      datos.imagen_url.trim(),
    ]
  );
  return rows[0];
}

export async function actualizarProducto(idProducto, datos) {
  const catRes = await query(`SELECT id_categoria FROM categoria WHERE id_categoria = $1`, [datos.id_categoria]);
  if (catRes.rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'La categoría indicada no existe.');
  }

  // No modifica existencias para prevenir lost updates frente a compras concurrentes
  const { rows } = await query(
    `UPDATE producto
     SET id_categoria = $2, nombre = $3, descripcion = $4, precio = $5, imagen_url = $6
     WHERE id_producto = $1
     RETURNING *`,
    [
      idProducto,
      datos.id_categoria,
      datos.nombre.trim(),
      datos.descripcion.trim(),
      fromCents(toCents(datos.precio)),
      datos.imagen_url.trim(),
    ]
  );
  if (rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Producto no encontrado.');
  return rows[0];
}

export async function cambiarEstadoProducto(idProducto, { estado }) {
  const { rows } = await query(
    `UPDATE producto SET estado = $2 WHERE id_producto = $1 RETURNING *`,
    [idProducto, estado]
  );
  if (rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Producto no encontrado.');
  return rows[0];
}

export async function ajustarExistenciasProducto(idProducto, { existencias }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE producto SET existencias = $2 WHERE id_producto = $1 RETURNING *`,
      [idProducto, existencias]
    );
    if (rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Producto no encontrado.');
    return rows[0];
  });
}

// ---------------- Usuarios y Rol Único (RF-28) ----------------
export async function listarUsuariosAdmin({ q, page, limit }) {
  const params = [];
  let where = '';
  if (q && q.trim()) {
    params.push(`%${escapeLike(q.trim())}%`);
    where = `WHERE (u.nombre ILIKE $1 ESCAPE '\\' OR u.primer_apellido ILIKE $1 ESCAPE '\\' OR u.correo ILIKE $1 ESCAPE '\\' OR u.numero_documento ILIKE $1 ESCAPE '\\')`;
  }

  const countRes = await query(`SELECT COUNT(*)::INTEGER AS total FROM usuario u ${where}`, params);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT u.id_usuario, u.tipo_documento, u.numero_documento, u.nombre, u.primer_apellido,
            u.segundo_apellido, u.telefono, u.correo, u.estado_usuario, u.fecha_registro, r.nombre AS rol
     FROM usuario u
     JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
     JOIN rol r ON r.id_rol = ur.id_rol
     ${where}
     ORDER BY u.id_usuario ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit, total, total_paginas: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function verificarOtroAdminActivo(client, targetUserId) {
  const activeAdmins = await client.query(
    `SELECT u.id_usuario
     FROM usuario u
     JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
     JOIN rol r ON r.id_rol = ur.id_rol
     WHERE r.nombre = 'ADMIN' AND u.estado_usuario = 'ACTIVO'
     FOR UPDATE OF u`
  );
  const remaining = activeAdmins.rows.filter((a) => a.id_usuario !== targetUserId);
  if (remaining.length < 1) {
    throw new AppError(
      409,
      'ULTIMO_ADMIN_ACTIVO',
      'No es posible desactivar ni degradar al último administrador activo del sistema.'
    );
  }
}

export async function cambiarEstadoUsuario(targetUserId, { estado_usuario }) {
  return withTransaction(async (client) => {
    const userRes = await client.query(
      `SELECT u.id_usuario, u.estado_usuario, r.nombre AS rol
       FROM usuario u
       JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
       JOIN rol r ON r.id_rol = ur.id_rol
       WHERE u.id_usuario = $1
       FOR UPDATE OF u`,
      [targetUserId]
    );
    if (userRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Usuario no encontrado.');
    }

    const target = userRes.rows[0];
    if (target.rol === 'ADMIN' && target.estado_usuario === 'ACTIVO' && estado_usuario === 'INACTIVO') {
      await verificarOtroAdminActivo(client, targetUserId);
    }

    const upd = await client.query(
      `UPDATE usuario
       SET estado_usuario = $2,
           token_version = token_version + 1
       WHERE id_usuario = $1
       RETURNING id_usuario, correo, estado_usuario, token_version`,
      [targetUserId, estado_usuario]
    );
    return { ...upd.rows[0], rol: target.rol };
  });
}

export async function cambiarRolUsuario(adminId, targetUserId, { rol }) {
  return withTransaction(async (client) => {
    const userRes = await client.query(
      `SELECT u.id_usuario, u.correo, u.estado_usuario, r.nombre AS rol_actual
       FROM usuario u
       JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
       JOIN rol r ON r.id_rol = ur.id_rol
       WHERE u.id_usuario = $1
       FOR UPDATE OF u`,
      [targetUserId]
    );
    if (userRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Usuario no encontrado.');
    }
    const target = userRes.rows[0];

    if (target.rol_actual === 'ADMIN' && target.estado_usuario === 'ACTIVO' && rol !== 'ADMIN') {
      await verificarOtroAdminActivo(client, targetUserId);
    }

    const rolRes = await client.query(`SELECT id_rol FROM rol WHERE nombre = $1`, [rol]);
    if (rolRes.rows.length === 0) {
      throw new AppError(400, 'VALIDACION_INVALIDA', 'Rol no válido.');
    }

    await client.query(
      `UPDATE usuario_rol
       SET id_rol = $2, asignado_por = $3, fecha_asignacion = CURRENT_TIMESTAMP
       WHERE id_usuario = $1`,
      [targetUserId, rolRes.rows[0].id_rol, adminId]
    );

    const upd = await client.query(
      `UPDATE usuario
       SET token_version = token_version + 1
       WHERE id_usuario = $1
       RETURNING id_usuario, correo, estado_usuario, token_version`,
      [targetUserId]
    );

    return { ...upd.rows[0], rol };
  });
}

// ---------------- Pedidos y Reembolsos Pre-envío ----------------
export async function listarPedidosAdmin({ estado, page, limit }) {
  const params = [];
  let where = '';
  if (estado) {
    params.push(estado);
    where = `WHERE p.estado_pedido = $1`;
  }

  const countRes = await query(`SELECT COUNT(*)::INTEGER AS total FROM pedido p ${where}`, params);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT p.*, u.nombre AS cliente_nombre, u.primer_apellido AS cliente_apellido, u.correo AS cliente_correo
     FROM pedido p
     JOIN usuario u ON u.id_usuario = p.id_usuario
     ${where}
     ORDER BY p.fecha_pedido DESC, p.id_pedido DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit, total, total_paginas: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function cambiarEstadoPedidoAdmin(adminId, idPedido, { estado_pedido, motivo_cancelacion }) {
  return withTransaction(async (client) => {
    const pedRes = await client.query(
      `SELECT id_pedido, estado_pedido FROM pedido WHERE id_pedido = $1 FOR UPDATE`,
      [idPedido]
    );
    if (pedRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
    }
    const actual = pedRes.rows[0].estado_pedido;

    if (estado_pedido === 'ENVIADO') {
      if (actual !== 'PAGADO') {
        throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', `No se puede pasar de ${actual} a ENVIADO.`);
      }
      const upd = await client.query(
        `UPDATE pedido SET estado_pedido = 'ENVIADO', fecha_envio = CURRENT_TIMESTAMP WHERE id_pedido = $1 RETURNING *`,
        [idPedido]
      );
      return upd.rows[0];
    }

    if (estado_pedido === 'ENTREGADO') {
      if (actual !== 'ENVIADO') {
        throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', `No se puede pasar de ${actual} a ENTREGADO.`);
      }
      const upd = await client.query(
        `UPDATE pedido SET estado_pedido = 'ENTREGADO', fecha_entrega = CURRENT_TIMESTAMP WHERE id_pedido = $1 RETURNING *`,
        [idPedido]
      );
      return upd.rows[0];
    }

    if (estado_pedido === 'CANCELADO') {
      if (actual !== 'PENDIENTE' && actual !== 'PAGADO') {
        throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', `No se puede cancelar un pedido en estado ${actual}.`);
      }
      if (!motivo_cancelacion || motivo_cancelacion.trim().length < 3) {
        throw new AppError(400, 'VALIDACION_INVALIDA', 'El motivo de cancelación es obligatorio para el administrador.');
      }

      const detRes = await client.query(
        `SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = $1 ORDER BY id_producto ASC FOR UPDATE`,
        [idPedido]
      );
      const prodIds = detRes.rows.map((d) => d.id_producto);
      if (prodIds.length > 0) {
        await client.query(`SELECT id_producto FROM producto WHERE id_producto = ANY($1::INTEGER[]) ORDER BY id_producto ASC FOR UPDATE`, [prodIds]);
        for (const item of detRes.rows) {
          await client.query(`UPDATE producto SET existencias = existencias + $2 WHERE id_producto = $1`, [
            item.id_producto,
            item.cantidad,
          ]);
        }
      }

      const wasPaid = actual === 'PAGADO';
      const upd = await client.query(
        `UPDATE pedido
         SET estado_pedido = 'CANCELADO',
             fecha_cancelacion = CURRENT_TIMESTAMP,
             motivo_cancelacion = $2,
             cancelado_por = $3,
             estado_reembolso_cancelacion = $4::varchar,
             fecha_limite_reembolso_cancelacion = CASE WHEN $4::varchar = 'PENDIENTE_REEMBOLSO' THEN CURRENT_TIMESTAMP + INTERVAL '15 days' ELSE NULL END
         WHERE id_pedido = $1
         RETURNING *`,
        [idPedido, motivo_cancelacion.trim(), adminId, wasPaid ? 'PENDIENTE_REEMBOLSO' : 'NO_APLICA']
      );
      return upd.rows[0];
    }

    throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', 'Transición de estado no permitida.');
  });
}

export async function confirmarReembolsoCancelacionPedido(idPedido, { observacion }) {
  return withTransaction(async (client) => {
    const pedRes = await client.query(
      `SELECT id_pedido, estado_pedido, estado_reembolso_cancelacion, datos_reembolso_cancelacion
       FROM pedido
       WHERE id_pedido = $1
       FOR UPDATE`,
      [idPedido]
    );
    if (pedRes.rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Pedido no encontrado.');
    }

    const ped = pedRes.rows[0];
    if (ped.estado_pedido !== 'CANCELADO' || ped.estado_reembolso_cancelacion !== 'PENDIENTE_REEMBOLSO') {
      throw new AppError(
        409,
        'TRANSICION_ESTADO_INVALIDA',
        'El pedido no tiene un reembolso pendiente por cancelación pre-envío.'
      );
    }

    const obsText = observacion?.trim()
      ? [ped.datos_reembolso_cancelacion, `Admin: ${observacion.trim()}`].filter(Boolean).join(' | ').slice(0, 500)
      : ped.datos_reembolso_cancelacion;

    const updPed = await client.query(
      `UPDATE pedido
       SET estado_reembolso_cancelacion = 'REEMBOLSADO',
           fecha_reembolso_cancelacion = CURRENT_TIMESTAMP,
           datos_reembolso_cancelacion = $2
       WHERE id_pedido = $1
       RETURNING *`,
      [idPedido, obsText]
    );

    // Reembolso 100 % del pedido -> pago pasa a REEMBOLSADO
    await client.query(
      `UPDATE pago
       SET estado_pago = 'REEMBOLSADO'
       WHERE id_pedido = $1 AND estado_pago = 'APROBADO'`,
      [idPedido]
    );

    return updPed.rows[0];
  });
}

// ---------------- Retractos (RETRACTO_LEGAL exclusivamente) ----------------
export async function listarRetractosAdmin({ estado, page, limit }) {
  const params = [];
  let where = '';
  if (estado) {
    params.push(estado);
    where = `WHERE r.estado_retracto = $1`;
  }

  const countRes = await query(`SELECT COUNT(*)::INTEGER AS total FROM retracto r ${where}`, params);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT r.*, u.nombre AS cliente_nombre, u.primer_apellido AS cliente_apellido, u.correo AS cliente_correo
     FROM retracto r
     JOIN usuario u ON u.id_usuario = r.id_usuario
     ${where}
     ORDER BY r.fecha_solicitud DESC, r.id_retracto DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit, total, total_paginas: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function obtenerRetractoAdmin(idRetracto) {
  const { rows } = await query(`SELECT * FROM retracto WHERE id_retracto = $1`, [idRetracto]);
  if (rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Solicitud de retracto no encontrada.');

  const detalles = await query(
    `SELECT dr.*, dp.id_producto, p.nombre AS producto_nombre, dp.precio_unitario
     FROM detalle_retracto dr
     JOIN detalle_pedido dp ON dp.id_detalle_pedido = dr.id_detalle_pedido
     JOIN producto p ON p.id_producto = dp.id_producto
     WHERE dr.id_retracto = $1
     ORDER BY dr.id_detalle_retracto ASC`,
    [idRetracto]
  );

  return { ...rows[0], detalles: detalles.rows };
}

export async function decidirRetractoAdmin(adminId, idRetracto, { decision, observacion_admin }) {
  return withTransaction(async (client) => {
    const retRes = await client.query(`SELECT * FROM retracto WHERE id_retracto = $1 FOR UPDATE`, [idRetracto]);
    if (retRes.rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Retracto no encontrado.');

    const ret = retRes.rows[0];
    if (ret.estado_retracto !== 'SOLICITADO') {
      throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', `El retracto ya se encuentra en estado ${ret.estado_retracto}.`);
    }

    if (decision === 'APROBAR') {
      const upd = await client.query(
        `UPDATE retracto
         SET estado_retracto = 'APROBADO_RECEPCION',
             revisado_por = $2,
             observacion_admin = COALESCE($3, observacion_admin)
         WHERE id_retracto = $1
         RETURNING *`,
        [idRetracto, adminId, observacion_admin ? observacion_admin.trim() : null]
      );
      return upd.rows[0];
    }

    const upd = await client.query(
      `UPDATE retracto
       SET estado_retracto = 'RECHAZADO',
           estado_reembolso = 'NO_APLICA',
           monto_reembolso = 0,
           fecha_limite_reembolso = NULL,
           revisado_por = $2,
           observacion_admin = COALESCE($3, observacion_admin)
       WHERE id_retracto = $1
       RETURNING *`,
      [idRetracto, adminId, observacion_admin ? observacion_admin.trim() : null]
    );
    return upd.rows[0];
  });
}

export async function registrarRecepcionRetractoAdmin(adminId, idRetracto, { observacion_admin, items }) {
  return withTransaction(async (client) => {
    const retRes = await client.query(`SELECT * FROM retracto WHERE id_retracto = $1 FOR UPDATE`, [idRetracto]);
    if (retRes.rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Retracto no encontrado.');
    const ret = retRes.rows[0];

    if (ret.estado_retracto !== 'APROBADO_RECEPCION' || ret.fecha_recepcion_fisica !== null) {
      throw new AppError(
        409,
        'TRANSICION_ESTADO_INVALIDA',
        'El retracto debe estar en APROBADO_RECEPCION y sin inspección física previa.'
      );
    }

    const linesRes = await client.query(
      `SELECT dr.id_detalle_retracto, dr.cantidad_devuelta, dp.id_producto, dp.precio_unitario
       FROM detalle_retracto dr
       JOIN detalle_pedido dp ON dp.id_detalle_pedido = dr.id_detalle_pedido
       WHERE dr.id_retracto = $1
       ORDER BY dr.id_detalle_retracto ASC
       FOR UPDATE OF dr`,
      [idRetracto]
    );
    const lineMap = new Map(linesRes.rows.map((l) => [l.id_detalle_retracto, l]));

    if (items.length !== linesRes.rows.length) {
      throw new AppError(400, 'VALIDACION_INVALIDA', 'Debes reportar la inspección de todas las líneas del retracto.');
    }

    const seen = new Set();
    const restockByProd = new Map();
    let totalReembolsoCents = 0;

    for (const item of items) {
      if (seen.has(item.id_detalle_retracto)) {
        throw new AppError(400, 'VALIDACION_INVALIDA', 'Línea id_detalle_retracto duplicada.');
      }
      seen.add(item.id_detalle_retracto);

      const line = lineMap.get(item.id_detalle_retracto);
      if (!line) {
        throw new AppError(404, 'RECURSO_NO_ENCONTRADO', `Línea de retracto #${item.id_detalle_retracto} no encontrada.`);
      }

      if (item.cantidad_buen_estado + item.cantidad_danada !== line.cantidad_devuelta) {
        throw new AppError(
          400,
          'VALIDACION_INVALIDA',
          `La suma de unidades en buen estado y dañadas debe igualar a ${line.cantidad_devuelta}.`
        );
      }

      const subCents = multiplyCents(line.precio_unitario, item.cantidad_buen_estado);
      totalReembolsoCents += subCents;

      const estadoInspeccion =
        item.cantidad_danada === 0
          ? 'BUEN_ESTADO'
          : item.cantidad_buen_estado === 0
          ? 'DANADO'
          : 'PARCIAL';

      await client.query(
        `UPDATE detalle_retracto
         SET cantidad_buen_estado = $2,
             cantidad_danada = $3,
             subtotal_reembolso = $4,
             estado_inspeccion = $5,
             observacion_inspeccion = $6
         WHERE id_detalle_retracto = $1`,
        [
          line.id_detalle_retracto,
          item.cantidad_buen_estado,
          item.cantidad_danada,
          fromCents(subCents),
          estadoInspeccion,
          item.observacion_inspeccion ? item.observacion_inspeccion.trim() : null,
        ]
      );

      if (item.cantidad_buen_estado > 0) {
        restockByProd.set(line.id_producto, (restockByProd.get(line.id_producto) || 0) + item.cantidad_buen_estado);
      }
    }

    // Reingresar existencias únicamente por cantidad_buen_estado en orden ascendente de id_producto
    const prodIds = [...restockByProd.keys()].sort((a, b) => a - b);
    if (prodIds.length > 0) {
      await client.query(
        `SELECT id_producto FROM producto WHERE id_producto = ANY($1::INTEGER[]) ORDER BY id_producto ASC FOR UPDATE`,
        [prodIds]
      );
      for (const idProd of prodIds) {
        await client.query(`UPDATE producto SET existencias = existencias + $2 WHERE id_producto = $1`, [
          idProd,
          restockByProd.get(idProd),
        ]);
      }
    }

    const sinSaldo = totalReembolsoCents === 0;
    const updRet = await client.query(
      `UPDATE retracto
       SET estado_retracto = $2,
           estado_reembolso = $3::varchar,
           monto_reembolso = $4,
           fecha_limite_reembolso = CASE WHEN $3::varchar = 'NO_APLICA' THEN NULL ELSE fecha_limite_reembolso END,
           fecha_recepcion_fisica = CURRENT_TIMESTAMP,
           revisado_por = $5,
           observacion_admin = COALESCE($6, observacion_admin)
       WHERE id_retracto = $1
       RETURNING *`,
      [
        idRetracto,
        sinSaldo ? 'RECHAZADO' : 'APROBADO_RECEPCION',
        sinSaldo ? 'NO_APLICA' : 'PENDIENTE_REEMBOLSO',
        fromCents(totalReembolsoCents),
        adminId,
        observacion_admin ? observacion_admin.trim() : null,
      ]
    );

    const updatedLines = await client.query(
      `SELECT * FROM detalle_retracto WHERE id_retracto = $1 ORDER BY id_detalle_retracto ASC`,
      [idRetracto]
    );
    return { ...updRet.rows[0], detalles: updatedLines.rows };
  });
}

export async function confirmarReembolsoRetractoAdmin(adminId, idRetracto, { observacion_admin }) {
  return withTransaction(async (client) => {
    const retRes = await client.query(`SELECT * FROM retracto WHERE id_retracto = $1 FOR UPDATE`, [idRetracto]);
    if (retRes.rows.length === 0) throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Retracto no encontrado.');
    const ret = retRes.rows[0];

    const pedRes = await client.query(`SELECT id_pedido, total FROM pedido WHERE id_pedido = $1 FOR UPDATE`, [ret.id_pedido]);

    if (
      ret.estado_retracto !== 'APROBADO_RECEPCION' ||
      ret.estado_reembolso !== 'PENDIENTE_REEMBOLSO' ||
      ret.fecha_recepcion_fisica === null ||
      toCents(ret.monto_reembolso) <= 0
    ) {
      throw new AppError(409, 'TRANSICION_ESTADO_INVALIDA', 'El retracto no está listo para confirmar reembolso.');
    }

    const updRet = await client.query(
      `UPDATE retracto
       SET estado_retracto = 'COMPLETADO',
           estado_reembolso = 'REEMBOLSADO',
           fecha_reembolso = CURRENT_TIMESTAMP,
           revisado_por = $2,
           observacion_admin = COALESCE($3, observacion_admin)
       WHERE id_retracto = $1
       RETURNING *`,
      [idRetracto, adminId, observacion_admin ? observacion_admin.trim() : null]
    );

    // Solo marcar pago.estado_pago = 'REEMBOLSADO' si el acumulado efectivamente reembolsado alcanza el 100 % de pedido.total
    const sumRes = await client.query(
      `SELECT COALESCE(SUM(monto_reembolso), 0) AS acumulado
       FROM retracto
       WHERE id_pedido = $1 AND estado_reembolso = 'REEMBOLSADO'`,
      [ret.id_pedido]
    );
    const acumuladoCents = toCents(sumRes.rows[0].acumulado);
    const totalPedidoCents = toCents(pedRes.rows[0].total);

    if (acumuladoCents >= totalPedidoCents) {
      await client.query(
        `UPDATE pago SET estado_pago = 'REEMBOLSADO' WHERE id_pedido = $1 AND estado_pago = 'APROBADO'`,
        [ret.id_pedido]
      );
    }

    return updRet.rows[0];
  });
}

// ---------------- Reportes Netos (America/Bogota, máx 90 días, 5000 filas) ----------------
function validarRangoReportes(desde, hasta) {
  const startMs = Date.parse(`${desde}T00:00:00Z`);
  const endMs = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
    throw new AppError(400, 'RANGO_REPORTES_EXCEDIDO', 'El rango de fechas es inválido (desde debe ser <= hasta).');
  }
  const diffDays = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  if (diffDays > 90) {
    throw new AppError(400, 'RANGO_REPORTES_EXCEDIDO', 'El rango máximo permitido para reportes es de 90 días.');
  }
}

export async function obtenerResumenReportes({ desde, hasta, id_categoria }) {
  validarRangoReportes(desde, hasta);

  const params = [desde, hasta];
  let catFilter = '';
  if (id_categoria !== undefined) {
    params.push(id_categoria);
    catFilter = `AND pr.id_categoria = $3`;
  }

  // Ventas brutas aprobadas en el rango (por línea si hay filtro categoría o total del pedido aprobado)
  const brutoRes = await query(
    id_categoria !== undefined
      ? `SELECT COALESCE(SUM(dp.cantidad * dp.precio_unitario), 0) AS bruto,
                COUNT(DISTINCT p.id_pedido)::INTEGER AS cantidad_pedidos
         FROM pedido p
         JOIN pago pg ON pg.id_pedido = p.id_pedido AND pg.estado_pago IN ('APROBADO', 'REEMBOLSADO')
         JOIN detalle_pedido dp ON dp.id_pedido = p.id_pedido
         JOIN producto pr ON pr.id_producto = dp.id_producto
         WHERE pg.fecha_pago >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND pg.fecha_pago < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
           ${catFilter}`
      : `SELECT COALESCE(SUM(pg.monto), 0) AS bruto,
                COUNT(DISTINCT p.id_pedido)::INTEGER AS cantidad_pedidos
         FROM pedido p
         JOIN pago pg ON pg.id_pedido = p.id_pedido AND pg.estado_pago IN ('APROBADO', 'REEMBOLSADO')
         WHERE pg.fecha_pago >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND pg.fecha_pago < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')`,
    params
  );

  // Reembolsos efectivos por cancelación pre-envío confirmada
  const reembCancRes = await query(
    id_categoria !== undefined
      ? `SELECT COALESCE(SUM(dp.cantidad * dp.precio_unitario), 0) AS reemb_canc
         FROM pedido p
         JOIN detalle_pedido dp ON dp.id_pedido = p.id_pedido
         JOIN producto pr ON pr.id_producto = dp.id_producto
         WHERE p.estado_reembolso_cancelacion = 'REEMBOLSADO'
           AND p.fecha_reembolso_cancelacion >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND p.fecha_reembolso_cancelacion < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
           ${catFilter}`
      : `SELECT COALESCE(SUM(p.total), 0) AS reemb_canc
         FROM pedido p
         WHERE p.estado_reembolso_cancelacion = 'REEMBOLSADO'
           AND p.fecha_reembolso_cancelacion >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND p.fecha_reembolso_cancelacion < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')`,
    params
  );

  // Reembolsos efectivos por retracto confirmado
  const reembRetRes = await query(
    id_categoria !== undefined
      ? `SELECT COALESCE(SUM(dr.subtotal_reembolso), 0) AS reemb_ret
         FROM retracto r
         JOIN detalle_retracto dr ON dr.id_retracto = r.id_retracto
         JOIN detalle_pedido dp ON dp.id_detalle_pedido = dr.id_detalle_pedido
         JOIN producto pr ON pr.id_producto = dp.id_producto
         WHERE r.estado_reembolso = 'REEMBOLSADO'
           AND r.fecha_reembolso >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND r.fecha_reembolso < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
           ${catFilter}`
      : `SELECT COALESCE(SUM(r.monto_reembolso), 0) AS reemb_ret
         FROM retracto r
         WHERE r.estado_reembolso = 'REEMBOLSADO'
           AND r.fecha_reembolso >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND r.fecha_reembolso < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')`,
    params
  );

  // Pendiente informativo por reembolsar (no se descuenta aún de ventas netas)
  const pendReembRes = await query(
    `SELECT (
       (SELECT COALESCE(SUM(total), 0) FROM pedido WHERE estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO') +
       (SELECT COALESCE(SUM(monto_reembolso), 0) FROM retracto WHERE estado_reembolso = 'PENDIENTE_REEMBOLSO')
     ) AS pendiente_reembolso`
  );

  const topRes = await query(
    `SELECT pr.id_producto, pr.nombre,
            (SUM(dp.cantidad) - COALESCE(SUM(CASE WHEN r.estado_reembolso = 'REEMBOLSADO' THEN dr.cantidad_buen_estado ELSE 0 END), 0))::INTEGER AS unidades_netas
     FROM pedido p
     JOIN pago pg ON pg.id_pedido = p.id_pedido AND pg.estado_pago IN ('APROBADO', 'REEMBOLSADO')
     JOIN detalle_pedido dp ON dp.id_pedido = p.id_pedido
     JOIN producto pr ON pr.id_producto = dp.id_producto
     LEFT JOIN detalle_retracto dr ON dr.id_detalle_pedido = dp.id_detalle_pedido
     LEFT JOIN retracto r ON r.id_retracto = dr.id_retracto
     WHERE pg.fecha_pago >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
       AND pg.fecha_pago < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
       AND p.estado_reembolso_cancelacion <> 'REEMBOLSADO'
       ${catFilter}
     GROUP BY pr.id_producto, pr.nombre
     ORDER BY unidades_netas DESC, pr.id_producto ASC
     LIMIT 10`,
    params
  );

  const brutoCents = toCents(brutoRes.rows[0].bruto);
  const reembCents = toCents(reembCancRes.rows[0].reemb_canc) + toCents(reembRetRes.rows[0].reemb_ret);
  const netoCents = brutoCents - reembCents;

  return {
    periodo: { desde, hasta, zona_horaria: 'America/Bogota', id_categoria: id_categoria ?? null },
    cantidad_pedidos: brutoRes.rows[0].cantidad_pedidos,
    ventas_brutas_aprobadas: fromCents(brutoCents),
    reembolsos_efectivos: fromCents(reembCents),
    ventas_netas: fromCents(netoCents),
    pendiente_por_reembolsar: fromCents(toCents(pendReembRes.rows[0].pendiente_reembolso)),
    productos_mas_vendidos: topRes.rows,
  };
}

export async function obtenerReporteVentas({ desde, hasta, id_categoria }) {
  validarRangoReportes(desde, hasta);

  const params = [desde, hasta];
  let catJoinFilter = '';
  if (id_categoria !== undefined) {
    params.push(id_categoria);
    catJoinFilter = `
      AND EXISTS (
        SELECT 1 FROM detalle_pedido dp2
        JOIN producto pr2 ON pr2.id_producto = dp2.id_producto
        WHERE dp2.id_pedido = p.id_pedido AND pr2.id_categoria = $3
      )`;
  }

  const { rows } = await query(
    `SELECT p.id_pedido,
            pg.fecha_pago AT TIME ZONE 'America/Bogota' AS fecha_pago_bogota,
            CONCAT(u.nombre, ' ', u.primer_apellido) AS cliente,
            u.correo AS cliente_correo,
            p.estado_pedido,
            pg.metodo_pago,
            pg.estado_pago,
            p.estado_reembolso_cancelacion,
            pg.monto AS monto_bruto,
            (
              CASE WHEN p.estado_reembolso_cancelacion = 'REEMBOLSADO' THEN p.total ELSE 0 END +
              COALESCE((SELECT SUM(r.monto_reembolso) FROM retracto r WHERE r.id_pedido = p.id_pedido AND r.estado_reembolso = 'REEMBOLSADO'), 0)
            ) AS reembolso_efectivo
     FROM pedido p
     JOIN usuario u ON u.id_usuario = p.id_usuario
     JOIN pago pg ON pg.id_pedido = p.id_pedido AND pg.estado_pago IN ('APROBADO', 'REEMBOLSADO')
     WHERE pg.fecha_pago >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
       AND pg.fecha_pago < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
       ${catJoinFilter}
     ORDER BY pg.fecha_pago DESC, p.id_pedido DESC
     LIMIT 5001`,
    params
  );

  if (rows.length > 5000) {
    throw new AppError(
      400,
      'RANGO_REPORTES_EXCEDIDO',
      'La consulta supera el tope máximo de 5000 filas. Reduce el rango de fechas o filtra por categoría.'
    );
  }

  return rows.map((r) => {
    const brutoCents = toCents(r.monto_bruto);
    const reembCents = toCents(r.reembolso_efectivo);
    return {
      ...r,
      monto_bruto: fromCents(brutoCents),
      reembolso_efectivo: fromCents(reembCents),
      monto_neto: fromCents(brutoCents - reembCents),
    };
  });
}
