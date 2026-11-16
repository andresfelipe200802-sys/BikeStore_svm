import { useId, useState } from 'react';

/**
 * Campo accesible de contraseña con alternador "Mostrar/Ocultar contraseña" (aria-pressed),
 * texto de ayuda encima del control y soporte completo de autocompletado/pegado.
 */
export function CampoContrasena({
  id,
  name,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  ayuda,
  autoComplete = 'current-password',
  minLength,
  maxLength = 100,
  required = true,
  inputRef,
}) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id || autoId;
  const ayudaId = `${inputId}-ayuda`;
  const errorId = `${inputId}-error`;

  const describedBy = [ayuda ? ayudaId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="campo">
      <label htmlFor={inputId}>
        {etiqueta} {required && <span aria-hidden="true">*</span>}
      </label>
      {ayuda && (
        <span id={ayudaId} className="campo-ayuda">
          {ayuda}
        </span>
      )}
      <div className="campo-contrasena-envoltura">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type={visible ? 'text' : 'password'}
          className="campo-control"
          value={valor}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="btn btn-contorno btn-pequeno"
          aria-pressed={visible}
          onClick={() => setVisible((prev) => !prev)}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && (
        <p id={errorId} className="campo-error">
          Error: {error}
        </p>
      )}
    </div>
  );
}
