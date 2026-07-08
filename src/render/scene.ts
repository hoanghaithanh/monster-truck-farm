import * as THREE from 'three';
import type { ObstacleInstance, Vec2 } from '../core/types';
import type { TerrainBounds } from '../core/terrain';
import { clampCameraToBounds } from '../core/driving/boundary';

// Chase camera stays this far inset from the ground plane's edge so a
// corner position never lets the camera see past the ground into the
// scene background/"void" (issue #17, drive AC4 intent).
const CAMERA_GROUND_MARGIN = 3;

// Thin rendering adapter (ADR 0001 §4/§7): three.js meshes only, no
// gameplay rules live here. systems/ tells this module where things are;
// this module just draws them.

const OBSTACLE_COLORS: Record<ObstacleInstance['kind'], number> = {
  bush: 0x3fa34d,
  rock: 0x8a8a8a,
  derelictCar: 0x6b4a2f,
};

function buildObstacleGeometry(obstacle: ObstacleInstance): { geometry: THREE.BufferGeometry; height: number } {
  if (obstacle.kind === 'bush') {
    return { geometry: new THREE.SphereGeometry(obstacle.radius, 12, 10), height: obstacle.radius };
  }
  if (obstacle.kind === 'rock') {
    return { geometry: new THREE.IcosahedronGeometry(obstacle.radius, 0), height: obstacle.radius };
  }
  return { geometry: new THREE.BoxGeometry(obstacle.radius * 2, 1.2, obstacle.radius), height: 0.6 };
}

function createObstacleMesh(obstacle: ObstacleInstance): THREE.Object3D {
  const { geometry, height } = buildObstacleGeometry(obstacle);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS[obstacle.kind] }));
  mesh.position.set(obstacle.position.x, height, obstacle.position.z);
  return mesh;
}

export function createGameScene(container: HTMLElement, bounds: TerrainBounds, obstacles: ObstacleInstance[]) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(10, 15, 8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404040, 1.6));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x6fbf5e }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  for (const obstacle of obstacles) {
    scene.add(createObstacleMesh(obstacle));
  }

  const truckMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.8, 2),
    new THREE.MeshStandardMaterial({ color: 0xff8c1a }),
  );
  truckMesh.position.y = 0.4;
  scene.add(truckMesh);

  const animalMeshes = new Map<string, THREE.Object3D>();

  function setTruckTransform(position: Vec2, heading: number): void {
    truckMesh.position.set(position.x, 0.4, position.z);
    truckMesh.rotation.y = heading;

    // Simple chase camera, offset behind the truck's heading. At terrain
    // corners this offset can extend past the finite ground plane, so the
    // camera's own (x,z) is pulled back in to stay over the ground — the
    // camera still looks at the truck, so it stays framed either way.
    const behind = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)).multiplyScalar(6);
    const desiredCameraPos = { x: truckMesh.position.x + behind.x, z: truckMesh.position.z + behind.z };
    const cameraPos = clampCameraToBounds(desiredCameraPos, bounds, CAMERA_GROUND_MARGIN);
    camera.position.set(cameraPos.x, 5, cameraPos.z);
    camera.lookAt(truckMesh.position);
  }

  function upsertAnimal(id: string, position: Vec2): void {
    let mesh = animalMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xfff2a8 }),
      );
      scene.add(mesh);
      animalMeshes.set(id, mesh);
    }
    mesh.position.set(position.x, 0.3, position.z);
  }

  function removeAnimal(id: string): void {
    const mesh = animalMeshes.get(id);
    if (!mesh) return;
    scene.remove(mesh);
    animalMeshes.delete(id);
  }

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function render() {
    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return { setTruckTransform, upsertAnimal, removeAnimal, render, dispose };
}
