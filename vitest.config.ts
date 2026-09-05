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
    server: {
      deps: {
        // node: 内置模块（如 node:sqlite）保持原生加载，不交给 Vite 转换
        external: ['node:sqlite'],
      },
    },
    environmentOptions: {
      happy_dom: {},
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'src/core/modules/workflow/nodes/extra-nodes.ts',
        'src/core/modules/workflow/nodes/news-nodes.ts',
        'src/core/modules/workflow/nodes/asset-nodes.ts',
        'src/core/modules/workflow/nodes/a2-nodes.ts',
        'src/core/modules/workflow/tools/video-url-resolver.ts',
        'src/core/services/document-tools/templates.ts',
        'src/core/platform/providers/voice/dashscope-stt-provider.ts',
        'src/shared/types/news-topics.ts',
        'src/core/database/migrations/create-builtin-apps.ts',
        'src/core/database/migrations/create-assets-tables.ts',
        'src/core/database/repositories/asset.repository.ts',
        'src/core/database/repositories/app.repository.ts',
        'src/core/database/repositories/workflow-definition.repository.ts',
        'src/core/modules/assets/asset.service.ts',
      ],
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
