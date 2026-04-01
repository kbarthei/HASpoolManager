"use client";

import { Pie, PieChart, Cell, Label } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { InventoryByMaterial } from "@/lib/queries";

// Fixed palette for known materials; unknown materials get a fallback grey shade
const MATERIAL_COLORS: Record<string, string> = {
  PLA: "#14b8a6",   // teal-500
  PETG: "#10b981",  // emerald-500
  ABS: "#ef4444",   // red-500
  TPU: "#a855f7",   // purple-500
  ASA: "#f97316",   // orange-500
  PA: "#3b82f6",    // blue-500
  PC: "#6366f1",    // indigo-500
  HIPS: "#84cc16",  // lime-500
};

const FALLBACK_COLORS = [
  "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b",
];

function buildChartConfig(data: InventoryByMaterial[]): ChartConfig {
  const config: ChartConfig = {};
  let fallbackIdx = 0;
  for (const item of data) {
    const color =
      MATERIAL_COLORS[item.material.toUpperCase()] ??
      FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
    config[item.material] = { label: item.material, color };
  }
  return config;
}

export function InventoryChart({ data }: { data: InventoryByMaterial[] }) {
  const hasData = data.length > 0 && data.some((d) => d.count > 0);
  const totalSpools = data.reduce((sum, d) => sum + d.count, 0);
  const chartConfig = buildChartConfig(data);

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Bestand nach Material</CardTitle>
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
                    nameKey="material"
                    formatter={(value, name) => [
                      `${value} Spulen`,
                      String(name),
                    ]}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="count"
                nameKey="material"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.material}
                    fill={`var(--color-${entry.material})`}
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
                          className="fill-foreground text-lg font-bold"
                          fontSize={18}
                          fontWeight={700}
                        >
                          {totalSpools}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          dy="1.3em"
                          className="fill-muted-foreground"
                          fontSize={10}
                        >
                          Spulen
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
              <ChartLegend
                content={<ChartLegendContent nameKey="material" />}
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
