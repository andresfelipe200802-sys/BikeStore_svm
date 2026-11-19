# Especificación Técnica de Diseño: BikeStore (`Web_BikeStore_svm`)

* **Autor:** Andrés Felipe – Juan Sánchez
* **Estado:** Revisado, consolidado y ampliado (modelo de **16 tablas**, sesiones refresh A1, idempotencia duradera B1, endurecimiento seguridad/SSRF/CSP y rendimiento)
* **Fecha:** 2026-11-19
* **Fuente de contexto:** [concepts_brief.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/concepts_brief.md)

---

## Overview

**BikeStore** (repositorio `Web_BikeStore_svm`) es una aplicación web de comercio electrónico orientada a la venta de bicicletas y accesorios deportivos. El proyecto inicia como entrega formativa del SENA en entorno local (`localhost`), estructurado en tres capas modulares con contratos REST versionados para facilitar un despliegue productivo posterior en la capa de infraestructura sin alterar la lógica de negocio central.

Aunque el sistema se implementará desde cero en **dos etapas secuenciales** —primero el **backend** (`Node.js 26 LTS` + `Express` + `PostgreSQL` mediante `pg` en `backend/src/config/db.js` con SQL parametrizado y scripts SQL versionados, sin ORM) y posteriormente el **frontend** (`React` + `Vite`)—, ambos módulos pertenecen a una única solución integrada. Antes de iniciar código en `backend/`, la documentación base existente en `Documentacion-Escencial-BikeStore/` debe alinearse siguiendo estrictamente el orden **`Respaldo espejo → HU + CU → Auditoría de escenarios → MER + DER + Diccionario → Arquitectura → Backend (Etapa 1) → Frontend (Etapa 2)`**.

---

## The Problem

La documentación base en `Documentacion-Escencial-BikeStore/` presenta contradicciones estructurales entre capas que impedirían implementar el backend y conectar luego el frontend sin retrabajo:

1. **Inconsistencias entre artefactos SENA:** El diagrama de arquitectura ([Ev_arquitecturaEnCapas_Viveros_Sanchez.svg](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Ev_arquitectura%20de%20software/Ev_arquitecturaEnCapas_Viveros_Sanchez.svg)) declara `MySQL`, subida binaria (`Upload · imágenes`), exportación binaria PDF/Excel en backend, rol `Administrador principal` y rutas heredadas (`/api/compras`, `/api/usuarios/perfil`, `/api/carrito/:productoId`, `/api/admin/informes`, `/api/admin/roles`). El diccionario ([Diccionario_Datos_Viveros_Sanchez.xlsx](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Diccionario_datos/Diccionario_Datos_Viveros_Sanchez.xlsx)) conserva el rol `VENDEDOR`, omite documentos de identidad en `usuario` y modela `pedido`–`pago` como `1:1`. La guía ([ProyectoDidactico-BikeStore-Aprendiz.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/ProyectoDidactico-BikeStore-Aprendiz.pdf)) mezcla requisitos locales (`RNF-12`) con despliegue en nube (`Sprint 7`) e introduce términos fuera de alcance (promociones, entradas de mercancía, citas). Además, [evhistoriasdeusuariodocx.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/historias_usuario/evhistoriasdeusuariodocx.pdf) duplica texto de `HU-13` dentro del Escenario 2 de `HU-15`, y [Ev_plantilla_casos_de_uso_viveros_sanchez.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/CASOS_DE_USO/Ev_plantilla_casos_de_uso_viveros_sanchez.pdf) exige 10 dígitos fijos en `CU-04` y mensajes no neutros en `CU-06`.
2. **Vacíos de concurrencia, sesión e integridad comercial:** Sin reglas previas de diseño, las reservas de 15 minutos dependerían de temporizadores en memoria de Node.js, un cierre de sesión (`CU-12` / `HU-10`) o cambio de estado/rol (`HU-09`) no revocaría JWT vigentes, el visitante perdería su carrito al autenticarse, una cancelación pre-envío de pedido pagado carecería de flujo de reembolso y un retracto devolvería inventario sin inspección física por producto y cantidad.
3. **Acoplamiento de implementación secuencial y cuotas gratuitas:** Sin contratos cerrados ni aislamiento de transporte SMTP en pruebas, la Etapa 1 dejaría respuestas HTTP ambiguas para React y agotaría rápidamente el plan gratuito de Mailtrap Sandbox (~50 correos/mes).

La solución cierra los contratos de **16 tablas PostgreSQL exactas**, las transacciones con jerarquía fija de bloqueos (incluyendo reintentos ante `40P01`/`40001` y `FOR NO KEY UPDATE`), rotación de sesiones refresh `A1` con replay AEAD de `30 s`, idempotencia persistida `B1`, la superficie REST completa y la verificación integral en backend y frontend.

---

## Goals

### Propósito y objetivos funcionales del sistema (v1)
1. **Catálogo público y gestión administrativa de productos y categorías:** Exponer catálogo paginado (`page=1`, `limit=12`, máximo `50`) filtrado por categoría activa y ordenado por precio (`asc`/`desc`), ocultando productos de categorías inactivas (`producto.estado = TRUE AND categoria.estado = TRUE`) y mostrando agotados (`existencias = 0`) como `"Agotado"` sin compra habilitada (`CU-01`). Habilitar al `ADMIN` CRUD de categorías (inactivación lógica bloqueando borrado físico `DELETE /api/admin/categorias/:id` con `409 CATEGORIA_CON_PRODUCTOS` si tiene productos asociados) y de productos (`imagen_url` externa `http://`/`https://` con rechazo estricto de SVG, credenciales embebidas y hosts locales/privados/metadatos anti-SSRF, separando la edición descriptiva del ajuste transaccional de `existencias`).
2. **Identidad, rol único, sesiones refresh A1, control de acceso y recuperación neutra:** Gestionar únicamente los roles `ADMIN` y `CLIENTE` (`Visitante` opera sin fila ni rol en BD), restringiendo cada usuario a **un único rol vigente** en `usuario_rol` con endpoint administrativo `PATCH /api/admin/usuarios/:id/rol` (`RF-28`) y estado `usuario.estado_usuario IN ('ACTIVO', 'INACTIVO')`. Registro para personas naturales colombianas y extranjeros residentes con validación sintáctica inicial por `tipo_documento` (`CC`, `TI`, `CE`, `PASAPORTE`, `PPT`) y unicidad compuesta `(tipo_documento, numero_documento)`, nombres, apellidos (`segundo_apellido` opcional), `telefono`, `correo` único (*case-insensitive*, sin correo de activación según alcance v1 de `RF-14`) y `contrasena_hash` (`bcrypt`).
   * **Access JWT + Refresh Token rotatorio (`A1`):** `POST /api/auth/login` emite Access JWT `HS256` (`TTL 15m`, `expires_in: 900`, conservado **solo en memoria React** en frontend) junto a `rotacion_uid`, y fija la cookie `HttpOnly` `bikestore_rt` (`Path=/api/auth`, `Max-Age=604800`, `SameSite=Lax`, `Secure=env.COOKIE_SECURE`) respaldada por la tabla **`sesion_refresh`** (Tabla #15).
   * **Renovación idempotente y protección CSRF/reúso:** `POST /api/auth/refresh` exige verificación CSRF (`Origin` en `CORS_ORIGINS` + `X-Requested-With: BikeStore` → `403 CSRF_ORIGEN_INVALIDO`) y cabecera `Idempotency-Key` UUID RFC 4122/9562 obligatoria. Reproduce exactamente el mismo token hijo `T2` durante máximo **30 segundos** mediante `reemplazo_cifrado` (`AES-256-GCM` + `HKDF-SHA256` con `REFRESH_REPLAY_KEY`) únicamente si `T2` no ha sido utilizado; ante cualquier reúso fuera de esa ventana responde `401 SESION_REVOCADA` revocando toda la familia (`REUSO_DETECTADO`), o `401 SESION_EXPIRADA` si venció. *Nota de seguridad:* `Idempotency-Key` demuestra correlación de operación para reintentos seguros, **no** identidad criptográfica del cliente.
   * **Revocación global:** `POST /api/auth/logout` (CSRF si viene cookie, acepta `Bearer` o cookie `bikestore_rt`), cambio/restablecimiento de contraseña, inactivación o cambio de rol incrementan `usuario.token_version` y revocan todas las filas activas de `sesion_refresh` (limpiando `reemplazo_cifrado`). Recuperación `CU-06` con `token_recuperacion` (`SHA-256`, TTL `60m`), HTTP `200` inmediato sin latencia SMTP bloqueante y `SMTP_TRANSPORT=json|smtp` (sin imprimir tokens ni URLs en logs).
3. **Continuidad del carrito entre visitante y cliente autenticado (`B1`):** Almacenar `{ schema_version: 1, items: [{ id_producto, cantidad }] }` en `localStorage` para visitantes y fusionarlo de forma segura e idempotente al autenticarse mediante `POST /api/carrito/fusionar` con cabecera **`Idempotency-Key` UUID RFC 4122/9562 obligatoria** persistida en **`carrito_fusion_idempotencia`** (Tabla #16, `id_carrito NULL ON DELETE SET NULL`, retención garantizada de **30 días** antes de purga por lotes), descartando productos/categorías inactivas o con stock `0`, aplicando tope real de existencias, recalculando precios vigentes y devolviendo `ajustes[]`.
4. **Reserva transaccional de inventario, pagos `1:N` y devolución idempotente al carrito:** En checkout (`POST /api/pedidos`), ejecutar expiración perezosa de pedidos `'PENDIENTE'` vencidos en pre-transacción para evitar rollbacks espurios y bloqueos cruzados; si algún precio varió respecto al carrito, actualizar el carrito al precio vigente y rechazar con `HTTP 409 PRECIO_ACTUALIZADO`; bloquear existencias por **15 minutos** en `'PENDIENTE'` (`id_pedido` único de `RF-10`) sin cobro de envío en v1; ejecutar simulación síncrona `1:N` (`TARJETA`, `PSE`, `TRANSFERENCIA`) en **una única transacción atómica** con resultado determinista en servidor. `POST /api/pedidos/:id/volver-al-carrito` exige **`Idempotency-Key` UUID RFC 4122/9562 obligatoria** y opera en **2 fases sin rollback** (Opción recomendada: si el pedido está `'PENDIENTE'` vencido, expira a `'CANCELADO'` restituyendo inventario en Fase A con `COMMIT`; luego en Fase B devuelve ítems disponibles al carrito con `200 OK`, persistiendo las 3 columnas de devolución en `pedido`).
5. **Posventa (cancelación pre-envío y `RETRACTO_LEGAL`):** Permitir cancelación antes de `'ENVIADO'` (`CLIENTE` con motivo opcional; `ADMIN` con motivo obligatorio), registrando datos y estado de reembolso directamente en `pedido` cuando estaba `'PAGADO'` (plazo legal 15 días calendario y confirmación vía `PATCH /api/admin/pedidos/:id/reembolso`), además de inspección administrativa detallada vía `GET /api/admin/pedidos/:id`. Tras `'ENTREGADO'`, v1 cubre exclusivamente **`RETRACTO_LEGAL`** (Ley 1480 de 2011 Art. 47 y Ley 2439 de 2024: **5 días hábiles** en `America/Bogota` con `festivo_colombia` 2025–2035), total o parcial previa validación administrativa de procedencia legal, inspección física por **producto y cantidad**, reembolso solo de unidades en `BUEN_ESTADO`, bloqueo de re-solicitudes sobre unidades dañadas y cierre contable exacto.
6. **Tablero, reportes netos, rendimiento y calidad frontend:** Exponer métricas agregadas y reportes JSON acotados (`desde`, `hasta`, `id_categoria`, máximo `90 días` y `5000 filas`) descontando únicamente importes **efectivamente reembolsados**, exportables a Excel/PDF en frontend (`React.lazy` + `Suspense`, CSP estricto en producción sin `'unsafe-inline'` en scripts, SEO `robots.txt`/`sitemap.xml`/Open Graph/`noindex` en privadas, coordinación multi-pestaña con `Web Locks API` + `BroadcastChannel` + UUIDv8 determinista sin mutex en `localStorage`, y auditoría de accesibilidad `vitest-axe`).

### Objetivos de integración Backend → Frontend
* **Etapa 1 (Backend verificable de forma autónoma):** Entregar esquema SQL de **16 tablas** (`001`–`005`), API Express con validación `Zod`, protección CSRF/SSRF/SVG, sesiones `A1` e idempotencia `B1`, reintentos `40P01`/`40001` (`503 CONFLICTO_CONCURRENCIA`), pruebas unitarias y de integración/concurrencia (`node:test` + `supertest`) contra PostgreSQL real bajo `Node.js 26 LTS` y contrato `CONTRATO_API_V1.md` + `bikestore.http`.
* **Etapa 2 (Frontend moderno, accesible y coordinado):** Mantener `React` + `Vite` con carga diferida (`React.lazy` + `Suspense`), identidad visual `LogoMarcaBS` + `BIKESTORE`, Access JWT solo en memoria React, `refreshSync.js` (`Web Locks API` + `BroadcastChannel` + UUIDv8 determinista), CSP, SEO y pruebas unitarias/UI/accesibilidad (`Vitest` + `vitest-axe`).

---

## Non-Goals (Límites del sistema v1)

Quedan explícitamente **fuera del alcance** de v1:

* **Devolución comercial voluntaria (`DEVOLUCION_COMERCIAL`):** Excluida de v1; posventa post-entrega se restringe estrictamente al `RETRACTO_LEGAL`.
* **Estado de usuario `'BLOQUEADO'`:** Solo operan `'ACTIVO'` e `'INACTIVO'`.
* **Sesiones selectivas multidispositivo por interfaz de administración/revocación individual (`token_revocacion` heredado):** Aunque v1 incorpora `sesion_refresh` (Tabla #15) para rotación de un solo uso y replay AEAD de `30 s` (`A1`), la revocación explícita (`logout`, cambio/restablecimiento de clave, inactivación o cambio de rol) continúa siendo global para toda la cuenta mediante `usuario.token_version` + revocación de todas las familias activas en `sesion_refresh`, sin consola de "cerrar sesión en un dispositivo específico".
* **Servicios y citas:** Sin agenda de taller, mantenimiento ni reparación de bicicletas.
* **Rol `VENDEDOR`:** Eliminado por completo de base de datos, endpoints y vistas.
* **Registro corporativo con `NIT` (Número de Identificación Tributaria):** v1 cubre únicamente personas naturales (`CC`, `TI`, `CE`, `PASAPORTE`, `PPT`).
* **Proveedores y compras de mercancía:** Sin órdenes de compra ni entradas de almacén.
* **Promociones y facturación electrónica:** Sin cupones, reglas promocionales ni factura tributaria DIAN.
* **Cálculo de envíos y gestión de fletes:** Sin tarifas de transporte por ubicación ni cobro o prorrateo de flete en `pedido.total` durante v1.
* **Administración UI de festivos:** `festivo_colombia` se gestiona por scripts SQL versionados (`004_festivos_colombia_2025_2035.sql` y posteriores).
* **Pagos reales, mixtos, parciales o asíncronos:** Sin pasarela bancaria real, abonos parciales ni múltiples medios de pago simultáneos.
* **Almacenamiento binario y generación documental en backend:** Sin `multer`/S3 ni renderizado binario Excel/PDF en Express.
* **Despliegue productivo en nube (`Sprint 7`) e infraestructura distribuida externa:** La entrega evaluada de v1 opera en `localhost` (`RNF-12`) con `Node.js 26 LTS` + `PostgreSQL`, sin Redis, RabbitMQ, Kafka ni microservicios.

---

## Open Questions

* No permanecen preguntas abiertas para la arquitectura de **16 tablas**, rotación `A1`, idempotencia persistida `B1`, seguridad (`CSRF`, `SSRF/SVG`, `CSP`), rendimiento (`React.lazy` + `Suspense`) ni pruebas integrales (`node:test` + `Vitest` + `vitest-axe`). Todas las definiciones fueron resueltas y sincronizadas entre backend, frontend y documentación.

---

## Critical User Journeys (CUJs)

### CUJ 1: Navegación anónima, carrito temporal y fusión idempotente al autenticarse
* **Given:** Un visitante consulta catálogo paginado (`page=1`, `limit=12`, máx. `50`) sobre categorías y productos activos (`categoria.estado = TRUE AND producto.estado = TRUE`) y guarda en `localStorage` `{ "schema_version": 1, "items": [{ "id_producto": 1, "cantidad": 2 }] }`.
* **When:** Inicia sesión (`POST /api/auth/login`) o se registra (`POST /api/auth/registro` seguido de `login`) obteniendo `{ token, expires_in: 900, rotacion_uid, usuario }` + cookie `HttpOnly bikestore_rt`, y el frontend invoca `POST /api/carrito/fusionar` enviando cabecera **obligatoria `Idempotency-Key: <UUID RFC 4122/9562>`** (persistida en `bikestore_pending_fusion_key_v1` hasta confirmar `200 OK`) antes de limpiar `localStorage`.
* **Then:** Dentro de `withTransaction`, el backend bloquea `usuario FOR UPDATE` → `carrito_fusion_idempotencia FOR UPDATE` antes de crear o tocar `carrito`. Si la clave ya existe dentro de los **30 días** de retención con mismo `payload_hash`, retorna `200 { ...resultado_json, replayed: true }` sin volver a sumar; si difiere el payload responde `409 IDEMPOTENCY_CONFLICT`. Si es nueva, bloquea `carrito` (`ensureCarritoActivoLocked`), `detalle_carrito ASC FOR UPDATE` y `producto ASC FOR NO KEY UPDATE OF p`, descarta inactivos o con stock `0`, aplica tope real de existencias, recalcula precios vigentes, registra la respuesta en `carrito_fusion_idempotencia` (`id_carrito NULL ON DELETE SET NULL`) y responde `200` con `replayed: false` y `ajustes[]`.

### CUJ 2: Confirmación de pedido (`HU-03`), reserva de 15 minutos, pago `1:N` (`HU-14`) y devolución en 2 fases
* **Given:** Un `CLIENTE` `'ACTIVO'` tiene ítems en su carrito `'ACTIVO'`, envía `direccion_envio` y no tiene otro pedido `'PENDIENTE'` vigente.
* **When:** Confirma el pedido (`POST /api/pedidos`), ejecuta intentos de pago (`POST /api/pedidos/:id/pagos`) o, si el pedido venció/se canceló, invoca `POST /api/pedidos/:id/volver-al-carrito` con cabecera **`Idempotency-Key: <UUID RFC 4122/9562>` obligatoria**.
* **Then:**
  * En checkout (`POST /api/pedidos`), si el cliente tiene un pedido `'PENDIENTE'` vencido, se expira en una pre-transacción separada antes de la transacción principal (evitando rollback en `409` y bloqueos cruzados de `producto`). Luego bloquea `carrito FOR UPDATE`, verifica ítems activos y precios (`detalle_carrito.precio_unidad = producto.precio`: si varió, actualiza carrito, hace `COMMIT` y responde **`HTTP 409 PRECIO_ACTUALIZADO`**), bloquea productos en `ORDER BY id_producto ASC FOR NO KEY UPDATE OF p`, descuenta existencias, crea `pedido` (`id_pedido` único) en `'PENDIENTE'` por `15 minutos` y marca `carrito` como `'CONVERTIDO'`.
  * En pago (`POST /api/pedidos/:id/pagos`), la transacción **bloquea primero `pedido` (`FOR UPDATE`)**, verifica `Idempotency-Key`, comprueba vigencia (`fecha_expiracion > CURRENT_TIMESTAMP`) y ausencia de pago `'APROBADO'`, evalúa determinísticamente el simulador en backend (`referencia_simulada` terminada en `'00'` → `'RECHAZADO'`; en otro caso → `'APROBADO'` y pedido `'PAGADO'`), e inserta en `pago` (`1:N`).
  * En `POST /api/pedidos/:id/volver-al-carrito` (flujo en **2 fases sin rollback**, Opción recomendada): **Fase A (`tx1`)** bloquea `usuario FOR UPDATE` → `pedido FOR UPDATE`, valida `404` / conflicto con otra orden (`409 IDEMPOTENCY_CONFLICT`) / replay exacto sin tocar carrito / orden ya devuelta con otra clave (`409`), y si está `'PENDIENTE'` vencido ejecuta `expirarPedidoSiVencido` pasándolo a `'CANCELADO'` y restituyendo inventario con **`COMMIT`** (sin rollback); si está en otro estado distinto de `'CANCELADO'` responde `409 TRANSICION_ESTADO_INVALIDA`. **Fase B (`tx2`, solo si fusiona)** bloquea `usuario` → `carrito` → `detalle_carrito ASC` → `pedido` → `detalle_pedido ASC` → `producto ASC FOR NO KEY UPDATE OF p`, fusiona disponibles en el carrito y persiste `clave_idempotencia_carrito`, `fecha_devolucion_carrito` y `resultado_devolucion_carrito` en `pedido`, respondiendo `200 OK` con `ajustes[]`.

### CUJ 3: Cancelación pre-envío y `RETRACTO_LEGAL` con inspección por producto y cantidad
* **Given:** Un pedido está en `'PENDIENTE'` o `'PAGADO'` (pre-envío), o en `'ENTREGADO'` con saldo pendiente dentro del plazo legal de retracto.
* **When:** El `CLIENTE` (motivo opcional) o `ADMIN` (motivo obligatorio) cancela antes de `'ENVIADO'`, o el `CLIENTE` solicita `RETRACTO_LEGAL` (`POST /api/pedidos/:id/retractos`) total o parcial dentro de los **5 días hábiles** en `America/Bogota` tras `fecha_entrega`.
* **Then:**
  * En cancelación pre-envío, el pedido pasa a `'CANCELADO'`, se reintegran existencias y, si tenía pago `'APROBADO'`, la misma transacción guarda en `pedido` `datos_reembolso_cancelacion`, `estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO'` y `fecha_limite_reembolso_cancelacion = CURRENT_TIMESTAMP + INTERVAL '15 days'`. Cuando el `ADMIN` confirma el reembolso (`PATCH /api/admin/pedidos/:id/reembolso`), `pedido.estado_reembolso_cancelacion` pasa a `'REEMBOLSADO'` con `fecha_reembolso_cancelacion` y `pago.estado_pago` pasa a `'REEMBOLSADO'` (reembolso total del pedido).
  * En posventa sobre `'ENTREGADO'`, `pedido.estado_pedido` **permanece en `'ENTREGADO'`**. El backend valida cobertura anual en `festivo_colombia`, calcula el plazo hasta el límite `< dia_6 00:00:00-05:00` en `America/Bogota`, bloquea `detalle_pedido` (`FOR UPDATE`) verificando que las unidades solicitadas no excedan `detalle_pedido.cantidad` menos unidades de retractos previos (incluidas unidades previamente rechazadas tras inspección física por `'DANADO'`), registra `retracto` (`SOLICITADO`) y `detalle_retracto`. El `ADMIN` revisa procedencia legal (`PATCH /api/admin/retractos/:id/decision`, pues un retracto parcial no procede automáticamente si incumple condiciones legales), inspecciona físicamente **por producto y cantidad** (`PATCH /api/admin/retractos/:id/recepcion`: `cantidad_buen_estado` + `cantidad_danada = cantidad_devuelta`), reingresa únicamente `cantidad_buen_estado`, calcula `monto_reembolso` solo sobre unidades en buen estado (si es `0`, cierra como `RECHAZADO` con `estado_reembolso = 'NO_APLICA'` y `fecha_limite_reembolso = NULL` sin permitir re-solicitud sobre esas unidades) y al registrar reembolso (`PATCH /api/admin/retractos/:id/reembolso`) marca `retracto.estado_reembolso = 'REEMBOLSADO'`, actualizando `pago.estado_pago = 'REEMBOLSADO'` **únicamente si el acumulado reembolsado alcanza el 100 % de `pedido.total`**.

### CUJ 4: Renovación A1, recuperación segura (`CU-06`), gestión de usuarios (`RF-28`) y reportes netos
* **Given:** Un usuario renueva su Access JWT expirado (`401 TOKEN_INVALIDO`), solicita recuperar contraseña, cierra sesión globalmente o un `ADMIN` gestiona catálogo (`imagen_url` no-SVG/no-SSRF), usuarios/roles, pedidos (`GET /api/admin/pedidos/:id`), retractos o tablero.
* **When:** Invoca `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/recuperar` o `/api/admin/...`.
* **Then:**
  * En frontend, el Access JWT vive **únicamente en memoria React** (`bs_client_secret` y `bs_refresh_uid` no secretos en `localStorage`); múltiples pestañas coordinan la renovación con **`Web Locks API`** + **`BroadcastChannel`** + **`Idempotency-Key` UUID v8 determinista** (sin mutex en `localStorage`). `POST /api/auth/refresh` valida `Origin` + `X-Requested-With: BikeStore` (`403 CSRF_ORIGEN_INVALIDO`), rota la fila activa en `sesion_refresh` emitiendo nuevo `T2` cifrado en `reemplazo_cifrado` (`AES-256-GCM` + `HKDF`) por hasta `30 s` para replays exactos con la misma `Idempotency-Key` mientras `T2` no haya sido usado; cualquier reúso dispara revocación de toda la familia (`REUSO_DETECTADO`, `401 SESION_REVOCADA`).
  * `/api/auth/recuperar` aplica *rate limiting*, invalida tokens previos sin usar si el usuario `'ACTIVO'` existe, guarda `token_hash` (`SHA-256`, TTL `60m`), ejecuta `COMMIT` y **despacha `HTTP 200` neutro de inmediato**, enviando el correo vía `Nodemailer` (`SMTP_TRANSPORT=json|smtp`, sin registrar tokens/URLs en logs). En `/api/auth/login` se ejecuta `bcrypt.compare` ficticio si el correo no existe.
  * En administración, `ADMIN` asigna rol único (`PATCH /api/admin/usuarios/:id/rol`) o estado (`PATCH /api/admin/usuarios/:id/estado`) bloqueando `ORDER BY u.id_usuario ASC FOR UPDATE OF u` (protegiendo `409 ULTIMO_ADMIN_ACTIVO`), incrementando `token_version` y revocando `sesion_refresh` activas. `/api/admin/reportes/*` calcula ventas netas reales descontando solo montos **efectivamente reembolsados**.

---

## Technical Plan (Architecture)

### 1. Arquitectura de capas y frontera Backend ↔ Frontend

```mermaid
flowchart LR
    subgraph FE["Frontend (React 19 + Vite 8 - localhost:5173)"]
        UI["Vistas Públicas / Cliente / Admin (React.lazy + Suspense + CSP + SEO)"]
        MEM["Memoria React (Access JWT 15m) + Web Locks + BroadcastChannel + UUIDv8"]
        LS["localStorage (carrito visitante v1 + bs_client_secret / bs_refresh_uid)"]
        EXP["Exportación Excel / PDF (cliente)"]
    end

    subgraph BE["Backend REST (Node.js 26 LTS + Express - localhost:3000)"]
        MW["Middlewares (Helmet, CORS, Trust Proxy, CSRF Origin, Auth JWT+BD, Role, Zod, Rate Limit, Error 503)"]
        CTRL["Controllers (HTTP & Status Codes + Cookie bikestore_rt)"]
        SRV["Services (Reglas de negocio, A1 refreshCrypto, B1 idempotencia, bloqueos unificados)"]
        DBJS["src/config/db.js (Pool pg + withTransaction con reintentos 40P01/40001)"]
        JOB["Job expiracionReservas + purgarRegistrosExpiradosLote (SKIP LOCKED)"]
        FEST["Utilidad días hábiles (festivo_colombia)"]
        MAIL["Utilidad mailer.js (Nodemailer json/Mailtrap, sin log de tokens)"]
    end

    subgraph DATA["Persistencia y Servicios Externos"]
        PG[("PostgreSQL (16 tablas exactas, SQL 001..005)")]
        SMTP["Mailtrap SMTP (Manual/Demo) / jsonTransport (Test)"]
    end

    UI -->|HTTP(S)/JSON + Bearer JWT + Cookie bikestore_rt + Origin/X-Requested-With + UUID Idempotency-Key| MW
    MEM --> UI
    LS -->|Fusión idempotente 30d / Rehidratación silenciosa| UI
    UI --> EXP
    MW --> DBJS
    MW --> CTRL
    CTRL --> SRV
    SRV --> DBJS
    SRV --> FEST
    SRV --> MAIL
    FEST --> DBJS
    JOB --> DBJS
    DBJS --> PG
    MAIL --> SMTP
```

* **Frontera entre etapas:** El backend expone JSON uniforme bajo `/api/...` con respuestas de éxito `{ ok: true, datos, meta? }` y de error `{ ok: false, codigo, mensaje, detalles? }`, CORS con `credentials: true` restringido a `CORS_ORIGIN` (`CORS_ORIGINS`), `trust proxy` configurable (`TRUST_PROXY`), cookie `HttpOnly bikestore_rt` en `/api/auth`, colección `backend/docs/bikestore.http` y contrato `backend/docs/CONTRATO_API_V1.md`.
* **Convención de capas internas en backend:** Separación estricta `routes/` (enrutamiento y middlewares `csrf`, `auth`, `role`, `rateLimit`, `validate`) → `controllers/` (parseo HTTP, cookies `HttpOnly` y status codes) → `services/` (lógica de negocio, transacciones y consultas SQL parametrizadas mediante `backend/src/config/db.js`, sin carpeta `repositories/` adicional).

### 2. Estructura del repositorio (`Web_BikeStore_svm`)

```text
Web_BikeStore_svm/
├── .gitignore                           # node_modules/, .env, coverage/, frontend/dist/
├── Documentacion-Escencial-BikeStore/   # Artefactos SENA + _respaldo_originales/
├── docs/designs/bikestore_v1.md         # Especificación técnica central (16 tablas)
├── concepts_brief.md                    # Brief conceptual sincronizado
├── design_draft.md                      # Puntero hacia docs/designs/bikestore_v1.md
├── backend/                             # Backend (Node.js 26 LTS + Express + pg)
│   ├── docs/
│   │   ├── CONTRATO_API_V1.md
│   │   └── bikestore.http
│   ├── README.md
│   ├── sql/
│   │   ├── 001_schema_inicial.sql       # 14 tablas iniciales
│   │   ├── 002_indices_y_reglas.sql
│   │   ├── 003_seed_roles_categorias.sql
│   │   ├── 004_festivos_colombia_2025_2035.sql
│   │   └── 005_sesiones_refresh_e_idempotencia.sql  # Tablas #15 y #16 + 3 cols pedido
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js                   # TRUST_PROXY, COOKIE_SECURE, REFRESH_REPLAY_KEY, CORS_ORIGINS
│   │   │   └── db.js                    # Pool pg (UTC) + withTransaction (reintentos 40P01/40001)
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js
│   │   │   ├── csrf.middleware.js       # Origin + X-Requested-With: BikeStore -> 403 CSRF_ORIGEN_INVALIDO
│   │   │   ├── role.middleware.js
│   │   │   ├── validate.middleware.js   # Esquemas Zod estrictos
│   │   │   ├── rateLimit.middleware.js  # login/registro/recuperar/restablecer/refresh
│   │   │   └── error.middleware.js      # Normalización JSON + 503 CONFLICTO_CONCURRENCIA
│   │   ├── routes/                      # auth, perfil, catalogo, carrito, pedidos, retractos, admin
│   │   ├── controllers/                 # auth, perfil, catalogo, carrito, pedidos, retractos, admin
│   │   ├── services/                    # auth, perfil, catalogo, carrito, pedidos, retractos, admin
│   │   ├── utils/
│   │   │   ├── cookies.js               # Cookie HttpOnly bikestore_rt (Path=/api/auth, Max-Age=604800)
│   │   │   ├── refreshCrypto.js         # AEAD AES-256-GCM + HKDF-SHA256 para reemplazo_cifrado
│   │   │   ├── idempotency.js           # Validación UUID RFC 4122/9562
│   │   │   ├── imagenUrl.js             # Validación http(s), anti-SSRF y rechazo SVG
│   │   │   ├── password.js
│   │   │   ├── jwt.js
│   │   │   ├── documento.js
│   │   │   ├── decimal.js               # Aritmética entera en centavos
│   │   │   ├── festivos.js              # Cálculo días hábiles America/Bogota
│   │   │   └── mailer.js                # Nodemailer (SMTP_TRANSPORT=json|smtp, sin log de tokens)
│   │   ├── scripts/
│   │   │   ├── migrate.js               # Ejecuta 001..005 en orden
│   │   │   ├── seedAdmin.js             # Inserta ADMIN inicial usando SEED_ADMIN_* y bcrypt
│   │   │   └── checkFestivos.js         # Valida cobertura festivo_colombia
│   │   ├── jobs/
│   │   │   └── expiracionReservas.job.js # Expiración <= CURRENT_TIMESTAMP + purga lotes 15m
│   │   ├── app.js                       # Express (trust proxy, helmet, cors credentials)
│   │   └── server.js                    # Arranque HTTP, checkFestivos, job y SIGINT/SIGTERM
│   ├── tests/
│   │   ├── unit/                        # documento, decimal, festivos, refreshCrypto
│   │   └── integration/                 # auth, catalogo_carrito, pedidos_concurrencia, retractos,
│   │                                    # admin_reportes, sesiones_refresh, idempotencia_concurrencia
│   ├── .env.example
│   └── package.json
└── frontend/                            # Frontend (React 19 + Vite 8 + Vitest + vitest-axe)
    ├── docs/PLAN_FRONTEND_V1.md
    ├── public/{favicon.svg,robots.txt,sitemap.xml}
    ├── index.html                       # CSP estricto en build + Open Graph
    ├── vite.config.js                   # Proxy /api + CSP preamble solo dev
    ├── src/
    │   ├── api/client.js                # credentials:'include', X-Requested-With, refresh auto en 401
    │   ├── context/AuthContext.jsx      # Access JWT solo en memoria React + rehidratación silenciosa
    │   ├── hooks/useTituloPagina.js     # Title + description + OG + robots index/noindex
    │   ├── utils/refreshSync.js         # Web Locks + BroadcastChannel + UUIDv8 (bs_client_secret)
    │   └── ...                          # Páginas React.lazy + Suspense, LogoMarcaBS, estilos 60-30-10
    └── tests/                           # visitorCart, exportadores, ProductCard, documentosYCliente,
                                         # refreshSync, flujosCriticosUi, accesibilidad (vitest-axe)
```

### 3. Modelo de datos PostgreSQL actualizado (16 tablas exactas)

#### 3.1. Definición consolidada de las 11 tablas base actualizadas (`001_schema_inicial.sql` + `005`)
*(Incluye columnas completas clave, restricciones `CHECK`/`UNIQUE` y políticas `ON DELETE` para mantener paridad 1:1 entre SQL, DER y Diccionario de Datos).*

| Tabla | Definición actualizada (columnas, tipos, restricciones y `ON DELETE`) |
| :--- | :--- |
| **`rol`** | `id_rol SERIAL PRIMARY KEY`, `nombre VARCHAR(20) NOT NULL UNIQUE CHECK (nombre IN ('ADMIN', 'CLIENTE'))`, `descripcion VARCHAR(150) NULL`. *(Elimina `'VENDEDOR'`).* |
| **`usuario`** | `id_usuario SERIAL PRIMARY KEY`, `tipo_documento VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('CC', 'TI', 'CE', 'PASAPORTE', 'PPT'))`, `numero_documento VARCHAR(30) NOT NULL`, `nombre VARCHAR(100) NOT NULL`, `primer_apellido VARCHAR(100) NOT NULL`, `segundo_apellido VARCHAR(100) NULL`, `telefono VARCHAR(20) NOT NULL`, `correo VARCHAR(150) NOT NULL`, `contrasena_hash VARCHAR(255) NOT NULL`, `estado_usuario VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado_usuario IN ('ACTIVO', 'INACTIVO'))`, `token_version INTEGER NOT NULL DEFAULT 1 CHECK (token_version >= 1)`, `fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Reglas: `UNIQUE (tipo_documento, numero_documento)`, índice único `LOWER(correo)`. |
| **`usuario_rol`** | `id_usuario_rol SERIAL PRIMARY KEY`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE`, `id_rol INTEGER NOT NULL REFERENCES rol(id_rol) ON DELETE RESTRICT`, `asignado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL`, `fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. **Un único rol por usuario:** `UNIQUE (id_usuario)` y `UNIQUE (id_usuario, id_rol)`. |
| **`token_recuperacion`** | `id_token SERIAL PRIMARY KEY`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE`, `token_hash VARCHAR(64) NOT NULL UNIQUE`, `fecha_expiracion TIMESTAMPTZ NOT NULL`, `fecha_uso TIMESTAMPTZ NULL`, `fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Índice parcial sobre `id_usuario WHERE fecha_uso IS NULL`. |
| **`categoria`** | `id_categoria SERIAL PRIMARY KEY`, `nombre VARCHAR(100) NOT NULL UNIQUE`, `descripcion VARCHAR(255) NULL`, `estado BOOLEAN NOT NULL DEFAULT TRUE`, `fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| **`producto`** | `id_producto SERIAL PRIMARY KEY`, `id_categoria INTEGER NOT NULL REFERENCES categoria(id_categoria) ON DELETE RESTRICT`, `nombre VARCHAR(150) NOT NULL`, `descripcion TEXT NOT NULL`, `precio NUMERIC(12,2) NOT NULL CHECK (precio > 0)`, `existencias INTEGER NOT NULL CHECK (existencias >= 0)`, `imagen_url VARCHAR(500) NOT NULL`, `estado BOOLEAN NOT NULL DEFAULT TRUE`, `fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| **`carrito`** | `id_carrito SERIAL PRIMARY KEY`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE`, `estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'CONVERTIDO'))`, `fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Índice único parcial `UNIQUE (id_usuario) WHERE estado = 'ACTIVO'` (visitantes no usan BD). |
| **`detalle_carrito`** | `id_detalle_carrito SERIAL PRIMARY KEY`, `id_carrito INTEGER NOT NULL REFERENCES carrito(id_carrito) ON DELETE CASCADE`, `id_producto INTEGER NOT NULL REFERENCES producto(id_producto) ON DELETE RESTRICT`, `cantidad INTEGER NOT NULL CHECK (cantidad > 0)`, `precio_unidad NUMERIC(12,2) NOT NULL CHECK (precio_unidad > 0)`, `UNIQUE (id_carrito, id_producto)`. |
| **`pedido`** | `id_pedido SERIAL PRIMARY KEY`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT`, `direccion_envio VARCHAR(255) NOT NULL`, `total NUMERIC(12,2) NOT NULL CHECK (total > 0)`, `estado_pedido VARCHAR(20) NOT NULL CHECK (estado_pedido IN ('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO'))`, `fecha_pedido TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `fecha_expiracion TIMESTAMPTZ NOT NULL`, `fecha_envio TIMESTAMPTZ NULL`, `fecha_entrega TIMESTAMPTZ NULL`, `fecha_cancelacion TIMESTAMPTZ NULL`, `motivo_cancelacion TEXT NULL`, `cancelado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL`, `estado_reembolso_cancelacion VARCHAR(30) NOT NULL DEFAULT 'NO_APLICA' CHECK (estado_reembolso_cancelacion IN ('NO_APLICA', 'PENDIENTE_REEMBOLSO', 'REEMBOLSADO'))`, `datos_reembolso_cancelacion VARCHAR(500) NULL`, `fecha_limite_reembolso_cancelacion TIMESTAMPTZ NULL`, `fecha_reembolso_cancelacion TIMESTAMPTZ NULL`, **`clave_idempotencia_carrito UUID NULL`**, **`fecha_devolucion_carrito TIMESTAMPTZ NULL`**, **`resultado_devolucion_carrito JSONB NULL`** *(añadidas en migración `005`)*. Reglas: `UNIQUE (id_usuario) WHERE estado_pedido = 'PENDIENTE'`, índice único parcial `uq_pedido_usuario_idem_carrito ON pedido (id_usuario, clave_idempotencia_carrito) WHERE clave_idempotencia_carrito IS NOT NULL`, `CHECK` temporales por estado y **`chk_pedido_devolucion_carrito_consistente`** (todo-o-nada: los 3 campos de devolución al carrito todos `NULL`, o todos `NOT NULL` junto a `estado_pedido = 'CANCELADO'`, `fecha_cancelacion IS NOT NULL` y `jsonb_typeof(resultado_devolucion_carrito) = 'object'`). |
| **`detalle_pedido`** | `id_detalle_pedido SERIAL PRIMARY KEY`, `id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT`, `id_producto INTEGER NOT NULL REFERENCES producto(id_producto) ON DELETE RESTRICT`, `cantidad INTEGER NOT NULL CHECK (cantidad > 0)`, `precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario > 0)`, `UNIQUE (id_pedido, id_producto)`. |
| **`pago`** | `id_pago SERIAL PRIMARY KEY`, `id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT`, `metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('TARJETA', 'PSE', 'TRANSFERENCIA'))`, `referencia_simulada VARCHAR(40) NOT NULL`, `numero_intento INTEGER NOT NULL CHECK (numero_intento > 0)`, `monto NUMERIC(12,2) NOT NULL CHECK (monto > 0)`, `estado_pago VARCHAR(20) NOT NULL CHECK (estado_pago IN ('APROBADO', 'RECHAZADO', 'REEMBOLSADO'))` *(donde `'REEMBOLSADO'` aplica **exclusivamente** cuando el 100 % del pedido fue efectivamente reembolsado —por cancelación pre-envío o retracto total acumulado—; mientras haya reembolso en trámite o solo devolución parcial, `pago.estado_pago` permanece `'APROBADO'`)*, `clave_idempotencia VARCHAR(100) NULL`, `payload_hash VARCHAR(64) NULL`, `motivo_resultado VARCHAR(255) NULL`, `fecha_pago TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Índices únicos: `UNIQUE (id_pedido) WHERE estado_pago IN ('APROBADO', 'REEMBOLSADO')`, `UNIQUE (id_pedido, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL`, `UNIQUE (id_pedido, numero_intento)`. |

#### 3.2. Cinco tablas adicionales de v1 (`001` y `005_sesiones_refresh_e_idempotencia.sql`)
1. **`retracto`** *(Tabla #12)*: `id_retracto SERIAL PRIMARY KEY`, `id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT`, `tipo_retracto VARCHAR(20) NOT NULL CHECK (tipo_retracto IN ('TOTAL', 'PARCIAL'))` *(derivado/verificado en servidor)*, `motivo VARCHAR(500) NOT NULL`, `datos_reembolso VARCHAR(500) NOT NULL` *(sin PAN/CVV completos)*, `estado_retracto VARCHAR(30) NOT NULL CHECK (estado_retracto IN ('SOLICITADO', 'APROBADO_RECEPCION', 'COMPLETADO', 'RECHAZADO'))`, `estado_reembolso VARCHAR(30) NOT NULL CHECK (estado_reembolso IN ('PENDIENTE_REEMBOLSO', 'REEMBOLSADO', 'NO_APLICA'))`, `monto_reembolso NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_reembolso >= 0)` *(calculado inicialmente sobre unidades solicitadas y ajustado tras inspección únicamente por `cantidad_buen_estado`; si es `0`, `estado_reembolso = 'NO_APLICA'` y `estado_retracto = 'RECHAZADO'`)*, `fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `fecha_limite_reembolso TIMESTAMPTZ NULL` *(obligatoria cuando `estado_reembolso <> 'NO_APLICA'`)*, `fecha_recepcion_fisica TIMESTAMPTZ NULL`, `fecha_reembolso TIMESTAMPTZ NULL`, `revisado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL`, `observacion_admin VARCHAR(500) NULL`.
2. **`detalle_retracto`** *(Tabla #13)*: `id_detalle_retracto SERIAL PRIMARY KEY`, `id_retracto INTEGER NOT NULL REFERENCES retracto(id_retracto) ON DELETE CASCADE`, `id_detalle_pedido INTEGER NOT NULL REFERENCES detalle_pedido(id_detalle_pedido) ON DELETE RESTRICT`, `cantidad_devuelta INTEGER NOT NULL CHECK (cantidad_devuelta > 0)`, `cantidad_buen_estado INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_buen_estado >= 0)`, `cantidad_danada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_danada >= 0)`, `subtotal_reembolso NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_reembolso >= 0)`, `estado_inspeccion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_inspeccion IN ('PENDIENTE', 'BUEN_ESTADO', 'PARCIAL', 'DANADO'))`, `observacion_inspeccion VARCHAR(300) NULL`, `UNIQUE (id_retracto, id_detalle_pedido)`, `CHECK (estado_inspeccion = 'PENDIENTE' OR (cantidad_buen_estado + cantidad_danada = cantidad_devuelta))`. *Control de integridad contra doble devolución:* al crear solicitud se bloquea `detalle_pedido ORDER BY id_producto ASC FOR UPDATE` y se valida `SUM(cantidad_devuelta de retractos donde estado_retracto <> 'RECHAZADO' OR fecha_recepcion_fisica IS NOT NULL) + nueva_cantidad <= detalle_pedido.cantidad`; así, toda unidad que ya fue **rechazada tras inspección física por daño** sigue consumiendo el cupo y no puede volver a solicitarse.
3. **`festivo_colombia`** *(Tabla #14)*: `fecha DATE PRIMARY KEY`, `anio INTEGER NOT NULL`, `nombre VARCHAR(120) NOT NULL`, `CHECK (anio = EXTRACT(YEAR FROM fecha))`.
4. **`sesion_refresh`** *(Tabla #15 — Migración `005`)*: `id_sesion SERIAL PRIMARY KEY`, `rotacion_uid UUID NOT NULL DEFAULT gen_random_uuid()` (`UNIQUE uq_sesion_refresh_rotacion_uid`), `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE`, `token_hash VARCHAR(64) NOT NULL` (`UNIQUE uq_sesion_refresh_token_hash`), `familia_id UUID NOT NULL`, `reemplazado_por_hash VARCHAR(64) NULL`, `rotacion_idem_hash VARCHAR(64) NULL`, `reemplazo_cifrado TEXT NULL`, `reemplazo_expira_en TIMESTAMPTZ NULL`, `fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `fecha_expiracion TIMESTAMPTZ NOT NULL`, `ultimo_uso_at TIMESTAMPTZ NULL`, `fecha_revocacion TIMESTAMPTZ NULL`, `motivo_revocacion VARCHAR(40) NULL`, `ip_origen VARCHAR(64) NULL`, `user_agent VARCHAR(255) NULL`.
   * *Restricciones `CHECK`:* `chk_sesion_refresh_fechas` (`fecha_expiracion > fecha_creacion`), `chk_sesion_refresh_revocacion_consistente` (nulabilidad pareja entre `fecha_revocacion` y `motivo_revocacion`), `chk_sesion_refresh_motivo` (`IN ('ROTACION','REUSO_DETECTADO','LOGOUT_GLOBAL','CAMBIO_PASSWORD','RESET_PASSWORD','EXPIRACION','ADMIN_INACTIVACION')`), `chk_sesion_refresh_rotacion_consistente` (`motivo_revocacion IS DISTINCT FROM 'ROTACION' OR (reemplazado_por_hash IS NOT NULL AND rotacion_idem_hash IS NOT NULL)`), y `chk_sesion_refresh_reemplazo_cifrado` (si hay `reemplazo_cifrado` exige `reemplazo_expira_en > fecha_revocacion`, `motivo_revocacion = 'ROTACION'`, `reemplazado_por_hash` y `rotacion_idem_hash` no nulos).
5. **`carrito_fusion_idempotencia`** *(Tabla #16 — Migración `005`)*: `id_fusion SERIAL PRIMARY KEY`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE`, `id_carrito INTEGER NULL REFERENCES carrito(id_carrito) ON DELETE SET NULL`, `clave_idempotencia UUID NOT NULL`, `payload_hash VARCHAR(64) NOT NULL`, `resultado_json JSONB NOT NULL`, `fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `CONSTRAINT uq_carrito_fusion_usuario_clave UNIQUE (id_usuario, clave_idempotencia)`, `CONSTRAINT chk_carrito_fusion_resultado_objeto CHECK (jsonb_typeof(resultado_json) = 'object')`. Retención garantizada de **30 días** antes de purga por lotes.

#### 3.3. Índices de rendimiento, índices parciales y regla de reportes netos (`002` y `005`)
* Índices base (`002`): `ux_usuario_correo_lower ON usuario (LOWER(correo))`, `idx_token_recuperacion_activo ON token_recuperacion (id_usuario) WHERE fecha_uso IS NULL`, `ux_carrito_usuario_activo ON carrito (id_usuario) WHERE estado = 'ACTIVO'`, `ux_pedido_usuario_pendiente ON pedido (id_usuario) WHERE estado_pedido = 'PENDIENTE'`, `ux_pago_pedido_aprobado ON pago (id_pedido) WHERE estado_pago IN ('APROBADO','REEMBOLSADO')`, `ux_pago_pedido_idempotencia ON pago (id_pedido, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL`, `idx_producto_catalogo ON producto (estado, id_categoria, precio)`, `idx_pedido_usuario_fecha ON pedido (id_usuario, fecha_pedido DESC)`, `idx_pedido_pendiente_expiracion ON pedido (fecha_expiracion) WHERE estado_pedido = 'PENDIENTE'`, `idx_pago_fecha ON pago (fecha_pago)` y `idx_retracto_estado ON retracto (estado_retracto, fecha_solicitud DESC)`.
* Índices añadidos en `005_sesiones_refresh_e_idempotencia.sql`:
  * En `sesion_refresh`: `uq_sesion_refresh_familia_activa UNIQUE (familia_id) WHERE fecha_revocacion IS NULL`, `idx_sesion_refresh_usuario_activas (id_usuario) WHERE fecha_revocacion IS NULL`, `idx_sesion_refresh_familia (familia_id)`, `idx_sesion_refresh_reemplazo_expira (reemplazo_expira_en) WHERE reemplazo_cifrado IS NOT NULL`, `idx_sesion_refresh_purga (fecha_expiracion, fecha_revocacion)`.
  * En `carrito_fusion_idempotencia`: `idx_carrito_fusion_idem_purga (fecha_creacion)`.
  * En `pedido`: `uq_pedido_usuario_idem_carrito UNIQUE (id_usuario, clave_idempotencia_carrito) WHERE clave_idempotencia_carrito IS NOT NULL`.
* **Métrica oficial en `/api/admin/reportes/*` (en `America/Bogota`):**
  * **Ventas brutas aprobadas:** suma de `pago.monto` de pedidos con pago en `'APROBADO'` o `'REEMBOLSADO'`.
  * **Reembolsos efectivos:** suma de `pedido.total` donde `pedido.estado_reembolso_cancelacion = 'REEMBOLSADO'` + suma de `retracto.monto_reembolso` donde `retracto.estado_reembolso = 'REEMBOLSADO'`.
  * **Ventas netas:** `Ventas brutas aprobadas − Reembolsos efectivos` *(descontando únicamente los importes efectivamente reembolsados; las solicitudes en `'PENDIENTE_REEMBOLSO'` de cancelaciones o retractos se muestran en indicador informativo separado de compromisos pendientes sin descontarse aún de ventas netas ni sobreescribir el histórico de pagos)*.

---

### 4. Mecanismos críticos de transacción, seguridad y operación

#### 4.1. Simulación síncrona de pago (`1:N`) en transacción atómica única
* **Secuencia obligatoria (`withTransaction` en `BEGIN ... COMMIT`):**
  1. Bloquea `pedido` (`SELECT ... FROM pedido WHERE id_pedido = $1 AND id_usuario = $2 FOR UPDATE`).
  2. Si llega cabecera `Idempotency-Key`, consulta `pago` para `(id_pedido, clave_idempotencia)`: si existe y `payload_hash` coincide, devuelve la respuesta previa sin nuevo cobro; si el `payload_hash` difiere, responde `HTTP 409 IDEMPOTENCY_CONFLICT`.
  3. Verifica `estado_pedido = 'PENDIENTE'` y ausencia de pago `'APROBADO'`. Si `NOW() > fecha_expiracion`, ejecuta en esa misma transacción el helper idempotente de expiración (`CANCELADO` + restitución de stock), hace `COMMIT` y retorna **`HTTP 409 RESERVA_EXPIRADA`**.
  4. El **backend determina el resultado del simulador** de forma determinista sobre `{ metodo_pago, referencia_simulada }` (el esquema Zod rechaza cualquier campo cliente de estado/resultado): si `referencia_simulada` termina en `'00'`, registra `'RECHAZADO'` con motivo simulado y mantiene `pedido` en `'PENDIENTE'`; en otro caso válido registra `'APROBADO'` y actualiza `pedido.estado_pedido = 'PAGADO'`. Calcula `numero_intento = COALESCE(MAX(numero_intento), 0) + 1`, inserta fila en `pago` y ejecuta `COMMIT`.

#### 4.2. Jerarquía de bloqueos unificada, `40P01`/`40001`, checkout, `volver-al-carrito` y purga
* **Jerarquía estricta y reintentos transaccionales (`db.js`):** Todo flujo transaccional bloquea en orden ascendente determinista para prevenir *deadlocks*, usando **`FOR NO KEY UPDATE OF p`** sobre `producto` cuando solo se ajustan `existencias`:
  * **Orden maestro:** `usuario (FOR UPDATE)` → `carrito (FOR UPDATE)` → `detalle_carrito (ORDER BY id_producto ASC FOR UPDATE)` → `pedido (FOR UPDATE)` → `detalle_pedido (ORDER BY id_producto ASC FOR UPDATE)` → `retracto` → `pago` → `producto (ORDER BY id_producto ASC FOR NO KEY UPDATE OF p)`.
  * **Flujos unificados:** `restablecerContrasena` (`usuario → token_recuperacion → sesion_refresh`), `cambiarEstadoUsuario`/`cambiarRolUsuario` (`ORDER BY u.id_usuario ASC FOR UPDATE OF u` sobre objetivo y administradores activos), `confirmarReembolsoRetractoAdmin` (`pedido → retracto → pago`), `solicitarRetracto` (`detalle_pedido ORDER BY id_producto ASC FOR UPDATE`), `agregarItemCarrito` (`usuario FOR UPDATE` antes de `ensureCarritoActivoLocked`).
  * **Reintentos `40P01` / `40001` (`withTransaction`):** Hasta `maxRetries = 3` reintentos tras `ROLLBACK` con *backoff* exponencial + *jitter* (prohibido ejecutar efectos externos dentro de `withTransaction`); si agota reintentos responde **`503 CONFLICTO_CONCURRENCIA`**.
* **Checkout (`POST /api/pedidos`):** Si el cliente posee un pedido `'PENDIENTE'` ya vencido, se expira en una **pre-transacción** antes de abrir la transacción principal (evita `ROLLBACK` al responder `409` y bloqueos cruzados de productos). Luego bloquea `carrito FOR UPDATE`, valida ítems activos y precios (`detalle_carrito.precio_unidad = producto.precio`: ante diferencia actualiza el carrito y responde **`HTTP 409 PRECIO_ACTUALIZADO`**), bloquea productos en `ORDER BY id_producto ASC FOR NO KEY UPDATE OF p`, verifica y descuenta existencias, crea `pedido` + `detalle_pedido` y marca `carrito = 'CONVERTIDO'`.
* **Fusión idempotente (`POST /api/carrito/fusionar` — `B1`):** Exige cabecera `Idempotency-Key` en formato UUID RFC 4122/9562. Bloquea `usuario FOR UPDATE` → `carrito_fusion_idempotencia FOR UPDATE` **antes** de crear o tocar `carrito`. Si existe con mismo `payload_hash`, responde `200` con `{ ...resultado_json, replayed: true }` (incluso si el carrito original fue eliminado luego gracias a `id_carrito NULL ON DELETE SET NULL`); si difiere el payload responde `409 IDEMPOTENCY_CONFLICT`. Retención garantizada de **30 días** (*advertencia:* tras purgarse registros `> 30 días`, reenviar la misma clave se procesará como operación nueva).
* **Devolución en 2 fases sin rollback (`POST /api/pedidos/:id/volver-al-carrito` — Opción recomendada `B1`):** Exige `Idempotency-Key` UUID RFC 4122/9562. **Fase A (`tx1`)**: bloquea `usuario FOR UPDATE` → `pedido FOR UPDATE`, valida `404` / conflicto con otro pedido (`409 IDEMPOTENCY_CONFLICT`) / replay exacto sin tocar carrito / orden ya devuelta con otra clave (`409`) / si está `'PENDIENTE'` vencido (`fecha_expiracion <= CURRENT_TIMESTAMP`) lo expira a `'CANCELADO'` restituyendo inventario con **`COMMIT`** (sin rollback) / si otro estado distinto de `'CANCELADO'` retorna `409 TRANSICION_ESTADO_INVALIDA`. **Fase B (`tx2`, solo si fusiona)**: bloquea `usuario` → `carrito` → `detalle_carrito ASC` → `pedido` → `detalle_pedido ASC` → `producto ASC FOR NO KEY UPDATE OF p`, fusiona disponibles y registra `clave_idempotencia_carrito`, `fecha_devolucion_carrito` y `resultado_devolucion_carrito` en `pedido`, respondiendo `200 OK` con `ajustes[]`.
* **Job periódico y purga por lotes (`expiracionReservas.job.js`):** Unifica vencimiento a `fecha_expiracion <= CURRENT_TIMESTAMP`, selecciona lotes `LIMIT 20 FOR UPDATE SKIP LOCKED`, bloquea `detalle_pedido ASC FOR UPDATE` y `producto ASC FOR NO KEY UPDATE`, y ejecuta `purgarRegistrosExpiradosLote()` (`LIMIT 100 SKIP LOCKED`: limpia `reemplazo_cifrado` vencido, purga `sesion_refresh` con `> fecha_expiracion + 24h` o `> 30d` si `REUSO_DETECTADO`, y purga `carrito_fusion_idempotencia > 30d`) oportunistamente cada `15 minutos` tras login o tick del job.

#### 4.3. Autenticación A1 (`sesion_refresh` + `token_version`), CSRF, rol único, recuperación `CU-06` y endurecimiento
* **Access JWT `HS256` (`15m`, `expires_in: 900`) + Refresh Cookie `HttpOnly` (`bikestore_rt`):**
  * `POST /api/auth/login` fija cookie `bikestore_rt` (`Path=/api/auth`, `Max-Age=604800`, `HttpOnly`, `SameSite=Lax`, `Secure=env.COOKIE_SECURE`) creando nueva familia en `sesion_refresh` (`fecha_expiracion = +7 días` absoluto) y retorna `{ ok: true, datos: { token, expires_in: 900, rotacion_uid, usuario } }`.
  * `POST /api/auth/refresh` exige *rate limiting* (`refreshLimiter`), CSRF (`Origin` en `CORS_ORIGINS` **y** `X-Requested-With: BikeStore` → `403 CSRF_ORIGEN_INVALIDO`), cookie `bikestore_rt` y cabecera `Idempotency-Key` UUID RFC 4122/9562 obligatoria. Bloquea `usuario (FOR UPDATE OF u)` → `sesion_refresh (ORDER BY id_sesion ASC FOR UPDATE)`.
  * **Rotación y ventana de replay AEAD de `30 s`:** Al rotar `T1 → T2`, limpia `reemplazo_cifrado` de otras filas de la familia, cifra `T2` en `reemplazo_cifrado` (`AES-256-GCM` + `HKDF-SHA256` con `REFRESH_REPLAY_KEY`, salt `parentTokenHash`, info `idempotencyKey`, AAD `${idUsuario}|${familiaId}|${parentTokenHash}|${sha256Hex(idempotencyKey)}`) con `reemplazo_expira_en = +30s`, marca `T1` (`ROTACION`, `reemplazado_por_hash`, `rotacion_idem_hash`, `ultimo_uso_at`) e inserta `T2` heredando `familia_id` y `fecha_expiracion` exacta de `T1`. Si llega un reintento sobre `T1` ya revocado, **solo** reproduce el mismo `T2` (`replayed: true`) cuando se cumplen las **5 condiciones**: (1) `motivo_revocacion === 'ROTACION'`, (2) `rotacion_idem_hash === hash(K1)`, (3) `reemplazo_cifrado !== null && NOW() <= reemplazo_expira_en`, (4) `fecha_expiracion > NOW()`, y (5) la fila hija `T2` tiene `fecha_revocacion IS NULL AND ultimo_uso_at IS NULL`. En cualquier otro caso revoca toda la familia activa con `REUSO_DETECTADO`, limpia `reemplazo_cifrado`, borra la cookie y responde `401 SESION_REVOCADA` *(nunca se valida ni perdona el reúso mediante `ip_origen` o `user_agent`, que son estrictamente de auditoría)*. Si expiró responde `401 SESION_EXPIRADA`.
  * **Nota explícita de modelo de amenaza:** La cabecera `Idempotency-Key` demuestra únicamente **correlación de operación** para reintentos seguros ante caídas de red o carreras en la ventana de `30 s`; **no** constituye prueba de identidad criptográfica del cliente (la posesión de la credencial recae en la cookie `HttpOnly` `bikestore_rt` + verificación `Origin` + `X-Requested-With`).
  * **Revocación global:** `POST /api/auth/logout` (CSRF si viene cookie; acepta `Bearer` o cookie `bikestore_rt`), `restablecerContrasena`, `cambiarContrasena`, `cambiarEstadoUsuario` (cuando `INACTIVO`) y `cambiarRolUsuario` incrementan `usuario.token_version + 1` **y** revocan todas las filas activas en `sesion_refresh` limpiando `reemplazo_cifrado`. El middleware `auth` valida en PostgreSQL `estado_usuario = 'ACTIVO'`, `token_version = tv` y rol vigente.
* **Protección del último `ADMIN` (`RF-28`):** Tanto `PATCH /api/admin/usuarios/:id/estado` como `PATCH /api/admin/usuarios/:id/rol` bloquean filas (`ORDER BY u.id_usuario ASC FOR UPDATE OF u`) sobre objetivo + administradores y rechazan con **`HTTP 409 ULTIMO_ADMIN_ACTIVO`** si quedarían `< 1` administradores `'ACTIVO'`.
* **Login, recuperación `CU-06` y endurecimiento (`imagenUrl.js`, `env.js`, `app.js`):**
  * Contraseña mínima `8` caracteres, `bcrypt` (`BCRYPT_ROUNDS >= 10`); `POST /api/auth/login` ejecuta `bcrypt.compare` contra hash ficticio cuando el correo no existe.
  * `POST /api/auth/recuperar` aplica *rate limiting*, invalida tokens previos sin usar, registra `token_hash` (`SHA-256`, TTL `60m`), ejecuta `COMMIT`, **retorna `HTTP 200` neutro inmediatamente** y despacha `Nodemailer` (`SMTP_TRANSPORT=json|smtp`, timeout `5 s`, exigiendo credenciales en producción con `smtp`, aplicando `escapeHtml` sobre `nombre`/`resetUrl` en el HTML y **sin imprimir nunca tokens ni URLs de reset en logs**). `POST /api/auth/restablecer` exige `'ACTIVO'` y revoca `token_version` + `sesion_refresh`.
  * `validate.middleware.js` (`Zod`) aplica *allowlists* estrictas, JSON máximo `100kb`, escape de `%` y `_` en `ILIKE`, bloqueo de PAN/CVV en `datos_reembolso*`. `utils/imagenUrl.js` valida `imagen_url` exigiendo `http://`/`https://` sin credenciales embebidas, rechazando hosts locales/privados/metadatos (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `::ffff:0:0/96`, NAT64 `64:ff9b::/96` y `64:ff9b:1::/48`, multicast/discard, `*.local`, `*.internal`) y **rechazando SVG** con doble decodificación (`deepDecode`) sobre ruta, hash y parámetros de consulta (`.svg`, `.svgz`, extensiones intermedias `.svg.png`, `image/svg`, parámetros `format`/`fm`/`ext`/`output`/`file`/`download`...). `app.js` configura `app.set('trust proxy', env.TRUST_PROXY)`, `helmet()` y `cors({ origin: env.CORS_ORIGINS, credentials: true })`.
* **Variables de entorno de seguridad clave:** `TRUST_PROXY` (`false` por defecto; `true`/`false`/entero/string), `COOKIE_SECURE` (`true` en producción salvo `false` explícito), `CORS_ORIGIN` (lista separada por comas parseada a `CORS_ORIGINS`), `REFRESH_REPLAY_KEY` (**obligatoria** `>= 32` chars y distinta de `JWT_SECRET` en producción; en dev/test derivada por `HKDF-SHA256` si se omite) y `SMTP_TRANSPORT=json|smtp`.

#### 4.4. Gobierno de `festivo_colombia` (`2025–2035`) y 5 días hábiles
* **Cálculo exacto en `America/Bogota`:** Convierte `fecha_entrega` a fecha local en `America/Bogota` y avanza día por día excluyendo sábados, domingos y festivos hasta completar **5 días hábiles**; la solicitud procede mientras `NOW() < (dia_habil_5 + 1 day) AT TIME ZONE 'America/Bogota'` (cubriendo hasta el último microsegundo del 5.º día hábil).
* **Semilla y verificación:** `004_festivos_colombia_2025_2035.sql` carga 2025–2035 con `ON CONFLICT (fecha) DO NOTHING`. Al iniciar `server.js` (y vía `npm run check:festivos`), si el año actual tiene `< 12` festivos registrados **aborta el arranque (*fail-fast*)**; si falta el año siguiente (`< 12` festivos), emite alerta explícita `WARN`. Antes de cada cálculo legal, valida cobertura de los `20 días` calendario posteriores a `fecha_entrega` (margen conservador para cubrir 5 días hábiles incluso con puentes y fines de semana consecutivos), respondiendo **`HTTP 500 CALENDARIO_FESTIVOS_INCOMPLETO`** si faltara un año fuera de rango.

#### 4.5. Superficie cerrada de contratos REST (`/api/...`)

**Validación sintáctica inicial de `numero_documento` (normalizando `trim().toUpperCase()`, sin implicar verificación oficial estatal):**
`CC`: `^[0-9]{6,10}$` | `TI`: `^[0-9]{10,11}$` | `CE`: `^[A-Za-z0-9]{6,10}$` | `PASAPORTE`: `^[A-Za-z0-9]{5,20}$` | `PPT`: `^[0-9]{6,15}$`.

| Dominio | Método y ruta exacta | Acceso | Parámetros / Contrato clave |
| :--- | :--- | :--- | :--- |
| **Sistema** | `GET /api/health` | Público | `HTTP 200` `{ ok: true, datos: { estado: 'UP', bd: true } }`. |
| **Auth** | `POST /api/auth/registro`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/recuperar`, `POST /api/auth/restablecer` | Público / Cookie / Auth | `rateLimit` en públicos y `/refresh`; `/login` fija cookie `bikestore_rt` y retorna `{ token, expires_in: 900, rotacion_uid, usuario }`; `/refresh` exige `Origin` + `X-Requested-With: BikeStore` + UUID `Idempotency-Key`; `/logout` acepta Bearer o cookie (CSRF si hay cookie) y revoca `token_version` + `sesion_refresh`. |
| **Perfil** | `GET /api/perfil`, `PUT /api/perfil`, `PATCH /api/perfil/contrasena` | Auth | `PUT` edita nombre/apellidos/teléfono únicamente; `PATCH` verifica contraseña actual, incrementa `token_version` y revoca `sesion_refresh`. |
| **Catálogo** | `GET /api/categorias`, `GET /api/productos`, `GET /api/productos/:id` | Público | `/productos`: `?id_categoria=&q=&orden_precio=asc\|desc&page=1&limit=12` (máx `50`), oculta inactivos de producto o categoría. |
| **Carrito** | `GET /api/carrito`, `POST /api/carrito/fusionar`, `POST /api/carrito/items`, `PATCH /api/carrito/items/:id_producto`, `DELETE /api/carrito/items/:id_producto` | `CLIENTE` | `POST /fusionar` **exige** `Idempotency-Key` UUID RFC 4122/9562 (retención `30d` en `carrito_fusion_idempotencia`) y retorna carrito + `ajustes[]` + `replayed`. |
| **Pedidos y pagos** | `POST /api/pedidos`, `GET /api/pedidos`, `GET /api/pedidos/:id`, `POST /api/pedidos/:id/pagos`, `POST /api/pedidos/:id/cancelar`, `POST /api/pedidos/:id/volver-al-carrito` | `CLIENTE` | Paginación `?page=1&limit=10`; `/pagos` recibe `{ metodo_pago, referencia_simulada }` + `Idempotency-Key`; `/volver-al-carrito` **exige** `Idempotency-Key` UUID y opera en 2 fases sin rollback (expira vencido en Fase A con `COMMIT` y devuelve al carrito en Fase B con `200`). |
| **Retracto** | `POST /api/pedidos/:id/retractos`, `GET /api/retractos`, `GET /api/retractos/:id` | `CLIENTE` | `POST` recibe `{ motivo, datos_reembolso, items: [{ id_detalle_pedido, cantidad }] }`. |
| **Admin Catálogo** | `GET/POST/DELETE /api/admin/categorias`, `PUT /api/admin/categorias/:id`, `PATCH /api/admin/categorias/:id/estado`; `GET/POST /api/admin/productos`, `PUT /api/admin/productos/:id`, `PATCH /api/admin/productos/:id/estado`, `PATCH /api/admin/productos/:id/existencias` | `ADMIN` | `DELETE /categorias/:id` protegido con `409 CATEGORIA_CON_PRODUCTOS`; `imagen_url` rechaza SVG y hosts locales/SSRF; `PUT /productos/:id` no modifica `existencias`. |
| **Admin Usuarios** | `GET /api/admin/usuarios`, `PATCH /api/admin/usuarios/:id/estado`, `PATCH /api/admin/usuarios/:id/rol` | `ADMIN` | `?page=1&limit=20`; ambos `PATCH` protegen último `ADMIN` activo (`409 ULTIMO_ADMIN_ACTIVO`), incrementan `token_version` y revocan `sesion_refresh`. |
| **Admin Pedidos y Retractos** | `GET /api/admin/pedidos`, `GET /api/admin/pedidos/:id`, `PATCH /api/admin/pedidos/:id/estado`, `PATCH /api/admin/pedidos/:id/reembolso`; `GET /api/admin/retractos`, `GET /api/admin/retractos/:id`, `PATCH /api/admin/retractos/:id/decision`, `PATCH /api/admin/retractos/:id/recepcion`, `PATCH /api/admin/retractos/:id/reembolso` | `ADMIN` | `GET /pedidos/:id` retorna cabecera + cliente + `detalles[]` + `pagos[]`; `/pedidos/:id/estado` gestiona `ENVIADO`/`ENTREGADO`/`CANCELADO`; `/retractos/:id/*` decisión, inspección física por cantidad y reembolso. |
| **Reportes** | `GET /api/admin/reportes/resumen`, `GET /api/admin/reportes/ventas` | `ADMIN` | `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=` en `America/Bogota`; máx `90 días` y `5000 filas`; calcula ventas netas descontando reembolsos efectivos. |

**Catálogo cerrado de códigos HTTP y `codigo` de dominio:** `200`, `201`, `400 VALIDACION_INVALIDA` / `RANGO_REPORTES_EXCEDIDO`, `401 TOKEN_INVALIDO` / `CREDENCIALES_INVALIDAS` / `SESION_REVOCADA` / `SESION_EXPIRADA`, `403 ROL_NO_AUTORIZADO` / `USUARIO_INACTIVO` / `CSRF_ORIGEN_INVALIDO`, `404 RECURSO_NO_ENCONTRADO`, `409 CORREO_DUPLICADO` / `DOCUMENTO_DUPLICADO` / `STOCK_INSUFICIENTE` / `PRECIO_ACTUALIZADO` / `PEDIDO_PENDIENTE_ACTIVO` / `RESERVA_EXPIRADA` / `PEDIDO_YA_PAGADO` / `IDEMPOTENCY_CONFLICT` / `TRANSICION_ESTADO_INVALIDA` / `PLAZO_RETRACTO_VENCIDO` / `CANTIDAD_RETRACTO_EXCEDIDA` / `ULTIMO_ADMIN_ACTIVO` / `CATEGORIA_CON_PRODUCTOS`, `429 RATE_LIMIT_EXCEDIDO`, `500 CALENDARIO_FESTIVOS_INCOMPLETO` / `ERROR_INTERNO`, `503 CONFLICTO_CONCURRENCIA`.

---

## Alternatives Considered

Cada alternativa descartada sintetiza las decisiones técnicas de [concepts_brief.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/concepts_brief.md) y de la revisión arquitectónica (`ALT-01` a `ALT-18`), evaluadas estrictamente por criterios técnicos y de alcance:

### Tema 1: Flujo documental, motor de datos y acceso SQL
* **`ALT-01` — Congelar `MER`/`DER` y Diccionario antes de actualizar `HU` y `CU`:** Cualquier regla surgida al detallar `HU`/`CU` obligaría a reabrir el esquema relacional y los scripts SQL. Descartada frente al flujo `Respaldo → HU + CU → Auditoría → MER + DER + Diccionario → Arquitectura → Backend → Frontend`.
* **`ALT-02` — Mantener `MySQL` (heredado del diagrama SVG inicial):** Carece de índices únicos parciales declarativos nativos (`WHERE estado_pago IN (...)`) y de la sintaxis `TIMESTAMPTZ` / `SKIP LOCKED` aprovechada en PostgreSQL.
* **`ALT-03` — Adoptar un ORM (`Prisma` o `Sequelize`) en lugar de `pg` directo (`db.js`):** Oculta el control explícito sobre bloqueos ordenados `ORDER BY id_producto ASC FOR NO KEY UPDATE OF p` / `FOR UPDATE`, reintentos ante `40P01`/`40001` y añade generación opaca de migraciones sobre un esquema de 16 tablas. Reconsiderable solo si el proyecto migrara a TypeScript con modelos extensos.

### Tema 2: Modelo de pagos, inventario y reservas
* **`ALT-04` — Relación `1:1` sobrescrita (`UPSERT`) en `pago` tras intentos `'RECHAZADO'`:** Destruiría el historial auditable de intentos fallidos dentro de la ventana de 15 minutos; la relación `1:N` con índice único parcial conserva trazabilidad completa.
* **`ALT-05` — Simulación asíncrona en dos micro-transacciones con `'PENDIENTE'` intermedio:** Crearía riesgo de intentos huérfanos en BD ante caídas locales sin existir pasarela externa asíncrona. Reconsiderable en v2 al integrar pasarela bancaria real con *webhooks*.
* **`ALT-06` — Descontar `producto.existencias` únicamente al aprobarse el pago:** Permitiría que dos usuarios avancen concurrentemente hacia pago por la última unidad provocando errores al capturar cobro.
* **`ALT-07` — Expiración de 15 minutos solo con `setTimeout` en Node.js:** Se pierde ante reinicios del proceso dejando stock bloqueado; `fecha_expiracion` en PostgreSQL más expiración híbrida idempotente persiste ante fallos.
* **`ALT-08` — Introducir `Redis + BullMQ` para reservas y sesiones:** Añade infraestructura distribuida externa innecesaria en un servidor único `localhost` v1; PostgreSQL cubre concurrencia y revocación bajo el volumen esperado de la entrega local. Reconsiderable si escala a múltiples réplicas con alto tráfico.
* **`ALT-09` — Re-agregar automáticamente ítems expirados al carrito:** Alteraría el carrito sin consentimiento ocultando variaciones de stock y precio; la acción explícita `volver-al-carrito` informa `ajustes[]`.

### Tema 3: Identidad, documentos, sesiones y recuperación
* **`ALT-10` — JWT *stateless*, Access+Refresh Token simple sin familia/replay, o tabla heredada `token_revocacion`:** JWT puro *stateless* impide revocar sesiones al cerrar sesión (`CU-12`/`HU-10`) o inactivar cuentas (`HU-09`); guardar JWT en `sessionStorage` expondría el token ante XSS. La arquitectura evolucionó a **Access JWT (`15m`) solo en memoria React + cookie `HttpOnly` `bikestore_rt` rotatoria de un solo uso (`sesion_refresh`, Tabla #15)** con ventana de replay AEAD de `30 s` (`reemplazo_cifrado`), coordinación multi-pestaña sin mutex en `localStorage` (`Web Locks API` + `BroadcastChannel` + UUIDv8) y revocación global inmediata vía `usuario.token_version` + revocación de `sesion_refresh`. Se sigue descartando `token_revocacion` redundante o consola selectiva por dispositivo.
* **`ALT-11` — Incluir `NIT` y personas jurídicas o estado `'BLOQUEADO'` desde v1:** Añaden reglas fiscales (dígito de verificación, razón social) o flujos de desbloqueo ausentes en `HU`/`CU`; `NIT` queda como ampliación futura y `estado_usuario` conserva `('ACTIVO', 'INACTIVO')`.
* **`ALT-12` — Devolver token de recuperación en API o revelar correo inexistente en `CU-06`:** Expondría enumeración de cuentas; la respuesta `200` inmediata más despacho no bloqueante con `SMTP_TRANSPORT=json|smtp` evita enumeración por tiempo y protege la cuota gratuita de Mailtrap Sandbox.

### Tema 4: Catálogo, posventa, calendario y reportes
* **`ALT-13` — Exigir login previo para carrito o guardar carritos anónimos en PostgreSQL:** Genera abandono temprano o filas huérfanas rompiendo `carrito.id_usuario NOT NULL`; `localStorage` + fusión idempotente evita ambos problemas.
* **`ALT-14` — Subida binaria de imágenes en backend (`multer`/S3):** Añade gestión de archivos, límites MIME y almacenamiento externo fuera de Etapa 1; `imagen_url` + respaldo visual en frontend cumple el catálogo v1. Reconsiderable en producción si se requiriera hosting propio de multimedia.
* **`ALT-15` — Estados `RETRACTO_*` directamente sobre `pedido.estado_pedido`:** Corrompería el estado logístico de los ítems conservados en devoluciones parciales; separar `retracto` + `detalle_retracto` mantiene limpio el ciclo del pedido.
* **`ALT-16` — Incluir cobro independiente de fletes o `DEVOLUCION_COMERCIAL` en v1:** Parametrizar tarifas por ciudad/peso y prorrateos de transporte o reglas discrecionales de devolución voluntaria sin respaldo de `HU`/`CU` amplía alcance y complica reembolsos. Ambas capacidades quedan registradas en `Future Improvements`.
* **`ALT-17` — CRUD administrativo UI para `festivo_colombia`:** Agrega pantallas y rutas para datos oficiales que cambian ~18 fechas al año; ampliar `004_festivos_colombia_2025_2035.sql` con alertas al arranque reduce mantenimiento operativo.
* **`ALT-18` — Generación binaria Excel/PDF en Express:** Carga memoria del servidor y acopla diseño visual antes de construir React; JSON acotado (`90 días` / `5000 filas`) delega la renderización al cliente. Reconsiderable en reportes masivos programados futuros.

---

## Non-Functional Requirements

* **Seguridad y privacidad:** Hash `bcrypt` (`BCRYPT_ROUNDS >= 10`), `token_recuperacion` como `SHA-256` (TTL `60m`), Access JWT `HS256` (`15m`) solo en memoria React + cookie `HttpOnly bikestore_rt` (`SameSite=Lax`, `Secure` en producción, `Path=/api/auth`) respaldada por `sesion_refresh` con replay AEAD `AES-256-GCM` + `HKDF-SHA256` (`REFRESH_REPLAY_KEY`) limitado a `30 s`, CSRF (`Origin` + `X-Requested-With: BikeStore`), `TRUST_PROXY` configurable, `helmet()`, CORS con `credentials: true` sobre `CORS_ORIGINS`, *rate limiting* en `/login`, `/registro`, `/recuperar`, `/restablecer` y `/refresh`, `Zod` estricto, validación `imagen_url` anti-SVG y anti-SSRF, exclusión de `contrasena_hash` y tokens de reset en logs/respuestas, CSP estricta en build frontend (`script-src 'self'`) y auditoría de accesibilidad (`vitest-axe`).
* **Integridad, dinero y concurrencia:** Aislamiento `READ COMMITTED`, jerarquía fija `usuario → carrito → detalle_carrito → pedido → detalle_pedido → retracto → pago → producto ORDER BY id_producto ASC FOR NO KEY UPDATE OF p`, reintentos automáticos en `withTransaction` (`maxRetries = 3`) ante `40P01`/`40001` con mapeo final a `503 CONFLICTO_CONCURRENCIA`, `CHECK` estrictos en las **16 tablas**, `NUMERIC(12,2)` en centavos enteros (`utils/decimal.js`), máximo 1 `PENDIENTE` por cliente y 1 `'APROBADO'` por pedido.
* **Zona horaria:** Sesión `pg` en `UTC` (`SET TIME ZONE 'UTC'`), almacenamiento en `TIMESTAMPTZ` y conversión explícita a `America/Bogota` (`UTC-5`) en vencimientos legales de 5 días hábiles y reportes.
* **Verificabilidad integral:** Superar suites unitarias y de integración/concurrencia (`node:test` + `supertest`) contra PostgreSQL real (`TEST_DATABASE_URL`, migración `001`–`005`), más suites frontend (`Vitest`, `Testing Library`, `refreshSync`, `flujosCriticosUi`, `vitest-axe`) y compilación `vite build` con code-splitting `React.lazy`.

---

## Risks & Limits

1. **Cuota gratuita de Mailtrap Sandbox (~50 correos/mes, 10 guardados, límite de ráfagas por 10 s):** Las ejecuciones repetidas de pruebas automatizadas o QA consumirían la cuota devolviendo errores `535`/`429`. *Mitigación:* usar `SMTP_TRANSPORT=json` (`jsonTransport` de `Nodemailer`) en desarrollo local y `NODE_ENV=test`, reservando Mailtrap SMTP real únicamente para validación manual controlada en `bikestore.http` o demostración, despachando envíos de forma no bloqueante tras responder `HTTP 200` y exigiendo credenciales SMTP completas si `NODE_ENV=production` usa `SMTP_TRANSPORT=smtp`.
2. **Despliegue futuro en PaaS / PostgreSQL gratuito y proxy inverso:** En PaaS gratuitos que hibernan instancias o operan tras proxy inverso, un polling frecuente impediría hibernar y `req.ip` agruparía clientes si falta `trust proxy`. *Mitigación:* `DB_POOL_MAX=10`, expiración perezosa transaccional (`crearPedidoDesdeCarrito` y `volverPedidoAlCarrito` en 2 fases sin rollback), `RESERVA_SWEEP_INTERVAL_MS=0` opcional, `TRUST_PROXY` configurable y `COOKIE_SECURE=true` por defecto en producción.
3. **Almacén en memoria de `express-rate-limit`:** Los contadores se reinician al reiniciar el proceso y aplican por instancia única (`localhost`). *Mitigación:* suficiente para v1 en proceso único; si escalara a múltiples réplicas, requeriría almacenamiento compartido (`PostgreSQL` o `Redis`).
4. **Ventana de retención de `30 días` en `carrito_fusion_idempotencia` y `30 s` en replay de refresh:** `purgarRegistrosExpiradosLote()` elimina registros de fusión mayores a `30 días` y limpia `reemplazo_cifrado` vencido (> `30 s`) cada `15 min`. *Mitigación:* advertencia explícita en contrato API de que reutilizar una `Idempotency-Key` de fusión luego de 30 días no reproducirá la respuesta purgada, y el frontend rota `rotacion_uid` tras cada refresh exitoso.
5. **Compatibilidad en navegadores sin `Web Locks API` (`navigator.locks`):** Entornos legacy o contextos restringidos carecen de `navigator.locks`. *Mitigación:* en ausencia de `Web Locks`, `refreshSync.js` evita mutex en `localStorage` y deriva `Idempotency-Key` UUID v8 determinista compartido (`SHA-256(bs_client_secret:rotacion_uid)`) para que el backend reproduzca atómicamente el mismo `T2` durante 30 s.
6. **Capacidad de memoria al exportar reportes Excel/PDF en navegador y cobertura de festivos posterior a 2035:** `/api/admin/reportes/ventas` mantiene tope `90 días` / `5000 filas`; `004_festivos_colombia_2025_2035.sql` requiere ampliación antes de diciembre de 2035.

---

## Additional Resources

* [concepts_brief.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/concepts_brief.md) — Concepto aprobado y sincronizado con esta especificación.
* [design_draft.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/design_draft.md) — Puntero histórico hacia esta especificación central.
* [ProyectoDidactico-BikeStore-Aprendiz.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/ProyectoDidactico-BikeStore-Aprendiz.pdf) — Guía didáctica SENA (`RF-01..RF-31`, `RNF`, Sprints).
* [evhistoriasdeusuariodocx.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/historias_usuario/evhistoriasdeusuariodocx.pdf) — Historias originales `HU-01..HU-15` (referencia histórica conservada).
* [Ev_plantilla_casos_de_uso_viveros_sanchez.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/CASOS_DE_USO/Ev_plantilla_casos_de_uso_viveros_sanchez.pdf) — Casos de uso base `CU-01..CU-15`.
* [Diccionario_Datos_Viveros_Sanchez.xlsx](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Diccionario_datos/Diccionario_Datos_Viveros_Sanchez.xlsx) — Diccionario original de 11 tablas a actualizar en Fase 2.
* *Referencia normativa de retracto:* **Ley 1480 de 2011 Art. 47** (Estatuto del Consumidor en Colombia: derecho de retracto dentro de 5 días hábiles tras entrega) y **Ley 2439 de 2024** (actualización de obligaciones de comercio electrónico y plazo máximo de 15 días calendario para el reembolso).

---

## Future Improvements (Posibilidades futuras — NO requisitos de v1)

1. **Devolución comercial voluntaria (`DEVOLUCION_COMERCIAL`):** Ampliar posventa más allá del retracto legal con políticas comerciales por plazo/motivo.
2. **Cálculo de fletes por ubicación y devolución de transporte:** Parametrización de zonas/tarifas de despacho y reglas de devolución de flete según destino.
3. **Perfiles empresariales con `NIT`:** Registro tributario y validaciones de persona jurídica.
4. **Pasarela de pagos real asíncrona:** Evolución hacia *webhooks* externos y flujo persistente en dos transacciones con `'PENDIENTE'` bancario.
5. **Servicios de taller, mantenimiento y citas:** Agendamiento técnico para bicicletas.
6. **Módulo de compras a proveedores y entradas de almacén:** Órdenes de compra e ingresos trazables de inventario.

---

## Detailed Implementation Plan

Este plan sigue estrictamente la secuencia **`Orden 0 (Respaldo) → Fase 1 (HU + CU + Escenarios) → Fase 2 (MER + DER + Diccionario) → Fase 3 (Arquitectura) → Fase 4 (Backend Etapa 1) → Fase 5 (Frontend Etapa 2) → Fase 6 (Consolidación a 16 Tablas, A1/B1, Seguridad y Rendimiento)`**. Las Fases 0–5 conservan el registro de la entrega inicial sobre 14 tablas; la **Fase 6** documenta la ampliación definitiva a **16 tablas exactas**.

---

### Orden 0: Respaldo preventivo de originales y trazabilidad (Pasos 0.1 – 0.2)

| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Documentacion-Escencial-BikeStore/_respaldo_originales/` | Carpeta (inexistente) | Crear | Copiar intactos todos los archivos editables originales (`.docx`, `.xml`, `.xlsx`, `.svg`, `.png`, `.drawio.png`) replicando exactamente subcarpetas y nombres. Conservar intactos los `.pdf` originales en sus carpetas. | Ninguna | 0.1 | Conteo exacto de archivos editables verificados en `_respaldo_originales/` igual al inventario original y `.pdf` intactos. |
| `Documentacion-Escencial-BikeStore/_respaldo_originales/REGISTRO_CAMBIOS.md` | Nuevo | Crear y actualizar por fase | Bitácora con inventario completo clasificado como `modificado`, `generado desde cero` o `conservado sin cambios`. | Paso 0.1 | 0.2 | Bitácora creada y cerrada para Orden 0, y actualizada con evidencia verificable al término de cada fase 1–5. |

---

### Fase 1: Actualización de `HU + CU` y auditoría previa de escenarios (Pasos 1.1 – 1.5c)

| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/ProyectoDidactico-BikeStore-Aprendiz.pdf` | `.pdf` | Conservar | Mantener archivo original intacto. | Paso 0.2 | 1.1 | `.pdf` sin modificaciones registrado como `conservado sin cambios` en `REGISTRO_CAMBIOS.md`. |
| `Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/NOTA_ALCANCE_V1.md` | Nuevo | Crear | Documentar exclusiones v1 (`VENDEDOR`, `NIT`, `'BLOQUEADO'`, `DEVOLUCION_COMERCIAL`, taller, proveedores, promociones, DIAN, fletes, uploads, `token_revocacion`), conciliación `RNF-12` (`localhost`) vs `Sprint 7` (nube diferida), `RF-10` (`id_pedido`) y `RF-14` (validación sintáctica/unicidad sin correo de activación). | Pasos 0.1–0.2 | 1.2 | Documento con fecha, autores y mapeo completo contra `Non-Goals` de `docs/designs/bikestore_v1.md`. |
| `Documentacion-Escencial-BikeStore/historias_usuario/evhistoriasdeusuariodocx.pdf` | `.pdf` | Conservar | Mantener archivo original intacto. | Pasos 0.1–0.2 | 1.3a | `.pdf` intacto registrado en `REGISTRO_CAMBIOS.md`. |
| `Documentacion-Escencial-BikeStore/historias_usuario/HU_BikeStore_definitivo.md` | Nuevo | Crear | Consolidar `HU-01..HU-15` corrigiendo: `HU-02` (carrito visitante + fusión), `HU-03` (`direccion_envio`, reserva 15 min, `409 PRECIO_ACTUALIZADO`, máx. 1 `PENDIENTE`, sin flete), `HU-04` (`CC/TI/CE/PASAPORTE/PPT` sintáctico, apellidos, teléfono), `HU-08` (*Dashboard e informes*: JSON backend + export Excel/PDF frontend, netos, 90d/5000 filas), `HU-09` (guard último `ADMIN` + estado `ACTIVO/INACTIVO` + cambio de rol `RF-28`), `HU-10` (*Cerrar sesión*: incremento `token_version`), `HU-12` (*Gestión de pedidos*: `PENDIENTE/PAGADO/ENVIADO/ENTREGADO/CANCELADO` + motivos), `HU-14` (pago `1:N` determinista en backend), `HU-15` (corregir texto copiado de `HU-13` en Escenario 2), y añadir historias nuevas `HU-16..HU-19` (categorías `ADMIN`, cancelación pre-envío + reembolso, `volver-al-carrito`, `RETRACTO_LEGAL` con inspección por cantidad). | Paso 1.2 | 1.3b | Cobertura nominal de `HU-01` a `HU-19` alineadas a `Goals` y `CUJs`, con búsqueda textual dando cero apariciones de `VENDEDOR`, `NIT`, `BLOQUEADO`, `DEVOLUCION_COMERCIAL` o `Upload` fuera de sección de exclusiones. |
| `Documentacion-Escencial-BikeStore/CASOS_DE_USO/Ev_plantilla_casos_de_uso_viveros_sanchez.pdf` | `.pdf` | Conservar | Mantener archivo original intacto. | Pasos 0.1–0.2 | 1.4a | `.pdf` intacto registrado en `REGISTRO_CAMBIOS.md`. |
| `Documentacion-Escencial-BikeStore/CASOS_DE_USO/CU_BikeStore_definitivo.md` | Nuevo | Crear | Consolidar `CU-01..CU-15` y añadir `CU-16..CU-19`: `CU-01` (`imagen_url` única + categoría activa + paginación), separar creación de pedido (`CU-03`) vs pago `1:N` (`CU-14`), `CU-04` (patrones sintácticos por tipo sin tope fijo de 10 dígitos), `CU-06` (HTTP `200` inmediato + `Nodemailer` no bloqueante + *rate limit*), `CU-10` (reportes JSON netos + export cliente), `CU-12` (logout con `token_version`), `CU-14`/admin pedidos (`PENDIENTE`..`CANCELADO`), plus CRUD categorías, fusión carrito, `volver-al-carrito`, cambio de rol `RF-28`, cancelación/reembolso pre-envío y `RETRACTO_LEGAL` (decisión + inspección por cantidad). | Paso 1.3b | 1.4b | Matriz cruzada `1:1` entre `HU-01..HU-19` y `CU-01..CU-19` sin contradicciones de actores (`ADMIN`, `CLIENTE`, `Visitante`). |
| `Documentacion-Escencial-BikeStore/Escenarios+plantillas_casos_de_uso/MAPEO_AUDITORIA_ESCENARIOS.md` | Nuevo | Crear | Inspeccionar los 8 `.docx` y los 8 diagramas UML, mapear actor/flujo/precondición/postcondición contra `CU_BikeStore_definitivo.md` y listar exactamente qué archivos `.docx`/UML requieren edición y cuáles flujos nuevos requieren `Ev_escenario9_retracto_y_fusion.docx`. | Paso 1.4b y 0.1 | 1.5a | Tabla de auditoría 8/8 completa y aprobada antes de abrir ningún `.docx`. |
| `Documentacion-Escencial-BikeStore/Escenarios+plantillas_casos_de_uso/Ev_escenario{1..8}_casos_de_uso_Andresviveros_Juansanchez.docx` y `Ev_escenario9_retracto_y_fusion.docx` *(si `1.5a` detecta flujos nuevos sin cobertura)* | `.docx` | Modificar o Conservar / Crear `Ev_escenario9` | Aplicar exactamente las ediciones definidas en `MAPEO_AUDITORIA_ESCENARIOS.md` manteniendo copia intacta de los 8 originales en `_respaldo_originales/`. | Paso 1.5a | 1.5b | Cada `.docx` coincide exactamente con su `CU` asignado en `MAPEO_AUDITORIA_ESCENARIOS.md`. |
| `Documentacion-Escencial-BikeStore/CASOS_DE_USO_UML/`: `Escenario_1.drawio.png`, `Escenario2drawio.png`, `Escenario3drawio.png`, `Escenario4.png` (+ nuevo `Escenario4.xml`), `Escenario5drawio.png`, `Escenario6.drawio.png`, `Escenario7drawio.png`, `Escenario8drawio.png`, más `Escenario9.xml`/`.drawio.png` *(si aplica Paso 1.5b)* | `.png` / `.drawio.png` | Modificar o Conservar / Crear `.xml` | Actualizar actores (`Cliente`, `Administrador`, `Visitante`) y casos de uso según `MAPEO_AUDITORIA_ESCENARIOS.md`, generando `Escenario4.xml` al editar el escenario 4 y re-exportando `.png`. | Paso 1.5b | 1.5c | Cada diagrama UML corresponde al contenido auditado del `.docx` y `CU` definitivo, registrado en `REGISTRO_CAMBIOS.md`. |

---

### Fase 2: Actualización de `MER + DER + Diccionario` (Pasos 2.1 – 2.3)

| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Documentacion-Escencial-BikeStore/Ev_DER_MER/Ev_MER_viveros_sanchez.xml` y `Ev_MER_viveros_sanchez.drawio.png` | `.xml` + `.png` | Modificar XML + re-exportar PNG | Entrega inicial **14 entidades** (ampliada a **16 entidades** en Fase 6): `pedido`–`pago` (`1:N`), `retracto`, `detalle_retracto`, `festivo_colombia`, atributos en `usuario`, `usuario_rol` (`1:1`), `pedido` y `pago`. | Fase 1 | 2.1 | Coincidencia nominal de las entidades (16 en Fase 6) y cardinalidades en XML y `.drawio.png`. |
| `Documentacion-Escencial-BikeStore/Ev_DER_MER/Ev_DER_viveros_sanchez.xml` y `Ev_DER_viveros_sanchez.drawio.png` | `.xml` + `.png` | Modificar XML + re-exportar PNG | Entrega inicial **14 tablas** (ampliada a **16 tablas** en Fase 6), PKs, FKs, políticas `ON DELETE`, tipos PostgreSQL (`TIMESTAMPTZ`, `NUMERIC(12,2)`) e índices únicos parciales conforme a Sección 3.1–3.3. | Paso 2.1 | 2.2 | DER XML y `.drawio.png` reflejan exactamente las tablas (16 en Fase 6) y restricciones de Sección 3. |
| `Documentacion-Escencial-BikeStore/Diccionario_datos/Diccionario_Datos_Viveros_Sanchez.xlsx` | `.xlsx` (11 hojas) | Modificar (respaldado en 0.1) | Entrega inicial **14 hojas** (ampliada a **16 hojas** en Fase 6 + 3 cols. en `pedido`) con columnas, longitudes, nulabilidad, `ON DELETE` y dominios exactos de Sección 3. | Paso 2.2 | 2.3 | Excel validado (16 hojas en Fase 6) y cero menciones residuales a `MySQL`, `VENDEDOR`, `NIT`, `BLOQUEADO`, `DEVOLUCION_COMERCIAL` o `ñ` en identificadores SQL. |

---

### Fase 3: Actualización de `Arquitectura` (Paso 3.1)

| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Documentacion-Escencial-BikeStore/Ev_arquitectura de software/Ev_arquitecturaEnCapas_Viveros_Sanchez.svg` y `Ev_arquitecturaEnCapas_Viveros_Sanchez.png` | `.svg` + `.png` | Modificar SVG + re-exportar PNG | Cambiar `MySQL` → `PostgreSQL (pg)`, quitar `Upload · imágenes`, mover `Exportar Excel/PDF` a React/Vite, reemplazar `Administrador principal` por `ADMIN`/`CLIENTE`, reemplazar rutas heredadas (`/api/compras`, `/api/usuarios/perfil`, `/api/carrito/:productoId`, `/api/admin/informes`, `/api/admin/roles`) por los contratos de Sección 4.5 (incluyendo `/logout`, `/restablecer`, `/perfil/contrasena`, `/carrito/fusionar`, `/pedidos/:id/cancelar`, `/pedidos/:id/volver-al-carrito`, `/pedidos/:id/retractos`, `/admin/categorias`, `/admin/usuarios/:id/rol`, `/admin/pedidos/:id/reembolso`, `/admin/retractos/*`, `/health`), añadir `Zod Validate`, `expiracionReservas`, `festivo_colombia` y `mailer.js` (`json/Mailtrap`). | Fases 1 y 2 | 3.1 | SVG y PNG re-exportado reflejan sin discrepancias la Sección 1, 2 y 4.5 de esta especificación. |

---

### Fase 4: Implementación del Backend — Etapa 1 autónoma (Pasos 4.0 – 4.7)

> [!IMPORTANT]
> **Contrato de etapa:** Los scripts `.sql` son complemento ejecutable de `Diccionario_Datos_Viveros_Sanchez.xlsx`. Toda la Etapa 1 debe superar los 8 puntos de compuerta del *Verification Plan* bajo **Node.js `26 LTS`** antes de habilitar la Fase 5.

#### Repositorio base, contratos API y scripts SQL (`Pasos 4.0 – 4.2`)
| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `.gitignore` | Nuevo | Crear | Ignorar `.env`, `.env.local`, `node_modules/`, `coverage/`, `frontend/dist/`, `*.log`. | Paso 3.1 | 4.0 | `.gitignore` en raíz verificado con `git status --ignored` tras crear `.env`. |
| `backend/docs/CONTRATO_API_V1.md` y `backend/README.md` | Nuevo | Crear | Documentar método HTTP, ruta exacta, cabeceras (`Authorization`, `Idempotency-Key`), esquemas Zod entrada/salida, respuesta `{ ok: true, datos, meta? }` / `{ ok: false, codigo, mensaje, detalles? }`, códigos HTTP/dominio de Sección 4.5 y operación anual de festivos. | Fase 2 y Fase 3 | 4.1a | Cobertura de la totalidad de endpoints de la tabla de Sección 4.5 con ejemplos de petición y respuesta. |
| `backend/docs/bikestore.http` | Nuevo | Crear | Colección única formato REST Client cubriendo health, auth, perfil, catálogo paginado, fusión carrito, checkout, pago rechazado/aprobado, expiración, `volver-al-carrito`, cancelación/reembolso pre-envío, `RETRACTO_LEGAL` completo y admin roles/reportes. | Paso 4.1a | 4.1b | Archivo `.http` sintácticamente válido con peticiones parametrizadas y códigos HTTP esperados en comentarios. |
| `backend/sql/001_schema_inicial.sql` | Nuevo | Crear | DDL exacto de las **14 tablas** PostgreSQL (`TIMESTAMPTZ`, `NUMERIC(12,2)`, `CHECK`s, políticas `ON DELETE RESTRICT`/`CASCADE`/`SET NULL`), derivado 1:1 de Sección 3 y del Excel actualizado. | Paso 2.3 | 4.2a | Ejecución sin errores en PostgreSQL limpio confirmando 14 tablas mediante `\dt`. |
| `backend/sql/002_indices_y_reglas.sql` | Nuevo | Crear | Crear índices únicos compuestos/parciales (`LOWER(correo)`, `(tipo_documento, numero_documento)`, `usuario_rol(id_usuario)`, `carrito(id_usuario) ACTIVO`, `pedido(id_usuario) PENDIENTE`, `pago(id_pedido) APROBADO|REEMBOLSADO`, `pago` idempotencia, `token_hash`) e índices de consulta de Sección 3.3. | Paso 4.2a | 4.2b | Todos los índices y restricciones verificados mediante `\d+` en `psql`. |
| `backend/sql/003_seed_roles_categorias.sql` | Nuevo | Crear | Insertar idempotentemente (`ON CONFLICT DO NOTHING`) roles `'ADMIN'` y `'CLIENTE'` más 5 categorías iniciales (`Bicicletas de Ruta`, `Bicicletas de Montaña`, `Bicicletas Urbanas`, `Cascos y Protección`, `Accesorios y Repuestos`). | Paso 4.2b | 4.2c | Re-ejecución idempotente comprobada con 2 filas en `rol` y 5 filas en `categoria`. |
| `backend/sql/004_festivos_colombia_2025_2035.sql` | Nuevo | Crear | Poblar festivos oficiales de Colombia 2025–2035 (~18 festivos/año) usando `ON CONFLICT (fecha) DO NOTHING`. | Paso 4.2a | 4.2d | Verificación SQL mostrando `>= 12` registros por cada año de 2025 a 2035. |

#### Núcleo Express, configuración, middlewares, utilidades y scripts (`Pasos 4.3 – 4.4`)
| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `backend/package.json` y `backend/.env.example` | Nuevo | Crear | `"engines": { "node": ">=26.0.0" }`, dependencias (`express`, `pg`, `bcrypt`, `jsonwebtoken`, `nodemailer`, `helmet`, `cors`, `express-rate-limit`, `dotenv`, `zod`), `devDependencies` (`supertest`), scripts (`start`, `dev: "node --watch src/server.js"`, `db:migrate`, `db:seed`, `check:festivos`, `test: "node --test tests/**/*.test.js"`). `.env.example` lista `PORT`, `NODE_ENV`, `DATABASE_URL`, `TEST_DATABASE_URL`, `DB_POOL_MAX`, `DB_SSL`, `JWT_SECRET`, `JWT_EXPIRES_IN=15m`, `BCRYPT_ROUNDS=10`, `CORS_ORIGIN`, `FRONTEND_URL`, `SMTP_TRANSPORT=json`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `RESERVA_SWEEP_INTERVAL_MS=60000`, `RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX=10`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_DOC_TIPO`, `SEED_ADMIN_DOC_NUM`, `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_APELLIDO`, `SEED_ADMIN_TELEFONO`. | Paso 4.0 | 4.3a | `npm install` finaliza con código de salida `0` bajo Node.js 26 LTS y `.env.example` contiene todas las claves listadas. |
| `backend/src/config/env.js` y `backend/src/config/db.js` | Nuevo | Crear | `env.js`: validar variables obligatorias al cargar (abortando si falta `JWT_SECRET` o `DATABASE_URL`). `db.js`: crear `Pool` de `pg` con `max: env.DB_POOL_MAX`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `ssl` opcional y `pool.on('connect', (client) => client.query("SET TIME ZONE 'UTC'"))`; exportar `withTransaction(fn)`. | Paso 4.3a | 4.3b | Arranque falla con error explícito si falta variable obligatoria; `withTransaction` probado ante `COMMIT` y `ROLLBACK` verificando sesión en `UTC`. |
| `backend/src/middlewares/`: `auth.middleware.js`, `role.middleware.js`, `validate.middleware.js`, `rateLimit.middleware.js`, `error.middleware.js` | Nuevo | Crear | `auth`: valida `HS256` + consulta `usuario` (`ACTIVO`, `token_version`) + `usuario_rol`/`rol`. `role`: valida rol autorizado. `validate`: valida `body`/`query`/`params` vía esquemas `Zod` estrictos. `rateLimit`: protege `/login`, `/registro`, `/recuperar`, `/restablecer` (reiniciable en entorno `test`). `error`: normaliza salida `{ ok: false, codigo, mensaje, detalles }`. | Paso 4.3b | 4.3c | Rechaza `401` ante token revocado/inactivo, `403` ante rol inválido, `400 VALIDACION_INVALIDA` ante campos extra, `429` ante exceso de intentos y JSON homogéneo en errores. |
| `backend/src/utils/`: `password.js`, `jwt.js`, `documento.js`, `decimal.js`, `festivos.js`, `mailer.js` | Nuevo | Crear | `password`: `bcrypt` (`>= 10` rondas + hash dummy) y `SHA-256`. `jwt`: firma/verificación `HS256` (`15m`). `documento`: regex por `CC/TI/CE/PASAPORTE/PPT`. `decimal`: aritmética entera en centavos. `festivos`: conteo 5 días hábiles `< dia_6 00:00:00-05:00` en `America/Bogota` + verificación 20 días. `mailer`: `Nodemailer` (`jsonTransport` o SMTP Mailtrap con timeout de `5 s`). | Paso 4.3b | 4.4a | Suite `backend/tests/unit/{documento,decimal,festivos}.test.js` ejecuta con código `0`. |
| `backend/src/scripts/`: `migrate.js`, `seedAdmin.js`, `checkFestivos.js` y `backend/src/jobs/expiracionReservas.job.js` | Nuevo | Crear | `migrate.js`: ejecuta `001..004` en orden. `seedAdmin.js`: crea/omite `ADMIN` semilla leyendo `SEED_ADMIN_*` y calculando `bcrypt` en Node. `checkFestivos.js`: aborta si año actual `< 12` festivos y advierte (`WARN`) si falta siguiente año. `expiracionReservas.job.js`: barrido configurable (`RESERVA_SWEEP_INTERVAL_MS`), `LIMIT 20`, `SKIP LOCKED`, 1 transacción por pedido, guarda no-solapamiento y captura errores BD. | Pasos 4.2a–d, 4.4a | 4.4b | `migrate`, `db:seed` y `check:festivos` terminan con código `0` e idempotencia; expiración concurrente verificada con `ROW_COUNT = 1`. |

#### Módulos API de negocio y pruebas autónomas (`Pasos 4.5 – 4.7`)
| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `backend/src/routes/auth.routes.js`, `controllers/auth.controller.js`, `services/auth.service.js`, `routes/perfil.routes.js`, `controllers/perfil.controller.js`, `services/perfil.service.js` | Nuevo | Crear | `registro`, `login` (con `bcrypt` ficticio), `logout` (`token_version + 1`), `recuperar` (respuesta `200` inmediata + envío no bloqueante + invalidación previa), `restablecer` (solo `ACTIVO`, `token_version + 1`), `GET/PUT /api/perfil` y `PATCH /api/perfil/contrasena`. | Pasos 4.3c, 4.4a | 4.5a | Flujos verificados en `auth.test.js` sin exponer `contrasena_hash` ni filtrar existencia de correos. |
| `backend/src/routes/catalogo.routes.js`, `controllers/catalogo.controller.js`, `services/catalogo.service.js` | Nuevo | Crear | `GET /api/categorias`, `GET /api/productos` (`page`, `limit <= 50`, `id_categoria`, `q` con escape `%`/`_`, `orden_precio`) y `GET /api/productos/:id`, filtrando `producto.estado = TRUE AND categoria.estado = TRUE`. | Paso 4.3c | 4.5b | Verificado en `catalogo_carrito.test.js`: paginación exacta, ocultamiento de categoría inactiva y agotados visibles. |
| `backend/src/routes/carrito.routes.js`, `controllers/carrito.controller.js`, `services/carrito.service.js` | Nuevo | Crear | `GET`, `POST /fusionar` (`Idempotency-Key`, omite stock `0`/inactivos, retorna `ajustes[]`), `POST/PATCH/DELETE` ítems en PostgreSQL. | Pasos 4.3c, 4.5b | 4.5c | Fusión repetida con `Idempotency-Key` y cambios de stock/precio verificada sin duplicar cantidades. |
| `backend/src/routes/pedidos.routes.js`, `controllers/pedidos.controller.js`, `services/pedidos.service.js` | Nuevo | Crear | Checkout (`carrito FOR UPDATE` → expiración perezosa `FOR UPDATE` → `409 PRECIO_ACTUALIZADO` → `ORDER BY id_producto ASC FOR UPDATE`), pago `1:N` (`pedido FOR UPDATE` → `Idempotency-Key` → simulador determinista backend → `APROBADO`/`RECHAZADO`), cancelación pre-envío con datos de reembolso en `pedido` y `volver-al-carrito`. | Pasos 4.4a, 4.5c | 4.5d | Concurrencia sobre último stock, `409 PRECIO_ACTUALIZADO`, reintentos `1:N`, doble clic e idempotencia verificados. |
| `backend/src/routes/retractos.routes.js`, `controllers/retractos.controller.js`, `services/retractos.service.js` | Nuevo | Crear | `POST /api/pedidos/:id/retractos`, `GET /api/retractos`, `GET /api/retractos/:id` únicamente para `RETRACTO_LEGAL` (5 días hábiles sobre `festivo_colombia`), `detalle_pedido FOR UPDATE` bloqueando exceso o re-solicitud tras daño físico. | Pasos 4.4a, 4.5d | 4.5e | Pedido permanece `'ENTREGADO'`; rechaza extemporáneos (`409 PLAZO_RETRACTO_VENCIDO`) y re-solicitud de unidades dañadas. |
| `backend/src/routes/admin.routes.js`, `controllers/admin.controller.js`, `services/admin.service.js` | Nuevo | Crear | CRUD categorías/productos (ajuste de stock separado en `PATCH .../existencias`), usuarios (`PATCH .../estado` y `PATCH .../rol` con guard `409 ULTIMO_ADMIN_ACTIVO`), pedidos (`estado` + `PATCH .../reembolso` cancelado), retractos (`decision`, `recepcion` por producto/cantidad y `reembolso` total/parcial), y reportes netos (`90 días`, `5000 filas`, `id_categoria`). | Pasos 4.5a–4.5e | 4.5f | Verificado en `admin_reportes.test.js`: `409 CATEGORIA_CON_PRODUCTOS`, `409 ULTIMO_ADMIN_ACTIVO`, cálculo exacto neto y reingreso físico parcial. |
| `backend/src/app.js` y `backend/src/server.js` | Nuevo | Crear | `app.js` exporta Express (`helmet`, `cors`, `json({ limit: '100kb' })`, `/api/health`, rutas, `error.middleware`). `server.js` corre `checkFestivos`, inicia `listen()` y el job, y apaga ordenadamente en `SIGINT`/`SIGTERM` deteniendo timer y `pool.end()`. | Pasos 4.4b, 4.5a–f | 4.6 | `GET /api/health` responde `HTTP 200` y `tests` con `supertest` contra `app.js` cierran sin handles abiertos. |
| `backend/tests/unit/{documento,decimal,festivos}.test.js` y `backend/tests/integration/{auth,catalogo_carrito,pedidos_concurrencia,retractos,admin_reportes}.test.js` | Nuevo | Crear | Pruebas unitarias e integración contra `TEST_DATABASE_URL` (`TRUNCATE ... RESTART IDENTITY CASCADE` entre suites, `SMTP_TRANSPORT=json`, ajuste SQL de `fecha_expiracion` para vencimiento 15 min y reset de `rateLimit`). | Paso 4.6 | 4.7 | `npm test` finaliza con código de salida `0`, `0` casos omitidos (`skipped`) y cobertura de los 8 puntos del *Verification Plan*. |

---

### Fase 5: Frontend — Etapa 2 posterior (BLOQUEADA hasta aprobar Fase 4 y realizar 2.ª revisión)

> [!NOTE]
> **Compuerta obligatoria:** Los pasos de Fase 5 permanecen bloqueados durante Etapa 1. Al superar los 8 puntos del *Verification Plan* de Fase 4, el equipo creará `frontend/docs/PLAN_FRONTEND_V1.md` (fijando `react-router-dom`, librería Excel/PDF, política de **interfaz íntegramente en español** salvo términos técnicos imprescindibles, y listado exacto de páginas y componentes) y ejecutará una **segunda auditoría de preparación para implementación** antes de abrir el Paso `5.1`.

| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `frontend/package.json` y `frontend/vite.config.js` | Nuevo (Etapa 2) | Crear (Etapa 2) | Proyecto `React + Vite`, proxy hacia `localhost:3000` y librerías definidas en `PLAN_FRONTEND_V1.md`. | 8 puntos Verification Plan Fase 4 + revisión `PLAN_FRONTEND_V1.md` | 5.1 | `npm run build` finaliza con código de salida `0`. |
| `frontend/src/api/client.js`, `frontend/src/utils/visitorCart.js`, `frontend/src/utils/exportadores.js` | Nuevo (Etapa 2) | Crear (Etapa 2) | Cliente HTTP acoplado a `CONTRATO_API_V1.md` (`409 PRECIO_ACTUALIZADO`, `Idempotency-Key`), `localStorage` (`schema_version = 1`), fusión y exportadores Excel/PDF cliente desde `/api/admin/reportes/*`. | Paso 5.1 | 5.2 | Pruebas unitarias/componentes de carrito visitante, fusión y exportación sin errores. |
| Páginas y componentes definidos en `frontend/docs/PLAN_FRONTEND_V1.md` | Nuevo (Etapa 2) | Crear (Etapa 2) | Vistas públicas, cliente y admin completas sin modificar contrato API de Etapa 1. | Paso 5.2 | 5.3 | Lista de chequeo E2E con evidencia de ejecución exitosa de `CUJ 1..CUJ 4` contra backend real. |

---

### Fase 6: Consolidación a 16 Tablas, Sesiones A1, Idempotencia B1, Seguridad, Rendimiento y Calidad Integral

> [!IMPORTANT]
> **Actualización transversal posterior a Fases 0–5:** Amplía el esquema de 14 a **16 tablas exactas** (`005_sesiones_refresh_e_idempotencia.sql`), incorpora rotación de sesiones `A1` con replay AEAD (`30 s`) y CSRF, idempotencia persistida `B1` (`carrito_fusion_idempotencia` 30d + `volver-al-carrito` en 2 fases sin rollback), reintentos `40P01`/`40001` → `503 CONFLICTO_CONCURRENCIA`, protección SSRF/SVG en `imagen_url`, code-splitting (`React.lazy` + `Suspense`), CSP estricto, SEO (`robots.txt`, `sitemap.xml`, Open Graph, `noindex`), coordinación `Web Locks API` + `BroadcastChannel` + UUIDv8 y pruebas `vitest-axe`.

| Área | Artefactos clave actualizados / creados | Criterio de terminado (DoD) |
| :--- | :--- | :--- |
| **BD y Migración `005`** | `backend/sql/005_sesiones_refresh_e_idempotencia.sql` (`sesion_refresh`, `carrito_fusion_idempotencia`, 3 columnas y `CHECK` todo-o-nada en `pedido`) | `npm run db:migrate` en dev y test verifica **16 tablas**, índices parciales y restricciones `CHECK`/`UNIQUE`. |
| **Backend A1/B1 y Seguridad** | `env.js`, `db.js`, `app.js`, `cookies.js`, `refreshCrypto.js`, `idempotency.js`, `imagenUrl.js`, `csrf.middleware.js`, `error.middleware.js`, `auth/carrito/pedidos/perfil/admin.service.js`, `expiracionReservas.job.js`, `tests/{unit/refreshCrypto,integration/sesiones_refresh,integration/idempotencia_concurrencia}.test.js` | `cd backend && npm test` con `100 %` de pruebas aprobadas contra PostgreSQL real cubriendo los 13 escenarios de concurrencia, CSRF, reúso, replay AEAD, `503`, SSRF/SVG y purga. |
| **Frontend Rendimiento, A1, CSP y SEO** | `src/utils/refreshSync.js`, `src/api/client.js`, `src/context/AuthContext.jsx`, `src/App.jsx` (`React.lazy`), `src/hooks/useTituloPagina.js`, `index.html`, `vite.config.js`, `public/{robots.txt,sitemap.xml}`, `DetallePedidoPage.jsx`, `tests/{refreshSync,flujosCriticosUi,accesibilidad}.test.*` | `cd frontend && npm test && npm run build` con `0` fallos, JWT solo en memoria React, `vitest-axe` sin violaciones, chunks lazy en `dist/` y CSP estricto en producción. |
| **Documentación SENA y Técnica** | `docs/designs/bikestore_v1.md`, `concepts_brief.md`, `backend/docs/{CONTRATO_API_V1.md,bikestore.http}`, `backend/README.md`, `frontend/docs/PLAN_FRONTEND_V1.md`, `NOTA_ALCANCE_V1.md`, `HU_BikeStore_definitivo.md`, `CU_BikeStore_definitivo.md`, `Diccionario_Datos_Viveros_Sanchez.xlsx` (16 hojas), `Ev_MER`/`Ev_DER` (16 entidades/tablas), `Ev_arquitecturaEnCapas` y `REGISTRO_CAMBIOS.md` | Coherencia 100 % exacta entre código, SQL, contratos API, Excel de 16 hojas, diagramas y bitácora final con cifras reales verificadas. |

---

### Verification Plan

> [!IMPORTANT]
> **Principio de evidencia por fase:** Ninguna fase se cierra por existencia de archivos o respaldos; cada cierre requiere verificar su DoD y registrar la evidencia en `REGISTRO_CAMBIOS.md`.

#### Criterios de verificación para Documentación (16 tablas y sincronización A1/B1)
* **Auditoría previa de escenarios:** `MAPEO_AUDITORIA_ESCENARIOS.md` completo (8/8 `.docx` y 8 UML) cerrado y respaldado en `_respaldo_originales/`.
* **Consistencia transversal:** Revisión cruzada entre `NOTA_ALCANCE_V1.md`, `HU_BikeStore_definitivo.md`, `CU_BikeStore_definitivo.md`, `Ev_MER_viveros_sanchez.xml`/`.drawio.png`, `Ev_DER_viveros_sanchez.xml`/`.drawio.png`, `Diccionario_Datos_Viveros_Sanchez.xlsx` (**16 hojas**), `Ev_arquitecturaEnCapas_Viveros_Sanchez.svg`/`.png`, `CONTRATO_API_V1.md`, `PLAN_FRONTEND_V1.md` y `REGISTRO_CAMBIOS.md`: cero referencias residuales a `MySQL`, `VENDEDOR`, `NIT`, `BLOQUEADO`, `DEVOLUCION_COMERCIAL`, `Upload · imágenes` o exportación binaria en backend, con los 3 PDF originales conservados intactos.

#### Criterios de verificación Backend + Frontend
1. **Contrato API cerrado:** `backend/docs/CONTRATO_API_V1.md` y `backend/docs/bikestore.http` alineados 1:1 con `GET /api/admin/pedidos/:id`, `DELETE /api/admin/categorias/:id`, `/api/auth/refresh`, `/api/auth/logout`, `/api/carrito/fusionar`, `/api/pedidos/:id/volver-al-carrito`, códigos `401 SESION_EXPIRADA`, `403 CSRF_ORIGEN_INVALIDO`, `503 CONFLICTO_CONCURRENCIA` y validación `imagen_url`.
2. **Esquema PostgreSQL e índices verificados:** `001`–`005` + `seedAdmin.js` ejecutados en BD limpia verificando las **16 tablas** exactas en `\dt`, todos los índices parciales/únicos en `\d+`, `>= 12` festivos/año 2025–2035 y `npm run check:festivos` en `0`.
3. **Matriz de autenticación A1, CSRF, roles y recuperación:** `auth.test.js` y `sesiones_refresh.test.js` verificando `bikestore_rt`, replay AEAD de `30 s`, revocación por reúso (`REUSO_DETECTADO`), `403 CSRF_ORIGEN_INVALIDO`, `401 SESION_EXPIRADA`, logout global (`token_version` + `sesion_refresh`), `409 ULTIMO_ADMIN_ACTIVO`, *rate limit* `429` y recuperación `CU-06` sin tokens en logs.
4. **Matriz de concurrencia, idempotencia B1 e integridad:** `pedidos_concurrencia.test.js` e `idempotencia_concurrencia.test.js` verificando compra concurrente de última unidad, `409 PRECIO_ACTUALIZADO`, pagos `1:N`, fusión duradera (`30 días`, `id_carrito NULL ON DELETE SET NULL`), `volver-al-carrito` en 2 fases sin rollback al expirar, jerarquía unificada con `FOR NO KEY UPDATE`, reintento `40P01`/`40001` → `503 CONFLICTO_CONCURRENCIA`, rechazo SVG/SSRF y purga por lotes.
5. **Matriz comercial, posventa y frontend:** `catalogo_carrito.test.js`, `retractos.test.js`, `admin_reportes.test.js`, más las suites frontend (`Vitest`, `refreshSync.test.js`, `flujosCriticosUi.test.jsx`, `accesibilidad.test.jsx` con `vitest-axe`) y compilación limpia `vite build` con chunks `React.lazy`, CSP estricto y SEO (`robots.txt`/`sitemap.xml`/`noindex`).
