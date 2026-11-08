import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const maplibreStub = fileURLToPath(new URL('./e2e/stubs/maplibre-gl.js', import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required to build the page.');
  }

  return {
    base: './',
    resolve: {
      alias: mode === 'e2e' ? [{ find: /^maplibre-gl$/, replacement: maplibreStub }] : [],
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
    },
  };
});
