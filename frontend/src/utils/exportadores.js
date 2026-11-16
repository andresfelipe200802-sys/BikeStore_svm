import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import writeExcelFile from 'write-excel-file/browser';
import {
  formatearCOP,
  formatearFechaHoraBogota,
  obtenerMetaEstado,
  sanitizarTextoLatin1,
} from './formato.js';

/**
 * Exportación de reportes netos (Excel .xlsx y PDF .pdf) 100 % en español.
 * Los constructores tabulares están desacoplados de la descarga del navegador
 * para permitir pruebas unitarias deterministas bajo Vitest / jsdom.
 */

export const ENCABEZADOS_VENTAS = [
  'Pedido',
  'Fecha pago (Bogotá)',
  'Cliente',
  'Correo',
  'Estado pedido',
  'Método pago',
  'Estado pago',
  'Reembolso cancelación',
  'Bruto (COP)',
  'Reembolso efectivo (COP)',
  'Neto (COP)',
];

function etiquetaPeriodo(resumen) {
  const p = resumen?.periodo;
  if (!p?.desde || !p?.hasta) return 'Periodo no especificado';
  const catTexto = p.id_categoria ? ` | Categoría #${p.id_categoria}` : ' | Todas las categorías';
  return `${p.desde} a ${p.hasta} (${p.zona_horaria || 'America/Bogota'})${catTexto}`;
}

export function construirResumenKpis(resumen = {}) {
  return [
    { indicador: 'Periodo consultado', valor: etiquetaPeriodo(resumen), montoNumerico: null },
    {
      indicador: 'Pedidos aprobados en el periodo',
      valor: String(Number(resumen.cantidad_pedidos || 0)),
      montoNumerico: Number(resumen.cantidad_pedidos || 0),
    },
    {
      indicador: 'Ventas brutas aprobadas',
      valor: formatearCOP(resumen.ventas_brutas_aprobadas || 0),
      montoNumerico: Number(resumen.ventas_brutas_aprobadas || 0),
    },
    {
      indicador: 'Reembolsos efectivos aplicados',
      valor: formatearCOP(resumen.reembolsos_efectivos || 0),
      montoNumerico: Number(resumen.reembolsos_efectivos || 0),
    },
    {
      indicador: 'Ventas netas reales',
      valor: formatearCOP(resumen.ventas_netas || 0),
      montoNumerico: Number(resumen.ventas_netas || 0),
    },
    {
      indicador: 'Saldo pendiente por reembolsar',
      valor: formatearCOP(resumen.pendiente_por_reembolsar || 0),
      montoNumerico: Number(resumen.pendiente_por_reembolsar || 0),
    },
  ];
}

export function construirFilasTopProductos(resumen = {}) {
  const lista = Array.isArray(resumen?.productos_mas_vendidos)
    ? resumen.productos_mas_vendidos
    : [];
  return lista.map((prod, idx) => ({
    posicion: idx + 1,
    id_producto: Number(prod.id_producto),
    nombre: String(prod.nombre || ''),
    unidades_netas: Number(prod.unidades_netas || 0),
  }));
}

export function construirFilasReporteVentas(ventas = []) {
  const lista = Array.isArray(ventas) ? ventas : [];
  return lista.map((fila) => {
    const bruto = Number(fila.monto_bruto || 0);
    const reembolso = Number(fila.reembolso_efectivo || 0);
    const neto = Number(fila.monto_neto ?? bruto - reembolso);

    return {
      id_pedido: `#${fila.id_pedido}`,
      fecha_pago_bogota: formatearFechaHoraBogota(fila.fecha_pago_bogota),
      cliente: String(fila.cliente || ''),
      cliente_correo: String(fila.cliente_correo || ''),
      estado_pedido: obtenerMetaEstado(fila.estado_pedido).etiqueta,
      metodo_pago: obtenerMetaEstado(fila.metodo_pago).etiqueta,
      estado_pago: obtenerMetaEstado(fila.estado_pago).etiqueta,
      estado_reembolso_cancelacion: obtenerMetaEstado(fila.estado_reembolso_cancelacion).etiqueta,
      monto_bruto: bruto,
      monto_bruto_texto: formatearCOP(bruto),
      reembolso_efectivo: reembolso,
      reembolso_efectivo_texto: formatearCOP(reembolso),
      monto_neto: neto,
      monto_neto_texto: formatearCOP(neto),
    };
  });
}

function celdaEncabezado(valor) {
  return {
    value: String(valor),
    type: String,
    fontWeight: 'bold',
    backgroundColor: '#141414',
    textColor: '#F5F5F2',
  };
}

export function construirHojasExcel({ resumen = {}, ventas = [] } = {}) {
  const kpis = construirResumenKpis(resumen);
  const topProductos = construirFilasTopProductos(resumen);
  const filasVentas = construirFilasReporteVentas(ventas);

  const sheetResumenData = [
    [
      { value: 'BikeStore - Reporte Ejecutivo de Ventas Netas', type: String, fontWeight: 'bold' },
      null,
      null,
    ],
    [],
    [celdaEncabezado('Indicador'), celdaEncabezado('Valor'), celdaEncabezado('Valor numérico')],
    ...kpis.map((item) => [
      { value: item.indicador, type: String },
      { value: item.valor, type: String },
      item.montoNumerico === null
        ? null
        : {
            value: item.montoNumerico,
            type: Number,
            format: item.indicador.includes('Pedidos') ? '#,##0' : '$#,##0',
          },
    ]),
    [],
    [celdaEncabezado('Top'), celdaEncabezado('Producto más vendido'), celdaEncabezado('Unidades netas')],
    ...(topProductos.length > 0
      ? topProductos.map((p) => [
          { value: p.posicion, type: Number },
          { value: `#${p.id_producto} - ${p.nombre}`, type: String },
          { value: p.unidades_netas, type: Number, format: '#,##0' },
        ])
      : [[null, { value: 'Sin productos vendidos en este periodo.', type: String }, { value: 0, type: Number }]]),
  ];

  const sheetVentasData = [
    ENCABEZADOS_VENTAS.map((col) => celdaEncabezado(col)),
    ...(filasVentas.length > 0
      ? filasVentas.map((f) => [
          { value: f.id_pedido, type: String },
          { value: f.fecha_pago_bogota, type: String },
          { value: f.cliente, type: String },
          { value: f.cliente_correo, type: String },
          { value: f.estado_pedido, type: String },
          { value: f.metodo_pago, type: String },
          { value: f.estado_pago, type: String },
          { value: f.estado_reembolso_cancelacion, type: String },
          { value: f.monto_bruto, type: Number, format: '$#,##0' },
          { value: f.reembolso_efectivo, type: Number, format: '$#,##0' },
          { value: f.monto_neto, type: Number, format: '$#,##0' },
        ])
      : [
          [
            { value: 'Sin ventas registradas en el rango seleccionado.', type: String },
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            { value: 0, type: Number, format: '$#,##0' },
            { value: 0, type: Number, format: '$#,##0' },
            { value: 0, type: Number, format: '$#,##0' },
          ],
        ]),
  ];

  return [
    {
      sheet: 'Resumen neto',
      data: sheetResumenData,
      columns: [{ width: 34 }, { width: 42 }, { width: 20 }],
    },
    {
      sheet: 'Detalle de ventas',
      orientation: 'landscape',
      data: sheetVentasData,
      columns: [
        { width: 12 },
        { width: 22 },
        { width: 24 },
        { width: 28 },
        { width: 18 },
        { width: 16 },
        { width: 16 },
        { width: 22 },
        { width: 18 },
        { width: 22 },
        { width: 18 },
      ],
    },
  ];
}

export function construirModeloPdf({ resumen = {}, ventas = [] } = {}) {
  const kpis = construirResumenKpis(resumen);
  const topProductos = construirFilasTopProductos(resumen);
  const filasVentas = construirFilasReporteVentas(ventas);

  return {
    titulo: sanitizarTextoLatin1('BikeStore - Reporte de Ventas Netas'),
    subtitulo: sanitizarTextoLatin1(etiquetaPeriodo(resumen)),
    tablaResumen: {
      head: [[sanitizarTextoLatin1('Indicador'), sanitizarTextoLatin1('Resultado')]],
      body: kpis.map((k) => [sanitizarTextoLatin1(k.indicador), sanitizarTextoLatin1(k.valor)]),
    },
    tablaTop: {
      head: [[sanitizarTextoLatin1('Top'), sanitizarTextoLatin1('Producto'), sanitizarTextoLatin1('Unidades netas')]],
      body:
        topProductos.length > 0
          ? topProductos.map((p) => [
              String(p.posicion),
              sanitizarTextoLatin1(`#${p.id_producto} - ${p.nombre}`),
              String(p.unidades_netas),
            ])
          : [['-', sanitizarTextoLatin1('Sin productos vendidos en este periodo.'), '0']],
    },
    tablaVentas: {
      head: [ENCABEZADOS_VENTAS.map((h) => sanitizarTextoLatin1(h))],
      body:
        filasVentas.length > 0
          ? filasVentas.map((f) => [
              sanitizarTextoLatin1(f.id_pedido),
              sanitizarTextoLatin1(f.fecha_pago_bogota),
              sanitizarTextoLatin1(f.cliente),
              sanitizarTextoLatin1(f.cliente_correo),
              sanitizarTextoLatin1(f.estado_pedido),
              sanitizarTextoLatin1(f.metodo_pago),
              sanitizarTextoLatin1(f.estado_pago),
              sanitizarTextoLatin1(f.estado_reembolso_cancelacion),
              sanitizarTextoLatin1(f.monto_bruto_texto),
              sanitizarTextoLatin1(f.reembolso_efectivo_texto),
              sanitizarTextoLatin1(f.monto_neto_texto),
            ])
          : [
              [
                sanitizarTextoLatin1('Sin ventas registradas en el periodo.'),
                '-',
                '-',
                '-',
                '-',
                '-',
                '-',
                '-',
                '$ 0',
                '$ 0',
                '$ 0',
              ],
            ],
    },
  };
}

function construirNombreArchivo(resumen, extension) {
  const desde = resumen?.periodo?.desde || 'inicio';
  const hasta = resumen?.periodo?.hasta || 'fin';
  return `bikestore-ventas-netas-${desde}-a-${hasta}.${extension}`;
}

export async function exportarReporteExcel({ resumen, ventas, nombreArchivo } = {}) {
  const hojas = construirHojasExcel({ resumen, ventas });
  const archivo = nombreArchivo || construirNombreArchivo(resumen, 'xlsx');
  await writeExcelFile(hojas).toFile(archivo);
  return archivo;
}

export function exportarReportePdf({ resumen, ventas, nombreArchivo } = {}) {
  const modelo = construirModeloPdf({ resumen, ventas });
  const archivo = nombreArchivo || construirNombreArchivo(resumen, 'pdf');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(modelo.titulo, 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(modelo.subtitulo, 40, 60);

  autoTable(doc, {
    startY: 74,
    head: modelo.tablaResumen.head,
    body: modelo.tablaResumen.body,
    styles: { font: 'helvetica', fontSize: 9 },
    headStyles: { fillColor: [20, 20, 20], textColor: [245, 245, 242] },
    alternateRowStyles: { fillColor: [244, 245, 246] },
  });

  const yTrasResumen = (doc.lastAutoTable?.finalY || 180) + 18;
  autoTable(doc, {
    startY: yTrasResumen,
    head: modelo.tablaTop.head,
    body: modelo.tablaTop.body,
    styles: { font: 'helvetica', fontSize: 9 },
    headStyles: { fillColor: [31, 33, 36], textColor: [184, 255, 103] },
    alternateRowStyles: { fillColor: [244, 245, 246] },
  });

  const yTrasTop = (doc.lastAutoTable?.finalY || yTrasResumen + 60) + 18;
  autoTable(doc, {
    startY: yTrasTop,
    head: modelo.tablaVentas.head,
    body: modelo.tablaVentas.body,
    styles: { font: 'helvetica', fontSize: 8 },
    headStyles: { fillColor: [20, 20, 20], textColor: [245, 245, 242] },
    alternateRowStyles: { fillColor: [244, 245, 246] },
  });

  doc.save(archivo);
  return archivo;
}
