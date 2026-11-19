import net from 'node:net';

function isBlockedIpv4Octets(a, b, _c, _d) {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function parseIpv6Bytes(ip) {
  const clean = ip.split('%')[0].toLowerCase();
  let work = clean;

  // Convertir cola IPv4 embebida (ej. ::ffff:127.0.0.1) a dos hextetos
  const lastColon = work.lastIndexOf(':');
  if (lastColon !== -1 && work.slice(lastColon + 1).includes('.')) {
    const ipv4Part = work.slice(lastColon + 1);
    if (!net.isIPv4(ipv4Part)) return null;
    const octets = ipv4Part.split('.').map(Number);
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    work = `${work.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const dblIdx = work.indexOf('::');
  let groups;
  if (dblIdx !== -1) {
    if (work.indexOf('::', dblIdx + 2) !== -1) return null;
    const left = work.slice(0, dblIdx) ? work.slice(0, dblIdx).split(':') : [];
    const right = work.slice(dblIdx + 2) ? work.slice(dblIdx + 2).split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    groups = work.split(':');
  }

  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const val = Number.parseInt(groups[i] || '0', 16);
    if (!Number.isInteger(val) || val < 0 || val > 0xffff) return null;
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

function isBlockedIpv6(ip) {
  const bytes = parseIpv6Bytes(ip);
  if (!bytes) return true;

  const isAllZero = bytes.every((b) => b === 0);
  if (isAllZero) return true; // ::

  const isLoopback = bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
  if (isLoopback) return true; // ::1

  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 (ULA)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 (link-local)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return true; // fec0::/10 (site-local)

  // IPv4-mapped ::ffff:0:0/96
  const isV4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isV4Mapped) {
    return isBlockedIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }

  // IPv4-compatible ::/96
  const isV4Compat = bytes.slice(0, 12).every((b) => b === 0);
  if (isV4Compat) {
    return isBlockedIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }

  // NAT64 bien conocido 64:ff9b::/96 y NAT64 local 64:ff9b:1::/48
  const isNat64WellKnown =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((b) => b === 0);
  if (isNat64WellKnown) {
    return isBlockedIpv4Octets(bytes[12], bytes[13], bytes[14], bytes[15]);
  }
  const isNat64Local =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x01;
  if (isNat64Local) return true;

  // Multicast ff00::/8 y Discard 0100::/64
  if (bytes[0] === 0xff) return true;
  if (bytes[0] === 0x01 && bytes.slice(1, 8).every((b) => b === 0)) return true;

  // 6to4 2002::/16
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isBlockedIpv4Octets(bytes[2], bytes[3], bytes[4], bytes[5]);
  }

  return false;
}

function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function deepDecode(str) {
  const once = safeDecode(str);
  return safeDecode(once);
}

const SVG_QUERY_KEYS = new Set([
  'format',
  'fm',
  'ext',
  'type',
  'mime',
  'content-type',
  'response-content-type',
  'output',
  'file',
  'filename',
  'download',
  'name',
  'url',
  'src',
  'path',
  'img',
  'image',
]);

const SVG_EXT_PATTERN = /\.svgz?(?:$|[;/?#&.])/i;

/**
 * Valida que imagen_url sea http/https seguro: sin credenciales, sin hosts locales/privados/metadatos y sin SVG.
 */
export function validarImagenUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return { valid: false, reason: 'La URL de imagen debe ser una cadena de texto.' };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) {
    return { valid: false, reason: 'La URL de imagen debe tener entre 1 y 500 caracteres.' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'La URL de imagen no tiene un formato válido.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'imagen_url debe utilizar protocolo http:// o https://.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'imagen_url no puede incluir credenciales embebidas.' };
  }

  const bareHost = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
  if (!bareHost) {
    return { valid: false, reason: 'imagen_url debe incluir un nombre de host válido.' };
  }

  if (
    bareHost === 'localhost' ||
    bareHost.endsWith('.localhost') ||
    bareHost === 'local' ||
    bareHost.endsWith('.local') ||
    bareHost.endsWith('.internal') ||
    bareHost === 'metadata' ||
    bareHost === 'metadata.google.internal'
  ) {
    return { valid: false, reason: 'imagen_url no puede apuntar a hosts locales o internos.' };
  }

  if (net.isIPv4(bareHost)) {
    const octets = bareHost.split('.').map(Number);
    if (isBlockedIpv4Octets(octets[0], octets[1], octets[2], octets[3])) {
      return { valid: false, reason: 'imagen_url no puede apuntar a direcciones IP privadas o reservadas.' };
    }
  } else if (net.isIPv6(bareHost)) {
    if (isBlockedIpv6(bareHost)) {
      return { valid: false, reason: 'imagen_url no puede apuntar a direcciones IPv6 locales o reservadas.' };
    }
  }

  const decodedPath = deepDecode(parsed.pathname).toLowerCase();
  const rawPath = parsed.pathname.toLowerCase();
  const decodedFull = deepDecode(trimmed).toLowerCase();
  const decodedHash = deepDecode(parsed.hash || '').toLowerCase();

  if (
    SVG_EXT_PATTERN.test(rawPath) ||
    SVG_EXT_PATTERN.test(decodedPath) ||
    SVG_EXT_PATTERN.test(decodedHash) ||
    trimmed.toLowerCase().includes('image/svg') ||
    decodedFull.includes('image/svg')
  ) {
    return { valid: false, reason: 'No se permiten imágenes en formato SVG por seguridad.' };
  }

  for (const [key, val] of parsed.searchParams.entries()) {
    const k = key.trim().toLowerCase();
    const v = deepDecode(val).trim().toLowerCase();
    if (v.includes('image/svg') || SVG_EXT_PATTERN.test(v)) {
      return { valid: false, reason: 'No se permiten imágenes en formato SVG por seguridad.' };
    }
    if (SVG_QUERY_KEYS.has(k) && (v === 'svg' || v === 'svgz' || /(^|[^a-z])svgz?([^a-z]|$)/i.test(v))) {
      return { valid: false, reason: 'No se permiten imágenes en formato SVG por seguridad.' };
    }
  }

  return { valid: true, url: trimmed };
}

export function isValidImagenUrl(rawUrl) {
  return validarImagenUrl(rawUrl).valid;
}
