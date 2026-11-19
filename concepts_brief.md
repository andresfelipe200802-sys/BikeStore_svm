# Concepto del Proyecto: BikeStore (`Web_BikeStore_svm`)

* **Autor:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-19
* **Estado:** Concepto consolidado y sincronizado con `docs/designs/bikestore_v1.md` (16 tablas PostgreSQL, rotación `A1`, idempotencia persistida `B1`, seguridad, rendimiento y pruebas integrales)
* **Especificación técnica central:** [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md)

---

## 1. Visión del producto y estrategia de construcción

**BikeStore** es una aplicación web de comercio electrónico orientada a la venta de bicicletas y accesorios deportivos, concebida inicialmente como entrega formativa del SENA para entorno local (`localhost`, `RNF-12`) con arquitectura en capas preparada para evolución productiva futura.

La estrategia aprobada es **respaldo espejo + documentación alineada primero (`HU + CU → Auditoría de escenarios → MER + DER + Diccionario → Arquitectura → Spec Backend`) → Backend primero (compuerta verificada contra PostgreSQL real) → Frontend después**:

1. **Backend (Etapa 1):** `Node.js 26 LTS` + `Express` + `PostgreSQL` mediante `pg` (`backend/src/config/db.js`) con SQL parametrizado, validación estricta con `Zod`, scripts SQL versionados (sin ORM) y pruebas autónomas (`node:test` + `supertest`).
2. **Frontend (Etapa 2):** `React` + `Vite`, bloqueado hasta aprobar los 8 puntos del *Verification Plan* del backend y elaborar `frontend/docs/PLAN_FRONTEND_V1.md` con su segunda revisión de preparación.

---

## 2. Alcance y modelo de negocio v1

En v1 operan únicamente los roles `ADMIN` y `CLIENTE` (**un único rol por usuario** en `usuario_rol`), además de `Visitante` anónimo sin fila ni rol en base de datos.

* El catálogo permite navegación paginada (`page=1`, `limit=12`, máx. `50`), filtros por categoría activa, búsqueda de texto y ordenamiento por precio (`asc`/`desc`), ocultando productos o categorías inactivas y mostrando productos agotados (`existencias = 0`) sin compra habilitada.
* El carrito del visitante vive en `localStorage` (`schema_version = 1`) y se fusiona de forma segura e idempotente (`POST /api/carrito/fusionar` con cabecera **`Idempotency-Key` UUID RFC 4122/9562 obligatoria**, retención **30 días** en `carrito_fusion_idempotencia`) en PostgreSQL al autenticarse.
* El checkout reserva existencias por **15 minutos** en estado `'PENDIENTE'` (máximo 1 pedido `'PENDIENTE'` por cliente, sin cobro de envío en v1; expirando órdenes vencidas en pre-transacción); si algún precio cambió en catálogo, actualiza el carrito al precio vigente y responde `HTTP 409 PRECIO_ACTUALIZADO` para confirmación del cliente. Al vencer o cancelarse un pedido, `POST /api/pedidos/:id/volver-al-carrito` exige **`Idempotency-Key` UUID obligatorio** y opera en 2 fases sin rollback (expira vencido en Fase A con `COMMIT` y devuelve disponibles al carrito en Fase B con `200 OK`).
* El simulador de pagos (`TARJETA`, `PSE`, `TRANSFERENCIA`) opera en relación **`1:N`** dentro de una única transacción atómica, donde **el backend determina de forma determinista el resultado** (`APROBADO` o `RECHAZADO`).
* Tras la entrega (`'ENTREGADO'`), la posventa de v1 cubre **exclusivamente el `RETRACTO_LEGAL`** (5 días hábiles en `America/Bogota` usando `festivo_colombia` 2025–2035), total o parcial previa revisión administrativa de procedencia legal, con inspección física por **producto y cantidad** (`BUEN_ESTADO` vs `DANADO`), reembolso únicamente sobre unidades válidas y bloqueo de nuevas solicitudes sobre unidades rechazadas por daño. `DEVOLUCION_COMERCIAL` queda excluida de v1.

---

## 3. Inventario base y alineación documental

| Artefacto original (`Documentacion-Escencial-BikeStore/`) | Brechas detectadas para alinear antes de codificar |
| :--- | :--- |
| `Ev_arquitecturaEnCapas_Viveros_Sanchez.svg` / `.png` | Declara `MySQL`, rol `Administrador principal`, carga binaria de imágenes, exportación binaria Excel/PDF en servidor y rutas heredadas (`/api/compras`, `/api/usuarios/perfil`, `/api/carrito/:productoId`, `/api/admin/informes`, `/api/admin/roles`). |
| `Diccionario_Datos_Viveros_Sanchez.xlsx` + `Ev_MER` / `Ev_DER` | Conserva rol `VENDEDOR`, omite identificación en `usuario`, modela `pedido`–`pago` como `1:1` y carece de `retracto`, `detalle_retracto` y `festivo_colombia`. |
| `evhistoriasdeusuariodocx.pdf` | Duplica texto de `HU-13` dentro de `HU-15`; requiere ajuste de `HU-02` (fusión carrito), `HU-03` (`direccion_envio`, `409 PRECIO_ACTUALIZADO`, sin flete), `HU-04` (documentos), `HU-08` (*Dashboard e informes* netos y export frontend), `HU-09` (guard último `ADMIN` y cambio de rol `RF-28`), `HU-10` (*Cerrar sesión* vía `token_version`), `HU-12` (*Gestión de pedidos*) y `HU-14` (pago `1:N`), más `HU-16..HU-19`. |
| `Ev_plantilla_casos_de_uso_viveros_sanchez.pdf` + 8 `.docx` + 8 UML | Exige 10 dígitos fijos en `CU-04` y respuestas no neutras en `CU-06`; requiere auditoría previa 8/8 en `MAPEO_AUDITORIA_ESCENARIOS.md` contra `CU_BikeStore_definitivo.md` (`CU-01..CU-19`) antes de editar escenarios y UML. |
| `ProyectoDidactico-BikeStore-Aprendiz.pdf` | Mezcla entorno local (`RNF-12`) con despliegue en nube (`Sprint 7`) e introduce términos fuera de alcance v1. |

---

## 4. Resoluciones técnicas aprobadas

1. **Esquema PostgreSQL de 16 tablas exactas (`001`–`005`):** 11 tablas base actualizadas (`rol`, `usuario`, `usuario_rol` con `UNIQUE (id_usuario)`, `token_recuperacion`, `categoria`, `producto`, `carrito`, `detalle_carrito`, `pedido` extendida con `clave_idempotencia_carrito UUID`, `fecha_devolucion_carrito` y `resultado_devolucion_carrito JSONB` bajo `CHECK` todo-o-nada, `detalle_pedido`, `pago`), más 3 tablas de negocio (`retracto`, `detalle_retracto`, `festivo_colombia`), más 2 tablas de resiliencia/seguridad (`sesion_refresh` #15 y `carrito_fusion_idempotencia` #16 con `id_carrito NULL ON DELETE SET NULL`).
2. **Identidad, sesiones A1, CSRF y rol único (`M-03`):**
   * `usuario.estado_usuario` admite estrictamente `'ACTIVO'` e `'INACTIVO'` (sin `'BLOQUEADO'` en v1).
   * Validación sintáctica inicial para `CC`, `TI`, `CE`, `PASAPORTE` y `PPT` con unicidad `(tipo_documento, numero_documento)`, sin afirmar validación oficial ante autoridades estatales.
   * **Access JWT `HS256` (`15m`, `expires_in: 900`) solo en memoria React** + cookie `HttpOnly bikestore_rt` rotatoria de un solo uso (`sesion_refresh` con `rotacion_uid`, `familia_id`, `reemplazo_cifrado` AEAD `AES-256-GCM` + `HKDF-SHA256` por max `30 s`, `rotacion_idem_hash`, `ultimo_uso_at`), validación CSRF (`Origin` + `X-Requested-With: BikeStore` → `403 CSRF_ORIGEN_INVALIDO`) y `Idempotency-Key` UUID obligatorio en `/refresh` *(demuestra correlación de operación, no identidad criptográfica del cliente)*. Detección de reúso revoca la familia (`401 SESION_REVOCADA`); expiración devuelve `401 SESION_EXPIRADA`. En frontend se coordina con `Web Locks API` + `BroadcastChannel` + UUIDv8 determinista (`bs_client_secret` + `rotacion_uid`, sin mutex en `localStorage`).
   * `logout` (Bearer o cookie, CSRF si viene cookie), cambio/restablecimiento de contraseña, inactivación o cambio de rol (`PATCH /api/admin/usuarios/:id/rol`) incrementan `usuario.token_version`, revocan filas activas en `sesion_refresh` y protegen al último `ADMIN` activo (`409 ULTIMO_ADMIN_ACTIVO`).
   * `POST /api/auth/recuperar` responde `HTTP 200` neutro de inmediato y envía correo por `Nodemailer` (`SMTP_TRANSPORT=json|smtp`, sin tokens en logs) cuidando cuota Mailtrap.
3. **Estados de pedido, pagos `1:N`, bloqueos y devolución `B1` (`B-01`):**
   * `pedido.estado_pedido` conserva exclusivamente `('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO')`, con inspección administrativa `GET /api/admin/pedidos/:id`.
   * `pago.estado_pago` conserva `('APROBADO', 'RECHAZADO', 'REEMBOLSADO')`; `'REEMBOLSADO'` aplica **exclusivamente** cuando el 100 % del pedido fue reembolsado.
   * Las cancelaciones pre-envío de pedidos `'PAGADO'` registran estado, datos y fechas de reembolso directamente sobre `pedido`, confirmándose vía `PATCH /api/admin/pedidos/:id/reembolso`.
   * Aritmética monetaria exacta en `NUMERIC(12,2)` (centavos enteros en `utils/decimal.js`), bloqueos unificados con `FOR NO KEY UPDATE OF p` en ajustes de stock y reintentos en `withTransaction` ante `40P01`/`40001` (agotados → `503 CONFLICTO_CONCURRENCIA`).
4. **Seguridad de infraestructura, imágenes, CSP y SEO:**
   * Variables `TRUST_PROXY`, `COOKIE_SECURE`, `CORS_ORIGIN`/`CORS_ORIGINS`, `REFRESH_REPLAY_KEY` (obligatoria en producción).
   * `imagen_url` rechaza SVG y hosts locales/privados/metadatos (anti-SSRF).
   * Frontend con `React.lazy` + `Suspense`, CSP estricto en producción (`script-src 'self'`), `robots.txt`, `sitemap.xml`, Open Graph + `noindex` en rutas privadas/auth y pruebas `vitest-axe`.
5. **Posventa restringida a `RETRACTO_LEGAL` (`B-02`):**
   * El retracto parcial o total mantiene `pedido.estado_pedido = 'ENTREGADO'`; la procedencia legal se valida administrativamente (`PATCH .../decision`), la inspección física se registra por producto y cantidad en `detalle_retracto`, solo unidades en `BUEN_ESTADO` generan reingreso y reembolso, y las unidades rechazadas por `'DANADO'` no pueden volver a solicitarse.
6. **Calendario `festivo_colombia` (`M-05`) y reportes netos:**
   * Script `004_festivos_colombia_2025_2035.sql` (2025–2035), verificación *fail-fast* al iniciar `server.js` y `WARN` si falta el año siguiente, sin CRUD en panel administrativo.
   * Reportes en `America/Bogota` con filtros `desde`, `hasta` e `id_categoria`, límite máximo de `90 días` y `5000 filas`, descontando únicamente los importes **efectivamente reembolsados**.

---

## 5. Alcance vs. Exclusiones (`Goals` vs. `Non-Goals`)

| Incluido en v1 (`Goals`) | Excluido de v1 (`Non-Goals` / Mejoras futuras) |
| :--- | :--- |
| Roles `ADMIN` y `CLIENTE` (1 rol por usuario) + `Visitante` | Rol `VENDEDOR`, registro empresarial con `NIT`, estado `'BLOQUEADO'` |
| Access JWT en memoria + `bikestore_rt` (`sesion_refresh`) + `token_version` + `token_recuperacion` | Tabla heredada `token_revocacion` o consola selectiva multidispositivo (`logout` es global) |
| Idempotencia duradera `B1` (`carrito_fusion_idempotencia` 30d + `pedido` 2 fases) | Redis, RabbitMQ, Kafka o microservicios distribuidos |
| Cancelación pre-envío + `RETRACTO_LEGAL` (5 días hábiles) | `DEVOLUCION_COMERCIAL` voluntaria |
| Precios vigentes en productos (`NUMERIC(12,2)`) sin flete | Cálculo de fletes, prorrateo de envío, cupones/promociones, factura DIAN |
| Simulador síncrono `1:N` determinista en backend | Pasarela bancaria asíncrona real, abonos parciales o pagos mixtos |
| `imagen_url` externa (sin SVG/SSRF) y exportación Excel/PDF en frontend | Carga binaria (`multer`/S3) o renderizado binario Excel/PDF en Express |
| Venta online de bicicletas y accesorios en `localhost` | Módulo de taller/citas, módulo compras/proveedores y nube (`Sprint 7`) |

---

## 6. Estado actual de sincronización

`docs/designs/bikestore_v1.md`, `concepts_brief.md` y toda la documentación técnica, académica (`Diccionario_Datos_Viveros_Sanchez.xlsx`, `Ev_MER`, `Ev_DER`, `Ev_arquitecturaEnCapas`, `NOTA_ALCANCE_V1`, `HU`, `CU`) y de contrato API/Frontend están unificados bajo el modelo de **16 tablas**, sesiones `A1`, idempotencia `B1`, seguridad y rendimiento sin alterar los 3 PDF originales.
