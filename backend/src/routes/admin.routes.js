import { Router } from 'express';
import { z } from 'zod';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), 'imagen_url debe comenzar por http:// o https://');

const categoriaBody = z
  .object({
    nombre: z.string().trim().min(2).max(100),
    descripcion: z.string().trim().max(255).nullable().optional(),
  })
  .strict();

const estadoBoolBody = z.object({ estado: z.boolean() }).strict();

const crearProductoBody = z
  .object({
    id_categoria: z.coerce.number().int().positive(),
    nombre: z.string().trim().min(2).max(150),
    descripcion: z.string().trim().min(2).max(5000),
    precio: z.coerce.number().positive(),
    existencias: z.coerce.number().int().min(0),
    imagen_url: urlSchema,
  })
  .strict();

// PUT descriptivo: no admite existencias (se ajusta solo en PATCH .../existencias)
const actualizarProductoBody = z
  .object({
    id_categoria: z.coerce.number().int().positive(),
    nombre: z.string().trim().min(2).max(150),
    descripcion: z.string().trim().min(2).max(5000),
    precio: z.coerce.number().positive(),
    imagen_url: urlSchema,
  })
  .strict();

const existenciasBody = z.object({ existencias: z.coerce.number().int().min(0) }).strict();

const productosAdminQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    id_categoria: z.coerce.number().int().positive().optional(),
    estado: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const usuariosQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const estadoUsuarioBody = z.object({ estado_usuario: z.enum(['ACTIVO', 'INACTIVO']) }).strict();
const rolUsuarioBody = z.object({ rol: z.enum(['ADMIN', 'CLIENTE']) }).strict();

const pedidosAdminQuery = z
  .object({
    estado: z.enum(['PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const estadoPedidoBody = z
  .object({
    estado_pedido: z.enum(['ENVIADO', 'ENTREGADO', 'CANCELADO']),
    motivo_cancelacion: z.string().trim().min(3).max(500).optional(),
  })
  .strict();

const reembolsoPedidoBody = z.object({ observacion: z.string().trim().max(250).optional() }).strict();

const retractosAdminQuery = z
  .object({
    estado: z.enum(['SOLICITADO', 'APROBADO_RECEPCION', 'COMPLETADO', 'RECHAZADO']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const decisionRetractoBody = z
  .object({
    decision: z.enum(['APROBAR', 'RECHAZAR']),
    observacion_admin: z.string().trim().max(500).optional(),
  })
  .strict();

const recepcionRetractoBody = z
  .object({
    observacion_admin: z.string().trim().max(500).optional(),
    items: z
      .array(
        z
          .object({
            id_detalle_retracto: z.coerce.number().int().positive(),
            cantidad_buen_estado: z.coerce.number().int().min(0),
            cantidad_danada: z.coerce.number().int().min(0),
            observacion_inspeccion: z.string().trim().max(300).optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const reembolsoRetractoBody = z.object({ observacion_admin: z.string().trim().max(500).optional() }).strict();

const reportesQuery = z
  .object({
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    id_categoria: z.coerce.number().int().positive().optional(),
  })
  .strict();

router.use(authenticate, requireRole('ADMIN'));

// Categorías
router.get('/categorias', adminController.getCategorias);
router.post('/categorias', validate({ body: categoriaBody }), adminController.postCategoria);
router.put('/categorias/:id', validate({ params: idParam, body: categoriaBody }), adminController.putCategoria);
router.patch('/categorias/:id/estado', validate({ params: idParam, body: estadoBoolBody }), adminController.patchEstadoCategoria);
router.delete('/categorias/:id', validate({ params: idParam }), adminController.deleteCategoria);

// Productos
router.get('/productos', validate({ query: productosAdminQuery }), adminController.getProductos);
router.post('/productos', validate({ body: crearProductoBody }), adminController.postProducto);
router.put('/productos/:id', validate({ params: idParam, body: actualizarProductoBody }), adminController.putProducto);
router.patch('/productos/:id/estado', validate({ params: idParam, body: estadoBoolBody }), adminController.patchEstadoProducto);
router.patch('/productos/:id/existencias', validate({ params: idParam, body: existenciasBody }), adminController.patchExistenciasProducto);

// Usuarios
router.get('/usuarios', validate({ query: usuariosQuery }), adminController.getUsuarios);
router.patch('/usuarios/:id/estado', validate({ params: idParam, body: estadoUsuarioBody }), adminController.patchEstadoUsuario);
router.patch('/usuarios/:id/rol', validate({ params: idParam, body: rolUsuarioBody }), adminController.patchRolUsuario);

// Pedidos
router.get('/pedidos', validate({ query: pedidosAdminQuery }), adminController.getPedidos);
router.patch('/pedidos/:id/estado', validate({ params: idParam, body: estadoPedidoBody }), adminController.patchEstadoPedido);
router.patch('/pedidos/:id/reembolso', validate({ params: idParam, body: reembolsoPedidoBody }), adminController.patchReembolsoPedido);

// Retractos
router.get('/retractos', validate({ query: retractosAdminQuery }), adminController.getRetractos);
router.get('/retractos/:id', validate({ params: idParam }), adminController.getRetracto);
router.patch('/retractos/:id/decision', validate({ params: idParam, body: decisionRetractoBody }), adminController.patchDecisionRetracto);
router.patch('/retractos/:id/recepcion', validate({ params: idParam, body: recepcionRetractoBody }), adminController.patchRecepcionRetracto);
router.patch('/retractos/:id/reembolso', validate({ params: idParam, body: reembolsoRetractoBody }), adminController.patchReembolsoRetracto);

// Reportes netos
router.get('/reportes/resumen', validate({ query: reportesQuery }), adminController.getResumenReportes);
router.get('/reportes/ventas', validate({ query: reportesQuery }), adminController.getReporteVentas);

export default router;
