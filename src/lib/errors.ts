export class AppError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string>;
  constructor(message: string, status = 400, code = "bad_request", fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, 401, "unauthorized");
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "forbidden");
  }
}
export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found or you do not have access to it.") {
    super(message, 404, "not_found");
  }
}
export class ConflictError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, 409, "conflict", fieldErrors);
  }
}
export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, 422, "validation", fieldErrors);
  }
}
