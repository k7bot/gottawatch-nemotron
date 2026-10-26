import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Hard build-time failure without an explicit backend (no default API URL anywhere in the repo).
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiMode = process.env.VITE_API_MODE ?? env.VITE_API_MODE ?? 'live';
  const apiUrl = process.env.VITE_API_URL ?? env.VITE_API_URL ?? '';
  if (command === 'build' && apiMode === 'live' && !apiUrl.trim()) {
    throw new Error('VITE_API_URL is required for a live build (an https URL or same-origin).');
  }
  return {
  plugins: [react()],
  build: { sourcemap: false, target: 'es2020' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never;
});
