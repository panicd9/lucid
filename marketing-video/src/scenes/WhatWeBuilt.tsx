import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";
import { MetricCard } from "../components/MetricCard";
import { Caption } from "../components/Captions";

// 2:20–2:45 — what we built: 4 metrics + stack chips

const METRICS = [
  { value: "22k", label: "lines of code" },
  { value: "217", label: "tests passing" },
  { value: "11", label: "instructions" },
  { value: "4", label: "surfaces shipped" },
];

const STACK = ["pinocchio", "rust", "typescript", "react", "ledger webhid", "@solana/kit"];

export const WhatWeBuilt: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEnter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const stackStart = 180;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, padding: "100px 120px" }}>
      <div
        style={{
          opacity: titleEnter,
          transform: `translateY(${(1 - titleEnter) * 16}px)`,
          textAlign: "center",
          marginBottom: 60,
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
          complete system. not a hackathon prototype.
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
          program · cli · sdk · dashboard
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 24,
          marginBottom: 60,
        }}
      >
        {METRICS.map((m, i) => (
          <MetricCard
            key={m.label}
            value={m.value}
            label={m.label}
            delayFrames={30 + i * 14}
            accent
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          justifyContent: "center",
        }}
      >
        {STACK.map((s, i) => {
          const enter = spring({
            frame: frame - (stackStart + i * 8),
            fps,
            config: { damping: 200 },
            durationInFrames: 18,
          });
          return (
            <span
              key={s}
              style={{
                fontFamily: FONTS.mono,
                fontSize: 18,
                color: COLORS.muted,
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                padding: "10px 18px",
                borderRadius: 99,
                letterSpacing: "0.04em",
                opacity: enter,
                transform: `translateY(${(1 - enter) * 14}px)`,
              }}
            >
              {s}
            </span>
          );
        })}
      </div>

      <Caption
        text="zero panics on-chain. ledger webhid direct. cross-language golden vectors."
        durationInFrames={durationInFrames}
        bottom={40}
      />
    </AbsoluteFill>
  );
};
