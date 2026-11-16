# Contrato API REST v1 — BikeStore (`CONTRATO_API_V1.md`)

* **Versión:** `v1` (`2026-11-15`)
* **Base URL local:** `http://localhost:3000/api`
* **Formato de éxito:** `{ "ok": true, "datos": ..., "meta": { ... }? }`
* **Formato de error:** `{ "ok": false, "codigo": "CODIGO_DOMINIO", "mensaje": "Descripción en español", "detalles": [...]? }`
* **Cabeceras relevantes:**
  * `Authorization: Bearer <jwt_hs256_15m>` *(en rutas autenticadas)*
  * `Idempotency-Key: <string_8_a_100>` *(opcional en `POST /api/carrito/fusionar`, `POST /api/pedidos/:id/pagos`, `POST /api/pedidos/:id/volver-al-carrito`)*

---

## 1. Catálogo cerrado de códigos de dominio y HTTP

| Código de dominio | HTTP | Causa |
| :--- | :---: | :--- |
| `VALIDACION_INVALIDA` | `400` | Esquema `Zod` inválido, campos desconocidos o reglas sintácticas fallidas. |
| `RANGO_REPORTES_EXCEDIDO` | `400` | Rango de reportes `> 90 días`, `desde > hasta` o consulta `> 5000 filas`. |
| `TOKEN_INVALIDO` | `401` | JWT ausente, malformado, expirado o token de recuperación inválido/expirado. |
| `CREDENCIALES_INVALIDAS` | `401` | Correo/contraseña incorrectos o contraseña actual inválida. |
| `SESION_REVOCADA` | `401` | `tv` del JWT distinto a `usuario.token_version` o rol desactualizado. |
| `ROL_NO_AUTORIZADO` | `403` | El rol único del usuario no tiene permiso para la ruta. |
| `USUARIO_INACTIVO` | `403` | Cuenta en estado `'INACTIVO'`. |
| `RECURSO_NO_ENCONTRADO` | `404` | Recurso inexistente o inaccesible para el cliente autenticado. |
| `CORREO_DUPLICADO` | `409` | Correo ya registrado (`LOWER(correo)`). |
| `DOCUMENTO_DUPLICADO` | `409` | Combinación `(tipo_documento, numero_documento)` ya registrada. |
| `STOCK_INSUFICIENTE` | `409` | Cantidad solicitada supera `producto.existencias`. |
| `PRECIO_ACTUALIZADO` | `409` | Variación entre `detalle_carrito.precio_unidad` y `producto.precio`; carrito actualizado para confirmación. |
| `PEDIDO_PENDIENTE_ACTIVO` | `409` | El cliente ya posee un pedido `'PENDIENTE'` vigente (no vencido). |
| `RESERVA_EXPIRADA` | `409` | Vencieron los `15 minutos` de reserva del pedido; pedido pasado a `'CANCELADO'`. |
| `PEDIDO_YA_PAGADO` | `409` | El pedido ya cuenta con un pago `'APROBADO'`. |
| `IDEMPOTENCY_CONFLICT` | `409` | Misma `Idempotency-Key` reutilizada con payload diferente. |
| `TRANSICION_ESTADO_INVALIDA` | `409` | Cambio de estado no permitido en pedido o retracto. |
| `PLAZO_RETRACTO_VENCIDO` | `409` | Solicitud radicada después de los `5 días hábiles` en `America/Bogota`. |
| `CANTIDAD_RETRACTO_EXCEDIDA` | `409` | Unidades superan el saldo disponible (incluyendo unidades ya rechazadas por `'DANADO'`). |
| `ULTIMO_ADMIN_ACTIVO` | `409` | Inactivar o degradar rol dejaría `< 1` administrador `'ACTIVO'`. |
| `CATEGORIA_CON_PRODUCTOS` | `409` | Operación restringida por existir productos asociados a la categoría. |
| `RATE_LIMIT_EXCEDIDO` | `429` | Exceso de solicitudes en endpoints públicos de autenticación. |
| `CALENDARIO_FESTIVOS_INCOMPLETO` | `500` | Falta cobertura en `festivo_colombia` para los 20 días posteriores a `fecha_entrega`. |
| `ERROR_INTERNO` | `500` | Error inesperado del servidor. |

---

## 2. Validación sintáctica inicial de documentos (`RF` / `CU-04`)

*(Validación sintáctica inicial sobre `trim().toUpperCase()`, sin implicar verificación oficial estatal).*
* `CC`: `^[0-9]{6,10}$`
* `TI`: `^[0-9]{10,11}$`
* `CE`: `^[A-Za-z0-9]{6,10}$`
* `PASAPORTE`: `^[A-Za-z0-9]{5,20}$`
* `PPT`: `^[0-9]{6,15}$`

---

## 3. Endpoints cerrados (`/api/...`)

### Sistema y Autenticación
* **`GET /api/health`** (Público) → `200 { ok: true, datos: { estado: "UP", bd: true, tiempo_utc } }`
* **`POST /api/auth/registro`** (Público, *rate limit*)
  * Body Zod estricto: `{ tipo_documento, numero_documento, nombre, primer_apellido, segundo_apellido?, telefono, correo, contrasena (>=8) }`
  * `201`: `{ ok: true, datos: { id_usuario, correo, rol: "CLIENTE" } }`
* **`POST /api/auth/login`** (Público, *rate limit*)
  * Body: `{ correo, contrasena }` → `200 { ok: true, datos: { token, usuario: { id_usuario, nombre, primer_apellido, correo, rol } } }`
* **`POST /api/auth/logout`** (Auth) → Incrementa `token_version` → `200 { ok: true, datos: { mensaje: "Sesión cerrada correctamente" } }`
* **`POST /api/auth/recuperar`** (Público, *rate limit*)
  * Body: `{ correo }` → Responde `200` neutro inmediato tras `COMMIT` y despacha correo de forma no bloqueante.
* **`POST /api/auth/restablecer`** (Público, *rate limit*)
  * Body: `{ token, nueva_contrasena (>=8) }` → Solo si cuenta `'ACTIVO'`; actualiza hash, marca `fecha_uso` e incrementa `token_version`.

### Perfil (`Auth`)
* **`GET /api/perfil`** → `200` sin `contrasena_hash`.
* **`PUT /api/perfil`** → Body estricto: `{ nombre, primer_apellido, segundo_apellido?, telefono }` *(rechaza cambios de documento, correo, rol o estado)*.
* **`PATCH /api/perfil/contrasena`** → Body: `{ contrasena_actual, nueva_contrasena (>=8) }` → Incrementa `token_version`.

### Catálogo público
* **`GET /api/categorias`** → Categorías con `estado = TRUE`.
* **`GET /api/productos`** → Query: `?id_categoria=&q=&orden_precio=asc|desc&page=1&limit=12` *(máx. `limit=50`)*. Filtra `producto.estado = TRUE AND categoria.estado = TRUE`; `existencias = 0` visible con `agotado: true`.
* **`GET /api/productos/:id`** → Detalle vigente si producto y categoría están activos; `404` en caso contrario.

### Carrito (`CLIENTE`)
* **`GET /api/carrito`** → Carrito `'ACTIVO'` del cliente e ítems vigentes.
* **`POST /api/carrito/fusionar`** *(cabecera opcional `Idempotency-Key`)* → Body: `{ schema_version: 1, items: [{ id_producto, cantidad }] }` → `200 { ok: true, datos: { id_carrito, items, total, ajustes } }`.
* **`POST /api/carrito/items`** → Body: `{ id_producto, cantidad (>0) }`.
* **`PATCH /api/carrito/items/:id_producto`** → Body: `{ cantidad (>0) }`.
* **`DELETE /api/carrito/items/:id_producto`** → Elimina línea del carrito `'ACTIVO'`.

### Pedidos y Pagos (`CLIENTE`)
* **`POST /api/pedidos`** → Body: `{ direccion_envio }` → Checkout transaccional con reserva `15m`; `409 PRECIO_ACTUALIZADO` con carrito actualizado si varió algún precio.
* **`GET /api/pedidos`** → Query: `?page=1&limit=10`.
* **`GET /api/pedidos/:id`** → Detalle completo (`detalle_pedido`, `pagos`, `retractos`).
* **`POST /api/pedidos/:id/pagos`** *(cabecera opcional `Idempotency-Key`)* → Body estricto: `{ metodo_pago: "TARJETA"|"PSE"|"TRANSFERENCIA", referencia_simulada }` *(rechaza si incluye campos de estado)*. Referencia terminada en `'00'` → `'RECHAZADO'`; otro caso válido → `'APROBADO'` y pedido `'PAGADO'`.
* **`POST /api/pedidos/:id/cancelar`** → Body: `{ motivo_cancelacion?, datos_reembolso? }` *(`datos_reembolso` obligatorio sin PAN/CVV si estaba `'PAGADO'`)*.
* **`POST /api/pedidos/:id/volver-al-carrito`** *(cabecera opcional `Idempotency-Key`)* → Reincorpora disponibles de un pedido `'CANCELADO'` retornando carrito y `ajustes[]`.

### Retractos (`CLIENTE` — exclusivamente `RETRACTO_LEGAL`)
* **`POST /api/pedidos/:id/retractos`** → Body: `{ motivo, datos_reembolso, items: [{ id_detalle_pedido, cantidad }] }`. Valida `5 días hábiles` en `America/Bogota` sobre `festivo_colombia`.
* **`GET /api/retractos`** y **`GET /api/retractos/:id`** → Solicitudes propias del cliente y su detalle por producto.

### Administración (`ADMIN`)
* **Categorías:** `GET /api/admin/categorias`, `POST /api/admin/categorias`, `PUT /api/admin/categorias/:id`, `PATCH /api/admin/categorias/:id/estado`.
* **Productos:** `GET /api/admin/productos` (`?q=&id_categoria=&estado=&page=1&limit=20`), `POST /api/admin/productos` (`imagen_url` `http(s)://`), `PUT /api/admin/productos/:id` *(sin modificar `existencias`)*, `PATCH /api/admin/productos/:id/estado`, `PATCH /api/admin/productos/:id/existencias` (`{ existencias >= 0 }`).
* **Usuarios:** `GET /api/admin/usuarios` (`?page=1&limit=20&q=`), `PATCH /api/admin/usuarios/:id/estado` (`{ estado_usuario: "ACTIVO"|"INACTIVO" }`), `PATCH /api/admin/usuarios/:id/rol` (`{ rol: "ADMIN"|"CLIENTE" }`). Ambos protegen último `ADMIN` (`409 ULTIMO_ADMIN_ACTIVO`) e incrementan `token_version`.
* **Pedidos:** `GET /api/admin/pedidos` (`?estado=&desde=&hasta=&page=1&limit=20`), `PATCH /api/admin/pedidos/:id/estado` (`{ estado_pedido: "ENVIADO"|"ENTREGADO"|"CANCELADO", motivo_cancelacion? }`), `PATCH /api/admin/pedidos/:id/reembolso` (`{ observacion? }` → marca `pedido` y `pago` total como `'REEMBOLSADO'`).
* **Retractos:** `GET /api/admin/retractos`, `GET /api/admin/retractos/:id`, `PATCH /api/admin/retractos/:id/decision` (`{ decision: "APROBAR"|"RECHAZAR", observacion_admin? }`), `PATCH /api/admin/retractos/:id/recepcion` (`{ observacion_admin?, items: [{ id_detalle_retracto, cantidad_buen_estado, cantidad_danada, observacion_inspeccion? }] }`), `PATCH /api/admin/retractos/:id/reembolso` (`{ observacion_admin? }`).
* **Reportes netos (`America/Bogota`, máx. `90 días`, máx. `5000 filas`):**
  * `GET /api/admin/reportes/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=`
  * `GET /api/admin/reportes/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=`
