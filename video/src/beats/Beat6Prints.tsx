import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { recentPrints } from "../data/mockData";
import { colors, fonts, radii } from "../theme";

const CostRow: React.FC<{
  label: string; value: number; accent: string; reveal: number; large?: boolean;
}> = ({ label, value, accent, reveal, large }) => {
  const shown = (value * reveal).toFixed(2);
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 10,
      opacity: 0.3 + 0.7 * reveal,
    }}>
      <div style={{
        fontSize: large ? 22 : 18,
        fontWeight: large ? 700 : 500,
        color: large ? colors.text : colors.textMuted,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: large ? 32 : 22,
        fontWeight: 700,
        fontFamily: fonts.mono,
        color: accent,
        letterSpacing: -0.5,
      }}>
        €{shown}
      </div>
    </div>
  );
};

export const Beat6Prints: React.FC = () => {
  const frame = useCurrentFrame();

  // Cost breakdown reveal: filament + energy = total
  const filamentReveal = interpolate(frame, [120, 160], [0, 1], { extrapolateRight: "clamp" });
  const energyReveal = interpolate(frame, [160, 200], [0, 1], { extrapolateRight: "clamp" });
  const totalReveal = interpolate(frame, [200, 240], [0, 1], { extrapolateRight: "clamp" });

  const print = recentPrints[1]; // "Filament guide", €1.84 + €0.31 = €2.15

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/05-prints.png"
        fit="top-aligned"
        scale={1}
        zoomFromFrame={0}
        zoomTo={1.05}
      />

      {/* Cost breakdown card — animated reveal */}
      <div style={{
        position: "absolute",
        right: "5%",
        top: "30%",
        width: 420,
        padding: "24px 28px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        fontFamily: fonts.sans,
        color: colors.text,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 16,
        }}>
          Cost breakdown — {print.name}
        </div>

        <CostRow
          label="Filament" value={print.filamentEur}
          accent={colors.accent} reveal={filamentReveal}
        />
        <CostRow
          label="Energy"   value={print.energyEur}
          accent="#FF9F0A" reveal={energyReveal}
        />

        <div style={{
          height: 1, background: colors.border, margin: "16px 0",
        }} />

        <CostRow
          label="Total" value={print.totalEur}
          accent={colors.text} reveal={totalReveal}
          large
        />
      </div>
    </AbsoluteFill>
  );
};
