import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";
import { Caption } from "../components/Captions";

// 0:00–0:15 — The problem: blind signing
// Visual B (stylized): a Ledger-frame mockup with a hex string that the
// signer is being asked to approve. Red glow telegraphs danger.

// Real Ledger blind-signing format mirrors pitch_deck/pitch-deck-20260418-120000.html
// (lines 339-347): warning + "Unrecognized format" + "Message Hash" + 64-char hex
// + "Fee payer" + base58 + "Accept risk and sign?"
const MESSAGE_HASH = "a3f9d8c7b6a5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d60c2d";
const FEE_PAYER = "7Hk2mPqRsTuVwXyZ3aBcDeFgHjKnNpQrStUvWxYz9bXr";

export const Hook: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title fades up first
  const titleEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });

  // Ledger frame springs in around frame 18
  const frameEnter = spring({
    frame: frame - 18,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });

  // Reveal lines one at a time after the frame lands
  // 50: warning header. 75: "Unrecognized format". 100: "Message Hash" label.
  // 120: hex string (one line). 200: "Fee payer" label. 220: base58.
  // 280: "Accept risk and sign?" footer.
  const showWarning = interpolate(frame, [50, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showUnrec = interpolate(frame, [75, 95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showHashLbl = interpolate(frame, [100, 115], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showHash = interpolate(frame, [120, 165], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showPayerLbl = interpolate(frame, [200, 215], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showPayer = interpolate(frame, [220, 250], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showFooter = interpolate(frame, [280, 320], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Red glow ramps up as content fills in
  const glow = interpolate(frame, [120, 280], [0.2, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Type out hex char-by-char in sync with showHash window
  const visibleHash = MESSAGE_HASH.slice(0, Math.floor(MESSAGE_HASH.length * showHash));
  const visiblePayer = FEE_PAYER.slice(0, Math.floor(FEE_PAYER.length * showPayer));

  return (
    <AbsoluteFill style={{ background: COLORS.bg, alignItems: "center", justifyContent: "center" }}>
      {/* Top eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleEnter,
          transform: `translateY(${(1 - titleEnter) * 20}px)`,
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
          }}
        >
          what a multisig signer sees today
        </p>
      </div>

      {/* Ledger device frame */}
      <div
        style={{
          background: "#0a0a0a",
          border: `2px solid rgba(239, 68, 68, ${0.3 + 0.5 * glow})`,
          borderRadius: 16,
          padding: "40px 56px",
          width: 1100,
          minHeight: 480,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          opacity: frameEnter,
          transform: `scale(${0.95 + 0.05 * frameEnter})`,
          boxShadow: `0 0 120px 20px rgba(239, 68, 68, ${glow * 0.35})`,
        }}
      >
        {/* Warning header */}
        <div
          style={{
            opacity: showWarning,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: COLORS.red,
            fontFamily: FONTS.body,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          <span style={{ fontSize: 30 }}>⚠</span> Blind signing ahead
        </div>
        <div
          style={{
            opacity: showUnrec,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 18,
            letterSpacing: "0.04em",
          }}
        >
          Unrecognized format
        </div>

        {/* Message Hash */}
        <div
          style={{
            opacity: showHashLbl,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 16,
            letterSpacing: "0.06em",
            marginTop: 10,
          }}
        >
          Message Hash
        </div>
        <div
          style={{
            color: COLORS.red,
            fontFamily: FONTS.mono,
            fontSize: 22,
            lineHeight: 1.55,
            letterSpacing: "0.02em",
            wordBreak: "break-all",
            minHeight: 76,
          }}
        >
          {visibleHash}
          <span style={{ opacity: showHash < 1 && showHash > 0 ? 0.6 : 0, color: COLORS.red }}>▌</span>
        </div>

        {/* Fee payer */}
        <div
          style={{
            opacity: showPayerLbl,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 16,
            letterSpacing: "0.06em",
            marginTop: 6,
          }}
        >
          Fee payer
        </div>
        <div
          style={{
            color: COLORS.red,
            fontFamily: FONTS.mono,
            fontSize: 22,
            lineHeight: 1.4,
            letterSpacing: "0.02em",
            wordBreak: "break-all",
            minHeight: 32,
          }}
        >
          {visiblePayer}
          <span style={{ opacity: showPayer < 1 && showPayer > 0 ? 0.6 : 0, color: COLORS.red }}>▌</span>
        </div>

        {/* Footer */}
        <div
          style={{
            opacity: showFooter,
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingTop: 14,
            marginTop: 6,
            borderTop: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 20,
            letterSpacing: "0.02em",
          }}
        >
          Accept risk and sign?
        </div>
      </div>

      <Caption
        text="every multisig on solana sends a transaction the hardware wallet can't read."
        durationInFrames={durationInFrames}
      />
    </AbsoluteFill>
  );
};
