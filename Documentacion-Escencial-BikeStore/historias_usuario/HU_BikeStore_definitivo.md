# Historias de Usuario Definitivas (`HU-01..HU-19`) — BikeStore v1

* **Autores:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-19
* **Artefacto histórico conservado:** [evhistoriasdeusuariodocx.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/historias_usuario/evhistoriasdeusuariodocx.pdf)
* **Referencias de alineación:** [NOTA_ALCANCE_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/NOTA_ALCANCE_V1.md) y [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md)

---

## Convención de roles y reglas transversales v1

* **Actores válidos en v1:** `Visitante` *(sin autenticación ni fila en base de datos)*, `CLIENTE` *(persona natural autenticada)* y `ADMIN` *(administrador único con rol exclusivo en `usuario_rol`)*.
* **Formato API estándar:** respuestas JSON `{ ok: true, datos, meta? }` y `{ ok: false, codigo, mensaje, detalles? }`; precios e importes en `NUMERIC(12,2)`; zona horaria operativa de cálculo legal y reportes en `America/Bogota` (`UTC` en PostgreSQL).

---

## Catálogo consolidado `HU-01` a `HU-19`

### `HU-01`: Catálogo público y detalle de producto
* **Actor:** `Visitante` / `CLIENTE` — **Prioridad:** Alta
* **Historia:** Como visitante o cliente de BikeStore, quiero explorar el catálogo paginado, filtrar por categoría activa, buscar por nombre y ordenar por precio, así como consultar la ficha del producto con su imagen y disponibilidad, para decidir mi compra con información vigente.
* **Criterios de aceptación (Gherkin / API):**
  1. `GET /api/categorias` lista únicamente categorías con `estado = TRUE`.
  2. `GET /api/productos` aplica paginación (`page=1`, `limit=12`, máx. `50`), filtros `id_categoria`, búsqueda `q` (escapando `%` y `_` en `ILIKE`) y `orden_precio=asc|desc`, ocultando todo registro donde `producto.estado = FALSE` o `categoria.estado = FALSE`.
  3. `GET /api/productos/:id` retorna `imagen_url` única externa (`http://`/`https://`), descripción, precio vigente (`NUMERIC(12,2)`) y `existencias`.
  4. Si `existencias = 0`, el producto permanece visible etiquetado como `"Agotado"` con compra deshabilitada.

### `HU-02`: Carrito temporal de visitante y fusión idempotente persistida en PostgreSQL
* **Actor:** `Visitante` / `CLIENTE` — **Prioridad:** Alta
* **Historia:** Como visitante o cliente autenticado, quiero gestionar artículos en mi carrito y que mi selección anónima se fusione de manera segura e idempotente al iniciar sesión o registrarme, para conservar mis productos sin duplicar cantidades ni exceder existencias o desactualizar precios.
* **Criterios de aceptación:**
  1. El visitante almacena `{ schema_version: 1, items: [{ id_producto, cantidad }] }` en `localStorage` sin crear registros en PostgreSQL.
  2. Al autenticarse, `POST /api/carrito/fusionar` exige cabecera **`Idempotency-Key` UUID RFC 4122/9562 obligatoria** (persistida en `carrito_fusion_idempotencia` con `id_carrito NULL ON DELETE SET NULL` y retención garantizada de **30 días**; bloqueando `usuario FOR UPDATE` → `carrito_fusion_idempotencia FOR UPDATE` antes de crear/tocar el carrito). Descarta ítems inexistentes, inactivos, de categoría inactiva o con `existencias = 0`, aplica `LEAST(cantidad_bd + cantidad_local, existencias)`, recalcula `precio_unidad` con `producto.precio` vigente y retorna el carrito junto con `ajustes[]` y `replayed` (`409 IDEMPOTENCY_CONFLICT` si reutiliza clave con payload distinto; advertencia post-purga después de 30 días).
  3. El `CLIENTE` gestiona su carrito persistente mediante `GET /api/carrito`, `POST /api/carrito/items`, `PATCH /api/carrito/items/:id_producto` y `DELETE /api/carrito/items/:id_producto` validando enteros `> 0`, bloqueando `usuario FOR UPDATE` en `POST /items` y stock disponible.

### `HU-03`: Creación de pedido (`Checkout`) y reserva por 15 minutos
* **Actor:** `CLIENTE` (`'ACTIVO'`) — **Prioridad:** Alta
* **Historia:** Como cliente autenticado, quiero confirmar los productos de mi carrito indicando mi dirección de envío para reservar existencias por 15 minutos bajo un identificador único `id_pedido`, asegurando el precio vigente antes de pagar.
* **Criterios de aceptación:**
  1. `POST /api/pedidos` exige `direccion_envio`, carrito `'ACTIVO'` no vacío y no tener otro pedido `'PENDIENTE'` vigente (expirando pedidos `'PENDIENTE'` vencidos en pre-transacción antes de la transacción principal para evitar rollbacks espurios).
  2. El total suma exclusivamente `cantidad * precio_unitario` sin cobro independiente de flete en v1, asignando `id_pedido` único (`RF-10`).
  3. Si algún `detalle_carrito.precio_unidad` difiere del `producto.precio` actual, el backend actualiza el carrito al precio vigente (`COMMIT`) y rechaza la confirmación con `HTTP 409 PRECIO_ACTUALIZADO` para confirmación explícita del cliente.
  4. Con precios consistentes, adquiere locks en orden `carrito → pedido → detalle_pedido → producto ORDER BY id_producto ASC FOR NO KEY UPDATE OF p`, descuenta `existencias`, crea el pedido en `'PENDIENTE'` con `fecha_expiracion = CURRENT_TIMESTAMP + INTERVAL '15 minutes'` y marca `carrito` como `'CONVERTIDO'`.

### `HU-04`: Registro de cliente (persona natural)
* **Actor:** `Visitante` — **Prioridad:** Alta
* **Historia:** Como visitante, quiero registrarme como cliente con mi documento de identidad, nombres, apellidos, teléfono, correo y contraseña para acceder a compras y seguimiento de pedidos.
* **Criterios de aceptación:**
  1. `POST /api/auth/registro` admite únicamente `tipo_documento IN ('CC', 'TI', 'CE', 'PASAPORTE', 'PPT')` con validación sintáctica inicial (`CC`: `^[0-9]{6,10}$`; `TI`: `^[0-9]{10,11}$`; `CE`: `^[A-Za-z0-9]{6,10}$`; `PASAPORTE`: `^[A-Za-z0-9]{5,20}$`; `PPT`: `^[0-9]{6,15}$`) normalizando `trim().toUpperCase()`, sin implicar verificación oficial ante entidades estatales.
  2. Exige `nombre`, `primer_apellido`, `segundo_apellido` opcional, `telefono`, `correo` único *case-insensitive* (`LOWER(correo)`) sin envío de correo de activación (`RF-14`), y contraseña mínima de `8` caracteres almacenada con `bcrypt` (`>= 10` rondas).
  3. Garantiza unicidad compuesta `(tipo_documento, numero_documento)` (`409 DOCUMENTO_DUPLICADO`) y de correo (`409 CORREO_DUPLICADO`), aplica *rate limiting* y asigna rol único `'CLIENTE'` en `usuario_rol`.

### `HU-05`: Inicio de sesión, renovación silenciosa A1 (`sesion_refresh`) y control de acceso
* **Actor:** `Usuario` (`CLIENTE` / `ADMIN`) — **Prioridad:** Alta
* **Historia:** Como usuario registrado, quiero iniciar sesión de forma segura y mantener mi sesión fluida entre pestañas sin almacenar tokens JWT en `sessionStorage`/`localStorage`, protegiendo mi cuenta ante robos o reúsos de credenciales.
* **Criterios de aceptación:**
  1. `POST /api/auth/login` aplica *rate limiting*, ejecuta `bcrypt.compare` contra hash ficticio si el correo no existe, exige `estado_usuario = 'ACTIVO'` (`403 USUARIO_INACTIVO`), fija cookie `HttpOnly` `bikestore_rt` (`Path=/api/auth`, `Max-Age=604800`, `SameSite=Lax`, `Secure=env.COOKIE_SECURE`) creando familia en `sesion_refresh`, y retorna `{ token, expires_in: 900, rotacion_uid, usuario }`.
  2. El frontend conserva el Access JWT `HS256` (`15m`) **únicamente en memoria React**, manteniendo en `localStorage` solo metadatos no secretos (`bs_client_secret` + `bs_refresh_uid`) y coordinando múltiples pestañas con `Web Locks API` + `BroadcastChannel` + `Idempotency-Key` UUID v8 determinista (sin mutex en `localStorage`).
  3. `POST /api/auth/refresh` valida CSRF (`Origin` en `CORS_ORIGINS` + `X-Requested-With: BikeStore` → `403 CSRF_ORIGEN_INVALIDO`), exige `Idempotency-Key` UUID obligatorio *(correlación de operación, no identidad criptográfica del cliente)* y cookie `bikestore_rt`, reproduce el mismo token hijo `T2` por max `30 s` vía `reemplazo_cifrado` (`AES-256-GCM` + `HKDF`) si `T2` no ha sido usado, revoca toda la familia ante reúso (`401 SESION_REVOCADA`) y retorna `401 SESION_EXPIRADA` si venció.
  4. Todo endpoint protegido verifica en BD que `estado_usuario = 'ACTIVO'`, `token_version = tv` y el rol vigente coincida con `usuario_rol`.

### `HU-06`: Recuperación y restablecimiento seguro de contraseña
* **Actor:** `Usuario` — **Prioridad:** Alta
* **Historia:** Como usuario registrado que olvidó su contraseña, quiero solicitar un enlace temporal de recuperación a mi correo y definir una nueva clave para recuperar el acceso sin exponer si una cuenta existe.
* **Criterios de aceptación:**
  1. `POST /api/auth/recuperar` aplica *rate limiting*, invalida tokens previos sin usar si el usuario `'ACTIVO'` existe, registra nuevo `token_hash` (`SHA-256`, TTL `60m`), ejecuta `COMMIT`, **retorna `HTTP 200` neutro de inmediato** sin esperar respuesta SMTP y envía el correo por `Nodemailer` (`SMTP_TRANSPORT=json|smtp`, sin registrar tokens ni URLs en logs).
  2. `POST /api/auth/restablecer` aplica *rate limiting*, exige token vigente no usado, `usuario.estado_usuario = 'ACTIVO'` y nueva contraseña `>= 8` caracteres; bloquea `usuario → token_recuperacion → sesion_refresh`, actualiza `contrasena_hash`, marca `fecha_uso`, incrementa `token_version` y revoca sesiones refresh activas (`RESET_PASSWORD`).

### `HU-07`: Administración de productos y control separado de inventario
* **Actor:** `ADMIN` — **Prioridad:** Alta
* **Historia:** Como administrador, quiero registrar, consultar, editar, activar o inactivar productos y ajustar existencias en un flujo específico, para mantener el catálogo actualizado sin sobrescribir ventas concurrentes ni exponer URLs peligrosas.
* **Criterios de aceptación:**
  1. `GET /api/admin/productos` lista y filtra productos activos e inactivos con búsqueda segura.
  2. `POST /api/admin/productos` registra producto con `imagen_url` externa (`http://`/`https://`, validada contra credenciales embebidas, hosts locales/privados/metadatos SSRF y formatos SVG), categoría existente, `precio > 0` y `existencias >= 0`.
  3. `PUT /api/admin/productos/:id` actualiza atributos descriptivos y precio (validando `imagen_url` no-SVG/no-SSRF) **sin modificar `existencias`**; el ajuste de stock ocurre exclusivamente vía `PATCH /api/admin/productos/:id/existencias`.
  4. `PATCH /api/admin/productos/:id/estado` activa o inactiva lógicamente el producto.

### `HU-08`: Dashboard e informes comerciales netos (alineado a `evhistoriasdeusuariodocx.pdf`)
* **Actor:** `ADMIN` — **Prioridad:** Media
* **Historia:** Como administrador, quiero visualizar métricas comerciales agregadas y reportes acotados filtrables por rango de fechas y categoría en formato JSON, para evaluar ventas netas reales y exportarlos a Excel o PDF desde el cliente web.
* **Criterios de aceptación:**
  1. `GET /api/admin/reportes/resumen` y `GET /api/admin/reportes/ventas` aceptan `desde`, `hasta` (zona `America/Bogota`) e `id_categoria` (`RF-25`).
  2. Imponen rango máximo de `90 días` (`400 RANGO_REPORTES_EXCEDIDO`) y tope máximo de `5000 filas` por consulta.
  3. Calculan **ventas netas** como `Ventas brutas aprobadas − Reembolsos efectivos`, descontando exclusivamente cancelaciones pre-envío con `estado_reembolso_cancelacion = 'REEMBOLSADO'` y retractos con `retracto.estado_reembolso = 'REEMBOLSADO'`.
  4. Entregan datos estructurados en JSON para su exportación Excel/PDF desde la interfaz frontend (`Etapa 2`).

### `HU-09`: Administración de usuarios, rol único (`RF-28`) y protección del último `ADMIN`
* **Actor:** `ADMIN` — **Prioridad:** Alta
* **Historia:** Como administrador, quiero listar y buscar usuarios, activar o inactivar cuentas y asignar su rol único (`ADMIN` o `CLIENTE`), revocando sesiones vigentes sin dejar el sistema sin administradores activos.
* **Criterios de aceptación:**
  1. `GET /api/admin/usuarios` soporta paginación (`?page=1&limit=20`) y búsqueda por documento, nombre o correo.
  2. `PATCH /api/admin/usuarios/:id/estado` alterna `'ACTIVO'` / `'INACTIVO'`, incrementa `token_version` y (cuando `'INACTIVO'`) revoca `sesion_refresh` activas (`ADMIN_INACTIVACION`).
  3. `PATCH /api/admin/usuarios/:id/rol` (`RF-28`) actualiza el **único rol vigente** (`ADMIN` o `CLIENTE`) en `usuario_rol`, incrementa `token_version` y revoca `sesion_refresh` activas.
  4. Ambos endpoints bloquean filas en orden determinista (`ORDER BY u.id_usuario ASC FOR UPDATE OF u`) y rechazan con `HTTP 409 ULTIMO_ADMIN_ACTIVO` cualquier operación que deje `< 1` administrador `'ACTIVO'`.

### `HU-10`: Cierre de sesión seguro (alineado a `evhistoriasdeusuariodocx.pdf`)
* **Actor:** `Usuario` autenticado — **Prioridad:** Alta
* **Historia:** Como usuario autenticado, quiero cerrar mi sesión explícitamente para revocar de inmediato mis tokens JWT y cookies de refresh vigentes y proteger mi cuenta.
* **Criterios de aceptación:**
  1. `POST /api/auth/logout` acepta `Authorization: Bearer` o cookie `bikestore_rt` (exigiendo `Origin` + `X-Requested-With: BikeStore` si viene cookie), incrementa `usuario.token_version + 1`, revoca todas las `sesion_refresh` activas (`LOGOUT_GLOBAL`), limpia `reemplazo_cifrado` y elimina la cookie `bikestore_rt`.
  2. El frontend limpia su estado en memoria React, `bs_refresh_uid` y difunde `SESION_CERRADA` entre pestañas; cualquier petición posterior recibe `HTTP 401 SESION_REVOCADA` / `TOKEN_INVALIDO`.

### `HU-11`: Consulta de historial y detalle de pedidos del cliente
* **Actor:** `CLIENTE` — **Prioridad:** Media
* **Historia:** Como cliente autenticado, quiero consultar la lista paginada de mis pedidos y el detalle completo de cada uno, incluyendo intentos de pago y estado de reembolso o retracto, para dar seguimiento a mis compras.
* **Criterios de aceptación:**
  1. `GET /api/pedidos` (`?page=1&limit=10`) retorna únicamente pedidos pertenecientes al `id_usuario` autenticado.
  2. `GET /api/pedidos/:id` muestra productos, cantidades, `precio_unitario`, `direccion_envio`, `total`, `estado_pedido`, intentos en `pago` (`1:N`), fechas operativas y estado de reembolso por cancelación o retractos asociados.

### `HU-12`: Gestión administrativa de pedidos (alineado a `evhistoriasdeusuariodocx.pdf`)
* **Actor:** `ADMIN` — **Prioridad:** Alta
* **Historia:** Como administrador, quiero consultar los pedidos registrados, inspeccionar su detalle completo y avanzar su ciclo operativo válido (`PAGADO` → `ENVIADO` → `ENTREGADO`, o cancelar antes del envío con motivo obligatorio), para controlar el despacho de la tienda.
* **Criterios de aceptación:**
  1. `GET /api/admin/pedidos` lista pedidos filtrables por estado con datos básicos del cliente, y `GET /api/admin/pedidos/:id` retorna cabecera completa, datos del cliente, `detalles[]` de productos e historial de `pagos[]`.
  2. `PATCH /api/admin/pedidos/:id/estado` aplica únicamente transiciones válidas (`PAGADO` → `ENVIADO`, `ENVIADO` → `ENTREGADO`, o `'PENDIENTE'`/`'PAGADO'` → `'CANCELADO'`), rechazando transiciones inválidas con `409 TRANSICION_ESTADO_INVALIDA`.
  3. Toda cancelación iniciada por `ADMIN` exige `motivo_cancelacion` no vacío, registra `cancelado_por`, restituye stock de forma idempotente y, si el pedido estaba `'PAGADO'`, activa `estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO'`.

### `HU-13`: Actualización de perfil y cambio de contraseña
* **Actor:** `Usuario` autenticado — **Prioridad:** Media
* **Historia:** Como usuario autenticado, quiero consultar y actualizar mis datos personales permitidos y cambiar mi contraseña confirmando la clave actual, manteniendo protegidos mis identificadores de documento, correo y rol.
* **Criterios de aceptación:**
  1. `GET /api/perfil` devuelve datos del usuario autenticado excluyendo siempre `contrasena_hash`.
  2. `PUT /api/perfil` permite actualizar únicamente `nombre`, `primer_apellido`, `segundo_apellido` y `telefono` (rechazando campos extra mediante `Zod` estricto).
  3. `PATCH /api/perfil/contrasena` verifica la contraseña actual, valida nueva contraseña `>= 8` caracteres, actualiza hash, incrementa `token_version` y revoca sesiones refresh activas (`CAMBIO_PASSWORD`).

### `HU-14`: Pago simulado síncrono (`1:N`) en transacción atómica
* **Actor:** `CLIENTE` (`'ACTIVO'`) — **Prioridad:** Alta
* **Historia:** Como cliente con un pedido reservado en `'PENDIENTE'`, quiero ejecutar intentos de pago simulados dentro de la ventana de 15 minutos para completar la compra o reintentar si un intento es rechazado.
* **Criterios de aceptación:**
  1. `POST /api/pedidos/:id/pagos` recibe `{ metodo_pago, referencia_simulada }` (`metodo_pago IN ('TARJETA', 'PSE', 'TRANSFERENCIA')`) y cabecera opcional `Idempotency-Key`.
  2. En una única transacción `withTransaction`, bloquea primero `pedido FOR UPDATE`, valida `Idempotency-Key` + `payload_hash` (`409 IDEMPOTENCY_CONFLICT` si varía), verifica `estado_pedido = 'PENDIENTE'` y `NOW() <= fecha_expiracion` (de lo contrario expira retornando `409 RESERVA_EXPIRADA`).
  3. El **backend determina determinísticamente el resultado** sin aceptar estado enviado por el cliente: si `referencia_simulada` termina en `'00'`, registra `pago` como `'RECHAZADO'` manteniendo `'PENDIENTE'`; en otro caso válido registra `'APROBADO'` y actualiza `pedido.estado_pedido = 'PAGADO'`.

### `HU-15`: Seguimiento administrativo de ventas aprobadas *(corregido Escenario 2)*
* **Actor:** `ADMIN` — **Prioridad:** Media
* **Historia:** Como administrador, quiero consultar los registros individuales de pedidos pagados junto con la trazabilidad de sus pagos aprobados y devoluciones confirmadas, para auditar operaciones de venta reales sin incluir pedidos pendientes de pago ni cancelados.
* **Criterios de aceptación:**
  1. Solo operaciones con pago `'APROBADO'` o `'REEMBOLSADO'` (reembolso total) aparecen en la consulta comercial de ventas y reportes detallados (`GET /api/admin/reportes/ventas`).
  2. Cada fila expone identificador `id_pedido`, fecha de operación en `America/Bogota`, datos identificativos del cliente, categoría/productos, monto bruto y ajustes efectivos por reembolsos confirmados.
  3. *(Corrección Escenario 2 respecto al artefacto original:)* El intento de acceso sin rol `ADMIN` recibe `HTTP 403 ROL_NO_AUTORIZADO` sin invadir pantallas ni flujos de edición de perfil (`HU-13`).

### `HU-16`: Gestión administrativa de categorías (`NUEVA`)
* **Actor:** `ADMIN` — **Prioridad:** Alta
* **Historia:** Como administrador, quiero crear, editar, eliminar cuando no tengan uso o inactivar lógicamente categorías de productos protegiendo integridad referencial, para mantener organizado el catálogo sin romper referencias de pedidos históricos.
* **Criterios de aceptación:**
  1. `GET /api/admin/categorias`, `POST /api/admin/categorias`, `PUT /api/admin/categorias/:id`, `PATCH /api/admin/categorias/:id/estado` y `DELETE /api/admin/categorias/:id` gestionan categorías con nombre único.
  2. Se prohíbe eliminar categorías con productos asociados (`ON DELETE RESTRICT` / `409 CATEGORIA_CON_PRODUCTOS`); la baja operativa con historial se realiza inactivando su `estado = FALSE`.
  3. Inactivar una categoría oculta automáticamente sus productos en catálogo público, fusión de carrito y checkout.

### `HU-17`: Cancelación pre-envío y gestión de reembolso total (`NUEVA`)
* **Actor:** `CLIENTE` / `ADMIN` — **Prioridad:** Alta
* **Historia:** Como cliente con un pedido antes del envío (`PENDIENTE` o `PAGADO`), quiero poder cancelarlo registrando mis datos de reembolso cuando corresponda, y como administrador quiero confirmar dicho reembolso total dentro del plazo legal de 15 días calendario.
* **Criterios de aceptación:**
  1. `POST /api/pedidos/:id/cancelar` permite al `CLIENTE` cancelar pedidos propios en `'PENDIENTE'` (motivo opcional) o `'PAGADO'` (exigiendo `datos_reembolso` sin PAN/CVV completos).
  2. Al cancelar un pedido `'PAGADO'` (por `CLIENTE` o `ADMIN`), se restituyen existencias en orden ascendente (`FOR NO KEY UPDATE OF p`) y la misma transacción guarda en `pedido`: `estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO'`, `datos_reembolso_cancelacion` y `fecha_limite_reembolso_cancelacion = CURRENT_TIMESTAMP + INTERVAL '15 days'`.
  3. `PATCH /api/admin/pedidos/:id/reembolso` permite al `ADMIN` confirmar el reembolso total pasando `pedido.estado_reembolso_cancelacion = 'REEMBOLSADO'`, `fecha_reembolso_cancelacion = CURRENT_TIMESTAMP` y `pago.estado_pago = 'REEMBOLSADO'`.

### `HU-18`: Reincorporación idempotente de pedido cancelado o vencido al carrito (`NUEVA`)
* **Actor:** `CLIENTE` (`'ACTIVO'`) — **Prioridad:** Media
* **Historia:** Como cliente cuyo pedido pasó a `'CANCELADO'` (o venció su ventana de reserva de 15 minutos), quiero recuperar de forma segura los productos aún disponibles hacia mi carrito activo en un solo clic, recibiendo informe de los ajustes por stock o precio.
* **Criterios de aceptación:**
  1. `POST /api/pedidos/:id/volver-al-carrito` exige cabecera **`Idempotency-Key` UUID RFC 4122/9562 obligatoria** y verifica propiedad del cliente.
  2. Ejecuta el flujo en **2 fases sin rollback** (Opción recomendada): en **Fase A** bloquea `usuario → pedido FOR UPDATE`; si está `'PENDIENTE'` vencido (`fecha_expiracion <= CURRENT_TIMESTAMP`), lo expira a `'CANCELADO'` restituyendo inventario con `COMMIT`; luego en **Fase B** bloquea `usuario → carrito → detalle_carrito ASC → pedido → detalle_pedido ASC → producto ASC FOR NO KEY UPDATE OF p`, fusiona disponibles al carrito, registra `clave_idempotencia_carrito`, `fecha_devolucion_carrito` y `resultado_devolucion_carrito` en `pedido` (bajo `CHECK` todo-o-nada) y responde `200 OK` con `ajustes[]`.
  3. Garantiza idempotencia exacta ante reintentos o doble clic (y `409 IDEMPOTENCY_CONFLICT` si se reutiliza la clave en otro pedido o el pedido ya fue devuelto con otra clave), omitiendo productos inactivos o con stock `0`.

### `HU-19`: Solicitud y resolución de `RETRACTO_LEGAL` con inspección por cantidad (`NUEVA`)
* **Actor:** `CLIENTE` / `ADMIN` — **Prioridad:** Alta
* **Historia:** Como cliente con un pedido en `'ENTREGADO'`, quiero solicitar retracto legal total o parcial dentro de los 5 días hábiles siguientes a la entrega; y como administrador quiero evaluar su procedencia legal, inspeccionar físicamente cada producto por cantidad recibida y confirmar el reembolso sobre las unidades aptas.
* **Criterios de aceptación:**
  1. `POST /api/pedidos/:id/retractos` exige `estado_pedido = 'ENTREGADO'` y fecha actual `< dia_habil_6 00:00:00-05:00` en `America/Bogota` calculada sobre `festivo_colombia` (`2025–2035`), manteniendo `pedido.estado_pedido = 'ENTREGADO'`.
  2. Bloquea `detalle_pedido FOR UPDATE` validando que las unidades solicitadas no excedan el saldo disponible, descontando tanto retractos vigentes como unidades previamente rechazadas físicamente por `'DANADO'` (impidiendo re-solicitudes sobre unidades dañadas).
  3. `GET /api/retractos` / `GET /api/retractos/:id` (`CLIENTE`) y `GET /api/admin/retractos` / `GET /api/admin/retractos/:id` (`ADMIN`) exponen detalle por producto y trazabilidad completa.
  4. `PATCH /api/admin/retractos/:id/decision` valida procedencia legal (sin asumir que todo retracto parcial procede automáticamente) para aprobar recepción o rechazar la solicitud (`RECHAZADO`).
  5. `PATCH /api/admin/retractos/:id/recepcion` registra por cada ítem `cantidad_buen_estado` y `cantidad_danada` (`cantidad_buen_estado + cantidad_danada = cantidad_devuelta`), reingresa inventario **exclusivamente de `cantidad_buen_estado`** y calcula `monto_reembolso` sobre esas unidades (si resulta `0`, cierra en `RECHAZADO` con `estado_reembolso = 'NO_APLICA'` y `fecha_limite_reembolso = NULL`).
  6. `PATCH /api/admin/retractos/:id/reembolso` confirma el desembolso (`COMPLETADO` / `'REEMBOLSADO'`) y actualiza `pago.estado_pago = 'REEMBOLSADO'` **únicamente si el total reembolsado acumulado alcanza el 100 % de `pedido.total`**.

---

## Exclusiones de alcance v1 (trazabilidad contra `NOTA_ALCANCE_V1.md`)

En cumplimiento estricto de [NOTA_ALCANCE_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/NOTA_ALCANCE_V1.md), ninguna historia de usuario `HU-01..HU-19` habilita en v1: rol `VENDEDOR`, registro empresarial `NIT`, estado `'BLOQUEADO'`, `DEVOLUCION_COMERCIAL`, tabla `token_revocacion`, carga binaria `Upload`, cobro de fletes, módulo de taller, módulo de compras a proveedores, promociones ni facturación DIAN.
