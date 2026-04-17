"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PrintCostPerMonth } from "@/lib/queries";

const chartConfig = {
  filamentCost: {
    label: "Filament",
    color: "#0d9488", // teal-600
  },
  energyCost: {
    label: "Electricity",
    color: "#f59e0b", // amber-500
  },
} satisfies ChartConfig;

export function PrintCostChart({ data }: { data: PrintCostPerMonth[] }) {
  const hasData = data.some((d) => d.totalCost > 0);

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Print Costs (Monthly)</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[140px]">
            <p className="text-xs text-muted-foreground">No data yet</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[140px] w-full">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickMargin={4}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickMargin={2}
                width={36}
                tickFormatter={(v: number) => `${v}\u20AC`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label = name === "filamentCost" ? "Filament" : "Electricity";
                      return [
                        `${typeof value === "number" ? value.toFixed(2) : value} \u20AC`,
                        label,
                      ];
                    }}
                  />
                }
              />
              <Bar
                dataKey="filamentCost"
                stackId="cost"
                fill="var(--color-filamentCost)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="energyCost"
                stackId="cost"
                fill="var(--color-energyCost)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
