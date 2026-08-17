import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: false,
    setupFiles: ['./tests/unit/setup.ts'],
    environmentOptions: {
      happy_dom: {},
    },
  },
  resolve: {
    alias: [
      { find: '@core', replacement: resolve(__dirname, 'src/core') },
      { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
      { find: '@electron', replacement: resolve(__dirname, 'src/electron') },
      { find: '@web-client', replacement: resolve(__dirname, 'src/web/client') },
      { find: '@renderer', replacement: resolve(__dirname, 'src/renderer') },
      { find: '@', replacement: resolve(__dirname, 'src/renderer/src') },
    ],
  },
})
