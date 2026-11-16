import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { carritoApi, pedidosApi } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearCOP } from '../../utils/formato.js';

export function CheckoutPage({ onNotificar }) {
  useTituloPagina('Confirmar pedido');
  const { setCantidadCarrito } = useAuth();
  const navigate = useNavigate();

  const [carrito, setCarrito] = useState(null);
  const [direccionEnvio, setDireccionEnvio] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [pedidoPendiente, setPedidoPendiente] = useState(null);
  const [cambiosPrecio, setCambiosPrecio] = useState([]);
  const [dialogoPreciosAbierto, setDialogoPreciosAbierto] = useState(false);

  useEffect(() => {
    let activo = true;
    carritoApi
      .obtener()
      .then((resp) => {
        if (!activo) return;
        setCarrito(resp?.datos || { items: [], total: '0.00' });
      })
      .catch((err) => {
        if (!activo) return;
        setError(err?.mensaje || 'No pudimos cargar tu carrito para checkout.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const confirmarPedido = async (ev) => {
    ev.preventDefault();
    setError('');
    setPedidoPendiente(null);

    const dirLimpia = direccionEnvio.trim();
    if (dirLimpia.length < 5) {
      setError('Ingresa una dirección de envío completa (mínimo 5 caracteres).');
      return;
    }

    const snapshotPrevio = new Map(
      (carrito?.items || []).map((item) => [
        item.id_producto,
        { nombre: item.nombre, precioAnterior: item.precio_unidad },
      ])
    );

    setEnviando(true);
    try {
      const resp = await pedidosApi.crear({ direccion_envio: dirLimpia });
      const pedido = resp.datos;
      setCantidadCarrito(0);
      onNotificar?.(
        'exito',
        `Pedido #${pedido.id_pedido} creado con reserva de inventario por 15 minutos.`
      );
      navigate(`/pedidos/${pedido.id_pedido}/pago`, { replace: true });
    } catch (err) {
      if (err?.codigo === 'PRECIO_ACTUALIZADO' && err?.detalles?.carrito) {
        const nuevoCarrito = err.detalles.carrito;
        const variaciones = (nuevoCarrito.items || []).map((item) => {
          const prev = snapshotPrevio.get(item.id_producto);
          return {
            id_producto: item.id_producto,
            nombre: item.nombre,
            precioAnterior: prev?.precioAnterior ?? item.precio_unidad,
            precioNuevo: item.precio_actual ?? item.precio_unidad,
            cambio:
              prev && Number(prev.precioAnterior) !== Number(item.precio_actual ?? item.precio_unidad),
          };
        });
        setCarrito(nuevoCarrito);
        setCambiosPrecio(variaciones);
        setDialogoPreciosAbierto(true);
      } else if (err?.codigo === 'PEDIDO_PENDIENTE_ACTIVO') {
        setError(err.mensaje);
        try {
          const listResp = await pedidosApi.listar({ page: 1, limit: 10 });
          const activoPendiente = (listResp?.datos || []).find(
            (p) => p.estado_pedido === 'PENDIENTE'
          );
          if (activoPendiente) setPedidoPendiente(activoPendiente);
        } catch {
          // Conserva únicamente el mensaje de servidor si falla la búsqueda auxiliar
        }
      } else {
        setError(err?.mensaje || 'No fue posible generar el pedido.');
      }
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Preparando resumen de pedido...</p>
      </section>
    );
  }

  const items = carrito?.items || [];

  return (
    <section className="contenedor seccion">
      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Paso final antes del pago</p>
          <h1 className="titulo-seccion">Confirmar pedido</h1>
        </div>
        <Link className="btn btn-contorno" to="/carrito">
          ← Volver al carrito
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="estado-vacio">
          <p>Tu carrito activo está vacío. Agrega artículos antes de realizar un pedido.</p>
          <Link className="btn btn-primario" to="/catalogo">
            Explorar catálogo
          </Link>
        </div>
      ) : (
        <div className="rejilla-asimetrica">
          <div className="panel">
            <h2>Dirección de envío</h2>
            <p className="campo-ayuda" style={{ marginBottom: '1rem' }}>
              Al confirmar crearemos una reserva temporal de inventario durante{' '}
              <strong>15 minutos</strong> mientras completas el pago.
            </p>

            {error && (
              <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
                <Icono tipo="error" size={20} />
                <div>
                  <p>{error}</p>
                  {pedidoPendiente && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.75rem' }}>
                      <Link
                        className="btn btn-primario btn-pequeno"
                        to={`/pedidos/${pedidoPendiente.id_pedido}/pago`}
                      >
                        Ir a pagar pedido #{pedidoPendiente.id_pedido}
                      </Link>
                      <Link
                        className="btn btn-contorno btn-pequeno"
                        to={`/pedidos/${pedidoPendiente.id_pedido}`}
                      >
                        Ver detalle #{pedidoPendiente.id_pedido}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form className="formulario" onSubmit={confirmarPedido} noValidate>
              <div className="campo">
                <label htmlFor="checkout-direccion">
                  Dirección completa de entrega <span aria-hidden="true">*</span>
                </label>
                <span id="checkout-dir-ayuda" className="campo-ayuda">
                  Incluye ciudad, barrio, nomenclatura y referencias (mínimo 5 caracteres).
                </span>
                <textarea
                  id="checkout-direccion"
                  name="direccion_envio"
                  className="campo-control"
                  value={direccionEnvio}
                  onChange={(ev) => setDireccionEnvio(ev.target.value)}
                  autoComplete="street-address"
                  minLength={5}
                  maxLength={255}
                  required
                  aria-describedby="checkout-dir-ayuda"
                />
              </div>

              <button type="submit" className="btn btn-primario" disabled={enviando}>
                {enviando
                  ? 'Reservando inventario...'
                  : 'Confirmar pedido y reservar inventario'}
              </button>
            </form>
          </div>

          <aside className="panel" aria-label="Detalle del pedido a crear">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Productos a reservar</h2>
            {items.map((it) => (
              <div key={it.id_producto} className="resumen-linea">
                <span>
                  {it.nombre} × {it.cantidad}
                </span>
                <strong className="tabular">{formatearCOP(it.subtotal)}</strong>
              </div>
            ))}
            <div className="resumen-total">
              <span>Total servidor</span>
              <span className="tabular">{formatearCOP(carrito?.total)}</span>
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        abierto={dialogoPreciosAbierto}
        titulo="Actualización de precios en el catálogo"
        mensaje="Uno o más productos cambiaron de precio en el servidor antes de crear tu pedido. Revisa los valores actualizados y confirma nuevamente si deseas continuar."
        etiquetaConfirmar="Entendido, revisar totales"
        etiquetaCancelar="Volver al carrito"
        onConfirmar={() => setDialogoPreciosAbierto(false)}
        onCancelar={() => {
          setDialogoPreciosAbierto(false);
          navigate('/carrito');
        }}
      >
        <ul style={{ marginTop: '0.75rem', paddingLeft: '1.2rem' }}>
          {cambiosPrecio.map((c) => (
            <li key={c.id_producto} style={{ marginBottom: '0.35rem' }}>
              <strong>{c.nombre}</strong>:{' '}
              {c.cambio ? (
                <span className="tabular">
                  {formatearCOP(c.precioAnterior)} → <strong>{formatearCOP(c.precioNuevo)}</strong>
                </span>
              ) : (
                <span className="tabular">{formatearCOP(c.precioNuevo)} (sin variación)</span>
              )}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </section>
  );
}
