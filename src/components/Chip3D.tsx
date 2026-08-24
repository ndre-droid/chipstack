import { useEffect, useState } from 'react';
import { renderChip, type ChipRender, type ChipView } from '../lib/chip3d';

interface Props {
  value: number | string;
  color: string;
  accent: string;
  /** CSS width of the chip image. */
  size: number;
  view: ChipView;
  /** Stack view only: how many discs to pile up. */
  discs?: number;
  className?: string;
  /** Drawn while the bitmap renders — the vector chip, so nothing flashes empty. */
  fallback: React.ReactNode;
}

/**
 * A chip drawn from the 3D model.
 *
 * The picture comes from lib/chip3d (rendered once, then cached); the value is HTML
 * text laid over it, because the model carries no digits — which is also why a 5000
 * chip, a custom denomination and a translated label all cost nothing extra. The text
 * is placed and foreshortened using the same camera that drew the chip, so it sits on
 * the face rather than floating over it.
 *
 * Until the render resolves — and permanently, if the device has no WebGL or the
 * model fails to load — the vector chip passed as `fallback` is shown instead.
 */
export default function Chip3D({ value, color, accent, size, view, discs = 1, className, fallback }: Props) {
  const [render, setRender] = useState<ChipRender | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setRender(null);
    renderChip({ color, accent, size, discs, view })
      .then((r) => alive && setRender(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [color, accent, size, discs, view]);

  if (failed || !render) return <>{fallback}</>;

  const { width, height, label } = render;
  const isLight = isLightColor(color);
  // The cartouche is about a third of the face; keep the number inside it.
  const fontSize = Math.max(7, render.width * label.widthFraction * fontScale(String(value)));

  return (
    <div
      className={`chip3d ${className ?? ''}`}
      style={{ width, height }}
      role="img"
      aria-label={view === 'stack' ? `${discs} chips of ${value}` : `${value} chip`}
    >
      <img src={render.url} width={width} height={height} alt="" draggable={false} />
      <span
        className="chip3d-value"
        style={{
          left: `${label.x * 100}%`,
          top: `${label.y * 100}%`,
          fontSize,
          color: isLight ? '#2a2205' : '#fff',
          transform: `translate(-50%, -50%) scaleY(${label.squash.toFixed(3)})`,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Longer numbers get proportionally smaller, same steps the vector chip uses. */
function fontScale(s: string) {
  if (s.length <= 2) return 0.26;
  if (s.length === 3) return 0.21;
  if (s.length === 4) return 0.165;
  return 0.13;
}

function isLightColor(hex: string) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}
