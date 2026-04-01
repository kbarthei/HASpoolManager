"use client";

import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SpoolLifecycle } from "@/lib/queries";

const chartConfig = {
  used: {
    label: "Verbraucht",
    color: "#14b8a6", // teal-500
  },
  remaining: {
    label: "Verbleibend",
    color: "#e2e8f0", // slate-200 (muted)
  },
} satisfies ChartConfig;

export function SpoolLifecycleChart({ data }: { data: SpoolLifecycle[] }) {
  const hasData = data.length > 0;

  // Build short labels: "vendor · name · color" truncated
  const chartData = data.map((s) => ({
    ...s,
    label: `${s.vendor} ${s.name} ${s.color}`.slice(0, 28),
  }));

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Spulen-Lebenszyklus</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[280px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="w-full" style={{ height: `${chartData.length * 22 + 16}px`, minHeight: "120px", maxHeight: "340px" }}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 2, right: 8, bottom: 2, left: 4 }}
              barSize={10}
            >
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9 }}
                tickFormatter={(v: number) => `${v}g`}
                width={36}
              />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9 }}
                width={120}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      `${typeof value === "number" ? value.toFixed(0) : value} g`,
                      name === "used" ? "Verbraucht" : "Verbleibend",
                    ]}
                  />
                }
              />
              <Bar dataKey="used" stackId="lifecycle" fill="var(--color-used)" radius={[0, 0, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.id}
                    fill={entry.status === "empty" ? "#64748b" : "var(--color-used)"}
                  />
                ))}
              </Bar>
              <Bar dataKey="remaining" stackId="lifecycle" fill="var(--color-remaining)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
