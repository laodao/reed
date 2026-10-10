/**
 * 架构审查：构建 src/ 下的 import 图（含文件级环检测与跨层依赖检测）
 * 只读分析脚本，不修改任何源码。
 */
const fs = require('fs')
const path = require('path')

const ROOT = process.argv[2] || process.cwd()
const SRC = path.join(ROOT, 'src')

const SKIP_DIRS = ['node_modules', 'out', 'dist', '.git', 'coverage']
const SKIP_PATH_PARTS = [path.join('src', 'renderer', 'public')]

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.includes(e.name)) continue
      if (SKIP_PATH_PARTS.some((p) => full.includes(p))) continue
      walk(full, acc)
    } else if (/\.(ts|tsx|vue|js|mjs|cjs)$/.test(e.name)) {
      acc.push(full)
    }
  }
  return acc
}

const ALIASES = {
  '@core/': 'src/core/',
  '@shared/': 'src/shared/',
  '@electron/': 'src/electron/',
  '@renderer/': 'src/renderer/',
  '@web-client/': 'src/web/client/',
  '@main/': 'src/main/',
  '@/': 'src/renderer/src/',
}

const files = walk(SRC)
const fileSet = new Set(files.map((f) => path.resolve(f)))

const EXT_TRY = ['', '.ts', '.tsx', '.js', '.mjs', '.vue', '/index.ts', '/index.tsx', '/index.js', '/index.vue']

function resolveSpec(fromFile, spec) {
  let base = null
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec)
  } else {
    for (const [alias, target] of Object.entries(ALIASES)) {
      if (spec.startsWith(alias)) {
        base = path.resolve(ROOT, target + spec.slice(alias.length))
        break
      }
    }
  }
  if (!base) return null
  for (const ext of EXT_TRY) {
    const cand = base + ext
    if (fileSet.has(cand)) return cand
  }
  // vue SFC without extension already handled; try .vue for aliased dir
  return null
}

const importRe = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g
const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g

const edges = new Map() // file -> [{target, spec, typeOnly}]
const allSpecs = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const list = []
  // detect type-only imports
  const statements = []
  const stmtRe = /(?:^|\n)([ \t]*)(import|export)\s+([\s\S]*?)from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = stmtRe.exec(src))) {
    const [, , , clause, spec] = m
    statements.push({ spec, typeOnly: /^\s*type\b/.test(clause) })
  }
  const sideEffectRe = /(?:^|\n)[ \t]*import\s+['"]([^'"]+)['"]/g
  while ((m = sideEffectRe.exec(src))) statements.push({ spec: m[1], typeOnly: false })
  const dyn = []
  while ((m = dynamicRe.exec(src))) dyn.push(m[1])
  const req = []
  while ((m = requireRe.exec(src))) req.push(m[1])

  for (const s of statements.concat(dyn.map((spec) => ({ spec, typeOnly: false })), req.map((spec) => ({ spec, typeOnly: false })))) {
    const target = resolveSpec(f, s.spec)
    allSpecs.push({ from: f, spec: s.spec, target, typeOnly: s.typeOnly })
    if (target) list.push({ target, spec: s.spec, typeOnly: s.typeOnly })
  }
  edges.set(path.resolve(f), list)
}

// ---- 环检测（Tarjan SCC） ----
let index = 0
const idx = new Map()
const low = new Map()
const onStack = new Set()
const stack = []
const sccs = []

function strongconnect(v) {
  idx.set(v, index)
  low.set(v, index)
  index++
  stack.push(v)
  onStack.add(v)
  for (const e of edges.get(v) || []) {
    const w = e.target
    if (!idx.has(w)) {
      strongconnect(w)
      low.set(v, Math.min(low.get(v), low.get(w)))
    } else if (onStack.has(w)) {
      low.set(v, Math.min(low.get(v), idx.get(w)))
    }
  }
  if (low.get(v) === idx.get(v)) {
    const comp = []
    let w
    do {
      w = stack.pop()
      onStack.delete(w)
      comp.push(w)
    } while (w !== v)
    if (comp.length > 1) sccs.push(comp)
  }
}

for (const f of edges.keys()) if (!idx.has(f)) strongconnect(f)

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

console.log('=== 文件总数 ===', files.length)
console.log('=== 解析到内部 import 的边数 ===', allSpecs.filter((s) => s.target).length)
console.log('=== 未解析的 import 说明符（去掉 node/外部依赖后） ===')
const unresolved = allSpecs.filter((s) => !s.target)
const externals = unresolved.filter((s) => !s.spec.startsWith('.') && !Object.keys(ALIASES).some((a) => s.spec.startsWith(a)))
console.log('  (外部/裸依赖数)', externals.length)
const unresolvedInternal = unresolved.filter((s) => s.spec.startsWith('.') || Object.keys(ALIASES).some((a) => s.spec.startsWith(a)))
console.log('  (内部但未解析数)', unresolvedInternal.length)
fs.writeFileSync(path.join(__dirname, 'unresolved.json'), JSON.stringify(unresolvedInternal.map((u) => ({ from: rel(u.from), spec: u.spec })), null, 2))

console.log('\n=== 循环依赖 SCC（>1 文件）===', sccs.length)
const sccOut = sccs
  .map((c) => c.map(rel))
  .sort((a, b) => b.length - a.length)
fs.writeFileSync(path.join(__dirname, 'cycles.json'), JSON.stringify(sccOut, null, 2))
for (const c of sccOut.slice(0, 60)) {
  console.log(`\n[环 ${c.length} 文件]`)
  for (const f of c) console.log('   ', f)
}

// ---- 跨层依赖检测 ----
function layerOf(p) {
  const r = rel(p)
  if (r.startsWith('src/core/packs/')) return 'core/packs'
  if (r.startsWith('src/core/platform/')) return 'core/platform'
  if (r.startsWith('src/core/database/')) return 'core/database'
  if (r.startsWith('src/core/')) return 'core/other'
  if (r.startsWith('src/shared/')) return 'shared'
  if (r.startsWith('src/electron/')) return 'electron'
  if (r.startsWith('src/renderer/')) return 'renderer'
  if (r.startsWith('src/preload/')) return 'preload'
  if (r.startsWith('src/web/')) return 'web'
  return 'other'
}

const violations = []
for (const [from, list] of edges) {
  for (const e of list) {
    const a = layerOf(from)
    const b = layerOf(e.target)
    violations.push({ from: rel(from), to: rel(e.target), a, b, typeOnly: e.typeOnly })
  }
}

const checks = [
  ['shared->core', (v) => v.a === 'shared' && v.b.startsWith('core')],
  ['shared->renderer', (v) => v.a === 'shared' && v.b === 'renderer'],
  ['core/platform->core/packs', (v) => v.a === 'core/platform' && v.b === 'core/packs'],
  ['core/platform->renderer', (v) => v.a === 'core/platform' && v.b === 'renderer'],
  ['renderer->core', (v) => v.a === 'renderer' && v.b.startsWith('core')],
  ['renderer->electron', (v) => v.a === 'renderer' && v.b === 'electron'],
  ['core/packs->renderer', (v) => v.a === 'core/packs' && v.b === 'renderer'],
]

for (const [name, fn] of checks) {
  const hits = violations.filter(fn)
  console.log(`\n=== 越层：${name} === 共 ${hits.length} 条（运行时 ${hits.filter((h) => !h.typeOnly).length}，仅类型 ${hits.filter((h) => h.typeOnly).length}）`)
  const grouped = {}
  for (const h of hits) {
    const key = `${h.from} -> ${h.to}`
    grouped[key] = grouped[key] || { n: 0, typeOnly: h.typeOnly }
    grouped[key].n++
  }
  const entries = Object.entries(grouped)
  fs.writeFileSync(path.join(__dirname, `violation-${name.replace(/[^a-z0-9]/gi, '_')}.json`), JSON.stringify(entries.map(([k, v]) => ({ edge: k, ...v })), null, 2))
  for (const [k, v] of entries.slice(0, 200)) console.log(`   ${v.typeOnly ? '[type]' : '[runtime]'} ${k}`)
}