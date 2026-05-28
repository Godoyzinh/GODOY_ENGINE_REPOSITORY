import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 760,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes('/node_modules/three/')
            ? 'three'
            : undefined;
        },
      },
    },
  },
});
