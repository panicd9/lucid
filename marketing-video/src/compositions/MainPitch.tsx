import { AbsoluteFill, Sequence } from "remotion";
import { COLORS, SCENES } from "../theme";
import { Hook } from "../scenes/Hook";
import { Stakes } from "../scenes/Stakes";
import { Solution } from "../scenes/Solution";
import { BeforeAfter } from "../scenes/BeforeAfter";
import { LiveDemo } from "../scenes/LiveDemo";
import { WhatWeBuilt } from "../scenes/WhatWeBuilt";
import { Close } from "../scenes/Close";

// 3:00 main pitch — stitches the 7 scenes with hard cuts.
// (Cross-fades + light leaks can be added once we review timing.)

export const MainPitch: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Sequence from={SCENES.hook.start} durationInFrames={SCENES.hook.duration}>
        <Hook durationInFrames={SCENES.hook.duration} />
      </Sequence>
      <Sequence from={SCENES.stakes.start} durationInFrames={SCENES.stakes.duration}>
        <Stakes durationInFrames={SCENES.stakes.duration} />
      </Sequence>
      <Sequence from={SCENES.solution.start} durationInFrames={SCENES.solution.duration}>
        <Solution durationInFrames={SCENES.solution.duration} />
      </Sequence>
      <Sequence from={SCENES.beforeAfter.start} durationInFrames={SCENES.beforeAfter.duration}>
        <BeforeAfter durationInFrames={SCENES.beforeAfter.duration} />
      </Sequence>
      <Sequence from={SCENES.liveDemo.start} durationInFrames={SCENES.liveDemo.duration}>
        <LiveDemo durationInFrames={SCENES.liveDemo.duration} />
      </Sequence>
      <Sequence from={SCENES.whatWeBuilt.start} durationInFrames={SCENES.whatWeBuilt.duration}>
        <WhatWeBuilt durationInFrames={SCENES.whatWeBuilt.duration} />
      </Sequence>
      <Sequence from={SCENES.close.start} durationInFrames={SCENES.close.duration}>
        <Close durationInFrames={SCENES.close.duration} />
      </Sequence>
    </AbsoluteFill>
  );
};
