import { defineConfig } from 'vite';

// Repo name is used as the base path so the build works when served from
// GitHub Pages at https://<user>.github.io/monster-truck-farm/.
// Override with BASE_PATH env var for other hosting targets.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/monster-truck-farm/',
  build: {
    outDir: 'dist',
    // ADR 0010 §3: asset payload (.glb/.bin/textures) must never be inlined
    // into the JS chunk -- the first-paint budget is protected structurally,
    // not by discipline or by assets happening to be over Vite's default
    // 4 KiB inline threshold. 0 forces every asset to always emit as its own
    // fingerprinted file.
    assetsInlineLimit: 0,
  },
});
