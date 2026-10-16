/**
 * 启动性能探针（可复现基准，随优化一起保留）
 *
 * 用法：node scripts/perf-boot-probe.cjs
 * 输出：outputs/perf-boot-probe.json + 控制台摘要
 *
 * 量什么：
 *   1) **launch → 首次可交互**（`.nav-item` 出现）；
 *   2) **首帧出现在屏幕上**的时刻——用"能否截到图"判断，而不是 rAF：
 *      唤醒窗口在首帧之前是隐藏状态，Chromium 在隐藏窗口里不触发 rAF，
 *      用 rAF 量首帧会永远量不到；
 *   3) 主进程 `boot-trace` 分段日志（数据库/包内核/工作流子系统各占多久）。
 *
 * 为什么必须留着这个脚本：2026-09 排查"AI 对话第一次打开特别慢"时，正是它把
 * "应用启动 9.6s"拆成了"主进程 1.8s + 渲染进程首帧前的一次同步存储访问 6.1s"。
 * 只量路由内耗时会完全看不到这段（它发生在 app.mount 前后、路由测量窗口之外）。
 */
const { _electron: electron } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'outputs', 'perf-boot-probe.json')

/** 轮询截图直到成功 → 代表屏幕上真的出现了画面 */
async function waitFirstFrame(win, t0, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const buf = await win.screenshot({ timeout: 1200 })
      return { atMs: Date.now() - t0, bytes: buf.length }
    } catch {
      /* 还没有画面，继续等 */
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  return null
}

async function main() {
  const t0 = Date.now()
  const app = await electron.launch({ args: ['.'], cwd: path.join(__dirname, '..'), logs: 'pipe' })
  const mainOut = []
  try {
    app.process().stdout?.on('data', (c) => mainOut.push(String(c)))
    app.process().stderr?.on('data', () => { /* 忽略 */ })
  } catch { /* 忽略 */ }

  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')

  const firstFrame = await waitFirstFrame(win, t0)

  await win.waitForSelector('.nav-item', { timeout: 90000 })
  const interactiveAt = Date.now() - t0

  const pageInfo = await win.evaluate(() => ({
    performanceNowMs: Math.round(performance.now()),
    domContentLoadedMs: Math.round(performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0),
    firstPaintMs: Math.round(performance.getEntriesByType('paint').find((p) => p.name === 'first-paint')?.startTime ?? 0),
    mountTrace: window.__BOOT_TRACE__ ?? null,
  }))

  const bootTrace = mainOut
    .join('')
    .split(/\r?\n/)
    .filter((l) => l.includes('boot-trace'))

  const report = { generatedAt: new Date().toISOString(), launchToFirstFrameMs: firstFrame?.atMs ?? null, firstFrameBytes: firstFrame?.bytes ?? null, launchToInteractiveMs: interactiveAt, pageInfo, bootTrace }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')

  console.log(`launch → 首帧可见 : ${firstFrame ? firstFrame.atMs + 'ms' : 'n/a'}`)
  console.log(`launch → 可交互   : ${interactiveAt}ms`)
  console.log(`页面 performance.now() : ${pageInfo.performanceNowMs}ms`)
  if (pageInfo.mountTrace) {
    console.log('渲染进程挂载分段:')
    for (const m of pageInfo.mountTrace) console.log(`   ${m.label}  ${m.ms}ms  (at ${m.atMs}ms)`)
  }
  if (bootTrace.length > 0) {
    console.log('主进程分段:')
    for (const l of bootTrace) console.log('   ' + l.replace(/^\[boot-trace\]\s*/, ''))
  }
  console.log(`\n报告已写入 ${path.relative(process.cwd(), OUT)}`)
  await app.close()
}

main().catch((e) => { console.error('[perf-boot-probe] failed:', e); process.exit(1) })