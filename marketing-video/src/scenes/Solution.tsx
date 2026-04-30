import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";
import { Caption } from "../components/Captions";

// 0:45–1:00 — The solution: 3 cards (intent → message → verify) with arrows

const CARDS = [
  {
    title: "intent definitions",
    body: "protocols declare allowed operations. each carries a plain-english template.",
  },
  {
    title: "plain-english signing",
    body: "ledger renders the action natively via signMessage — outside any compromised host.",
  },
  {
    title: "on-chain verify",
    body: "program reconstructs the message, checks the ed25519 signature. tamper = reject.",
  },
];

export const Solution: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });

  const cardStart = 30;
  const cardStagger = 18;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, padding: "100px 120px" }}>
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
            marginBottom: 16,
          }}
        >
          LUCID — the human-readable multisig
        </p>
        <h2
          style={{
            color: COLORS.text,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 72,
            letterSpacing: "0.02em",
            margin: 0,
          }}
        >
          read what you sign.
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 32,
          alignItems: "stretch",
          flex: 1,
          alignContent: "center",
        }}
      >
        {CARDS.map((c, i) => {
          const enter = spring({
            frame: frame - (cardStart + i * cardStagger),
            fps,
            config: { damping: 200 },
            durationInFrames: 24,
          });
          return (
            <div
              key={c.title}
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.emerald}`,
                borderRadius: 12,
                padding: "40px 32px",
                opacity: enter,
                transform: `translateY(${(1 - enter) * 30}px)`,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontWeight: 600,
                  fontSize: 22,
                  color: COLORS.emerald,
                  letterSpacing: "0.04em",
                }}
              >
                0{i + 1}
              </div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontWeight: 600,
                  fontSize: 32,
                  color: COLORS.text,
                  letterSpacing: "0.02em",
                  lineHeight: 1.15,
                }}
              >
                {c.title}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 19,
                  color: COLORS.muted,
                  lineHeight: 1.5,
                }}
              >
                {c.body}
              </div>
            </div>
          );
        })}
      </div>

      <Caption
        text="signers approve human-readable intents. trust returns to the hardware wallet."
        durationInFrames={durationInFrames}
        bottom={40}
      />
    </AbsoluteFill>
  );
};
