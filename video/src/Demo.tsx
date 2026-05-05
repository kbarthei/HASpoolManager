import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill } from "remotion";
import { Beat1Hook } from "./beats/Beat1Hook";
import { Beat10Features } from "./beats/Beat10Features";
import { Beat2Dashboard } from "./beats/Beat2Dashboard";
import { Beat3Inventory } from "./beats/Beat3Inventory";
import { Beat4Inspector } from "./beats/Beat4Inspector";
import { Beat5Scan } from "./beats/Beat5Scan";
import { Beat6Prints } from "./beats/Beat6Prints";
import { Beat7Orders } from "./beats/Beat7Orders";
import { Beat8Analytics } from "./beats/Beat8Analytics";
import { Beat9MobileCta } from "./beats/Beat9MobileCta";
import { Subtitles } from "./components/Subtitles";
import { Soundtrack } from "./components/Soundtrack";
import { colors } from "./theme";

// File names keep their numeric prefix (= creation order). The PLAY ORDER lives
// in this file. Beat10Features was added after the 9-beat v2 plan and plays 2nd.

export const TRANSITION_FRAMES = 15;
const N_TRANSITIONS = 9;

export const BEAT_DURATIONS = {
  hook:       150,
  features:   360,
  dashboard:  270,
  inventory:  240,
  inspector:  240,
  scan:       300,
  prints:     270,
  orders:     360,
  analytics:  270,
  mobileCta:  450,
} as const;

const BEAT_SUM =
  BEAT_DURATIONS.hook +
  BEAT_DURATIONS.features +
  BEAT_DURATIONS.dashboard +
  BEAT_DURATIONS.inventory +
  BEAT_DURATIONS.inspector +
  BEAT_DURATIONS.scan +
  BEAT_DURATIONS.prints +
  BEAT_DURATIONS.orders +
  BEAT_DURATIONS.analytics +
  BEAT_DURATIONS.mobileCta;
// 150 + 360 + 270 + 240 + 240 + 300 + 270 + 360 + 270 + 450 = 2910

export const TOTAL_DURATION = BEAT_SUM - N_TRANSITIONS * TRANSITION_FRAMES;
// 2910 - 135 = 2775  (= 92.5s @ 30fps)

type DemoProps = {
  layout?: "horizontal" | "vertical";
  withMusic?: boolean;
};

export const Demo: React.FC<DemoProps> = ({ layout = "horizontal", withMusic = true }) => {
  const subtitleLayout = layout === "vertical" ? "top-banner" : "lower-third";

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.hook}>
          <Beat1Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.features}>
          <Beat10Features />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.dashboard}>
          <Beat2Dashboard />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.inventory}>
          <Beat3Inventory />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.inspector}>
          <Beat4Inspector />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.scan}>
          <Beat5Scan />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.prints}>
          <Beat6Prints />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.orders}>
          <Beat7Orders />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.analytics}>
          <Beat8Analytics />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.mobileCta}>
          <Beat9MobileCta />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Subtitles layout={subtitleLayout} />
      {withMusic ? <Soundtrack /> : null}
    </AbsoluteFill>
  );
};
