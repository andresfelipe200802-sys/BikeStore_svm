import { useEffect, useId, useRef } from 'react';

/**
 * Diálogo modal nativo basado en <dialog> + showModal().
 * No duplica role="dialog", aria-modal ni bloqueo manual del scroll sobre body.
 */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  children,
  etiquetaConfirmar = 'Confirmar',
  etiquetaCancelar = 'Cancelar',
  varianteDestructiva = false,
  ocupado = false,
  onConfirmar,
  onCancelar,
}) {
  const dialogRef = useRef(null);
  const tituloId = useId();
  const accionRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (abierto) {
      if (!el.open) {
        if (typeof el.showModal === 'function') {
          el.showModal();
        } else {
          el.setAttribute('open', '');
        }
      }
    } else if (el.open) {
      if (typeof el.close === 'function') {
        el.close('programmatic');
      } else {
        el.removeAttribute('open');
      }
    }
  }, [abierto]);

  const manejarClose = () => {
    const el = dialogRef.current;
    const accion = accionRef.current || el?.returnValue || '';
    if (el) el.returnValue = '';
    accionRef.current = null;

    if (accion === 'confirm') {
      onConfirmar?.();
    } else if (accion !== 'programmatic') {
      onCancelar?.();
    }
  };

  const manejarCancel = (ev) => {
    if (ocupado) {
      ev.preventDefault();
      return;
    }
    accionRef.current = 'cancel';
  };

  const solicitarCierre = (valor) => {
    if (ocupado) return;
    accionRef.current = valor;
    const el = dialogRef.current;
    if (el && typeof el.close === 'function') {
      el.close(valor);
    } else if (valor === 'confirm') {
      onConfirmar?.();
    } else {
      onCancelar?.();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialogo"
      aria-labelledby={tituloId}
      onClose={manejarClose}
      onCancel={manejarCancel}
    >
      <h2 id={tituloId}>{titulo}</h2>
      {mensaje && <p className="dialogo-cuerpo">{mensaje}</p>}
      {children}
      <div className="dialogo-acciones">
        <button
          type="button"
          className="btn btn-contorno"
          autoFocus={varianteDestructiva}
          disabled={ocupado}
          onClick={() => solicitarCierre('cancel')}
        >
          {etiquetaCancelar}
        </button>
        <button
          type="button"
          className={`btn ${varianteDestructiva ? 'btn-oscuro' : 'btn-primario'}`}
          autoFocus={!varianteDestructiva}
          disabled={ocupado}
          onClick={() => solicitarCierre('confirm')}
        >
          {ocupado ? 'Procesando...' : etiquetaConfirmar}
        </button>
      </div>
    </dialog>
  );
}
