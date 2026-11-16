import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { catalogoApi } from '../../api/client.js';
import { Icono, IlustracionBicicletaFallback } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { agregarProductoAlCarrito } from '../../utils/carritoHelper.js';
import { formatearCOP } from '../../utils/formato.js';

export function ProductoDetallePage({ onNotificar }) {
  const { id } = useParams();
  const { estaAutenticado, esAdmin, setCantidadCarrito } = useAuth();

  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [error, setError] = useState('');
  const [errorImg, setErrorImg] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useTituloPagina(producto?.nombre || 'Detalle de producto');

  useEffect(() => {
    const controller = new AbortController();
    let activo = true;
    setCargando(true);
    setNoEncontrado(false);
    setError('');
    setErrorImg(false);
    setCantidad(1);

    catalogoApi
      .productoPorId(id, { signal: controller.signal })
      .then((resp) => {
        if (!activo) return;
        setProducto(resp?.datos || null);
      })
      .catch((err) => {
        if (!activo || err?.name === 'AbortError') return;
        if (err?.status === 404) {
          setNoEncontrado(true);
        } else {
          setError(err?.mensaje || 'No fue posible consultar este producto.');
        }
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
      controller.abort();
    };
  }, [id]);

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Cargando ficha del producto...</p>
      </section>
    );
  }

  if (noEncontrado) {
    return (
      <section className="contenedor pagina-estado">
        <div className="pagina-estado-contenido">
          <p className="pagina-estado-codigo">404</p>
          <h1>Producto no disponible</h1>
          <p>El artículo consultado no existe o fue retirado del catálogo activo.</p>
          <div className="pagina-estado-acciones">
            <Link className="btn btn-primario" to="/catalogo">
              Volver al catálogo
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (error || !producto) {
    return (
      <section className="contenedor seccion">
        <div className="alerta alerta-error" role="alert">
          <Icono tipo="error" size={20} />
          <div>
            <p>{error || 'No se pudo cargar el producto.'}</p>
            <Link className="btn btn-contorno" to="/catalogo" style={{ marginTop: '0.75rem' }}>
              Volver al catálogo
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const existencias = Number(producto.existencias ?? 0);
  const estaAgotado = Boolean(producto.agotado) || existencias <= 0;

  const manejarAgregar = async (ev) => {
    ev.preventDefault();
    if (estaAgotado || enviando) return;
    setEnviando(true);
    await agregarProductoAlCarrito({
      producto,
      cantidad,
      estaAutenticado,
      esAdmin,
      setCantidadCarrito,
      notificar: onNotificar,
    });
    setEnviando(false);
  };

  return (
    <section className="contenedor seccion">
      <p style={{ marginBottom: '1.25rem' }}>
        <Link to="/catalogo">← Volver al catálogo</Link>
      </p>

      <div className="detalle-producto">
        <div className="detalle-marco">
          {producto.imagen_url && !errorImg ? (
            <img
              src={producto.imagen_url}
              alt={producto.nombre}
              width="640"
              height="480"
              fetchPriority="high"
              onError={() => setErrorImg(true)}
            />
          ) : (
            <div className="tarjeta-sin-imagen" aria-label={`Sin imagen disponible para ${producto.nombre}`}>
              <IlustracionBicicletaFallback />
            </div>
          )}
        </div>

        <div className="panel">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {producto.categoria_nombre && (
              <span className="insignia insignia-neutro">{producto.categoria_nombre}</span>
            )}
            <StatusBadge codigo={estaAgotado ? 'AGOTADO' : 'DISPONIBLE'} />
          </div>

          <h1>{producto.nombre}</h1>
          <p className="tarjeta-precio tabular" style={{ fontSize: '1.9rem', marginBottom: '0.5rem' }}>
            {formatearCOP(producto.precio)}
          </p>
          <p className="campo-ayuda" style={{ marginBottom: '1rem' }}>
            {estaAgotado
              ? 'Actualmente sin unidades en bodega.'
              : `${existencias} ${existencias === 1 ? 'unidad disponible' : 'unidades disponibles'} para entrega inmediata.`}
          </p>

          <p style={{ whiteSpace: 'pre-line', marginBottom: '1.5rem' }}>{producto.descripcion}</p>

          <form onSubmit={manejarAgregar}>
            {!estaAgotado && (
              <div className="campo">
                <label htmlFor="detalle-cantidad">Cantidad</label>
                <span id="detalle-cantidad-ayuda" className="campo-ayuda">
                  Máximo {Math.min(1000, existencias)} unidades por pedido.
                </span>
                <input
                  id="detalle-cantidad"
                  name="cantidad"
                  type="number"
                  className="campo-control"
                  min={1}
                  max={Math.min(1000, existencias)}
                  value={cantidad}
                  onChange={(ev) =>
                    setCantidad(Math.max(1, Math.min(existencias, Math.trunc(Number(ev.target.value) || 1))))
                  }
                  aria-describedby="detalle-cantidad-ayuda"
                />
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                type="submit"
                className={`btn ${estaAgotado ? 'btn-contorno' : 'btn-primario'}`}
                disabled={estaAgotado || enviando}
              >
                <Icono tipo="carrito" size={18} />
                <span>
                  {estaAgotado ? 'Agotado' : enviando ? 'Agregando...' : 'Agregar al carrito'}
                </span>
              </button>
              <Link className="btn btn-contorno" to="/carrito">
                Ir al carrito
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
