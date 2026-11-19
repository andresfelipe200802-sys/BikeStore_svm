import { AppError } from './error.middleware.js';

function buildValidationError(issues, fallback = 'Los datos enviados no son válidos.') {
  const firstMessage =
    Array.isArray(issues) && typeof issues[0]?.message === 'string' && issues[0].message.trim()
      ? issues[0].message.trim()
      : fallback;
  return new AppError(400, 'VALIDACION_INVALIDA', firstMessage, issues);
}

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (params) {
        const parsed = params.safeParse(req.params);
        if (!parsed.success) {
          throw buildValidationError(parsed.error.issues, 'Parámetros de ruta inválidos.');
        }
        req.validatedParams = parsed.data;
      }
      if (query) {
        const parsed = query.safeParse(req.query);
        if (!parsed.success) {
          throw buildValidationError(parsed.error.issues, 'Parámetros de consulta inválidos.');
        }
        req.validatedQuery = parsed.data;
      }
      if (body) {
        const parsed = body.safeParse(req.body);
        if (!parsed.success) {
          throw buildValidationError(parsed.error.issues, 'Los datos enviados no son válidos.');
        }
        req.validatedBody = parsed.data;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
