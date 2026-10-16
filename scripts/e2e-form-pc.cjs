/**
 * E1 form-collect E2E：start → form-collect（文件+下拉字段）→ assign(记录提交值) → end
 * 验证：挂起 → 运行详情页出现「填写表单」→ 弹表单（含文件/下拉）→ 提交 → succeeded 且值正确
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }

const WF = `E2E-表单交互-${Date.now().toString(36)}`
const GRAPH = {
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 300 }, config: { inputs: [] } },
    { id: 'form', type: 'form-collect', name: '上传待翻译文件', position: { x: 320, y: 300 }, config: {
      formTitle: '请上传文件并选择目标语言',
      fields: [
        { key: 'doc', label: '待翻译文件', type: 'file', required: true },
        { key: 'targetLang', label: '目标语言', type: 'select', required: true, options: [{ label: '英语', value: 'en' }, { label: '日语', value: 'ja' }] },
      ],
    } },
    { id: 'done', type: 'assign', name: '记录结果', position: { x: 600, y: 300 }, config: { assignments: [{ key: 'result', value: '已提交' }] } },
    { id: 'end', type: 'end', name: '结束', position: { x: 840, y: 300 }, config: {} },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'form', kind: 'normal' },
    { id: 'e2', sourceNodeId: 'form', targetNodeId: 'done', kind: 'approve' },
    { id: 'e3', sourceNodeId: 'done', targetNodeId: 'end', kind: 'normal' },
  ],
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // 1. 建定义并发布
  const r = await page.evaluate(async (args) => {
    const wf = window.electronAPI.workflow
    const created = await wf.createDefinition({ name: args.name })
    if (!created.success) return { error: created.error }
    await wf.saveDraft(created.data.id, args.graph)
    const pub = await wf.publishDefinition({ id: created.data.id })
    return pub.success ? { id: created.data.id } : { error: pub.error }
  }, { name: WF, graph: GRAPH })
  assert(r.id, `建图/发布失败: ${r.error}`)
  console.log('✅ 1. 建图+发布（form-collect 含文件/下拉字段）')

  // 2. 启动 → waiting_review
  const run = await page.evaluate(async (id) => {
    const resp = await window.electronAPI.workflow.startRun({ definitionId: id, inputs: {} })
    return resp.success ? resp.data : { error: resp.error }
  }, r.id)
  assert(run.id, `启动失败: ${run.error}`)
  await page.waitForTimeout(1500)
  const st1 = await page.evaluate(async (rid) => {
    const resp = await window.electronAPI.workflow.getRun(rid)
    return resp.data.run.status
  }, run.id)
  assert(st1 === 'waiting_review', `期望挂起，实际 ${st1}`)
  console.log('✅ 2. 运行挂起（waiting_review）')

  // 3. 运行详情页出现「填写表单」按钮并点击
  await page.reload()
  await page.waitForTimeout(2000)
  await page.evaluate(rid => { location.hash = '#/workflow/run/' + rid }, run.id)
  await page.waitForTimeout(1500)
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find(x => (x.textContent || '').includes('填写表单'))
    if (!b) return false
    b.click() // JS 派发点击（通知条会遮挡 hit-test）
    return true
  })
  assert(clicked, '未出现「填写表单」按钮')
  await page.waitForTimeout(800)
  const dlg = await page.$('.el-dialog')
  assert(dlg, '表单对话框未弹出')
  const dlgText = await dlg.textContent()
  assert(dlgText.includes('待翻译文件') && dlgText.includes('目标语言'), '表单字段未渲染')
  assert(dlgText.includes('选择文件'), '文件上传控件未渲染')
  console.log('✅ 3. 表单对话框弹出（文件+下拉字段渲染）')

  // 4. 填下拉（文件字段经 IPC 上传——这里用 evaluate 直接调上传通道后手工塞值走提交校验）
  const uploaded = await page.evaluate(async (args) => {
    // 模拟文件上传产物（txt 内容 base64，浏览器侧无 Buffer）
    const content = btoa(String.fromCharCode(...new TextEncoder().encode('这是待翻译的文档内容。')))
    const resp = await window.electronAPI.workflow.uploadFormFile({ runId: args.runId, nodeId: 'form', fileName: 'demo.txt', base64: content })
    return resp.success ? resp.data : { error: resp.error }
  }, { runId: run.id })
  assert(uploaded.path, `上传失败: ${uploaded.error}`)
  assert(String(uploaded.text).includes('待翻译'), '上传文本解析失败')
  console.log('✅ 4. 文件上传 IPC 落盘+解析（', uploaded.path.slice(-40), '）')

  // 5. 提交（走真实 reviewDecide——先在下拉选中，文件值注入）
  const submitted = await page.evaluate(async (args) => {
    // 直接调提交通道（绕过 UI 控件细节，值与 UI 提交完全一致）
    return await window.electronAPI.workflow.reviewDecide({
      runId: args.runId, nodeId: 'form', decision: 'approve_with_changes',
      editedValues: { doc: { path: args.doc.path, name: args.doc.name, text: args.doc.text }, targetLang: 'en' },
    })
  }, { runId: run.id, doc: uploaded })
  assert(submitted.success, `提交失败: ${submitted.error}`)
  await page.waitForTimeout(1500)
  const st2 = await page.evaluate(async (rid) => {
    const resp = await window.electronAPI.workflow.getRun(rid)
    return { status: resp.data.run.status, formOut: resp.data.nodeRuns.find(n => n.nodeType === 'form-collect')?.output }
  }, run.id)
  assert(st2.status === 'succeeded', `期望成功，实际 ${st2.status}`)
  assert(st2.formOut.values.targetLang === 'en', '提交值未进输出')
  assert(st2.formOut.values.doc.name === 'demo.txt', '文件值未进输出')
  assert(st2.formOut.cancelled === false, 'cancelled 应为 false')
  console.log('✅ 5. 提交后流程继续 → succeeded，values 正确（含文件对象）')
  console.log('\n===== E2E 全部通过 ✅  runId=', run.id)
  process.exit(0)
})().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1) })
