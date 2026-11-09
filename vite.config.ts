import { defineConfig, Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// В режиме single three.js не вшивается, а грузится с CDN через importmap.
const THREE_VER = '0.170.0';
const importMap: Plugin = {
  name: 'three-importmap',
  transformIndexHtml(html) {
    const map = {
      imports: {
        three: `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js`,
        'three/examples/jsm/': `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/`,
      },
    };
    return html.replace('<head>', `<head>\n<script type="importmap">${JSON.stringify(map)}</script>`);
  },
};

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [importMap, viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: mode === 'single' ? { external: ['three', /^three\/examples\//] } : {},
  },
}));
