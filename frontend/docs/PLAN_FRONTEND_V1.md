# Plan de Arquitectura, Branding y Ejecución Frontend v1 (`PLAN_FRONTEND_V1.md`)

* **Proyecto:** BikeStore (`Web_BikeStore_svm`) — **Etapa 2 / Fase 5–6**
* **Autores:** Andrés Felipe – Juan Sánchez
* **Fecha:** 2026-11-19
* **Contrato backend consumido:** [CONTRATO_API_V1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/backend/docs/CONTRATO_API_V1.md) *(esquema de **16 tablas**, sesiones A1, idempotencia B1, seguridad SSRF/SVG/CSRF y concurrencia contra PostgreSQL 18 real)*
* **Referencia maestra:** [docs/designs/bikestore_v1.md](file:///c:/Users/Andr%C3%A9s/OneDrive/Desktop/Web_BikeStore_svm/docs/designs/bikestore_v1.md)

---

## 1. Principios rectores de Etapa 2

1. **Estabilidad Backend-First:** El frontend consume los endpoints cerrados de `/api/...` sin alterar contratos REST, reglas de negocio ni esquema SQL de Etapa 1. Ningún dato de precios, disponibilidad o resultado de pago se confía al navegador: el backend es fuente única de verdad (`409 PRECIO_ACTUALIZADO`, `409 RESERVA_EXPIRADA`, simulador determinista en servidor).
2. **Interfaz íntegramente en español:** Todos los menús, títulos, etiquetas de formulario, validaciones, estados operativos, mensajes al usuario, encabezados de tablas y reportes exportados a Excel/PDF se redactan en **español claro**. Se conservan en inglés únicamente identificadores de protocolo/código interno donde sea técnicamente necesario (ej. nombres de cabeceras HTTP `Authorization`, `Idempotency-Key`).
3. **100 % herramientas y librerías gratuitas:** Todas las dependencias frontend (`React`, `Vite`, `react-router-dom`, `write-excel-file`, `jspdf`, `jspdf-autotable`, `@fontsource-variable/*`, `vitest`, `vitest-axe`, `axe-core`) utilizan licencias libres (MIT/Apache) con ejecución local autónoma en `localhost:5173`.
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

### 3.1. Personalidad, identidad visual (`LogoMarcaBS`) y valores de marca (`BikeStore`)
**BikeStore** proyecta **precisión mecánica, energía ciclista y compra transparente**:
* **Identidad visual propia (`LogoMarcaBS` + `BIKESTORE`):** Isotipo geométrico vectorial de plato/cadena en `#B8FF67` con monograma central `BS` (`Iconos.jsx` y `public/favicon.svg`), compartido en `Navbar` y `Footer` con adaptabilidad desde `320px` hasta `1440px` y zoom `200 %–400 %`.
* **Entrada editorial tecnológica:** El visitante es recibido por un Hero oscuro tipo taller/pista (`dinamosites.com` + `Ferrari F1`) con movimiento fluido gratuito que transmite velocidad e ingeniería moderna sin ruido comercial ni jerga interna de desarrollo.
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
  * `vitest` `^5.1.0`, `@testing-library/react` `^16.3.3`, **`@testing-library/dom` `^10.0.0`** *(peer dependency requerida)*, `jsdom` `^31.0.1`, **`vitest-axe` `^0.1.0` + `axe-core` `^4.14.1`** *(auditoría automatizada WCAG en componentes y vistas)*
* **Configuración Vite 8 / Vitest (`frontend/vite.config.js`):**
  * Proxy `server.proxy['/api']` → `http://localhost:3000` (y base `VITE_API_URL` opcional en cliente).
  * Plugin condicional en modo `serve` (`dev`) para tolerar el preamble HMR de React sin relajar el CSP de producción en `dist/index.html` (`script-src 'self'`).
  * `build.assetsInlineLimit: 0` para emitir fuentes `.woff2` como activos estáticos `'self'` y garantizar `0` URLs `data:font/` en `dist/assets/*.css` bajo CSP `font-src 'self'`.
  * Plugin de origen SEO (`VITE_SITE_URL`, por defecto `https://bikestore.com.co`) para emitir rutas absolutas válidas en `dist/robots.txt` y `dist/sitemap.xml`.
  * `build.rolldownOptions.external: ['canvg', 'html2canvas', 'dompurify']` para evitar inclusión/advertencias de dependencias opcionales de `jspdf`.
  * `test: { environment: 'jsdom', globals: true }` para ejecutar pruebas unitarias, de componentes y accesibilidad sin navegador real.

### 6.2. Árbol objetivo (`frontend/`)

```text
frontend/
├── docs/
│   └── PLAN_FRONTEND_V1.md
├── public/
│   ├── favicon.svg                      # Badge oscuro con isotipo BS plato-cadena (#B8FF67)
│   ├── robots.txt                       # Disallow rutas privadas (/admin, /perfil, /checkout, /pedidos, /retractos...)
│   └── sitemap.xml                      # Rutas públicas indexables (/, /catalogo)
├── index.html                           # <html lang="es">, CSP estricto en build, Open Graph y metadatos BikeStore
├── package.json
├── vite.config.js                       # Proxy /api -> :3000, CSP preamble solo dev y Vitest
├── src/
│   ├── main.jsx                         # BrowserRouter + fuentes @fontsource + estilos base
│   ├── App.jsx                          # Code-splitting con React.lazy + Suspense (InicioPage en bundle inicial)
│   ├── styles/
│   │   ├── tokens.css                   # Regla 60-30-10, contrastes WCAG y forced-colors
│   │   ├── global.css                   # Reset accesible, overflow-x: clip, <dialog>, :focus-visible
│   │   ├── components.css               # Navbar, Footer, botones, tarjetas, tablas @container, badges
│   │   └── motion.css                   # @keyframes titular-corriente, scroll-driven, reduced-motion
│   ├── api/
│   │   └── client.js                    # credentials:'include', X-Requested-With, auto-refresh en 401 TOKEN_INVALIDO
│   ├── context/
│   │   └── AuthContext.jsx              # Access JWT SOLO en memoria React, rehidratación silenciosa A1, fusión B1
│   ├── hooks/
│   │   └── useTituloPagina.js           # Título, meta description, Open Graph y robots (index vs noindex)
│   ├── utils/
│   │   ├── refreshSync.js               # Web Locks API + BroadcastChannel + UUIDv8 (bs_client_secret + rotacion_uid)
│   │   ├── formato.js                   # Formato COP, fechas America/Bogota y etiquetas limpias en español
│   │   ├── documentos.js                # Regex CC/TI/CE/PASAPORTE/PPT + containsSensitiveCardData (PAN/CVV)
│   │   ├── visitorCart.js               # localStorage { schema_version: 1, items: [{ id_producto, cantidad }] }
│   │   ├── carritoHelper.js             # Hidratación y normalización de carrito visitante/cliente
│   │   └── exportadores.js              # Transformadores puros + Excel (.xlsx) y PDF Latin-1 (.pdf)
│   ├── components/
│   │   ├── Navbar.jsx                   # Sticky translúcida 60-30-10, LogoMarcaBS, aria-expanded y ResizeObserver
│   │   ├── Footer.jsx                   # LogoMarcaBS, enlaces conscientes de sesión/rol y área táctil >= 44px
│   │   ├── HeroCanvas.jsx               # Canvas 2D ligero estilo dinamosites + guardas jsdom + Pausar/Reanudar
│   │   ├── ProductCard.jsx              # Tarjeta 4:3 con imagen_url, fallback SVG y estado "Agotado"
│   │   ├── StatusBadge.jsx              # Badges accesibles (icono + texto) de pedido/pago/retracto
│   │   ├── ConfirmDialog.jsx            # Modal nativo <dialog> con showModal()
│   │   ├── ToastRegion.jsx              # Región popover aria-live para notificaciones no bloqueantes
│   │   ├── ProtectedRoute.jsx           # Guardia por lista de roles (['CLIENTE'], ['ADMIN'] o ambos)
│   │   ├── Iconos.jsx                   # LogoMarcaBS, Icono e IlustracionBicicletaFallback
│   │   ├── CampoContrasena.jsx          # Alternador accesible Mostrar/Ocultar contraseña
│   │   ├── Paginacion.jsx               # Controles paginados accesibles
│   │   └── AdminNav.jsx                 # Subnavegación clara del panel administrativo
│   └── pages/
│       ├── public/
│       │   ├── InicioPage.jsx           # Bundle inicial (LCP): Hero + categorías + destacados + beneficios
│       │   ├── CatalogoPage.jsx         # Lazy: filtros categoría, búsqueda, orden precio y paginación
│       │   ├── ProductoDetallePage.jsx  # Lazy: ficha técnica, manejo 404, validación existencias y añadir
│       │   ├── CarritoPage.jsx          # Lazy: visitante (hidratación) / cliente (BD) + ajustes[]
│       │   ├── LoginPage.jsx            # Lazy: ingreso + cookie bikestore_rt + fusión automática CLIENTE
│       │   ├── RegistroPage.jsx         # Lazy: persona natural + auto-login + fusión carrito si aplica
│       │   ├── RecuperarPage.jsx        # Lazy: solicitud neutra recuperación (HTTP 200 inmediato)
│       │   ├── RestablecerPage.jsx      # Lazy: definición de nueva contraseña vía ?token=
│       │   └── NoEncontradoPage.jsx     # Lazy: ruta comodín * (404 amigable en español, noindex)
│       ├── shared/
│       │   └── PerfilPage.jsx           # Lazy: GET/PUT /api/perfil + PATCH /api/perfil/contrasena
│       ├── client/
│       │   ├── CheckoutPage.jsx         # Lazy: snapshot + POST /pedidos + modal 409 PRECIO_ACTUALIZADO
│       │   ├── PagoPedidoPage.jsx       # Lazy: reserva 15m, pago 1:N, Idempotency-Key y guía solo dev/admin
│       │   ├── MisPedidosPage.jsx       # Lazy: historial paginado de pedidos
│       │   ├── DetallePedidoPage.jsx    # Lazy: detalle, cancelar, volver-al-carrito (useRef UUID), retracto
│       │   ├── MisRetractosPage.jsx     # Lazy: historial paginado RETRACTO_LEGAL del cliente
│       │   ├── RetractoDetallePage.jsx  # Lazy: GET /api/retractos/:id con detalles[] e inspección
│       │   └── SolicitarRetractoPage.jsx# Lazy: formulario RETRACTO_LEGAL por saldo disponible (5 días hábiles)
│       └── admin/
│           ├── AdminResumenPage.jsx     # Lazy: tablero neto (30d, máx 90d/5000f) + Excel/PDF dinámico
│           ├── AdminCategoriasPage.jsx  # Lazy: CRUD categorías + estado + DELETE (409 CATEGORIA_CON_PRODUCTOS)
│           ├── AdminProductosPage.jsx   # Lazy: crear/editar (PUT sin stock, URL sin SVG/SSRF) y PATCH /existencias
│           ├── AdminUsuariosPage.jsx    # Lazy: búsqueda, estado y rol único (409 ULTIMO_ADMIN_ACTIVO)
│           ├── AdminPedidosPage.jsx     # Lazy: filtro/paginación + modal GET /admin/pedidos/:id + estados/reembolso
│           └── AdminRetractosPage.jsx   # Lazy: listado + detalle (:id) + decisión + recepción + reembolso
└── tests/
    ├── visitorCart.test.js              # Unidad: schema_version=1, sumas, topes y limpieza
    ├── exportadores.test.js             # Unidad: transformadores tabulares puros en español (jsdom-safe)
    ├── ProductCard.test.jsx             # Componente: "Agotado" deshabilitado, precios y fallback imagen
    ├── documentosYCliente.test.jsx      # Documentos, PAN/CVV, HeroCanvas y flujo registro -> login -> fusionar
    ├── refreshSync.test.js              # Single-flight, Web Locks API, fallback sin Web Locks UUIDv8, 401/revocado
    ├── flujosCriticosUi.test.jsx        # ProtectedRoute, fusión, persistencia UUID volver-al-carrito y 401/409
    └── accesibilidad.test.jsx           # Auditoría vitest-axe / axe-core sobre componentes y páginas clave
```

### 6.3. Contratos técnicos críticos de integración (`backend/src/` verificado)

Los siguientes contratos reflejan el código real del backend y aseguran la coordinación **A1 / B1 / CSP / SEO / Rendimiento**:

1. **Cliente HTTP (`src/api/client.js`) y validación Zod `.strict()`:**
   * Base por defecto `/api` (sobrescribible con `VITE_API_URL`), envío obligatorio de **`credentials: 'include'`** (para portar la cookie `HttpOnly bikestore_rt` en `/api/auth`) y cabecera **`X-Requested-With: BikeStore`** (protección CSRF junto a `Origin`), además de parseo seguro si el proxy devuelve texto plano no-JSON.
   * Las respuestas exitosas devuelven `{ ok: true, datos, meta? }`; los errores devuelven `{ ok: false, codigo, mensaje, detalles? }`, con respaldo en `client.js` a `data.detalles[0].message` si faltara `data.mensaje`.
   * En `AuthContext.jsx` y `CarritoPage.jsx`, `consumirCarritoReciente` junto con la espera de `cargandoSesion` evita el doble `GET /api/carrito` al recargar con sesión activa.
   * **Reintento silencioso ante Access JWT expirado (`setAuthRefresher`):** Si una petición autenticada (distinta de `/auth/*`) recibe `401` con `codigo === 'TOKEN_INVALIDO'`, ejecuta el coordinador de refresh una única vez y reintenta la petición original con el nuevo token en memoria. Ante `SESION_REVOCADA`, `SESION_EXPIRADA` o `403 USUARIO_INACTIVO` invalida la sesión inmediatamente sin reintentar.
   * **Limpieza de query params y payload JSON (`.strict()`):** Omitir claves con `undefined`, `null` o `""` en `URLSearchParams` (evita `id_categoria=""` → `0`); omitir opcionales vacíos en POST/PUT/PATCH y convertir vacíos a `null` únicamente en `nullableKeys` (`segundo_apellido`, `descripcion`).
2. **Sesión A1 en memoria React, coordinación multi-pestaña (`refreshSync.js`) y `AuthContext.jsx`:**
   * **Cero JWT en almacenamiento web:** El Access JWT (`15m`) vive **exclusivamente en memoria React** (`useState`/`useRef`), nunca en `localStorage` ni `sessionStorage`.
   * **Metadatos no secretos en `localStorage`:** `bs_client_secret` (hexadecimal de 256 bits generado una vez por perfil de navegador y jamás enviado al servidor) y `bs_refresh_uid` (`rotacion_uid` vigente).
   * **Derivación determinista UUID v8 (RFC 9562):** `refreshSync.js` deriva `Idempotency-Key` mediante SHA-256 sobre `${bs_client_secret}:${rotacionUid}` garantizando el patrón UUID v8 (`^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`, con fallback `crypto.randomUUID()` si no existiera `rotacionUid`).
   * **Coordinación multi-pestaña (sin mutex en `localStorage`):** `ejecutarRefreshCoordinado()` aplica `single-flight` en memoria por pestaña; si `navigator.locks?.request` existe, adquiere `bikestore_auth_refresh` (`mode: 'exclusive'`) verificando primero si `BroadcastChannel('bikestore_auth_sync')` ya difundió un `TOKEN_ACTUALIZADO` reciente (< 5 s); si `navigator.locks` **no existe**, evita cualquier bloqueo TTL en `localStorage` y confía directamente en la clave UUID v8 determinista + replay AEAD de `30 s` en PostgreSQL. Sincroniza además `SESION_CERRADA` por `BroadcastChannel` y evento `storage` sobre `bs_refresh_uid === null`.
   * **Rehidratación silenciosa controlada:** Al montar `AuthProvider`, solo invoca `POST /api/auth/refresh` si existe `bs_refresh_uid` en `localStorage`, evitando disparos `401` espurios para visitantes anónimos. Si el refresh falla, limpia `bs_refresh_uid` silenciosamente sin toast de error.
   * **Discriminador `401`/`403`:** Nunca limpia sesión ante `401 CREDENCIALES_INVALIDAS`.
   * **Registro + fusión (`RegistroPage.jsx`):** `POST /api/auth/registro` responde `201`; encadena `POST /api/auth/login` con las mismas credenciales para obtener token en memoria, `rotacion_uid` y cookie `bikestore_rt`.
   * **Fusión (`POST /api/carrito/fusionar`):** Ejecuta solo cuando `usuario.rol === 'CLIENTE'` y `visitorCart.items.length > 0`, manteniendo una clave UUID persistida (`bikestore_pending_fusion_key_v1`) ligada a la firma del carrito visitante que solo se elimina tras `200 OK` junto a `limpiarCarritoVisitante()`. Tanto `LoginPage.jsx` como `RegistroPage.jsx` respetan la navegación hacia `/carrito` con `ajustesFusion` tras completar fusión sin sobrescribir la redirección.
   * **Perfil (`PerfilPage.jsx`):** En `PUT /api/perfil` conserva `usuario.rol`; en `PATCH /api/perfil/contrasena` limpia estado en memoria, `bs_refresh_uid` y difunde `SESION_CERRADA`.
3. **Carrito visitante (`visitorCart.js`), `CheckoutPage.jsx` y `DetallePedidoPage.jsx`:**
   * `localStorage` almacena `{ schema_version: 1, items: [{ id_producto, cantidad }] }` (máx. `100` artículos, `1..1000` u.).
   * **`409 PRECIO_ACTUALIZADO`:** `CheckoutPage.jsx` conserva snapshot previo, compara contra `err.detalles?.carrito?.items`, muestra `<ConfirmDialog>` y exige confirmación.
   * **`409 PEDIDO_PENDIENTE_ACTIVO`:** Consulta `GET /api/pedidos?page=1&limit=10` para redirigir a `/pedidos/:id/pago` o `/pedidos/:id`.
   * **`volver-al-carrito` (`DetallePedidoPage.jsx` y `PagoPedidoPage.jsx`):** Conserva `Idempotency-Key` UUID en `useRef` asociada al `id` del pedido ante reintentos fallidos (regenerándola solo si cambia el pedido o al completarse `200 OK`); al vencer el reloj `00:00` invoca directamente `POST /api/pedidos/:id/volver-al-carrito` aprovechando el flujo de 2 fases sin rollback del backend.
4. **Pagos simulados (`PagoPedidoPage.jsx`) y retracto (`SolicitarRetractoPage.jsx`):**
   * Usa campo **`referencia_simulada`** y valida PAN/CVV con `containsSensitiveCardData`.
   * Oculta referencias internas (`'00'`, notas de prueba) a clientes y producción, mostrándolas exclusivamente si `import.meta.env.DEV || usuario?.rol === 'ADMIN'`.
   * Rota `Idempotency-Key` solo tras intento `'RECHAZADO'` o cambio de payload.
   * Saldo disponible de retracto descontando solicitudes vigentes y unidades rechazadas tras inspección física.
5. **Módulos `ADMIN` (contratos reales de `admin.routes.js`):**
   * **`AdminUsuariosPage.jsx`:** Intercepta `409 ULTIMO_ADMIN_ACTIVO`.
   * **`AdminPedidosPage.jsx`:** Usa `GET /api/admin/pedidos` (`estado`, `page`, `limit`) y abre modal `<dialog>` nativo con **`GET /api/admin/pedidos/:id`** (`obtenerPedidoAdminDetalle`) mostrando datos de cliente, `detalles[]` e historial de `pagos[]`; maneja `ENVIADO`/`ENTREGADO`/`CANCELADO` y `PATCH .../reembolso`.
   * **`AdminRetractosPage.jsx`:** Usa `GET /api/admin/retractos/:id` + `/decision`, `/recepcion` y `/reembolso`.
   * **Reportes netos (`/admin`) y exportación (`exportadores.js`):** Rango por defecto `30` días en `America/Bogota` (tope `90` días / `5000` filas, `400 RANGO_REPORTES_EXCEDIDO`) y carga dinámica (`import()`) de `write-excel-file` + `jspdf`.
6. **Rendimiento, CSP, SEO, UX y Accesibilidad (`axe` + Lighthouse):**
   * **Code-splitting (`App.jsx`) y fuentes:** Todas las rutas secundarias, cliente y admin (`23` páginas en total) se cargan con `React.lazy` + `<Suspense fallback={<CargadorPagina />}>`; `InicioPage` permanece en el chunk inicial para proteger LCP. `build.assetsInlineLimit: 0` garantiza `0` `data:font/` en `dist/assets/*.css`.
   * **CSP (`index.html` + `vite.config.js`):** `<meta http-equiv="Content-Security-Policy">` en build con `script-src 'self'` y `font-src 'self'` (sin `'unsafe-inline'` en scripts ni `frame-ancestors` que no es válido en `<meta>`) y `style-src 'self' 'unsafe-inline'` documentada para estilos inline de React y `@oddbird/popover-polyfill`; en `vite dev` un plugin `apply: 'serve'` inyecta ajuste temporal solo para el preamble HMR de React.
   * **SEO (`useTituloPagina.js`, `robots.txt`, `sitemap.xml`):** Metadatos Open Graph (`og:site_name`, `og:title`, `og:description`, `og:type`, `og:locale`), `meta[name="description"]` dinámica, `index, follow` en públicas (`/`, `/catalogo`, `/producto/:id`), `noindex, nofollow` en rutas privadas/autenticación/`403`/`404` (`ProtectedRoute.jsx` vista `403` con `noIndex: true`), y `Sitemap: https://bikestore.com.co/sitemap.xml` parametrizable vía `VITE_SITE_URL`.
   * **UX y Accesibilidad (`vitest-axe` / `axe-core`):** Etiquetado ARIA `role="img"` / `sr-only` en controles SVG y tarjetas (`Navbar.jsx`, `ProductCard.jsx`, `ProductoDetallePage.jsx`), jerarquía `h1 -> h2 -> h3` en `CatalogoPage.jsx` (`<h2 className="sr-only">Listado de productos</h2>`), `<ScrollToTop />` + `scroll-padding-top: 5.5rem` / `scroll-margin-top: 5.5rem` en `global.css`, y `ToastRegion.jsx` con auto-cierre a `4500 ms` pausado en hover/foco, logrando `0` violaciones WCAG en `accesibilidad.test.jsx` y `Accessibility 100 / Best Practices 100 / SEO 100` en Lighthouse.

---

## 7. Matriz de cobertura `1:1` con backend real (`backend/src/`) y `HU-01..HU-19`

| Ruta Frontend (`react-router-dom`) | Acceso | Endpoints Backend consumidos | `HU` / `CU` cubiertos |
| :--- | :--- | :--- | :--- |
| `/` (`InicioPage`), `/catalogo`, `/producto/:id` | Público | `GET /api/categorias`, `GET /api/productos`, `GET /api/productos/:id` | `HU-01` / `CU-01` |
| `/carrito` | Público / `CLIENTE` | `visitorCart` (`localStorage` + hidratación `:id`) + `GET/POST/PATCH/DELETE /api/carrito/*` | `HU-02` / `CU-02` |
| `/ingresar`, `/registro`, `/recuperar`, `/restablecer-contrasena` | Público | `POST /api/auth/{login, registro, recuperar, restablecer, refresh}` + auto-login + `POST /api/carrito/fusionar` (UUID) | `HU-02, 04, 05, 06` |
| `/perfil` | `CLIENTE`, `ADMIN` | `GET/PUT /api/perfil`, `PATCH /api/perfil/contrasena`, `POST /api/auth/logout` | `HU-10, 13` / `CU-12, 15` |
| `/checkout` | `CLIENTE` | `POST /api/pedidos` *(maneja `409 PRECIO_ACTUALIZADO` y `409 PEDIDO_PENDIENTE_ACTIVO`)* | `HU-03` / `CU-03` |
| `/pedidos/:id/pago` | `CLIENTE` | `GET /api/pedidos/:id`, `POST /api/pedidos/:id/pagos` (`Idempotency-Key`), `POST .../volver-al-carrito` (UUID) | `HU-14, 18` / `CU-16, 18` |
| `/pedidos`, `/pedidos/:id` | `CLIENTE` | `GET /api/pedidos`, `GET /api/pedidos/:id`, `POST /api/pedidos/:id/cancelar`, `POST .../volver-al-carrito` (UUID) | `HU-11, 17, 18` |
| `/retractos`, `/retractos/:id`, `/pedidos/:id/retracto` | `CLIENTE` | `POST /api/pedidos/:id/retractos`, `GET /api/retractos`, `GET /api/retractos/:id` | `HU-19` / `CU-19` |
| `/admin` | `ADMIN` | `GET /api/admin/reportes/{resumen, ventas}`, `GET /api/admin/categorias` + exportación Excel/PDF | `HU-08, 15` / `CU-09, 10` |
| `/admin/categorias` | `ADMIN` | `GET/POST/PUT/PATCH /estado`, **`DELETE /api/admin/categorias/:id`** (`409 CATEGORIA_CON_PRODUCTOS`) | `HU-16` / `CU-17` |
| `/admin/productos` | `ADMIN` | `GET/POST/PUT/PATCH /estado y /existencias /api/admin/productos*` *(URL sin SVG/SSRF)* | `HU-07` / `CU-07, 08` |
| `/admin/usuarios` | `ADMIN` | `GET /api/admin/usuarios`, `PATCH .../estado`, `PATCH .../rol` (`409 ULTIMO_ADMIN_ACTIVO`) | `HU-09` / `CU-11` |
| `/admin/pedidos` | `ADMIN` | `GET /api/admin/pedidos` (`estado`, `page`, `limit`), **`GET /api/admin/pedidos/:id`**, `PATCH .../estado`, `PATCH .../reembolso` | `HU-12, 17` / `CU-14, 18` |
| `/admin/retractos` | `ADMIN` | `GET /api/admin/retractos`, `GET /api/admin/retractos/:id`, `PATCH .../{decision, recepcion, reembolso}` | `HU-19` / `CU-19` |
| `*` (`NoEncontradoPage`) | Público | Página 404 limpia en español con retorno al catálogo | Navegación robusta |

---

## 8. Plan de ejecución (`Pasos 5.1 – 5.4`) y Criterios de Verificación

### Paso `5.1`: Inicialización Vite 8, sistema visual `60-30-10` y esqueleto compilable
* **Entregables:** `frontend/package.json` (`engines >= 24.15.0`, `@testing-library/dom` y `vitest-axe`/`axe-core`), `frontend/vite.config.js` (`rolldownOptions.external`, plugin CSP dev y `test.environment: 'jsdom'`), `frontend/index.html`, `src/styles/{tokens,global,components,motion}.css`, `src/api/client.js`, `src/context/AuthContext.jsx`, `src/utils/formato.js`, componentes accesibles (`LogoMarcaBS`, `Navbar`, `Footer`, `HeroCanvas`, `ProductCard`, `StatusBadge`, `ConfirmDialog`, `ToastRegion`, `ProtectedRoute`, `AdminNav`) y `src/main.jsx`.
* **Criterio de terminado (DoD):** `npm install` y `npm run build` terminan con código de salida `0` sin módulos faltantes; `<HeroCanvas />` incluye guardas `jsdom`, `prefers-reduced-motion` y botón WCAG 2.2.2; contraste verificado `>= 4.5:1` en tokens de texto.

### Paso `5.2`: Flujos de datos, utilidades puras y pruebas unitarias/componente (`Vitest`)
* **Entregables:** Versión completa de `src/api/client.js`, `src/context/AuthContext.jsx` (Access JWT en memoria React, auto-login en registro, fusión condicionada a `CLIENTE` con clave persistente, revocación tras cambio de contraseña), `src/utils/{documentos,visitorCart,exportadores,refreshSync}.js`, y `frontend/tests/{visitorCart,exportadores,refreshSync}.test.js` + `ProductCard.test.jsx`.
* **Criterio de terminado (DoD):** `npm test` (`Vitest` en `jsdom`) y `npm run build` finalizan con código de salida `0` y `0` pruebas omitidas, verificando `schema_version = 1`, detección PAN/CVV, transformación tabular neta en español, coordinación `Web Locks API` + fallback UUIDv8 y botón deshabilitado `"Agotado"`.

### Paso `5.3`: Vistas completas (`public/`, `shared/`, `client/`, `admin/`), identidad y pruebas UI/accesibilidad
* **Entregables:** Todas las páginas de la Sección 7 integradas en `src/App.jsx` con `React.lazy` + `Suspense` y `<ScrollToTop />`, 100 % en español sin jerga técnica, CSP estricto en build (`0` `data:font/` gracias a `assetsInlineLimit: 0`), `public/robots.txt` (`Sitemap: https://bikestore.com.co/sitemap.xml`), `public/sitemap.xml`, Open Graph + `noindex` en `useTituloPagina.js` y `ProtectedRoute.jsx`, `LogoMarcaBS` + `favicon.svg`, `ToastRegion.jsx` con auto-cierre `4500 ms`, detalle de pedidos en `AdminPedidosPage.jsx`, persistencia `Idempotency-Key` (`useRef` en `DetallePedidoPage.jsx`), `flujosCriticosUi.test.jsx` y `accesibilidad.test.jsx` (`vitest-axe`).
* **Criterio de terminado (DoD):** `npm run build` + `npm test` (`38/38` pruebas en `7` archivos, `0` violaciones `axe`, Lighthouse `Accessibility 100 / Best Practices 100 / SEO 100`), chunks lazy y `0` `data:font/` verificados en `dist/`, cero JWT en `sessionStorage`/`localStorage`, y actualización final de `REGISTRO_CAMBIOS.md`.
