import { useCallback, useEffect, useId, useState } from 'react';
import { adminApi } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { obtenerMetaEstado } from '../../utils/formato.js';

export function AdminUsuariosPage({ onNotificar }) {
  useTituloPagina('Admin - Usuarios', {
    descripcion: 'Gestión administrativa de usuarios y roles BikeStore.',
    noIndex: true,
  });
  const { usuario: adminActual } = useAuth();
  const captionId = useId();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [usuarios, setUsuarios] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [accionPendiente, setAccionPendiente] = useState(null);
  const [ejecutando, setEjecutando] = useState(false);

  const cargar = useCallback(async (busqueda, pagina) => {
    setCargando(true);
    try {
      const resp = await adminApi.listarUsuarios({ q: busqueda, page: pagina, limit: 20 });
      setUsuarios(resp?.datos || []);
      setMeta(resp?.meta || null);
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No pudimos cargar los usuarios.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(q, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const buscar = (ev) => {
    ev.preventDefault();
    setPage(1);
    cargar(q, 1);
  };

  const confirmarCambio = async () => {
    if (!accionPendiente) return;
    setEjecutando(true);
    setError('');
    try {
      if (accionPendiente.tipo === 'estado') {
        await adminApi.cambiarEstadoUsuario(accionPendiente.user.id_usuario, accionPendiente.valor);
        onNotificar?.(
          'exito',
          `Usuario ${accionPendiente.user.correo} actualizado a ${accionPendiente.valor}.`
        );
      } else {
        await adminApi.cambiarRolUsuario(accionPendiente.user.id_usuario, accionPendiente.valor);
        onNotificar?.(
          'exito',
          `Rol de ${accionPendiente.user.correo} cambiado a ${accionPendiente.valor}.`
        );
      }
      setAccionPendiente(null);
      await cargar(q, page);
    } catch (err) {
      setAccionPendiente(null);
      if (err?.codigo === 'ULTIMO_ADMIN_ACTIVO') {
        setError(err.mensaje);
      } else {
        setError(err?.mensaje || 'No fue posible aplicar el cambio sobre el usuario.');
      }
    } finally {
      setEjecutando(false);
    }
  };

  return (
    <>
      <AdminNav />
      <section className="contenedor seccion">
        <div className="seccion-encabezado">
          <div>
            <p className="antetitulo">Administración de cuentas</p>
            <h1 className="titulo-seccion">Gestión de usuarios</h1>
          </div>
        </div>

        <search>
          <form className="filtros-barra" onSubmit={buscar}>
            <div className="campo">
              <label htmlFor="adm-usr-q">Buscar por nombre, documento o correo</label>
              <input
                id="adm-usr-q"
                type="search"
                className="campo-control"
                value={q}
                onChange={(ev) => setQ(ev.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="btn btn-primario">
              Buscar
            </button>
          </form>
        </search>

        {error && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{error}</p>
          </div>
        )}

        {cargando ? (
          <p className="texto-estado">Cargando usuarios...</p>
        ) : (
          <>
            <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
              <table className="tabla-datos">
                <caption id={captionId}>Usuarios registrados (rol único por cuenta)</caption>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Documento</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Rol</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const siguienteEstado = u.estado_usuario === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
                    const siguienteRol = u.rol === 'ADMIN' ? 'CLIENTE' : 'ADMIN';
                    const esMismoAdmin = adminActual?.id_usuario === u.id_usuario;
                    return (
                      <tr key={u.id_usuario}>
                        <th scope="row" className="tabular">#{u.id_usuario}</th>
                        <td data-etiqueta="Nombre">
                          {u.nombre} {u.primer_apellido}
                          {esMismoAdmin && ' (tú)'}
                        </td>
                        <td data-etiqueta="Documento">{u.tipo_documento} {u.numero_documento}</td>
                        <td data-etiqueta="Correo">{u.correo}</td>
                        <td data-etiqueta="Rol"><StatusBadge codigo={u.rol} /></td>
                        <td data-etiqueta="Estado"><StatusBadge codigo={u.estado_usuario} /></td>
                        <td data-etiqueta="Acciones">
                          <div className="acciones-celda">
                            <button
                              type="button"
                              className="btn btn-contorno btn-pequeno"
                              onClick={() =>
                                setAccionPendiente({
                                  tipo: 'estado',
                                  valor: siguienteEstado,
                                  user: u,
                                })
                              }
                            >
                              {u.estado_usuario === 'ACTIVO' ? 'Inactivar' : 'Activar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-oscuro btn-pequeno"
                              onClick={() =>
                                setAccionPendiente({
                                  tipo: 'rol',
                                  valor: siguienteRol,
                                  user: u,
                                })
                              }
                            >
                              Pasar a {obtenerMetaEstado(siguienteRol).etiqueta}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Paginacion meta={meta} onCambiarPagina={setPage} />
          </>
        )}

        <ConfirmDialog
          abierto={Boolean(accionPendiente)}
          titulo={
            accionPendiente?.tipo === 'estado'
              ? `¿Cambiar estado a ${obtenerMetaEstado(accionPendiente?.valor).etiqueta}?`
              : `¿Cambiar rol a ${obtenerMetaEstado(accionPendiente?.valor).etiqueta}?`
          }
          mensaje="Se actualizarán los permisos de la cuenta y se cerrarán sus sesiones activas. El sistema siempre conserva al menos un administrador activo."
          etiquetaConfirmar="Confirmar cambio"
          etiquetaCancelar="Cancelar"
          varianteDestructiva
          ocupado={ejecutando}
          onConfirmar={confirmarCambio}
          onCancelar={() => setAccionPendiente(null)}
        />
      </section>
    </>
  );
}
