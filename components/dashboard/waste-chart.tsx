"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WastePerMonth } from "@/lib/queries";

const chartConfig = {
  grams: {
    label: "Verschnitt",
    color: "#f97316", // orange-500
  },
} satisfies ChartConfig;

export function WasteChart({ data }: { data: WastePerMonth[] }) {
  const hasData = data.some((d) => d.grams > 0);
  const total = data.reduce((sum, d) => sum + d.grams, 0);

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">
          Verschnitt / Purge
          {total > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({total}g gesamt)
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
                width={32}
                tickFormatter={(v: number) => `${v}g`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [`${value} g`, "Verschnitt"]}
                  />
                }
              />
              <Bar dataKey="grams" fill="var(--color-grams)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
