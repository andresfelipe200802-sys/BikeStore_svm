import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogoApi } from '../../api/client.js';
import { HeroCanvas } from '../../components/HeroCanvas.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { ProductCard } from '../../components/ProductCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import { agregarProductoAlCarrito } from '../../utils/carritoHelper.js';

const BENEFICIOS_MARCA = [
  {
    titulo: 'Precisión en cada detalle',
    descripcion: 'Especificaciones transparentes, disponibilidad actualizada al instante y cero cargos ocultos.',
    icono: 'bicicleta',
  },
  {
    titulo: 'Reserva protegida 15 min',
    descripcion: 'Al confirmar pedido garantizamos tus unidades durante 15 minutos mientras pagas.',
    icono: 'escudo',
  },
  {
    titulo: 'Precios claros en COP',
    descripcion: 'Valores verificados automáticamente antes de confirmar cada orden de pago.',
    icono: 'info',
  },
  {
    titulo: 'Retracto legal (5 días hábiles)',
    descripcion: 'Solicitud trazable por ítem y reembolso transparente bajo normativa colombiana.',
    icono: 'exito',
  },
];

export function InicioPage({ onNotificar }) {
  useTituloPagina('Inicio', {
    descripcion:
      'Explora bicicletas de ruta, montaña, movilidad urbana, cascos y accesorios con inventario disponible en tiempo real en BikeStore Colombia.',
  });
  const { estaAutenticado, esAdmin, setCantidadCarrito } = useAuth();

  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let activo = true;

    (async () => {
      try {
        const [catResp, prodResp] = await Promise.all([
          catalogoApi.categorias({ signal: controller.signal }),
          catalogoApi.productos({ limit: 4 }, { signal: controller.signal }),
        ]);
        if (!activo) return;
        setCategorias(catResp?.datos || []);
        setProductos(prodResp?.datos || []);
        setErrorCarga('');
      } catch (err) {
        if (!activo || err?.name === 'AbortError') return;
        setErrorCarga(err?.mensaje || 'No fue posible cargar el catálogo en este momento.');
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
      controller.abort();
    };
  }, []);

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
    <>
      <section className="hero zona-oscura">
        <HeroCanvas />
        <div className="contenedor hero-contenido">
          <p className="antetitulo">BikeStore Colombia · Ciclismo y equipamiento</p>
          <h1>
            Precisión mecánica para{' '}
            <em className="titular-corriente">cada kilómetro</em>
          </h1>
          <p className="hero-lead">
            Bicicletas de ruta, montaña y ciudad, cascos y accesorios con inventario disponible en
            tiempo real, precios claros en pesos colombianos y compra transparente.
          </p>

          <div className="hero-acciones">
            <Link className="btn btn-neon" to="/catalogo">
              <span>Explorar catálogo</span>
              <Icono tipo="flecha" size={18} />
            </Link>
            <Link className="btn btn-contorno" to={estaAutenticado ? '/pedidos' : '/ingresar'}>
              {estaAutenticado ? 'Ver mis pedidos' : 'Ingresar a mi cuenta'}
            </Link>
          </div>

          <ul className="hero-datos">
            <li>
              <Icono tipo="escudo" size={17} />
              <span>Reserva de inventario por 15 minutos</span>
            </li>
            <li>
              <Icono tipo="exito" size={17} />
              <span>Derecho de retracto legal · 5 días hábiles</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="seccion zona-oscura franja-categorias" aria-labelledby="titulo-categorias">
        <div className="contenedor">
          <div className="seccion-encabezado">
            <div>
              <p className="antetitulo">Explora por disciplina</p>
              <h2 id="titulo-categorias" className="titulo-seccion">
                Categorías destacadas
              </h2>
            </div>
            <Link className="btn btn-contorno" to="/catalogo">
              Ver todo el catálogo
            </Link>
          </div>

          {cargando ? (
            <div className="lista-categorias">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="esqueleto esqueleto-categoria" aria-hidden="true" />
              ))}
            </div>
          ) : categorias.length > 0 ? (
            <div className="lista-categorias">
              {categorias.map((cat) => (
                <Link
                  key={cat.id_categoria}
                  className="tarjeta-categoria revelar"
                  to={`/catalogo?id_categoria=${cat.id_categoria}`}
                >
                  <span className="tarjeta-categoria-nombre">
                    <span>{cat.nombre}</span>
                    <Icono tipo="flecha" size={16} />
                  </span>
                  {cat.descripcion && (
                    <span className="tarjeta-categoria-descripcion">{cat.descripcion}</span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="estado-vacio">
              <p>{errorCarga || 'No hay categorías activas registradas todavía.'}</p>
            </div>
          )}
        </div>
      </section>

      <section className="seccion" aria-labelledby="titulo-destacados">
        <div className="contenedor">
          <div className="seccion-encabezado">
            <div>
              <p className="antetitulo">Selección del catálogo</p>
              <h2 id="titulo-destacados" className="titulo-seccion">
                Productos recientes
              </h2>
            </div>
            <Link className="btn btn-oscuro" to="/catalogo">
              Ir al catálogo completo
            </Link>
          </div>

          {cargando ? (
            <div className="grilla-productos">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="esqueleto esqueleto-tarjeta" aria-hidden="true" />
              ))}
            </div>
          ) : productos.length > 0 ? (
            <div className="grilla-productos">
              {productos.map((prod, idx) => (
                <ProductCard
                  key={prod.id_producto}
                  producto={prod}
                  priority={idx === 0}
                  onAgregar={manejarAgregar}
                />
              ))}
            </div>
          ) : (
            <div className="estado-vacio">
              <p>
                {errorCarga ||
                  'Aún no hay productos disponibles en esta selección. Explora el catálogo completo para ver otras opciones.'}
              </p>
              <Link className="btn btn-primario" to="/catalogo">
                Ir al catálogo
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="seccion" aria-labelledby="titulo-beneficios">
        <div className="contenedor">
          <div className="seccion-encabezado">
            <div>
              <p className="antetitulo">Compromiso BikeStore</p>
              <h2 id="titulo-beneficios" className="titulo-seccion">
                Compra clara de principio a fin
              </h2>
            </div>
          </div>

          <div className="beneficios">
            {BENEFICIOS_MARCA.map((item) => (
              <article key={item.titulo} className="beneficio revelar">
                <span className="beneficio-icono">
                  <Icono tipo={item.icono} size={22} />
                </span>
                <h3>{item.titulo}</h3>
                <p>{item.descripcion}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
