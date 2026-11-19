-- BikeStore v1 — Migración 005: Sesiones Refresh (A1) e Idempotencia Persistente (B1)
-- Sube el esquema de 14 a 16 tablas exactas y extiende pedido para devolución idempotente al carrito.

-- Tabla #15: sesion_refresh
CREATE TABLE IF NOT EXISTS sesion_refresh (
  id_sesion SERIAL PRIMARY KEY,
  rotacion_uid UUID NOT NULL DEFAULT gen_random_uuid(),
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  familia_id UUID NOT NULL,
  reemplazado_por_hash VARCHAR(64) NULL,
  rotacion_idem_hash VARCHAR(64) NULL,
  reemplazo_cifrado TEXT NULL,
  reemplazo_expira_en TIMESTAMPTZ NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  ultimo_uso_at TIMESTAMPTZ NULL,
  fecha_revocacion TIMESTAMPTZ NULL,
  motivo_revocacion VARCHAR(40) NULL,
  ip_origen VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  CONSTRAINT uq_sesion_refresh_rotacion_uid UNIQUE (rotacion_uid),
  CONSTRAINT uq_sesion_refresh_token_hash UNIQUE (token_hash),
  CONSTRAINT chk_sesion_refresh_fechas CHECK (fecha_expiracion > fecha_creacion),
  CONSTRAINT chk_sesion_refresh_revocacion_consistente CHECK (
    (fecha_revocacion IS NULL AND motivo_revocacion IS NULL)
    OR (fecha_revocacion IS NOT NULL AND motivo_revocacion IS NOT NULL)
  ),
  CONSTRAINT chk_sesion_refresh_motivo CHECK (
    motivo_revocacion IN (
      'ROTACION',
      'REUSO_DETECTADO',
      'LOGOUT_GLOBAL',
      'CAMBIO_PASSWORD',
      'RESET_PASSWORD',
      'EXPIRACION',
      'ADMIN_INACTIVACION'
    )
  ),
  CONSTRAINT chk_sesion_refresh_rotacion_consistente CHECK (
    motivo_revocacion IS DISTINCT FROM 'ROTACION'
    OR (reemplazado_por_hash IS NOT NULL AND rotacion_idem_hash IS NOT NULL)
  ),
  CONSTRAINT chk_sesion_refresh_reemplazo_cifrado CHECK (
    (reemplazo_cifrado IS NULL AND reemplazo_expira_en IS NULL)
    OR (
      reemplazo_cifrado IS NOT NULL
      AND reemplazo_expira_en IS NOT NULL
      AND motivo_revocacion = 'ROTACION'
      AND reemplazado_por_hash IS NOT NULL
      AND rotacion_idem_hash IS NOT NULL
      AND reemplazo_expira_en > fecha_revocacion
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_refresh_familia_activa
  ON sesion_refresh (familia_id)
  WHERE fecha_revocacion IS NULL;

CREATE INDEX IF NOT EXISTS idx_sesion_refresh_usuario_activas
  ON sesion_refresh (id_usuario)
  WHERE fecha_revocacion IS NULL;

CREATE INDEX IF NOT EXISTS idx_sesion_refresh_familia
  ON sesion_refresh (familia_id);

CREATE INDEX IF NOT EXISTS idx_sesion_refresh_reemplazo_expira
  ON sesion_refresh (reemplazo_expira_en)
  WHERE reemplazo_cifrado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sesion_refresh_purga
  ON sesion_refresh (fecha_expiracion, fecha_revocacion);

-- Tabla #16: carrito_fusion_idempotencia
CREATE TABLE IF NOT EXISTS carrito_fusion_idempotencia (
  id_fusion SERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_carrito INTEGER NULL REFERENCES carrito(id_carrito) ON DELETE SET NULL,
  clave_idempotencia UUID NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  resultado_json JSONB NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_carrito_fusion_usuario_clave UNIQUE (id_usuario, clave_idempotencia),
  CONSTRAINT chk_carrito_fusion_resultado_objeto CHECK (jsonb_typeof(resultado_json) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_carrito_fusion_idem_purga
  ON carrito_fusion_idempotencia (fecha_creacion);

-- Extensión de Tabla #10: pedido (devolución idempotente de ítems al carrito)
ALTER TABLE pedido
  ADD COLUMN IF NOT EXISTS clave_idempotencia_carrito UUID NULL,
  ADD COLUMN IF NOT EXISTS fecha_devolucion_carrito TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resultado_devolucion_carrito JSONB NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_pedido_devolucion_carrito_consistente'
      AND conrelid = 'pedido'::regclass
  ) THEN
    ALTER TABLE pedido
      ADD CONSTRAINT chk_pedido_devolucion_carrito_consistente CHECK (
        (
          clave_idempotencia_carrito IS NULL
          AND fecha_devolucion_carrito IS NULL
          AND resultado_devolucion_carrito IS NULL
        )
        OR (
          clave_idempotencia_carrito IS NOT NULL
          AND fecha_devolucion_carrito IS NOT NULL
          AND resultado_devolucion_carrito IS NOT NULL
          AND estado_pedido = 'CANCELADO'
          AND fecha_cancelacion IS NOT NULL
          AND jsonb_typeof(resultado_devolucion_carrito) = 'object'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_usuario_idem_carrito
  ON pedido (id_usuario, clave_idempotencia_carrito)
  WHERE clave_idempotencia_carrito IS NOT NULL;
