import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query } from '../../src/config/db.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';
import { toBogotaDateParts } from '../../src/utils/festivos.js';

describe('Integración Admin Categorías, Cancelación/Reembolso y Reportes Netos', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, producto, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    await query(`INSERT INTO categoria (nombre) VALUES ('Ruta'), ('Accesorios')`);
    resetRateLimiters();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function setupScenario() {
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
        nombre: 'Bici Aero',
        descripcion: 'Aluminio',
        precio: 100000,
        existencias: 10,
        imagen_url: 'https://cdn.example.com/aero.jpg',
      });

    const p2 = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 2,
        nombre: 'Luces LED',
        descripcion: 'Recargables',
        precio: 50000,
        existencias: 10,
        imagen_url: 'https://cdn.example.com/led.jpg',
      });

    await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '777888999',
      nombre: 'Andrés',
      primer_apellido: 'Pérez',
      telefono: '3019998877',
      correo: 'andres.perez@example.com',
      contrasena: 'Password2026',
    });
    const cliLogin = await request(app).post('/api/auth/login').send({
      correo: 'andres.perez@example.com',
      contrasena: 'Password2026',
    });

    return {
      adminToken,
      clientToken: cliLogin.body.datos.token,
      p1Id: p1.body.datos.id_producto,
      p2Id: p2.body.datos.id_producto,
    };
  }

  it('protege categorías con productos (409 CATEGORIA_CON_PRODUCTOS) y separa PUT de existencias', async () => {
    const { adminToken, p1Id } = await setupScenario();

    const delBlocked = await request(app)
      .delete('/api/admin/categorias/1')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(delBlocked.status, 409);
    assert.equal(delBlocked.body.codigo, 'CATEGORIA_CON_PRODUCTOS');

    // PUT producto no acepta ni modifica existencias
    const badPut = await request(app)
      .put(`/api/admin/productos/${p1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Bici Aero V2',
        descripcion: 'Actualizada',
        precio: 120000,
        existencias: 99,
        imagen_url: 'https://cdn.example.com/aero2.jpg',
      });
    assert.equal(badPut.status, 400);

    const okPut = await request(app)
      .put(`/api/admin/productos/${p1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Bici Aero V2',
        descripcion: 'Actualizada',
        precio: 120000,
        imagen_url: 'https://cdn.example.com/aero2.jpg',
      });
    assert.equal(okPut.status, 200);
    assert.equal(okPut.body.datos.existencias, 10);

    const patchStock = await request(app)
      .patch(`/api/admin/productos/${p1Id}/existencias`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ existencias: 15 });
    assert.equal(patchStock.status, 200);
    assert.equal(patchStock.body.datos.existencias, 15);
  });

  it('gestiona cancelación pre-envío + reembolso total y calcula reportes netos exactos acotados a 90 días', async () => {
    const { adminToken, clientToken, p1Id, p2Id } = await setupScenario();

    // Pedido 1 (100.000) pagado y cancelado pre-envío
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p1Id, cantidad: 1 });
    const ped1 = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir 1' });
    const idPed1 = ped1.body.datos.id_pedido;
    await request(app).post(`/api/pedidos/${idPed1}/pagos`).set('Authorization', `Bearer ${clientToken}`).send({ metodo_pago: 'PSE', referencia_simulada: 'PSE-111' });

    // Cancelar por cliente con datos_reembolso
    const canc = await request(app)
      .post(`/api/pedidos/${idPed1}/cancelar`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ motivo_cancelacion: 'Ya no lo requiero', datos_reembolso: 'Nequi 3019998877' });
    assert.equal(canc.status, 200);
    assert.equal(canc.body.datos.estado_reembolso_cancelacion, 'PENDIENTE_REEMBOLSO');

    // Pedido 2 (50.000) pagado y vigente
    await request(app).post('/api/carrito/items').set('Authorization', `Bearer ${clientToken}`).send({ id_producto: p2Id, cantidad: 1 });
    const ped2 = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${clientToken}`).send({ direccion_envio: 'Dir 2' });
    const idPed2 = ped2.body.datos.id_pedido;
    await request(app).post(`/api/pedidos/${idPed2}/pagos`).set('Authorization', `Bearer ${clientToken}`).send({ metodo_pago: 'TARJETA', referencia_simulada: 'MC-2222' });

    const todayBog = toBogotaDateParts(new Date()).isoDate;

    // Antes de confirmar el reembolso pre-envío: bruto=150000, efectivo=0, pendiente=100000
    const repBefore = await request(app)
      .get('/api/admin/reportes/resumen')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ desde: todayBog, hasta: todayBog });
    assert.equal(repBefore.status, 200);
    assert.equal(repBefore.body.datos.ventas_brutas_aprobadas, '150000.00');
    assert.equal(repBefore.body.datos.reembolsos_efectivos, '0.00');
    assert.equal(repBefore.body.datos.ventas_netas, '150000.00');
    assert.equal(repBefore.body.datos.pendiente_por_reembolsar, '100000.00');

    // Admin confirma reembolso total de Pedido 1 -> pago pasa a REEMBOLSADO
    const confReemb = await request(app)
      .patch(`/api/admin/pedidos/${idPed1}/reembolso`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ observacion: 'Devuelto por Nequi' });
    assert.equal(confReemb.status, 200);
    assert.equal(confReemb.body.datos.estado_reembolso_cancelacion, 'REEMBOLSADO');

    const pg1 = await query(`SELECT estado_pago FROM pago WHERE id_pedido = $1`, [idPed1]);
    assert.equal(pg1.rows[0].estado_pago, 'REEMBOLSADO');

    // Ahora ventas_netas = 150000 - 100000 = 50000
    const repAfter = await request(app)
      .get('/api/admin/reportes/resumen')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ desde: todayBog, hasta: todayBog });
    assert.equal(repAfter.status, 200);
    assert.equal(repAfter.body.datos.ventas_brutas_aprobadas, '150000.00');
    assert.equal(repAfter.body.datos.reembolsos_efectivos, '100000.00');
    assert.equal(repAfter.body.datos.ventas_netas, '50000.00');

    // Filtro por categoría 2 devuelve únicamente 50000 netos
    const repCat2 = await request(app)
      .get('/api/admin/reportes/ventas')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ desde: todayBog, hasta: todayBog, id_categoria: 2 });
    assert.equal(repCat2.status, 200);
    assert.equal(repCat2.body.datos.length, 1);
    assert.equal(repCat2.body.datos[0].monto_neto, '50000.00');

    // Rango > 90 días rechazado con 400 RANGO_REPORTES_EXCEDIDO
    const badRange = await request(app)
      .get('/api/admin/reportes/resumen')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ desde: '2026-01-01', hasta: '2026-06-01' });
    assert.equal(badRange.status, 400);
    assert.equal(badRange.body.codigo, 'RANGO_REPORTES_EXCEDIDO');
  });
});
