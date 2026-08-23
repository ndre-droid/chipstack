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
  className,
}: {
  points: number[];
  /** break-even for this player, in the same unit as `points` */
  baseline: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  // the baseline is part of the picture, so it has to be inside the scale
  const min = Math.min(baseline, ...points);
  const max = Math.max(baseline, ...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  // y is inverted (SVG origin is top-left) and inset by the stroke width
  const y = (v: number) => height - 1.5 - ((v - min) / span) * (height - 3);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const up = last >= baseline;
  const stroke = up ? 'var(--good)' : 'var(--bad)';

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
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
      />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r="2.2" fill={stroke} />
    </svg>
  );
}
