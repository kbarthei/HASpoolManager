import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type BarChartProps = {
  data: { label: string; value: number }[];
  maxValue: number;
  width: number;
  height: number;
  startFrame: number;
  staggerFrames: number;
  barColor?: string;
  currencyPrefix?: string;
};

export const BarChart: React.FC<BarChartProps> = ({
  data,
  maxValue,
  width,
  height,
  startFrame,
  staggerFrames,
  barColor = colors.accent,
  currencyPrefix = "€",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const padding = 32;
  const chartHeight = height - padding - 28;
  const barAreaWidth = width - padding * 2;
  const barWidth = (barAreaWidth / data.length) * 0.6;
  const gap = (barAreaWidth / data.length) * 0.4;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <line
        x1={padding}
        y1={chartHeight + padding / 2}
        x2={width - padding}
        y2={chartHeight + padding / 2}
        stroke={colors.border}
      />
      {data.map((d, i) => {
        const progress = spring({
          frame: frame - (startFrame + i * staggerFrames),
          fps,
          config: { damping: 14, mass: 0.8 },
        });
        const h = (d.value / maxValue) * chartHeight * progress;
        const x = padding + i * (barWidth + gap) + gap / 2;
        const y = chartHeight + padding / 2 - h;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={6}
              fill={barColor}
              opacity={0.9}
            />
            <text
              x={x + barWidth / 2}
              y={y - 8}
              textAnchor="middle"
              fill={colors.text}
              fontFamily={fonts.mono}
              fontSize={13}
              opacity={progress}
            >
              {currencyPrefix}
              {d.value.toFixed(2)}
            </text>
            <text
              x={x + barWidth / 2}
              y={chartHeight + padding / 2 + 18}
              textAnchor="middle"
              fill={colors.textMuted}
              fontFamily={fonts.sans}
              fontSize={12}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
