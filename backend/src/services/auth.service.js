import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import { purgarRegistrosExpiradosOportunista } from '../jobs/expiracionReservas.job.js';
import { extractBearerToken } from '../middlewares/auth.middleware.js';
import { AppError } from '../middlewares/error.middleware.js';
import { isValidDocumento, normalizeDocumento } from '../utils/documento.js';
import { requireUuidIdempotencyKey } from '../utils/idempotency.js';
import { getJwtExpiresInSeconds, signAccessToken, verifyAccessToken } from '../utils/jwt.js';
import { dispatchPasswordResetEmail } from '../utils/mailer.js';
import {
  compareDummyPassword,
  comparePassword,
  hashPassword,
  randomTokenHex,
  sha256Hex,
} from '../utils/password.js';
import { decryptReplayToken, encryptReplayToken } from '../utils/refreshCrypto.js';

export async function revocarSesionesUsuarioLocked(client, idUsuario, motivo) {
  await client.query(
    `SELECT id_sesion
     FROM sesion_refresh
     WHERE id_usuario = $1
       AND (fecha_revocacion IS NULL OR reemplazo_cifrado IS NOT NULL)
     ORDER BY id_sesion ASC
     FOR UPDATE`,
    [idUsuario]
  );

  await client.query(
    `UPDATE sesion_refresh
     SET fecha_revocacion = COALESCE(fecha_revocacion, CURRENT_TIMESTAMP),
         motivo_revocacion = CASE WHEN fecha_revocacion IS NULL THEN $2::varchar ELSE motivo_revocacion END,
         reemplazo_cifrado = NULL,
         reemplazo_expira_en = NULL
     WHERE id_usuario = $1
       AND (fecha_revocacion IS NULL OR reemplazo_cifrado IS NOT NULL)`,
    [idUsuario, motivo]
  );
}

async function revocarFamiliaLocked(client, familiaId, motivo) {
  await client.query(
    `UPDATE sesion_refresh
     SET fecha_revocacion = COALESCE(fecha_revocacion, CURRENT_TIMESTAMP),
         motivo_revocacion = CASE WHEN fecha_revocacion IS NULL THEN $2::varchar ELSE motivo_revocacion END,
         reemplazo_cifrado = NULL,
         reemplazo_expira_en = NULL
     WHERE familia_id = $1
       AND (fecha_revocacion IS NULL OR reemplazo_cifrado IS NOT NULL)`,
    [familiaId, motivo]
  );
}

export async function registrarCliente(datos) {
  const numeroNorm = normalizeDocumento(datos.numero_documento);
  if (!isValidDocumento(datos.tipo_documento, numeroNorm)) {
    throw new AppError(
      400,
      'VALIDACION_INVALIDA',
      `El número de documento no cumple con el formato sintáctico esperado para ${datos.tipo_documento}.`
    );
  }

  const correoNorm = datos.correo.trim().toLowerCase();
  const passwordHash = await hashPassword(datos.contrasena);

  return withTransaction(async (client) => {
    const dupDoc = await client.query(
      `SELECT 1 FROM usuario WHERE tipo_documento = $1 AND numero_documento = $2`,
      [datos.tipo_documento, numeroNorm]
    );
    if (dupDoc.rows.length > 0) {
      throw new AppError(409, 'DOCUMENTO_DUPLICADO', 'El tipo y número de documento ya se encuentran registrados.');
    }

    const dupMail = await client.query(
      `SELECT 1 FROM usuario WHERE LOWER(correo) = LOWER($1)`,
      [correoNorm]
    );
    if (dupMail.rows.length > 0) {
      throw new AppError(409, 'CORREO_DUPLICADO', 'El correo electrónico ya se encuentra registrado.');
    }

    const rolRes = await client.query(`SELECT id_rol FROM rol WHERE nombre = 'CLIENTE'`);
    if (rolRes.rows.length === 0) {
      throw new AppError(500, 'ERROR_INTERNO', 'Rol CLIENTE no inicializado en base de datos.');
    }

    const insUser = await client.query(
      `INSERT INTO usuario (
         tipo_documento, numero_documento, nombre, primer_apellido,
         segundo_apellido, telefono, correo, contrasena_hash, estado_usuario
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVO')
       RETURNING id_usuario, tipo_documento, numero_documento, nombre, primer_apellido, segundo_apellido, telefono, correo, estado_usuario, fecha_registro`,
      [
        datos.tipo_documento,
        numeroNorm,
        datos.nombre.trim(),
        datos.primer_apellido.trim(),
        datos.segundo_apellido ? datos.segundo_apellido.trim() : null,
        datos.telefono.trim(),
        correoNorm,
        passwordHash,
      ]
    );

    const user = insUser.rows[0];
    await client.query(
      `INSERT INTO usuario_rol (id_usuario, id_rol, asignado_por) VALUES ($1, $2, NULL)`,
      [user.id_usuario, rolRes.rows[0].id_rol]
    );

    return {
      ...user,
      rol: 'CLIENTE',
    };
  });
}

export async function iniciarSesion({ correo, contrasena, ipOrigen = null, userAgent = null }) {
  const correoNorm = correo.trim().toLowerCase();

  const { rows } = await query(
    `SELECT u.id_usuario, u.nombre, u.primer_apellido, u.correo, u.contrasena_hash, u.estado_usuario, u.token_version, r.nombre AS rol
     FROM usuario u
     JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
     JOIN rol r ON r.id_rol = ur.id_rol
     WHERE LOWER(u.correo) = LOWER($1)`,
    [correoNorm]
  );
  const candidate = rows[0] || null;

  if (!candidate) {
    await compareDummyPassword(contrasena);
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo electrónico o contraseña no válidos.');
  }

  const valid = await comparePassword(contrasena, candidate.contrasena_hash);
  if (!valid) {
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo electrónico o contraseña no válidos.');
  }

  if (candidate.estado_usuario !== 'ACTIVO') {
    throw new AppError(403, 'USUARIO_INACTIVO', 'Tu cuenta se encuentra inactiva. Contacta al administrador.');
  }

  const refreshToken = randomTokenHex(32);
  const tokenHash = sha256Hex(refreshToken);
  const familiaId = crypto.randomUUID();

  const sessionData = await withTransaction(async (client) => {
    const userRes = await client.query(
      `SELECT u.id_usuario, u.nombre, u.primer_apellido, u.correo, u.estado_usuario, u.token_version, r.nombre AS rol
       FROM usuario u
       JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
       JOIN rol r ON r.id_rol = ur.id_rol
       WHERE u.id_usuario = $1
       FOR UPDATE OF u`,
      [candidate.id_usuario]
    );

    if (userRes.rows.length === 0) {
      throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo electrónico o contraseña no válidos.');
    }

    const user = userRes.rows[0];
    if (user.estado_usuario !== 'ACTIVO') {
      throw new AppError(403, 'USUARIO_INACTIVO', 'Tu cuenta se encuentra inactiva. Contacta al administrador.');
    }

    const insSession = await client.query(
      `INSERT INTO sesion_refresh (
         id_usuario, token_hash, familia_id, fecha_expiracion, ip_origen, user_agent
       ) VALUES (
         $1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '7 days', $4, $5
       )
       RETURNING rotacion_uid`,
      [user.id_usuario, tokenHash, familiaId, ipOrigen, userAgent]
    );

    const token = signAccessToken({
      id_usuario: user.id_usuario,
      rol: user.rol,
      token_version: user.token_version,
    });

    return {
      token,
      expires_in: getJwtExpiresInSeconds(),
      rotacion_uid: insSession.rows[0].rotacion_uid,
      refreshToken,
      usuario: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        primer_apellido: user.primer_apellido,
        correo: user.correo,
        rol: user.rol,
      },
    };
  });

  await purgarRegistrosExpiradosOportunista();
  return sessionData;
}

export async function refrescarSesion({ refreshToken, idempotencyKey, ipOrigen = null, userAgent = null }) {
  const normalizedIdemKey = requireUuidIdempotencyKey(idempotencyKey);

  if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
    return {
      outcome: 'ERROR',
      clearCookie: true,
      status: 401,
      codigo: 'TOKEN_INVALIDO',
      mensaje: 'Se requiere una cookie de actualización válida.',
    };
  }

  const presentedHash = sha256Hex(refreshToken.trim());
  const idemHash = sha256Hex(normalizedIdemKey);

  return withTransaction(async (client) => {
    const lookupRes = await client.query(
      `SELECT id_sesion, id_usuario, familia_id
       FROM sesion_refresh
       WHERE token_hash = $1`,
      [presentedHash]
    );
    if (lookupRes.rows.length === 0) {
      return {
        outcome: 'ERROR',
        clearCookie: true,
        status: 401,
        codigo: 'TOKEN_INVALIDO',
        mensaje: 'Token de actualización inválido.',
      };
    }

    const { id_usuario: idUsuario, familia_id: familiaId } = lookupRes.rows[0];

    // Jerarquía estricta: usuario -> sesion_refresh (ORDER BY id_sesion ASC)
    const userRes = await client.query(
      `SELECT u.id_usuario, u.nombre, u.primer_apellido, u.correo, u.estado_usuario, u.token_version, r.nombre AS rol
       FROM usuario u
       JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
       JOIN rol r ON r.id_rol = ur.id_rol
       WHERE u.id_usuario = $1
       FOR UPDATE OF u`,
      [idUsuario]
    );
    if (userRes.rows.length === 0) {
      return {
        outcome: 'ERROR',
        clearCookie: true,
        status: 401,
        codigo: 'TOKEN_INVALIDO',
        mensaje: 'Usuario no encontrado.',
      };
    }
    const user = userRes.rows[0];

    const famRes = await client.query(
      `SELECT id_sesion, rotacion_uid, id_usuario, token_hash, familia_id,
              reemplazado_por_hash, rotacion_idem_hash, reemplazo_cifrado, reemplazo_expira_en,
              fecha_creacion, fecha_expiracion, ultimo_uso_at, fecha_revocacion, motivo_revocacion,
              (fecha_expiracion <= CURRENT_TIMESTAMP) AS sesion_expirada,
              (reemplazo_expira_en IS NOT NULL AND CURRENT_TIMESTAMP <= reemplazo_expira_en) AS replay_vigente
       FROM sesion_refresh
       WHERE familia_id = $1
       ORDER BY id_sesion ASC
       FOR UPDATE`,
      [familiaId]
    );
    const familyRows = famRes.rows;
    const currentRow = familyRows.find((r) => r.token_hash === presentedHash);
    if (!currentRow) {
      return {
        outcome: 'ERROR',
        clearCookie: true,
        status: 401,
        codigo: 'TOKEN_INVALIDO',
        mensaje: 'Token de actualización inválido.',
      };
    }

    if (user.estado_usuario !== 'ACTIVO') {
      await revocarFamiliaLocked(client, familiaId, 'ADMIN_INACTIVACION');
      return {
        outcome: 'ERROR',
        clearCookie: true,
        status: 403,
        codigo: 'USUARIO_INACTIVO',
        mensaje: 'La cuenta se encuentra inactiva. Contacte al administrador.',
      };
    }

    const userSummary = {
      id_usuario: user.id_usuario,
      nombre: user.nombre,
      primer_apellido: user.primer_apellido,
      correo: user.correo,
      rol: user.rol,
    };

    // Caso A: token actualmente activo
    if (currentRow.fecha_revocacion === null) {
      if (currentRow.sesion_expirada) {
        await revocarFamiliaLocked(client, familiaId, 'EXPIRACION');
        return {
          outcome: 'ERROR',
          clearCookie: true,
          status: 401,
          codigo: 'SESION_EXPIRADA',
          mensaje: 'La sesión ha expirado. Inicia sesión nuevamente.',
        };
      }

      // Limpiar reemplazo_cifrado de filas previas de la familia antes de rotar T1 -> T2
      await client.query(
        `UPDATE sesion_refresh
         SET reemplazo_cifrado = NULL,
             reemplazo_expira_en = NULL
         WHERE familia_id = $1
           AND reemplazo_cifrado IS NOT NULL`,
        [familiaId]
      );

      const childToken = randomTokenHex(32);
      const childHash = sha256Hex(childToken);
      const encryptedReplay = encryptReplayToken({
        childToken,
        idUsuario: user.id_usuario,
        familiaId: currentRow.familia_id,
        parentTokenHash: currentRow.token_hash,
        idempotencyKey: normalizedIdemKey,
      });

      // Revocar T1 primero para mantener el índice único parcial uq_sesion_refresh_familia_activa
      await client.query(
        `UPDATE sesion_refresh
         SET fecha_revocacion = CURRENT_TIMESTAMP,
             motivo_revocacion = 'ROTACION',
             reemplazado_por_hash = $2,
             rotacion_idem_hash = $3,
             reemplazo_cifrado = $4,
             reemplazo_expira_en = CURRENT_TIMESTAMP + INTERVAL '30 seconds',
             ultimo_uso_at = CURRENT_TIMESTAMP
         WHERE id_sesion = $1`,
        [currentRow.id_sesion, childHash, idemHash, encryptedReplay]
      );

      const insChild = await client.query(
        `INSERT INTO sesion_refresh (
           id_usuario, token_hash, familia_id, fecha_expiracion, ip_origen, user_agent
         ) VALUES (
           $1, $2, $3, $4, $5, $6
         )
         RETURNING rotacion_uid`,
        [user.id_usuario, childHash, currentRow.familia_id, currentRow.fecha_expiracion, ipOrigen, userAgent]
      );

      const token = signAccessToken({
        id_usuario: user.id_usuario,
        rol: user.rol,
        token_version: user.token_version,
      });

      return {
        outcome: 'OK',
        replayed: false,
        refreshToken: childToken,
        rotacion_uid: insChild.rows[0].rotacion_uid,
        token,
        expires_in: getJwtExpiresInSeconds(),
        usuario: userSummary,
      };
    }

    // Caso B: token ya revocado -> verificar estrictamente las 5 condiciones para replay exacto (sin usar IP/UA)
    const childRow = currentRow.reemplazado_por_hash
      ? familyRows.find((r) => r.token_hash === currentRow.reemplazado_por_hash) || null
      : null;

    const canReplay =
      currentRow.motivo_revocacion === 'ROTACION' &&
      currentRow.rotacion_idem_hash === idemHash &&
      currentRow.reemplazo_cifrado !== null &&
      currentRow.replay_vigente === true &&
      currentRow.sesion_expirada === false &&
      childRow !== null &&
      childRow.fecha_revocacion === null &&
      childRow.ultimo_uso_at === null &&
      childRow.sesion_expirada === false;

    if (canReplay) {
      try {
        const childToken = decryptReplayToken({
          encryptedPayload: currentRow.reemplazo_cifrado,
          idUsuario: user.id_usuario,
          familiaId: currentRow.familia_id,
          parentTokenHash: currentRow.token_hash,
          idempotencyKey: normalizedIdemKey,
        });

        const token = signAccessToken({
          id_usuario: user.id_usuario,
          rol: user.rol,
          token_version: user.token_version,
        });

        return {
          outcome: 'OK',
          replayed: true,
          refreshToken: childToken,
          rotacion_uid: childRow.rotacion_uid,
          token,
          expires_in: getJwtExpiresInSeconds(),
          usuario: userSummary,
        };
      } catch {
        // Cualquier fallo de integridad AEAD se trata como reúso inválido
      }
    }

    await revocarFamiliaLocked(client, familiaId, 'REUSO_DETECTADO');
    return {
      outcome: 'ERROR',
      clearCookie: true,
      status: 401,
      codigo: 'SESION_REVOCADA',
      mensaje: 'La sesión ha sido revocada por reúso inválido. Inicia sesión nuevamente.',
    };
  });
}

export async function cerrarSesion({ authorization, refreshToken }) {
  const hasAuthHeader = typeof authorization === 'string' && authorization.trim().length > 0;
  const bearerToken = extractBearerToken(authorization);

  if (hasAuthHeader && !bearerToken) {
    return {
      clearCookie: Boolean(refreshToken),
      error: new AppError(401, 'TOKEN_INVALIDO', 'Se requiere un token de autenticación válido.'),
    };
  }

  let bearerPayload = null;
  let bearerExpired = false;
  if (bearerToken) {
    try {
      bearerPayload = verifyAccessToken(bearerToken);
    } catch (err) {
      if (err?.name === 'TokenExpiredError' && refreshToken) {
        bearerExpired = true;
      } else {
        return {
          clearCookie: false,
          error: new AppError(401, 'TOKEN_INVALIDO', 'Token inválido o expirado.'),
        };
      }
    }
  }

  if (bearerPayload && !bearerExpired) {
    const userId = Number(bearerPayload.sub);
    const tokenVersion = Number(bearerPayload.tv);
    if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) {
      return {
        clearCookie: false,
        error: new AppError(401, 'TOKEN_INVALIDO', 'Estructura de token inválida.'),
      };
    }

    return withTransaction(async (client) => {
      const userRes = await client.query(
        `SELECT u.id_usuario, u.estado_usuario, u.token_version, r.nombre AS rol
         FROM usuario u
         JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
         JOIN rol r ON r.id_rol = ur.id_rol
         WHERE u.id_usuario = $1
         FOR UPDATE OF u`,
        [userId]
      );
      if (userRes.rows.length === 0) {
        return {
          clearCookie: Boolean(refreshToken),
          error: new AppError(401, 'TOKEN_INVALIDO', 'Usuario no encontrado.'),
        };
      }

      const user = userRes.rows[0];
      if (user.estado_usuario !== 'ACTIVO') {
        return {
          clearCookie: Boolean(refreshToken),
          error: new AppError(403, 'USUARIO_INACTIVO', 'La cuenta se encuentra inactiva. Contacte al administrador.'),
        };
      }
      if (user.token_version !== tokenVersion || user.rol !== bearerPayload.rol) {
        return {
          clearCookie: Boolean(refreshToken),
          error: new AppError(401, 'SESION_REVOCADA', 'La sesión ha sido revocada. Inicie sesión nuevamente.'),
        };
      }

      await revocarSesionesUsuarioLocked(client, userId, 'LOGOUT_GLOBAL');
      await client.query(`UPDATE usuario SET token_version = token_version + 1 WHERE id_usuario = $1`, [userId]);

      return {
        clearCookie: true,
        datos: { mensaje: 'Sesión cerrada correctamente.' },
      };
    });
  }

  // Logout autenticado por cookie bikestore_rt
  if (!refreshToken) {
    return {
      clearCookie: false,
      error: new AppError(401, 'TOKEN_INVALIDO', 'Se requiere una sesión activa para cerrar sesión.'),
    };
  }

  const tokenHash = sha256Hex(refreshToken);

  return withTransaction(async (client) => {
    const lookupRes = await client.query(
      `SELECT id_sesion, id_usuario
       FROM sesion_refresh
       WHERE token_hash = $1`,
      [tokenHash]
    );
    if (lookupRes.rows.length === 0) {
      return {
        clearCookie: true,
        error: new AppError(401, 'TOKEN_INVALIDO', 'Sesión de actualización inválida.'),
      };
    }

    const userId = lookupRes.rows[0].id_usuario;
    const userRes = await client.query(
      `SELECT id_usuario, estado_usuario
       FROM usuario
       WHERE id_usuario = $1
       FOR UPDATE`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      return {
        clearCookie: true,
        error: new AppError(401, 'TOKEN_INVALIDO', 'Usuario no encontrado.'),
      };
    }

    const sessRes = await client.query(
      `SELECT id_sesion, token_hash, fecha_revocacion, (fecha_expiracion <= CURRENT_TIMESTAMP) AS sesion_expirada
       FROM sesion_refresh
       WHERE id_usuario = $1
         AND (fecha_revocacion IS NULL OR reemplazo_cifrado IS NOT NULL OR token_hash = $2)
       ORDER BY id_sesion ASC
       FOR UPDATE`,
      [userId, tokenHash]
    );
    const targetRow = sessRes.rows.find((r) => r.token_hash === tokenHash);

    if (userRes.rows[0].estado_usuario !== 'ACTIVO') {
      await client.query(
        `UPDATE sesion_refresh
         SET fecha_revocacion = COALESCE(fecha_revocacion, CURRENT_TIMESTAMP),
             motivo_revocacion = CASE WHEN fecha_revocacion IS NULL THEN 'ADMIN_INACTIVACION' ELSE motivo_revocacion END,
             reemplazo_cifrado = NULL,
             reemplazo_expira_en = NULL
         WHERE id_usuario = $1
           AND (fecha_revocacion IS NULL OR reemplazo_cifrado IS NOT NULL)`,
        [userId]
      );
      return {
        clearCookie: true,
        error: new AppError(403, 'USUARIO_INACTIVO', 'La cuenta se encuentra inactiva. Contacte al administrador.'),
      };
    }

    if (!targetRow || targetRow.fecha_revocacion !== null) {
      return {
        clearCookie: true,
        error: new AppError(401, 'SESION_REVOCADA', 'La sesión ha sido revocada. Inicie sesión nuevamente.'),
      };
    }

    if (targetRow.sesion_expirada) {
      await client.query(
        `UPDATE sesion_refresh
         SET fecha_revocacion = CURRENT_TIMESTAMP,
             motivo_revocacion = 'EXPIRACION',
             reemplazo_cifrado = NULL,
             reemplazo_expira_en = NULL
         WHERE id_sesion = $1`,
        [targetRow.id_sesion]
      );
      return {
        clearCookie: true,
        error: new AppError(401, 'SESION_EXPIRADA', 'La sesión ha expirado. Inicia sesión nuevamente.'),
      };
    }

    await client.query(
      `UPDATE sesion_refresh
       SET fecha_revocacion = COALESCE(fecha_revocacion, CURRENT_TIMESTAMP),
           motivo_revocacion = CASE WHEN fecha_revocacion IS NULL THEN 'LOGOUT_GLOBAL' ELSE motivo_revocacion END,
           reemplazo_cifrado = NULL,
           reemplazo_expira_en = NULL
       WHERE id_usuario = $1
         AND (fecha_revocacion IS NULL OR reemplazo_cifrado IS NOT NULL)`,
      [userId]
    );
    await client.query(`UPDATE usuario SET token_version = token_version + 1 WHERE id_usuario = $1`, [userId]);

    return {
      clearCookie: true,
      datos: { mensaje: 'Sesión cerrada correctamente.' },
    };
  });
}

export async function solicitarRecuperacion({ correo }) {
  const correoNorm = correo.trim().toLowerCase();
  const rawToken = randomTokenHex(32);
  const tokenHash = sha256Hex(rawToken);

  const userToNotify = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id_usuario, nombre, correo, estado_usuario
       FROM usuario
       WHERE LOWER(correo) = LOWER($1)
       FOR UPDATE`,
      [correoNorm]
    );

    if (rows.length === 0 || rows[0].estado_usuario !== 'ACTIVO') {
      return null;
    }

    const user = rows[0];
    await client.query(
      `UPDATE token_recuperacion
       SET fecha_uso = CURRENT_TIMESTAMP
       WHERE id_usuario = $1 AND fecha_uso IS NULL`,
      [user.id_usuario]
    );

    await client.query(
      `INSERT INTO token_recuperacion (id_usuario, token_hash, fecha_expiracion)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '60 minutes')`,
      [user.id_usuario, tokenHash]
    );

    return user;
  });

  if (userToNotify) {
    dispatchPasswordResetEmail({
      correo: userToNotify.correo,
      nombre: userToNotify.nombre,
      token: rawToken,
    });
  }

  return {
    mensaje: 'Si el correo electrónico está registrado en una cuenta activa, recibirás instrucciones para restablecer tu contraseña.',
  };
}

export async function restablecerContrasena({ token, nueva_contrasena }) {
  const tokenHash = sha256Hex(token.trim());
  const newHash = await hashPassword(nueva_contrasena);

  await withTransaction(async (client) => {
    // Jerarquía unificada: usuario -> token_recuperacion -> sesion_refresh
    const lookupRes = await client.query(
      `SELECT id_token, id_usuario
       FROM token_recuperacion
       WHERE token_hash = $1`,
      [tokenHash]
    );
    if (lookupRes.rows.length === 0) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'El enlace de recuperación no es válido.');
    }

    const idUsuario = lookupRes.rows[0].id_usuario;
    const userRes = await client.query(
      `SELECT id_usuario, estado_usuario
       FROM usuario
       WHERE id_usuario = $1
       FOR UPDATE`,
      [idUsuario]
    );
    if (userRes.rows.length === 0) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'El enlace de recuperación no es válido.');
    }

    const tokenRes = await client.query(
      `SELECT id_token, id_usuario, fecha_expiracion, fecha_uso
       FROM token_recuperacion
       WHERE id_token = $1
       FOR UPDATE`,
      [lookupRes.rows[0].id_token]
    );
    if (tokenRes.rows.length === 0) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'El enlace de recuperación no es válido.');
    }

    const row = tokenRes.rows[0];
    if (row.fecha_uso !== null || new Date(row.fecha_expiracion).getTime() <= Date.now()) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'El enlace de recuperación ha expirado o ya fue utilizado.');
    }

    if (userRes.rows[0].estado_usuario !== 'ACTIVO') {
      throw new AppError(403, 'USUARIO_INACTIVO', 'La cuenta se encuentra inactiva.');
    }

    await revocarSesionesUsuarioLocked(client, row.id_usuario, 'RESET_PASSWORD');

    await client.query(
      `UPDATE usuario
       SET contrasena_hash = $2,
           token_version = token_version + 1
       WHERE id_usuario = $1`,
      [row.id_usuario, newHash]
    );

    await client.query(
      `UPDATE token_recuperacion
       SET fecha_uso = CURRENT_TIMESTAMP
       WHERE id_token = $1`,
      [row.id_token]
    );
  });

  return { mensaje: 'Contraseña restablecida correctamente.' };
}
