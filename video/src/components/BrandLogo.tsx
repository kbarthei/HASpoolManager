import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type BrandLogoProps = {
  size?: number;
  tagline?: string;
  animate?: boolean;
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 72,
  tagline = "Every gram tracked.",
  animate = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordmarkScale = animate
    ? spring({ frame, fps, config: { damping: 18, mass: 0.8 } })
    : 1;
  const wordmarkOpacity = animate
    ? interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
    : 1;

  const tagFrames = tagline.split("");
  const perChar = 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: fonts.sans,
          fontWeight: 700,
          fontSize: size,
          color: colors.text,
          transform: `scale(${wordmarkScale})`,
          opacity: wordmarkOpacity,
          letterSpacing: -1,
        }}
      >
        HASpool<span style={{ color: colors.accent }}>Manager</span>
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: size * 0.28,
          color: colors.accent,
          display: "flex",
        }}
      >
        {tagFrames.map((ch, i) => {
          const charOpacity = animate
            ? interpolate(frame, [30 + i * perChar, 30 + i * perChar + 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;
          return (
            <span key={i} style={{ opacity: charOpacity, whiteSpace: "pre" }}>
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
};
