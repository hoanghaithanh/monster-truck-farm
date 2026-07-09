// Regenerates the truck body/wheel/engine-cue/gas-cue .glb models used by
// ADR 0011 (`docs/architecture/0011-truck-model-and-cosmetic-variants.md`).
//
// Scope note (disclosed, not hidden): this project has no web-browsing tool
// available to source a real CC0 art pack this sprint, so — following the
// exact precedent already established by
// `scripts/generate-test-fixture-glb.mjs` (ADR 0010) — these are procedurally
// authored low-poly primitives composed in Three.js and exported to real
// .glb files via GLTFExporter, not hand-drawn/sourced art. They are
// placeholder-grade but real, loadable, distinct-per-tier assets that
// exercise the full AssetRegistry/buildTruckRig pipeline end-to-end. A real
// CC0 pack can swap in later (see docs/backlog.md follow-up) without any
// pipeline changes -- only these files and render/assets/manifest.ts would
// need to change.
//
// Every part is authored centered on its own local origin at scale 1:1 in
// world units; render/truck-sockets.ts positions/orients the loaded clone at
// assembly time (never baked into the model itself), except wheel rotation
// (baked here, since "which way does a cylinder's axis point" is intrinsic
// to the model, not a placement decision).
//
// Run with: node scripts/generate-truck-art.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdirSync, writeFileSync } from 'node:fs';

// Minimal FileReader polyfill (see generate-test-fixture-glb.mjs -- Node has
// Blob but not FileReader; GLTFExporter's binary path only needs readAsArrayBuffer).
globalThis.FileReader = class {
  onload = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = buf;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((err) => this.onerror?.(err));
  }
};

const OUT_DIR = 'src/render/assets/models';
mkdirSync(OUT_DIR, { recursive: true });

const exporter = new GLTFExporter();

function exportGlb(object3D, name) {
  const scene = new THREE.Scene();
  scene.add(object3D);
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error(`${name}: exporter produced non-binary output`));
          return;
        }
        const bytes = Buffer.from(result);
        writeFileSync(`${OUT_DIR}/${name}.glb`, bytes);
        console.log(`wrote ${name}.glb, bytes=${bytes.byteLength}`);
        resolve(bytes.byteLength);
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}

function mesh(geometry, color, name) {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
  m.name = name;
  return m;
}

// A neutral "primer grey" bake color for every part -- irrelevant at
// runtime for body/wheels (buildTruckRig always overrides their material
// with the cosmetic-manifest's paint/look material, ADR 0011 §2) and simply
// the shipped look for engine/gas cues (no cosmetic axis for those, per
// truck-cosmetics.md's Non-goals).
const PRIMER = 0x9aa0a6;

// ---------------------------------------------------------------------------
// Body tiers -- distinct silhouettes, not just distinct sizes, so the tier
// reads as a different truck, not just a bigger box (vehicle-art AC1).
// ---------------------------------------------------------------------------

function bodyTier0() {
  // Plain single-box chassis+cab -- the "base pickup" silhouette.
  const group = new THREE.Group();
  group.name = 'BodyTier0';
  group.add(mesh(new THREE.BoxGeometry(1.1, 0.6, 1.8), PRIMER, 'Chassis'));
  return group;
}

function bodyTier1() {
  // Chassis + a raised cab box -- reads as a proper pickup cab/bed split.
  const group = new THREE.Group();
  group.name = 'BodyTier1';
  group.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 2.0), PRIMER, 'Chassis'));
  const cab = mesh(new THREE.BoxGeometry(1.0, 0.5, 0.9), PRIMER, 'Cab');
  cab.position.set(0, 0.55, 0.35);
  group.add(cab);
  return group;
}

function bodyTier2() {
  // Chassis + cab + a roll cage (4 corner posts + a top rail) -- the
  // "monster truck" silhouette, most visually distinct of the three.
  const group = new THREE.Group();
  group.name = 'BodyTier2';
  group.add(mesh(new THREE.BoxGeometry(1.3, 0.85, 2.2), PRIMER, 'Chassis'));
  const cab = mesh(new THREE.BoxGeometry(1.05, 0.55, 0.95), PRIMER, 'Cab');
  cab.position.set(0, 0.68, 0.4);
  group.add(cab);

  const postGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
  const postPositions = [
    [0.5, 1.0, 0.7],
    [-0.5, 1.0, 0.7],
    [0.5, 1.0, -0.6],
    [-0.5, 1.0, -0.6],
  ];
  for (const [x, y, z] of postPositions) {
    const post = mesh(postGeom, 0x333333, 'CagePost');
    post.position.set(x, y, z);
    group.add(post);
  }
  const railGeomX = new THREE.CylinderGeometry(0.045, 0.045, 1.0, 8);
  const frontRail = mesh(railGeomX, 0x333333, 'CageRailFront');
  frontRail.rotation.z = Math.PI / 2;
  frontRail.position.set(0, 1.27, 0.7);
  group.add(frontRail);
  const rearRail = mesh(railGeomX, 0x333333, 'CageRailRear');
  rearRail.rotation.z = Math.PI / 2;
  rearRail.position.set(0, 1.27, -0.6);
  group.add(rearRail);

  return group;
}

// ---------------------------------------------------------------------------
// Wheel tiers -- bigger + knobbier per tier (vehicle-art AC2, "a bigger,
// knobbier tire is exactly the kind of change a child can see").
// ---------------------------------------------------------------------------

function wheelTier0() {
  const group = new THREE.Group();
  group.name = 'WheelTier0';
  const tire = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 16), PRIMER, 'Tire');
  tire.rotation.z = Math.PI / 2; // axle along X (truck's left/right)
  group.add(tire);
  return group;
}

function wheelTier1() {
  const group = new THREE.Group();
  group.name = 'WheelTier1';
  const tire = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 20), PRIMER, 'Tire');
  tire.rotation.z = Math.PI / 2;
  group.add(tire);
  const tread = mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 16), 0x222222, 'TreadRing');
  tread.rotation.y = Math.PI / 2;
  group.add(tread);
  return group;
}

function wheelTier2() {
  const group = new THREE.Group();
  group.name = 'WheelTier2';
  const tire = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.34, 24), PRIMER, 'Tire');
  tire.rotation.z = Math.PI / 2;
  group.add(tire);
  const tread = mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 20), 0x222222, 'TreadRing');
  tread.rotation.y = Math.PI / 2;
  group.add(tread);
  // Knobby hub caps poking out both sides -- "monster" tier's chunkiest cue.
  const hubGeom = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10);
  const hubLeft = mesh(hubGeom, 0x444444, 'HubLeft');
  hubLeft.rotation.z = Math.PI / 2;
  hubLeft.position.x = 0.2;
  group.add(hubLeft);
  const hubRight = mesh(hubGeom, 0x444444, 'HubRight');
  hubRight.rotation.z = Math.PI / 2;
  hubRight.position.x = -0.2;
  group.add(hubRight);
  return group;
}

// ---------------------------------------------------------------------------
// Engine cue tiers -- small attached props, not a remodel (vehicle-art AC3).
// ---------------------------------------------------------------------------

function engineCueTier0() {
  const group = new THREE.Group();
  group.name = 'EngineCueTier0';
  // Barely-there badge -- a glance-check "nothing special yet" cue.
  group.add(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.08), 0x555555, 'Badge'));
  return group;
}

function engineCueTier1() {
  const group = new THREE.Group();
  group.name = 'EngineCueTier1';
  const scoop = mesh(new THREE.BoxGeometry(0.3, 0.14, 0.4), 0x222222, 'HoodScoop');
  scoop.rotation.x = -0.15;
  group.add(scoop);
  return group;
}

function engineCueTier2() {
  const group = new THREE.Group();
  group.name = 'EngineCueTier2';
  const scoop = mesh(new THREE.BoxGeometry(0.34, 0.16, 0.44), 0x222222, 'HoodScoop');
  scoop.rotation.x = -0.15;
  group.add(scoop);
  const pipeGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.4, 8);
  const pipeLeft = mesh(pipeGeom, 0xb0b0b0, 'ExhaustLeft');
  pipeLeft.position.set(0.22, 0.2, -0.1);
  group.add(pipeLeft);
  const pipeRight = mesh(pipeGeom, 0xb0b0b0, 'ExhaustRight');
  pipeRight.position.set(-0.22, 0.2, -0.1);
  group.add(pipeRight);
  return group;
}

// ---------------------------------------------------------------------------
// Gas-tank cue tiers -- a visible size/strap cue, not a remodel.
// ---------------------------------------------------------------------------

function gasCueTier0() {
  const group = new THREE.Group();
  group.name = 'GasCueTier0';
  const tank = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12), 0xffd23f, 'Tank');
  tank.rotation.z = Math.PI / 2;
  group.add(tank);
  return group;
}

function gasCueTier1() {
  const group = new THREE.Group();
  group.name = 'GasCueTier1';
  const tank = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 14), 0xffd23f, 'Tank');
  tank.rotation.z = Math.PI / 2;
  group.add(tank);
  return group;
}

function gasCueTier2() {
  const group = new THREE.Group();
  group.name = 'GasCueTier2';
  const tank = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.55, 16), 0xffd23f, 'Tank');
  tank.rotation.z = Math.PI / 2;
  group.add(tank);
  const strap = mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 14), 0x333333, 'Strap');
  strap.rotation.y = Math.PI / 2;
  group.add(strap);
  return group;
}

const PARTS = [
  ['body-tier-0', bodyTier0],
  ['body-tier-1', bodyTier1],
  ['body-tier-2', bodyTier2],
  ['wheel-tier-0', wheelTier0],
  ['wheel-tier-1', wheelTier1],
  ['wheel-tier-2', wheelTier2],
  ['engine-cue-tier-0', engineCueTier0],
  ['engine-cue-tier-1', engineCueTier1],
  ['engine-cue-tier-2', engineCueTier2],
  ['gas-cue-tier-0', gasCueTier0],
  ['gas-cue-tier-1', gasCueTier1],
  ['gas-cue-tier-2', gasCueTier2],
];

const sizes = {};
for (const [name, build] of PARTS) {
  // eslint-disable-next-line no-await-in-loop
  sizes[name] = await exportGlb(build(), name);
}
console.log('\nApprox byte sizes (update render/assets/manifest.ts approxGzipBytes if these move a lot):');
console.log(JSON.stringify(sizes, null, 2));
