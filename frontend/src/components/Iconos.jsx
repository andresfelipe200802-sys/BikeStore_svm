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

export function LogoMarcaBS({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Arco superior dentado de plato/cadena con perforaciones de anclaje */}
      <path
        fill="#B8FF67"
        fillRule="evenodd"
        d="M17.91 17.11 L15.40 13.31 L17.88 11.37 L20.96 14.73 L22.25 13.97 L20.81 9.65 L23.70 8.42 L25.80 12.46 L27.25 12.06 L26.97 7.51 L30.08 7.07 L31.07 11.52 L32.93 11.52 L33.92 7.07 L37.03 7.51 L36.75 12.06 L38.20 12.46 L40.30 8.42 L43.19 9.65 L41.75 13.97 L43.04 14.73 L46.12 11.37 L48.60 13.31 L46.09 17.11 L43.0 20.5 A14.5 14.5 0 0 0 21.0 20.5 Z M26.15 16.23 A1.5 1.5 0 1 0 23.15 16.23 A1.5 1.5 0 1 0 26.15 16.23 Z M33.6 14.60 A1.6 1.6 0 1 0 30.4 14.60 A1.6 1.6 0 1 0 33.6 14.60 Z M40.85 16.23 A1.5 1.5 0 1 0 37.85 16.23 A1.5 1.5 0 1 0 40.85 16.23 Z"
      />
      {/* Arco inferior dentado de plato/cadena con perforaciones de anclaje */}
      <path
        fill="#B8FF67"
        fillRule="evenodd"
        d="M46.09 46.89 L48.60 50.69 L46.12 52.63 L43.04 49.27 L41.75 50.03 L43.19 54.35 L40.30 55.58 L38.20 51.54 L36.75 51.94 L37.03 56.49 L33.92 56.93 L32.93 52.48 L31.07 52.48 L30.08 56.93 L26.97 56.49 L27.25 51.94 L25.80 51.54 L23.70 55.58 L20.81 54.35 L22.25 50.03 L20.96 49.27 L17.88 52.63 L15.40 50.69 L17.91 46.89 L21.0 43.5 A14.5 14.5 0 0 0 43.0 43.5 Z M40.85 47.77 A1.5 1.5 0 1 0 37.85 47.77 A1.5 1.5 0 1 0 40.85 47.77 Z M33.6 49.40 A1.6 1.6 0 1 0 30.4 49.40 A1.6 1.6 0 1 0 33.6 49.40 Z M26.15 47.77 A1.5 1.5 0 1 0 23.15 47.77 A1.5 1.5 0 1 0 26.15 47.77 Z"
      />
      {/* Monograma geométrico central BS */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M7.5 22.5 H24.5 C28.2 22.5 30.4 24.4 30.4 27.3 C30.4 29.4 29.2 30.9 27.3 31.6 C29.6 32.3 31 34.0 31 36.4 C31 39.6 28.6 41.5 24.6 41.5 H7.5 Z M13 26.3 V30.1 H23.4 C24.6 30.1 25.3 29.4 25.3 28.2 C25.3 27.0 24.6 26.3 23.4 26.3 Z M13 33.6 V37.7 H23.9 C25.2 37.7 25.9 36.9 25.9 35.65 C25.9 34.4 25.2 33.6 23.9 33.6 Z"
      />
      <path
        fill="currentColor"
        d="M39.5 22.5 H56.8 L54.6 26.6 H40.1 C38.8 26.6 38.1 27.2 38.1 28.2 C38.1 29.1 38.8 29.7 40.2 29.8 L49.6 30.3 C54.1 30.5 56.5 32.5 56.5 35.9 C56.5 39.5 53.7 41.5 48.8 41.5 H32.6 L34.8 37.4 H48.4 C50.1 37.4 51.0 36.8 51.0 35.8 C51.0 34.8 50.1 34.2 48.5 34.1 L39.2 33.6 C34.9 33.4 32.7 31.4 32.7 28.1 C32.7 24.5 35.2 22.5 39.5 22.5 Z"
      />
    </svg>
  );
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
