import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, withTransaction } from '../config/db.js';
import { hashPassword } from '../utils/password.js';
import { normalizeDocumento } from '../utils/documento.js';

export async function seedInitialAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@bikestore.local').trim().toLowerCase();
  const plainPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminBikeStore2026!';
  const docTipo = process.env.SEED_ADMIN_DOC_TIPO || 'CC';
  const docNum = normalizeDocumento(process.env.SEED_ADMIN_DOC_NUM || '1000000001');
  const nombre = process.env.SEED_ADMIN_NOMBRE || 'Administrador';
  const primerApellido = process.env.SEED_ADMIN_APELLIDO || 'Principal';
  const telefono = process.env.SEED_ADMIN_TELEFONO || '3000000000';

  const passwordHash = await hashPassword(plainPassword);

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id_usuario FROM usuario WHERE LOWER(correo) = LOWER($1) OR (tipo_documento = $2 AND numero_documento = $3)`,
      [email, docTipo, docNum]
    );
    if (existing.rows.length > 0) {
      return { created: false, id_usuario: existing.rows[0].id_usuario, correo: email };
    }

    const rolRes = await client.query(`SELECT id_rol FROM rol WHERE nombre = 'ADMIN'`);
    if (rolRes.rows.length === 0) {
      throw new Error("El rol 'ADMIN' no existe. Ejecute npm run db:migrate primero.");
    }

    const userRes = await client.query(
      `INSERT INTO usuario (tipo_documento, numero_documento, nombre, primer_apellido, telefono, correo, contrasena_hash, estado_usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVO')
       RETURNING id_usuario`,
      [docTipo, docNum, nombre, primerApellido, telefono, email, passwordHash]
    );

    const userId = userRes.rows[0].id_usuario;
    await client.query(
      `INSERT INTO usuario_rol (id_usuario, id_rol, asignado_por)
       VALUES ($1, $2, NULL)
       ON CONFLICT (id_usuario) DO NOTHING`,
      [userId, rolRes.rows[0].id_rol]
    );

    return { created: true, id_usuario: userId, correo: email };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedInitialAdmin()
    .then(async (res) => {
      console.log(res.created ? `ADMIN inicial creado: ${res.correo}` : `ADMIN inicial ya existía: ${res.correo}`);
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Error ejecutando seedAdmin:', err);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
