"use client";

import { Pie, PieChart, Cell, Label } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ColorDistribution } from "@/lib/queries";

const chartConfig = {} satisfies ChartConfig;

export function ColorDistributionChart({ data }: { data: ColorDistribution[] }) {
  const hasData = data.length > 0 && data.some((d) => d.weight > 0);
  const totalKg = data.reduce((sum, d) => sum + d.weight, 0) / 1000;

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Farbverteilung</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[140px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[140px] w-full">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="label"
                    formatter={(value, _name, item) => [
                      `${value} g`,
                      String(item?.payload?.label ?? ""),
                    ]}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="weight"
                nameKey="label"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={1}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={`${entry.colorHex}-${idx}`}
                    fill={`#${entry.colorHex.replace(/^#/, "")}`}
                    stroke="hsl(var(--background))"
                    strokeWidth={1}
                  />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          dy="-0.3em"
                          className="fill-foreground"
                          fontSize={18}
                          fontWeight={700}
                        >
                          {totalKg.toFixed(1)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          dy="1.3em"
                          className="fill-muted-foreground"
                          fontSize={10}
                        >
                          kg verbleibend
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
