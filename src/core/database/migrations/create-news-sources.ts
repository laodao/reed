/**
 * 新闻来源表 + 预置数据迁移（内置应用 C1 早报 / C2 周报的数据源）
 * @module core/database/migrations/create-news-sources
 * @description
 *  - news_sources 表：主题（topic_id）+ 名称 + URL + 内置标记 + 启停 + 排序
 *  - 预置 5 主题 × 15 源（国外 top10 + 国内 top5；user_id=NULL + is_builtin=1，禁删；用户可增删自有源）
 *  - 幂等：按固定 id 查重（01-15 序号稳定）；双端（Electron/Web）注册
 *  - 与 shared/types/news-topics.ts 的 NEWS_TOPICS 保持一致（同 id 顺序）
 */

import type { DataSource } from 'typeorm'

/** 预置新闻源（每主题 15 个：国外 10 + 国内 5；id 序号 = 排序权重） */
const BUILTIN_SOURCES: Array<{ id: string; topicId: string; name: string; url: string }> = [
  // ===== 人工智能 =====
  { id: 'ns_ai_01', topicId: 'ai', name: 'MIT Technology Review (AI)', url: 'https://www.technologyreview.com/topic/artificial-intelligence/' },
  { id: 'ns_ai_02', topicId: 'ai', name: 'The Verge (AI)', url: 'https://www.theverge.com/ai-artificial-intelligence' },
  { id: 'ns_ai_03', topicId: 'ai', name: 'TechCrunch (AI)', url: 'https://techcrunch.com/category/artificial-intelligence/' },
  { id: 'ns_ai_04', topicId: 'ai', name: 'Wired (AI)', url: 'https://www.wired.com/tag/artificial-intelligence/' },
  { id: 'ns_ai_05', topicId: 'ai', name: 'VentureBeat (AI)', url: 'https://venturebeat.com/category/ai/' },
  { id: 'ns_ai_06', topicId: 'ai', name: 'Ars Technica (AI)', url: 'https://arstechnica.com/ai/' },
  { id: 'ns_ai_07', topicId: 'ai', name: 'IEEE Spectrum (AI)', url: 'https://spectrum.ieee.org/topic/artificial-intelligence' },
  { id: 'ns_ai_08', topicId: 'ai', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/' },
  { id: 'ns_ai_09', topicId: 'ai', name: 'OpenAI Blog', url: 'https://openai.com/news/' },
  { id: 'ns_ai_10', topicId: 'ai', name: 'Nature (AI)', url: 'https://www.nature.com/subjects/artificial-intelligence' },
  { id: 'ns_ai_11', topicId: 'ai', name: '机器之心', url: 'https://www.jiqizhixin.com/' },
  { id: 'ns_ai_12', topicId: 'ai', name: '量子位', url: 'https://www.qbitai.com/' },
  { id: 'ns_ai_13', topicId: 'ai', name: '新智元', url: 'https://www.aiera.com.cn/' },
  { id: 'ns_ai_14', topicId: 'ai', name: '36氪 (AI)', url: 'https://36kr.com/search/articles/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD' },
  { id: 'ns_ai_15', topicId: 'ai', name: '雷锋网 (AI)', url: 'https://www.leiphone.com/category/ai' },

  // ===== 全球财经 =====
  { id: 'ns_fin_01', topicId: 'finance', name: 'Bloomberg', url: 'https://www.bloomberg.com/' },
  { id: 'ns_fin_02', topicId: 'finance', name: 'Reuters (Business)', url: 'https://www.reuters.com/business/' },
  { id: 'ns_fin_03', topicId: 'finance', name: 'WSJ', url: 'https://www.wsj.com/' },
  { id: 'ns_fin_04', topicId: 'finance', name: 'Financial Times', url: 'https://www.ft.com/' },
  { id: 'ns_fin_05', topicId: 'finance', name: 'CNBC', url: 'https://www.cnbc.com/' },
  { id: 'ns_fin_06', topicId: 'finance', name: 'MarketWatch', url: 'https://www.marketwatch.com/' },
  { id: 'ns_fin_07', topicId: 'finance', name: 'The Economist', url: 'https://www.economist.com/' },
  { id: 'ns_fin_08', topicId: 'finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/' },
  { id: 'ns_fin_09', topicId: 'finance', name: 'Investing.com', url: 'https://www.investing.com/' },
  { id: 'ns_fin_10', topicId: 'finance', name: 'Barron\'s', url: 'https://www.barrons.com/' },
  { id: 'ns_fin_11', topicId: 'finance', name: '财新网', url: 'https://www.caixin.com/' },
  { id: 'ns_fin_12', topicId: 'finance', name: '华尔街见闻', url: 'https://wallstreetcn.com/' },
  { id: 'ns_fin_13', topicId: 'finance', name: '第一财经', url: 'https://www.yicai.com/' },
  { id: 'ns_fin_14', topicId: 'finance', name: '东方财富', url: 'https://www.eastmoney.com/' },
  { id: 'ns_fin_15', topicId: 'finance', name: '新浪财经', url: 'https://finance.sina.com.cn/' },

  // ===== 新能源 =====
  { id: 'ns_eng_01', topicId: 'energy', name: 'Reuters (Energy)', url: 'https://www.reuters.com/business/energy/' },
  { id: 'ns_eng_02', topicId: 'energy', name: 'BloombergNEF', url: 'https://about.bnef.com/blog/' },
  { id: 'ns_eng_03', topicId: 'energy', name: 'Electrek', url: 'https://electrek.co/' },
  { id: 'ns_eng_04', topicId: 'energy', name: 'CleanTechnica', url: 'https://cleantechnica.com/' },
  { id: 'ns_eng_05', topicId: 'energy', name: 'PV-Tech', url: 'https://www.pv-tech.org/' },
  { id: 'ns_eng_06', topicId: 'energy', name: 'Energy Storage News', url: 'https://www.energy-storage.news/' },
  { id: 'ns_eng_07', topicId: 'energy', name: 'Solar Power World', url: 'https://www.solarpowerworldonline.com/' },
  { id: 'ns_eng_08', topicId: 'energy', name: 'Windpower Monthly', url: 'https://www.windpowermonthly.com/' },
  { id: 'ns_eng_09', topicId: 'energy', name: 'Utility Dive', url: 'https://www.utilitydive.com/' },
  { id: 'ns_eng_10', topicId: 'energy', name: 'Canary Media', url: 'https://www.canarymedia.com/' },
  { id: 'ns_eng_11', topicId: 'energy', name: '北极星电力网', url: 'https://news.bjx.com.cn/' },
  { id: 'ns_eng_12', topicId: 'energy', name: '高工锂电', url: 'https://www.gg-lb.com/' },
  { id: 'ns_eng_13', topicId: 'energy', name: 'OFweek (太阳能)', url: 'https://solar.ofweek.com/' },
  { id: 'ns_eng_14', topicId: 'energy', name: '能见Eknower', url: 'https://www.nengapp.com/' },
  { id: 'ns_eng_15', topicId: 'energy', name: '中国能源报', url: 'https://www.cnenergynews.cn/' },

  // ===== 科技产业 =====
  { id: 'ns_tec_01', topicId: 'tech', name: 'The Verge', url: 'https://www.theverge.com/' },
  { id: 'ns_tec_02', topicId: 'tech', name: 'TechCrunch', url: 'https://techcrunch.com/' },
  { id: 'ns_tec_03', topicId: 'tech', name: 'Wired', url: 'https://www.wired.com/' },
  { id: 'ns_tec_04', topicId: 'tech', name: 'Ars Technica', url: 'https://arstechnica.com/' },
  { id: 'ns_tec_05', topicId: 'tech', name: 'CNET', url: 'https://www.cnet.com/' },
  { id: 'ns_tec_06', topicId: 'tech', name: 'Engadget', url: 'https://www.engadget.com/' },
  { id: 'ns_tec_07', topicId: 'tech', name: '9to5Mac', url: 'https://9to5mac.com/' },
  { id: 'ns_tec_08', topicId: 'tech', name: 'ZDNet', url: 'https://www.zdnet.com/' },
  { id: 'ns_tec_09', topicId: 'tech', name: 'The Next Web', url: 'https://thenextweb.com/' },
  { id: 'ns_tec_10', topicId: 'tech', name: 'VentureBeat', url: 'https://venturebeat.com/' },
  { id: 'ns_tec_11', topicId: 'tech', name: '36氪', url: 'https://36kr.com/' },
  { id: 'ns_tec_12', topicId: 'tech', name: '虎嗅', url: 'https://www.huxiu.com/' },
  { id: 'ns_tec_13', topicId: 'tech', name: '极客公园', url: 'https://www.geekpark.net/' },
  { id: 'ns_tec_14', topicId: 'tech', name: '爱范儿', url: 'https://www.ifanr.com/' },
  { id: 'ns_tec_15', topicId: 'tech', name: '钛媒体', url: 'https://www.tmtpost.com/' },

  // ===== 国际时政 =====
  { id: 'ns_wld_01', topicId: 'world', name: 'BBC', url: 'https://www.bbc.com/news' },
  { id: 'ns_wld_02', topicId: 'world', name: 'Reuters (World)', url: 'https://www.reuters.com/world/' },
  { id: 'ns_wld_03', topicId: 'world', name: 'AP News', url: 'https://apnews.com/' },
  { id: 'ns_wld_04', topicId: 'world', name: 'The Guardian', url: 'https://www.theguardian.com/international' },
  { id: 'ns_wld_05', topicId: 'world', name: 'NYT', url: 'https://www.nytimes.com/' },
  { id: 'ns_wld_06', topicId: 'world', name: 'CNN', url: 'https://edition.cnn.com/' },
  { id: 'ns_wld_07', topicId: 'world', name: 'Al Jazeera', url: 'https://www.aljazeera.com/' },
  { id: 'ns_wld_08', topicId: 'world', name: 'DW (Top Stories)', url: 'https://www.dw.com/en/top-stories/s-9097' },
  { id: 'ns_wld_09', topicId: 'world', name: 'France 24', url: 'https://www.france24.com/en/' },
  { id: 'ns_wld_10', topicId: 'world', name: 'The Times of India', url: 'https://timesofindia.indiatimes.com/' },
  { id: 'ns_wld_11', topicId: 'world', name: '联合早报', url: 'https://www.zaobao.com.sg/' },
  { id: 'ns_wld_12', topicId: 'world', name: '澎湃国际', url: 'https://www.thepaper.cn/' },
  { id: 'ns_wld_13', topicId: 'world', name: '环球网', url: 'https://world.huanqiu.com/' },
  { id: 'ns_wld_14', topicId: 'world', name: '参考消息', url: 'https://www.cankaoxiaoxi.com/' },
  { id: 'ns_wld_15', topicId: 'world', name: '观察者网', url: 'https://www.guancha.cn/' },
]

/** 预置新闻主题（id 与 news_sources.topic_id 对应；可被用户新增扩展） */
const BUILTIN_TOPICS: Array<{ id: string; name: string }> = [
  { id: 'ai', name: '人工智能' },
  { id: 'finance', name: '全球财经' },
  { id: 'energy', name: '新能源' },
  { id: 'tech', name: '科技产业' },
  { id: 'world', name: '国际时政' },
]

export async function createNewsSources(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  // 0. 主题表（news_topics）：主题入库，设置界面可增删自定义主题
  if (!(await checkTableExists(ds, 'news_topics', isPg))) {
    await ds.query(`
      CREATE TABLE news_topics (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        name        ${vc} NOT NULL,
        is_builtin  INTEGER DEFAULT 0,
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-news-sources] 表 news_topics 创建完成')
  }
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_news_topics_user ON news_topics (user_id)`)
  // 预置 5 内置主题（幂等：缺失补插；名称同步更新）
  // 占位符按方言生成：PG 只认 $n（node-pg 不做 ? → $n 转换，? 在 PG 是 jsonb 运算符）
  const ph = (n: number) => (isPg ? `$${n}` : '?')
  {
    const now = new Date().toISOString()
    let inserted = 0
    for (const t of BUILTIN_TOPICS) {
      const existing = await ds.query(
        isPg ? `SELECT 1 FROM news_topics WHERE id = $1 LIMIT 1` : `SELECT 1 FROM news_topics WHERE id = ? LIMIT 1`,
        [t.id]
      )
      if (existing.length === 0) {
        await ds.query(
          `INSERT INTO news_topics (id, user_id, name, is_builtin, created_at, updated_at) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)})`,
          [t.id, null, t.name, 1, now, now]
        )
        inserted++
      } else {
        await ds.query(`UPDATE news_topics SET name = ${ph(1)}, updated_at = ${ph(2)} WHERE id = ${ph(3)}`, [t.name, now, t.id])
      }
    }
    console.log(`[create-news-sources] 预置主题完成：新增 ${inserted} 个内置主题（共 ${BUILTIN_TOPICS.length}）`)
  }

  // 1. 建表（幂等）
  if (!(await checkTableExists(ds, 'news_sources', isPg))) {
    await ds.query(`
      CREATE TABLE news_sources (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        topic_id    ${vc} NOT NULL,
        name        ${vc} NOT NULL,
        url         ${vc} NOT NULL,
        is_builtin  INTEGER DEFAULT 0,
        enabled     INTEGER DEFAULT 1,
        sort_order  INTEGER DEFAULT 0,
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-news-sources] 表 news_sources 创建完成')
  }
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_news_sources_user ON news_sources (user_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_news_sources_topic ON news_sources (topic_id)`)

  // 2. 预置 5 主题 × 15 源（幂等：按固定 id 查重，缺失的补插）
  const now = new Date().toISOString()
  let inserted = 0
  let updated = 0
  for (const s of BUILTIN_SOURCES) {
    const existing = await ds.query(
      isPg ? `SELECT 1 FROM news_sources WHERE id = $1 LIMIT 1` : `SELECT 1 FROM news_sources WHERE id = ? LIMIT 1`,
      [s.id]
    )
    if (existing.length === 0) {
      await ds.query(
        `INSERT INTO news_sources (id, user_id, topic_id, name, url, is_builtin, enabled, sort_order, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)})`,
        [s.id, null, s.topicId, s.name, s.url, 1, 1, parseInt(s.id.slice(-2), 10), now, now]
      )
      inserted++
    } else {
      // 已存在：同步名称/URL（升级源目录时保证一致性；不重置 is_builtin/enabled 用户设置）
      const row = (await ds.query(
        isPg ? `SELECT name, url FROM news_sources WHERE id = $1 LIMIT 1` : `SELECT name, url FROM news_sources WHERE id = ? LIMIT 1`,
        [s.id]
      ))[0]
      if (row && (row.name !== s.name || row.url !== s.url)) {
        await ds.query(
          `UPDATE news_sources SET name = ${ph(1)}, url = ${ph(2)}, sort_order = ${ph(3)}, updated_at = ${ph(4)} WHERE id = ${ph(5)}`,
          [s.name, s.url, parseInt(s.id.slice(-2), 10), now, s.id]
        )
        updated++
      }
    }
  }
  console.log(`[create-news-sources] 预置完成：新增 ${inserted} 个、同步 ${updated} 个内置新闻源（共 ${BUILTIN_SOURCES.length}）`)
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table]
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}
