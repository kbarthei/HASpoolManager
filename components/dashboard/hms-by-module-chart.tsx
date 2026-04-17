"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { HmsErrorsByModule } from "@/lib/queries";

const chartConfig = {
  count: {
    label: "Errors",
    color: "#f59e0b", // amber-500
  },
} satisfies ChartConfig;

export function HmsByModuleChart({ data }: { data: HmsErrorsByModule[] }) {
  const hasData = data.length > 0;

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">HMS Errors by Module</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[140px]">
            <p className="text-xs text-muted-foreground">No errors recorded</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[140px] w-full">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="module"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={64}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => [
                      `${value} error${value !== 1 ? "s" : ""}`,
                      (item.payload as { module: string }).module,
                    ]}
                  />
                }
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
