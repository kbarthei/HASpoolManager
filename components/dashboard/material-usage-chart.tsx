"use client";

import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MaterialUsage } from "@/lib/queries";

// Fallback colors when colorHex is unknown/default
const FALLBACK_COLOR = "#94a3b8";

const chartConfig = {
  totalUsed: {
    label: "Verbrauch (g)",
    color: FALLBACK_COLOR,
  },
} satisfies ChartConfig;

function hexToRgba(hex: string, alpha = 1): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return FALLBACK_COLOR;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Custom tooltip content (no ChartTooltipContent — we need custom label)
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MaterialUsage & { label: string }; value: number }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 shadow-md text-xs">
      <p className="font-medium">{d.vendor} {d.name}</p>
      <p className="text-muted-foreground">{d.color} · {d.material}</p>
      <p className="mt-0.5">{d.totalUsed} g · {d.printCount} Drucke</p>
    </div>
  );
}

export function MaterialUsageChart({ data }: { data: MaterialUsage[] }) {
  const hasData = data.length > 0 && data.some((d) => d.totalUsed > 0);

  const chartData = data.map((item) => ({
    ...item,
    // Short label for Y axis
    label: `${item.name} ${item.color}`.slice(0, 24),
    // Actual bar color from filament hex
    barColor: item.colorHex && item.colorHex !== "888888"
      ? hexToRgba(item.colorHex.startsWith("#") ? item.colorHex : `#${item.colorHex}`)
      : FALLBACK_COLOR,
  }));

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Meistgenutzte Filamente</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasData ? (
          <div className="flex items-center justify-center h-[280px]">
            <p className="text-xs text-muted-foreground">Noch keine Daten</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="w-full" style={{ height: `${chartData.length * 24 + 16}px`, minHeight: "120px", maxHeight: "280px" }}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 2, right: 8, bottom: 2, left: 4 }}
              barSize={11}
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
              <ChartTooltip content={<CustomTooltip />} />
              <Bar dataKey="totalUsed" radius={[0, 3, 3, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={`${entry.name}-${entry.color}-${i}`} fill={entry.barColor} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
