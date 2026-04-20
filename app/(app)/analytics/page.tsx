export const dynamic = "force-dynamic";

import { getDashboardChartData } from "@/lib/queries";
import { PrintCostChart } from "@/components/dashboard/print-cost-chart";
import { InventoryChart } from "@/components/dashboard/inventory-chart";
import { HmsErrorsChart } from "@/components/dashboard/hms-errors-chart";
import { HmsByModuleChart } from "@/components/dashboard/hms-by-module-chart";
import { SpendByVendorChart } from "@/components/dashboard/spend-by-vendor-chart";
import { FilamentConsumedChart } from "@/components/dashboard/filament-consumed-chart";
import { SpoolLifecycleChart } from "@/components/dashboard/spool-lifecycle-chart";
import { MaterialUsageChart } from "@/components/dashboard/material-usage-chart";
import { AvgDurationChart } from "@/components/dashboard/avg-duration-chart";
import { SuccessRateChart } from "@/components/dashboard/success-rate-chart";
import { WasteChart } from "@/components/dashboard/waste-chart";
import { ColorDistributionChart } from "@/components/dashboard/color-distribution-chart";
import { VendorQualityChart } from "@/components/dashboard/vendor-quality-chart";
import { StockValueChart } from "@/components/dashboard/stock-value-chart";

export default async function AnalyticsPage() {
  const chartData = await getDashboardChartData();

  return (
    <div data-testid="page-analytics" className="space-y-3">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Analytics
        </h2>
      </div>

      {/* Cost & inventory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <PrintCostChart data={chartData.printCostPerMonth} />
        <InventoryChart data={chartData.inventory} />
      </div>

      {/* Spend & consumption */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <SpendByVendorChart data={chartData.spendByVendor} />
        <FilamentConsumedChart data={chartData.filamentConsumed} />
      </div>

      {/* Lifecycle & material mix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <SpoolLifecycleChart data={chartData.spoolLifecycle} />
        <MaterialUsageChart data={chartData.materialUsage} />
      </div>

      {/* Print quality */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <AvgDurationChart data={chartData.avgDuration} />
        <SuccessRateChart data={chartData.successRate} />
        <WasteChart data={chartData.wastePerMonth} />
      </div>

      {/* Inventory distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <ColorDistributionChart data={chartData.colorDistribution} />
        <VendorQualityChart data={chartData.vendorQuality} />
        <StockValueChart data={chartData.stockValueHistory} />
      </div>

      {/* HMS errors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <HmsErrorsChart data={chartData.hmsErrorsPerMonth} />
        <HmsByModuleChart data={chartData.hmsErrorsByModule} />
      </div>
    </div>
  );
}
