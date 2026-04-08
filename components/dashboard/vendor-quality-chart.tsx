"use client";

import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { VendorQuality } from "@/lib/queries";

const chartConfig = {
  rate: {
    label: "Erfolgsrate",
    color: "#10b981",
  },
} satisfies ChartConfig;

function colorForRate(rate: number): string {
  if (rate >= 90) return "#10b981"; // emerald
  if (rate >= 75) return "#eab308"; // yellow
  if (rate >= 50) return "#f97316"; // orange
  return "#ef4444"; // red
}

export function VendorQualityChart({ data }: { data: VendorQuality[] }) {
  const hasData = data.length > 0;

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Vendor-Qualität</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[140px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[140px] w-full">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 32, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                dataKey="vendor"
                type="category"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={70}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(_value, _name, item) => {
                      const p = item?.payload as VendorQuality | undefined;
                      if (!p) return null;
                      return [
                        `${p.rate}% (${p.success}/${p.total})`,
                        "Erfolgsrate",
                      ];
                    }}
                  />
                }
              />
              <Bar dataKey="rate" radius={[0, 3, 3, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.vendor} fill={colorForRate(entry.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
