/**
 * Tiny stack-trail line: one point per counting round, oldest left. Drawn as a
 * plain polyline in `currentColor` so it inherits whatever it sits in (phone
 * roster row, TV roster row). Needs at least two points to say anything.
 */
export default function Sparkline({
  points,
  width = 54,
  height = 18,
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  // y is inverted (SVG origin is top-left) and inset by the stroke width
  const y = (v: number) => height - 1.5 - ((v - min) / span) * (height - 3);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const rising = last >= points[points.length - 2];

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity=".75" />
      <circle cx={width} cy={y(last)} r="2.2" fill="currentColor" opacity={rising ? 1 : 0.6} />
    </svg>
  );
}
