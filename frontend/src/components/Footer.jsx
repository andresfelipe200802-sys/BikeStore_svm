import { Link } from 'react-router-dom';
import { Icono } from './Iconos.jsx';

export function Footer() {
  return (
    <footer className="zona-oscura site-footer">
      <div className="contenedor">
        <div className="footer-columnas">
          <div>
            <Link className="site-logo" to="/">
              <Icono tipo="bicicleta" size={24} />
              <span>
                Bike<span className="acento">Store</span>
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
              <li>
                <Link to="/carrito">Carrito de compras</Link>
              </li>
              <li>
                <Link to="/ingresar">Ingresar a tu cuenta</Link>
              </li>
            </ul>
          </div>

          <div>
            <h2>Garantías al comprador</h2>
            <ul className="footer-enlaces">
              <li>
                <Link to="/pedidos">Reserva garantizada de 15 minutos</Link>
              </li>
              <li>
                <Link to="/retractos">Derecho de retracto (5 días hábiles)</Link>
              </li>
              <li>
                <Link to="/perfil">Control de sesión y perfil</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-legal">
          <p>© 2026 BikeStore · Todos los derechos reservados.</p>
          <p>Precios mostrados en pesos colombianos (COP) · Zona horaria America/Bogota</p>
        </div>
      </div>
    </footer>
  );
}
