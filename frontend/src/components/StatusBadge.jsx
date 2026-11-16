import { obtenerMetaEstado } from '../utils/formato.js';
import { Icono } from './Iconos.jsx';

const ICONO_POR_TONO = {
  exito: 'exito',
  alerta: 'alerta',
  error: 'error',
  info: 'info',
  agotado: 'error',
  neutro: 'info',
};

/**
 * Insignia de estado accesible: siempre combina icono + etiqueta textual.
 */
export function StatusBadge({ codigo, contexto = '', etiquetaPersonalizada }) {
  const meta = obtenerMetaEstado(codigo, contexto);
  const tono = meta.tono || 'neutro';
  const icono = ICONO_POR_TONO[tono] || 'info';

  return (
    <span className={`insignia insignia-${tono}`}>
      <Icono tipo={icono} size={14} />
      <span>{etiquetaPersonalizada || meta.etiqueta}</span>
    </span>
  );
}
