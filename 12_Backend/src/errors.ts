/**
 * Typed application errors with HTTP mappings.
 * Used by both the HTTP layer (server.ts) and the service layer.
 * Keep this file dependency-free so it can be imported anywhere.
 */

export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(httpStatus: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "bad_request", message, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "missing or invalid credentials") {
    super(401, "unauthorized", message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, "forbidden", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "not_found", message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, "conflict", message, details);
    this.name = "ConflictError";
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "unprocessable", message, details);
    this.name = "UnprocessableError";
  }
}

export class NotImplementedError extends AppError {
  readonly stubReason: string;
  constructor(stubReason: string) {
    super(501, "not_implemented", stubReason);
    this.name = "NotImplementedError";
    this.stubReason = stubReason;
  }
}
