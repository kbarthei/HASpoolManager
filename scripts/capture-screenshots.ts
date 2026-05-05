/**
 * scripts/capture-screenshots.ts
 *
 * Captures the LIVE HA addon (real spools, real prints, real data) for docs
 * and marketing material. Sensitive values (IPs, Amazon order numbers, Bambu
 * device IDs + serials) are redacted before each screenshot is taken, so
 * the output is safe to commit to git.
 *
 *   Playwright -> http://homeassistant.local:3001/ (LAN, no auth)
 *
 * Output (committed):
 *   screenshots/<theme>/<viewport>/<page>.png             - latest full-page
 *   screenshots/<theme>/<viewport>/sections/<page>--<section>.png - card-level clips (desktop only)
 *   screenshots/walkthrough.webm                          - 30s nav-through clip (1920×1080, dark)
 *
 * Output (gitignored):
 *   screenshots/.video-tmp/                               - Playwright recording scratch
 *   screenshots/launchagent.{stdout,stderr}.log           - LaunchAgent logs
 *
 * Run manually:    npm run screenshots
 *                  npm run screenshots -- --no-video
 *                  npm run screenshots -- --video-only
 *
 * Schedule via:    bash scripts/launchagent/install.sh   (nightly 03:00 local)
 */

import path from "node:path";
import fs from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_LATEST = path.join(REPO_ROOT, "screenshots");
const WALKTHROUGH_OUT = path.join(REPO_ROOT, "screenshots", "walkthrough.webm");

const ADDON_BASE_URL = process.env.HASPOOLMANAGER_URL ?? "http://homeassistant.local:3001";

type Viewport = { name: string; width: number; height: number; deviceScaleFactor: number };

const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
  { name: "social-square", width: 1080, height: 1080, deviceScaleFactor: 1 },
];

const THEMES = ["dark", "light"] as const;

type Section = {
  /** Filename stem for the section clip (e.g. "ams-section") */
  slug: string;
  /** CSS selector — usually a data-testid — for the element to clip */
  selector: string;
};

type PageDef = {
  slug: string;
  /** Path relative to ADDON_BASE_URL — no leading slash */
  appPath: string;
  ready: string;
  postLoadDelayMs?: number;
  /**
   * CSS selectors of elements to hide before the full-page screenshot.
   * Used to keep noisy debug-y tables (sync log, HMS log) from dominating
   * the marketing/docs shot. The DOM mutations only affect the screenshot;
   * the live page stays intact (we never reload after).
   */
  hide?: string[];
  /**
   * Element-level captures saved under:
   *   screenshots/<theme>/desktop/sections/<page-slug>--<section-slug>.png
   * Skipped on mobile + social-square (the layout collapses).
   */
  sections?: Section[];
};

// Port 3001 (direct LAN) routes "/" to "/ingress/" via 302; sub-pages need
// the "ingress/" prefix explicitly because the addon's Next.js basePath is
// /ingress in production.
const PAGES: PageDef[] = [
  {
    slug: "01-dashboard",
    appPath: "",
    ready: "main",
    postLoadDelayMs: 800,
    sections: [
      { slug: "printer-live", selector: "[data-testid='printer-live']" },
      { slug: "stats", selector: "[data-testid='dashboard-stats']" },
      { slug: "recent-prints", selector: "[data-testid='recent-prints']" },
      { slug: "needs-attention", selector: "[data-testid='needs-attention']" },
    ],
  },
  {
    slug: "02-inventory",
    appPath: "ingress/inventory",
    ready: "[data-testid='page-inventory']",
    postLoadDelayMs: 600,
    sections: [
      { slug: "ams-section", selector: "[data-testid='printer-section']" },
      { slug: "workbench", selector: "[data-testid='workbench-section']" },
      { slug: "surplus", selector: "[data-testid='surplus-section']" },
      { slug: "filter-chips", selector: "[data-testid='filter-chips']" },
    ],
  },
  {
    slug: "03-spools",
    appPath: "ingress/spools",
    ready: "[data-testid='page-spools']",
    postLoadDelayMs: 400,
    sections: [
      { slug: "spool-card", selector: "[data-testid='spool-card']" },
    ],
  },
  {
    // appPath is rewritten with the live spool id picked up from the
    // addon API at runtime (see resolveSpoolInspectorPath() below).
    slug: "04-spool-inspector",
    appPath: "__SPOOL_INSPECTOR__",
    ready: "[data-testid='page-spool-detail']",
    postLoadDelayMs: 600,
    sections: [
      { slug: "material-profile", selector: "[data-testid='material-profile-card']" },
    ],
  },
  {
    slug: "05-prints",
    appPath: "ingress/prints",
    ready: "[data-testid='page-prints']",
    postLoadDelayMs: 400,
  },
  {
    slug: "06-history",
    appPath: "ingress/history",
    ready: "[data-testid='page-history']",
    postLoadDelayMs: 400,
  },
  {
    slug: "07-orders",
    appPath: "ingress/orders",
    ready: "[data-testid='page-orders']",
    postLoadDelayMs: 600,
    sections: [
      { slug: "budget", selector: "[data-testid='budget-card']" },
      { slug: "supply-rules", selector: "[data-testid='supply-rules']" },
      { slug: "optimized-cart", selector: "[data-testid='optimized-cart']" },
    ],
  },
  {
    slug: "08-analytics",
    appPath: "ingress/analytics",
    ready: "main",
    postLoadDelayMs: 1000,
  },
  {
    slug: "09-scan",
    appPath: "ingress/scan",
    ready: "[data-testid='page-scan']",
    postLoadDelayMs: 300,
  },
  {
    slug: "10-admin",
    appPath: "ingress/admin",
    ready: "[data-testid='page-admin']",
    postLoadDelayMs: 600,
    // Without trim, /admin grows to 11000+ px because the sync log + HMS log
    // tables expand with every print event. Hide the noisy tables so the
    // Configuration Details + Racks + AMS-Units cards stay legible in the
    // marketing shot. Both are reachable via /admin/diagnostics.
    hide: [
      "[data-testid='admin-sync-log']",
      "[data-testid='admin-hms-log']",
    ],
    sections: [
      { slug: "data-quality", selector: "[data-testid='data-quality-card']" },
      { slug: "racks-card", selector: "[data-testid='racks-card']" },
      { slug: "backups-card", selector: "[data-testid='admin-backups-card']" },
    ],
  },
  {
    slug: "11-admin-diagnostics",
    appPath: "ingress/admin/diagnostics",
    ready: "main",
    postLoadDelayMs: 600,
    sections: [
      { slug: "orphan-photos", selector: "[data-testid='issue-orphan-photos']" },
    ],
  },
];

// 30s walkthrough — pages in order, brief dwell between transitions.
const WALKTHROUGH_PATH: Array<{ appPath: string; ready: string; dwellMs: number }> = [
  { appPath: "", ready: "main", dwellMs: 2500 },
  { appPath: "ingress/inventory", ready: "[data-testid='page-inventory']", dwellMs: 2500 },
  { appPath: "ingress/spools", ready: "[data-testid='page-spools']", dwellMs: 2500 },
  { appPath: "ingress/prints", ready: "[data-testid='page-prints']", dwellMs: 2500 },
  { appPath: "ingress/orders", ready: "[data-testid='page-orders']", dwellMs: 2500 },
  { appPath: "ingress/analytics", ready: "main", dwellMs: 3500 },
  { appPath: "ingress/admin/diagnostics", ready: "main", dwellMs: 2500 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ensureOutputDirs(): Promise<void> {
  // Wipe only the per-theme/per-viewport output trees, not the whole
  // screenshots/ folder (which holds README.md + walkthrough.webm).
  for (const theme of THEMES) {
    const themeDir = path.join(OUT_LATEST, theme);
    if (fs.existsSync(themeDir)) fs.rmSync(themeDir, { recursive: true, force: true });
  }
}

async function checkAddonReachable(): Promise<void> {
  const res = await fetch(`${ADDON_BASE_URL}/api/v1/health`, {
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => {
    throw new Error(
      `Cannot reach HA addon at ${ADDON_BASE_URL} — is your Mac on the same LAN as Home Assistant? (${(err as Error).message})`,
    );
  });
  if (!res.ok) throw new Error(`Addon health check returned ${res.status}`);
  const body = (await res.json()) as { version?: string };
  console.log(`[shot] addon reachable, version=${body.version ?? "?"}`);
}

/**
 * Pick a representative spool to render the inspector page. Preference:
 * one currently bound to an AMS slot (so the inspector shows the most data),
 * falling back to any active spool. Returns null if the addon has no spools.
 */
async function resolveInspectorSpoolId(): Promise<string | null> {
  try {
    const res = await fetch(`${ADDON_BASE_URL}/api/v1/spools?status=active`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const all = (await res.json()) as Array<{ id: string; location: string | null }>;
    if (!Array.isArray(all) || all.length === 0) return null;
    const inAms = all.find(
      (s) => s.location === "ams" || s.location === "ams-ht" || s.location === "external",
    );
    return (inAms ?? all[0]).id;
  } catch {
    return null;
  }
}

// ── Redaction ───────────────────────────────────────────────────────────────

// Two-layer redaction. Serialized as a string so tsx's named-function
// decoration (`__name(...)`) doesn't leak into the browser runtime.
const REDACTION_SCRIPT = `(() => {
  // Layer 1 — regex pass on every text node
  const patterns = [
    [/\\b192\\.168\\.\\d{1,3}\\.\\d{1,3}\\b/g, "192.168.x.x"],
    [/\\b10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b/g, "10.x.x.x"],
    [/\\b172\\.(1[6-9]|2[0-9]|3[01])\\.\\d{1,3}\\.\\d{1,3}\\b/g, "172.x.x.x"],
    [/\\b\\d{3}-\\d{7}-\\d{7}\\b/g, "XXX-XXXXXXX-XXXXXXX"]
  ];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const orig = node.nodeValue || "";
    let next = orig;
    for (const [re, repl] of patterns) next = next.replace(re, repl);
    if (next !== orig) node.nodeValue = next;
  }

  // Layer 2 — label/value pairs in admin
  const sensitiveLabels = [
    "device id", "ha device id", "hadeviceid",
    "ip address", "ipaddress", "serial",
    "ha url", "websocket url"
  ];
  document.querySelectorAll("*").forEach((el) => {
    const own = (el.textContent || "").trim().toLowerCase();
    if (!own || own.length > 32) return;
    let match = false;
    for (let i = 0; i < sensitiveLabels.length; i++) {
      if (own.indexOf(sensitiveLabels[i]) !== -1) { match = true; break; }
    }
    if (!match) return;
    const sibling = el.nextElementSibling;
    if (!sibling) return;
    const sibText = (sibling.textContent || "").trim();
    if (sibText.length < 6) return;
    if (sibText.indexOf("••") !== -1) return;
    sibling.textContent = "••••";
  });
})();`;

async function applyRedactions(page: Page): Promise<void> {
  await page.evaluate(REDACTION_SCRIPT);
}

// ── Trim ────────────────────────────────────────────────────────────────────

async function applyTrimRules(page: Page, hide: string[] | undefined): Promise<void> {
  if (!hide || hide.length === 0) return;
  await page.evaluate((selectors: string[]) => {
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });
      } catch {
        // invalid selector — skip silently
      }
    }
  }, hide);
}

// ── Capture ─────────────────────────────────────────────────────────────────

async function navigateToPage(
  page: Page,
  pageDef: PageDef,
  spoolInspectorId: string | null,
): Promise<void> {
  let appPath = pageDef.appPath;
  if (appPath === "__SPOOL_INSPECTOR__") {
    if (!spoolInspectorId) {
      throw new Error("spool inspector requested but no spool found in addon");
    }
    appPath = `ingress/spools/${spoolInspectorId}`;
  }
  const url = appPath ? `${ADDON_BASE_URL}/${appPath}` : ADDON_BASE_URL;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
  try {
    await page.waitForSelector(pageDef.ready, { timeout: 8_000, state: "visible" });
  } catch {
    await page.waitForTimeout(1500);
  }
  if (pageDef.postLoadDelayMs) {
    await page.waitForTimeout(pageDef.postLoadDelayMs);
  }
}

async function capturePageFull(
  page: Page,
  pageDef: PageDef,
  outFile: string,
): Promise<void> {
  await applyTrimRules(page, pageDef.hide);
  await applyRedactions(page);
  await page.screenshot({ path: outFile, fullPage: true, animations: "disabled" });
}

async function captureSections(
  page: Page,
  pageDef: PageDef,
  sectionsDir: string,
): Promise<void> {
  if (!pageDef.sections) return;
  for (const section of pageDef.sections) {
    const outFile = path.join(sectionsDir, `${pageDef.slug}--${section.slug}.png`);
    process.stderr.write(`[shot]   section ${pageDef.slug}/${section.slug} … `);
    try {
      const handle = page.locator(section.selector).first();
      await handle.waitFor({ state: "attached", timeout: 8_000 });
      await handle.scrollIntoViewIfNeeded();
      await applyRedactions(page);
      await handle.screenshot({ path: outFile, animations: "disabled" });
      process.stderr.write("ok\n");
    } catch (err) {
      process.stderr.write(`skip (${(err as Error).message.split("\n")[0]})\n`);
    }
  }
}

async function captureStills(spoolInspectorId: string | null): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.deviceScaleFactor,
          colorScheme: theme,
          isMobile: vp.name === "mobile",
          hasTouch: vp.name === "mobile",
        });
        const page = await ctx.newPage();
        const latestDir = path.join(OUT_LATEST, theme, vp.name);
        const sectionsDir = path.join(latestDir, "sections");
        fs.mkdirSync(latestDir, { recursive: true });
        if (vp.name === "desktop") {
          fs.mkdirSync(sectionsDir, { recursive: true });
        }

        for (const def of PAGES) {
          const latestFile = path.join(latestDir, `${def.slug}.png`);
          process.stderr.write(`[shot] ${theme}/${vp.name}/${def.slug}.png … `);
          try {
            await navigateToPage(page, def, spoolInspectorId);
            await capturePageFull(page, def, latestFile);
            process.stderr.write("ok\n");
            if (vp.name === "desktop") {
              await captureSections(page, def, sectionsDir);
            }
          } catch (err) {
            process.stderr.write(`FAILED: ${(err as Error).message}\n`);
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function captureWalkthrough(): Promise<void> {
  const videoDir = path.join(REPO_ROOT, "screenshots", ".video-tmp");
  if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch();
  let ctx: BrowserContext | null = null;
  try {
    ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();

    for (const stop of WALKTHROUGH_PATH) {
      const url = stop.appPath ? `${ADDON_BASE_URL}/${stop.appPath}` : ADDON_BASE_URL;
      process.stderr.write(`[shot] walkthrough -> /${stop.appPath || ""}\n`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      try {
        await page.waitForSelector(stop.ready, { timeout: 8_000, state: "visible" });
      } catch {
        /* keep recording */
      }
      await applyRedactions(page).catch(() => {});
      await page.waitForTimeout(stop.dwellMs);
    }

    await page.close();
    await ctx.close();
    ctx = null;

    const recorded = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
    if (recorded.length === 0) {
      console.warn("[shot] no video recorded");
      return;
    }
    fs.copyFileSync(path.join(videoDir, recorded[0]), WALKTHROUGH_OUT);
    fs.rmSync(videoDir, { recursive: true, force: true });
    console.log(`[shot] walkthrough saved -> ${path.relative(REPO_ROOT, WALKTHROUGH_OUT)}`);
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    await browser.close();
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await checkAddonReachable();
  await ensureOutputDirs();

  const skipVideo = process.argv.includes("--no-video");
  const skipStills = process.argv.includes("--video-only");

  const spoolInspectorId = await resolveInspectorSpoolId();
  if (spoolInspectorId) {
    console.log(`[shot] using spool ${spoolInspectorId.slice(0, 8)}… for inspector page`);
  } else {
    console.log("[shot] no active spool found — inspector page will fail to capture");
  }

  if (!skipStills) {
    console.log(
      `[shot] capturing ${PAGES.length} pages × ${THEMES.length} themes × ${VIEWPORTS.length} viewports = ${PAGES.length * THEMES.length * VIEWPORTS.length} stills + section clips on desktop`,
    );
    await captureStills(spoolInspectorId);
  }
  if (!skipVideo) {
    console.log("[shot] recording walkthrough video …");
    await captureWalkthrough();
  }

  console.log("[shot] done");
  console.log(`       output: ${path.relative(REPO_ROOT, OUT_LATEST)}/`);
}

main().catch((err) => {
  console.error("[shot] failed:", err);
  process.exit(1);
});
