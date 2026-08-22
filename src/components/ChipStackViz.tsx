import { useLayoutEffect, useRef, useState } from 'react';
import type { Denomination } from '../types';
import { useT } from '../lib/i18n';
import Chip from './Chip';

interface Props {
  denoms: Denomination[];
  counts: Record<string, number>;
  maxDiscs?: number;
}

/**
 * Poker-table view: one physical stack per denomination, drawn as a real
 * 3D chip cylinder — curved body, per-chip edge divisions and SLOWPLAY-style
 * edge spots, topped by the chip face. Sizes to the available width so the
 * whole spread is always visible with no scrolling.
 */
export default function ChipStackViz({ denoms, counts, maxDiscs = 11 }: Props) {
  const t = useT();
  const used = denoms.filter((d) => counts[d.id] > 0);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 320);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (used.length === 0) return <div className="empty">{t('plan.noChipsYet')}</div>;

  const gap = 12;
  const weight = (d: Denomination) => (d.shape === 'plaque' ? 1.5 : 1);
  const totalWeight = used.reduce((s, d) => s + weight(d), 0) || 1;
  const w = Number.isFinite(width) && width > 0 ? width : 320;
  const rawSize = Math.floor((w - (used.length - 1) * gap - 2) / totalWeight);
  const chipSize = Math.max(20, Math.min(58, Number.isFinite(rawSize) ? rawSize : 34));

  return (
    <div className="stack-viz" ref={ref} style={{ gap }}>
      {used.map((d) => {
        const n = counts[d.id];
        const capSize = Math.max(10, Math.round(chipSize * 0.24));
        if (d.shape === 'plaque') {
          return (
            <div className="stack-col" key={d.id}>
              <div className="plaque-stack">
                <Chip value={d.value} color={d.color} accent={d.accent} size={chipSize} shape="plaque" />
              </div>
              <div className="cap" style={{ fontSize: capSize }}>×{n}</div>
            </div>
          );
        }
        return (
          <div className="stack-col" key={d.id}>
            <StackCylinder d={d} visible={Math.min(n, maxDiscs)} total={n} size={chipSize} />
            <div className="cap" style={{ fontSize: capSize }}>×{n}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A single denomination rendered as a 3D chip cylinder (SVG, 100-wide viewBox). */
function StackCylinder({ d, visible, total, size }: { d: Denomination; visible: number; total: number; size: number }) {
  const rx = 49;
  const cx = 50;
  const ry = 14;
  const perChip = 6.5;
  const topCy = ry + 1.5;
  const bodyH = visible > 1 ? (visible - 1) * perChip : perChip * 0.7;
  const bottomCy = topCy + bodyH;
  const VH = bottomCy + ry + 2;

  const base = d.color;
  const accent = d.accent;
  const light = shade(base, 0.18);
  const dark = shade(base, -0.3);
  const edge = shade(base, -0.5);
  const id = `sc-${d.id}`;
  const digits = String(d.value).length;
  const fontSize = digits >= 4 ? 9 : digits === 3 ? 11 : 13;
  const medRx = digits >= 4 ? 18 : digits === 3 ? 15 : 12;
  const ink = isLightColor(base) ? '#2a2205' : '#ffffff';

  return (
    <svg
      width={size}
      height={(size * VH) / 100}
      viewBox={`0 0 100 ${VH}`}
      className="chip-stack-svg"
      role="img"
      aria-label={`${total} chips of ${d.value}`}
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={edge} />
          <stop offset="16%" stopColor={dark} />
          <stop offset="50%" stopColor={light} />
          <stop offset="84%" stopColor={dark} />
          <stop offset="100%" stopColor={edge} />
        </linearGradient>
        <radialGradient id={`${id}-face`} cx="42%" cy="34%" r="78%">
          <stop offset="0%" stopColor={shade(base, 0.3)} />
          <stop offset="70%" stopColor={base} />
          <stop offset="100%" stopColor={shade(base, -0.16)} />
        </radialGradient>
      </defs>

      {/* cylinder body */}
      <path
        d={`M1 ${topCy} L1 ${bottomCy} A ${rx} ${ry} 0 0 0 99 ${bottomCy} L99 ${topCy} A ${rx} ${ry} 0 0 1 1 ${topCy} Z`}
        fill={`url(#${id}-body)`}
      />
      {/* per-chip edge divisions (smooth ceramic edge — no spots) */}
      {Array.from({ length: Math.max(0, visible - 1) }).map((_, i) => {
        const y = topCy + (i + 1) * perChip;
        return <path key={i} d={`M1 ${y} A ${rx} ${ry} 0 0 0 99 ${y}`} fill="none" stroke={edge} strokeWidth="0.5" opacity="0.4" />;
      })}
      {/* soft vertical highlight */}
      <path d={`M32 ${topCy} L32 ${bottomCy}`} stroke="#fff" strokeWidth="6" opacity="0.07" strokeLinecap="round" />

      {/* top face */}
      <ellipse cx={cx} cy={topCy} rx={rx} ry={ry} fill={`url(#${id}-face)`} stroke={shade(base, -0.26)} strokeWidth="1" />
      {/* art-deco gold lattice, perspective-projected onto the ellipse */}
      <g transform={`translate(${cx} ${topCy}) scale(1 ${ry / rx})`} fill="none" stroke={accent} strokeLinejoin="round">
        <polygon points={octa0(rx * 0.9)} strokeWidth="1" opacity="0.82" vectorEffect="non-scaling-stroke" />
        <polygon points={octa0(rx * 0.78)} strokeWidth="0.6" opacity="0.45" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          return (
            <line
              key={i}
              x1={Math.cos(a) * rx * 0.46}
              y1={Math.sin(a) * rx * 0.46}
              x2={Math.cos(a) * rx * 0.86}
              y2={Math.sin(a) * rx * 0.86}
              strokeWidth="0.7"
              opacity="0.7"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <polygon points={octa0(rx * 0.46)} strokeWidth="0.7" opacity="0.7" vectorEffect="non-scaling-stroke" />
      </g>
      {/* centre cartouche + value (upright for legibility) */}
      <ellipse cx={cx} cy={topCy} rx={medRx} ry={ry * 0.74} fill={shade(base, -0.22)} stroke={accent} strokeWidth="0.7" />
      <text
        x={cx}
        y={topCy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="-0.4"
      >
        {d.value}
      </text>
    </svg>
  );
}

function octa0(r: number) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
}

function shade(hex: string, amt: number) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const c = (v: number) => f(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function isLightColor(hex: string) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}
