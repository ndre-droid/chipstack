/**
 * Slims the exported chip model down to something an app can ship.
 *
 * The design export is a stack of eight identical chips (4.9 MB), each carrying a
 * `denomination_value` mesh whose glyphs are mirrored and frozen at "50". The app
 * draws its own value text on top and repeats one chip to build a stack, so all we
 * need is a single chip without the number: ceramic body, gold lattice, plaque.
 *
 * Keeps only the first `chip` subtree, drops the value meshes, garbage-collects the
 * accessors and buffer views nothing points at any more, and re-seats the chip so its
 * base sits at y = 0 (the renderer stacks upwards from there).
 *
 *   node scripts/slim-chip-glb.mjs "3D chip design/slowplay-chip.glb" public/models/chip.glb
 */
import fs from 'node:fs';
import path from 'node:path';

const IN = process.argv[2] ?? '3D chip design/slowplay-chip.glb';
const OUT = process.argv[3] ?? 'public/models/chip.glb';
const DROP = /^denomination_value$/;

const src = fs.readFileSync(IN);
if (src.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${IN} is not a .glb`);

const jsonLen = src.readUInt32LE(12);
const gltf = JSON.parse(src.toString('utf8', 20, 20 + jsonLen));
const binLen = src.readUInt32LE(20 + jsonLen);
const bin = src.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen);

// ── pick the subtree: first node named `chip`, minus the value meshes ────────
const firstChip = gltf.nodes.findIndex((n) => n.name === 'chip');
if (firstChip < 0) throw new Error('no node named `chip` in the model');

const keptNodes = [];
const nodeMap = new Map(); // old index -> new index

function keep(oldIndex) {
  const node = gltf.nodes[oldIndex];
  if (node.name && DROP.test(node.name)) return null;
  const newIndex = keptNodes.length;
  const copy = { ...node };
  keptNodes.push(copy);
  nodeMap.set(oldIndex, newIndex);
  copy.children = (node.children ?? []).map(keep).filter((c) => c !== null);
  if (copy.children.length === 0) delete copy.children;
  return newIndex;
}
keep(firstChip);

// ── re-point meshes, then materials, then accessors, then buffer views ──────
const meshMap = new Map();
const keptMeshes = [];
for (const node of keptNodes) {
  if (node.mesh === undefined) continue;
  if (!meshMap.has(node.mesh)) {
    meshMap.set(node.mesh, keptMeshes.length);
    keptMeshes.push(structuredClone(gltf.meshes[node.mesh]));
  }
  node.mesh = meshMap.get(node.mesh);
}

const materialMap = new Map();
const keptMaterials = [];
const accessorMap = new Map();
const keptAccessors = [];

const takeAccessor = (old) => {
  if (!accessorMap.has(old)) {
    accessorMap.set(old, keptAccessors.length);
    keptAccessors.push(structuredClone(gltf.accessors[old]));
  }
  return accessorMap.get(old);
};

for (const mesh of keptMeshes) {
  for (const prim of mesh.primitives) {
    for (const [attr, acc] of Object.entries(prim.attributes)) prim.attributes[attr] = takeAccessor(acc);
    if (prim.indices !== undefined) prim.indices = takeAccessor(prim.indices);
    if (prim.material !== undefined) {
      if (!materialMap.has(prim.material)) {
        materialMap.set(prim.material, keptMaterials.length);
        keptMaterials.push(structuredClone(gltf.materials[prim.material]));
      }
      prim.material = materialMap.get(prim.material);
    }
  }
}

// ── copy just the bytes the kept accessors read ─────────────────────────────
const chunks = [];
let offset = 0;
const keptViews = [];
const viewMap = new Map();

for (const acc of keptAccessors) {
  if (acc.bufferView === undefined) continue;
  const key = acc.bufferView;
  if (!viewMap.has(key)) {
    const view = gltf.bufferViews[key];
    const start = view.byteOffset ?? 0;
    const bytes = bin.subarray(start, start + view.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    const copy = { buffer: 0, byteOffset: offset, byteLength: view.byteLength };
    if (view.byteStride !== undefined) copy.byteStride = view.byteStride;
    if (view.target !== undefined) copy.target = view.target;
    viewMap.set(key, keptViews.length);
    keptViews.push(copy);
    chunks.push(bytes);
    offset += view.byteLength;
  }
  acc.bufferView = viewMap.get(key);
}

// ── re-seat: base of the chip at y = 0, centred on x/z ──────────────────────
let lo = [Infinity, Infinity, Infinity];
let hi = [-Infinity, -Infinity, -Infinity];
for (const mesh of keptMeshes) {
  for (const prim of mesh.primitives) {
    const acc = keptAccessors[prim.attributes.POSITION];
    if (!acc?.min) continue;
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], acc.min[k]);
      hi[k] = Math.max(hi[k], acc.max[k]);
    }
  }
}
const root = keptNodes[0];
root.translation = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2];
root.name = 'chip';

const out = {
  asset: { version: '2.0', generator: 'ChipStack slim-chip-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: keptNodes,
  meshes: keptMeshes,
  materials: keptMaterials,
  accessors: keptAccessors,
  bufferViews: keptViews,
  buffers: [{ byteLength: offset }],
};

const binOut = Buffer.concat(chunks);
const jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
const binPad = Buffer.alloc((4 - (binOut.length % 4)) % 4, 0);

const chunkOf = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(body.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, body]);
};
const jsonChunk = chunkOf('JSON', Buffer.concat([jsonBuf, jsonPad]));
const binChunk = chunkOf('BIN\0', Buffer.concat([binOut, binPad]));
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + jsonChunk.length + binChunk.length, 8);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, jsonChunk, binChunk]));

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `${OUT}  ${kb(fs.statSync(OUT).size)} (from ${kb(src.length)})\n` +
  `  nodes ${keptNodes.length}  meshes ${keptMeshes.length}  materials ${keptMaterials.map((m) => m.name).join(', ')}\n` +
  `  size  ${((hi[0] - lo[0]) * 1000).toFixed(1)} × ${((hi[1] - lo[1]) * 1000).toFixed(1)} mm (Ø × thickness)`
);
