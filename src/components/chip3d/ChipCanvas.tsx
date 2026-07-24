import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import type { Denomination } from '../../types';
import { faceTexture } from './faceTexture';

const CHIP_H = 0.16;
const RADIUS = 1;
const SPACING = 2.25;

const geometry = new THREE.CylinderGeometry(RADIUS, RADIUS, CHIP_H, 64, 1);

interface DenomMats {
  side: THREE.Material;
  cap: THREE.Material;
}
const matCache = new Map<string, DenomMats>();

function denomMaterials(d: Denomination): DenomMats {
  const key = `${d.value}|${d.color}|${d.accent}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  // matte ceramic: high roughness, zero metalness — no glossy hotspots
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), roughness: 0.92, metalness: 0 });
  const cap = new THREE.MeshStandardMaterial({ map: faceTexture(d.color, d.accent, d.value), roughness: 0.86, metalness: 0 });
  const mats = { side, cap };
  matCache.set(key, mats);
  return mats;
}

/** One chip mesh. materials = [side, top, bottom] per CylinderGeometry groups. */
function ChipMesh({ d, y, spin }: { d: Denomination; y: number; spin: number }) {
  const { side, cap } = denomMaterials(d);
  const mats = useMemo(() => [side, cap, cap], [side, cap]);
  return <mesh geometry={geometry} material={mats} position={[0, y, 0]} rotation={[0, spin, 0]} />;
}

/** A plaque denomination rendered as a rounded tile with the face on top. */
function PlaqueTile({ d }: { d: Denomination }) {
  const { cap } = denomMaterials(d);
  return (
    <RoundedBox args={[2.6, CHIP_H * 1.6, 1.6]} radius={0.1} smoothness={4} material={cap} position={[0, CHIP_H * 0.8, 0]} />
  );
}

/** A single denomination as a stacked cylinder of chips (or a plaque tile). */
function Stack({ d, visible }: { d: Denomination; visible: number }) {
  if (d.shape === 'plaque') return <PlaqueTile d={d} />;
  return (
    <group>
      {Array.from({ length: visible }).map((_, i) => (
        <ChipMesh key={i} d={d} y={CHIP_H / 2 + i * CHIP_H} spin={((i * 37) % 12) * (Math.PI / 180) - 0.1} />
      ))}
    </group>
  );
}

/**
 * Frames a wide row of stacks to fill the viewport: fits by width (and by
 * height for tall stacks), so chips get as big as the space allows and scale
 * down only as more denominations are shown. Re-runs on resize.
 */
function FitCamera({ contentW, contentH }: { contentW: number; contentH: number }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!width || !height) return;
    const aspect = width / height;
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const margin = 1.1;
    const distW = contentW / 2 / Math.tan(hFov / 2);
    const distH = contentH / 2 / Math.tan(vFov / 2);
    const dist = Math.max(distW, distH) * margin;
    const elev = (20 * Math.PI) / 180;
    const cy = contentH * 0.42;
    cam.position.set(0, cy + Math.sin(elev) * dist, Math.cos(elev) * dist);
    cam.lookAt(0, cy, 0);
    cam.near = 0.1;
    cam.far = dist * 4;
    cam.updateProjectionMatrix();
  }, [camera, width, height, contentW, contentH]);
  return null;
}

/** Live-preview scene: one stack per denom, framed to fill the viewport. */
function StacksScene({ denoms, counts, maxDiscs }: { denoms: Denomination[]; counts: Record<string, number>; maxDiscs: number }) {
  const used = denoms.filter((d) => counts[d.id] > 0);
  const n = used.length;
  const maxVisible = used.reduce((m, d) => Math.max(m, Math.min(counts[d.id], maxDiscs)), 1);
  const contentW = (n - 1) * SPACING + 2 * RADIUS;
  const contentH = maxVisible * CHIP_H + RADIUS * 0.9;
  return (
    <>
      <FitCamera contentW={contentW} contentH={contentH} />
      {used.map((d, i) => {
        const total = counts[d.id];
        const visible = Math.min(total, maxDiscs);
        const x = (i - (n - 1) / 2) * SPACING;
        return (
          <group key={d.id} position={[x, 0, 0]}>
            <Stack d={d} visible={visible} />
            <Html position={[0, -RADIUS * 0.35, 0]} center distanceFactor={contentW * 0.85} className="chip3d-cap" prepend>
              ×{total}
            </Html>
          </group>
        );
      })}
    </>
  );
}

/** Single rotatable chip for the showcase. */
function ShowcaseChip({ denom }: { denom: Denomination }) {
  const { side, cap } = denomMaterials(denom);
  const mats = useMemo(() => [side, cap, cap], [side, cap]);
  // lay the chip "standing" so the face points at the camera; OrbitControls auto-rotates.
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry} material={mats} />
    </group>
  );
}

function Lights() {
  // soft, even lighting for a matte ceramic read (no bright specular spot)
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 6, 5]} intensity={0.7} />
      <directionalLight position={[-4, 2, -3]} intensity={0.28} />
    </>
  );
}

export interface ChipCanvasProps {
  mode: 'stacks' | 'showcase';
  denoms?: Denomination[];
  counts?: Record<string, number>;
  maxDiscs?: number;
  denom?: Denomination;
  className?: string;
}

export default function ChipCanvas({ mode, denoms = [], counts = {}, maxDiscs = 12, denom, className }: ChipCanvasProps) {
  if (mode === 'showcase' && !denom) return null;
  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: mode === 'showcase' ? [0, 0.6, 4.2] : [0, 2.6, 7], fov: 30 }}
    >
      <Lights />
      {mode === 'stacks' ? (
        <StacksScene denoms={denoms} counts={counts} maxDiscs={maxDiscs} />
      ) : (
        <>
          <ShowcaseChip denom={denom!} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={2.4}
            minPolarAngle={Math.PI / 2.6}
            maxPolarAngle={Math.PI / 1.7}
          />
        </>
      )}
    </Canvas>
  );
}
