# Contrato API REST v1 — BikeStore (`CONTRATO_API_V1.md`)

* **Versión:** `v1` (actualizado `2026-11-19` — esquema de **16 tablas**, sesiones A1, idempotencia duradera B1 y endurecimiento de seguridad)
* **Base URL local:** `http://localhost:3000/api`
* **Formato de éxito:** `{ "ok": true, "datos": ..., "meta": { ... }? }`
* **Formato de error:** `{ "ok": false, "codigo": "CODIGO_DOMINIO", "mensaje": "Descripción en español", "detalles": [...]? }`
* **Cabeceras y cookies relevantes:**
  * `Authorization: Bearer <jwt_hs256_15m>` *(en rutas autenticadas; en el frontend el Access JWT se conserva **exclusivamente en memoria React**)*
  * **Cookie `HttpOnly` `bikestore_rt`:** `Path=/api/auth`, `Max-Age=604800` (7 días), `HttpOnly`, `SameSite=Lax`, `Secure=env.COOKIE_SECURE` *(fijada en `/api/auth/login`, rotada en `/api/auth/refresh`, eliminada en `/api/auth/logout` o revocación)*.
  * **Cabeceras CSRF (`Origin` + `X-Requested-With: BikeStore`):** obligatorias en `POST /api/auth/refresh` (origen debe pertenecer a `CORS_ORIGINS`) y en `POST /api/auth/logout` siempre que viaje la cookie `bikestore_rt` (exento solo cuando se llama sin cookie usando `Authorization: Bearer`).
  * **`Idempotency-Key`:**
    * **Obligatorio en formato UUID RFC 4122/9562** en `POST /api/auth/refresh`, `POST /api/carrito/fusionar` y `POST /api/pedidos/:id/volver-al-carrito` *(si falta o es inválido, responde `400 VALIDACION_INVALIDA`)*.
    * **Opcional** (`string` 8..100, recomendado UUID) en `POST /api/pedidos/:id/pagos`.

---

## 1. Catálogo cerrado de códigos de dominio y HTTP

| Código de dominio | HTTP | Causa |
| :--- | :---: | :--- |
| `VALIDACION_INVALIDA` | `400` | Esquema `Zod` inválido, campos desconocidos, reglas sintácticas fallidas, `Idempotency-Key` UUID faltante/inválido o `imagen_url` rechazada (SVG/SSRF/credenciales). |
| `RANGO_REPORTES_EXCEDIDO` | `400` | Rango de reportes `> 90 días`, `desde > hasta` o consulta `> 5000 filas`. |
| `TOKEN_INVALIDO` | `401` | JWT ausente, malformado, expirado o token de recuperación inválido/expirado. |
| `CREDENCIALES_INVALIDAS` | `401` | Correo/contraseña incorrectos o contraseña actual inválida. |
| `SESION_EXPIRADA` | `401` | Refresh token (`bikestore_rt`) vencido según `sesion_refresh.fecha_expiracion`. |
| `SESION_REVOCADA` | `401` | `tv` del JWT distinto a `usuario.token_version`, rol desactualizado, o refresh token ya rotado/revocado/reusado (`REUSO_DETECTADO`, revocando toda la familia activa). |
| `ROL_NO_AUTORIZADO` | `403` | El rol único del usuario no tiene permiso para la ruta. |
| `USUARIO_INACTIVO` | `403` | Cuenta en estado `'INACTIVO'` (en `/refresh`, revoca además la familia `ADMIN_INACTIVACION` y limpia la cookie). |
| `CSRF_ORIGEN_INVALIDO` | `403` | Falta o no coincide `Origin` con `CORS_ORIGINS` y/o falta `X-Requested-With: BikeStore` en `/auth/refresh` o `/auth/logout` con cookie. |
| `RECURSO_NO_ENCONTRADO` | `404` | Recurso inexistente o inaccesible para el cliente autenticado. |
| `CORREO_DUPLICADO` | `409` | Correo ya registrado (`LOWER(correo)`). |
| `DOCUMENTO_DUPLICADO` | `409` | Combinación `(tipo_documento, numero_documento)` ya registrada. |
| `STOCK_INSUFICIENTE` | `409` | Cantidad solicitada supera `producto.existencias`. |
| `PRECIO_ACTUALIZADO` | `409` | Variación entre `detalle_carrito.precio_unidad` y `producto.precio`; carrito actualizado para confirmación. |
| `PEDIDO_PENDIENTE_ACTIVO` | `409` | El cliente ya posee un pedido `'PENDIENTE'` vigente (no vencido). |
| `RESERVA_EXPIRADA` | `409` | Vencieron los `15 minutos` de reserva del pedido; pedido pasado a `'CANCELADO'`. |
| `PEDIDO_YA_PAGADO` | `409` | El pedido ya cuenta con un pago `'APROBADO'`. |
| `IDEMPOTENCY_CONFLICT` | `409` | Misma `Idempotency-Key` reutilizada con payload diferente (o con otro pedido distinto en `volver-al-carrito`). |
| `TRANSICION_ESTADO_INVALIDA` | `409` | Cambio de estado no permitido en pedido o retracto. |
| `PLAZO_RETRACTO_VENCIDO` | `409` | Solicitud radicada después de los `5 días hábiles` en `America/Bogota`. |
| `CANTIDAD_RETRACTO_EXCEDIDA` | `409` | Unidades superan el saldo disponible (incluyendo unidades ya rechazadas por `'DANADO'`). |
| `ULTIMO_ADMIN_ACTIVO` | `409` | Inactivar o degradar rol dejaría `< 1` administrador `'ACTIVO'`. |
| `CATEGORIA_CON_PRODUCTOS` | `409` | Operación restringida por existir productos asociados a la categoría. |
| `RATE_LIMIT_EXCEDIDO` | `429` | Exceso de solicitudes en endpoints públicos de autenticación y `/refresh`. |
| `CALENDARIO_FESTIVOS_INCOMPLETO` | `500` | Falta cobertura en `festivo_colombia` para los 20 días posteriores a `fecha_entrega`. |
| `ERROR_INTERNO` | `500` | Error inesperado del servidor. |
| `CONFLICTO_CONCURRENCIA` | `503` | Agotamiento de reintentos (`maxRetries = 3`) tras bloqueos/serialización PostgreSQL (`40P01` / `40001`). |

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

### Sistema y Autenticación (Sesiones Refresh A1)
* **`GET /api/health`** (Público) → `200 { ok: true, datos: { estado: "UP", bd: true, tiempo_utc } }`
* **`POST /api/auth/registro`** (Público, *rate limit*)
  * Body Zod estricto: `{ tipo_documento, numero_documento, nombre, primer_apellido, segundo_apellido?, telefono, correo, contrasena (>=8) }`
  * `201`: `{ ok: true, datos: { id_usuario, correo, rol: "CLIENTE" } }` *(el frontend encadena `POST /api/auth/login` tras `201`)*.
* **`POST /api/auth/login`** (Público, *rate limit*)
  * Body: `{ correo, contrasena }`
  * Fija cookie `HttpOnly` **`bikestore_rt`** (`Path=/api/auth`, `Max-Age=604800`, `SameSite=Lax`, `Secure=env.COOKIE_SECURE`) creando una familia nueva en `sesion_refresh` con expiración absoluta de `+7 días`.
  * `200`: `{ ok: true, datos: { token, expires_in: 900, rotacion_uid, usuario: { id_usuario, nombre, primer_apellido, correo, rol } } }`
* **`POST /api/auth/refresh`** (*Rate limit* `refreshLimiter` + CSRF + Cookie `bikestore_rt` + `Idempotency-Key` UUID RFC 4122/9562 **obligatorio**)
  * **Validaciones iniciales:** Exige `Origin` válido dentro de `CORS_ORIGINS` y `X-Requested-With: BikeStore` (`403 CSRF_ORIGEN_INVALIDO` si falla), cabecera `Idempotency-Key` UUID válida (`400 VALIDACION_INVALIDA`) y cookie `bikestore_rt` (`401 TOKEN_INVALIDO` si falta).
  * **Bloqueo transaccional:** `usuario (FOR UPDATE OF u)` → `sesion_refresh (ORDER BY id_sesion ASC FOR UPDATE)`. Si el usuario no está `'ACTIVO'`, revoca la familia (`ADMIN_INACTIVACION`), limpia `reemplazo_cifrado`, borra la cookie y responde `403 USUARIO_INACTIVO`.
  * **Rotación normal (fila activa):** Si venció (`fecha_expiracion <= NOW()`), marca `EXPIRACION`, limpia cookie y retorna **`401 SESION_EXPIRADA`**. Si es vigente, limpia `reemplazo_cifrado` de otras filas de la familia, emite nuevo token hijo `T2` (`32` bytes aleatorios) cifrado en `reemplazo_cifrado` (`AES-256-GCM` + `HKDF-SHA256` con `REFRESH_REPLAY_KEY` + AAD `${idUsuario}|${familiaId}|${parentTokenHash}|${sha256Hex(idempotencyKey)}`) con `reemplazo_expira_en = +30s`, marca `T1` (`ROTACION`, `reemplazado_por_hash`, `rotacion_idem_hash`, `ultimo_uso_at`), inserta `T2` heredando `familia_id` y `fecha_expiracion` exacta de `T1`, fija `Set-Cookie: bikestore_rt=T2` y responde:
    * `200`: `{ ok: true, datos: { token, expires_in: 900, rotacion_uid: T2.rotacion_uid, usuario, replayed: false } }`
  * **Reproducción exacta (`replayed: true`, ventana máx. `30 s`):** Si la fila presentada ya estaba revocada, reproduce **exactamente el mismo `T2`** y nuevo Access JWT **únicamente** si se cumplen las 5 condiciones: (1) `motivo_revocacion === 'ROTACION'`, (2) `rotacion_idem_hash === sha256Hex(Idempotency-Key)`, (3) `reemplazo_cifrado !== null && NOW() <= reemplazo_expira_en`, (4) `fecha_expiracion > NOW()`, y (5) la fila hija `T2` tiene `fecha_revocacion IS NULL AND ultimo_uso_at IS NULL`.
  * **Detección de reúso (`401 SESION_REVOCADA`):** En cualquier otro caso de reúso, revoca toda la familia activa con motivo `REUSO_DETECTADO`, limpia `reemplazo_cifrado`, borra la cookie `bikestore_rt` y responde **`401 SESION_REVOCADA`**. *Nunca se valida ni perdona el reúso mediante `ip_origen` o `user_agent` (son solo de auditoría).*
  * **Nota de seguridad explícita:** La cabecera `Idempotency-Key` demuestra **correlación de operación** para absorber reintentos de red o carreras en la ventana de `30 s`; **no** constituye identidad criptográfica del cliente (la credencial es la cookie `HttpOnly` `bikestore_rt` + verificación `Origin` + `X-Requested-With`).
* **`POST /api/auth/logout`** (CSRF si hay cookie; acepta `Authorization: Bearer` o cookie `bikestore_rt`)
  * Bloquea `usuario FOR UPDATE`, ejecuta logout global (`token_version = token_version + 1` **y** revoca todas las filas activas de `sesion_refresh` con motivo `LOGOUT_GLOBAL` limpiando `reemplazo_cifrado`), borra cookie `bikestore_rt` y responde `200 { ok: true, datos: { mensaje: "Sesión cerrada correctamente" } }`. *(Solo queda exento de `Origin`/`X-Requested-With` cuando no llega cookie `bikestore_rt` y se autentica vía `Bearer`)*
* **`POST /api/auth/recuperar`** (Público, *rate limit*)
  * Body: `{ correo }` → Responde `200` neutro inmediato tras `COMMIT` y despacha correo de forma no bloqueante (`SMTP_TRANSPORT=json|smtp`, sin registrar tokens ni URLs de reset en logs).
* **`POST /api/auth/restablecer`** (Público, *rate limit*)
  * Body: `{ token, nueva_contrasena (>=8) }` → Solo si cuenta `'ACTIVO'`; bloquea `usuario → token_recuperacion → sesion_refresh`, actualiza hash, marca `fecha_uso`, incrementa `token_version` y revoca sesiones refresh activas (`RESET_PASSWORD`).

### Perfil (`Auth`)
* **`GET /api/perfil`** → `200` sin `contrasena_hash`.
* **`PUT /api/perfil`** → Body estricto: `{ nombre, primer_apellido, segundo_apellido?, telefono }` *(rechaza cambios de documento, correo, rol o estado)*.
* **`PATCH /api/perfil/contrasena`** → Body: `{ contrasena_actual, nueva_contrasena (>=8) }` → Incrementa `token_version` y revoca sesiones refresh activas (`CAMBIO_PASSWORD`).

### Catálogo público
* **`GET /api/categorias`** → Categorías con `estado = TRUE`.
* **`GET /api/productos`** → Query: `?id_categoria=&q=&orden_precio=asc|desc&page=1&limit=12` *(máx. `limit=50`)*. Filtra `producto.estado = TRUE AND categoria.estado = TRUE`; `existencias = 0` visible con `agotado: true`.
* **`GET /api/productos/:id`** → Detalle vigente si producto y categoría están activos; `404` en caso contrario.

### Carrito (`CLIENTE` — Idempotencia B1)
* **`GET /api/carrito`** → Carrito `'ACTIVO'` del cliente e ítems vigentes.
* **`POST /api/carrito/fusionar`** *(cabecera **obligatoria** `Idempotency-Key: <UUID RFC 4122/9562>`)*
  * Body: `{ schema_version: 1, items: [{ id_producto, cantidad }] }`
  * Dentro de `withTransaction`, canonicaliza el cuerpo agrupando cantidades por `id_producto` y ordenando ascendentemente (evitando falsos `409 IDEMPOTENCY_CONFLICT` por distinto orden o ítems divididos), y bloquea `usuario FOR UPDATE` → `carrito_fusion_idempotencia FOR UPDATE` **antes** de crear/tocar `carrito`.
  * Respuesta: `200 { ok: true, datos: { id_carrito, items, total, ajustes, replayed } }`.
  * **Retención garantizada de 30 días:** Los registros en `carrito_fusion_idempotencia` (`id_carrito NULL ON DELETE SET NULL`) permanecen disponibles `30 días` para reproducción exacta (`replayed: true`). *Advertencia post-purga:* tras cumplirse `30 días`, la tarea de purga por lotes (`purgarRegistrosExpiradosLote`) elimina el registro antiguo, por lo que reenviar la misma `Idempotency-Key` después de los 30 días se ejecutará como una fusión nueva (`replayed: false`) en lugar de devolver el resultado histórico.
  * Si se reutiliza la misma clave con diferente payload dentro de los 30 días → `409 IDEMPOTENCY_CONFLICT`.
* **`POST /api/carrito/items`** → Body: `{ id_producto, cantidad (>0) }` *(bloquea `usuario FOR UPDATE` antes de crear/obtener carrito activo)*.
* **`PATCH /api/carrito/items/:id_producto`** → Body: `{ cantidad (>0) }`.
* **`DELETE /api/carrito/items/:id_producto`** → Elimina línea del carrito `'ACTIVO'`.

### Pedidos y Pagos (`CLIENTE` — Concurrencia e Idempotencia B1)
* **`POST /api/pedidos`** → Body: `{ direccion_envio }` → Pre-expira cualquier pedido `'PENDIENTE'` vencido antes de la transacción principal; checkout transaccional con reserva `15m` (`FOR NO KEY UPDATE OF p` sobre `producto`); `409 PRECIO_ACTUALIZADO` con carrito actualizado si varió algún precio.
* **`GET /api/pedidos`** → Query: `?page=1&limit=10`.
* **`GET /api/pedidos/:id`** → Detalle completo (`detalle_pedido`, `pagos`, `retractos`).
* **`POST /api/pedidos/:id/pagos`** *(cabecera opcional `Idempotency-Key`)* → Body estricto: `{ metodo_pago: "TARJETA"|"PSE"|"TRANSFERENCIA", referencia_simulada }` *(rechaza si incluye campos de estado)*. Referencia terminada en `'00'` → `'RECHAZADO'` (`201`); otro caso válido → `'APROBADO'` y pedido `'PAGADO'` (`201`; o `200` si `replayed: true`).
* **`POST /api/pedidos/:id/cancelar`** → Body: `{ motivo_cancelacion?, datos_reembolso? }` *(`datos_reembolso` obligatorio sin PAN/CVV si estaba `'PAGADO'`)*.
* **`POST /api/pedidos/:id/volver-al-carrito`** *(cabecera **obligatoria** `Idempotency-Key: <UUID RFC 4122/9562>`)*
  * **Flujo en 2 fases sin rollback (Opción recomendada):**
    * **Fase A (`tx1`):** Bloquea `usuario FOR UPDATE` → `pedido FOR UPDATE`. Valida `404` si no existe/no pertenece al cliente, `409 IDEMPOTENCY_CONFLICT` si la clave ya se usó en otra orden del usuario o la orden ya se devolvió con otra clave, o retorna la respuesta guardada sin tocar el carrito en replay exacto. Si el pedido está `'PENDIENTE'` con `fecha_expiracion <= CURRENT_TIMESTAMP`, lo expira a `'CANCELADO'` restituyendo inventario mediante `expirarPedidoSiVencido` y ejecuta **`COMMIT`** (sin rollback). Si está en cualquier otro estado distinto de `'CANCELADO'`, responde `409 TRANSICION_ESTADO_INVALIDA`.
    * **Fase B (`tx2`, solo cuando procede fusión):** Bloquea en orden `usuario` → `carrito` → `detalle_carrito ASC` → `pedido` → `detalle_pedido ASC` → `producto ASC FOR NO KEY UPDATE OF p`, reincorpora disponibles al carrito `'ACTIVO'`, persiste en `pedido` (`clave_idempotencia_carrito`, `fecha_devolucion_carrito`, `resultado_devolucion_carrito`) y responde **`200 OK`** con el carrito resultante y `ajustes[]`.

### Retractos (`CLIENTE` — exclusivamente `RETRACTO_LEGAL`)
* **`POST /api/pedidos/:id/retractos`** → Body: `{ motivo, datos_reembolso, items: [{ id_detalle_pedido, cantidad }] }`. Valida `5 días hábiles` en `America/Bogota` sobre `festivo_colombia` y bloquea `detalle_pedido ORDER BY id_producto ASC FOR UPDATE`.
* **`GET /api/retractos`** y **`GET /api/retractos/:id`** → Solicitudes propias del cliente y su detalle por producto.

### Administración (`ADMIN`)
* **Categorías:** `GET /api/admin/categorias`, `POST /api/admin/categorias`, `PUT /api/admin/categorias/:id`, `PATCH /api/admin/categorias/:id/estado`, **`DELETE /api/admin/categorias/:id`** (`409 CATEGORIA_CON_PRODUCTOS` si posee productos asociados).
* **Productos:** `GET /api/admin/productos` (`?q=&id_categoria=&estado=&page=1&limit=20`), `POST /api/admin/productos`, `PUT /api/admin/productos/:id` *(sin modificar `existencias`)*, `PATCH /api/admin/productos/:id/estado`, `PATCH /api/admin/productos/:id/existencias` (`{ existencias >= 0 }`).
  * **Validación `imagen_url` en `POST`/`PUT`:** Solo `http://`/`https://` (<= 500 chars), **sin** credenciales embebidas (`user:pass@`), **rechaza** hosts locales/privados/metadatos (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `::ffff:0:0/96`, NAT64 `64:ff9b::/96` y `64:ff9b:1::/48`, multicast/discard, `*.local`, `*.internal`) y **rechaza SVG** tras doble decodificación (`deepDecode`) en ruta, hash y todos los parámetros query (`.svg`, `.svgz`, extensiones intermedias como `.svg.png`, `image/svg`, `?file=*.svg`, `?format=svg`, `?download=*.svgz`, etc.) → `400 VALIDACION_INVALIDA`.
* **Usuarios:** `GET /api/admin/usuarios` (`?page=1&limit=20&q=`), `PATCH /api/admin/usuarios/:id/estado` (`{ estado_usuario: "ACTIVO"|"INACTIVO" }`), `PATCH /api/admin/usuarios/:id/rol` (`{ rol: "ADMIN"|"CLIENTE" }`). Ambos protegen último `ADMIN` (`409 ULTIMO_ADMIN_ACTIVO` bloqueando `ORDER BY u.id_usuario ASC FOR UPDATE OF u`), incrementan `token_version` y revocan filas activas de `sesion_refresh`.
* **Pedidos:** `GET /api/admin/pedidos` (`?estado=&page=1&limit=20`), **`GET /api/admin/pedidos/:id`** *(cabecera + datos cliente + `detalles[]` + `pagos[]`)*, `PATCH /api/admin/pedidos/:id/estado` (`{ estado_pedido: "ENVIADO"|"ENTREGADO"|"CANCELADO", motivo_cancelacion? }`), `PATCH /api/admin/pedidos/:id/reembolso` (`{ observacion? }` → marca `pedido` y `pago` total como `'REEMBOLSADO'`).
* **Retractos:** `GET /api/admin/retractos`, `GET /api/admin/retractos/:id`, `PATCH /api/admin/retractos/:id/decision` (`{ decision: "APROBAR"|"RECHAZAR", observacion_admin? }`), `PATCH /api/admin/retractos/:id/recepcion` (`{ observacion_admin?, items: [{ id_detalle_retracto, cantidad_buen_estado, cantidad_danada, observacion_inspeccion? }] }`), `PATCH /api/admin/retractos/:id/reembolso` (`{ observacion_admin? }`).
* **Reportes netos (`America/Bogota`, máx. `90 días`, máx. `5000 filas`):**
  * `GET /api/admin/reportes/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=`
  * `GET /api/admin/reportes/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=`

---

## 4. Concurrencia, bloqueos y mantenimiento automático

* **Reintentos transaccionales (`withTransaction`):** Ante códigos PostgreSQL `40P01` (*deadlock detected*) o `40001` (*serialization failure*), `db.js` ejecuta `ROLLBACK` y reintenta hasta `maxRetries = 3` con *backoff* exponencial + *jitter*; si se agotan los reintentos, el controlador de errores responde **`503 CONFLICTO_CONCURRENCIA`**.
* **Bloqueos no destructivos sobre inventario:** Las actualizaciones de `producto.existencias` usan `FOR NO KEY UPDATE OF p` (ordenado `ORDER BY id_producto ASC`) en lugar de `FOR UPDATE`.
* **Purga por lotes (`purgarRegistrosExpiradosLote`):** Ejecutada cada `15 minutos` oportunistamente tras login o job (`LIMIT 100 FOR UPDATE SKIP LOCKED`) para limpiar `reemplazo_cifrado` vencido, depurar `sesion_refresh` expiradas (`> 24h`, o `> 30d` si `REUSO_DETECTADO`) y purgar `carrito_fusion_idempotencia` con antigüedad `> 30 días`.
