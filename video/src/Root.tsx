import "./index.css";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Composition } from "remotion";
import { Demo, TOTAL_DURATION } from "./Demo";

loadGeist();
loadGeistMono();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HASpoolManagerDemo"
        component={Demo}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ layout: "horizontal" as const, withMusic: true }}
      />
      <Composition
        id="HASpoolManagerDemoVertical"
        component={Demo}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ layout: "vertical" as const, withMusic: true }}
      />
    </>
  );
};
