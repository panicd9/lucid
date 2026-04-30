import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

export const MetricCard: React.FC<{
  value: string;
  label: string;
  delayFrames: number;
  accent?: boolean;
}> = ({ value, label, delayFrames, accent = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 200 },
    durationInFrames: 22,
  });
  const opacity = enter;
  const scale = 0.92 + 0.08 * enter;

  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${accent ? COLORS.emerald : COLORS.border}`,
        borderRadius: 12,
        padding: "36px 28px",
        opacity,
        transform: `scale(${scale})`,
        textAlign: "center",
        minWidth: 240,
      }}
    >
      <div
        style={{
          color: accent ? COLORS.emerald : COLORS.text,
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 60,
          letterSpacing: "0.02em",
          lineHeight: 1,
          marginBottom: 12,
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: COLORS.muted,
          fontFamily: FONTS.body,
          fontSize: 16,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
};
