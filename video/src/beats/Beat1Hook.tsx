import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";
import { BrandLogo } from "../components/BrandLogo";
import { HomeAssistantBadge } from "../components/HomeAssistantBadge";

export const Beat1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 110 } });
  const logoOpacity = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: "clamp" });

  // Tagline letter-by-letter (Beat 1 owns the tagline; we suppress BrandLogo's internal tagline).
  const tagline = "Every gram tracked, from purchase to print.";
  const taglineStartFrame = 36;
  const charsPerFrame = 0.7;
  const taglineCharsShown = Math.max(0, Math.floor((frame - taglineStartFrame) * charsPerFrame));
  const visibleTagline = tagline.slice(0, taglineCharsShown);

  // HA badge slide-in
  const badgeStartFrame = 120;
  const badgeProgress = spring({
    frame: frame - badgeStartFrame, fps,
    config: { damping: 14, stiffness: 110 },
  });
  const badgeOpacity = interpolate(frame, [badgeStartFrame, badgeStartFrame + 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, ${colors.surface} 0%, ${colors.bg} 60%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
        fontFamily: fonts.sans,
      }}
    >
      <div style={{
        opacity: logoOpacity,
        transform: `scale(${0.85 + logoSpring * 0.15})`,
      }}>
        <BrandLogo size={130} tagline="" animate={false} />
      </div>

      <div style={{
        fontSize: 44,
        color: colors.text,
        fontWeight: 500,
        letterSpacing: -0.5,
        minHeight: 60,
        textAlign: "center",
        maxWidth: 1200,
      }}>
        {visibleTagline}
        <span style={{
          opacity: taglineCharsShown < tagline.length ? 1 : 0,
          color: colors.accent,
        }}>▍</span>
      </div>

      <div style={{
        opacity: badgeOpacity,
        transform: `translateY(${(1 - badgeProgress) * 16}px)`,
      }}>
        <HomeAssistantBadge label="Home Assistant addon" />
      </div>
    </AbsoluteFill>
  );
};
