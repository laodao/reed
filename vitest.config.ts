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
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@electron': resolve(__dirname, 'src/electron'),
      '@web-client': resolve(__dirname, 'src/web/client'),
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
})
