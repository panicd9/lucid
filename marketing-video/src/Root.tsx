import { Composition } from "remotion";
import { MainPitch } from "./compositions/MainPitch";
import { TwitterTeaser } from "./compositions/TwitterTeaser";
import { DIM_LANDSCAPE, FPS, TOTAL_DURATION } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainPitch"
        component={MainPitch}
        durationInFrames={TOTAL_DURATION}
        fps={FPS}
        width={DIM_LANDSCAPE.width}
        height={DIM_LANDSCAPE.height}
      />
      <Composition
        id="TwitterTeaser"
        component={TwitterTeaser}
        durationInFrames={22 * FPS}
        fps={FPS}
        width={DIM_LANDSCAPE.width}
        height={DIM_LANDSCAPE.height}
      />
    </>
  );
};
