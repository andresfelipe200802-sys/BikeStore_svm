import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query } from '../../src/config/db.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';
import { clearCarritoIdempotencyCache } from '../../src/services/carrito.service.js';

describe('Integración Catálogo y Fusión de Carrito', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, producto, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    await query(`INSERT INTO categoria (nombre, descripcion) VALUES ('Ruta', 'Bicis ruta'), ('Cascos', 'Protección')`);
    resetRateLimiters();
    clearCarritoIdempotencyCache();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function setupUsersAndProducts() {
    const adminLogin = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const adminToken = adminLogin.body.datos.token;

    await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '1002003004',
      nombre: 'Mateo',
      primer_apellido: 'Silva',
      telefono: '3001112233',
      correo: 'mateo@example.com',
      contrasena: 'Password2026',
    });
    const cliLogin = await request(app).post('/api/auth/login').send({
      correo: 'mateo@example.com',
      contrasena: 'Password2026',
    });

    const p1 = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 1,
        nombre: 'Bici Ruta 100%',
        descripcion: 'Marco aluminio',
        precio: 1500000,
        existencias: 3,
        imagen_url: 'https://cdn.example.com/ruta.jpg',
      });

    const p2 = await request(app)
      .post('/api/admin/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_categoria: 2,
        nombre: 'Casco Aero_Pro',
        descripcion: 'Ventilado',
        precio: 250000,
        existencias: 0,
        imagen_url: 'https://cdn.example.com/casco.jpg',
      });

    return {
      adminToken,
      clientToken: cliLogin.body.datos.token,
      p1Id: p1.body.datos.id_producto,
      p2Id: p2.body.datos.id_producto,
    };
  }

  it('oculta categoría inactiva, escapa %/_ en q y muestra agotados', async () => {
    const { adminToken, p1Id, p2Id } = await setupUsersAndProducts();

    // Búsqueda con comodín % literal encuentra solo 'Bici Ruta 100%'
    const qRes = await request(app).get('/api/productos').query({ q: '100%' });
    assert.equal(qRes.status, 200);
    assert.equal(qRes.body.datos.length, 1);
    assert.equal(qRes.body.datos[0].id_producto, p1Id);

    // Producto con existencias=0 sigue visible con agotado=true
    const detAgotado = await request(app).get(`/api/productos/${p2Id}`);
    assert.equal(detAgotado.status, 200);
    assert.equal(detAgotado.body.datos.agotado, true);

    // Inactivar categoría 2 oculta p2 del catálogo público y detalle
    const inactCat = await request(app)
      .patch('/api/admin/categorias/2/estado')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado: false });
    assert.equal(inactCat.status, 200);

    const hiddenDet = await request(app).get(`/api/productos/${p2Id}`);
    assert.equal(hiddenDet.status, 404);
  });

  it('fusiona carrito visitante idempotentemente aplicando tope de existencias y ajustes[]', async () => {
    const { clientToken, p1Id, p2Id } = await setupUsersAndProducts();

    const payload = {
      schema_version: 1,
      items: [
        { id_producto: p1Id, cantidad: 5 }, // Stock es 3 -> ajusta a 3
        { id_producto: p2Id, cantidad: 2 }, // Stock es 0 -> descarta
      ],
    };

    const f1 = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', 'fus-001')
      .send(payload);
    assert.equal(f1.status, 200);
    assert.equal(f1.body.datos.items.length, 1);
    assert.equal(f1.body.datos.items[0].cantidad, 3);
    assert.equal(f1.body.datos.ajustes.length, 2);

    // Reintento con misma Idempotency-Key no duplica ni falla
    const f2 = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', 'fus-001')
      .send(payload);
    assert.equal(f2.status, 200);
    assert.equal(f2.body.datos.items[0].cantidad, 3);

    // Reutilizar misma clave con distinto payload retorna 409 IDEMPOTENCY_CONFLICT
    const fConflict = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', 'fus-001')
      .send({ schema_version: 1, items: [{ id_producto: p1Id, cantidad: 1 }] });
    assert.equal(fConflict.status, 409);
    assert.equal(fConflict.body.codigo, 'IDEMPOTENCY_CONFLICT');
  });
});
