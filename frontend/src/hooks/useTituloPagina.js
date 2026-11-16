import { useEffect } from 'react';

export function useTituloPagina(titulo) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = titulo ? `${titulo} | BikeStore` : 'BikeStore | Bicicletas y accesorios';
  }, [titulo]);
}
