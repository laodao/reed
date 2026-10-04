/**
 * 一次性真机探针（只读网络，不写业务数据）：用真实 Pexels Key 验证
 * 「脚本语义 → 场景词典检索词 → 真实素材命中」这条配图相关性链路。
 * 用法：SV_STOCK_KEY=xxx npx tsx -r tsconfig-paths/register scripts/_sv_probe_pexels_live.ts
 */
import { PexelsStockProvider } from '@core/platform/providers/stock'
import { StockMediaService } from '@core/platform/services/stock-media.service'
import { matchSceneRules } from '@shared/types/video-scene-lexicon'

const KEY = process.env.SV_STOCK_KEY || ''
if (!KEY) {
  console.log('缺少 SV_STOCK_KEY')
  process.exit(1)
}

/** 模拟一篇财经短新闻里的镜头语义句 */
const SHOT_LINES = [
  '前8个月产业指数持续回升，制造业产能利用率创年内新高',
  '外贸进出口总额超预期，港口集装箱吞吐量同比大增',
  '社会融资规模增量回落，人民币汇率双向波动',
  'A股三大指数集体收涨，两市成交额破万亿',
]

;(async () => {
  const provider = new PexelsStockProvider({ apiKey: KEY })
  console.log('=== 连接测试 ===')
  console.log(JSON.stringify(await provider.testConnection()))

  for (const line of SHOT_LINES) {
    const rules = matchSceneRules(line, 2)
    console.log(`\n=== 镜头语义：${line} ===`)
    console.log(`命中主题簇：${rules.map(r => r.conceptClass).join(' / ') || '（无）'}`)
    if (rules.length === 0) continue
    for (const kind of ['video', 'image'] as const) {
      const t0 = Date.now()
      const res = await StockMediaService.search({
        provider: 'pexels',
        apiKey: KEY,
        request: {
          query: rules[0].searchQuery,
          kind,
          perPage: 5,
          orientation: 'portrait',
          minWidth: kind === 'video' ? 720 : 720,
          minDurationSec: kind === 'video' ? 3 : undefined,
        },
        altQueries: rules[0].altQueries,
      })
      console.log(`[${kind}] 检索词=${res.queryUsed}｜尝试=${res.queriesTried.join(' > ')}｜命中 ${res.items.length} 条｜${Date.now() - t0}ms`)
      for (const it of res.items.slice(0, 3)) {
        console.log(
          `   - #${it.id} ${it.width}x${it.height}${it.durationSec ? ` ${it.durationSec}s` : ''}｜${it.author || '?'}｜${it.pageUrl}`,
        )
        console.log(`     ${it.downloadUrl}`)
      }
    }
  }

  console.log('\n=== 下载落盘验证（视频 + 图片各一条） ===')
  const tmp = require('os').tmpdir()
  const path = require('path')
  const fs = require('fs')
  const dir = fs.mkdtempSync(path.join(tmp, 'sv-probe-'))
  for (const kind of ['video', 'image'] as const) {
    const res = await StockMediaService.search({
      provider: 'pexels',
      apiKey: KEY,
      request: { query: 'container port terminal', kind, perPage: 2, orientation: 'portrait' },
    })
    if (res.items.length === 0) {
      console.log(`[${kind}] 无候选，跳过`)
      continue
    }
    const d = await StockMediaService.download(res.items[0], { dataPath: dir })
    console.log(`[${kind}] 落盘 ${d.relPath}｜${(d.bytes / 1024).toFixed(0)}KB｜${d.absPath}`)
  }
  fs.rmSync(dir, { recursive: true, force: true })
})().catch(e => {
  console.error('探针失败：', e instanceof Error ? e.message : e)
  process.exit(1)
})