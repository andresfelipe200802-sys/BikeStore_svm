import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { closePool, query } from '../../src/config/db.js';
import { purgarRegistrosExpiradosLote, resetPurgeThrottle } from '../../src/jobs/expiracionReservas.job.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.middleware.js';
import { runMigrations } from '../../src/scripts/migrate.js';
import { seedInitialAdmin } from '../../src/scripts/seedAdmin.js';
import { clearTestOutbox, getTestOutbox } from '../../src/utils/mailer.js';
import { sha256Hex } from '../../src/utils/password.js';

function extractRefreshCookie(res) {
  const setCookies = res.headers['set-cookie'] || [];
  for (const header of setCookies) {
    if (header.startsWith('bikestore_rt=')) {
      const value = header.slice('bikestore_rt='.length).split(';')[0];
      return { value, header };
    }
  }
  return null;
}

describe('Integración Sesiones Refresh A1, Rotación, Replay AEAD, CSRF y Purga', () => {
  before(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    await query('TRUNCATE TABLE usuario, categoria, token_recuperacion, carrito, pedido, pago, retracto RESTART IDENTITY CASCADE');
    resetRateLimiters();
    resetPurgeThrottle();
    clearTestOutbox();
    await seedInitialAdmin();
  });

  after(async () => {
    await closePool();
  });

  async function registerAndLoginClient(correo = 'sesion.cliente@example.com', doc = '900112233') {
    await request(app).post('/api/auth/registro').send({
      tipo_documento: 'CC',
      numero_documento: doc,
      nombre: 'Laura',
      primer_apellido: 'Gómez',
      telefono: '3001112233',
      correo,
      contrasena: 'Password2026',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('User-Agent', 'BikeStoreTestBrowser/1.0')
      .send({ correo, contrasena: 'Password2026' });

    assert.equal(loginRes.status, 200);
    return loginRes;
  }

  it('login fija cookie HttpOnly bikestore_rt y retorna expires_in=900 y rotacion_uid sin exponer refresh token en JSON', async () => {
    const res = await registerAndLoginClient();
    assert.equal(res.body.ok, true);
    assert.equal(res.body.datos.expires_in, 900);
    assert.match(
      res.body.datos.rotacion_uid,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    assert.equal('refresh_token' in res.body.datos, false);
    assert.equal('bikestore_rt' in res.body.datos, false);

    const cookie = extractRefreshCookie(res);
    assert.ok(cookie);
    assert.ok(cookie.value.length >= 64);
    assert.match(cookie.header, /Path=\/api\/auth/i);
    assert.match(cookie.header, /Max-Age=604800/i);
    assert.match(cookie.header, /HttpOnly/i);
    assert.match(cookie.header, /SameSite=Lax/i);

    const dbRes = await query(
      `SELECT rotacion_uid, familia_id, fecha_revocacion, (fecha_expiracion > fecha_creacion) AS valida
       FROM sesion_refresh
       WHERE token_hash = $1`,
      [sha256Hex(cookie.value)]
    );
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].rotacion_uid, res.body.datos.rotacion_uid);
    assert.equal(dbRes.rows[0].fecha_revocacion, null);
    assert.equal(dbRes.rows[0].valida, true);
  });

  it('exige CSRF Origin + X-Requested-With en /refresh y /logout con cookie, permitiendo Bearer puro sin cookie', async () => {
    const loginRes = await registerAndLoginClient();
    const token = loginRes.body.datos.token;
    const rt = extractRefreshCookie(loginRes).value;
    const k1 = crypto.randomUUID();

    // Sin Origin -> 403 CSRF_ORIGEN_INVALIDO
    const noOrigin = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt}`)
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', k1);
    assert.equal(noOrigin.status, 403);
    assert.equal(noOrigin.body.codigo, 'CSRF_ORIGEN_INVALIDO');

    // Origin no permitido -> 403 CSRF_ORIGEN_INVALIDO
    const badOrigin = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt}`)
      .set('Origin', 'https://atacante.evil')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', k1);
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.body.codigo, 'CSRF_ORIGEN_INVALIDO');

    // Sin X-Requested-With: BikeStore -> 403 CSRF_ORIGEN_INVALIDO
    const noXrw = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt}`)
      .set('Origin', 'http://localhost:5173')
      .set('Idempotency-Key', k1);
    assert.equal(noXrw.status, 403);
    assert.equal(noXrw.body.codigo, 'CSRF_ORIGEN_INVALIDO');

    // Sin UUID válido -> 400 VALIDACION_INVALIDA
    const badUuid = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', 'no-es-uuid');
    assert.equal(badUuid.status, 400);
    assert.equal(badUuid.body.codigo, 'VALIDACION_INVALIDA');

    // /logout CON cookie (incluso con Bearer) exige CSRF
    const logoutCookieNoCsrf = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `bikestore_rt=${rt}`);
    assert.equal(logoutCookieNoCsrf.status, 403);
    assert.equal(logoutCookieNoCsrf.body.codigo, 'CSRF_ORIGEN_INVALIDO');

    // /logout SIN cookie y CON Bearer es exento de CSRF -> 200
    const logoutBearerOnly = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(logoutBearerOnly.status, 200);

    // Nuevo login y /logout SOLO con cookie + CSRF válido -> 200
    const login2 = await registerAndLoginClient('cookie.logout@example.com', '900112244');
    const rt2 = extractRefreshCookie(login2).value;
    const logoutCookieOnly = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `bikestore_rt=${rt2}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore');
    assert.equal(logoutCookieOnly.status, 200);

    const cleared = extractRefreshCookie(logoutCookieOnly);
    assert.ok(cleared);
    assert.equal(cleared.value, '');

    // Access token previo también queda revocado por token_version + 1
    const perfilAfter = await request(app)
      .get('/api/perfil')
      .set('Authorization', `Bearer ${login2.body.datos.token}`);
    assert.equal(perfilAfter.status, 401);
    assert.equal(perfilAfter.body.codigo, 'SESION_REVOCADA');
  });

  it('rota T1->T2 heredando expiración, soporta pérdida de respuesta y concurrencia sin Web Locks con mismo T2', async () => {
    const loginRes = await registerAndLoginClient();
    const t1 = extractRefreshCookie(loginRes).value;
    const k1 = crypto.randomUUID();

    // 1. Petición concurrente de 2 pestañas sobre T1 con mismo Idempotency-Key UUIDv8
    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `bikestore_rt=${t1}`)
        .set('Origin', 'http://localhost:5173')
        .set('X-Requested-With', 'BikeStore')
        .set('Idempotency-Key', k1),
      request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `bikestore_rt=${t1}`)
        .set('Origin', 'http://localhost:5173')
        .set('X-Requested-With', 'BikeStore')
        .set('Idempotency-Key', k1),
    ]);

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.deepEqual([r1.body.datos.replayed, r2.body.datos.replayed].sort(), [false, true]);
    assert.equal(r1.body.datos.rotacion_uid, r2.body.datos.rotacion_uid);
    assert.equal(r1.body.datos.expires_in, 900);

    const t2Cookie1 = extractRefreshCookie(r1).value;
    const t2Cookie2 = extractRefreshCookie(r2).value;
    assert.equal(t2Cookie1, t2Cookie2);
    assert.notEqual(t2Cookie1, t1);

    // 2. Pérdida de respuesta: tercer reintento dentro de 30s sigue reproduciendo el MISMO T2
    const r3 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${t1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', k1);
    assert.equal(r3.status, 200);
    assert.equal(r3.body.datos.replayed, true);
    assert.equal(extractRefreshCookie(r3).value, t2Cookie1);
    assert.equal(r3.body.datos.rotacion_uid, r1.body.datos.rotacion_uid);

    // Verificar en BD: 1 única sesión activa en la familia y expiración heredada exacta
    const rowsRes = await query(
      `SELECT token_hash, familia_id, fecha_expiracion, fecha_revocacion, motivo_revocacion
       FROM sesion_refresh
       ORDER BY id_sesion ASC`
    );
    assert.equal(rowsRes.rows.length, 2);
    assert.equal(rowsRes.rows[0].motivo_revocacion, 'ROTACION');
    assert.equal(rowsRes.rows[1].fecha_revocacion, null);
    assert.equal(rowsRes.rows[1].familia_id, rowsRes.rows[0].familia_id);
    assert.equal(
      new Date(rowsRes.rows[1].fecha_expiracion).getTime(),
      new Date(rowsRes.rows[0].fecha_expiracion).getTime()
    );
  });

  it('detecta reúso con clave distinta, tras usar T2 o ventana 30s vencida, revocando toda la familia sin perdonar por IP/UA', async () => {
    // Escenario A: reúso de T1 con OTRA Idempotency-Key (incluso con mismo IP y User-Agent)
    const l1 = await registerAndLoginClient('reuso1@example.com', '910112233');
    const t1 = extractRefreshCookie(l1).value;
    const k1 = crypto.randomUUID();
    const k2 = crypto.randomUUID();

    const okRot = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${t1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('User-Agent', 'BikeStoreTestBrowser/1.0')
      .set('Idempotency-Key', k1);
    assert.equal(okRot.status, 200);
    const t2 = extractRefreshCookie(okRot).value;

    const reuseDiffKey = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${t1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('User-Agent', 'BikeStoreTestBrowser/1.0')
      .set('Idempotency-Key', k2);
    assert.equal(reuseDiffKey.status, 401);
    assert.equal(reuseDiffKey.body.codigo, 'SESION_REVOCADA');
    assert.equal(extractRefreshCookie(reuseDiffKey).value, '');

    // T2 también quedó revocado con motivo REUSO_DETECTADO y reemplazo_cifrado limpiado
    const t2UseAfter = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${t2}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', crypto.randomUUID());
    assert.equal(t2UseAfter.status, 401);
    assert.equal(t2UseAfter.body.codigo, 'SESION_REVOCADA');

    const dbFam1 = await query(
      `SELECT motivo_revocacion, reemplazo_cifrado FROM sesion_refresh WHERE token_hash IN ($1, $2) ORDER BY id_sesion ASC`,
      [sha256Hex(t1), sha256Hex(t2)]
    );
    assert.equal(dbFam1.rows[0].reemplazo_cifrado, null);
    assert.equal(dbFam1.rows[1].motivo_revocacion, 'REUSO_DETECTADO');

    // Escenario B: T1->T2 (K1), luego T2->T3 (K2), luego replay T1 con K1 falla por ultimo_uso_at/revocación de T2
    const l2 = await registerAndLoginClient('reuso2@example.com', '910112244');
    const bT1 = extractRefreshCookie(l2).value;
    const bK1 = crypto.randomUUID();
    const rotB1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${bT1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', bK1);
    const bT2 = extractRefreshCookie(rotB1).value;

    const rotB2 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${bT2}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', crypto.randomUUID());
    assert.equal(rotB2.status, 200);
    const bT3 = extractRefreshCookie(rotB2).value;

    const replayStaleT1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${bT1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', bK1);
    assert.equal(replayStaleT1.status, 401);
    assert.equal(replayStaleT1.body.codigo, 'SESION_REVOCADA');

    const checkT3 = await query(`SELECT motivo_revocacion FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(bT3)]);
    assert.equal(checkT3.rows[0].motivo_revocacion, 'REUSO_DETECTADO');

    // Escenario C: ventana de 30s vencida -> replay con mismo K1 revoca T2
    const l3 = await registerAndLoginClient('reuso3@example.com', '910112255');
    const cT1 = extractRefreshCookie(l3).value;
    const cK1 = crypto.randomUUID();
    const rotC1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${cT1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', cK1);
    const cT2 = extractRefreshCookie(rotC1).value;

    await query(
      `UPDATE sesion_refresh
       SET fecha_revocacion = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
           reemplazo_expira_en = CURRENT_TIMESTAMP - INTERVAL '1 minute'
       WHERE token_hash = $1`,
      [sha256Hex(cT1)]
    );

    const lateReplay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${cT1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', cK1);
    assert.equal(lateReplay.status, 401);
    assert.equal(lateReplay.body.codigo, 'SESION_REVOCADA');

    const checkCT2 = await query(`SELECT motivo_revocacion FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(cT2)]);
    assert.equal(checkCT2.rows[0].motivo_revocacion, 'REUSO_DETECTADO');
  });

  it('maneja expiración absoluta de 7 días (401 SESION_EXPIRADA) e inactivación de usuario (403 USUARIO_INACTIVO)', async () => {
    const l1 = await registerAndLoginClient('expira@example.com', '920112233');
    const rt1 = extractRefreshCookie(l1).value;

    await query(
      `UPDATE sesion_refresh
       SET fecha_creacion = CURRENT_TIMESTAMP - INTERVAL '8 days',
           fecha_expiracion = CURRENT_TIMESTAMP - INTERVAL '1 hour'
       WHERE token_hash = $1`,
      [sha256Hex(rt1)]
    );

    const expiredRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', crypto.randomUUID());
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.codigo, 'SESION_EXPIRADA');
    assert.equal(extractRefreshCookie(expiredRes).value, '');

    const l2 = await registerAndLoginClient('inactivo@example.com', '920112244');
    const rt2 = extractRefreshCookie(l2).value;
    const userId2 = l2.body.datos.usuario.id_usuario;

    await query(`UPDATE usuario SET estado_usuario = 'INACTIVO' WHERE id_usuario = $1`, [userId2]);

    const inactiveRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt2}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', crypto.randomUUID());
    assert.equal(inactiveRes.status, 403);
    assert.equal(inactiveRes.body.codigo, 'USUARIO_INACTIVO');
    assert.equal(extractRefreshCookie(inactiveRes).value, '');

    const dbInact = await query(`SELECT motivo_revocacion FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(rt2)]);
    assert.equal(dbInact.rows[0].motivo_revocacion, 'ADMIN_INACTIVACION');
  });

  it('cambio contraseña, restablecer contraseña, inactivar usuario y cambio de rol revocan sesion_refresh y limpian reemplazo_cifrado', async () => {
    const admLogin = await request(app).post('/api/auth/login').send({
      correo: process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local',
      contrasena: process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!',
    });
    const adminToken = admLogin.body.datos.token;

    const l1 = await registerAndLoginClient('revoca@example.com', '930112233');
    const userId = l1.body.datos.usuario.id_usuario;
    let rt = extractRefreshCookie(l1).value;
    let token = l1.body.datos.token;

    // Rotar una vez para poblar reemplazo_cifrado en la fila padre
    const rot1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', crypto.randomUUID());
    assert.equal(rot1.status, 200);
    rt = extractRefreshCookie(rot1).value;
    token = rot1.body.datos.token;

    // 1. Cambio de contraseña revoca sesiones y limpia reemplazo_cifrado
    const chgPwd = await request(app)
      .patch('/api/perfil/contrasena')
      .set('Authorization', `Bearer ${token}`)
      .send({ contrasena_actual: 'Password2026', nueva_contrasena: 'Password2027' });
    assert.equal(chgPwd.status, 200);

    const afterChg = await query(
      `SELECT COUNT(*)::INT AS activas, COUNT(*) FILTER (WHERE reemplazo_cifrado IS NOT NULL)::INT AS con_replay
       FROM sesion_refresh WHERE id_usuario = $1 AND fecha_revocacion IS NULL`,
      [userId]
    );
    assert.equal(afterChg.rows[0].activas, 0);

    const replayCleared1 = await query(
      `SELECT COUNT(*)::INT AS cnt FROM sesion_refresh WHERE id_usuario = $1 AND reemplazo_cifrado IS NOT NULL`,
      [userId]
    );
    assert.equal(replayCleared1.rows[0].cnt, 0);

    // 2. Nuevo login + restablecer contraseña
    const l2 = await request(app).post('/api/auth/login').send({ correo: 'revoca@example.com', contrasena: 'Password2027' });
    const rt2 = extractRefreshCookie(l2).value;
    await request(app).post('/api/auth/recuperar').send({ correo: 'revoca@example.com' });
    await new Promise((r) => setTimeout(r, 60));
    const resetTok = getTestOutbox()[0].text.match(/token=([a-f0-9]+)/)[1];

    const rst = await request(app).post('/api/auth/restablecer').send({ token: resetTok, nueva_contrasena: 'Password2028' });
    assert.equal(rst.status, 200);

    const checkRt2 = await query(`SELECT motivo_revocacion FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(rt2)]);
    assert.equal(checkRt2.rows[0].motivo_revocacion, 'RESET_PASSWORD');

    // 3. Nuevo login + admin cambia rol -> revoca sesion_refresh
    const l3 = await request(app).post('/api/auth/login').send({ correo: 'revoca@example.com', contrasena: 'Password2028' });
    const rt3 = extractRefreshCookie(l3).value;
    const roleChg = await request(app)
      .patch(`/api/admin/usuarios/${userId}/rol`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rol: 'ADMIN' });
    assert.equal(roleChg.status, 200);

    const checkRt3 = await query(`SELECT motivo_revocacion FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(rt3)]);
    assert.equal(checkRt3.rows[0].motivo_revocacion, 'LOGOUT_GLOBAL');

    // 4. Nuevo login + admin inactiva usuario -> revoca sesion_refresh
    const l4 = await request(app).post('/api/auth/login').send({ correo: 'revoca@example.com', contrasena: 'Password2028' });
    const rt4 = extractRefreshCookie(l4).value;
    const inactChg = await request(app)
      .patch(`/api/admin/usuarios/${userId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado_usuario: 'INACTIVO' });
    assert.equal(inactChg.status, 200);

    const checkRt4 = await query(`SELECT motivo_revocacion FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(rt4)]);
    assert.equal(checkRt4.rows[0].motivo_revocacion, 'ADMIN_INACTIVACION');
  });

  it('purgarRegistrosExpiradosLote limpia reemplazo_cifrado vencido, sesion_refresh >24h (>30d si REUSO_DETECTADO) y fusiones >30d', async () => {
    const l1 = await registerAndLoginClient('purga@example.com', '940112233');
    const userId = l1.body.datos.usuario.id_usuario;
    const rt1 = extractRefreshCookie(l1).value;
    const k1 = crypto.randomUUID();

    // Rotar para tener reemplazo_cifrado
    const rot = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `bikestore_rt=${rt1}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'BikeStore')
      .set('Idempotency-Key', k1);
    assert.equal(rot.status, 200);

    // Ajustar reemplazo vencido en rt1 (no purgado aún porque fecha_expiracion sigue futura)
    await query(
      `UPDATE sesion_refresh
       SET fecha_revocacion = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
           reemplazo_expira_en = CURRENT_TIMESTAMP - INTERVAL '1 minute'
       WHERE token_hash = $1`,
      [sha256Hex(rt1)]
    );

    // Insertar sesión expirada hace >24h (normal), REUSO_DETECTADO hace 10d (conservar) y REUSO_DETECTADO hace 31d (purgar)
    await query(
      `INSERT INTO sesion_refresh (id_usuario, token_hash, familia_id, fecha_creacion, fecha_expiracion)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '25 hours')`,
      [userId, sha256Hex('exp-25h'), crypto.randomUUID()]
    );
    await query(
      `INSERT INTO sesion_refresh (id_usuario, token_hash, familia_id, fecha_creacion, fecha_expiracion, fecha_revocacion, motivo_revocacion)
       VALUES
         ($1, $2, $3, CURRENT_TIMESTAMP - INTERVAL '15 days', CURRENT_TIMESTAMP - INTERVAL '8 days', CURRENT_TIMESTAMP - INTERVAL '10 days', 'REUSO_DETECTADO'),
         ($1, $4, $5, CURRENT_TIMESTAMP - INTERVAL '40 days', CURRENT_TIMESTAMP - INTERVAL '33 days', CURRENT_TIMESTAMP - INTERVAL '31 days', 'REUSO_DETECTADO')`,
      [userId, sha256Hex('reuso-10d'), crypto.randomUUID(), sha256Hex('reuso-31d'), crypto.randomUUID()]
    );

    // Insertar fusiones: una de 10d (conservar) y una de 31d (purgar)
    await query(
      `INSERT INTO carrito_fusion_idempotencia (id_usuario, id_carrito, clave_idempotencia, payload_hash, resultado_json, fecha_creacion)
       VALUES
         ($1, NULL, $2, $3, '{"ok":true}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '10 days'),
         ($1, NULL, $4, $5, '{"ok":true}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '31 days')`,
      [userId, crypto.randomUUID(), sha256Hex('f10'), crypto.randomUUID(), sha256Hex('f31')]
    );

    const resumen = await purgarRegistrosExpiradosLote();
    assert.equal(resumen.reemplazosLimpiados, 1);
    assert.equal(resumen.sesionesPurgadas, 2);
    assert.equal(resumen.fusionesPurgadas, 1);

    const remainingSessions = await query(`SELECT token_hash FROM sesion_refresh WHERE id_usuario = $1`, [userId]);
    const hashes = new Set(remainingSessions.rows.map((r) => r.token_hash));
    assert.equal(hashes.has(sha256Hex('reuso-10d')), true);
    assert.equal(hashes.has(sha256Hex('reuso-31d')), false);
    assert.equal(hashes.has(sha256Hex('exp-25h')), false);

    const rt1After = await query(`SELECT reemplazo_cifrado, reemplazo_expira_en FROM sesion_refresh WHERE token_hash = $1`, [sha256Hex(rt1)]);
    assert.equal(rt1After.rows[0].reemplazo_cifrado, null);
    assert.equal(rt1After.rows[0].reemplazo_expira_en, null);

    const remainingFus = await query(`SELECT COUNT(*)::INT AS cnt FROM carrito_fusion_idempotencia WHERE id_usuario = $1`, [userId]);
    assert.equal(remainingFus.rows[0].cnt, 1);
  });
});
