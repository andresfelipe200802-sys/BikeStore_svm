import { query } from '../config/db.js';
import { AppError } from '../middlewares/error.middleware.js';
import { escapeLike } from '../utils/documento.js';

export async function listarCategoriasPublicas() {
  const { rows } = await query(
    `SELECT id_categoria, nombre, descripcion
     FROM categoria
     WHERE estado = TRUE
     ORDER BY nombre ASC`
  );
  return rows;
}

export async function listarProductosPublicos({ id_categoria, q, orden_precio, page, limit }) {
  const conditions = ['p.estado = TRUE', 'c.estado = TRUE'];
  const params = [];

  if (id_categoria !== undefined) {
    params.push(id_categoria);
    conditions.push(`p.id_categoria = $${params.length}`);
  }

  if (q && q.trim().length > 0) {
    params.push(`%${escapeLike(q.trim())}%`);
    conditions.push(`(p.nombre ILIKE $${params.length} ESCAPE '\\' OR p.descripcion ILIKE $${params.length} ESCAPE '\\')`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const orderBy =
    orden_precio === 'asc'
      ? 'ORDER BY p.precio ASC, p.id_producto ASC'
      : orden_precio === 'desc'
      ? 'ORDER BY p.precio DESC, p.id_producto ASC'
      : 'ORDER BY p.fecha_creacion DESC, p.id_producto ASC';

  const countRes = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM producto p
     JOIN categoria c ON c.id_categoria = p.id_categoria
     ${whereClause}`,
    params
  );

  const total = countRes.rows[0].total;
  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT p.id_producto, p.id_categoria, c.nombre AS categoria_nombre, p.nombre, p.descripcion,
            p.precio, p.existencias, (p.existencias = 0) AS agotado, p.imagen_url, p.fecha_creacion
     FROM producto p
     JOIN categoria c ON c.id_categoria = p.id_categoria
     ${whereClause}
     ${orderBy}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return {
    items: rows,
    meta: {
      page,
      limit,
      total,
      total_paginas: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function obtenerProductoPublico(idProducto) {
  const { rows } = await query(
    `SELECT p.id_producto, p.id_categoria, c.nombre AS categoria_nombre, p.nombre, p.descripcion,
            p.precio, p.existencias, (p.existencias = 0) AS agotado, p.imagen_url, p.fecha_creacion
     FROM producto p
     JOIN categoria c ON c.id_categoria = p.id_categoria
     WHERE p.id_producto = $1 AND p.estado = TRUE AND c.estado = TRUE`,
    [idProducto]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Producto no encontrado.');
  }
  return rows[0];
}
