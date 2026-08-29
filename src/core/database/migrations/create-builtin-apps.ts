/**
 * 内置应用种子迁移（不做运行时种子：数据库初始化时直接 INSERT，开箱即用）
 * @module core/database/migrations/create-builtin-apps
 * @description 把 8 个内置深度工作流 + 对应内置应用 + 默认模板资产直接写入数据库：
 *  - workflow_definitions：user_id=NULL + is_builtin=1，draft/published 双图，版本=1
 *  - apps：user_id=NULL + is_builtin=1，source_kind='workflow'，会话渠道开、API 关、启用
 *  - assets：2 个默认模板资产（早报模板/通用报告模板），user_id=NULL + is_builtin=1
 *
 * 幂等：按固定 id 查重（已存在则跳过；版本可 UPDATE）。双端（Electron/Web）注册。
 * 模板 JSON 随包（migrations/builtin-apps/*.json），迁移用 fs 读取内联。
 */

import type { DataSource } from 'typeorm'
// 内置模板 JSON 静态引入（electron-vite 打包时内联进 bundle，规避 __dirname 路径问题）
import dailyNewsBrief from './builtin-apps/daily-news-brief.json'
import industryWeekly from './builtin-apps/industry-weekly.json'
import multiPlatformCopy from './builtin-apps/multi-platform-copy.json'
import webpageSummary from './builtin-apps/webpage-summary.json'
import articlePolish from './builtin-apps/article-polish.json'
import imageCard from './builtin-apps/image-card.json'
import webpageTranscribe from './builtin-apps/webpage-transcribe.json'
import videoTranscriptApp from './builtin-apps/video-transcript-app.json'
// 第一批高频场景（2026-08-23 用户确认开工）
import weeklyReport from './builtin-apps/weekly-report.json'
import emailAssistant from './builtin-apps/email-assistant.json'
import resumeOptimizer from './builtin-apps/resume-optimizer.json'
import dataAnalysis from './builtin-apps/data-analysis.json'
import meetingMinutes from './builtin-apps/meeting-minutes.json'
import industryResearch from './builtin-apps/industry-research.json'
// 第二批高频场景（2026-08-23 用户确认开工）
import knowledgeRefine from './builtin-apps/knowledge-refine.json'
import competitorAnalysis from './builtin-apps/competitor-analysis.json'
import ecommercePoster from './builtin-apps/ecommerce-poster.json'
// 吃瓜热点事件分析报告（2026-08-28 用户确认开工）
import gossipEventReport from './builtin-apps/gossip-event-report.json'
// 长文写作（2026-08-29 用户确认开工：分阶段写长文，多轮对话承接前文）
import longFormWriting from './builtin-apps/long-form-writing.json'

/** 内置工作流 id 前缀（固定，幂等查重依据） */
const BUILTIN_DEF_PREFIX = 'builtin_def_'
/** 内置应用 id 前缀 */
const BUILTIN_APP_PREFIX = 'builtin_app_'
/**
 * 内置模板版本号：模板内容升级时递增。迁移只同步 template_version != 0 的定义
 * （用户保存草稿/发布内置工作流后 template_version 置 0 = 已接管，不再被模板重置）。
 */
const BUILTIN_TEMPLATE_VERSION = 1

/** 内置工作流模板清单：文件 → { 定义 id, 应用 id, 应用名, 图标, 描述, 原始 JSON } */
const BUILTIN_APPS: Array<{ file: string; raw: unknown; appId: string; icon: string; name: string; description: string; category: string; tags: string[] }> = [
  { file: 'daily-news-brief.json', raw: dailyNewsBrief, appId: `${BUILTIN_APP_PREFIX}daily_news`, icon: '📰', name: '每日热点早报', description: '首页→AI 定位栏目→AI 筛选新闻→抓正文→早报长图，正文与报告可存知识库', category: '新闻资讯', tags: ['早报', '新闻'] },
  { file: 'industry-weekly.json', raw: industryWeekly, appId: `${BUILTIN_APP_PREFIX}industry_weekly`, icon: '📈', name: '行业动态周报', description: '行业趋势分析周报长图（模板可自定义）', category: '新闻资讯', tags: ['周报', '行业'] },
  { file: 'multi-platform-copy.json', raw: multiPlatformCopy, appId: `${BUILTIN_APP_PREFIX}multi_platform`, icon: '✍️', name: '多平台文案生成', description: '公众号/小红书/微博/知乎/抖音 文案', category: '文案写作', tags: ['文案', '自媒体'] },
  { file: 'webpage-summary.json', raw: webpageSummary, appId: `${BUILTIN_APP_PREFIX}webpage_summary`, icon: '📄', name: '网页摘要入库', description: '网页结构化摘要 → 知识库 + 资产库', category: '网页工具', tags: ['摘要'] },
  { file: 'article-polish.json', raw: articlePolish, appId: `${BUILTIN_APP_PREFIX}article_polish`, icon: '🪄', name: '文章润色改写', description: '诊断 + 润色 + 对比报告', category: '文案写作', tags: ['润色', '写作'] },
  { file: 'image-card.json', raw: imageCard, appId: `${BUILTIN_APP_PREFIX}image_card`, icon: '🖼️', name: '图文卡片生成', description: '内容规划 + AI 配图 + 长图卡片', category: '图文设计', tags: ['卡片', '配图'] },
  { file: 'webpage-transcribe.json', raw: webpageTranscribe, appId: `${BUILTIN_APP_PREFIX}webpage_transcribe`, icon: '📑', name: '网页正文转写', description: '网页 → 干净 markdown + 元数据', category: '网页工具', tags: ['转写'] },
  { file: 'video-transcript-app.json', raw: videoTranscriptApp, appId: `${BUILTIN_APP_PREFIX}video_transcript`, icon: '🎬', name: '视频文案提取', description: 'B站/YouTube/本地视频 → 文案', category: '视频处理', tags: ['视频', '文案'] },
  // 第一批高频场景（2026-08-23 用户确认开工）
  { file: 'weekly-report.json', raw: weeklyReport, appId: `${BUILTIN_APP_PREFIX}weekly_report`, icon: '📊', name: '周报生成器', description: '流水记录 → 结构化周报（完成/进行中/计划/风险）', category: '办公效率', tags: ['周报', '办公'] },
  { file: 'email-assistant.json', raw: emailAssistant, appId: `${BUILTIN_APP_PREFIX}email_assistant`, icon: '✉️', name: '邮件助手', description: '要点 → 语气合适的正式邮件（中/英多用途）', category: '办公效率', tags: ['邮件', '办公'] },
  { file: 'resume-optimizer.json', raw: resumeOptimizer, appId: `${BUILTIN_APP_PREFIX}resume_optimizer`, icon: '💼', name: '简历优化', description: '简历诊断 + 逐条优化 + 面试题预测', category: '求职', tags: ['简历', '求职'] },
  { file: 'data-analysis.json', raw: dataAnalysis, appId: `${BUILTIN_APP_PREFIX}data_analysis`, icon: '📈', name: '数据分析洞察', description: '数据 → 趋势/异常/相关性洞察 + 图表建议', category: '办公效率', tags: ['数据分析', '办公'] },
  { file: 'meeting-minutes.json', raw: meetingMinutes, appId: `${BUILTIN_APP_PREFIX}meeting_minutes`, icon: '📝', name: '会议纪要生成', description: '录音转写/文字 → 议题/决议/待办结构化纪要', category: '办公效率', tags: ['会议纪要', '办公'] },
  { file: 'industry-research.json', raw: industryResearch, appId: `${BUILTIN_APP_PREFIX}industry_research`, icon: '🔍', name: '行业深度调研', description: '主题 → 多轮搜索 → 深度研报（含引用来源）', category: '调研', tags: ['调研', '研报'] },
  // 第二批高频场景（2026-08-23 用户确认开工）
  { file: 'knowledge-refine.json', raw: knowledgeRefine, appId: `${BUILTIN_APP_PREFIX}knowledge_refine`, icon: '🎓', name: '知识提炼存日记', description: '文章 → 读后感/书评式提炼 → 保存到日记', category: '学习', tags: ['知识提炼', '日记'] },
  { file: 'competitor-analysis.json', raw: competitorAnalysis, appId: `${BUILTIN_APP_PREFIX}competitor_analysis`, icon: '🏆', name: '竞品分析报告', description: '竞品名单 → 逐竞品搜索 → 对比矩阵 + 策略建议', category: '调研', tags: ['竞品分析', '商业'] },
  { file: 'ecommerce-poster.json', raw: ecommercePoster, appId: `${BUILTIN_APP_PREFIX}ecommerce_poster`, icon: '🛍️', name: '电商商品海报', description: '商品图+卖点 → AI 生成海报/主图 + 配套文案', category: '电商', tags: ['电商', '海报'] },
  // 吃瓜热点事件分析报告（2026-08-28 用户确认开工）
  { file: 'gossip-event-report.json', raw: gossipEventReport, appId: `${BUILTIN_APP_PREFIX}gossip_event_report`, icon: '🍉', name: '吃瓜热点速报', description: '热点事件关键词 → 搜索抓取 → AI 分析 → 吃瓜报告长图（娱乐小报/事件梳理/公众号三风格）', category: '娱乐八卦', tags: ['吃瓜', '热点', '八卦'] },
  // 长文写作（2026-08-29 用户确认开工：分阶段写长文，多轮对话承接前文）
  { file: 'long-form-writing.json', raw: longFormWriting, appId: `${BUILTIN_APP_PREFIX}long_form_writing`, icon: '✍️', name: '长文写作', description: '故事线 → 章节大纲 → 逐章写作（多轮对话承接前文）→ 合并完整长文入库', category: '内容创作', tags: ['长文', '写作', '小说'] },
]

/** 默认模板资产（user_id=NULL，可复制修改） */
const DEFAULT_TEMPLATES = [
  {
    id: 'builtin_tpl_morning_report',
    name: '早报模板（内置）',
    subCategory: '报告模板',
    content: '# {{start.topic}} 热点早报（{{sys.today}}）\n\n> 采集源：{{crawl1.failedSources.length}} 个源失败\n\n{{gen1.content}}\n\n---\n\n*由 The Bot 自动生成*',
  },
  {
    id: 'builtin_tpl_generic_report',
    name: '通用报告模板（内置）',
    subCategory: '报告模板',
    content: '# {{start.topic}}\n\n{{gen1.content}}',
  },
  {
    id: 'builtin_tpl_industry_weekly',
    name: '行业周报模板（内置）',
    subCategory: '报告模板',
    content: '# {{start.topic}} 行业周报（{{sys.week}}）\n\n> 数据周期：{{sys.week}}\n\n{{gen1.content}}\n\n---\n\n*由 The Bot 自动生成*',
  },
]

export async function createBuiltinApps(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. 幂等补 is_builtin 列（两张表）
  await ensureColumn(ds, 'workflow_definitions', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)
  await ensureColumn(ds, 'apps', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)
  await ensureColumn(ds, 'assets', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)

  // 2. 内置工作流 + 内置应用（模板 JSON 已静态引入，规避打包路径问题）
  const now = new Date().toISOString()
  // 内置应用按发布顺序错开 created_at：列表统一时间降序时，最新发布的内置（如视频文案提取）在前。
  // 用固定发布基准（平台出厂时间）而非当前时刻——迁移幂等，避免每次启动刷新时间戳把内置顶到最前
  const BUILTIN_APP_PUBLISH_BASE = Date.parse('2026-08-01T00:00:00.000Z')
  const publishedAt = (i: number): string =>
    new Date(BUILTIN_APP_PUBLISH_BASE + i * 1000).toISOString()
  let insertedDefs = 0
  let insertedApps = 0

  for (const [appIndex, app] of BUILTIN_APPS.entries()) {
    const raw = app.raw as { name?: string; description?: string; category?: string | null; graph?: { nodes?: unknown[] }; triggers?: unknown; settings?: unknown }
    const graph = raw.graph
    if (!graph?.nodes?.length) {
      console.warn(`[create-builtin-apps] 模板图为空：${app.file}`)
      continue
    }
    const defId = `${BUILTIN_DEF_PREFIX}${app.file.replace(/\.json$/, '')}`
    const triggers = raw.triggers ?? []
    const settings = raw.settings ?? null

    // 幂等：定义已存在则更新图与触发器（版本不变，避免破坏引用）；不存在则插入
    // 占位符按方言生成：PG 只认 $n（node-pg 不做 ? → $n 转换，? 在 PG 是 jsonb 运算符）
    const ph = (n: number) => (isPg ? `$${n}` : '?')
    const existing = await ds.query(
      isPg ? `SELECT 1 FROM workflow_definitions WHERE id = $1 LIMIT 1` : `SELECT 1 FROM workflow_definitions WHERE id = ? LIMIT 1`,
      [defId]
    )
    if (existing.length === 0) {
      await ds.query(
        `INSERT INTO workflow_definitions
          (id, user_id, name, description, category, draft_graph, published_graph, published_version, published_at, triggers, settings, is_builtin, template_version, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)}, ${ph(11)}, ${ph(12)}, ${ph(13)}, ${ph(14)}, ${ph(15)})`,
        [defId, null, raw.name ?? app.name, raw.description ?? app.description, raw.category ?? 'builtin',
         JSON.stringify(graph), JSON.stringify(graph), 1, now, JSON.stringify(triggers), settings ? JSON.stringify(settings) : null, 1, BUILTIN_TEMPLATE_VERSION, now, now]
      )
      insertedDefs++
    } else {
      // 只同步未被用户接管的定义（template_version != 0；接管后用户修改不被模板重置）
      await ds.query(
        `UPDATE workflow_definitions
           SET draft_graph = ${ph(1)}, published_graph = ${ph(2)}, triggers = ${ph(3)}, settings = ${ph(4)}, template_version = ${ph(5)}, updated_at = ${ph(6)}
         WHERE id = ${ph(7)} AND (template_version IS NULL OR template_version != 0)`,
        [JSON.stringify(graph), JSON.stringify(graph), JSON.stringify(triggers), settings ? JSON.stringify(settings) : null, BUILTIN_TEMPLATE_VERSION, now, defId]
      )
    }

    // 幂等：应用已存在则跳过（名称/图标可 UPDATE 保持同步）
    const appExisting = await ds.query(
      isPg ? `SELECT 1 FROM apps WHERE id = $1 LIMIT 1` : `SELECT 1 FROM apps WHERE id = ? LIMIT 1`,
      [app.appId]
    )
    if (appExisting.length === 0) {
      await ds.query(
        `INSERT INTO apps
          (id, user_id, name, icon, description, category, tags, source_kind, source_id, source_version, channel_session, channel_share, channel_api, enabled, is_builtin, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)}, ${ph(11)}, ${ph(12)}, ${ph(13)}, ${ph(14)}, ${ph(15)}, ${ph(16)}, ${ph(17)})`,
        [app.appId, null, app.name, app.icon, app.description, app.category, JSON.stringify(app.tags), 'workflow', defId, 1, 1, 0, 0, 1, 1, publishedAt(appIndex), now]
      )
      insertedApps++
    } else {
      await ds.query(
        `UPDATE apps SET name = ${ph(1)}, icon = ${ph(2)}, description = ${ph(3)}, category = ${ph(4)}, tags = ${ph(5)}, source_version = ${ph(6)}, created_at = ${ph(7)}, updated_at = ${ph(8)} WHERE id = ${ph(9)}`,
        [app.name, app.icon, app.description, app.category, JSON.stringify(app.tags), 1, publishedAt(appIndex), now, app.appId]
      )
    }
  }

  // 3. 默认模板资产（幂等）
  let insertedTemplates = 0
  for (const tpl of DEFAULT_TEMPLATES) {
    const tplExisting = await ds.query(
      isPg ? `SELECT 1 FROM assets WHERE id = $1 LIMIT 1` : `SELECT 1 FROM assets WHERE id = ? LIMIT 1`,
      [tpl.id]
    )
    if (tplExisting.length === 0) {
      const ph = (n: number) => (isPg ? `$${n}` : '?')
      await ds.query(
        `INSERT INTO assets
          (id, user_id, category, sub_category, name, kind, text_content, source_type, is_builtin, created_at, updated_at)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ${ph(10)}, ${ph(11)})`,
        [tpl.id, null, 'template', tpl.subCategory, tpl.name, 'text', tpl.content, 'builtin', 1, now, now]
      )
      insertedTemplates++
    }
  }

  console.log(`[create-builtin-apps] 完成：内置工作流 ${insertedDefs} 新增，内置应用 ${insertedApps} 新增，默认模板 ${insertedTemplates} 新增`)
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
      [table, column]
    )
    if (rows.length === 0) {
      await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
      console.log(`[create-builtin-apps] ${table} 补列 ${column}`)
    }
    return
  }
  const cols = await ds.query(`PRAGMA table_info(${table})`)
  if (!cols.some((c: { name: string }) => c.name === column)) {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
    console.log(`[create-builtin-apps] ${table} 补列 ${column}`)
  }
}
