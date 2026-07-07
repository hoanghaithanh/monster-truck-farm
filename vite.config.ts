import { defineConfig } from 'vite';

// Repo name is used as the base path so the build works when served from
// GitHub Pages at https://<user>.github.io/monster-truck-farm/.
// Override with BASE_PATH env var for other hosting targets.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/monster-truck-farm/',
  build: {
    outDir: 'dist',
  },
});
