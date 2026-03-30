import { getDashboardStats, getAmsSlots, getLowStockSpools, getRecentPrints, getPrinterStatus, getFilamentSummary } from "@/lib/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { AmsMiniView } from "@/components/dashboard/ams-mini-view";
import { LowStockList } from "@/components/dashboard/low-stock-list";
import { RecentPrints } from "@/components/dashboard/recent-prints";
import { FilamentSummary } from "@/components/dashboard/filament-summary";
import { AddOrderButton } from "@/components/orders/add-order-button";

export default async function Dashboard() {
  const [stats, slots, lowStock, prints, printerStatus, filamentSummary] = await Promise.all([
    getDashboardStats(),
    getAmsSlots(),
    getLowStockSpools(),
    getRecentPrints(),
    getPrinterStatus(),
    getFilamentSummary(),
  ]);

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dashboard</h2>
        <AddOrderButton />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Active Spools" value={stats.activeSpools} href="/spools" />
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
        />
        <StatCard label="Filament Costs" value={`${stats.monthCost}€`} href="/prints" />
        <StatCard
          label="Low Stock"
          value={stats.lowStockCount}
          valueClassName={stats.lowStockCount > 0 ? "text-amber-500" : undefined}
          href="/spools?status=low"
        />
      </div>

      {/* AMS + Low Stock + Filaments in Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <AmsMiniView slots={slots} />
        <LowStockList spools={lowStock} />
        <FilamentSummary summary={filamentSummary} />
      </div>

      {/* Recent Prints */}
      <RecentPrints prints={prints} />
    </div>
  );
}
