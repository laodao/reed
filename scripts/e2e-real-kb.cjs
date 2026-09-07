/**
 * E2E 真实业务测试 #6：知识库真实流程
 * 建库(embedding=qwen3.7-text-embedding @ 阿里百炼 pc_mteg31dt_0uh5wd62p)
 * → /tmp 造真实中文文档 → addDocument 导入 → 轮询向量化完成
 * → 语义检索返回相关结果
 * 输出 KB_RESULT=...
 */
const { chromium } = require('playwright')
const fs = require('fs')

const PC_EMBED = 'pc_mteg31dt_0uh5wd62p'
const MODEL_EMBED = 'qwen3.7-text-embedding'
const DOC_TEXT = `山茶花养护手册

山茶花喜半阴环境，忌烈日暴晒。最适生长温度为18至25摄氏度，冬季低于零下5摄氏度需要移入室内。
浇水遵循见干见湿原则，盆土表面发白后再浇透，避免积水烂根。花期前每月施一次磷钾肥，花后补充氮肥促进新枝。
常见病害有炭疽病和煤烟病，可用甲基托布津800倍液喷施防治。修剪宜在花后进行，剪去病弱枝与交叉枝。
山茶花对土壤酸碱度敏感，宜用pH值5.5至6.5的酸性腐殖土，北方碱性水质地区可每月浇一次硫酸亚铁溶液。`

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const fail = (m) => { console.error('❌', m); process.exit(1) }

  // /tmp 真实文档（留痕用；导入走 addDocument 文本内容通道，与 UI「直接添加文本」一致）
  fs.writeFileSync('/tmp/e2e-real-kb-doc.txt', DOC_TEXT, 'utf-8')

  // 1. 建库
  const kb = await page.evaluate(({ pc, model }) => window.electronAPI.knowledgeBase.create({
    name: 'E2E真实-知识库',
    description: 'e2e 真实向量化测试',
    embeddingModel: model,
    embeddingProvider: 'cloud',
    embeddingDimension: 1024,
    providerConfigId: pc,
    embeddingConfig: { provider: 'cloud', modelId: model, providerConfigId: pc, providerTemplateId: 'bailian' },
  }), { pc: PC_EMBED, model: MODEL_EMBED })
  if (!kb.success) fail('建库: ' + JSON.stringify(kb.error))
  const kbId = kb.data.id
  console.log('知识库:', kbId)

  // 2. 导入文档（真实文本）
  const doc = await page.evaluate(({ kbId, content }) => window.electronAPI.knowledgeBase.addDocument(kbId, {
    name: 'E2E真实-山茶花养护.txt', type: 'text', content,
  }), { kbId, content: DOC_TEXT })
  if (!doc.success) fail('导入文档: ' + JSON.stringify(doc.error))
  const docId = doc.data.doc.id
  console.log('文档:', docId)

  // 3. 轮询向量化完成
  let status = null, errMsg = null, chunkCount = 0
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const docs = await page.evaluate((kbId) => window.electronAPI.knowledgeBase.getDocuments(kbId), kbId)
    const d = docs.success && docs.data.find(x => x.id === docId)
    if (d) { status = d.status; errMsg = d.errorMessage; chunkCount = d.chunkCount || 0 }
    if (status === 'completed' || status === 'failed') break
    await new Promise(r => setTimeout(r, 2000))
  }
  console.log(`向量化: status=${status} chunks=${chunkCount} ${errMsg || ''}`)
  if (status !== 'completed') {
    console.log('KB_RESULT=' + JSON.stringify({ kbId, docId, ok: false, stage: 'vectorize', error: errMsg || status }))
    fail(`向量化失败: ${errMsg || status}（embedding 配置 ${MODEL_EMBED} @ 阿里百炼）`)
  }
  console.log('✅ 向量化完成, 分片数:', chunkCount)

  // 4. 语义检索
  const search = await page.evaluate(({ kbId }) => window.electronAPI.knowledgeBase.search({
    knowledgeBaseId: kbId, query: '山茶花烂根怎么办，多久浇一次水', topK: 3,
  }), { kbId })
  if (!search.success) fail('检索: ' + JSON.stringify(search.error))
  const results = search.data || []
  console.log('检索命中:', results.length)
  for (const r of results.slice(0, 3)) {
    console.log(`  score=${(r.score ?? r.similarity ?? 0).toFixed?.(3) ?? r.score} | ${String(r.content || '').slice(0, 60).replace(/\n/g, ' ')}`)
  }
  const relevant = results.some(r => /浇水|积水|烂根/.test(String(r.content || '')))
  console.log(relevant ? '✅ 语义检索返回相关结果' : '❌ 检索结果不相关')
  console.log('KB_RESULT=' + JSON.stringify({ kbId, docId, chunkCount, hits: results.length, relevant, ok: relevant }))
  await browser.close()
  if (!relevant) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
