import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@electron': resolve(__dirname, 'src/electron')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/electron/index.ts')
        }
      },
      copyPublicDir: false
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        // preload 也会 import @shared 的纯常量/纯函数（如事件通道名）——缺别名时 Rollup 解析失败、App 起不来。
        // 事件通道收敛（shared/domain-learning-event 唯一实现）后，preload 首次出现 @shared 的
        // **运行时值导入**（此前仅 import type 会被编译期擦除，无需别名）
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [vue()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        // @core：前端可 import core 的纯类型 / 纯常量 / 纯函数（无 Node 副作用模块）。
        // typeorm / fs 等服务端代码不要从 renderer import；仅 import type / const。
        '@core': resolve(__dirname, 'src/core'),
        '@': resolve(__dirname, 'src/renderer/src')
        // 注：不再需要 @web-client alias —— Electron entry 是 main.ts，
        // 已通过 main/main-web 拆分把 @web-client 完全隔离到 Web 端。
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/styles/variables.scss" as *;`,
          silenceDeprecations: ['legacy-js-api', 'import']
        }
      }
    }
  }
})
