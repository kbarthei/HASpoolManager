import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { fonts } from "../theme";

type CountUpProps = {
  from: number;
  to: number;
  startFrame: number;
  durationInFrames: number;
  format?: (n: number) => string;
  style?: React.CSSProperties;
};

export const CountUp: React.FC<CountUpProps> = ({
  from,
  to,
  startFrame,
  durationInFrames,
  format = (n) => n.toFixed(0),
  style,
}) => {
  const frame = useCurrentFrame();
  const value = interpolate(
    frame,
    [startFrame, startFrame + durationInFrames],
    [from, to],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {format(value)}
    </span>
  );
};
