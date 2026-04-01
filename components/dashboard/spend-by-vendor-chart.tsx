"use client";

import { Pie, PieChart, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SpendByVendor } from "@/lib/queries";

// Distinct palette for vendors
const VENDOR_COLORS = [
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
  "#f97316", // orange-500
  "#a855f7", // purple-500
  "#3b82f6", // blue-500
  "#ec4899", // pink-500
  "#84cc16", // lime-500
  "#ef4444", // red-500
];

function buildChartConfig(data: SpendByVendor[]): ChartConfig {
  const config: ChartConfig = {};
  data.forEach((item, i) => {
    // Use a CSS-safe key: replace spaces and special chars with underscore
    const key = item.vendor.replace(/[^a-zA-Z0-9]/g, "_");
    config[key] = {
      label: item.vendor,
      color: VENDOR_COLORS[i % VENDOR_COLORS.length],
    };
  });
  return config;
}

export function SpendByVendorChart({ data }: { data: SpendByVendor[] }) {
  const hasData = data.length > 0 && data.some((d) => d.spend > 0);
  const chartConfig = buildChartConfig(data);

  // Recharts needs the key to match the data we reference in Cell
  const chartData = data.map((item, i) => ({
    ...item,
    fill: VENDOR_COLORS[i % VENDOR_COLORS.length],
    // key used by ChartLegendContent / ChartTooltipContent
    vendorKey: item.vendor.replace(/[^a-zA-Z0-9]/g, "_"),
  }));

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Ausgaben nach Hersteller</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[160px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[160px] w-full">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="vendor"
                    formatter={(value) => [
                      `${typeof value === "number" ? value.toFixed(2) : value} €`,
                      "",
                    ]}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="spend"
                nameKey="vendor"
                innerRadius="45%"
                outerRadius="72%"
                paddingAngle={2}
              >
                {chartData.map((entry, i) => (
                  <Cell key={entry.vendor} fill={VENDOR_COLORS[i % VENDOR_COLORS.length]} />
                ))}
              </Pie>
              <ChartLegend
                content={<ChartLegendContent nameKey="vendorKey" />}
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
