import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCard } from '../src/components/ProductCard.jsx';

describe('ProductCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('muestra precio COP, unidades y habilita "Agregar al carrito" cuando hay stock', () => {
    const onAgregar = vi.fn();
    const producto = {
      id_producto: 12,
      categoria_nombre: 'Bicicletas de Ruta',
      nombre: 'Ruta Carbono 105',
      precio: '5800000.00',
      existencias: 4,
      agotado: false,
      imagen_url: 'https://cdn.example.com/ruta.jpg',
    };

    render(
      <MemoryRouter>
        <ProductCard producto={producto} onAgregar={onAgregar} priority />
      </MemoryRouter>
    );

    const img = screen.getByRole('img', { name: 'Ruta Carbono 105' });
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('loading')).toBeNull();

    expect(screen.getByText(/5\.800\.000/)).toBeTruthy();
    expect(screen.getByText('4 unidades disponibles')).toBeTruthy();

    const btn = screen.getByRole('button', { name: /Agregar al carrito/i });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAgregar).toHaveBeenCalledTimes(1);
    expect(onAgregar).toHaveBeenCalledWith(producto);
  });

  it('inhabilita compra y muestra etiqueta "Agotado" cuando existencias = 0 o agotado = true', () => {
    const onAgregar = vi.fn();
    const productoAgotado = {
      id_producto: 15,
      categoria_nombre: 'Cascos y Protección',
      nombre: 'Casco Enduro Pro',
      precio: '420000.00',
      existencias: 0,
      agotado: true,
      imagen_url: 'https://cdn.example.com/casco.jpg',
    };

    render(
      <MemoryRouter>
        <ProductCard producto={productoAgotado} onAgregar={onAgregar} />
      </MemoryRouter>
    );

    const img = screen.getByRole('img', { name: 'Casco Enduro Pro' });
    expect(img.getAttribute('loading')).toBe('lazy');

    expect(screen.getAllByText('Agotado').length).toBeGreaterThanOrEqual(2);
    const btn = screen.getByRole('button', { name: 'Agotado' });
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onAgregar).not.toHaveBeenCalled();
  });

  it('usa respaldo vectorial SVG cuando falta imagen_url o falla la descarga', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ProductCard
          producto={{
            id_producto: 20,
            nombre: 'Guantes Gel',
            precio: '95000.00',
            existencias: 10,
            agotado: false,
            imagen_url: 'https://cdn.example.com/roto.jpg',
          }}
        />
      </MemoryRouter>
    );

    const img = screen.getByRole('img', { name: 'Guantes Gel' });
    fireEvent.error(img);
    expect(screen.getByLabelText('Sin imagen disponible para Guantes Gel')).toBeTruthy();

    rerender(
      <MemoryRouter>
        <ProductCard
          producto={{
            id_producto: 21,
            nombre: 'Luz LED Trasera',
            precio: '65000.00',
            existencias: 6,
            agotado: false,
            imagen_url: '',
          }}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Sin imagen disponible para Luz LED Trasera')).toBeTruthy();
  });
});
