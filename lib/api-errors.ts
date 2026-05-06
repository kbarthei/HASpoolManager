/**
 * Standardized API Error Handling
 * 
 * Provides consistent error responses, logging, and error codes across all API endpoints.
 */

import { NextResponse } from "next/server";

// ── Error Codes ──────────────────────────────────────────────────────────────

export const ErrorCode = {
  // Authentication & Authorization (1xxx)
  UNAUTHORIZED: "AUTH_001",
  FORBIDDEN: "AUTH_002",
  INVALID_API_KEY: "AUTH_003",
  EXPIRED_API_KEY: "AUTH_004",
  
  // Validation (2xxx)
  VALIDATION_ERROR: "VAL_001",
  INVALID_INPUT: "VAL_002",
  MISSING_REQUIRED_FIELD: "VAL_003",
  INVALID_FORMAT: "VAL_004",
  
  // Resource Not Found (3xxx)
  NOT_FOUND: "RES_001",
  PRINTER_NOT_FOUND: "RES_002",
  SPOOL_NOT_FOUND: "RES_003",
  PRINT_NOT_FOUND: "RES_004",
  ORDER_NOT_FOUND: "RES_005",
  FILAMENT_NOT_FOUND: "RES_006",
  MODEL_NOT_FOUND: "RES_007",
  
  // Business Logic (4xxx)
  DUPLICATE_RESOURCE: "BIZ_001",
  RESOURCE_CONFLICT: "BIZ_002",
  OPERATION_NOT_ALLOWED: "BIZ_003",
  INSUFFICIENT_STOCK: "BIZ_004",
  INVALID_STATE_TRANSITION: "BIZ_005",
  
  // External Services (5xxx)
  EXTERNAL_SERVICE_ERROR: "EXT_001",
  HOME_ASSISTANT_ERROR: "EXT_002",
  DATABASE_ERROR: "EXT_003",
  FILE_SYSTEM_ERROR: "EXT_004",
  
  // Internal Errors (9xxx)
  INTERNAL_ERROR: "INT_001",
  NOT_IMPLEMENTED: "INT_002",
  CONFIGURATION_ERROR: "INT_003",
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

// ── Error Response Interface ─────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;              // Human-readable error message
  code: ErrorCodeType;        // Machine-readable error code
  details?: unknown;          // Additional error details (validation errors, etc.)
  timestamp: string;          // ISO 8601 timestamp
  path?: string;              // Request path
  requestId?: string;         // Request ID for tracing
}

// ── Error Classes ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public code: ErrorCodeType,
    public message: string,
    public statusCode: number = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(ErrorCode.NOT_FOUND, message, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized") {
    super(ErrorCode.UNAUTHORIZED, message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden") {
    super(ErrorCode.FORBIDDEN, message, 403);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.RESOURCE_CONFLICT, message, 409, details);
    this.name = "ConflictError";
  }
}

// ── Error Response Builders ──────────────────────────────────────────────────

/**
 * Create a standardized error response.
 */
export function createErrorResponse(
  error: ApiError | Error,
  path?: string,
  requestId?: string,
): NextResponse<ApiErrorResponse> {
  const isApiError = error instanceof ApiError;
  
  const response: ApiErrorResponse = {
    error: error.message,
    code: isApiError ? error.code : ErrorCode.INTERNAL_ERROR,
    timestamp: new Date().toISOString(),
    ...(path ? { path } : {}),
    ...(requestId ? { requestId } : {}),
    ...(isApiError && error.details ? { details: error.details } : {}),
  };

  const statusCode = isApiError ? error.statusCode : 500;

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Create a validation error response from Zod validation errors.
 */
export function createValidationErrorResponse(
  errors: Array<{ path: string[]; message: string }>,
  path?: string,
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    error: "Validation failed",
    code: ErrorCode.VALIDATION_ERROR,
    details: errors,
    timestamp: new Date().toISOString(),
    ...(path ? { path } : {}),
  };

  return NextResponse.json(response, { status: 400 });
}

/**
 * Create a not found error response.
 */
export function createNotFoundResponse(
  resource: string,
  id?: string,
  path?: string,
): NextResponse<ApiErrorResponse> {
  const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
  
  const response: ApiErrorResponse = {
    error: message,
    code: ErrorCode.NOT_FOUND,
    timestamp: new Date().toISOString(),
    ...(path ? { path } : {}),
  };

  return NextResponse.json(response, { status: 404 });
}

/**
 * Create an internal server error response.
 */
export function createInternalErrorResponse(
  error: Error,
  path?: string,
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    error: "Internal server error",
    code: ErrorCode.INTERNAL_ERROR,
    timestamp: new Date().toISOString(),
    ...(path ? { path } : {}),
  };

  return NextResponse.json(response, { status: 500 });
}

// ── Error Logging ────────────────────────────────────────────────────────────

export interface ErrorLogContext {
  path?: string;
  method?: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  [key: string]: unknown;
}

/**
 * Log an error with context.
 */
export function logError(
  error: Error,
  context: ErrorLogContext = {},
): void {
  const isApiError = error instanceof ApiError;
  const severity = isApiError && error.statusCode < 500 ? "warn" : "error";
  
  const logData = {
    message: error.message,
    code: isApiError ? error.code : ErrorCode.INTERNAL_ERROR,
    statusCode: isApiError ? error.statusCode : 500,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString(),
  };

  if (severity === "error") {
    console.error("[api-error]", JSON.stringify(logData, null, 2));
  } else {
    console.warn("[api-warn]", JSON.stringify(logData, null, 2));
  }
}

/**
 * Wrap an async API handler with error handling and logging.
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>,
  context: ErrorLogContext = {},
): Promise<T | NextResponse<ApiErrorResponse>> {
  return handler().catch((error: Error) => {
    logError(error, context);
    return createErrorResponse(error, context.path, context.requestId);
  });
}

// ── HTTP Status Helpers ──────────────────────────────────────────────────────

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ── Success Response Helpers ─────────────────────────────────────────────────

export function createSuccessResponse<T>(
  data: T,
  statusCode: number = HttpStatus.OK,
): NextResponse<T> {
  return NextResponse.json(data, { status: statusCode });
}

export function createCreatedResponse<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: HttpStatus.CREATED });
}

export function createNoContentResponse(): NextResponse {
  return new NextResponse(null, { status: HttpStatus.NO_CONTENT });
}

// Made with Bob
