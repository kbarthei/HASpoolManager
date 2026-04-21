export const dynamic = "force-dynamic";

import { getSystemStats, getPrinterStatus, getRackConfig } from "@/lib/queries";
import { formatDateTime, formatDate } from "@/lib/date";
import { db } from "@/lib/db";
import { spools, printers as printersTable, syncLog, settings, hmsEvents } from "@/lib/db/schema";
import { eq, ne, desc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SyncLogTable } from "./sync-log-table";
import { RackSettings } from "./rack-settings";
import { ImportOrdersCard } from "./import-orders-card";
import { AdminTools } from "./admin-tools";
import { PrinterMappings } from "./printer-mappings";
import { EnergySettings } from "./energy-settings";
import { DataQualityCard } from "./data-quality-card";

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
    version: process.env.ADDON_VERSION ?? "dev",
    commitSha: process.env.GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    deployedAt: process.env.BUILD_TIMESTAMP
      ? formatDateTime(process.env.BUILD_TIMESTAMP)
      : null,
    runtime: process.env.HA_ADDON === "true" ? "HA Addon" : "Local Dev",
    nodeEnv: process.env.NODE_ENV,
  };

  const [stats, [lastSyncEntry], printerStatus, rackConfig, activePrinter, energyEntityRow, energyPriceRow] = await Promise.all([
    getSystemStats(),
    db.select().from(syncLog).orderBy(desc(syncLog.createdAt)).limit(1),
    getPrinterStatus(),
    getRackConfig(),
    db.query.printers.findFirst({ where: eq(printersTable.isActive, true) }),
    db.query.settings.findFirst({ where: eq(settings.key, "energy_sensor_entity_id") }),
    db.query.settings.findFirst({ where: eq(settings.key, "electricity_price_per_kwh") }),
  ]);

  // ── Config details ────────────────────────────────────────────────────────
  const isAddon = process.env.HA_ADDON === "true";
  const sqlitePath = process.env.SQLITE_PATH ?? "./data/haspoolmanager.db";

  const configDetails = {
    ha: {
      syncMethod: isAddon ? "Websocket (sync worker)" : "REST API (manual)",
      syncMode: isAddon ? "Event-driven + watchdog fallback" : "External polling",
      supervisorToken: isAddon ? (process.env.SUPERVISOR_TOKEN ? "set" : "missing") : "n/a",
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

  // Fetch active spools with filament + vendor for the import dialog
  const allSpools = await db.query.spools.findMany({
    where: ne(spools.status, "archived"),
    with: { filament: { with: { vendor: true } } },
  });

  const lastSync = lastSyncEntry;

  return (
    <div data-testid="page-admin" className="max-w-3xl md:max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">System overview and diagnostics</p>
      </div>

      {/*
        2-column grid on ≥ lg (1024 px). Zone headings and dense full-width
        cards (System Overview, Data Quality, HMS log, Shop Config, Sync Log,
        Printer Mappings, Configuration Details) span both columns. Shorter
        form cards (Budget, Rack, Energy, Build & Cache) fit in a single
        column so Rack + Energy and Budget + Build pair naturally side-by-side.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* ═══ STATUS ═══════════════════════════════════════════════════════ */}
      <div className="lg:col-span-2 pt-2 first:pt-0">
        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Status
        </p>
      </div>

      {/* ── System Overview ──────────────────────────────────────────────── */}
      <Card className="lg:col-span-2 p-4 space-y-4">
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

      {/* ── Data Quality ──────────────────────────────────────────────── */}
      <div className="lg:col-span-2">
        <DataQualityCard />
      </div>

      {/* ── HMS Error Log ──────────────────────────────────────────────── */}
      <div className="lg:col-span-2">
        <HmsErrorLog />
      </div>

      {/* ═══ OPERATIONS ══════════════════════════════════════════════════ */}
      <div className="lg:col-span-2 pt-4">
        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Operations
        </p>
      </div>

      {/* ── Import Historical Orders ──────────────────────────────────── */}
      <div className="lg:col-span-2">
        <ImportOrdersCard allSpools={JSON.parse(JSON.stringify(allSpools))} />
      </div>

      {/* ── Sync Log ─────────────────────────────────────────────────────── */}
      <Card className="lg:col-span-2 p-4">
        <SyncLogTable />
      </Card>

      {/* ═══ ONE-TIME SETUP ══════════════════════════════════════════════ */}
      <div className="lg:col-span-2 pt-4">
        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          One-time Setup
        </p>
      </div>

      {/* ── Printer Discovery & Entity Mappings ─────────────────────────── */}
      <div className="lg:col-span-2">
        <PrinterMappings />
      </div>

      {/* ── Rack Configuration ─ pairs with Energy on desktop ──────────── */}
      <Card className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Rack Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Currently {rackConfig.rows} rows × {rackConfig.columns} columns · R1 is the bottom-left shelf
          </p>
        </div>
        <RackSettings initialRows={rackConfig.rows} initialColumns={rackConfig.columns} />
      </Card>

      {/* ── Energy Tracking ───────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Energy Tracking</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track electricity costs per print via a smart plug energy sensor
          </p>
        </div>
        <EnergySettings
          initialEntityId={energyEntityRow?.value ?? ""}
          initialPricePerKwh={energyPriceRow?.value ?? ""}
        />
      </Card>

      {/* ── Configuration Details ────────────────────────────────────────── */}
      <Card className="lg:col-span-2 p-4 space-y-4">
        <h2 className="text-sm font-semibold">Configuration Details</h2>

        {/* Section: Home Assistant Integration */}
        <div className="space-y-1.5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Home Assistant Integration
          </p>
          <div className="space-y-1">
            {[
              { label: "Sync method", value: configDetails.ha.syncMethod, mono: false },
              { label: "Sync mode", value: configDetails.ha.syncMode, mono: false },
              {
                label: "SUPERVISOR_TOKEN",
                value: configDetails.ha.supervisorToken,
                mono: true,
                status: configDetails.ha.supervisorToken === "missing" ? "warn" : undefined,
              },
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
                    status === "warn" ? "text-warning" : ""
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
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
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
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
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
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
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
                    status === "warn" ? "text-warning" : ""
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

      </Card>

      {/* ═══ DEV / BUILD ═════════════════════════════════════════════════ */}
      <div className="lg:col-span-2 pt-4">
        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Dev &amp; Build
        </p>
      </div>

      {/* ── Build & Cache ─ single column on desktop ──────────────────── */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Build &amp; Cache</h2>
        <AdminTools buildInfo={buildInfo} />
      </Card>

      </div>
    </div>
  );
}

async function HmsErrorLog() {
  const events = await db.query.hmsEvents.findMany({
    orderBy: [desc(hmsEvents.createdAt)],
    limit: 20,
    with: {
      spool: { with: { filament: { with: { vendor: true } } } },
      print: { columns: { id: true, name: true } },
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">HMS Error Log</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Recent printer health events (last 20)
        </p>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No HMS events recorded yet</p>
      ) : (
        <div className="space-y-1">
          {events.map((evt) => {
            const filamentName = evt.spool?.filament
              ? `${evt.spool.filament.vendor?.name ?? ""} ${evt.spool.filament.material}`.trim()
              : null;

            return (
              <div
                key={evt.id}
                className="flex items-start gap-2 text-xs py-1.5 border-b border-border last:border-0"
              >
                <span
                  className={cn(
                    "inline-flex items-center h-4 px-1.5 rounded-full text-2xs font-bold uppercase tracking-wide border shrink-0 mt-0.5",
                    evt.severity === "fatal" ? "bg-destructive/15 text-destructive border-destructive/30" :
                    evt.severity === "serious" ? "bg-warning/15 text-warning border-warning/30" :
                    evt.severity === "common" ? "bg-primary/10 text-primary border-primary/20" :
                    "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {evt.severity ?? "?"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{evt.message || evt.hmsCode}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
                    <span className="font-mono">{evt.hmsCode}</span>
                    {filamentName && <span>· {filamentName}</span>}
                    {evt.print?.name && <span>· {evt.print.name}</span>}
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0">
                  {evt.createdAt ? new Date(evt.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
                {evt.wikiUrl && (
                  <a
                    href={evt.wikiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline shrink-0"
                  >
                    Wiki
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
