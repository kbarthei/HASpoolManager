"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AvgDurationPerMonth } from "@/lib/queries";

const chartConfig = {
  minutes: {
    label: "Ø Dauer",
    color: "#6366f1", // indigo-500
  },
} satisfies ChartConfig;

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function AvgDurationChart({ data }: { data: AvgDurationPerMonth[] }) {
  const hasData = data.some((d) => d.minutes > 0);

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Ø Druckdauer</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[140px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
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
                width={40}
                tickFormatter={(v: number) => formatMinutes(v)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [
                      formatMinutes(typeof value === "number" ? value : 0),
                      "Ø Dauer",
                    ]}
                  />
                }
              />
              <Bar dataKey="minutes" fill="var(--color-minutes)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
