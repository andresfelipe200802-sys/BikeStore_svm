import { Router } from 'express';
import { z } from 'zod';
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

router.use(authenticate, requireRole('CLIENTE'));

router.get('/', validate({ query: listQuery }), retractosController.listarRetractos);
router.get('/:id', validate({ params: idParam }), retractosController.obtenerRetracto);

export default router;
