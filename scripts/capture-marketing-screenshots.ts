/**
 * scripts/capture-marketing-screenshots.ts
 *
 * Captures the LIVE HA addon (real spools, real prints, real data) for marketing
 * material — README hero shots, social posts, walkthrough videos.
 *
 *   Playwright -> http://homeassistant.local:3001/ (LAN, no auth)
 *
 * Output (gitignored, refreshed on every run):
 *   marketing/screenshots/<theme>/<viewport>/<page>.png  - latest
 *   marketing/archive/<YYYY-MM-DD>/<theme>/<viewport>/   - dated copy for video timelines
 *   marketing/walkthrough.mp4                            - 30s nav-through clip
 *
 * Run manually:    npm run screenshots:marketing
 * Schedule via:    LaunchAgent at scripts/launchagent/com.haspoolmanager.screenshots.plist
 *
 * Companion: scripts/capture-docs-screenshots.ts captures synthetic data for git.
 */

import path from "node:path";
import fs from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_LATEST = path.join(REPO_ROOT, "marketing", "screenshots");
const OUT_ARCHIVE_ROOT = path.join(REPO_ROOT, "marketing", "archive");
const WALKTHROUGH_OUT = path.join(REPO_ROOT, "marketing", "walkthrough.mp4");

const ADDON_BASE_URL = process.env.HASPOOLMANAGER_URL ?? "http://homeassistant.local:3001";

type Viewport = { name: string; width: number; height: number; deviceScaleFactor: number };

const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
  { name: "social-square", width: 1080, height: 1080, deviceScaleFactor: 1 },
];

const THEMES = ["dark", "light"] as const;
type Theme = (typeof THEMES)[number];

type PageDef = {
  slug: string;
  /** Path relative to ADDON_BASE_URL — no leading slash */
  appPath: string;
  ready: string;
  postLoadDelayMs?: number;
};

const PAGES: PageDef[] = [
  { slug: "01-dashboard", appPath: "", ready: "main", postLoadDelayMs: 800 },
  { slug: "02-inventory", appPath: "inventory", ready: "[data-testid='page-inventory']", postLoadDelayMs: 600 },
  { slug: "03-spools", appPath: "spools", ready: "[data-testid='page-spools']", postLoadDelayMs: 400 },
  { slug: "04-prints", appPath: "prints", ready: "[data-testid='page-prints']", postLoadDelayMs: 400 },
  { slug: "05-history", appPath: "history", ready: "[data-testid='page-history']", postLoadDelayMs: 400 },
  { slug: "06-orders", appPath: "orders", ready: "[data-testid='page-orders']", postLoadDelayMs: 400 },
  { slug: "07-analytics", appPath: "analytics", ready: "main", postLoadDelayMs: 1000 },
  { slug: "08-scan", appPath: "scan", ready: "[data-testid='page-scan']", postLoadDelayMs: 300 },
  { slug: "09-admin", appPath: "admin", ready: "[data-testid='page-admin']", postLoadDelayMs: 400 },
  { slug: "10-admin-diagnostics", appPath: "admin/diagnostics", ready: "main", postLoadDelayMs: 600 },
];

// The walkthrough script — pages in order, with a brief pause between to let
// the camera "settle". 30s total at 1.5s pacing == 20 transitions.
const WALKTHROUGH_PATH: Array<{ appPath: string; ready: string; dwellMs: number }> = [
  { appPath: "", ready: "main", dwellMs: 2500 },
  { appPath: "inventory", ready: "[data-testid='page-inventory']", dwellMs: 2500 },
  { appPath: "spools", ready: "[data-testid='page-spools']", dwellMs: 2500 },
  { appPath: "prints", ready: "[data-testid='page-prints']", dwellMs: 2500 },
  { appPath: "orders", ready: "[data-testid='page-orders']", dwellMs: 2500 },
  { appPath: "analytics", ready: "main", dwellMs: 3500 },
  { appPath: "admin/diagnostics", ready: "main", dwellMs: 2500 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ensureOutputDirs(): Promise<{ archiveDir: string }> {
  if (fs.existsSync(OUT_LATEST)) {
    fs.rmSync(OUT_LATEST, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_LATEST, { recursive: true });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const archiveDir = path.join(OUT_ARCHIVE_ROOT, today);
  if (fs.existsSync(archiveDir)) {
    fs.rmSync(archiveDir, { recursive: true, force: true });
  }
  fs.mkdirSync(archiveDir, { recursive: true });

  return { archiveDir };
}

async function checkAddonReachable(): Promise<void> {
  const res = await fetch(`${ADDON_BASE_URL}/api/v1/health`, {
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => {
    throw new Error(
      `Cannot reach HA addon at ${ADDON_BASE_URL} — is your Mac on the same LAN as Home Assistant? (${(err as Error).message})`,
    );
  });
  if (!res.ok) {
    throw new Error(`Addon health check returned ${res.status}`);
  }
  const body = (await res.json()) as { version?: string };
  console.log(`[mkt] addon reachable, version=${body.version ?? "?"}`);
}

async function capturePage(
  page: Page,
  pageDef: PageDef,
  outFile: string,
): Promise<void> {
  const url = pageDef.appPath
    ? `${ADDON_BASE_URL}/${pageDef.appPath}`
    : ADDON_BASE_URL;
  await page.goto(url, { waitUntil: "networkidle", timeout: 25_000 });

  try {
    await page.waitForSelector(pageDef.ready, { timeout: 8_000, state: "visible" });
  } catch {
    await page.waitForTimeout(1500);
  }
  if (pageDef.postLoadDelayMs) {
    await page.waitForTimeout(pageDef.postLoadDelayMs);
  }
  await page.screenshot({ path: outFile, fullPage: true, animations: "disabled" });
}

async function captureStills(archiveDir: string): Promise<void> {
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
        for (const def of PAGES) {
          const latestDir = path.join(OUT_LATEST, theme, vp.name);
          const archiveSubDir = path.join(archiveDir, theme, vp.name);
          fs.mkdirSync(latestDir, { recursive: true });
          fs.mkdirSync(archiveSubDir, { recursive: true });

          const latestFile = path.join(latestDir, `${def.slug}.png`);
          process.stderr.write(`[mkt] ${theme}/${vp.name}/${def.slug}.png ... `);
          try {
            await capturePage(page, def, latestFile);
            // Hard-link into the archive (cheap copy).
            try {
              fs.linkSync(latestFile, path.join(archiveSubDir, `${def.slug}.png`));
            } catch {
              fs.copyFileSync(latestFile, path.join(archiveSubDir, `${def.slug}.png`));
            }
            process.stderr.write("ok\n");
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
  const videoDir = path.join(REPO_ROOT, "marketing", ".video-tmp");
  if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch();
  let ctx: BrowserContext | null = null;
  try {
    ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "dark", // dark mode is the project's primary theme
      recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();

    for (const stop of WALKTHROUGH_PATH) {
      const url = stop.appPath ? `${ADDON_BASE_URL}/${stop.appPath}` : ADDON_BASE_URL;
      process.stderr.write(`[mkt] walkthrough -> /${stop.appPath || ""}\n`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      try {
        await page.waitForSelector(stop.ready, { timeout: 8_000, state: "visible" });
      } catch {
        /* ignore — keep recording */
      }
      await page.waitForTimeout(stop.dwellMs);
    }

    await page.close();
    await ctx.close();
    ctx = null;

    const recorded = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
    if (recorded.length === 0) {
      console.warn("[mkt] no video recorded");
      return;
    }
    const src = path.join(videoDir, recorded[0]);

    // We keep the .webm — converting to .mp4 needs ffmpeg, which not every
    // Mac has. Just rename the path so callers find it predictably.
    const finalPath = WALKTHROUGH_OUT.replace(/\.mp4$/, ".webm");
    fs.copyFileSync(src, finalPath);
    fs.rmSync(videoDir, { recursive: true, force: true });
    console.log(`[mkt] walkthrough saved -> ${path.relative(REPO_ROOT, finalPath)}`);
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    await browser.close();
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await checkAddonReachable();
  const { archiveDir } = await ensureOutputDirs();

  const skipVideo = process.argv.includes("--no-video");
  const skipStills = process.argv.includes("--video-only");

  if (!skipStills) {
    console.log(
      `[mkt] capturing ${PAGES.length} pages x ${THEMES.length} themes x ${VIEWPORTS.length} viewports = ${PAGES.length * THEMES.length * VIEWPORTS.length} stills`,
    );
    await captureStills(archiveDir);
  }
  if (!skipVideo) {
    console.log("[mkt] recording walkthrough video ...");
    await captureWalkthrough();
  }

  console.log(`[mkt] done`);
  console.log(`      latest:  ${path.relative(REPO_ROOT, OUT_LATEST)}/`);
  console.log(`      archive: ${path.relative(REPO_ROOT, archiveDir)}/`);
}

main().catch((err) => {
  console.error("[mkt] failed:", err);
  process.exit(1);
});
