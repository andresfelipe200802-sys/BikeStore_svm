import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { retractosApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota } from '../../utils/formato.js';

export function RetractoDetallePage() {
  const { id } = useParams();
  useTituloPagina(`Retracto #${id}`);
  const captionId = useId();
  const [retracto, setRetracto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    retractosApi
      .obtener(id)
      .then((resp) => {
        if (!activo) return;
        setRetracto(resp.datos);
      })
      .catch((err) => {
        if (!activo) return;
        setError(err?.mensaje || 'No encontramos la solicitud de retracto.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [id]);

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Cargando detalle de retracto...</p>
      </section>
    );
  }

  if (!retracto) {
    return (
      <section className="contenedor seccion">
        <div className="alerta alerta-error" role="alert">
          <Icono tipo="error" size={20} />
          <div>
            <p>{error}</p>
            <Link className="btn btn-contorno" to="/retractos" style={{ marginTop: '0.75rem' }}>
              Volver a mis retractos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="contenedor seccion">
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/retractos">← Volver a mis retractos</Link>
      </p>

      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Pedido #{retracto.id_pedido}</p>
          <h1 className="titulo-seccion">Solicitud de retracto #{retracto.id_retracto}</h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <StatusBadge codigo={retracto.tipo_retracto} contexto="tipo_retracto" />
          <StatusBadge codigo={retracto.estado_retracto} />
          <StatusBadge codigo={retracto.estado_reembolso} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '2rem' }}>
        <h2>Resumen de trámite</h2>
        <p className="campo-ayuda">
          Motivo reportado: <strong>{retracto.motivo}</strong>
        </p>
        <p className="campo-ayuda">
          Datos para reembolso: <strong>{retracto.datos_reembolso}</strong>
        </p>
        <p className="campo-ayuda">
          Monto de reembolso: <strong className="tabular">{formatearCOP(retracto.monto_reembolso)}</strong>{' '}
          · Solicitado: {formatearFechaHoraBogota(retracto.fecha_solicitud)}
        </p>
        {retracto.fecha_recepcion_fisica && (
          <p className="campo-ayuda">
            Inspección física registrada: {formatearFechaHoraBogota(retracto.fecha_recepcion_fisica)}
          </p>
        )}
        {retracto.fecha_reembolso && (
          <p className="campo-ayuda">
            Reembolso confirmado: {formatearFechaHoraBogota(retracto.fecha_reembolso)}
          </p>
        )}
        {retracto.observacion_admin && (
          <p className="campo-ayuda">
            Observación del administrador: <strong>{retracto.observacion_admin}</strong>
          </p>
        )}
      </div>

      <h2 style={{ marginBottom: '0.75rem' }}>Inspección por producto</h2>
      <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
        <table className="tabla-datos">
          <caption id={captionId}>Líneas incluidas en el retracto #{retracto.id_retracto}</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Devueltas</th>
              <th scope="col">Buen estado</th>
              <th scope="col">Dañadas</th>
              <th scope="col">Inspección</th>
              <th scope="col">Subtotal reembolso</th>
              <th scope="col">Observación</th>
            </tr>
          </thead>
          <tbody>
            {(retracto.detalles || []).map((d) => (
              <tr key={d.id_detalle_retracto}>
                <th scope="row">{d.producto_nombre}</th>
                <td data-etiqueta="Devueltas" className="tabular">{d.cantidad_devuelta}</td>
                <td data-etiqueta="Buen estado" className="tabular">
                  {d.cantidad_buen_estado ?? 'Pendiente'}
                </td>
                <td data-etiqueta="Dañadas" className="tabular">
                  {d.cantidad_danada ?? 'Pendiente'}
                </td>
                <td data-etiqueta="Inspección">
                  {d.estado_inspeccion ? (
                    <StatusBadge codigo={d.estado_inspeccion} />
                  ) : (
                    <StatusBadge codigo="PENDIENTE" etiquetaPersonalizada="Pendiente recepción" />
                  )}
                </td>
                <td data-etiqueta="Subtotal" className="tabular">
                  {formatearCOP(d.subtotal_reembolso)}
                </td>
                <td data-etiqueta="Observación">{d.observacion_inspeccion || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
