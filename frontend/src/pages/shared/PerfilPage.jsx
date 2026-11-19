import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { perfilApi } from '../../api/client.js';
import { CampoContrasena } from '../../components/CampoContrasena.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { formatearFechaBogota } from '../../utils/formato.js';

export function PerfilPage({ onNotificar }) {
  useTituloPagina('Mi perfil', {
    descripcion: 'Configuración de datos personales y seguridad de cuenta en BikeStore.',
    noIndex: true,
  });
  const { actualizarUsuarioLocal, cambiarContrasena } = useAuth();
  const navigate = useNavigate();

  const [perfil, setPerfil] = useState(null);
  const [datosForm, setDatosForm] = useState({
    nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    telefono: '',
  });
  const [claves, setClaves] = useState({
    contrasena_actual: '',
    nueva_contrasena: '',
  });

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorDatos, setErrorDatos] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);

  useEffect(() => {
    let activo = true;
    perfilApi
      .obtener()
      .then((resp) => {
        if (!activo) return;
        const u = resp?.datos;
        setPerfil(u);
        setDatosForm({
          nombre: u?.nombre || '',
          primer_apellido: u?.primer_apellido || '',
          segundo_apellido: u?.segundo_apellido || '',
          telefono: u?.telefono || '',
        });
      })
      .catch((err) => {
        if (!activo) return;
        setErrorCarga(err?.mensaje || 'No fue posible cargar tu perfil.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const guardarDatosPersonales = async (ev) => {
    ev.preventDefault();
    setErrorDatos('');

    if (
      datosForm.nombre.trim().length < 2 ||
      datosForm.primer_apellido.trim().length < 2 ||
      datosForm.telefono.trim().length < 7
    ) {
      setErrorDatos('Verifica que nombre, primer apellido y teléfono cumplan la longitud mínima.');
      return;
    }

    setGuardandoDatos(true);
    try {
      const resp = await perfilApi.actualizar({
        nombre: datosForm.nombre.trim(),
        primer_apellido: datosForm.primer_apellido.trim(),
        segundo_apellido: datosForm.segundo_apellido,
        telefono: datosForm.telefono.trim(),
      });
      setPerfil((prev) => ({ ...(prev || {}), ...resp.datos, rol: prev?.rol }));
      actualizarUsuarioLocal(resp.datos);
      onNotificar?.('exito', 'Datos personales actualizados correctamente.');
    } catch (err) {
      setErrorDatos(err?.mensaje || 'No pudimos actualizar tu perfil.');
    } finally {
      setGuardandoDatos(false);
    }
  };

  const guardarNuevaContrasena = async (ev) => {
    ev.preventDefault();
    setErrorClave('');

    if (!claves.contrasena_actual || claves.nueva_contrasena.length < 8) {
      setErrorClave('Ingresa tu contraseña actual y define una nueva clave de mínimo 8 caracteres.');
      return;
    }

    setGuardandoClave(true);
    try {
      await cambiarContrasena({
        contrasena_actual: claves.contrasena_actual,
        nueva_contrasena: claves.nueva_contrasena,
      });
      navigate('/ingresar', { replace: true });
    } catch (err) {
      // 401 CREDENCIALES_INVALIDAS no revoca la sesión activa
      setErrorClave(err?.mensaje || 'No fue posible actualizar la contraseña.');
    } finally {
      setGuardandoClave(false);
    }
  };

  if (cargando) {
    return (
      <section className="contenedor seccion texto-estado" aria-live="polite">
        <p>Cargando información de cuenta...</p>
      </section>
    );
  }

  if (errorCarga) {
    return (
      <section className="contenedor seccion">
        <div className="alerta alerta-error" role="alert">
          <Icono tipo="error" size={20} />
          <p>{errorCarga}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="contenedor seccion">
      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Cuenta BikeStore</p>
          <h1 className="titulo-seccion">Mi perfil y seguridad</h1>
        </div>
        {perfil && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <StatusBadge codigo={perfil.rol} />
            <StatusBadge codigo={perfil.estado_usuario} />
          </div>
        )}
      </div>

      <div className="rejilla-asimetrica">
        <div className="panel">
          <h2 style={{ marginBottom: '1rem' }}>Datos personales</h2>

          {perfil && (
            <p className="campo-ayuda" style={{ marginBottom: '1.25rem' }}>
              Documento: <strong>{perfil.tipo_documento} {perfil.numero_documento}</strong> ·
              Correo: <strong>{perfil.correo}</strong> · Registro:{' '}
              {formatearFechaBogota(perfil.fecha_registro)}
            </p>
          )}

          {errorDatos && (
            <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1rem' }}>
              <Icono tipo="error" size={18} />
              <p>{errorDatos}</p>
            </div>
          )}

          <form className="formulario" onSubmit={guardarDatosPersonales} noValidate>
            <div className="fila-dos-columnas">
              <div className="campo">
                <label htmlFor="perf-nombre">Nombre *</label>
                <input
                  id="perf-nombre"
                  type="text"
                  className="campo-control"
                  value={datosForm.nombre}
                  onChange={(ev) => setDatosForm((p) => ({ ...p, nombre: ev.target.value }))}
                  autoComplete="given-name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </div>
              <div className="campo">
                <label htmlFor="perf-ap1">Primer apellido *</label>
                <input
                  id="perf-ap1"
                  type="text"
                  className="campo-control"
                  value={datosForm.primer_apellido}
                  onChange={(ev) =>
                    setDatosForm((p) => ({ ...p, primer_apellido: ev.target.value }))
                  }
                  autoComplete="family-name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="fila-dos-columnas">
              <div className="campo">
                <label htmlFor="perf-ap2">Segundo apellido (opcional)</label>
                <input
                  id="perf-ap2"
                  type="text"
                  className="campo-control"
                  value={datosForm.segundo_apellido}
                  onChange={(ev) =>
                    setDatosForm((p) => ({ ...p, segundo_apellido: ev.target.value }))
                  }
                  autoComplete="additional-name"
                  maxLength={100}
                />
              </div>
              <div className="campo">
                <label htmlFor="perf-tel">Teléfono *</label>
                <input
                  id="perf-tel"
                  type="tel"
                  className="campo-control"
                  value={datosForm.telefono}
                  onChange={(ev) => setDatosForm((p) => ({ ...p, telefono: ev.target.value }))}
                  autoComplete="tel"
                  required
                  minLength={7}
                  maxLength={20}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primario" disabled={guardandoDatos}>
              {guardandoDatos ? 'Guardando cambios...' : 'Guardar datos personales'}
            </button>
          </form>
        </div>

        <div className="panel">
          <h2 style={{ marginBottom: '0.5rem' }}>Cambiar contraseña</h2>
          <p className="campo-ayuda" style={{ marginBottom: '1rem' }}>
            Al actualizar tu contraseña se cerrarán todas tus sesiones activas y deberás ingresar de
            nuevo.
          </p>

          {errorClave && (
            <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1rem' }}>
              <Icono tipo="error" size={18} />
              <p>{errorClave}</p>
            </div>
          )}

          <form className="formulario" onSubmit={guardarNuevaContrasena} noValidate>
            <CampoContrasena
              id="perf-clave-actual"
              name="contrasena_actual"
              etiqueta="Contraseña actual"
              valor={claves.contrasena_actual}
              onChange={(ev) =>
                setClaves((p) => ({ ...p, contrasena_actual: ev.target.value }))
              }
              autoComplete="current-password"
            />
            <CampoContrasena
              id="perf-clave-nueva"
              name="nueva_contrasena"
              etiqueta="Nueva contraseña"
              ayuda="Mínimo 8 caracteres."
              valor={claves.nueva_contrasena}
              onChange={(ev) =>
                setClaves((p) => ({ ...p, nueva_contrasena: ev.target.value }))
              }
              autoComplete="new-password"
              minLength={8}
            />
            <button type="submit" className="btn btn-oscuro btn-bloque" disabled={guardandoClave}>
              {guardandoClave ? 'Actualizando clave...' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
