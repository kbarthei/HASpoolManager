import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { colors, fonts, radii } from "../theme";

const Bullet: React.FC<{
  text: string;
  reveal: number;
}> = ({ text, reveal }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 14,
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 8}px)`,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          marginTop: 9,
          borderRadius: 999,
          background: colors.accent,
          boxShadow: `0 0 12px ${colors.accentRing}`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: 19,
          fontWeight: 500,
          color: colors.text,
          lineHeight: 1.35,
          letterSpacing: -0.1,
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const Beat11Models: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Card slide-in
  const cardReveal = spring({
    frame: frame - 30,
    fps,
    config: { damping: 18, stiffness: 100 },
    durationInFrames: 30,
  });

  // Staggered bullets — each one fades in 25 frames after the previous
  const bullet1 = interpolate(frame, [70, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bullet2 = interpolate(frame, [110, 140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bullet3 = interpolate(frame, [150, 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/14-print-detail.png"
        fit="top-aligned"
        scale={1}
        zoomFromFrame={0}
        zoomTo={1.05}
      />

      {/* 3MF Auto-Pull callout — animated reveal */}
      <div
        style={{
          position: "absolute",
          right: "5%",
          top: "26%",
          width: 440,
          padding: "26px 30px",
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.cardLg,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          fontFamily: fonts.sans,
          color: colors.text,
          opacity: cardReveal,
          transform: `translateY(${(1 - cardReveal) * 24}px)`,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: colors.accent,
            textTransform: "uppercase",
            letterSpacing: 1.4,
            marginBottom: 8,
          }}
        >
          New
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: colors.text,
            letterSpacing: -0.6,
            marginBottom: 20,
          }}
        >
          3MF Auto-Pull
        </div>

        <Bullet reveal={bullet1} text="Bambu Studio · Send to Printer" />
        <Bullet reveal={bullet2} text="FTP-fetched cover + filament plan" />
        <Bullet reveal={bullet3} text="Linked to print · weight + time predicted" />
      </div>
    </AbsoluteFill>
  );
};
