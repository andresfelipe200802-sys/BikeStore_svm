import env from '../config/env.js';
import { withTransaction } from '../config/db.js';

let sweepTimer = null;
let isRunning = false;
let isPurging = false;
let lastPurgeAt = 0;

const PURGE_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Expira un pedido PENDIENTE si su reserva de 15 min ya venció y restituye stock una sola vez.
 * Mantiene jerarquía de bloqueos: pedido -> detalle_pedido ASC FOR UPDATE -> producto ASC FOR NO KEY UPDATE.
 */
export async function expirarPedidoSiVencido(client, idPedido, motivo = 'Reserva expirada automáticamente tras 15 minutos') {
  const upd = await client.query(
    `UPDATE pedido
     SET estado_pedido = 'CANCELADO',
         fecha_cancelacion = CURRENT_TIMESTAMP,
         motivo_cancelacion = COALESCE(motivo_cancelacion, $2)
     WHERE id_pedido = $1
       AND estado_pedido = 'PENDIENTE'
       AND fecha_expiracion <= CURRENT_TIMESTAMP
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
     ORDER BY id_producto ASC
     FOR UPDATE`,
    [idPedido]
  );

  const prodIds = itemsRes.rows.map((item) => item.id_producto);
  if (prodIds.length > 0) {
    await client.query(
      `SELECT id_producto
       FROM producto
       WHERE id_producto = ANY($1::INTEGER[])
       ORDER BY id_producto ASC
       FOR NO KEY UPDATE`,
      [prodIds]
    );
    for (const item of itemsRes.rows) {
      await client.query(
        `UPDATE producto
         SET existencias = existencias + $2
         WHERE id_producto = $1`,
        [item.id_producto, item.cantidad]
      );
    }
  }

  return true;
}

/**
 * Purga por lotes (LIMIT 100 SKIP LOCKED):
 * 1) Limpia reemplazo_cifrado vencido
 * 2) Purga sesion_refresh > fecha_expiracion + 24h (o > 30d si REUSO_DETECTADO)
 * 3) Purga carrito_fusion_idempotencia > 30d
 */
export async function purgarRegistrosExpiradosLote() {
  return withTransaction(async (client) => {
    const rReemplazo = await client.query(
      `WITH lote AS (
         SELECT id_sesion
         FROM sesion_refresh
         WHERE reemplazo_cifrado IS NOT NULL
           AND reemplazo_expira_en <= CURRENT_TIMESTAMP
         ORDER BY reemplazo_expira_en ASC, id_sesion ASC
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       UPDATE sesion_refresh sr
       SET reemplazo_cifrado = NULL,
           reemplazo_expira_en = NULL
       FROM lote
       WHERE sr.id_sesion = lote.id_sesion`
    );

    const rSesiones = await client.query(
      `WITH lote AS (
         SELECT id_sesion
         FROM sesion_refresh
         WHERE (
           motivo_revocacion IS DISTINCT FROM 'REUSO_DETECTADO'
           AND fecha_expiracion < CURRENT_TIMESTAMP - INTERVAL '24 hours'
         ) OR (
           motivo_revocacion = 'REUSO_DETECTADO'
           AND fecha_revocacion < CURRENT_TIMESTAMP - INTERVAL '30 days'
         )
         ORDER BY id_sesion ASC
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       DELETE FROM sesion_refresh sr
       USING lote
       WHERE sr.id_sesion = lote.id_sesion`
    );

    const rFusiones = await client.query(
      `WITH lote AS (
         SELECT id_fusion
         FROM carrito_fusion_idempotencia
         WHERE fecha_creacion < CURRENT_TIMESTAMP - INTERVAL '30 days'
         ORDER BY fecha_creacion ASC, id_fusion ASC
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       DELETE FROM carrito_fusion_idempotencia cfi
       USING lote
       WHERE cfi.id_fusion = lote.id_fusion`
    );

    return {
      reemplazosLimpiados: rReemplazo.rowCount,
      sesionesPurgadas: rSesiones.rowCount,
      fusionesPurgadas: rFusiones.rowCount,
    };
  });
}

export async function purgarRegistrosExpiradosOportunista({ force = false } = {}) {
  if (isPurging) return null;
  const now = Date.now();
  if (!force && now - lastPurgeAt < PURGE_COOLDOWN_MS) {
    return null;
  }
  isPurging = true;
  try {
    const summary = await purgarRegistrosExpiradosLote();
    lastPurgeAt = Date.now();
    return summary;
  } catch (err) {
    console.error('Error en purga oportunista de registros expirados:', err.message);
    return null;
  } finally {
    isPurging = false;
  }
}

export function resetPurgeThrottle() {
  lastPurgeAt = 0;
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
           AND fecha_expiracion <= CURRENT_TIMESTAMP
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

    await purgarRegistrosExpiradosOportunista();
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
