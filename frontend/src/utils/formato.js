/**
 * Utilidades de formato en pesos colombianos (COP), fechas en America/Bogota
 * y diccionarios de estado en español (con tono accesible asociado).
 */

const FORMATEADOR_COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const FORMATEADOR_FECHA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

const FORMATEADOR_FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const FORMATEADOR_BOGOTA_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatearCOP(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '$ 0';
  // Normaliza espacios de no ruptura para coherencia en UI y exportación PDF Latin-1
  return FORMATEADOR_COP.format(numero).replace(/\u00A0/g, ' ');
}

export function sanitizarTextoLatin1(texto) {
  return String(texto ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•|·/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

export function obtenerFechaBogotaISO(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return FORMATEADOR_BOGOTA_ISO.format(new Date());
  return FORMATEADOR_BOGOTA_ISO.format(d);
}

/**
 * Rango inicial de reportes netos en zona America/Bogota (incluye hoy; máximo backend = 90 días).
 */
export function obtenerRangoReportesPorDefecto(dias = 30, referencia = new Date()) {
  const diasValidos = Math.min(90, Math.max(1, Number(dias) || 30));
  const hasta = obtenerFechaBogotaISO(referencia);
  const [anio, mes, dia] = hasta.split('-').map(Number);
  const inicioUtc = new Date(Date.UTC(anio, mes - 1, dia - (diasValidos - 1)));
  const desde = inicioUtc.toISOString().slice(0, 10);
  return { desde, hasta };
}

export function formatearFechaBogota(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return FORMATEADOR_FECHA.format(fecha).replace(/\u00A0/g, ' ');
}

export function formatearFechaHoraBogota(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return FORMATEADOR_FECHA_HORA.format(fecha).replace(/\u00A0/g, ' ');
}

export const METADATOS_ESTADO = {
  // Pedidos
  PENDIENTE: { etiqueta: 'Pendiente de pago', tono: 'alerta' },
  PAGADO: { etiqueta: 'Pagado', tono: 'exito' },
  ENVIADO: { etiqueta: 'Enviado', tono: 'info' },
  ENTREGADO: { etiqueta: 'Entregado', tono: 'exito' },
  CANCELADO: { etiqueta: 'Cancelado', tono: 'error' },

  // Pagos
  APROBADO: { etiqueta: 'Pago aprobado', tono: 'exito' },
  RECHAZADO: { etiqueta: 'Rechazado', tono: 'error' },
  REEMBOLSADO: { etiqueta: 'Reembolsado', tono: 'info' },

  // Reembolso (cancelación o retracto)
  NO_APLICA: { etiqueta: 'No aplica', tono: 'neutro' },
  PENDIENTE_REEMBOLSO: { etiqueta: 'Pendiente de reembolso', tono: 'alerta' },

  // Retracto legal
  SOLICITADO: { etiqueta: 'Solicitado', tono: 'info' },
  APROBADO_RECEPCION: { etiqueta: 'Aprobado para recepción', tono: 'alerta' },
  COMPLETADO: { etiqueta: 'Completado', tono: 'exito' },

  // Inspección física
  BUEN_ESTADO: { etiqueta: 'Buen estado', tono: 'exito' },
  DANADO: { etiqueta: 'Dañado', tono: 'error' },
  PARCIAL: { etiqueta: 'Parcial', tono: 'alerta' },

  // Usuario / Catálogo / Disponibilidad
  ACTIVO: { etiqueta: 'Activo', tono: 'exito' },
  INACTIVO: { etiqueta: 'Inactivo', tono: 'neutro' },
  AGOTADO: { etiqueta: 'Agotado', tono: 'agotado' },
  DISPONIBLE: { etiqueta: 'Disponible', tono: 'exito' },

  // Métodos de pago
  TARJETA: { etiqueta: 'Tarjeta', tono: 'info' },
  PSE: { etiqueta: 'PSE', tono: 'info' },
  TRANSFERENCIA: { etiqueta: 'Transferencia', tono: 'info' },

  // Tipo de retracto y roles
  TOTAL: { etiqueta: 'Retracto total', tono: 'info' },
  PARCIAL_RETRACTO: { etiqueta: 'Retracto parcial', tono: 'neutro' },
  CLIENTE: { etiqueta: 'Cliente', tono: 'info' },
  ADMIN: { etiqueta: 'Administrador', tono: 'exito' },
};

export function obtenerMetaEstado(codigo, contexto = '') {
  if (codigo === 'PARCIAL' && contexto === 'tipo_retracto') {
    return METADATOS_ESTADO.PARCIAL_RETRACTO;
  }
  return METADATOS_ESTADO[codigo] || {
    etiqueta: String(codigo || 'Desconocido'),
    tono: 'neutro',
  };
}
