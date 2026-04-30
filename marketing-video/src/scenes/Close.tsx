import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

// 2:45–3:00 — Close: wordmark + tagline + CTA

export const Close: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordmarkEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const taglineEnter = spring({
    frame: frame - 24,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const ctaEnter = spring({
    frame: frame - 72,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const subEnter = interpolate(frame, [120, 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: wordmarkEnter,
          transform: `scale(${0.9 + 0.1 * wordmarkEnter})`,
          marginBottom: 16,
        }}
      >
        <h1
          style={{
            color: COLORS.text,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 200,
            letterSpacing: "0.12em",
            margin: 0,
          }}
        >
          LUCID
        </h1>
      </div>
      <div style={{ opacity: taglineEnter, marginBottom: 80 }}>
        <p
          style={{
            color: COLORS.emerald,
            fontFamily: FONTS.body,
            fontWeight: 400,
            fontSize: 38,
            letterSpacing: "0.02em",
            margin: 0,
          }}
        >
          read what you sign.
        </p>
      </div>

      <div
        style={{
          opacity: ctaEnter,
          transform: `translateY(${(1 - ctaEnter) * 16}px)`,
          padding: "20px 36px",
          border: `1px solid ${COLORS.emerald}`,
          borderRadius: 99,
          fontFamily: FONTS.mono,
          fontSize: 22,
          color: COLORS.emerald,
          letterSpacing: "0.04em",
        }}
      >
        try the demo →
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 60,
          opacity: subEnter,
          fontFamily: FONTS.body,
          fontSize: 16,
          color: COLORS.muted,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        built for colosseum frontier
      </div>
    </AbsoluteFill>
  );
};
