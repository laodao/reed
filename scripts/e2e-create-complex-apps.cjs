/**
 * 创建复杂表单工作流应用（测试数据）：3 个工作流 → 发布 → 建应用
 * 前置：electron-vite dev --remote-debugging-port=9222（dev:debug）已启动
 * 覆盖：复杂 start 表单（string/number/boolean/select/json/file）+ message/report 节点 + 版本演进
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

/** 三套复杂表单工作流定义 */
const WORKFLOWS = [
  {
    name: '客服工单提交',
    inputs: [
      { key: 'title', label: '工单标题', type: 'string', required: true },
      { key: 'category', label: '问题分类', type: 'select', required: true, options: [
        { label: '账号问题', value: 'account' }, { label: '支付问题', value: 'payment' }, { label: '产品使用', value: 'usage' }, { label: '其他', value: 'other' },
      ] },
      { key: 'priority', label: '优先级', type: 'select', defaultValue: 'medium', options: [
        { label: '低', value: 'low' }, { label: '中', value: 'medium' }, { label: '高', value: 'high' }, { label: '紧急', value: 'urgent' },
      ] },
      { key: 'budget', label: '预算（元）', type: 'number' },
      { key: 'urgent', label: '是否加急', type: 'boolean', defaultValue: false },
      { key: 'desc', label: '问题描述', type: 'string' },
      { key: 'attachment', label: '相关附件', type: 'file' },
    ],
    graphExtra: (startId, msgId) => [
      { id: msgId, type: 'message', name: '输出回执', position: { x: 320, y: 300 }, config: { content: '工单已受理：{{start.title}}\n分类={{start.category}} 优先级={{start.priority}} 预算={{start.budget}}' } },
    ],
  },
  {
    name: '活动报名表',
    inputs: [
      { key: 'name', label: '姓名', type: 'string', required: true },
      { key: 'phone', label: '手机号', type: 'string', required: true },
      { key: 'session', label: '报名场次', type: 'select', required: true, options: [
        { label: '上午场 09:00', value: 'am' }, { label: '下午场 14:00', value: 'pm' }, { label: '夜场 19:00', value: 'night' },
      ] },
      { key: 'companions', label: '同行人数', type: 'number', defaultValue: 0 },
      { key: 'hotel', label: '是否需要住宿', type: 'boolean', defaultValue: false },
      { key: 'remark', label: '备注', type: 'string' },
    ],
    graphExtra: (startId, msgId) => [
      { id: msgId, type: 'message', name: '报名确认', position: { x: 320, y: 300 }, config: { content: '报名成功：{{start.name}}（{{start.phone}}）场次={{start.session}} 同行={{start.companions}}' } },
    ],
  },
  {
    name: '数据分析请求',
    inputs: [
      { key: 'topic', label: '分析主题', type: 'string', required: true },
      { key: 'source', label: '数据来源', type: 'select', required: true, options: [
        { label: '内部报表', value: 'internal' }, { label: '外部爬取', value: 'crawl' }, { label: '用户上传', value: 'upload' },
      ] },
      { key: 'window', label: '时间范围', type: 'string', defaultValue: '近30天' },
      { key: 'sample', label: '样本量', type: 'number', defaultValue: 1000 },
      { key: 'charts', label: '是否含图表', type: 'boolean', defaultValue: true },
      { key: 'config', label: '高级配置(JSON)', type: 'json' },
      { key: 'rawFile', label: '原始数据文件', type: 'file' },
    ],
    graphExtra: (startId, msgId, reportId) => [
      { id: msgId, type: 'message', name: '受理确认', position: { x: 320, y: 300 }, config: { content: '已受理分析请求：{{start.topic}}（来源={{start.source}}，样本={{start.sample}}）' } },
      { id: reportId, type: 'report', name: '生成报告', position: { x: 560, y: 300 }, config: { title: '分析报告：{{start.topic}}', template: '# {{start.topic}}\n\n- 来源：{{start.source}}\n- 时间范围：{{start.window}}\n- 样本量：{{start.sample}}\n- 含图表：{{start.charts}}\n\n## 结论\n\n（占位结论）', format: 'markdown' } },
    ],
  },
]

function buildGraph(workflow) {
  const start = { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 300 }, config: { inputs: workflow.inputs } }
  const msgId = `msg_${workflow.name}`
  const reportId = `report_${workflow.name}`
  const extras = workflow.graphExtra('start', msgId, reportId)
  const last = extras[extras.length - 1]
  const nodes = [start, ...extras]
  const edges = [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: msgId, kind: 'normal' },
    ...(last.id === reportId ? [{ id: 'e2', sourceNodeId: msgId, targetNodeId: reportId, kind: 'normal' }] : []),
    { id: 'e_end', sourceNodeId: last.id, targetNodeId: 'end', kind: 'normal' },
  ]
  return { version: 1, nodes: [...nodes, { id: 'end', type: 'end', name: '结束', position: { x: last.position.x + 240, y: 300 }, config: {} }], edges }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  const created = []

  for (const wf of WORKFLOWS) {
    const graph = buildGraph(wf)
    await step(`建工作流+发布：${wf.name}（${wf.inputs.length} 个表单字段）`, async () => {
      const r = await page.evaluate(async ({ name, graph }) => {
        const w = window.electronAPI.workflow
        const c = await w.createDefinition({ name })
        if (!c.success) return { error: c.error }
        const s = await w.saveDraft(c.data.id, graph)
        if (!s.success) return { error: s.error }
        const p = await w.publishDefinition({ id: c.data.id })
        if (!p.success) return { error: p.error }
        return { id: c.data.id, version: p.data?.publishedVersion ?? 1 }
      }, { name: wf.name, graph })
      assert(r.id, `失败 ${r.error}`)
      wf.defId = r.id
    })

    await step(`发布为应用：${wf.name}`, async () => {
      const r = await page.evaluate(async (defId) => {
        const resp = await window.electronAPI.app.createFromWorkflow({ definitionId: defId })
        return resp.success ? { id: resp.data.id, version: resp.data.sourceVersion } : { error: resp.error }
      }, wf.defId)
      assert(r.id, `建应用失败 ${r.error}`)
      wf.appId = r.id
      assert(r.version >= 1, 'sourceVersion 异常')
    })
    created.push({ name: wf.name, defId: wf.defId, appId: wf.appId })
  }

  // 版本演进验证：对「客服工单提交」再发布 v2 → 再次 createFromWorkflow → sourceVersion 跟进且应用 id 不变
  await step('版本演进：工作流发布 v2 后应用跟随版本且不新建', async () => {
    const wf = WORKFLOWS[0]
    const r = await page.evaluate(async (defId) => {
      const w = window.electronAPI.workflow
      const p = await w.publishDefinition({ id: defId }) // v2
      if (!p.success) return { error: p.error }
      const app = await window.electronAPI.app.createFromWorkflow({ definitionId: defId })
      return app.success ? { appId: app.data.id, version: app.data.sourceVersion } : { error: app.error }
    }, wf.defId)
    assert(r.appId === wf.appId, `应用被重建（${r.appId} != ${wf.appId}）`)
    assert(r.version === 2, `sourceVersion 未跟进到 2（实际 ${r.version}）`)
  })

  console.log('\n===== 创建结果 =====')
  created.forEach(c => console.log(`${c.name}: def=${c.defId} app=${c.appId}`))
  console.log('\n✅ 复杂表单工作流应用创建完成')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
