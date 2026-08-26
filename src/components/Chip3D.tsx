import { useEffect, useState } from 'react';
import { chip3dSupported, renderChip, renderSize, type ChipRender, type ChipView } from '../lib/chip3d';

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
  /** Drawn if this device can never render — the vector chip, for good. */
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
 * If the device has no WebGL, or the model fails to load, the vector chip passed as
 * `fallback` takes over for good — that IS this device's chip.
 *
 * While the first render is still in flight it draws a dim disc in the chip's own
 * colour instead. The vector chip used to stand in here, and on a cold start the
 * whole app came up in one chip design and swapped to another a moment later, which
 * looks like a bug rather than like loading.
 */
export default function Chip3D({ value, color, accent, size, view, discs = 1, className, fallback }: Props) {
  const [render, setRender] = useState<ChipRender | null>(null);
  const [failed, setFailed] = useState(false);
  /* Drawn at one of a handful of fixed sizes and scaled to the size asked for: a
     render is keyed on its pixel size, so honouring every one-pixel difference meant
     the same chip was rendered again for every layout it appeared in. See
     `renderSize`. */
  const drawnAt = renderSize(size);
  const scale = drawnAt > 0 ? size / drawnAt : 1;

  useEffect(() => {
    let alive = true;
    setRender(null);
    renderChip({ color, accent, size: drawnAt, discs, view })
      .then((r) => alive && setRender(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [color, accent, drawnAt, discs, view]);

  // No WebGL here, or the renderer already gave up: the drawn chip IS this device's
  // chip, so show it straight away rather than waiting out a render that cannot come.
  if (failed || !chip3dSupported()) return <>{fallback}</>;
  if (!render) {
    return (
      <span
        className={`chip-svg chip-ph ${className ?? ''}`}
        style={{ width: size, height: size, ['--chip-ph' as string]: color }}
        aria-hidden
      />
    );
  }

  const width = render.width * scale;
  const height = render.height * scale;

  return (
    <div
      className={`chip3d ${className ?? ''}`}
      style={{ width, height }}
      role="img"
      aria-label={view === 'stack' ? `${discs} chips of ${value}` : `${value} chip`}
    >
      <img src={render.url} width={width} height={height} alt="" draggable={false} />
      <ChipValue render={render} value={value} color={color} scale={scale} />
    </div>
  );
}

/**
 * The denomination, laid on the face of a rendered chip: placed and foreshortened by
 * the same camera that drew the bitmap. Shared with the stack view, where every disc
 * of a pile carries its own number.
 */
export function ChipValue({
  render,
  value,
  color,
  scale = 1,
}: {
  render: ChipRender;
  value: number | string;
  color: string;
  /** How far the bitmap is scaled down from the size it was rendered at. */
  scale?: number;
}) {
  const { label } = render;
  const isLight = isLightColor(color);
  // The cartouche is about a third of the face; keep the number inside it. `label` is
  // all fractions of the bitmap, so only the width it is measured against scales.
  const fontSize = Math.max(7, render.width * scale * label.widthFraction * fontScale(String(value)));
  return (
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
