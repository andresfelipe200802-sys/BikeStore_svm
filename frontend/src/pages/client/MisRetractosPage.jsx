import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { retractosApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota } from '../../utils/formato.js';

export function MisRetractosPage() {
  useTituloPagina('Mis retractos', {
    descripcion: 'Historial de solicitudes de derecho de retracto en BikeStore.',
    noIndex: true,
  });
  const captionId = useId();
  const [page, setPage] = useState(1);
  const [retractos, setRetractos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');

    retractosApi
      .listar({ page, limit: 10 })
      .then((resp) => {
        if (!activo) return;
        setRetractos(resp?.datos || []);
        setMeta(resp?.meta || null);
      })
      .catch((err) => {
        if (!activo) return;
        setError(err?.mensaje || 'No pudimos consultar tus solicitudes de retracto.');
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
          <p className="antetitulo">Derecho legal · 5 días hábiles</p>
          <h1 className="titulo-seccion">Mis solicitudes de retracto</h1>
        </div>
        <Link className="btn btn-contorno" to="/pedidos">
          Ver mis pedidos
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
          Cargando solicitudes de retracto...
        </p>
      ) : retractos.length === 0 ? (
        <div className="estado-vacio">
          <p>
            No tienes solicitudes de retracto registradas. Puedes iniciar una desde el detalle de
            cualquier pedido en estado <strong>Entregado</strong>.
          </p>
          <Link className="btn btn-primario" to="/pedidos">
            Ir a mis pedidos
          </Link>
        </div>
      ) : (
        <>
          <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
            <table className="tabla-datos">
              <caption id={captionId}>Historial de solicitudes de retracto</caption>
              <thead>
                <tr>
                  <th scope="col">Retracto</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Reembolso</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Fecha solicitud</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {retractos.map((r) => (
                  <tr key={r.id_retracto}>
                    <th scope="row" className="tabular">#{r.id_retracto}</th>
                    <td data-etiqueta="Pedido" className="tabular">
                      <Link to={`/pedidos/${r.id_pedido}`}>#{r.id_pedido}</Link>
                    </td>
                    <td data-etiqueta="Tipo">
                      <StatusBadge codigo={r.tipo_retracto} contexto="tipo_retracto" />
                    </td>
                    <td data-etiqueta="Estado">
                      <StatusBadge codigo={r.estado_retracto} />
                    </td>
                    <td data-etiqueta="Reembolso">
                      <StatusBadge codigo={r.estado_reembolso} />
                    </td>
                    <td data-etiqueta="Monto" className="tabular">
                      <strong>{formatearCOP(r.monto_reembolso)}</strong>
                    </td>
                    <td data-etiqueta="Solicitud">{formatearFechaHoraBogota(r.fecha_solicitud)}</td>
                    <td data-etiqueta="Acciones">
                      <Link className="btn btn-contorno btn-pequeno" to={`/retractos/${r.id_retracto}`}>
                        Ver detalle
                      </Link>
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
