import { useCallback, useEffect, useId, useState } from 'react';
import { adminApi } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';

export function AdminCategoriasPage({ onNotificar }) {
  useTituloPagina('Admin - Categorías');
  const captionId = useId();

  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [catAEliminar, setCatAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const resp = await adminApi.listarCategorias();
      setCategorias(resp?.datos || []);
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No pudimos cargar las categorías.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarForm = () => {
    setEditandoId(null);
    setNombre('');
    setDescripcion('');
  };

  const guardarCategoria = async (ev) => {
    ev.preventDefault();
    setError('');
    if (nombre.trim().length < 2) {
      setError('El nombre de categoría debe tener mínimo 2 caracteres.');
      return;
    }

    setGuardando(true);
    try {
      if (editandoId) {
        await adminApi.actualizarCategoria(editandoId, { nombre: nombre.trim(), descripcion });
        onNotificar?.('exito', 'Categoría actualizada.');
      } else {
        await adminApi.crearCategoria({ nombre: nombre.trim(), descripcion });
        onNotificar?.('exito', 'Categoría creada.');
      }
      limpiarForm();
      await cargar();
    } catch (err) {
      setError(err?.mensaje || 'No pudimos guardar la categoría.');
    } finally {
      setGuardando(false);
    }
  };

  const alternarEstado = async (cat) => {
    setError('');
    try {
      await adminApi.cambiarEstadoCategoria(cat.id_categoria, !cat.estado);
      onNotificar?.('info', `Categoría "${cat.nombre}" ${cat.estado ? 'inactivada' : 'activada'}.`);
      await cargar();
    } catch (err) {
      setError(err?.mensaje || 'No fue posible cambiar el estado.');
    }
  };

  const confirmarEliminacion = async () => {
    if (!catAEliminar) return;
    setEliminando(true);
    setError('');
    try {
      await adminApi.eliminarCategoria(catAEliminar.id_categoria);
      onNotificar?.('exito', `Categoría "${catAEliminar.nombre}" eliminada.`);
      setCatAEliminar(null);
      await cargar();
    } catch (err) {
      setCatAEliminar(null);
      setError(err?.mensaje || 'No es posible eliminar la categoría.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <AdminNav />
      <section className="contenedor seccion">
        <div className="seccion-encabezado">
          <div>
            <p className="antetitulo">Catálogo administrativo</p>
            <h1 className="titulo-seccion">Categorías</h1>
          </div>
        </div>

        {error && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{error}</p>
          </div>
        )}

        <div className="rejilla-asimetrica">
          <div className="panel">
            <h2>{editandoId ? `Editar categoría #${editandoId}` : 'Nueva categoría'}</h2>
            <form className="formulario" onSubmit={guardarCategoria} noValidate>
              <div className="campo">
                <label htmlFor="cat-nombre">Nombre *</label>
                <input
                  id="cat-nombre"
                  type="text"
                  className="campo-control"
                  value={nombre}
                  onChange={(ev) => setNombre(ev.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>

              <div className="campo">
                <label htmlFor="cat-desc">Descripción (opcional)</label>
                <textarea
                  id="cat-desc"
                  className="campo-control"
                  value={descripcion}
                  onChange={(ev) => setDescripcion(ev.target.value)}
                  maxLength={255}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primario" disabled={guardando}>
                  {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear categoría'}
                </button>
                {editandoId && (
                  <button type="button" className="btn btn-contorno" onClick={limpiarForm}>
                    Cancelar edición
                  </button>
                )}
              </div>
            </form>
          </div>

          <div>
            {cargando ? (
              <p className="texto-estado">Cargando categorías...</p>
            ) : (
              <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
                <table className="tabla-datos">
                  <caption id={captionId}>Listado completo de categorías</caption>
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Nombre</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map((cat) => (
                      <tr key={cat.id_categoria}>
                        <th scope="row" className="tabular">#{cat.id_categoria}</th>
                        <td data-etiqueta="Nombre">
                          <strong>{cat.nombre}</strong>
                          {cat.descripcion && (
                            <p className="campo-ayuda" style={{ margin: 0 }}>{cat.descripcion}</p>
                          )}
                        </td>
                        <td data-etiqueta="Estado">
                          <StatusBadge codigo={cat.estado ? 'ACTIVO' : 'INACTIVO'} />
                        </td>
                        <td data-etiqueta="Acciones">
                          <div className="acciones-celda">
                            <button
                              type="button"
                              className="btn btn-contorno btn-pequeno"
                              onClick={() => {
                                setEditandoId(cat.id_categoria);
                                setNombre(cat.nombre);
                                setDescripcion(cat.descripcion || '');
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-contorno btn-pequeno"
                              onClick={() => alternarEstado(cat)}
                            >
                              {cat.estado ? 'Inactivar' : 'Activar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-oscuro btn-pequeno"
                              onClick={() => setCatAEliminar(cat)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <ConfirmDialog
          abierto={Boolean(catAEliminar)}
          titulo={`¿Eliminar categoría "${catAEliminar?.nombre}"?`}
          mensaje="Solo puede eliminarse si no tiene productos asociados; en caso contrario, el servidor la protegerá (409 CATEGORIA_CON_PRODUCTOS)."
          etiquetaConfirmar="Sí, eliminar"
          etiquetaCancelar="Cancelar"
          varianteDestructiva
          ocupado={eliminando}
          onConfirmar={confirmarEliminacion}
          onCancelar={() => setCatAEliminar(null)}
        />
      </section>
    </>
  );
}
