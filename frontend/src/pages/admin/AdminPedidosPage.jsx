import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { adminApi, obtenerPedidoAdminDetalle } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota, obtenerMetaEstado } from '../../utils/formato.js';

const ESTADOS_PEDIDO = ['', 'PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];

export function AdminPedidosPage({ onNotificar }) {
  useTituloPagina('Admin - Pedidos', {
    descripcion: 'Gestión administrativa de pedidos y reembolsos BikeStore.',
    noIndex: true,
  });
  const { token } = useAuth();
  const captionId = useId();
  const detalleTituloId = useId();
  const detalleProductosCaptionId = useId();
  const detallePagosCaptionId = useId();
  const detalleDialogRef = useRef(null);

  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [pedidos, setPedidos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [detallePedido, setDetallePedido] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');

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

  useEffect(() => {
    const el = detalleDialogRef.current;
    if (!el) return;
    if (detalleAbierto) {
      if (!el.open) {
        if (typeof el.showModal === 'function') {
          el.showModal();
        } else {
          el.setAttribute('open', '');
        }
      }
    } else if (el.open) {
      if (typeof el.close === 'function') {
        el.close();
      } else {
        el.removeAttribute('open');
      }
    }
  }, [detalleAbierto]);

  const abrirDetallePedido = async (idPedido) => {
    setDetallePedido(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    setDetalleAbierto(true);
    try {
      const resp = await obtenerPedidoAdminDetalle(token, idPedido);
      setDetallePedido(resp?.datos || null);
    } catch (err) {
      setErrorDetalle(err?.mensaje || 'No fue posible consultar el detalle del pedido.');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const cerrarDetallePedido = () => {
    setDetalleAbierto(false);
    setDetallePedido(null);
    setErrorDetalle('');
  };

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
          <p>Para filtrar ventas por rango de fechas, consulta el tablero de resumen y reportes.</p>
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
                          <button
                            type="button"
                            className="btn btn-contorno btn-pequeno"
                            onClick={() => abrirDetallePedido(p.id_pedido)}
                          >
                            Ver detalle
                          </button>
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
          mensaje="Se restituirá el inventario y, si el pedido ya estaba pagado, quedará pendiente de reembolso."
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
          mensaje="Esta acción confirmará el reembolso del pedido y lo reflejará en los reportes netos."
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

        <dialog
          ref={detalleDialogRef}
          className="dialogo"
          style={{ inlineSize: 'min(48rem, calc(100dvw - 2rem))', overflowY: 'auto' }}
          aria-labelledby={detalleTituloId}
          onClose={cerrarDetallePedido}
        >
          <div className="seccion-encabezado" style={{ marginBottom: '1rem' }}>
            <div>
              <h2 id={detalleTituloId}>
                {detallePedido ? `Detalle del pedido #${detallePedido.id_pedido}` : 'Detalle del pedido'}
              </h2>
              {detallePedido && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <StatusBadge codigo={detallePedido.estado_pedido} />
                  <StatusBadge codigo={detallePedido.estado_reembolso_cancelacion} />
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-contorno btn-pequeno"
              onClick={cerrarDetallePedido}
            >
              Cerrar
            </button>
          </div>

          {cargandoDetalle ? (
            <p className="texto-estado" aria-live="polite">
              Cargando detalle del pedido...
            </p>
          ) : errorDetalle ? (
            <div className="alerta alerta-error" role="alert">
              <Icono tipo="error" size={18} />
              <p>{errorDetalle}</p>
            </div>
          ) : detallePedido ? (
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              <div>
                <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                  Cliente:{' '}
                  <strong>
                    {detallePedido.cliente_nombre} {detallePedido.cliente_apellido}
                  </strong>{' '}
                  ({detallePedido.cliente_tipo_documento} {detallePedido.cliente_numero_documento})
                </p>
                <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                  Contacto: {detallePedido.cliente_correo} · Tel. {detallePedido.cliente_telefono}
                </p>
                <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                  Dirección de envío: <strong>{detallePedido.direccion_envio}</strong>
                </p>
                <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                  Fecha de creación: {formatearFechaHoraBogota(detallePedido.fecha_pedido)} · Total:{' '}
                  <strong className="tabular">{formatearCOP(detallePedido.total)}</strong>
                </p>
                {detallePedido.fecha_envio && (
                  <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                    Enviado: {formatearFechaHoraBogota(detallePedido.fecha_envio)}
                  </p>
                )}
                {detallePedido.fecha_entrega && (
                  <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                    Entregado: {formatearFechaHoraBogota(detallePedido.fecha_entrega)}
                  </p>
                )}
                {detallePedido.motivo_cancelacion && (
                  <p className="campo-ayuda" style={{ margin: '0 0 0.25rem' }}>
                    Motivo de cancelación: {detallePedido.motivo_cancelacion}
                  </p>
                )}
                {detallePedido.datos_reembolso_cancelacion && (
                  <p className="campo-ayuda" style={{ margin: 0 }}>
                    Datos de reembolso: {detallePedido.datos_reembolso_cancelacion}
                  </p>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Productos</h3>
                <div tabIndex={0} role="region" aria-labelledby={detalleProductosCaptionId} className="table-wrapper">
                  <table className="tabla-datos">
                    <caption id={detalleProductosCaptionId} className="sr-only">
                      Productos incluidos en el pedido
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Producto</th>
                        <th scope="col">Cantidad</th>
                        <th scope="col">Precio unitario</th>
                        <th scope="col">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detallePedido.detalles || []).map((det) => (
                        <tr key={det.id_detalle_pedido}>
                          <th scope="row">{det.nombre}</th>
                          <td data-etiqueta="Cantidad" className="tabular">
                            {det.cantidad}
                          </td>
                          <td data-etiqueta="Precio unitario" className="tabular">
                            {formatearCOP(det.precio_unitario)}
                          </td>
                          <td data-etiqueta="Subtotal" className="tabular">
                            <strong>{formatearCOP(Number(det.precio_unitario) * Number(det.cantidad))}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Historial de pagos</h3>
                {(detallePedido.pagos || []).length === 0 ? (
                  <p className="campo-ayuda" style={{ margin: 0 }}>
                    Este pedido no registra intentos de pago.
                  </p>
                ) : (
                  <div tabIndex={0} role="region" aria-labelledby={detallePagosCaptionId} className="table-wrapper">
                    <table className="tabla-datos">
                      <caption id={detallePagosCaptionId} className="sr-only">
                        Intentos de pago del pedido
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Intento</th>
                          <th scope="col">Método</th>
                          <th scope="col">Referencia</th>
                          <th scope="col">Monto</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detallePedido.pagos.map((pg) => (
                          <tr key={pg.id_pago}>
                            <th scope="row" className="tabular">
                              #{pg.numero_intento}
                            </th>
                            <td data-etiqueta="Método">{obtenerMetaEstado(pg.metodo_pago).etiqueta}</td>
                            <td data-etiqueta="Referencia">{pg.referencia_simulada}</td>
                            <td data-etiqueta="Monto" className="tabular">
                              {formatearCOP(pg.monto)}
                            </td>
                            <td data-etiqueta="Estado">
                              <StatusBadge codigo={pg.estado_pago} />
                            </td>
                            <td data-etiqueta="Fecha">{formatearFechaHoraBogota(pg.fecha_pago)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="dialogo-acciones">
            <button type="button" className="btn btn-primario" onClick={cerrarDetallePedido}>
              Cerrar
            </button>
          </div>
        </dialog>
      </section>
    </>
  );
}
