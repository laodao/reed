/**
 * 能力应用模板 E2E（阶段二）：
 * 1. 5 个官方模板（图像生成/文档翻译/文本转语音/语音转文本/语音复刻）导入 → 发布 → 创建应用（幂等跳过已存在）
 * 2. 真实运行「文档翻译」应用：翻译 + 保存资产（文本分类）端到端验证
 * 3. 结构验证：图像生成应用 start inputs 含 modelId；语音复刻应用图含 voice-clone 节点且 tts 引用其 voiceId
 * 4. 清理：删除 E2E 测试资产；官方应用保留（阶段三菜单重定向目标）
 */
const fs = require('fs')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const DATA_PATH = 'C:\\Users\\daoge\\the-bot'
const DB_PATH = path.join(DATA_PATH, 'the_bot.db')
const TEMPLATE_DIR = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'workflow-templates')

function queryDb(sql, params = []) {
  const db = new DatabaseSync(DB_PATH)
  try {
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

const OFFICIAL_APPS = [
  { tpl: 'image-gen-app.json', appName: '图像生成' },
  { tpl: 'translate-app.json', appName: '文档翻译' },
  { tpl: 'tts-app.json', appName: '文本转语音' },
  { tpl: 'stt-app.json', appName: '语音转文本' },
  { tpl: 'voice-clone-app.json', appName: '语音复刻' },
]

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  const appIds = []

  await step('5 个官方模板导入 → 发布 → 创建应用（幂等：同名应用已存在则跳过）', async () => {
    const r = await page.evaluate(async (officialApps) => {
      const wf = window.electronAPI.workflow
      const app = window.electronAPI.app
      const out = []
      for (const { tpl, appName } of officialApps) {
        // 幂等：同名应用已存在则跳过
        const existing = await app.list({ page: 1, pageSize: 200 })
        const has = (existing.success ? existing.data.items : []).some(a => a.name === appName)
        if (has) { out.push({ appName, skipped: true }); continue }
        const content = await (await fetch(`/src/assets/workflow-templates/${tpl}`)).text()
        const imported = await wf.importDefinition({ content, duplicatePolicy: 'copy' })
        if (!imported.success) return { error: `${appName} 导入失败: ${imported.error}` }
        const published = await wf.publishDefinition({ id: imported.data.id })
        if (!published.success) return { error: `${appName} 发布失败: ${published.error}` }
        const created = await app.createFromWorkflow({ definitionId: imported.data.id, name: appName, channelSession: true, channelShare: false, channelApi: true })
        if (!created.success) return { error: `${appName} 创建应用失败: ${created.error}` }
        out.push({ appName, id: created.data.id, sourceVersion: created.data.sourceVersion })
      }
      return { out }
    }, OFFICIAL_APPS.map(a => ({ tpl: a.tpl, appName: a.appName })))
    if (r.error) throw new Error(r.error)
    for (const o of r.out) {
      if (o.skipped) console.log(`    ${o.appName}：已存在，跳过`)
      else { console.log(`    ${o.appName}：应用 ${o.id} v${o.sourceVersion}`); appIds.push(o.id) }
    }
    assert(r.out.length === OFFICIAL_APPS.length, '模板处理数不足')
  })

  await step('验证 5 个官方应用存在（名称/来源/渠道）', async () => {
    const r = await page.evaluate(async (names) => {
      const app = window.electronAPI.app
      const list = await app.list({ page: 1, pageSize: 200 })
      const items = list.success ? list.data.items : []
      return names.map(n => {
        const a = items.find(x => x.name === n)
        return a ? { name: n, ok: true, sourceKind: a.sourceKind, channelSession: a.channelSession, channelApi: a.channelApi } : { name: n, ok: false }
      })
    }, OFFICIAL_APPS.map(a => a.appName))
    const missing = r.filter(x => !x.ok)
    assert(missing.length === 0, `应用缺失: ${missing.map(x => x.name).join(',')}`)
    for (const x of r) console.log(`    ${x.name}（${x.sourceKind}，会话=${x.channelSession} API=${x.channelApi}）`)
  })

  let translateAssetId = null
  await step('确保默认文本模型可用（DeepSeek 设为默认 provider + 默认模型）', async () => {
    const r = await page.evaluate(async () => {
      const pc = window.electronAPI.providerConfig
      const list = await pc.list()
      const items = list.success ? (list.configs ?? list.data ?? []) : []
      const target = items.find(c => c.name === 'DeepSeek') || items.find(c => c.name?.includes('DeepSeek')) || items[0]
      if (!target) return { error: '无可用 provider 配置' }
      await pc.setDefault(target.id)
      // 默认模型：取配置 models 列表首个文本模型；无则跳过（翻译服务将报"没有可用的文本模型"）
      const textModel = (target.models ?? []).find(m => !m.type || m.type === 'text')
      if (textModel) {
        const up = await pc.update(target.id, { defaultModelId: textModel.id })
        if (!up.success) return { error: `设置默认模型失败: ${up.error}` }
      }
      return { ok: true, name: target.name, defaultModelId: textModel?.id }
    })
    assert(r.ok, `设置默认 provider 失败 ${JSON.stringify(r)}`)
    console.log(`   默认 provider：${r.name}，默认模型：${r.defaultModelId ?? '（未设置）'}`)
  })

  await step('真实运行「文档翻译」应用：翻译 + 保存资产（文本分类）', async () => {
    const r = await page.evaluate(async () => {
      const app = window.electronAPI.app
      const sess = window.electronAPI.appSession
      const list = await app.list({ page: 1, pageSize: 200 })
      const appRec = (list.data.items || []).find(a => a.name === '文档翻译')
      if (!appRec) return { error: '文档翻译应用不存在' }
      const s = await sess.create({ appId: appRec.id })
      if (!s.success) return { error: `创建会话失败: ${s.error}` }
      const started = await sess.start({ sessionId: s.data.id, inputs: { text: 'Hello world, this is an AI workflow test.', targetLang: 'zh', sourceLang: '' } })
      if (!started.success) return { error: `启动失败: ${started.error}` }
      for (let i = 0; i < 60; i++) {
        await new Promise(r2 => setTimeout(r2, 500))
        const msgs = await sess.messages(s.data.id)
        if (!msgs.success) continue
        const cards = (msgs.data ?? []).flatMap(m => m.metadata?.sessionCard ? [{ card: m.metadata.sessionCard.card, content: m.metadata.sessionCard.content ?? m.content ?? '' }] : [])
        const msgCard = cards.find(c => c.card === 'message')
        if (msgCard?.content) return { sessionId: s.data.id, content: msgCard.content }
      }
      return { error: '超时未见结果卡' }
    })
    assert(!r.error && r.content, `翻译应用运行异常 ${JSON.stringify(r)}`)
    assert(r.content.includes('译文：') && /[\u4e00-\u9fff]/.test(r.content), `译文内容异常: ${r.content}`)
    console.log('   译文卡:', r.content.slice(0, 80))
    // 资产落库验证（文本分类「翻译结果」，内容为译文）
    const rows = queryDb(`SELECT id, category, kind, text_content FROM assets WHERE name = '翻译结果' ORDER BY created_at DESC LIMIT 1`)
    assert(rows.length === 1 && rows[0].category === 'text' && rows[0].kind === 'text', `翻译资产未落库 ${JSON.stringify(rows)}`)
    assert(rows[0].text_content.includes('你好'), `翻译资产内容异常 ${rows[0].text_content?.slice(0, 60)}`)
    translateAssetId = rows[0].id
    console.log('   资产落库:', rows[0].id, '|', rows[0].text_content.slice(0, 60))
  })

  await step('结构验证：图像生成含 modelId 输入；语音复刻含 voice-clone 节点且 tts 引用 voiceId', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const app = window.electronAPI.app
      const list = await app.list({ page: 1, pageSize: 200 })
      const items = list.success ? list.data.items : []
      const imgApp = items.find(a => a.name === '图像生成')
      const vcApp = items.find(a => a.name === '语音复刻')
      const g1 = imgApp ? await wf.getDefinition(imgApp.sourceId) : null
      const g2 = vcApp ? await wf.getDefinition(vcApp.sourceId) : null
      const graph1 = g1?.success ? (g1.data.publishedGraph ?? g1.data.draftGraph) : null
      const graph2 = g2?.success ? (g2.data.publishedGraph ?? g2.data.draftGraph) : null
      const start1 = graph1?.nodes?.find(n => n.type === 'start')
      const hasModelId = (start1?.config?.inputs ?? []).some(i => i.key === 'modelId')
      const cloneNode = graph2?.nodes?.find(n => n.type === 'voice-clone')
      const ttsNode = graph2?.nodes?.find(n => n.type === 'tts')
      return {
        imgFound: !!graph1, hasModelId,
        vcFound: !!graph2,
        cloneCfg: cloneNode?.config ?? null,
        ttsVoiceRef: ttsNode?.config?.voiceId ?? null,
      }
    })
    assert(r.imgFound && r.hasModelId, `图像生成模板异常 ${JSON.stringify(r)}`)
    assert(r.vcFound && r.cloneCfg?.samplePath === '{{start.sample.path}}', `语音复刻模板异常 ${JSON.stringify(r)}`)
    assert(r.ttsVoiceRef === '{{clone1.voiceId}}', `复刻→合成引用异常 ${JSON.stringify(r)}`)
    console.log('   图像生成 modelId 输入 ✓ | 语音复刻样本/引用 ✓')
  })

  await step('清理：删除本次运行产生的翻译测试资产', async () => {
    if (!translateAssetId) return
    const r = await page.evaluate(async (assetId) => {
      const d = await window.electronAPI.assets.delete(assetId)
      return d.success
    }, translateAssetId)
    assert(r, '翻译测试资产删除失败')
  })

  console.log('\n===== 能力应用模板（阶段二）E2E 通过 ✅ =====')
  console.log('官方应用已就绪：', OFFICIAL_APPS.map(a => a.appName).join(' / '))
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
