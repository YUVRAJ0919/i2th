import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures relative paths for GitHub Pages
  build: {
    outDir: 'dist'
  }
});