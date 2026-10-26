// Unit tests for the pure Gottawatch TV logic (src/gottawatch/core). Run from the repo root:
//   npm run test:tv
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@gottawatch/contract': path.resolve(__dirname, '../../../../packages/contract/src/index.ts') },
  },
  test: { include: ['src/gottawatch/**/*.test.ts'], root: __dirname },
});
