export class AppError extends Error {
  constructor(status, codigo, mensaje, detalles = undefined) {
    super(mensaje);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
    this.mensaje = mensaje;
    this.detalles = detalles;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    codigo: 'RECURSO_NO_ENCONTRADO',
    mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    const body = { ok: false, codigo: err.codigo, mensaje: err.mensaje ?? err.message };
    if (err.detalles !== undefined) body.detalles = err.detalles;
    return res.status(err.status).json(body);
  }

  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      ok: false,
      codigo: 'VALIDACION_INVALIDA',
      mensaje: 'El cuerpo JSON enviado no es válido.',
    });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      codigo: 'VALIDACION_INVALIDA',
      mensaje: 'El tamaño de la petición supera el límite permitido de 100kb.',
    });
  }

  if (err?.code === '40P01' || err?.code === '40001') {
    return res.status(503).json({
      ok: false,
      codigo: 'CONFLICTO_CONCURRENCIA',
      mensaje: 'La operación encontró un conflicto temporal de concurrencia. Intenta nuevamente.',
    });
  }

  if (err?.code === '23505') {
    const constraint = err.constraint || '';
    if (constraint.includes('correo')) {
      return res.status(409).json({
        ok: false,
        codigo: 'CORREO_DUPLICADO',
        mensaje: 'El correo electrónico ya se encuentra registrado.',
      });
    }
    if (constraint.includes('documento')) {
      return res.status(409).json({
        ok: false,
        codigo: 'DOCUMENTO_DUPLICADO',
        mensaje: 'El tipo y número de documento ya se encuentran registrados.',
      });
    }
    if (constraint.includes('pedido_usuario_pendiente')) {
      return res.status(409).json({
        ok: false,
        codigo: 'PEDIDO_PENDIENTE_ACTIVO',
        mensaje: 'Ya existe un pedido pendiente vigente para este cliente.',
      });
    }
    if (constraint.includes('pago_pedido_aprobado')) {
      return res.status(409).json({
        ok: false,
        codigo: 'PEDIDO_YA_PAGADO',
        mensaje: 'El pedido ya cuenta con un pago aprobado.',
      });
    }
    return res.status(409).json({
      ok: false,
      codigo: 'VALIDACION_INVALIDA',
      mensaje: 'Ya existe un registro con ese valor único.',
    });
  }

  if (err?.code === '23503') {
    return res.status(409).json({
      ok: false,
      codigo: 'CATEGORIA_CON_PRODUCTOS',
      mensaje: 'La operación está restringida por referencias activas en base de datos.',
    });
  }

  if (err?.code === '23514') {
    return res.status(400).json({
      ok: false,
      codigo: 'VALIDACION_INVALIDA',
      mensaje: 'Los datos violan una regla de integridad definida.',
    });
  }

  console.error('Error no controlado:', err);
  return res.status(500).json({
    ok: false,
    codigo: 'ERROR_INTERNO',
    mensaje: 'Ocurrió un error interno inesperado en el servidor.',
  });
}
