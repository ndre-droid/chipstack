import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Denomination } from '../types';
import { useT } from '../lib/i18n';
import { useStore } from '../store';
import { chip3dSupported, peekChip, renderChip, renderSize, type ChipRender } from '../lib/chip3d';
import { animatedHere, type ChipAnimSurface } from '../lib/chipAnim';
import { useColumnFlow } from '../lib/columnFlow';
import { useGlidedCounts } from '../lib/countGlide';
import {
  chipTilt,
  discMotions,
  idleDiscs,
  impactStrength,
  useStackDiscs,
  DROP_IN_MS,
  DROP_OUT_MS,
  type DiscMotion,
} from '../lib/stackDrop';
import Chip from './Chip';
import { ChipValue } from './Chip3D';

/** How wide the row has to be before a chip is allowed its roomy size. Comfortably
 *  past any phone in portrait, and comfortably under an unfolded Fold's ~680px of
 *  card. */
const ROOMY_FROM = 520;

interface Props {
  denoms: Denomination[];
  counts: Record<string, number>;
  maxDiscs?: number;
  /** Where this spread is being shown — decides whether chips are allowed to move. */
  surface?: ChipAnimSurface;
  /** Biggest a single chip may be drawn. The big screen is metres away, not inches. */
  maxChipSize?: number;
  /** …and biggest once the spread has real room for it. The starting stack is the
   *  answer this app exists to give, and on an unfolded phone it should look like
   *  it. Left off, `maxChipSize` is the cap at every width. */
  roomyChipSize?: number;
}

/**
 * Poker-table view: one physical stack per denomination, drawn as a real
 * 3D chip cylinder — curved body, per-chip seams on a smooth SLOWPLAY-style
 * ceramic rim, topped by the chip face. Sizes to the available width so the
 * whole spread is always visible with no scrolling.
 *
 * Every stack is built out of one layer per chip rather than one picture of the
 * pile, so when the numbers change the chips that were added drop in from above
 * and the ones that went away lift off — see lib/stackDrop.
 */
function ChipStackViz({
  denoms,
  counts: target,
  maxDiscs = 11,
  surface = 'table',
  maxChipSize = 58,
  roomyChipSize,
}: Props) {
  const t = useT();
  const settings = useStore().state.settings;
  const animate = animatedHere(settings.chipAnim, surface);
  /* The big screen learns about the phone's slider in lumps — one cloud write every
     three quarters of a second — so it walks to each new spread a few chips at a
     time instead of jumping (see lib/countGlide). The phone's own slider is local
     and instant, and gliding it would only add lag where there is none. */
  const counts = useGlidedCounts(target, animate && surface === 'tv');
  const used = denoms.filter((d) => counts[d.id] > 0);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const visit = useTabEntries(ref);
  // A denomination joining or leaving the plan is a whole pile arriving or going, not
  // chips moving inside one: it unfolds into the row, or folds up and takes its space
  // with it, instead of the row jumping to fill a hole.
  const columns = useColumnFlow(
    used.map((d) => ({ id: d.id, item: { d, n: counts[d.id] } })),
    animate,
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 320);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (columns.length === 0) return <div className="empty">{t('plan.noChipsYet')}</div>;

  const w = Number.isFinite(width) && width > 0 ? width : 320;
  /* How big a chip is ALLOWED to be here. It is the plain cap on a phone, where the
     width runs out long before the cap does anyway, and the roomy one once the row
     is genuinely wide — an unfolded Fold, a tablet, a desktop window. Measured off
     the row itself rather than off a layout flag, so a phone opening out re-sizes
     the chips through the same ResizeObserver that already runs. */
  const cap = roomyChipSize && w >= ROOMY_FROM ? roomyChipSize : maxChipSize;
  // The gap belongs to the chips, not the screen: bigger chips, bigger gaps. It rides
  // on the columns rather than the row, so a pile folding away takes its gap with it.
  const gap = Math.round(cap * 0.21);
  const weight = (d: Denomination) => (d.shape === 'plaque' ? 1.5 : 1);
  const totalWeight = columns.reduce((s, c) => s + weight(c.item.d), 0) || 1;
  const rawSize = Math.floor((w - columns.length * gap - 2) / totalWeight);
  const chipSize = Math.max(20, Math.min(cap, Number.isFinite(rawSize) ? rawSize : 34));
  /* …but the 3D piles are RENDERED at one size per surface and scaled to fit. The
     chip size above moves every time a denomination joins or leaves the spread, and
     re-rendering a pile costs ~11 ms per disc — dragging the mix slider used to spend
     seconds redrawing chips that look identical. Rendering at the biggest size this
     surface can ask for means the bitmaps are drawn once and every later spread is a
     cache hit. */
  const drawnAt = renderSize(cap);
  // Room above the pile for a chip to fall through, in proportion to the chip.
  const headroom = Math.round(chipSize * 0.95);

  return (
    <div className="stack-viz" ref={ref} style={{ paddingTop: headroom }}>
      {columns.map(({ id, item: { d, n }, state }) => {
        const capSize = Math.max(10, Math.round(chipSize * 0.24));
        const colW = Math.round(chipSize * (d.shape === 'plaque' ? 1.35 : 1)) + gap;
        const style = {
          width: colW,
          paddingInline: gap / 2,
          ['--col-w' as string]: `${colW}px`,
          ['--col-pad' as string]: `${gap / 2}px`,
        };
        const className = `stack-col${state === 'idle' ? '' : ` col-${state}`}`;
        if (d.shape === 'plaque') {
          return (
            <div className={className} key={id} style={style}>
              <div className="plaque-stack">
                <Chip value={d.value} color={d.color} accent={d.accent} size={chipSize} shape="plaque" />
              </div>
              <div className="cap" style={{ fontSize: capSize }}>×{n}</div>
            </div>
          );
        }
        return (
          <div className={className} key={id} style={style}>
            <StackColumn
              d={d}
              count={Math.min(n, maxDiscs)}
              frameDiscs={maxDiscs}
              size={chipSize}
              drawnAt={drawnAt}
              animate={animate}
              use3d={settings.chipStyle === 'render3d' && chip3dSupported()}
              total={n}
              visit={visit}
            />
            <div className="cap" style={{ fontSize: capSize }}>×{n}</div>
          </div>
        );
      })}
    </div>
  );
}

interface ColumnProps {
  d: Denomination;
  /** Discs actually drawn (the cap under the stack carries the real number). */
  count: number;
  /** Height the 3D shot is framed for, so every layer of every stack shares a camera. */
  frameDiscs: number;
  size: number;
  /** Pixel size the bitmaps are rendered at; `size` is what they are scaled to. */
  drawnAt: number;
  animate: boolean;
  use3d: boolean;
  total: number;
  /** Bumped every time the tab is opened, which builds the spread again. */
  visit: number;
}

/** One denomination's pile: a layer per chip, each able to move on its own. */
const StackColumn = memo(function StackColumn({ d, count, frameDiscs, size, drawnAt, animate, use3d, total, visit }: ColumnProps) {
  const tracked = useStackDiscs(count, animate, visit);
  const needed = tracked.reduce((m, x) => Math.max(m, x.i + 1), count);
  const { layers, drawnAt: layersAt, failed } = useChipLayers(d.color, d.accent, drawnAt, frameDiscs, use3d);
  /* The bitmaps are drawn at one size and every dimension read off them is brought
     to the size this spread wants — see `drawnAt` in ChipStackViz. Scaled by the
     size the layers on screen were REALLY drawn at, which is briefly the previous
     one while a wider window's bigger render is still going. */
  const scale = layersAt > 0 ? size / layersAt : 1;
  // Three.js and the model load on first use. Until the bitmaps this pile needs are
  // there the vector stack stands in — it holds still, so the pile can't play its
  // build twice.
  const ready = use3d && layers !== null && layers.length >= needed;
  /* …and while it stands in for the RENDERED chip it stands in as a shadow of one:
     the pile's shape and colour, no faces, dimmed. Drawn in full it is simply a
     different chip design, and the swap a second later reads as the app changing its
     mind about what its chips look like. */
  const ghost = use3d && !ready && !failed;
  const motions = use3d && !ready ? discMotions(idleDiscs(count)) : tracked;
  const drop = Math.round(Math.max(22, Math.min(56, size * 0.85)));
  const label = `${total} chips of ${d.value}`;

  if (ready && layers && needed > 0) {
    const frameW = layers[0].width * scale;
    // Each layer is a band cut out of the pile's frame; the frame is what the discs
    // are positioned in.
    const frameH = (layers[0].frameHeight ?? layers[0].height) * scale;
    // The chip count can be a render ahead of the bitmaps (the disc list settles in an
    // effect, the layers arrive from the renderer): size the pile by what is drawable.
    const top = layers[Math.min(Math.max(count, 1), layers.length) - 1];
    const pileH = Math.max(size * 0.3, frameH * (1 - top.label.topFraction));
    return (
      <div
        className="stack-layers is-render"
        role="img"
        aria-label={label}
        style={{ width: frameW, height: pileH, ...motionVars(drop) }}
      >
        {motions.map((m) => {
          const layer = layers[m.i];
          if (!layer) return null;
          const discH = layer.height * scale;
          return (
            <div
              key={discKey(m)}
              className={discClass(m)}
              style={{
                ...discStyle(m, size),
                height: discH,
                bottom: frameH - (layer.offsetTop ?? 0) * scale - discH,
              }}
            >
              <div className="stack-disc-hit" style={hitStyle(m, size)}>
                <img src={layer.url} width={frameW} height={discH} alt="" draggable={false} />
                <ChipValue render={layer} value={d.value} color={d.color} scale={scale} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return <VectorColumn d={d} motions={motions} count={count} size={size} drop={drop} label={label} ghost={ghost} />;
});

/* ---------------- 3D layers ---------------- */

/**
 * The bitmaps for one pile — one per chip, all framed for a `frameDiscs`-high stack
 * so they line up when laid over each other.
 *
 * The WHOLE frame is rendered, not just the chips the pile currently holds, and the
 * render is keyed only on how a chip looks. That is what makes the chip-mix slider
 * feel immediate: the height changing is no longer a reason to build anything, so
 * dragging never restarts a half-finished run of renders and never waits on one.
 * Layers are handed over as they arrive, and a pile already in the cache is returned
 * on the spot — a re-render of a stack that has been drawn before costs nothing.
 *
 * `layers` is null until the first one is ready; `failed` says the device can't
 * render at all, which is what puts the drawn stack on screen for good.
 */
function useChipLayers(color: string, accent: string, size: number, frameDiscs: number, enabled: boolean) {
  /* The size the held layers were DRAWN at travels with them, because it stops
     matching `size` the moment a phone is opened out: the pile is allowed to get
     bigger there, which is a different render, and every dimension read off a
     bitmap has to be scaled by the size that bitmap actually is. */
  const [held, setHeld] = useState<Held>(() =>
    enabled ? { layers: cachedLayers(color, accent, size, frameDiscs), at: size } : EMPTY,
  );
  /* Told apart from "not there yet" on purpose: a pile still waiting shows a dimmed
     placeholder, but a pile that can never be rendered has to fall back to the drawn
     chip — a placeholder that never resolves is worse than the other chip design. */
  const [failed, setFailed] = useState(false);

  /* Which pile this is, as opposed to how big it is drawn. A new colour must throw
     the old bitmaps away — showing the previous chip's colour for a second is the
     app appearing to change its mind. A new SIZE must not: the old bitmaps are the
     same chips, and holding them (scaled up, soft for a moment) beats dropping the
     whole spread to grey shadows the instant a phone is unfolded. */
  const identity = `${color}|${accent}|${frameDiscs}`;
  const lastIdentity = useRef(identity);
  if (lastIdentity.current !== identity) {
    lastIdentity.current = identity;
    if (held.layers) setHeld(EMPTY);
  }

  useEffect(() => {
    if (!enabled || frameDiscs <= 0) return;
    const ready = cachedLayers(color, accent, size, frameDiscs);
    if (ready) {
      setHeld({ layers: ready, at: size });
      return;
    }
    let alive = true;
    (async () => {
      const out: ChipRender[] = [];
      for (let i = 0; i < frameDiscs && alive; i++) {
        out.push(await renderChip({ color, accent, size, view: 'stack', discs: frameDiscs, layer: i }));
        /* The renderer takes its own turn and hands the thread back between discs
           (see `renderChip`), so nothing needs to be yielded here. What IS wanted here
           is showing the discs that are finished, so the pile builds instead of
           appearing all at once at the end — in batches, not one commit per disc.
           Only while there is nothing to show, though: publishing a half-built pile
           over a complete one at another size replaces chips with shadows. */
        if (i % 4 === 3) setHeld((prev) => (prev.layers ? prev : { layers: [...out], at: size }));
      }
      if (alive) setHeld({ layers: out, at: size });
    })().catch(() => {
      if (!alive) return;
      setHeld(EMPTY);
      setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [color, accent, size, frameDiscs, enabled]);

  return { layers: held.layers, drawnAt: held.at, failed };
}

type Held = { layers: ChipRender[] | null; at: number };
const EMPTY: Held = { layers: null, at: 0 };

/** Every layer of this pile that has already been rendered — null if any is missing. */
function cachedLayers(color: string, accent: string, size: number, frameDiscs: number): ChipRender[] | null {
  const out: ChipRender[] = [];
  for (let i = 0; i < frameDiscs; i++) {
    const hit = peekChip({ color, accent, size, view: 'stack', discs: frameDiscs, layer: i });
    if (!hit) return null;
    out.push(hit);
  }
  return out;
}

/**
 * Counts how often this spread's tab has been opened.
 *
 * Screens stay mounted once visited (App.tsx keeps them, hidden with `display: none`),
 * so "the Plan tab was opened again" is not a mount — it is the surrounding `.screen`
 * gaining `is-active`. Watching that class beats an IntersectionObserver here, which
 * would also fire on merely scrolling the stacks back into view.
 */
function useTabEntries(ref: React.RefObject<HTMLElement | null>): number {
  const [visits, setVisits] = useState(0);

  useEffect(() => {
    const screen = ref.current?.closest('.screen');
    if (!screen) return;
    let wasActive = screen.classList.contains('is-active');
    const mo = new MutationObserver(() => {
      const active = screen.classList.contains('is-active');
      if (active && !wasActive) setVisits((v) => v + 1);
      wasActive = active;
    });
    mo.observe(screen, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [ref]);

  return visits;
}

/* ---------------- one chip's motion, as CSS ---------------- */

/** The numbers styles.css animates with, handed over from the one place they live. */
function motionVars(drop: number): React.CSSProperties {
  return {
    ['--drop' as string]: `${drop}px`,
    ['--fall' as string]: `${DROP_IN_MS}ms`,
    ['--lift' as string]: `${DROP_OUT_MS}ms`,
  };
}

/**
 * Remounting is what restarts an animation: React keeps the same element for the same
 * key, and re-setting a delay on an element already carrying that animation does
 * nothing. So a chip's key carries what it is currently doing — a chip that starts
 * falling, or takes a fresh knock, comes back as a new element and moves.
 */
function discKey(m: DiscMotion): string {
  return `${m.i}:${m.state}:${m.impactAt ?? 'still'}`;
}

function discClass(m: DiscMotion): string {
  if (m.state === 'idle') return `stack-disc${m.impactAt === null ? '' : ' struck'}`;
  return `stack-disc ${m.state}`;
}

/** Resting angle and side-shift, plus where the chip turns in from while it falls. */
function discStyle(m: DiscMotion, size: number): React.CSSProperties {
  const tilt = chipTilt(m.i);
  return {
    ['--tilt' as string]: `${tilt.deg.toFixed(2)}deg`,
    ['--shift' as string]: `${((tilt.shift * size) / 58).toFixed(2)}px`,
    ['--tilt-from' as string]: `${(tilt.deg * -2.1).toFixed(2)}deg`,
    animationDelay: `${m.delay}ms`,
  };
}

/** The knock: when it arrives, how hard it shoves, how much it squashes. */
function hitStyle(m: DiscMotion, size: number): React.CSSProperties {
  if (m.impactAt === null) return {};
  const { jolt, squash } = impactStrength(m.depth, size);
  return {
    ['--jolt' as string]: `${jolt}px`,
    ['--squash' as string]: squash,
    animationDelay: `${m.impactAt}ms`,
  };
}

/* ---------------- vector layers ---------------- */

/** Vector chip geometry, in the 100-wide viewBox every disc is drawn in. */
const RX = 49;
const RY = 14;
const PER_CHIP = 6.5;
const TOP_CY = RY + 1.5;
const DISC_VH = TOP_CY + PER_CHIP + RY + 2;

/**
 * The drawn (non-3D) pile, built the same way: one small SVG per chip, offset by a
 * chip's thickness, so the same drop animation applies to both chip looks.
 */
function VectorColumn({
  d,
  motions,
  count,
  size,
  drop,
  label,
  ghost = false,
}: {
  d: Denomination;
  motions: DiscMotion[];
  count: number;
  size: number;
  drop: number;
  label: string;
  /** Standing in for a rendered chip that has not arrived — draw a shadow, not a
   *  second chip design. */
  ghost?: boolean;
}) {
  const pitch = (size * PER_CHIP) / 100;
  const discH = (size * DISC_VH) / 100;
  const pileH = Math.max(discH, (Math.max(1, count) - 1) * pitch + discH);
  const moving = new Set(motions.filter((x) => x.state !== 'idle').map((x) => x.i));

  return (
    <div
      className={`stack-layers vector${ghost ? ' is-ghost' : ''}`}
      role="img"
      aria-label={label}
      style={{ width: size, height: pileH, ...motionVars(drop) }}
    >
      {motions.map((m) => (
        <div
          key={discKey(m)}
          className={discClass(m)}
          style={{ ...discStyle(m, size), bottom: m.i * pitch, height: discH }}
        >
          <div className="stack-disc-hit" style={hitStyle(m, size)}>
            <VectorDisc
              d={d}
              size={size}
              showFace={!ghost && (m.i >= count - 1 || moving.has(m.i + 1) || moving.has(m.i))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A single chip of the drawn stack: a slab of ceramic rim with a seam under it, and
 * the face on top. Faces that are buried under another chip are skipped — until the
 * chip above lifts off and shows them.
 */
function VectorDisc({ d, size, showFace }: { d: Denomination; size: number; showFace: boolean }) {
  const base = d.color;
  const accent = d.accent;
  const light = shade(base, 0.18);
  const dark = shade(base, -0.3);
  const edge = shade(base, -0.5);
  const id = `sd-${d.id}`;
  const digits = String(d.value).length;
  const fontSize = digits >= 4 ? 9 : digits === 3 ? 11 : 13;
  const medRx = digits >= 4 ? 18 : digits === 3 ? 15 : 12;
  const ink = isLightColor(base) ? '#2a2205' : '#ffffff';
  const bottomCy = TOP_CY + PER_CHIP;

  return (
    <svg
      width={size}
      height={(size * DISC_VH) / 100}
      viewBox={`0 0 100 ${DISC_VH}`}
      className="chip-stack-svg"
      aria-hidden="true"
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

      {/* rim slab: one chip's thickness */}
      <path
        d={`M1 ${TOP_CY} L1 ${bottomCy} A ${RX} ${RY} 0 0 0 99 ${bottomCy} L99 ${TOP_CY} A ${RX} ${RY} 0 0 1 1 ${TOP_CY} Z`}
        fill={`url(#${id}-body)`}
      />
      {/* seam under the slab — a dark groove with a lit edge, so a pile still reads
          as separate discs on a smooth (spotless) ceramic rim */}
      <path d={`M1 ${bottomCy} A ${RX} ${RY} 0 0 0 99 ${bottomCy}`} fill="none" stroke={edge} strokeWidth="0.7" opacity="0.7" />
      <path d={`M1 ${bottomCy + 0.9} A ${RX} ${RY} 0 0 0 99 ${bottomCy + 0.9}`} fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.13" />
      {/* soft vertical highlight */}
      <path d={`M32 ${TOP_CY} L32 ${bottomCy}`} stroke="#fff" strokeWidth="6" opacity="0.07" strokeLinecap="round" />

      {showFace && (
        <>
          <ellipse cx={50} cy={TOP_CY} rx={RX} ry={RY} fill={`url(#${id}-face)`} stroke={shade(base, -0.26)} strokeWidth="1" />
          {/* art-deco gold lattice, perspective-projected onto the ellipse */}
          <g transform={`translate(50 ${TOP_CY}) scale(1 ${RY / RX})`} fill="none" stroke={accent} strokeLinejoin="round">
            <polygon points={octa0(RX * 0.9)} strokeWidth="1" opacity="0.82" vectorEffect="non-scaling-stroke" />
            <polygon points={octa0(RX * 0.78)} strokeWidth="0.6" opacity="0.45" vectorEffect="non-scaling-stroke" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * RX * 0.46}
                  y1={Math.sin(a) * RX * 0.46}
                  x2={Math.cos(a) * RX * 0.86}
                  y2={Math.sin(a) * RX * 0.86}
                  strokeWidth="0.7"
                  opacity="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <polygon points={octa0(RX * 0.46)} strokeWidth="0.7" opacity="0.7" vectorEffect="non-scaling-stroke" />
          </g>
          {/* centre cartouche + value (upright for legibility) */}
          <ellipse cx={50} cy={TOP_CY} rx={medRx} ry={RY * 0.74} fill={shade(base, -0.22)} stroke={accent} strokeWidth="0.7" />
          <text
            x={50}
            y={TOP_CY}
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
        </>
      )}
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

/* Memoised because of the big screen: TV mode repaints once a second for the
   countdown, and a spread of eight piles is ~90 positioned elements with a 3D bitmap
   each. Nothing in here changes with the clock, so with the props held steady
   upstream (`startStack`, the handout result — both `useMemo`d) it simply does not
   run on a tick. Every other caller passes stable props too, so this costs nothing
   anywhere else. */
export default memo(ChipStackViz);
