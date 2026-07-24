import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Bounds, Html, OrbitControls, RoundedBox } from '@react-three/drei';
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
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), roughness: 0.62, metalness: 0.04 });
  const cap = new THREE.MeshStandardMaterial({ map: faceTexture(d.color, d.accent, d.value), roughness: 0.5, metalness: 0.08 });
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

/** Live-preview scene: one stack per denom, auto-fit to the viewport. */
function StacksScene({ denoms, counts, maxDiscs }: { denoms: Denomination[]; counts: Record<string, number>; maxDiscs: number }) {
  const used = denoms.filter((d) => counts[d.id] > 0);
  const n = used.length;
  return (
    <Bounds fit clip observe margin={1.15}>
      {used.map((d, i) => {
        const total = counts[d.id];
        const visible = Math.min(total, maxDiscs);
        const x = (i - (n - 1) / 2) * SPACING;
        return (
          <group key={d.id} position={[x, 0, 0]}>
            <Stack d={d} visible={visible} />
            <Html position={[0, -0.5, 0]} center distanceFactor={12} className="chip3d-cap" prepend>
              ×{total}
            </Html>
          </group>
        );
      })}
    </Bounds>
  );
}

/** Single rotatable chip for the showcase. */
function ShowcaseChip({ denom }: { denom: Denomination }) {
  const { side, cap } = denomMaterials(denom);
  const mats = useMemo(() => [side, cap, cap], [side, cap]);
  // lay the chip "standing" so the face points at the camera; OrbitControls auto-rotates.
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry} material={mats} castShadow />
    </group>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 8, 6]} intensity={1.25} />
      <directionalLight position={[-5, 3, -4]} intensity={0.4} />
      <pointLight position={[0, 2, 5]} intensity={0.5} />
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
