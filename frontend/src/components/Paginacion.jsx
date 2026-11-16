export function Paginacion({ meta, onCambiarPagina }) {
  if (!meta || meta.total_paginas <= 1) return null;

  const paginaActual = Number(meta.page || 1);
  const totalPaginas = Number(meta.total_paginas || 1);

  return (
    <nav className="paginacion" aria-label="Paginación de resultados">
      <p className="campo-ayuda tabular" style={{ margin: 0 }}>
        Página {paginaActual} de {totalPaginas} ({meta.total} registros en total)
      </p>
      <div className="paginacion-controles">
        <button
          type="button"
          className="btn btn-contorno btn-pequeno"
          disabled={paginaActual <= 1}
          onClick={() => onCambiarPagina(paginaActual - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn btn-contorno btn-pequeno"
          disabled={paginaActual >= totalPaginas}
          onClick={() => onCambiarPagina(paginaActual + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
