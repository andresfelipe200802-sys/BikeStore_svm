import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { pedidosApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota } from '../../utils/formato.js';

export function MisPedidosPage() {
  useTituloPagina('Mis pedidos');
  const captionId = useId();
  const [page, setPage] = useState(1);
  const [pedidos, setPedidos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');

    pedidosApi
      .listar({ page, limit: 10 })
      .then((resp) => {
        if (!activo) return;
        setPedidos(resp?.datos || []);
        setMeta(resp?.meta || null);
      })
      .catch((err) => {
        if (!activo) return;
        setError(err?.mensaje || 'No fue posible consultar tus pedidos.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [page]);

  return (
    <section className="contenedor seccion">
      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Historial de compras</p>
          <h1 className="titulo-seccion">Mis pedidos</h1>
        </div>
        <Link className="btn btn-primario" to="/catalogo">
          Seguir comprando
        </Link>
      </div>

      {error && (
        <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <Icono tipo="error" size={20} />
          <p>{error}</p>
        </div>
      )}

      {cargando ? (
        <p className="texto-estado" aria-live="polite">
          Cargando tus pedidos...
        </p>
      ) : pedidos.length === 0 ? (
        <div className="estado-vacio">
          <p>Todavía no has realizado pedidos en BikeStore.</p>
          <Link className="btn btn-primario" to="/catalogo">
            Explorar catálogo
          </Link>
        </div>
      ) : (
        <>
          <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
            <table className="tabla-datos">
              <caption id={captionId}>Órdenes registradas en tu cuenta</caption>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Fecha (Bogotá)</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Reembolso</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id_pedido}>
                    <th scope="row" className="tabular">#{p.id_pedido}</th>
                    <td data-etiqueta="Fecha">{formatearFechaHoraBogota(p.fecha_pedido)}</td>
                    <td data-etiqueta="Total" className="tabular">
                      <strong>{formatearCOP(p.total)}</strong>
                    </td>
                    <td data-etiqueta="Estado">
                      <StatusBadge codigo={p.estado_pedido} />
                    </td>
                    <td data-etiqueta="Reembolso">
                      <StatusBadge codigo={p.estado_reembolso_cancelacion} />
                    </td>
                    <td data-etiqueta="Acciones">
                      <div className="acciones-celda">
                        <Link className="btn btn-contorno btn-pequeno" to={`/pedidos/${p.id_pedido}`}>
                          Ver detalle
                        </Link>
                        {p.estado_pedido === 'PENDIENTE' && (
                          <Link className="btn btn-primario btn-pequeno" to={`/pedidos/${p.id_pedido}/pago`}>
                            Ir a pagar
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion meta={meta} onCambiarPagina={setPage} />
        </>
      )}
    </section>
  );
}
