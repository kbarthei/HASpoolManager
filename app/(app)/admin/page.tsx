export const dynamic = "force-dynamic";

import { getSystemStats, getPrinterStatus, getRackConfig } from "@/lib/queries";
import { formatDateTime, formatDate } from "@/lib/date";
import { db } from "@/lib/db";
import { prints, spools, printers as printersTable, syncLog } from "@/lib/db/schema";
import { eq, sql, ne, desc } from "drizzle-orm";
import { sqlCount } from "@/lib/db/sql-helpers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClearStaleButton } from "./clear-stale-button";
import { SyncLogTable } from "./sync-log-table";
import { RackSettings } from "./rack-settings";
import { ImportOrdersCard } from "./import-orders-card";
import { AdminTools } from "./admin-tools";
import { RefreshPricesButton } from "./refresh-prices-button";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Show first 6 chars + "..." + last 4 chars of a secret value. */
function maskSecret(value: string | undefined): string {
  if (!value) return "not set";
  if (value.length <= 10) return value.slice(0, 3) + "...";
  return value.slice(0, 6) + "..." + value.slice(-4);
}

function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return formatDate(d);
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  // Build/deploy info (BUILD_TIMESTAMP is set at build time in next.config.ts)
  const buildInfo = {
    commitSha: process.env.GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    deployedAt: process.env.BUILD_TIMESTAMP
      ? formatDateTime(process.env.BUILD_TIMESTAMP)
      : null,
    runtime: process.env.HA_ADDON === "true" ? "HA Addon" : "Local Dev",
    nodeEnv: process.env.NODE_ENV,
  };

  const [stats, [lastSyncEntry], printerStatus, rackConfig, activePrinter] = await Promise.all([
    getSystemStats(),
    db.select().from(syncLog).orderBy(desc(syncLog.createdAt)).limit(1),
    getPrinterStatus(),
    getRackConfig(),
    db.query.printers.findFirst({ where: eq(printersTable.isActive, true) }),
  ]);

  // ── Config details ────────────────────────────────────────────────────────
  const isAddon = process.env.HA_ADDON === "true";
  const sqlitePath = process.env.SQLITE_PATH ?? "./data/haspoolmanager.db";

  const configDetails = {
    ha: {
      syncUrl: isAddon
        ? "http://local-haspoolmanager:3000/api/v1/events/printer-sync"
        : "http://localhost:3000/api/v1/events/printer-sync",
      syncInterval: "60 seconds",
      authMethod: "Bearer token",
      apiSecretKey: maskSecret(process.env.API_SECRET_KEY),
      apiSecretSet: !!process.env.API_SECRET_KEY,
    },
    printer: {
      name: activePrinter?.name ?? "—",
      model: activePrinter?.model ?? "—",
      amsSlots: "4 AMS + 1 HT + 1 External",
      haDeviceId: activePrinter?.haDeviceId ?? "—",
      ipAddress: activePrinter?.ipAddress ?? "—",
    },
    db: {
      provider: "SQLite (better-sqlite3)",
      path: sqlitePath,
      mode: isAddon ? "HA /config persistent volume" : "local file",
    },
    ai: {
      provider: "Anthropic Claude",
      model: "claude-sonnet-4-6",
      apiKeyMasked: maskSecret(process.env.ANTHROPIC_API_KEY),
      apiKeySet: !!process.env.ANTHROPIC_API_KEY,
    },
  };

  const [runningCount] = await db
    .select({ count: sqlCount() })
    .from(prints)
    .where(eq(prints.status, "running"));

  // Fetch active spools with filament + vendor for the import dialog
  const allSpools = await db.query.spools.findMany({
    where: ne(spools.status, "archived"),
    with: { filament: { with: { vendor: true } } },
  });

  const lastSync = lastSyncEntry;

  return (
    <div data-testid="page-admin" className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-xs text-muted-foreground mt-1">System overview and diagnostics</p>
      </div>

      {/* ── System Overview ──────────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-semibold">System Overview</h2>

        {/* DB counts */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {[
            { label: "Spools", value: stats.spools },
            { label: "Filaments", value: stats.filaments },
            { label: "Prints", value: stats.prints },
            { label: "Vendors", value: stats.vendors },
            { label: "Orders", value: stats.orders },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center bg-muted/40 rounded-lg py-2 px-3">
              <span className="text-lg font-semibold tabular-nums">{value}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Printer + last sync */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Printer</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs">{printerStatus.name}</span>
              <Badge
                className={`text-[10px] h-4 px-1.5 ${
                  printerStatus.status === "printing"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {printerStatus.status}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Last sync</span>
            <div className="text-right">
              {lastSync ? (
                <>
                  <span className="font-mono text-xs">{relativeTime(lastSync.createdAt)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">
                    {lastSync.normalizedState ?? "—"}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No syncs yet</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Manual Actions ───────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Manual Actions</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Clear Stale Running Prints</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {runningCount.count > 0
                ? `${runningCount.count} print${runningCount.count === 1 ? "" : "s"} currently marked as running`
                : "No running prints"}
            </p>
          </div>
          <ClearStaleButton runningCount={runningCount.count} />
        </div>
      </Card>

      {/* ── Import Historical Orders ──────────────────────────────────── */}
      <ImportOrdersCard allSpools={JSON.parse(JSON.stringify(allSpools))} />

      {/* ── Build & Cache ─────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Build & Cache</h2>
        <AdminTools buildInfo={buildInfo} />
      </Card>

      {/* ── Configuration Details ────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-semibold">Configuration Details</h2>

        {/* Section: Home Assistant Integration */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Home Assistant Integration
          </p>
          <div className="space-y-1">
            {[
              { label: "Sync URL", value: configDetails.ha.syncUrl, mono: true },
              { label: "Sync interval", value: configDetails.ha.syncInterval, mono: false },
              { label: "Auth method", value: configDetails.ha.authMethod, mono: false },
              {
                label: "API_SECRET_KEY",
                value: configDetails.ha.apiSecretKey,
                mono: true,
                status: configDetails.ha.apiSecretSet ? "ok" : "warn",
              },
              {
                label: "Last sync",
                value: lastSync ? relativeTime(lastSync.createdAt) : "No syncs yet",
                mono: true,
              },
            ].map(({ label, value, mono, status }) => (
              <div
                key={label}
                className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 gap-4"
              >
                <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
                <span
                  className={`text-[11px] truncate text-right ${mono ? "font-mono" : ""} ${
                    status === "warn" ? "text-amber-500" : ""
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Printer */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Printer
          </p>
          <div className="space-y-1">
            {[
              { label: "Name", value: configDetails.printer.name },
              { label: "Model", value: configDetails.printer.model },
              { label: "AMS slots", value: configDetails.printer.amsSlots },
              { label: "HA Device ID", value: configDetails.printer.haDeviceId, mono: true },
              { label: "IP Address", value: configDetails.printer.ipAddress, mono: true },
            ].map(({ label, value, mono }) => (
              <div
                key={label}
                className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 gap-4"
              >
                <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
                <span className={`text-[11px] text-right ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Database */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Database
          </p>
          <div className="space-y-1">
            {[
              { label: "Provider", value: configDetails.db.provider },
              { label: "Path", value: configDetails.db.path, mono: true },
              { label: "Mode", value: configDetails.db.mode },
              {
                label: "Records",
                value: `${stats.spools} spools · ${stats.filaments} filaments · ${stats.prints} prints · ${stats.vendors} vendors · ${stats.orders} orders`,
              },
            ].map(({ label, value, mono }) => (
              <div
                key={label}
                className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 gap-4"
              >
                <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
                <span className={`text-[11px] text-right ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section: AI Integration */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI Integration
          </p>
          <div className="space-y-1">
            {[
              { label: "Provider", value: configDetails.ai.provider },
              { label: "Model", value: configDetails.ai.model, mono: true },
              {
                label: "ANTHROPIC_API_KEY",
                value: configDetails.ai.apiKeyMasked,
                mono: true,
                status: configDetails.ai.apiKeySet ? "ok" : "warn",
              },
            ].map(({ label, value, mono, status }) => (
              <div
                key={label}
                className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 gap-4"
              >
                <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
                <span
                  className={`text-[11px] text-right ${mono ? "font-mono" : ""} ${
                    status === "warn" ? "text-amber-500" : ""
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Price Data */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Price Data
          </p>
          <div className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 gap-4">
            <div>
              <p className="text-[11px] font-medium">Refresh Shop Prices</p>
              <p className="text-[10px] text-muted-foreground">Fetch current prices from all active shop listings</p>
            </div>
            <RefreshPricesButton />
          </div>
        </div>
      </Card>

      {/* ── Rack Configuration ──────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Rack Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Currently {rackConfig.rows} rows × {rackConfig.columns} columns · R1 is the bottom-left shelf
          </p>
        </div>
        <RackSettings initialRows={rackConfig.rows} initialColumns={rackConfig.columns} />
      </Card>

      {/* ── Sync Log ─────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <SyncLogTable />
      </Card>
    </div>
  );
}
