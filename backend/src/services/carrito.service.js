import { withTransaction } from '../config/db.js';
import { AppError } from '../middlewares/error.middleware.js';
import { fromCents, multiplyCents } from '../utils/decimal.js';
import { sha256Hex } from '../utils/password.js';

const idempotencyMemory = new Map();

export function clearCarritoIdempotencyCache() {
  idempotencyMemory.clear();
}

export async function ensureCarritoActivoLocked(client, idUsuario) {
  const found = await client.query(
    `SELECT id_carrito FROM carrito WHERE id_usuario = $1 AND estado = 'ACTIVO' FOR UPDATE`,
    [idUsuario]
  );
  if (found.rows.length > 0) {
    return found.rows[0].id_carrito;
  }

  const inserted = await client.query(
    `INSERT INTO carrito (id_usuario, estado) VALUES ($1, 'ACTIVO') RETURNING id_carrito`,
    [idUsuario]
  );
  return inserted.rows[0].id_carrito;
}

export async function leerResumenCarrito(client, idCarrito) {
  const { rows } = await client.query(
    `SELECT dc.id_detalle_carrito, dc.id_producto, dc.cantidad, dc.precio_unidad,
            p.nombre, p.precio AS precio_actual, p.existencias, p.imagen_url,
            p.estado AS producto_estado, c.estado AS categoria_estado
     FROM detalle_carrito dc
     JOIN producto p ON p.id_producto = dc.id_producto
     JOIN categoria c ON c.id_categoria = p.id_categoria
     WHERE dc.id_carrito = $1
     ORDER BY dc.id_producto ASC`,
    [idCarrito]
  );

  let totalCents = 0;
  const items = rows.map((r) => {
    const subtotalCents = multiplyCents(r.precio_unidad, r.cantidad);
    totalCents += subtotalCents;
    return {
      id_detalle_carrito: r.id_detalle_carrito,
      id_producto: r.id_producto,
      nombre: r.nombre,
      cantidad: r.cantidad,
      precio_unidad: r.precio_unidad,
      precio_actual: r.precio_actual,
      subtotal: fromCents(subtotalCents),
      existencias: r.existencias,
      imagen_url: r.imagen_url,
      disponible: r.producto_estado && r.categoria_estado && r.existencias > 0,
    };
  });

  return {
    id_carrito: idCarrito,
    items,
    total: fromCents(totalCents),
  };
}

export async function obtenerCarrito(idUsuario) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id_carrito FROM carrito WHERE id_usuario = $1 AND estado = 'ACTIVO'`,
      [idUsuario]
    );
    if (rows.length === 0) {
      return { id_carrito: null, items: [], total: '0.00' };
    }
    return leerResumenCarrito(client, rows[0].id_carrito);
  });
}

/**
 * Fusión segura e idempotente de artículos temporales del visitante en PostgreSQL.
 */
export async function fusionarItemsEnCarrito(client, idUsuario, incomingItems) {
  const idCarrito = await ensureCarritoActivoLocked(client, idUsuario);
  const ajustes = [];

  // Deduplicar posibles entradas repetidas del cliente sumando cantidades por id_producto
  const grouped = new Map();
  for (const item of incomingItems) {
    grouped.set(item.id_producto, (grouped.get(item.id_producto) || 0) + item.cantidad);
  }

  const productIds = [...grouped.keys()].sort((a, b) => a - b);
  if (productIds.length > 0) {
    const prodRes = await client.query(
      `SELECT p.id_producto, p.nombre, p.precio, p.existencias, p.estado AS prod_estado, c.estado AS cat_estado
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       WHERE p.id_producto = ANY($1::INTEGER[])
       ORDER BY p.id_producto ASC`,
      [productIds]
    );
    const prodMap = new Map(prodRes.rows.map((p) => [p.id_producto, p]));

    const existingRes = await client.query(
      `SELECT id_producto, cantidad FROM detalle_carrito WHERE id_carrito = $1`,
      [idCarrito]
    );
    const existingMap = new Map(existingRes.rows.map((e) => [e.id_producto, e.cantidad]));

    for (const idProd of productIds) {
      const requestedQty = grouped.get(idProd);
      const prod = prodMap.get(idProd);

      if (!prod || !prod.prod_estado || !prod.cat_estado) {
        ajustes.push({ id_producto: idProd, motivo: 'PRODUCTO_NO_DISPONIBLE', cantidad_aplicada: 0 });
        continue;
      }

      if (prod.existencias <= 0) {
        ajustes.push({
          id_producto: idProd,
          nombre: prod.nombre,
          motivo: 'SIN_EXISTENCIAS',
          cantidad_aplicada: 0,
        });
        continue;
      }

      const prevQty = existingMap.get(idProd) || 0;
      const desiredTotal = prevQty + requestedQty;
      const finalQty = Math.min(desiredTotal, prod.existencias);

      if (finalQty < desiredTotal) {
        ajustes.push({
          id_producto: idProd,
          nombre: prod.nombre,
          motivo: 'AJUSTADO_A_EXISTENCIAS',
          cantidad_solicitada: desiredTotal,
          cantidad_aplicada: finalQty,
        });
      }

      await client.query(
        `INSERT INTO detalle_carrito (id_carrito, id_producto, cantidad, precio_unidad)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_carrito, id_producto)
         DO UPDATE SET cantidad = EXCLUDED.cantidad, precio_unidad = EXCLUDED.precio_unidad`,
        [idCarrito, idProd, finalQty, prod.precio]
      );
    }

    await client.query(
      `UPDATE carrito SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_carrito = $1`,
      [idCarrito]
    );
  }

  const resumen = await leerResumenCarrito(client, idCarrito);
  return { ...resumen, ajustes };
}

export async function fusionarCarrito(idUsuario, payload, idempotencyKey) {
  if (idempotencyKey) {
    const cacheKey = `${idUsuario}:fusionar:${idempotencyKey}`;
    const payloadHash = sha256Hex(JSON.stringify(payload));
    const cached = idempotencyMemory.get(cacheKey);
    if (cached) {
      if (cached.payloadHash !== payloadHash) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'La clave de idempotencia fue reutilizada con datos distintos.');
      }
      return cached.response;
    }

    const response = await withTransaction((client) =>
      fusionarItemsEnCarrito(client, idUsuario, payload.items)
    );
    idempotencyMemory.set(cacheKey, { payloadHash, response });
    if (idempotencyMemory.size > 500) {
      const oldestKey = idempotencyMemory.keys().next().value;
      idempotencyMemory.delete(oldestKey);
    }
    return response;
  }

  return withTransaction((client) =>
    fusionarItemsEnCarrito(client, idUsuario, payload.items)
  );
}

export async function agregarItemCarrito(idUsuario, { id_producto, cantidad }) {
  return withTransaction(async (client) => {
    const idCarrito = await ensureCarritoActivoLocked(client, idUsuario);
    const prodRes = await client.query(
      `SELECT p.id_producto, p.precio, p.existencias, p.estado AS prod_estado, c.estado AS cat_estado
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       WHERE p.id_producto = $1`,
      [id_producto]
    );

    if (prodRes.rows.length === 0 || !prodRes.rows[0].prod_estado || !prodRes.rows[0].cat_estado) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Producto no disponible.');
    }

    const prod = prodRes.rows[0];
    const currRes = await client.query(
      `SELECT cantidad FROM detalle_carrito WHERE id_carrito = $1 AND id_producto = $2`,
      [idCarrito, id_producto]
    );
    const nuevaCantidad = (currRes.rows[0]?.cantidad || 0) + cantidad;

    if (nuevaCantidad > prod.existencias) {
      throw new AppError(
        409,
        'STOCK_INSUFICIENTE',
        `Lo sentimos, solo quedan ${prod.existencias} unidades disponibles de este artículo.`
      );
    }

    await client.query(
      `INSERT INTO detalle_carrito (id_carrito, id_producto, cantidad, precio_unidad)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_carrito, id_producto)
       DO UPDATE SET cantidad = EXCLUDED.cantidad, precio_unidad = EXCLUDED.precio_unidad`,
      [idCarrito, id_producto, nuevaCantidad, prod.precio]
    );

    await client.query(`UPDATE carrito SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_carrito = $1`, [idCarrito]);
    return leerResumenCarrito(client, idCarrito);
  });
}

export async function actualizarCantidadItem(idUsuario, idProducto, { cantidad }) {
  return withTransaction(async (client) => {
    const idCarrito = await ensureCarritoActivoLocked(client, idUsuario);
    const prodRes = await client.query(
      `SELECT p.precio, p.existencias, p.estado AS prod_estado, c.estado AS cat_estado
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       WHERE p.id_producto = $1`,
      [idProducto]
    );

    if (prodRes.rows.length === 0 || !prodRes.rows[0].prod_estado || !prodRes.rows[0].cat_estado) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Producto no disponible.');
    }
    const prod = prodRes.rows[0];
    if (cantidad > prod.existencias) {
      throw new AppError(
        409,
        'STOCK_INSUFICIENTE',
        `Lo sentimos, solo quedan ${prod.existencias} unidades disponibles de este artículo.`
      );
    }

    const upd = await client.query(
      `UPDATE detalle_carrito
       SET cantidad = $3, precio_unidad = $4
       WHERE id_carrito = $1 AND id_producto = $2`,
      [idCarrito, idProducto, cantidad, prod.precio]
    );
    if (upd.rowCount === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'El producto no se encuentra en tu carrito.');
    }

    await client.query(`UPDATE carrito SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_carrito = $1`, [idCarrito]);
    return leerResumenCarrito(client, idCarrito);
  });
}

export async function eliminarItemCarrito(idUsuario, idProducto) {
  return withTransaction(async (client) => {
    const idCarrito = await ensureCarritoActivoLocked(client, idUsuario);
    const del = await client.query(
      `DELETE FROM detalle_carrito WHERE id_carrito = $1 AND id_producto = $2`,
      [idCarrito, idProducto]
    );
    if (del.rowCount === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'El producto no se encuentra en tu carrito.');
    }
    await client.query(`UPDATE carrito SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_carrito = $1`, [idCarrito]);
    return leerResumenCarrito(client, idCarrito);
  });
}
