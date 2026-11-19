import { query, withTransaction } from '../config/db.js';
import { AppError } from '../middlewares/error.middleware.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { revocarSesionesUsuarioLocked } from './auth.service.js';

export async function obtenerPerfil(idUsuario) {
  const { rows } = await query(
    `SELECT u.id_usuario, u.tipo_documento, u.numero_documento, u.nombre, u.primer_apellido,
            u.segundo_apellido, u.telefono, u.correo, u.estado_usuario, u.fecha_registro, r.nombre AS rol
     FROM usuario u
     JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
     JOIN rol r ON r.id_rol = ur.id_rol
     WHERE u.id_usuario = $1`,
    [idUsuario]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Usuario no encontrado.');
  }
  return rows[0];
}

export async function actualizarPerfil(idUsuario, datos) {
  const { rows } = await query(
    `UPDATE usuario
     SET nombre = $2,
         primer_apellido = $3,
         segundo_apellido = $4,
         telefono = $5
     WHERE id_usuario = $1
     RETURNING id_usuario, tipo_documento, numero_documento, nombre, primer_apellido, segundo_apellido, telefono, correo, estado_usuario, fecha_registro`,
    [
      idUsuario,
      datos.nombre.trim(),
      datos.primer_apellido.trim(),
      datos.segundo_apellido ? datos.segundo_apellido.trim() : null,
      datos.telefono.trim(),
    ]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Usuario no encontrado.');
  }
  return rows[0];
}

export async function cambiarContrasena(idUsuario, { contrasena_actual, nueva_contrasena }) {
  const nuevoHash = await hashPassword(nueva_contrasena);

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT contrasena_hash FROM usuario WHERE id_usuario = $1 FOR UPDATE`,
      [idUsuario]
    );
    if (rows.length === 0) {
      throw new AppError(404, 'RECURSO_NO_ENCONTRADO', 'Usuario no encontrado.');
    }

    const ok = await comparePassword(contrasena_actual, rows[0].contrasena_hash);
    if (!ok) {
      throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'La contraseña actual no coincide.');
    }

    await revocarSesionesUsuarioLocked(client, idUsuario, 'CAMBIO_PASSWORD');

    await client.query(
      `UPDATE usuario
       SET contrasena_hash = $2,
           token_version = token_version + 1
       WHERE id_usuario = $1`,
      [idUsuario, nuevoHash]
    );
  });

  return { mensaje: 'Contraseña actualizada correctamente. Tus sesiones anteriores han sido cerradas.' };
}
