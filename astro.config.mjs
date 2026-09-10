import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  vite: {
    optimizeDeps: {
      // This package is browser-ready ESM. Serve it directly so checks/builds
      // cannot invalidate the running game's optimized dependency URL.
      exclude: ['colorjs.io'],
    },
  },
});