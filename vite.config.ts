import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works at any URL path (GitHub Pages serves it under /<repo>/)
  base: './',
  plugins: [react()],
  // 5174 so it never collides with Hakoot's dev server on 5173; PORT overrides it.
  server: {port: Number(process.env.PORT) || 5174, strictPort: true},
  build: {
    // Older phones: iOS 14+ Safari and Android Chrome 87+
    target: ['es2020', 'safari14', 'chrome87'],
    cssTarget: ['safari14', 'chrome87'],
  },
});
