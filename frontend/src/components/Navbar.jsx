import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { Icono } from './Iconos.jsx';

/**
 * Barra de navegación adaptable con medición por ResizeObserver (sin breakpoint rígido),
 * popover nativo en diseño compacto y marca aria-current="page".
 */
export function Navbar({ onNotificar }) {
  const { estaAutenticado, esCliente, esAdmin, usuario, cantidadCarrito, cerrarSesion } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const headerRef = useRef(null);
  const innerRef = useRef(null);
  const menuRef = useRef(null);
  const ultimoAnchoColapsadoRef = useRef(0);
  const esAmplioRef = useRef(true);

  const [esAmplio, setEsAmplio] = useState(true);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // Cierra el popover móvil al cambiar de ruta
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || esAmplioRef.current) return;
    try {
      if (menu.matches(':popover-open') && typeof menu.hidePopover === 'function') {
        menu.hidePopover();
      }
    } catch {
      // Sin popover abierto
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    const menu = menuRef.current;
    if (!header || !inner || !menu) return undefined;

    let rafId = 0;

    const aplicarModo = (amplio) => {
      esAmplioRef.current = amplio;
      setEsAmplio(amplio);
      if (amplio) {
        header.classList.add('is-wide');
        menu.removeAttribute('popover');
      } else {
        header.classList.remove('is-wide');
        menu.setAttribute('popover', 'auto');
      }
    };

    const medir = (forzarMedicion = false) => {
      const anchoHeader = header.clientWidth;
      if (!esAmplioRef.current && !forzarMedicion && anchoHeader <= ultimoAnchoColapsadoRef.current) {
        return;
      }

      let estabaAbierto = false;
      try {
        estabaAbierto = !esAmplioRef.current && menu.matches(':popover-open');
      } catch {
        estabaAbierto = false;
      }

      header.classList.add('is-measuring');
      header.classList.add('is-wide');
      menu.removeAttribute('popover');

      const cabeEnLinea = inner.scrollWidth <= inner.clientWidth + 1;

      if (cabeEnLinea) {
        ultimoAnchoColapsadoRef.current = 0;
        aplicarModo(true);
      } else {
        ultimoAnchoColapsadoRef.current = anchoHeader;
        aplicarModo(false);
        if (estabaAbierto && typeof menu.showPopover === 'function') {
          try {
            menu.showPopover();
          } catch {
            // Ignora si el elemento aún no está conectado
          }
        }
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        header.classList.remove('is-measuring');
      });
    };

    medir(true);

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => medir(false));
    observer.observe(header);
    observer.observe(menu);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [estaAutenticado, esCliente, esAdmin, cantidadCarrito]);

  const manejarConfirmarSalida = async () => {
    setSaliendo(true);
    await cerrarSesion();
    setSaliendo(false);
    setConfirmarSalida(false);
    onNotificar?.('info', 'Sesión cerrada correctamente.');
    navigate('/');
  };

  return (
    <>
      <header ref={headerRef} className={`site-header${esAmplio ? ' is-wide' : ''}`}>
        <div ref={innerRef} className="header-inner">
          <Link className="site-logo" to="/">
            <Icono tipo="bicicleta" size={24} />
            <span>
              Bike<span className="acento">Store</span>
            </span>
          </Link>

          <nav className="site-nav" aria-label="Navegación principal">
            <button
              className="menu-button"
              type="button"
              popoverTarget="site-menu"
              popoverTargetAction="toggle"
              aria-controls="site-menu"
            >
              <Icono tipo="menu" size={18} />
              <span>Menú</span>
            </button>

            <ul ref={menuRef} id="site-menu" className="site-menu">
              <li>
                <NavLink to="/" end>
                  Inicio
                </NavLink>
              </li>
              <li>
                <NavLink to="/catalogo">Catálogo</NavLink>
              </li>

              {!esAdmin && (
                <li>
                  <NavLink to="/carrito">
                    <Icono tipo="carrito" size={16} />
                    <span>Carrito</span>
                    {cantidadCarrito > 0 && (
                      <span className="insignia-carrito tabular" aria-label={`${cantidadCarrito} artículos en carrito`}>
                        {cantidadCarrito}
                      </span>
                    )}
                  </NavLink>
                </li>
              )}

              {estaAutenticado && esCliente && (
                <>
                  <li>
                    <NavLink to="/pedidos">Mis pedidos</NavLink>
                  </li>
                  <li>
                    <NavLink to="/retractos">Retractos</NavLink>
                  </li>
                </>
              )}

              {estaAutenticado && esAdmin && (
                <li>
                  <NavLink to="/admin">Panel Admin</NavLink>
                </li>
              )}

              {estaAutenticado ? (
                <>
                  <li className="menu-separado">
                    <NavLink to="/perfil">
                      {usuario?.nombre ? `Cuenta (${usuario.nombre})` : 'Mi perfil'}
                    </NavLink>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="menu-accion"
                      onClick={() => setConfirmarSalida(true)}
                    >
                      Cerrar sesión
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="menu-separado">
                    <NavLink to="/ingresar">Ingresar</NavLink>
                  </li>
                  <li>
                    <NavLink to="/registro">Crear cuenta</NavLink>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </header>

      <ConfirmDialog
        abierto={confirmarSalida}
        titulo="¿Cerrar sesión en BikeStore?"
        mensaje="Se invalidará tu sesión actual en este navegador y deberás volver a ingresar para continuar compras o gestión."
        etiquetaConfirmar="Sí, cerrar sesión"
        etiquetaCancelar="Seguir conectado"
        varianteDestructiva
        ocupado={saliendo}
        onConfirmar={manejarConfirmarSalida}
        onCancelar={() => setConfirmarSalida(false)}
      />
    </>
  );
}
