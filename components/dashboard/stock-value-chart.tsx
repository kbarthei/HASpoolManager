"use client";

import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StockValuePoint } from "@/lib/queries";

const chartConfig = {
  value: {
    label: "Lagerwert",
    color: "#14b8a6", // teal-500
  },
} satisfies ChartConfig;

export function StockValueChart({ data }: { data: StockValuePoint[] }) {
  const hasData = data.some((d) => d.value > 0);
  const current = data[data.length - 1]?.value ?? 0;

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">
          Lagerwert über Zeit
          {current > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({current.toFixed(0)} € aktuell)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[140px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[140px] w-full">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="stockValueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
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
                width={40}
                tickFormatter={(v: number) => `${Math.round(v)}€`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [
                      `${typeof value === "number" ? value.toFixed(2) : value} €`,
                      "Lagerwert",
                    ]}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--color-value)"
                strokeWidth={2}
                fill="url(#stockValueFill)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
