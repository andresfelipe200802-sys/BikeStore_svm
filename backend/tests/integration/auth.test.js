import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query } from '../../src/config/db.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';
import { clearTestOutbox, getTestOutbox } from '../../src/utils/mailer.js';

describe('Integración Auth, Perfil, Roles y Seguridad', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, token_recuperacion, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    resetRateLimiters();
    clearTestOutbox();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function loginAdmin() {
    const res = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    assert.equal(res.status, 200);
    return res.body.datos.token;
  }

  it('GET /api/health responde 200 con bd=true en UTC', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.datos.estado, 'UP');
    assert.equal(res.body.datos.bd, true);
  });

  it('valida tipos de documento, unicidad y rechazo de campos extra sin exponer hash', async () => {
    const r1 = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'PASAPORTE',
      numero_documento: 'pa998877',
      nombre: 'Camila',
      primer_apellido: 'Rojas',
      telefono: '3101112233',
      correo: 'Camila.Rojas@Example.com',
      contrasena: 'ClaveSegura2026',
    });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.datos.numero_documento, 'PA998877');
    assert.equal(r1.body.datos.correo, 'camila.rojas@example.com');
    assert.equal('contrasena_hash' in r1.body.datos, false);

    // Documento duplicado
    const rDupDoc = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'PASAPORTE',
      numero_documento: 'PA998877',
      nombre: 'Otro',
      primer_apellido: 'Usuario',
      telefono: '3101112233',
      correo: 'otro@example.com',
      contrasena: 'ClaveSegura2026',
    });
    assert.equal(rDupDoc.status, 409);
    assert.equal(rDupDoc.body.codigo, 'DOCUMENTO_DUPLICADO');

    // Correo duplicado case-insensitive
    const rDupMail = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '1020304050',
      nombre: 'Otra',
      primer_apellido: 'Persona',
      telefono: '3101112233',
      correo: 'CAMILA.ROJAS@EXAMPLE.COM',
      contrasena: 'ClaveSegura2026',
    });
    assert.equal(rDupMail.status, 409);
    assert.equal(rDupMail.body.codigo, 'CORREO_DUPLICADO');

    // Mass assignment / campo desconocido bloqueado por Zod
    const rExtra = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'TI',
      numero_documento: '1099887766',
      nombre: 'Juan',
      primer_apellido: 'Diaz',
      telefono: '3101112233',
      correo: 'juan.ti@example.com',
      contrasena: 'ClaveSegura2026',
      rol: 'ADMIN',
    });
    assert.equal(rExtra.status, 400);
    assert.equal(rExtra.body.codigo, 'VALIDACION_INVALIDA');
  });

  it('revoca JWT al hacer logout, cambiar contraseña, inactivar o cambiar rol y protege último ADMIN', async () => {
    const reg = await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: '1112223334',
      nombre: 'Carlos',
      primer_apellido: 'Mendez',
      telefono: '3004445566',
      correo: 'carlos@example.com',
      contrasena: 'Password123',
    });
    const clientId = reg.body.datos.id_usuario;

    const loginRes = await request(app).post('/api/auth/login').send({
      correo: 'carlos@example.com',
      contrasena: 'Password123',
    });
    const token1 = loginRes.body.datos.token;

    // Logout revoca token1 inmediatamente
    const outRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token1}`);
    assert.equal(outRes.status, 200);

    const afterLogout = await request(app).get('/api/perfil').set('Authorization', `Bearer ${token1}`);
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.body.codigo, 'SESION_REVOCADA');

    // Nuevo login + cambio de contraseña revoca nuevo token
    const login2 = await request(app).post('/api/auth/login').send({
      correo: 'carlos@example.com',
      contrasena: 'Password123',
    });
    const token2 = login2.body.datos.token;

    // PUT /api/perfil rechaza correo/rol
    const badPut = await request(app)
      .put('/api/perfil')
      .set('Authorization', `Bearer ${token2}`)
      .send({ nombre: 'Carlos', primer_apellido: 'Mendez', telefono: '3004445566', correo: 'hack@example.com' });
    assert.equal(badPut.status, 400);

    const chgPwd = await request(app)
      .patch('/api/perfil/contrasena')
      .set('Authorization', `Bearer ${token2}`)
      .send({ contrasena_actual: 'Password123', nueva_contrasena: 'NuevaPassword123' });
    assert.equal(chgPwd.status, 200);

    const afterPwd = await request(app).get('/api/perfil').set('Authorization', `Bearer ${token2}`);
    assert.equal(afterPwd.status, 401);
    assert.equal(afterPwd.body.codigo, 'SESION_REVOCADA');

    // Protección del último ADMIN activo
    const adminToken = await loginAdmin();
    const adminProfile = await request(app).get('/api/perfil').set('Authorization', `Bearer ${adminToken}`);
    const adminId = adminProfile.body.datos.id_usuario;

    const blockInactivate = await request(app)
      .patch(`/api/admin/usuarios/${adminId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado_usuario: 'INACTIVO' });
    assert.equal(blockInactivate.status, 409);
    assert.equal(blockInactivate.body.codigo, 'ULTIMO_ADMIN_ACTIVO');

    const blockDowngrade = await request(app)
      .patch(`/api/admin/usuarios/${adminId}/rol`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rol: 'CLIENTE' });
    assert.equal(blockDowngrade.status, 409);
    assert.equal(blockDowngrade.body.codigo, 'ULTIMO_ADMIN_ACTIVO');

    // Promover a Carlos a ADMIN sí funciona y revoca su sesión previa
    const login3 = await request(app).post('/api/auth/login').send({
      correo: 'carlos@example.com',
      contrasena: 'NuevaPassword123',
    });
    const token3 = login3.body.datos.token;

    const promote = await request(app)
      .patch(`/api/admin/usuarios/${clientId}/rol`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rol: 'ADMIN' });
    assert.equal(promote.status, 200);
    assert.equal(promote.body.datos.rol, 'ADMIN');

    const staleRoleReq = await request(app).get('/api/perfil').set('Authorization', `Bearer ${token3}`);
    assert.equal(staleRoleReq.status, 401);
    assert.equal(staleRoleReq.body.codigo, 'SESION_REVOCADA');
  });

  it('recuperación CU-06 responde HTTP 200 neutro inmediato y aplica rate limit 429', async () => {
    await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CE',
      numero_documento: 'CE889900',
      nombre: 'Elena',
      primer_apellido: 'Vargas',
      telefono: '3112223344',
      correo: 'elena@example.com',
      contrasena: 'ClaveInicial1',
    });

    // Correo inexistente también retorna 200 sin enviar correo
    const rNoExiste = await request(app).post('/api/auth/recuperar').send({ correo: 'noexiste@example.com' });
    assert.equal(rNoExiste.status, 200);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(getTestOutbox().length, 0);

    // Correo existente retorna 200 y despacha jsonTransport
    const rExiste = await request(app).post('/api/auth/recuperar').send({ correo: 'elena@example.com' });
    assert.equal(rExiste.status, 200);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(getTestOutbox().length, 1);

    const tokenMatch = getTestOutbox()[0].text.match(/token=([a-f0-9]+)/);
    assert.ok(tokenMatch);
    const resetToken = tokenMatch[1];

    const rReset = await request(app).post('/api/auth/restablecer').send({
      token: resetToken,
      nueva_contrasena: 'ClaveNueva2026',
    });
    assert.equal(rReset.status, 200);

    // Reutilizar token debe fallar
    const rReuse = await request(app).post('/api/auth/restablecer').send({
      token: resetToken,
      nueva_contrasena: 'OtraClave2026',
    });
    assert.equal(rReuse.status, 401);
    assert.equal(rReuse.body.codigo, 'TOKEN_INVALIDO');

    // Rate limit en login (RATE_LIMIT_MAX=10 por defecto)
    let got429 = false;
    for (let i = 0; i < 15; i += 1) {
      const lr = await request(app).post('/api/auth/login').send({
        correo: 'elena@example.com',
        contrasena: 'WrongPassword',
      });
      if (lr.status === 429) {
        assert.equal(lr.body.codigo, 'RATE_LIMIT_EXCEDIDO');
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true);
  });
});
