import { useLayoutEffect, useRef, useState } from 'react';
import type { Denomination } from '../types';
import Chip from './Chip';

interface Props {
  denoms: Denomination[];
  counts: Record<string, number>;
  maxDiscs?: number;
}

/**
 * Visual poker-table representation: one physical stack per denomination.
 * Sizes the chips to the available width so the whole spread is always visible
 * at once — no sideways or vertical scrolling.
 */
export default function ChipStackViz({ denoms, counts, maxDiscs = 14 }: Props) {
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

  if (used.length === 0) return <div className="empty">No chips to show yet.</div>;

  const gap = 8;
  // plaques take a little more width; weight columns accordingly
  const weight = (d: Denomination) => (d.shape === 'plaque' ? 1.4 : 1);
  const totalWeight = used.reduce((s, d) => s + weight(d), 0) || 1;
  const w = Number.isFinite(width) && width > 0 ? width : 320;
  const rawSize = Math.floor((w - (used.length - 1) * gap - 2) / totalWeight);
  const chipSize = Math.max(16, Math.min(46, Number.isFinite(rawSize) ? rawSize : 32));
  const discH = Math.max(3, Math.round(chipSize * 0.22));
  const overlap = Math.round(discH * 0.5);

  return (
    <div className="stack-viz" ref={ref} style={{ gap }}>
      {used.map((d) => {
        const n = counts[d.id];
        const discs = Math.min(n, maxDiscs);
        const isPlaque = d.shape === 'plaque';
        return (
          <div className="stack-col" key={d.id} style={{ width: isPlaque ? chipSize * 1.35 : chipSize }}>
            <div className="stack-chips">
              {!isPlaque &&
                Array.from({ length: Math.max(0, discs - 1) }).map((_, i) => (
                  <div
                    key={i}
                    className="disc"
                    style={{
                      width: chipSize,
                      height: discH,
                      marginTop: -overlap,
                      background: `linear-gradient(180deg, ${d.color}, ${shade(d.color, -0.22)})`,
                      borderTop: `1px solid ${shade(d.color, 0.25)}`,
                    }}
                  />
                ))}
              <div style={{ marginTop: isPlaque ? 0 : -overlap, lineHeight: 0 }}>
                <Chip value={d.value} color={d.color} accent={d.accent} size={chipSize} shape={d.shape} />
              </div>
            </div>
            <div className="cap" style={{ fontSize: Math.max(10, chipSize * 0.26) }}>
              ×{n}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shade(hex: string, amt: number) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const c = (v: number) => f(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
