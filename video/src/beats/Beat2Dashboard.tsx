import React from "react";
import { AbsoluteFill } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";

// Real dashboard screenshot with a slow Ken-Burns push-in toward the printer
// hero (top of the page). No overlays — the screenshot already shows printer
// status, AMS slots, monthly stats, alerts, and recent prints.
export const Beat2Dashboard: React.FC = () => {
  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/01-dashboard.png"
        fit="top-aligned"
        scale={1}
        zoomFromFrame={20}
        zoomTo={1.10}
      />
    </AbsoluteFill>
  );
};
