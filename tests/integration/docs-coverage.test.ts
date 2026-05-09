/**
 * Docs coverage contract — auto-discovered.
 *
 * Catches "new feature shipped without docs" regressions. Three checks:
 *
 *  1. Every UI page (`app/(app)/**\/page.tsx`) must:
 *     a. carry a `data-testid="page-X"` on its root, AND
 *     b. be referenced in `scripts/capture-screenshots.ts` PAGES list
 *        (so screenshots refresh hits it on the next nightly run), AND
 *     c. be referenced in operator-facing docs (user-guide.md OR README.md)
 *        — either by the testid, the URL slug, or a sibling screenshot
 *        embed.
 *
 *  2. Every API route under `app/api/v1` exporting GET/POST/PUT/PATCH/DELETE
 *     must be documented in `docs/reference/api.md` — by URL pattern with
 *     either {param} or :param syntax.
 *
 *  3. Files can opt-out by adding `// docs-coverage: ignore` anywhere
 *     in the file. Use sparingly — you owe a comment line explaining why.
 *
 * Pattern lifted from `browser-auth-contract.test.ts`. If you add a new
 * page or route, this scanner catches the missing-docs gap automatically;
 * no manual list to maintain.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
// @ts-expect-error — glob 6.x ships no bundled types
import { sync as globSync } from "glob";

const REPO_ROOT = path.resolve(__dirname, "../..");
const IGNORE_MARKER = "docs-coverage: ignore";

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function hasIgnore(content: string): boolean {
  return content.includes(IGNORE_MARKER);
}

// ── Page discovery ──────────────────────────────────────────────────────────

interface PageEntry {
  file: string;
  /** Path-derived URL slug, no leading slash. e.g. "" (root), "models", "prints/[id]" */
  pathSlug: string;
  /** data-testid="page-X" found in the file or a sibling *-client.tsx */
  testid: string | null;
}

function pageFileToSlug(file: string): string {
  // app/(app)/foo/page.tsx → foo
  // app/(app)/page.tsx → ""
  // app/(app)/foo/[id]/page.tsx → foo/[id]
  return file.replace(/^app\/\(app\)\/?/, "").replace(/\/?page\.tsx$/, "");
}

function findPageTestid(pageFile: string): string | null {
  const content = readFileSync(path.join(REPO_ROOT, pageFile), "utf8");
  // 1. directly in the page file
  const direct = content.match(/data-testid=["']page-([\w-]+)["']/);
  if (direct) return `page-${direct[1]}`;
  // 2. sibling -client.tsx in the same directory
  const dir = path.dirname(pageFile);
  const candidates = globSync(`${dir}/*-client.tsx`, { cwd: REPO_ROOT });
  for (const c of candidates) {
    const cContent = readFileSync(path.join(REPO_ROOT, c), "utf8");
    const m = cContent.match(/data-testid=["']page-([\w-]+)["']/);
    if (m) return `page-${m[1]}`;
  }
  return null;
}

function discoverPages(): PageEntry[] {
  const files = globSync("app/(app)/**/page.tsx", { cwd: REPO_ROOT });
  return files.map((file: string) => ({
    file,
    pathSlug: pageFileToSlug(file),
    testid: findPageTestid(file),
  }));
}

// ── API route discovery ─────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RouteEntry {
  file: string;
  /** /api/v1/printers/{id} */
  url: string;
  methods: Method[];
}

function routeFileToUrl(file: string): string {
  return file.replace(/^app/, "").replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}");
}

function discoverRoutes(): RouteEntry[] {
  const files = globSync("app/api/v1/**/route.ts", { cwd: REPO_ROOT });
  const routes: RouteEntry[] = [];
  for (const file of files) {
    const content = readFileSync(path.join(REPO_ROOT, file), "utf8");
    const methods: Method[] = [];
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"] as Method[]) {
      if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(content)) {
        methods.push(m);
      }
    }
    if (methods.length > 0) {
      routes.push({ file, url: routeFileToUrl(file), methods });
    }
  }
  return routes;
}

// ── Cached doc bodies ───────────────────────────────────────────────────────

const captureScript = read("scripts/capture-screenshots.ts");
const userGuide = read("docs/operator/user-guide.md");
const readme = read("README.md");
const apiDoc = read("docs/reference/api.md");

// ── Tests ───────────────────────────────────────────────────────────────────

const pages = discoverPages();
const routes = discoverRoutes();

describe("docs coverage contract — auto-discovered", () => {
  it("discovered at least 10 pages and 30 API routes", () => {
    // Sanity guard — if globbing breaks, the rest of the suite would
    // silently pass with zero assertions.
    expect(pages.length).toBeGreaterThanOrEqual(10);
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  describe("UI pages — testid present", () => {
    for (const p of pages) {
      it(`${p.file} has a data-testid="page-X" on its root`, () => {
        const content = readFileSync(path.join(REPO_ROOT, p.file), "utf8");
        if (hasIgnore(content)) return;
        expect(p.testid, `${p.file}: missing data-testid="page-X" (or in sibling *-client.tsx)`).toBeTruthy();
      });
    }
  });

  describe("UI pages — captured in scripts/capture-screenshots.ts", () => {
    for (const p of pages) {
      it(`${p.file} is in capture-screenshots.ts PAGES`, () => {
        const content = readFileSync(path.join(REPO_ROOT, p.file), "utf8");
        if (hasIgnore(content)) return;
        // The capture script either references the appPath ("ingress/<slug>") or
        // a `ready: "[data-testid='page-X']"` selector, depending on the entry.
        const slugWithoutDynamicSegments = p.pathSlug.replace(/\[[^\]]+\]/g, "").replace(/\/+$/, "");
        const ingressPath = slugWithoutDynamicSegments ? `ingress/${slugWithoutDynamicSegments}` : "";
        // Dashboard root has appPath: "" (no slug). Anything else lives under
        // ingress/<slug>. Detail pages with dynamic segments use resolveAppPath
        // + a `ready:` selector matching the testid.
        const matchesAppPath = ingressPath
          ? captureScript.includes(`appPath: "${ingressPath}"`)
          : captureScript.includes(`appPath: "",`);
        const matchesTestid = p.testid
          ? captureScript.includes(`'${p.testid}'`) || captureScript.includes(`"${p.testid}"`)
          : false;
        const found = matchesAppPath || matchesTestid;
        expect(
          found,
          `${p.file} not captured. Add a PAGES entry in scripts/capture-screenshots.ts ` +
            `(appPath="${ingressPath}" or resolveAppPath + ready="[data-testid='${p.testid}']").`,
        ).toBe(true);
      });
    }
  });

  describe("UI pages — referenced in operator docs", () => {
    for (const p of pages) {
      it(`${p.file} is referenced in user-guide.md, README.md, or operations-runbook.md`, () => {
        const content = readFileSync(path.join(REPO_ROOT, p.file), "utf8");
        if (hasIgnore(content)) return;
        // A page counts as documented if any of these match in any operator doc:
        //  - the testid (e.g. "page-models")
        //  - the URL slug (e.g. "/models")
        //  - any sibling screenshot filename (e.g. "12-models.png")
        const opsRunbook = read("docs/operator/operations-runbook.md");
        const haystacks = [userGuide, readme, opsRunbook];
        const slug = p.pathSlug.replace(/\[[^\]]+\]/g, "").replace(/\/$/, "");
        const urlNeedles = slug ? [`/${slug}`, `\`${slug}\``] : ["/dashboard", "Dashboard"];
        const testidNeedle = p.testid ?? "";
        // Find any screenshot whose name encodes this page's pathSlug or testid
        const screenshotNeedle = (() => {
          if (!p.testid) return null;
          // 12-models.png ⟵ page-models
          const stem = p.testid.replace(/^page-/, "");
          return `${stem}.png`;
        })();
        const needles = [
          ...(urlNeedles ?? []),
          testidNeedle,
          screenshotNeedle ?? "",
        ].filter(Boolean);
        const matched = haystacks.some((doc) => needles.some((n) => doc.includes(n)));
        expect(
          matched,
          `${p.file} not referenced anywhere in docs. Add a section to docs/operator/user-guide.md ` +
            `(or README.md, or operations-runbook.md) that mentions one of: ${needles.join(", ")}.`,
        ).toBe(true);
      });
    }
  });

  describe("API routes — documented in docs/reference/api.md", () => {
    for (const r of routes) {
      it(`${r.file} (${r.methods.join("/")}) is in api.md`, () => {
        const content = readFileSync(path.join(REPO_ROOT, r.file), "utf8");
        if (hasIgnore(content)) return;
        // api.md uses three URL syntaxes inconsistently — accept any:
        //  /api/v1/printers/{id}
        //  /api/v1/printers/:id
        //  /api/v1/printers/[id]
        const variants = [
          r.url, // {id}
          r.url.replace(/\{(\w+)\}/g, ":$1"), // :id
          r.url.replace(/\{(\w+)\}/g, "[$1]"), // [id]
        ];
        const found = variants.some((v) => apiDoc.includes(v));
        expect(
          found,
          `${r.file} not in docs/reference/api.md. Add a section under the matching resource ` +
            `with at least one of: ${variants.join(" | ")}.`,
        ).toBe(true);
      });
    }
  });
});

// Sanity: file existence — readFileSync would have thrown above, but make
// it explicit for diagnostic clarity if the suite is ever run after a move.
if (!existsSync(path.join(REPO_ROOT, "docs/reference/api.md"))) {
  throw new Error("docs/reference/api.md missing — docs-coverage scanner needs it");
}
