import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { query } from './config/db.js';
import env from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import carritoRoutes from './routes/carrito.routes.js';
import catalogoRoutes from './routes/catalogo.routes.js';
import pedidosRoutes from './routes/pedidos.routes.js';
import perfilRoutes from './routes/perfil.routes.js';
import retractosRoutes from './routes/retractos.routes.js';

const app = express();

app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    const dbRes = await query(`SELECT NOW() AT TIME ZONE 'UTC' AS tiempo_utc`);
    return res.status(200).json({
      ok: true,
      datos: {
        estado: 'UP',
        bd: true,
        tiempo_utc: dbRes.rows[0].tiempo_utc,
      },
    });
  } catch (err) {
    return next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api', catalogoRoutes);
app.use('/api/carrito', carritoRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/retractos', retractosRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
