/**
 * Gestión persistente del carrito temporal para visitantes en localStorage.
 * Mantiene estrictamente el contrato { schema_version: 1, items: [{ id_producto, cantidad }] }.
 */

export const VISITOR_CART_KEY = 'bikestore_visitor_cart_v1';
export const VISITOR_CART_SCHEMA_VERSION = 1;
export const MAX_ITEMS_CARRITO_VISITANTE = 100;
export const MAX_CANTIDAD_ITEM = 1000;

function obtenerStorageSeguro() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function normalizarListaItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const agrupados = new Map();

  for (const raw of rawItems) {
    const idProducto = Number(raw?.id_producto);
    const cantidad = Math.trunc(Number(raw?.cantidad));
    if (!Number.isInteger(idProducto) || idProducto <= 0) continue;
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue;

    const suma = Math.min(MAX_CANTIDAD_ITEM, (agrupados.get(idProducto) || 0) + cantidad);
    if (!agrupados.has(idProducto) && agrupados.size >= MAX_ITEMS_CARRITO_VISITANTE) {
      continue;
    }
    agrupados.set(idProducto, suma);
  }

  return [...agrupados.entries()].map(([id_producto, cantidad]) => ({ id_producto, cantidad }));
}

export function leerCarritoVisitante() {
  const storage = obtenerStorageSeguro();
  const vacio = { schema_version: VISITOR_CART_SCHEMA_VERSION, items: [] };
  if (!storage) return vacio;

  try {
    const raw = storage.getItem(VISITOR_CART_KEY);
    if (!raw) return vacio;
    const parsed = JSON.parse(raw);
    if (parsed?.schema_version !== VISITOR_CART_SCHEMA_VERSION) {
      storage.removeItem(VISITOR_CART_KEY);
      return vacio;
    }
    return {
      schema_version: VISITOR_CART_SCHEMA_VERSION,
      items: normalizarListaItems(parsed.items),
    };
  } catch {
    return vacio;
  }
}

export function guardarCarritoVisitante(items) {
  const normalizado = {
    schema_version: VISITOR_CART_SCHEMA_VERSION,
    items: normalizarListaItems(items),
  };
  const storage = obtenerStorageSeguro();
  if (storage) {
    try {
      if (normalizado.items.length === 0) {
        storage.removeItem(VISITOR_CART_KEY);
      } else {
        storage.setItem(VISITOR_CART_KEY, JSON.stringify(normalizado));
      }
    } catch {
      // Sin cuota disponible o modo privado bloqueado
    }
  }
  return normalizado;
}

export function agregarItemVisitante(idProducto, cantidad = 1, { maxExistencias } = {}) {
  const id = Number(idProducto);
  const delta = Math.trunc(Number(cantidad));
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(delta) || delta <= 0) {
    return {
      carrito: leerCarritoVisitante(),
      agregado: false,
      motivo: 'CANTIDAD_INVALIDA',
    };
  }

  const actual = leerCarritoVisitante();
  const existente = actual.items.find((it) => it.id_producto === id);

  if (!existente && actual.items.length >= MAX_ITEMS_CARRITO_VISITANTE) {
    return {
      carrito: actual,
      agregado: false,
      motivo: 'TOPE_ARTICULOS_CARRITO',
    };
  }

  const topeMax =
    Number.isInteger(Number(maxExistencias)) && Number(maxExistencias) >= 0
      ? Math.min(MAX_CANTIDAD_ITEM, Number(maxExistencias))
      : MAX_CANTIDAD_ITEM;

  if (topeMax <= 0) {
    return {
      carrito: actual,
      agregado: false,
      motivo: 'SIN_EXISTENCIAS',
    };
  }

  const deseada = (existente?.cantidad || 0) + delta;
  const finalQty = Math.min(topeMax, deseada);

  const nuevosItems = existente
    ? actual.items.map((it) => (it.id_producto === id ? { ...it, cantidad: finalQty } : it))
    : [...actual.items, { id_producto: id, cantidad: finalQty }];

  const carrito = guardarCarritoVisitante(nuevosItems);
  return {
    carrito,
    agregado: true,
    ajustadoPorTope: finalQty < deseada,
    motivo: finalQty < deseada ? 'AJUSTADO_A_TOPE' : null,
  };
}

export function actualizarCantidadVisitante(idProducto, cantidad, { maxExistencias } = {}) {
  const id = Number(idProducto);
  const nueva = Math.trunc(Number(cantidad));
  const actual = leerCarritoVisitante();

  if (!Number.isInteger(id) || id <= 0) return actual;
  if (!Number.isInteger(nueva) || nueva <= 0) {
    return eliminarItemVisitante(id);
  }

  const topeMax =
    Number.isInteger(Number(maxExistencias)) && Number(maxExistencias) >= 0
      ? Math.min(MAX_CANTIDAD_ITEM, Math.max(1, Number(maxExistencias)))
      : MAX_CANTIDAD_ITEM;

  const finalQty = Math.min(topeMax, nueva);
  const existe = actual.items.some((it) => it.id_producto === id);
  const nuevosItems = existe
    ? actual.items.map((it) => (it.id_producto === id ? { ...it, cantidad: finalQty } : it))
    : [...actual.items, { id_producto: id, cantidad: finalQty }];

  return guardarCarritoVisitante(nuevosItems);
}

export function eliminarItemVisitante(idProducto) {
  const id = Number(idProducto);
  const actual = leerCarritoVisitante();
  return guardarCarritoVisitante(actual.items.filter((it) => it.id_producto !== id));
}

export function limpiarCarritoVisitante() {
  const storage = obtenerStorageSeguro();
  if (storage) {
    try {
      storage.removeItem(VISITOR_CART_KEY);
    } catch {
      // Sin efecto
    }
  }
  return { schema_version: VISITOR_CART_SCHEMA_VERSION, items: [] };
}

export function contarUnidadesVisitante(carrito = leerCarritoVisitante()) {
  const items = Array.isArray(carrito?.items) ? carrito.items : [];
  return items.reduce((acc, item) => acc + Math.max(0, Number(item?.cantidad) || 0), 0);
}

/**
 * Emite el objeto exacto aceptado por POST /api/carrito/fusionar (Zod .strict()).
 */
export function construirPayloadFusion(carrito = leerCarritoVisitante()) {
  const items = normalizarListaItems(carrito?.items || []);
  return {
    schema_version: VISITOR_CART_SCHEMA_VERSION,
    items: items.map(({ id_producto, cantidad }) => ({ id_producto, cantidad })),
  };
}
