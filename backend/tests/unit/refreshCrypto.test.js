import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveDevRefreshReplayKey, loadEnv, parseTrustProxy } from '../../src/config/env.js';
import { AppError } from '../../src/middlewares/error.middleware.js';
import {
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  getRefreshCookie,
  getRefreshCookieOptions,
  parseCookies,
} from '../../src/utils/cookies.js';
import { requireUuidIdempotencyKey } from '../../src/utils/idempotency.js';
import { isValidImagenUrl, validarImagenUrl } from '../../src/utils/imagenUrl.js';
import {
  clearTestOutbox,
  dispatchPasswordResetEmail,
  escapeHtml,
  getTestOutbox,
  sanitizeMailerLogMessage,
} from '../../src/utils/mailer.js';
import { sha256Hex } from '../../src/utils/password.js';
import { decryptReplayToken, encryptReplayToken } from '../../src/utils/refreshCrypto.js';

describe('Utilidades criptográficas, configuración y seguridad (refreshCrypto, idempotency, imagenUrl, env, cookies, mailer)', () => {
  it('cifra y descifra token hijo T2 con AES-256-GCM + HKDF-SHA256 ligado al contexto AAD', () => {
    const parentTokenHash = sha256Hex('token-padre-t1');
    const idempotencyKey = '11111111-1111-4111-8111-111111111111';
    const childToken = 'b'.repeat(64);

    const encrypted = encryptReplayToken({
      childToken,
      idUsuario: 42,
      familiaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      parentTokenHash,
      idempotencyKey,
    });

    assert.ok(encrypted.startsWith('v1:'));
    assert.equal(encrypted.includes(childToken), false);

    const decrypted = decryptReplayToken({
      encryptedPayload: encrypted,
      idUsuario: 42,
      familiaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      parentTokenHash,
      idempotencyKey,
    });
    assert.equal(decrypted, childToken);

    // Manipular AAD (usuario, familia, token padre o clave idempotencia) falla
    assert.throws(() =>
      decryptReplayToken({
        encryptedPayload: encrypted,
        idUsuario: 99,
        familiaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentTokenHash,
        idempotencyKey,
      })
    );
    assert.throws(() =>
      decryptReplayToken({
        encryptedPayload: encrypted,
        idUsuario: 42,
        familiaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        parentTokenHash,
        idempotencyKey,
      })
    );
    assert.throws(() =>
      decryptReplayToken({
        encryptedPayload: encrypted,
        idUsuario: 42,
        familiaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentTokenHash: sha256Hex('otro-padre'),
        idempotencyKey,
      })
    );
    assert.throws(() =>
      decryptReplayToken({
        encryptedPayload: encrypted,
        idUsuario: 42,
        familiaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentTokenHash,
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      })
    );

    // Manipular ciphertext o authTag falla
    const parts = encrypted.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:AAAA`;
    assert.throws(() =>
      decryptReplayToken({
        encryptedPayload: tampered,
        idUsuario: 42,
        familiaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentTokenHash,
        idempotencyKey,
      })
    );
  });

  it('valida estrictamente Idempotency-Key como UUID RFC 4122/9562 normalizado a minúsculas', () => {
    assert.equal(
      requireUuidIdempotencyKey('  ABCDEF12-3456-4789-ABCD-EF0123456789  '),
      'abcdef12-3456-4789-abcd-ef0123456789'
    );
    // UUID v8 determinista
    assert.equal(
      requireUuidIdempotencyKey('12345678-1234-8abc-9def-0123456789ab'),
      '12345678-1234-8abc-9def-0123456789ab'
    );

    for (const invalid of [undefined, null, '', 'fus-001', '00000000-0000-0000-0000-000000000000', '12345678-1234-9abc-8def-0123456789ab', '12345678-1234-4abc-cdef-0123456789ab']) {
      assert.throws(() => requireUuidIdempotencyKey(invalid), (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.status, 400);
        assert.equal(err.codigo, 'VALIDACION_INVALIDA');
        return true;
      });
    }
  });

  it('valida imagen_url bloqueando credenciales, localhost, IPs privadas/metadatos y SVG', () => {
    assert.equal(isValidImagenUrl('https://cdn.example.com/bicicletas/ruta-pro.webp?width=800'), true);
    assert.equal(isValidImagenUrl('http://images.bikestore.co/casco.jpg'), true);

    const blockedUrls = [
      'ftp://cdn.example.com/bici.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'https://user:pass@cdn.example.com/bici.jpg',
      'https://user@cdn.example.com/bici.jpg',
      'http://localhost/bici.jpg',
      'http://sub.localhost/bici.jpg',
      'http://127.0.0.1/bici.jpg',
      'http://127.12.34.56/bici.jpg',
      'http://10.0.0.5/bici.jpg',
      'http://169.254.169.254/latest/meta-data/',
      'http://172.16.0.1/bici.jpg',
      'http://172.31.255.254/bici.jpg',
      'http://192.168.1.10/bici.jpg',
      'http://[::1]/bici.jpg',
      'http://[::ffff:127.0.0.1]/bici.jpg',
      'http://[64:ff9b::127.0.0.1]/bici.png',
      'http://[64:ff9b:1::10.0.0.1]/bici.png',
      'http://[fc00::1]/bici.jpg',
      'http://[fe80::1]/bici.jpg',
      'http://nas.local/bici.jpg',
      'http://metadata.google.internal/computeMetadata/v1/',
      'https://cdn.example.com/vector.svg',
      'https://cdn.example.com/vector.SVG?v=1',
      'https://cdn.example.com/vector.svgz',
      'https://cdn.example.com/icono.svg.png',
      'https://cdn.example.com/icono.svgz.webp',
      'https://cdn.example.com/a.svg/foto.png',
      'https://cdn.example.com/pic?file=icono.svg',
      'https://cdn.example.com/pic?download=evil.svgz',
      'https://cdn.example.com/render?format=svg',
      'https://cdn.example.com/render?fm=svg',
      'https://cdn.example.com/render?ext=svg',
      'https://cdn.example.com/image/svg+xml',
    ];

    for (const url of blockedUrls) {
      const check = validarImagenUrl(url);
      assert.equal(check.valid, false, `Se esperaba rechazo para: ${url}`);
    }
    assert.equal(isValidImagenUrl('https://cdn.example.com/my-svg-logo.png'), true);
  });

  it('valida env.js (TRUST_PROXY, COOKIE_SECURE, CORS_ORIGINS, REFRESH_REPLAY_KEY y SMTP en production)', () => {
    assert.equal(parseTrustProxy(undefined), false);
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('true'), true);
    assert.equal(parseTrustProxy('1'), 1);
    assert.equal(parseTrustProxy('loopback'), 'loopback');

    const baseDev = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      JWT_SECRET: 'secreto-super-seguro-jwt-2026-abcd',
      CORS_ORIGIN: 'http://localhost:5173, https://bikestore.example.com',
    };
    const devEnv = loadEnv(baseDev, { ignoreTestRunner: true });
    assert.equal(devEnv.TRUST_PROXY, false);
    assert.equal(devEnv.COOKIE_SECURE, false);
    assert.deepEqual(devEnv.CORS_ORIGINS, ['http://localhost:5173', 'https://bikestore.example.com']);
    assert.equal(devEnv.REFRESH_REPLAY_KEY, deriveDevRefreshReplayKey(baseDev.JWT_SECRET));

    // En production exige REFRESH_REPLAY_KEY distinta de JWT_SECRET y >=32 chars
    assert.throws(() =>
      loadEnv(
        {
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://u:p@localhost:5432/db',
          JWT_SECRET: 'secreto-super-seguro-jwt-2026-abcd',
        },
        { ignoreTestRunner: true }
      )
    );
    assert.throws(() =>
      loadEnv(
        {
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://u:p@localhost:5432/db',
          JWT_SECRET: 'secreto-super-seguro-jwt-2026-abcd',
          REFRESH_REPLAY_KEY: 'secreto-super-seguro-jwt-2026-abcd',
        },
        { ignoreTestRunner: true }
      )
    );

    // En production si SMTP_TRANSPORT=smtp exige SMTP_HOST, SMTP_USER y SMTP_PASS
    assert.throws(() =>
      loadEnv(
        {
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://u:p@localhost:5432/db',
          JWT_SECRET: 'secreto-super-seguro-jwt-2026-abcd',
          REFRESH_REPLAY_KEY: 'otra-clave-replay-distinta-de-32-chars-min',
          SMTP_TRANSPORT: 'smtp',
        },
        { ignoreTestRunner: true }
      )
    );

    const prodEnv = loadEnv(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        JWT_SECRET: 'secreto-super-seguro-jwt-2026-abcd',
        REFRESH_REPLAY_KEY: 'otra-clave-replay-distinta-de-32-chars-min',
        TRUST_PROXY: '1',
        SMTP_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.mailtrap.io',
        SMTP_USER: 'user1',
        SMTP_PASS: 'pass1',
      },
      { ignoreTestRunner: true }
    );
    assert.equal(prodEnv.COOKIE_SECURE, true);
    assert.equal(prodEnv.TRUST_PROXY, 1);

    const prodInsecure = loadEnv(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        JWT_SECRET: 'secreto-super-seguro-jwt-2026-abcd',
        REFRESH_REPLAY_KEY: 'otra-clave-replay-distinta-de-32-chars-min',
        COOKIE_SECURE: 'false',
      },
      { ignoreTestRunner: true }
    );
    assert.equal(prodInsecure.COOKIE_SECURE, false);
  });

  it('construye cookies bikestore_rt seguras y redacta tokens/URLs en mailer', () => {
    const opts = getRefreshCookieOptions();
    assert.equal(REFRESH_COOKIE_NAME, 'bikestore_rt');
    assert.equal(REFRESH_COOKIE_PATH, '/api/auth');
    assert.equal(REFRESH_COOKIE_MAX_AGE_SECONDS, 604800);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, 'lax');
    assert.equal(opts.path, '/api/auth');
    assert.equal(opts.maxAge, 604800000);

    const parsed = parseCookies('foo=bar; bikestore_rt=abc123token; other=1');
    assert.equal(parsed.bikestore_rt, 'abc123token');
    assert.equal(getRefreshCookie({ headers: { cookie: 'bikestore_rt=rt_xyz' } }), 'rt_xyz');

    const redacted = sanitizeMailerLogMessage(
      'Fallo enviando a http://localhost:5173/restablecer-contrasena?token=abcdef0123456789abcdef0123456789 con hash 0123456789abcdef0123456789abcdef'
    );
    assert.equal(redacted.includes('abcdef0123456789abcdef0123456789'), false);
    assert.equal(redacted.includes('http://localhost:5173'), false);

    assert.equal(
      escapeHtml('<script>alert("xss")</script> & \'test\''),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;'
    );
  });

  it('dispatchPasswordResetEmail escapa HTML del nombre de usuario en el cuerpo html', async () => {
    clearTestOutbox();
    dispatchPasswordResetEmail({
      correo: 'xss@example.com',
      nombre: '<script>alert(1)</script>',
      token: 'abcdef0123456789abcdef0123456789',
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const outbox = getTestOutbox();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].html.includes('<script>'), false);
    assert.equal(outbox[0].html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
    clearTestOutbox();
  });
});
