import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query } from '../../src/config/db.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';

describe('Integración Posventa RETRACTO_LEGAL (5 días hábiles e inspección por cantidad)', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, producto, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    await query(`INSERT INTO categoria (nombre) VALUES ('Accesorios')`);
    resetRateLimiters();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function prepararPedidoEntregado(cantidad = 2, precio = 100000) {
    const admRes = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const adminToken = admRes.body.datos.token;

    const prodRes = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Casco Enduro',
        descripcion: 'Protección integral',
        precio,
        existencias: 10,
        imagen_url: 'https://cdn.example.com/casco.jpg',
      });
    const prodId = prodRes.body.datos.id_producto;

    await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '555666777',
      nombre: 'Sofía',
      primer_apellido: 'Castro',
      telefono: '3120009988',
      correo: 'sofia@example.com',
      contrasena: 'Password2026',
    });
    const cliLogin = await request(app).post('/api/auth/login').send({
      correo: 'sofia@example.com',
      contrasena: 'Password2026',
    });
    const clientToken = cliLogin.body.datos.token;

    await request(app)
      .post('/api/carrito/items')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ id_producto: prodId, cantidad });

    const pedRes = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ direccion_envio: 'Av 6N # 15-20' });
    const pedidoId = pedRes.body.datos.id_pedido;
    const detalleId = pedRes.body.datos.detalles[0].id_detalle_pedido;

    await request(app)
      .post(`/api/pedidos/${pedidoId}/pagos`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metodo_pago: 'TRANSFERENCIA', referencia_simulada: 'TRF-202611' });

    await request(app)
      .patch(`/api/admin/pedidos/${pedidoId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado_pedido: 'ENVIADO' });

    await request(app)
      .patch(`/api/admin/pedidos/${pedidoId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado_pedido: 'ENTREGADO' });

    return { adminToken, clientToken, prodId, pedidoId, detalleId };
  }

  it('valida frontera de 5 días hábiles en America/Bogota y calendario festivos completo', async () => {
    const { clientToken, pedidoId, detalleId } = await prepararPedidoEntregado(1, 150000);

    // Simular entrega hace 10 días calendario (ya venció ventana de 5 días hábiles)
    await query(
      `UPDATE pedido SET fecha_entrega = CURRENT_TIMESTAMP - INTERVAL '10 days' WHERE id_pedido = $1`,
      [pedidoId]
    );
    const expiredRes = await request(app)
      .post(`/api/pedidos/${pedidoId}/retractos`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        motivo: 'Intento extemporáneo',
        datos_reembolso: 'Nequi 3120009988',
        items: [{ id_detalle_pedido: detalleId, cantidad: 1 }],
      });
    assert.equal(expiredRes.status, 409);
    assert.equal(expiredRes.body.codigo, 'PLAZO_RETRACTO_VENCIDO');

    // Fecha de entrega fuera de rango cubierto (2045) responde 500 CALENDARIO_FESTIVOS_INCOMPLETO
    await query(`UPDATE pedido SET fecha_entrega = '2045-06-01T15:00:00Z' WHERE id_pedido = $1`, [pedidoId]);
    const outRange = await request(app)
      .post(`/api/pedidos/${pedidoId}/retractos`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        motivo: 'Año sin festivos cargados',
        datos_reembolso: 'Nequi 3120009988',
        items: [{ id_detalle_pedido: detalleId, cantidad: 1 }],
      });
    assert.equal(outRange.status, 500);
    assert.equal(outRange.body.codigo, 'CALENDARIO_FESTIVOS_INCOMPLETO');
  });

  it('ejecuta inspección mixta por cantidad, impide re-solicitud sobre DANADO y mantiene pago APROBADO en reembolso parcial', async () => {
    const { adminToken, clientToken, prodId, pedidoId, detalleId } = await prepararPedidoEntregado(2, 100000);

    // Stock actual después de comprar 2 de 10 = 8
    const s0 = await query(`SELECT existencias FROM producto WHERE id_producto = $1`, [prodId]);
    assert.equal(s0.rows[0].existencias, 8);

    const solRes = await request(app)
      .post(`/api/pedidos/${pedidoId}/retractos`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        motivo: 'Talla incorrecta',
        datos_reembolso: 'Bancolombia Ahorros terminada en 1111',
        items: [{ id_detalle_pedido: detalleId, cantidad: 2 }],
      });
    assert.equal(solRes.status, 201);
    const idRetracto = solRes.body.datos.id_retracto;
    const idDetRet = solRes.body.datos.detalles[0].id_detalle_retracto;

    // pedido.estado_pedido permanece ENTREGADO
    const pedCheck = await query(`SELECT estado_pedido FROM pedido WHERE id_pedido = $1`, [pedidoId]);
    assert.equal(pedCheck.rows[0].estado_pedido, 'ENTREGADO');

    // Admin aprueba recepción legal
    const decRes = await request(app)
      .patch(`/api/admin/retractos/${idRetracto}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APROBAR', observacion_admin: 'Procede retracto legal en plazo' });
    assert.equal(decRes.status, 200);
    assert.equal(decRes.body.datos.estado_retracto, 'APROBADO_RECEPCION');

    // Inspección mixta: 1 BUEN_ESTADO + 1 DANADO
    const recRes = await request(app)
      .patch(`/api/admin/retractos/${idRetracto}/recepcion`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        observacion_admin: 'Una unidad dañada por usuario',
        items: [
          {
            id_detalle_retracto: idDetRet,
            cantidad_buen_estado: 1,
            cantidad_danada: 1,
            observacion_inspeccion: 'Visor roto en unidad 2',
          },
        ],
      });
    assert.equal(recRes.status, 200);
    assert.equal(recRes.body.datos.monto_reembolso, '100000.00');
    assert.equal(recRes.body.datos.detalles[0].estado_inspeccion, 'PARCIAL');

    // Solo reingresó 1 unidad en buen estado -> stock 9
    const s1 = await query(`SELECT existencias FROM producto WHERE id_producto = $1`, [prodId]);
    assert.equal(s1.rows[0].existencias, 9);

    // Admin confirma reembolso parcial (100000 de 200000)
    const reembRes = await request(app)
      .patch(`/api/admin/retractos/${idRetracto}/reembolso`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ observacion_admin: 'Transferido 100.000 COP' });
    assert.equal(reembRes.status, 200);
    assert.equal(reembRes.body.datos.estado_retracto, 'COMPLETADO');
    assert.equal(reembRes.body.datos.estado_reembolso, 'REEMBOLSADO');

    // pago.estado_pago debe permanecer APROBADO (no REEMBOLSADO porque no fue 100%)
    const pgCheck = await query(`SELECT estado_pago FROM pago WHERE id_pedido = $1`, [pedidoId]);
    assert.equal(pgCheck.rows[0].estado_pago, 'APROBADO');

    // Cliente intenta re-solicitar la unidad rechazada por daño -> bloqueado con 409 CANTIDAD_RETRACTO_EXCEDIDA
    const reClaim = await request(app)
      .post(`/api/pedidos/${pedidoId}/retractos`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        motivo: 'Reintento sobre unidad dañada',
        datos_reembolso: 'Bancolombia 1111',
        items: [{ id_detalle_pedido: detalleId, cantidad: 1 }],
      });
    assert.equal(reClaim.status, 409);
    assert.equal(reClaim.body.codigo, 'CANTIDAD_RETRACTO_EXCEDIDA');
  });

  it('cierra retracto como RECHAZADO/NO_APLICA cuando todas las unidades recibidas están dañadas', async () => {
    const { adminToken, clientToken, pedidoId, detalleId } = await prepararPedidoEntregado(1, 100000);

    const sol = await request(app)
      .post(`/api/pedidos/${pedidoId}/retractos`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        motivo: 'Devolución completa',
        datos_reembolso: 'Nequi 3120009988',
        items: [{ id_detalle_pedido: detalleId, cantidad: 1 }],
      });
    const idRetracto = sol.body.datos.id_retracto;
    const idDetRet = sol.body.datos.detalles[0].id_detalle_retracto;

    await request(app)
      .patch(`/api/admin/retractos/${idRetracto}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APROBAR' });

    const rec = await request(app)
      .patch(`/api/admin/retractos/${idRetracto}/recepcion`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ id_detalle_retracto: idDetRet, cantidad_buen_estado: 0, cantidad_danada: 1 }],
      });
    assert.equal(rec.status, 200);
    assert.equal(rec.body.datos.estado_retracto, 'RECHAZADO');
    assert.equal(rec.body.datos.estado_reembolso, 'NO_APLICA');
    assert.equal(rec.body.datos.fecha_limite_reembolso, null);
    assert.equal(rec.body.datos.monto_reembolso, '0.00');
  });
});
