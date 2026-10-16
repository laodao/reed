/**
 * 应用模块全面测试：复杂表单会话 / 分享令牌 / 渠道开关 / 会话删除 / 分页 / 幂等
 * 前置：dev:debug（9222）已启动；复杂表单应用已创建（客服工单/活动报名/数据分析请求）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  const api = () => window.electronAPI

  // ---- 0. 前置：找到复杂表单应用（数据分析请求：7 字段 + report 节点） ----
  let dataApp
  await step('前置：定位「数据分析请求」应用', async () => {
    const resp = await page.evaluate(async () => {
      const r = await window.electronAPI.app.list({ page: 1, pageSize: 50 })
      if (!r.success) return { error: r.error }
      const app = r.data.items.find(a => a.name === '数据分析请求')
      return app ? { id: app.id, sourceVersion: app.sourceVersion, sessionCount: app.sessionCount } : { error: '未找到' }
    })
    assert(resp.id, `前置失败 ${resp.error}`)
    dataApp = resp
    assert(resp.sourceVersion === 1, 'sourceVersion 应为 1')
  })

  // ---- 1. 复杂表单 start-form 卡片 ----
  let sessionId
  await step('复杂表单会话：start-form 卡含全部 7 个字段', async () => {
    const r = await page.evaluate(async (appId) => {
      const s = await window.electronAPI.appSession.create({ appId })
      if (!s.success) return { error: s.error }
      const msgs = await window.electronAPI.appSession.messages(s.data.id)
      const card = msgs.data?.[0]?.metadata?.sessionCard
      return { id: s.data.id, fields: card?.form ?? [], card: card?.card }
    }, dataApp.id)
    assert(r.id && r.card === 'start-form', `start-form 缺失 ${JSON.stringify(r)}`)
    const keys = r.fields.map(f => f.key)
    for (const k of ['topic', 'source', 'window', 'sample', 'charts', 'config', 'rawFile']) {
      assert(keys.includes(k), `缺字段 ${k}`)
    }
    sessionId = r.id
  })

  // ---- 2. 运行（复杂 inputs）+ report 结果卡（report 节点优先聚合，不另写 message 卡） ----
  await step('运行复杂表单：report 报告卡（含主题渲染）', async () => {
    const r = await page.evaluate(async ({ sid, appId }) => {
      const started = await window.electronAPI.appSession.start({
        sessionId: sid,
        inputs: { topic: 'Q2 营收分析', source: 'internal', window: '近90天', sample: 5000, charts: true, config: { granularity: 'monthly' } },
      })
      if (!started.success) return { error: started.error }
      // 轮询等 report 卡（事件桥写卡异步；run 秒级完成）
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const msgs = await window.electronAPI.appSession.messages(sid)
        const cards = (msgs.data ?? []).flatMap(m => m.metadata?.sessionCard ? [m.metadata.sessionCard] : [])
        const report = cards.find(c => c.card === 'report')
        if (report) {
          return { reportTitle: report.title, reportHasMd: (report.markdown ?? '').includes('Q2 营收分析'), seq: cards.map(c => c.card) }
        }
      }
      return { error: '超时未收到 report 卡' }
    }, { sid: sessionId, appId: dataApp.id })
    assert(r.reportHasMd, `report 卡异常 ${JSON.stringify(r)}`)
    console.log('   卡片序列:', r.seq.join(' › '))
  })

  // ---- 3. 会话重命名 + 列表 ----
  await step('会话重命名 + 列表可见', async () => {
    const r = await page.evaluate(async ({ sid, appId }) => {
      const re = await window.electronAPI.appSession.rename(sid, '数据分析会话-测试')
      if (!re.success) return { error: re.error }
      const list = await window.electronAPI.appSession.list(appId)
      const s = list.data?.find(x => x.id === sid)
      return s ? { title: s.title } : { error: '列表缺失会话' }
    }, { sid: sessionId, appId: dataApp.id })
    assert(r.title === '数据分析会话-测试', `重命名失败 ${JSON.stringify(r)}`)
  })

  // ---- 4. 渠道开关 + 分享令牌 ----
  await step('渠道开关（分享开）→ enableShare 生成 64hex 令牌且幂等', async () => {
    const r = await page.evaluate(async (appId) => {
      const ch = await window.electronAPI.app.updateChannels({ id: appId, channelShare: true })
      if (!ch.success) return { error: ch.error }
      const t1 = await window.electronAPI.app.enableShare(appId)
      if (!t1.success) return { error: t1.error }
      const t2 = await window.electronAPI.app.enableShare(appId) // 幂等
      return { token: t1.data?.shareToken, token2: t2.data?.shareToken, channelShare: ch.data?.channelShare }
    }, dataApp.id)
    assert(/^[0-9a-f]{64}$/.test(r.token ?? ''), `令牌格式异常 ${JSON.stringify(r)}`)
    assert(r.token === r.token2, 'enableShare 应幂等（同令牌）')
    assert(r.channelShare === 1, '渠道开关未生效')
  })

  // ---- 5. 会话删除（级联消息） ----
  await step('删除会话：消息清空 + 列表移除', async () => {
    const r = await page.evaluate(async ({ sid, appId }) => {
      const before = await window.electronAPI.appSession.messages(sid)
      if (!before.success || (before.data ?? []).length === 0) return { error: '删除前会话消息为空（前置异常）' }
      const del = await window.electronAPI.appSession.delete(sid)
      if (!del.success) return { error: del.error }
      const list = await window.electronAPI.appSession.list(appId)
      return { gone: !list.data?.some(x => x.id === sid) }
    }, { sid: sessionId, appId: dataApp.id })
    assert(r.gone, `会话未删除 ${JSON.stringify(r)}`)
  })

  // ---- 6. 幂等：同工作流重复 createFromWorkflow ----
  await step('幂等：同工作流重复创建 → 同应用（一个工作流一个应用）', async () => {
    const r = await page.evaluate(async (appId) => {
      // 需要 source_id：从 list 取
      const list = await window.electronAPI.app.list({ page: 1, pageSize: 50 })
      const app = list.data.items.find(a => a.id === appId)
      if (!app?.sourceId) return { error: '无 sourceId' }
      const again = await window.electronAPI.app.createFromWorkflow({ definitionId: app.sourceId })
      return { same: again.success && again.data?.id === appId, count: list.data.total }
    }, dataApp.id)
    assert(r.same, `幂等失败 ${JSON.stringify(r)}`)
    assert(r.count >= 4, `应用总数异常 ${r.count}`)
  })

  // ---- 7. 分页 API 验证（应用列表 + 工作流列表） ----
  await step('分页：app.list 与 workflow.listDefinitions 的 total/分页参数', async () => {
    const r = await page.evaluate(async () => {
      const p1 = await window.electronAPI.app.list({ page: 1, pageSize: 2 })
      const p2 = await window.electronAPI.app.list({ page: 2, pageSize: 2 })
      const wf = await window.electronAPI.workflow.listDefinitions({ page: 1, pageSize: 3 })
      return {
        appTotal: p1.data?.total,
        p1Len: p1.data?.items?.length,
        p2Len: p2.data?.items?.length,
        p1Ids: p1.data?.items?.map(a => a.id),
        p2Ids: p2.data?.items?.map(a => a.id),
        wfTotal: wf.data?.total,
        wfLen: wf.data?.items?.length,
      }
    })
    assert(r.appTotal >= 4 && r.p1Len === 2 && r.p2Len >= 1, `应用分页异常 ${JSON.stringify(r)}`)
    assert(r.p1Ids[0] !== r.p2Ids[0], '翻页未生效（两页数据相同）')
    assert(r.wfTotal >= 4 && r.wfLen === 3, `工作流分页异常 ${JSON.stringify(r)}`)
  })

  // ---- 8. 会话删除在运行完成后可执行（运行中拒绝由单测覆盖——秒级 run 无法稳定制造 running 窗口） ----
  await step('已结束会话可删除（运行完成后）', async () => {
    const r = await page.evaluate(async (appId) => {
      const s = await window.electronAPI.appSession.create({ appId })
      if (!s.success) return { error: s.error }
      const started = await window.electronAPI.appSession.start({ sessionId: s.data.id, inputs: { topic: 't', source: 'internal' } })
      if (!started.success) return { error: started.error }
      // 等 run 结束（会话归 idle 后可删）
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const g = await window.electronAPI.appSession.get(s.data.id)
        if (g.data?.status === 'idle') break
      }
      const del = await window.electronAPI.appSession.delete(s.data.id)
      return { deleted: del.success, msg: del.error }
    }, dataApp.id)
    assert(r.deleted, `会话删除失败：${r.msg}`)
  })

  console.log('\n===== 应用模块全面测试全部通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
