import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { catalogoApi } from '../../api/client.js';
import { Icono } from '../../components/Iconos.jsx';
import { Paginacion } from '../../components/Paginacion.jsx';
import { ProductCard } from '../../components/ProductCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { agregarProductoAlCarrito } from '../../utils/carritoHelper.js';

export function CatalogoPage({ onNotificar }) {
  useTituloPagina('Catálogo', {
    descripcion:
      'Catálogo BikeStore de bicicletas, cascos, repuestos y equipamiento con precios transparentes en pesos colombianos (COP).',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const { estaAutenticado, esAdmin, setCantidadCarrito } = useAuth();

  const idCategoriaUrl = searchParams.get('id_categoria') || '';
  const qUrl = searchParams.get('q') || '';
  const ordenUrl = searchParams.get('orden_precio') || '';
  const pageUrl = Math.max(1, Number(searchParams.get('page') || 1));

  const [textoBusqueda, setTextoBusqueda] = useState(qUrl);
  const [ordenPrecio, setOrdenPrecio] = useState(ordenUrl);
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setTextoBusqueda(qUrl);
    setOrdenPrecio(ordenUrl);
  }, [qUrl, ordenUrl]);

  useEffect(() => {
    const controller = new AbortController();
    catalogoApi
      .categorias({ signal: controller.signal })
      .then((r) => setCategorias(r?.datos || []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let activo = true;
    setCargando(true);
    setError('');

    catalogoApi
      .productos(
        {
          id_categoria: idCategoriaUrl,
          q: qUrl,
          orden_precio: ordenUrl,
          page: pageUrl,
          limit: 12,
        },
        { signal: controller.signal }
      )
      .then((resp) => {
        if (!activo) return;
        setProductos(resp?.datos || []);
        setMeta(resp?.meta || null);
      })
      .catch((err) => {
        if (!activo || err?.name === 'AbortError') return;
        setError(err?.mensaje || 'No pudimos cargar los productos.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
      controller.abort();
    };
  }, [idCategoriaUrl, qUrl, ordenUrl, pageUrl]);

  const actualizarFiltrosUrl = (cambios) => {
    const next = new URLSearchParams(searchParams);
    for (const [clave, valor] of Object.entries(cambios)) {
      const texto = valor === undefined || valor === null ? '' : String(valor).trim();
      if (!texto) next.delete(clave);
      else next.set(clave, texto);
    }
    setSearchParams(next);
  };

  const manejarBuscar = (ev) => {
    ev.preventDefault();
    actualizarFiltrosUrl({
      q: textoBusqueda,
      orden_precio: ordenPrecio,
      page: '1',
    });
  };

  const limpiarFiltros = () => {
    setTextoBusqueda('');
    setOrdenPrecio('');
    setSearchParams({});
  };

  const manejarAgregar = (producto) =>
    agregarProductoAlCarrito({
      producto,
      cantidad: 1,
      estaAutenticado,
      esAdmin,
      setCantidadCarrito,
      notificar: onNotificar,
    });

  return (
    <section className="contenedor seccion">
      <div className="seccion-encabezado">
        <div>
          <p className="antetitulo">Bicicletas y equipamiento</p>
          <h1 className="titulo-seccion">Catálogo de productos</h1>
        </div>
        <p>Explora bicicletas, cascos y accesorios con inventario disponible en tiempo real.</p>
      </div>

      {categorias.length > 0 && (
        <div className="pestanas-categoria" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className="pestana-btn"
            aria-pressed={idCategoriaUrl === ''}
            onClick={() => actualizarFiltrosUrl({ id_categoria: '', page: '1' })}
          >
            Todas
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id_categoria}
              type="button"
              className="pestana-btn"
              aria-pressed={idCategoriaUrl === String(cat.id_categoria)}
              onClick={() =>
                actualizarFiltrosUrl({ id_categoria: String(cat.id_categoria), page: '1' })
              }
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      )}

      <search>
        <form className="filtros-barra" onSubmit={manejarBuscar}>
          <div className="campo">
            <label htmlFor="filtro-q">Buscar producto</label>
            <input
              id="filtro-q"
              name="q"
              type="search"
              className="campo-control"
              value={textoBusqueda}
              onChange={(ev) => setTextoBusqueda(ev.target.value)}
              maxLength={100}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Ej. ruta, casco, luces..."
            />
          </div>

          <div className="campo">
            <label htmlFor="filtro-orden">Ordenar por precio</label>
            <select
              id="filtro-orden"
              name="orden_precio"
              className="campo-control"
              value={ordenPrecio}
              onChange={(ev) => setOrdenPrecio(ev.target.value)}
            >
              <option value="">Más recientes primero</option>
              <option value="asc">Menor a mayor precio</option>
              <option value="desc">Mayor a menor precio</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primario">
            Filtrar
          </button>
          {(idCategoriaUrl || qUrl || ordenUrl) && (
            <button type="button" className="btn btn-contorno" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          )}
        </form>
      </search>

      {error && (
        <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <Icono tipo="error" size={20} />
          <p>{error}</p>
        </div>
      )}

      {cargando ? (
        <div className="grilla-productos">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="esqueleto esqueleto-tarjeta" aria-hidden="true" />
          ))}
        </div>
      ) : productos.length > 0 ? (
        <>
          <h2 className="sr-only">Listado de productos</h2>
          <div className="grilla-productos">
            {productos.map((prod) => (
              <ProductCard key={prod.id_producto} producto={prod} onAgregar={manejarAgregar} />
            ))}
          </div>
          <Paginacion
            meta={meta}
            onCambiarPagina={(nueva) => actualizarFiltrosUrl({ page: String(nueva) })}
          />
        </>
      ) : (
        <div className="estado-vacio">
          <p>No encontramos productos que coincidan con tu búsqueda actual.</p>
          <button type="button" className="btn btn-contorno" onClick={limpiarFiltros}>
            Mostrar todo el catálogo
          </button>
        </div>
      )}
    </section>
  );
}
