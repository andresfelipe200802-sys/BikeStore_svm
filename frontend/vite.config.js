import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEFAULT_SITE_URL = 'https://bikestore.com.co';

/**
 * Ajusta la CSP únicamente en `vite dev` (apply: 'serve') para permitir el preámbulo
 * inline de React Fast Refresh y el WebSocket HMR sin debilitar dist/index.html de producción.
 */
function cspDevPlugin() {
  return {
    name: 'bikestore-csp-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]+)(")/i,
        (_, prefix, policy, suffix) => {
          const devPolicy = policy
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace(
              "connect-src 'self' http://localhost:3000",
              "connect-src 'self' http://localhost:3000 ws://localhost:5173 http://localhost:5173"
            );
          return `${prefix}${devPolicy}${suffix}`;
        }
      );
    },
  };
}

/**
 * Permite sobrescribir el origen base de robots.txt y sitemap.xml en build mediante VITE_SITE_URL.
 */
function siteUrlAssetsPlugin() {
  let outDir = 'dist';
  return {
    name: 'bikestore-site-url-assets',
    apply: 'build',
    configResolved(config) {
      outDir = config.build?.outDir || 'dist';
    },
    closeBundle() {
      const rawSiteUrl = (process.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
      if (!rawSiteUrl) return;
      for (const archivo of ['robots.txt', 'sitemap.xml']) {
        const ruta = resolve(outDir, archivo);
        if (!existsSync(ruta)) continue;
        const contenido = readFileSync(ruta, 'utf8');
        if (contenido.includes(DEFAULT_SITE_URL)) {
          writeFileSync(ruta, contenido.replaceAll(DEFAULT_SITE_URL, rawSiteUrl), 'utf8');
        }
      }
    },
  };
}

// Configuración Vite 8 (Rolldown) + Vitest para BikeStore.
export default defineConfig({
  plugins: [react(), cspDevPlugin(), siteUrlAssetsPlugin()],
  server: {
    port: 5173,
    proxy: {
      // El backend Express escucha en http://localhost:3000
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Emite todas las fuentes .woff2 y recursos como archivos estáticos bajo 'self' (sin data:font/... inline que viole font-src 'self').
    assetsInlineLimit: 0,
    rolldownOptions: {
      // Dependencias opcionales de jspdf que BikeStore no usa (prohibido doc.html()).
      external: ['canvg', 'html2canvas', 'dompurify'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
