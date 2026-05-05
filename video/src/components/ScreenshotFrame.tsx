import React from "react";
import { Img, staticFile, AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { colors } from "../theme";

type Fit = "contain" | "cover" | "top-aligned";

type Props = {
  src: string;                  // path relative to public/, e.g. "screenshots/dark/desktop/01-dashboard.png"
  fit?: Fit;
  scale?: number;               // base scale (1 = fit)
  zoomFromFrame?: number;       // local frame; start a slow Ken-Burns zoom
  zoomTo?: number;              // target scale (e.g. 1.08)
  shadow?: boolean;
};

export const ScreenshotFrame: React.FC<Props> = ({
  src,
  fit = "contain",
  scale = 1,
  zoomFromFrame,
  zoomTo,
  shadow = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = spring({ frame, fps, config: { damping: 16, stiffness: 90 }, durationInFrames: 24 });

  let activeScale = scale;
  if (zoomFromFrame !== undefined && zoomTo !== undefined) {
    const t = interpolate(frame, [zoomFromFrame, zoomFromFrame + 90], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    activeScale = scale + (zoomTo - scale) * t;
  }

  // top-aligned = cover from top, so very tall page-scroll screenshots fill the
  // width instead of becoming thin vertical strips. Plain "contain" only used
  // for fit==="contain".
  const objectFit = fit === "contain" ? "contain" : "cover";
  const objectPosition = fit === "top-aligned" ? "top center" : "center";

  return (
    <AbsoluteFill style={{ background: colors.bg, opacity: fadeIn }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          objectPosition,
          transform: `scale(${activeScale})`,
          transformOrigin: "center",
          filter: shadow ? "drop-shadow(0 24px 60px rgba(0,0,0,0.6))" : undefined,
        }}
      />
    </AbsoluteFill>
  );
};
