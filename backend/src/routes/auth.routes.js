import { Router } from 'express';
import { z } from 'zod';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  loginLimiter,
  recuperarLimiter,
  registroLimiter,
  restablecerLimiter,
} from '../middlewares/rateLimit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { TIPOS_DOCUMENTO } from '../utils/documento.js';

const router = Router();

const registroSchema = z
  .object({
    tipo_documento: z.enum(TIPOS_DOCUMENTO),
    numero_documento: z.string().trim().min(5).max(30),
    nombre: z.string().trim().min(2).max(100),
    primer_apellido: z.string().trim().min(2).max(100),
    segundo_apellido: z.string().trim().min(1).max(100).nullable().optional(),
    telefono: z.string().trim().min(7).max(20),
    correo: z.string().trim().email().max(150),
    contrasena: z.string().min(8).max(100),
  })
  .strict();

const loginSchema = z
  .object({
    correo: z.string().trim().email().max(150),
    contrasena: z.string().min(1).max(100),
  })
  .strict();

const recuperarSchema = z
  .object({
    correo: z.string().trim().email().max(150),
  })
  .strict();

const restablecerSchema = z
  .object({
    token: z.string().trim().min(32).max(128),
    nueva_contrasena: z.string().min(8).max(100),
  })
  .strict();

router.post('/registro', registroLimiter, validate({ body: registroSchema }), authController.registro);
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/recuperar', recuperarLimiter, validate({ body: recuperarSchema }), authController.recuperar);
router.post('/restablecer', restablecerLimiter, validate({ body: restablecerSchema }), authController.restablecer);

export default router;
