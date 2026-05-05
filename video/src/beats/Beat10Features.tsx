// Plays 2nd in the composition (after the Hook). 15 features in a 3x5 grid
// with stagger reveal. Filenames keep their numeric prefix (= creation order);
// play order lives in src/Demo.tsx.
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { colors, fonts, radii } from "../theme";

type Feature = { icon: string; title: string; caption: string; accent?: string };

const FEATURES: Feature[] = [
  { icon: "⚡",  title: "Zero-config sync",       caption: "Auto-discovers Bambu via HA",          accent: colors.accent },
  { icon: "✦",  title: "AI order parsing",        caption: "Paste email → Claude extracts",        accent: colors.chart3 },
  { icon: "◉",  title: "RFID + ΔE matching",      caption: "Exact + CIE Delta-E fuzzy",            accent: colors.chart2 },
  { icon: "▦",  title: "AMS integration",         caption: "4-slot AMS + AMS HT live",             accent: colors.accent },
  { icon: "⚖",  title: "Per-tray weight",         caption: "3MF-parsed gram tracking",             accent: colors.chart4 },
  { icon: "↻",  title: "Spool-swap detection",    caption: "Mid-print, oscillation-guarded",       accent: colors.warning },
  { icon: "✺",  title: "Cover image capture",     caption: "Slicer preview + camera",              accent: colors.chart3 },
  { icon: "❄",  title: "AMS drying status",       caption: "Per-unit drying state",                accent: colors.chart2 },
  { icon: "⏱",  title: "Live watchdog poll",      caption: "30 s progress refresh",                accent: colors.warning },
  { icon: "€",  title: "Cost analytics",          caption: "Filament + energy per print",          accent: colors.accent },
  { icon: "📈", title: "Per-gram price history",  caption: "90-day trend, per material",           accent: colors.chart4 },
  { icon: "▤",  title: "Multi-rack twin",         caption: "Drag-and-drop digital twin",           accent: colors.chart3 },
  { icon: "⟳",  title: "Full lifecycle",          caption: "Order → archive, all tracked",         accent: colors.accent },
  { icon: "✓",  title: "Diagnostics + self-heal", caption: "8 detectors + orphan cleanup",         accent: colors.success },
  { icon: "▭",  title: "Mobile-first PWA",        caption: "Port 3001, add-to-home-screen",        accent: colors.chart2 },
];

const FeatureCard: React.FC<{ feature: Feature; delayFrames: number }> = ({ feature, delayFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 16, stiffness: 120 },
  });
  const opacity = interpolate(frame, [delayFrames, delayFrames + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const accent = feature.accent ?? colors.accent;

  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: radii.cardLg,
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity,
        transform: `translateY(${(1 - enter) * 16}px) scale(${0.96 + enter * 0.04})`,
        boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        fontFamily: fonts.sans,
        color: colors.text,
        minHeight: 96,
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{
          fontSize: 22,
          color: accent,
          fontWeight: 700,
          width: 28,
          textAlign: "center",
        }}>
          {feature.icon}
        </div>
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: -0.2,
        }}>
          {feature.title}
        </div>
      </div>
      <div style={{
        fontSize: 13,
        color: colors.textMuted,
        marginLeft: 40,
        lineHeight: 1.4,
      }}>
        {feature.caption}
      </div>
    </div>
  );
};

export const Beat10Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const isVertical = height > width;

  const titleSpring = spring({
    frame: frame - 8,
    fps,
    config: { damping: 18, stiffness: 110 },
  });
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  const subtitleOpacity = interpolate(frame, [25, 55], [0, 1], { extrapolateRight: "clamp" });

  // Reveal cards starting at frame 50, every 8 frames.
  const cardStagger = 8;
  const firstCardAt = 50;

  // Layout: 3 columns × 5 rows for landscape; 2 columns × 8 rows (with 15+1 spacer) for vertical.
  const gridColumns = isVertical ? 2 : 3;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${colors.bg} 0%, ${colors.surface} 100%)`,
        padding: isVertical ? "180px 60px 120px" : "100px 80px",
        justifyContent: "flex-start",
        alignItems: "center",
        gap: isVertical ? 30 : 50,
        fontFamily: fonts.sans,
      }}
    >
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        opacity: titleOpacity,
        transform: `scale(${0.95 + titleSpring * 0.05})`,
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}>
          15 features · one addon
        </div>
        <div style={{
          fontSize: isVertical ? 48 : 56,
          fontWeight: 700,
          color: colors.text,
          letterSpacing: -1,
          textAlign: "center",
        }}>
          Built around how you actually print.
        </div>
        <div style={{
          fontSize: isVertical ? 18 : 20,
          color: colors.textMuted,
          opacity: subtitleOpacity,
          textAlign: "center",
        }}>
          Every step from purchase to print.
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
        gap: isVertical ? 14 : 18,
        width: "100%",
        maxWidth: isVertical ? 960 : 1700,
      }}>
        {FEATURES.map((feature, i) => (
          <FeatureCard
            key={feature.title}
            feature={feature}
            delayFrames={firstCardAt + i * cardStagger}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
