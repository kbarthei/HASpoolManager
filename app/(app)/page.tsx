export const dynamic = "force-dynamic";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import { prints as printsTable } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getDashboardStats,
  getAmsSlots,
  getSupplyStatus,
  getRecentPrints,
  getPrinterStatus,
  getDashboardChartData,
} from "@/lib/queries";

interface PhotoEntry {
  path: string;
  kind: "cover" | "snapshot" | "user";
  captured_at: string | null;
}

async function getRunningPrintHero(): Promise<{ printId: string; photo: PhotoEntry } | null> {
  const row = await db.query.prints.findFirst({
    where: eq(printsTable.status, "running"),
    orderBy: [desc(printsTable.startedAt)],
    columns: { id: true, photoUrls: true },
  });
  if (!row?.photoUrls) return null;
  try {
    const arr = JSON.parse(row.photoUrls) as PhotoEntry[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // Prefer cover, then snapshot, then any user upload
    const photo =
      arr.find((p) => p.kind === "cover") ??
      arr.find((p) => p.kind === "snapshot") ??
      arr[0];
    return { printId: row.id, photo };
  } catch {
    return null;
  }
}
import { StatCard } from "@/components/dashboard/stat-card";
import { BudgetCard } from "@/components/budget/budget-card";
import { MonthlySpendChart } from "@/components/dashboard/monthly-spend-chart";
import { PrintsChart } from "@/components/dashboard/prints-chart";
import { AddOrderButton } from "@/components/orders/add-order-button";

type SlotWithSpool = Awaited<ReturnType<typeof getAmsSlots>>[number];
type SupplyStatusEntry = Awaited<ReturnType<typeof getSupplyStatus>>[number];
type PrinterStatus = Awaited<ReturnType<typeof getPrinterStatus>>;
type PrintWithUsage = Awaited<ReturnType<typeof getRecentPrints>>[number];

export default async function Dashboard() {
  const [stats, slots, supplyStatus, prints, printerStatus, chartData, runningHero] = await Promise.all([
    getDashboardStats(),
    getAmsSlots(),
    getSupplyStatus(),
    getRecentPrints(),
    getPrinterStatus(),
    getDashboardChartData(),
    getRunningPrintHero(),
  ]);

  const needsAttention = supplyStatus.filter(s => s.urgency !== "ok");

  return (
    <div data-testid="page-dashboard" className="space-y-3">
      {/* Draft spool review */}
      {stats.draftSpoolCount > 0 && (
        <Link
          data-testid="draft-notification"
          href="/spools?status=draft"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm hover:bg-warning/20 transition-colors"
        >
          <span className="text-base leading-none">⚠</span>
          <span className="font-medium">
            {stats.draftSpoolCount} new spool{stats.draftSpoolCount > 1 ? "s" : ""} need
            {stats.draftSpoolCount === 1 ? "s" : ""} review
          </span>
          <span className="ml-auto text-xs opacity-70">Identify →</span>
        </Link>
      )}

      {/* Printer Live hero */}
      <PrinterLiveCard status={printerStatus} slots={slots} runningHero={runningHero} />

      {/* 2×2 stat grid */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <h2 className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">
          Dashboard
        </h2>
        <AddOrderButton />
      </div>
      <div
        data-testid="dashboard-stats"
        className="grid grid-cols-2 gap-3 [&>*]:animate-fade-in-up"
      >
        <StatCard
          label="Active spools"
          value={stats.activeSpools}
          href="/spools"
          testId="stat-active-spools"
        />
        <StatCard
          label="Prints this month"
          value={stats.monthPrints}
          tone="success"
          href="/prints"
          testId="stat-prints"
        />
        <StatCard
          label="Spend this month"
          value={`€${stats.monthCost.toFixed(0)}`}
          sub="filament + energy"
          testId="stat-spend"
        />
        <StatCard
          label="Low stock"
          value={stats.lowStockCount}
          sub={stats.lowStockCount > 0 ? "needs reorder" : undefined}
          tone={stats.lowStockCount > 0 ? "destructive" : "muted"}
          href="/spools?status=low"
          testId="stat-low-stock"
        />
      </div>

      {/* Budget */}
      <BudgetCard />

      {/* Needs attention — compact list */}
      {needsAttention.length > 0 && <LowStockList items={needsAttention} />}

      {/* Recent prints — compact list */}
      <RecentPrintsList prints={prints} />

      {/* Key charts on Overview — full analytics lives at /analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <MonthlySpendChart data={chartData.monthlySpend} />
        <PrintsChart data={chartData.printsPerMonth} />
      </div>

      <Link
        href="/analytics"
        data-testid="see-all-analytics"
        className="block text-center text-sm text-primary font-medium py-3 hover:text-primary/80 transition-colors"
      >
        See all analytics →
      </Link>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Printer Live card — the visual anchor of the Overview
// ──────────────────────────────────────────────────────────────────────────

function PrinterLiveCard({
  status,
  slots,
  runningHero,
}: {
  status: PrinterStatus;
  slots: SlotWithSpool[];
  runningHero: { printId: string; photo: PhotoEntry } | null;
}) {
  const isPrinting = status.status === "printing";
  const isIdle = status.status === "idle";
  const isOffline = !isPrinting && !isIdle;

  // Chip strip: all AMS + AMS HT slots, excluding external. AMS first, then HT.
  const chipSlots = slots
    .filter(s => s.slotType === "ams" || s.slotType === "ams_ht")
    .sort((a, b) => a.amsIndex - b.amsIndex || a.trayIndex - b.trayIndex);
  const loaded = chipSlots.filter(s => !s.isEmpty).length;
  const total = chipSlots.length;

  const subtitle = isPrinting
    ? [
        status.printName || "Printing",
        status.activeSpool?.material ?? undefined,
        status.remainingTime && status.remainingTime > 0
          ? `${Math.round(status.remainingTime)} min left`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : isIdle
    ? `${loaded} of ${total} AMS slots loaded`
    : "Printer not reachable";

  const heroImageSrc = runningHero
    ? `/api/v1/prints/${runningHero.printId}/photos/${encodeURIComponent(
        runningHero.photo.path.split("/").pop() ?? "",
      )}`
    : null;

  return (
    <Card data-testid="printer-live" className="p-5 rounded-2xl">
      <div className="flex items-center gap-3 mb-3">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            isPrinting && "bg-primary shadow-[0_0_0_4px_rgba(48,176,199,0.22)]",
            isIdle && "bg-success shadow-[0_0_0_4px_rgba(52,199,89,0.22)]",
            isOffline && "bg-muted-foreground",
          )}
          aria-hidden
        />
        <span className="text-2xs font-bold tracking-wider uppercase text-ink-2">
          {status.name} · {status.status}
        </span>
      </div>

      <div className="flex items-start gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-[-0.025em] leading-none">
              {isPrinting ? `${Math.round(status.progress ?? 0)}%` : `${loaded}/${total}`}
            </span>
            <span className="text-sm text-muted-foreground truncate">{subtitle}</span>
          </div>
        </div>
        {isPrinting && heroImageSrc && (
          <Link
            href="/prints"
            className="shrink-0 block rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
            title={runningHero?.photo.kind === "cover" ? "3D-Modell-Cover" : "Print-Snapshot"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageSrc}
              alt="Current print preview"
              className="w-20 h-20 object-cover bg-muted"
              loading="eager"
            />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {chipSlots.map(slot => (
          <AmsChip key={slot.id} slot={slot} />
        ))}
      </div>
    </Card>
  );
}

function AmsChip({ slot }: { slot: SlotWithSpool }) {
  const label = slot.slotType === "ams_ht" ? "HT" : `${slot.trayIndex + 1}`;

  if (slot.isEmpty || !slot.spool) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-background border border-dashed border-border opacity-60">
        <div className="w-10 h-10 rounded-full border border-dashed border-border shrink-0" />
        <div className="min-w-0">
          <div className="text-2xs font-bold tracking-wide uppercase text-muted-foreground">
            Slot {label}
          </div>
          <div className="text-sm text-muted-foreground">— Empty —</div>
        </div>
      </div>
    );
  }

  const f = slot.spool.filament;
  const raw = slot.bambuRemain;
  const remainPct = raw !== null && raw >= 0 && raw <= 100 ? raw : null;
  const low = remainPct !== null && remainPct < 10;
  // Sanitize colorHex before inline style interpolation (CSS injection guard)
  const rawHex = f.colorHex ?? "";
  const colorHex = /^#?[0-9A-Fa-f]{6,8}$/.test(rawHex) ? rawHex : "888888";
  const spoolColor = colorHex.startsWith("#") ? colorHex : `#${colorHex.slice(0, 6)}`;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-background border",
        low ? "border-destructive" : "border-border",
      )}
    >
      <div
        className="spool-dot w-10 h-10 rounded-full shrink-0"
        style={{ ["--spool-color" as string]: spoolColor }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-2xs font-bold tracking-wide uppercase text-muted-foreground">
          Slot {label}
        </div>
        <div className="text-sm font-semibold truncate">{f.name}</div>
        <div className="text-2xs text-muted-foreground truncate">
          {f.vendor.name} · {f.material}
        </div>
        {remainPct !== null && (
          <>
            <div className="mt-1.5 h-[3px] rounded bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded", low ? "bg-destructive" : "bg-success")}
                style={{ width: `${remainPct}%` }}
              />
            </div>
            <div
              className={cn(
                "text-sm font-bold tracking-tight mt-0.5 font-[family-name:var(--font-geist-mono)] tabular-nums",
                low && "text-destructive",
              )}
            >
              {remainPct}%
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Low-stock list — compact Apple grouped list
// ──────────────────────────────────────────────────────────────────────────

function LowStockList({ items }: { items: SupplyStatusEntry[] }) {
  const sorted = [...items].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const top = sorted.slice(0, 4);

  return (
    <Card data-testid="needs-attention" className="p-5 rounded-xl">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold tracking-tight">Needs attention</h3>
        <Link href="/supply" className="text-xs text-primary font-medium">
          See all →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {top.map(item => {
          const colorHex = /^#?[0-9A-Fa-f]{6,8}$/.test(item.colorHex) ? item.colorHex : "888888";
          const spoolColor = colorHex.startsWith("#") ? colorHex : `#${colorHex.slice(0, 6)}`;
          const daysLabel =
            item.daysRemaining === Infinity || item.daysRemaining > 999
              ? "999+d"
              : `${Math.round(item.daysRemaining)}d`;
          return (
            <div
              key={item.filamentId}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div
                className="spool-dot w-9 h-9 rounded-full shrink-0"
                style={{ ["--spool-color" as string]: spoolColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {item.filamentName}
                </div>
                <div className="text-2xs text-muted-foreground truncate">
                  {item.vendor} · {item.material}
                </div>
              </div>
              <div
                className={cn(
                  "text-sm font-bold font-[family-name:var(--font-geist-mono)] tabular-nums",
                  item.urgency === "critical" ? "text-destructive" : "text-warning",
                )}
              >
                {daysLabel}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Recent prints — compact list
// ──────────────────────────────────────────────────────────────────────────

function RecentPrintsList({ prints }: { prints: PrintWithUsage[] }) {
  if (prints.length === 0) {
    return (
      <Card className="p-5 rounded-xl">
        <h3 className="text-base font-bold tracking-tight mb-1">Recent prints</h3>
        <p className="text-sm text-muted-foreground">No prints yet.</p>
      </Card>
    );
  }

  return (
    <Card data-testid="recent-prints" className="p-5 rounded-xl">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold tracking-tight">Recent prints</h3>
        <Link href="/prints" className="text-xs text-primary font-medium">
          History →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {prints.slice(0, 5).map(p => {
          const success = p.status === "finished";
          const weightUsed =
            p.usage.reduce((sum, u) => sum + (u.weightUsed ?? 0), 0) || (p.printWeight ?? 0);
          const cost = p.totalCost ?? p.filamentCost ?? 0;
          const spoolName = p.usage[0]?.spool?.filament?.name ?? "—";
          const when = p.finishedAt ?? p.startedAt;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-2xs font-bold",
                  success
                    ? "bg-success/15 text-success"
                    : "border border-destructive text-destructive",
                )}
                aria-label={success ? "success" : "failed"}
              >
                {success ? "✓" : "✕"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name ?? "—"}</div>
                <div className="text-2xs text-muted-foreground truncate">{spoolName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-[family-name:var(--font-geist-mono)] tabular-nums font-medium">
                  {Math.round(weightUsed)}g · €{cost.toFixed(2)}
                </div>
                <div className="text-2xs text-muted-foreground">{timeAgo(when)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function timeAgo(date: Date | null): string {
  if (!date) return "—";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  return `${diffDay} days ago`;
}
