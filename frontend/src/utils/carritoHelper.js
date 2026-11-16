import { carritoApi } from '../api/client.js';
import { agregarItemVisitante, contarUnidadesVisitante } from './visitorCart.js';

/**
 * Añade unidades al carrito visitante (localStorage) o autenticado (PostgreSQL)
 * sin permitir la acción a administradores.
 */
export async function agregarProductoAlCarrito({
  producto,
  cantidad = 1,
  estaAutenticado,
  esAdmin,
  setCantidadCarrito,
  notificar,
}) {
  if (!producto) return false;

  if (esAdmin) {
    notificar?.('alerta', 'Las cuentas de administrador no realizan compras con carrito.');
    return false;
  }

  if (Number(producto.existencias ?? 0) <= 0 || producto.agotado) {
    notificar?.('error', `"${producto.nombre}" se encuentra agotado.`);
    return false;
  }

  if (!estaAutenticado) {
    const res = agregarItemVisitante(producto.id_producto, cantidad, {
      maxExistencias: producto.existencias,
    });
    if (!res.agregado) {
      const msg =
        res.motivo === 'TOPE_ARTICULOS_CARRITO'
          ? 'Alcanzaste el límite de 100 artículos distintos en el carrito.'
          : 'No fue posible agregar el artículo al carrito.';
      notificar?.('error', msg);
      return false;
    }
    setCantidadCarrito?.(contarUnidadesVisitante(res.carrito));
    notificar?.(
      res.ajustadoPorTope ? 'alerta' : 'exito',
      res.ajustadoPorTope
        ? `Cantidad ajustada al tope disponible de "${producto.nombre}" (${producto.existencias} u.).`
        : `"${producto.nombre}" agregado a tu carrito.`
    );
    return true;
  }

  try {
    const resp = await carritoApi.agregar({ id_producto: producto.id_producto, cantidad });
    const items = resp?.datos?.items || [];
    setCantidadCarrito?.(items.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
    notificar?.('exito', `"${producto.nombre}" agregado a tu carrito.`);
    return true;
  } catch (err) {
    notificar?.('error', err?.mensaje || 'No pudimos agregar el producto a tu carrito.');
    return false;
  }
}
