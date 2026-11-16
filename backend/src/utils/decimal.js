export function toCents(amount) {
  const str = String(amount).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Valor monetario inválido: ${amount}`);
  }
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [entero, dec = ''] = unsigned.split('.');
  const cents = Number.parseInt(entero, 10) * 100 + Number.parseInt(dec.padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Valor monetario fuera de rango seguro: ${amount}`);
  }
  return negative ? -cents : cents;
}

export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Centavos inválidos: ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const entero = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${entero}.${dec}`;
}

export function multiplyCents(unitAmount, quantity) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`Cantidad inválida: ${quantity}`);
  }
  return toCents(unitAmount) * quantity;
}

export function sumCents(amounts) {
  return amounts.reduce((acc, val) => acc + toCents(val), 0);
}
