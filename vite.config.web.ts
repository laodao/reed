/**
 * Web 模式 Vite 配置
 * @description 复用 src/renderer 源码，输出到 out/renderer-web。
 *              与 electron-vite 不同：
 *              - 不走 electron-vite，单纯 Vite
 *              - 没有 preload；renderer 在 main.ts 检测无 electronAPI 时自动加载 web 桥接
 *              - 提供 dev 时代理 /api 和 /events 到 web-server
 */

import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 把 index.html 中的入口脚本从 main.ts 替换为 main-web.ts，让 web 端
 * 走包含登录门 + 桥接安装的 Web bootstrap，而 Electron 仍用默认的 main.ts。
 */
function replaceEntryToWebMain(): Plugin {
  return {
    name: 'replace-entry-to-web-main',
    transformIndexHtml(html) {
      return html.replace('/src/main.ts', '/src/main-web.ts')
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: '/',
  define: {
    // 编译期注入 web 模式标记
    '__APP_PLATFORM__': JSON.stringify('web'),
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@web-client': resolve(__dirname, 'src/web/client'),
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`,
        silenceDeprecations: ['legacy-js-api', 'import'],
      },
    },
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
  plugins: [vue(), replaceEntryToWebMain()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4201', changeOrigin: true },
      '/assets': { target: 'http://localhost:4201', changeOrigin: true },
      '/events': { target: 'ws://localhost:4201', ws: true, changeOrigin: true },
    },
  },
})
