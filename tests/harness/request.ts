/**
 * Tiny helper to synthesize NextRequest instances for route-handler tests.
 * Route handlers in this app accept a plain NextRequest and return a
 * NextResponse, so integration tests can bypass HTTP entirely.
 */

import { NextRequest } from "next/server";

const BASE = "http://test.local";

function authHeader(auth: boolean): Record<string, string> {
  if (!auth) return {};
  const token = process.env.API_SECRET_KEY ?? "test-api-key";
  return { authorization: `Bearer ${token}` };
}

export function makeGetRequest(path: string, auth = false): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "GET",
    headers: authHeader(auth),
  });
}

export function makePostRequest(
  path: string,
  body: unknown,
  auth = true,
): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader(auth) },
    body: JSON.stringify(body),
  });
}

export function makePatchRequest(
  path: string,
  body: unknown,
  auth = true,
): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeader(auth) },
    body: JSON.stringify(body),
  });
}

export function makeDeleteRequest(path: string, auth = true): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "DELETE",
    headers: authHeader(auth),
  });
}

/** Wraps a value into the shape Next.js passes as the second argument to route handlers. */
export function routeContext<T>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
