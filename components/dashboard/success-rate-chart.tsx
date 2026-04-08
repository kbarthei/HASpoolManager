"use client";

import { Line, LineChart, XAxis, YAxis, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SuccessRatePerMonth } from "@/lib/queries";

const chartConfig = {
  rate: {
    label: "Erfolgsrate",
    color: "#10b981",
  },
} satisfies ChartConfig;

export function SuccessRateChart({ data }: { data: SuccessRatePerMonth[] }) {
  const hasData = data.some((d) => d.total > 0);
  const totalPrints = data.reduce((sum, d) => sum + d.total, 0);
  const weightedRate =
    totalPrints > 0
      ? Math.round(
          data.reduce((sum, d) => sum + (d.rate * d.total), 0) / totalPrints,
        )
      : 0;

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">
          Erfolgsrate
          {hasData && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (Ø {weightedRate}%)
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
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickMargin={4}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickMargin={2}
                width={32}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ReferenceLine
                y={90}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(_value, _name, item) => {
                      const p = item?.payload as SuccessRatePerMonth | undefined;
                      if (!p) return null;
                      return [`${p.rate}% (${p.total} Drucke)`, "Erfolgsrate"];
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="var(--color-rate)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-rate)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
