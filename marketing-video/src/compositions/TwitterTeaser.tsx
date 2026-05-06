import { Fragment } from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

// 18s Twitter teaser — captions only, no audio. Three beats:
//   0–3s  hook number
//   3–13s before/after side-by-side (10s)
//   13–18s lucid CTA

const HACKS_INLINE = [
  { name: "Bybit", amount: "$1.46B" },
  { name: "Drift", amount: "$285M" },
  { name: "WazirX", amount: "$235M" },
  { name: "Radiant", amount: "$50M" },
];

const HookBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const counterProgress = interpolate(frame, [0, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const value = 2.03 * counterProgress;
  const text = value >= 1 ? `$${value.toFixed(2)}b` : `$${(value * 1000).toFixed(0)}m`;

  const subEnter = spring({
    frame: frame - 50,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });

  // Names list staggers in after the subtitle has settled (~3s in), so
  // the viewer reads the counter → subtitle → names sequentially.
  const namesStart = 90;
  const namesStagger = 7;

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
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 240,
          color: COLORS.red,
          letterSpacing: "0.01em",
          lineHeight: 1,
        }}
      >
        {text}
      </div>
      <div
        style={{
          opacity: subEnter,
          fontFamily: FONTS.body,
          fontWeight: 400,
          fontSize: 42,
          color: COLORS.text,
          letterSpacing: "0.04em",
          marginTop: 28,
        }}
      >
        stolen across 4 multisig hacks. 18 months.
      </div>
      <div
        style={{
          display: "flex",
          gap: 22,
          marginTop: 36,
          alignItems: "baseline",
        }}
      >
        {HACKS_INLINE.map((h, i) => {
          const enter = spring({
            frame: frame - (namesStart + i * namesStagger),
            fps,
            config: { damping: 200 },
            durationInFrames: 18,
          });
          return (
            // eslint-disable-next-line react/jsx-key
            <Fragment key={h.name}>
              {i > 0 && (
                <span
                  style={{
                    opacity: enter,
                    color: COLORS.muted,
                    fontFamily: FONTS.body,
                    fontSize: 32,
                  }}
                >
                  ·
                </span>
              )}
              <span
                style={{
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 10}px)`,
                  display: "inline-flex",
                  gap: 12,
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.body,
                    fontWeight: 500,
                    fontSize: 32,
                    color: COLORS.muted,
                    letterSpacing: "0.02em",
                  }}
                >
                  {h.name}
                </span>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontWeight: 600,
                    fontSize: 32,
                    color: COLORS.red,
                    letterSpacing: "0.02em",
                  }}
                >
                  {h.amount}
                </span>
              </span>
            </Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Ledger format references:
//   Blind side  → pitch_deck/pitch-deck-20260418-120000.html lines 339-347
//   Lucid side  → CLAUDE.md "Signing Flow" section (signMessage envelope)
const MESSAGE_HASH = "a3f9d8c7b6a5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d60c2d";
const FEE_PAYER = "7Hk2mPqRsTuVwXyZ3aBcDeFgHjKnNpQrStUvWxYz9bXr";

// Plain-English message — exact format from sdk/src/signer.ts:194 and
// programs/lucid/src/state/message.rs:11
//   "{action} {template} | wallet: {name} ({pda_b58}); proposal: #{index}; expires: {timestamp}"
const LUCID_LINE_1 = "approve withdraw 50000 USDC to 9abc...def |";
const LUCID_LINE_2 = "wallet: drift-governance (Drft9...PDA);";
const LUCID_LINE_3 = "proposal: #42;";
const LUCID_LINE_4 = "expires: 09 May 2026 12:00:00 UTC;";

const BlindLedger: React.FC<{ enter: number; reveal: number }> = ({ enter, reveal }) => {
  // reveal is 0..1 over the full beat — gated stages within
  const stage = (a: number, b: number) =>
    Math.max(0, Math.min(1, (reveal - a) / (b - a)));
  const showWarn = stage(0.05, 0.18);
  const showUnrec = stage(0.12, 0.22);
  const showHashLbl = stage(0.18, 0.28);
  const hashTyped = stage(0.22, 0.55);
  const showPayerLbl = stage(0.55, 0.62);
  const payerTyped = stage(0.6, 0.78);
  const showFooter = stage(0.78, 0.92);

  const hashVisible = MESSAGE_HASH.slice(0, Math.floor(MESSAGE_HASH.length * hashTyped));
  const payerVisible = FEE_PAYER.slice(0, Math.floor(FEE_PAYER.length * payerTyped));

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
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
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: COLORS.red,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
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
          background: "#0a0a0a",
          border: `2px solid ${COLORS.red}`,
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: `0 0 80px ${COLORS.redGlow}`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            opacity: showWarn,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: COLORS.red,
            fontFamily: FONTS.body,
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 28 }}>⚠</span> Blind signing ahead
        </div>
        <div
          style={{
            opacity: showUnrec,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 17,
          }}
        >
          Unrecognized format
        </div>
        <div
          style={{
            opacity: showHashLbl,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 14,
            letterSpacing: "0.06em",
            marginTop: 8,
          }}
        >
          Message Hash
        </div>
        <div
          style={{
            color: COLORS.red,
            fontFamily: FONTS.mono,
            fontSize: 18,
            lineHeight: 1.5,
            letterSpacing: "0.02em",
            wordBreak: "break-all",
            minHeight: 80,
          }}
        >
          {hashVisible}
          <span style={{ opacity: hashTyped > 0 && hashTyped < 1 ? 0.7 : 0, color: COLORS.red }}>▌</span>
        </div>
        <div
          style={{
            opacity: showPayerLbl,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 14,
            letterSpacing: "0.06em",
          }}
        >
          Fee payer
        </div>
        <div
          style={{
            color: COLORS.red,
            fontFamily: FONTS.mono,
            fontSize: 18,
            lineHeight: 1.4,
            letterSpacing: "0.02em",
            wordBreak: "break-all",
            minHeight: 28,
          }}
        >
          {payerVisible}
          <span style={{ opacity: payerTyped > 0 && payerTyped < 1 ? 0.7 : 0, color: COLORS.red }}>▌</span>
        </div>
        <div
          style={{
            opacity: showFooter,
            paddingTop: 12,
            marginTop: "auto",
            borderTop: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 18,
          }}
        >
          Accept risk and sign?
        </div>
      </div>
    </div>
  );
};

const LucidLedger: React.FC<{ enter: number; reveal: number }> = ({ enter, reveal }) => {
  const stage = (a: number, b: number) =>
    Math.max(0, Math.min(1, (reveal - a) / (b - a)));
  const showHeader = stage(0.05, 0.15);
  const showLabel = stage(0.15, 0.25);
  const line1 = stage(0.25, 0.4);
  const line2 = stage(0.4, 0.55);
  const line3 = stage(0.55, 0.65);
  const line4 = stage(0.65, 0.8);
  const showApprove = stage(0.85, 0.95);

  const slice = (s: string, p: number) => s.slice(0, Math.floor(s.length * p));

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
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
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: COLORS.emerald,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
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
          background: "#0a0a0a",
          border: `2px solid ${COLORS.emerald}`,
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: `0 0 80px rgba(16, 185, 129, 0.30)`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            opacity: showHeader,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: COLORS.emerald,
            fontFamily: FONTS.body,
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 28 }}>✓</span> Sign Message
        </div>
        <div
          style={{
            opacity: showLabel,
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 17,
          }}
        >
          Human-readable approval
        </div>
        <div
          style={{
            color: COLORS.text,
            fontFamily: FONTS.mono,
            fontSize: 22,
            lineHeight: 1.5,
            letterSpacing: "0.02em",
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div>
            {slice(LUCID_LINE_1, line1)}
            <span style={{ opacity: line1 > 0 && line1 < 1 ? 0.7 : 0, color: COLORS.emerald }}>▌</span>
          </div>
          <div style={{ color: COLORS.muted, fontSize: 19 }}>{slice(LUCID_LINE_2, line2)}</div>
          <div style={{ color: COLORS.muted, fontSize: 19 }}>{slice(LUCID_LINE_3, line3)}</div>
          <div style={{ color: COLORS.emerald, fontSize: 19 }}>{slice(LUCID_LINE_4, line4)}</div>
        </div>
        <div
          style={{
            opacity: showApprove,
            paddingTop: 14,
            marginTop: "auto",
            borderTop: `1px solid ${COLORS.border}`,
            color: COLORS.emerald,
            fontFamily: FONTS.body,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          Approve
        </div>
      </div>
    </div>
  );
};

const BeforeAfterBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leftEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const rightEnter = spring({
    frame: frame - 12,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });

  // Stage progresses 0→1 across 280 frames (~9.3s of the 10s beat)
  const reveal = interpolate(frame, [20, 280], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        padding: "60px 60px 40px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <p
          style={{
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 28,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          same ledger. same multisig flow.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, flex: 1 }}>
        <BlindLedger enter={leftEnter} reveal={reveal} />
        <LucidLedger enter={rightEnter} reveal={reveal} />
      </div>
    </AbsoluteFill>
  );
};

const CtaBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordmarkEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const taglineEnter = spring({
    frame: frame - 18,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });
  const ctaEnter = spring({
    frame: frame - 60,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
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
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 200,
          color: COLORS.text,
          letterSpacing: "0.12em",
          marginBottom: 16,
        }}
      >
        LUCID
      </div>
      <div
        style={{
          opacity: taglineEnter,
          fontFamily: FONTS.body,
          fontWeight: 400,
          fontSize: 44,
          color: COLORS.emerald,
          letterSpacing: "0.02em",
          marginBottom: 56,
        }}
      >
        read what you sign.
      </div>
      <div
        style={{
          opacity: ctaEnter,
          transform: `translateY(${(1 - ctaEnter) * 16}px)`,
          padding: "22px 44px",
          border: `1px solid ${COLORS.emerald}`,
          borderRadius: 99,
          fontFamily: FONTS.mono,
          fontSize: 28,
          color: COLORS.emerald,
          letterSpacing: "0.04em",
        }}
      >
        try the demo →
      </div>
    </AbsoluteFill>
  );
};

export const TwitterTeaser: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Sequence from={0} durationInFrames={7 * 30}>
        <HookBeat />
      </Sequence>
      <Sequence from={7 * 30} durationInFrames={10 * 30}>
        <BeforeAfterBeat />
      </Sequence>
      <Sequence from={17 * 30} durationInFrames={5 * 30}>
        <CtaBeat />
      </Sequence>
    </AbsoluteFill>
  );
};
