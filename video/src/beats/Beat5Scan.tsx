import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { colors, fonts, radii } from "../theme";
import { scanCandidates } from "../data/mockData";

// Inline confidence bar — Beat 5 needs frame-driven pct directly, so we render
// the bar locally rather than using the v1 ConfidenceBar (which wraps its own
// label + interpolation).
const InlineBar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div style={{
    width: "100%",
    height: 6,
    borderRadius: 3,
    background: colors.surface3,
    overflow: "hidden",
  }}>
    <div style={{
      width: `${pct}%`,
      height: "100%",
      background: color,
      borderRadius: 3,
    }} />
  </div>
);

export const Beat5Scan: React.FC = () => {
  const frame = useCurrentFrame();

  // Phase 1 (0..130): RFID exact match panel
  // Phase 2 (140..330): ΔE fuzzy match panel

  const phase1Opacity = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });
  const phase1FadeOut = interpolate(frame, [130, 160], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const phase1Visible = phase1Opacity * phase1FadeOut;

  const phase2Opacity = interpolate(frame, [150, 180], [0, 1], { extrapolateRight: "clamp" });

  // Phase 2 fuzzy match confidence animates 0..94 over frames 160..220
  const fuzzyConfidence = interpolate(frame, [160, 220], [0, 94], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/09-scan.png"
        fit="top-aligned"
        scale={0.95}
      />

      {/* Phase 1 — RFID exact */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: "30%",
        transform: "translate(-50%, 0)",
        opacity: phase1Visible,
        padding: "28px 40px",
        background: colors.surface,
        border: `2px solid ${colors.success}`,
        borderRadius: radii.cardLg,
        boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 0 6px ${colors.success}33`,
        color: colors.text,
        fontFamily: fonts.sans,
        textAlign: "center",
        minWidth: 540,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.success,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
        }}>
          ✓ RFID Exact Match
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, marginBottom: 8 }}>
          Bambu PLA Basic Ivory
        </div>
        <div style={{ fontSize: 18, color: colors.textMuted, fontFamily: fonts.mono }}>
          Tag #10101 · 730g remaining
        </div>
        <div style={{
          marginTop: 16, fontSize: 60, fontWeight: 800, color: colors.success,
          fontFamily: fonts.mono, letterSpacing: -2,
        }}>
          100%
        </div>
      </div>

      {/* Phase 2 — ΔE fuzzy */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: "22%",
        transform: "translate(-50%, 0)",
        opacity: phase2Opacity,
        padding: "28px 40px",
        background: colors.surface,
        border: `2px solid ${colors.accent}`,
        borderRadius: radii.cardLg,
        boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 0 6px ${colors.accent}33`,
        color: colors.text,
        fontFamily: fonts.sans,
        minWidth: 600,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.accent,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
          textAlign: "center",
        }}>
          ⚙ CIE Delta-E Fuzzy Match
        </div>

        {scanCandidates.map((cand, i) => {
          const showAt = 175 + i * 15;
          const opacity = interpolate(frame, [showAt, showAt + 12], [0, 1], { extrapolateRight: "clamp" });
          const isPrimary = i === 0;
          const pct = isPrimary ? fuzzyConfidence : cand.confidence;
          return (
            <div
              key={cand.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 12,
                opacity,
                padding: "10px 14px",
                borderRadius: radii.md,
                background: isPrimary ? colors.surface2 : "transparent",
                border: isPrimary ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: cand.color,
                border: `1px solid ${colors.border}`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{cand.name}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.mono }}>
                  {cand.reason}
                </div>
              </div>
              <div style={{ width: 180 }}>
                <InlineBar pct={pct} color={isPrimary ? colors.accent : colors.textMuted} />
              </div>
              <div style={{
                width: 60,
                textAlign: "right",
                fontFamily: fonts.mono, fontWeight: 700, fontSize: 22,
                color: isPrimary ? colors.accent : colors.textMuted,
              }}>
                {Math.round(pct)}%
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
