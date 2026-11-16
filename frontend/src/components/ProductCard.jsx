import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatearCOP } from '../utils/formato.js';
import { Icono, IlustracionBicicletaFallback } from './Iconos.jsx';
import { StatusBadge } from './StatusBadge.jsx';

/**
 * Tarjeta reutilizable de producto (grilla 4:3, fallback SVG, badge y botón "Agotado").
 */
export function ProductCard({ producto, onAgregar, priority = false }) {
  const [errorImagen, setErrorImagen] = useState(false);

  useEffect(() => {
    setErrorImagen(false);
  }, [producto?.imagen_url]);

  if (!producto) return null;

  const existencias = Number(producto.existencias ?? 0);
  const estaAgotado = Boolean(producto.agotado) || existencias <= 0;
  const mostrarImagen = Boolean(producto.imagen_url) && !errorImagen;

  return (
    <article className="tarjeta-producto">
      <div className="tarjeta-media">
        {mostrarImagen ? (
          <img
            src={producto.imagen_url}
            alt={producto.nombre}
            width="400"
            height="300"
            loading={priority ? undefined : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            onError={() => setErrorImagen(true)}
          />
        ) : (
          <div className="tarjeta-sin-imagen" aria-label={`Sin imagen disponible para ${producto.nombre}`}>
            <IlustracionBicicletaFallback />
          </div>
        )}

        {estaAgotado && <StatusBadge codigo="AGOTADO" />}
      </div>

      <div className="tarjeta-cuerpo">
        {producto.categoria_nombre && <p className="tarjeta-etiqueta">{producto.categoria_nombre}</p>}

        <h3 className="tarjeta-titulo">
          <Link to={`/producto/${producto.id_producto}`}>{producto.nombre}</Link>
        </h3>

        <p className="tarjeta-precio">{formatearCOP(producto.precio)}</p>
        <p className="tarjeta-existencias">
          {estaAgotado
            ? 'Sin existencias disponibles'
            : `${existencias} ${existencias === 1 ? 'unidad disponible' : 'unidades disponibles'}`}
        </p>

        <div className="tarjeta-accion">
          <button
            type="button"
            className={`btn btn-bloque ${estaAgotado ? 'btn-contorno' : 'btn-primario'}`}
            disabled={estaAgotado}
            onClick={() => onAgregar?.(producto)}
          >
            {!estaAgotado && <Icono tipo="carrito" size={17} />}
            <span>{estaAgotado ? 'Agotado' : 'Agregar al carrito'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
