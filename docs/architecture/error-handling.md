# API Error Handling

## Overview

HASpoolManager implements standardized error handling across all API endpoints to provide consistent, predictable error responses with proper logging and debugging information.

## Error Response Format

All API errors follow a consistent JSON structure:

```typescript
{
  error: string;              // Human-readable error message
  code: string;               // Machine-readable error code (e.g., "VAL_001")
  details?: unknown;          // Additional context (validation errors, etc.)
  timestamp: string;          // ISO 8601 timestamp
  path?: string;              // Request path
  requestId?: string;         // Request ID for tracing
}
```

### Example Error Response

```json
{
  "error": "Validation failed",
  "code": "VAL_001",
  "details": [
    {
      "path": ["weight"],
      "message": "Weight must be a positive number"
    }
  ],
  "timestamp": "2026-05-06T13:00:00.000Z",
  "path": "/api/v1/spools"
}
```

## Error Codes

### Authentication & Authorization (1xxx)

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_001` | Unauthorized - Missing or invalid credentials | 401 |
| `AUTH_002` | Forbidden - Insufficient permissions | 403 |
| `AUTH_003` | Invalid API key | 401 |
| `AUTH_004` | Expired API key | 401 |

### Validation (2xxx)

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VAL_001` | Validation error - Invalid input data | 400 |
| `VAL_002` | Invalid input format | 400 |
| `VAL_003` | Missing required field | 400 |
| `VAL_004` | Invalid format (date, email, etc.) | 400 |

### Resource Not Found (3xxx)

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `RES_001` | Generic resource not found | 404 |
| `RES_002` | Printer not found | 404 |
| `RES_003` | Spool not found | 404 |
| `RES_004` | Print not found | 404 |
| `RES_005` | Order not found | 404 |
| `RES_006` | Filament not found | 404 |
| `RES_007` | Model file not found | 404 |

### Business Logic (4xxx)

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `BIZ_001` | Duplicate resource | 409 |
| `BIZ_002` | Resource conflict | 409 |
| `BIZ_003` | Operation not allowed | 403 |
| `BIZ_004` | Insufficient stock | 400 |
| `BIZ_005` | Invalid state transition | 400 |

### External Services (5xxx)

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `EXT_001` | External service error | 502 |
| `EXT_002` | Home Assistant error | 502 |
| `EXT_003` | Database error | 500 |
| `EXT_004` | File system error | 500 |

### Internal Errors (9xxx)

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INT_001` | Internal server error | 500 |
| `INT_002` | Not implemented | 501 |
| `INT_003` | Configuration error | 500 |

## Error Classes

### ApiError (Base Class)

```typescript
class ApiError extends Error {
  constructor(
    public code: ErrorCodeType,
    public message: string,
    public statusCode: number = 500,
    public details?: unknown,
  )
}
```

### Specialized Error Classes

```typescript
// Validation errors
throw new ValidationError("Invalid input", { field: "weight", value: -5 });

// Not found errors
throw new NotFoundError("Spool", "abc123");

// Authorization errors
throw new UnauthorizedError("Invalid API key");
throw new ForbiddenError("Admin access required");

// Conflict errors
throw new ConflictError("Spool already exists", { tag: "RFID123" });
```

## Implementation Patterns

### Basic Error Handling

```typescript
import { createErrorResponse, logError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    // Handler logic
    const data = await fetchData();
    return NextResponse.json(data);
  } catch (error) {
    logError(error as Error, {
      path: request.nextUrl.pathname,
      method: "GET",
    });
    return createErrorResponse(error as Error, request.nextUrl.pathname);
  }
}
```

### With Error Handling Wrapper

```typescript
import { withErrorHandling } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const data = await fetchData();
    return NextResponse.json(data);
  }, {
    path: request.nextUrl.pathname,
    method: "GET",
  });
}
```

### Validation Errors

```typescript
import { validateBody, createSpoolSchema } from "@/lib/validations";
import { createValidationErrorResponse } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const validation = validateBody(createSpoolSchema, raw);
    
    if (!validation.success) {
      return createValidationErrorResponse(
        validation.errors,
        request.nextUrl.pathname
      );
    }
    
    // Process valid data
    const data = validation.data;
    // ...
  } catch (error) {
    // Handle other errors
  }
}
```

### Not Found Errors

```typescript
import { createNotFoundResponse } from "@/lib/api-errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spool = await db.query.spools.findFirst({
    where: eq(spools.id, id),
  });
  
  if (!spool) {
    return createNotFoundResponse("Spool", id, request.nextUrl.pathname);
  }
  
  return NextResponse.json(spool);
}
```

### Custom Business Logic Errors

```typescript
import { ApiError, ErrorCode } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const spool = await getSpool(id);
    
    if (spool.remainingWeight <= 0) {
      throw new ApiError(
        ErrorCode.INSUFFICIENT_STOCK,
        "Spool is empty",
        400,
        { spoolId: id, remainingWeight: 0 }
      );
    }
    
    // Process request
  } catch (error) {
    return createErrorResponse(error as Error, request.nextUrl.pathname);
  }
}
```

## Error Logging

### Log Levels

- **Error** (500-level errors): Full stack trace, logged to console.error
- **Warning** (400-level errors): Message and context, logged to console.warn

### Log Format

```json
{
  "message": "Spool not found: abc123",
  "code": "RES_003",
  "statusCode": 404,
  "stack": "Error: Spool not found...",
  "path": "/api/v1/spools/abc123",
  "method": "GET",
  "userId": "user_xyz",
  "timestamp": "2026-05-06T13:00:00.000Z"
}
```

### Adding Context to Logs

```typescript
logError(error, {
  path: request.nextUrl.pathname,
  method: request.method,
  userId: auth.userId,
  requestId: request.headers.get("x-request-id"),
  duration: Date.now() - startTime,
  customField: "custom value",
});
```

## Success Responses

### Standard Success

```typescript
import { createSuccessResponse } from "@/lib/api-errors";

return createSuccessResponse({ id: "abc123", name: "PLA Red" });
// Returns: 200 OK with JSON body
```

### Created Resource

```typescript
import { createCreatedResponse } from "@/lib/api-errors";

const [spool] = await db.insert(spools).values(data).returning();
return createCreatedResponse(spool);
// Returns: 201 Created with JSON body
```

### No Content

```typescript
import { createNoContentResponse } from "@/lib/api-errors";

await db.delete(spools).where(eq(spools.id, id));
return createNoContentResponse();
// Returns: 204 No Content with empty body
```

## HTTP Status Codes

Use the `HttpStatus` constants for consistency:

```typescript
import { HttpStatus } from "@/lib/api-errors";

return NextResponse.json(data, { status: HttpStatus.OK });
return NextResponse.json(error, { status: HttpStatus.BAD_REQUEST });
return NextResponse.json(error, { status: HttpStatus.NOT_FOUND });
```

## Client-Side Error Handling

### TypeScript Client

```typescript
interface ApiError {
  error: string;
  code: string;
  details?: unknown;
  timestamp: string;
}

async function fetchSpool(id: string): Promise<Spool> {
  const response = await fetch(`/api/v1/spools/${id}`);
  
  if (!response.ok) {
    const error: ApiError = await response.json();
    
    switch (error.code) {
      case "RES_003":
        throw new Error(`Spool not found: ${id}`);
      case "AUTH_001":
        // Redirect to login
        window.location.href = "/login";
        break;
      default:
        throw new Error(error.error);
    }
  }
  
  return response.json();
}
```

### React Error Boundary

```typescript
function ErrorDisplay({ error }: { error: ApiError }) {
  const userMessage = {
    "VAL_001": "Please check your input and try again.",
    "RES_003": "The requested spool was not found.",
    "AUTH_001": "Please log in to continue.",
    "INT_001": "Something went wrong. Please try again later.",
  }[error.code] || error.error;
  
  return (
    <div className="error-message">
      <p>{userMessage}</p>
      {error.details && <pre>{JSON.stringify(error.details, null, 2)}</pre>}
    </div>
  );
}
```

## Testing Error Responses

### Unit Tests

```typescript
import { describe, it, expect } from "vitest";
import { ApiError, ErrorCode, createErrorResponse } from "@/lib/api-errors";

describe("Error Handling", () => {
  it("creates validation error response", () => {
    const error = new ValidationError("Invalid input", { field: "weight" });
    const response = createErrorResponse(error, "/api/v1/spools");
    
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.details).toEqual({ field: "weight" });
  });
  
  it("creates not found error response", () => {
    const error = new NotFoundError("Spool", "abc123");
    const response = createErrorResponse(error);
    
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe(ErrorCode.NOT_FOUND);
    expect(body.error).toContain("abc123");
  });
});
```

### Integration Tests

```typescript
describe("POST /api/v1/spools", () => {
  it("returns validation error for invalid weight", async () => {
    const response = await fetch("/api/v1/spools", {
      method: "POST",
      body: JSON.stringify({ weight: -5 }),
    });
    
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VAL_001");
    expect(body.details).toContainEqual({
      path: ["weight"],
      message: expect.stringContaining("positive"),
    });
  });
});
```

## Best Practices

### For Developers

1. **Always use error classes**: Don't throw raw strings or generic Errors
2. **Provide context**: Include relevant IDs, values, and state in error details
3. **Log before returning**: Use `logError()` to capture context
4. **Use appropriate status codes**: Match HTTP semantics (400 vs 404 vs 500)
5. **Don't expose internals**: Sanitize error messages for production

### For API Consumers

1. **Check status codes first**: Use HTTP status for flow control
2. **Parse error codes**: Use machine-readable codes for specific handling
3. **Display user-friendly messages**: Map error codes to user-facing text
4. **Log full errors**: Capture complete error objects for debugging
5. **Handle retries appropriately**: Retry 5xx errors, don't retry 4xx errors

## Migration Guide

### Updating Existing Endpoints

**Before:**
```typescript
catch (error) {
  console.error("Error:", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
```

**After:**
```typescript
import { logError, createErrorResponse } from "@/lib/api-errors";

catch (error) {
  logError(error as Error, {
    path: request.nextUrl.pathname,
    method: request.method,
  });
  return createErrorResponse(error as Error, request.nextUrl.pathname);
}
```

## Related Documentation

- [API Reference](../reference/api.md) - Complete API documentation
- [Validation](./validation.md) - Input validation patterns
- [Authentication](./authentication.md) - Auth error handling
- [Testing](../development/testing.md) - Error testing strategies