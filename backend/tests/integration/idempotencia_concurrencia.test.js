import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query, withTransaction } from '../../src/config/db.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';
import { sha256Hex } from '../../src/utils/password.js';

describe('Integración Idempotencia Persistente B1, Concurrencia, Bloqueos, CHECK 23514, 40P01->503 y SSRF/SVG', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, producto, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    await query(`INSERT INTO categoria (nombre, descripcion) VALUES ('Ruta', 'Bicis ruta')`);
    resetRateLimiters();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function setupAdminAndClient() {
    const admRes = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const adminToken = admRes.body.datos.token;

    const p1 = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Bici Carbono X',
        descripcion: 'Marco liviano',
        precio: 1200000,
        existencias: 5,
        imagen_url: 'https://cdn.example.com/carbono.webp',
      });
    assert.equal(p1.status, 201);

    const p2 = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Casco Trail',
        descripcion: 'Protección',
        precio: 150000,
        existencias: 3,
        imagen_url: 'https://cdn.example.com/casco.jpg',
      });
    assert.equal(p2.status, 201);

    const reg = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '70123456',
      nombre: 'Daniel',
      primer_apellido: 'Soto',
      telefono: '3150001122',
      correo: 'daniel.soto@example.com',
      contrasena: 'Password2026',
    });
    assert.equal(reg.status, 201);

    const cliLogin = await request(app).post('/api/auth/login').send({
      correo: 'daniel.soto@example.com',
      contrasena: 'Password2026',
    });
    assert.equal(cliLogin.status, 200);

    return {
      adminToken,
      clientToken: cliLogin.body.datos.token,
      clientId: cliLogin.body.datos.usuario.id_usuario,
      p1Id: p1.body.datos.id_producto,
      p2Id: p2.body.datos.id_producto,
    };
  }

  it('exige UUID Idempotency-Key en /fusionar y /volver-al-carrito, resuelve concurrencia y retención sin crear carrito con ON DELETE SET NULL', async () => {
    const { clientToken, clientId, p1Id } = await setupAdminAndClient();

    // Rechaza ausencia o clave no-UUID con 400 VALIDACION_INVALIDA
    const missingFus = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ schema_version: 1, items: [{ id_producto: p1Id, cantidad: 1 }] });
    assert.equal(missingFus.status, 400);
    assert.equal(missingFus.body.codigo, 'VALIDACION_INVALIDA');

    const badBack = await request(app)
      .post('/api/pedidos/1/volver-al-carrito')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', 'no-uuid-key');
    assert.equal(badBack.status, 400);
    assert.equal(badBack.body.codigo, 'VALIDACION_INVALIDA');

    // Concurrencia simultánea en /fusionar con la misma clave UUID
    const fusUuid = crypto.randomUUID();
    const fusPayload = { schema_version: 1, items: [{ id_producto: p1Id, cantidad: 2 }] };

    const [f1, f2] = await Promise.all([
      request(app)
        .post('/api/carrito/fusionar')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('Idempotency-Key', fusUuid)
        .send(fusPayload),
      request(app)
        .post('/api/carrito/fusionar')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('Idempotency-Key', fusUuid)
        .send(fusPayload),
    ]);

    assert.equal(f1.status, 200);
    assert.equal(f2.status, 200);
    assert.deepEqual([f1.body.datos.replayed, f2.body.datos.replayed].sort(), [false, true]);
    assert.equal(f1.body.datos.items[0].cantidad, 2);
    assert.equal(f2.body.datos.items[0].cantidad, 2);

    const idCarritoOriginal = f1.body.datos.id_carrito;

    // Convertir carrito a pedido y luego eliminar físicamente el carrito para verificar ON DELETE SET NULL
    const ped = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ direccion_envio: 'Calle 80 # 15-20' });
    assert.equal(ped.status, 201);

    await query(`DELETE FROM carrito WHERE id_carrito = $1`, [idCarritoOriginal]);
    const idemRow = await query(
      `SELECT id_carrito FROM carrito_fusion_idempotencia WHERE id_usuario = $1 AND clave_idempotencia = $2`,
      [clientId, fusUuid]
    );
    assert.equal(idemRow.rows.length, 1);
    assert.equal(idemRow.rows[0].id_carrito, null);

    // Retención sin crear carrito: el replay devuelve 200 replayed:true y NO crea carrito nuevo
    const replayNoCart = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', fusUuid)
      .send(fusPayload);
    assert.equal(replayNoCart.status, 200);
    assert.equal(replayNoCart.body.datos.replayed, true);
    assert.equal(replayNoCart.body.datos.items[0].cantidad, 2);

    const activeCartCount = await query(
      `SELECT COUNT(*)::INT AS cnt FROM carrito WHERE id_usuario = $1 AND estado = 'ACTIVO'`,
      [clientId]
    );
    assert.equal(activeCartCount.rows[0].cnt, 0);
  });

  it('canonicaliza ítems en distinto orden o divididos en /api/carrito/fusionar evitando falsos 409', async () => {
    const { clientToken, p1Id, p2Id } = await setupAdminAndClient();
    const fusUuid = crypto.randomUUID();

    // Primera fusión: [p2 x2, p1 x1]
    const f1 = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', fusUuid)
      .send({
        schema_version: 1,
        items: [
          { id_producto: p2Id, cantidad: 2 },
          { id_producto: p1Id, cantidad: 1 },
        ],
      });
    assert.equal(f1.status, 200);
    assert.equal(f1.body.datos.replayed, false);

    // Reintento en distinto orden [p1 x1, p2 x2] -> debe responder 200 replayed:true
    const fReordered = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', fusUuid)
      .send({
        schema_version: 1,
        items: [
          { id_producto: p1Id, cantidad: 1 },
          { id_producto: p2Id, cantidad: 2 },
        ],
      });
    assert.equal(fReordered.status, 200);
    assert.equal(fReordered.body.datos.replayed, true);

    // Reintento con ítems divididos [p2 x1, p1 x1, p2 x1] -> mismo total agrupado -> 200 replayed:true
    const fSplit = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', fusUuid)
      .send({
        schema_version: 1,
        items: [
          { id_producto: p2Id, cantidad: 1 },
          { id_producto: p1Id, cantidad: 1 },
          { id_producto: p2Id, cantidad: 1 },
        ],
      });
    assert.equal(fSplit.status, 200);
    assert.equal(fSplit.body.datos.replayed, true);
  });

  it('ejecuta volver-al-carrito en 2 fases con concurrencia, conflicto otra orden, ya devuelto otra clave y replay sin crear carrito', async () => {
    const { clientToken, clientId, p1Id, p2Id } = await setupAdminAndClient();

    // Crear Pedido 1 y cancelarlo
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p1Id, cantidad: 2 });
    const ped1Res = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir 100' });
    const ped1Id = ped1Res.body.datos.id_pedido;
    await request(app).post(`/api/pedidos/${ped1Id}/cancelar`).set('Authorization', `Bearer ${clientToken}`).send({ motivo_cancelacion: 'Prueba' });

    // Crear Pedido 2 y cancelarlo
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p2Id, cantidad: 1 });
    const ped2Res = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir 200' });
    const ped2Id = ped2Res.body.datos.id_pedido;
    await request(app).post(`/api/pedidos/${ped2Id}/cancelar`).set('Authorization', `Bearer ${clientToken}`).send({ motivo_cancelacion: 'Prueba 2' });

    // Concurrencia simultánea en volver-al-carrito sobre Pedido 1 con misma clave UUID
    const backUuid = crypto.randomUUID();
    const [b1, b2] = await Promise.all([
      request(app)
        .post(`/api/pedidos/${ped1Id}/volver-al-carrito`)
        .set('Authorization', `Bearer ${clientToken}`)
        .set('Idempotency-Key', backUuid),
      request(app)
        .post(`/api/pedidos/${ped1Id}/volver-al-carrito`)
        .set('Authorization', `Bearer ${clientToken}`)
        .set('Idempotency-Key', backUuid),
    ]);
    assert.equal(b1.status, 200);
    assert.equal(b2.status, 200);
    assert.deepEqual([b1.body.datos.replayed, b2.body.datos.replayed].sort(), [false, true]);
    assert.equal(b1.body.datos.items.length, 1);
    assert.equal(b1.body.datos.items[0].cantidad, 2);

    // Usar misma clave en Pedido 2 -> 409 IDEMPOTENCY_CONFLICT
    const conflictOtherOrder = await request(app)
      .post(`/api/pedidos/${ped2Id}/volver-al-carrito`)
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', backUuid);
    assert.equal(conflictOtherOrder.status, 409);
    assert.equal(conflictOtherOrder.body.codigo, 'IDEMPOTENCY_CONFLICT');

    // Usar otra clave en Pedido 1 (ya devuelto) -> 409 TRANSICION_ESTADO_INVALIDA
    const alreadyReturnedOtherKey = await request(app)
      .post(`/api/pedidos/${ped1Id}/volver-al-carrito`)
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', crypto.randomUUID());
    assert.equal(alreadyReturnedOtherKey.status, 409);
    assert.equal(alreadyReturnedOtherKey.body.codigo, 'TRANSICION_ESTADO_INVALIDA');

    // Convertir carrito actual a Pedido 3 -> cliente sin carrito ACTIVO
    const ped3Res = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir 300' });
    assert.equal(ped3Res.status, 201);

    // Replay exacto sobre Pedido 1 devuelve 200 replayed:true SIN crear carrito nuevo
    const replayAfterConvert = await request(app)
      .post(`/api/pedidos/${ped1Id}/volver-al-carrito`)
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', backUuid);
    assert.equal(replayAfterConvert.status, 200);
    assert.equal(replayAfterConvert.body.datos.replayed, true);

    const activeCartCount = await query(
      `SELECT COUNT(*)::INT AS cnt FROM carrito WHERE id_usuario = $1 AND estado = 'ACTIVO'`,
      [clientId]
    );
    assert.equal(activeCartCount.rows[0].cnt, 0);
  });

  it('pre-transacción en crearPedidoDesdeCarrito expira pedido vencido incluso si la tx principal falla con 409 STOCK_INSUFICIENTE', async () => {
    const { clientToken, p1Id } = await setupAdminAndClient();

    // Stock inicial = 5. Reserva 2 unidades en pedido 1 (quedan 3) y luego vence
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p1Id, cantidad: 2 });
    const ped1 = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir 1' });
    assert.equal(ped1.status, 201);
    const ped1Id = ped1.body.datos.id_pedido;

    await query(`UPDATE pedido SET fecha_expiracion = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id_pedido = $1`, [ped1Id]);

    // Agrega 3 unidades al nuevo carrito (disponibles = 3) y luego simula agotamiento externo a 0
    const addCart = await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p1Id, cantidad: 3 });
    assert.equal(addCart.status, 201);
    await query(`UPDATE producto SET existencias = 0 WHERE id_producto = $1`, [p1Id]);

    // Checkout: pre-tx expira ped1 (restituye 2 -> stock=2), tx principal falla con 409 STOCK_INSUFICIENTE (pide 3 > 2)
    const failCheckout = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ direccion_envio: 'Dir 2' });
    assert.equal(failCheckout.status, 409);
    assert.equal(failCheckout.body.codigo, 'STOCK_INSUFICIENTE');

    // La expiración de ped1 y su restitución NO sufrieron rollback
    const ped1Db = await query(`SELECT estado_pedido FROM pedido WHERE id_pedido = $1`, [ped1Id]);
    assert.equal(ped1Db.rows[0].estado_pedido, 'CANCELADO');
    const stockDb = await query(`SELECT existencias FROM producto WHERE id_producto = $1`, [p1Id]);
    assert.equal(stockDb.rows[0].existencias, 2);
  });

  it('soporta concurrencia en orden inverso (checkout vs fusionar/volver/admin usuarios) sin deadlocks no recuperables', async () => {
    const { adminToken, clientToken, p1Id, p2Id } = await setupAdminAndClient();

    // Crear un segundo admin y un segundo cliente para probar cambios concurrentes sin revocar clientToken
    const regAdmin2 = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '70999888',
      nombre: 'Admin',
      primer_apellido: 'Dos',
      telefono: '3159998877',
      correo: 'admin2@example.com',
      contrasena: 'Password2026',
    });
    const admin2Id = regAdmin2.body.datos.id_usuario;
    await request(app)
      .patch(`/api/admin/usuarios/${admin2Id}/rol`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rol: 'ADMIN' });

    const regOther = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '70888777',
      nombre: 'Otro',
      primer_apellido: 'Usuario',
      telefono: '3158887766',
      correo: 'otro.usuario@example.com',
      contrasena: 'Password2026',
    });
    const otherId = regOther.body.datos.id_usuario;

    const [admOp1, admOp2] = await Promise.all([
      request(app)
        .patch(`/api/admin/usuarios/${admin2Id}/estado`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ estado_usuario: 'INACTIVO' }),
      request(app)
        .patch(`/api/admin/usuarios/${otherId}/rol`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rol: 'ADMIN' }),
    ]);
    assert.equal(admOp1.status, 200);
    assert.equal(admOp2.status, 200);

    // Concurrencia entre agregarItemCarrito y fusionarCarrito sobre el mismo usuario
    const [addR, fusR] = await Promise.all([
      request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p1Id, cantidad: 1 }),
      request(app)
        .post('/api/carrito/fusionar')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ schema_version: 1, items: [{ id_producto: p2Id, cantidad: 1 }] }),
    ]);
    assert.equal(addR.status, 201);
    assert.equal(fusR.status, 200);
  });

  it('aplica restricciones CHECK 23514 en sesion_refresh, carrito_fusion_idempotencia y pedido', async () => {
    const { clientToken, clientId, p1Id } = await setupAdminAndClient();

    // 1. sesion_refresh: fecha_expiracion <= fecha_creacion -> 23514
    await assert.rejects(
      () =>
        query(
          `INSERT INTO sesion_refresh (id_usuario, token_hash, familia_id, fecha_creacion, fecha_expiracion)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [clientId, sha256Hex('bad-dates'), crypto.randomUUID()]
        ),
      (err) => err.code === '23514'
    );

    // 2. sesion_refresh: motivo_revocacion inválido -> 23514
    await assert.rejects(
      () =>
        query(
          `INSERT INTO sesion_refresh (id_usuario, token_hash, familia_id, fecha_expiracion, fecha_revocacion, motivo_revocacion)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, 'MOTIVO_FALSO')`,
          [clientId, sha256Hex('bad-motivo'), crypto.randomUUID()]
        ),
      (err) => err.code === '23514'
    );

    // 3. sesion_refresh: reemplazo_cifrado sin motivo ROTACION -> 23514
    await assert.rejects(
      () =>
        query(
          `INSERT INTO sesion_refresh (id_usuario, token_hash, familia_id, fecha_expiracion, reemplazo_cifrado, reemplazo_expira_en)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day', 'v1:x:y:z', CURRENT_TIMESTAMP + INTERVAL '30 seconds')`,
          [clientId, sha256Hex('bad-replay'), crypto.randomUUID()]
        ),
      (err) => err.code === '23514'
    );

    // 4. carrito_fusion_idempotencia: resultado_json debe ser objeto JSONB -> 23514
    await assert.rejects(
      () =>
        query(
          `INSERT INTO carrito_fusion_idempotencia (id_usuario, id_carrito, clave_idempotencia, payload_hash, resultado_json)
           VALUES ($1, NULL, $2, $3, '[]'::jsonb)`,
          [clientId, crypto.randomUUID(), sha256Hex('arr')]
        ),
      (err) => err.code === '23514'
    );

    // 5. pedido: devolver al carrito inconsistente en PENDIENTE o parcial -> 23514
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p1Id, cantidad: 1 });
    const ped = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir CHECK' });
    const pedId = ped.body.datos.id_pedido;

    await assert.rejects(
      () =>
        query(
          `UPDATE pedido
           SET clave_idempotencia_carrito = $2,
               fecha_devolucion_carrito = CURRENT_TIMESTAMP,
               resultado_devolucion_carrito = '{"ok":true}'::jsonb
           WHERE id_pedido = $1`,
          [pedId, crypto.randomUUID()]
        ),
      (err) => err.code === '23514'
    );
  });

  it('reintenta 40P01/40001 en withTransaction y mapea agotamiento a 503 CONFLICTO_CONCURRENCIA', async () => {
    let calls = 0;
    const okResult = await withTransaction(async () => {
      calls += 1;
      if (calls === 1) {
        const e = new Error('deadlock detected');
        e.code = '40P01';
        throw e;
      }
      if (calls === 2) {
        const e = new Error('could not serialize access');
        e.code = '40001';
        throw e;
      }
      return 'RECUPERADO';
    });
    assert.equal(okResult, 'RECUPERADO');
    assert.equal(calls, 3);

    // Agotar reintentos y verificar que errorHandler responde HTTP 503 CONFLICTO_CONCURRENCIA
    const miniApp = express();
    miniApp.post('/deadlock-test', async (_req, res, next) => {
      try {
        await withTransaction(
          async () => {
            const e = new Error('deadlock persistente');
            e.code = '40P01';
            throw e;
          },
          { maxRetries: 1 }
        );
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
    miniApp.use(errorHandler);

    const fail503 = await request(miniApp).post('/deadlock-test');
    assert.equal(fail503.status, 503);
    assert.equal(fail503.body.ok, false);
    assert.equal(fail503.body.codigo, 'CONFLICTO_CONCURRENCIA');
  });

  it('rechaza imagen_url con SVG o vectores SSRF en POST y PUT /api/admin/productos', async () => {
    const { adminToken, p1Id } = await setupAdminAndClient();

    const badUrls = [
      'https://cdn.example.com/icono.svg',
      'https://cdn.example.com/icono.svgz',
      'https://cdn.example.com/icono.svg.png',
      'https://cdn.example.com/pic?file=icono.svg',
      'https://cdn.example.com/pic?download=evil.svgz',
      'https://cdn.example.com/img?format=svg',
      'https://cdn.example.com/img?fm=svg',
      'https://cdn.example.com/img?ext=svg',
      'https://cdn.example.com/image/svg+xml',
      'http://127.0.0.1/bici.jpg',
      'http://169.254.169.254/latest/meta-data',
      'http://localhost/bici.jpg',
      'http://192.168.1.50/bici.jpg',
      'http://[::1]/bici.jpg',
      'http://[64:ff9b::127.0.0.1]/bici.png',
      'https://user:secret@cdn.example.com/bici.jpg',
      'http://printer.local/bici.jpg',
    ];

    for (const imagen_url of badUrls) {
      const postRes = await request(app)
        .post('/api/admin/productos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id_categoria: 1,
          nombre: 'Producto Inválido',
          descripcion: 'Prueba URL insegura',
          precio: 100000,
          existencias: 1,
          imagen_url,
        });
      assert.equal(postRes.status, 400, `POST debió rechazar ${imagen_url}`);
      assert.equal(postRes.body.ok, false);
      assert.equal(postRes.body.codigo, 'VALIDACION_INVALIDA');
      assert.ok(Array.isArray(postRes.body.detalles) && postRes.body.detalles.length > 0);
      assert.equal(postRes.body.mensaje, postRes.body.detalles[0].message);

      const putRes = await request(app)
        .put(`/api/admin/productos/${p1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id_categoria: 1,
          nombre: 'Bici Carbono X',
          descripcion: 'Marco liviano',
          precio: 1200000,
          imagen_url,
        });
      assert.equal(putRes.status, 400, `PUT debió rechazar ${imagen_url}`);
      assert.equal(putRes.body.ok, false);
      assert.equal(putRes.body.codigo, 'VALIDACION_INVALIDA');
      assert.ok(Array.isArray(putRes.body.detalles) && putRes.body.detalles.length > 0);
      assert.equal(putRes.body.mensaje, putRes.body.detalles[0].message);
    }
  });
});
