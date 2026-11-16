-- BikeStore v1 — Semilla idempotente de roles y categorías iniciales

INSERT INTO rol (nombre, descripcion) VALUES
  ('ADMIN', 'Administrador general con acceso completo a catálogo, usuarios, pedidos, posventa y reportes'),
  ('CLIENTE', 'Cliente comprador con acceso a carrito, pedidos, pagos simulados y retracto legal')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO categoria (nombre, descripcion, estado) VALUES
  ('Bicicletas de Ruta', 'Bicicletas ligeras diseñadas para velocidad y recorridos en carretera', TRUE),
  ('Bicicletas de Montaña', 'Bicicletas todo terreno con suspensión y geometría para senderos', TRUE),
  ('Bicicletas Urbanas', 'Bicicletas cómodas para movilidad diaria en ciudad', TRUE),
  ('Cascos y Protección', 'Cascos certificados, guantes y equipamiento de seguridad vial', TRUE),
  ('Accesorios y Repuestos', 'Luces, infladores, cadenas, portabotellas y componentes de reemplazo', TRUE)
ON CONFLICT (nombre) DO NOTHING;
