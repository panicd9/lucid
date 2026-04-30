import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";
import { HackCard } from "../components/HackCard";
import { Caption } from "../components/Captions";

// 0:15–0:45 — The stakes ($2B / 4 hacks)
// Big counter ticks up to $2.03B, then 4 cards land in 2x2 grid.

const HACKS = [
  {
    name: "bybit",
    date: "feb 2025",
    amount: "$1.46b",
    mechanism: "lazarus injected js into safe's frontend. ledgers blind-signed a delegatecall the ui hid as an eth transfer.",
  },
  {
    name: "drift",
    date: "apr 2026",
    amount: "$285m",
    mechanism: "dprk pre-signed durable-nonce governance txs over 6 months. signers couldn't verify them on hardware.",
  },
  {
    name: "wazirx",
    date: "jul 2024",
    amount: "$235m",
    mechanism: "liminal-managed safe ui showed one tx. signers approved another that swapped the implementation contract.",
  },
  {
    name: "radiant",
    date: "oct 2024",
    amount: "$50m",
    mechanism: "malware showed a routine config change. hardware wallets signed transferownership on the lending pool.",
  },
];

export const Stakes: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Counter ticks $0 → $2.03B over 90 frames (3s)
  const counterProgress = interpolate(frame, [0, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Eased: slight overshoot via spring
  const counterValue = 2.03 * counterProgress;
  const counterText = counterValue >= 1 ? `$${counterValue.toFixed(2)}b` : `$${(counterValue * 1000).toFixed(0)}m`;

  const headlineEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const subEnter = spring({ frame: frame - 90, fps, config: { damping: 200 }, durationInFrames: 24 });

  // 4 cards stagger in starting at frame 120
  const cardStart = 120;
  const cardStagger = 14;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, padding: "100px 120px" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Big counter */}
        <div
          style={{
            opacity: headlineEnter,
            transform: `translateY(${(1 - headlineEnter) * 20}px)`,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontWeight: 600,
              fontSize: 140,
              color: COLORS.red,
              letterSpacing: "0.01em",
              lineHeight: 1,
            }}
          >
            {counterText}
          </span>
        </div>
        <div
          style={{
            opacity: subEnter,
            textAlign: "center",
            marginBottom: 60,
          }}
        >
          <p
            style={{
              fontFamily: FONTS.body,
              fontWeight: 400,
              fontSize: 28,
              color: COLORS.text,
              letterSpacing: "0.02em",
              margin: 0,
            }}
          >
            stolen across 4 multisig hacks. 18 months.
          </p>
        </div>

        {/* 2x2 grid of hack cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            flex: 1,
            alignContent: "center",
          }}
        >
          {HACKS.map((h, i) => (
            <HackCard
              key={h.name}
              name={h.name}
              date={h.date}
              amount={h.amount}
              mechanism={h.mechanism}
              delayFrames={cardStart + i * cardStagger}
            />
          ))}
        </div>
      </div>

      <Caption
        text="every hack used hardware wallets. every hack, the wallet couldn't read what was signed."
        durationInFrames={durationInFrames}
        bottom={40}
      />
    </AbsoluteFill>
  );
};
