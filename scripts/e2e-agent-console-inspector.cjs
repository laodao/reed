/**
 * Agent 对话右栏验证（37 号实测反馈三项）：
 *   1) 任务树数据会话隔离（切换会话不串台）
 *   2) 知识飞轮/任务树链接就地弹出抽屉（不跳页，仅当前会话内容）
 *   3) 会话上下文「查看」→ 抽屉显示系统提示词快照 + 模型消息历史
 * 前置：electron-vite dev --remote-debugging-port=9222
 */
const { chromium } = require('playwright')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('http'))
  if (!page) throw new Error('未找到应用窗口页面')
  if (!page.url().includes('#/agent-console')) {
    await page.evaluate(() => { window.location.hash = '#/agent-console' })
    await sleep(800)
  }

  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail })
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' —— ' + detail : ''}`)
  }

  // 收集器：会话列表 + 右栏状态（自包含）
  const snapshot = () => page.evaluate(() => {
    const sessions = [...document.querySelectorAll('.session-item')].map((el) => ({
      label: (el.querySelector('.session-label')?.textContent ?? '').trim(),
      active: el.classList.contains('active'),
    }))
    const inspCards = [...document.querySelectorAll('.inspector-pane .insp-card .tree-title')].map((el) => (el.textContent ?? '').trim())
    const inspEmpty = [...document.querySelectorAll('.inspector-pane .insp-empty')].map((el) => (el.textContent ?? '').trim())
    const inspLinks = [...document.querySelectorAll('.inspector-pane .insp-link')].map((el) => (el.textContent ?? '').trim())
    return { sessions, inspCards, inspEmpty, inspLinks, url: location.hash }
  })

  const drawerState = () => page.evaluate(() => {
    const drawer = document.querySelector('.el-drawer')
    if (!drawer || !drawer.closest('.el-overlay')?.style.display !== undefined ? !document.querySelector('.el-drawer:not([style*="display: none"])') : false) {}
    const visible = !!document.querySelector('.el-overlay:not([style*="display: none"]) .el-drawer')
    const title = (document.querySelector('.el-drawer__title, .el-drawer__header')?.textContent ?? '').trim()
    const rows = [...document.querySelectorAll('.drawer-tree-row')].map((el) => (el.textContent ?? '').trim().slice(0, 50))
    const memGroups = [...document.querySelectorAll('.drawer-mem-group .drawer-sec-hint')].map((el) => (el.textContent ?? '').trim())
    const memItems = [...document.querySelectorAll('.drawer-mem-group .insp-item')].map((el) => (el.textContent ?? '').trim().slice(0, 50))
    const ctxMsgs = [...document.querySelectorAll('.ctx-msg')].map((el) => ({
      role: (el.querySelector('.el-tag')?.textContent ?? '').trim(),
      head: (el.querySelector('.ctx-msg-seq')?.textContent ?? '').trim(),
    }))
    const sysPrompt = (document.querySelector('.drawer-pre')?.textContent ?? '').trim().slice(0, 80)
    const hint = [...document.querySelectorAll('.el-drawer .drawer-sec-hint')].map((el) => (el.textContent ?? '').trim())
    const empty = [...document.querySelectorAll('.el-drawer .insp-empty')].map((el) => (el.textContent ?? '').trim())
    return { visible, title, rows, memGroups, memItems, ctxMsgs, sysPrompt, hint, empty }
  })

  async function selectSession(label) {
    await page.evaluate((l) => {
      const items = [...document.querySelectorAll('.session-item')]
      const hit = items.find((el) => (el.querySelector('.session-label')?.textContent ?? '').trim() === l)
      if (hit) hit.click()
    }, label)
    await sleep(1200) // 等轨迹+对话并行加载与右栏装配
  }

  console.log('=== 1. 会话列表与初始状态 ===')
  let snap = await snapshot()
  console.log('会话:', snap.sessions.map((s) => `${s.label}${s.active ? '*' : ''}`).join(' | '))
  check('至少存在 2 个会话（串台验证前提）', snap.sessions.length >= 2, `共 ${snap.sessions.length} 个`)

  // === 2. 逐会话选人，采集各自右栏任务树 ===
  console.log('=== 2. 会话隔离验证 ===')
  const perSession = {}
  for (const s of snap.sessions.slice(0, 3)) {
    await selectSession(s.label)
    const cur = await snapshot()
    perSession[s.label] = { cards: cur.inspCards, empty: cur.inspEmpty }
    console.log(`会话「${s.label}」右栏树卡=${JSON.stringify(cur.inspCards)} 空态=${JSON.stringify(cur.inspEmpty.filter((e) => e.includes('任务规划')))}`)
  }
  // 有树的会话与无树会话互不串台：无树会话必须显示空态而不是别家的树
  const withTree = Object.entries(perSession).filter(([, v]) => v.cards.length > 0)
  const withoutTree = Object.entries(perSession).filter(([, v]) => v.cards.length === 0)
  check('有树会话右栏能显示树', withTree.length >= 1, withTree.map(([k]) => k).join(',') || '无')
  const noLeak = withoutTree.every(([, v]) => v.empty.some((e) => e.includes('尚未创建任务规划')))
  check('无树会话显示空态（不串别家树）', noLeak, withoutTree.map(([k]) => k).join(',') || '所有会话都有树')

  // === 3. 在有树的会话验证三个抽屉 ===
  if (withTree.length > 0) {
    const treeSession = withTree[0][0]
    await selectSession(treeSession)
    console.log(`=== 3. 抽屉验证（会话「${treeSession}」） ===`)

    // 3a. 任务树抽屉
    await page.evaluate(() => {
      const links = [...document.querySelectorAll('.inspector-pane .insp-link')]
      links.find((el) => (el.textContent ?? '').trim() === '任务树')?.click()
    })
    await sleep(600)
    let d = await drawerState()
    check('任务树链接弹出抽屉且不跳页', d.visible && (await snapshot()).url.includes('agent-console'), d.title)
    check('任务树抽屉有层级节点', d.rows.length > 0, `${d.rows.length} 行`)
    console.log('  树行:', d.rows.slice(0, 5).join(' / '))
    // 关抽屉
    await page.keyboard.press('Escape')
    await sleep(400)

    // 3b. 知识飞轮抽屉
    await page.evaluate(() => {
      const links = [...document.querySelectorAll('.inspector-pane .insp-link')]
      links.find((el) => (el.textContent ?? '').trim() === '知识飞轮')?.click()
    })
    await sleep(600)
    d = await drawerState()
    check('知识飞轮链接弹出抽屉且不跳页', d.visible && (await snapshot()).url.includes('agent-console'), d.title)
    console.log(`  记忆分组: ${JSON.stringify(d.memGroups)} 条目数: ${d.memItems.length}`)
    check('知识飞轮抽屉展示记忆分组或空态说明', d.memGroups.length > 0 || d.empty.length > 0, `${d.memGroups.length} 组`)
    await page.keyboard.press('Escape')
    await sleep(400)

    // 3c. 上下文抽屉
    await page.evaluate(() => {
      const links = [...document.querySelectorAll('.inspector-pane .insp-link')]
      links.find((el) => (el.textContent ?? '').trim() === '查看')?.click()
    })
    await sleep(1200) // 等 ac:get-context
    d = await drawerState()
    check('「查看」弹出上下文抽屉且不跳页', d.visible && (await snapshot()).url.includes('agent-console'), d.title)
    check('上下文抽屉显示模型消息历史', d.ctxMsgs.length > 0, `${d.ctxMsgs.length} 条: ${d.ctxMsgs.slice(0, 4).map((m) => m.role).join(',')}`)
    check('上下文抽屉有系统提示词区', d.hint.some((h) => h.includes('系统提示词')), d.sysPrompt.slice(0, 40))
    console.log('  系统提示词预览:', d.sysPrompt)
  } else {
    console.log('（所有会话都无任务树，抽屉树分支跳过——仍验证上下文/记忆抽屉）')
    await page.evaluate(() => {
      const links = [...document.querySelectorAll('.inspector-pane .insp-link')]
      links.find((el) => (el.textContent ?? '').trim() === '查看')?.click()
    })
    await sleep(1200)
    const d = await drawerState()
    check('「查看」弹出上下文抽屉且不跳页', d.visible && (await snapshot()).url.includes('agent-console'), d.title)
    check('上下文抽屉显示模型消息历史', d.ctxMsgs.length > 0, `${d.ctxMsgs.length} 条`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n==== 结果: ${results.length - failed.length}/${results.length} 通过 ====`)
  await browser.close()
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('验证脚本失败:', e)
  process.exit(2)
})
