import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { pedidosApi, retractosApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { containsSensitiveCardData } from '../../utils/documentos.js';
import { formatearCOP } from '../../utils/formato.js';

export function SolicitarRetractoPage({ onNotificar }) {
  const { id } = useParams();
  const navigate = useNavigate();
  useTituloPagina(`Solicitar retracto pedido #${id}`, {
    descripcion: `Radicación de derecho de retracto para el pedido #${id}.`,
    noIndex: true,
  });

  const [pedido, setPedido] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [saldosDisponibles, setSaldosDisponibles] = useState({});
  const [motivo, setMotivo] = useState('');
  const [datosReembolso, setDatosReembolso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const pedResp = await pedidosApi.obtener(id);
        const pedData = pedResp.datos;

        const comprometidoPorLinea = new Map();
        const prevRetractos = pedData?.retractos || [];
        if (prevRetractos.length > 0) {
          const detallesRet = await Promise.allSettled(
            prevRetractos.map((r) => retractosApi.obtener(r.id_retracto))
          );
          for (const res of detallesRet) {
            if (res.status !== 'fulfilled' || !res.value?.datos) continue;
            const rFull = res.value.datos;
            if (rFull.estado_retracto !== 'RECHAZADO' || rFull.fecha_recepcion_fisica !== null) {
              for (const linea of rFull.detalles || []) {
                comprometidoPorLinea.set(
                  linea.id_detalle_pedido,
                  (comprometidoPorLinea.get(linea.id_detalle_pedido) || 0) +
                    Number(linea.cantidad_devuelta || 0)
                );
              }
            }
          }
        }

        if (!activo) return;
        const saldos = {};
        const inicial = {};
        for (const det of pedData?.detalles || []) {
          const disp = Math.max(
            0,
            Number(det.cantidad) - (comprometidoPorLinea.get(det.id_detalle_pedido) || 0)
          );
          saldos[det.id_detalle_pedido] = disp;
          inicial[det.id_detalle_pedido] = 0;
        }
        setPedido(pedData);
        setSaldosDisponibles(saldos);
        setCantidades(inicial);
      } catch (err) {
        if (!activo) return;
        setError(err?.mensaje || 'No pudimos cargar el pedido para solicitar retracto.');
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  const manejarSubmit = async (ev) => {
    ev.preventDefault();
    setError('');

    const items = Object.entries(cantidades)
      .filter(([, cant]) => Number(cant) > 0)
      .map(([idDetalle, cant]) => ({
        id_detalle_pedido: Number(idDetalle),
        cantidad: Number(cant),
      }));

    if (items.length === 0) {
      setError('Selecciona al menos 1 unidad para devolver.');
      return;
    }
    if (motivo.trim().length < 5) {
      setError('Explica el motivo del retracto (mínimo 5 caracteres).');
      return;
    }
    if (datosReembolso.trim().length < 5) {
      setError('Indica los datos de cuenta o Nequi para el reembolso (mínimo 5 caracteres).');
      return;
    }
    if (containsSensitiveCardData(datosReembolso)) {
      setError('Por seguridad, no incluyas números completos de tarjeta ni código CVV.');
      return;
    }

    setEnviando(true);
    try {
      const resp = await retractosApi.solicitar(id, {
        motivo: motivo.trim(),
        datos_reembolso: datosReembolso.trim(),
        items,
      });
      const nuevo = resp.datos;
      onNotificar?.('exito', `Solicitud de retracto #${nuevo.id_retracto} radicada.`);
      navigate(`/retractos/${nuevo.id_retracto}`, { replace: true });
    } catch (err) {
      setError(err?.mensaje || 'No pudimos radicar la solicitud de retracto.');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Calculando saldos disponibles para retracto...</p>
      </section>
    );
  }

  if (!pedido) {
    return (
      <section className="contenedor seccion">
        <div className="alerta alerta-error" role="alert">
          <Icono tipo="error" size={20} />
          <p>{error || 'Pedido no encontrado.'}</p>
        </div>
      </section>
    );
  }

  const hayCupo = Object.values(saldosDisponibles).some((n) => n > 0);

  return (
    <section className="contenedor seccion">
      <p style={{ marginBottom: '1rem' }}>
        <Link to={`/pedidos/${id}`}>← Volver al pedido #{id}</Link>
      </p>

      <div className="panel formulario-angosto">
        <p className="antetitulo">Ley 1480 · 5 días hábiles desde la entrega</p>
        <h1>Solicitar derecho de retracto</h1>

        {pedido.estado_pedido !== 'ENTREGADO' ? (
          <div className="alerta alerta-alerta">
            <Icono tipo="alerta" size={20} />
            <p>
              El retracto legal aplica únicamente sobre pedidos en estado{' '}
              <strong>Entregado</strong>. Estado actual: {pedido.estado_pedido}.
            </p>
          </div>
        ) : !hayCupo ? (
          <div className="alerta alerta-info">
            <Icono tipo="info" size={20} />
            <p>Todas las unidades de este pedido ya fueron reclamadas en solicitudes previas.</p>
          </div>
        ) : (
          <form className="formulario" onSubmit={manejarSubmit} noValidate>
            {error && (
              <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1rem' }}>
                <Icono tipo="error" size={20} />
                <p>{error}</p>
              </div>
            )}

            <fieldset className="grupo-fieldset">
              <legend>Unidades a devolver por producto</legend>
              {(pedido.detalles || []).map((det) => {
                const maxDisp = saldosDisponibles[det.id_detalle_pedido] || 0;
                const inputId = `ret-qty-${det.id_detalle_pedido}`;
                return (
                  <div key={det.id_detalle_pedido} className="campo" style={{ marginBottom: '0.9rem' }}>
                    <label htmlFor={inputId}>
                      {det.nombre} ({formatearCOP(det.precio_unitario)} c/u)
                    </label>
                    <span className="campo-ayuda">
                      Compradas: {det.cantidad} · Saldo disponible para retracto: {maxDisp}
                    </span>
                    <input
                      id={inputId}
                      type="number"
                      className="campo-control"
                      min={0}
                      max={maxDisp}
                      disabled={maxDisp === 0}
                      value={cantidades[det.id_detalle_pedido] ?? 0}
                      onChange={(ev) => {
                        const val = Math.max(0, Math.min(maxDisp, Math.trunc(Number(ev.target.value) || 0)));
                        setCantidades((p) => ({ ...p, [det.id_detalle_pedido]: val }));
                      }}
                    />
                  </div>
                );
              })}
            </fieldset>

            <div className="campo">
              <label htmlFor="ret-motivo">Motivo de devolución *</label>
              <textarea
                id="ret-motivo"
                className="campo-control"
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                minLength={5}
                maxLength={500}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="ret-reembolso">Datos de cuenta / Nequi para reembolso *</label>
              <span id="ret-reemb-ayuda" className="campo-ayuda">
                No incluyas números completos de tarjeta ni código CVV.
              </span>
              <textarea
                id="ret-reembolso"
                className="campo-control"
                value={datosReembolso}
                onChange={(ev) => setDatosReembolso(ev.target.value)}
                minLength={5}
                maxLength={500}
                required
                aria-describedby="ret-reemb-ayuda"
              />
            </div>

            <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
              {enviando ? 'Enviando solicitud...' : 'Radicar solicitud de retracto'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
