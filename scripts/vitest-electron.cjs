#!/usr/bin/env node
/**
 * 用 Electron 内置 Node 运行 vitest（ELECTRON_RUN_AS_NODE=1）
 *
 * 背景：better-sqlite3 / canvas / nodejieba 等原生模块按 ABI 绑定运行时。
 *   - Electron（PC dev）ABI 与 host Node（vitest/tsx）ABI 不同，
 *     每次切换都要 npm rebuild（慢、需要工具链），是长期摩擦点。
 * 本脚本让 vitest 直接跑在 Electron 内置 Node 上：
 *   - 原生模块只需编译成 Electron ABI 一套，dev 与测试共用，从此不再切换；
 *   - 只改脚本层，不碰应用代码。
 *
 * 风险（实测结论见 progress/2026-09-08-abi-unify-electron-node.md）：
 *   Electron 内置 Node（本仓库 v28 -> Node 18.18）与 host Node（v22）有细微差异，
 *   个别用例需小改测试代码适配（已记录在档）。
 *
 * 用法（等价 vitest CLI，额外支持 --sqlite-only / --skip-pg）：
 *   node scripts/vitest-electron.cjs                      # watch（同 vitest 无命令）
 *   node scripts/vitest-electron.cjs run tests/unit        # 单次运行
 *   node scripts/vitest-electron.cjs --sqlite-only run tests/unit
 *       # 注入 SKIP_PG_TESTS=1（只跑 sqlite 分支，等价原 test:unit:sqlite）
 * 也兼容外部传入的 SKIP_PG_TESTS / SKIP_PG 环境变量（git-bash 直接跑时可用）。
 */
'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')

// 取 Electron 可执行文件（require('electron') 在 node 下返回安装路径字符串）
const electronPath = require('electron')

// vitest CLI 入口：node_modules/vitest/vitest.mjs（绕过其 bin shebang）
const vitestEntry = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

const args = process.argv.slice(2)
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }

// --sqlite-only / --skip-pg：等价老脚本 `SKIP_PG_TESTS=1 vitest ...`
// （npm script 里 set VAR 只适用于 cmd，这里在 node 层注入，跨平台一致）
if (args[0] === '--sqlite-only' || args[0] === '--skip-pg') {
  args.shift()
  env.SKIP_PG_TESTS = '1'
}
if (!env.SKIP_PG_TESTS && env.SKIP_PG === '1') {
  env.SKIP_PG_TESTS = '1'
}

console.log(
  `[vitest-electron] ELECTRON_RUN_AS_NODE=1 ${electronPath} ${path.relative(process.cwd(), vitestEntry)} ${args.join(' ')}`
)

const child = spawn(electronPath, [vitestEntry, ...args], {
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})
child.on('error', err => {
  console.error('[vitest-electron] 启动 Electron 失败:', err.message)
  process.exitCode = 1
})
