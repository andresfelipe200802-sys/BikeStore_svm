import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer.jsx';
import { Navbar } from './components/Navbar.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { ToastRegion } from './components/ToastRegion.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { InicioPage } from './pages/public/InicioPage.jsx';

// Rutas secundarias, privadas y administrativas con carga diferida para proteger LCP inicial.
const CatalogoPage = lazy(() =>
  import('./pages/public/CatalogoPage.jsx').then((m) => ({ default: m.CatalogoPage }))
);
const ProductoDetallePage = lazy(() =>
  import('./pages/public/ProductoDetallePage.jsx').then((m) => ({
    default: m.ProductoDetallePage,
  }))
);
const CarritoPage = lazy(() =>
  import('./pages/public/CarritoPage.jsx').then((m) => ({ default: m.CarritoPage }))
);
const LoginPage = lazy(() =>
  import('./pages/public/LoginPage.jsx').then((m) => ({ default: m.LoginPage }))
);
const RegistroPage = lazy(() =>
  import('./pages/public/RegistroPage.jsx').then((m) => ({ default: m.RegistroPage }))
);
const RecuperarPage = lazy(() =>
  import('./pages/public/RecuperarPage.jsx').then((m) => ({ default: m.RecuperarPage }))
);
const RestablecerPage = lazy(() =>
  import('./pages/public/RestablecerPage.jsx').then((m) => ({ default: m.RestablecerPage }))
);
const NoEncontradoPage = lazy(() =>
  import('./pages/public/NoEncontradoPage.jsx').then((m) => ({ default: m.NoEncontradoPage }))
);

const PerfilPage = lazy(() =>
  import('./pages/shared/PerfilPage.jsx').then((m) => ({ default: m.PerfilPage }))
);

const CheckoutPage = lazy(() =>
  import('./pages/client/CheckoutPage.jsx').then((m) => ({ default: m.CheckoutPage }))
);
const MisPedidosPage = lazy(() =>
  import('./pages/client/MisPedidosPage.jsx').then((m) => ({ default: m.MisPedidosPage }))
);
const DetallePedidoPage = lazy(() =>
  import('./pages/client/DetallePedidoPage.jsx').then((m) => ({ default: m.DetallePedidoPage }))
);
const PagoPedidoPage = lazy(() =>
  import('./pages/client/PagoPedidoPage.jsx').then((m) => ({ default: m.PagoPedidoPage }))
);
const MisRetractosPage = lazy(() =>
  import('./pages/client/MisRetractosPage.jsx').then((m) => ({ default: m.MisRetractosPage }))
);
const RetractoDetallePage = lazy(() =>
  import('./pages/client/RetractoDetallePage.jsx').then((m) => ({
    default: m.RetractoDetallePage,
  }))
);
const SolicitarRetractoPage = lazy(() =>
  import('./pages/client/SolicitarRetractoPage.jsx').then((m) => ({
    default: m.SolicitarRetractoPage,
  }))
);

const AdminResumenPage = lazy(() =>
  import('./pages/admin/AdminResumenPage.jsx').then((m) => ({ default: m.AdminResumenPage }))
);
const AdminCategoriasPage = lazy(() =>
  import('./pages/admin/AdminCategoriasPage.jsx').then((m) => ({
    default: m.AdminCategoriasPage,
  }))
);
const AdminProductosPage = lazy(() =>
  import('./pages/admin/AdminProductosPage.jsx').then((m) => ({
    default: m.AdminProductosPage,
  }))
);
const AdminUsuariosPage = lazy(() =>
  import('./pages/admin/AdminUsuariosPage.jsx').then((m) => ({ default: m.AdminUsuariosPage }))
);
const AdminPedidosPage = lazy(() =>
  import('./pages/admin/AdminPedidosPage.jsx').then((m) => ({ default: m.AdminPedidosPage }))
);
const AdminRetractosPage = lazy(() =>
  import('./pages/admin/AdminRetractosPage.jsx').then((m) => ({ default: m.AdminRetractosPage }))
);

export function CargadorPagina() {
  return (
    <section className="contenedor seccion texto-estado" aria-live="polite" aria-busy="true">
      <p>Cargando vista...</p>
    </section>
  );
}

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Entornos sin scroll nativo
      }
    }
  }, [pathname]);

  return null;
}

export default function App() {
  const [notifs, setNotifs] = useState([]);

  const agregarNotif = useCallback((tipo, mensaje) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotifs((prev) => [...prev.slice(-3), { id, tipo, mensaje }]);
  }, []);

  const descartarNotif = useCallback((id) => {
    setNotifs((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <AuthProvider onAvisoSesion={(ev) => agregarNotif(ev.tipo || 'alerta', ev.mensaje)}>
      <ScrollToTop />
      <a className="enlace-saltar" href="#contenido-principal">
        Saltar al contenido principal
      </a>

      <Navbar onNotificar={agregarNotif} />

      <main id="contenido-principal">
        <Suspense fallback={<CargadorPagina />}>
          <Routes>
            <Route path="/" element={<InicioPage onNotificar={agregarNotif} />} />
            <Route path="/catalogo" element={<CatalogoPage onNotificar={agregarNotif} />} />
            <Route path="/producto/:id" element={<ProductoDetallePage onNotificar={agregarNotif} />} />
            <Route path="/carrito" element={<CarritoPage onNotificar={agregarNotif} />} />
            <Route path="/ingresar" element={<LoginPage onNotificar={agregarNotif} />} />
            <Route path="/registro" element={<RegistroPage onNotificar={agregarNotif} />} />
            <Route path="/recuperar" element={<RecuperarPage />} />
            <Route path="/restablecer-contrasena" element={<RestablecerPage onNotificar={agregarNotif} />} />

            <Route
              path="/perfil"
              element={
                <ProtectedRoute roles={['CLIENTE', 'ADMIN']}>
                  <PerfilPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/checkout"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <CheckoutPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <MisPedidosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/:id"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <DetallePedidoPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/:id/pago"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <PagoPedidoPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/retractos"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <MisRetractosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/retractos/:id"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <RetractoDetallePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/:id/retracto"
              element={
                <ProtectedRoute roles={['CLIENTE']}>
                  <SolicitarRetractoPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminResumenPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/categorias"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminCategoriasPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/productos"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminProductosPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/usuarios"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminUsuariosPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/pedidos"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminPedidosPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/retractos"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminRetractosPage onNotificar={agregarNotif} />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NoEncontradoPage />} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
      <ToastRegion notifs={notifs} onDescartar={descartarNotif} />
    </AuthProvider>
  );
}
