# Especificación Técnica de Diseño: BikeStore (`Web_BikeStore_svm`)

* **Autor:** Andrés Felipe – Juan Sánchez
* **Estado:** Revisado y consolidado (hallazgos de Etapas 5–9 resueltos; listo para `Orden 0` y `Fase 1`)
* **Fecha:** 2026-11-15
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

La solución cierra los contratos de 14 tablas PostgreSQL, las transacciones con jerarquía fija de bloqueos, la superficie REST completa y la verificación autónoma en backend antes de abrir la Etapa 2.

---

## Goals

### Propósito y objetivos funcionales del sistema (v1)
1. **Catálogo público y gestión administrativa de productos y categorías:** Exponer catálogo paginado (`page=1`, `limit=12`, máximo `50`) filtrado por categoría activa y ordenado por precio (`asc`/`desc`), ocultando productos de categorías inactivas (`producto.estado = TRUE AND categoria.estado = TRUE`) y mostrando agotados (`existencias = 0`) como `"Agotado"` sin compra habilitada (`CU-01`). Habilitar al `ADMIN` CRUD de categorías (inactivación lógica bloqueando borrado físico con productos asociados) y de productos (`imagen_url` externa `http://`/`https://`, separando la edición descriptiva del ajuste transaccional de `existencias`).
2. **Identidad, rol único, control de acceso y recuperación neutra:** Gestionar únicamente los roles `ADMIN` y `CLIENTE` (`Visitante` opera sin fila ni rol en BD), restringiendo cada usuario a **un único rol vigente** en `usuario_rol` con endpoint administrativo `PATCH /api/admin/usuarios/:id/rol` (`RF-28`) y estado `usuario.estado_usuario IN ('ACTIVO', 'INACTIVO')`. Registro para personas naturales colombianas y extranjeros residentes con validación sintáctica inicial por `tipo_documento` (`CC` Cédula de Ciudadanía, `TI` Tarjeta de Identidad, `CE` Cédula de Extranjería, `PASAPORTE` y `PPT` Permiso por Protección Temporal —sin afirmar verificación oficial ante entidades estatales—) y unicidad compuesta `(tipo_documento, numero_documento)`, nombres, apellidos (`segundo_apellido` opcional), `telefono`, `correo` único (*case-insensitive*, validado sintácticamente sin correo de activación según alcance v1 de `RF-14`) y `contrasena_hash` (`bcrypt`). JWT `HS256` con TTL `15m` y revocación inmediata en PostgreSQL mediante `usuario.token_version` (invalidando todas las sesiones activas al hacer `logout`, cambio/restablecimiento de contraseña, inactivación o cambio de rol), protección transaccional del último `ADMIN` activo y recuperación `CU-06` con `token_recuperacion` (`SHA-256`, TTL `60m`), respuesta HTTP `200` inmediata sin latencia SMTP bloqueante y transporte configurable `SMTP_TRANSPORT=json|smtp`.
3. **Continuidad del carrito entre visitante y cliente autenticado:** Almacenar `{ schema_version: 1, items: [{ id_producto, cantidad }] }` en `localStorage` para visitantes y fusionarlo de forma segura en PostgreSQL al autenticarse (`POST /api/carrito/fusionar` con `Idempotency-Key` opcional), descartando productos/categorías inactivas o con stock `0`, aplicando tope real de existencias, recalculando precios vigentes y devolviendo `ajustes[]`.
4. **Reserva transaccional de inventario y pagos simulados síncronos (`1:N`):** En checkout (`POST /api/pedidos`), si el precio de algún producto varió respecto al carrito, actualizar el carrito al precio vigente y rechazar con `HTTP 409 PRECIO_ACTUALIZADO` para confirmación del cliente; bloquear existencias por **15 minutos** en `'PENDIENTE'` (máximo 1 pedido `'PENDIENTE'` por usuario; usando `id_pedido` como identificador único de `RF-10`) sin cobro de envío en v1; ejecutar simulación síncrona `1:N` (`TARJETA`, `PSE`, `TRANSFERENCIA`) en **una única transacción atómica** donde el **backend determina el resultado** (prohibido aceptar un resultado ganador del cliente), conservando `'REEMBOLSADO'` en `pago.estado_pago` **exclusivamente para reembolsos totales**; liberar existencias de forma idempotente al expirar y exponer `POST /api/pedidos/:id/volver-al-carrito`.
5. **Posventa (cancelación pre-envío y `RETRACTO_LEGAL`):** Permitir cancelación antes de `'ENVIADO'` (`CLIENTE` con motivo opcional; `ADMIN` con motivo obligatorio), registrando datos y estado de reembolso directamente en `pedido` cuando el pedido cancelado estaba `'PAGADO'` (plazo legal 15 días calendario y confirmación vía `PATCH /api/admin/pedidos/:id/reembolso`). Tras `'ENTREGADO'`, v1 cubre exclusivamente **`RETRACTO_LEGAL`** (Ley 1480 de 2011 Art. 47 y Ley 2439 de 2024 sobre derechos en comercio electrónico: **5 días hábiles** en `America/Bogota` con tabla `festivo_colombia` 2025–2035), total o parcial previa validación administrativa de procedencia legal (sin asumir que todo retracto parcial procede automáticamente), con inspección física por **producto y cantidad**, reembolso solo de unidades que cumplan condiciones en `BUEN_ESTADO`, bloqueo de solicitudes repetidas sobre unidades rechazadas por daño y cierre contable exacto.
6. **Tablero y reportes netos para exportación en frontend:** Exponer métricas agregadas y reportes JSON acotados (`desde`, `hasta`, `id_categoria`, máximo `90 días` y `5000 filas`) descontando únicamente los importes **efectivamente reembolsados** (cancelaciones totales o retractos `REEMBOLSADO`), listos para exportación Excel y PDF en el frontend.

### Objetivos de integración Backend → Frontend (en dos etapas)
* **Etapa 1 (Backend verificable de forma autónoma):** Entregar esquema SQL de 14 tablas, API Express con validación `Zod`, pruebas unitarias y de integración (`node:test` + `supertest`) contra PostgreSQL real bajo `Node.js 26 LTS` y contrato `CONTRATO_API_V1.md` + `bikestore.http`.
* **Etapa 2 (Frontend coherente, bloqueada hasta aprobar Etapa 1):** Detallar el plan visual en `frontend/docs/PLAN_FRONTEND_V1.md`, aprobar su revisión de preparación antes del Paso `5.1` y construir `React` + `Vite` consumiendo la API cerrada de Etapa 1.

---

## Non-Goals (Límites del sistema v1)

Quedan explícitamente **fuera del alcance** de v1:

* **Devolución comercial voluntaria (`DEVOLUCION_COMERCIAL`):** Excluida de v1; posventa post-entrega se restringe estrictamente al `RETRACTO_LEGAL`.
* **Estado de usuario `'BLOQUEADO'`:** Solo operan `'ACTIVO'` e `'INACTIVO'`.
* **Sesiones selectivas multidispositivo (`token_revocacion`):** El cierre de sesión o cambio de seguridad invalida todas las sesiones activas del usuario vía `token_version`.
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

* No permanecen preguntas abiertas para la Etapa 1 (`Orden 0` a `Fase 4`). Todas las definiciones de esquema, posventa, seguridad, contratos y herramientas quedaron cerradas tras la resolución de las Etapas 5–9.
* El desglose granular de componentes y librerías de la **Fase 5 (Frontend)** queda intencionalmente diferido hasta completar y verificar los 8 puntos de compuerta de la Fase 4, sujeto a revisión formal de preparación antes del Paso `5.1`.

---

## Critical User Journeys (CUJs)

### CUJ 1: Navegación anónima, carrito temporal y fusión al autenticarse
* **Given:** Un visitante consulta catálogo paginado (`page=1`, `limit=12`, máx. `50`) sobre categorías y productos activos (`categoria.estado = TRUE AND producto.estado = TRUE`) y guarda en `localStorage` `{ "schema_version": 1, "items": [{ "id_producto": 1, "cantidad": 2 }] }`.
* **When:** Inicia sesión (`POST /api/auth/login`) o se registra (`POST /api/auth/registro`) y el cliente invoca `POST /api/carrito/fusionar` (con cabecera opcional `Idempotency-Key` para evitar sumas repetidas ante reintentos de red) antes de limpiar `localStorage`.
* **Then:** El backend crea o recupera el `carrito` en estado `'ACTIVO'` del usuario en PostgreSQL, descarta ítems inexistentes, inactivos, de categoría inactiva o con `existencias = 0`, limita cantidades al stock real disponible (`LEAST(cantidad_bd + cantidad_local, existencias)` cuando no sea reintento duplicado), recalcula `precio_unidad` con `producto.precio` vigente y devuelve el carrito persistido junto con `ajustes[]`.

### CUJ 2: Confirmación de pedido (`HU-03`), reserva de 15 minutos y pago síncrono `1:N` (`HU-14`)
* **Given:** Un `CLIENTE` `'ACTIVO'` tiene ítems en su carrito `'ACTIVO'`, envía `direccion_envio` y no tiene otro pedido `'PENDIENTE'` vigente.
* **When:** Confirma el pedido (`POST /api/pedidos`) y ejecuta intentos de pago (`POST /api/pedidos/:id/pagos`, con cabecera `Idempotency-Key` opcional y `{ metodo_pago, numero_referencia }`).
* **Then:**
  * En checkout (`POST /api/pedidos`), la transacción bloquea `carrito` (`FOR UPDATE`), ejecuta primero la expiración perezosa bloqueante (`FOR UPDATE`) sobre cualquier pedido `'PENDIENTE'` vencido del usuario para evitar colisión con el índice único parcial, verifica que todos los productos y categorías sigan activos y que `detalle_carrito.precio_unidad = producto.precio` (si algún precio varió, actualiza `detalle_carrito` al precio vigente, hace `COMMIT` de esa actualización o retorna con el nuevo carrito en `detalles` y responde **`HTTP 409 PRECIO_ACTUALIZADO`** para confirmación del cliente), adquiere bloqueos en orden ascendente `ORDER BY id_producto ASC FOR UPDATE`, descuenta existencias, calcula `pedido.total` exacto, crea `pedido` (`id_pedido` único) en `'PENDIENTE'` con `fecha_expiracion = CURRENT_TIMESTAMP + INTERVAL '15 minutes'` y marca `carrito` como `'CONVERTIDO'`.
  * En pago (`POST /api/pedidos/:id/pagos`), la transacción **bloquea primero `pedido` (`SELECT ... FOR UPDATE`)**, luego verifica `Idempotency-Key` (si existe con mismo payload retorna el intento previo; si varía el payload retorna `HTTP 409 IDEMPOTENCY_CONFLICT`), comprueba vigencia (`NOW() <= fecha_expiracion` o expira retornando `HTTP 409 RESERVA_EXPIRADA`) y ausencia de pago `'APROBADO'`. El **backend evalúa determinísticamente el simulador** sin aceptar banderas de resultado del cliente (`referencia` con sufijo de rechazo `'00'` → `'RECHAZADO'`; en otro caso válido → `'APROBADO'`), inserta nueva fila en `pago` (`1:N`) y si aprueba cambia el pedido a `'PAGADO'`.
  * Si un pedido pasa a `'CANCELADO'` (por expiración o cancelación), el cliente puede invocar `POST /api/pedidos/:id/volver-al-carrito`, que fusiona una única vez por pedido cancelado los ítems aún activos con stock disponible hacia su carrito `'ACTIVO'` devolviendo `ajustes[]`.

### CUJ 3: Cancelación pre-envío y `RETRACTO_LEGAL` con inspección por producto y cantidad
* **Given:** Un pedido está en `'PENDIENTE'` o `'PAGADO'` (pre-envío), o en `'ENTREGADO'` con saldo pendiente dentro del plazo legal de retracto.
* **When:** El `CLIENTE` (motivo opcional) o `ADMIN` (motivo obligatorio) cancela antes de `'ENVIADO'`, o el `CLIENTE` solicita `RETRACTO_LEGAL` (`POST /api/pedidos/:id/retractos`) total o parcial dentro de los **5 días hábiles** en `America/Bogota` tras `fecha_entrega`.
* **Then:**
  * En cancelación pre-envío, el pedido pasa a `'CANCELADO'`, se reintegran existencias y, si tenía pago `'APROBADO'`, la misma transacción guarda en `pedido` `datos_reembolso_cancelacion`, `estado_reembolso_cancelacion = 'PENDIENTE_REEMBOLSO'` y `fecha_limite_reembolso_cancelacion = CURRENT_TIMESTAMP + INTERVAL '15 days'`. Cuando el `ADMIN` confirma el reembolso (`PATCH /api/admin/pedidos/:id/reembolso`), `pedido.estado_reembolso_cancelacion` pasa a `'REEMBOLSADO'` con `fecha_reembolso_cancelacion` y `pago.estado_pago` pasa a `'REEMBOLSADO'` (reembolso total del pedido).
  * En posventa sobre `'ENTREGADO'`, `pedido.estado_pedido` **permanece en `'ENTREGADO'`**. El backend valida cobertura anual en `festivo_colombia`, calcula el plazo hasta el límite `< dia_6 00:00:00-05:00` en `America/Bogota`, bloquea `detalle_pedido` (`FOR UPDATE`) verificando que las unidades solicitadas no excedan `detalle_pedido.cantidad` menos unidades de retractos previos (incluidas unidades previamente rechazadas tras inspección física por `'DANADO'`), registra `retracto` (`SOLICITADO`) y `detalle_retracto`. El `ADMIN` revisa procedencia legal (`PATCH /api/admin/retractos/:id/decision`, pues un retracto parcial no procede automáticamente si incumple condiciones legales), inspecciona físicamente **por producto y cantidad** (`PATCH /api/admin/retractos/:id/recepcion`: `cantidad_buen_estado` + `cantidad_danada = cantidad_devuelta`), reingresa únicamente `cantidad_buen_estado`, calcula `monto_reembolso` solo sobre unidades en buen estado (si es `0`, cierra como `RECHAZADO` con `estado_reembolso = 'NO_APLICA'` y `fecha_limite_reembolso = NULL` sin permitir re-solicitud sobre esas unidades) y al registrar reembolso (`PATCH /api/admin/retractos/:id/reembolso`) marca `retracto.estado_reembolso = 'REEMBOLSADO'`, actualizando `pago.estado_pago = 'REEMBOLSADO'` **únicamente si el acumulado reembolsado alcanza el 100 % de `pedido.total`**.

### CUJ 4: Recuperación segura (`CU-06`), gestión administrativa de usuarios/roles (`RF-28`) y reportes netos
* **Given:** Un usuario solicita recuperar contraseña o un `ADMIN` gestiona catálogo, usuarios/roles, pedidos, retractos o tablero.
* **When:** Envía `POST /api/auth/recuperar` o `ADMIN` invoca `/api/admin/...`.
* **Then:** `/api/auth/recuperar` aplica *rate limiting*, invalida tokens previos sin usar si el usuario `'ACTIVO'` existe, guarda el nuevo `token_hash` (`SHA-256`, TTL 60 min), ejecuta `COMMIT` y **despacha el `HTTP 200` neutro de inmediato**, enviando el correo vía `Nodemailer` (`SMTP_TRANSPORT=json|smtp`) de forma no bloqueante registrando errores en log. En `/api/auth/login`, si el correo no existe, se ejecuta un `bcrypt.compare` ficticio para evitar canal lateral por latencia. En administración, `ADMIN` asigna rol único (`PATCH /api/admin/usuarios/:id/rol`) o estado (`PATCH /api/admin/usuarios/:id/estado`) protegiendo transaccionalmente que exista al menos un `ADMIN` activo (`409 ULTIMO_ADMIN_ACTIVO`), incrementando `token_version` ante cualquier cambio. `/api/admin/reportes/*` calcula ventas netas reales descontando solo montos **efectivamente reembolsados**.

---

## Technical Plan (Architecture)

### 1. Arquitectura de capas y frontera Backend ↔ Frontend

```mermaid
flowchart LR
    subgraph FE["Etapa 2: Frontend (React + Vite - localhost:5173)"]
        UI["Vistas Públicas / Cliente / Admin"]
        LS["localStorage (carrito visitante v1)"]
        EXP["Exportación Excel / PDF (cliente)"]
    end

    subgraph BE["Etapa 1: Backend REST (Node.js 26 LTS + Express - localhost:3000)"]
        MW["Middlewares (Auth JWT+BD, Role Guard, Zod Validate, Rate Limit, Error)"]
        CTRL["Controllers (HTTP & Status Codes)"]
        SRV["Services (Reglas de negocio y transacciones)"]
        DBJS["src/config/db.js (Pool pg + withTransaction)"]
        JOB["Job expiracionReservas (SKIP LOCKED limitado)"]
        FEST["Utilidad días hábiles (festivo_colombia)"]
        MAIL["Utilidad mailer.js (Nodemailer json/Mailtrap)"]
    end

    subgraph DATA["Persistencia y Servicios Externos"]
        PG[("PostgreSQL (14 tablas, SQL versionado)")]
        SMTP["Mailtrap SMTP (Manual/Demo) / jsonTransport (Test)"]
    end

    UI -->|HTTP(S)/JSON + Bearer JWT| MW
    LS -->|Fusión al autenticar| UI
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

* **Frontera entre etapas:** El backend expone JSON uniforme bajo `/api/...` con respuestas de éxito `{ ok: true, datos, meta? }` y de error `{ ok: false, codigo, mensaje, detalles? }`, CORS restringido a `CORS_ORIGIN`, colección `backend/docs/bikestore.http` y contrato `backend/docs/CONTRATO_API_V1.md` verificados antes de iniciar el frontend.
* **Convención de capas internas en backend:** Separación estricta `routes/` (enrutamiento y middlewares `auth`, `role`, `rateLimit`, `validate`) → `controllers/` (parseo HTTP y status codes) → `services/` (lógica de negocio, transacciones y consultas SQL parametrizadas mediante `backend/src/config/db.js`, sin carpeta `repositories/` adicional).

### 2. Estructura objetivo del repositorio (`Web_BikeStore_svm`)

```text
Web_BikeStore_svm/
├── .gitignore                           # node_modules/, .env, coverage/, frontend/dist/
├── Documentacion-Escencial-BikeStore/   # Artefactos SENA + _respaldo_originales/
├── docs/designs/bikestore_v1.md         # Especificación técnica central
├── concepts_brief.md                    # Brief conceptual sincronizado
├── design_draft.md                      # Puntero hacia docs/designs/bikestore_v1.md
├── backend/                             # Etapa 1 (Node.js 26 LTS + Express + pg)
│   ├── docs/
│   │   ├── CONTRATO_API_V1.md
│   │   ├── bikestore.http
│   │   └── README.md
│   ├── sql/
│   │   ├── 001_schema_inicial.sql
│   │   ├── 002_indices_y_reglas.sql
│   │   ├── 003_seed_roles_categorias.sql
│   │   └── 004_festivos_colombia_2025_2035.sql
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js
│   │   │   └── db.js                    # Pool pg (SET TIME ZONE 'UTC') + withTransaction
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js
│   │   │   ├── role.middleware.js
│   │   │   ├── validate.middleware.js   # Esquemas Zod estrictos
│   │   │   ├── rateLimit.middleware.js
│   │   │   └── error.middleware.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── perfil.routes.js
│   │   │   ├── catalogo.routes.js
│   │   │   ├── carrito.routes.js
│   │   │   ├── pedidos.routes.js
│   │   │   ├── retractos.routes.js
│   │   │   └── admin.routes.js
│   │   ├── controllers/                 # auth, perfil, catalogo, carrito, pedidos, retractos, admin
│   │   ├── services/                    # auth, perfil, catalogo, carrito, pedidos, retractos, admin
│   │   ├── utils/
│   │   │   ├── password.js
│   │   │   ├── jwt.js
│   │   │   ├── documento.js
│   │   │   ├── decimal.js               # Aritmética entera en centavos
│   │   │   ├── festivos.js              # Cálculo días hábiles America/Bogota
│   │   │   └── mailer.js                # Nodemailer (SMTP_TRANSPORT=json|smtp)
│   │   ├── scripts/
│   │   │   ├── migrate.js               # Ejecuta 001..004 en orden
│   │   │   ├── seedAdmin.js             # Inserta ADMIN inicial usando SEED_ADMIN_* y bcrypt
│   │   │   └── checkFestivos.js         # Valida cobertura festivo_colombia
│   │   ├── jobs/
│   │   │   └── expiracionReservas.job.js
│   │   ├── app.js                       # Express sin listen() ni timers activos
│   │   └── server.js                    # Arranque HTTP, checkFestivos, job y apagado SIGINT/SIGTERM
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── documento.test.js
│   │   │   ├── decimal.test.js
│   │   │   └── festivos.test.js
│   │   └── integration/
│   │       ├── auth.test.js
│   │       ├── catalogo_carrito.test.js
│   │       ├── pedidos_concurrencia.test.js
│   │       ├── retractos.test.js
│   │       └── admin_reportes.test.js
│   ├── .env.example
│   └── package.json
└── frontend/                            # Etapa 2 (React + Vite; detalle previo al Paso 5.1)
    └── docs/PLAN_FRONTEND_V1.md
```

### 3. Modelo de datos PostgreSQL actualizado (14 tablas exactas)

#### 3.1. Definición consolidada de las 11 tablas base actualizadas
*(Incluye columnas completas clave, restricciones `CHECK`/`UNIQUE` y políticas `ON DELETE` para derivar `001_schema_inicial.sql` sin depender de abrir el Excel binario).*

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
| **`pedido`** | `id_pedido SERIAL PRIMARY KEY`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT`, `direccion_envio VARCHAR(255) NOT NULL`, `total NUMERIC(12,2) NOT NULL CHECK (total > 0)`, `estado_pedido VARCHAR(20) NOT NULL CHECK (estado_pedido IN ('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO'))`, `fecha_pedido TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `fecha_expiracion TIMESTAMPTZ NOT NULL`, `fecha_envio TIMESTAMPTZ NULL`, `fecha_entrega TIMESTAMPTZ NULL`, `fecha_cancelacion TIMESTAMPTZ NULL`, `motivo_cancelacion TEXT NULL`, `cancelado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL`, `estado_reembolso_cancelacion VARCHAR(30) NOT NULL DEFAULT 'NO_APLICA' CHECK (estado_reembolso_cancelacion IN ('NO_APLICA', 'PENDIENTE_REEMBOLSO', 'REEMBOLSADO'))`, `datos_reembolso_cancelacion VARCHAR(500) NULL`, `fecha_limite_reembolso_cancelacion TIMESTAMPTZ NULL`, `fecha_reembolso_cancelacion TIMESTAMPTZ NULL`. Reglas: `UNIQUE (id_usuario) WHERE estado_pedido = 'PENDIENTE'`, más `CHECK` de consistencia temporal (`ENVIADO` → `fecha_envio IS NOT NULL`, `ENTREGADO` → `fecha_entrega IS NOT NULL`, `CANCELADO` → `fecha_cancelacion IS NOT NULL`). |
| **`detalle_pedido`** | `id_detalle_pedido SERIAL PRIMARY KEY`, `id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT`, `id_producto INTEGER NOT NULL REFERENCES producto(id_producto) ON DELETE RESTRICT`, `cantidad INTEGER NOT NULL CHECK (cantidad > 0)`, `precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario > 0)`, `UNIQUE (id_pedido, id_producto)`. |
| **`pago`** | `id_pago SERIAL PRIMARY KEY`, `id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT`, `metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('TARJETA', 'PSE', 'TRANSFERENCIA'))`, `referencia_simulada VARCHAR(40) NOT NULL`, `numero_intento INTEGER NOT NULL CHECK (numero_intento > 0)`, `monto NUMERIC(12,2) NOT NULL CHECK (monto > 0)`, `estado_pago VARCHAR(20) NOT NULL CHECK (estado_pago IN ('APROBADO', 'RECHAZADO', 'REEMBOLSADO'))` *(donde `'REEMBOLSADO'` aplica **exclusivamente** cuando el 100 % del pedido fue efectivamente reembolsado —por cancelación pre-envío o retracto total acumulado—; mientras haya reembolso en trámite o solo devolución parcial, `pago.estado_pago` permanece `'APROBADO'`)*, `clave_idempotencia VARCHAR(100) NULL`, `payload_hash VARCHAR(64) NULL`, `motivo_resultado VARCHAR(255) NULL`, `fecha_pago TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Índices únicos: `UNIQUE (id_pedido) WHERE estado_pago IN ('APROBADO', 'REEMBOLSADO')`, `UNIQUE (id_pedido, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL`, `UNIQUE (id_pedido, numero_intento)`. |

#### 3.2. Tres tablas nuevas requeridas por v1
1. **`retracto`**: `id_retracto SERIAL PRIMARY KEY`, `id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE RESTRICT`, `id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT`, `tipo_retracto VARCHAR(20) NOT NULL CHECK (tipo_retracto IN ('TOTAL', 'PARCIAL'))` *(derivado/verificado en servidor)*, `motivo VARCHAR(500) NOT NULL`, `datos_reembolso VARCHAR(500) NOT NULL` *(sin PAN/CVV completos)*, `estado_retracto VARCHAR(30) NOT NULL CHECK (estado_retracto IN ('SOLICITADO', 'APROBADO_RECEPCION', 'COMPLETADO', 'RECHAZADO'))`, `estado_reembolso VARCHAR(30) NOT NULL CHECK (estado_reembolso IN ('PENDIENTE_REEMBOLSO', 'REEMBOLSADO', 'NO_APLICA'))`, `monto_reembolso NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_reembolso >= 0)` *(calculado inicialmente sobre unidades solicitadas y ajustado tras inspección únicamente por `cantidad_buen_estado`; si es `0`, `estado_reembolso = 'NO_APLICA'` y `estado_retracto = 'RECHAZADO'`)*, `fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `fecha_limite_reembolso TIMESTAMPTZ NULL` *(obligatoria cuando `estado_reembolso <> 'NO_APLICA'`)*, `fecha_recepcion_fisica TIMESTAMPTZ NULL`, `fecha_reembolso TIMESTAMPTZ NULL`, `revisado_por INTEGER NULL REFERENCES usuario(id_usuario) ON DELETE SET NULL`, `observacion_admin VARCHAR(500) NULL`.
2. **`detalle_retracto`**: `id_detalle_retracto SERIAL PRIMARY KEY`, `id_retracto INTEGER NOT NULL REFERENCES retracto(id_retracto) ON DELETE CASCADE`, `id_detalle_pedido INTEGER NOT NULL REFERENCES detalle_pedido(id_detalle_pedido) ON DELETE RESTRICT`, `cantidad_devuelta INTEGER NOT NULL CHECK (cantidad_devuelta > 0)`, `cantidad_buen_estado INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_buen_estado >= 0)`, `cantidad_danada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_danada >= 0)`, `subtotal_reembolso NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_reembolso >= 0)`, `estado_inspeccion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_inspeccion IN ('PENDIENTE', 'BUEN_ESTADO', 'PARCIAL', 'DANADO'))`, `observacion_inspeccion VARCHAR(300) NULL`, `UNIQUE (id_retracto, id_detalle_pedido)`, `CHECK (estado_inspeccion = 'PENDIENTE' OR (cantidad_buen_estado + cantidad_danada = cantidad_devuelta))`. *Control de integridad contra doble devolución:* al crear solicitud se bloquea `detalle_pedido FOR UPDATE` y se valida `SUM(cantidad_devuelta de retractos donde estado_retracto <> 'RECHAZADO' OR fecha_recepcion_fisica IS NOT NULL) + nueva_cantidad <= detalle_pedido.cantidad`; así, toda unidad que ya fue **rechazada tras inspección física por daño** sigue consumiendo el cupo y no puede volver a solicitarse.
3. **`festivo_colombia`**: `fecha DATE PRIMARY KEY`, `anio INTEGER NOT NULL`, `nombre VARCHAR(120) NOT NULL`, `CHECK (anio = EXTRACT(YEAR FROM fecha))`.

#### 3.3. Índices de rendimiento y regla de reportes netos (`002_indices_y_reglas.sql`)
* Índices de consulta: `CREATE UNIQUE INDEX ux_usuario_correo_lower ON usuario (LOWER(correo))`, `idx_producto_catalogo ON producto (estado, id_categoria, precio)`, `idx_pedido_usuario_fecha ON pedido (id_usuario, fecha_pedido DESC)`, `idx_pedido_pendiente_expiracion ON pedido (fecha_expiracion) WHERE estado_pedido = 'PENDIENTE'`, `idx_pago_fecha ON pago (fecha_pago)` y `idx_retracto_estado ON retracto (estado_retracto, fecha_solicitud DESC)`.
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

#### 4.2. Jerarquía de bloqueos, checkout, `volver-al-carrito` y expiración híbrida
* **Jerarquía estricta de locks:** Todo flujo transaccional bloquea en el mismo orden ascendente para prevenir *deadlocks*: **`carrito` → `pedido` → `detalle_pedido` → `producto (ORDER BY id_producto ASC)`**.
* **Checkout (`POST /api/pedidos`):** Bloquea `carrito` (`FOR UPDATE`); ejecuta expiración perezosa bloqueante (`FOR UPDATE`, nunca `SKIP LOCKED`) de cualquier pedido `'PENDIENTE'` ya vencido del usuario para liberar el índice único parcial; valida ítems activos (`producto.estado = TRUE AND categoria.estado = TRUE`) y precios (`detalle_carrito.precio_unidad = producto.precio`: ante cualquier diferencia, actualiza el carrito al precio vigente y responde **`HTTP 409 PRECIO_ACTUALIZADO`** con detalle); bloquea productos en `ORDER BY id_producto ASC FOR UPDATE`, verifica stock, descuenta, inserta `pedido` + `detalle_pedido` y marca `carrito = 'CONVERTIDO'`.
* **Job periódico (`expiracionReservas.job.js`):** Selecciona lotes de hasta `LIMIT 20` pedidos vencidos con `FOR UPDATE SKIP LOCKED` y procesa **cada pedido en su propia transacción** llamando al helper idempotente (`UPDATE pedido ... WHERE id_pedido = $1 AND estado_pedido = 'PENDIENTE' RETURNING id_pedido`, restituyendo stock **solo si devuelve 1 fila**). Incluye guarda booleana contra solapamiento entre ticks, captura de errores BD sin derribar el proceso y configuración por `RESERVA_SWEEP_INTERVAL_MS` (`60000` en local; `0` deshabilita el timer en PaaS con hibernación).
* **`volver-al-carrito` y fusión de carrito:** `POST /api/pedidos/:id/volver-al-carrito` aplica únicamente a pedidos en `'CANCELADO'` del cliente; exige protección de idempotencia (o cabecera `Idempotency-Key`) para no duplicar cantidades ante doble clic, omitiendo productos/categorías inactivas o con stock `0` y devolviendo `ajustes[]`.

#### 4.3. Autenticación (`token_version`), rol único, recuperación `CU-06` y endurecimiento
* **JWT `HS256` revocable sin tabla adicional:** Payload `{ sub: id_usuario, rol, tv: token_version }`, algoritmo fijado explícitamente en `HS256` (rechazando `none`), TTL `JWT_EXPIRES_IN=15m`. El middleware `auth` valida en una consulta SQL que `usuario.estado_usuario = 'ACTIVO'`, `usuario.token_version = tv` y el rol vigente coincida con `usuario_rol JOIN rol`. `POST /api/auth/logout`, cambio/restablecimiento de contraseña, inactivación o cambio de rol incrementan `token_version = token_version + 1`.
* **Protección del último `ADMIN` (`RF-28`):** Tanto `PATCH /api/admin/usuarios/:id/estado` como `PATCH /api/admin/usuarios/:id/rol` bloquean filas activas de administradores (`FOR UPDATE`) y rechazan con **`HTTP 409 ULTIMO_ADMIN_ACTIVO`** si quedarían `< 1` administradores en estado `'ACTIVO'`.
* **Login, recuperación `CU-06` y endurecimiento:**
  * Contraseña mínima `8` caracteres, `bcrypt` (`BCRYPT_ROUNDS >= 10`); `POST /api/auth/login` ejecuta `bcrypt.compare` contra un hash ficticio cuando el correo no existe para mantener tiempo uniforme.
  * `POST /api/auth/recuperar` aplica *rate limiting* (IP + correo normalizado `trim().toLowerCase()`), invalida tokens previos sin usar (`fecha_uso IS NULL`), genera token de `32` bytes aleatorios guardando su `SHA-256` en `token_recuperacion` con TTL `60m`, ejecuta `COMMIT`, **retorna `HTTP 200` neutro inmediatamente** y despacha `Nodemailer` (`SMTP_TRANSPORT=json|smtp`, timeout `5 s`) de forma no bloqueante capturando fallos en log. `POST /api/auth/restablecer` exige `usuario.estado_usuario = 'ACTIVO'` y aplica también *rate limiting* (igual que `/registro`).
  * `validate.middleware.js` (`Zod`) aplica *allowlists* estrictas por DTO (*mass assignment* imposible), tamaño JSON máximo `100kb`, escape de `%` y `_` en búsquedas `ILIKE` y validación sintáctica en `datos_reembolso*` prohibiendo almacenar números completos de tarjeta/CVV; `imagen_url` valida `http://`/`https://` (advirtiendo preferencia `https://` y sin `fetch` desde servidor para impedir SSRF). `PUT /api/perfil` prohíbe editar `tipo_documento`, `numero_documento`, `correo`, `rol` o `estado_usuario`; cambio de contraseña autenticado ocurre en `PATCH /api/perfil/contrasena`.

#### 4.4. Gobierno de `festivo_colombia` (`2025–2035`) y 5 días hábiles
* **Cálculo exacto en `America/Bogota`:** Convierte `fecha_entrega` a fecha local en `America/Bogota` y avanza día por día excluyendo sábados, domingos y festivos hasta completar **5 días hábiles**; la solicitud procede mientras `NOW() < (dia_habil_5 + 1 day) AT TIME ZONE 'America/Bogota'` (cubriendo hasta el último microsegundo del 5.º día hábil).
* **Semilla y verificación:** `004_festivos_colombia_2025_2035.sql` carga 2025–2035 con `ON CONFLICT (fecha) DO NOTHING`. Al iniciar `server.js` (y vía `npm run check:festivos`), si el año actual tiene `< 12` festivos registrados **aborta el arranque (*fail-fast*)**; si falta el año siguiente (`< 12` festivos), emite alerta explícita `WARN`. Antes de cada cálculo legal, valida cobertura de los `20 días` calendario posteriores a `fecha_entrega` (margen conservador para cubrir 5 días hábiles incluso con puentes y fines de semana consecutivos), respondiendo **`HTTP 500 CALENDARIO_FESTIVOS_INCOMPLETO`** si faltara un año fuera de rango.

#### 4.5. Superficie cerrada de contratos REST (`/api/...`)

**Validación sintáctica inicial de `numero_documento` (normalizando `trim().toUpperCase()`, sin implicar verificación oficial estatal):**
`CC`: `^[0-9]{6,10}$` | `TI`: `^[0-9]{10,11}$` | `CE`: `^[A-Za-z0-9]{6,10}$` | `PASAPORTE`: `^[A-Za-z0-9]{5,20}$` | `PPT`: `^[0-9]{6,15}$`.

| Dominio | Método y ruta exacta | Acceso | Parámetros / Contrato clave |
| :--- | :--- | :--- | :--- |
| **Sistema** | `GET /api/health` | Público | `HTTP 200` `{ ok: true, datos: { estado: 'UP', bd: true } }`. |
| **Auth** | `POST /api/auth/registro`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/recuperar`, `POST /api/auth/restablecer` | Público / Auth (`logout`) | `rateLimit` en los 4 públicos; respuesta neutra `HTTP 200` en `/recuperar`. |
| **Perfil** | `GET /api/perfil`, `PUT /api/perfil`, `PATCH /api/perfil/contrasena` | Auth | `PUT` edita nombre/apellidos/teléfono únicamente; `PATCH` verifica contraseña actual e incrementa `token_version`. |
| **Catálogo** | `GET /api/categorias`, `GET /api/productos`, `GET /api/productos/:id` | Público | `/productos`: `?id_categoria=&q=&orden_precio=asc\|desc&page=1&limit=12` (máx `50`), oculta inactivos de producto o categoría. |
| **Carrito** | `GET /api/carrito`, `POST /api/carrito/fusionar`, `POST /api/carrito/items`, `PATCH /api/carrito/items/:id_producto`, `DELETE /api/carrito/items/:id_producto` | `CLIENTE` | `POST /fusionar` admite `Idempotency-Key` y retorna carrito + `ajustes[]`. |
| **Pedidos y pagos** | `POST /api/pedidos`, `GET /api/pedidos`, `GET /api/pedidos/:id`, `POST /api/pedidos/:id/pagos`, `POST /api/pedidos/:id/cancelar`, `POST /api/pedidos/:id/volver-al-carrito` | `CLIENTE` | Paginación `?page=1&limit=10`; `/pagos` recibe `{ metodo_pago, referencia_simulada }` + `Idempotency-Key`; `/cancelar` recibe `motivo_cancelacion?` y `datos_reembolso` si `PAGADO`. |
| **Retracto** | `POST /api/pedidos/:id/retractos`, `GET /api/retractos`, `GET /api/retractos/:id` | `CLIENTE` | `POST` recibe `{ motivo, datos_reembolso, items: [{ id_detalle_pedido, cantidad }] }`. |
| **Admin Catálogo** | `GET/POST /api/admin/categorias`, `PUT /api/admin/categorias/:id`, `PATCH /api/admin/categorias/:id/estado`; `GET/POST /api/admin/productos`, `PUT /api/admin/productos/:id`, `PATCH /api/admin/productos/:id/estado`, `PATCH /api/admin/productos/:id/existencias` | `ADMIN` | Borrado de categoría con productos bloqueado (`RESTRICT`); `PUT /productos/:id` no modifica `existencias` (se ajusta en `PATCH .../existencias`). |
| **Admin Usuarios** | `GET /api/admin/usuarios`, `PATCH /api/admin/usuarios/:id/estado`, `PATCH /api/admin/usuarios/:id/rol` | `ADMIN` | `?page=1&limit=20`; ambos `PATCH` protegen último `ADMIN` activo (`409 ULTIMO_ADMIN_ACTIVO`) e incrementan `token_version`. |
| **Admin Pedidos y Retractos** | `GET /api/admin/pedidos`, `PATCH /api/admin/pedidos/:id/estado`, `PATCH /api/admin/pedidos/:id/reembolso`; `GET /api/admin/retractos`, `GET /api/admin/retractos/:id`, `PATCH /api/admin/retractos/:id/decision`, `PATCH /api/admin/retractos/:id/recepcion`, `PATCH /api/admin/retractos/:id/reembolso` | `ADMIN` | `/pedidos/:id/estado` gestiona `ENVIADO`/`ENTREGADO`/`CANCELADO` (motivo obligatorio al cancelar); `/retractos/:id/decision` valida procedencia legal; `/recepcion` registra `cantidad_buen_estado` y `cantidad_danada`; `/reembolso` registra pago devuelto. |
| **Reportes** | `GET /api/admin/reportes/resumen`, `GET /api/admin/reportes/ventas` | `ADMIN` | `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_categoria=` en `America/Bogota`; máx `90 días` y `5000 filas`; calcula ventas netas descontando reembolsos efectivos. |

**Catálogo cerrado de códigos HTTP y `codigo` de dominio:** `200`, `201`, `400 VALIDACION_INVALIDA` / `RANGO_REPORTES_EXCEDIDO`, `401 TOKEN_INVALIDO` / `CREDENCIALES_INVALIDAS` / `SESION_REVOCADA`, `403 ROL_NO_AUTORIZADO` / `USUARIO_INACTIVO`, `404 RECURSO_NO_ENCONTRADO`, `409 CORREO_DUPLICADO` / `DOCUMENTO_DUPLICADO` / `STOCK_INSUFICIENTE` / `PRECIO_ACTUALIZADO` / `PEDIDO_PENDIENTE_ACTIVO` / `RESERVA_EXPIRADA` / `PEDIDO_YA_PAGADO` / `IDEMPOTENCY_CONFLICT` / `TRANSICION_ESTADO_INVALIDA` / `PLAZO_RETRACTO_VENCIDO` / `CANTIDAD_RETRACTO_EXCEDIDA` / `ULTIMO_ADMIN_ACTIVO` / `CATEGORIA_CON_PRODUCTOS`, `429 RATE_LIMIT_EXCEDIDO`, `500 CALENDARIO_FESTIVOS_INCOMPLETO` / `ERROR_INTERNO`.

---

## Alternatives Considered

Cada alternativa descartada sintetiza las decisiones técnicas de [concepts_brief.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/concepts_brief.md) y de la revisión arquitectónica (`ALT-01` a `ALT-18`), evaluadas estrictamente por criterios técnicos y de alcance:

### Tema 1: Flujo documental, motor de datos y acceso SQL
* **`ALT-01` — Congelar `MER`/`DER` y Diccionario antes de actualizar `HU` y `CU`:** Cualquier regla surgida al detallar `HU`/`CU` obligaría a reabrir el esquema relacional y los scripts SQL. Descartada frente al flujo `Respaldo → HU + CU → Auditoría → MER + DER + Diccionario → Arquitectura → Backend → Frontend`.
* **`ALT-02` — Mantener `MySQL` (heredado del diagrama SVG inicial):** Carece de índices únicos parciales declarativos nativos (`WHERE estado_pago IN (...)`) y de la sintaxis `TIMESTAMPTZ` / `SKIP LOCKED` aprovechada en PostgreSQL.
* **`ALT-03` — Adoptar un ORM (`Prisma` o `Sequelize`) en lugar de `pg` directo (`db.js`):** Oculta el control explícito sobre bloqueos ordenados `ORDER BY id_producto ASC FOR UPDATE` y añade generación opaca de migraciones sobre un esquema de 14 tablas. Reconsiderable solo si el proyecto migrara a TypeScript con modelos extensos.

### Tema 2: Modelo de pagos, inventario y reservas
* **`ALT-04` — Relación `1:1` sobrescrita (`UPSERT`) en `pago` tras intentos `'RECHAZADO'`:** Destruiría el historial auditable de intentos fallidos dentro de la ventana de 15 minutos; la relación `1:N` con índice único parcial conserva trazabilidad completa.
* **`ALT-05` — Simulación asíncrona en dos micro-transacciones con `'PENDIENTE'` intermedio:** Crearía riesgo de intentos huérfanos en BD ante caídas locales sin existir pasarela externa asíncrona. Reconsiderable en v2 al integrar pasarela bancaria real con *webhooks*.
* **`ALT-06` — Descontar `producto.existencias` únicamente al aprobarse el pago:** Permitiría que dos usuarios avancen concurrentemente hacia pago por la última unidad provocando errores al capturar cobro.
* **`ALT-07` — Expiración de 15 minutos solo con `setTimeout` en Node.js:** Se pierde ante reinicios del proceso dejando stock bloqueado; `fecha_expiracion` en PostgreSQL más expiración híbrida idempotente persiste ante fallos.
* **`ALT-08` — Introducir `Redis + BullMQ` para reservas y sesiones:** Añade infraestructura distribuida externa innecesaria en un servidor único `localhost` v1; PostgreSQL cubre concurrencia y revocación bajo el volumen esperado de la entrega local. Reconsiderable si escala a múltiples réplicas con alto tráfico.
* **`ALT-09` — Re-agregar automáticamente ítems expirados al carrito:** Alteraría el carrito sin consentimiento ocultando variaciones de stock y precio; la acción explícita `volver-al-carrito` informa `ajustes[]`.

### Tema 3: Identidad, documentos, sesiones y recuperación
* **`ALT-10` — JWT *stateless*, Access+Refresh Token o tabla adicional `token_revocacion`:** JWT puro *stateless* impide revocar sesiones al cerrar sesión (`CU-12`/`HU-10`) o inactivar cuentas (`HU-09`); Access+Refresh Token añade flujo de rotación y almacenamiento extra en frontend/backend innecesario en v1; mantener una tabla `token_revocacion` junto a `token_version` duplica mecanismos y exige job de limpieza sin requerirse sesiones selectivas por dispositivo. Incrementar `usuario.token_version` en una sola consulta indexada cubre revocación inmediata en 14 tablas.
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

* **Seguridad y privacidad:** Hash `bcrypt` (`BCRYPT_ROUNDS >= 10`), `token_recuperacion` como `SHA-256` (TTL `60m`), JWT `HS256` (`15m`) con `token_version`, consultas parametrizadas (`$1, $2...`) en `pg`, `helmet`, CORS restringido a `CORS_ORIGIN`, *rate limiting* en `/login`, `/registro`, `/recuperar` y `/restablecer`, validación estricta con `Zod`, exclusión de `contrasena_hash` en respuestas y prohibición de PAN/CVV en textos de reembolso.
* **Integridad, dinero y concurrencia:** Aislamiento `READ COMMITTED`, jerarquía fija `carrito → pedido → detalle_pedido → producto ORDER BY id_producto ASC FOR UPDATE`, `CHECK (existencias >= 0)`, `NUMERIC(12,2)` operando en centavos enteros en Node.js (`utils/decimal.js`) o PostgreSQL (sin punto flotante binario), máximo 1 `PENDIENTE` por cliente y 1 `'APROBADO'` por pedido.
* **Zona horaria:** Sesión `pg` en `UTC` (`SET TIME ZONE 'UTC'`), almacenamiento en `TIMESTAMPTZ` y conversión explícita a `America/Bogota` (`UTC-5`) en vencimientos legales de 5 días hábiles y reportes.
* **Verificabilidad autónoma de Etapa 1:** Superar suite unitaria (`node:test`) y de integración/concurrencia (`node:test` + `supertest`) contra PostgreSQL real (`TEST_DATABASE_URL`) cubriendo los 8 puntos de compuerta del *Verification Plan* y entregar `CONTRATO_API_V1.md` + `bikestore.http`.

---

## Risks & Limits

1. **Cuota gratuita de Mailtrap Sandbox (~50 correos/mes, 10 guardados, límite de ráfagas por 10 s):** Las ejecuciones repetidas de pruebas automatizadas o QA consumirían la cuota devolviendo errores `535`/`429`. *Mitigación:* usar `SMTP_TRANSPORT=json` (`jsonTransport` de `Nodemailer`) en desarrollo local y `NODE_ENV=test`, reservando Mailtrap SMTP real únicamente para validación manual controlada en `bikestore.http` o demostración, y despachando envíos de forma no bloqueante tras responder `HTTP 200`.
2. **Despliegue futuro en PaaS / PostgreSQL gratuito (hibernación y límites de cómputo/conexiones):** En servicios web gratuitos que suspenden instancias inactivas tras ~15 min o bases gratuitas con límite mensual de horas activas, un polling cada 60 s impediría hibernar la BD o dejaría de correr al suspender el servidor. *Mitigación:* el tamaño de `pg.Pool` se parametriza con `DB_POOL_MAX=10`, la expiración perezosa transaccional garantiza exactitud sin depender del job periódico y `RESERVA_SWEEP_INTERVAL_MS` admite `0` para deshabilitar el timer en entornos gratuitos con hibernación.
3. **Almacén en memoria de `express-rate-limit`:** Los contadores se reinician al reiniciar el proceso y aplican por instancia única (`localhost`). *Mitigación:* suficiente para v1 en proceso único; si escalara a múltiples réplicas, requeriría almacenamiento compartido (`PostgreSQL` o `Redis`).
4. **Capacidad de memoria al exportar reportes Excel/PDF en navegador:** Exportar históricos completos sin acotar causaría degradación de memoria en cliente. *Mitigación:* `/api/admin/reportes/ventas` impone rango máximo de `90 días` y tope de `5000 filas` por petición.
5. **Cobertura del calendario `festivo_colombia` posterior a 2035:** Requiere añadir un script `00N_festivos_colombia_<rango>.sql` antes de diciembre de 2035; el arranque falla rápidamente si falta el año actual y advierte si falta el siguiente.

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

Este plan sigue estrictamente la secuencia **`Orden 0 (Respaldo) → Fase 1 (HU + CU + Escenarios) → Fase 2 (MER + DER + Diccionario) → Fase 3 (Arquitectura) → Fase 4 (Backend Etapa 1) → Fase 5 (Frontend Etapa 2, bloqueada hasta aprobar Fase 4 y realizar segunda revisión)`**. Ningún archivo editable en `Documentacion-Escencial-BikeStore/` se modifica sin respaldo previo y ninguna tarea de frontend inicia antes de aprobar los 8 puntos del *Verification Plan* del backend.

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
| `Documentacion-Escencial-BikeStore/Ev_DER_MER/Ev_MER_viveros_sanchez.xml` y `Ev_MER_viveros_sanchez.drawio.png` | `.xml` + `.png` | Modificar XML + re-exportar PNG | Actualizar a exactamente **14 entidades** (sin `token_revocacion`): `pedido`–`pago` (`1:N`), añadir `retracto`, `detalle_retracto`, `festivo_colombia`, corregir atributos en `usuario`, `usuario_rol` (`1:1`), `pedido` (reembolso cancelación) y `pago`. | Fase 1 | 2.1 | Coincidencia nominal de las 14 entidades y cardinalidades en XML y `.drawio.png` re-exportado. |
| `Documentacion-Escencial-BikeStore/Ev_DER_MER/Ev_DER_viveros_sanchez.xml` y `Ev_DER_viveros_sanchez.drawio.png` | `.xml` + `.png` | Modificar XML + re-exportar PNG | Actualizar exactamente las **14 tablas**, PKs, FKs, políticas `ON DELETE`, tipos PostgreSQL (`TIMESTAMPTZ`, `NUMERIC(12,2)`) e índices únicos parciales conforme a Sección 3.1–3.3. | Paso 2.1 | 2.2 | DER XML y `.drawio.png` re-exportado reflejan exactamente las 14 tablas y restricciones de Sección 3. |
| `Documentacion-Escencial-BikeStore/Diccionario_datos/Diccionario_Datos_Viveros_Sanchez.xlsx` | `.xlsx` (11 hojas) | Modificar (respaldado en 0.1) | Actualizar las 11 hojas existentes y añadir 3 hojas (`retracto`, `detalle_retracto`, `festivo_colombia`) completando las **14 hojas** con columnas, longitudes, nulabilidad, `ON DELETE` y dominios exactos de Sección 3. | Paso 2.2 | 2.3 | Excel validado con 14 hojas y cero menciones residuales a `MySQL`, `VENDEDOR`, `NIT`, `BLOQUEADO`, `DEVOLUCION_COMERCIAL` o `ñ` en identificadores SQL. |

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
> **Compuerta obligatoria:** Los pasos de Fase 5 permanecen bloqueados durante Etapa 1. Al superar los 8 puntos del *Verification Plan* de Fase 4, el equipo creará `frontend/docs/PLAN_FRONTEND_V1.md` (fijando `react-router-dom`, librería Excel/PDF y listado exacto de páginas y componentes) y ejecutará una **segunda auditoría de preparación para implementación** antes de abrir el Paso `5.1`.

| Nombre y ubicación | Formato actual | Acción | Cambios específicos | Dependencias | Orden | Criterio de terminado (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `frontend/package.json` y `frontend/vite.config.js` | Nuevo (Etapa 2) | Crear (Etapa 2) | Proyecto `React + Vite`, proxy hacia `localhost:3000` y librerías definidas en `PLAN_FRONTEND_V1.md`. | 8 puntos Verification Plan Fase 4 + revisión `PLAN_FRONTEND_V1.md` | 5.1 | `npm run build` finaliza con código de salida `0`. |
| `frontend/src/api/client.js`, `frontend/src/utils/visitorCart.js`, `frontend/src/utils/exportadores.js` | Nuevo (Etapa 2) | Crear (Etapa 2) | Cliente HTTP acoplado a `CONTRATO_API_V1.md` (`409 PRECIO_ACTUALIZADO`, `Idempotency-Key`), `localStorage` (`schema_version = 1`), fusión y exportadores Excel/PDF cliente desde `/api/admin/reportes/*`. | Paso 5.1 | 5.2 | Pruebas unitarias/componentes de carrito visitante, fusión y exportación sin errores. |
| Páginas y componentes definidos en `frontend/docs/PLAN_FRONTEND_V1.md` | Nuevo (Etapa 2) | Crear (Etapa 2) | Vistas públicas, cliente y admin completas sin modificar contrato API de Etapa 1. | Paso 5.2 | 5.3 | Lista de chequeo E2E con evidencia de ejecución exitosa de `CUJ 1..CUJ 4` contra backend real. |

---

### Verification Plan

> [!IMPORTANT]
> **Principio de evidencia por fase:** Ninguna fase se cierra por existencia de archivos o respaldos; cada cierre requiere verificar su DoD y registrar la evidencia en `REGISTRO_CAMBIOS.md`.

#### Criterios de verificación para Documentación (Fases 1–3)
* **Auditoría previa de escenarios:** `MAPEO_AUDITORIA_ESCENARIOS.md` completo (8/8 `.docx` y 8 UML) cerrado antes de modificar `Escenarios+plantillas_casos_de_uso/` o `CASOS_DE_USO_UML/`.
* **Consistencia transversal:** Revisión cruzada entre `NOTA_ALCANCE_V1.md`, `HU_BikeStore_definitivo.md`, `CU_BikeStore_definitivo.md`, los `.docx` actualizados, los UML `.png`, `Ev_MER_viveros_sanchez.xml`/`.drawio.png`, `Ev_DER_viveros_sanchez.xml`/`.drawio.png`, `Diccionario_Datos_Viveros_Sanchez.xlsx` (14 hojas) y `Ev_arquitecturaEnCapas_Viveros_Sanchez.svg`/`.png`: cero referencias residuales a `MySQL`, `VENDEDOR`, `NIT`, `BLOQUEADO`, `DEVOLUCION_COMERCIAL`, `token_revocacion`, `Upload · imágenes` o exportación binaria en backend, con árbol espejo completo en `_respaldo_originales/`.

#### Criterios de verificación autónoma para el Backend (Fase 4 — compuerta obligatoria antes de Fase 5)
Solo puede habilitarse la planificación detallada y ejecución de Fase 5 tras demostrar los **8 puntos siguientes**:
1. **Contrato API cerrado:** `backend/docs/CONTRATO_API_V1.md` alineado 1:1 con rutas, cabeceras, validaciones Zod, payloads de éxito/error y catálogo de `codigo` de Sección 4.5.
2. **Colección HTTP ejecutable:** `backend/docs/bikestore.http` con todos los flujos principales probados contra `localhost:3000`.
3. **Esquema PostgreSQL e índices verificados:** `001`–`004` + `seedAdmin.js` ejecutados en BD limpia verificando las **14 tablas** en `\dt`, todos los índices únicos/parciales en `\d+`, `>= 12` festivos/año 2025–2035 y `npm run check:festivos` en `0`.
4. **Conexión real PostgreSQL (`UTC`):** `db.js` con sesión verificada en `UTC` y toda la suite `node --test` + `supertest` corriendo contra `TEST_DATABASE_URL` real (sin BD en memoria).
5. **Matriz de autenticación, roles y seguridad:** `auth.test.js` verificando `CC/TI/CE/PASAPORTE/PPT`, unicidad `(tipo_documento, numero_documento)` e `LOWER(correo)`, `401` tras logout/inactivación/cambio de rol (`token_version`), `403`, `409 ULTIMO_ADMIN_ACTIVO`, *rate limit* `429` en los 4 endpoints públicos y `200` inmediato con envío no bloqueante (`SMTP_TRANSPORT=json`) en `CU-06` + `bcrypt` en `login` sin filtrar cuentas. *(Verificación puntual adicional contra Mailtrap Sandbox real con petición manual en `bikestore.http` cuidando cuota de 50/mes).*
6. **Matriz de concurrencia (inventario, pagos y expiración):** `pedidos_concurrencia.test.js` verificando compra concurrente de última unidad (`1` éxito / `0` stock negativo), `409 PRECIO_ACTUALIZADO`, doble clic con `Idempotency-Key` (`1` intento / `409 IDEMPOTENCY_CONFLICT` si cambia payload), rechazo desde backend (`referencia` `'00'`) → reintento `'APROBADO'`, y carrera entre checkout/pago perezoso vs `expiracionReservas.job.js` tras actualizar `fecha_expiracion` en BD (`ROW_COUNT = 1`, stock devuelto exactamente una vez).
7. **Matriz de integración comercial y posventa:** `catalogo_carrito.test.js`, `retractos.test.js` y `admin_reportes.test.js` cubriendo categoría inactiva oculta/bloqueada, fusión idempotente y `volver-al-carrito` ante stock `0`/inactivos, cancelación pre-envío + `PATCH .../reembolso` (`pago` total `'REEMBOLSADO'`), `RETRACTO_LEGAL` en frontera `America/Bogota` (`23:59` vs `00:01` tras 5.º día hábil con festivo), inspección mixta por cantidad (`BUEN_ESTADO`/`DANADO`), bloqueo de re-solicitud tras daño físico, reembolso parcial sin marcar pago total `'REEMBOLSADO'` y reportes netos con tope `90 días`/`5000 filas` + `id_categoria`.
8. **Integridad transaccional y manejo de fallos:** Comprobación explícita de `ROLLBACK` ante fallos internos (cero intentos huérfanos en `pago`), códigos `CHECK`/`UNIQUE`/`RESTRICT`, límite JSON `100kb`, formato uniforme `{ ok: false, codigo, mensaje, detalles }` y salida limpia de `npm test` (`exit 0`, `0` skipped).
