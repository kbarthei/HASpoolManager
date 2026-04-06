import { NextRequest, NextResponse } from "next/server";

/**
 * HA Ingress Proxy (Next.js 16 proxy.ts)
 *
 * When running as a Home Assistant addon (HA_ADDON=true), HA's ingress proxy
 * serves the app under a dynamic path like /api/hassio_ingress/<token>/.
 * HA already strips that prefix before forwarding requests to the addon, so
 * Next.js always sees clean URLs (/, /spools, /api/v1/...).
 *
 * What this proxy does:
 * - Passes the X-Ingress-Path header through to responses so server components
 *   or API routes can read it if needed (e.g. for debugging or future basePath
 *   support).
 * - Is intentionally lightweight — all routing and asset serving works as-is
 *   because HA proxies every sub-path including /_next/static/.
 *
 * When HA_ADDON is not set (Vercel / local dev) this is a no-op.
 */
export function proxy(request: NextRequest): NextResponse {
  if (process.env.HA_ADDON !== "true") {
    return NextResponse.next();
  }

  const ingressPath = request.headers.get("x-ingress-path");
  if (!ingressPath) {
    return NextResponse.next();
  }

  // Pass the ingress path downstream so server components / API routes can
  // read it from response headers if ever needed.
  const response = NextResponse.next();
  response.headers.set("x-ingress-path", ingressPath);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static assets — HA proxies these directly)
     * - _next/image   (image optimisation endpoints)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
