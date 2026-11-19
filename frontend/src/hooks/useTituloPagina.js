import { useEffect } from 'react';

const TITULO_BASE = 'BikeStore | Bicicletas y accesorios';
const DESCRIPCION_BASE =
  'BikeStore: tienda en línea de bicicletas, cascos, repuestos y accesorios en Colombia. Precisión mecánica y compra transparente.';

function upsertMeta(selector, attrs, content) {
  if (typeof document === 'undefined' || !document.head) return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    for (const [clave, valor] of Object.entries(attrs)) {
      el.setAttribute(clave, valor);
    }
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Actualiza título, meta description, Open Graph y directiva robots (noindex en rutas privadas).
 */
export function useTituloPagina(titulo, opciones = {}) {
  const { descripcion = DESCRIPCION_BASE, noIndex = false } = opciones;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const tituloCompleto = titulo ? `${titulo} | BikeStore` : TITULO_BASE;
    const descFinal = String(descripcion || DESCRIPCION_BASE).trim() || DESCRIPCION_BASE;
    const robots = noIndex ? 'noindex, nofollow' : 'index, follow';

    document.title = tituloCompleto;
    upsertMeta('meta[name="description"]', { name: 'description' }, descFinal);
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, tituloCompleto);
    upsertMeta('meta[property="og:description"]', { property: 'og:description' }, descFinal);
    upsertMeta('meta[name="robots"]', { name: 'robots' }, robots);
  }, [titulo, descripcion, noIndex]);
}
