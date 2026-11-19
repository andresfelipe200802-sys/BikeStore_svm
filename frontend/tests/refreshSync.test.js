import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  setAuthInvalidatedHandler,
  setAuthRefresher,
  setAuthTokenProvider,
} from '../src/api/client.js';
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx';
import {
  AUTH_REFRESH_LOCK,
  AUTH_SYNC_CHANNEL,
  CLIENT_SECRET_KEY,
  REFRESH_UID_KEY,
  crearCoordinadorRefresh,
  derivarIdempotencyKeyRefresh,
  obtenerOGenerarClientSecret,
  reiniciarEstadoSyncParaTests,
  sha256Bytes,
} from '../src/utils/refreshSync.js';

const UUID_V8_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_RFC_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function crearMockBroadcastChannelBus() {
  const canalesPorNombre = new Map();

  return class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.closed = false;
      this.onmessage = null;
      this._listeners = new Set();
      if (!canalesPorNombre.has(name)) {
        canalesPorNombre.set(name, new Set());
      }
      canalesPorNombre.get(name).add(this);
    }

    addEventListener(type, listener) {
      if (type === 'message') this._listeners.add(listener);
    }

    removeEventListener(type, listener) {
      if (type === 'message') this._listeners.delete(listener);
    }

    postMessage(data) {
      if (this.closed) return;
      const grupo = canalesPorNombre.get(this.name);
      if (!grupo) return;
      for (const peer of grupo) {
        if (peer === this || peer.closed) continue;
        const evento = { data };
        if (typeof peer.onmessage === 'function') peer.onmessage(evento);
        for (const fn of peer._listeners) fn(evento);
      }
    }

    close() {
      this.closed = true;
      canalesPorNombre.get(this.name)?.delete(this);
    }
  };
}

function crearMockWebLocks() {
  const colas = new Map();
  return {
    request: vi.fn((name, _opts, callback) => {
      const cb = typeof _opts === 'function' ? _opts : callback;
      const previa = colas.get(name) || Promise.resolve();
      const siguiente = previa.then(() => cb());
      colas.set(
        name,
        siguiente.catch(() => {})
      );
      return siguiente;
    }),
  };
}

describe('refreshSync (A1: UUIDv8, Web Locks, BroadcastChannel y fallback sin locks)', () => {
  const originalNavigatorLocks = Object.getOwnPropertyDescriptor(Navigator.prototype, 'locks');

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    reiniciarEstadoSyncParaTests();
  });

  afterEach(() => {
    cleanup();
    if (originalNavigatorLocks) {
      Object.defineProperty(Navigator.prototype, 'locks', originalNavigatorLocks);
    } else {
      delete Navigator.prototype.locks;
    }
    setAuthInvalidatedHandler(null);
    setAuthTokenProvider(null);
    setAuthRefresher(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    reiniciarEstadoSyncParaTests();
  });

  it('calcula SHA-256 idéntico a Node crypto y deriva UUID v8 RFC 9562 determinista', () => {
    const muestra = 'secreto-perfil:550e8400-e29b-41d4-a716-446655440000-ñáéíóú';
    const esperado = createHash('sha256').update(muestra, 'utf8').digest('hex');
    const obtenido = Array.from(sha256Bytes(muestra))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(obtenido).toBe(esperado);

    const secret = obtenerOGenerarClientSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(localStorage.getItem(CLIENT_SECRET_KEY)).toBe(secret);

    const uid1 = '11111111-1111-4111-8111-111111111111';
    const uid2 = '22222222-2222-4222-8222-222222222222';
    const k1a = derivarIdempotencyKeyRefresh(uid1);
    const k1b = derivarIdempotencyKeyRefresh(uid1);
    const k2 = derivarIdempotencyKeyRefresh(uid2);

    expect(k1a).toMatch(UUID_V8_RE);
    expect(k1a).toBe(k1b);
    expect(k2).toMatch(UUID_V8_RE);
    expect(k2).not.toBe(k1a);

    // Sin rotacionUid recurre a crypto.randomUUID() RFC válido
    const aleatorio = derivarIdempotencyKeyRefresh(null);
    expect(aleatorio).toMatch(UUID_RFC_RE);
  });

  it('garantiza single-flight en memoria dentro de la misma pestaña', async () => {
    localStorage.setItem(REFRESH_UID_KEY, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const coord = crearCoordinadorRefresh();

    let resolverRefresh;
    const fnRefresh = vi.fn(
      () =>
        new Promise((resolve) => {
          resolverRefresh = resolve;
        })
    );

    const p1 = coord.ejecutarRefreshCoordinado(fnRefresh);
    const p2 = coord.ejecutarRefreshCoordinado(fnRefresh);

    expect(fnRefresh).toHaveBeenCalledTimes(1);

    resolverRefresh({
      token: 'jwt-t2',
      rotacion_uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      usuario: { id_usuario: 1, rol: 'CLIENTE' },
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.token).toBe('jwt-t2');
    expect(r2.token).toBe('jwt-t2');
    expect(localStorage.getItem(REFRESH_UID_KEY)).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    coord.destruir();
  });

  it('coordina con Web Locks API + BroadcastChannel (1 sola llamada HTTP para 2 pestañas paralelas)', async () => {
    const MockBC = crearMockBroadcastChannelBus();
    const mockLocks = crearMockWebLocks();
    vi.stubGlobal('BroadcastChannel', MockBC);
    Object.defineProperty(Navigator.prototype, 'locks', {
      configurable: true,
      value: mockLocks,
    });

    localStorage.setItem(REFRESH_UID_KEY, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const tabA = crearCoordinadorRefresh();
    const tabB = crearCoordinadorRefresh();

    const fnRefreshA = vi.fn(async (idemKey) => {
      expect(idemKey).toMatch(UUID_V8_RE);
      await new Promise((r) => setTimeout(r, 15));
      return {
        token: 'jwt-nuevo-desde-a',
        expires_in: 900,
        rotacion_uid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        usuario: { id_usuario: 7, rol: 'CLIENTE' },
        replayed: false,
      };
    });
    const fnRefreshB = vi.fn(async () => ({
      token: 'no-deberia-llamarse',
      rotacion_uid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    }));

    const [resA, resB] = await Promise.all([
      tabA.ejecutarRefreshCoordinado(fnRefreshA),
      tabB.ejecutarRefreshCoordinado(fnRefreshB),
    ]);

    expect(mockLocks.request).toHaveBeenCalledTimes(2);
    expect(mockLocks.request.mock.calls[0][0]).toBe(AUTH_REFRESH_LOCK);
    expect(fnRefreshA).toHaveBeenCalledTimes(1);
    expect(fnRefreshB).not.toHaveBeenCalled();
    expect(resA.token).toBe('jwt-nuevo-desde-a');
    expect(resB.token).toBe('jwt-nuevo-desde-a');
    expect(resB.fromBroadcast).toBe(true);

    tabA.destruir();
    tabB.destruir();
  });

  it('en fallback SIN Web Locks API no escribe mutex en localStorage y ambas pestañas derivan el mismo UUID v8', async () => {
    const MockBC = crearMockBroadcastChannelBus();
    vi.stubGlobal('BroadcastChannel', MockBC);
    Object.defineProperty(Navigator.prototype, 'locks', {
      configurable: true,
      value: undefined,
    });

    const uidInicial = '99999999-9999-4999-8999-999999999999';
    localStorage.setItem(REFRESH_UID_KEY, uidInicial);

    const tabA = crearCoordinadorRefresh();
    const tabB = crearCoordinadorRefresh();

    const clavesEnviadas = [];
    const simularServidor = vi.fn(async (idemKey) => {
      clavesEnviadas.push(idemKey);
      return {
        token: 'jwt-replayed-t2',
        expires_in: 900,
        rotacion_uid: '88888888-8888-4888-8888-888888888888',
        usuario: { id_usuario: 4, rol: 'CLIENTE' },
        replayed: clavesEnviadas.length > 1,
      };
    });

    const [resA, resB] = await Promise.all([
      tabA.ejecutarRefreshCoordinado(simularServidor),
      tabB.ejecutarRefreshCoordinado(simularServidor),
    ]);

    expect(clavesEnviadas).toHaveLength(2);
    expect(clavesEnviadas[0]).toMatch(UUID_V8_RE);
    expect(clavesEnviadas[0]).toBe(clavesEnviadas[1]);
    expect(resA.token).toBe('jwt-replayed-t2');
    expect(resB.token).toBe('jwt-replayed-t2');

    // Ningún mutex/lock en localStorage
    expect(Object.keys(localStorage).sort()).toEqual([CLIENT_SECRET_KEY, REFRESH_UID_KEY].sort());

    tabA.destruir();
    tabB.destruir();
  });

  it('sincroniza cierre de sesión entre pestañas vía BroadcastChannel y evento storage', () => {
    const MockBC = crearMockBroadcastChannelBus();
    vi.stubGlobal('BroadcastChannel', MockBC);

    const tabA = crearCoordinadorRefresh();
    const tabB = crearCoordinadorRefresh();
    const onSesionCerradaB = vi.fn();

    const unsubB = tabB.suscribirSyncAuth({ onSesionCerrada: onSesionCerradaB });
    tabA.difundirSesionCerrada('LOGOUT_GLOBAL');
    expect(onSesionCerradaB).toHaveBeenCalledTimes(1);
    expect(onSesionCerradaB).toHaveBeenCalledWith({ motivo: 'LOGOUT_GLOBAL' });

    // Respaldo por evento storage cuando bs_refresh_uid pasa a null
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: REFRESH_UID_KEY,
        oldValue: 'uid-prev',
        newValue: null,
      })
    );
    expect(onSesionCerradaB).toHaveBeenCalledTimes(2);
    expect(AUTH_SYNC_CHANNEL).toBe('bikestore_auth_sync');

    unsubB();
    tabA.destruir();
    tabB.destruir();
  });

  it('reintenta automáticamente tras 401 TOKEN_INVALIDO y NO reintenta ante SESION_REVOCADA', async () => {
    const uidInicial = '55555555-5555-4555-8555-555555555555';
    localStorage.setItem(REFRESH_UID_KEY, uidInicial);

    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        calls.push({
          url,
          method: opts.method,
          headers: opts.headers,
          credentials: opts.credentials,
        });

        // 1. Rehidratación inicial al montar AuthProvider
        if (url.endsWith('/auth/refresh') && calls.length === 1) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-t1',
                expires_in: 900,
                rotacion_uid: '66666666-6666-4666-8666-666666666666',
                usuario: { id_usuario: 9, correo: 'ana@test.co', rol: 'CLIENTE' },
                replayed: false,
              },
            }),
            { status: 200 }
          );
        }

        // 2. Sincronización inicial de carrito
        if (url.endsWith('/carrito') && opts.headers.Authorization === 'Bearer jwt-t1') {
          return new Response(JSON.stringify({ ok: true, datos: { items: [] } }), { status: 200 });
        }

        // 3. Petición autenticada con jwt-t1 expirado -> 401 TOKEN_INVALIDO
        if (url.endsWith('/pedidos') && opts.headers.Authorization === 'Bearer jwt-t1') {
          return new Response(
            JSON.stringify({ ok: false, codigo: 'TOKEN_INVALIDO', mensaje: 'Token expirado.' }),
            { status: 401 }
          );
        }

        // 4. Refresh automático tras 401 TOKEN_INVALIDO
        if (url.endsWith('/auth/refresh') && calls.length >= 3) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-t2',
                expires_in: 900,
                rotacion_uid: '77777777-7777-4777-8777-777777777777',
                usuario: { id_usuario: 9, correo: 'ana@test.co', rol: 'CLIENTE' },
                replayed: false,
              },
            }),
            { status: 200 }
          );
        }

        // 5. Reintento automático de /pedidos con jwt-t2 -> 200 OK
        if (url.endsWith('/pedidos') && opts.headers.Authorization === 'Bearer jwt-t2') {
          return new Response(JSON.stringify({ ok: true, datos: [{ id_pedido: 101 }] }), {
            status: 200,
          });
        }

        // 6. Petición con SESION_REVOCADA -> NO debe disparar refresh
        if (url.endsWith('/perfil')) {
          return new Response(
            JSON.stringify({ ok: false, codigo: 'SESION_REVOCADA', mensaje: 'Sesión revocada.' }),
            { status: 401 }
          );
        }

        return new Response(JSON.stringify({ ok: true, datos: {} }), { status: 200 });
      })
    );

    const onAviso = vi.fn();
    let authRef;
    function Probe() {
      authRef = useAuth();
      return createElement('p', null, authRef.estaAutenticado ? `auth:${authRef.token}` : 'anon');
    }

    render(
      createElement(AuthProvider, { onAvisoSesion: onAviso }, createElement(Probe))
    );

    await waitFor(() => expect(screen.getByText('auth:jwt-t1')).toBeTruthy());

    // Verifica que JWT vive solo en memoria y jamás en sessionStorage/localStorage
    expect(sessionStorage.getItem('bikestore_session_v1')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('jwt-t1');

    // Ejecuta petición con token expirado -> debe refrescar una vez y reintentar /pedidos
    let resPedidos;
    await act(async () => {
      resPedidos = await apiRequest('/pedidos');
    });
    expect(resPedidos.datos).toEqual([{ id_pedido: 101 }]);
    await waitFor(() => expect(screen.getByText('auth:jwt-t2')).toBeTruthy());

    const refreshCalls = calls.filter((c) => c.url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(2);
    expect(refreshCalls[1].credentials).toBe('include');
    expect(refreshCalls[1].headers['X-Requested-With']).toBe('BikeStore');
    expect(refreshCalls[1].headers['Idempotency-Key']).toMatch(UUID_V8_RE);
    expect(refreshCalls[1].headers.Authorization).toBeUndefined();

    // Ante SESION_REVOCADA no reintenta refresh e invalida sesión
    const refreshAntesRevocada = calls.filter((c) => c.url.endsWith('/auth/refresh')).length;
    await act(async () => {
      await expect(apiRequest('/perfil')).rejects.toMatchObject({ codigo: 'SESION_REVOCADA' });
    });
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh')).length).toBe(refreshAntesRevocada);
    await waitFor(() => expect(screen.getByText('anon')).toBeTruthy());
    expect(localStorage.getItem(REFRESH_UID_KEY)).toBeNull();
    expect(onAviso).toHaveBeenCalledTimes(1);
  });

  it('en rehidratación silenciosa fallida limpia bs_refresh_uid sin mostrar toast alarmante', async () => {
    localStorage.setItem(REFRESH_UID_KEY, '12345678-1234-4123-8123-123456789012');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, codigo: 'SESION_EXPIRADA', mensaje: 'Sesión expirada.' }),
          { status: 401 }
        )
      )
    );

    const onAviso = vi.fn();
    function Probe() {
      const auth = useAuth();
      return createElement(
        'p',
        null,
        auth.cargandoSesion ? 'cargando' : auth.estaAutenticado ? 'auth' : 'anon'
      );
    }

    render(
      createElement(AuthProvider, { onAvisoSesion: onAviso }, createElement(Probe))
    );

    await waitFor(() => expect(screen.getByText('anon')).toBeTruthy());
    expect(localStorage.getItem(REFRESH_UID_KEY)).toBeNull();
    expect(onAviso).not.toHaveBeenCalled();
  });
});
