import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { colors } from "../theme";

type Props = {
  /** % of frame width (0..100) for the box left edge. */
  xPct: number;
  /** % of frame height (0..100) for the box top edge. */
  yPct: number;
  /** % of frame width for the box width. */
  wPct: number;
  /** % of frame height for the box height. */
  hPct: number;
  /** local frame at which the spotlight starts to appear */
  startFrame: number;
  /** local frame at which the spotlight starts to fade out (optional) */
  endFrame?: number;
  /** ring color, defaults to brand accent */
  color?: string;
  /** corner radius in px */
  radius?: number;
};

export const Spotlight: React.FC<Props> = ({
  xPct, yPct, wPct, hPct,
  startFrame,
  endFrame,
  color = colors.accent,
  radius = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame) return null;

  const localIn = frame - startFrame;
  const grow = spring({ frame: localIn, fps, config: { damping: 14, stiffness: 110 } });
  const fadeOut = endFrame !== undefined && frame > endFrame
    ? Math.max(0, 1 - (frame - endFrame) / 12)
    : 1;
  const opacity = grow * fadeOut;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          width: `${wPct}%`,
          height: `${hPct}%`,
          borderRadius: radius,
          boxShadow: `0 0 0 3px ${color}, 0 0 0 10px ${color}33`,
          opacity,
          transform: `scale(${0.96 + grow * 0.04})`,
          transformOrigin: "center",
        }}
      />
    </AbsoluteFill>
  );
};
