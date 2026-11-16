/**
 * Iconos vectoriales decorativos (aria-hidden="true") para acompañar etiquetas textuales.
 */

export function Icono({ tipo, size = 18 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };

  switch (tipo) {
    case 'exito':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.5 11 15l4.5-5" />
        </svg>
      );
    case 'alerta':
      return (
        <svg {...props}>
          <path d="M12 3 2.5 19.5h19L12 3Z" />
          <path d="M12 9v5" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'error':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-6 6M9 9l6 6" />
        </svg>
      );
    case 'info':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'carrito':
      return (
        <svg {...props}>
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
          <path d="M2 3h3l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L21 7H6" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'cerrar':
      return (
        <svg {...props}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      );
    case 'pausa':
      return (
        <svg {...props}>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case 'reproducir':
      return (
        <svg {...props}>
          <polygon points="7 5 19 12 7 19 7 5" fill="currentColor" />
        </svg>
      );
    case 'flecha':
      return (
        <svg {...props}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'escudo':
      return (
        <svg {...props}>
          <path d="M12 3 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'bicicleta':
    default:
      return (
        <svg {...props}>
          <circle cx="6.5" cy="16.5" r="3.5" />
          <circle cx="17.5" cy="16.5" r="3.5" />
          <path d="M6.5 16.5 10 9h4l3.5 7.5M10 9l-1-3h3m1.5 3-3 7.5" />
        </svg>
      );
  }
}

export function IlustracionBicicletaFallback() {
  return (
    <svg
      width="88"
      height="60"
      viewBox="0 0 88 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="22" cy="42" r="12" />
      <circle cx="66" cy="42" r="12" />
      <path d="M22 42 36 20h16l14 22M36 20l-4-8h8M44 42l8-22" />
    </svg>
  );
}
