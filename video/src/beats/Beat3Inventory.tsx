import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";

// Inventory screenshot panned slowly from rack-down toward AMS-up. The
// vertical drift is the only motion — the screenshot itself shows AMS,
// rack tiles, workbench and surplus.
export const Beat3Inventory: React.FC = () => {
  const frame = useCurrentFrame();

  // Pan from y=-10% (showing rack mid-page) to y=0% (AMS at top) over the beat.
  const panY = interpolate(frame, [0, 240], [-10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div style={{
        position: "absolute",
        inset: 0,
        transform: `translateY(${panY}%)`,
      }}>
        <ScreenshotFrame
          src="screenshots/dark/desktop/02-inventory.png"
          fit="top-aligned"
          shadow={false}
          zoomFromFrame={0}
          zoomTo={1.04}
        />
      </div>
    </AbsoluteFill>
  );
};
