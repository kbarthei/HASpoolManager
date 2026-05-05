import React from "react";
import { AbsoluteFill } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";

// Spool Inspector screenshot — the page already shows the big remaining bar,
// per-gram cost, AMS location and identification. Slow Ken-Burns push-in
// keeps the eye moving without competing overlays.
export const Beat4Inspector: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/04-spool-inspector.png"
        fit="top-aligned"
        scale={1}
        zoomFromFrame={0}
        zoomTo={1.08}
      />
    </AbsoluteFill>
  );
};
