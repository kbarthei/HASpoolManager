#!/usr/bin/env node
/**
 * Self-healing cache cleaner for the Next.js dev server.
 *
 * Turbopack caches compiled server chunks in .next/dev/server/.
 * If a dependency is removed (e.g., Sentry) but the cache still references it,
 * the dev server crashes with "Cannot find module" on startup.
 *
 * This script runs before `next dev` and checks for known corruption patterns.
 * If found, it deletes .next/ so Turbopack rebuilds cleanly.
 */

const fs = require("fs");
const path = require("path");

const nextDir = path.join(__dirname, "..", ".next");
const instrumentationFile = path.join(nextDir, "dev", "server", "instrumentation.js");

if (!fs.existsSync(nextDir)) {
  // No cache at all — nothing to clean
  process.exit(0);
}

let shouldClean = false;
const reasons = [];

// Check 1: instrumentation.js references packages that don't exist
if (fs.existsSync(instrumentationFile)) {
  try {
    const content = fs.readFileSync(instrumentationFile, "utf-8");
    const phantomPackages = ["@sentry/nextjs", "require-in-the-middle"];
    for (const pkg of phantomPackages) {
      if (content.includes(pkg)) {
        const pkgPath = path.join(__dirname, "..", "node_modules", pkg);
        if (!fs.existsSync(pkgPath)) {
          shouldClean = true;
          reasons.push(`references removed package "${pkg}"`);
        }
      }
    }
  } catch {
    // Can't read file — not a problem, skip
  }
}

// Check 2: .next/dev/server/chunks has files older than node_modules
// (indicates cache predates last npm install)
try {
  const chunksDir = path.join(nextDir, "dev", "server", "chunks");
  const nodeModulesDir = path.join(__dirname, "..", "node_modules");
  if (fs.existsSync(chunksDir) && fs.existsSync(nodeModulesDir)) {
    const chunksStat = fs.statSync(chunksDir);
    const nmStat = fs.statSync(nodeModulesDir);
    if (chunksStat.mtimeMs < nmStat.mtimeMs) {
      shouldClean = true;
      reasons.push("cache older than node_modules");
    }
  }
} catch {
  // stat failed — skip
}

if (shouldClean) {
  console.log(`[clean-cache] Stale .next cache detected: ${reasons.join(", ")}`);
  console.log("[clean-cache] Deleting .next/ for clean rebuild...");
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("[clean-cache] Done.");
} else {
  // Cache looks fine — no output, no delay
}
