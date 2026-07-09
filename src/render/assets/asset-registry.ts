import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetLoadOutcome } from '../../core/assets/gate';

// Impure glTF loader/cache (ADR 0010 §6) -- belongs in render/, not core/,
// per ADR 0001 §4: loading is inherently async I/O. The *decisions* built on
// top of what this module reports (fall back to primitive? proceed past the
// gate?) are pure and live in core/assets/gate.ts; this module only loads,
// caches, and reports status/results.
//
// Contract (ADR 0010 §7, "must never hard-crash"): `load()` and `prefetch()`
// never throw and never produce a rejected promise a caller could forget to
// catch -- every failure (network error, malformed file, 404, timeout at the
// gate level) resolves to `undefined`/`'failed'` plus one `console.warn`.
// Per-asset isolation: one failed load never affects another (Promise
// .allSettled semantics throughout, never Promise.all).

/** Minimal subset of GLTFLoader's API this module depends on -- lets tests inject a fake loader instead of touching real network/GLTFLoader (which needs fetch/Image and isn't practical to unit-test in Vitest's node environment). */
export interface GltfLoaderLike {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
}

interface CacheEntry {
  status: AssetLoadOutcome;
  /** Resolves once this key's load has settled; never rejects (see contract above). */
  settled: Promise<void>;
  /** The parsed source scene graph, once ready -- kept once, cloned out per `get()` call (ADR 0010 §6: shared source lives for the app's lifetime; callers own and dispose their own clones). */
  source?: THREE.Object3D;
}

export class AssetRegistry {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly loader: GltfLoaderLike;

  /**
   * `loader` defaults to a real three.js `GLTFLoader`; tests inject a fake
   * (see `asset-registry.test.ts`) so cache/dedup/gate/isolation behaviour
   * is covered without touching the network or a browser environment.
   */
  constructor(loader: GltfLoaderLike = new GLTFLoader()) {
    this.loader = loader;
  }

  /**
   * Kicks off (or returns the in-flight/already-settled) load for `key`.
   * Load-once: a second call for the same key while the first is still
   * pending returns the same in-flight entry rather than issuing a second
   * network request (ADR 0010 §2 -- repeated equip/unequip of the same
   * tier must not re-download).
   */
  load(key: string, url: string): void {
    if (this.cache.has(key)) return;

    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });
    const entry: CacheEntry = { status: 'pending', settled };
    this.cache.set(key, entry);

    this.loader.loadAsync(url).then(
      (gltf) => {
        entry.status = 'ready';
        entry.source = gltf.scene;
        resolveSettled();
      },
      (err: unknown) => {
        // Per ADR 0010 §7: log once, keep (or revert to) the primitive --
        // never propagate a throw/rejection to the caller or the game loop.
        console.warn(`AssetRegistry: failed to load "${key}" from ${url}`, err);
        entry.status = 'failed';
        resolveSettled();
      },
    );
  }

  /** Fires off `load()` for every entry, independently (isolated per ADR 0010 §7 -- one failure never blocks or affects another). Intended to be called once, e.g. on entering the builder screen (ADR 0010 §4.1). */
  prefetch(entries: { key: string; url: string }[]): void {
    for (const { key, url } of entries) {
      this.load(key, url);
    }
  }

  /** Current load status for `key`; `'pending'` (never requested is indistinguishable from still-loading -- both mean "not ready yet," which is the correct fallback answer either way). */
  status(key: string): AssetLoadOutcome {
    return this.cache.get(key)?.status ?? 'pending';
  }

  /**
   * A fresh clone of `key`'s loaded scene graph, or `undefined` if it isn't
   * ready (still pending, failed, or never requested). Callers own the
   * returned clone and must dispose its geometries/materials themselves
   * when their session ends -- the cached `source` itself lives for the
   * app's lifetime and is never disposed by this class (ADR 0010 §6/the
   * Consequences section's lifetime warning).
   */
  get(key: string): THREE.Object3D | undefined {
    const entry = this.cache.get(key);
    if (!entry || entry.status !== 'ready' || !entry.source) return undefined;
    return entry.source.clone(true);
  }

  /**
   * The bounded gate (ADR 0010 §4.3): resolves once every key in `keys` has
   * settled (ready or failed) or `timeoutMs` has elapsed, whichever comes
   * first. Never rejects. A key that was never `load()`-ed is treated as
   * already-settled (there is nothing to wait for) rather than blocking
   * forever -- callers are expected to have prefetched the keys they gate
   * on (ADR 0010 §4.1).
   */
  async waitFor(keys: string[], timeoutMs: number): Promise<void> {
    if (keys.length === 0) return;
    const settledPromises = keys.map((key) => this.cache.get(key)?.settled ?? Promise.resolve());
    const allSettled = Promise.all(settledPromises);
    await Promise.race([allSettled, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  }
}
