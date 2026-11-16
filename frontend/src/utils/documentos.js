/**
 * Reglas de validación sintáctica inicial para documentos de persona natural en Colombia
 * y detección preventiva de datos sensibles de tarjeta (paridad 1:1 con backend/src/utils/documento.js).
 */

export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'PASAPORTE', 'PPT'];

export const OPCIONES_TIPO_DOCUMENTO = [
  {
    valor: 'CC',
    etiqueta: 'Cédula de Ciudadanía (CC)',
    ayuda: 'Entre 6 y 10 dígitos numéricos.',
  },
  {
    valor: 'TI',
    etiqueta: 'Tarjeta de Identidad (TI)',
    ayuda: 'Entre 10 y 11 dígitos numéricos.',
  },
  {
    valor: 'CE',
    etiqueta: 'Cédula de Extranjería (CE)',
    ayuda: 'Entre 6 y 10 caracteres alfanuméricos.',
  },
  {
    valor: 'PASAPORTE',
    etiqueta: 'Pasaporte',
    ayuda: 'Entre 5 y 20 caracteres alfanuméricos.',
  },
  {
    valor: 'PPT',
    etiqueta: 'Permiso por Protección Temporal (PPT)',
    ayuda: 'Entre 6 y 15 dígitos numéricos.',
  },
];

export const DOC_PATTERNS = {
  CC: /^[0-9]{6,10}$/,
  TI: /^[0-9]{10,11}$/,
  CE: /^[A-Za-z0-9]{6,10}$/,
  PASAPORTE: /^[A-Za-z0-9]{5,20}$/,
  PPT: /^[0-9]{6,15}$/,
};

export function normalizeDocumento(numero) {
  return String(numero || '').trim().toUpperCase();
}

export function isValidDocumento(tipoDocumento, numeroDocumento) {
  const pattern = DOC_PATTERNS[tipoDocumento];
  if (!pattern) return false;
  return pattern.test(normalizeDocumento(numeroDocumento));
}

export function obtenerAyudaDocumento(tipoDocumento) {
  const encontrado = OPCIONES_TIPO_DOCUMENTO.find((op) => op.valor === tipoDocumento);
  return encontrado?.ayuda || 'Ingresa un número de documento válido sin símbolos.';
}

/**
 * Impide capturar números completos de tarjeta (PAN 13–19 dígitos) o CVV en campos de reembolso.
 */
export function containsSensitiveCardData(texto) {
  if (!texto) return false;
  const soloDigitos = String(texto).replace(/[\s-]/g, '');
  if (/[0-9]{13,19}/.test(soloDigitos)) return true;
  if (/\bcvv\s*[:=]?\s*[0-9]{3,4}\b/i.test(String(texto))) return true;
  return false;
}

export function esUrlHttpValida(url) {
  const limpia = String(url || '').trim();
  if (!limpia || limpia.length > 500) return false;
  return /^https?:\/\//i.test(limpia);
}
