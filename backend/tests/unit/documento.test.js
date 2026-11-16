import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  containsSensitiveCardData,
  escapeLike,
  isValidDocumento,
  normalizeDocumento,
} from '../../src/utils/documento.js';

describe('Utilidad documento.js', () => {
  it('valida sintaxis inicial para CC, TI, CE, PASAPORTE y PPT', () => {
    assert.equal(isValidDocumento('CC', '1020304050'), true);
    assert.equal(isValidDocumento('CC', '12345'), false);
    assert.equal(isValidDocumento('TI', '10001234567'), true);
    assert.equal(isValidDocumento('TI', '123456789'), false);
    assert.equal(isValidDocumento('CE', 'ab123456'), true);
    assert.equal(isValidDocumento('PASAPORTE', '  pa12345z '), true);
    assert.equal(isValidDocumento('PPT', '987654321'), true);
    assert.equal(isValidDocumento('OTRO', '123456'), false);
  });

  it('normaliza mayúsculas y espacios', () => {
    assert.equal(normalizeDocumento('  ab-123c  '), 'AB-123C');
  });

  it('escapa comodines % y _ para ILIKE seguro', () => {
    assert.equal(escapeLike('100%_desc\\x'), '100\\%\\_desc\\\\x');
  });

  it('detecta posible PAN de tarjeta o CVV en texto libre', () => {
    assert.equal(containsSensitiveCardData('Bancolombia Ahorros 4321'), false);
    assert.equal(containsSensitiveCardData('Tarjeta 4532 1234 5678 9012'), true);
    assert.equal(containsSensitiveCardData('Pago cvv: 999'), true);
  });
});
