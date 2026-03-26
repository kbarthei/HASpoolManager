import { getDashboardStats, getAmsSlots, getLowStockSpools, getRecentPrints } from "@/lib/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { AmsMiniView } from "@/components/dashboard/ams-mini-view";
import { LowStockList } from "@/components/dashboard/low-stock-list";
import { RecentPrints } from "@/components/dashboard/recent-prints";

export default async function Dashboard() {
  const [stats, slots, lowStock, prints] = await Promise.all([
    getDashboardStats(),
    getAmsSlots(),
    getLowStockSpools(),
    getRecentPrints(),
  ]);

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Active Spools" value={stats.activeSpools} href="/spools" />
        <StatCard label="Printer" value="Idle" valueClassName="text-emerald-500" />
        <StatCard label="This Month" value={`${stats.monthCost}€`} />
        <StatCard
          label="Low Stock"
          value={stats.lowStockCount}
          valueClassName={stats.lowStockCount > 0 ? "text-amber-500" : undefined}
          href="/spools?status=low"
        />
      </div>

      {/* AMS + Low Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AmsMiniView slots={slots} />
        <LowStockList spools={lowStock} />
      </div>

      {/* Recent Prints */}
      <RecentPrints prints={prints} />
    </div>
  );
}
