import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CampoContrasena } from '../../components/CampoContrasena.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import {
  OPCIONES_TIPO_DOCUMENTO,
  isValidDocumento,
  normalizeDocumento,
  obtenerAyudaDocumento,
} from '../../utils/documentos.js';

export function RegistroPage({ onNotificar }) {
  useTituloPagina('Crear cuenta', {
    descripcion: 'Regístrate en BikeStore para comprar bicicletas y accesorios con reserva de inventario garantizada.',
    noIndex: true,
  });
  const { estaAutenticado, esAdmin, registrarCliente } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    tipo_documento: 'CC',
    numero_documento: '',
    nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    telefono: '',
    correo: '',
    contrasena: '',
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [enviando, setEnviando] = useState(false);

  const refs = {
    numero_documento: useRef(null),
    nombre: useRef(null),
    primer_apellido: useRef(null),
    telefono: useRef(null),
    correo: useRef(null),
    contrasena: useRef(null),
  };
  const redirigiendoSubmitRef = useRef(false);

  if (estaAutenticado && !enviando && !redirigiendoSubmitRef.current) {
    return <Navigate to={esAdmin ? '/admin' : '/'} replace />;
  }

  const validarCampo = (campo, valores) => {
    const val = String(valores[campo] || '').trim();
    switch (campo) {
      case 'numero_documento':
        if (!val) return 'Ingresa tu número de documento.';
        if (!isValidDocumento(valores.tipo_documento, val)) {
          return `Formato inválido para ${valores.tipo_documento}. ${obtenerAyudaDocumento(valores.tipo_documento)}`;
        }
        return '';
      case 'nombre':
        return val.length >= 2 ? '' : 'Ingresa tu nombre (mínimo 2 caracteres).';
      case 'primer_apellido':
        return val.length >= 2 ? '' : 'Ingresa tu primer apellido (mínimo 2 caracteres).';
      case 'telefono':
        return val.length >= 7 && val.length <= 20
          ? ''
          : 'Ingresa un teléfono de contacto válido (7 a 20 dígitos).';
      case 'correo':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
          ? ''
          : 'Ingresa un correo electrónico válido.';
      case 'contrasena':
        return (valores.contrasena || '').length >= 8
          ? ''
          : 'La contraseña debe tener al menos 8 caracteres.';
      default:
        return '';
    }
  };

  const actualizar = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    if (errores[campo]) {
      setErrores((prev) => ({ ...prev, [campo]: '' }));
    }
  };

  const manejarBlur = (campo) => {
    if (!form[campo]) return;
    setErrores((prev) => ({ ...prev, [campo]: validarCampo(campo, form) }));
  };

  const manejarSubmit = async (ev) => {
    ev.preventDefault();
    setErrorServidor('');

    const camposObligatorios = [
      'numero_documento',
      'nombre',
      'primer_apellido',
      'telefono',
      'correo',
      'contrasena',
    ];
    const nuevosErrores = {};
    let primerInvalido = null;

    for (const campo of camposObligatorios) {
      const msg = validarCampo(campo, form);
      nuevosErrores[campo] = msg;
      if (msg && !primerInvalido) primerInvalido = campo;
    }

    setErrores(nuevosErrores);
    if (primerInvalido) {
      refs[primerInvalido]?.current?.focus();
      return;
    }

    redirigiendoSubmitRef.current = true;
    setEnviando(true);
    try {
      const { usuario, ajustesFusion } = await registrarCliente({
        tipo_documento: form.tipo_documento,
        numero_documento: normalizeDocumento(form.numero_documento),
        nombre: form.nombre.trim(),
        primer_apellido: form.primer_apellido.trim(),
        segundo_apellido: form.segundo_apellido,
        telefono: form.telefono.trim(),
        correo: form.correo.trim(),
        contrasena: form.contrasena,
      });

      if (ajustesFusion.length > 0) {
        onNotificar?.(
          'alerta',
          `Cuenta creada para ${usuario.nombre}. Revisa los ajustes de stock al fusionar tu carrito.`
        );
        navigate('/carrito', { replace: true, state: { ajustesFusion } });
      } else {
        onNotificar?.('exito', `¡Cuenta creada correctamente! Bienvenido, ${usuario.nombre}.`);
        navigate('/catalogo', { replace: true });
      }
    } catch (err) {
      redirigiendoSubmitRef.current = false;
      setErrorServidor(err?.mensaje || 'No pudimos completar el registro. Verifica tus datos.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="contenedor seccion">
      <div className="formulario-angosto panel">
        <p className="antetitulo">Nueva cuenta</p>
        <h1>Crear cuenta</h1>
        <p className="campo-ayuda" style={{ marginBottom: '1.25rem' }}>
          Crea tu cuenta para realizar tus compras, hacer seguimiento a tus pedidos y gestionar devoluciones.
        </p>

        {errorServidor && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{errorServidor}</p>
          </div>
        )}

        <form className="formulario" onSubmit={manejarSubmit} noValidate>
          <fieldset className="grupo-fieldset">
            <legend>Tipo de documento *</legend>
            <div className="grupo-radios">
              {OPCIONES_TIPO_DOCUMENTO.map((op) => (
                <label key={op.valor} className="opcion-radio">
                  <input
                    type="radio"
                    name="tipo_documento"
                    value={op.valor}
                    checked={form.tipo_documento === op.valor}
                    onChange={(ev) => actualizar('tipo_documento', ev.target.value)}
                  />
                  <span>{op.valor}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="campo">
            <label htmlFor="reg-num-doc">
              Número de documento <span aria-hidden="true">*</span>
            </label>
            <span id="reg-num-doc-ayuda" className="campo-ayuda">
              {obtenerAyudaDocumento(form.tipo_documento)}
            </span>
            <input
              ref={refs.numero_documento}
              id="reg-num-doc"
              name="numero_documento"
              type="text"
              className="campo-control"
              value={form.numero_documento}
              onChange={(ev) => actualizar('numero_documento', ev.target.value)}
              onBlur={() => manejarBlur('numero_documento')}
              maxLength={30}
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              aria-invalid={errores.numero_documento ? 'true' : 'false'}
              aria-describedby={
                errores.numero_documento
                  ? 'reg-num-doc-ayuda reg-num-doc-error'
                  : 'reg-num-doc-ayuda'
              }
            />
            {errores.numero_documento && (
              <p id="reg-num-doc-error" className="campo-error">
                Error: {errores.numero_documento}
              </p>
            )}
          </div>

          <div className="fila-dos-columnas">
            <div className="campo">
              <label htmlFor="reg-nombre">
                Nombre <span aria-hidden="true">*</span>
              </label>
              <input
                ref={refs.nombre}
                id="reg-nombre"
                name="nombre"
                type="text"
                className="campo-control"
                value={form.nombre}
                onChange={(ev) => actualizar('nombre', ev.target.value)}
                onBlur={() => manejarBlur('nombre')}
                autoComplete="given-name"
                maxLength={100}
                required
                aria-invalid={errores.nombre ? 'true' : 'false'}
                aria-describedby={errores.nombre ? 'reg-nombre-error' : undefined}
              />
              {errores.nombre && (
                <p id="reg-nombre-error" className="campo-error">
                  Error: {errores.nombre}
                </p>
              )}
            </div>

            <div className="campo">
              <label htmlFor="reg-apellido1">
                Primer apellido <span aria-hidden="true">*</span>
              </label>
              <input
                ref={refs.primer_apellido}
                id="reg-apellido1"
                name="primer_apellido"
                type="text"
                className="campo-control"
                value={form.primer_apellido}
                onChange={(ev) => actualizar('primer_apellido', ev.target.value)}
                onBlur={() => manejarBlur('primer_apellido')}
                autoComplete="family-name"
                maxLength={100}
                required
                aria-invalid={errores.primer_apellido ? 'true' : 'false'}
                aria-describedby={errores.primer_apellido ? 'reg-apellido1-error' : undefined}
              />
              {errores.primer_apellido && (
                <p id="reg-apellido1-error" className="campo-error">
                  Error: {errores.primer_apellido}
                </p>
              )}
            </div>
          </div>

          <div className="fila-dos-columnas">
            <div className="campo">
              <label htmlFor="reg-apellido2">Segundo apellido (opcional)</label>
              <input
                id="reg-apellido2"
                name="segundo_apellido"
                type="text"
                className="campo-control"
                value={form.segundo_apellido}
                onChange={(ev) => actualizar('segundo_apellido', ev.target.value)}
                autoComplete="additional-name"
                maxLength={100}
              />
            </div>

            <div className="campo">
              <label htmlFor="reg-telefono">
                Teléfono <span aria-hidden="true">*</span>
              </label>
              <input
                ref={refs.telefono}
                id="reg-telefono"
                name="telefono"
                type="tel"
                className="campo-control"
                value={form.telefono}
                onChange={(ev) => actualizar('telefono', ev.target.value)}
                onBlur={() => manejarBlur('telefono')}
                autoComplete="tel"
                maxLength={20}
                required
                aria-invalid={errores.telefono ? 'true' : 'false'}
                aria-describedby={errores.telefono ? 'reg-telefono-error' : undefined}
              />
              {errores.telefono && (
                <p id="reg-telefono-error" className="campo-error">
                  Error: {errores.telefono}
                </p>
              )}
            </div>
          </div>

          <div className="campo">
            <label htmlFor="reg-correo">
              Correo electrónico <span aria-hidden="true">*</span>
            </label>
            <input
              ref={refs.correo}
              id="reg-correo"
              name="correo"
              type="email"
              className="campo-control"
              value={form.correo}
              onChange={(ev) => actualizar('correo', ev.target.value)}
              onBlur={() => manejarBlur('correo')}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={150}
              required
              aria-invalid={errores.correo ? 'true' : 'false'}
              aria-describedby={errores.correo ? 'reg-correo-error' : undefined}
            />
            {errores.correo && (
              <p id="reg-correo-error" className="campo-error">
                Error: {errores.correo}
              </p>
            )}
          </div>

          <CampoContrasena
            id="reg-contrasena"
            name="contrasena"
            etiqueta="Contraseña"
            ayuda="Mínimo 8 caracteres."
            valor={form.contrasena}
            onChange={(ev) => actualizar('contrasena', ev.target.value)}
            onBlur={() => manejarBlur('contrasena')}
            error={errores.contrasena}
            autoComplete="new-password"
            minLength={8}
            inputRef={refs.contrasena}
          />

          <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
            {enviando ? 'Creando cuenta...' : 'Crear mi cuenta e ingresar'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', marginBottom: 0 }}>
          ¿Ya tienes cuenta? <Link to="/ingresar">Inicia sesión aquí</Link>
        </p>
      </div>
    </section>
  );
}
