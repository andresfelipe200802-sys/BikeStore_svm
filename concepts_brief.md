# Concepto del Proyecto: BikeStore (`Web_BikeStore_svm`)

* **Autor:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-15
* **Estado:** Concepto consolidado y sincronizado con `docs/designs/bikestore_v1.md` (hallazgos de Etapas 5–9 resueltos; listo para `Orden 0` y `Fase 1`)
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
* El carrito del visitante vive en `localStorage` (`schema_version = 1`) y se fusiona de forma segura e idempotente (`Idempotency-Key`) en PostgreSQL al autenticarse.
* El checkout reserva existencias por **15 minutos** en estado `'PENDIENTE'` (máximo 1 pedido `'PENDIENTE'` por cliente, sin cobro de envío en v1); si algún precio cambió en catálogo, actualiza el carrito al precio vigente y responde `HTTP 409 PRECIO_ACTUALIZADO` para confirmación del cliente.
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

1. **Esquema PostgreSQL de 14 tablas exactas:** 11 tablas base actualizadas (`rol`, `usuario`, `usuario_rol` con `UNIQUE (id_usuario)`, `token_recuperacion`, `categoria`, `producto`, `carrito`, `detalle_carrito`, `pedido`, `detalle_pedido`, `pago`) más 3 tablas nuevas (`retracto`, `detalle_retracto`, `festivo_colombia`).
2. **Identidad, sesiones y rol único (`M-03`):**
   * `usuario.estado_usuario` admite estrictamente `'ACTIVO'` e `'INACTIVO'` (sin `'BLOQUEADO'` en v1).
   * Validación sintáctica inicial para `CC`, `TI`, `CE`, `PASAPORTE` y `PPT` con unicidad `(tipo_documento, numero_documento)`, sin afirmar validación oficial ante autoridades estatales.
   * JWT `HS256` (`15m`) revocable mediante `usuario.token_version` (sin tabla `token_revocacion`): `logout`, cambio/restablecimiento de contraseña, inactivación o cambio de rol (`PATCH /api/admin/usuarios/:id/rol`) incrementan `token_version` y protegen al último `ADMIN` activo (`409 ULTIMO_ADMIN_ACTIVO`).
   * `POST /api/auth/recuperar` responde `HTTP 200` neutro de inmediato y envía correo por `Nodemailer` (`SMTP_TRANSPORT=json|smtp`) de forma no bloqueante, cuidando la cuota gratuita de Mailtrap Sandbox (~50 correos/mes).
3. **Estados de pedido, pagos `1:N` y cancelación pre-envío (`B-01`):**
   * `pedido.estado_pedido` conserva exclusivamente `('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO')`.
   * `pago.estado_pago` conserva `('APROBADO', 'RECHAZADO', 'REEMBOLSADO')`; `'REEMBOLSADO'` aplica **exclusivamente** cuando el 100 % del pedido fue reembolsado.
   * Las cancelaciones pre-envío de pedidos `'PAGADO'` registran estado, datos y fechas de reembolso directamente sobre `pedido`, confirmándose vía `PATCH /api/admin/pedidos/:id/reembolso`.
   * Aritmética monetaria exacta en `NUMERIC(12,2)` (centavos enteros en `utils/decimal.js`).
4. **Posventa restringida a `RETRACTO_LEGAL` (`B-02`):**
   * El retracto parcial o total mantiene `pedido.estado_pedido = 'ENTREGADO'`; la procedencia legal se valida administrativamente (`PATCH .../decision`), la inspección física se registra por producto y cantidad en `detalle_retracto`, solo unidades en `BUEN_ESTADO` generan reingreso y reembolso, y las unidades rechazadas por `'DANADO'` no pueden volver a solicitarse.
5. **Calendario `festivo_colombia` (`M-05`):**
   * Script `004_festivos_colombia_2025_2035.sql` (2025–2035, idempotente vía `ON CONFLICT (fecha) DO NOTHING`), verificación *fail-fast* al iniciar `server.js` si el año actual tiene `< 12` festivos y advertencia `WARN` si falta el año siguiente, sin CRUD en panel administrativo.
6. **Tablero y reportes netos (`B-01`):**
   * Reportes en `America/Bogota` con filtros `desde`, `hasta` e `id_categoria`, límite máximo de `90 días` y `5000 filas`, descontando únicamente los importes **efectivamente reembolsados** (cancelaciones totales o retractos `REEMBOLSADO`).

---

## 5. Alcance vs. Exclusiones (`Goals` vs. `Non-Goals`)

| Incluido en v1 (`Goals`) | Excluido de v1 (`Non-Goals` / Mejoras futuras) |
| :--- | :--- |
| Roles `ADMIN` y `CLIENTE` (1 rol por usuario) + `Visitante` | Rol `VENDEDOR`, registro empresarial con `NIT`, estado `'BLOQUEADO'` |
| JWT `HS256` + `token_version` + `token_recuperacion` | Tabla `token_revocacion` o sesiones selectivas multidispositivo |
| Cancelación pre-envío + `RETRACTO_LEGAL` (5 días hábiles) | `DEVOLUCION_COMERCIAL` voluntaria |
| Precios vigentes en productos (`NUMERIC(12,2)`) sin flete | Cálculo de fletes, prorrateo de envío, cupones/promociones, factura DIAN |
| Simulador síncrono `1:N` determinista en backend | Pasarela bancaria asíncrona real, abonos parciales o pagos mixtos |
| `imagen_url` externa y exportación JSON -> Excel/PDF en frontend | Carga binaria (`multer`/S3) o renderizado binario Excel/PDF en Express |
| Venta online de bicicletas y accesorios en `localhost` | Módulo de taller/citas, módulo compras/proveedores y nube (`Sprint 7`) |

---

## 6. Siguiente paso inmediato

Con `docs/designs/bikestore_v1.md`, `concepts_brief.md` y el puntero `design_draft.md` sincronizados tras la resolución `/egm-resolve`, el proyecto está listo para iniciar **`Orden 0` (`_respaldo_originales/` + `REGISTRO_CAMBIOS.md`)** y posteriormente la **`Fase 1` (`NOTA_ALCANCE_V1.md`, `HU_BikeStore_definitivo.md`, `CU_BikeStore_definitivo.md` y auditoría previa de escenarios)** tras aprobación del propietario.
