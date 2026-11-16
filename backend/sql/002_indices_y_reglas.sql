-- BikeStore v1 — Índices únicos, parciales y de rendimiento

-- Unicidad case-insensitive de correo
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_correo_lower
  ON usuario (LOWER(correo));

-- Tokens de recuperación vigentes por usuario
CREATE INDEX IF NOT EXISTS idx_token_recuperacion_activo
  ON token_recuperacion (id_usuario)
  WHERE fecha_uso IS NULL;

-- Único carrito activo por cliente
CREATE UNIQUE INDEX IF NOT EXISTS ux_carrito_usuario_activo
  ON carrito (id_usuario)
  WHERE estado = 'ACTIVO';

-- Máximo un pedido pendiente por cliente
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_usuario_pendiente
  ON pedido (id_usuario)
  WHERE estado_pedido = 'PENDIENTE';

-- Máximo un pago aprobado o reembolsado por pedido (relación 1:N de intentos)
CREATE UNIQUE INDEX IF NOT EXISTS ux_pago_pedido_aprobado
  ON pago (id_pedido)
  WHERE estado_pago IN ('APROBADO', 'REEMBOLSADO');

-- Idempotencia opcional en pagos por pedido
CREATE UNIQUE INDEX IF NOT EXISTS ux_pago_pedido_idempotencia
  ON pago (id_pedido, clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

-- Índices de consulta para catálogo, pedidos, pagos, expiración y retractos
CREATE INDEX IF NOT EXISTS idx_producto_catalogo
  ON producto (estado, id_categoria, precio);

CREATE INDEX IF NOT EXISTS idx_pedido_usuario_fecha
  ON pedido (id_usuario, fecha_pedido DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_pendiente_expiracion
  ON pedido (fecha_expiracion)
  WHERE estado_pedido = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_pago_fecha
  ON pago (fecha_pago);

CREATE INDEX IF NOT EXISTS idx_retracto_estado
  ON retracto (estado_retracto, fecha_solicitud DESC);
