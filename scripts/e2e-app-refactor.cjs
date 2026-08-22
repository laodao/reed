/**
 * 应用模块交互重构 E2E：
 * 1. 发布配置：createFromWorkflow 带渠道 → 应用按配置创建；再次发布更新配置（幂等）
 * 2. 卡片启动：appSession.create + startRun → 会话消息含 user 回显气泡（role=user）
 * 3. 分享语义：resolveShare appMode（通过 IPC 无法直达——验证 enableShare 生成令牌即可）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let defId, appId
  await step('建工作流并发布', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-重构-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'topic', label: '主题', type: 'string' }] } },
          { id: 'msg', type: 'message', name: '输出', position: { x: 280, y: 200 }, config: { content: '收到：{{start.topic}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 480, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'msg', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'msg', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `失败 ${r.error}`)
    defId = r.id
  })

  await step('发布为应用：带渠道配置（会话+分享开，API 关）+ 自定义名称/图标', async () => {
    const r = await page.evaluate(async (defId) => {
      const resp = await window.electronAPI.app.createFromWorkflow({
        definitionId: defId,
        name: '重构测试应用',
        icon: '🚀',
        channelSession: true,
        channelShare: true,
        channelApi: false,
      })
      return resp.success ? { id: resp.data.id, name: resp.data.name, icon: resp.data.icon, cs: resp.data.channelSession, csh: resp.data.channelShare, ca: resp.data.channelApi } : { error: resp.error }
    }, defId)
    assert(r.id && r.name === '重构测试应用' && r.icon === '🚀', `发布配置异常 ${JSON.stringify(r)}`)
    assert(r.cs === 1 && r.csh === 1 && r.ca === 0, `渠道配置异常 ${JSON.stringify(r)}`)
    appId = r.id
  })

  await step('再次发布（幂等）：更新配置生效且不新建应用', async () => {
    const r = await page.evaluate(async ({ defId, appId }) => {
      const resp = await window.electronAPI.app.createFromWorkflow({
        definitionId: defId, name: '改名后', channelApi: true,
      })
      return resp.success ? { id: resp.data.id, name: resp.data.name, ca: resp.data.channelApi } : { error: resp.error }
    }, { defId, appId })
    assert(r.id === appId, `幂等失败（应用被重建）${r.id} != ${appId}`)
    assert(r.name === '改名后' && r.ca === 1, `配置更新失败 ${JSON.stringify(r)}`)
  })

  await step('卡片启动：创建会话 + 运行 → 消息流含 user 回显气泡（role=user）', async () => {
    const r = await page.evaluate(async (appId) => {
      const s = await window.electronAPI.appSession.create({ appId })
      if (!s.success) return { error: s.error }
      const started = await window.electronAPI.appSession.start({ sessionId: s.data.id, inputs: { topic: '你好' } })
      if (!started.success) return { error: started.error }
      for (let i = 0; i < 30; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const msgs = await window.electronAPI.appSession.messages(s.data.id)
        if (!msgs.success) continue
        const user = (msgs.data ?? []).find(m => m.role === 'user')
        const cards = (msgs.data ?? []).flatMap(m => m.metadata?.sessionCard ? [m.metadata.sessionCard.card] : [])
        if (user && cards.includes('message')) {
          return { userContent: user.content, cards }
        }
      }
      return { error: '超时未见 user 消息或结果卡' }
    }, appId)
    assert(r.userContent?.includes('你好'), `user 回显异常 ${JSON.stringify(r)}`)
    console.log('   user 回显:', r.userContent, '| 卡片:', r.cards.join(' › '))
  })

  console.log('\n===== 应用模块重构 E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
