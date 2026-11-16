import { Router } from 'express';
import { z } from 'zod';
import * as pedidosController from '../controllers/pedidos.controller.js';
import * as retractosController from '../controllers/retractos.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

const crearPedidoSchema = z
  .object({
    direccion_envio: z.string().trim().min(5).max(255),
  })
  .strict();

const pagarSchema = z
  .object({
    metodo_pago: z.enum(['TARJETA', 'PSE', 'TRANSFERENCIA']),
    referencia_simulada: z.string().trim().min(4).max(40),
  })
  .strict();

const cancelarSchema = z
  .object({
    motivo_cancelacion: z.string().trim().min(3).max(500).optional(),
    datos_reembolso: z.string().trim().min(5).max(500).optional(),
  })
  .strict();

const crearRetractoSchema = z
  .object({
    motivo: z.string().trim().min(5).max(500),
    datos_reembolso: z.string().trim().min(5).max(500),
    items: z
      .array(
        z
          .object({
            id_detalle_pedido: z.coerce.number().int().positive(),
            cantidad: z.coerce.number().int().positive(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

router.use(authenticate, requireRole('CLIENTE'));

router.post('/', validate({ body: crearPedidoSchema }), pedidosController.crearPedido);
router.get('/', validate({ query: listQuery }), pedidosController.listarPedidos);
router.get('/:id', validate({ params: idParam }), pedidosController.obtenerPedido);
router.post('/:id/pagos', validate({ params: idParam, body: pagarSchema }), pedidosController.pagarPedido);
router.post('/:id/cancelar', validate({ params: idParam, body: cancelarSchema }), pedidosController.cancelarPedido);
router.post('/:id/volver-al-carrito', validate({ params: idParam }), pedidosController.volverAlCarrito);
router.post('/:id/retractos', validate({ params: idParam, body: crearRetractoSchema }), retractosController.solicitarRetracto);

export default router;
