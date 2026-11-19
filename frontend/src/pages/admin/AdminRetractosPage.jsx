import { useCallback, useEffect, useId, useState } from 'react';
import { adminApi } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota, obtenerMetaEstado } from '../../utils/formato.js';

const ESTADOS_RETRACTO = ['', 'SOLICITADO', 'APROBADO_RECEPCION', 'COMPLETADO', 'RECHAZADO'];

export function AdminRetractosPage({ onNotificar }) {
  useTituloPagina('Admin - Retractos', {
    descripcion: 'Gestión administrativa de solicitudes de retracto BikeStore.',
    noIndex: true,
  });
  const captionId = useId();

  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [retractos, setRetractos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [observacionAdmin, setObservacionAdmin] = useState('');
  const [inspeccion, setInspeccion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const cargarListado = useCallback(async (est, pag) => {
    setCargando(true);
    try {
      const resp = await adminApi.listarRetractos({ estado: est, page: pag, limit: 20 });
      setRetractos(resp?.datos || []);
      setMeta(resp?.meta || null);
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No pudimos cargar las solicitudes de retracto.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarListado(estadoFiltro, page);
  }, [estadoFiltro, page, cargarListado]);

  const abrirDetalle = async (idRetracto) => {
    setCargandoDetalle(true);
    setError('');
    try {
      const resp = await adminApi.obtenerRetracto(idRetracto);
      const det = resp.datos;
      setSeleccionado(det);
      setObservacionAdmin(det?.observacion_admin || '');
      const mapaInsp = {};
      for (const l of det?.detalles || []) {
        mapaInsp[l.id_detalle_retracto] = {
          buen_estado: l.cantidad_buen_estado ?? l.cantidad_devuelta,
          observacion_inspeccion: l.observacion_inspeccion || '',
        };
      }
      setInspeccion(mapaInsp);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos consultar el detalle del retracto.');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const decidir = async (decision) => {
    if (!seleccionado) return;
    setProcesando(true);
    setError('');
    try {
      await adminApi.decidirRetracto(seleccionado.id_retracto, {
        decision,
        observacion_admin: observacionAdmin,
      });
      onNotificar?.(
        'exito',
        decision === 'APROBAR'
          ? `Aprobación registrada para el retracto #${seleccionado.id_retracto}.`
          : `Rechazo registrado para el retracto #${seleccionado.id_retracto}.`
      );
      await Promise.all([cargarListado(estadoFiltro, page), abrirDetalle(seleccionado.id_retracto)]);
    } catch (err) {
      setError(err?.mensaje || 'No fue posible registrar la decisión.');
    } finally {
      setProcesando(false);
    }
  };

  const registrarRecepcion = async (ev) => {
    ev.preventDefault();
    if (!seleccionado) return;
    setProcesando(true);
    setError('');

    const items = (seleccionado.detalles || []).map((l) => {
      const reg = inspeccion[l.id_detalle_retracto] || { buen_estado: 0, observacion_inspeccion: '' };
      const buen = Math.max(0, Math.min(l.cantidad_devuelta, Math.trunc(Number(reg.buen_estado) || 0)));
      return {
        id_detalle_retracto: l.id_detalle_retracto,
        cantidad_buen_estado: buen,
        cantidad_danada: l.cantidad_devuelta - buen,
        observacion_inspeccion: reg.observacion_inspeccion || '',
      };
    });

    try {
      await adminApi.registrarRecepcionRetracto(seleccionado.id_retracto, {
        observacion_admin: observacionAdmin,
        items,
      });
      onNotificar?.('exito', `Recepción física registrada para retracto #${seleccionado.id_retracto}.`);
      await Promise.all([cargarListado(estadoFiltro, page), abrirDetalle(seleccionado.id_retracto)]);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos registrar la inspección física.');
    } finally {
      setProcesando(false);
    }
  };

  const confirmarReembolso = async () => {
    if (!seleccionado) return;
    setProcesando(true);
    setError('');
    try {
      await adminApi.confirmarReembolsoRetracto(seleccionado.id_retracto, {
        observacion_admin: observacionAdmin,
      });
      onNotificar?.('exito', `Reembolso completado para retracto #${seleccionado.id_retracto}.`);
      await Promise.all([cargarListado(estadoFiltro, page), abrirDetalle(seleccionado.id_retracto)]);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos confirmar el reembolso.');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <>
      <AdminNav />
      <section className="contenedor seccion">
        <div className="seccion-encabezado">
          <div>
            <p className="antetitulo">Ley 1480 · Flujo de inspección y reembolso</p>
            <h1 className="titulo-seccion">Gestión de retractos legales</h1>
          </div>
        </div>

        <div className="pestanas-categoria" role="group" aria-label="Filtrar retractos por estado">
          {ESTADOS_RETRACTO.map((est) => (
            <button
              key={est || 'TODOS'}
              type="button"
              className="pestana-btn"
              aria-pressed={estadoFiltro === est}
              onClick={() => {
                setEstadoFiltro(est);
                setPage(1);
              }}
            >
              {est ? obtenerMetaEstado(est).etiqueta : 'Todos'}
            </button>
          ))}
        </div>

        {error && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{error}</p>
          </div>
        )}

        {cargando ? (
          <p className="texto-estado">Cargando retractos...</p>
        ) : (
          <>
            <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
              <table className="tabla-datos">
                <caption id={captionId}>Solicitudes de retracto registradas</caption>
                <thead>
                  <tr>
                    <th scope="col">Retracto</th>
                    <th scope="col">Pedido</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Reembolso</th>
                    <th scope="col">Monto</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {retractos.map((r) => (
                    <tr key={r.id_retracto}>
                      <th scope="row" className="tabular">#{r.id_retracto}</th>
                      <td data-etiqueta="Pedido" className="tabular">#{r.id_pedido}</td>
                      <td data-etiqueta="Cliente">
                        {r.cliente_nombre} {r.cliente_apellido}
                        <p className="campo-ayuda" style={{ margin: 0 }}>{r.cliente_correo}</p>
                      </td>
                      <td data-etiqueta="Estado"><StatusBadge codigo={r.estado_retracto} /></td>
                      <td data-etiqueta="Reembolso"><StatusBadge codigo={r.estado_reembolso} /></td>
                      <td data-etiqueta="Monto" className="tabular">{formatearCOP(r.monto_reembolso)}</td>
                      <td data-etiqueta="Fecha">{formatearFechaHoraBogota(r.fecha_solicitud)}</td>
                      <td data-etiqueta="Acciones">
                        <button
                          type="button"
                          className="btn btn-primario btn-pequeno"
                          onClick={() => abrirDetalle(r.id_retracto)}
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion meta={meta} onCambiarPagina={setPage} />
          </>
        )}

        {cargandoDetalle && <p className="texto-estado">Cargando detalle de retracto...</p>}

        {seleccionado && !cargandoDetalle && (
          <section className="panel" style={{ marginTop: '2rem' }} aria-label="Detalle operativo del retracto">
            <div className="seccion-encabezado">
              <div>
                <p className="antetitulo">Pedido #{seleccionado.id_pedido}</p>
                <h2>Gestionar retracto #{seleccionado.id_retracto}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <StatusBadge codigo={seleccionado.estado_retracto} />
                <StatusBadge codigo={seleccionado.estado_reembolso} />
                <button
                  type="button"
                  className="btn btn-contorno btn-pequeno"
                  onClick={() => setSeleccionado(null)}
                >
                  Cerrar panel
                </button>
              </div>
            </div>

            <p className="campo-ayuda">Motivo cliente: <strong>{seleccionado.motivo}</strong></p>
            <p className="campo-ayuda">Datos reembolso: <strong>{seleccionado.datos_reembolso}</strong></p>
            <p className="campo-ayuda" style={{ marginBottom: '1rem' }}>
              Monto vigente: <strong className="tabular">{formatearCOP(seleccionado.monto_reembolso)}</strong>
            </p>

            <div className="campo">
              <label htmlFor="ret-adm-obs">Observación del administrador (opcional)</label>
              <input
                id="ret-adm-obs"
                type="text"
                className="campo-control"
                value={observacionAdmin}
                onChange={(ev) => setObservacionAdmin(ev.target.value)}
                maxLength={500}
              />
            </div>

            {seleccionado.estado_retracto === 'SOLICITADO' && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primario"
                  disabled={procesando}
                  onClick={() => decidir('APROBAR')}
                >
                  Aprobar para recepción física
                </button>
                <button
                  type="button"
                  className="btn btn-oscuro"
                  disabled={procesando}
                  onClick={() => decidir('RECHAZAR')}
                >
                  Rechazar solicitud
                </button>
              </div>
            )}

            {seleccionado.estado_retracto === 'APROBADO_RECEPCION' &&
              !seleccionado.fecha_recepcion_fisica && (
                <form className="formulario" onSubmit={registrarRecepcion}>
                  <h3>Inspección física línea por línea</h3>
                  {(seleccionado.detalles || []).map((l) => {
                    const actual = inspeccion[l.id_detalle_retracto] || {
                      buen_estado: 0,
                      observacion_inspeccion: '',
                    };
                    const danada = Math.max(0, l.cantidad_devuelta - Number(actual.buen_estado || 0));
                    return (
                      <div key={l.id_detalle_retracto} className="panel" style={{ marginBottom: '0.9rem' }}>
                        <strong>{l.producto_nombre}</strong> (devueltas: {l.cantidad_devuelta} u.)
                        <div className="fila-dos-columnas" style={{ marginTop: '0.6rem' }}>
                          <div className="campo" style={{ marginBottom: 0 }}>
                            <label htmlFor={`insp-buen-${l.id_detalle_retracto}`}>
                              Unidades en buen estado (dañadas automáticas: {danada})
                            </label>
                            <input
                              id={`insp-buen-${l.id_detalle_retracto}`}
                              type="number"
                              className="campo-control"
                              min={0}
                              max={l.cantidad_devuelta}
                              value={actual.buen_estado}
                              onChange={(ev) => {
                                const val = Math.max(
                                  0,
                                  Math.min(l.cantidad_devuelta, Math.trunc(Number(ev.target.value) || 0))
                                );
                                setInspeccion((p) => ({
                                  ...p,
                                  [l.id_detalle_retracto]: { ...actual, buen_estado: val },
                                }));
                              }}
                            />
                          </div>
                          <div className="campo" style={{ marginBottom: 0 }}>
                            <label htmlFor={`insp-obs-${l.id_detalle_retracto}`}>
                              Observación inspección (opcional)
                            </label>
                            <input
                              id={`insp-obs-${l.id_detalle_retracto}`}
                              type="text"
                              className="campo-control"
                              value={actual.observacion_inspeccion}
                              onChange={(ev) =>
                                setInspeccion((p) => ({
                                  ...p,
                                  [l.id_detalle_retracto]: {
                                    ...actual,
                                    observacion_inspeccion: ev.target.value,
                                  },
                                }))
                              }
                              maxLength={300}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button type="submit" className="btn btn-primario" disabled={procesando}>
                    {procesando ? 'Guardando inspección...' : 'Registrar recepción física'}
                  </button>
                </form>
              )}

            {seleccionado.estado_retracto === 'APROBADO_RECEPCION' &&
              seleccionado.estado_reembolso === 'PENDIENTE_REEMBOLSO' &&
              seleccionado.fecha_recepcion_fisica && (
                <button
                  type="button"
                  className="btn btn-primario"
                  disabled={procesando}
                  onClick={confirmarReembolso}
                >
                  {procesando ? 'Confirmando...' : 'Confirmar reembolso de retracto'}
                </button>
              )}
          </section>
        )}
      </section>
    </>
  );
}
