import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { LineChart } from "../components/LineChart";
import { BarChart } from "../components/BarChart";
import { pricePerKg90d, monthlySpend, totalFilamentCostEur } from "../data/mockData";
import { colors, fonts, radii } from "../theme";

// Adapt mockData shapes to v1 chart APIs:
// - LineChart expects { x, y }[] points; convert pricePerKg90d (number[]).
// - BarChart expects maxValue + staggerFrames in addition to data.
const linePoints = pricePerKg90d.map((y, x) => ({ x, y }));
const barMax = Math.max(...monthlySpend.map((m) => m.value)) * 1.2;

export const Beat8Analytics: React.FC = () => {
  const frame = useCurrentFrame();

  const big = interpolate(frame, [40, 130], [0, totalFilamentCostEur], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const dim = interpolate(frame, [0, 30], [0, 0.45], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0 }}>
        <ScreenshotFrame
          src="screenshots/dark/desktop/08-analytics.png"
          fit="top-aligned"
          shadow={false}
        />
      </div>
      {/* Dim overlay so re-drawn charts pop */}
      <div style={{
        position: "absolute", inset: 0,
        background: "#000",
        opacity: dim,
      }} />

      {/* Big number — top center */}
      <div style={{
        position: "absolute",
        left: "50%", top: "10%",
        transform: "translate(-50%, 0)",
        textAlign: "center",
        fontFamily: fonts.sans,
        opacity: interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1.5,
        }}>
          Filament tracked
        </div>
        <div style={{
          fontSize: 110, fontWeight: 800, fontFamily: fonts.mono,
          color: colors.accent, letterSpacing: -3, marginTop: 6,
        }}>
          €{big.toFixed(2)}
        </div>
      </div>

      {/* Line chart — price-per-kg, left bottom */}
      <div style={{
        position: "absolute",
        left: "5%", top: "44%",
        width: "42%", height: "44%",
        padding: "20px 24px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        opacity: interpolate(frame, [80, 120], [0, 1], { extrapolateRight: "clamp" }),
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
          fontFamily: fonts.sans,
        }}>
          €/kg — last 90 days
        </div>
        <LineChart
          points={linePoints}
          strokeColor={colors.accent}
          startFrame={100}
          drawFrames={120}
          width={680}
          height={240}
        />
      </div>

      {/* Bar chart — monthly spend, right bottom */}
      <div style={{
        position: "absolute",
        left: "53%", top: "44%",
        width: "42%", height: "44%",
        padding: "20px 24px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        opacity: interpolate(frame, [110, 150], [0, 1], { extrapolateRight: "clamp" }),
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
          fontFamily: fonts.sans,
        }}>
          Monthly spend
        </div>
        <BarChart
          data={monthlySpend}
          maxValue={barMax}
          width={680}
          height={240}
          startFrame={130}
          staggerFrames={8}
          barColor="#0A84FF"
        />
      </div>
    </AbsoluteFill>
  );
};
