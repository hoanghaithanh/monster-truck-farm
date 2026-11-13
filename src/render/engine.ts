// Renderer, sky, lighting, time-of-day and post-processing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { lerp } from '../core/math';

export type QualityLevel = 'low' | 'med' | 'high';
export interface QualityConfig { pixelRatio: number; shadows: number; post: boolean; msaa: number; grass: number; particles: number }
export const QUALITY: Record<QualityLevel, QualityConfig> = {
  low: { pixelRatio: 1, shadows: 0, post: false, msaa: 0, grass: 0.25, particles: 0.5 },
  med: { pixelRatio: 1.5, shadows: 1024, post: true, msaa: 2, grass: 0.6, particles: 0.8 },
  high: { pixelRatio: 2, shadows: 2048, post: true, msaa: 4, grass: 1, particles: 1 },
};

/** Shared by every swaying/animated shader. */
export const SHARED = { uTime: { value: 0 }, uTruck: { value: new THREE.Vector3(0, -100, 0) } };

/**
 * Makes a material sway in the wind and bend away from the truck.
 * Offsets are applied in world space, after instancing. `local.y` scales the
 * effect so roots stay planted.
 */
export function windify<T extends THREE.Material>(mat: T, sway: number, push: number): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uTruck = SHARED.uTruck;
    shader.vertexShader = 'uniform float uTime;\nuniform vec3 uTruck;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec4 wp = modelMatrix * mvPosition;
      float hgt = max(position.y, 0.0);
      float ph = wp.x * 0.31 + wp.z * 0.27;
      wp.x += sin(uTime * 1.9 + ph) * ${sway.toFixed(3)} * hgt;
      wp.z += cos(uTime * 1.3 + ph * 1.3) * ${(sway * 0.6).toFixed(3)} * hgt;
      vec2 away = wp.xz - uTruck.xz;
      float d = length(away);
      float squash = (1.0 - smoothstep(1.2, 3.6, d)) * step(abs(wp.y - uTruck.y), 3.0) * ${push.toFixed(3)};
      wp.xz += normalize(away + 0.001) * squash * hgt * 0.9;
      wp.y -= squash * hgt * 0.7;
      mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  mat.customProgramCacheKey = () => `wind-${sway}-${push}`;
  return mat;
}

interface SkyKey { t: number; top: number; horizon: number; sun: number; sunI: number; hemiI: number; elev: number; fog: number }
// Morning -> noon -> golden hour -> dusk.
const SKY_KEYS: SkyKey[] = [
  { t: 0, top: 0x6ec6ff, horizon: 0xffe9c9, sun: 0xfff1d6, sunI: 1.9, hemiI: 0.75, elev: 0.6, fog: 0xdff3ff },
  { t: 0.4, top: 0x4db4ff, horizon: 0xd9f4ff, sun: 0xffffff, sunI: 2.1, hemiI: 0.8, elev: 1.05, fog: 0xd9f4ff },
  { t: 0.75, top: 0x6aa8ff, horizon: 0xffd9a0, sun: 0xffd9a0, sunI: 2.1, hemiI: 0.75, elev: 0.55, fog: 0xffe6c4 },
  { t: 0.93, top: 0x7a6be0, horizon: 0xff9f7a, sun: 0xff9a5c, sunI: 1.9, hemiI: 0.7, elev: 0.26, fog: 0xffc2a6 },
  { t: 1, top: 0x5a4fc0, horizon: 0xff8a8a, sun: 0xff7a5c, sunI: 1.7, hemiI: 0.65, elev: 0.16, fog: 0xf7a8b0 },
];

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uSpeed: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uSpeed, uFlash, uTime; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      // Radial smear toward the edges when going fast.
      vec3 col = vec3(0.0);
      float amt = uSpeed * 0.035 * smoothstep(0.15, 0.7, r);
      for (int i = 0; i < 5; i++) col += texture2D(tDiffuse, vUv - c * amt * float(i)).rgb;
      col /= 5.0;
      // Speed lines.
      float ang = atan(c.y, c.x);
      float line = step(0.965, hash(vec2(floor(ang * 60.0), floor(uTime * 14.0))));
      col += line * uSpeed * smoothstep(0.32, 0.6, r) * 0.35;
      // Punchy saturation + warm vignette.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.16);
      col *= 1.0 - uVignette * smoothstep(0.35, 0.85, r);
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1100);
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xcfeaff, 0x8fd66a, 1);
  readonly sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  quality: QualityConfig = QUALITY.high;
  /** 0..1 fast-ness for radial blur/speed lines; 0..1 white flash. */
  speedFx = 0;
  flash = 0;

  private composer: EffectComposer | null = null;
  private finalPass: ShaderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private sky: THREE.Mesh;
  private skyUniforms = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() } };
  private clouds = new THREE.Group();
  private fog = new THREE.Fog(0xdff3ff, 140, 620);

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.fog = this.fog;

    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    const s = 46;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(950, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 uTop, uHorizon, uSunDir, uSunColor; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float h = clamp(d.y, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
            float s = max(dot(d, normalize(uSunDir)), 0.0);
            col += uSunColor * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.buildClouds();
    this.setTimeOfDay(0.2);
    this.setQuality('high');
    window.addEventListener('resize', this.resize);
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, fog: false });
    const puff = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const n = 4 + (i % 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(puff, mat);
        const r = 7 + ((i * 7 + j * 13) % 6);
        m.position.set((j - n / 2) * 9, ((j * 5) % 4) - 1, ((i + j * 3) % 5) - 2);
        m.scale.set(r, r * 0.62, r * 0.8);
        cloud.add(m);
      }
      const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.3, d = 200 + ((i * 53) % 300);
      cloud.position.set(Math.cos(a) * d, 62 + ((i * 17) % 40), Math.sin(a) * d);
      cloud.userData.speed = 1.2 + (i % 4) * 0.5;
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
  }

  setQuality(level: QualityLevel): void {
    const q = (this.quality = QUALITY[level]);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows > 0 && this.sun.shadow.mapSize.x !== q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.composer?.dispose();
    this.composer = null;
    if (q.post) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.6, 1.0);
      this.composer.addPass(this.bloom);
      this.finalPass = new ShaderPass(FinalShader);
      this.composer.addPass(this.finalPass);
      this.composer.addPass(new OutputPass());
    }
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.resize();
  }

  /** frac 0 = morning, 1 = sunset. */
  setTimeOfDay(frac: number): void {
    let i = 0;
    while (i < SKY_KEYS.length - 2 && frac > SKY_KEYS[i + 1].t) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    const k = THREE.MathUtils.clamp((frac - a.t) / (b.t - a.t), 0, 1);
    const mix = (x: number, y: number, out: THREE.Color) => out.setHex(x).lerp(_tmp.setHex(y), k);
    mix(a.top, b.top, this.skyUniforms.uTop.value);
    mix(a.horizon, b.horizon, this.skyUniforms.uHorizon.value);
    mix(a.sun, b.sun, this.sun.color);
    mix(a.fog, b.fog, this.fog.color);
    this.skyUniforms.uSunColor.value.copy(this.sun.color);
    this.sun.intensity = lerp(a.sunI, b.sunI, k);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, k);
    this.hemi.color.copy(this.skyUniforms.uTop.value).lerp(_tmp.setHex(0xffffff), 0.6);
    const elev = lerp(a.elev, b.elev, k), az = lerp(-0.9, 2.2, frac);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
  }

  resize = (): void => {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  render(dt: number, focus: THREE.Vector3): void {
    SHARED.uTime.value += dt;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 110);
    this.sky.position.copy(this.camera.position);
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 560) c.position.x = -560;
    }
    if (this.composer && this.finalPass) {
      const u = this.finalPass.uniforms;
      u.uSpeed.value = this.speedFx;
      u.uFlash.value = this.flash;
      u.uTime.value = SHARED.uTime.value;
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

const _tmp = new THREE.Color();
