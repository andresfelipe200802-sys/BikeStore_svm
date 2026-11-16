import { useCallback, useEffect, useId, useState } from 'react';
import { adminApi } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota } from '../../utils/formato.js';

const ESTADOS_PEDIDO = ['', 'PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];

export function AdminPedidosPage({ onNotificar }) {
  useTituloPagina('Admin - Pedidos');
  const captionId = useId();

  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [pedidos, setPedidos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [cancelarTarget, setCancelarTarget] = useState(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [reembolsoTarget, setReembolsoTarget] = useState(null);
  const [observacionReembolso, setObservacionReembolso] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async (estado, pagina) => {
    setCargando(true);
    try {
      // admin.routes.js acepta exclusivamente { estado?, page?, limit? }
      const resp = await adminApi.listarPedidos({ estado, page: pagina, limit: 20 });
      setPedidos(resp?.datos || []);
      setMeta(resp?.meta || null);
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No pudimos cargar los pedidos administrativos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(estadoFiltro, page);
  }, [estadoFiltro, page, cargar]);

  const avanzarEstado = async (idPedido, nuevoEstado) => {
    setError('');
    try {
      await adminApi.cambiarEstadoPedido(idPedido, { estado_pedido: nuevoEstado });
      onNotificar?.('exito', `Pedido #${idPedido} actualizado a ${nuevoEstado}.`);
      await cargar(estadoFiltro, page);
    } catch (err) {
      setError(err?.mensaje || 'No fue posible actualizar el estado del pedido.');
    }
  };

  const ejecutarCancelacion = async () => {
    if (!cancelarTarget) return;
    setErrorModal('');
    if (motivoCancelacion.trim().length < 3) {
      setErrorModal('El motivo de cancelación es obligatorio (mínimo 3 caracteres).');
      return;
    }

    setProcesando(true);
    try {
      await adminApi.cambiarEstadoPedido(cancelarTarget.id_pedido, {
        estado_pedido: 'CANCELADO',
        motivo_cancelacion: motivoCancelacion.trim(),
      });
      onNotificar?.('exito', `Pedido #${cancelarTarget.id_pedido} cancelado.`);
      setCancelarTarget(null);
      setMotivoCancelacion('');
      await cargar(estadoFiltro, page);
    } catch (err) {
      setErrorModal(err?.mensaje || 'No pudimos cancelar el pedido.');
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarReembolso = async () => {
    if (!reembolsoTarget) return;
    setErrorModal('');
    setProcesando(true);
    try {
      // PATCH /api/admin/pedidos/:id/reembolso espera { observacion? }
      await adminApi.confirmarReembolsoPedido(reembolsoTarget.id_pedido, {
        observacion: observacionReembolso,
      });
      onNotificar?.('exito', `Reembolso confirmado para pedido #${reembolsoTarget.id_pedido}.`);
      setReembolsoTarget(null);
      setObservacionReembolso('');
      await cargar(estadoFiltro, page);
    } catch (err) {
      setErrorModal(err?.mensaje || 'No fue posible confirmar el reembolso.');
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
            <p className="antetitulo">Despacho y cancelaciones</p>
            <h1 className="titulo-seccion">Gestión de pedidos</h1>
          </div>
          <p>Para filtrar ventas por rango de fechas, usa el tablero de reportes en /admin.</p>
        </div>

        <div className="pestanas-categoria" role="group" aria-label="Filtrar pedidos por estado">
          {ESTADOS_PEDIDO.map((est) => (
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
              {est || 'Todos'}
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
          <p className="texto-estado">Cargando pedidos...</p>
        ) : (
          <>
            <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
              <table className="tabla-datos">
                <caption id={captionId}>Listado operativo de pedidos</caption>
                <thead>
                  <tr>
                    <th scope="col">Pedido</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Total</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Reembolso cancelación</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.id_pedido}>
                      <th scope="row" className="tabular">#{p.id_pedido}</th>
                      <td data-etiqueta="Cliente">
                        <strong>{p.cliente_nombre} {p.cliente_apellido}</strong>
                        <p className="campo-ayuda" style={{ margin: 0 }}>{p.cliente_correo}</p>
                        <p className="campo-ayuda" style={{ margin: 0 }}>{p.direccion_envio}</p>
                      </td>
                      <td data-etiqueta="Fecha">{formatearFechaHoraBogota(p.fecha_pedido)}</td>
                      <td data-etiqueta="Total" className="tabular">{formatearCOP(p.total)}</td>
                      <td data-etiqueta="Estado"><StatusBadge codigo={p.estado_pedido} /></td>
                      <td data-etiqueta="Reembolso">
                        <StatusBadge codigo={p.estado_reembolso_cancelacion} />
                        {p.datos_reembolso_cancelacion && (
                          <p className="campo-ayuda" style={{ margin: '0.25rem 0 0' }}>
                            {p.datos_reembolso_cancelacion}
                          </p>
                        )}
                      </td>
                      <td data-etiqueta="Acciones">
                        <div className="acciones-celda">
                          {p.estado_pedido === 'PAGADO' && (
                            <button
                              type="button"
                              className="btn btn-primario btn-pequeno"
                              onClick={() => avanzarEstado(p.id_pedido, 'ENVIADO')}
                            >
                              Marcar enviado
                            </button>
                          )}
                          {p.estado_pedido === 'ENVIADO' && (
                            <button
                              type="button"
                              className="btn btn-primario btn-pequeno"
                              onClick={() => avanzarEstado(p.id_pedido, 'ENTREGADO')}
                            >
                              Marcar entregado
                            </button>
                          )}
                          {(p.estado_pedido === 'PENDIENTE' || p.estado_pedido === 'PAGADO') && (
                            <button
                              type="button"
                              className="btn btn-oscuro btn-pequeno"
                              onClick={() => {
                                setErrorModal('');
                                setMotivoCancelacion('');
                                setCancelarTarget(p);
                              }}
                            >
                              Cancelar
                            </button>
                          )}
                          {p.estado_pedido === 'CANCELADO' &&
                            p.estado_reembolso_cancelacion === 'PENDIENTE_REEMBOLSO' && (
                              <button
                                type="button"
                                className="btn btn-primario btn-pequeno"
                                onClick={() => {
                                  setErrorModal('');
                                  setObservacionReembolso('');
                                  setReembolsoTarget(p);
                                }}
                              >
                                Confirmar reembolso
                              </button>
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

        <ConfirmDialog
          abierto={Boolean(cancelarTarget)}
          titulo={`Cancelar pedido #${cancelarTarget?.id_pedido}`}
          mensaje="Se restituirá el inventario y, si el pedido estaba pagado, quedará en PENDIENTE_REEMBOLSO."
          etiquetaConfirmar="Confirmar cancelación"
          etiquetaCancelar="Volver"
          varianteDestructiva
          ocupado={procesando}
          onConfirmar={ejecutarCancelacion}
          onCancelar={() => setCancelarTarget(null)}
        >
          {errorModal && (
            <div className="alerta alerta-error" role="alert" style={{ marginBottom: '0.85rem' }}>
              <Icono tipo="error" size={18} />
              <p>{errorModal}</p>
            </div>
          )}
          <div className="campo">
            <label htmlFor="adm-canc-motivo">Motivo obligatorio *</label>
            <input
              id="adm-canc-motivo"
              type="text"
              className="campo-control"
              value={motivoCancelacion}
              onChange={(ev) => setMotivoCancelacion(ev.target.value)}
              minLength={3}
              maxLength={500}
            />
          </div>
        </ConfirmDialog>

        <ConfirmDialog
          abierto={Boolean(reembolsoTarget)}
          titulo={`Confirmar reembolso del pedido #${reembolsoTarget?.id_pedido}`}
          mensaje="Esta acción marcará el pago y la cancelación como REEMBOLSADO para los reportes netos."
          etiquetaConfirmar="Confirmar reembolso"
          etiquetaCancelar="Cancelar"
          ocupado={procesando}
          onConfirmar={ejecutarReembolso}
          onCancelar={() => setReembolsoTarget(null)}
        >
          {errorModal && (
            <div className="alerta alerta-error" role="alert" style={{ marginBottom: '0.85rem' }}>
              <Icono tipo="error" size={18} />
              <p>{errorModal}</p>
            </div>
          )}
          <div className="campo">
            <label htmlFor="adm-reemb-obs">Observación de comprobante (opcional)</label>
            <input
              id="adm-reemb-obs"
              type="text"
              className="campo-control"
              value={observacionReembolso}
              onChange={(ev) => setObservacionReembolso(ev.target.value)}
              maxLength={250}
            />
          </div>
        </ConfirmDialog>
      </section>
    </>
  );
}
