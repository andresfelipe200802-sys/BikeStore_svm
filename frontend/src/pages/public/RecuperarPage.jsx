import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';

export function RecuperarPage() {
  useTituloPagina('Recuperar contraseña');
  const [correo, setCorreo] = useState('');
  const [errorCampo, setErrorCampo] = useState('');
  const [mensajeRespuesta, setMensajeRespuesta] = useState('');
  const [errorServidor, setErrorServidor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);

  const manejarSubmit = async (ev) => {
    ev.preventDefault();
    setErrorServidor('');
    const limpio = correo.trim();
    if (!limpio || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
      setErrorCampo('Ingresa un correo electrónico válido.');
      inputRef.current?.focus();
      return;
    }

    setEnviando(true);
    try {
      const resp = await authApi.recuperar(limpio);
      setMensajeRespuesta(
        resp?.datos?.mensaje ||
          'Si el correo electrónico está registrado en una cuenta activa, recibirás instrucciones para restablecer tu contraseña.'
      );
    } catch (err) {
      setErrorServidor(err?.mensaje || 'No pudimos procesar la solicitud en este momento.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="contenedor seccion">
      <div className="formulario-angosto panel">
        <p className="antetitulo">Soporte de acceso</p>
        <h1>Recuperar contraseña</h1>
        <p className="campo-ayuda" style={{ marginBottom: '1.25rem' }}>
          Por seguridad, siempre respondemos con un mensaje neutro sin revelar si el correo existe.
        </p>

        {mensajeRespuesta && (
          <div className="alerta alerta-exito" role="status" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="exito" size={20} />
            <div>
              <p>{mensajeRespuesta}</p>
              <Link to="/restablecer-contrasena" style={{ display: 'inline-block', marginTop: '0.5rem' }}>
                ¿Ya tienes tu token? Restablecer contraseña
              </Link>
            </div>
          </div>
        )}

        {errorServidor && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{errorServidor}</p>
          </div>
        )}

        <form className="formulario" onSubmit={manejarSubmit} noValidate>
          <div className="campo">
            <label htmlFor="rec-correo">
              Correo electrónico registrado <span aria-hidden="true">*</span>
            </label>
            <input
              ref={inputRef}
              id="rec-correo"
              name="correo"
              type="email"
              className="campo-control"
              value={correo}
              onChange={(ev) => {
                setCorreo(ev.target.value);
                if (errorCampo) setErrorCampo('');
              }}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={errorCampo ? 'true' : 'false'}
              aria-describedby={errorCampo ? 'rec-correo-error' : undefined}
            />
            {errorCampo && (
              <p id="rec-correo-error" className="campo-error">
                Error: {errorCampo}
              </p>
            )}
          </div>

          <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Solicitar recuperación'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', marginBottom: 0 }}>
          <Link to="/ingresar">← Volver a iniciar sesión</Link>
        </p>
      </div>
    </section>
  );
}
