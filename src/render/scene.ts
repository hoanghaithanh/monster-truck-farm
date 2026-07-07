import * as THREE from 'three';

// Hello-world render slice: proves the Three.js + Vite toolchain builds and
// runs end to end. Real scene content (truck, farm, obstacles) is the
// developer's job in Phase 3 (see docs/architecture/0001-*.md).
export function createHelloWorldScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2130);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );
  camera.position.set(3, 3, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(4, 6, 3);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 1.5));

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff8c1a }),
  );
  scene.add(cube);

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function tick(dt: number) {
    cube.rotation.x += dt * 0.6;
    cube.rotation.y += dt * 0.9;
    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return { tick, dispose };
}
