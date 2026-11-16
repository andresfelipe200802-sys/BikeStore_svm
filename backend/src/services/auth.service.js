import { withTransaction } from '../config/db.js';
import { AppError } from '../middlewares/error.middleware.js';
import { isValidDocumento, normalizeDocumento } from '../utils/documento.js';
import { signAccessToken } from '../utils/jwt.js';
import { dispatchPasswordResetEmail } from '../utils/mailer.js';
import {
  compareDummyPassword,
  comparePassword,
  hashPassword,
  randomTokenHex,
  sha256Hex,
} from '../utils/password.js';

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

export async function iniciarSesion({ correo, contrasena }) {
  const correoNorm = correo.trim().toLowerCase();

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT u.id_usuario, u.nombre, u.primer_apellido, u.correo, u.contrasena_hash, u.estado_usuario, u.token_version, r.nombre AS rol
       FROM usuario u
       JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
       JOIN rol r ON r.id_rol = ur.id_rol
       WHERE LOWER(u.correo) = LOWER($1)`,
      [correoNorm]
    );
    return rows[0] || null;
  });

  if (!result) {
    await compareDummyPassword(contrasena);
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo electrónico o contraseña no válidos.');
  }

  const valid = await comparePassword(contrasena, result.contrasena_hash);
  if (!valid) {
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo electrónico o contraseña no válidos.');
  }

  if (result.estado_usuario !== 'ACTIVO') {
    throw new AppError(403, 'USUARIO_INACTIVO', 'Tu cuenta se encuentra inactiva. Contacta al administrador.');
  }

  const token = signAccessToken({
    id_usuario: result.id_usuario,
    rol: result.rol,
    token_version: result.token_version,
  });

  return {
    token,
    usuario: {
      id_usuario: result.id_usuario,
      nombre: result.nombre,
      primer_apellido: result.primer_apellido,
      correo: result.correo,
      rol: result.rol,
    },
  };
}

export async function cerrarSesion(idUsuario) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE usuario SET token_version = token_version + 1 WHERE id_usuario = $1`,
      [idUsuario]
    );
  });
  return { mensaje: 'Sesión cerrada correctamente.' };
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
    const { rows } = await client.query(
      `SELECT tr.id_token, tr.id_usuario, tr.fecha_expiracion, tr.fecha_uso, u.estado_usuario
       FROM token_recuperacion tr
       JOIN usuario u ON u.id_usuario = tr.id_usuario
       WHERE tr.token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'El enlace de recuperación no es válido.');
    }

    const row = rows[0];
    if (row.fecha_uso !== null || new Date(row.fecha_expiracion).getTime() <= Date.now()) {
      throw new AppError(401, 'TOKEN_INVALIDO', 'El enlace de recuperación ha expirado o ya fue utilizado.');
    }

    if (row.estado_usuario !== 'ACTIVO') {
      throw new AppError(403, 'USUARIO_INACTIVO', 'La cuenta se encuentra inactiva.');
    }

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
