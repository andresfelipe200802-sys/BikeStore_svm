import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_CANTIDAD_ITEM,
  MAX_ITEMS_CARRITO_VISITANTE,
  VISITOR_CART_KEY,
  actualizarCantidadVisitante,
  agregarItemVisitante,
  construirPayloadFusion,
  contarUnidadesVisitante,
  eliminarItemVisitante,
  leerCarritoVisitante,
  limpiarCarritoVisitante,
} from '../src/utils/visitorCart.js';

describe('visitorCart (localStorage schema_version = 1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('inicializa vacío y descarta versiones o JSON corrupto', () => {
    expect(leerCarritoVisitante()).toEqual({ schema_version: 1, items: [] });

    localStorage.setItem(VISITOR_CART_KEY, '{json_invalido');
    expect(leerCarritoVisitante()).toEqual({ schema_version: 1, items: [] });

    localStorage.setItem(
      VISITOR_CART_KEY,
      JSON.stringify({ schema_version: 2, items: [{ id_producto: 1, cantidad: 2 }] })
    );
    expect(leerCarritoVisitante()).toEqual({ schema_version: 1, items: [] });
    expect(localStorage.getItem(VISITOR_CART_KEY)).toBeNull();
  });

  it('agrega productos respetando topes de existencias y suma unidades', () => {
    const res1 = agregarItemVisitante(5, 2, { maxExistencias: 3 });
    expect(res1.agregado).toBe(true);
    expect(res1.ajustadoPorTope).toBe(false);
    expect(contarUnidadesVisitante(res1.carrito)).toBe(2);

    const res2 = agregarItemVisitante(5, 4, { maxExistencias: 3 });
    expect(res2.agregado).toBe(true);
    expect(res2.ajustadoPorTope).toBe(true);
    expect(res2.motivo).toBe('AJUSTADO_A_TOPE');
    expect(res2.carrito.items).toEqual([{ id_producto: 5, cantidad: 3 }]);

    const agotado = agregarItemVisitante(9, 1, { maxExistencias: 0 });
    expect(agotado.agregado).toBe(false);
    expect(agotado.motivo).toBe('SIN_EXISTENCIAS');
  });

  it('impone el tope máximo de 100 artículos distintos y 1000 unidades por ítem', () => {
    for (let id = 1; id <= MAX_ITEMS_CARRITO_VISITANTE; id += 1) {
      const r = agregarItemVisitante(id, 1);
      expect(r.agregado).toBe(true);
    }

    const extra = agregarItemVisitante(999, 1);
    expect(extra.agregado).toBe(false);
    expect(extra.motivo).toBe('TOPE_ARTICULOS_CARRITO');
    expect(extra.carrito.items).toHaveLength(MAX_ITEMS_CARRITO_VISITANTE);

    const topeQty = actualizarCantidadVisitante(1, 5000);
    expect(topeQty.items.find((i) => i.id_producto === 1)?.cantidad).toBe(MAX_CANTIDAD_ITEM);
  });

  it('elimina ítems cuando la cantidad cae a 0, limpia y construye payload estricto de fusión', () => {
    agregarItemVisitante(10, 2);
    agregarItemVisitante(20, 1);

    const trasCero = actualizarCantidadVisitante(20, 0);
    expect(trasCero.items).toEqual([{ id_producto: 10, cantidad: 2 }]);

    // Inyecta propiedades visuales no aceptadas por Zod .strict() para probar saneamiento
    localStorage.setItem(
      VISITOR_CART_KEY,
      JSON.stringify({
        schema_version: 1,
        items: [{ id_producto: 10, cantidad: 2, nombre: 'Casco', precio: '180000' }],
      })
    );

    expect(construirPayloadFusion()).toEqual({
      schema_version: 1,
      items: [{ id_producto: 10, cantidad: 2 }],
    });

    eliminarItemVisitante(10);
    expect(leerCarritoVisitante().items).toEqual([]);

    agregarItemVisitante(12, 3);
    limpiarCarritoVisitante();
    expect(localStorage.getItem(VISITOR_CART_KEY)).toBeNull();
  });
});
