import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  authApi,
  carritoApi,
  perfilApi,
  setAuthInvalidatedHandler,
  setAuthTokenProvider,
} from '../api/client.js';
import {
  VISITOR_CART_KEY,
  construirPayloadFusion,
  contarUnidadesVisitante,
  limpiarCarritoVisitante,
} from '../utils/visitorCart.js';

const SESSION_KEY = 'bikestore_session_v1';

const AuthContext = createContext(null);

function leerSesionGuardada() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.usuario?.rol) return null;
    return parsed;
  } catch {
    return null;
  }
}

function guardarSesion(sesion) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (!sesion) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
    }
  } catch {
    // Modo restringido sin acceso a almacenamiento
  }
}

export function AuthProvider({ children, onAvisoSesion }) {
  const sesionInicial = useMemo(() => leerSesionGuardada(), []);
  const [token, setToken] = useState(sesionInicial?.token ?? null);
  const [usuario, setUsuario] = useState(sesionInicial?.usuario ?? null);
  const [cargandoSesion, setCargandoSesion] = useState(Boolean(sesionInicial?.token));
  const [cantidadCarrito, setCantidadCarrito] = useState(() =>
    sesionInicial?.token ? 0 : contarUnidadesVisitante()
  );

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const avisoSesionRef = useRef(onAvisoSesion);
  avisoSesionRef.current = onAvisoSesion;

  const limpiarEstadoSesion = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setUsuario(null);
    guardarSesion(null);
    setCantidadCarrito(contarUnidadesVisitante());
  }, []);

  const establecerSesion = useCallback((nuevoToken, nuevoUsuario) => {
    tokenRef.current = nuevoToken;
    setToken(nuevoToken);
    setUsuario(nuevoUsuario);
    guardarSesion({ token: nuevoToken, usuario: nuevoUsuario });
  }, []);

  const sincronizarContadorCarrito = useCallback(
    async (jwtOverride, rolOverride) => {
      const jwt = jwtOverride !== undefined ? jwtOverride : tokenRef.current;
      const rol = rolOverride !== undefined ? rolOverride : usuario?.rol;
      if (!jwt) {
        setCantidadCarrito(contarUnidadesVisitante());
        return;
      }
      if (rol !== 'CLIENTE') {
        setCantidadCarrito(0);
        return;
      }
      try {
        const resp = await carritoApi.obtener(jwt);
        const items = resp?.datos?.items || [];
        setCantidadCarrito(items.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
      } catch {
        // Conserva el contador previo ante fallos transitorios de red
      }
    },
    [usuario?.rol]
  );

  useEffect(() => {
    setAuthTokenProvider(() => tokenRef.current);
    setAuthInvalidatedHandler((err) => {
      if (!tokenRef.current) return;
      limpiarEstadoSesion();
      avisoSesionRef.current?.({
        tipo: 'alerta',
        mensaje: err?.mensaje || 'Tu sesión ya no es válida. Inicia sesión nuevamente.',
      });
    });

    return () => {
      setAuthTokenProvider(() => null);
      setAuthInvalidatedHandler(null);
    };
  }, [limpiarEstadoSesion]);

  // Rehidrata usuario contra GET /api/perfil al arrancar con sesión en sessionStorage
  useEffect(() => {
    if (!sesionInicial?.token) return undefined;
    let cancelado = false;

    (async () => {
      try {
        const resp = await perfilApi.obtener(sesionInicial.token);
        if (cancelado) return;
        establecerSesion(sesionInicial.token, resp.datos);
        if (resp.datos?.rol === 'CLIENTE') {
          await sincronizarContadorCarrito(sesionInicial.token, 'CLIENTE');
        }
      } catch {
        if (!cancelado) {
          limpiarEstadoSesion();
        }
      } finally {
        if (!cancelado) setCargandoSesion(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [sesionInicial?.token, establecerSesion, limpiarEstadoSesion, sincronizarContadorCarrito]);

  // Sincroniza contador en modo visitante entre pestañas del navegador
  useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key === VISITOR_CART_KEY && !tokenRef.current) {
        setCantidadCarrito(contarUnidadesVisitante());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const iniciarSesion = useCallback(
    async ({ correo, contrasena }) => {
      const resp = await authApi.login({ correo, contrasena });
      const { token: nuevoToken, usuario: nuevoUsuario } = resp.datos;
      establecerSesion(nuevoToken, nuevoUsuario);

      let ajustesFusion = [];
      if (nuevoUsuario?.rol === 'CLIENTE') {
        const payloadFusion = construirPayloadFusion();
        if (payloadFusion.items.length > 0) {
          const fusionResp = await carritoApi.fusionar(
            payloadFusion,
            crypto.randomUUID(),
            nuevoToken
          );
          limpiarCarritoVisitante();
          ajustesFusion = fusionResp?.datos?.ajustes || [];
          const itemsFinales = fusionResp?.datos?.items || [];
          setCantidadCarrito(itemsFinales.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
        } else {
          await sincronizarContadorCarrito(nuevoToken, 'CLIENTE');
        }
      } else {
        // Un ADMIN no invoca /api/carrito/fusionar (evita 403 ROL_NO_AUTORIZADO)
        setCantidadCarrito(0);
      }

      return { usuario: nuevoUsuario, ajustesFusion };
    },
    [establecerSesion, sincronizarContadorCarrito]
  );

  /**
   * POST /api/auth/registro responde 201 sin JWT; encadena login automático para emitir JWT
   * y fusionar carrito visitante cuando corresponda.
   */
  const registrarCliente = useCallback(
    async (datosRegistro) => {
      const regResp = await authApi.registro(datosRegistro);
      const resultadoLogin = await iniciarSesion({
        correo: datosRegistro.correo,
        contrasena: datosRegistro.contrasena,
      });
      return {
        registrado: regResp.datos,
        ...resultadoLogin,
      };
    },
    [iniciarSesion]
  );

  /**
   * PATCH /api/perfil/contrasena incrementa token_version sin emitir nuevo token;
   * limpia sesión local al recibir 200.
   */
  const cambiarContrasena = useCallback(
    async ({ contrasena_actual, nueva_contrasena }) => {
      const resp = await perfilApi.cambiarContrasena({ contrasena_actual, nueva_contrasena });
      limpiarEstadoSesion();
      avisoSesionRef.current?.({
        tipo: 'exito',
        mensaje:
          resp?.datos?.mensaje ||
          'Contraseña actualizada. Por seguridad, inicia sesión con tu nueva contraseña.',
      });
      return resp;
    },
    [limpiarEstadoSesion]
  );

  const cerrarSesion = useCallback(async () => {
    const jwt = tokenRef.current;
    try {
      if (jwt) {
        await authApi.logout(jwt);
      }
    } catch {
      // Mantiene limpieza local garantizada incluso si el token ya expiró
    } finally {
      limpiarEstadoSesion();
    }
  }, [limpiarEstadoSesion]);

  const actualizarUsuarioLocal = useCallback((datosParciales) => {
    setUsuario((prev) => {
      const combinado = {
        ...(prev || {}),
        ...(datosParciales || {}),
        // Conserva rol cuando PUT /api/perfil no lo devuelve en RETURNING
        rol: datosParciales?.rol || prev?.rol,
      };
      if (tokenRef.current) {
        guardarSesion({ token: tokenRef.current, usuario: combinado });
      }
      return combinado;
    });
  }, []);

  const value = useMemo(
    () => ({
      token,
      usuario,
      estaAutenticado: Boolean(token && usuario),
      esCliente: usuario?.rol === 'CLIENTE',
      esAdmin: usuario?.rol === 'ADMIN',
      cargandoSesion,
      cantidadCarrito,
      setCantidadCarrito,
      sincronizarContadorCarrito,
      iniciarSesion,
      registrarCliente,
      cambiarContrasena,
      cerrarSesion,
      limpiarEstadoSesion,
      actualizarUsuarioLocal,
    }),
    [
      token,
      usuario,
      cargandoSesion,
      cantidadCarrito,
      sincronizarContadorCarrito,
      iniciarSesion,
      registrarCliente,
      cambiarContrasena,
      cerrarSesion,
      limpiarEstadoSesion,
      actualizarUsuarioLocal,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  }
  return ctx;
}
