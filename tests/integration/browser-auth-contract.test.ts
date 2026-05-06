/**
 * Browser auth contract — auto-discovered.
 *
 * Catches every "requireAuth on a browser-called endpoint" regression.
 * Scans app/api/v1 routes for auth tier + scans app/(app) and components
 * for fetch() calls without Authorization headers, then cross-checks.
 *
 * If you add a new browser fetch + a new route, this test catches a
 * mismatch automatically. No manual list to maintain.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
// @ts-expect-error — glob 6.x ships no bundled types
import { sync as globSync } from "glob";

const REPO_ROOT = path.resolve(__dirname, "../..");

type AuthTier = "requireAuth" | "optionalAuth" | "none";
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface RouteEntry {
  file: string;
  url: string;
  methods: Map<Method, AuthTier>;
}

interface FetchCall {
  file: string;
  line: number;
  method: Method;
  url: string;
  hasAuthHeader: boolean;
}

function routeFileToUrl(file: string): string {
  const rel = file.replace(/^app/, "").replace(/\/route\.ts$/, "");
  return rel.replace(/\[([^\]]+)\]/g, "{$1}");
}

function detectMethodAuth(content: string, method: Method): AuthTier | null {
  const exportRegex = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`,
    "g",
  );
  const m = exportRegex.exec(content);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = content.slice(start).search(/\nexport\s+/);
  const body = next === -1 ? content.slice(start) : content.slice(start, start + next);
  if (/\brequireAuth\s*\(/.test(body)) return "requireAuth";
  if (/\boptionalAuth\s*\(/.test(body)) return "optionalAuth";
  return "none";
}

function discoverRoutes(): RouteEntry[] {
  const files = globSync("app/api/v1/**/route.ts", {
    cwd: REPO_ROOT,
    nodir: true,
  });
  const routes: RouteEntry[] = [];
  for (const file of files) {
    const abs = path.join(REPO_ROOT, file);
    const content = readFileSync(abs, "utf8");
    const methods = new Map<Method, AuthTier>();
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"] as Method[]) {
      const tier = detectMethodAuth(content, m);
      if (tier !== null) methods.set(m, tier);
    }
    if (methods.size > 0) {
      routes.push({ file, url: routeFileToUrl(file), methods });
    }
  }
  return routes;
}

function collapseTemplate(url: string): string {
  return url.replace(/\$\{[^}]*\}/g, "{}");
}

function scanFetches(file: string, content: string): FetchCall[] {
  const out: FetchCall[] = [];
  const regex = /fetch\s*\(\s*(`[^`]*`|"[^"]*"|'[^']*')\s*(?:,\s*([\s\S]*?))?\)\s*;?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const urlRaw = match[1];
    const optsRaw = match[2] ?? "";

    const url = collapseTemplate(urlRaw.slice(1, -1));
    const apiIdx = url.indexOf("/api/v1/");
    if (apiIdx < 0) continue;
    const cleanUrl = url.slice(apiIdx);

    let method: Method = "GET";
    const methodMatch = optsRaw.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/);
    if (methodMatch) method = methodMatch[1] as Method;

    const hasAuthHeader = /["']?[Aa]uthorization["']?\s*:/.test(optsRaw);

    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const lineEnd = content.indexOf("\n", match.index + fullMatch.length);
    const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
    if (/browser-auth-contract:\s*ignore/.test(line)) continue;

    const lineNumber = content.slice(0, match.index).split("\n").length;
    out.push({ file, line: lineNumber, method, url: cleanUrl, hasAuthHeader });
  }
  return out;
}

function discoverBrowserFetches(): FetchCall[] {
  const files = [
    ...globSync("app/(app)/**/*.{ts,tsx}", { cwd: REPO_ROOT, nodir: true }),
    ...globSync("components/**/*.{ts,tsx}", { cwd: REPO_ROOT, nodir: true }),
  ];
  const out: FetchCall[] = [];
  for (const file of files) {
    const abs = path.join(REPO_ROOT, file);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, "utf8");
    if (!content.includes("fetch(")) continue;
    out.push(...scanFetches(file, content));
  }
  return out;
}

interface Violation {
  ui: { file: string; line: number };
  route: { file: string; url: string };
  method: Method;
}

function urlMatches(callUrl: string, routeUrl: string): boolean {
  const call = callUrl.split("?")[0];
  const callSegs = call.split("/").filter(Boolean);
  const routeSegs = routeUrl.split("/").filter(Boolean);
  if (callSegs.length !== routeSegs.length) return false;
  for (let i = 0; i < callSegs.length; i++) {
    const r = routeSegs[i];
    const c = callSegs[i];
    if (r.startsWith("{") && r.endsWith("}")) continue;
    if (c === "{}" && r.startsWith("{") && r.endsWith("}")) continue;
    if (c === r) continue;
    return false;
  }
  return true;
}

function findRoute(call: FetchCall, routes: RouteEntry[]): RouteEntry | null {
  for (const r of routes) {
    if (urlMatches(call.url, r.url)) return r;
  }
  return null;
}

function findViolations(routes: RouteEntry[], fetches: FetchCall[]): Violation[] {
  const violations: Violation[] = [];
  for (const call of fetches) {
    if (call.hasAuthHeader) continue;
    const route = findRoute(call, routes);
    if (!route) continue;
    const tier = route.methods.get(call.method);
    if (tier === "requireAuth") {
      violations.push({
        ui: { file: call.file, line: call.line },
        route: { file: route.file, url: route.url },
        method: call.method,
      });
    }
  }
  return violations;
}

describe("Browser auth contract — every browser-called route uses optionalAuth", () => {
  it("scans the codebase and finds zero requireAuth-from-browser violations", () => {
    const routes = discoverRoutes();
    const fetches = discoverBrowserFetches();
    const violations = findViolations(routes, fetches);

    if (violations.length > 0) {
      const lines = violations.map(
        (v) =>
          `  ${v.ui.file}:${v.ui.line}  fetches  ${v.method} ${v.route.url}\n` +
          `    -> ${v.route.file} uses requireAuth — switch to optionalAuth`,
      );
      throw new Error(
        `Found ${violations.length} browser-auth-contract violation(s):\n` +
          lines.join("\n\n") +
          "\n\nThe browser does not send an Authorization header. " +
          "Admin/UI endpoints called from a browser must use optionalAuth " +
          "(security boundary is HA ingress / LAN-only PWA gating). " +
          "If a specific call is intentional (e.g. wraps a Bearer client), " +
          "append `// browser-auth-contract: ignore` to the fetch line.",
      );
    }

    expect(routes.length).toBeGreaterThan(20);
    expect(fetches.length).toBeGreaterThan(20);
  });
});
