import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { pedidosApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP, formatearFechaHoraBogota } from '../../utils/formato.js';
import { generarUuidAleatorio } from '../../utils/refreshSync.js';

const METODOS_PAGO = [
  { valor: 'TARJETA', etiqueta: 'Tarjeta crédito/débito' },
  { valor: 'PSE', etiqueta: 'PSE' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia bancaria' },
];

function formatearRestante(ms) {
  if (ms <= 0) return '00:00';
  const totalSeg = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSeg / 60)).padStart(2, '0');
  const seg = String(totalSeg % 60).padStart(2, '0');
  return `${min}:${seg}`;
}

export function PagoPedidoPage({ onNotificar }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario, sincronizarContadorCarrito } = useAuth();
  useTituloPagina(`Pagar pedido #${id}`, {
    descripcion: `Confirmación y pago seguro del pedido #${id} en BikeStore.`,
    noIndex: true,
  });

  const mostrarGuiaPrueba = import.meta.env.DEV || usuario?.rol === 'ADMIN';

  const captionId = useId();
  const [pedido, setPedido] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [metodoPago, setMetodoPago] = useState('TARJETA');
  const [referenciaSimulada, setReferenciaSimulada] = useState('');
  const [pagando, setPagando] = useState(false);
  const [expirado, setExpirado] = useState(false);
  const [restanteMs, setRestanteMs] = useState(0);
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const [volviendoCarrito, setVolviendoCarrito] = useState(false);

  // Conserva la clave únicamente ante reintento idéntico por fallo de red;
  // rota si cambia el pedido, el payload o si el servidor emitió RECHAZADO ('00').
  const idemRef = useRef({ key: generarUuidAleatorio(), firma: '' });
  const volverCarritoIdemRef = useRef({ pedidoId: null, key: null });

  const cargarPedido = useCallback(async () => {
    try {
      const resp = await pedidosApi.obtener(id);
      const data = resp.datos;
      setPedido(data);
      if (data?.fecha_expiracion) {
        const diff = new Date(data.fecha_expiracion).getTime() - Date.now();
        setRestanteMs(Math.max(0, diff));
        setExpirado(diff <= 0 && data.estado_pedido === 'PENDIENTE');
      }
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No pudimos consultar el pedido.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargarPedido();
  }, [cargarPedido]);

  useEffect(() => {
    if (!pedido || pedido.estado_pedido !== 'PENDIENTE' || !pedido.fecha_expiracion) {
      return undefined;
    }
    const timer = setInterval(() => {
      const diff = new Date(pedido.fecha_expiracion).getTime() - Date.now();
      setRestanteMs(Math.max(0, diff));
      if (diff <= 0) {
        setExpirado(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [pedido]);

  const manejarPagar = async (ev) => {
    ev.preventDefault();
    setError('');
    setUltimoResultado(null);

    const refLimpia = referenciaSimulada.trim();
    if (refLimpia.length < 4) {
      setError('Ingresa una referencia o número de comprobante de al menos 4 caracteres.');
      return;
    }

    const firmaActual = `${id}:${metodoPago}:${refLimpia}`;
    if (idemRef.current.firma !== firmaActual) {
      idemRef.current = { key: generarUuidAleatorio(), firma: firmaActual };
    }

    setPagando(true);
    try {
      const resp = await pedidosApi.pagar(
        id,
        { metodo_pago: metodoPago, referencia_simulada: refLimpia },
        idemRef.current.key
      );
      const resDatos = resp.datos;
      setUltimoResultado(resDatos);

      if (resDatos.pago?.estado_pago === 'RECHAZADO') {
        // Prepara nueva Idempotency-Key para que el usuario pueda reintentar con otra referencia
        idemRef.current = { key: generarUuidAleatorio(), firma: '' };
        onNotificar?.('alerta', resDatos.pago.motivo_resultado);
      } else if (resDatos.pago?.estado_pago === 'APROBADO') {
        onNotificar?.('exito', `¡Pago aprobado para el pedido #${id}!`);
      }

      await cargarPedido();
    } catch (err) {
      if (err?.codigo === 'RESERVA_EXPIRADA') {
        setExpirado(true);
        await cargarPedido();
      }
      setError(err?.mensaje || 'No pudimos procesar el pago en este momento.');
    } finally {
      setPagando(false);
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
      onNotificar?.('info', 'Productos devueltos a tu carrito.');
      navigate('/carrito', {
        replace: true,
        state: { ajustesFusion: resp?.datos?.ajustes || [] },
      });
    } catch (err) {
      setError(err?.mensaje || 'No fue posible devolver el pedido al carrito.');
    } finally {
      setVolviendoCarrito(false);
    }
  };

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Cargando información de pago...</p>
      </section>
    );
  }

  if (!pedido) {
    return (
      <section className="contenedor seccion">
        <div className="alerta alerta-error" role="alert">
          <Icono tipo="error" size={20} />
          <div>
            <p>{error || 'Pedido no encontrado.'}</p>
            <Link className="btn btn-contorno" to="/pedidos" style={{ marginTop: '0.75rem' }}>
              Ir a mis pedidos
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const esPendienteActivo = pedido.estado_pedido === 'PENDIENTE' && !expirado;

  return (
    <section className="contenedor seccion">
      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Confirmación de pago</p>
          <h1 className="titulo-seccion">Pago del pedido #{pedido.id_pedido}</h1>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <StatusBadge codigo={pedido.estado_pedido} />
          {pedido.estado_pedido === 'PENDIENTE' && (
            <span className="reloj-reserva tabular" aria-live="off">
              Reserva: {formatearRestante(restanteMs)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <Icono tipo="error" size={20} />
          <p>{error}</p>
        </div>
      )}

      {ultimoResultado?.pago && (
        <div
          className={`alerta ${ultimoResultado.pago.estado_pago === 'APROBADO' ? 'alerta-exito' : 'alerta-alerta'}`}
          role="status"
          style={{ marginBottom: '1.25rem' }}
        >
          <Icono
            tipo={ultimoResultado.pago.estado_pago === 'APROBADO' ? 'exito' : 'alerta'}
            size={20}
          />
          <p>
            Intento #{ultimoResultado.pago.numero_intento}:{' '}
            <strong>{ultimoResultado.pago.estado_pago}</strong> —{' '}
            {ultimoResultado.pago.motivo_resultado}
          </p>
        </div>
      )}

      <div className="rejilla-asimetrica">
        <div className="panel">
          {pedido.estado_pedido === 'PAGADO' ||
          pedido.estado_pedido === 'ENVIADO' ||
          pedido.estado_pedido === 'ENTREGADO' ? (
            <div className="alerta alerta-exito">
              <Icono tipo="exito" size={20} />
              <div>
                <p>
                  Este pedido ya registra pago aprobado por{' '}
                  <strong className="tabular">{formatearCOP(pedido.total)}</strong>.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
                  <Link className="btn btn-primario" to={`/pedidos/${pedido.id_pedido}`}>
                    Ver detalle del pedido
                  </Link>
                  <Link className="btn btn-contorno" to="/pedidos">
                    Ir a mis pedidos
                  </Link>
                </div>
              </div>
            </div>
          ) : pedido.estado_pedido === 'CANCELADO' || expirado ? (
            <div className="alerta alerta-alerta">
              <Icono tipo="alerta" size={20} />
              <div>
                <p>
                  La reserva de 15 minutos expiró o el pedido está cancelado. Puedes devolver los
                  artículos al carrito con un clic para reintentar.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primario"
                    disabled={volviendoCarrito}
                    onClick={manejarVolverAlCarrito}
                  >
                    {volviendoCarrito
                      ? 'Devolviendo al carrito...'
                      : 'Volver productos al carrito'}
                  </button>
                  <Link className="btn btn-contorno" to={`/pedidos/${pedido.id_pedido}`}>
                    Ver detalle
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <form className="formulario" onSubmit={manejarPagar} noValidate>
              <h2>Método y referencia de pago</h2>

              <fieldset className="grupo-fieldset">
                <legend>Método de pago *</legend>
                <div className="grupo-radios">
                  {METODOS_PAGO.map((m) => (
                    <label key={m.valor} className="opcion-radio">
                      <input
                        type="radio"
                        name="metodo_pago"
                        value={m.valor}
                        checked={metodoPago === m.valor}
                        onChange={(ev) => setMetodoPago(ev.target.value)}
                      />
                      <span>{m.etiqueta}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="campo">
                <label htmlFor="pago-referencia">
                  Referencia de transacción <span aria-hidden="true">*</span>
                </label>
                <span id="pago-ref-ayuda" className="campo-ayuda">
                  Ingresa la referencia de tu comprobante o autorización (mínimo 4 caracteres).
                </span>
                <input
                  id="pago-referencia"
                  name="referencia_simulada"
                  type="text"
                  className="campo-control"
                  value={referenciaSimulada}
                  onChange={(ev) => setReferenciaSimulada(ev.target.value)}
                  minLength={4}
                  maxLength={40}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-describedby="pago-ref-ayuda"
                />
              </div>

              {mostrarGuiaPrueba && (
                <div className="alerta alerta-info" style={{ marginBottom: '1rem' }}>
                  <Icono tipo="info" size={18} />
                  <p>
                    <span className="insignia insignia-info" style={{ marginRight: '0.5rem' }}>
                      Modo prueba
                    </span>
                    Cualquier referencia válida aprueba el pago; las terminadas en <strong>00</strong>{' '}
                    simulan rechazo para verificar reintentos.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primario btn-bloque tabular"
                disabled={pagando || !esPendienteActivo}
              >
                {pagando ? 'Procesando pago...' : `Pagar ${formatearCOP(pedido.total)}`}
              </button>
            </form>
          )}
        </div>

        <aside className="panel" aria-label="Resumen del pedido">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.85rem' }}>Resumen</h2>
          <p className="campo-ayuda" style={{ marginBottom: '0.85rem' }}>
            Envío a: <strong>{pedido.direccion_envio}</strong>
          </p>
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
            <span>Total a pagar</span>
            <span className="tabular">{formatearCOP(pedido.total)}</span>
          </div>
          <p style={{ marginTop: '1rem', marginBottom: 0 }}>
            <Link to={`/pedidos/${pedido.id_pedido}`}>Ver detalle e historial del pedido</Link>
          </p>
        </aside>
      </div>

      {(pedido.pagos || []).length > 0 && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2 style={{ marginBottom: '0.85rem' }}>Intentos de pago registrados</h2>
          <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
            <table className="tabla-datos">
              <caption id={captionId}>Historial de intentos de pago del pedido #{pedido.id_pedido}</caption>
              <thead>
                <tr>
                  <th scope="col">Intento</th>
                  <th scope="col">Método</th>
                  <th scope="col">Referencia</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Fecha (Bogotá)</th>
                </tr>
              </thead>
              <tbody>
                {pedido.pagos.map((pg) => (
                  <tr key={pg.id_pago}>
                    <th scope="row" className="tabular">#{pg.numero_intento}</th>
                    <td data-etiqueta="Método">{pg.metodo_pago}</td>
                    <td data-etiqueta="Referencia">{pg.referencia_simulada}</td>
                    <td data-etiqueta="Estado">
                      <StatusBadge codigo={pg.estado_pago} />
                    </td>
                    <td data-etiqueta="Resultado">{pg.motivo_resultado}</td>
                    <td data-etiqueta="Fecha">{formatearFechaHoraBogota(pg.fecha_pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
