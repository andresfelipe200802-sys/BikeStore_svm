import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LogoMarcaBS } from './Iconos.jsx';

export function Footer() {
  const { estaAutenticado, esAdmin } = useAuth();

  return (
    <footer className="zona-oscura site-footer">
      <div className="contenedor">
        <div className="footer-columnas">
          <div>
            <Link className="site-logo" to="/">
              <LogoMarcaBS size={32} />
              <span className="site-logo-texto">
                <span className="acento">BIKE</span>STORE
              </span>
            </Link>
            <p style={{ marginTop: '0.85rem' }}>
              Tienda especializada en bicicletas de ruta, montaña, movilidad urbana y equipo de
              protección en Colombia.
            </p>
          </div>

          <div>
            <h2>Tienda</h2>
            <ul className="footer-enlaces">
              <li>
                <Link to="/">Inicio</Link>
              </li>
              <li>
                <Link to="/catalogo">Catálogo completo</Link>
              </li>
              {esAdmin ? (
                <li>
                  <Link to="/admin/productos">Gestión de productos</Link>
                </li>
              ) : (
                <li>
                  <Link to="/carrito">Carrito de compras</Link>
                </li>
              )}
              {!estaAutenticado && (
                <li>
                  <Link to="/ingresar">Ingresar a tu cuenta</Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h2>{esAdmin ? 'Panel operativo' : 'Garantías al comprador'}</h2>
            {esAdmin ? (
              <ul className="footer-enlaces">
                <li>
                  <Link to="/admin">Resumen y reportes</Link>
                </li>
                <li>
                  <Link to="/admin/pedidos">Pedidos</Link>
                </li>
                <li>
                  <Link to="/admin/retractos">Retractos</Link>
                </li>
                <li>
                  <Link to="/perfil">Control de sesión y perfil</Link>
                </li>
              </ul>
            ) : (
              <ul className="footer-enlaces">
                <li>
                  <Link to={estaAutenticado ? '/pedidos' : '/ingresar'}>
                    Reserva garantizada de 15 minutos
                  </Link>
                </li>
                <li>
                  <Link to={estaAutenticado ? '/retractos' : '/ingresar'}>
                    Derecho de retracto (5 días hábiles)
                  </Link>
                </li>
                <li>
                  <Link to={estaAutenticado ? '/perfil' : '/ingresar'}>
                    Control de sesión y perfil
                  </Link>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="footer-legal">
          <p>© 2026 BikeStore · Todos los derechos reservados.</p>
          <p>Precios expresados en pesos colombianos (COP).</p>
        </div>
      </div>
    </footer>
  );
}
