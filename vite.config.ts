import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: 'public-optimized',
  build: { target: 'es2022', chunkSizeWarningLimit: 2500,
    rollupOptions: { external: (id) => id === 'three' || id === '@dimforge/rapier3d-compat' || id.startsWith('@helix/') },
  },
});
