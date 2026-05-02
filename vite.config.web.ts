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
 *
 * 同时放宽 Web 端 CSP：
 * - 加 'unsafe-eval' / 'wasm-unsafe-eval'：长文写作等模块依赖的 markdown / 模板渲染
 *   库（bytemd、katex、mermaid 等）会调用 eval / Function ctor，严格 CSP 在 Firefox
 *   下会报错；Chromium 默认不强制 meta CSP 的 eval 限制，但为统一行为统一放开。
 * - 加 connect-src：dev 时 vite HMR / WebSocket /events 需要明确允许。
 *
 * Electron 端保留 src/renderer/index.html 中的严格 CSP（'self' only），
 * 因为 Electron 进程沙盒对 eval 不敏感且需要更严的 web 安全。
 */
function replaceEntryToWebMain(): Plugin {
  return {
    name: 'replace-entry-to-web-main',
    // 关键：必须在 vite 内部 HTML 脚本提取之前替换 entry，否则 build 阶段
    // 仍按 /src/main.ts bundle，登录门 / Web 桥都不会被打进产物。
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html.replace('/src/main.ts', '/src/main-web.ts')

        // 仅修改 CSP <meta> 标签的 content 属性
        out = out.replace(
          /(<meta http-equiv="Content-Security-Policy"\s+content=")([^"]+)("\s*\/?>)/i,
          (_m, prefix, csp, suffix) => {
            let next = csp
            // script-src: 加 unsafe-eval / wasm-unsafe-eval / unsafe-inline
            // - unsafe-eval / wasm-unsafe-eval: bytemd / katex / mermaid 用 eval / Function ctor / wasm
            // - unsafe-inline: mermaid 等渲染时会注入 <script> 标签（script-src-elem 默认回落到此）
            //   注：CSP 规定有 hash/nonce 时 unsafe-inline 被忽略；本项目未用 hash/nonce 所以生效
            if (/script-src\s+'self';?/.test(next)) {
              next = next.replace(
                /script-src\s+'self';?/,
                "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline';",
              )
            }
            // script-src-attr: 允许 inline event handlers（Element Plus 部分组件 / 知识库 UI）
            // 不显式声明时浏览器回落到 default-src 'self'，会拒绝 onclick=... 之类
            if (!/script-src-attr/.test(next)) {
              next = `${next.replace(/;?\s*$/, '')}; script-src-attr 'unsafe-inline';`
            }
            // font-src: 允许 data: 内嵌字体（图标库 woff2 base64）
            if (!/font-src/.test(next)) {
              next = `${next.replace(/;?\s*$/, '')}; font-src 'self' data:;`
            }
            // worker-src: 部分 wasm / web worker 需要 blob:
            if (!/worker-src/.test(next)) {
              next = `${next.replace(/;?\s*$/, '')}; worker-src 'self' blob:;`
            }
            // connect-src: vite HMR / 业务 WebSocket /events / 跨域 API
            if (!/connect-src/.test(next)) {
              next = `${next.replace(/;?\s*$/, '')}; connect-src 'self' ws: wss: http: https:;`
            }
            return `${prefix}${next}${suffix}`
          },
        )
        return out
      },
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
