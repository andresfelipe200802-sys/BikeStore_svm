import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTituloPagina } from '../hooks/useTituloPagina.js';

function AccesoRestringido({ rol }) {
  useTituloPagina('Acceso restringido', {
    descripcion: 'No tienes permisos para acceder a esta sección en BikeStore.',
    noIndex: true,
  });

  return (
    <section className="contenedor pagina-estado">
      <div className="pagina-estado-contenido">
        <p className="pagina-estado-codigo">403</p>
        <h1>Acceso restringido</h1>
        <p>Tu rol actual ({rol}) no tiene permisos para abrir esta sección.</p>
        <div className="pagina-estado-acciones">
          <Link className="btn btn-primario" to={rol === 'ADMIN' ? '/admin' : '/catalogo'}>
            Ir a mi espacio principal
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Guardia por lista de roles permitidos (ej. ['CLIENTE'], ['ADMIN'] o ['CLIENTE', 'ADMIN']).
 */
export function ProtectedRoute({ roles = [], children }) {
  const { estaAutenticado, usuario, cargandoSesion } = useAuth();
  const location = useLocation();

  if (cargandoSesion) {
    return (
      <section className="contenedor texto-estado" aria-live="polite">
        <p>Verificando sesión en BikeStore...</p>
      </section>
    );
  }

  if (!estaAutenticado) {
    return <Navigate to="/ingresar" replace state={{ from: location }} />;
  }

  if (roles.length > 0 && !roles.includes(usuario?.rol)) {
    return <AccesoRestringido rol={usuario?.rol} />;
  }

  return children;
}
