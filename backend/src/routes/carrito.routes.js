import { Router } from 'express';
import { z } from 'zod';
import * as carritoController from '../controllers/carrito.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

const fusionarSchema = z
  .object({
    schema_version: z.literal(1),
    items: z
      .array(
        z
          .object({
            id_producto: z.coerce.number().int().positive(),
            cantidad: z.coerce.number().int().positive().max(1000),
          })
          .strict()
      )
      .max(100),
  })
  .strict();

const addItemSchema = z
  .object({
    id_producto: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive().max(1000),
  })
  .strict();

const patchItemSchema = z
  .object({
    cantidad: z.coerce.number().int().positive().max(1000),
  })
  .strict();

const idProductoParam = z.object({
  id_producto: z.coerce.number().int().positive(),
});

router.use(authenticate, requireRole('CLIENTE'));

router.get('/', carritoController.getCarrito);
router.post('/fusionar', validate({ body: fusionarSchema }), carritoController.fusionarCarrito);
router.post('/items', validate({ body: addItemSchema }), carritoController.addItem);
router.patch(
  '/items/:id_producto',
  validate({ params: idProductoParam, body: patchItemSchema }),
  carritoController.updateItem
);
router.delete('/items/:id_producto', validate({ params: idProductoParam }), carritoController.deleteItem);

export default router;
