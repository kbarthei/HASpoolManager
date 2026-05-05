import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { captions, type Caption } from "../data/subtitles";
import { colors, fonts } from "../theme";

type Layout = "lower-third" | "top-banner";

const findActive = (frame: number): Caption | undefined =>
  captions.find((c) => frame >= c.startFrame && frame <= c.endFrame);

export const Subtitles: React.FC<{ layout?: Layout }> = ({ layout = "lower-third" }) => {
  const frame = useCurrentFrame();
  const active = findActive(frame);
  if (!active) return null;

  const fadeFrames = 8;
  const localFrame = frame - active.startFrame;
  const remainingFrames = active.endFrame - frame;
  const opacity = interpolate(
    Math.min(localFrame, remainingFrames),
    [0, fadeFrames],
    [0, 1],
    { extrapolateRight: "clamp" },
  );

  const isVertical = layout === "top-banner";

  return (
    <AbsoluteFill
      style={{
        justifyContent: isVertical ? "flex-start" : "flex-end",
        alignItems: "center",
        paddingTop: isVertical ? 96 : 0,
        paddingBottom: isVertical ? 0 : 88,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity,
          maxWidth: isVertical ? 920 : 1280,
          padding: "16px 28px",
          borderRadius: 14,
          background: "rgba(0,0,0,0.62)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${colors.border}`,
          color: colors.text,
          fontFamily: fonts.sans,
          fontSize: isVertical ? 36 : 30,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: -0.2,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};
