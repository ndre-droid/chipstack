/**
 * The stack trend: one point per counting round, oldest on the left, with a dotted
 * line at break-even (what that player has put in, minus what they took off the
 * table). Above the dotted line they are up, below it they are down — that is the
 * whole thing to read, and it is why the baseline is drawn at all. The line takes
 * the colour of where it ENDS, so a glance at the row already answers "winning or
 * losing?" without reading a number.
 *
 * Everything is in one unit (chip units); the caller passes the baseline in the
 * same unit. Two points is the minimum that can show a direction — before that
 * there is no trend, only a stack, and the row already shows the stack.
 */
export default function Sparkline({
  points,
  baseline,
  width = 54,
  height = 18,
  span,
  stretch,
  className,
}: {
  points: number[];
  /** break-even for this player, in the same unit as `points` */
  baseline: number;
  width?: number;
  height?: number;
  /**
   * How far from break-even a full half-height swing means, in the same unit —
   * pass the SAME value for every trail drawn together and the height of a line
   * finally says something: the biggest swing on the table fills the row, a player
   * who barely moved draws a nearly flat one. Left out, each trail is scaled to
   * itself, which reads as "up" or "down" and nothing more.
   */
  span?: number;
  /**
   * Fill whatever width the layout hands the element instead of the intrinsic
   * `width`. The drawing is stretched horizontally only (the height is fixed), so
   * strokes are drawn at a constant width regardless of the scaling.
   */
  stretch?: boolean;
  className?: string;
}) {
  if (points.length < 2) return null;

  const inset = 1.5; // room for the stroke and the end dot
  let y: (v: number) => number;
  if (span && span > 0) {
    // shared scale: break-even sits in the middle, ±span reaches the edges
    const half = height / 2 - inset;
    const mid = height / 2;
    y = (v: number) => mid - Math.max(-1, Math.min(1, (v - baseline) / span)) * half;
  } else {
    // own scale: the baseline is part of the picture, so it has to be inside it
    const min = Math.min(baseline, ...points);
    const max = Math.max(baseline, ...points);
    const range = max - min || 1;
    y = (v: number) => height - inset - ((v - min) / range) * (height - inset * 2);
  }

  const stepX = width / (points.length - 1);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const up = last >= baseline;
  const stroke = up ? 'var(--good)' : 'var(--bad)';
  const lastY = y(last).toFixed(1);
  // A round-capped hairline segment, not a <circle>: under a stretched viewBox a
  // circle turns into an ellipse, while a cap drawn with a non-scaling stroke stays
  // round. On an unstretched one the two are identical.
  const dot = `M${(width - 0.01).toFixed(2)},${lastY} L${width},${lastY}`;
  const fixedStroke = stretch ? ('non-scaling-stroke' as const) : undefined;

  return (
    <svg
      className={className}
      width={stretch ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? 'none' : undefined}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <line
        x1="0"
        x2={width}
        y1={y(baseline).toFixed(1)}
        y2={y(baseline).toFixed(1)}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity=".35"
        vectorEffect={fixedStroke}
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={fixedStroke}
      />
      <path d={dot} fill="none" stroke={stroke} strokeWidth="4.4" strokeLinecap="round" vectorEffect={fixedStroke} />
    </svg>
  );
}
