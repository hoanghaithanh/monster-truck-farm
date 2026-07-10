import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AssetRegistry, type GltfLoaderLike } from './asset-registry';

// AssetRegistry wraps GLTFLoader, which needs fetch/Image and isn't
// practical to exercise against a real network in Vitest's node
// environment (the live browser smoke test covers that end). Here we
// inject a fake loader (GltfLoaderLike) so the registry's own logic --
// caching, dedup, per-asset isolation, the bounded gate, never-throws --
// gets real automated coverage.

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeScene(): THREE.Object3D {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
}

// A minimal skinned scene, mimicking the shape that makes plain
// `Object3D.clone()` unsafe (ADR 0015 §1): one bone plus a SkinnedMesh bound
// to it via a Skeleton, wrapped in a root Group -- enough for
// SkeletonUtils.clone to have real bones to rebind.
function fakeSkinnedScene(): THREE.Object3D {
  const bone = new THREE.Bone();
  bone.position.set(0, 1, 0);
  const skeleton = new THREE.Skeleton([bone]);

  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 4);
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    skinIndices.push(0, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(skeleton);

  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

describe('AssetRegistry.load / status / get (ADR 0010 §2/§6/§7)', () => {
  it('starts a key as pending with no source', () => {
    const registry = new AssetRegistry({ loadAsync: () => new Promise(() => {}) });
    expect(registry.status('missing')).toBe('pending');
    expect(registry.get('missing')).toBeUndefined();
  });

  it('transitions pending -> ready and hands out a fresh clone per get()', async () => {
    const scene = fakeScene();
    const loader: GltfLoaderLike = { loadAsync: async () => ({ scene }) };
    const registry = new AssetRegistry(loader);

    registry.load('key', 'url');
    expect(registry.status('key')).toBe('pending');

    await registry.waitFor(['key'], 1000);
    expect(registry.status('key')).toBe('ready');

    const a = registry.get('key');
    const b = registry.get('key');
    expect(a).toBeDefined();
    expect(a).not.toBe(scene); // caller gets a clone, not the shared source
    expect(a).not.toBe(b); // each get() call is its own clone
  });

  it('transitions pending -> failed and never throws or rejects on a load error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader: GltfLoaderLike = { loadAsync: async () => Promise.reject(new Error('404')) };
    const registry = new AssetRegistry(loader);

    registry.load('broken', 'url');
    await registry.waitFor(['broken'], 1000);

    expect(registry.status('broken')).toBe('failed');
    expect(registry.get('broken')).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('load-once: a second load() for the same key does not call the loader again (repeated equip/unequip must not re-download)', async () => {
    const loadAsync = vi.fn(async () => ({ scene: fakeScene() }));
    const registry = new AssetRegistry({ loadAsync });

    registry.load('key', 'url-a');
    registry.load('key', 'url-b'); // same key, different url -- still a no-op second call
    await registry.waitFor(['key'], 1000);

    expect(loadAsync).toHaveBeenCalledOnce();
  });

  it('per-asset isolation: one failed load does not affect an unrelated successful one (ADR 0010 §7)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader: GltfLoaderLike = {
      loadAsync: async (url: string) => {
        if (url === 'bad') throw new Error('boom');
        return { scene: fakeScene() };
      },
    };
    const registry = new AssetRegistry(loader);
    registry.prefetch([
      { key: 'good', url: 'good' },
      { key: 'bad', url: 'bad' },
    ]);
    await registry.waitFor(['good', 'bad'], 1000);

    expect(registry.status('good')).toBe('ready');
    expect(registry.status('bad')).toBe('failed');
    vi.restoreAllMocks();
  });
});

describe('AssetRegistry.getAnimated (ADR 0015 §1: the skin-safe clone path)', () => {
  it('returns undefined for a key that is not ready (never requested, still pending, or failed) -- same not-ready contract as get()', async () => {
    const registry = new AssetRegistry({ loadAsync: () => new Promise(() => {}) });
    expect(registry.getAnimated('missing')).toBeUndefined();

    registry.load('pending-key', 'url');
    expect(registry.getAnimated('pending-key')).toBeUndefined();
  });

  it('hands back a fresh clone whose SkinnedMesh is correctly rebound to its own cloned bones (not left pointing at the source skeleton)', async () => {
    const scene = fakeSkinnedScene();
    const loader: GltfLoaderLike = { loadAsync: async () => ({ scene, animations: [] }) };
    const registry = new AssetRegistry(loader);

    registry.load('farmer', 'url');
    await registry.waitFor(['farmer'], 1000);

    const animated = registry.getAnimated('farmer');
    expect(animated).toBeDefined();
    expect(animated!.scene).not.toBe(scene); // a clone, not the shared source

    const sourceMesh = scene.children[0] as THREE.SkinnedMesh;
    const cloneMesh = animated!.scene.children[0] as THREE.SkinnedMesh;
    // The clone's skeleton bones must be its OWN clones, not the source's --
    // this is exactly what a naive Object3D.clone(true) gets wrong (ADR 0015
    // §1's "frozen bind pose" hazard).
    expect(cloneMesh.skeleton.bones[0]).not.toBe(sourceMesh.skeleton.bones[0]);
    expect(cloneMesh.skeleton.bones[0]).toBe(cloneMesh.children.find((c) => c instanceof THREE.Bone));
  });

  it('preserves gltf.animations, handing out the same clip array by reference to every caller (clips are immutable, sharing is safe)', async () => {
    const clip = new THREE.AnimationClip('CharacterArmature|Run', 1, []);
    const loader: GltfLoaderLike = { loadAsync: async () => ({ scene: fakeSkinnedScene(), animations: [clip] }) };
    const registry = new AssetRegistry(loader);

    registry.load('farmer', 'url');
    await registry.waitFor(['farmer'], 1000);

    const a = registry.getAnimated('farmer');
    const b = registry.getAnimated('farmer');
    expect(a!.animations).toEqual([clip]);
    expect(a!.animations).toBe(b!.animations); // same shared array reference
  });

  it('defaults animations to an empty array for an asset whose loader response omits them (widened optional field, existing non-animated fakes still work)', async () => {
    const loader: GltfLoaderLike = { loadAsync: async () => ({ scene: fakeScene() }) }; // no `animations` key at all
    const registry = new AssetRegistry(loader);

    registry.load('key', 'url');
    await registry.waitFor(['key'], 1000);

    expect(registry.getAnimated('key')!.animations).toEqual([]);
  });
});

describe('AssetRegistry.waitFor (the ADR 0010 §4.3 bounded gate)', () => {
  it('resolves immediately for an empty key list', async () => {
    const registry = new AssetRegistry({ loadAsync: () => new Promise(() => {}) });
    const start = Date.now();
    await registry.waitFor([], 3000);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('resolves as soon as every requested key settles, without waiting for the full timeout', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ scene: THREE.Object3D }>();
    const registry = new AssetRegistry({ loadAsync: () => pending.promise });
    registry.load('key', 'url');

    let resolved = false;
    void registry.waitFor(['key'], 3000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(resolved).toBe(false);

    pending.resolve({ scene: fakeScene() });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it('times out and proceeds after timeoutMs even if the load never settles (drive AC gate: never a silent freeze)', async () => {
    vi.useFakeTimers();
    const registry = new AssetRegistry({ loadAsync: () => new Promise(() => {}) }); // never settles
    registry.load('key', 'url');

    let resolved = false;
    void registry.waitFor(['key'], 3000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    // The registry still reports the asset as pending -- the gate gave up
    // waiting, but the load itself keeps going and can upgrade in place later.
    expect(registry.status('key')).toBe('pending');
    vi.useRealTimers();
  });

  it('treats a key that was never load()-ed as already-settled rather than blocking forever', async () => {
    const registry = new AssetRegistry({ loadAsync: () => new Promise(() => {}) });
    const start = Date.now();
    await registry.waitFor(['never-requested'], 3000);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('waits for every key to settle, not just the first -- a fast key settling early does not short-circuit the gate while a slower key is still pending', async () => {
    vi.useFakeTimers();
    const fast = deferred<{ scene: THREE.Object3D }>();
    const slow = deferred<{ scene: THREE.Object3D }>();
    const registry = new AssetRegistry({
      loadAsync: (url: string) => (url === 'fast' ? fast.promise : slow.promise),
    });
    registry.load('fast', 'fast');
    registry.load('slow', 'slow');

    let resolved = false;
    void registry.waitFor(['fast', 'slow'], 3000).then(() => {
      resolved = true;
    });

    fast.resolve({ scene: fakeScene() });
    await vi.advanceTimersByTimeAsync(0);
    // Only "fast" has settled -- the gate must still be waiting on "slow",
    // well before the 3s timeout.
    expect(resolved).toBe(false);
    expect(registry.status('fast')).toBe('ready');
    expect(registry.status('slow')).toBe('pending');

    slow.resolve({ scene: fakeScene() });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it('a load that settles after the gate already timed out still becomes ready afterward, so a later upgrade-in-place is possible even though this gate gave up on it', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ scene: THREE.Object3D }>();
    const registry = new AssetRegistry({ loadAsync: () => pending.promise });
    registry.load('key', 'url');

    let gateResolved = false;
    void registry.waitFor(['key'], 3000).then(() => {
      gateResolved = true;
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(gateResolved).toBe(true);
    expect(registry.status('key')).toBe('pending'); // gate gave up; load itself keeps going

    // The load finally resolves well after the gate's timeout elapsed.
    pending.resolve({ scene: fakeScene() });
    await vi.advanceTimersByTimeAsync(0);

    expect(registry.status('key')).toBe('ready');
    expect(registry.get('key')).toBeDefined();
    vi.useRealTimers();
  });

  it('a second waitFor() call for a key that already settled on a previous gate resolves immediately (re-entering DRIVING a second time must not re-wait)', async () => {
    const loader: GltfLoaderLike = { loadAsync: async () => ({ scene: fakeScene() }) };
    const registry = new AssetRegistry(loader);
    registry.load('key', 'url');
    await registry.waitFor(['key'], 3000);
    expect(registry.status('key')).toBe('ready');

    const start = Date.now();
    await registry.waitFor(['key'], 3000);
    expect(Date.now() - start).toBeLessThan(50);
    expect(registry.status('key')).toBe('ready');
  });
});
