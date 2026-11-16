import { useCallback, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Footer } from './components/Footer.jsx';
import { Navbar } from './components/Navbar.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { ToastRegion } from './components/ToastRegion.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { AdminCategoriasPage } from './pages/admin/AdminCategoriasPage.jsx';
import { AdminPedidosPage } from './pages/admin/AdminPedidosPage.jsx';
import { AdminProductosPage } from './pages/admin/AdminProductosPage.jsx';
import { AdminResumenPage } from './pages/admin/AdminResumenPage.jsx';
import { AdminRetractosPage } from './pages/admin/AdminRetractosPage.jsx';
import { AdminUsuariosPage } from './pages/admin/AdminUsuariosPage.jsx';
import { CheckoutPage } from './pages/client/CheckoutPage.jsx';
import { DetallePedidoPage } from './pages/client/DetallePedidoPage.jsx';
import { MisPedidosPage } from './pages/client/MisPedidosPage.jsx';
import { MisRetractosPage } from './pages/client/MisRetractosPage.jsx';
import { PagoPedidoPage } from './pages/client/PagoPedidoPage.jsx';
import { RetractoDetallePage } from './pages/client/RetractoDetallePage.jsx';
import { SolicitarRetractoPage } from './pages/client/SolicitarRetractoPage.jsx';
import { CarritoPage } from './pages/public/CarritoPage.jsx';
import { CatalogoPage } from './pages/public/CatalogoPage.jsx';
import { InicioPage } from './pages/public/InicioPage.jsx';
import { LoginPage } from './pages/public/LoginPage.jsx';
import { NoEncontradoPage } from './pages/public/NoEncontradoPage.jsx';
import { ProductoDetallePage } from './pages/public/ProductoDetallePage.jsx';
import { RecuperarPage } from './pages/public/RecuperarPage.jsx';
import { RegistroPage } from './pages/public/RegistroPage.jsx';
import { RestablecerPage } from './pages/public/RestablecerPage.jsx';
import { PerfilPage } from './pages/shared/PerfilPage.jsx';

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
      <a className="enlace-saltar" href="#contenido-principal">
        Saltar al contenido principal
      </a>

      <Navbar onNotificar={agregarNotif} />

      <main id="contenido-principal">
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
      </main>

      <Footer />
      <ToastRegion notifs={notifs} onDescartar={descartarNotif} />
    </AuthProvider>
  );
}
