import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { Denomination } from '../../types';
import ChipStackViz from '../ChipStackViz';
import Chip from '../Chip';
import type { ChipCanvasProps } from './ChipCanvas';

// three/r3f live in their own lazily-loaded chunk — the main bundle (and the
// APK/PWA startup) stays small; the 3D only downloads when a 3D view mounts.
const ChipCanvas = lazy(() => import('./ChipCanvas'));

/** Renders the SVG fallback if the 3D chunk fails or WebGL is unavailable. */
class Canvas3DBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function Lazy3D({ fallback, ...props }: ChipCanvasProps & { fallback: ReactNode }) {
  return (
    <Canvas3DBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <ChipCanvas {...props} />
      </Suspense>
    </Canvas3DBoundary>
  );
}

interface StacksProps {
  denoms: Denomination[];
  counts: Record<string, number>;
  maxDiscs?: number;
}

/** True-3D live preview of the chip stacks; SVG stacks while it loads / on error. */
export function Chip3DStacks({ denoms, counts, maxDiscs = 12 }: StacksProps) {
  const svg = <ChipStackViz denoms={denoms} counts={counts} maxDiscs={Math.min(maxDiscs, 11)} />;
  if (denoms.filter((d) => counts[d.id] > 0).length === 0) return svg;
  return (
    <div className="chip3d-wrap chip3d-stacks">
      <Lazy3D mode="stacks" denoms={denoms} counts={counts} maxDiscs={maxDiscs} fallback={<div className="chip3d-fallback">{svg}</div>} />
    </div>
  );
}

/** A single rotatable ceramic chip; large SVG chip while it loads / on error. */
export function Chip3DShowcase({ denom }: { denom: Denomination }) {
  const svg = (
    <div className="chip3d-fallback">
      <Chip value={denom.value} color={denom.color} accent={denom.accent} size={180} shape={denom.shape} />
    </div>
  );
  return (
    <div className="chip3d-wrap chip3d-showcase">
      <Lazy3D mode="showcase" denom={denom} fallback={svg} />
    </div>
  );
}
