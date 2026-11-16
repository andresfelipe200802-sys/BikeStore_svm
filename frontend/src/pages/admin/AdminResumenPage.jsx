import { useCallback, useEffect, useId, useState } from 'react';
import { adminApi } from '../../api/client.js';
import { AdminNav } from '../../components/AdminNav.jsx';
import { Icono } from '../../components/Iconos.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useTituloPagina } from '../../hooks/useTituloPagina.js';
import {
  formatearCOP,
  formatearFechaHoraBogota,
  obtenerRangoReportesPorDefecto,
} from '../../utils/formato.js';

export function AdminResumenPage({ onNotificar }) {
  useTituloPagina('Panel Admin - Reportes netos');
  const rangoInicial = obtenerRangoReportesPorDefecto(30);
  const topCaptionId = useId();
  const ventasCaptionId = useId();

  const [filtros, setFiltros] = useState({
    desde: rangoInicial.desde,
    hasta: rangoInicial.hasta,
    id_categoria: '',
  });
  const [categorias, setCategorias] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');

  const consultar = useCallback(async (params) => {
    setCargando(true);
    setError('');
    try {
      const [resResp, venResp] = await Promise.all([
        adminApi.obtenerResumenReportes(params),
        adminApi.obtenerReporteVentas(params),
      ]);
      setResumen(resResp.datos);
      setVentas(venResp.datos || []);
    } catch (err) {
      setError(err?.mensaje || 'No pudimos consultar el reporte neto.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    adminApi
      .listarCategorias()
      .then((r) => setCategorias(r?.datos || []))
      .catch(() => {});
    consultar({
      desde: rangoInicial.desde,
      hasta: rangoInicial.hasta,
    });
  }, [consultar, rangoInicial.desde, rangoInicial.hasta]);

  const manejarFiltrar = (ev) => {
    ev.preventDefault();
    consultar(filtros);
  };

  const descargarExcel = async () => {
    if (!resumen) return;
    setExportando(true);
    try {
      const { exportarReporteExcel } = await import('../../utils/exportadores.js');
      const nombre = await exportarReporteExcel({ resumen, ventas });
      onNotificar?.('exito', `Reporte Excel descargado: ${nombre}`);
    } catch {
      onNotificar?.('error', 'No fue posible generar el archivo Excel.');
    } finally {
      setExportando(false);
    }
  };

  const descargarPdf = async () => {
    if (!resumen) return;
    setExportando(true);
    try {
      const { exportarReportePdf } = await import('../../utils/exportadores.js');
      const nombre = exportarReportePdf({ resumen, ventas });
      onNotificar?.('exito', `Reporte PDF descargado: ${nombre}`);
    } catch {
      onNotificar?.('error', 'No fue posible generar el archivo PDF.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <AdminNav />
      <section className="contenedor seccion">
        <div className="seccion-encabezado">
          <div>
            <p className="antetitulo">Analítica operativa · America/Bogota</p>
            <h1 className="titulo-seccion">Tablero de ventas netas</h1>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
            <button
              type="button"
              className="btn btn-primario"
              disabled={cargando || !resumen || exportando}
              onClick={descargarExcel}
            >
              Exportar Excel (.xlsx)
            </button>
            <button
              type="button"
              className="btn btn-oscuro"
              disabled={cargando || !resumen || exportando}
              onClick={descargarPdf}
            >
              Exportar PDF (.pdf)
            </button>
          </div>
        </div>

        <search>
          <form className="filtros-barra" onSubmit={manejarFiltrar}>
            <div className="campo">
              <label htmlFor="rep-desde">Desde (máx. 90 días)</label>
              <input
                id="rep-desde"
                type="date"
                className="campo-control"
                value={filtros.desde}
                onChange={(ev) => setFiltros((p) => ({ ...p, desde: ev.target.value }))}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="rep-hasta">Hasta</label>
              <input
                id="rep-hasta"
                type="date"
                className="campo-control"
                value={filtros.hasta}
                onChange={(ev) => setFiltros((p) => ({ ...p, hasta: ev.target.value }))}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="rep-cat">Categoría (opcional)</label>
              <select
                id="rep-cat"
                className="campo-control"
                value={filtros.id_categoria}
                onChange={(ev) => setFiltros((p) => ({ ...p, id_categoria: ev.target.value }))}
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c.id_categoria} value={String(c.id_categoria)}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primario" disabled={cargando}>
              {cargando ? 'Consultando...' : 'Consultar rango'}
            </button>
          </form>
        </search>

        {error && (
          <div className="alerta alerta-error" role="alert" style={{ marginBottom: '1.5rem' }}>
            <Icono tipo="error" size={20} />
            <p>{error}</p>
          </div>
        )}

        {resumen && (
          <>
            <div className="kpi-grid">
              <article className="kpi-tarjeta">
                <p>Pedidos aprobados</p>
                <div className="kpi-valor tabular">{resumen.cantidad_pedidos}</div>
              </article>
              <article className="kpi-tarjeta">
                <p>Ventas brutas aprobadas</p>
                <div className="kpi-valor tabular">{formatearCOP(resumen.ventas_brutas_aprobadas)}</div>
              </article>
              <article className="kpi-tarjeta">
                <p>Reembolsos efectivos</p>
                <div className="kpi-valor tabular">{formatearCOP(resumen.reembolsos_efectivos)}</div>
              </article>
              <article className="kpi-tarjeta">
                <p>Ventas netas</p>
                <div className="kpi-valor tabular">{formatearCOP(resumen.ventas_netas)}</div>
              </article>
              <article className="kpi-tarjeta">
                <p>Pendiente por reembolsar</p>
                <div className="kpi-valor tabular">{formatearCOP(resumen.pendiente_por_reembolsar)}</div>
              </article>
            </div>

            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '0.75rem' }}>Productos más vendidos (unidades netas)</h2>
              <div tabIndex={0} role="region" aria-labelledby={topCaptionId} className="table-wrapper">
                <table className="tabla-datos">
                  <caption id={topCaptionId}>Top 10 en el periodo</caption>
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Producto</th>
                      <th scope="col">Unidades netas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resumen.productos_mas_vendidos || []).length === 0 ? (
                      <tr>
                        <td colSpan={3}>Sin ventas registradas en este periodo.</td>
                      </tr>
                    ) : (
                      resumen.productos_mas_vendidos.map((p) => (
                        <tr key={p.id_producto}>
                          <th scope="row" className="tabular">#{p.id_producto}</th>
                          <td data-etiqueta="Producto">{p.nombre}</td>
                          <td data-etiqueta="Unidades netas" className="tabular">{p.unidades_netas}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 style={{ marginBottom: '0.75rem' }}>
                Detalle neto por pedido ({ventas.length} filas)
              </h2>
              <div tabIndex={0} role="region" aria-labelledby={ventasCaptionId} className="table-wrapper">
                <table className="tabla-datos">
                  <caption id={ventasCaptionId}>Transacciones aprobadas y reembolsos asociados</caption>
                  <thead>
                    <tr>
                      <th scope="col">Pedido</th>
                      <th scope="col">Fecha pago (Bogotá)</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Método</th>
                      <th scope="col">Bruto</th>
                      <th scope="col">Reembolso</th>
                      <th scope="col">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.length === 0 ? (
                      <tr>
                        <td colSpan={8}>Sin pedidos aprobados en el rango consultado.</td>
                      </tr>
                    ) : (
                      ventas.map((v) => (
                        <tr key={v.id_pedido}>
                          <th scope="row" className="tabular">#{v.id_pedido}</th>
                          <td data-etiqueta="Fecha pago">{formatearFechaHoraBogota(v.fecha_pago_bogota)}</td>
                          <td data-etiqueta="Cliente">{v.cliente}</td>
                          <td data-etiqueta="Estado"><StatusBadge codigo={v.estado_pedido} /></td>
                          <td data-etiqueta="Método">{v.metodo_pago}</td>
                          <td data-etiqueta="Bruto" className="tabular">{formatearCOP(v.monto_bruto)}</td>
                          <td data-etiqueta="Reembolso" className="tabular">
                            {formatearCOP(v.reembolso_efectivo)}
                          </td>
                          <td data-etiqueta="Neto" className="tabular">
                            <strong>{formatearCOP(v.monto_neto)}</strong>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </>
  );
}
