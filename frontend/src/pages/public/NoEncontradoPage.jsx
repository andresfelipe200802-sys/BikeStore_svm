import { Link } from 'react-router-dom';

export function NoEncontradoPage() {
  return (
    <section className="contenedor pagina-estado">
      <div className="pagina-estado-contenido">
        <p className="pagina-estado-codigo">404</p>
        <h1>Página no encontrada</h1>
        <p>
          La ruta que intentaste abrir no existe en BikeStore o fue movida. Puedes regresar al
          inicio o explorar nuestro catálogo actualizado.
        </p>
        <div className="pagina-estado-acciones">
          <Link className="btn btn-primario" to="/">
            Volver al inicio
          </Link>
          <Link className="btn btn-contorno" to="/catalogo">
            Ver catálogo
          </Link>
        </div>
      </div>
    </section>
  );
}
