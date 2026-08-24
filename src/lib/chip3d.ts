/**
 * The 3D chip: real geometry from the design export, rendered to a bitmap once and
 * then reused.
 *
 * A chip is a static object — nothing about it moves — so keeping a live WebGL
 * canvas per chip would burn a context (and a frame budget) for a picture that never
 * changes. Instead ONE renderer draws a chip into an offscreen canvas, the result is
 * cached as a data URL keyed by colour + size + height, and every `<Chip>` on screen
 * is an `<img>`. The TV legend showing nine chips costs nine cache lookups.
 *
 * three.js and the model are loaded on first use only, so a device left on the
 * vector chips never downloads either.
 *
 * The model carries no value glyphs — the number is drawn over the bitmap in HTML by
 * the component, so any denomination works and the text stays crisp and translatable.
 */
import type * as THREE from 'three';

/** Where the slimmed model lives (scripts/slim-chip-glb.mjs writes it). */
const MODEL_URL = `${import.meta.env.BASE_URL}models/chip.glb`;

/** Material names as they come out of the export. */
const MAT_CERAMIC = 'ceramic_clay';
const MAT_GOLD = 'gold_foil';
const MAT_PLAQUE = 'ceramic_dark_plaque';

export type ChipView = 'face' | 'stack';

export interface ChipRenderRequest {
  /** Chip body colour (hex, as stored on the denomination). */
  color: string;
  /** Lattice / rim colour (hex). */
  accent: string;
  /** CSS pixel width of the resulting image. */
  size: number;
  /** How many discs to stack. 1 = a single chip; only used by the 'stack' view. */
  discs?: number;
  /**
   * Stack view: draw ONLY this disc (0 = bottom) instead of the whole pile, while
   * still framing the shot for a `discs`-high stack. Every layer of one pile is then
   * the same bitmap size seen through the same camera, so laying them on top of each
   * other rebuilds the stack pixel-for-pixel — and any one of them can be moved on
   * its own, which is what makes a chip able to fall onto the pile.
   */
  layer?: number;
  view: ChipView;
  /** Device pixel ratio to render at (capped, so a 4x phone doesn't melt). */
  dpr?: number;
}

/** Thickness of one chip in model units (metres) — 3.4 mm, straight from the export. */
const DISC_THICKNESS = 0.0034;
const CHIP_RADIUS = 0.0195;

interface Loaded {
  three: typeof THREE;
  chip: THREE.Object3D;
}

/** Pre-filtered room lighting, built once — what makes the gold read as metal. */
let environment: THREE.Texture | null = null;

let loading: Promise<Loaded> | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;

/** Cache: key -> finished render. Bounded by MAX_CACHE entries. */
const cache = new Map<string, ChipRender>();
/** A stack is now one entry per chip: eight denominations, eleven discs each, at the
 *  Plan and Table sizes, is already ~176 pictures — a cache that evicted them would
 *  re-render the same pile on every slider step. */
const MAX_CACHE = 260;

const keyOf = (r: ChipRenderRequest, dpr: number) =>
  `${r.view}|${r.color}|${r.accent}|${Math.round(r.size)}|${r.view === 'stack' ? r.discs ?? 1 : 1}|${
    r.view === 'stack' ? r.layer ?? 'all' : 'all'
  }|${dpr}`;

/** Is a 3D chip possible at all on this device? Cheap enough to call per component. */
export function chip3dSupported(): boolean {
  if (rendererFailed) return false;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

async function load(): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      const three = await import('three');
      const [{ GLTFLoader }, { RoomEnvironment }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/environments/RoomEnvironment.js'),
      ]);
      const pmrem = new three.PMREMGenerator(getRenderer(three));
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      const chip = gltf.scene;
      // The export leaves the chip lying in the x/z plane with its base at y = 0.
      chip.updateMatrixWorld(true);
      return { three, chip };
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

function getRenderer(three: typeof THREE): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new three.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    // ACES desaturates hard, and a chip is nothing but its colour: the neutral
    // curve keeps a green chip green instead of turning it mint.
    renderer.toneMapping = three.NeutralToneMapping;
    renderer.toneMappingExposure = 0.55;
  }
  return renderer;
}

/** Darken a hex colour — the plaque sits in a recess, so it reads a shade under the body. */
function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = [0, 2, 4].map((i) => Math.round(parseInt(n.slice(i, i + 2), 16) * (1 - amount)));
  return `#${v.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Clone the model and paint it in one denomination's colours. */
function tinted(three: typeof THREE, template: THREE.Object3D, color: string, accent: string): THREE.Object3D {
  const chip = template.clone(true);
  chip.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const name = source?.name ?? '';
    const mat = new three.MeshStandardMaterial();
    if (name.startsWith(MAT_GOLD)) {
      // Foil: metal enough to catch the room, not so much it goes black off-axis.
      mat.color = new three.Color(accent);
      mat.metalness = 0.62;
      mat.roughness = 0.26;
      mat.envMapIntensity = 0.8;
    } else if (name.startsWith(MAT_PLAQUE)) {
      mat.color = new three.Color(darken(color, 0.34));
      mat.metalness = 0.04;
      mat.roughness = 0.5;
      mat.envMapIntensity = 0.2;
    } else if (name.startsWith(MAT_CERAMIC)) {
      // Matte ceramic — a soft sheen, no plastic highlight.
      mat.color = new three.Color(color);
      mat.metalness = 0.02;
      mat.roughness = 0.62;
      mat.envMapIntensity = 0.22;
    } else {
      mat.color = new three.Color(color);
      mat.roughness = 0.8;
    }
    mesh.material = mat;
  });
  return chip;
}

function buildScene(three: typeof THREE, template: THREE.Object3D, req: ChipRenderRequest) {
  const scene = new three.Scene();
  const discs = req.view === 'stack' ? Math.max(1, req.discs ?? 1) : 1;

  const group = new three.Group();
  const first = req.view === 'stack' && req.layer !== undefined ? Math.max(0, Math.min(discs - 1, req.layer)) : 0;
  const last = req.view === 'stack' && req.layer !== undefined ? first : discs - 1;
  for (let i = first; i <= last; i++) {
    const disc = tinted(three, template, req.color, req.accent);
    disc.position.y = i * DISC_THICKNESS;
    // A hand-made stack never lines up perfectly; a degree of rotation per chip
    // keeps a tall column from looking like one extruded cylinder.
    disc.rotation.y = (i * 13 * Math.PI) / 180;
    group.add(disc);
  }
  scene.add(group);

  const stackHeight = discs * DISC_THICKNESS;

  // Room reflections do most of the work; the two lights only shape it — a warm key
  // high on the left, a cool rim behind, so the rim of a stack separates from its face.
  if (environment) scene.environment = environment;
  const key = new three.DirectionalLight(0xfff8ee, 1.15);
  key.position.set(-0.7, 1.4, 0.75);
  scene.add(key);
  const rim = new three.DirectionalLight(0x9fc4ff, 0.45);
  rim.position.set(1.15, 0.35, -0.95);
  scene.add(rim);
  scene.add(new three.AmbientLight(0xffffff, 0.05));

  const camera = new three.PerspectiveCamera(24, 1, 0.001, 5);
  const centre = stackHeight / 2;
  if (req.view === 'face') {
    // Not quite straight down: a few degrees of tilt catch the rim and the raised
    // lattice, which is the whole point of using the model instead of a flat drawing.
    camera.position.set(0.008, 0.16, 0.026);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, stackHeight * 0.5, 0);
  } else {
    // Three-quarter table view: back off as the pile grows so a tall stack still fits
    // without the perspective going wide-angle.
    const dist = 0.11 + stackHeight * 1.5;
    camera.position.set(dist * 0.40, centre + dist * 0.52, dist * 0.76);
    camera.lookAt(0, centre, 0);
  }
  const frame = fitFrame(three, camera, stackHeight);
  // Where the value belongs: on top of the pile normally, on top of THIS disc when
  // only one layer is being drawn.
  const faceHeight = req.view === 'stack' && req.layer !== undefined ? (first + 1) * DISC_THICKNESS : stackHeight;
  return { scene, camera, stackHeight, faceHeight, frame };
}

/**
 * Point the camera's frustum at exactly what is there: sample the chip's silhouette
 * (a ring top and bottom), measure how far it reaches in camera space, and hand back
 * the field of view and bitmap shape that hold it with a hair of margin.
 *
 * Guessing these numbers instead — the old `0.62 + 0.115 × discs` — left a stack
 * floating in dead space that grew with every disc.
 */
function fitFrame(three: typeof THREE, camera: THREE.PerspectiveCamera, stackHeight: number) {
  camera.updateMatrixWorld(true);
  const inv = camera.matrixWorldInverse;
  let halfTanX = 0;
  let halfTanY = 0;
  const point = new three.Vector3();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const y of [0, stackHeight]) {
      point.set(Math.cos(a) * CHIP_RADIUS, y, Math.sin(a) * CHIP_RADIUS).applyMatrix4(inv);
      const depth = Math.max(1e-6, -point.z);
      halfTanX = Math.max(halfTanX, Math.abs(point.x) / depth);
      halfTanY = Math.max(halfTanY, Math.abs(point.y) / depth);
    }
  }
  const margin = 1.04;
  halfTanX *= margin;
  halfTanY *= margin;
  return {
    fov: (2 * Math.atan(halfTanY) * 180) / Math.PI,
    aspect: halfTanX / halfTanY,
    /** Bitmap height as a fraction of its width. */
    heightRatio: halfTanY / halfTanX,
  };
}

/** Where the value text goes, worked out from the same camera that drew the chip. */
export interface ChipLabelSpot {
  /** Centre of the top face, as a fraction of the bitmap's width / height. */
  x: number;
  y: number;
  /** How much the face is foreshortened (1 = seen straight on). */
  squash: number;
  /** Diameter of the top face across the bitmap's width. */
  widthFraction: number;
  /**
   * Highest point of ink on this face (its back edge), as a fraction of the bitmap's
   * height. A layer's bitmap is framed for the whole pile, so this is what says how
   * much of that frame a stack of this height actually fills.
   */
  topFraction: number;
}

export interface ChipRender {
  url: string;
  /** CSS size the bitmap should be drawn at — the frame is fitted to the model. */
  width: number;
  height: number;
  label: ChipLabelSpot;
  /**
   * Single-layer renders only: the shot is framed for the whole pile, but the bitmap
   * is cut down to the band this one chip occupies — a pile of eleven would otherwise
   * hold eleven copies of the same mostly-empty frame in memory. `frameHeight` is the
   * full frame it was cut from and `offsetTop` how far down the cut starts, both in
   * CSS pixels, which is all the caller needs to put the chip back where it belongs.
   */
  frameHeight?: number;
  offsetTop?: number;
}

/**
 * Render one chip (or stack) and return its bitmap plus where the value belongs.
 * Repeated calls with the same colours and size hand back the cache without touching
 * the GPU.
 */
export async function renderChip(req: ChipRenderRequest): Promise<ChipRender> {
  const dpr = Math.min(req.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1, 2.5);
  const key = keyOf(req, dpr);
  const hit = cache.get(key);
  if (hit) {
    // refresh recency
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const { three, chip } = await load();
  const renderer = getRenderer(three);

  const { scene, camera, faceHeight, frame } = buildScene(three, chip, req);
  const cssWidth = req.size;
  const cssHeight = req.size * frame.heightRatio;
  const w = Math.max(16, Math.round(cssWidth * dpr));
  const h = Math.max(16, Math.round(cssHeight * dpr));

  camera.aspect = frame.aspect;
  camera.fov = frame.fov;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  const label = labelSpot(three, camera, faceHeight);

  // A single layer keeps only its own band of the frame; everything else is a whole
  // picture already.
  const band = req.view === 'stack' && req.layer !== undefined ? discBand(three, camera, req.layer, h, dpr) : null;
  const url = band ? crop(renderer.domElement, w, band.y0, band.y1) : renderer.domElement.toDataURL('image/png');

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });

  const render: ChipRender = band
    ? {
        url,
        width: cssWidth,
        height: (band.y1 - band.y0) / dpr,
        // The value sits at the same place on the chip; say where that is inside the
        // piece that was kept, not inside the frame it came from.
        label: { ...label, y: (label.y * h - band.y0) / (band.y1 - band.y0) },
        frameHeight: cssHeight,
        offsetTop: band.y0 / dpr,
      }
    : { url, width: cssWidth, height: cssHeight, label };
  cache.set(key, render);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return render;
}

/**
 * The rows of the frame one disc actually covers: sample the rings at its base and at
 * its top, take the highest and lowest pixel they project to, and add a couple of
 * pixels for the bevel and the antialiased edge.
 */
function discBand(three: typeof THREE, camera: THREE.PerspectiveCamera, layer: number, h: number, dpr: number) {
  const point = new three.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const y of [layer * DISC_THICKNESS, (layer + 1) * DISC_THICKNESS]) {
      point.set(Math.cos(a) * CHIP_RADIUS, y, Math.sin(a) * CHIP_RADIUS).project(camera);
      const py = ((1 - point.y) / 2) * h;
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  }
  const pad = Math.ceil(2 * dpr);
  const y0 = Math.max(0, Math.floor(minY) - pad);
  const y1 = Math.min(h, Math.ceil(maxY) + pad);
  return { y0, y1: Math.max(y0 + 1, y1) };
}

/** Cut rows [y0, y1) out of the rendered canvas and hand back a PNG of just those. */
function crop(source: HTMLCanvasElement, w: number, y0: number, y1: number): string {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = y1 - y0;
  const ctx = out.getContext('2d');
  if (!ctx) return source.toDataURL('image/png');
  ctx.drawImage(source, 0, y0, w, y1 - y0, 0, 0, w, y1 - y0);
  return out.toDataURL('image/png');
}

/**
 * Project the top face through the render camera: its centre gives the anchor for the
 * value text, and the ratio between its projected axes gives the squash to apply so
 * the number lies on the chip instead of floating upright above it.
 */
function labelSpot(three: typeof THREE, camera: THREE.PerspectiveCamera, stackHeight: number): ChipLabelSpot {
  const toScreen = (x: number, y: number, z: number) => {
    const v = new three.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  };
  const centre = toScreen(0, stackHeight, 0);
  const right = toScreen(CHIP_RADIUS, stackHeight, 0);
  const front = toScreen(0, stackHeight, CHIP_RADIUS);
  const back = toScreen(0, stackHeight, -CHIP_RADIUS);
  const halfWidth = Math.hypot(right.x - centre.x, right.y - centre.y);
  const halfDepth = Math.hypot(front.x - centre.x, front.y - centre.y);
  return {
    x: centre.x,
    y: centre.y,
    squash: halfWidth > 0 ? Math.min(1, halfDepth / halfWidth) : 1,
    widthFraction: halfWidth * 2,
    topFraction: Math.max(0, Math.min(1, back.y)),
  };
}

/** Drop every cached bitmap — used when the user turns the 3D chips off. */
export function clearChipCache() {
  cache.clear();
}
