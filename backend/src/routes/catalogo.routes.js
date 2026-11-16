import { Router } from 'express';
import { z } from 'zod';
import * as catalogoController from '../controllers/catalogo.controller.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

const listProductosQuery = z
  .object({
    id_categoria: z.coerce.number().int().positive().optional(),
    q: z.string().trim().max(100).optional(),
    orden_precio: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.get('/categorias', catalogoController.getCategorias);
router.get('/productos', validate({ query: listProductosQuery }), catalogoController.getProductos);
router.get('/productos/:id', validate({ params: idParamSchema }), catalogoController.getProductoPorId);

export default router;
