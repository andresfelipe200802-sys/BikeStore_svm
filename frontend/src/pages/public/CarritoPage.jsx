import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { carritoApi, catalogoApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP } from '../../utils/formato.js';
import {
  actualizarCantidadVisitante,
  contarUnidadesVisitante,
  eliminarItemVisitante,
  leerCarritoVisitante,
} from '../../utils/visitorCart.js';

const MENSAJES_AJUSTE = {
  AJUSTADO_A_EXISTENCIAS: 'Ajustado al stock disponible al fusionar tu carrito.',
  SIN_EXISTENCIAS: 'No se fusionó porque el artículo se encuentra agotado.',
  PRODUCTO_NO_DISPONIBLE: 'Retirado por no encontrarse activo en catálogo.',
};

export function CarritoPage({ onNotificar }) {
  useTituloPagina('Carrito de compras');
  const { estaAutenticado, esCliente, esAdmin, setCantidadCarrito } = useAuth();
  const location = useLocation();
  const ajustesFusion = location.state?.ajustesFusion || [];

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState('0.00');
  const [cargando, setCargando] = useState(true);
  const [depuradosVisitante, setDepuradosVisitante] = useState([]);
  const [error, setError] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);

  const cargarCarrito = useCallback(async () => {
    if (esAdmin) {
      setItems([]);
      setCargando(false);
      return;
    }

    setCargando(true);
    setError('');

    if (estaAutenticado && esCliente) {
      try {
        const resp = await carritoApi.obtener();
        const lista = resp?.datos?.items || [];
        setItems(lista);
        setTotal(resp?.datos?.total || '0.00');
        setCantidadCarrito(lista.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
      } catch (err) {
        setError(err?.mensaje || 'No pudimos obtener tu carrito.');
      } finally {
        setCargando(false);
      }
      return;
    }

    // Modo visitante: hidrata detalles en vivo desde GET /api/productos/:id
    const carritoLocal = leerCarritoVisitante();
    if (carritoLocal.items.length === 0) {
      setItems([]);
      setTotal('0.00');
      setCantidadCarrito(0);
      setCargando(false);
      return;
    }

    const resultados = await Promise.allSettled(
      carritoLocal.items.map((item) => catalogoApi.productoPorId(item.id_producto))
    );

    const hidratados = [];
    const eliminados = [];
    let totalNum = 0;

    carritoLocal.items.forEach((localItem, idx) => {
      const res = resultados[idx];
      if (res.status === 'fulfilled' && res.value?.datos) {
        const prod = res.value.datos;
        const existencias = Number(prod.existencias ?? 0);
        const qtyValida = existencias > 0 ? Math.min(localItem.cantidad, existencias) : localItem.cantidad;
        const precioNum = Number(prod.precio || 0);
        const subtotalNum = precioNum * qtyValida;
        totalNum += subtotalNum;

        if (existencias > 0 && qtyValida !== localItem.cantidad) {
          actualizarCantidadVisitante(localItem.id_producto, qtyValida, {
            maxExistencias: existencias,
          });
        }

        hidratados.push({
          id_producto: prod.id_producto,
          nombre: prod.nombre,
          cantidad: qtyValida,
          precio_unidad: prod.precio,
          subtotal: String(subtotalNum),
          existencias,
          imagen_url: prod.imagen_url,
          disponible: !prod.agotado && existencias > 0,
        });
      } else {
        eliminarItemVisitante(localItem.id_producto);
        eliminados.push(localItem.id_producto);
      }
    });

    if (eliminados.length > 0) {
      setDepuradosVisitante(eliminados);
    }

    setItems(hidratados);
    setTotal(String(totalNum));
    setCantidadCarrito(contarUnidadesVisitante(leerCarritoVisitante()));
    setCargando(false);
  }, [estaAutenticado, esCliente, esAdmin, setCantidadCarrito]);

  useEffect(() => {
    cargarCarrito();
  }, [cargarCarrito]);

  const cambiarCantidad = async (item, nuevaCantidad) => {
    if (nuevaCantidad < 1) return;
    setOcupadoId(item.id_producto);
    setError('');

    if (estaAutenticado && esCliente) {
      try {
        const resp = await carritoApi.actualizar(item.id_producto, { cantidad: nuevaCantidad });
        const lista = resp?.datos?.items || [];
        setItems(lista);
        setTotal(resp?.datos?.total || '0.00');
        setCantidadCarrito(lista.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
      } catch (err) {
        onNotificar?.('error', err?.mensaje || 'No fue posible actualizar la cantidad.');
      } finally {
        setOcupadoId(null);
      }
      return;
    }

    const carritoActualizado = actualizarCantidadVisitante(item.id_producto, nuevaCantidad, {
      maxExistencias: item.existencias,
    });
    setCantidadCarrito(contarUnidadesVisitante(carritoActualizado));
    setOcupadoId(null);
    await cargarCarrito();
  };

  const eliminarItem = async (idProducto) => {
    setOcupadoId(idProducto);
    setError('');

    if (estaAutenticado && esCliente) {
      try {
        const resp = await carritoApi.eliminar(idProducto);
        const lista = resp?.datos?.items || [];
        setItems(lista);
        setTotal(resp?.datos?.total || '0.00');
        setCantidadCarrito(lista.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
        onNotificar?.('info', 'Producto retirado del carrito.');
      } catch (err) {
        onNotificar?.('error', err?.mensaje || 'No pudimos eliminar el artículo.');
      } finally {
        setOcupadoId(null);
      }
      return;
    }

    const carritoActualizado = eliminarItemVisitante(idProducto);
    setCantidadCarrito(contarUnidadesVisitante(carritoActualizado));
    setOcupadoId(null);
    onNotificar?.('info', 'Producto retirado del carrito.');
    await cargarCarrito();
  };

  if (esAdmin) {
    return (
      <section className="contenedor seccion">
        <h1>Carrito de compras</h1>
        <div className="alerta alerta-info">
          <Icono tipo="info" size={20} />
          <div>
            <p>Las cuentas con rol ADMIN no utilizan el carrito ni generan pedidos de compra.</p>
            <Link className="btn btn-primario" to="/admin" style={{ marginTop: '0.75rem' }}>
              Ir al panel administrativo
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const hayNoDisponibles = items.some((i) => !i.disponible || Number(i.existencias) < i.cantidad);

  return (
    <section className="contenedor seccion">
      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">{estaAutenticado ? 'Sincronizado con tu cuenta' : 'Modo visitante'}</p>
          <h1 className="titulo-seccion">Tu carrito de compras</h1>
        </div>
        <Link className="btn btn-contorno" to="/catalogo">
          Seguir comprando
        </Link>
      </div>

      {ajustesFusion.length > 0 && (
        <div className="alerta alerta-alerta" style={{ marginBottom: '1.25rem' }}>
          <Icono tipo="alerta" size={20} />
          <div>
            <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
              Resumen de fusión de tu carrito anterior:
            </p>
            <ul>
              {ajustesFusion.map((aj, idx) => (
                <li key={`${aj.id_producto}-${idx}`}>
                  {aj.nombre || `Producto #${aj.id_producto}`}:{' '}
                  {MENSAJES_AJUSTE[aj.motivo] || aj.motivo} (aplicadas: {aj.cantidad_aplicada} u.)
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {depuradosVisitante.length > 0 && (
        <div className="alerta alerta-alerta" style={{ marginBottom: '1.25rem' }}>
          <Icono tipo="alerta" size={20} />
          <p>
            Se retiraron automáticamente {depuradosVisitante.length} artículos que ya no están
            disponibles en el catálogo.
          </p>
        </div>
      )}

      {error && (
        <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <Icono tipo="error" size={20} />
          <p>{error}</p>
        </div>
      )}

      {cargando ? (
        <p className="texto-estado" aria-live="polite">
          Cargando artículos del carrito...
        </p>
      ) : items.length === 0 ? (
        <div className="estado-vacio">
          <p>Tu carrito está vacío por ahora. Explora las bicicletas y accesorios disponibles.</p>
          <Link className="btn btn-primario" to="/catalogo">
            Explorar catálogo
          </Link>
        </div>
      ) : (
        <div className="rejilla-asimetrica">
          <ul className="lista-linea" aria-label="Artículos en el carrito">
            {items.map((item) => (
              <li key={item.id_producto} className="item-fila">
                <div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                    <Link to={`/producto/${item.id_producto}`}>{item.nombre}</Link>
                  </h2>
                  <p className="campo-ayuda tabular" style={{ margin: 0 }}>
                    Precio unitario: {formatearCOP(item.precio_unidad)} · Stock:{' '}
                    {item.existencias}
                  </p>
                  {!item.disponible && (
                    <div style={{ marginTop: '0.45rem' }}>
                      <StatusBadge codigo="AGOTADO" etiquetaPersonalizada="No disponible actualmente" />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn btn-contorno btn-pequeno"
                      aria-label={`Disminuir cantidad de ${item.nombre}`}
                      disabled={ocupadoId === item.id_producto || item.cantidad <= 1}
                      onClick={() => cambiarCantidad(item, item.cantidad - 1)}
                    >
                      −
                    </button>
                    <span className="tabular" style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 700 }}>
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      className="btn btn-contorno btn-pequeno"
                      aria-label={`Aumentar cantidad de ${item.nombre}`}
                      disabled={ocupadoId === item.id_producto || item.cantidad >= item.existencias}
                      onClick={() => cambiarCantidad(item, item.cantidad + 1)}
                    >
                      +
                    </button>
                  </div>

                  <strong className="tabular">{formatearCOP(item.subtotal)}</strong>

                  <button
                    type="button"
                    className="btn btn-contorno btn-pequeno"
                    disabled={ocupadoId === item.id_producto}
                    onClick={() => eliminarItem(item.id_producto)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <aside className="panel" aria-label="Resumen de compra">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Resumen</h2>
            <div className="resumen-linea">
              <span>Artículos totales</span>
              <strong className="tabular">
                {items.reduce((acc, it) => acc + Number(it.cantidad || 0), 0)}
              </strong>
            </div>
            <div className="resumen-total">
              <span>Total estimado</span>
              <span className="tabular">{formatearCOP(total)}</span>
            </div>

            {hayNoDisponibles && (
              <div className="alerta alerta-alerta" style={{ marginTop: '1rem' }}>
                <Icono tipo="alerta" size={18} />
                <p>Retira o ajusta los artículos no disponibles antes de generar el pedido.</p>
              </div>
            )}

            <div style={{ marginTop: '1.25rem' }}>
              {estaAutenticado ? (
                hayNoDisponibles ? (
                  <button type="button" className="btn btn-primario btn-bloque" disabled>
                    Corrige existencias para continuar
                  </button>
                ) : (
                  <Link className="btn btn-primario btn-bloque" to="/checkout">
                    Continuar al checkout
                  </Link>
                )
              ) : (
                <Link
                  className="btn btn-primario btn-bloque"
                  to="/ingresar"
                  state={{ from: { pathname: '/checkout' } }}
                >
                  Ingresar para finalizar compra
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
