import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/client.js';
import { CampoContrasena } from '../../components/CampoContrasena.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';

export function RestablecerPage({ onNotificar }) {
  useTituloPagina('Restablecer contraseña');
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [errores, setErrores] = useState({});
  const [completado, setCompletado] = useState(false);
  const [errorServidor, setErrorServidor] = useState('');
  const [enviando, setEnviando] = useState(false);

  const tokenRef = useRef(null);
  const passRef = useRef(null);

  const manejarSubmit = async (ev) => {
    ev.preventDefault();
    setErrorServidor('');

    const tokenLimpio = token.trim();
    const errToken = tokenLimpio.length >= 32 ? '' : 'El token de recuperación debe tener al menos 32 caracteres.';
    const errPass =
      nuevaContrasena.length >= 8 ? '' : 'La nueva contraseña debe tener mínimo 8 caracteres.';
    setErrores({ token: errToken, nuevaContrasena: errPass });

    if (errToken) {
      tokenRef.current?.focus();
      return;
    }
    if (errPass) {
      passRef.current?.focus();
      return;
    }

    setEnviando(true);
    try {
      await authApi.restablecer({ token: tokenLimpio, nueva_contrasena: nuevaContrasena });
      setCompletado(true);
      onNotificar?.('exito', 'Contraseña restablecida. Inicia sesión con tu nueva clave.');
    } catch (err) {
      setErrorServidor(err?.mensaje || 'El enlace o token de recuperación no es válido.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="contenedor seccion">
      <div className="formulario-angosto panel">
        <p className="antetitulo">Seguridad de cuenta</p>
        <h1>Definir nueva contraseña</h1>

        {completado ? (
          <div className="alerta alerta-exito">
            <Icono tipo="exito" size={20} />
            <div>
              <p>Tu contraseña ha sido actualizada y tus sesiones anteriores fueron revocadas.</p>
              <Link className="btn btn-primario" to="/ingresar" style={{ marginTop: '0.9rem' }}>
                Ir a iniciar sesión
              </Link>
            </div>
          </div>
        ) : (
          <>
            {errorServidor && (
              <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
                <Icono tipo="error" size={20} />
                <p>{errorServidor}</p>
              </div>
            )}

            <form className="formulario" onSubmit={manejarSubmit} noValidate>
              <div className="campo">
                <label htmlFor="rest-token">
                  Token de recuperación <span aria-hidden="true">*</span>
                </label>
                <span id="rest-token-ayuda" className="campo-ayuda">
                  Se completa automáticamente desde el enlace enviado a tu correo.
                </span>
                <input
                  ref={tokenRef}
                  id="rest-token"
                  name="token"
                  type="text"
                  className="campo-control"
                  value={token}
                  onChange={(ev) => {
                    setToken(ev.target.value);
                    if (errores.token) setErrores((p) => ({ ...p, token: '' }));
                  }}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-invalid={errores.token ? 'true' : 'false'}
                  aria-describedby={
                    errores.token ? 'rest-token-ayuda rest-token-error' : 'rest-token-ayuda'
                  }
                />
                {errores.token && (
                  <p id="rest-token-error" className="campo-error">
                    Error: {errores.token}
                  </p>
                )}
              </div>

              <CampoContrasena
                id="rest-pass"
                name="nueva_contrasena"
                etiqueta="Nueva contraseña"
                ayuda="Mínimo 8 caracteres."
                valor={nuevaContrasena}
                onChange={(ev) => {
                  setNuevaContrasena(ev.target.value);
                  if (errores.nuevaContrasena) setErrores((p) => ({ ...p, nuevaContrasena: '' }));
                }}
                error={errores.nuevaContrasena}
                autoComplete="new-password"
                minLength={8}
                inputRef={passRef}
              />

              <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
                {enviando ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
