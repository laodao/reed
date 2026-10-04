/**
 * 信息来源表 + 预置数据迁移（由「新闻来源」泛化而来）
 * @module core/database/migrations/create-info-sources
 * @description
 *  - info_source_categories 表：来源类别（设置界面一个类别 = 一个 tab）。内置「新闻来源」(news)
 *  - info_source_topics 表：类别内分组（原 news_topics）+ category_id + is_default（未分组）
 *  - info_sources 表：来源（原 news_sources，列结构不变）
 *  - 预置：内置类别 2 个（新闻来源 + 权威知识源）；新闻 5 分组 × 15 源（国外 top10 + 国内 top5）；
 *    权威知识源 6 分组 × 34 源（百科/技术文档/教材/政府统计/医学/标准，user_id=NULL + is_builtin=1）
 *  - 存量升级：news_topics / news_sources 整体 RENAME 为 info_* 表（用户自有数据一并保留），
 *    分组表补 category_id（回填 'news'）与 is_default 列；无需二次搬迁
 *  - 幂等：建表/补列/改名均先探测；预置按固定 id 查重；双端（Electron/Web）注册
 *  - 与 shared/types/news-topics.ts 的 NEWS_TOPICS 保持一致（内置新闻源目录的种子与兜底）
 */

import type { DataSource } from 'typeorm'
import { INFO_SOURCE_AUTHORITY_CATEGORY_ID, INFO_SOURCE_NEWS_CATEGORY_ID } from '@shared/types/info-source.types'

/** 预置新闻源（每分组 15 个：国外 10 + 国内 5；id 序号 = 排序权重） */
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

/** 预置来源类别（内置类别全局共享；用户可在设置界面新增任意类别） */
const BUILTIN_CATEGORIES: Array<{ id: string; name: string; sortOrder: number }> = [
  { id: INFO_SOURCE_NEWS_CATEGORY_ID, name: '新闻来源', sortOrder: 0 },
  { id: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '权威知识源', sortOrder: 1 },
]

/** 预置分组（新闻来源 5 个 + 权威知识源 6 个；权威源按知识类型分组） */
const BUILTIN_TOPICS: Array<{ id: string; categoryId: string; name: string }> = [
  { id: 'ai', categoryId: INFO_SOURCE_NEWS_CATEGORY_ID, name: '人工智能' },
  { id: 'finance', categoryId: INFO_SOURCE_NEWS_CATEGORY_ID, name: '全球财经' },
  { id: 'energy', categoryId: INFO_SOURCE_NEWS_CATEGORY_ID, name: '新能源' },
  { id: 'tech', categoryId: INFO_SOURCE_NEWS_CATEGORY_ID, name: '科技产业' },
  { id: 'world', categoryId: INFO_SOURCE_NEWS_CATEGORY_ID, name: '国际时政' },
  { id: 'auth-encyc', categoryId: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '百科词典' },
  { id: 'auth-techdocs', categoryId: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '技术文档' },
  { id: 'auth-course', categoryId: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '教材课程' },
  { id: 'auth-gov', categoryId: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '政府统计' },
  { id: 'auth-med', categoryId: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '医学健康' },
  { id: 'auth-standard', categoryId: INFO_SOURCE_AUTHORITY_CATEGORY_ID, name: '标准规范' },
]

/**
 * 预置「权威知识源」（2026-10-04）：基础知识不需要论文，权威参考资料按知识类型分六组。
 * 与新闻源（时效媒体）相对，这些站点内容稳定、可追溯、适合知识生成场景引用。
 * 注意：来源 id 必须以两位序号结尾（sort_order 由 id 尾号解析）。
 */
const AUTHORITY_SOURCES: Array<{ id: string; topicId: string; name: string; url: string }> = [
  // ===== 百科词典（概念定义） =====
  { id: 'ak_en_01', topicId: 'auth-encyc', name: 'Wikipedia (English)', url: 'https://en.wikipedia.org/' },
  { id: 'ak_en_02', topicId: 'auth-encyc', name: '维基百科（中文）', url: 'https://zh.wikipedia.org/' },
  { id: 'ak_en_03', topicId: 'auth-encyc', name: 'Encyclopedia of Mathematics', url: 'https://encyclopediaofmath.org/' },
  { id: 'ak_en_04', topicId: 'auth-encyc', name: 'Wolfram MathWorld', url: 'https://mathworld.wolfram.com/' },
  { id: 'ak_en_05', topicId: 'auth-encyc', name: 'Stanford Encyclopedia of Philosophy', url: 'https://plato.stanford.edu/' },
  { id: 'ak_en_06', topicId: 'auth-encyc', name: 'Encyclopaedia Britannica', url: 'https://www.britannica.com/' },

  // ===== 技术文档（官方一手） =====
  { id: 'ak_td_01', topicId: 'auth-techdocs', name: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
  { id: 'ak_td_02', topicId: 'auth-techdocs', name: 'Python 官方文档', url: 'https://docs.python.org/3/' },
  { id: 'ak_td_03', topicId: 'auth-techdocs', name: 'Microsoft Learn', url: 'https://learn.microsoft.com/' },
  { id: 'ak_td_04', topicId: 'auth-techdocs', name: 'Google Developers', url: 'https://developers.google.com/' },
  { id: 'ak_td_05', topicId: 'auth-techdocs', name: 'The Rust Book', url: 'https://doc.rust-lang.org/book/' },
  { id: 'ak_td_06', topicId: 'auth-techdocs', name: 'Node.js 官方文档', url: 'https://nodejs.org/docs/latest/api/' },

  // ===== 教材课程（系统学习） =====
  { id: 'ak_co_01', topicId: 'auth-course', name: 'OpenStax 免费教材', url: 'https://openstax.org/' },
  { id: 'ak_co_02', topicId: 'auth-course', name: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/' },
  { id: 'ak_co_03', topicId: 'auth-course', name: 'Khan Academy', url: 'https://www.khanacademy.org/' },
  { id: 'ak_co_04', topicId: 'auth-course', name: '国家高等教育智慧教育平台', url: 'https://higher.smartedu.cn/' },

  // ===== 政府统计（官方一手数据与法规） =====
  { id: 'ak_gv_01', topicId: 'auth-gov', name: '国家统计局', url: 'https://www.stats.gov.cn/' },
  { id: 'ak_gv_02', topicId: 'auth-gov', name: '中国人民银行', url: 'http://www.pbc.gov.cn/' },
  { id: 'ak_gv_03', topicId: 'auth-gov', name: '中国证监会', url: 'http://www.csrc.gov.cn/' },
  { id: 'ak_gv_04', topicId: 'auth-gov', name: '国家法律法规数据库', url: 'https://flk.npc.gov.cn/' },
  { id: 'ak_gv_05', topicId: 'auth-gov', name: 'FRED 经济数据库', url: 'https://fred.stlouisfed.org/' },
  { id: 'ak_gv_06', topicId: 'auth-gov', name: '世界银行公开数据', url: 'https://data.worldbank.org/' },
  { id: 'ak_gv_07', topicId: 'auth-gov', name: 'IMF Data', url: 'https://www.imf.org/en/Data' },
  { id: 'ak_gv_08', topicId: 'auth-gov', name: 'OECD Data', url: 'https://www.oecd.org/en/data.html' },

  // ===== 医学健康（权威手册） =====
  { id: 'ak_md_01', topicId: 'auth-med', name: '默沙东诊疗手册（专业版）', url: 'https://www.msdmanuals.cn/professional' },
  { id: 'ak_md_02', topicId: 'auth-med', name: '默沙东诊疗手册（大众版）', url: 'https://www.msdmanuals.cn/' },
  { id: 'ak_md_03', topicId: 'auth-med', name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/' },
  { id: 'ak_md_04', topicId: 'auth-med', name: '世界卫生组织 (WHO)', url: 'https://www.who.int/' },
  { id: 'ak_md_05', topicId: 'auth-med', name: 'Cochrane Library', url: 'https://www.cochranelibrary.com/' },

  // ===== 标准规范（原文出处） =====
  { id: 'ak_st_01', topicId: 'auth-standard', name: 'W3C', url: 'https://www.w3.org/' },
  { id: 'ak_st_02', topicId: 'auth-standard', name: 'IETF RFC', url: 'https://www.rfc-editor.org/' },
  { id: 'ak_st_03', topicId: 'auth-standard', name: 'ISO', url: 'https://www.iso.org/' },
  { id: 'ak_st_04', topicId: 'auth-standard', name: 'ECMA International', url: 'https://ecma-international.org/' },
  { id: 'ak_st_05', topicId: 'auth-standard', name: 'NIST', url: 'https://www.nist.gov/' },
]

/** 全部预置来源（新闻 75 + 权威知识源 34；预置循环统一遍历） */
const ALL_BUILTIN_SOURCES = [...BUILTIN_SOURCES, ...AUTHORITY_SOURCES]

export async function createInfoSources(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const int = 'INTEGER'
  const dt = isPg ? 'timestamp' : 'datetime'
  // 占位符按方言生成：PG 只认 $n（node-pg 不做 ? → $n 转换，? 在 PG 是 jsonb 运算符）
  const ph = (n: number) => (isPg ? `$${n}` : '?')
  const now = new Date().toISOString()

  // ==================== 1. 来源类别表 ====================
  if (!(await tableExists(ds, 'info_source_categories', isPg))) {
    await ds.query(`
      CREATE TABLE info_source_categories (
        id          ${vc} PRIMARY KEY,
        user_id     ${vc},
        name        ${vc} NOT NULL,
        is_builtin  ${int} DEFAULT 0,
        sort_order  ${int} DEFAULT 0,
        created_at  ${dt},
        updated_at  ${dt}
      )
    `)
    console.log('[create-info-sources] 表 info_source_categories 创建完成')
  }
  await ds.query(
    `CREATE INDEX IF NOT EXISTS idx_info_source_categories_user ON info_source_categories (user_id)`,
  )
  let insertedCategories = 0
  for (const c of BUILTIN_CATEGORIES) {
    const existing = await ds.query(
      isPg ? `SELECT 1 FROM info_source_categories WHERE id = $1 LIMIT 1` : `SELECT 1 FROM info_source_categories WHERE id = ? LIMIT 1`,
      [c.id],
    )
    if (existing.length === 0) {
      await ds.query(
        `INSERT INTO info_source_categories (id, user_id, name, is_builtin, sort_order, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)})`,
        [c.id, null, c.name, 1, c.sortOrder, now, now],
      )
      insertedCategories++
    } else {
      await ds.query(
        `UPDATE info_source_categories SET name = ${ph(1)}, sort_order = ${ph(2)}, updated_at = ${ph(3)} WHERE id = ${ph(4)}`,
        [c.name, c.sortOrder, now, c.id],
      )
    }
  }
  console.log(`[create-info-sources] 预置类别完成：新增 ${insertedCategories} 个（共 ${BUILTIN_CATEGORIES.length}）`)

  // ==================== 2. 分组表（存量 news_topics → info_source_topics） ====================
  const legacyTopics = await tableExists(ds, 'news_topics', isPg)
  if (!(await tableExists(ds, 'info_source_topics', isPg))) {
    if (legacyTopics) {
      await ds.query(`ALTER TABLE news_topics RENAME TO info_source_topics`)
      console.log('[create-info-sources] 存量表 news_topics → info_source_topics 改名完成')
    } else {
      await ds.query(`
        CREATE TABLE info_source_topics (
          id          ${vc} PRIMARY KEY,
          user_id     ${vc},
          category_id ${vc} NOT NULL DEFAULT '${INFO_SOURCE_NEWS_CATEGORY_ID}',
          name        ${vc} NOT NULL,
          is_builtin  ${int} DEFAULT 0,
          is_default  ${int} DEFAULT 0,
          created_at  ${dt},
          updated_at  ${dt}
        )
      `)
      console.log('[create-info-sources] 表 info_source_topics 创建完成')
    }
  } else if (legacyTopics) {
    // 双表并存：Web 端启动是「先 synchronize（按实体建空表）再跑迁移」，而 news_topics 是
    // 实体之外的孤儿表（synchronize 不动它）——此时若直接跳过，用户自建分组会变成孤儿数据、
    // 界面上等于消失。必须把存量行搬运过来（幂等：只补新表缺失的 id）。
    const carried = await countMissingLegacyTopics(ds)
    if (carried > 0) await carryOverLegacyTopics(ds)
    console.log(`[create-info-sources] 存量 news_topics → info_source_topics 搬运 ${carried} 行（旧表保留不删）`)
  }
  // 存量表改名来的：补类别列与默认分组标记列（旧库缺列会被 schema drift 判为漂移）
  await ensureColumn(ds, 'info_source_topics', 'category_id', `${vc} NOT NULL DEFAULT '${INFO_SOURCE_NEWS_CATEGORY_ID}'`, isPg)
  await ensureColumn(ds, 'info_source_topics', 'is_default', `${int} DEFAULT 0`, isPg)
  // 存量分组统一归入内置「新闻来源」类别（老库的新闻主题即新闻来源分组）
  await ds.query(
    `UPDATE info_source_topics SET category_id = ${ph(1)} WHERE category_id IS NULL OR category_id = ''`,
    [INFO_SOURCE_NEWS_CATEGORY_ID],
  )
  // 索引重建：改名带过来的旧索引名同步为现行命名（幂等）
  await ds.query(`DROP INDEX IF EXISTS idx_news_topics_user`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_info_source_topics_user ON info_source_topics (user_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_info_source_topics_category ON info_source_topics (category_id)`)

  let insertedTopics = 0
  for (const t of BUILTIN_TOPICS) {
    const existing = await ds.query(
      isPg ? `SELECT 1 FROM info_source_topics WHERE id = $1 LIMIT 1` : `SELECT 1 FROM info_source_topics WHERE id = ? LIMIT 1`,
      [t.id],
    )
    if (existing.length === 0) {
      await ds.query(
        `INSERT INTO info_source_topics (id, user_id, category_id, name, is_builtin, is_default, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)})`,
        [t.id, null, t.categoryId, t.name, 1, 0, now, now],
      )
      insertedTopics++
    } else {
      await ds.query(
        `UPDATE info_source_topics SET category_id = ${ph(1)}, name = ${ph(2)}, updated_at = ${ph(3)} WHERE id = ${ph(4)}`,
        [t.categoryId, t.name, now, t.id],
      )
    }
  }
  console.log(`[create-info-sources] 预置分组完成：新增 ${insertedTopics} 个内置分组（共 ${BUILTIN_TOPICS.length}）`)

  // ==================== 3. 来源表（存量 news_sources → info_sources） ====================
  const legacySources = await tableExists(ds, 'news_sources', isPg)
  if (!(await tableExists(ds, 'info_sources', isPg))) {
    if (legacySources) {
      await ds.query(`ALTER TABLE news_sources RENAME TO info_sources`)
      console.log('[create-info-sources] 存量表 news_sources → info_sources 改名完成')
    } else {
      await ds.query(`
        CREATE TABLE info_sources (
          id          ${vc} PRIMARY KEY,
          user_id     ${vc},
          topic_id    ${vc} NOT NULL,
          name        ${vc} NOT NULL,
          url         ${vc} NOT NULL,
          is_builtin  ${int} DEFAULT 0,
          enabled     ${int} DEFAULT 1,
          sort_order  ${int} DEFAULT 0,
          created_at  ${dt},
          updated_at  ${dt}
        )
      `)
      console.log('[create-info-sources] 表 info_sources 创建完成')
    }
  } else if (legacySources) {
    // 同分组表：synchronize 先建空表时搬运存量来源，避免用户自建来源在界面上消失
    const carried = await countMissingLegacySources(ds)
    if (carried > 0) await carryOverLegacySources(ds)
    console.log(`[create-info-sources] 存量 news_sources → info_sources 搬运 ${carried} 行（旧表保留不删）`)
  }
  await ds.query(`DROP INDEX IF EXISTS idx_news_sources_user`)
  await ds.query(`DROP INDEX IF EXISTS idx_news_sources_topic`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_info_sources_user ON info_sources (user_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_info_sources_topic ON info_sources (topic_id)`)

  // 预置（新闻 5 分组 × 15 源 + 权威知识源 6 分组 × 34 源；幂等：按固定 id 查重，缺失的补插；已存在则同步名称/URL）
  let inserted = 0
  let updated = 0
  for (const s of ALL_BUILTIN_SOURCES) {
    const existing = await ds.query(
      isPg ? `SELECT name, url FROM info_sources WHERE id = $1 LIMIT 1` : `SELECT name, url FROM info_sources WHERE id = ? LIMIT 1`,
      [s.id],
    )
    if (existing.length === 0) {
      await ds.query(
        `INSERT INTO info_sources (id, user_id, topic_id, name, url, is_builtin, enabled, sort_order, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)})`,
        [s.id, null, s.topicId, s.name, s.url, 1, 1, parseInt(s.id.slice(-2), 10), now, now],
      )
      inserted++
    } else {
      // 已存在：同步名称/URL（升级源目录时保证一致性；不重置 is_builtin/enabled 用户设置）
      const row = existing[0]
      if (row && (row.name !== s.name || row.url !== s.url)) {
        await ds.query(
          `UPDATE info_sources SET topic_id = ${ph(1)}, name = ${ph(2)}, url = ${ph(3)}, sort_order = ${ph(4)}, updated_at = ${ph(5)} WHERE id = ${ph(6)}`,
          [s.topicId, s.name, s.url, parseInt(s.id.slice(-2), 10), now, s.id],
        )
        updated++
      }
    }
  }
  console.log(`[create-info-sources] 预置完成：新增 ${inserted} 个、同步 ${updated} 个内置信息来源（共 ${ALL_BUILTIN_SOURCES.length}）`)
}

/** 新表缺失的存量分组行数（幂等搬运前的计数） */
async function countMissingLegacyTopics(ds: DataSource): Promise<number> {
  const rows = await ds.query(
    `SELECT count(*) c FROM news_topics lt WHERE NOT EXISTS (SELECT 1 FROM info_source_topics t WHERE t.id = lt.id)`,
  )
  return Number(rows[0]?.c ?? 0)
}

/** 把存量分组行搬运到新表（只补新表没有的 id；统一归入内置「新闻来源」类别） */
async function carryOverLegacyTopics(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO info_source_topics (id, user_id, category_id, name, is_builtin, is_default, created_at, updated_at)
     SELECT lt.id, lt.user_id, '${INFO_SOURCE_NEWS_CATEGORY_ID}', lt.name, lt.is_builtin, 0, lt.created_at, lt.updated_at
     FROM news_topics lt
     WHERE NOT EXISTS (SELECT 1 FROM info_source_topics t WHERE t.id = lt.id)`,
  )
}

/** 新表缺失的存量来源行数（幂等搬运前的计数） */
async function countMissingLegacySources(ds: DataSource): Promise<number> {
  const rows = await ds.query(
    `SELECT count(*) c FROM news_sources ls WHERE NOT EXISTS (SELECT 1 FROM info_sources n WHERE n.id = ls.id)`,
  )
  return Number(rows[0]?.c ?? 0)
}

/** 把存量来源行搬运到新表（只补新表没有的 id；列结构一致，原样搬） */
async function carryOverLegacySources(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO info_sources (id, user_id, topic_id, name, url, is_builtin, enabled, sort_order, created_at, updated_at)
     SELECT ls.id, ls.user_id, ls.topic_id, ls.name, ls.url, ls.is_builtin, ls.enabled, ls.sort_order, ls.created_at, ls.updated_at
     FROM news_sources ls
     WHERE NOT EXISTS (SELECT 1 FROM info_sources n WHERE n.id = ls.id)`,
  )
}

async function tableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}

/** 幂等补列（SQLite: PRAGMA；PG: information_schema） */
async function ensureColumn(
  ds: DataSource,
  table: string,
  column: string,
  colDef: string,
  isPg: boolean,
): Promise<void> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    if (rows.length === 0) {
      await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
      console.log(`[create-info-sources] ${table} 补列 ${column}`)
    }
    return
  }
  const cols = await ds.query(`PRAGMA table_info(${table})`)
  if (!cols.some((c: { name: string }) => c.name === column)) {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
    console.log(`[create-info-sources] ${table} 补列 ${column}`)
  }
}
