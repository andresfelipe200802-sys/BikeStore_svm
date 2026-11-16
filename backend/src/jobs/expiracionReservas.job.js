import env from '../config/env.js';
import { pool, withTransaction } from '../config/db.js';

let sweepTimer = null;
let isRunning = false;

/**
 * Expira un pedido PENDIENTE si su reserva de 15 min ya venció y restituye stock una sola vez.
 * Debe llamarse dentro de una transacción activa luego de bloquear pedido si aplica.
 */
export async function expirarPedidoSiVencido(client, idPedido, motivo = 'Reserva expirada automáticamente tras 15 minutos') {
  const upd = await client.query(
    `UPDATE pedido
     SET estado_pedido = 'CANCELADO',
         fecha_cancelacion = CURRENT_TIMESTAMP,
         motivo_cancelacion = COALESCE(motivo_cancelacion, $2)
     WHERE id_pedido = $1
       AND estado_pedido = 'PENDIENTE'
       AND fecha_expiracion < CURRENT_TIMESTAMP
     RETURNING id_pedido`,
    [idPedido, motivo]
  );

  if (upd.rowCount !== 1) {
    return false;
  }

  const itemsRes = await client.query(
    `SELECT id_producto, cantidad
     FROM detalle_pedido
     WHERE id_pedido = $1
     ORDER BY id_producto ASC`,
    [idPedido]
  );

  for (const item of itemsRes.rows) {
    await client.query(
      `UPDATE producto
       SET existencias = existencias + $2
       WHERE id_producto = $1`,
      [item.id_producto, item.cantidad]
    );
  }

  return true;
}

/**
 * Ejecuta un barrido acotado (LIMIT 20) con SKIP LOCKED y una transacción independiente por pedido.
 */
export async function ejecutarBarridoExpiracion() {
  if (isRunning) return 0;
  isRunning = true;
  let expiredCount = 0;

  try {
    const expiredIds = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id_pedido
         FROM pedido
         WHERE estado_pedido = 'PENDIENTE'
           AND fecha_expiracion < CURRENT_TIMESTAMP
         ORDER BY fecha_expiracion ASC
         LIMIT 20
         FOR UPDATE SKIP LOCKED`
      );
      return rows.map((r) => r.id_pedido);
    });

    for (const idPedido of expiredIds) {
      const didExpire = await withTransaction(async (client) => {
        await client.query('SELECT id_pedido FROM pedido WHERE id_pedido = $1 FOR UPDATE', [idPedido]);
        return expirarPedidoSiVencido(client, idPedido);
      });
      if (didExpire) expiredCount += 1;
    }
  } catch (err) {
    console.error('Error en job de expiración de reservas:', err.message);
  } finally {
    isRunning = false;
  }

  return expiredCount;
}

export function startExpiracionJob() {
  if (env.RESERVA_SWEEP_INTERVAL_MS <= 0) {
    return null;
  }
  if (sweepTimer) return sweepTimer;

  sweepTimer = setInterval(() => {
    ejecutarBarridoExpiracion().catch((err) => {
      console.error('Error inesperado en tick de expiración:', err.message);
    });
  }, env.RESERVA_SWEEP_INTERVAL_MS);

  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }
  return sweepTimer;
}

export function stopExpiracionJob() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
