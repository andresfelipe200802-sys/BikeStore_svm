import { AppError } from './error.middleware.js';

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (params) {
        const parsed = params.safeParse(req.params);
        if (!parsed.success) {
          throw new AppError(400, 'VALIDACION_INVALIDA', 'Parámetros de ruta inválidos.', parsed.error.issues);
        }
        req.validatedParams = parsed.data;
      }
      if (query) {
        const parsed = query.safeParse(req.query);
        if (!parsed.success) {
          throw new AppError(400, 'VALIDACION_INVALIDA', 'Parámetros de consulta inválidos.', parsed.error.issues);
        }
        req.validatedQuery = parsed.data;
      }
      if (body) {
        const parsed = body.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError(400, 'VALIDACION_INVALIDA', 'Datos de entrada inválidos.', parsed.error.issues);
        }
        req.validatedBody = parsed.data;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
