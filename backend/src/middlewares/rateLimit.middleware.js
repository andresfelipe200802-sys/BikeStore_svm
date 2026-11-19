import rateLimit, { MemoryStore } from 'express-rate-limit';
import env from '../config/env.js';

const stores = [];

function createAuthLimiter() {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store,
    keyGenerator: (req) => {
      const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
      return `${req.ip}:${req.path}:${correo}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        ok: false,
        codigo: 'RATE_LIMIT_EXCEDIDO',
        mensaje: 'Demasiados intentos. Por favor intenta nuevamente más tarde.',
      });
    },
  });
}

export const loginLimiter = createAuthLimiter();
export const registroLimiter = createAuthLimiter();
export const recuperarLimiter = createAuthLimiter();
export const restablecerLimiter = createAuthLimiter();
export const refreshLimiter = createAuthLimiter();

export function resetRateLimiters() {
  for (const store of stores) {
    if (typeof store.resetAll === 'function') {
      store.resetAll();
    }
  }
}
