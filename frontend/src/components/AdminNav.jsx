import { NavLink } from 'react-router-dom';

const ENLACES_ADMIN = [
  { ruta: '/admin', etiqueta: 'Resumen y reportes', exacto: true },
  { ruta: '/admin/categorias', etiqueta: 'Categorías' },
  { ruta: '/admin/productos', etiqueta: 'Productos' },
  { ruta: '/admin/usuarios', etiqueta: 'Usuarios' },
  { ruta: '/admin/pedidos', etiqueta: 'Pedidos' },
  { ruta: '/admin/retractos', etiqueta: 'Retractos' },
];

export function AdminNav() {
  return (
    <nav className="admin-nav contenedor" aria-label="Navegación administrativa">
      <ul>
        {ENLACES_ADMIN.map((item) => (
          <li key={item.ruta}>
            <NavLink to={item.ruta} end={Boolean(item.exacto)}>
              {item.etiqueta}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
