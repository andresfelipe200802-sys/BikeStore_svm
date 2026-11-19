/**
 * Coordinación multi-pestaña de Refresh Tokens (A1) para BikeStore.
 * - Nunca almacena Access JWT ni bloqueos/mutex en localStorage o sessionStorage.
 * - Solo persiste en localStorage metadatos no secretos: `bs_client_secret` y `bs_refresh_uid`.
 * - Usa Web Locks API (`navigator.locks`) cuando está disponible y BroadcastChannel (`bikestore_auth_sync`).
 * - Sin Web Locks API, deriva un UUID v8 determinista (RFC 9562) por SHA-256(`${clientSecret}:${rotacionUid}`)
 *   para que el servidor garantice consistencia e idempotencia sin mutex en localStorage.
 */

export const CLIENT_SECRET_KEY = 'bs_client_secret';
export const REFRESH_UID_KEY = 'bs_refresh_uid';
export const AUTH_SYNC_CHANNEL = 'bikestore_auth_sync';
export const AUTH_REFRESH_LOCK = 'bikestore_auth_refresh';
export const FRESH_TOKEN_WINDOW_MS = 5000;

const CLIENT_SECRET_HEX_RE = /^[0-9a-f]{64}$/i;

// Constantes SHA-256 (FIPS 180-4) para derivación síncrona compatible con jsdom e HTTP local
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function encodeUtf8(texto) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(texto);
  }
  const bin = unescape(encodeURIComponent(texto));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Calcula el digest SHA-256 (32 bytes) de una cadena UTF-8 en JavaScript puro.
 */
export function sha256Bytes(texto) {
  const input = encodeUtf8(String(texto));
  const bitLenHi = Math.floor(input.length / 0x20000000);
  const bitLenLo = (input.length << 3) >>> 0;

  const paddedLen = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  const hash = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const outView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    outView.setUint32(i * 4, hash[i], false);
  }
  return digest;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function bytesToUuid(bytes16) {
  const hex = bytesToHex(bytes16.subarray(0, 16));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function obtenerRandomBytes(length) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function generarUuidAleatorio() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = obtenerRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

function obtenerStorageSeguro() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

let clientSecretEnMemoria = null;

/**
 * Lee o genera `bs_client_secret` (hex 256 bits) en localStorage una vez por perfil de navegador.
 * Nunca se transmite al servidor.
 */
export function obtenerOGenerarClientSecret() {
  const storage = obtenerStorageSeguro();
  if (storage) {
    try {
      const existente = storage.getItem(CLIENT_SECRET_KEY);
      if (existente && CLIENT_SECRET_HEX_RE.test(existente)) {
        clientSecretEnMemoria = existente.toLowerCase();
        return clientSecretEnMemoria;
      }
      const nuevo = bytesToHex(obtenerRandomBytes(32));
      storage.setItem(CLIENT_SECRET_KEY, nuevo);
      clientSecretEnMemoria = nuevo;
      return nuevo;
    } catch {
      // Modo restringido sin acceso a almacenamiento
    }
  }
  if (!clientSecretEnMemoria) {
    clientSecretEnMemoria = bytesToHex(obtenerRandomBytes(32));
  }
  return clientSecretEnMemoria;
}

export function obtenerRefreshUid() {
  const storage = obtenerStorageSeguro();
  if (!storage) return null;
  try {
    const raw = storage.getItem(REFRESH_UID_KEY);
    const limpio = typeof raw === 'string' ? raw.trim() : '';
    return limpio || null;
  } catch {
    return null;
  }
}

export function guardarRefreshUid(rotacionUid) {
  const storage = obtenerStorageSeguro();
  if (!storage) return;
  try {
    const limpio = typeof rotacionUid === 'string' ? rotacionUid.trim() : '';
    if (limpio) {
      storage.setItem(REFRESH_UID_KEY, limpio);
    } else {
      storage.removeItem(REFRESH_UID_KEY);
    }
  } catch {
    // Modo restringido sin acceso a almacenamiento
  }
}

export function limpiarRefreshUid() {
  const storage = obtenerStorageSeguro();
  if (!storage) return;
  try {
    storage.removeItem(REFRESH_UID_KEY);
  } catch {
    // Sin efecto
  }
}

/**
 * Deriva determinísticamente un UUID v8 (RFC 9562) a partir de SHA-256(`${clientSecret}:${rotacionUid}`).
 * Si no existe `rotacionUid`, devuelve un UUID aleatorio (`crypto.randomUUID()`).
 */
export function derivarIdempotencyKeyRefresh(rotacionUid, clientSecretOverride) {
  const uid = typeof rotacionUid === 'string' ? rotacionUid.trim() : '';
  if (!uid) {
    return generarUuidAleatorio();
  }
  const secret = clientSecretOverride || obtenerOGenerarClientSecret();
  const digest = sha256Bytes(`${secret}:${uid}`);
  const uuidBytes = new Uint8Array(digest.subarray(0, 16));
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x80; // Versión 8 (RFC 9562)
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80; // Variante RFC 4122/9562 (10xx)
  return bytesToUuid(uuidBytes);
}

/**
 * Crea un coordinador de sesión/refresh por pestaña (permite aislar múltiples pestañas en pruebas).
 */
export function crearCoordinadorRefresh() {
  const tabId = generarUuidAleatorio();
  let promesaEnCurso = null;
  let ultimoTokenDifundido = null;
  let canal = null;
  let canalCtorUsado = null;
  const suscriptores = new Set();

  const emitirASuscriptores = (evento, payload) => {
    for (const listener of [...suscriptores]) {
      try {
        if (evento === 'TOKEN_ACTUALIZADO') {
          listener.onTokenActualizado?.(payload);
        } else if (evento === 'SESION_CERRADA') {
          listener.onSesionCerrada?.(payload);
        }
      } catch {
        // No interrumpe a otros suscriptores
      }
    }
  };

  const manejarMensajeCanal = (ev) => {
    const msg = ev?.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.sourceTabId === tabId) return;

    if (msg.type === 'TOKEN_ACTUALIZADO' && msg.token) {
      ultimoTokenDifundido = {
        token: msg.token,
        usuario: msg.usuario ?? null,
        rotacionUid: msg.rotacionUid ?? null,
        expiresIn: msg.expiresIn ?? null,
        receivedAt: Date.now(),
      };
      if (msg.rotacionUid) {
        guardarRefreshUid(msg.rotacionUid);
      }
      emitirASuscriptores('TOKEN_ACTUALIZADO', {
        token: msg.token,
        usuario: msg.usuario ?? null,
        rotacion_uid: msg.rotacionUid ?? null,
        expires_in: msg.expiresIn ?? null,
      });
    } else if (msg.type === 'SESION_CERRADA') {
      ultimoTokenDifundido = null;
      emitirASuscriptores('SESION_CERRADA', { motivo: msg.motivo || 'LOGOUT' });
    }
  };

  const asegurarCanal = () => {
    const Ctor = typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null;
    if (!Ctor) {
      canal = null;
      canalCtorUsado = null;
      return null;
    }
    if (canal && canalCtorUsado === Ctor) {
      return canal;
    }
    if (canal && typeof canal.close === 'function') {
      try {
        canal.close();
      } catch {
        // Sin efecto
      }
    }
    try {
      canal = new Ctor(AUTH_SYNC_CHANNEL);
      canalCtorUsado = Ctor;
      if (typeof canal.addEventListener === 'function') {
        canal.addEventListener('message', manejarMensajeCanal);
      } else {
        canal.onmessage = manejarMensajeCanal;
      }
    } catch {
      canal = null;
      canalCtorUsado = null;
    }
    return canal;
  };

  // Inicializa escucha temprana si BroadcastChannel existe en el entorno
  asegurarCanal();

  const obtenerTokenRecienteDifundido = (tokenExcluido = null) => {
    const reciente = ultimoTokenDifundido;
    if (
      reciente &&
      reciente.token &&
      reciente.token !== tokenExcluido &&
      Date.now() - reciente.receivedAt < FRESH_TOKEN_WINDOW_MS
    ) {
      return {
        token: reciente.token,
        usuario: reciente.usuario,
        rotacion_uid: reciente.rotacionUid,
        expires_in: reciente.expiresIn,
        fromBroadcast: true,
      };
    }
    return null;
  };

  const difundirTokenActualizado = ({ token, usuario, rotacionUid, expiresIn } = {}) => {
    if (!token) return;
    const ch = asegurarCanal();
    if (ch && typeof ch.postMessage === 'function') {
      try {
        ch.postMessage({
          type: 'TOKEN_ACTUALIZADO',
          token,
          usuario: usuario ?? null,
          rotacionUid: rotacionUid ?? null,
          expiresIn: expiresIn ?? null,
          emittedAt: Date.now(),
          sourceTabId: tabId,
        });
      } catch {
        // Ignora errores si el canal ya fue cerrado
      }
    }
  };

  const difundirSesionCerrada = (motivo = 'LOGOUT') => {
    ultimoTokenDifundido = null;
    const ch = asegurarCanal();
    if (ch && typeof ch.postMessage === 'function') {
      try {
        ch.postMessage({
          type: 'SESION_CERRADA',
          motivo,
          emittedAt: Date.now(),
          sourceTabId: tabId,
        });
      } catch {
        // Ignora errores si el canal ya fue cerrado
      }
    }
  };

  const ejecutarRefreshCoordinado = (fnRefresh, { tokenFallido = null } = {}) => {
    if (typeof fnRefresh !== 'function') {
      return Promise.reject(new Error('fnRefresh debe ser una función.'));
    }

    asegurarCanal();

    if (promesaEnCurso) {
      return promesaEnCurso;
    }

    const ejecutar = async () => {
      const difundidoPrevio = obtenerTokenRecienteDifundido(tokenFallido);
      if (difundidoPrevio) {
        return difundidoPrevio;
      }

      const uidAlIniciar = obtenerRefreshUid();

      const correrRefresh = async () => {
        const uidActual = obtenerRefreshUid();
        const idempotencyKey = derivarIdempotencyKeyRefresh(uidActual);
        const resultado = await fnRefresh(idempotencyKey);

        if (resultado?.rotacion_uid) {
          guardarRefreshUid(resultado.rotacion_uid);
        }
        if (resultado?.token) {
          difundirTokenActualizado({
            token: resultado.token,
            usuario: resultado.usuario ?? null,
            rotacionUid: resultado.rotacion_uid ?? uidActual,
            expiresIn: resultado.expires_in ?? null,
          });
        }
        return resultado;
      };

      const locksApi = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (locksApi && typeof locksApi.request === 'function') {
        return locksApi.request(AUTH_REFRESH_LOCK, { mode: 'exclusive' }, async () => {
          let difundido = obtenerTokenRecienteDifundido(tokenFallido);
          if (difundido) {
            return difundido;
          }

          const uidActual = obtenerRefreshUid();
          if (uidAlIniciar && !uidActual) {
            return null;
          }
          if (uidAlIniciar && uidActual && uidActual !== uidAlIniciar) {
            // Permite que un BroadcastChannel en cola complete su entrega antes de invocar al servidor
            await new Promise((resolve) => setTimeout(resolve, 0));
            difundido = obtenerTokenRecienteDifundido(tokenFallido);
            if (difundido) {
              return difundido;
            }
          }

          return correrRefresh();
        });
      }

      // Respaldo sin Web Locks API: nunca usa mutex en localStorage;
      // la clave UUID v8 determinista y PostgreSQL garantizan consistencia e idempotencia.
      return correrRefresh();
    };

    promesaEnCurso = ejecutar().finally(() => {
      promesaEnCurso = null;
    });
    return promesaEnCurso;
  };

  const suscribirSyncAuth = ({ onTokenActualizado, onSesionCerrada } = {}) => {
    asegurarCanal();
    const entry = { onTokenActualizado, onSesionCerrada };
    suscriptores.add(entry);

    const onStorage = (ev) => {
      if (ev.key === REFRESH_UID_KEY && ev.newValue === null) {
        ultimoTokenDifundido = null;
        onSesionCerrada?.({ motivo: 'STORAGE_SYNC' });
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', onStorage);
    }

    return () => {
      suscriptores.delete(entry);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('storage', onStorage);
      }
    };
  };

  const destruir = () => {
    suscriptores.clear();
    ultimoTokenDifundido = null;
    promesaEnCurso = null;
    if (canal && typeof canal.close === 'function') {
      try {
        canal.close();
      } catch {
        // Sin efecto
      }
    }
    canal = null;
    canalCtorUsado = null;
  };

  return {
    tabId,
    ejecutarRefreshCoordinado,
    difundirTokenActualizado,
    difundirSesionCerrada,
    suscribirSyncAuth,
    destruir,
  };
}

let coordinadorPorDefecto = crearCoordinadorRefresh();

export function ejecutarRefreshCoordinado(fnRefresh, opciones) {
  return coordinadorPorDefecto.ejecutarRefreshCoordinado(fnRefresh, opciones);
}

export function difundirTokenActualizado(datos) {
  return coordinadorPorDefecto.difundirTokenActualizado(datos);
}

export function difundirSesionCerrada(motivo) {
  return coordinadorPorDefecto.difundirSesionCerrada(motivo);
}

export function suscribirSyncAuth(handlers) {
  return coordinadorPorDefecto.suscribirSyncAuth(handlers);
}

export function reiniciarEstadoSyncParaTests() {
  coordinadorPorDefecto.destruir();
  clientSecretEnMemoria = null;
  coordinadorPorDefecto = crearCoordinadorRefresh();
}
