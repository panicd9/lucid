import { AbsoluteFill, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";
import { Caption } from "../components/Captions";

// 1:00–1:40 — The proof: real ledger recordings side-by-side
// Locked footage. Both clips loop within their panel; labels sit above each.

export const BeforeAfter: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const panelLeftEnter = spring({
    frame: frame - 18,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const panelRightEnter = spring({
    frame: frame - 30,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });

  // Slight ease toward emerald: red border fades, emerald border emphasizes
  const emphasis = interpolate(frame, [120, 240], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLORS.bg, padding: "80px 80px 60px" }}>
      <div
        style={{
          opacity: titleEnter,
          transform: `translateY(${(1 - titleEnter) * 16}px)`,
          textAlign: "center",
          marginBottom: 40,
        }}
      >
        <p
          style={{
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: 0,
            marginBottom: 12,
          }}
        >
          same ledger. same multisig flow.
        </p>
        <h2
          style={{
            color: COLORS.text,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 56,
            letterSpacing: "0.02em",
            margin: 0,
          }}
        >
          one device shows hex. the other shows the action.
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, flex: 1 }}>
        {/* Left — blind signing */}
        <div
          style={{
            opacity: panelLeftEnter,
            transform: `translateY(${(1 - panelLeftEnter) * 30}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.06em",
              color: COLORS.red,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: COLORS.red,
                boxShadow: `0 0 12px ${COLORS.red}`,
              }}
            />
            every multisig today
          </div>
          <div
            style={{
              flex: 1,
              borderRadius: 12,
              border: `2px solid ${COLORS.red}`,
              overflow: "hidden",
              boxShadow: `0 0 60px ${COLORS.redGlow}`,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <OffthreadVideo
              src={staticFile("blind-signing.mp4")}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 20,
              color: COLORS.muted,
              margin: 0,
            }}
          >
            hex hash. fee payer. "blind signing — accept the risk?"
          </p>
        </div>

        {/* Right — lucid */}
        <div
          style={{
            opacity: panelRightEnter,
            transform: `translateY(${(1 - panelRightEnter) * 30}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.06em",
              color: COLORS.emerald,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: COLORS.emerald,
                boxShadow: `0 0 12px ${COLORS.emerald}`,
              }}
            />
            LUCID
          </div>
          <div
            style={{
              flex: 1,
              borderRadius: 12,
              border: `2px solid ${COLORS.emerald}`,
              overflow: "hidden",
              boxShadow: `0 0 ${60 + 40 * emphasis}px rgba(16, 185, 129, ${0.18 + 0.18 * emphasis})`,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <OffthreadVideo
              src={staticFile("lucid-signing.mp4")}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 20,
              color: COLORS.muted,
              margin: 0,
            }}
          >
            the actual action. in plain english. on the device itself.
          </p>
        </div>
      </div>

      <Caption
        text="trust moves back to the hardware wallet — where it belonged."
        durationInFrames={durationInFrames}
        bottom={20}
      />
    </AbsoluteFill>
  );
};
