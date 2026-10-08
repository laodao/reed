/**
 * 信息搜集 M1/M2 真实联网验收脚本（非 vitest；手动运行）
 * 运行：npx tsx scripts/ic-acceptance.ts
 *
 * 主题（刻意避开人口/政策等设计评审示例）：中国高铁营业里程历年数据。
 * 验证的是管线中**不依赖 LLM 的确定性环节在真实网页上的表现**：
 *   真实搜索（免 Key 引擎）→ 真实抓取（SSRF 闸门/限长）→ 正文提取 →
 *   指纹聚类（转载簇 + 主源选择）→ 跨源引句回验。
 * LLM 环节（蓝图起草/抽取/复核/归因）需要应用内模型配置，不在本脚本范围。
 */
import { createSearchEngine, getQuickSearchEngines } from '../src/core/platform/providers/search'
import { executeHttpFetch } from '../src/core/platform/workflow/nodes/http-fetch'
import { htmlToMarkdown } from '../src/core/utils/html-to-markdown'
import { fingerprintText, fingerprintSimilarity } from '../src/shared/utils/info-collection-fingerprint'
import { clusterSources } from '../src/shared/utils/info-collection-cluster'
import { verifyQuote } from '../src/shared/utils/info-collection-quote'
import { normalizeUrl } from '../src/shared/utils/info-collection-url'

const QUERIES = ['中国高铁 营业里程 4.8万公里', '全国铁路 营业里程 高铁 4.8万公里']
const FETCH_LIMIT = 8

interface FetchedDoc {
  url: string
  title: string
  ok: boolean
  text: string
  chars: number
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} 超时 ${ms}ms`)), ms)),
  ])
}

async function searchAll(): Promise<Array<{ title: string; url: string }>> {
  const out: Array<{ title: string; url: string }> = []
  const quick = getQuickSearchEngines() as Array<{ templateId?: string; id?: string }>
  const candidates = ['bing-web', 'baidu', 'google-web']
  console.log(`免 Key 引擎清单：${quick.map(q => q.templateId ?? q.id).join('、') || '（无）'}`)

  for (const templateId of candidates) {
    const engine = createSearchEngine(templateId as never)
    if (!engine) {
      console.log(`[${templateId}] 引擎创建失败，跳过`)
      continue
    }
    for (const query of QUERIES) {
      try {
        const resp = await withTimeout(engine.search(query, 8), 30_000, `[${templateId}] search`)
        if (!resp.success) {
          console.log(`[${templateId}] "${query}" 失败：${resp.error}`)
          continue
        }
        console.log(`[${templateId}] "${query}" → ${resp.results.length} 条结果`)
        for (const r of resp.results) out.push({ title: r.title, url: r.url })
      } catch (e) {
        console.log(`[${templateId}] "${query}" 异常：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // 全部引擎都跑（合并去重后按相关性挑）——首引擎凑数就收手会错过高质量结果
  }
  return out
}

async function main(): Promise<void> {
  console.log('=== 信息搜集真实联网验收：中国高铁营业里程历年数据 ===\n')

  // ① 真实搜索 + URL 规范化去重 + 首页剔除 + 标题相关性过滤
  //    （验收实测：bing-web 对整查询只搜了首个词，返回"中国"的百科/门户——
  //     候选级标题相关性过滤是把跑题源挡在抓取预算外面的第一道闸）
  const raw = await searchAll()
  const seen = new Set<string>()
  const candidates: Array<{ title: string; url: string }> = []
  let homepages = 0
  let irrelevantTitle = 0
  for (const item of raw) {
    const norm = normalizeUrl(item.url)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    try {
      const u = new URL(norm)
      if (u.pathname === '/' || u.pathname === '') {
        homepages += 1
        continue
      }
    } catch {
      continue
    }
    const titleHit = item.title.includes('高铁') || item.title.includes('铁路') || item.title.includes('mileage')
    if (!titleHit) {
      irrelevantTitle += 1
      continue
    }
    candidates.push(item)
  }
  console.log(
    `\n搜索去重后候选：${candidates.length}（原始 ${raw.length}；剔除首页形态 ${homepages}、标题跑题 ${irrelevantTitle}）`,
  )

  // ② 真实抓取 + 正文提取 + 指纹 + 主题相关性过滤
  const docs: FetchedDoc[] = []
  let irrelevant = 0
  for (const c of candidates.slice(0, FETCH_LIMIT)) {
    const norm = normalizeUrl(c.url)
    try {
      const r = await withTimeout(
        executeHttpFetch({ method: 'GET', url: c.url, responseType: 'text', timeoutMs: 20_000 }, AbortSignal.timeout(25_000)),
        30_000,
        'fetch',
      )
      if (!r.ok || r.output.status >= 400) {
        console.log(`✕ [${r.output?.status ?? 'ERR'}] ${norm}`)
        continue
      }
      const text = htmlToMarkdown(r.output.body, c.url).trim()
      // 主题相关性过滤（确定性，可程序化）：正文必须同时含主题词，否则是跑题页（如站点首页/导航页）
      const relevant = text.includes('高铁') && text.includes('公里')
      if (!relevant) irrelevant += 1
      const ok = relevant && text.length >= 300
      docs.push({ url: norm, title: c.title, ok, text, chars: text.length })
      console.log(
        `${ok ? '✓' : relevant ? '△' : '✕'} [${r.output.status}] ${norm}（正文 ${text.length} 字${relevant ? '' : '，跑题页'}${ok ? '' : relevant ? '，过短转手动导入' : ''}）`,
      )
    } catch (e) {
      console.log(`✕ [ERR] ${norm}：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const good = docs.filter(d => d.ok)
  console.log(`\n有效正文：${good.length}/${docs.length}（跑题剔除 ${irrelevant}）`)

  // ③ 转载簇 + 主源
  if (good.length >= 2) {
    const result = clusterSources(
      good.map((d, i) => ({
        sourceId: `s-${i}`,
        fingerprint: JSON.stringify(fingerprintText(d.text)),
        tier: null,
        publishedAt: null,
      })),
    )
    console.log(`\n转载簇：${result.clusters.length} 个`)
    for (const c of result.clusters) {
      const primary = good.find((_, i) => `s-${i}` === c.primaryId)
      console.log(`  簇 ${c.clusterId}（主源：${primary?.url ?? c.primaryId}）`)
      for (const m of c.memberIds) {
        const d = good.find((_, i) => `s-${i}` === m)
        if (d && m !== c.primaryId) console.log(`    └ 佐证 ${d.url}`)
      }
    }
    // 相似度抽样（前两对）
    if (good.length >= 2) {
      const fp0 = fingerprintText(good[0].text)
      const fp1 = fingerprintText(good[1].text)
      console.log(`  相似度抽样 [0]~[1]：${fingerprintSimilarity(fp0, fp1).toFixed(3)}`)
    }
  }

  // ④ 跨源引句回验：从主源（第一篇有效正文）抽含"万公里"的句子，回验到其余各源
  if (good.length >= 2) {
    const primary = good[0]
    const sentence = primary.text.split(/[。！？\n]/).find(s => s.includes('万公里') && s.length >= 12)
    if (sentence) {
      console.log(`\n跨源引句回验（引句出自 ${primary.url}）：`)
      console.log(`  引句："${sentence.trim().slice(0, 80)}"`)
      for (const d of good.slice(1)) {
        const v = verifyQuote(sentence, d.text)
        console.log(`  → [${v.verdict}] ${d.url}（相似度 ${v.ratio.toFixed(3)}）`)
      }
    } else {
      console.log('\n主源正文未找到含"万公里"的句子，跳过跨源回验')
    }
  }

  // ⑤ 结论
  console.log('\n=== 验收结论 ===')
  if (good.length === 0) {
    console.log('✕ 没有任何有效正文——搜索或抓取链路不可用，需要排查引擎配置/网络环境')
    process.exit(1)
  }
  console.log(
    `✓ 确定性管线在真实网页上跑通：搜索 ${raw.length} → 候选 ${candidates.length} → 有效正文 ${good.length}` +
      `；快照/抽取/复核/归因等 LLM 环节需在应用内配置模型后走 ic: 通道验收`,
  )
}

void main()
