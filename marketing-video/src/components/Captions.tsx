import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS } from "../theme";

// Lowercase, casual, sharp — per locked tone choice (option A).
// Captions render as a single block of narration text at the bottom of the
// scene. Fade in over `fadeFrames`, hold, fade out as scene ends.
export const Caption: React.FC<{
  text: string;
  durationInFrames: number;
  fadeFrames?: number;
  bottom?: number;
  maxWidth?: number;
}> = ({ text, durationInFrames, fadeFrames = 12, bottom = 80, maxWidth = 1400 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );
  return (
    <div
      style={{
        position: "absolute",
        bottom,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <p
        style={{
          color: COLORS.text,
          fontFamily: FONTS.body,
          fontWeight: 400,
          fontSize: 36,
          lineHeight: 1.45,
          maxWidth,
          textAlign: "center",
          letterSpacing: "0.005em",
          margin: 0,
          padding: "0 60px",
        }}
      >
        {text}
      </p>
    </div>
  );
};
