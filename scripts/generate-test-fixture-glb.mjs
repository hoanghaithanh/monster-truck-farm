// Regenerates src/render/assets/test-fixture-cube.glb -- a TEST FIXTURE ONLY
// (a single unit cube), used purely to prove the ADR 0010 GLTFLoader /
// AssetRegistry / upgrade-in-place / prefetch plumbing works end-to-end
// against a real .glb file. Not production art -- later Sprint-3 passes
// (ADR 0011/0012) replace it with real CC0 pack assets. Run with:
//   node scripts/generate-test-fixture-glb.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';

// Minimal FileReader polyfill (Node has Blob but not FileReader) sufficient
// for GLTFExporter's binary path, which only calls readAsArrayBuffer.
globalThis.FileReader = class {
  onload = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((err) => this.onerror?.(err));
  }
};

const scene = new THREE.Scene();
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x33aaff }),
);
mesh.name = 'TestFixtureCube';
scene.add(mesh);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    if (result instanceof ArrayBuffer) {
      writeFileSync('src/render/assets/test-fixture-cube.glb', Buffer.from(result));
      console.log('wrote glb, bytes=', result.byteLength);
    } else {
      writeFileSync('src/render/assets/test-fixture-cube.gltf', JSON.stringify(result));
      console.log('wrote gltf json (unexpected non-binary output)');
    }
  },
  (err) => { console.error('export error', err); process.exit(1); },
  { binary: true },
);
