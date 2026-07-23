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
 * Poker chip / plaque in the SLOWPLAY Nash ceramic style: smooth edge (no clay
 * edge spots), with a full-face gold art-deco lattice and the value in a central
 * octagon cartouche. Round chips take one of several art styles; plaques render
 * as a rectangular art-deco tile. Rendered as scalable SVG.
 */
export default function Chip({ value, color, accent, size = 44, className, shape = 'chip', art }: ChipProps) {
  const storeArt = useStore().state.settings.chipArt;
  const a = art ?? storeArt ?? 'deco';
  const sz = Number.isFinite(size) ? (size as number) : 44;
  if (shape === 'plaque') return <Plaque value={value} color={color} accent={accent} size={sz} className={className} />;
  return <RoundChip value={value} color={color} accent={accent} size={sz} className={className} art={a} />;
}

function octaPoints(r: number, rot = 0) {
  return Array.from({ length: 8 }, (_, i) => {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8 + rot;
    return `${50 + Math.cos(ang) * r},${50 + Math.sin(ang) * r}`;
  }).join(' ');
}

/** Full-face gold line-work drawn on the chip. */
function ChipArtwork({ art, accent }: { art: ChipArt; accent: string }) {
  const diamond = (r: number) => `50,${50 - r} ${50 + r},50 50,${50 + r} ${50 - r},50`;

  if (art === 'classic') {
    return (
      <g fill="none" stroke={accent} strokeWidth="1" opacity="0.82">
        <circle cx="50" cy="50" r="44" strokeWidth="1.1" />
        <circle cx="50" cy="50" r="40" strokeWidth="0.6" opacity="0.6" />
        <circle cx="50" cy="50" r="30" strokeWidth="0.8" />
        {Array.from({ length: 24 }, (_, i) => {
          const ang = (i / 24) * Math.PI * 2;
          return (
            <line key={i} x1={50 + Math.cos(ang) * 40} y1={50 + Math.sin(ang) * 40} x2={50 + Math.cos(ang) * 44} y2={50 + Math.sin(ang) * 44} strokeWidth="0.7" />
          );
        })}
      </g>
    );
  }
  if (art === 'diamond') {
    return (
      <g fill="none" stroke={accent} strokeWidth="1" opacity="0.82">
        <polygon points={diamond(45)} strokeWidth="1.1" />
        <polygon points={diamond(36)} strokeWidth="0.7" />
        <polygon points={diamond(26)} strokeWidth="0.6" opacity="0.6" />
        <circle cx="50" cy="50" r="45" strokeWidth="0.6" opacity="0.4" />
      </g>
    );
  }
  if (art === 'sunburst') {
    return (
      <g fill="none" stroke={accent} strokeWidth="0.9" opacity="0.82">
        <circle cx="50" cy="50" r="44" strokeWidth="1.1" />
        {Array.from({ length: 24 }, (_, i) => {
          const ang = (i / 24) * Math.PI * 2;
          return (
            <line key={i} x1={50 + Math.cos(ang) * 22} y1={50 + Math.sin(ang) * 22} x2={50 + Math.cos(ang) * 43} y2={50 + Math.sin(ang) * 43} strokeWidth="0.7" />
          );
        })}
      </g>
    );
  }
  // deco (default) — SLOWPLAY-style full-face gold lattice
  return (
    <g fill="none" stroke={accent} strokeWidth="0.9" opacity="0.85" strokeLinejoin="round">
      <polygon points={octaPoints(44)} strokeWidth="1" />
      <polygon points={octaPoints(40)} strokeWidth="0.5" opacity="0.55" />
      {Array.from({ length: 16 }, (_, i) => {
        const ang = (i / 16) * Math.PI * 2;
        return (
          <line key={i} x1={50 + Math.cos(ang) * 29} y1={50 + Math.sin(ang) * 29} x2={50 + Math.cos(ang) * 43} y2={50 + Math.sin(ang) * 43} strokeWidth="0.6" />
        );
      })}
      <polygon points={octaPoints(29)} strokeWidth="0.8" />
      <polygon points={octaPoints(25, Math.PI / 8)} strokeWidth="0.5" opacity="0.5" />
    </g>
  );
}

function RoundChip({ value, color, accent, size = 44, className, art = 'deco' }: ChipProps) {
  const uidRef = `c${String(value)}${color.replace('#', '')}`;
  const isLight = isLightColor(color);
  const textColor = isLight ? '#2a2205' : '#fff';
  const digits = String(value).length;
  const medR = digits >= 4 ? 22 : digits === 3 ? 19 : 16;

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
        <radialGradient id={`${uidRef}-body`} cx="40%" cy="34%" r="82%">
          <stop offset="0%" stopColor={lighten(color, 0.14)} />
          <stop offset="72%" stopColor={color} />
          <stop offset="100%" stopColor={darken(color, 0.16)} />
        </radialGradient>
      </defs>

      {/* smooth ceramic body — no edge spots */}
      <circle cx="50" cy="50" r="49" fill={`url(#${uidRef}-body)`} stroke={darken(color, 0.24)} strokeWidth="1.2" />
      <circle cx="50" cy="50" r="46.5" fill="none" stroke={accent} strokeWidth="0.9" opacity="0.75" />

      {/* full-face gold art-deco lattice */}
      <ChipArtwork art={art ?? 'deco'} accent={accent} />

      {/* central octagon cartouche + value */}
      <polygon points={octaPoints(medR)} fill={darken(color, 0.22)} stroke={accent} strokeWidth="1" />
      <polygon points={octaPoints(medR - 2.4)} fill="none" stroke={accent} strokeWidth="0.5" opacity="0.6" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontFor(String(value))}
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
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
      <rect x={x} y={y} width={w} height={h} rx="8" fill={`url(#${uidRef}-body)`} stroke={darken(color, 0.26)} strokeWidth="1.2" />
      <g fill="none" stroke={accent} strokeWidth="1" opacity="0.85">
        <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx="5" />
        <rect x={x + 9} y={y + 9} width={w - 18} height={h - 18} rx="3" strokeWidth="0.6" opacity="0.6" />
        <path
          d={`M${x + 5} ${y + 16} L${x + 16} ${y + 5} M${x + w - 5} ${y + 16} L${x + w - 16} ${y + 5} M${x + 5} ${y + h - 16} L${x + 16} ${y + h - 5} M${x + w - 5} ${y + h - 16} L${x + w - 16} ${y + h - 5}`}
          strokeWidth="0.6"
        />
      </g>
      <polygon
        points={`${x + w / 2 - 16},${y + h / 2} ${x + w / 2 - 11},${y + h / 2 - 10} ${x + w / 2 + 11},${y + h / 2 - 10} ${x + w / 2 + 16},${y + h / 2} ${x + w / 2 + 11},${y + h / 2 + 10} ${x + w / 2 - 11},${y + h / 2 + 10}`}
        fill={darken(color, 0.22)}
        stroke={accent}
        strokeWidth="0.9"
      />
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontFor(String(value)) - 1}
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
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
