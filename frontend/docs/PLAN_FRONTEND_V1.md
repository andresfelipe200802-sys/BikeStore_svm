# Plan de Arquitectura, Branding y Ejecución Frontend v1 (`PLAN_FRONTEND_V1.md`)

* **Proyecto:** BikeStore (`Web_BikeStore_svm`) — **Etapa 2 / Fase 5**
* **Autores:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-15
* **Contrato backend consumido:** [CONTRATO_API_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/backend/docs/CONTRATO_API_V1.md) *(Etapa 1 verificada `21/21` pruebas contra PostgreSQL 18 real)*
* **Referencia maestra:** [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md)

---

## 1. Principios rectores de Etapa 2

1. **Estabilidad Backend-First:** El frontend consume los endpoints cerrados de `/api/...` sin alterar contratos REST, reglas de negocio ni esquema SQL de Etapa 1. Ningún dato de precios, disponibilidad o resultado de pago se confía al navegador: el backend es fuente única de verdad (`409 PRECIO_ACTUALIZADO`, `409 RESERVA_EXPIRADA`, simulador determinista en servidor).
2. **Interfaz íntegramente en español:** Todos los menús, títulos, etiquetas de formulario, validaciones, estados operativos, mensajes al usuario, encabezados de tablas y reportes exportados a Excel/PDF se redactan en **español claro**. Se conservan en inglés únicamente identificadores de protocolo/código interno donde sea técnicamente necesario (ej. nombres de cabeceras HTTP `Authorization`, `Idempotency-Key`).
3. **100 % herramientas y librerías gratuitas:** Todas las dependencias frontend (`React`, `Vite`, `react-router-dom`, `write-excel-file`, `jspdf`, `jspdf-autotable`, `@fontsource-variable/*`, `vitest`) utilizan licencias libres (MIT/Apache) con ejecución local autónoma en `localhost:5173`.
4. **Cero dependencias a GitHub desde el agente:** El control remoto en GitHub permanece bajo responsabilidad exclusiva del propietario.

---

## 2. Estudio comparativo de las 5 referencias inspeccionadas (`/browser`)

| Referencia real inspeccionada | Elementos que aprovechamos para BikeStore | Elementos descartados y motivo |
| :--- | :--- | :--- |
| **`https://dinamosites.com/`** *(Dark studio-craft + motion ligero)* | • Tipografía **`Instrument Sans`** (titulares técnicos) + **`Manrope`** (UI legible).<br>• Navbar sticky translúcida (`backdrop-filter: blur(18px)`).<br>• **Hero oscuro de alto impacto** con línea luminosa animada CSS (`@keyframes heroCurrent`) + `<canvas>` 2D orgánico ligero y micro-transiciones `0.18s`.<br>• Stack React + Vite limpio **sin librerías pesadas de animación** (cero GSAP/Three.js). | • Portada 100 % oscura en todas las secciones *(para catálogo transaccional, precios, carrito y tablas administrativas, un lienzo dominante claro mejora lectura y escaneo)*. |
| **`https://bicistore.com.co/`** *(E-commerce de ciclismo en Colombia)* | • Franja superior de **5 categorías destacadas** (`Bicicletas de Ruta`, `Montaña`, `Urbanas`, `Cascos y Protección`, `Accesorios`).<br>• Grilla de producto de 4 columnas en escritorio (`border-radius: 10px`).<br>• Badge explícito **`"Agotado"`** con botón de compra deshabilitado (`CU-01`).<br>• Bloque oscuro de 4 beneficios de marca y drawer/resumen claro de carrito. | • Sobrecarga de WordPress + Elementor + Slider Revolution (`256+` requests iniciales).<br>• Widgets flotantes de Chaty/WhatsApp y reCAPTCHA. |
| **`https://www.bmw.com.co/`** *(Showroom automotriz claro y preciso)* | • Claridad del lienzo blanco/gris técnico para fichas de producto.<br>• Pestañas limpias de filtrado por categoría con transición suave (`0.3s cubic-bezier`).<br>• Botones secundarios *outline* contrastados y tarjetas destacadas asimétricas. | • Tipografía propietaria (`BMWTypeNext`) y carruseles pesados de configurador 3D externo. |
| **`https://www.auteco.com.co/kawasaki`** *(Energía deportiva y acento neón)* | • Uso controlado de verde neón (`#B8FF67` / `#84CC16`) como señal de energía deportiva y llamada a la acción. | • Invasión de overlays (`LeadModal` con video autoplay, dock inferior de chat, formularios largos de captación y `275` requests de analítica). |
| **`https://www.ferrari.com/en-EN/formula1`** *(Narrativa editorial de prestigio y velocidad)* | • Contraste dramático en bloques editoriales oscuros del Hero, tarjetas limpias con jerarquía nítida y footer corporativo ordenado por columnas sobre carbón `#181818`. | • Fuentes pagas (`Ferrari-Sans`), doble barra fija superior y `visibility: hidden` tipográfico por carácter que degrada accesibilidad/CLS. |

---

## 3. Estrategia integral de Branding y Regla de Color **60 – 30 – 10**

### 3.1. Personalidad y valores de marca (`BikeStore`)
**BikeStore** proyecta **precisión mecánica, energía ciclista y compra transparente**:
* **Entrada editorial tecnológica:** El visitante es recibido por un Hero oscuro tipo taller/pista (`dinamosites.com` + `Ferrari F1`) con movimiento fluido gratuito que transmite velocidad e ingeniería moderna sin ruido comercial.
* **Compra e-commerce cristalina:** Al entrar al catálogo, ficha, carrito, checkout y panel `ADMIN`, el entorno respira en superficie clara de alta legibilidad (`BiciStore` + `BMW`), con montos en pesos colombianos (`COP`) usando cifras tabulares (`tabular-nums`) y estados legales claros (`RESERVA 15 MIN`, `RETRACTO LEGAL 5 DÍAS HÁBILES`).

### 3.2. Paleta exacta **60 – 30 – 10** y tokens CSS (`src/styles/tokens.css`)

| Proporción | Rol visual | Tokens y valores Hex | Uso concreto en la interfaz y contraste WCAG |
| :---: | :--- | :--- | :--- |
| **60 %** | **Dominante** *(Lienzo principal limpio)* | `--bg-canvas: #F4F5F6`<br>`--bg-surface: #FFFFFF`<br>`--bg-subtle: #EAECEF`<br>`--text-primary: #141414`<br>`--text-secondary: #4B5563`<br>`--border-ui: #6B7280`<br>`--border-subtle: #D1D5DB` | Fondo general de catálogo, fichas de producto, carrito, checkout, formularios y tablas administrativas (`#141414` sobre `#FFFFFF` logra contraste **`18.5:1`**; `#4B5563` sobre `#F4F5F6` logra **`6.8:1`**; bordes de inputs/controles `--border-ui: #6B7280` superan **`3:1`** WCAG 1.4.11 y `--border-subtle: #D1D5DB` delimita divisores y tarjetas). |
| **30 %** | **Secundario de contraste y carácter** | `--bg-brand-dark: #141414`<br>`--bg-brand-panel: #1F2124`<br>`--bg-nav-blur: rgba(20, 20, 20, 0.88)`<br>`--text-on-dark: #F5F5F2`<br>`--text-muted-dark: #B5B5AE` | Barra de navegación sticky translúcida, Hero animado editorial, banda de 5 categorías/propuesta de valor de BikeStore y Footer estructural (`#F5F5F2` sobre `#141414` = **`16.9:1`**; `#B5B5AE` sobre `#141414` = **`8.6:1`**). |
| **10 %** | **Acento energético** *(Verde Lima Eléctrico)* | *Sobre fondo oscuro:* `--accent-neon: #B8FF67` (texto `#111111`, contraste **`15.8:1`**)<br>*Sobre fondo claro:* `--accent-brand: #3F6212` (texto `#FFFFFF`, contraste **`7.1:1`**) + `--accent-soft: #ECFCCB` + borde activo `#65A30D` | Botón CTA principal del Hero, línea animada `@keyframes heroCurrent`, indicador de filtro/pestaña activa, foco visible `:focus-visible`, badges de carrito y resaltados clave. **Regla estricta:** nunca usar `#B8FF67` directamente como texto sobre blanco (fallaría contraste 4.5:1); en fondo claro siempre se usa `--accent-brand` (`#3F6212`) o botón sólido `#141414` con acento `#B8FF67`. |

* **Estados semánticos accesibles (nunca solo por color — WCAG 1.4.1):** Todo estado (`Agotado`, `PENDIENTE`, `PAGADO`, `ENVIADO`, `ENTREGADO`, `CANCELADO`, `BUEN_ESTADO`, `DANADO`, alertas de error/éxito) combina **icono + etiqueta textual + borde/fondo contrastado** (`>= 4.5:1`).
* **Soporte `@media (forced-colors: active)`:** Tokens alternativos con palabras del sistema (`Canvas`, `CanvasText`, `Highlight`, `ButtonText`) y bordes explícitos para que ningún foco ni tarjeta desaparezca en Modo Alto Contraste de Windows.

### 3.3. Tipografía auto-hospedada (0 dependencias de CDN externo)
* **`@fontsource-variable/instrument-sans`** (`--font-display`): Títulos `h1` (`clamp(2.25rem, 4.5vw, 4.25rem)`, peso `600`, `line-height: 0.98`), `h2` y `h3`.
* **`@fontsource-variable/manrope`** (`--font-sans`): Párrafos, botones, navegación, inputs (`font-size: max(1rem, 1em)` para evitar zoom automático iOS) y precios/fechas con `font-variant-numeric: tabular-nums`.

---

## 4. Arquitectura de Animaciones estilo `dinamosites.com` (Cero impacto en lógica/backend)

Se incorporan las micro-interacciones y la presentación del Hero inspiradas en `dinamosites.com` mediante **técnicas web nativas gratuitas**, completamente aisladas de `src/api/`:

| Efecto visual (`dinamosites.com`) | Implementación técnica gratuita y segura | Garantía de estabilidad y accesibilidad (`modern-web-guidance`) |
| :--- | :--- | :--- |
| **Fondo orgánico animado en Hero** | `<HeroCanvas />` (`src/components/HeroCanvas.jsx`): `<canvas>` 2D nativo (< 80 líneas) dibujando ondas/estelas suaves en tonos carbón, verde lima `#B8FF67` y cian sutil a 60 fps. | • Se pausa automáticamente al salir del viewport (`IntersectionObserver`) o cambiar de pestaña (`document.hidden`), liberando `cancelAnimationFrame` al desmontar.<br>• Guardas defensivas obligatorias para `jsdom`/entornos limitados (`canvas.getContext('2d') !== null`, `typeof IntersectionObserver !== 'undefined'`, `typeof window.matchMedia === 'function'`).<br>• Respeta `@media (prefers-reduced-motion: reduce)` dibujando un único frame estático elegante e incluye botón visible **"Pausar fondo animado" / "Reanudar fondo animado"** (WCAG 2.2.2, sin `aria-pressed` al alternar etiqueta). |
| **Línea de corriente luminosa sobre titular** | Pseudo-elemento CSS `.hero-current::before` con `@keyframes heroCurrent` (`transform: translateX(...)` + `linear-gradient` `#B8FF67`). | • Solo corre dentro de `@media (prefers-reduced-motion: no-preference)`.<br>• Corre 100 % en hilo compositor GPU (`transform`, `opacity`). |
| **Aparición progresiva al hacer scroll** | CSS Scroll-Driven nativo dentro de `@media (prefers-reduced-motion: no-preference)` y `@supports ((animation-timeline: view()) and (animation-range: entry))`, más fallback `< 20` líneas con `IntersectionObserver`. | • **Estado base siempre visible (`opacity: 1`)**; las entradas solo escalan/trasladan suavemente durante `entry` si hay soporte y sin `scroll-timeline-polyfill`.<br>• Nunca deja tarjetas ocultas si el usuario desactiva animaciones. |
| **Micro-interacciones en tarjetas y navbar** | `backdrop-filter: blur(18px)` en navbar sticky y transiciones CSS `0.18s–0.25s` sobre `transform`, `opacity`, `background-color` y `border-color`. | • Nunca bloquean eventos de clic ni desplazan botones de confirmación bajo el cursor.<br>• Aislamiento total respecto a formularios de checkout, pagos e idempotencia. |

---

## 5. Estándares de Interacción y Componentes Modernos (`modern-web-guidance`)

1. **Modales nativos (`<dialog>`):** Todo diálogo de confirmación o aviso bloqueante (`ConfirmDialog.jsx`, modal de actualización de precios `409 PRECIO_ACTUALIZADO`, confirmación de cierre de sesión o acciones destructivas en admin) utiliza `<dialog>` nativo abierto con `showModal()`.
   * Nunca se agrega `role="dialog"`, `aria-modal`, trampas manuales de foco ni `overflow: hidden` sobre `body`.
   * Se aplica `overscroll-behavior: contain` en `dialog:modal` y `overflow: hidden; overscroll-behavior: contain;` en `dialog::backdrop`.
   * En acciones destructivas, `autofocus` se ubica en el botón seguro (**Cancelar**) y `dialog.returnValue` se reinicia al cerrar.
2. **Formularios accesibles y validación de usuario:**
   * Uso semántico de `<form>`, `<search>` (buscador de catálogo), `<fieldset>` + `<legend>`, `<label for>` visible encima de cada campo y `autocomplete` apropiado (`email`, `tel`, `current-password`, `new-password`, `street-address`).
   * Validación contextual en evento `blur` (si fue editado) y `submit`, limpiando errores en `input`, usando `:user-invalid` (nunca `:invalid` en campos vírgenes).
   * Alternador accesible **"Mostrar/Ocultar contraseña"** (`<button type="button" aria-pressed={...}>`) que permite pegar (`paste`) sin bloqueo.
   * Áreas táctiles mínimas de `48px` (`min-height: 48px`) y nunca se deshabilita el botón *Enviar* por validación previa (solo se bloquea durante petición en vuelo `isSubmitting` para evitar doble envío).

---

## 6. Stack tecnológico y estructura de `frontend/`

### 6.1. Dependencias (`frontend/package.json`) y compatibilidad Node `v24.19.0`
* **Entorno (`engines`):** `"node": ">=24.15.0"` *(verificado localmente en `Node.js v24.19.0`; la dependencia más exigente es `jsdom@^31.0.1` con `^22.22.2 || ^24.15.0 || >=26.0.0`).*
* **Producción:**
  * `react` `^19.3.1`, `react-dom` `^19.3.1`
  * `react-router-dom` `^7.18.5`
  * `write-excel-file` `^4.1.1` *(importar estrictamente `'write-excel-file/browser'` con `await writeExcelFile(sheetData).toFile(...)`)*
  * `jspdf` `^4.2.1` + `jspdf-autotable` `^5.0.9` *(importar `{ jsPDF } from 'jspdf'` y `{ autoTable } from 'jspdf-autotable'` usando `autoTable(doc, ...)`; prohibido `doc.html()` y `doc.autoTable()`, restringiendo textos de fuente `helvetica` a caracteres Latin-1/ASCII sin emojis)*
  * `@fontsource-variable/instrument-sans` `^5.3.0`, `@fontsource-variable/manrope` `^5.3.0`
* **Desarrollo / Pruebas:**
  * `vite` `^8.3.8`, `@vitejs/plugin-react` `^6.3.0`
  * `vitest` `^5.1.0`, `@testing-library/react` `^16.3.3`, **`@testing-library/dom` `^10.0.0`** *(peer dependency requerida)*, `jsdom` `^31.0.1`
* **Configuración Vite 8 / Vitest (`frontend/vite.config.js`):**
  * Proxy `server.proxy['/api']` → `http://localhost:3000` (y base `VITE_API_URL` opcional en cliente).
  * `build.rolldownOptions.external: ['canvg', 'html2canvas', 'dompurify']` para evitar inclusión/advertencias de dependencias opcionales de `jspdf`.
  * `test: { environment: 'jsdom', globals: true }` para ejecutar pruebas unitarias y de componentes sin navegador real.

### 6.2. Árbol objetivo (`frontend/`)

```text
frontend/
├── docs/
│   └── PLAN_FRONTEND_V1.md
├── index.html                           # <html lang="es">, título y metadatos BikeStore
├── package.json
├── vite.config.js                       # Proxy /api -> http://localhost:3000
├── src/
│   ├── main.jsx                         # BrowserRouter + fuentes @fontsource + estilos base
│   ├── App.jsx                          # Mapa completo de rutas públicas, CLIENTE y ADMIN
│   ├── styles/
│   │   ├── tokens.css                   # Regla 60-30-10, contrastes WCAG y forced-colors
│   │   ├── global.css                   # Reset accesible, tipografía, <dialog>, :focus-visible
│   │   ├── components.css               # Navbar, botones, formularios, tarjetas, tablas, badges
│   │   └── motion.css                   # @keyframes heroCurrent, scroll-entry-exit, reduced-motion
│   ├── api/
│   │   └── client.js                    # Fetch tipado JWT, Idempotency-Key, query/body limpio, 401/409
│   ├── context/
│   │   └── AuthContext.jsx              # Sesión JWT en sessionStorage, rehidratación GET /api/perfil, fusión
│   ├── utils/
│   │   ├── formato.js                   # Formato COP, fechas America/Bogota y etiquetas en español
│   │   ├── documentos.js                # Regex CC/TI/CE/PASAPORTE/PPT + containsSensitiveCardData (PAN/CVV)
│   │   ├── visitorCart.js               # localStorage { schema_version: 1, items: [{ id_producto, cantidad }] }
│   │   └── exportadores.js              # Transformadores puros + Excel (.xlsx) y PDF Latin-1 (.pdf)
│   ├── components/
│   │   ├── Navbar.jsx                   # Sticky translúcida 60-30-10, badge carrito y menú móvil
│   │   ├── Footer.jsx                   # Columnas estructurales carbón #141414 y enlaces locales
│   │   ├── HeroCanvas.jsx               # Canvas 2D ligero estilo dinamosites + guardas jsdom + Pausar/Reanudar
│   │   ├── ProductCard.jsx              # Tarjeta 4:3 con imagen_url, fallback SVG y estado "Agotado"
│   │   ├── StatusBadge.jsx              # Badges accesibles (icono + texto) de pedido/pago/retracto
│   │   ├── ConfirmDialog.jsx            # Modal nativo <dialog> con showModal()
│   │   ├── ToastRegion.jsx              # Región aria-live para notificaciones no bloqueantes
│   │   ├── ProtectedRoute.jsx           # Guardia por lista de roles (['CLIENTE'], ['ADMIN'] o ambos)
│   │   └── AdminNav.jsx                 # Subnavegación clara del panel administrativo
│   └── pages/
│       ├── public/
│       │   ├── InicioPage.jsx           # Hero animado + categorías destacadas + productos + beneficios
│       │   ├── CatalogoPage.jsx         # Filtros categoría, búsqueda, orden precio y paginación
│       │   ├── ProductoDetallePage.jsx  # Ficha técnica, manejo 404, validación existencias y añadir
│       │   ├── CarritoPage.jsx          # Visitante (hidratación GET /productos/:id) / Cliente (BD) + ajustes[]
│       │   ├── LoginPage.jsx            # Ingreso + fusión automática (solo rol CLIENTE)
│       │   ├── RegistroPage.jsx         # Persona natural + auto-login JWT + fusión carrito si aplica
│       │   ├── RecuperarPage.jsx        # Solicitud neutra recuperación (HTTP 200 inmediato)
│       │   ├── RestablecerPage.jsx      # Definición de nueva contraseña vía ?token=
│       │   └── NoEncontradoPage.jsx     # Ruta comodín * (404 amigable en español)
│       ├── shared/
│       │   └── PerfilPage.jsx           # GET/PUT /api/perfil + PATCH /api/perfil/contrasena (CLIENTE/ADMIN)
│       ├── client/
│       │   ├── CheckoutPage.jsx         # Snapshot previo + POST /pedidos + modal 409 PRECIO_ACTUALIZADO
│       │   ├── PagoPedidoPage.jsx       # Reserva 15m, simulador backend 1:N e Idempotency-Key
│       │   ├── MisPedidosPage.jsx       # Historial paginado de pedidos
│       │   ├── DetallePedidoPage.jsx    # Detalle, pagos 1:N, cancelar pre-envío, volver al carrito, retracto
│       │   ├── MisRetractosPage.jsx     # Historial paginado RETRACTO_LEGAL del cliente
│       │   ├── RetractoDetallePage.jsx  # GET /api/retractos/:id con detalles[] e inspección por ítem
│       │   └── SolicitarRetractoPage.jsx# Formulario RETRACTO_LEGAL por saldo disponible real (5 días hábiles)
│       └── admin/
│           ├── AdminResumenPage.jsx     # Tablero neto (rango inicial 30d, máx 90d/5000f) + Excel/PDF
│           ├── AdminCategoriasPage.jsx  # CRUD categorías + estado + DELETE (409 CATEGORIA_CON_PRODUCTOS)
│           ├── AdminProductosPage.jsx   # Listado, crear/editar (PUT sin stock) y PATCH /existencias
│           ├── AdminUsuariosPage.jsx    # Listado, búsqueda, estado y rol único (409 ULTIMO_ADMIN_ACTIVO)
│           ├── AdminPedidosPage.jsx     # Filtro estado/paginación + ENVIADO/ENTREGADO/CANCELADO + /reembolso
│           └── AdminRetractosPage.jsx   # Listado + detalle (:id) + decisión + recepción por línea + reembolso
└── tests/
    ├── visitorCart.test.js              # Unidad: schema_version=1, sumas, topes y limpieza
    ├── exportadores.test.js             # Unidad: transformadores tabulares puros en español (jsdom-safe)
    └── ProductCard.test.jsx             # Componente: "Agotado" deshabilitado, precios y fallback imagen
```

### 6.3. Contratos técnicos críticos de integración (`backend/src/` verificado)

Los siguientes contratos reflejan el código real verificado en [`backend/src/`](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/backend/src/app.js) y previenen desajustes detectados respecto a `CONTRATO_API_V1.md`:

1. **Cliente HTTP (`src/api/client.js`) y validación Zod `.strict()`:**
   * Base por defecto `/api` (sobrescribible con `VITE_API_URL`) y parseo seguro si el proxy devuelve texto plano no-JSON.
   * Las respuestas exitosas devuelven `{ ok: true, datos, meta? }`; los errores devuelven `{ ok: false, codigo, mensaje, detalles? }`.
   * **Limpieza de query params:** Omitir estrictamente claves con `undefined`, `null` o `""` antes de construir `URLSearchParams` (evita que `z.coerce.number().int().positive()` convierta `id_categoria=""` en `0` y falle con `400 VALIDACION_INVALIDA`).
   * **Limpieza de payload JSON (`.strict()`):** Omitir claves opcionales vacías en POST/PUT/PATCH (`motivo_cancelacion`, `observacion`, `observacion_admin`, `observacion_inspeccion`). En `segundo_apellido` (`/auth/registro`, `/perfil`) y `categoria.descripcion`, enviar `null` (o omitir la clave) si el input está vacío.
2. **Sesión JWT, registro con fusión y cambio de contraseña (`AuthContext.jsx`):**
   * Persistir `{ token, usuario }` en `sessionStorage` (`bikestore_session_v1`) y rehidratar al iniciar la app consultando `GET /api/perfil`.
   * **Discriminador `401`/`403`:** Limpiar sesión y redirigir a `/ingresar` únicamente ante `401 SESION_REVOCADA`, `401 TOKEN_INVALIDO` (en rutas autenticadas) o `403 USUARIO_INACTIVO`. **Nunca** limpiar sesión ante `401 CREDENCIALES_INVALIDAS` (error de login o contraseña actual incorrecta en `/perfil`).
   * **Registro + fusión (`RegistroPage.jsx`):** `POST /api/auth/registro` responde `201` sin JWT. Tras `201`, encadenar automáticamente `POST /api/auth/login` con las mismas credenciales para obtener el JWT.
   * **Fusión (`POST /api/carrito/fusionar`):** Ejecutar solo cuando `usuario.rol === 'CLIENTE'` y `visitorCart.items.length > 0`, enviando estrictamente `{ schema_version: 1, items: items.map(({ id_producto, cantidad }) => ({ id_producto, cantidad })) }` (`.strict()`). Mostrar banner resumen con `ajustes[]` y limpiar `localStorage` únicamente tras `200`.
   * **Perfil (`PerfilPage.jsx`):** Al recibir `200` en `PUT /api/perfil`, conservar `usuario.rol` en estado local (el `RETURNING` de `PUT` no incluye `rol`). Al recibir `200` en `PATCH /api/perfil/contrasena` (`token_version` incrementado sin emitir nuevo JWT), cerrar sesión local inmediatamente y redirigir a `/ingresar` con aviso en español.
3. **Carrito visitante (`visitorCart.js`) y `CheckoutPage.jsx`:**
   * `localStorage` almacena únicamente `{ schema_version: 1, items: [{ id_producto, cantidad }] }` (máx. `100` artículos, `1..1000` u.). En modo visitante, `CarritoPage.jsx` hidrata nombre, precio, existencias e imagen mediante `Promise.allSettled` sobre `GET /api/productos/:id`, depurando ítems que respondan `404`.
   * **`409 PRECIO_ACTUALIZADO`:** El backend actualiza `detalle_carrito.precio_unidad = producto.precio` antes de responder `{ codigo: 'PRECIO_ACTUALIZADO', mensaje, detalles: { carrito } }` (objeto, no arreglo). Por tanto, `CheckoutPage.jsx` debe guardar un **snapshot** de precios previo al `POST /api/pedidos`, comparar cada ítem contra `err.detalles?.carrito?.items`, mostrar la variación en `<dialog>` nativo (`ConfirmDialog`) y exigir nuevo clic del cliente para confirmar.
   * **`409 PEDIDO_PENDIENTE_ACTIVO`:** `err.detalles` viene `undefined`. Consultar `GET /api/pedidos?page=1&limit=10`, ubicar el pedido con `estado_pedido === 'PENDIENTE'` y ofrecer enlace directo a `/pedidos/:id/pago` o `/pedidos/:id`.
4. **Pagos simulados (`PagoPedidoPage.jsx`), cancelación y retracto (`SolicitarRetractoPage.jsx`):**
   * Usar el nombre exacto de campo **`referencia_simulada`** (nunca `numero_referencia`) y validar PAN/CVV en cliente con `containsSensitiveCardData` (`src/utils/documentos.js`) en `datos_reembolso` al cancelar o solicitar retracto.
   * **`Idempotency-Key`:** Conservar la misma UUID solo para reintentos automáticos/manuales idénticos tras fallo de red; generar una nueva `crypto.randomUUID()` cuando el intento anterior quede `'RECHAZADO'` (`'00'`) o cambie `metodo_pago`/`referencia_simulada`.
   * Cuenta regresiva sobre `pedido.fecha_expiracion` (15 min); al llegar a `00:00` o recibir `409 RESERVA_EXPIRADA`, deshabilitar pago y ofrecer botón `POST /api/pedidos/:id/volver-al-carrito` (con `Idempotency-Key`).
   * **Saldo disponible de retracto:** `SolicitarRetractoPage.jsx` obtiene `GET /api/pedidos/:id` (`detalles`, `retractos[]`) y consulta `GET /api/retractos/:id` para retractos previos con `estado_retracto !== 'RECHAZADO' || fecha_recepcion_fisica !== null`, restando `cantidad_devuelta` por `id_detalle_pedido`.
5. **Módulos `ADMIN` (contratos reales de `admin.routes.js` y `admin.service.js`):**
   * **`AdminUsuariosPage.jsx`:** Interceptar exactamente **`409 ULTIMO_ADMIN_ACTIVO`**.
   * **`AdminPedidosPage.jsx`:** `GET /api/admin/pedidos` acepta **exclusivamente** `{ estado?, page?, limit? }` (`pedidosAdminQuery.strict()` rechaza `desde`/`hasta` con `400 VALIDACION_INVALIDA`) y no existe `GET /api/admin/pedidos/:id`. El administrador puede pasar `PAGADO -> ENVIADO -> ENTREGADO`, cancelar `PENDIENTE` o `PAGADO` (`motivo_cancelacion` obligatorio >= 3 car.) y confirmar `PATCH .../reembolso` enviando **`{ observacion? }`**.
   * **`AdminRetractosPage.jsx`:** Abrir panel de detalle con `GET /api/admin/retractos/:id` antes de registrar recepción para obtener cada `id_detalle_retracto`; enviar `{ observacion_admin?, items: [...] }` cubriendo el 100 % de líneas con `cantidad_buen_estado + cantidad_danada === cantidad_devuelta`, y enviar `{ observacion_admin? }` en `/decision` y `/reembolso`.
   * **Reportes netos (`/admin`) y exportación (`exportadores.js`):** Cargar por defecto los últimos `30` días en zona `America/Bogota` (`desde` y `hasta` obligatorios en `YYYY-MM-DD`, tope `90` días / `5000` filas, error `400 RANGO_REPORTES_EXCEDIDO`). `GET /api/admin/reportes/ventas` devuelve `{ ok: true, datos: [...] }` sin `meta`. Desacoplar en `exportadores.js` los transformadores tabulares puros (campos `ventas_brutas_aprobadas`, `reembolsos_efectivos`, `ventas_netas`, `pendiente_por_reembolsar`, `productos_mas_vendidos[]` + filas `id_pedido`, `fecha_pago_bogota`, `cliente`, `cliente_correo`, `estado_pedido`, `metodo_pago`, `estado_pago`, `estado_reembolso_cancelacion`, `monto_bruto`, `reembolso_efectivo`, `monto_neto`) de los disparadores de descarga browser, manteniendo exportación válida aunque haya `0` filas de ventas.

---

## 7. Matriz de cobertura `1:1` con backend real (`backend/src/`) y `HU-01..HU-19`

| Ruta Frontend (`react-router-dom`) | Acceso | Endpoints Backend consumidos | `HU` / `CU` cubiertos |
| :--- | :--- | :--- | :--- |
| `/` (`InicioPage`), `/catalogo`, `/producto/:id` | Público | `GET /api/categorias`, `GET /api/productos`, `GET /api/productos/:id` | `HU-01` / `CU-01` |
| `/carrito` | Público / `CLIENTE` | `visitorCart` (`localStorage` + hidratación `:id`) + `GET/POST/PATCH/DELETE /api/carrito/*` | `HU-02` / `CU-02` |
| `/ingresar`, `/registro`, `/recuperar`, `/restablecer-contrasena` | Público | `POST /api/auth/{login, registro, recuperar, restablecer}` + auto-login + `POST /api/carrito/fusionar` | `HU-02, 04, 05, 06` |
| `/perfil` | `CLIENTE`, `ADMIN` | `GET/PUT /api/perfil`, `PATCH /api/perfil/contrasena`, `POST /api/auth/logout` | `HU-10, 13` / `CU-12, 15` |
| `/checkout` | `CLIENTE` | `POST /api/pedidos` *(maneja `409 PRECIO_ACTUALIZADO` y `409 PEDIDO_PENDIENTE_ACTIVO`)* | `HU-03` / `CU-03` |
| `/pedidos/:id/pago` | `CLIENTE` | `GET /api/pedidos/:id`, `POST /api/pedidos/:id/pagos` (`Idempotency-Key`), `POST .../volver-al-carrito` | `HU-14, 18` / `CU-16, 18` |
| `/pedidos`, `/pedidos/:id` | `CLIENTE` | `GET /api/pedidos`, `GET /api/pedidos/:id`, `POST /api/pedidos/:id/cancelar`, `POST .../volver-al-carrito` | `HU-11, 17, 18` |
| `/retractos`, `/retractos/:id`, `/pedidos/:id/retracto` | `CLIENTE` | `POST /api/pedidos/:id/retractos`, `GET /api/retractos`, `GET /api/retractos/:id` | `HU-19` / `CU-19` |
| `/admin` | `ADMIN` | `GET /api/admin/reportes/{resumen, ventas}`, `GET /api/admin/categorias` + exportación Excel/PDF | `HU-08, 15` / `CU-09, 10` |
| `/admin/categorias` | `ADMIN` | `GET/POST/PUT/PATCH /estado`, **`DELETE /api/admin/categorias/:id`** (`409 CATEGORIA_CON_PRODUCTOS`) | `HU-16` / `CU-17` |
| `/admin/productos` | `ADMIN` | `GET/POST/PUT/PATCH /estado y /existencias /api/admin/productos*` | `HU-07` / `CU-07, 08` |
| `/admin/usuarios` | `ADMIN` | `GET /api/admin/usuarios`, `PATCH .../estado`, `PATCH .../rol` (`409 ULTIMO_ADMIN_ACTIVO`) | `HU-09` / `CU-11` |
| `/admin/pedidos` | `ADMIN` | `GET /api/admin/pedidos` (`estado`, `page`, `limit`), `PATCH .../estado`, `PATCH .../reembolso` | `HU-12, 17` / `CU-14, 18` |
| `/admin/retractos` | `ADMIN` | `GET /api/admin/retractos`, `GET /api/admin/retractos/:id`, `PATCH .../{decision, recepcion, reembolso}` | `HU-19` / `CU-19` |
| `*` (`NoEncontradoPage`) | Público | Página 404 limpia en español con retorno al catálogo | Navegación robusta |

---

## 8. Plan de ejecución (`Pasos 5.1 – 5.3`) y Criterios de Verificación

### Paso `5.1`: Inicialización Vite 8, sistema visual `60-30-10` y esqueleto compilable
* **Entregables:** `frontend/package.json` (`engines >= 24.15.0` y `@testing-library/dom`), `frontend/vite.config.js` (`rolldownOptions.external` + `test.environment: 'jsdom'`), `frontend/index.html`, `src/styles/{tokens,global,components,motion}.css`, `src/api/client.js` (base + limpieza query/body), `src/context/AuthContext.jsx` (`sessionStorage` + discriminador `401`), `src/utils/formato.js`, `src/components/{Navbar,Footer,HeroCanvas,ProductCard,StatusBadge,ConfirmDialog,ToastRegion,ProtectedRoute,AdminNav}.jsx`, `src/pages/public/NoEncontradoPage.jsx`, `src/App.jsx` *(rutas base + vistas marcador compilables)* y `src/main.jsx`.
* **Criterio de terminado (DoD):** `npm install` y `npm run build` terminan con código de salida `0` sin módulos faltantes; `<HeroCanvas />` incluye guardas `jsdom`, `prefers-reduced-motion` y botón WCAG 2.2.2; contraste verificado `>= 4.5:1` en tokens de texto.

### Paso `5.2`: Flujos de datos, utilidades puras y pruebas unitarias/componente (`Vitest`)
* **Entregables:** Versión completa de `src/api/client.js`, `src/context/AuthContext.jsx` (auto-login en registro, fusión condicionada a `CLIENTE`, revocación tras cambio de contraseña), `src/utils/{documentos,visitorCart,exportadores}.js` (desacoplando transformadores puros de `.toFile()` / `doc.save()`), y `frontend/tests/{visitorCart,exportadores}.test.js` + `ProductCard.test.jsx`.
* **Criterio de terminado (DoD):** `npm test` (`Vitest` en `jsdom`) y `npm run build` finalizan con código de salida `0` y `0` pruebas omitidas, verificando `schema_version = 1`, detección PAN/CVV, transformación tabular neta en español y botón deshabilitado `"Agotado"`.

### Paso `5.3`: Vistas completas (`public/`, `shared/`, `client/`, `admin/`), integración Etapa 1 y evidencia E2E
* **Entregables:** Todas las páginas de la Sección 7 integradas en `src/App.jsx` 100 % en español cumpliendo la Sección 6.3, `npm run build` limpio y verificación E2E en navegador real contra el backend PostgreSQL (`localhost:3000`) cubriendo `CUJ 1` a `CUJ 4` + retractos + exportación Excel/PDF + verificación visual desktop (`1440×900`) y móvil (`390×844`).
* **Criterio de terminado (DoD):** Navegación completa sin errores de consola ni peticiones HTTP `500`, `npm run build` + `npm test` en `0`, backend `21/21` pruebas intactas y actualización final de `REGISTRO_CAMBIOS.md`.
