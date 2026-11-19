import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CampoContrasena } from '../../components/CampoContrasena.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';

export function LoginPage({ onNotificar }) {
  useTituloPagina('Ingresar', {
    descripcion: 'Inicia sesión en BikeStore para gestionar tus pedidos, carrito y solicitudes de retracto.',
    noIndex: true,
  });
  const { estaAutenticado, esAdmin, iniciarSesion } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [enviando, setEnviando] = useState(false);

  const correoRef = useRef(null);
  const contrasenaRef = useRef(null);
  const redirigiendoSubmitRef = useRef(false);

  if (estaAutenticado && !enviando && !redirigiendoSubmitRef.current) {
    return <Navigate to={esAdmin ? '/admin' : '/'} replace />;
  }

  const validarCampo = (campo, valor) => {
    const limpio = String(valor || '').trim();
    if (campo === 'correo') {
      if (!limpio) return 'Ingresa tu correo electrónico.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
        return 'Ingresa un correo electrónico con formato válido (ej. usuario@dominio.com).';
      }
      return '';
    }
    if (campo === 'contrasena') {
      if (!valor) return 'Ingresa tu contraseña.';
      return '';
    }
    return '';
  };

  const manejarBlur = (campo, valor) => {
    if (!valor) return;
    const msg = validarCampo(campo, valor);
    setErrores((prev) => ({ ...prev, [campo]: msg }));
  };

  const manejarSubmit = async (ev) => {
    ev.preventDefault();
    setErrorServidor('');

    const errCorreo = validarCampo('correo', correo);
    const errPass = validarCampo('contrasena', contrasena);
    const siguientes = { correo: errCorreo, contrasena: errPass };
    setErrores(siguientes);

    if (errCorreo) {
      correoRef.current?.focus();
      return;
    }
    if (errPass) {
      contrasenaRef.current?.focus();
      return;
    }

    redirigiendoSubmitRef.current = true;
    setEnviando(true);
    try {
      const { usuario, ajustesFusion } = await iniciarSesion({
        correo: correo.trim(),
        contrasena,
      });

      if (usuario.rol === 'ADMIN') {
        onNotificar?.('exito', `Bienvenido al panel administrativo, ${usuario.nombre}.`);
        navigate('/admin', { replace: true });
        return;
      }

      if (ajustesFusion.length > 0) {
        onNotificar?.('alerta', 'Sesión iniciada. Revisa los ajustes aplicados al fusionar tu carrito.');
        navigate('/carrito', { replace: true, state: { ajustesFusion } });
        return;
      }

      onNotificar?.('exito', `Bienvenido de nuevo, ${usuario.nombre}.`);
      const destino = location.state?.from?.pathname || '/';
      navigate(destino, { replace: true });
    } catch (err) {
      redirigiendoSubmitRef.current = false;
      setErrorServidor(err?.mensaje || 'No fue posible iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="contenedor seccion">
      <div className="formulario-angosto panel">
        <p className="antetitulo">Acceso BikeStore</p>
        <h1>Iniciar sesión</h1>
        <p className="campo-ayuda" style={{ marginBottom: '1.25rem' }}>
          Si agregaste productos como visitante, los uniremos automáticamente a tu cuenta al ingresar.
        </p>

        {errorServidor && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{errorServidor}</p>
          </div>
        )}

        <form className="formulario" onSubmit={manejarSubmit} noValidate>
          <div className="campo">
            <label htmlFor="login-correo">
              Correo electrónico <span aria-hidden="true">*</span>
            </label>
            <input
              ref={correoRef}
              id="login-correo"
              name="correo"
              type="email"
              className="campo-control"
              value={correo}
              onChange={(ev) => {
                setCorreo(ev.target.value);
                if (errores.correo) setErrores((p) => ({ ...p, correo: '' }));
              }}
              onBlur={(ev) => manejarBlur('correo', ev.target.value)}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={errores.correo ? 'true' : 'false'}
              aria-describedby={errores.correo ? 'login-correo-error' : undefined}
            />
            {errores.correo && (
              <p id="login-correo-error" className="campo-error">
                Error: {errores.correo}
              </p>
            )}
          </div>

          <CampoContrasena
            id="login-contrasena"
            name="contrasena"
            etiqueta="Contraseña"
            valor={contrasena}
            onChange={(ev) => {
              setContrasena(ev.target.value);
              if (errores.contrasena) setErrores((p) => ({ ...p, contrasena: '' }));
            }}
            onBlur={(ev) => manejarBlur('contrasena', ev.target.value)}
            error={errores.contrasena}
            autoComplete="current-password"
            inputRef={contrasenaRef}
          />

          <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
            {enviando ? 'Ingresando...' : 'Ingresar a mi cuenta'}
          </button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.25rem' }}>
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
          <Link to="/registro">Crear cuenta nueva</Link>
        </div>
      </div>
    </section>
  );
}
