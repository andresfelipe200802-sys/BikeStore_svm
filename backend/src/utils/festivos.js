import { AppError } from '../middlewares/error.middleware.js';

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_HOLIDAYS_PER_YEAR = 12;

export function toBogotaDateParts(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida para America/Bogota: ${dateInput}`);
  }
  const shifted = new Date(date.getTime() + BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(), // 0 = Domingo, 6 = Sábado
    isoDate: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`,
  };
}

function addDaysIso(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function getDayOfWeekFromIso(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/**
 * Calcula el límite exacto (UTC) de 5 días hábiles en America/Bogota:
 * la solicitud procede mientras ahora < (dia_habil_5 + 1 día) 00:00:00-05:00.
 */
export function calcularFechaLimiteRetractoBogota(fechaEntrega, holidaySet, businessDays = 5) {
  const start = toBogotaDateParts(fechaEntrega).isoDate;
  let cursor = start;
  let count = 0;

  while (count < businessDays) {
    cursor = addDaysIso(cursor, 1);
    const dow = getDayOfWeekFromIso(cursor);
    if (dow === 0 || dow === 6) continue;
    if (holidaySet.has(cursor)) continue;
    count += 1;
  }

  // Fin del 5.º día hábil = inicio del día calendario siguiente a las 00:00:00-05:00 (= 05:00:00Z)
  const dayAfter = addDaysIso(cursor, 1);
  const [y, m, d] = dayAfter.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
}

export async function verificarCoberturaAnual(dbClient, refDate = new Date()) {
  const currentYear = toBogotaDateParts(refDate).year;
  const nextYear = currentYear + 1;

  const { rows } = await dbClient.query(
    `SELECT anio, COUNT(*)::INTEGER AS total
     FROM festivo_colombia
     WHERE anio IN ($1, $2)
     GROUP BY anio`,
    [currentYear, nextYear]
  );

  const byYear = new Map(rows.map((r) => [r.anio, r.total]));
  const currentCount = byYear.get(currentYear) || 0;
  const nextCount = byYear.get(nextYear) || 0;

  if (currentCount < MIN_HOLIDAYS_PER_YEAR) {
    throw new Error(
      `Cobertura insuficiente en festivo_colombia para el año ${currentYear} (${currentCount} registros; mínimo ${MIN_HOLIDAYS_PER_YEAR}).`
    );
  }

  const warningNextYear = nextCount < MIN_HOLIDAYS_PER_YEAR
    ? `WARN: festivo_colombia tiene solo ${nextCount} registros para el año ${nextYear}. Agregue el script SQL de festivos antes de fin de año.`
    : null;

  return { currentYear, currentCount, nextYear, nextCount, warningNextYear };
}

export async function obtenerVentanaFestivosRetracto(dbClient, fechaEntrega) {
  const entrega = new Date(fechaEntrega);
  const startYear = toBogotaDateParts(entrega).year;
  const endYear = toBogotaDateParts(new Date(entrega.getTime() + 20 * DAY_MS)).year;

  const years = [];
  for (let y = startYear; y <= endYear; y += 1) years.push(y);

  const { rows } = await dbClient.query(
    `SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha_iso, anio
     FROM festivo_colombia
     WHERE anio = ANY($1::INTEGER[])`,
    [years]
  );

  const counts = new Map();
  const holidaySet = new Set();
  for (const row of rows) {
    holidaySet.add(row.fecha_iso);
    counts.set(row.anio, (counts.get(row.anio) || 0) + 1);
  }

  for (const y of years) {
    if ((counts.get(y) || 0) < MIN_HOLIDAYS_PER_YEAR) {
      throw new AppError(
        500,
        'CALENDARIO_FESTIVOS_INCOMPLETO',
        `El calendario de festivos de Colombia no cubre el año ${y} requerido para calcular el plazo legal.`
      );
    }
  }

  return holidaySet;
}
