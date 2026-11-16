import { Router } from 'express';
import { z } from 'zod';
import * as perfilController from '../controllers/perfil.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

const updatePerfilSchema = z
  .object({
    nombre: z.string().trim().min(2).max(100),
    primer_apellido: z.string().trim().min(2).max(100),
    segundo_apellido: z.string().trim().min(1).max(100).nullable().optional(),
    telefono: z.string().trim().min(7).max(20),
  })
  .strict();

const passwordSchema = z
  .object({
    contrasena_actual: z.string().min(1).max(100),
    nueva_contrasena: z.string().min(8).max(100),
  })
  .strict();

router.use(authenticate);
router.get('/', perfilController.getPerfil);
router.put('/', validate({ body: updatePerfilSchema }), perfilController.putPerfil);
router.patch('/contrasena', validate({ body: passwordSchema }), perfilController.patchContrasena);

export default router;
