export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'PASAPORTE', 'PPT'];

// Validación sintáctica inicial por tipo de documento (sin afirmar verificación estatal)
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

export function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

export function containsSensitiveCardData(text) {
  if (!text) return false;
  const digitsOnly = String(text).replace(/[\s-]/g, '');
  if (/[0-9]{13,19}/.test(digitsOnly)) return true;
  if (/\bcvv\s*[:=]?\s*[0-9]{3,4}\b/i.test(String(text))) return true;
  return false;
}
