import React, { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors, fonts } from "../theme";

type LineChartProps = {
  points: { x: number; y: number }[];
  width: number;
  height: number;
  startFrame: number;
  drawFrames: number;
  strokeColor?: string;
  title?: string;
  yLabel?: string;
};

export const LineChart: React.FC<LineChartProps> = ({
  points,
  width,
  height,
  startFrame,
  drawFrames,
  strokeColor = colors.accent,
  title,
  yLabel,
}) => {
  const frame = useCurrentFrame();

  const padding = 32;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2 - 20;

  const { pathD, totalLen } = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const mapped = points.map((p) => ({
      x: padding + ((p.x - xMin) / (xMax - xMin)) * plotW,
      y: padding + 20 + plotH - ((p.y - yMin) / (yMax - yMin)) * plotH,
    }));

    let d = `M ${mapped[0].x} ${mapped[0].y}`;
    let len = 0;
    for (let i = 1; i < mapped.length; i++) {
      d += ` L ${mapped[i].x} ${mapped[i].y}`;
      const dx = mapped[i].x - mapped[i - 1].x;
      const dy = mapped[i].y - mapped[i - 1].y;
      len += Math.hypot(dx, dy);
    }
    return { pathD: d, totalLen: len };
  }, [points, padding, plotW, plotH]);

  const progress = interpolate(
    frame,
    [startFrame, startFrame + drawFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dashOffset = totalLen * (1 - progress);

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {title && (
        <text
          x={padding}
          y={padding * 0.6}
          fill={colors.text}
          fontFamily={fonts.sans}
          fontSize={14}
        >
          {title}
        </text>
      )}
      {yLabel && (
        <text
          x={width - padding}
          y={padding * 0.6}
          fill={colors.textMuted}
          fontFamily={fonts.mono}
          fontSize={12}
          textAnchor="end"
        >
          {yLabel}
        </text>
      )}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={totalLen}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
};
