import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";
import { Caption } from "../components/Captions";

// 1:40–2:20 — Live demo (40s, stylized while real footage is pending)
// Four sub-beats, each ~10s:
//   0–300:  ruleset page mockup (intents with risk badges)
//   300–600: propose action — message preview
//   600–900: ledger displays human-readable text — approve
//   900–1200: threshold reached, timelock clears, execute fires

const RULES = [
  { name: "withdraw_treasury", risk: "high", timelock: "24h" },
  { name: "add_market", risk: "medium", timelock: "12h" },
  { name: "update_oracle", risk: "high", timelock: "24h" },
  { name: "set_fee_pct", risk: "low", timelock: "1h" },
  { name: "rotate_signer", risk: "critical", timelock: "48h" },
];

const RISK_COLOR: Record<string, string> = {
  low: COLORS.muted,
  medium: COLORS.amber,
  high: "#f97316",
  critical: COLORS.red,
};

export const LiveDemo: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg, padding: "80px 120px" }}>
      <div style={{ marginBottom: 30 }}>
        <p
          style={{
            color: COLORS.muted,
            fontFamily: FONTS.body,
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: 0,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          live demo — local validator
        </p>
        <h2
          style={{
            color: COLORS.text,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 48,
            letterSpacing: "0.02em",
            margin: 0,
            textAlign: "center",
          }}
        >
          ruleset → propose → sign → execute
        </h2>
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        <Sequence from={0} durationInFrames={300} layout="none">
          <RulesetPanel />
        </Sequence>
        <Sequence from={300} durationInFrames={300} layout="none">
          <ProposePanel />
        </Sequence>
        <Sequence from={600} durationInFrames={300} layout="none">
          <SignPanel />
        </Sequence>
        <Sequence from={900} durationInFrames={300} layout="none">
          <ExecutePanel />
        </Sequence>
      </div>

      <Caption
        text="propose → sign with ledger → threshold met → timelock clears → execute fires."
        durationInFrames={durationInFrames}
        bottom={20}
      />
    </AbsoluteFill>
  );
};

const PanelShell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 1500,
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 36,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3a3a3a" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3a3a3a" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3a3a3a" }} />
          </div>
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 14,
              color: COLORS.muted,
              letterSpacing: "0.04em",
            }}
          >
            LUCID · drift-governance · 3 of 5
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: FONTS.body,
              fontSize: 14,
              color: COLORS.emerald,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        </div>
        {children}
      </div>
    </AbsoluteFill>
  );
};

const RulesetPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <PanelShell label="ruleset">
      <h3
        style={{
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 26,
          margin: "0 0 20px 0",
          letterSpacing: "0.02em",
        }}
      >
        23 intents — auto-generated from drift idl
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {RULES.map((r, i) => {
          const enter = spring({
            frame: frame - (40 + i * 12),
            fps,
            config: { damping: 200 },
            durationInFrames: 22,
          });
          return (
            <div
              key={r.name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems: "center",
                gap: 24,
                padding: "16px 20px",
                background: COLORS.card2,
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                opacity: enter,
                transform: `translateX(${(1 - enter) * -20}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 22,
                  color: COLORS.text,
                  letterSpacing: "0.02em",
                }}
              >
                {r.name}
              </span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  color: RISK_COLOR[r.risk],
                  background: `${RISK_COLOR[r.risk]}22`,
                  padding: "4px 12px",
                  borderRadius: 99,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                }}
              >
                {r.risk}
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 16,
                  color: COLORS.muted,
                  letterSpacing: "0.04em",
                }}
              >
                timelock {r.timelock}
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
};

const ProposePanel: React.FC = () => {
  const frame = useCurrentFrame();
  // Multi-line plain-English approval — exact format from sdk/src/signer.ts:194
  //   "{action} {template} | wallet: {name} ({pda_b58}); proposal: #{index}; expires: {timestamp}"
  const lines = [
    { text: "approve withdraw 50000 usdc to 9abc...def |", color: COLORS.text, start: 30, end: 80 },
    { text: "wallet: drift-governance (Drft9...PDA);", color: COLORS.muted, start: 80, end: 120 },
    { text: "proposal: #42;", color: COLORS.muted, start: 120, end: 140 },
    { text: "expires: 09 May 2026 12:00:00", color: COLORS.emerald, start: 140, end: 175 },
  ];

  return (
    <PanelShell label="propose">
      <h3
        style={{
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 26,
          margin: "0 0 8px 0",
          letterSpacing: "0.02em",
        }}
      >
        message preview — what your ledger will display
      </h3>
      <p
        style={{
          color: COLORS.muted,
          fontFamily: FONTS.body,
          fontSize: 16,
          margin: "0 0 24px 0",
        }}
      >
        intent: <span style={{ fontFamily: FONTS.mono, color: COLORS.emerald }}>withdraw_treasury</span>
      </p>
      <div
        style={{
          background: "#0a0a0a",
          border: `2px solid ${COLORS.emerald}`,
          borderRadius: 12,
          padding: "32px 28px",
          minHeight: 220,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: COLORS.emerald,
            fontFamily: FONTS.body,
            fontSize: 22,
            fontWeight: 600,
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 24 }}>✓</span> Sign Message
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontFamily: FONTS.mono,
            fontSize: 22,
            lineHeight: 1.5,
            letterSpacing: "0.01em",
          }}
        >
          {lines.map((l) => {
            const reveal = interpolate(frame, [l.start, l.end], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const visible = l.text.slice(0, Math.floor(l.text.length * reveal));
            return (
              <div key={l.text} style={{ color: l.color, minHeight: 30 }}>
                {visible}
                <span
                  style={{
                    opacity: reveal > 0 && reveal < 1 ? 0.7 : 0,
                    color: COLORS.emerald,
                  }}
                >
                  ▌
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );
};

const SignPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sigs = [
    { who: "alice.sol", time: 0 },
    { who: "bob.sol", time: 80 },
    { who: "carol.sol", time: 160 },
  ];
  return (
    <PanelShell label="sign">
      <h3
        style={{
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 26,
          margin: "0 0 24px 0",
          letterSpacing: "0.02em",
        }}
      >
        signers approve via ledger webHID
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sigs.map((s, i) => {
          const enter = spring({
            frame: frame - s.time,
            fps,
            config: { damping: 200 },
            durationInFrames: 22,
          });
          return (
            <div
              key={s.who}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 20,
                padding: "20px 24px",
                background: COLORS.card2,
                borderRadius: 8,
                border: `1px solid ${enter > 0.5 ? COLORS.emerald : COLORS.border}`,
                opacity: 0.3 + 0.7 * enter,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: COLORS.emerald,
                  boxShadow: enter > 0.5 ? `0 0 14px ${COLORS.emerald}` : "none",
                  opacity: enter,
                }}
              />
              <span style={{ fontFamily: FONTS.mono, fontSize: 22, color: COLORS.text }}>{s.who}</span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  color: COLORS.emerald,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  opacity: enter,
                }}
              >
                signed
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 28,
          padding: "16px 24px",
          background: `${COLORS.emerald}15`,
          border: `1px solid ${COLORS.emerald}`,
          borderRadius: 8,
          opacity: interpolate(frame, [200, 240], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}
      >
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 18,
            color: COLORS.emerald,
            letterSpacing: "0.04em",
          }}
        >
          threshold reached: 3 of 5
        </span>
      </div>
    </PanelShell>
  );
};

const ExecutePanel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const buttonPulse = spring({ frame: frame - 30, fps, config: { damping: 200 }, durationInFrames: 22 });
  const txConfirmed = interpolate(frame, [120, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <PanelShell label="execute">
      <h3
        style={{
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 26,
          margin: "0 0 24px 0",
          letterSpacing: "0.02em",
        }}
      >
        timelock cleared — cpi fires
      </h3>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
        <button
          style={{
            background: COLORS.emerald,
            color: COLORS.bg,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            border: "none",
            borderRadius: 12,
            padding: "24px 56px",
            opacity: buttonPulse,
            transform: `scale(${0.9 + 0.1 * buttonPulse})`,
            boxShadow: `0 0 60px rgba(16, 185, 129, ${0.4 * buttonPulse})`,
            cursor: "pointer",
          }}
        >
          execute proposal
        </button>
      </div>
      <div
        style={{
          marginTop: 56,
          padding: "20px 24px",
          background: COLORS.card2,
          border: `1px solid ${COLORS.emerald}`,
          borderRadius: 8,
          opacity: txConfirmed,
          fontFamily: FONTS.mono,
          fontSize: 18,
          color: COLORS.muted,
          lineHeight: 1.7,
        }}
      >
        <div>
          <span style={{ color: COLORS.emerald }}>✓</span> tx 5xK...j8m confirmed
        </div>
        <div>
          <span style={{ color: COLORS.emerald }}>✓</span> cpi: drift_governance::withdraw_treasury
        </div>
        <div>
          <span style={{ color: COLORS.emerald }}>✓</span> audit log appended
        </div>
      </div>
    </PanelShell>
  );
};
