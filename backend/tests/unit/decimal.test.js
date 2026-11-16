import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromCents, multiplyCents, sumCents, toCents } from '../../src/utils/decimal.js';

describe('Utilidad decimal.js (aritmética en centavos)', () => {
  it('convierte y suma sin errores de punto flotante binario', () => {
    assert.equal(toCents('0.10') + toCents('0.20'), 30);
    assert.equal(fromCents(toCents('0.1') + toCents('0.2')), '0.30');
    assert.equal(fromCents(multiplyCents('1499999.99', 2)), '2999999.98');
    assert.equal(fromCents(sumCents(['100.50', '49.50', 25])), '175.00');
  });

  it('rechaza formatos monetarios o cantidades inválidas', () => {
    assert.throws(() => toCents('12.345'));
    assert.throws(() => toCents('abc'));
    assert.throws(() => multiplyCents('100.00', -1));
  });
});
