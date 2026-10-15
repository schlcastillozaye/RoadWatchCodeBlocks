/**
 * Application-level error carrying an HTTP status and a stable machine code.
 * Thrown anywhere; converted to a JSON response by the error middleware.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }
  static unauthenticated(message = 'Authentication required') {
    return new AppError(message, 401, 'UNAUTHENTICATED');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(message, 403, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, 'NOT_FOUND');
  }
  static conflict(message = 'Resource already exists', details?: unknown) {
    return new AppError(message, 409, 'CONFLICT', details);
  }
  static unprocessable(message = 'Validation failed', details?: unknown) {
    return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
  static unsupportedMedia(message = 'Unsupported media type') {
    return new AppError(message, 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  static tooLarge(message = 'Payload too large') {
    return new AppError(message, 413, 'PAYLOAD_TOO_LARGE');
  }
  static internal(message = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}
