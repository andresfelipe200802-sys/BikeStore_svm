import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollToTop } from '../src/App.jsx';
import { apiRequest } from '../src/api/client.js';
import { ProtectedRoute } from '../src/components/ProtectedRoute.jsx';
import { AUTO_DISMISS_TOAST_MS, ToastRegion } from '../src/components/ToastRegion.jsx';
import { AuthProvider, PENDING_FUSION_KEY } from '../src/context/AuthContext.jsx';
import { CheckoutPage } from '../src/pages/client/CheckoutPage.jsx';
import { DetallePedidoPage } from '../src/pages/client/DetallePedidoPage.jsx';
import { PagoPedidoPage } from '../src/pages/client/PagoPedidoPage.jsx';
import { AdminResumenPage } from '../src/pages/admin/AdminResumenPage.jsx';
import { CarritoPage } from '../src/pages/public/CarritoPage.jsx';
import { InicioPage } from '../src/pages/public/InicioPage.jsx';
import { LoginPage } from '../src/pages/public/LoginPage.jsx';
import { REFRESH_UID_KEY, reiniciarEstadoSyncParaTests } from '../src/utils/refreshSync.js';
import { VISITOR_CART_KEY, agregarItemVisitante } from '../src/utils/visitorCart.js';

const UUID_RFC_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderConRouterYAuth(ui, { initialEntries = ['/'], onAvisoSesion } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider onAvisoSesion={onAvisoSesion}>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe('Flujos críticos UI (ProtectedRoute, fusión persistente, Idempotency-Key y 401/409)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.head.innerHTML = '';
    reiniciarEstadoSyncParaTests();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    reiniciarEstadoSyncParaTests();
  });

  it('protege rutas por rol (anónimo redirige a /ingresar, CLIENTE recibe 403 en /admin)', async () => {
    vi.stubGlobal('fetch', vi.fn());

    // 1. Visitante anónimo en /checkout -> redirige a /ingresar sin disparar /auth/refresh
    const vistaAnon = renderConRouterYAuth(
      <Routes>
        <Route
          path="/checkout"
          element={
            <ProtectedRoute roles={['CLIENTE']}>
              <p>Zona privada checkout</p>
            </ProtectedRoute>
          }
        />
        <Route path="/ingresar" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/checkout'] }
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy());
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vistaAnon.unmount();

    // 2. Usuario CLIENTE autenticado intentando abrir /admin -> 403 Acceso restringido
    localStorage.setItem(REFRESH_UID_KEY, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.endsWith('/auth/refresh')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-cliente',
                expires_in: 900,
                rotacion_uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                usuario: { id_usuario: 5, nombre: 'Laura', rol: 'CLIENTE' },
              },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: { items: [] } }), { status: 200 });
      })
    );

    renderConRouterYAuth(
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <p>Panel exclusivo admin</p>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ['/admin'] }
    );

    await waitFor(() => expect(screen.getByText('403')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Acceso restringido' })).toBeTruthy();
    expect(document.title).toBe('Acceso restringido | BikeStore');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );
    expect(screen.getByRole('link', { name: 'Ir a mi espacio principal' }).getAttribute('href')).toBe(
      '/catalogo'
    );
  });

  it('conserva bikestore_pending_fusion_key_v1 ante fallo de fusión y reutiliza el mismo UUID en reintento hasta 200 OK', async () => {
    agregarItemVisitante(11, 2);

    const fusionCalls = [];
    let intentoFusion = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        if (url.endsWith('/auth/login')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-login-1',
                expires_in: 900,
                rotacion_uid: '11111111-1111-4111-8111-111111111111',
                usuario: { id_usuario: 12, nombre: 'Carlos', correo: 'carlos@bike.co', rol: 'CLIENTE' },
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/carrito/fusionar')) {
          intentoFusion += 1;
          fusionCalls.push({
            idempotencyKey: opts.headers['Idempotency-Key'],
            body: JSON.parse(opts.body),
          });
          if (intentoFusion === 1) {
            return new Response(
              JSON.stringify({
                ok: false,
                codigo: 'CONFLICTO_CONCURRENCIA',
                mensaje: 'Intenta de nuevo en unos instantes.',
              }),
              { status: 503 }
            );
          }
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                items: [
                  {
                    id_producto: 11,
                    nombre: 'Casco Trail MIPS',
                    cantidad: 1,
                    precio_unidad: '320000.00',
                    subtotal: '320000.00',
                    existencias: 1,
                    disponible: true,
                  },
                ],
                total: '320000.00',
                ajustes: [{ id_producto: 11, nombre: 'Casco Trail MIPS', motivo: 'AJUSTADO_A_EXISTENCIAS', cantidad_aplicada: 1 }],
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/carrito')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                items: [
                  {
                    id_producto: 11,
                    nombre: 'Casco Trail MIPS',
                    cantidad: 1,
                    precio_unidad: '320000.00',
                    subtotal: '320000.00',
                    existencias: 1,
                    disponible: true,
                  },
                ],
                total: '320000.00',
              },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: {} }), { status: 200 });
      })
    );

    renderConRouterYAuth(
      <Routes>
        <Route path="/ingresar" element={<LoginPage />} />
        <Route path="/carrito" element={<CarritoPage />} />
      </Routes>,
      { initialEntries: ['/ingresar'] }
    );

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'carlos@bike.co' },
    });
    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });

    // Intento 1: login ok, fusionar -> 503
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar a mi cuenta' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Intenta de nuevo en unos instantes.')).toBeTruthy();
    expect(localStorage.getItem(PENDING_FUSION_KEY)).toBeTruthy();
    expect(localStorage.getItem(VISITOR_CART_KEY)).toBeTruthy();

    // Intento 2: reutiliza exactamente la misma clave UUID y al recibir 200 OK la limpia junto al carrito visitante
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar a mi cuenta' }));

    await waitFor(() =>
      expect(screen.getByText('Resumen de fusión de tu carrito anterior:')).toBeTruthy()
    );
    expect(fusionCalls).toHaveLength(2);
    expect(fusionCalls[0].idempotencyKey).toMatch(UUID_RFC_RE);
    expect(fusionCalls[0].idempotencyKey).toBe(fusionCalls[1].idempotencyKey);
    expect(localStorage.getItem(PENDING_FUSION_KEY)).toBeNull();
    expect(localStorage.getItem(VISITOR_CART_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_UID_KEY)).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('persiste el mismo UUID Idempotency-Key en volverAlCarrito ante fallo de red en DetallePedidoPage', async () => {
    const volverKeys = [];
    let intentoVolver = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        if (url.endsWith('/pedidos/42') && (!opts.method || opts.method === 'GET')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                id_pedido: 42,
                estado_pedido: 'CANCELADO',
                estado_reembolso_cancelacion: 'NO_APLICA',
                direccion_envio: 'Calle 100 # 15-20, Bogotá',
                fecha_pedido: '2026-11-18T12:00:00Z',
                total: '1200000.00',
                detalles: [{ id_detalle_pedido: 1, nombre: 'Bicicleta Urbana', cantidad: 1, precio_unitario: '1200000.00' }],
                pagos: [],
                retractos: [],
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/pedidos/42/volver-al-carrito')) {
          intentoVolver += 1;
          volverKeys.push(opts.headers['Idempotency-Key']);
          if (intentoVolver === 1) {
            throw new TypeError('Failed to fetch');
          }
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                items: [{ id_producto: 3, cantidad: 1 }],
                ajustes: [],
              },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: { items: [], total: '0.00' } }), {
          status: 200,
        });
      })
    );

    renderConRouterYAuth(
      <Routes>
        <Route path="/pedidos/:id" element={<DetallePedidoPage />} />
        <Route path="/carrito" element={<CarritoPage />} />
      </Routes>,
      { initialEntries: ['/pedidos/42'] }
    );

    const btnVolver = await screen.findByRole('button', { name: 'Volver productos al carrito' });
    fireEvent.click(btnVolver);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No fue posible conectar con el servidor')
    );

    // Segundo clic tras error de red: debe enviar el MISMO UUID Idempotency-Key
    fireEvent.click(screen.getByRole('button', { name: 'Volver productos al carrito' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Tu carrito de compras' })).toBeTruthy()
    );
    expect(volverKeys).toHaveLength(2);
    expect(volverKeys[0]).toMatch(UUID_RFC_RE);
    expect(volverKeys[0]).toBe(volverKeys[1]);
  });

  it('persiste el mismo UUID Idempotency-Key en volverAlCarrito desde PagoPedidoPage ante fallo de red', async () => {
    const volverKeys = [];
    let intento = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        if (url.endsWith('/pedidos/77') && (!opts.method || opts.method === 'GET')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                id_pedido: 77,
                estado_pedido: 'CANCELADO',
                direccion_envio: 'Cra 10 # 20-30, Bogotá',
                total: '500000.00',
                detalles: [{ id_detalle_pedido: 1, nombre: 'Casco', cantidad: 1, precio_unitario: '500000.00' }],
                pagos: [],
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/pedidos/77/volver-al-carrito')) {
          intento += 1;
          volverKeys.push(opts.headers['Idempotency-Key']);
          if (intento === 1) {
            throw new TypeError('Network failure');
          }
          return new Response(JSON.stringify({ ok: true, datos: { items: [], ajustes: [] } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ ok: true, datos: { items: [], total: '0.00' } }), {
          status: 200,
        });
      })
    );

    renderConRouterYAuth(
      <Routes>
        <Route path="/pedidos/:id/pago" element={<PagoPedidoPage />} />
        <Route path="/carrito" element={<CarritoPage />} />
      </Routes>,
      { initialEntries: ['/pedidos/77/pago'] }
    );

    const btn = await screen.findByRole('button', { name: 'Volver productos al carrito' });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No fue posible conectar con el servidor')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Volver productos al carrito' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Tu carrito de compras' })).toBeTruthy()
    );
    expect(volverKeys).toHaveLength(2);
    expect(volverKeys[0]).toMatch(UUID_RFC_RE);
    expect(volverKeys[0]).toBe(volverKeys[1]);
  });

  it('maneja error 401 de credenciales en LoginPage y 409 PRECIO_ACTUALIZADO en CheckoutPage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        if (url.endsWith('/auth/login')) {
          return new Response(
            JSON.stringify({
              ok: false,
              codigo: 'CREDENCIALES_INVALIDAS',
              mensaje: 'Correo o contraseña incorrectos.',
            }),
            { status: 401 }
          );
        }
        if (url.endsWith('/carrito')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                items: [
                  {
                    id_producto: 8,
                    nombre: 'Bicicleta Gravel Pro',
                    cantidad: 1,
                    precio_unidad: '4200000.00',
                    subtotal: '4200000.00',
                  },
                ],
                total: '4200000.00',
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/pedidos') && opts.method === 'POST') {
          return new Response(
            JSON.stringify({
              ok: false,
              codigo: 'PRECIO_ACTUALIZADO',
              mensaje: 'El precio de un producto cambió.',
              detalles: {
                carrito: {
                  items: [
                    {
                      id_producto: 8,
                      nombre: 'Bicicleta Gravel Pro',
                      cantidad: 1,
                      precio_unidad: '4500000.00',
                      precio_actual: '4500000.00',
                      subtotal: '4500000.00',
                    },
                  ],
                  total: '4500000.00',
                },
              },
            }),
            { status: 409 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: {} }), { status: 200 });
      })
    );

    const vistaLogin = renderConRouterYAuth(
      <Routes>
        <Route path="/ingresar" element={<LoginPage />} />
      </Routes>,
      { initialEntries: ['/ingresar'] }
    );

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'cliente@bike.co' },
    });
    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'ClaveErrada123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar a mi cuenta' }));

    await waitFor(() =>
      expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy()
    );
    vistaLogin.unmount();

    // Checkout 409 PRECIO_ACTUALIZADO
    renderConRouterYAuth(
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
      </Routes>,
      { initialEntries: ['/checkout'] }
    );

    const dirInput = await screen.findByLabelText(/Dirección completa de entrega/i);
    fireEvent.change(dirInput, { target: { value: 'Carrera 43A # 1-50, Medellín' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido y reservar inventario' }));

    await waitFor(() =>
      expect(screen.getByText('Actualización de precios en el catálogo')).toBeTruthy()
    );
    expect(screen.getAllByText(/4\.500\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it('actualiza etiquetas SEO robots/Open Graph por ruta pública y privada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, datos: [] }), { status: 200 }))
    );

    const vPublica = renderConRouterYAuth(
      <Routes>
        <Route path="/" element={<InicioPage />} />
      </Routes>,
      { initialEntries: ['/'] }
    );

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'index, follow'
      )
    );
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Inicio | BikeStore'
    );
    vPublica.unmount();

    renderConRouterYAuth(
      <Routes>
        <Route path="/admin" element={<AdminResumenPage />} />
      </Routes>,
      { initialEntries: ['/admin'] }
    );

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow'
      )
    );
  });

  it('auto-cierra notificaciones en ToastRegion tras 4500 ms y pausa al enfocar o hacer hover', () => {
    vi.useFakeTimers();
    const onDescartar = vi.fn();

    render(
      <ToastRegion
        notifs={[{ id: 't1', tipo: 'exito', mensaje: 'Producto agregado.' }]}
        onDescartar={onDescartar}
      />
    );

    const region = screen.getByLabelText('Notificaciones');
    fireEvent.mouseEnter(region);
    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_TOAST_MS + 1000);
    });
    expect(onDescartar).not.toHaveBeenCalled();

    fireEvent.mouseLeave(region);
    fireEvent.focus(region);
    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_TOAST_MS + 1000);
    });
    expect(onDescartar).not.toHaveBeenCalled();

    fireEvent.blur(region, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_TOAST_MS - 100);
    });
    expect(onDescartar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onDescartar).toHaveBeenCalledTimes(1);
    expect(onDescartar).toHaveBeenCalledWith('t1');
  });

  it('ejecuta window.scrollTo(0, 0) al cambiar pathname, extrae detalles[0].message en 400 Zod y evita doble GET /carrito al recargar', async () => {
    const scrollSpy = vi.fn();
    vi.stubGlobal('scrollTo', scrollSpy);

    function NavegadorPrueba() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/otra')}>
          Cambiar ruta
        </button>
      );
    }

    const vScroll = render(
      <MemoryRouter initialEntries={['/inicial']}>
        <ScrollToTop />
        <Routes>
          <Route path="/inicial" element={<NavegadorPrueba />} />
          <Route path="/otra" element={<p>Ruta destino</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(scrollSpy).toHaveBeenCalledWith(0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar ruta' }));
    await waitFor(() => expect(screen.getByText('Ruta destino')).toBeTruthy());
    expect(scrollSpy).toHaveBeenCalledTimes(2);
    vScroll.unmount();

    // Error 400 VALIDACION_INVALIDA sin mensaje raíz pero con detalles[0].message
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            codigo: 'VALIDACION_INVALIDA',
            detalles: [{ path: 'imagen_url', message: 'No se permiten imágenes SVG.' }],
          }),
          { status: 400 }
        )
      )
    );
    await expect(apiRequest('/admin/productos', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      codigo: 'VALIDACION_INVALIDA',
      mensaje: 'No se permiten imágenes SVG.',
    });

    // Rehidratación sobre /carrito solo realiza 1 GET /api/carrito
    localStorage.setItem(REFRESH_UID_KEY, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    let getCarritoCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.endsWith('/auth/refresh')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-rehid',
                expires_in: 900,
                rotacion_uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                usuario: { id_usuario: 9, nombre: 'Ana', rol: 'CLIENTE' },
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/carrito')) {
          getCarritoCount += 1;
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                items: [
                  {
                    id_producto: 3,
                    nombre: 'Casco Ruta',
                    cantidad: 1,
                    precio_unidad: '250000.00',
                    subtotal: '250000.00',
                    existencias: 4,
                    disponible: true,
                  },
                ],
                total: '250000.00',
              },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true, datos: {} }), { status: 200 });
      })
    );

    renderConRouterYAuth(
      <Routes>
        <Route path="/carrito" element={<CarritoPage />} />
      </Routes>,
      { initialEntries: ['/carrito'] }
    );

    await waitFor(() => expect(screen.getByText('Casco Ruta')).toBeTruthy());
    expect(getCarritoCount).toBe(1);
  });
});
