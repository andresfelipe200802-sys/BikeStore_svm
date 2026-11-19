import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { pedidosApi } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { containsSensitiveCardData } from '../../utils/documentos.js';
import { formatearCOP, formatearFechaHoraBogota } from '../../utils/formato.js';
import { generarUuidAleatorio } from '../../utils/refreshSync.js';

export function DetallePedidoPage({ onNotificar }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sincronizarContadorCarrito } = useAuth();
  useTituloPagina(`Pedido #${id}`, {
    descripcion: `Detalle y seguimiento del pedido #${id} en BikeStore.`,
    noIndex: true,
  });

  const pagosCaptionId = useId();
  const volverCarritoIdemRef = useRef({ pedidoId: null, key: null });
  const [pedido, setPedido] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [dialogoCancelar, setDialogoCancelar] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [datosReembolso, setDatosReembolso] = useState('');
  const [errorCancelacion, setErrorCancelacion] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [volviendoCarrito, setVolviendoCarrito] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const resp = await pedidosApi.obtener(id);
      setPedido(resp.datos);
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No encontramos el pedido solicitado.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const confirmarCancelacion = async () => {
    setErrorCancelacion('');
    const requiereReembolso = pedido?.estado_pedido === 'PAGADO';
    const datosLimpios = datosReembolso.trim();
    const motivoLimpio = motivoCancelacion.trim();

    if (motivoLimpio && motivoLimpio.length < 3) {
      setErrorCancelacion('Si indicas un motivo, debe tener mínimo 3 caracteres.');
      return;
    }

    if (requiereReembolso) {
      if (datosLimpios.length < 5) {
        setErrorCancelacion('Indica los datos de reembolso (mínimo 5 caracteres).');
        return;
      }
      if (containsSensitiveCardData(datosLimpios)) {
        setErrorCancelacion('No ingreses números completos de tarjeta ni código CVV.');
        return;
      }
    }

    setCancelando(true);
    try {
      await pedidosApi.cancelar(id, {
        motivo_cancelacion: motivoLimpio,
        datos_reembolso: requiereReembolso ? datosLimpios : undefined,
      });
      setDialogoCancelar(false);
      onNotificar?.('exito', `Pedido #${id} cancelado correctamente.`);
      await cargar();
    } catch (err) {
      setErrorCancelacion(err?.mensaje || 'No fue posible cancelar el pedido.');
    } finally {
      setCancelando(false);
    }
  };

  const manejarVolverAlCarrito = async () => {
    if (volverCarritoIdemRef.current.pedidoId !== id || !volverCarritoIdemRef.current.key) {
      volverCarritoIdemRef.current = { pedidoId: id, key: generarUuidAleatorio() };
    }
    setError('');
    setVolviendoCarrito(true);
    try {
      const resp = await pedidosApi.volverAlCarrito(id, volverCarritoIdemRef.current.key);
      volverCarritoIdemRef.current = { pedidoId: null, key: null };
      await sincronizarContadorCarrito();
      onNotificar?.('info', 'Artículos devueltos al carrito.');
      navigate('/carrito', { state: { ajustesFusion: resp?.datos?.ajustes || [] } });
    } catch (err) {
      setError(err?.mensaje || 'No pudimos volver el pedido al carrito.');
    } finally {
      setVolviendoCarrito(false);
    }
  };

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Cargando detalle del pedido...</p>
      </section>
    );
  }

  if (!pedido) {
    return (
      <section className="contenedor seccion">
        <div className="alerta alerta-error" role="alert">
          <Icono tipo="error" size={20} />
          <div>
            <p>{error}</p>
            <Link className="btn btn-contorno" to="/pedidos" style={{ marginTop: '0.75rem' }}>
              Volver a mis pedidos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const puedeCancelar = pedido.estado_pedido === 'PENDIENTE' || pedido.estado_pedido === 'PAGADO';

  return (
    <section className="contenedor seccion">
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/pedidos">← Volver a mis pedidos</Link>
      </p>

      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Trazabilidad completa</p>
          <h1 className="titulo-seccion">Pedido #{pedido.id_pedido}</h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <StatusBadge codigo={pedido.estado_pedido} />
          <StatusBadge codigo={pedido.estado_reembolso_cancelacion} />
        </div>
      </div>

      {error && (
        <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <Icono tipo="error" size={20} />
          <p>{error}</p>
        </div>
      )}

      <div className="rejilla-asimetrica">
        <div className="panel">
          <h2>Información y acciones</h2>
          <p className="campo-ayuda">
            Dirección: <strong>{pedido.direccion_envio}</strong>
          </p>
          <p className="campo-ayuda">
            Creado: {formatearFechaHoraBogota(pedido.fecha_pedido)} · Total:{' '}
            <strong className="tabular">{formatearCOP(pedido.total)}</strong>
          </p>
          {pedido.fecha_envio && (
            <p className="campo-ayuda">Enviado: {formatearFechaHoraBogota(pedido.fecha_envio)}</p>
          )}
          {pedido.fecha_entrega && (
            <p className="campo-ayuda">Entregado: {formatearFechaHoraBogota(pedido.fecha_entrega)}</p>
          )}
          {pedido.motivo_cancelacion && (
            <p className="campo-ayuda">Motivo de cancelación: {pedido.motivo_cancelacion}</p>
          )}
          {pedido.fecha_reembolso_cancelacion && (
            <p className="campo-ayuda">
              Reembolsado el {formatearFechaHoraBogota(pedido.fecha_reembolso_cancelacion)}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
            {pedido.estado_pedido === 'PENDIENTE' && (
              <Link className="btn btn-primario" to={`/pedidos/${pedido.id_pedido}/pago`}>
                Ir a pagar
              </Link>
            )}
            {puedeCancelar && (
              <button
                type="button"
                className="btn btn-oscuro"
                onClick={() => {
                  setErrorCancelacion('');
                  setDialogoCancelar(true);
                }}
              >
                Cancelar pedido
              </button>
            )}
            {pedido.estado_pedido === 'CANCELADO' && (
              <button
                type="button"
                className="btn btn-primario"
                disabled={volviendoCarrito}
                onClick={manejarVolverAlCarrito}
              >
                {volviendoCarrito ? 'Devolviendo...' : 'Volver productos al carrito'}
              </button>
            )}
            {pedido.estado_pedido === 'ENTREGADO' && (
              <Link className="btn btn-primario" to={`/pedidos/${pedido.id_pedido}/retracto`}>
                Solicitar derecho de retracto
              </Link>
            )}
          </div>
        </div>

        <aside className="panel" aria-label="Productos del pedido">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.85rem' }}>Productos</h2>
          {(pedido.detalles || []).map((d) => (
            <div key={d.id_detalle_pedido} className="resumen-linea">
              <span>
                {d.nombre} × {d.cantidad}
              </span>
              <strong className="tabular">
                {formatearCOP(Number(d.precio_unitario) * Number(d.cantidad))}
              </strong>
            </div>
          ))}
          <div className="resumen-total">
            <span>Total</span>
            <span className="tabular">{formatearCOP(pedido.total)}</span>
          </div>
        </aside>
      </div>

      {(pedido.pagos || []).length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Pagos registrados</h2>
          <div tabIndex={0} role="region" aria-labelledby={pagosCaptionId} className="table-wrapper">
            <table className="tabla-datos">
              <caption id={pagosCaptionId}>Intentos de pago del pedido #{pedido.id_pedido}</caption>
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
                {pedido.pagos.map((pg) => (
                  <tr key={pg.id_pago}>
                    <th scope="row" className="tabular">#{pg.numero_intento}</th>
                    <td data-etiqueta="Método">{pg.metodo_pago}</td>
                    <td data-etiqueta="Referencia">{pg.referencia_simulada}</td>
                    <td data-etiqueta="Monto" className="tabular">{formatearCOP(pg.monto)}</td>
                    <td data-etiqueta="Estado"><StatusBadge codigo={pg.estado_pago} /></td>
                    <td data-etiqueta="Fecha">{formatearFechaHoraBogota(pg.fecha_pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(pedido.retractos || []).length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Solicitudes de retracto asociadas</h2>
          <ul className="lista-linea">
            {pedido.retractos.map((ret) => (
              <li key={ret.id_retracto} className="item-fila">
                <div>
                  <strong>Retracto #{ret.id_retracto}</strong> · {ret.tipo_retracto} ·{' '}
                  <span className="tabular">{formatearCOP(ret.monto_reembolso)}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge codigo={ret.estado_retracto} />
                  <StatusBadge codigo={ret.estado_reembolso} />
                  <Link className="btn btn-contorno btn-pequeno" to={`/retractos/${ret.id_retracto}`}>
                    Ver retracto
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        abierto={dialogoCancelar}
        titulo={`¿Cancelar pedido #${pedido.id_pedido}?`}
        mensaje="Se restituirá inmediatamente el inventario de todos los productos incluidos en la orden."
        etiquetaConfirmar="Confirmar cancelación"
        etiquetaCancelar="Conservar pedido"
        varianteDestructiva
        ocupado={cancelando}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => setDialogoCancelar(false)}
      >
        {errorCancelacion && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1rem' }}>
            <Icono tipo="error" size={18} />
            <p>{errorCancelacion}</p>
          </div>
        )}

        <div className="campo">
          <label htmlFor="canc-motivo">Motivo de cancelación (opcional)</label>
          <input
            id="canc-motivo"
            type="text"
            className="campo-control"
            value={motivoCancelacion}
            onChange={(ev) => setMotivoCancelacion(ev.target.value)}
            maxLength={500}
          />
        </div>

        {pedido.estado_pedido === 'PAGADO' && (
          <div className="campo">
            <label htmlFor="canc-reembolso">
              Datos para reembolso (Nequi / cuenta bancaria) *
            </label>
            <span id="canc-reemb-ayuda" className="campo-ayuda">
              Nunca ingreses números de tarjeta completos ni código CVV.
            </span>
            <textarea
              id="canc-reembolso"
              className="campo-control"
              value={datosReembolso}
              onChange={(ev) => setDatosReembolso(ev.target.value)}
              maxLength={500}
              aria-describedby="canc-reemb-ayuda"
            />
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}
