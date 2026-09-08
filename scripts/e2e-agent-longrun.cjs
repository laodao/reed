/**
 * Agent 长程任务实测驱动（33 号）：UI 派发 + IPC 核验，直连应用 CDP 9222
 * 子命令：
 *   preflight          —— 检查提供商/模型配置与会话列表
 *   dispatch [sec]     —— 新建会话并派发 33 号任务文本，轮询到本轮结束（默认 420s）
 *   watch              —— 一次性抓取当前对话流状态（工具卡/文本块/运行标记）
 *   approve [titleSub] —— 到 /agent-tasks 批准 pending_review 计划（默认取最新一条）
 *   tree [rootId]      —— IPC 读任务树列表/详情
 *   trajectory <key>   —— IPC 读某个 scopeKey 的轨迹统计
 * 前置：electron-vite dev --remote-debugging-port=9222，页面停在 /agent-console
 */
const { chromium } = require('playwright')

const TASK_TEXT = [
  '我要做一份《2026 年 AI Agent 框架选型报告》，请帮我完成四件事：',
  '1. 联网调研 LangGraph、AutoGen、CrewAI 三个框架的最新版本动态和社区热度，每个框架至少搜索一次；',
  '2. 基于调研给我一页对比总结（架构特点、生态、适用场景）；',
  '3. 把「搜索→网页提取→翻译→汇总」这个调研流程沉淀为一个可复用的工作流草稿；',
  '4. 创建一个任务树，从「长程记忆、多智能体协作、工具生态」三个维度深入对比三者并给出选型建议，我会到任务树页批准后执行。',
].join('\n')

const wf = () => 'window.electronAPI.workflow'

async function getPage() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('http'))
  if (!page) throw new Error('未找到应用窗口页面')
  return { browser, page }
}

/** 页内状态采集器（自包含，禁止外部闭包） */
function collector() {
  const hints = document.querySelector('.input-hint')
  const live = document.querySelectorAll('.live-line').length
  const tools = [...document.querySelectorAll('.tool-card .tool-line')].map((el) => ({
    mark: (el.querySelector('.tool-mark')?.textContent ?? '').trim(),
    name: (el.querySelector('.tool-name')?.textContent ?? '').trim(),
    args: (el.querySelector('.tool-args')?.textContent ?? '').trim().slice(0, 70),
    ms: (el.querySelector('.tool-ms')?.textContent ?? '').trim(),
  }))
  const texts = [...document.querySelectorAll('.text-block')].map((el) => (el.textContent ?? '').trim())
  const notices = [...document.querySelectorAll('.notice-block')].map((el) => (el.textContent ?? '').trim())
  const userBubbles = [...document.querySelectorAll('.user-bubble')].map((el) =>
    (el.textContent ?? '').trim().slice(0, 60),
  )
  return {
    streaming: !!(hints && hints.textContent && hints.textContent.includes('执行中')),
    live,
    tools,
    texts,
    notices,
    userBubbles,
  }
}

function printState(tag, s, fromIdx = 0) {
  console.log(`—— ${tag} —— streaming=${s.streaming} live=${s.live} 工具卡=${s.tools.length} 文本块=${s.texts.length}`)
  for (let i = fromIdx; i < s.tools.length; i++) {
    const t = s.tools[i]
    console.log(`  [${i}] ${t.mark} ${t.name} | ${t.args} | ${t.ms}`)
  }
  if (s.notices.length) console.log('  notices:', s.notices.slice(-3).join(' || ').slice(0, 300))
}

async function cmdPreflight() {
  const { browser, page } = await getPage()
  const cfg = await page.evaluate(async () => {
    const r = await window.electronAPI.providerConfig.list()
    return r.success ? r.data : { error: r.error }
  })
  const enabled = (cfg ?? []).filter((c) => c.isEnabled)
  for (const c of enabled) {
    console.log(`提供商: ${c.name} enabled models=${(c.models ?? []).map((m) => m.id).join(',')}`)
  }
  if (!enabled.length) console.log('⚠ 无启用的提供商')
  const sessions = await page.evaluate(async () => {
    const r = await window.electronAPI.workflow.agentConsole.listSessions()
    return r.success ? r.data : { error: r.error }
  })
  console.log(`console 会话数: ${(sessions ?? []).length}`)
  console.log('当前页面:', await page.url())
  await browser.close()
}

async function cmdDispatch(secArg) {
  const budgetSec = Number(secArg ?? 420)
  const { browser, page } = await getPage()
  // 1. 确保在 agent-console
  if (!page.url().includes('#/agent-console')) {
    await page.evaluate(() => { window.location.hash = '#/agent-console' })
  }
  // 2. 新建会话（选中会话后输入框才渲染，故先点按钮）
  const newBtn = page.getByRole('button', { name: '新建会话' })
  if ((await newBtn.count()) !== 1) {
    const probe = await page.evaluate(() => document.body.innerText.slice(0, 200))
    throw new Error(`「新建会话」按钮不唯一/未找到，页面文本头 200 字：${probe}`)
  }
  await newBtn.click()
  await page.waitForSelector('textarea.draft-input', { timeout: 8000 })
  await page.waitForTimeout(500)
  // 3. 填任务并发送
  const input = page.locator('textarea.draft-input')
  await input.fill(TASK_TEXT)
  const sendBtn = page.getByRole('button', { name: '发送' })
  if ((await sendBtn.count()) !== 1) throw new Error('「发送」按钮不唯一')
  if (!(await sendBtn.isEnabled())) throw new Error('发送按钮未激活（草稿为空？）')
  await sendBtn.click()
  console.log(`已派发任务（${TASK_TEXT.length} 字），轮询上限 ${budgetSec}s`)
  // 4. 轮询至本轮结束
  const deadline = Date.now() + budgetSec * 1000
  let printed = 0
  let stable = 0
  let last = null
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000)
    const s = await page.evaluate(collector)
    if (s.tools.length > printed) {
      printState(`t+${Math.round((budgetSec * 1000 - (deadline - Date.now())) / 1000)}s`, s, printed)
      printed = s.tools.length
    }
    last = s
    if (!s.streaming && s.live === 0) {
      stable++
      if (stable >= 2 && s.tools.length > 0) break
    } else {
      stable = 0
    }
  }
  console.log('=== 派发轮结束快照 ===')
  printState('final', last ?? (await page.evaluate(collector)))
  const texts = (last?.texts ?? []).filter((t) => t.length > 40)
  if (texts.length) {
    console.log('--- 最后一段 agent 文本（前 800 字）---')
    console.log(texts[texts.length - 1].slice(0, 800))
  } else {
    console.log('⚠ 无实质 agent 文本输出')
  }
  await browser.close()
}

async function cmdWatch() {
  const { browser, page } = await getPage()
  const s = await page.evaluate(collector)
  printState('watch', s)
  const texts = (s.texts ?? []).filter((t) => t.length > 40)
  if (texts.length) console.log('--- 最后文本尾 400 字 ---\n' + texts[texts.length - 1].slice(-400))
  await browser.close()
}

async function cmdApprove(titleSub) {
  const { browser, page } = await getPage()
  const roots = await page.evaluate(async () => {
    const r = await window.electronAPI.workflow.listTaskRoots()
    return r.success ? r.data : { error: r.error }
  })
  const pending = (roots ?? []).filter((r) => r.status === 'pending_review')
  console.log(`pending_review 计划数: ${pending.length}`)
  if (!pending.length) {
    console.log('roots:', JSON.stringify((roots ?? []).slice(0, 5).map((r) => ({ id: r.id, title: r.title, status: r.status })), null, 1))
    await browser.close()
    return
  }
  const target = titleSub ? pending.find((r) => r.title.includes(titleSub)) : pending[0]
  if (!target) throw new Error(`未找到标题含「${titleSub}」的待审计划`)
  console.log(`批准目标: ${target.id} ${target.title}`)
  // 走 UI：切到任务树页，点目标行的批准按钮
  await page.evaluate(() => { window.location.hash = '#/agent-tasks' })
  await page.waitForSelector('.el-table__row', { timeout: 8000 })
  const key = (target.title ?? target.id).slice(0, 10)
  const row = page.locator('.el-table__row').filter({ hasText: key })
  await row.waitFor({ state: 'visible', timeout: 8000 })
  const n = await row.count()
  if (n !== 1) throw new Error(`目标行不唯一（${n}）：key=${key}`)
  const approveBtn = row.getByRole('button', { name: '批准计划' })
  if ((await approveBtn.count()) !== 1) throw new Error('该行无「批准计划」按钮')
  await approveBtn.click()
  await page.waitForTimeout(1200)
  const tree = await page.evaluate(async (id) => {
    const r = await window.electronAPI.workflow.getTaskTree(id)
    return r.success ? r.data : { error: r.error }
  }, target.id)
  console.log('批准后树状态:', JSON.stringify({ id: target.id, status: tree?.status ?? tree?.root?.status, error: tree?.error }, null, 1))
  await browser.close()
}

async function cmdTree(rootId) {
  const { browser, page } = await getPage()
  const roots = await page.evaluate(async () => {
    const r = await window.electronAPI.workflow.listTaskRoots()
    return r.success ? r.data : { error: r.error }
  })
  console.log('任务树列表:')
  for (const r of (roots ?? []).slice(0, 8)) {
    console.log(`  ${r.id} [${r.status}] ${r.title} (${r.createdAt ?? ''})`)
  }
  if (rootId) {
    const tree = await page.evaluate(async (id) => {
      const r = await window.electronAPI.workflow.getTaskTree(id)
      return r.success ? r.data : { error: r.error }
    }, rootId)
    const walk = (n, d) => {
      if (!n) return
      console.log(`${'  '.repeat(d)}[${n.status}] ${n.title} score=${n.qualityScore ?? '-'} err=${n.error ? String(n.error).slice(0, 80) : '-'}`)
      for (const c of n.children ?? []) walk(c, d + 1)
    }
    walk(tree?.root ?? tree, 0)
  }
  await browser.close()
}

async function cmdTrajectory(scopeKey) {
  const { browser, page } = await getPage()
  const entries = await page.evaluate(async (k) => {
    const r = await window.electronAPI.workflow.agentConsole.getTrajectory({ scopeKey: k })
    return r.success ? r.data : { error: r.error }
  }, scopeKey)
  const list = entries ?? []
  console.log(`轨迹条数: ${list.length}`)
  const byKind = {}
  for (const e of list) byKind[e.kind ?? '?'] = (byKind[e.kind ?? '?'] ?? 0) + 1
  console.log('按类型:', JSON.stringify(byKind))
  for (const e of list.slice(-10)) {
    console.log(`  #${e.seq ?? '?'} ${e.kind} ${String(e.payload ?? '').slice(0, 100)}`)
  }
  await browser.close()
}

const cmd = process.argv[2]
const arg = process.argv[3]
const runners = { preflight: cmdPreflight, dispatch: cmdDispatch, watch: cmdWatch, approve: cmdApprove, tree: cmdTree, trajectory: cmdTrajectory }
const run = runners[cmd]
if (!run) {
  console.error('用法: node scripts/e2e-agent-longrun.cjs <preflight|dispatch|watch|approve|tree|trajectory> [arg]')
  process.exit(1)
}
run(arg).catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
