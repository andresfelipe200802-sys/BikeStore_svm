import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  authApi,
  carritoApi,
  perfilApi,
  setAuthInvalidatedHandler,
  setAuthRefresher,
  setAuthTokenProvider,
} from '../api/client.js';
import {
  crearCoordinadorRefresh,
  generarUuidAleatorio,
  guardarRefreshUid,
  limpiarRefreshUid,
  obtenerRefreshUid,
} from '../utils/refreshSync.js';
import {
  VISITOR_CART_KEY,
  construirPayloadFusion,
  contarUnidadesVisitante,
  limpiarCarritoVisitante,
} from '../utils/visitorCart.js';

export const PENDING_FUSION_KEY = 'bikestore_pending_fusion_key_v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AuthContext = createContext(null);

function obtenerStorageSeguro() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function calcularFirmaFusion(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const canonicos = [...items]
    .map((it) => [Number(it.id_producto), Number(it.cantidad)])
    .sort((a, b) => a[0] - b[0]);
  return `${payload?.schema_version || 1}:${JSON.stringify(canonicos)}`;
}

function obtenerOGenerarClaveFusionPendiente(payload, userId = null) {
  const firma = calcularFirmaFusion(payload);
  const storage = obtenerStorageSeguro();

  if (storage) {
    try {
      const raw = storage.getItem(PENDING_FUSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const mismoUsuario =
          userId == null || parsed?.userId == null || parsed.userId === userId;
        if (
          parsed?.firma === firma &&
          mismoUsuario &&
          typeof parsed?.key === 'string' &&
          UUID_RE.test(parsed.key)
        ) {
          return parsed.key;
        }
      }
      const nuevaKey = generarUuidAleatorio();
      storage.setItem(
        PENDING_FUSION_KEY,
        JSON.stringify({ key: nuevaKey, firma, userId: userId ?? null })
      );
      return nuevaKey;
    } catch {
      // Modo restringido sin acceso a almacenamiento
    }
  }

  return generarUuidAleatorio();
}

function limpiarClaveFusionPendiente() {
  const storage = obtenerStorageSeguro();
  if (!storage) return;
  try {
    storage.removeItem(PENDING_FUSION_KEY);
  } catch {
    // Sin efecto
  }
}

export function AuthProvider({ children, onAvisoSesion }) {
  // Solo consultamos localStorage por indicio de sesión refresh; el Access JWT vive únicamente en memoria React.
  const tieneRefreshPrevio = useMemo(() => Boolean(obtenerRefreshUid()), []);
  const [token, setToken] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(tieneRefreshPrevio);
  const [cantidadCarrito, setCantidadCarrito] = useState(() => contarUnidadesVisitante());

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const usuarioRef = useRef(usuario);
  usuarioRef.current = usuario;
  const avisoSesionRef = useRef(onAvisoSesion);
  avisoSesionRef.current = onAvisoSesion;
  const coordinadorRef = useRef(null);
  const carritoEnVueloRef = useRef(null);
  const carritoRecienteRef = useRef(null);

  const actualizarCantidadCarrito = useCallback((valor) => {
    carritoRecienteRef.current = null;
    setCantidadCarrito(valor);
  }, []);

  const consumirCarritoReciente = useCallback(() => {
    const rec = carritoRecienteRef.current;
    carritoRecienteRef.current = null;
    if (!rec || Date.now() - rec.at > 2000) return null;
    return rec.datos;
  }, []);

  const limpiarEstadoSesion = useCallback(
    ({ limpiarRefresh = true, difundir = true, motivo = 'LOGOUT' } = {}) => {
      tokenRef.current = null;
      usuarioRef.current = null;
      carritoRecienteRef.current = null;
      carritoEnVueloRef.current = null;
      setToken(null);
      setUsuario(null);
      if (limpiarRefresh) {
        limpiarRefreshUid();
      }
      if (difundir) {
        coordinadorRef.current?.difundirSesionCerrada(motivo);
      }
      setCantidadCarrito(contarUnidadesVisitante());
    },
    []
  );

  const establecerSesion = useCallback(
    (nuevoToken, nuevoUsuario, rotacionUid = null, { difundir = false } = {}) => {
      tokenRef.current = nuevoToken;
      usuarioRef.current = nuevoUsuario;
      setToken(nuevoToken);
      setUsuario(nuevoUsuario);
      if (rotacionUid) {
        guardarRefreshUid(rotacionUid);
      }
      if (difundir && nuevoToken) {
        coordinadorRef.current?.difundirTokenActualizado({
          token: nuevoToken,
          usuario: nuevoUsuario,
          rotacionUid: rotacionUid || obtenerRefreshUid(),
        });
      }
    },
    []
  );

  const sincronizarContadorCarrito = useCallback(
    async (jwtOverride, rolOverride) => {
      const jwt = jwtOverride !== undefined ? jwtOverride : tokenRef.current;
      const rol = rolOverride !== undefined ? rolOverride : usuarioRef.current?.rol;
      if (!jwt) {
        carritoRecienteRef.current = null;
        setCantidadCarrito(contarUnidadesVisitante());
        return null;
      }
      if (rol !== 'CLIENTE') {
        carritoRecienteRef.current = null;
        setCantidadCarrito(0);
        return null;
      }
      if (carritoEnVueloRef.current) {
        return carritoEnVueloRef.current;
      }
      const promesa = (async () => {
        try {
          const resp = await carritoApi.obtener(jwt);
          const datos = resp?.datos || null;
          const items = datos?.items || [];
          if (datos) {
            carritoRecienteRef.current = { datos, at: Date.now() };
          }
          setCantidadCarrito(items.reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
          return datos;
        } catch {
          // Conserva el contador previo ante fallos transitorios de red
          return null;
        } finally {
          carritoEnVueloRef.current = null;
        }
      })();
      carritoEnVueloRef.current = promesa;
      return promesa;
    },
    []
  );

  useEffect(() => {
    const coordinador = crearCoordinadorRefresh();
    coordinadorRef.current = coordinador;

    setAuthTokenProvider(() => tokenRef.current);

    setAuthRefresher(async (tokenFallido) => {
      // Si otra pestaña ya actualizó el token en memoria mientras esta petición estaba en vuelo
      if (tokenRef.current && tokenFallido && tokenRef.current !== tokenFallido) {
        return tokenRef.current;
      }
      if (!obtenerRefreshUid()) {
        throw new ApiError(401, 'SESION_EXPIRADA', 'Tu sesión ha expirado. Inicia sesión nuevamente.');
      }

      const datos = await coordinador.ejecutarRefreshCoordinado(
        async (idempotencyKey) => {
          const resp = await authApi.refresh(idempotencyKey);
          return resp?.datos;
        },
        { tokenFallido }
      );

      if (!datos?.token) {
        throw new ApiError(401, 'SESION_EXPIRADA', 'Tu sesión ya no es válida. Inicia sesión nuevamente.');
      }

      establecerSesion(
        datos.token,
        datos.usuario ?? usuarioRef.current,
        datos.rotacion_uid ?? obtenerRefreshUid(),
        { difundir: false }
      );
      return datos.token;
    });

    setAuthInvalidatedHandler((err) => {
      const habiaSesion = Boolean(tokenRef.current || obtenerRefreshUid());
      if (!habiaSesion) return;
      limpiarEstadoSesion({
        limpiarRefresh: true,
        difundir: true,
        motivo: err?.codigo || 'SESION_INVALIDA',
      });
      avisoSesionRef.current?.({
        tipo: 'alerta',
        mensaje: err?.mensaje || 'Tu sesión ya no es válida. Inicia sesión nuevamente.',
      });
    });

    const desuscribirSync = coordinador.suscribirSyncAuth({
      onTokenActualizado: ({ token: nuevoToken, usuario: nuevoUsuario, rotacion_uid: nuevoUid }) => {
        if (!nuevoToken) return;
        const habiaUsuario = Boolean(tokenRef.current);
        establecerSesion(
          nuevoToken,
          nuevoUsuario ?? usuarioRef.current,
          nuevoUid ?? obtenerRefreshUid(),
          { difundir: false }
        );
        if (!habiaUsuario && nuevoUsuario?.rol === 'CLIENTE') {
          sincronizarContadorCarrito(nuevoToken, 'CLIENTE');
        }
      },
      onSesionCerrada: () => {
        const habiaSesion = Boolean(tokenRef.current);
        limpiarEstadoSesion({ limpiarRefresh: false, difundir: false });
        if (habiaSesion) {
          avisoSesionRef.current?.({
            tipo: 'info',
            mensaje: 'La sesión se cerró en otra pestaña.',
          });
        }
      },
    });

    return () => {
      desuscribirSync();
      coordinador.destruir();
      if (coordinadorRef.current === coordinador) {
        coordinadorRef.current = null;
      }
      setAuthTokenProvider(() => null);
      setAuthRefresher(null);
      setAuthInvalidatedHandler(null);
    };
  }, [establecerSesion, limpiarEstadoSesion, sincronizarContadorCarrito]);

  // Rehidratación silenciosa SOLO si existe `bs_refresh_uid` en localStorage (cero 401 espurios para anónimos)
  useEffect(() => {
    if (!tieneRefreshPrevio) return undefined;
    let cancelado = false;

    (async () => {
      try {
        const coordinador = coordinadorRef.current;
        if (!coordinador || !obtenerRefreshUid()) {
          return;
        }
        const datos = await coordinador.ejecutarRefreshCoordinado(async (idempotencyKey) => {
          const resp = await authApi.refresh(idempotencyKey);
          return resp?.datos;
        });
        if (cancelado) return;

        if (!datos?.token || !datos?.usuario) {
          limpiarEstadoSesion({ limpiarRefresh: true, difundir: false });
          return;
        }

        establecerSesion(datos.token, datos.usuario, datos.rotacion_uid, { difundir: false });
        if (datos.usuario?.rol === 'CLIENTE') {
          await sincronizarContadorCarrito(datos.token, 'CLIENTE');
        } else {
          setCantidadCarrito(0);
        }
      } catch {
        if (!cancelado) {
          // Limpieza silenciosa en arranque: nunca muestra toast alarmante al recargar
          limpiarEstadoSesion({ limpiarRefresh: true, difundir: false });
        }
      } finally {
        if (!cancelado) setCargandoSesion(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [tieneRefreshPrevio, establecerSesion, limpiarEstadoSesion, sincronizarContadorCarrito]);

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
      const { token: nuevoToken, rotacion_uid: rotacionUid, usuario: nuevoUsuario } = resp.datos;

      if (rotacionUid) {
        guardarRefreshUid(rotacionUid);
      }

      let ajustesFusion = [];
      let cantidadFinal = 0;
      let seFusiono = false;

      if (nuevoUsuario?.rol === 'CLIENTE') {
        const payloadFusion = construirPayloadFusion();
        if (payloadFusion.items.length > 0) {
          const claveFusion = obtenerOGenerarClaveFusionPendiente(
            payloadFusion,
            nuevoUsuario?.id_usuario
          );
          const fusionResp = await carritoApi.fusionar(payloadFusion, claveFusion, nuevoToken);
          limpiarClaveFusionPendiente();
          limpiarCarritoVisitante();
          seFusiono = true;
          ajustesFusion = fusionResp?.datos?.ajustes || [];
          if (fusionResp?.datos) {
            carritoRecienteRef.current = { datos: fusionResp.datos, at: Date.now() };
          }
          const itemsFinales = fusionResp?.datos?.items || [];
          cantidadFinal = itemsFinales.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
        } else {
          limpiarClaveFusionPendiente();
        }
      }

      establecerSesion(nuevoToken, nuevoUsuario, rotacionUid, { difundir: true });

      if (nuevoUsuario?.rol === 'CLIENTE') {
        if (seFusiono) {
          setCantidadCarrito(cantidadFinal);
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
   * limpia sesión local, limpia `bs_refresh_uid` y difunde cierre entre pestañas.
   */
  const cambiarContrasena = useCallback(
    async ({ contrasena_actual, nueva_contrasena }) => {
      const resp = await perfilApi.cambiarContrasena({ contrasena_actual, nueva_contrasena });
      limpiarEstadoSesion({ limpiarRefresh: true, difundir: true, motivo: 'CAMBIO_PASSWORD' });
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
    const hayRefresh = Boolean(obtenerRefreshUid());
    try {
      if (jwt || hayRefresh) {
        await authApi.logout(jwt);
      }
    } catch {
      // Mantiene limpieza local garantizada incluso si el token ya expiró
    } finally {
      limpiarEstadoSesion({ limpiarRefresh: true, difundir: true, motivo: 'LOGOUT' });
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
      usuarioRef.current = combinado;
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
      setCantidadCarrito: actualizarCantidadCarrito,
      sincronizarContadorCarrito,
      consumirCarritoReciente,
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
      actualizarCantidadCarrito,
      sincronizarContadorCarrito,
      consumirCarritoReciente,
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
