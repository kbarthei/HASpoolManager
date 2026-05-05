import React from "react";
import { Audio, staticFile, useVideoConfig, interpolate, useCurrentFrame } from "remotion";

const tryStaticUrl = (): string | null => {
  try {
    return staticFile("music.mp3");
  } catch {
    return null;
  }
};

export const Soundtrack: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const url = tryStaticUrl();
  if (!url) return null;

  // Fade out over the last 60 frames (2s).
  const fadeOutFrames = 60;
  const volume = interpolate(
    frame,
    [durationInFrames - fadeOutFrames, durationInFrames],
    [0.6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return <Audio src={url} volume={volume} />;
};
