# BikeStore Backend v1 (`Node.js` + `Express` + `PostgreSQL`)

API REST autónoma para BikeStore (`Web_BikeStore_svm`), basada en **16 tablas PostgreSQL exactas**, rotación de sesiones refresh (`A1`), idempotencia persistida (`B1`) y endurecimiento de seguridad y concurrencia.

## Requisitos
* **Node.js:** `26 LTS` (compatible en pruebas locales sobre `>=24.19.0`, manteniendo contrato objetivo `26 LTS` en `package.json`).
* **PostgreSQL:** `16+` / `18` con base de datos configurada en `DATABASE_URL` y base de pruebas separada en `TEST_DATABASE_URL`.

## Configuración inicial
1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET` y credenciales `SEED_ADMIN_*`.
2. Instalar dependencias (cero dependencias nuevas respecto al núcleo base):
   ```bash
   npm install
   ```
3. Ejecutar migraciones SQL (`001`–`005`), verificar festivos e insertar `ADMIN` semilla:
   ```bash
   npm run db:migrate
   npm run check:festivos
   npm run db:seed
   ```
4. Iniciar servidor de desarrollo o pruebas:
   ```bash
   npm run dev
   npm test
   ```

## Variables de entorno clave de seguridad y despliegue
* **`TRUST_PROXY`** *(default `false`)*: acepta `true`, `false`, entero (número de saltos) o cadena (`loopback`, etc.) y configura `app.set('trust proxy', env.TRUST_PROXY)` para `req.ip` tras proxy inverso.
* **`COOKIE_SECURE`**: en `NODE_ENV=production` es `true` por defecto (salvo `COOKIE_SECURE=false` explícito); en desarrollo/pruebas HTTP locales usar `false`.
* **`CORS_ORIGIN`**: lista separada por comas de orígenes permitidos (parseada en `env.CORS_ORIGINS`), habilitando `credentials: true` y validación CSRF de `Origin` en `/api/auth/refresh` y `/api/auth/logout` con cookie.
* **`REFRESH_REPLAY_KEY`**: **obligatoria en `production`** (`>= 32` caracteres y distinta de `JWT_SECRET`). Cifra el token hijo `T2` (`AES-256-GCM` + `HKDF-SHA256`) durante la ventana de replay de `30 s`. En desarrollo/test, si se omite se deriva determinísticamente vía `HKDF` a partir de `JWT_SECRET`.
* **`SMTP_TRANSPORT=json|smtp`**: en desarrollo local y `NODE_ENV=test` usar `json` (`jsonTransport` de `Nodemailer`, cero consumo de cuota Mailtrap). En `production` con `smtp` son obligatorias `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS`. `mailer.js` nunca imprime tokens ni enlaces de restablecimiento en logs.

## Seguridad, idempotencia y concurrencia (`005_sesiones_refresh_e_idempotencia.sql`)
* **Sesiones Refresh A1 (`sesion_refresh`, Tabla #15):** Cookie `HttpOnly` `bikestore_rt` (`Path=/api/auth`, `Max-Age=604800`, `SameSite=Lax`), CSRF (`Origin` + `X-Requested-With: BikeStore` → `403 CSRF_ORIGEN_INVALIDO`), `Idempotency-Key` UUID RFC 4122/9562 obligatorio (correlación de operación en ventana de `30 s`, no identidad criptográfica del cliente), detección de reúso (`401 SESION_REVOCADA`), expiración (`401 SESION_EXPIRADA`) y revocación global en `/logout`, cambio/restablecimiento de contraseña e inactivación/cambio de rol.
* **Idempotencia B1 (`carrito_fusion_idempotencia`, Tabla #16 + 3 columnas en `pedido`):** `POST /api/carrito/fusionar` exige `Idempotency-Key` UUID (retención garantizada de **30 días**, `id_carrito NULL ON DELETE SET NULL`). `POST /api/pedidos/:id/volver-al-carrito` exige `Idempotency-Key` UUID y opera en **2 fases sin rollback** (expira órdenes vencidas en Fase A con `COMMIT` y devuelve ítems en Fase B con `200 OK`).
* **Validación `imagen_url`:** Rechaza esquemas distintos de `http://`/`https://`, credenciales en URL, hosts locales/privados/metadatos (anti-SSRF) y formatos SVG (`.svg`, `.svgz`, `image/svg`, query `format`/`fm`/`ext=svg`).
* **Bloqueos y reintentos `40P01`/`40001`:** `withTransaction` reintenta hasta `3` veces con *backoff* + *jitter*; al agotarse responde **`503 CONFLICTO_CONCURRENCIA`**. Las actualizaciones de stock usan `FOR NO KEY UPDATE`.
* **Purga por lotes (`expiracionReservas.job.js`):** `purgarRegistrosExpiradosLote()` limpia `reemplazo_cifrado` vencido, `sesion_refresh` expiradas (`> 24h` o `> 30d` si `REUSO_DETECTADO`) y `carrito_fusion_idempotencia > 30d` (`LIMIT 100 SKIP LOCKED`, oportunista cada `15 min`).

## Gobierno anual de festivos (`festivo_colombia`)
* `004_festivos_colombia_2025_2035.sql` carga festivos oficiales de Colombia (2025–2035) de forma idempotente (`ON CONFLICT (fecha) DO NOTHING`).
* Al iniciar `server.js` (y mediante `npm run check:festivos`), el servidor ejecuta **fail-fast** si el año actual tiene `< 12` festivos y emite **`WARN`** si falta el año siguiente (`< 12`).
* Antes de diciembre de 2035 se debe agregar un script SQL versionado `00N_festivos_colombia_<rango>.sql` y re-ejecutar `npm run db:migrate` (sin CRUD UI en el panel administrativo).

## Documentación de contrato
* Especificación de endpoints, códigos HTTP/dominio y cabeceras: [docs/CONTRATO_API_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/backend/docs/CONTRATO_API_V1.md)
* Colección REST Client ejecutable: [docs/bikestore.http](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/backend/docs/bikestore.http)
