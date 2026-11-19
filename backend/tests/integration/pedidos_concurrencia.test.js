import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query } from '../../src/config/db.js';
import { ejecutarBarridoExpiracion } from '../../src/jobs/expiracionReservas.job.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';

describe('Integración Pedidos, Concurrencia, Pagos 1:N y Expiración', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, producto, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    await query(`INSERT INTO categoria (nombre) VALUES ('MTB')`);
    resetRateLimiters();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function createClient(docNum, correo) {
    await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: docNum,
      nombre: 'Cliente',
      primer_apellido: 'Prueba',
      telefono: '3000001122',
      correo,
      contrasena: 'Password2026',
    });
    const lr = await request(app).post('/api/auth/login').send({ correo, contrasena: 'Password2026' });
    return lr.body.datos.token;
  }

  async function createProduct(adminToken, existencias = 1, precio = 1000000) {
    const res = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Bici Pro',
        descripcion: 'Cuadro carbono',
        precio,
        existencias,
        imagen_url: 'https://cdn.example.com/mtb.jpg',
      });
    return res.body.datos.id_producto;
  }

  it('resuelve checkout concurrente sobre la última unidad sin stock negativo', async () => {
    const admRes = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const prodId = await createProduct(admRes.body.datos.token, 1, 500000);

    const t1 = await createClient('11111111', 'c1@example.com');
    const t2 = await createClient('22222222', 'c2@example.com');

    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${t1}`).send({ id_producto: prodId, cantidad: 1 });
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${t2}`).send({ id_producto: prodId, cantidad: 1 });

    const [r1, r2] = await Promise.all([
      request(app).post('/api/pedidos').set('Authorization', `Bearer ${t1}`).send({ direccion_envio: 'Calle 1 # 2-3' }),
      request(app).post('/api/pedidos').set('Authorization', `Bearer ${t2}`).send({ direccion_envio: 'Calle 4 # 5-6' }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    assert.equal(loser.body.codigo, 'STOCK_INSUFICIENTE');

    const dbProd = await query('SELECT existencias FROM producto WHERE id_producto = $1', [prodId]);
    assert.equal(dbProd.rows[0].existencias, 0);
  });

  it('detecta variación de precio con 409 PRECIO_ACTUALIZADO, procesa pago 1:N y expiración híbrida sin doble restitución', async () => {
    const admRes = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const adminToken = admRes.body.datos.token;
    const prodId = await createProduct(adminToken, 4, 200000);
    const cliToken = await createClient('33333333', 'c3@example.com');

    await request(app)
      .post('/api/carrito/items')
      .set('Authorization', `Bearer ${cliToken}`)
      .send({ id_producto: prodId, cantidad: 2 });

    // Admin sube el precio mientras está en el carrito
    await request(app)
      .put(`/api/admin/productos/${prodId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Bici Pro',
        descripcion: 'Cuadro carbono',
        precio: 220000,
        imagen_url: 'https://cdn.example.com/mtb.jpg',
      });

    const staleCheckout = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${cliToken}`)
      .send({ direccion_envio: 'Carrera 10 # 20-30' });
    assert.equal(staleCheckout.status, 409);
    assert.equal(staleCheckout.body.codigo, 'PRECIO_ACTUALIZADO');
    assert.equal(staleCheckout.body.detalles.carrito.total, '440000.00');

    // Confirmación con precio ya actualizado
    const okCheckout = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${cliToken}`)
      .send({ direccion_envio: 'Carrera 10 # 20-30' });
    assert.equal(okCheckout.status, 201);
    const pedidoId = okCheckout.body.datos.id_pedido;

    // Cliente no puede enviar bandera de resultado en pago (Zod strict -> 400)
    const badFlag = await request(app)
      .post(`/api/pedidos/${pedidoId}/pagos`)
      .set('Authorization', `Bearer ${cliToken}`)
      .send({ metodo_pago: 'PSE', referencia_simulada: 'REF-100', estado_pago: 'APROBADO' });
    assert.equal(badFlag.status, 400);

    // Intento 1 terminado en '00' -> RECHAZADO desde backend
    const pRech = await request(app)
      .post(`/api/pedidos/${pedidoId}/pagos`)
      .set('Authorization', `Bearer ${cliToken}`)
      .set('Idempotency-Key', 'pay-k1')
      .send({ metodo_pago: 'TARJETA', referencia_simulada: 'VISA-9900' });
    assert.equal(pRech.status, 201);
    assert.equal(pRech.body.datos.pago.estado_pago, 'RECHAZADO');
    assert.equal(pRech.body.datos.estado_pedido, 'PENDIENTE');

    // Doble clic misma clave devuelve 200 sin crear segundo intento
    const pReplay = await request(app)
      .post(`/api/pedidos/${pedidoId}/pagos`)
      .set('Authorization', `Bearer ${cliToken}`)
      .set('Idempotency-Key', 'pay-k1')
      .send({ metodo_pago: 'TARJETA', referencia_simulada: 'VISA-9900' });
    assert.equal(pReplay.status, 200);
    assert.equal(pReplay.body.datos.pago.numero_intento, 1);

    // Simular vencimiento de los 15 minutos en SQL y competir pago perezoso vs barrido del job
    await query(`UPDATE pedido SET fecha_expiracion = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id_pedido = $1`, [pedidoId]);

    const [payExpiredRes, sweepCount] = await Promise.all([
      request(app)
        .post(`/api/pedidos/${pedidoId}/pagos`)
        .set('Authorization', `Bearer ${cliToken}`)
        .set('Idempotency-Key', 'pay-k2')
        .send({ metodo_pago: 'PSE', referencia_simulada: 'PSE-12345' }),
      ejecutarBarridoExpiracion(),
    ]);

    assert.equal(payExpiredRes.status, 409);
    assert.equal(payExpiredRes.body.codigo, 'RESERVA_EXPIRADA');
    assert.ok(sweepCount === 0 || sweepCount === 1);

    // Existencias deben haber vuelto exactamente a 4 (no 6 ni 2)
    const prodAfter = await query(`SELECT existencias FROM producto WHERE id_producto = $1`, [prodId]);
    assert.equal(prodAfter.rows[0].existencias, 4);

    // Volver al carrito desde pedido CANCELADO
    const volverUuid = '22222222-2222-4222-8222-222222222222';
    const volverRes = await request(app)
      .post(`/api/pedidos/${pedidoId}/volver-al-carrito`)
      .set('Authorization', `Bearer ${cliToken}`)
      .set('Idempotency-Key', volverUuid);
    assert.equal(volverRes.status, 200);
    assert.equal(volverRes.body.datos.replayed, false);
    assert.equal(volverRes.body.datos.items[0].cantidad, 2);

    // Límite de body JSON > 100kb rechazado
    const hugeBody = { direccion_envio: 'x'.repeat(120000) };
    const overLimit = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${cliToken}`).send(hugeBody);
    assert.equal(overLimit.status, 413);
  });

  it('expira perezosamente en 00:00 al volver al carrito sin esperar barrido ni duplicar stock', async () => {
    const admRes = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const adminToken = admRes.body.datos.token;
    const prodId = await createProduct(adminToken, 5, 300000);
    const cliToken = await createClient('44444444', 'c4@example.com');

    await request(app)
      .post('/api/carrito/items')
      .set('Authorization', `Bearer ${cliToken}`)
      .send({ id_producto: prodId, cantidad: 2 });

    const pedRes = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${cliToken}`)
      .send({ direccion_envio: 'Avenida Siempre Viva 742' });
    assert.equal(pedRes.status, 201);
    const pedidoId = pedRes.body.datos.id_pedido;

    // Confirmamos que aún vigente (no expirado) devuelve 409 TRANSICION_ESTADO_INVALIDA
    const earlyUuid = '33333333-3333-4333-8333-333333333333';
    const notExpiredRes = await request(app)
      .post(`/api/pedidos/${pedidoId}/volver-al-carrito`)
      .set('Authorization', `Bearer ${cliToken}`)
      .set('Idempotency-Key', earlyUuid);
    assert.equal(notExpiredRes.status, 409);
    assert.equal(notExpiredRes.body.codigo, 'TRANSICION_ESTADO_INVALIDA');

    // Simular reloj llegando exactamente a 00:00 (vencido sin que haya corrido el barrido de 60s)
    await query(
      `UPDATE pedido SET fecha_expiracion = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id_pedido = $1`,
      [pedidoId]
    );

    const expiredBackUuid = '44444444-4444-4444-8444-444444444444';
    const [volverRes, sweepCount] = await Promise.all([
      request(app)
        .post(`/api/pedidos/${pedidoId}/volver-al-carrito`)
        .set('Authorization', `Bearer ${cliToken}`)
        .set('Idempotency-Key', expiredBackUuid),
      ejecutarBarridoExpiracion(),
    ]);

    assert.equal(volverRes.status, 200);
    assert.equal(volverRes.body.datos.replayed, false);
    assert.equal(volverRes.body.datos.items.length, 1);
    assert.equal(volverRes.body.datos.items[0].cantidad, 2);
    assert.ok(sweepCount === 0 || sweepCount === 1);

    // Stock restituido exactamente a 5 (sin doble restitución) y pedido en CANCELADO
    const prodDb = await query(`SELECT existencias FROM producto WHERE id_producto = $1`, [prodId]);
    assert.equal(prodDb.rows[0].existencias, 5);

    const pedDb = await query(`SELECT estado_pedido FROM pedido WHERE id_pedido = $1`, [pedidoId]);
    assert.equal(pedDb.rows[0].estado_pedido, 'CANCELADO');

    // Reintento idempotente no duplica cantidades
    const replayRes = await request(app)
      .post(`/api/pedidos/${pedidoId}/volver-al-carrito`)
      .set('Authorization', `Bearer ${cliToken}`)
      .set('Idempotency-Key', expiredBackUuid);
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.body.datos.replayed, true);
    assert.equal(replayRes.body.datos.items[0].cantidad, 2);
  });
});
