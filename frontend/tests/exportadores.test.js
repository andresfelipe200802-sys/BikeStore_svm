import { describe, expect, it } from 'vitest';
import {
  ENCABEZADOS_VENTAS,
  construirFilasReporteVentas,
  construirHojasExcel,
  construirModeloPdf,
  construirResumenKpis,
} from '../src/utils/exportadores.js';

const RESUMEN_MUESTRA = {
  periodo: {
    desde: '2026-10-15',
    hasta: '2026-11-15',
    zona_horaria: 'America/Bogota',
    id_categoria: null,
  },
  cantidad_pedidos: 2,
  ventas_brutas_aprobadas: '4500000.00',
  reembolsos_efectivos: '500000.00',
  ventas_netas: '4000000.00',
  pendiente_por_reembolsar: '350000.00',
  productos_mas_vendidos: [
    { id_producto: 7, nombre: 'Bicicleta Ruta Aero 105', unidades_netas: 2 },
  ],
};

const VENTAS_MUESTRA = [
  {
    id_pedido: 101,
    fecha_pago_bogota: '2026-11-10T15:30:00.000Z',
    cliente: 'María Gómez',
    cliente_correo: 'maria@example.com',
    estado_pedido: 'ENTREGADO',
    metodo_pago: 'TARJETA',
    estado_pago: 'APROBADO',
    estado_reembolso_cancelacion: 'NO_APLICA',
    monto_bruto: '4000000.00',
    reembolso_efectivo: '500000.00',
    monto_neto: '3500000.00',
  },
];

describe('exportadores (transformadores tabulares netos en español)', () => {
  it('transforma KPIs netos y filas de ventas usando columnas exactas de Etapa 1', () => {
    const kpis = construirResumenKpis(RESUMEN_MUESTRA);
    expect(kpis.map((k) => k.indicador)).toEqual([
      'Periodo consultado',
      'Pedidos aprobados en el periodo',
      'Ventas brutas aprobadas',
      'Reembolsos efectivos aplicados',
      'Ventas netas reales',
      'Saldo pendiente por reembolsar',
    ]);
    expect(kpis[4].montoNumerico).toBe(4000000);
    expect(kpis[4].valor).toContain('4.000.000');

    const filas = construirFilasReporteVentas(VENTAS_MUESTRA);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      id_pedido: '#101',
      cliente: 'María Gómez',
      estado_pedido: 'Entregado',
      metodo_pago: 'Tarjeta',
      estado_pago: 'Pago aprobado',
      estado_reembolso_cancelacion: 'No aplica',
      monto_bruto: 4000000,
      reembolso_efectivo: 500000,
      monto_neto: 3500000,
    });
  });

  it('arma hojas Excel válidas con write-excel-file v4 (incluyendo textColor y 0 filas)', () => {
    const hojas = construirHojasExcel({ resumen: RESUMEN_MUESTRA, ventas: VENTAS_MUESTRA });
    expect(hojas).toHaveLength(2);
    expect(hojas[0].sheet).toBe('Resumen neto');
    expect(hojas[1].sheet).toBe('Detalle de ventas');
    expect(hojas[1].data[0]).toHaveLength(ENCABEZADOS_VENTAS.length);
    expect(hojas[1].data[0][0].textColor).toBe('#F5F5F2');
    expect(hojas[1].data[1][10].value).toBe(3500000);

    const hojasVacias = construirHojasExcel({
      resumen: { ...RESUMEN_MUESTRA, cantidad_pedidos: 0, productos_mas_vendidos: [] },
      ventas: [],
    });
    expect(hojasVacias[1].data).toHaveLength(2);
    expect(hojasVacias[1].data[1][0].value).toContain('Sin ventas registradas');
  });

  it('genera modelo PDF en español sazonado a caracteres Latin-1 seguros', () => {
    const resumenConEmojis = {
      ...RESUMEN_MUESTRA,
      productos_mas_vendidos: [{ id_producto: 3, nombre: 'Casco Aero — Edición 🚀', unidades_netas: 1 }],
    };

    const pdf = construirModeloPdf({ resumen: resumenConEmojis, ventas: [] });
    expect(pdf.titulo).toBe('BikeStore - Reporte de Ventas Netas');
    expect(pdf.tablaTop.body[0][1]).toBe('#3 - Casco Aero - Edición ');
    expect(pdf.tablaVentas.head[0]).toHaveLength(ENCABEZADOS_VENTAS.length);
    expect(pdf.tablaVentas.body[0][0]).toContain('Sin ventas registradas');
  });
});
