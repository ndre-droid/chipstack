import type { ChipShape, ChipArt } from '../types';
import { useStore } from '../store';

interface ChipProps {
  value: number | string;
  color: string;
  accent: string;
  size?: number;
  className?: string;
  shape?: ChipShape;
  art?: ChipArt;
}

/**
 * Poker chip / plaque in the SLOWPLAY Nash style. Round chips get edge spots and
 * one of several art styles (deco / classic / diamond / sunburst); plaques render
 * as a rectangular art-deco tile. Rendered as scalable SVG.
 */
export default function Chip({ value, color, accent, size = 44, className, shape = 'chip', art }: ChipProps) {
  const storeArt = useStore().state.settings.chipArt;
  const a = art ?? storeArt ?? 'deco';
  const sz = Number.isFinite(size) ? (size as number) : 44;
  if (shape === 'plaque') return <Plaque value={value} color={color} accent={accent} size={sz} className={className} />;
  return <RoundChip value={value} color={color} accent={accent} size={sz} className={className} art={a} />;
}

/** Art-style line-work drawn in the chip's inner face. */
function ChipArtwork({ art, accent }: { art: ChipArt; accent: string }) {
  const octagon = (r: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return `${50 + Math.cos(ang) * r},${50 + Math.sin(ang) * r}`;
    }).join(' ');
  const diamond = (r: number) => `50,${50 - r} ${50 + r},50 50,${50 + r} ${50 - r},50`;

  if (art === 'classic') {
    return (
      <g fill="none" stroke={accent} strokeWidth="1.2" opacity="0.85">
        <circle cx="50" cy="50" r="33" />
        <circle cx="50" cy="50" r="29" strokeWidth="0.8" />
        {Array.from({ length: 16 }, (_, i) => {
          const ang = (i / 16) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={50 + Math.cos(ang) * 29}
              y1={50 + Math.sin(ang) * 29}
              x2={50 + Math.cos(ang) * 33}
              y2={50 + Math.sin(ang) * 33}
            />
          );
        })}
      </g>
    );
  }
  if (art === 'diamond') {
    return (
      <g fill="none" stroke={accent} strokeWidth="1.2" opacity="0.85">
        <polygon points={diamond(34)} />
        <polygon points={diamond(27)} strokeWidth="0.9" />
        <polygon points={diamond(20)} strokeWidth="0.8" />
        <circle cx="50" cy="50" r="34" strokeWidth="0.7" opacity="0.5" />
      </g>
    );
  }
  if (art === 'sunburst') {
    return (
      <g fill="none" stroke={accent} strokeWidth="1" opacity="0.85">
        <circle cx="50" cy="50" r="34" />
        {Array.from({ length: 16 }, (_, i) => {
          const ang = (i / 16) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={50 + Math.cos(ang) * 16}
              y1={50 + Math.sin(ang) * 16}
              x2={50 + Math.cos(ang) * 33}
              y2={50 + Math.sin(ang) * 33}
            />
          );
        })}
      </g>
    );
  }
  // deco (default)
  return (
    <g fill="none" stroke={accent} strokeWidth="1.3" opacity="0.85">
      <polygon points={octagon(33)} />
      <polygon points={octagon(27)} strokeWidth="0.9" />
      <rect x="30" y="30" width="40" height="40" transform="rotate(45 50 50)" strokeWidth="0.9" />
    </g>
  );
}

function RoundChip({ value, color, accent, size = 44, className, art = 'deco' }: ChipProps) {
  const uidRef = `c${String(value)}${color.replace('#', '')}`;
  // 8 edge spots
  const spots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const r = 44;
    const cx = 50 + Math.cos(a) * r;
    const cy = 50 + Math.sin(a) * r;
    return (
      <rect
        key={i}
        x={cx - 5.5}
        y={cy - 3.5}
        width={11}
        height={7}
        rx={3.5}
        fill={accent}
        transform={`rotate(${(i / 8) * 360} ${cx} ${cy})`}
        opacity={0.95}
      />
    );
  });

  const isLight = isLightColor(color);
  const textColor = isLight ? '#2a2205' : '#fff';

  return (
    <svg
      className={`chip-svg ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${value} chip`}
    >
      <defs>
        <radialGradient id={`${uidRef}-body`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor={lighten(color, 0.16)} />
          <stop offset="70%" stopColor={color} />
          <stop offset="100%" stopColor={darken(color, 0.18)} />
        </radialGradient>
      </defs>

      {/* body */}
      <circle cx="50" cy="50" r="49" fill={`url(#${uidRef}-body)`} stroke={darken(color, 0.25)} strokeWidth="1.5" />
      {spots}

      {/* inner face */}
      <circle cx="50" cy="50" r="37" fill={darken(color, 0.06)} stroke={accent} strokeWidth="1.4" opacity="0.9" />

      {/* art-style line work */}
      <ChipArtwork art={art ?? 'deco'} accent={accent} />

      {/* centre banner */}
      <rect x="24" y="40" width="52" height="20" rx="3" fill={darken(color, 0.28)} stroke={accent} strokeWidth="1" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontFor(String(value))}
        fontWeight="800"
        fontFamily="Inter, sans-serif"
        letterSpacing="-0.5"
      >
        {value}
      </text>
    </svg>
  );
}

/** Rectangular art-deco plaque (SLOWPLAY Nash style). */
function Plaque({ value, color, accent, size = 44, className }: ChipProps) {
  const uidRef = `p${String(value)}${color.replace('#', '')}`;
  const isLight = isLightColor(color);
  const textColor = isLight ? '#2a2205' : '#fff';
  // rendered wider than tall within the same square footprint
  const w = 96;
  const h = 62;
  const x = 2;
  const y = 19;
  return (
    <svg
      className={`chip-svg plaque-svg ${className ?? ''}`}
      width={size * 1.35}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${value} plaque`}
    >
      <defs>
        <linearGradient id={`${uidRef}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={lighten(color, 0.14)} />
          <stop offset="60%" stopColor={color} />
          <stop offset="100%" stopColor={darken(color, 0.2)} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={`url(#${uidRef}-body)`} stroke={darken(color, 0.28)} strokeWidth="1.5" />
      <g fill="none" stroke={accent} strokeWidth="1.2" opacity="0.85">
        <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx="5" />
        <rect x={x + 9} y={y + 9} width={w - 18} height={h - 18} rx="3" strokeWidth="0.8" />
        <path d={`M${x + 5} ${y + 16} L${x + 16} ${y + 5} M${x + w - 5} ${y + 16} L${x + w - 16} ${y + 5} M${x + 5} ${y + h - 16} L${x + 16} ${y + h - 5} M${x + w - 5} ${y + h - 16} L${x + w - 16} ${y + h - 5}`} strokeWidth="0.8" />
      </g>
      <rect x={x + 22} y={y + h / 2 - 11} width={w - 44} height="22" rx="3" fill={darken(color, 0.28)} stroke={accent} strokeWidth="1" />
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontFor(String(value)) - 1}
        fontWeight="800"
        fontFamily="Inter, sans-serif"
        letterSpacing="-0.5"
      >
        {value}
      </text>
    </svg>
  );
}

function fontFor(s: string) {
  if (s.length <= 2) return 22;
  if (s.length === 3) return 18;
  if (s.length === 4) return 14;
  return 11;
}

function isLightColor(hex: string) {
  const { r, g, b } = toRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

function toRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lighten(hex: string, amt: number) {
  const { r, g, b } = toRgb(hex);
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

function darken(hex: string, amt: number) {
  const { r, g, b } = toRgb(hex);
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
