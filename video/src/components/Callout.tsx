import React from "react";
import { useCurrentFrame, spring, useVideoConfig } from "remotion";
import { colors, fonts, radii } from "../theme";

type Props = {
  xPct: number;
  yPct: number;
  startFrame: number;
  endFrame?: number;
  title?: string;
  value: string;
  accent?: string;
  size?: "sm" | "md" | "lg";
};

export const Callout: React.FC<Props> = ({
  xPct, yPct, startFrame, endFrame,
  title, value,
  accent = colors.accent,
  size = "md",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame) return null;

  const localIn = frame - startFrame;
  const enter = spring({ frame: localIn, fps, config: { damping: 12, stiffness: 130 } });
  const exit = endFrame !== undefined && frame > endFrame
    ? Math.max(0, 1 - (frame - endFrame) / 10)
    : 1;
  const opacity = enter * exit;

  const fontSizeValue = size === "sm" ? 22 : size === "md" ? 30 : 44;
  const fontSizeTitle = size === "sm" ? 11 : size === "md" ? 13 : 15;

  return (
    <div
      style={{
        position: "absolute",
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(-50%, -50%) scale(${0.9 + enter * 0.1})`,
        opacity,
        padding: "12px 18px",
        borderRadius: radii.cardLg,
        background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.surface2} 100%)`,
        border: `1px solid ${accent}55`,
        boxShadow: `0 12px 30px rgba(0,0,0,0.45), 0 0 0 4px ${accent}22`,
        color: colors.text,
        fontFamily: fonts.sans,
        textAlign: "center",
        minWidth: 140,
      }}
    >
      {title ? (
        <div style={{
          fontSize: fontSizeTitle,
          fontWeight: 500,
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 4,
        }}>
          {title}
        </div>
      ) : null}
      <div style={{
        fontSize: fontSizeValue,
        fontWeight: 700,
        fontFamily: fonts.mono,
        color: accent,
        letterSpacing: -0.5,
      }}>
        {value}
      </div>
    </div>
  );
};
