import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { toHaveNoViolations } from 'vitest-axe/matchers';
import { ConfirmDialog } from '../src/components/ConfirmDialog.jsx';
import { Footer } from '../src/components/Footer.jsx';
import { Navbar } from '../src/components/Navbar.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CarritoPage } from '../src/pages/public/CarritoPage.jsx';
import { CatalogoPage } from '../src/pages/public/CatalogoPage.jsx';
import { InicioPage } from '../src/pages/public/InicioPage.jsx';
import { LoginPage } from '../src/pages/public/LoginPage.jsx';
import { REFRESH_UID_KEY, reiniciarEstadoSyncParaTests } from '../src/utils/refreshSync.js';
import { agregarItemVisitante } from '../src/utils/visitorCart.js';

expect.extend({ toHaveNoViolations });

describe('Accesibilidad automatizada (vitest-axe / axe-core)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    reiniciarEstadoSyncParaTests();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    reiniciarEstadoSyncParaTests();
  });

  it('Navbar no presenta violaciones de accesibilidad (anónimo y autenticado con carrito)', async () => {
    agregarItemVisitante(5, 3);
    vi.stubGlobal('fetch', vi.fn());

    const { container, unmount } = render(
      <MemoryRouter>
        <AuthProvider>
          <Navbar />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('3')).toBeTruthy();
    const resAnon = await axe(container);
    expect(resAnon).toHaveNoViolations();
    unmount();

    // Autenticado como CLIENTE con insignia en carrito
    localStorage.setItem(REFRESH_UID_KEY, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.endsWith('/auth/refresh')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: {
                token: 'jwt-client',
                expires_in: 900,
                rotacion_uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                usuario: { id_usuario: 1, nombre: 'Mateo', rol: 'CLIENTE' },
              },
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ ok: true, datos: { items: [{ id_producto: 2, cantidad: 2 }] } }),
          { status: 200 }
        );
      })
    );

    const vistaAuth = render(
      <MemoryRouter>
        <AuthProvider>
          <Navbar />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Cuenta (Mateo)')).toBeTruthy());
    const resAuth = await axe(vistaAuth.container);
    expect(resAuth).toHaveNoViolations();
  });

  it('Footer no presenta violaciones de accesibilidad', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <Footer />
        </AuthProvider>
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('InicioPage no presenta violaciones de accesibilidad con categorías y productos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.includes('/categorias')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: [
                { id_categoria: 1, nombre: 'Bicicletas de Ruta', descripcion: 'Aerodinámica en asfalto.' },
                { id_categoria: 2, nombre: 'Cascos', descripcion: 'Protección certificada.' },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            datos: [
              {
                id_producto: 10,
                categoria_nombre: 'Bicicletas de Ruta',
                nombre: 'BikeStore Carbono Pro',
                precio: '6400000.00',
                existencias: 3,
                agotado: false,
                imagen_url: 'https://cdn.example.com/bici.jpg',
              },
              {
                id_producto: 11,
                categoria_nombre: 'Cascos',
                nombre: 'Casco Urbano Lite',
                precio: '280000.00',
                existencias: 0,
                agotado: true,
                imagen_url: '',
              },
            ],
          }),
          { status: 200 }
        );
      })
    );

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <main>
            <InicioPage />
          </main>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('BikeStore Carbono Pro')).toBeTruthy());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('LoginPage no presenta violaciones de accesibilidad', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <main>
            <LoginPage />
          </main>
        </AuthProvider>
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('CarritoPage no presenta violaciones de accesibilidad en modo visitante hidratado', async () => {
    agregarItemVisitante(7, 2);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            datos: {
              id_producto: 7,
              nombre: 'Guantes Ciclismo Gel',
              precio: '95000.00',
              existencias: 8,
              agotado: false,
              imagen_url: 'https://cdn.example.com/guantes.jpg',
            },
          }),
          { status: 200 }
        )
      )
    );

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <main>
            <CarritoPage />
          </main>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Guantes Ciclismo Gel')).toBeTruthy());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('ConfirmDialog abierto no presenta violaciones de accesibilidad', async () => {
    const { container } = render(
      <ConfirmDialog
        abierto
        titulo="¿Confirmar cancelación del pedido #15?"
        mensaje="Se restituirá el inventario de los artículos reservados."
        etiquetaConfirmar="Confirmar cancelación"
        etiquetaCancelar="Conservar pedido"
        varianteDestructiva
        onConfirmar={() => {}}
        onCancelar={() => {}}
      >
        <div className="campo">
          <label htmlFor="axe-motivo">Motivo opcional</label>
          <input id="axe-motivo" type="text" className="campo-control" />
        </div>
      </ConfirmDialog>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('CatalogoPage cumple jerarquía de encabezados (h1 -> h2 -> h3) y 0 violaciones axe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.includes('/categorias')) {
          return new Response(
            JSON.stringify({
              ok: true,
              datos: [{ id_categoria: 1, nombre: 'Ruta', descripcion: 'Bicicletas de ruta.' }],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            datos: [
              {
                id_producto: 22,
                categoria_nombre: 'Ruta',
                nombre: 'Ruta Aluminio Sora',
                precio: '3200000.00',
                existencias: 5,
                agotado: false,
                imagen_url: 'https://cdn.example.com/sora.jpg',
              },
            ],
            meta: { page: 1, limit: 12, total: 1, total_paginas: 1 },
          }),
          { status: 200 }
        );
      })
    );

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <main>
            <CatalogoPage />
          </main>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Ruta Aluminio Sora')).toBeTruthy());
    const results = await axe(container, {
      rules: {
        'heading-order': { enabled: true },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
