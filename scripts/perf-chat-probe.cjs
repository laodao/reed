/**
 * 聊天页冷启动性能实测（可复现探针，随优化一起保留）
 *
 * 用法：node scripts/perf-chat-probe.cjs [route...]
 *   默认测 /chat 与 /agent-console
 * 输出：outputs/perf-chat-probe.json + 控制台摘要
 *
 * 口径说明（重要）：
 *   - **first**：进程启动后的第一次进入目标路由（keep-alive 冷启动，即用户抱怨的
 *     "第一次打开"）；
 *   - **warm**：回首页再进入（组件已被 keep-alive 缓存），用于对照。
 *   两个口径都量"点下菜单 → 消息列表出现 → 消息 DOM 落定"的端到端耗时，并记录
 *   期间的主线程长任务。
 */
const { _electron: electron } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'outputs', 'perf-chat-probe.json')
const ROUTES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['/chat', '/agent-console']

/** 等应用挂载完成（会话外壳就绪） */
async function waitAppReady(win) {
  await win.waitForSelector('.nav-item', { timeout: 90000 })
}

/** 在页面里量一次"进入路由 → 消息落定" */
async function measure(win, route) {
  return win.evaluate(async (target) => {
    const t0 = performance.now()
    const longTasks = []
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ start: Math.round(e.startTime - t0), dur: Math.round(e.duration) })
    })
    try { po.observe({ entryTypes: ['longtask'] }) } catch { /* 不支持则忽略 */ }

    location.hash = `#${target}`
    const deadline = Date.now() + 30000

    // 1) 消息滚动容器出现（页面骨架已挂载）
    let listAt = null
    while (Date.now() < deadline) {
      if (document.querySelector('.message-list, .stream-body')) { listAt = performance.now(); break }
      await new Promise((r) => setTimeout(r, 5))
    }

    // 2) 消息 DOM 落定（连续 3 帧数量不变）
    let last = -1
    let stable = 0
    while (Date.now() < deadline && stable < 3) {
      await new Promise((r) => requestAnimationFrame(r))
      const n = document.querySelectorAll('.message-item, .agent-turn').length
      if (n === last) stable++
      else { stable = 0; last = n }
    }
    const settledAt = performance.now()
    po.disconnect()
    return {
      route: target,
      toListMs: listAt === null ? null : Math.round(listAt - t0),
      toSettledMs: Math.round(settledAt - t0),
      items: last,
      longTasks,
      longTaskTotal: longTasks.reduce((a, b) => a + b.dur, 0),
      maxLongTask: longTasks.reduce((a, b) => Math.max(a, b.dur), 0),
    }
  }, route)
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), results: {} }

  for (const route of ROUTES) {
    // 每个路由用独立进程实例，保证 first 是真正的冷启动
    const app = await electron.launch({ args: ['.'], cwd: path.join(__dirname, '..') })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await waitAppReady(win)

    const first = await measure(win, route)
    // 回首页后再进入一次（keep-alive 命中）
    await win.evaluate(async () => { location.hash = '#/'; await new Promise((r) => setTimeout(r, 400)) })
    await win.waitForTimeout(300)
    const warm = await measure(win, route)

    report.results[route] = { first, warm }
    console.log(`\n=== ${route} ===`)
    console.log(`  冷启动(首开): 列表 ${first.toListMs}ms / 消息落定 ${first.toSettledMs}ms / 条目 ${first.items} / 长任务合计 ${first.longTaskTotal}ms（最大 ${first.maxLongTask}ms）`)
    console.log(`  二次打开    : 列表 ${warm.toListMs}ms / 消息落定 ${warm.toSettledMs}ms / 条目 ${warm.items} / 长任务合计 ${warm.longTaskTotal}ms（最大 ${warm.maxLongTask}ms）`)
    await app.close()
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n报告已写入 ${path.relative(process.cwd(), OUT)}`)
}

main().catch((e) => {
  console.error('[perf-chat-probe] failed:', e)
  process.exit(1)
})