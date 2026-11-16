import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCanvas } from '../src/components/HeroCanvas.jsx';
import {
  apiRequest,
  construirQueryString,
  limpiarPayload,
  setAuthInvalidatedHandler,
  setAuthTokenProvider,
} from '../src/api/client.js';
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx';
import {
  containsSensitiveCardData,
  isValidDocumento,
  normalizeDocumento,
} from '../src/utils/documentos.js';
import { obtenerRangoReportesPorDefecto } from '../src/utils/formato.js';
import { VISITOR_CART_KEY, agregarItemVisitante, leerCarritoVisitante } from '../src/utils/visitorCart.js';

describe('documentos, formato y cliente HTTP', () => {
  afterEach(() => {
    setAuthInvalidatedHandler(null);
    setAuthTokenProvider(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('valida sintaxis de documentos colombianos y rechaza tarjetas/CVV en reembolsos', () => {
    expect(normalizeDocumento(' ab123 ')).toBe('AB123');
    expect(isValidDocumento('CC', '1036654321')).toBe(true);
    expect(isValidDocumento('CC', '123')).toBe(false);
    expect(isValidDocumento('TI', '1036654321')).toBe(true);
    expect(isValidDocumento('CE', 'CE987654')).toBe(true);
    expect(isValidDocumento('PASAPORTE', 'AO123456')).toBe(true);
    expect(isValidDocumento('PPT', '987654321')).toBe(true);

    expect(containsSensitiveCardData('4111 1111 1111 1111')).toBe(true);
    expect(containsSensitiveCardData('Tarjeta con CVV: 842')).toBe(true);
    expect(containsSensitiveCardData('Nequi 3001234567 - Juan Pérez')).toBe(false);
  });

  it('limpia query strings vacíos y payloads .strict() incluyendo arrays anidados', () => {
    expect(
      construirQueryString({
        q: 'ruta',
        id_categoria: '',
        orden_precio: undefined,
        estado: null,
        page: 1,
      })
    ).toBe('?q=ruta&page=1');

    expect(
      limpiarPayload(
        {
          nombre: 'Ana',
          segundo_apellido: '',
          motivo_cancelacion: '   ',
          items: [{ id_detalle_retracto: 1, observacion_inspeccion: '' }],
        },
        { nullableKeys: ['segundo_apellido'] }
      )
    ).toEqual({
      nombre: 'Ana',
      segundo_apellido: null,
      items: [{ id_detalle_retracto: 1 }],
    });
  });

  it('calcula rango inicial <= 30 días en America/Bogota y discrimina 401 reales vs credenciales', async () => {
    const rango = obtenerRangoReportesPorDefecto(30, new Date('2026-11-16T15:00:00Z'));
    expect(rango).toEqual({ desde: '2026-10-18', hasta: '2026-11-16' });

    const onInvalidated = vi.fn();
    setAuthInvalidatedHandler(onInvalidated);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ ok: false, codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Clave errada' }),
            { status: 401 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ ok: false, codigo: 'SESION_REVOCADA', mensaje: 'Sesión revocada' }),
            { status: 401 }
          )
        )
    );

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
    });
    expect(onInvalidated).not.toHaveBeenCalled();

    await expect(apiRequest('/pedidos')).rejects.toMatchObject({ codigo: 'SESION_REVOCADA' });
    expect(onInvalidated).toHaveBeenCalledTimes(1);
  });
});

describe('AuthContext (registro + auto-login + fusión + rol ADMIN + revocación clave)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function ProbadorAuth({ onReady }) {
    const auth = useAuth();
    onReady(auth);
    return <p>{auth.usuario ? `${auth.usuario.correo}:${auth.cantidadCarrito}` : 'anon'}</p>;
  }

  it('encadena POST /registro -> POST /login -> POST /carrito/fusionar cuando hay carrito visitante', async () => {
    agregarItemVisitante(5, 2);

    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
        if (url.endsWith('/auth/registro')) {
          return new Response(
            JSON.stringify({ ok: true, datos: { id_usuario: 9, rol: 'CLIENTE' } }),
            { status: 201 }
          );
        }
        if (url.endsWith('/auth/login')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-cliente',
                usuario: { id_usuario: 9, correo: 'ana@test.co', rol: 'CLIENTE' },
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/carrito/fusionar')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: { items: [{ id_producto: 5, cantidad: 2 }], ajustes: [] },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: {} }), { status: 200 });
      })
    );

    let authRef;
    render(
      <AuthProvider>
        <ProbadorAuth onReady={(a) => { authRef = a; }} />
      </AuthProvider>
    );

    await act(async () => {
      await authRef.registrarCliente({
        tipo_documento: 'CC',
        numero_documento: '1036654321',
        nombre: 'Ana',
        primer_apellido: 'Pérez',
        segundo_apellido: '',
        telefono: '3001234567',
        correo: 'ana@test.co',
        contrasena: 'Password123!',
      });
    });

    await waitFor(() => expect(screen.getByText('ana@test.co:2')).toBeTruthy());
    expect(calls.map((c) => c.url)).toEqual([
      '/api/auth/registro',
      '/api/auth/login',
      '/api/carrito/fusionar',
    ]);
    expect(JSON.parse(calls[0].body).segundo_apellido).toBeNull();
    expect(calls[2].headers['Idempotency-Key']).toBeTruthy();
    expect(localStorage.getItem(VISITOR_CART_KEY)).toBeNull();
    expect(leerCarritoVisitante().items).toEqual([]);
  });

  it('omite fusión al ingresar como ADMIN y cierra sesión al cambiar contraseña', async () => {
    agregarItemVisitante(3, 1);

    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        calls.push(url);
        if (url.endsWith('/auth/login')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-admin',
                usuario: { id_usuario: 1, correo: 'admin@test.co', rol: 'ADMIN' },
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/perfil/contrasena')) {
          return new Response(
            JSON.stringify({ ok: true, datos: { mensaje: 'Contraseña cambiada.' } }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: {} }), { status: 200 });
      })
    );

    let authRef;
    const onAviso = vi.fn();
    render(
      <AuthProvider onAvisoSesion={onAviso}>
        <ProbadorAuth onReady={(a) => { authRef = a; }} />
      </AuthProvider>
    );

    await act(async () => {
      await authRef.iniciarSesion({ correo: 'admin@test.co', contrasena: 'Secret!' });
    });
    await waitFor(() => expect(screen.getByText('admin@test.co:0')).toBeTruthy());
    expect(calls).toEqual(['/api/auth/login']);
    expect(leerCarritoVisitante().items).toEqual([{ id_producto: 3, cantidad: 1 }]);

    await act(async () => {
      await authRef.cambiarContrasena({
        contrasena_actual: 'Secret!',
        nueva_contrasena: 'NewSecret123!',
      });
    });
    await waitFor(() => expect(screen.getByText('anon')).toBeTruthy());
    expect(onAviso).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('bikestore_session_v1')).toBeNull();
  });

  it('renderiza HeroCanvas sin fallar en jsdom y alterna Pausar/Reanudar sin aria-pressed', () => {
    render(<HeroCanvas />);
    const btn = screen.getByRole('button', { name: 'Pausar fondo animado' });
    expect(btn.hasAttribute('aria-pressed')).toBe(false);

    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Reanudar fondo animado' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reanudar fondo animado' }));
    expect(screen.getByRole('button', { name: 'Pausar fondo animado' })).toBeTruthy();
  });
});
