export const dynamic = "force-dynamic";

import { getDashboardStats, getAmsSlots, getLowStockSpools, getRecentPrints, getPrinterStatus, getFilamentSummary, getDashboardChartData } from "@/lib/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { AmsMiniView } from "@/components/dashboard/ams-mini-view";
import { LowStockList } from "@/components/dashboard/low-stock-list";
import { RecentPrints } from "@/components/dashboard/recent-prints";
import { FilamentSummary } from "@/components/dashboard/filament-summary";
import { MonthlySpendChart } from "@/components/dashboard/monthly-spend-chart";
import { InventoryChart } from "@/components/dashboard/inventory-chart";
import { PrintsChart } from "@/components/dashboard/prints-chart";
import { SpendByVendorChart } from "@/components/dashboard/spend-by-vendor-chart";
import { FilamentConsumedChart } from "@/components/dashboard/filament-consumed-chart";
import { SpoolLifecycleChart } from "@/components/dashboard/spool-lifecycle-chart";
import { MaterialUsageChart } from "@/components/dashboard/material-usage-chart";
import { AddOrderButton } from "@/components/orders/add-order-button";
import Link from "next/link";

export default async function Dashboard() {
  const [stats, slots, lowStock, prints, printerStatus, filamentSummary, chartData] = await Promise.all([
    getDashboardStats(),
    getAmsSlots(),
    getLowStockSpools(),
    getRecentPrints(),
    getPrinterStatus(),
    getFilamentSummary(),
    getDashboardChartData(),
  ]);

  return (
    <div className="space-y-3">
      {/* Draft spool notification */}
      {stats.draftSpoolCount > 0 && (
        <Link
          data-testid="draft-notification"
          href="/spools?status=draft"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm hover:bg-amber-500/20 transition-colors"
        >
          <span className="text-base leading-none">⚠</span>
          <span className="font-medium">
            {stats.draftSpoolCount} new spool{stats.draftSpoolCount > 1 ? "s" : ""} need{stats.draftSpoolCount === 1 ? "s" : ""} review
          </span>
          <span className="ml-auto text-xs opacity-70">Identify →</span>
        </Link>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dashboard</h2>
        <AddOrderButton />
      </div>
      <div data-testid="dashboard-stats" className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Active Spools" value={stats.activeSpools} href="/spools" testId="stat-active-spools" />
        <StatCard
          label="Printer"
          value={
            printerStatus.status === "printing"
              ? `${Math.round(printerStatus.progress ?? 0)}%`
              : printerStatus.status === "idle"
              ? "Idle"
              : "Offline"
          }
          subtitle={
            printerStatus.status === "printing"
              ? `${printerStatus.printName || "Printing"}${printerStatus.activeSpool ? ` · ${printerStatus.activeSpool.material}` : ""}${(printerStatus.remainingTime ?? 0) > 0 ? ` · ${Math.round(printerStatus.remainingTime ?? 0)}min` : ""}`
              : undefined
          }
          valueClassName={
            printerStatus.status === "printing"
              ? "text-primary"
              : printerStatus.status === "idle"
              ? "text-emerald-500"
              : "text-muted-foreground"
          }
          href="/prints"
          testId="stat-printer"
        />
        <StatCard label="Prints" value={stats.monthPrints} href="/prints" testId="stat-prints" />
        <StatCard
          label="Low Stock"
          value={stats.lowStockCount}
          valueClassName={stats.lowStockCount > 0 ? "text-amber-500" : undefined}
          href="/spools?status=low"
          testId="stat-low-stock"
        />
      </div>

      {/* AMS + Low Stock + Filaments in Stock */}
      <div data-testid="dashboard-ams" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <AmsMiniView slots={slots} />
        <LowStockList spools={lowStock} />
        <FilamentSummary summary={filamentSummary} />
      </div>

      {/* Recent Prints */}
      <RecentPrints prints={prints} />

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <MonthlySpendChart data={chartData.monthlySpend} />
        <InventoryChart data={chartData.inventory} />
        <PrintsChart data={chartData.printsPerMonth} />
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <SpendByVendorChart data={chartData.spendByVendor} />
        <FilamentConsumedChart data={chartData.filamentConsumed} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <SpoolLifecycleChart data={chartData.spoolLifecycle} />
        <MaterialUsageChart data={chartData.materialUsage} />
      </div>
    </div>
  );
}
