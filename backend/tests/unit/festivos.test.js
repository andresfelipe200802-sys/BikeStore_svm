import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcularFechaLimiteRetractoBogota, toBogotaDateParts } from '../../src/utils/festivos.js';

describe('Utilidad festivos.js (5 días hábiles America/Bogota)', () => {
  it('convierte correctamente UTC a fecha local America/Bogota', () => {
    // 2026-11-16T04:59:59Z equivale a 2026-11-15 23:59:59-05:00
    const parts = toBogotaDateParts('2026-11-16T04:59:59.000Z');
    assert.equal(parts.isoDate, '2026-11-15');
  });

  it('calcula 5 días hábiles saltando fines de semana y festivos hasta < dia_6 00:00:00-05:00', () => {
    // Entrega viernes 2026-11-13 (lunes 2026-11-16 es festivo Independencia de Cartagena):
    // Hábiles: 1=mar 17, 2=mié 18, 3=jue 19, 4=vie 20, 5=lun 23 -> vence < mar 24 00:00:00-05:00 (05:00:00Z)
    const holidays = new Set(['2026-11-16']);
    const fechaEntrega = new Date('2026-11-13T16:00:00.000Z');
    const limite = calcularFechaLimiteRetractoBogota(fechaEntrega, holidays, 5);

    assert.equal(limite.toISOString(), '2026-11-24T05:00:00.000Z');
    // 23:59:59-05:00 del día 23 está dentro del plazo (< límite)
    assert.equal(new Date('2026-11-24T04:59:59.000Z').getTime() < limite.getTime(), true);
    // 00:00:00-05:00 del día 24 está fuera de plazo (>= límite)
    assert.equal(new Date('2026-11-24T05:00:00.000Z').getTime() < limite.getTime(), false);
  });
});
