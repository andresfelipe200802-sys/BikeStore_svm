-- BikeStore v1 — Esquema PostgreSQL inicial (14 tablas exactas)

CREATE TABLE IF NOT EXISTS rol (
  id_rol SERIAL PRIMARY KEY,
  nombre VARCHAR(20) NOT NULL UNIQUE CHECK (nombre IN ('ADMIN', 'CLIENTE')),
  descripcion VARCHAR(150) NULL
);

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario SERIAL PRIMARY KEY,
  tipo_documento VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('CC', 'TI', 'CE', 'PASAPORTE', 'PPT')),
  numero_documento VARCHAR(30) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  primer_apellido VARCHAR(100) NOT NULL,
  segundo_apellido VARCHAR(100) NULL,
  telefono VARCHAR(20) NOT NULL,
  correo VARCHAR(150) NOT NULL,
  contrasena_hash VARCHAR(255) NOT NULL,
  estado_usuario VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado_usuario IN ('ACTIVO', 'INACTIVO')),
  token_version INTEGER NOT NULL DEFAULT 1 CHECK (token_version >= 1),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuario_documento UNIQUE (tipo_documento, numero_documento)
);

CREATE TABLE IF NOT EXISTS usuario_rol (
  id_usuario_rol SERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_rol INTEGER NOT NULL REFERENCES rol(id_rol) ON DELETE RESTRICT,
  asignado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuario_rol_unico UNIQUE (id_usuario),
  CONSTRAINT uq_usuario_rol_par UNIQUE (id_usuario, id_rol)
);

CREATE TABLE IF NOT EXISTS token_recuperacion (
  id_token SERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  fecha_uso TIMESTAMPTZ NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categoria (
  id_categoria SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS producto (
  id_producto SERIAL PRIMARY KEY,
  id_categoria INTEGER NOT NULL REFERENCES categoria(id_categoria) ON DELETE RESTRICT,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL,
  precio NUMERIC(12,2) NOT NULL CHECK (precio > 0),
  existencias INTEGER NOT NULL CHECK (existencias >= 0),
  imagen_url VARCHAR(500) NOT NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carrito (
  id_carrito SERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'CONVERTIDO')),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_carrito (
  id_detalle_carrito SERIAL PRIMARY KEY,
  id_carrito INTEGER NOT NULL REFERENCES carrito(id_carrito) ON DELETE CASCADE,
  id_producto INTEGER NOT NULL REFERENCES producto(id_producto) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unidad NUMERIC(12,2) NOT NULL CHECK (precio_unidad > 0),
  CONSTRAINT uq_detalle_carrito_producto UNIQUE (id_carrito, id_producto)
);

CREATE TABLE IF NOT EXISTS pedido (
  id_pedido SERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  direccion_envio VARCHAR(255) NOT NULL,
  total NUMERIC(12,2) NOT NULL CHECK (total > 0),
  estado_pedido VARCHAR(20) NOT NULL CHECK (estado_pedido IN ('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO')),
  fecha_pedido TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  fecha_envio TIMESTAMPTZ NULL,
  fecha_entrega TIMESTAMPTZ NULL,
  fecha_cancelacion TIMESTAMPTZ NULL,
  motivo_cancelacion TEXT NULL,
  cancelado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  estado_reembolso_cancelacion VARCHAR(30) NOT NULL DEFAULT 'NO_APLICA' CHECK (estado_reembolso_cancelacion IN ('NO_APLICA', 'PENDIENTE_REEMBOLSO', 'REEMBOLSADO')),
  datos_reembolso_cancelacion VARCHAR(500) NULL,
  fecha_limite_reembolso_cancelacion TIMESTAMPTZ NULL,
  fecha_reembolso_cancelacion TIMESTAMPTZ NULL,
  CONSTRAINT chk_pedido_fecha_envio CHECK (estado_pedido <> 'ENVIADO' OR fecha_envio IS NOT NULL),
  CONSTRAINT chk_pedido_fecha_entrega CHECK (estado_pedido <> 'ENTREGADO' OR fecha_entrega IS NOT NULL),
  CONSTRAINT chk_pedido_fecha_cancelacion CHECK (estado_pedido <> 'CANCELADO' OR fecha_cancelacion IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id_detalle_pedido SERIAL PRIMARY KEY,
  id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT,
  id_producto INTEGER NOT NULL REFERENCES producto(id_producto) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario > 0),
  CONSTRAINT uq_detalle_pedido_producto UNIQUE (id_pedido, id_producto)
);

CREATE TABLE IF NOT EXISTS pago (
  id_pago SERIAL PRIMARY KEY,
  id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT,
  metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('TARJETA', 'PSE', 'TRANSFERENCIA')),
  referencia_simulada VARCHAR(40) NOT NULL,
  numero_intento INTEGER NOT NULL CHECK (numero_intento > 0),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  estado_pago VARCHAR(20) NOT NULL CHECK (estado_pago IN ('APROBADO', 'RECHAZADO', 'REEMBOLSADO')),
  clave_idempotencia VARCHAR(100) NULL,
  payload_hash VARCHAR(64) NULL,
  motivo_resultado VARCHAR(255) NULL,
  fecha_pago TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pago_pedido_intento UNIQUE (id_pedido, numero_intento)
);

CREATE TABLE IF NOT EXISTS retracto (
  id_retracto SERIAL PRIMARY KEY,
  id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  tipo_retracto VARCHAR(20) NOT NULL CHECK (tipo_retracto IN ('TOTAL', 'PARCIAL')),
  motivo VARCHAR(500) NOT NULL,
  datos_reembolso VARCHAR(500) NOT NULL,
  estado_retracto VARCHAR(30) NOT NULL CHECK (estado_retracto IN ('SOLICITADO', 'APROBADO_RECEPCION', 'COMPLETADO', 'RECHAZADO')),
  estado_reembolso VARCHAR(30) NOT NULL CHECK (estado_reembolso IN ('PENDIENTE_REEMBOLSO', 'REEMBOLSADO', 'NO_APLICA')),
  monto_reembolso NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_reembolso >= 0),
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_limite_reembolso TIMESTAMPTZ NULL,
  fecha_recepcion_fisica TIMESTAMPTZ NULL,
  fecha_reembolso TIMESTAMPTZ NULL,
  revisado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  observacion_admin VARCHAR(500) NULL,
  CONSTRAINT chk_retracto_fecha_limite CHECK (estado_reembolso = 'NO_APLICA' OR fecha_limite_reembolso IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS detalle_retracto (
  id_detalle_retracto SERIAL PRIMARY KEY,
  id_retracto INTEGER NOT NULL REFERENCES retracto(id_retracto) ON DELETE CASCADE,
  id_detalle_pedido INTEGER NOT NULL REFERENCES detalle_pedido(id_detalle_pedido) ON DELETE RESTRICT,
  cantidad_devuelta INTEGER NOT NULL CHECK (cantidad_devuelta > 0),
  cantidad_buen_estado INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_buen_estado >= 0),
  cantidad_danada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_danada >= 0),
  subtotal_reembolso NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_reembolso >= 0),
  estado_inspeccion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_inspeccion IN ('PENDIENTE', 'BUEN_ESTADO', 'PARCIAL', 'DANADO')),
  observacion_inspeccion VARCHAR(300) NULL,
  CONSTRAINT uq_detalle_retracto_linea UNIQUE (id_retracto, id_detalle_pedido),
  CONSTRAINT chk_detalle_retracto_cantidades CHECK (
    estado_inspeccion = 'PENDIENTE' OR (cantidad_buen_estado + cantidad_danada = cantidad_devuelta)
  )
);

CREATE TABLE IF NOT EXISTS festivo_colombia (
  fecha DATE PRIMARY KEY,
  anio INTEGER NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  CONSTRAINT chk_festivo_anio CHECK (anio = EXTRACT(YEAR FROM fecha))
);
