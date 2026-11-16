# Nota de Alcance v1 — Conciliación sobre Guía Didáctica BikeStore

* **Autores:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-15
* **Documento fuente conservado intacto:** [ProyectoDidactico-BikeStore-Aprendiz.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/ProyectoDidactico-BikeStore-Aprendiz.pdf)
* **Especificación técnica de referencia:** [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md)

---

## 1. Propósito de esta nota

La guía didáctica [ProyectoDidactico-BikeStore-Aprendiz.pdf](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/Documentacion-Escencial-BikeStore/Proyecto_guia_inicial/ProyectoDidactico-BikeStore-Aprendiz.pdf) se conserva **intacta** en su carpeta original como artefacto histórico del programa ADSO (SENA CBI Palmira). Esta nota concilia sus requisitos (`RF-01..RF-31`, `RNF-01..RNF-12`) y narrativa introductoria frente a los límites cerrados en [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md) (`Non-Goals`) y [concepts_brief.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/concepts_brief.md).

---

## 2. Conciliación de requisitos y terminología de la guía inicial

| Elemento en `ProyectoDidactico-BikeStore-Aprendiz.pdf` | Interpretación / Conciliación oficial para v1 | Ubicación en `bikestore_v1.md` |
| :--- | :--- | :--- |
| **`RNF-12` (`localhost`) vs. `Sprint 7` ("Desplegar la aplicación en un servidor en la nube")** | La entrega evaluada de v1 opera en servidor local (`localhost`, puertos `3000` backend y `5173` frontend), cumpliendo `RNF-12` y la tabla de alcance inicial ("Aplicación desplegada en servidor localhost"). El despliegue productivo en nube (`Sprint 7` de página 8) queda diferido como etapa posterior de infraestructura sin alterar la lógica de negocio ni las capas REST. | `Overview`, `Non-Goals`, `Risks & Limits` |
| **`RF-10` ("El sistema deberá generar un número único para cada pedido")** | En v1 se utiliza `pedido.id_pedido` (`SERIAL PRIMARY KEY`, único e irrepetible) como identificador oficial de cada pedido. No se introduce una segunda columna alfanumérica de radicado en v1. | `Goals (4)`, `§3.1 (pedido)`, `§4.2` |
| **`RF-14` ("El sistema deberá validar el correo electrónico durante el registro")** | Se cumple mediante validación sintáctica estricta del formato de correo y verificación de unicidad *case-insensitive* (`LOWER(correo)`) en PostgreSQL (`409 CORREO_DUPLICADO`). No incluye envío de correo de activación de cuenta en el registro para proteger la cuota gratuita de Mailtrap Sandbox (~50 correos/mes) y evitar fricción fuera de `HU-04`. | `Goals (2)`, `§3.1 (usuario)`, `Risks & Limits` |
| **Mención narrativa a "promociones" (pág. 1)** | Excluida de v1. Todos los pedidos calculan importes exactos con el precio unitario vigente de `producto.precio` (`NUMERIC(12,2)`). | `Non-Goals` |
| **Mención a "entradas de mercancía" y "cargar compras" (págs. 1, 7 y 8)** | Excluido el módulo de compras a proveedores o recepción de almacén en v1. El `ADMIN` ajusta inventario manualmente mediante `PATCH /api/admin/productos/:id/existencias`, y en posventa solo reingresan unidades en `BUEN_ESTADO` derivadas de un `RETRACTO_LEGAL`. | `Non-Goals`, `Future Improvements` |
| **Mención a "Generación de factura para pago" (pág. 7, Sprint 4)** | Excluida la facturación electrónica DIAN. El checkout y pago generan el registro persistente del pedido (`pedido`, `detalle_pedido`, `pago`) y su comprobante/resumen de compra en JSON para visualización en pantalla. | `Non-Goals` |
| **`RF-26` ("Exportar los informes en formato Excel o PDF")** | El backend expone reportes JSON acotados (`90 días`, `5000 filas`, filtros `desde`, `hasta`, `id_categoria`) con ventas netas reales en `America/Bogota`; la generación y descarga de los archivos Excel y PDF se ejecuta en el frontend (`Etapa 2`). | `Goals (6)`, `Non-Goals`, `§4.5` |
| **`RF-28` ("Asignar roles a los usuarios")** | En v1 cada usuario posee **un único rol vigente** (`ADMIN` o `CLIENTE`) en `usuario_rol` (`UNIQUE (id_usuario)`), administrado mediante `PATCH /api/admin/usuarios/:id/rol` con protección transaccional del último `ADMIN` activo (`409 ULTIMO_ADMIN_ACTIVO`) e invalidación de sesión vía `token_version`. | `Goals (2)`, `§3.1 (usuario_rol)`, `§4.3` |

---

## 3. Matriz completa de exclusiones v1 (`Non-Goals`)

Los siguientes elementos quedan **explícitamente excluidos de la versión 1**, tanto de la base de datos como de la API y vistas:

| Concepto excluido en v1 | Razón técnica y de alcance | Estado frente a `docs/designs/bikestore_v1.md` |
| :--- | :--- | :--- |
| **`VENDEDOR` (rol intermedio)** | Eliminado de `rol`, `usuario_rol`, endpoints y vistas; solo operan `ADMIN`, `CLIENTE` y `Visitante` anónimo. | Mapeado 1:1 en `Non-Goals` |
| **`NIT` (perfiles empresariales / personas jurídicas)** | v1 atiende únicamente personas naturales con validación sintáctica inicial para `CC`, `TI`, `CE`, `PASAPORTE` y `PPT` (sin afirmar validación oficial estatal). | Mapeado 1:1 en `Non-Goals` y `Future Improvements` |
| **`'BLOQUEADO'` (tercer estado en `usuario.estado_usuario`)** | `usuario.estado_usuario` admite estrictamente `'ACTIVO'` e `'INACTIVO'`. | Mapeado 1:1 en `Non-Goals` |
| **`DEVOLUCION_COMERCIAL` (devolución voluntaria no amparada por ley)** | La posventa post-entrega de v1 se limita estrictamente al **`RETRACTO_LEGAL`** (5 días hábiles en `America/Bogota`). | Mapeado 1:1 en `Non-Goals` y `Future Improvements` |
| **Tabla `token_revocacion` y sesiones selectivas multidispositivo** | La revocación inmediata de JWT `HS256` (`15m`) se resuelve con `usuario.token_version` en las **14 tablas** del esquema. | Mapeado 1:1 en `Non-Goals` y `ALT-10` |
| **Servicios de taller, mantenimiento y citas** | Sin agenda técnica ni órdenes de reparación de bicicletas en v1. | Mapeado 1:1 en `Non-Goals` y `Future Improvements` |
| **Módulo de proveedores y compras de mercancía** | Sin órdenes de compra a proveedores ni entradas de almacén en v1. | Mapeado 1:1 en `Non-Goals` y `Future Improvements` |
| **Promociones, cupones y facturación electrónica DIAN** | Sin motor de descuentos ni emisión tributaria DIAN en v1. | Mapeado 1:1 en `Non-Goals` |
| **Cálculo de fletes y tarifas de envío por ubicación** | `pedido.total` suma exclusivamente productos y cantidades; sin cobro ni prorrateo de transporte en v1. | Mapeado 1:1 en `Non-Goals` y `Future Improvements` |
| **Administración UI de `festivo_colombia`** | La tabla `festivo_colombia` (2025–2035) se mantiene mediante scripts SQL versionados (`004_festivos_colombia_2025_2035.sql`). | Mapeado 1:1 en `Non-Goals` y `ALT-17` |
| **Carga binaria de imágenes (`Upload` / `multer` / S3)** | `producto.imagen_url` almacena URL externa (`http://`/`https://`) sin subida binaria al servidor Express. | Mapeado 1:1 en `Non-Goals` y `ALT-14` |
| **Pagos reales, mixtos, parciales o pasarela asíncrona** | El simulador opera en transacción síncrona única determinista (`TARJETA`, `PSE`, `TRANSFERENCIA`) en relación `1:N`. | Mapeado 1:1 en `Non-Goals` y `Future Improvements` |
| **Renderizado binario Excel/PDF en backend e infraestructura distribuida externa** | Reportes desde backend en JSON acotado; exportación Excel/PDF en frontend (`Etapa 2`); ejecución en `localhost` sin Redis, RabbitMQ, Kafka ni microservicios. | Mapeado 1:1 en `Non-Goals` |

---

## 4. Trazabilidad garantizada para Historias de Usuario y Casos de Uso

Toda Historia de Usuario (`HU-01..HU-19`) y Caso de Uso (`CU-01..CU-19`) redactados en Fase 1 deben cumplir esta nota de alcance como regla obligatoria antes de intervenir `Ev_MER`, `Ev_DER`, `Diccionario_Datos_Viveros_Sanchez.xlsx`, `Ev_arquitecturaEnCapas_Viveros_Sanchez.svg` o la carpeta `backend/`.
