import { useCallback, useEffect, useId, useState } from 'react';
import { adminApi } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { esUrlHttpValida } from '../../utils/documentos.js';
import { formatearCOP } from '../../utils/formato.js';

const FORM_INICIAL = {
  id_categoria: '',
  nombre: '',
  descripcion: '',
  precio: '',
  existencias: '0',
  imagen_url: '',
};

export function AdminProductosPage({ onNotificar }) {
  useTituloPagina('Admin - Productos', {
    descripcion: 'Administración de productos e inventario BikeStore.',
    noIndex: true,
  });
  const captionId = useId();

  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filtros, setFiltros] = useState({ q: '', id_categoria: '', estado: '', page: 1 });
  const [form, setForm] = useState(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [stockEdit, setStockEdit] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargarProductos = useCallback(async (f) => {
    setCargando(true);
    try {
      const resp = await adminApi.listarProductos({ ...f, limit: 20 });
      setProductos(resp?.datos || []);
      setMeta(resp?.meta || null);
      const mapaStock = {};
      for (const p of resp?.datos || []) {
        mapaStock[p.id_producto] = String(p.existencias);
      }
      setStockEdit(mapaStock);
      setError('');
    } catch (err) {
      setError(err?.mensaje || 'No pudimos consultar el catálogo administrativo.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    adminApi
      .listarCategorias()
      .then((r) => setCategorias(r?.datos || []))
      .catch(() => {});
    cargarProductos(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limpiarForm = () => {
    setEditandoId(null);
    setForm(FORM_INICIAL);
  };

  const guardarProducto = async (ev) => {
    ev.preventDefault();
    setError('');

    if (!form.id_categoria || form.nombre.trim().length < 2 || form.descripcion.trim().length < 2) {
      setError('Completa categoría, nombre y descripción del producto.');
      return;
    }
    if (Number(form.precio) <= 0) {
      setError('El precio debe ser mayor a cero.');
      return;
    }
    if (!esUrlHttpValida(form.imagen_url)) {
      setError('La URL de la imagen debe comenzar con http:// o https:// (máximo 500 caracteres).');
      return;
    }

    setGuardando(true);
    try {
      if (editandoId) {
        // PUT descriptivo: el backend rechaza existencias en PUT (.strict())
        await adminApi.actualizarProducto(editandoId, {
          id_categoria: Number(form.id_categoria),
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim(),
          precio: Number(form.precio),
          imagen_url: form.imagen_url.trim(),
        });
        onNotificar?.('exito', `Producto #${editandoId} actualizado.`);
      } else {
        await adminApi.crearProducto({
          id_categoria: Number(form.id_categoria),
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim(),
          precio: Number(form.precio),
          existencias: Math.max(0, Math.trunc(Number(form.existencias) || 0)),
          imagen_url: form.imagen_url.trim(),
        });
        onNotificar?.('exito', 'Producto creado correctamente.');
      }
      limpiarForm();
      await cargarProductos(filtros);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos guardar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarExistencias = async (idProducto) => {
    const valor = Math.max(0, Math.trunc(Number(stockEdit[idProducto] ?? 0)));
    setError('');
    try {
      await adminApi.ajustarExistenciasProducto(idProducto, valor);
      onNotificar?.('exito', `Existencias del producto #${idProducto} actualizadas a ${valor}.`);
      await cargarProductos(filtros);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos ajustar las existencias.');
    }
  };

  const alternarEstado = async (prod) => {
    setError('');
    try {
      await adminApi.cambiarEstadoProducto(prod.id_producto, !prod.estado);
      onNotificar?.('info', `Producto "${prod.nombre}" ${prod.estado ? 'inactivado' : 'activado'}.`);
      await cargarProductos(filtros);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos cambiar el estado.');
    }
  };

  const aplicarFiltros = (ev) => {
    ev.preventDefault();
    const siguiente = { ...filtros, page: 1 };
    setFiltros(siguiente);
    cargarProductos(siguiente);
  };

  return (
    <>
      <AdminNav />
      <section className="contenedor seccion">
        <div className="seccion-encabezado">
          <div>
            <p className="antetitulo">Catálogo administrativo</p>
            <h1 className="titulo-seccion">Productos e inventario</h1>
          </div>
        </div>

        {error && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.25rem' }}>
            <Icono tipo="error" size={20} />
            <p>{error}</p>
          </div>
        )}

        <div className="panel" style={{ marginBottom: '2rem' }}>
          <h2>{editandoId ? `Editar producto #${editandoId}` : 'Crear producto nuevo'}</h2>
          <form className="formulario" onSubmit={guardarProducto} noValidate>
            <div className="fila-dos-columnas">
              <div className="campo">
                <label htmlFor="prod-cat">Categoría *</label>
                <select
                  id="prod-cat"
                  className="campo-control"
                  value={form.id_categoria}
                  onChange={(ev) => setForm((p) => ({ ...p, id_categoria: ev.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Selecciona una categoría...
                  </option>
                  {categorias.map((c) => (
                    <option key={c.id_categoria} value={String(c.id_categoria)}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="prod-nombre">Nombre *</label>
                <input
                  id="prod-nombre"
                  type="text"
                  className="campo-control"
                  value={form.nombre}
                  onChange={(ev) => setForm((p) => ({ ...p, nombre: ev.target.value }))}
                  required
                  minLength={2}
                  maxLength={150}
                />
              </div>
            </div>

            <div className="fila-dos-columnas">
              <div className="campo">
                <label htmlFor="prod-precio">Precio (COP) *</label>
                <input
                  id="prod-precio"
                  type="number"
                  className="campo-control"
                  min={1}
                  step="any"
                  value={form.precio}
                  onChange={(ev) => setForm((p) => ({ ...p, precio: ev.target.value }))}
                  required
                />
              </div>

              {!editandoId && (
                <div className="campo">
                  <label htmlFor="prod-stock">Existencias iniciales *</label>
                  <input
                    id="prod-stock"
                    type="number"
                    className="campo-control"
                    min={0}
                    value={form.existencias}
                    onChange={(ev) => setForm((p) => ({ ...p, existencias: ev.target.value }))}
                    required
                  />
                </div>
              )}

              <div className="campo">
                <label htmlFor="prod-img">URL de imagen (http/https) *</label>
                <input
                  id="prod-img"
                  type="url"
                  className="campo-control"
                  value={form.imagen_url}
                  onChange={(ev) => setForm((p) => ({ ...p, imagen_url: ev.target.value }))}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={500}
                  required
                />
              </div>
            </div>

            <div className="campo">
              <label htmlFor="prod-desc">Descripción *</label>
              <textarea
                id="prod-desc"
                className="campo-control"
                value={form.descripcion}
                onChange={(ev) => setForm((p) => ({ ...p, descripcion: ev.target.value }))}
                required
                minLength={2}
                maxLength={5000}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primario" disabled={guardando}>
                {guardando ? 'Guardando...' : editandoId ? 'Guardar edición' : 'Crear producto'}
              </button>
              {editandoId && (
                <button type="button" className="btn btn-contorno" onClick={limpiarForm}>
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
        </div>

        <search>
          <form className="filtros-barra" onSubmit={aplicarFiltros}>
            <div className="campo">
              <label htmlFor="adm-prod-q">Buscar</label>
              <input
                id="adm-prod-q"
                type="search"
                className="campo-control"
                value={filtros.q}
                onChange={(ev) => setFiltros((p) => ({ ...p, q: ev.target.value }))}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="campo">
              <label htmlFor="adm-prod-cat">Categoría</label>
              <select
                id="adm-prod-cat"
                className="campo-control"
                value={filtros.id_categoria}
                onChange={(ev) => setFiltros((p) => ({ ...p, id_categoria: ev.target.value }))}
              >
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id_categoria} value={String(c.id_categoria)}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="adm-prod-estado">Estado</label>
              <select
                id="adm-prod-estado"
                className="campo-control"
                value={filtros.estado}
                onChange={(ev) => setFiltros((p) => ({ ...p, estado: ev.target.value }))}
              >
                <option value="">Todos</option>
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primario">
              Filtrar
            </button>
          </form>
        </search>

        {cargando ? (
          <p className="texto-estado">Cargando productos...</p>
        ) : (
          <>
            <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
              <table className="tabla-datos">
                <caption id={captionId}>Catálogo e inventario administrativo</caption>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Existencias</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => (
                    <tr key={p.id_producto}>
                      <th scope="row" className="tabular">#{p.id_producto}</th>
                      <td data-etiqueta="Producto"><strong>{p.nombre}</strong></td>
                      <td data-etiqueta="Categoría">{p.categoria_nombre}</td>
                      <td data-etiqueta="Precio" className="tabular">{formatearCOP(p.precio)}</td>
                      <td data-etiqueta="Estado">
                        <StatusBadge codigo={p.estado ? 'ACTIVO' : 'INACTIVO'} />
                      </td>
                      <td data-etiqueta="Existencias">
                        <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input
                            type="number"
                            aria-label={`Existencias de ${p.nombre}`}
                            className="campo-control"
                            style={{ width: '5.5rem', minBlockSize: '40px' }}
                            min={0}
                            value={stockEdit[p.id_producto] ?? p.existencias}
                            onChange={(ev) =>
                              setStockEdit((prev) => ({
                                ...prev,
                                [p.id_producto]: ev.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-contorno btn-pequeno"
                            onClick={() => guardarExistencias(p.id_producto)}
                          >
                            Ajustar
                          </button>
                        </div>
                      </td>
                      <td data-etiqueta="Acciones">
                        <div className="acciones-celda">
                          <button
                            type="button"
                            className="btn btn-contorno btn-pequeno"
                            onClick={() => {
                              setEditandoId(p.id_producto);
                              setForm({
                                id_categoria: String(p.id_categoria),
                                nombre: p.nombre,
                                descripcion: p.descripcion,
                                precio: String(p.precio),
                                existencias: String(p.existencias),
                                imagen_url: p.imagen_url,
                              });
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-contorno btn-pequeno"
                            onClick={() => alternarEstado(p)}
                          >
                            {p.estado ? 'Inactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              meta={meta}
              onCambiarPagina={(nueva) => {
                const siguiente = { ...filtros, page: nueva };
                setFiltros(siguiente);
                cargarProductos(siguiente);
              }}
            />
          </>
        )}
      </section>
    </>
  );
}
