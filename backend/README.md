# BikeStore Backend v1 (`Node.js` + `Express` + `PostgreSQL`)

API REST autónoma para la **Etapa 1** de BikeStore (`Web_BikeStore_svm`).

## Requisitos
* **Node.js:** `26 LTS` (compatible en pruebas locales sobre `>=24.19.0`, manteniendo contrato objetivo `26 LTS` en `package.json`).
* **PostgreSQL:** `16+` / `18` con base de datos configurada en `DATABASE_URL` y base de pruebas separada en `TEST_DATABASE_URL`.

## Configuración inicial
1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET` y credenciales `SEED_ADMIN_*`.
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Ejecutar migraciones SQL (`001`–`004`), verificar festivos e insertar `ADMIN` semilla:
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

## Gobierno anual de festivos (`festivo_colombia`)
* `004_festivos_colombia_2025_2035.sql` carga festivos oficiales de Colombia (2025–2035) de forma idempotente (`ON CONFLICT (fecha) DO NOTHING`).
* Al iniciar `server.js` (y mediante `npm run check:festivos`), el servidor ejecuta **fail-fast** si el año actual tiene `< 12` festivos y emite **`WARN`** si falta el año siguiente (`< 12`).
* Antes de diciembre de 2035 se debe agregar un script SQL versionado `00N_festivos_colombia_<rango>.sql` y re-ejecutar `npm run db:migrate` (sin CRUD UI en el panel administrativo).

## Correo transaccional (`SMTP_TRANSPORT`)
* En desarrollo local y pruebas (`NODE_ENV=test`), usar `SMTP_TRANSPORT=json` (`jsonTransport` de `Nodemailer`, cero consumo de cuota Mailtrap).
* Para demostración o verificación manual en [docs/bikestore.http](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/backend/docs/bikestore.http), usar `SMTP_TRANSPORT=smtp` con las credenciales de Mailtrap Sandbox (~50 correos/mes).
