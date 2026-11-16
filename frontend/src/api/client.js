/**
 * Cliente HTTP centralizado para BikeStore v1.
 * Respeta contratos Zod .strict() del backend, Idempotency-Key y discriminación de 401/409.
 */

const DEFAULT_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

let tokenProvider = () => null;
let authInvalidatedHandler = null;

export class ApiError extends Error {
  constructor(status, codigo, mensaje, detalles = undefined) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.mensaje = mensaje;
    this.detalles = detalles;
  }
}

export function setAuthTokenProvider(fn) {
  tokenProvider = typeof fn === 'function' ? fn : () => null;
}

export function setAuthInvalidatedHandler(fn) {
  authInvalidatedHandler = typeof fn === 'function' ? fn : null;
}

/**
 * Construye URLSearchParams omitiendo undefined, null y cadenas vacías ("")
 * para evitar que z.coerce.number().int().positive() convierta "" en 0.
 */
export function construirQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  const search = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue;
    const texto = typeof valor === 'string' ? valor.trim() : String(valor);
    if (texto === '') continue;
    search.set(clave, texto);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Limpia cuerpos JSON antes de enviarlos a rutas Zod .strict():
 * - Omite claves undefined o cadenas vacías.
 * - Convierte cadenas vacías a null solo en campos explícitamente nulables (nullableKeys).
 */
export function limpiarPayload(payload, { nullableKeys = [] } = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) =>
      item && typeof item === 'object' ? limpiarPayload(item, { nullableKeys }) : item
    );
  }

  const nullableSet = new Set(nullableKeys);
  const limpio = {};

  for (const [clave, valor] of Object.entries(payload)) {
    if (valor === undefined) continue;
    if (typeof valor === 'string') {
      const recorte = valor.trim();
      if (recorte === '') {
        if (nullableSet.has(clave)) limpio[clave] = null;
        continue;
      }
      limpio[clave] = valor;
      continue;
    }
    if (Array.isArray(valor)) {
      limpio[clave] = limpiarPayload(valor, { nullableKeys });
      continue;
    }
    limpio[clave] = valor;
  }

  return limpio;
}

function parseJsonSeguro(texto) {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export async function apiRequest(ruta, opciones = {}) {
  const {
    method = 'GET',
    query,
    body,
    nullableKeys = [],
    headers = {},
    token,
    idempotencyKey,
    suppressAuthInvalidation = false,
    signal,
    baseUrl = DEFAULT_BASE_URL,
  } = opciones;

  const qs = construirQueryString(query);
  const url = `${String(baseUrl).replace(/\/$/, '')}${ruta.startsWith('/') ? ruta : `/${ruta}`}${qs}`;

  const reqHeaders = { Accept: 'application/json', ...headers };
  const jwt = token !== undefined ? token : tokenProvider();
  if (jwt) {
    reqHeaders.Authorization = `Bearer ${jwt}`;
  }
  if (idempotencyKey) {
    reqHeaders['Idempotency-Key'] = idempotencyKey;
  }

  let bodySerializado;
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    bodySerializado = JSON.stringify(limpiarPayload(body, { nullableKeys }));
  }

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method,
      headers: reqHeaders,
      body: bodySerializado,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(
      0,
      'ERROR_RED',
      'No fue posible conectar con el servidor de BikeStore. Verifica tu conexión e intenta de nuevo.'
    );
  }

  const textoPlano = await respuesta.text();
  const data = parseJsonSeguro(textoPlano);

  if (!respuesta.ok) {
    const codigo = data?.codigo || (respuesta.status >= 500 ? 'ERROR_SERVIDOR' : 'ERROR_HTTP');
    const mensaje =
      data?.mensaje ||
      (respuesta.status === 429
        ? 'Has realizado demasiadas solicitudes en poco tiempo. Espera un momento e intenta nuevamente.'
        : respuesta.status >= 500
          ? 'El servicio presentó una falla temporal. Intenta de nuevo en unos instantes.'
          : 'No fue posible completar la solicitud.');

    const error = new ApiError(respuesta.status, codigo, mensaje, data?.detalles);

    const esSesionInvalida =
      !suppressAuthInvalidation &&
      ((respuesta.status === 401 && codigo !== 'CREDENCIALES_INVALIDAS') ||
        (respuesta.status === 403 && codigo === 'USUARIO_INACTIVO'));

    if (esSesionInvalida && authInvalidatedHandler) {
      authInvalidatedHandler(error);
    }

    throw error;
  }

  if (!data || typeof data !== 'object') {
    throw new ApiError(
      respuesta.status,
      'RESPUESTA_INVALIDA',
      'La respuesta del servidor no tiene el formato JSON esperado.'
    );
  }

  return data;
}

export const api = {
  get: (ruta, opciones) => apiRequest(ruta, { ...opciones, method: 'GET' }),
  post: (ruta, body, opciones) => apiRequest(ruta, { ...opciones, method: 'POST', body }),
  put: (ruta, body, opciones) => apiRequest(ruta, { ...opciones, method: 'PUT', body }),
  patch: (ruta, body, opciones) => apiRequest(ruta, { ...opciones, method: 'PATCH', body }),
  del: (ruta, opciones) => apiRequest(ruta, { ...opciones, method: 'DELETE' }),
};

export const authApi = {
  registro: (datos) =>
    api.post('/auth/registro', datos, {
      nullableKeys: ['segundo_apellido'],
      suppressAuthInvalidation: true,
    }),
  login: (credenciales) =>
    api.post('/auth/login', credenciales, { suppressAuthInvalidation: true }),
  logout: (token) =>
    api.post('/auth/logout', undefined, { token, suppressAuthInvalidation: true }),
  recuperar: (correo) =>
    api.post('/auth/recuperar', { correo }, { suppressAuthInvalidation: true }),
  restablecer: ({ token, nueva_contrasena }) =>
    api.post('/auth/restablecer', { token, nueva_contrasena }, { suppressAuthInvalidation: true }),
};

export const perfilApi = {
  obtener: (token) => api.get('/perfil', token ? { token } : undefined),
  actualizar: (datos) =>
    api.put('/perfil', datos, { nullableKeys: ['segundo_apellido'] }),
  cambiarContrasena: ({ contrasena_actual, nueva_contrasena }) =>
    api.patch('/perfil/contrasena', { contrasena_actual, nueva_contrasena }),
};

export const catalogoApi = {
  categorias: (opciones) => api.get('/categorias', opciones),
  productos: (query, opciones) => api.get('/productos', { ...opciones, query }),
  productoPorId: (id, opciones) => api.get(`/productos/${id}`, opciones),
};

export const carritoApi = {
  obtener: (token) => api.get('/carrito', token ? { token } : undefined),
  fusionar: (payload, idempotencyKey, token) =>
    api.post('/carrito/fusionar', payload, { idempotencyKey, token }),
  agregar: ({ id_producto, cantidad }) =>
    api.post('/carrito/items', { id_producto, cantidad }),
  actualizar: (idProducto, { cantidad }) =>
    api.patch(`/carrito/items/${idProducto}`, { cantidad }),
  eliminar: (idProducto) => api.del(`/carrito/items/${idProducto}`),
};

export const pedidosApi = {
  crear: ({ direccion_envio }) => api.post('/pedidos', { direccion_envio }),
  listar: (query) => api.get('/pedidos', { query }),
  obtener: (id) => api.get(`/pedidos/${id}`),
  pagar: (id, { metodo_pago, referencia_simulada }, idempotencyKey) =>
    api.post(`/pedidos/${id}/pagos`, { metodo_pago, referencia_simulada }, { idempotencyKey }),
  cancelar: (id, datos) => api.post(`/pedidos/${id}/cancelar`, datos),
  volverAlCarrito: (id, idempotencyKey) =>
    api.post(`/pedidos/${id}/volver-al-carrito`, undefined, { idempotencyKey }),
};

export const retractosApi = {
  solicitar: (idPedido, payload) => api.post(`/pedidos/${idPedido}/retractos`, payload),
  listar: (query) => api.get('/retractos', { query }),
  obtener: (id) => api.get(`/retractos/${id}`),
};

export const adminApi = {
  listarCategorias: () => api.get('/admin/categorias'),
  crearCategoria: (datos) =>
    api.post('/admin/categorias', datos, { nullableKeys: ['descripcion'] }),
  actualizarCategoria: (id, datos) =>
    api.put(`/admin/categorias/${id}`, datos, { nullableKeys: ['descripcion'] }),
  cambiarEstadoCategoria: (id, estado) =>
    api.patch(`/admin/categorias/${id}/estado`, { estado }),
  eliminarCategoria: (id) => api.del(`/admin/categorias/${id}`),

  listarProductos: (query) => api.get('/admin/productos', { query }),
  crearProducto: (datos) => api.post('/admin/productos', datos),
  actualizarProducto: (id, datos) => api.put(`/admin/productos/${id}`, datos),
  cambiarEstadoProducto: (id, estado) =>
    api.patch(`/admin/productos/${id}/estado`, { estado }),
  ajustarExistenciasProducto: (id, existencias) =>
    api.patch(`/admin/productos/${id}/existencias`, { existencias }),

  listarUsuarios: (query) => api.get('/admin/usuarios', { query }),
  cambiarEstadoUsuario: (id, estado_usuario) =>
    api.patch(`/admin/usuarios/${id}/estado`, { estado_usuario }),
  cambiarRolUsuario: (id, rol) => api.patch(`/admin/usuarios/${id}/rol`, { rol }),

  listarPedidos: ({ estado, page, limit } = {}) =>
    api.get('/admin/pedidos', { query: { estado, page, limit } }),
  cambiarEstadoPedido: (id, datos) => api.patch(`/admin/pedidos/${id}/estado`, datos),
  confirmarReembolsoPedido: (id, datos) => api.patch(`/admin/pedidos/${id}/reembolso`, datos),

  listarRetractos: (query) => api.get('/admin/retractos', { query }),
  obtenerRetracto: (id) => api.get(`/admin/retractos/${id}`),
  decidirRetracto: (id, datos) => api.patch(`/admin/retractos/${id}/decision`, datos),
  registrarRecepcionRetracto: (id, datos) => api.patch(`/admin/retractos/${id}/recepcion`, datos),
  confirmarReembolsoRetracto: (id, datos) => api.patch(`/admin/retractos/${id}/reembolso`, datos),

  obtenerResumenReportes: (query) => api.get('/admin/reportes/resumen', { query }),
  obtenerReporteVentas: (query) => api.get('/admin/reportes/ventas', { query }),
};
