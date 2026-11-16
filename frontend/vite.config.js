import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Configuración Vite 8 (Rolldown) + Vitest para BikeStore.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // El backend Express (Etapa 1) escucha en http://localhost:3000
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
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
