import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type SpoolTileProps = {
  color: string;
  brand: string;
  material: string;
  size?: number;
  delayFrames?: number;
  empty?: boolean;
};

export const SpoolTile: React.FC<SpoolTileProps> = ({
  color,
  brand,
  material,
  size = 96,
  delayFrames = 0,
  empty = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 18, mass: 0.8 },
  });
  const opacity = interpolate(frame - delayFrames, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (empty) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          border: `1.5px dashed ${colors.border}`,
          opacity: 0.6,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: color,
        border: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 8,
        transform: `scale(${s})`,
        opacity,
        boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: size * 0.14,
          color: isLight(color) ? "#000" : "#fff",
          fontWeight: 600,
          opacity: 0.85,
        }}
      >
        {brand} · {material}
      </div>
    </div>
  );
};

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
