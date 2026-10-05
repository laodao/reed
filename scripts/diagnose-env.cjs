/**
 * 环境自检脚本：合并后知识库打不开的排查（2026-10-05）
 *
 * 背景：chore/upgrade-electron-44 合入 dev 后工具链大版本跳跃
 *   electron 28→44 / vite 5→7 / better-sqlite3 11→12。
 * 原生模块（better-sqlite3/canvas/nodejieba）按 ABI 预编译，Electron 大版本升级后
 * 必须重装依赖并重编，否则主进程加载数据库/分词模块直接崩——知识库界面打不开。
 *
 * 用法：node scripts/diagnose-env.cjs
 * 把完整输出发给开发者即可定位问题。
 */
const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
let issues = 0

function section(title) {
  console.log(`\n=== ${title} ===`)
}

function check(name, ok, detail) {
  const mark = ok ? '✓' : '✗'
  if (!ok) issues++
  console.log(`${mark} ${name}${detail ? ' —— ' + detail : ''}`)
}

section('1. Node / npm')
console.log('node:', process.version)
try {
  console.log('npm:', execSync('npm --version', { cwd: root, encoding: 'utf8' }).trim())
} catch {
  console.log('npm: 不可用')
}

section('2. 依赖安装状态（package.json vs node_modules 实际版本）')
function installedVersion(pkg) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}
function declaredVersion(pkg) {
  try {
    const all = { ...JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies, ...JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies }
    const v = all[pkg] || ''
    return v.replace(/^[\^~]/, '')
  } catch {
    return ''
  }
}
for (const pkg of ['electron', 'vite', 'better-sqlite3', 'electron-vite']) {
  const declared = declaredVersion(pkg)
  const installed = installedVersion(pkg)
  const ok = installed && installed.startsWith(declared.split('.')[0])
  check(`${pkg}: 声明 ^${declared} / 实际 ${installed ?? '未安装'}`, !!ok, !installed ? '→ 先执行 npm install' : ok ? '' : '大版本不一致 → 重新 npm install')
}

section('3. 原生模块在 Electron ABI 下能否加载（核心检查）')
const electronBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
for (const mod of ['better-sqlite3', 'nodejieba', 'canvas']) {
  if (!installedVersion(mod)) {
    check(`${mod}: 未安装`, false, '→ npm install')
    continue
  }
  const probe = `try{require('${mod}');console.log('OK')}catch(e){console.log('FAIL:'+e.message.split('\\n')[0])}`
  const r = spawnSync(electronBin, ['-e', probe], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30000,
  })
  const out = (r.stdout || '').trim()
  const ok = out.includes('OK')
  check(`${mod} 在 Electron 下加载`, ok, ok ? '' : out || r.stderr?.split('\n')[0] || '无输出')
}

section('4. vite 缓存（vite 5→7 旧缓存会导致 dev 白屏/起不来）')
const viteCache = path.join(root, 'node_modules', '.vite')
if (fs.existsSync(viteCache)) {
  const stat = fs.statSync(viteCache)
  console.log(`存在 node_modules/.vite（mtime ${stat.mtime.toISOString()}）——若由旧版 vite 生成建议删除: rm -rf node_modules/.vite`)
} else {
  console.log('✓ 不存在 node_modules/.vite')
}

section('结果')
if (issues === 0) {
  console.log('全部通过：环境层面没有发现问题。请把「启动 npm run dev 的完整终端输出」发给开发者。')
} else {
  console.log(`发现 ${issues} 个问题。修复顺序：\n  1) rm -rf node_modules/.vite\n  2) npm install\n  3) npm run rebuild:electron\n  4) 重新 npm run dev\n若仍打不开，把本脚本完整输出 + dev 终端报错发给开发者。`)
}
