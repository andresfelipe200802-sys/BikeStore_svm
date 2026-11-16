# Casos de Uso Definitivos (`CU-01..CU-19`) — BikeStore v1

* **Autores:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-15
* **Artefacto histórico conservado:** [Ev_plantilla_casos_de_uso_viveros_sanchez.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/CASOS_DE_USO/Ev_plantilla_casos_de_uso_viveros_sanchez.pdf)
* **Referencias de alineación:** [HU_BikeStore_definitivo.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/historias_usuario/HU_BikeStore_definitivo.md), [NOTA_ALCANCE_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/NOTA_ALCANCE_V1.md) y [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md)

---

## 1. Matriz cruzada de trazabilidad `HU-01..HU-19` ↔ `CU-01..CU-19`

> La plantilla base original (`CU-01..CU-15`) utilizaba numeración independiente respecto a las historias de usuario (`HU-01..HU-15`). Se conservan los códigos `CU-01..CU-15` para mantener continuidad con los 8 escenarios y diagramas UML, incorporando `CU-16..CU-19` para separar el pago síncrono `1:N` del checkout y cubrir las capacidades cerradas en v1.

| Historia de Usuario (`HU`) | Caso(s) de Uso (`CU`) | Actor(es) v1 | Estado respecto a plantilla PDF original |
| :--- | :--- | :--- | :--- |
| **`HU-01`** Catálogo público | **`CU-01`** Consultando catálogo y detalle | `Visitante`, `CLIENTE` | Actualizado (`imagen_url` única, categoría activa, paginación `12`/máx. `50`, `"Agotado"`). |
| **`HU-02`** Carrito visitante + fusión | **`CU-02`** Gestionando carrito y fusión | `Visitante`, `CLIENTE` | Actualizado (`localStorage`, `POST /api/carrito/fusionar`, stock/precio vigente). |
| **`HU-03`** Checkout y reserva 15 min | **`CU-03`** Creando pedido en checkout | `CLIENTE` | Separado del pago (`1:N`); `direccion_envio`, `409 PRECIO_ACTUALIZADO`, sin flete. |
| **`HU-04`** Registro persona natural | **`CU-04`** Registrándose como cliente | `Visitante` | Corregido actor a `Visitante`, validación sintáctica inicial `CC/TI/CE/PASAPORTE/PPT`, apellidos, teléfono. |
| **`HU-05`** Inicio de sesión | **`CU-05`** Iniciando sesión | `CLIENTE`, `ADMIN` | Actualizado (`ACTIVO`/`INACTIVO`, `bcrypt` ficticio, JWT `HS256` `15m`, `rateLimit`). |
| **`HU-06`** Recuperar contraseña | **`CU-06`** Recuperando contraseña | `CLIENTE`, `ADMIN` | Corregido a respuesta `HTTP 200` neutra inmediata + envío no bloqueante (`json`/`smtp`). |
| **`HU-07`** Admin productos e inventario | **`CU-07`**, **`CU-08`** Productos admin | `ADMIN` | Separada edición descriptiva (`PUT`) de ajuste de stock (`PATCH .../existencias`). |
| **`HU-08`** Dashboard e informes netos | **`CU-09`**, **`CU-10`** Informes y export | `ADMIN` | JSON acotado en backend (`90 días`, `5000 filas`, `id_categoria`, netos); exportación Excel/PDF en frontend. |
| **`HU-09`** Admin usuarios y rol único | **`CU-11`** Gestionando usuarios y roles | `ADMIN` | Añadido cambio de rol único `RF-28`, `409 ULTIMO_ADMIN_ACTIVO` y retiro de mensajes de borrado físico. |
| **`HU-10`** Cerrar sesión | **`CU-12`** Cerrando sesión | `CLIENTE`, `ADMIN` | Especificada revocación inmediata mediante incremento de `usuario.token_version`. |
| **`HU-11`** Historial pedidos cliente | **`CU-13`** Consultando historial | `CLIENTE` | Incluye historial de intentos `pago (1:N)`, cancelación/reembolso y retractos. |
| **`HU-12`**, **`HU-15`** Gestión pedidos y ventas | **`CU-14`** Gestionando pedidos / ventas | `ADMIN` | Catálogo `PENDIENTE/PAGADO/ENVIADO/ENTREGADO/CANCELADO`, motivo obligatorio al cancelar, seguimiento de ventas netas. |
| **`HU-13`** Actualizar perfil y contraseña | **`CU-15`** Actualizando perfil y clave | `CLIENTE`, `ADMIN` | Limitado a nombre/apellidos/teléfono (`PUT /api/perfil`) + cambio de clave aparte (`PATCH /api/perfil/contrasena`). |
| **`HU-14`** Pago simulado `1:N` | **`CU-16`** Ejecutando pago simulado `1:N` | `CLIENTE` | Desacoplado de `CU-03`; simulador determinista en backend + `Idempotency-Key` + `409 RESERVA_EXPIRADA`. |
| **`HU-16`** Gestión categorías | **`CU-17`** Gestionando categorías | `ADMIN` | CRUD categorías + inactivación lógica + bloqueo `409 CATEGORIA_CON_PRODUCTOS`. |
| **`HU-17`**, **`HU-18`** Cancelación pre-envío y reincorporación | **`CU-18`** Cancelando pedido pre-envío, reembolso y volver al carrito | `CLIENTE`, `ADMIN` | Cancelación pre-envío, reembolso registrado en `pedido`, `PATCH .../reembolso` y `POST .../volver-al-carrito`. |
| **`HU-19`** `RETRACTO_LEGAL` post-entrega | **`CU-19`** Gestionando `RETRACTO_LEGAL` e inspección por cantidad | `CLIENTE`, `ADMIN` | 5 días hábiles (`festivo_colombia`), decisión legal, inspección por producto/cantidad y reembolso parcial/total. |

---

## 2. Especificación consolidada de Casos de Uso (`CU-01..CU-19`)

### `CU-01`: Consultando catálogo y detalle de productos
* **Actores:** `Visitante`, `CLIENTE` — **HU asociada:** `HU-01`
* **Precondición:** Existen categorías y productos activos (`categoria.estado = TRUE AND producto.estado = TRUE`) o el catálogo responde lista vacía controlada.
* **Flujo normal:**
  1. El actor accede a `/productos` o consulta categorías (`GET /api/categorias`).
  2. El sistema consulta productos activos pertenecientes a categorías activas aplicando paginación (`page=1`, `limit=12`, máx. `50`), filtro opcional `id_categoria`, búsqueda `q` (escapando `%` y `_`) y ordenamiento `orden_precio=asc|desc`.
  3. El actor selecciona un producto (`GET /api/productos/:id`); el sistema muestra `imagen_url` única externa (`http://`/`https://`), descripción, categoría, precio (`NUMERIC(12,2)`) y `existencias`.
* **Flujos alternos:** `2.1` Sin coincidencias o catálogo vacío devuelve lista vacía `[]`. `3.1` Si `existencias = 0`, muestra etiqueta `"Agotado"` con compra deshabilitada. `3.2` Producto inexistente o de producto/categoría inactiva retorna `404 RECURSO_NO_ENCONTRADO`.
* **Postcondición:** El actor visualiza catálogo paginado o detalle vigente listo para agregar al carrito.

### `CU-02`: Gestionando carrito de compras y fusión al autenticarse
* **Actores:** `Visitante`, `CLIENTE` — **HU asociada:** `HU-02`
* **Precondición:** Producto seleccionado con `producto.estado = TRUE`, `categoria.estado = TRUE` y `existencias > 0`.
* **Flujo normal:**
  1. Como `Visitante`, agrega/actualiza ítems en `localStorage` bajo `{ schema_version: 1, items: [{ id_producto, cantidad }] }` sin escribir en PostgreSQL.
  2. Al autenticarse (`CU-04` o `CU-05`), el frontend invoca `POST /api/carrito/fusionar` (con `Idempotency-Key` opcional).
  3. El backend recupera o crea el único `carrito` `'ACTIVO'` del cliente, filtra productos/categorías inactivos o agotados, aplica `LEAST(cantidad_bd + cantidad_local, existencias)`, actualiza `precio_unidad` al `producto.precio` vigente y devuelve el carrito junto con `ajustes[]`.
  4. Como `CLIENTE`, agrega (`POST /api/carrito/items`), modifica (`PATCH /api/carrito/items/:id_producto`) o elimina (`DELETE /api/carrito/items/:id_producto`) ítems en PostgreSQL.
* **Flujos alternos:** `3.1` Ítem agotado o inactivo se descarta e informa en `ajustes[]`. `4.1` Cantidad `<= 0` o no entera retorna `400 VALIDACION_INVALIDA`; cantidad superior al stock disponible retorna `409 STOCK_INSUFICIENTE`.
* **Postcondición:** El carrito `'ACTIVO'` queda persistido en PostgreSQL reflejando cantidades válidas y precios vigentes.

### `CU-03`: Creando pedido en checkout (reserva transaccional por 15 minutos)
* **Actor:** `CLIENTE` (`'ACTIVO'`) — **HU asociada:** `HU-03`
* **Precondición:** Cliente autenticado con carrito `'ACTIVO'` no vacío y sin pedido `'PENDIENTE'` vigente.
* **Flujo normal:**
  1. El cliente revisa su carrito, ingresa `direccion_envio` y confirma (`POST /api/pedidos`).
  2. El sistema bloquea `carrito FOR UPDATE` y ejecuta expiración perezosa bloqueante (`FOR UPDATE`) sobre cualquier pedido `'PENDIENTE'` vencido del usuario.
  3. Verifica vigencia de productos/categorías y coincidencia exacta `detalle_carrito.precio_unidad = producto.precio`.
  4. Bloquea filas de `producto` en `ORDER BY id_producto ASC FOR UPDATE`, verifica y descuenta `existencias`, calcula `pedido.total` (sin cobro de flete en v1), genera `id_pedido` único (`RF-10`) en estado `'PENDIENTE'` con `fecha_expiracion = CURRENT_TIMESTAMP + INTERVAL '15 minutes'` y marca `carrito` como `'CONVERTIDO'`.
* **Flujos alternos:** `3.1` Si algún precio varió, actualiza el carrito al precio vigente y responde `HTTP 409 PRECIO_ACTUALIZADO` para nueva confirmación del cliente. `3.2` Si existe otro pedido `'PENDIENTE'` no vencido, retorna `409 PEDIDO_PENDIENTE_ACTIVO`. `4.1` Stock insuficiente retorna `409 STOCK_INSUFICIENTE`.
* **Postcondición:** Existe un pedido `'PENDIENTE'` con inventario reservado por 15 minutos, habilitado para `CU-16`.

### `CU-04`: Registrándose como cliente
* **Actor:** `Visitante` — **HU asociada:** `HU-04`
* **Precondición:** Formulario de registro habilitado; el usuario no está autenticado.
* **Flujo normal:**
  1. El visitante envía `POST /api/auth/registro` con `tipo_documento`, `numero_documento`, `nombre`, `primer_apellido`, `segundo_apellido?`, `telefono`, `correo` y `contrasena`.
  2. El sistema valida sintaxis inicial según `tipo_documento` (`CC` `^[0-9]{6,10}$`, `TI` `^[0-9]{10,11}$`, `CE` `^[A-Za-z0-9]{6,10}$`, `PASAPORTE` `^[A-Za-z0-9]{5,20}$`, `PPT` `^[0-9]{6,15}$`) sin afirmar validación oficial ante autoridades estatales, formato de correo (sin correo de activación según alcance v1 de `RF-14`) y contraseña `>= 8` caracteres.
  3. Verifica unicidad `(tipo_documento, numero_documento)` y `LOWER(correo)`, calcula hash `bcrypt`, inserta `usuario` en `'ACTIVO'` y asigna rol único `'CLIENTE'` en `usuario_rol`.
* **Flujos alternos:** `2.1` Error de formato/campos faltantes (`400 VALIDACION_INVALIDA`). `3.1` Documento repetido (`409 DOCUMENTO_DUPLICADO`) o correo repetido (`409 CORREO_DUPLICADO`). `1.1` Exceso de intentos (`429 RATE_LIMIT_EXCEDIDO`).
* **Postcondición:** Cuenta `'CLIENTE'` creada en estado `'ACTIVO'` y lista para iniciar sesión y fusionar carrito.

### `CU-05`: Iniciando sesión
* **Actores:** `CLIENTE`, `ADMIN` *(denominados conjuntamente `Usuario` al autenticarse)* — **HU asociada:** `HU-05`
* **Precondición:** Cuenta registrada previamente en PostgreSQL.
* **Flujo normal:**
  1. El usuario envía `POST /api/auth/login` con `correo` normalizado (`trim().toLowerCase()`) y `contrasena`.
  2. El sistema aplica *rate limiting*, consulta usuario y rol único, y verifica hash con `bcrypt.compare` (ejecutando comparación ficticia si el correo no existe para evitar canal lateral de tiempo).
  3. Comprueba `estado_usuario = 'ACTIVO'` y genera JWT `HS256` (`TTL 15m`) con `{ sub: id_usuario, rol, tv: token_version }`.
* **Flujos alternos:** `2.1` Credenciales inválidas (`401 CREDENCIALES_INVALIDAS`). `3.1` Cuenta `'INACTIVO'` (`403 USUARIO_INACTIVO`). `1.1` Exceso de intentos (`429 RATE_LIMIT_EXCEDIDO`).
* **Postcondición:** El usuario recibe token válido y accede según su rol único (`ADMIN` o `CLIENTE`).

### `CU-06`: Recuperando y restableciendo contraseña
* **Actores:** `CLIENTE`, `ADMIN` — **HU asociada:** `HU-06`
* **Precondición:** Acceso a pantalla de recuperación.
* **Flujo normal:**
  1. El usuario envía `POST /api/auth/recuperar` con su `correo` (protegido con *rate limiting*).
  2. Si corresponde a una cuenta `'ACTIVO'`, el sistema invalida tokens previos sin usar (`fecha_uso IS NULL`), genera token aleatorio de `32` bytes, guarda su `SHA-256` en `token_recuperacion` (`TTL 60m`) y ejecuta `COMMIT`.
  3. **Sin revelar si el correo existe y sin esperar al servidor SMTP**, responde `HTTP 200` neutro de inmediato y despacha el enlace de forma no bloqueante vía `Nodemailer` (`SMTP_TRANSPORT=json|smtp`).
  4. El usuario envía `POST /api/auth/restablecer` con token vigente y nueva contraseña `>= 8` caracteres; si la cuenta está `'ACTIVO'`, el sistema actualiza `contrasena_hash`, marca `fecha_uso` e incrementa `token_version`.
* **Flujos alternos:** `3.1` Si el correo no existe o cuenta inactiva, igualmente retorna `HTTP 200` neutro en tiempo uniforme sin enviar correo. `4.1` Token expirado o ya usado retorna `400 VALIDACION_INVALIDA` / `401 TOKEN_INVALIDO`. `4.2` Cuenta `'INACTIVO'` al restablecer retorna `403 USUARIO_INACTIVO`. `1.1`/`4.3` Exceso de solicitudes (`429 RATE_LIMIT_EXCEDIDO`).
* **Postcondición:** Contraseña actualizada y sesiones JWT anteriores invalidadas vía `token_version`.

### `CU-07`: Gestionando productos e inventario administrativamente
* **Actor:** `ADMIN` — **HU asociada:** `HU-07`
* **Precondición:** Sesión `ADMIN` `'ACTIVO'`; categoría destino existente.
* **Flujo normal:**
  1. Para crear (`POST /api/admin/productos`), envía `id_categoria`, `nombre`, `descripcion`, `precio > 0`, `existencias >= 0` e `imagen_url` (`http://`/`https://`).
  2. Para editar descripción o precio (`PUT /api/admin/productos/:id`), actualiza atributos **sin sobrescribir `existencias`**.
  3. Para ajustar inventario (`PATCH /api/admin/productos/:id/existencias`), actualiza `existencias >= 0` transaccionalmente.
  4. Para activar/inactivar (`PATCH /api/admin/productos/:id/estado`), actualiza `producto.estado`.
* **Flujos alternos:** `1.1`/`2.1` Datos inválidos (`400 VALIDACION_INVALIDA`) o categoría inexistente (`404 RECURSO_NO_ENCONTRADO`). `0.1` Usuario sin rol `ADMIN` (`403 ROL_NO_AUTORIZADO`).
* **Postcondición:** Producto registrado, actualizado, ajustado en stock o inactivado lógicamente sin *lost updates*.

### `CU-08`: Consultando productos administrativamente
* **Actor:** `ADMIN` — **HU asociada:** `HU-07`
* **Precondición:** Sesión `ADMIN` `'ACTIVO'`.
* **Flujo normal:**
  1. El administrador consulta `GET /api/admin/productos` enviando filtros opcionales por nombre (`q` con escape `%`/`_`), `id_categoria`, `estado` (`true`/`false`) y paginación.
  2. El sistema retorna todos los productos coincidentes (incluidos inactivos y agotados) con su categoría y existencias reales.
* **Flujos alternos:** `2.1` Sin coincidencias retorna lista vacía `[]`.
* **Postcondición:** El administrador dispone del inventario real paginado para su gestión.

### `CU-09`: Consultando dashboard e informes comerciales netos
* **Actor:** `ADMIN` — **HU asociada:** `HU-08`
* **Precondición:** Sesión `ADMIN` `'ACTIVO'`.
* **Flujo normal:**
  1. El administrador accede a `GET /api/admin/reportes/resumen` o `GET /api/admin/reportes/ventas` indicando `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=` en `America/Bogota`.
  2. El sistema valida rango `desde <= hasta` con máximo **`90 días`**, calcula métricas reales descontando únicamente **reembolsos efectivos** (`pedido.estado_reembolso_cancelacion = 'REEMBOLSADO'` y `retracto.estado_reembolso = 'REEMBOLSADO'`) y retorna resumen de ventas brutas, reembolsos efectivos, ventas netas, productos más vendidos y cantidad de pedidos hasta **`5000 filas`**.
* **Flujos alternos:** `2.1` Rango mayor a `90 días` o superior a `5000 filas` retorna `400 RANGO_REPORTES_EXCEDIDO`. `2.2` Sin operaciones en el rango retorna métricas en `0` y filas `[]`.
* **Postcondición:** El administrador visualiza métricas netas exactas listas para análisis o exportación.

### `CU-10`: Exportando informes a Excel y PDF en el cliente web
* **Actor:** `ADMIN` — **HU asociada:** `HU-08`
* **Precondición:** Resultados JSON obtenidos desde `CU-09` (`GET /api/admin/reportes/ventas` y `/resumen`, máx. `90 días` y `5000 filas`).
* **Flujo normal:**
  1. El administrador revisa el reporte filtrado en la vista del panel administrativo.
  2. Selecciona descargar en formato `Excel` o `PDF`; la aplicación frontend (`Etapa 2`) genera y descarga localmente el archivo a partir de la respuesta JSON ya validada en backend.
* **Flujos alternos:** `2.1` Si cancela antes de descargar, no genera archivo. `2.2` Si el rango excede `90 días` / `5000 filas`, `CU-09` rechaza con `400 RANGO_REPORTES_EXCEDIDO` antes de exportar.
* **Postcondición:** Archivo Excel o PDF descargado en el dispositivo del administrador coherente con los datos netos del backend.

### `CU-11`: Gestionando usuarios, estado y rol único (`RF-28`)
* **Actor:** `ADMIN` — **HU asociada:** `HU-09`
* **Precondición:** Sesión `ADMIN` `'ACTIVO'`.
* **Flujo normal:**
  1. El administrador consulta y busca usuarios vía `GET /api/admin/usuarios` (`?page=1&limit=20&q=`).
  2. Para cambiar estado, invoca `PATCH /api/admin/usuarios/:id/estado` con `'ACTIVO'` o `'INACTIVO'`.
  3. Para asignar el rol único (`RF-28`), invoca `PATCH /api/admin/usuarios/:id/rol` con `'ADMIN'` o `'CLIENTE'`.
  4. En ambos casos de cambio sobre un `ADMIN`, el sistema bloquea filas activas de administradores (`FOR UPDATE`), verifica que permanecerá al menos un `ADMIN` `'ACTIVO'`, aplica el cambio en `usuario` o `usuario_rol` e incrementa `token_version`.
* **Flujos alternos:** `4.1` Si la operación dejaría `< 1` administrador `'ACTIVO'`, rechaza transaccionalmente con `409 ULTIMO_ADMIN_ACTIVO`. `1.1` Usuario inexistente retorna `404 RECURSO_NO_ENCONTRADO`.
* **Postcondición:** Cuenta actualizada e inmediatas revocaciones JWT aplicadas sobre el usuario modificado.

### `CU-12`: Cerrando sesión con revocación inmediata
* **Actores:** `CLIENTE`, `ADMIN` — **HU asociada:** `HU-10`
* **Precondición:** Usuario con JWT vigente y sesión activa.
* **Flujo normal:**
  1. El usuario confirma cerrar sesión invocado a `POST /api/auth/logout`.
  2. El backend incrementa `usuario.token_version = token_version + 1` en PostgreSQL dentro de la petición y responde `HTTP 200`.
  3. El cliente limpia su token en frontend.
* **Flujos alternos:** `1.1` Si cancela en UI antes de enviar, la sesión continúa activa. `2.1` Token ya expirado o previamente revocado retorna `401 TOKEN_INVALIDO` / `401 SESION_REVOCADA`.
* **Postcondición:** Todos los JWT previamente emitidos para ese usuario quedan inválidos de inmediato.

### `CU-13`: Consultando historial y detalle de pedidos del cliente
* **Actor:** `CLIENTE` — **HU asociada:** `HU-11`
* **Precondición:** Cliente autenticado `'ACTIVO'`.
* **Flujo normal:**
  1. El cliente consulta `GET /api/pedidos?page=1&limit=10` y obtiene sus propios pedidos ordenados por fecha descendente.
  2. Selecciona un pedido (`GET /api/pedidos/:id`); el sistema muestra cabecera (`id_pedido`, `estado_pedido`, `direccion_envio`, `total`, fechas y campos de reembolso pre-envío si aplica), `detalle_pedido`, historial de `pago` (`1:N`) y solicitudes de `retracto` asociadas.
* **Flujos alternos:** `2.1` Pedido inexistente o perteneciente a otro usuario retorna `404 RECURSO_NO_ENCONTRADO` (sin filtrar propiedad ajena).
* **Postcondición:** El cliente visualiza trazabilidad integral de sus pedidos, pagos y posventa.

### `CU-14`: Gestionando pedidos y seguimiento de ventas aprobadas (`ADMIN`)
* **Actor:** `ADMIN` — **HU asociadas:** `HU-12`, `HU-15`
* **Precondición:** Sesión `ADMIN` `'ACTIVO'`.
* **Flujo normal:**
  1. El administrador consulta `GET /api/admin/pedidos` filtrando por `estado_pedido` (`PENDIENTE`, `PAGADO`, `ENVIADO`, `ENTREGADO`, `CANCELADO`) y fechas, y visualiza operaciones de venta con pago `'APROBADO'` o `'REEMBOLSADO'`.
  2. Para avanzar estado operativo, invoca `PATCH /api/admin/pedidos/:id/estado` con transición válida: `PAGADO` → `ENVIADO` (registra `fecha_envio`), `ENVIADO` → `ENTREGADO` (registra `fecha_entrega`), o `'PENDIENTE'`/`'PAGADO'` → `'CANCELADO'` (exigiendo `motivo_cancelacion` obligatorio para `ADMIN`, registrando `cancelado_por`, restituyendo stock y habilitando `estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO'` si estaba `'PAGADO'`).
* **Flujos alternos:** `2.1` Transición no permitida retorna `409 TRANSICION_ESTADO_INVALIDA`. `2.2` Cancelación administrativa sin `motivo_cancelacion` retorna `400 VALIDACION_INVALIDA`.
* **Postcondición:** Estado operativo actualizado respetando integridad de fechas, inventario y trazabilidad de ventas.

### `CU-15`: Actualizando perfil personal y contraseña
* **Actores:** `CLIENTE`, `ADMIN` — **HU asociada:** `HU-13`
* **Precondición:** Usuario autenticado `'ACTIVO'`.
* **Flujo normal:**
  1. Consulta sus datos actuales vía `GET /api/perfil`.
  2. Para actualizar datos personales, envía `PUT /api/perfil` modificando únicamente `nombre`, `primer_apellido`, `segundo_apellido?` y `telefono`.
  3. Para cambiar contraseña, envía `PATCH /api/perfil/contrasena` con `contrasena_actual` y `nueva_contrasena` (`>= 8` caracteres); el sistema verifica la actual, guarda el nuevo hash `bcrypt` e incrementa `token_version`.
* **Flujos alternos:** `2.1` Intento de enviar `correo`, `tipo_documento`, `numero_documento`, `rol` o `estado_usuario` es rechazado por `Zod` (`400 VALIDACION_INVALIDA`). `3.1` Contraseña actual incorrecta retorna `401 CREDENCIALES_INVALIDAS`.
* **Postcondición:** Datos permitidos actualizados; ante cambio de contraseña las sesiones previas quedan revocadas.

### `CU-16`: Ejecutando pago simulado síncrono (`1:N`) y confirmando compra *(desacoplado de `CU-03`)*
* **Actor:** `CLIENTE` (`'ACTIVO'`) — **HU asociada:** `HU-14`
* **Precondición:** Pedido del cliente en estado `'PENDIENTE'` creado en `CU-03`.
* **Flujo normal:**
  1. El cliente envía `POST /api/pedidos/:id/pagos` con `{ metodo_pago, referencia_simulada }` (`TARJETA`, `PSE`, `TRANSFERENCIA`) y cabecera opcional `Idempotency-Key`.
  2. En una única transacción `withTransaction`, el backend bloquea `pedido FOR UPDATE`, valida `Idempotency-Key` + `payload_hash`, confirma `estado_pedido = 'PENDIENTE'` y `NOW() <= fecha_expiracion`.
  3. El backend evalúa determinísticamente la referencia (`referencia_simulada` sin sufijo `'00'` → `'APROBADO'`; terminada en `'00'` → `'RECHAZADO'`), asigna `numero_intento`, inserta nueva fila en `pago` y, si resulta `'APROBADO'`, actualiza `pedido.estado_pedido = 'PAGADO'`.
* **Flujos alternos:** `2.1` Clave de idempotencia reutilizada con igual payload retorna el resultado ya guardado; si el payload difiere retorna `409 IDEMPOTENCY_CONFLICT`. `2.2` Reserva expirada dispara expiración en esa transacción y retorna `409 RESERVA_EXPIRADA`. `2.3` Pedido ya pagado retorna `409 PEDIDO_YA_PAGADO`. `3.1` Referencia terminada en `'00'` persiste intento `'RECHAZADO'` dejando el pedido `'PENDIENTE'` para nuevo intento dentro de los 15 minutos.
* **Postcondición:** Cada intento queda auditado (`1:N`) y un pago aprobado consolida la compra en `'PAGADO'`.

### `CU-17`: Gestionando categorías de productos (`ADMIN`)
* **Actor:** `ADMIN` — **HU asociada:** `HU-16`
* **Precondición:** Sesión `ADMIN` `'ACTIVO'`.
* **Flujo normal:**
  1. El administrador consulta (`GET /api/admin/categorias`), crea (`POST /api/admin/categorias`), edita (`PUT /api/admin/categorias/:id`) o activa/inactiva (`PATCH /api/admin/categorias/:id/estado`) categorías.
  2. Al inactivar (`estado = FALSE`), los productos de esa categoría dejan de mostrarse en catálogo público y no pueden agregarse o confirmarse en carrito/checkout.
* **Flujos alternos:** `1.1` Nombre duplicado retorna `409 VALIDACION_INVALIDA` / `RECURSO_DUPLICADO` (`UNIQUE`). `1.2` Intento de borrado con productos asociados está restringido (`409 CATEGORIA_CON_PRODUCTOS`).
* **Postcondición:** Catálogo segmentado por categorías con integridad referencial garantizada.

### `CU-18`: Cancelando pedido pre-envío, confirmando reembolso y volviendo al carrito
* **Actores:** `CLIENTE`, `ADMIN` — **HU asociadas:** `HU-17`, `HU-18`
* **Precondición:** Para cancelar: pedido en `'PENDIENTE'` o `'PAGADO'` (aún no `'ENVIADO'`). Para volver al carrito: pedido propio en `'CANCELADO'`.
* **Flujo normal:**
  1. El cliente cancela (`POST /api/pedidos/:id/cancelar` con motivo opcional y `datos_reembolso` obligatorios sin PAN/CVV si estaba `'PAGADO'`) o el administrador cancela (`CU-14` con `motivo_cancelacion` obligatorio).
  2. La transacción bloquea `pedido` y `producto ORDER BY id_producto ASC FOR UPDATE`, pasa `pedido` a `'CANCELADO'`, restituye existencias y, si tenía pago `'APROBADO'`, registra en `pedido`: `estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO'`, `datos_reembolso_cancelacion` y `fecha_limite_reembolso_cancelacion = CURRENT_TIMESTAMP + INTERVAL '15 days'`.
  3. El administrador confirma la devolución total de dinero mediante `PATCH /api/admin/pedidos/:id/reembolso`, pasando `pedido.estado_reembolso_cancelacion = 'REEMBOLSADO'`, `fecha_reembolso_cancelacion = CURRENT_TIMESTAMP` y `pago.estado_pago = 'REEMBOLSADO'`.
  4. Sobre cualquier pedido propio `'CANCELADO'`, el cliente puede invocar `POST /api/pedidos/:id/volver-al-carrito` (idempotente) para reincorporar ítems aún activos con stock vigente a su carrito `'ACTIVO'`, recibiendo `ajustes[]`.
* **Flujos alternos:** `1.1` Cancelar un pedido `'ENVIADO'`, `'ENTREGADO'` o ya `'CANCELADO'` retorna `409 TRANSICION_ESTADO_INVALIDA`. `4.1` Productos sin stock o de categoría inactiva se omiten reportando en `ajustes[]`.
* **Postcondición:** Stock restituido, reembolso pre-envío trazado hasta completar `'REEMBOLSADO'` y recuperación segura de carrito habilitada.

### `CU-19`: Solicitando y resolviendo `RETRACTO_LEGAL` con inspección física por cantidad
* **Actores:** `CLIENTE`, `ADMIN` — **HU asociada:** `HU-19`
* **Precondición:** Pedido en `'ENTREGADO'`; calendario `festivo_colombia` con cobertura de los `20 días` calendario posteriores a `fecha_entrega`.
* **Flujo normal:**
  1. El cliente solicita retracto legal total o parcial (`POST /api/pedidos/:id/retractos` con `{ motivo, datos_reembolso, items: [{ id_detalle_pedido, cantidad }] }`) dentro del límite `NOW() < (dia_habil_5 + 1 day) AT TIME ZONE 'America/Bogota'`.
  2. El backend bloquea `detalle_pedido FOR UPDATE`, valida que no exceda el saldo disponible (descontando retractos vigentes y unidades previamente rechazadas tras inspección por `'DANADO'`), registra `retracto` (`SOLICITADO`, `PENDIENTE_REEMBOLSO`, plazo 15 días) y `detalle_retracto`, conservando `pedido.estado_pedido = 'ENTREGADO'`.
  3. El administrador revisa procedencia legal (`PATCH /api/admin/retractos/:id/decision`) aprobando recepción (`APROBADO_RECEPCION`) o rechazando (`RECHAZADO` con `estado_reembolso = 'NO_APLICA'` y `fecha_limite_reembolso = NULL`).
  4. Al recibir el paquete físico, el administrador registra inspección **por producto y cantidad** (`PATCH /api/admin/retractos/:id/recepcion`: `cantidad_buen_estado` + `cantidad_danada = cantidad_devuelta`); el sistema reingresa stock y calcula `monto_reembolso` exclusivamente sobre `cantidad_buen_estado` (si `monto_reembolso = 0`, cierra en `RECHAZADO` con `estado_reembolso = 'NO_APLICA'`, bloqueando re-solicitud futura sobre esas unidades).
  5. Cuando hay saldo válido (`monto_reembolso > 0`), el administrador confirma el reembolso (`PATCH /api/admin/retractos/:id/reembolso`), marcando `retracto` como `COMPLETADO` / `'REEMBOLSADO'`, y cambiando `pago.estado_pago = 'REEMBOLSADO'` **solo si el acumulado reembolsado alcanza el 100 % de `pedido.total`**.
* **Flujos alternos:** `1.1` Fuera de plazo retorna `409 PLAZO_RETRACTO_VENCIDO`; año faltante en `festivo_colombia` retorna `500 CALENDARIO_FESTIVOS_INCOMPLETO`. `2.1` Cantidad excedida o sobre unidad ya rechazada por daño físico retorna `409 CANTIDAD_RETRACTO_EXCEDIDA`.
* **Postcondición:** Inventario ajustado únicamente con unidades en `BUEN_ESTADO`, historial auditable y métricas netas exactas.

---

## 3. Exclusiones de alcance v1

Conforme a [NOTA_ALCANCE_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/NOTA_ALCANCE_V1.md), ningún caso de uso v1 contempla: rol `VENDEDOR`, personas jurídicas con `NIT`, estado de usuario `'BLOQUEADO'`, `DEVOLUCION_COMERCIAL`, tabla `token_revocacion`, subida binaria `Upload`, cálculo/devolución de fletes, módulo de taller/citas, módulo de compras a proveedores, promociones ni facturación electrónica DIAN.
