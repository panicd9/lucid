import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

// Single hack card — name, date, amount, one-line mechanism.
// Springs in from below with a 12-frame stagger applied by parent via delayFrames.
export const HackCard: React.FC<{
  name: string;
  date: string;
  amount: string;
  mechanism: string;
  delayFrames: number;
}> = ({ name, date, amount, mechanism, delayFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 200 },
    durationInFrames: 24,
  });
  const translateY = (1 - enter) * 40;
  const opacity = enter;

  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "32px 28px",
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <span
          style={{
            color: COLORS.text,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: "0.04em",
          }}
        >
          {name}
        </span>
        <span
          style={{
            color: COLORS.muted,
            fontFamily: FONTS.mono,
            fontWeight: 500,
            fontSize: 16,
            letterSpacing: "0.02em",
          }}
        >
          {date}
        </span>
      </div>
      <span
        style={{
          color: COLORS.red,
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 56,
          letterSpacing: "0.02em",
          lineHeight: 1.05,
        }}
      >
        {amount}
      </span>
      <span
        style={{
          color: COLORS.muted,
          fontFamily: FONTS.body,
          fontSize: 18,
          lineHeight: 1.4,
          marginTop: 4,
        }}
      >
        {mechanism}
      </span>
    </div>
  );
};
