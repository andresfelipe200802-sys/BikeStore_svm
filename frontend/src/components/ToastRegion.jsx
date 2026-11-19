import { useEffect, useRef, useState } from 'react';
import { Icono } from './Iconos.jsx';

export const AUTO_DISMISS_TOAST_MS = 4500;

const ICONOS_TIPO = {
  exito: 'exito',
  error: 'error',
  alerta: 'alerta',
  info: 'info',
};

/**
 * Pila de notificaciones no bloqueantes con popover="manual", ariaNotify, fallback aria-live
 * y auto-cierre de 4500 ms pausado al pasar el cursor o enfocar.
 */
export function ToastRegion({ notifs = [], onDescartar }) {
  const pilaRef = useRef(null);
  const ultimoIdRef = useRef(null);
  const enfoquePrevioRef = useRef(null);
  const botonesCerrarRef = useRef(new Map());
  const timersRef = useRef(new Map());
  const hoverDentroRef = useRef(false);
  const focusDentroRef = useRef(false);
  const onDescartarRef = useRef(onDescartar);
  onDescartarRef.current = onDescartar;

  const [pausado, setPausado] = useState(false);

  const hayModalAbierto =
    typeof document !== 'undefined' && Boolean(document.querySelector('dialog[open]'));
  const visibles = hayModalAbierto ? [] : notifs;

  const actualizarPausa = () => {
    setPausado(hoverDentroRef.current || focusDentroRef.current);
  };

  useEffect(() => {
    if (visibles.length === 0) {
      hoverDentroRef.current = false;
      focusDentroRef.current = false;
      setPausado(false);
    }
  }, [visibles.length]);

  useEffect(() => {
    const timers = timersRef.current;

    const limpiarTodos = () => {
      for (const timerId of timers.values()) {
        clearTimeout(timerId);
      }
      timers.clear();
    };

    if (pausado || visibles.length === 0) {
      limpiarTodos();
      return limpiarTodos;
    }

    const idsVisibles = new Set(visibles.map((n) => n.id));
    for (const [id, timerId] of timers.entries()) {
      if (!idsVisibles.has(id)) {
        clearTimeout(timerId);
        timers.delete(id);
      }
    }

    for (const notif of visibles) {
      if (timers.has(notif.id)) continue;
      const timerId = setTimeout(() => {
        timers.delete(notif.id);
        onDescartarRef.current?.(notif.id);
      }, AUTO_DISMISS_TOAST_MS);
      timers.set(notif.id, timerId);
    }

    return limpiarTodos;
  }, [visibles, pausado]);

  useEffect(() => {
    const el = pilaRef.current;
    if (!el) return;

    try {
      if (visibles.length > 0) {
        if (!el.matches(':popover-open') && typeof el.showPopover === 'function') {
          el.showPopover();
        }
      } else if (el.matches(':popover-open') && typeof el.hidePopover === 'function') {
        el.hidePopover();
      }
    } catch {
      // Compatibilidad con navegadores previos a Popover mientras carga el polyfill
    }
  }, [visibles.length]);

  useEffect(() => {
    if (visibles.length === 0) return;
    const ultima = visibles[visibles.length - 1];
    if (ultima.id === ultimoIdRef.current) return;
    ultimoIdRef.current = ultima.id;

    if (typeof document !== 'undefined' && typeof document.ariaNotify === 'function') {
      document.ariaNotify(ultima.mensaje, { priority: ultima.tipo === 'error' ? 'high' : 'normal' });
    }
  }, [visibles]);

  const manejarDescartarManual = (id, index) => {
    const timerId = timersRef.current.get(id);
    if (timerId) {
      clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    const restantes = visibles.filter((n) => n.id !== id);
    if (restantes.length > 0) {
      const siguiente = restantes[Math.min(index, restantes.length - 1)];
      requestAnimationFrame(() => {
        botonesCerrarRef.current.get(siguiente.id)?.focus();
      });
    } else if (enfoquePrevioRef.current && typeof enfoquePrevioRef.current.focus === 'function') {
      const destino = enfoquePrevioRef.current;
      requestAnimationFrame(() => destino.focus());
    }
    onDescartar?.(id);
  };

  return (
    <>
      {!(typeof document !== 'undefined' && typeof document.ariaNotify === 'function') && (
        <div className="sr-only">
          <p>Notificaciones recientes de BikeStore</p>
          <div aria-live="polite" aria-atomic="true">
            {visibles.length > 0 ? visibles[visibles.length - 1].mensaje : ''}
          </div>
        </div>
      )}

      <section
        ref={pilaRef}
        className="pila-notificaciones"
        role="region"
        aria-label="Notificaciones"
        popover="manual"
        hidden={visibles.length === 0}
        onMouseEnter={() => {
          hoverDentroRef.current = true;
          actualizarPausa();
        }}
        onMouseLeave={() => {
          hoverDentroRef.current = false;
          actualizarPausa();
        }}
        onFocus={(ev) => {
          if (ev.relatedTarget && !pilaRef.current?.contains(ev.relatedTarget)) {
            enfoquePrevioRef.current = ev.relatedTarget;
          }
          focusDentroRef.current = true;
          actualizarPausa();
        }}
        onBlur={(ev) => {
          if (!pilaRef.current?.contains(ev.relatedTarget)) {
            focusDentroRef.current = false;
            actualizarPausa();
          }
        }}
      >
        {visibles.map((notif, idx) => {
          const tipo = notif.tipo || 'info';
          return (
            <article key={notif.id} className={`notificacion notificacion-${tipo}`}>
              <span className="notificacion-icono">
                <Icono tipo={ICONOS_TIPO[tipo] || 'info'} size={18} />
              </span>
              <p>{notif.mensaje}</p>
              <button
                ref={(nodo) => {
                  if (nodo) botonesCerrarRef.current.set(notif.id, nodo);
                  else botonesCerrarRef.current.delete(notif.id);
                }}
                type="button"
                className="notificacion-cerrar"
                aria-label="Cerrar notificación"
                onClick={() => manejarDescartarManual(notif.id, idx)}
              >
                <Icono tipo="cerrar" size={16} />
              </button>
            </article>
          );
        })}
      </section>
    </>
  );
}
