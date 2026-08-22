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

/** 内置工作流 id 前缀（固定，幂等查重依据） */
const BUILTIN_DEF_PREFIX = 'builtin_def_'
/** 内置应用 id 前缀 */
const BUILTIN_APP_PREFIX = 'builtin_app_'

/** 内置工作流模板清单：文件 → { 定义 id, 应用 id, 应用名, 图标, 描述, 原始 JSON } */
const BUILTIN_APPS: Array<{ file: string; raw: unknown; appId: string; icon: string; name: string; description: string }> = [
  { file: 'daily-news-brief.json', raw: dailyNewsBrief, appId: `${BUILTIN_APP_PREFIX}daily_news`, icon: '📰', name: '每日热点早报', description: '全球媒体采集 + AI 生成早报长图' },
  { file: 'industry-weekly.json', raw: industryWeekly, appId: `${BUILTIN_APP_PREFIX}industry_weekly`, icon: '📈', name: '行业动态周报', description: '行业趋势分析周报（可导出 Word）' },
  { file: 'multi-platform-copy.json', raw: multiPlatformCopy, appId: `${BUILTIN_APP_PREFIX}multi_platform`, icon: '✍️', name: '多平台文案生成', description: '公众号/小红书/微博/知乎/抖音 文案' },
  { file: 'webpage-summary.json', raw: webpageSummary, appId: `${BUILTIN_APP_PREFIX}webpage_summary`, icon: '📄', name: '网页摘要入库', description: '网页结构化摘要 → 知识库 + 资产库' },
  { file: 'article-polish.json', raw: articlePolish, appId: `${BUILTIN_APP_PREFIX}article_polish`, icon: '🪄', name: '文章润色改写', description: '诊断 + 润色 + 对比报告' },
  { file: 'image-card.json', raw: imageCard, appId: `${BUILTIN_APP_PREFIX}image_card`, icon: '🖼️', name: '图文卡片生成', description: '内容规划 + AI 配图 + 长图卡片' },
  { file: 'webpage-transcribe.json', raw: webpageTranscribe, appId: `${BUILTIN_APP_PREFIX}webpage_transcribe`, icon: '📑', name: '网页正文转写', description: '网页 → 干净 markdown + 元数据' },
  { file: 'video-transcript-app.json', raw: videoTranscriptApp, appId: `${BUILTIN_APP_PREFIX}video_transcript`, icon: '🎬', name: '视频文案提取', description: 'B站/YouTube/本地视频 → 文案' },
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
]

export async function createBuiltinApps(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. 幂等补 is_builtin 列（两张表）
  await ensureColumn(ds, 'workflow_definitions', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)
  await ensureColumn(ds, 'apps', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)
  await ensureColumn(ds, 'assets', 'is_builtin', isPg ? 'integer DEFAULT 0' : 'INTEGER DEFAULT 0', isPg)

  // 2. 内置工作流 + 内置应用（模板 JSON 已静态引入，规避打包路径问题）
  const now = new Date().toISOString()
  let insertedDefs = 0
  let insertedApps = 0

  for (const app of BUILTIN_APPS) {
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
    const existing = await ds.query(
      isPg ? `SELECT 1 FROM workflow_definitions WHERE id = $1 LIMIT 1` : `SELECT 1 FROM workflow_definitions WHERE id = ? LIMIT 1`,
      [defId]
    )
    if (existing.length === 0) {
      await ds.query(
        `INSERT INTO workflow_definitions
          (id, user_id, name, description, category, draft_graph, published_graph, published_version, published_at, triggers, settings, is_builtin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [defId, null, raw.name ?? app.name, raw.description ?? app.description, raw.category ?? 'builtin',
         JSON.stringify(graph), JSON.stringify(graph), 1, now, JSON.stringify(triggers), settings ? JSON.stringify(settings) : null, 1, now, now]
      )
      insertedDefs++
    } else {
      await ds.query(
        `UPDATE workflow_definitions SET draft_graph = ?, published_graph = ?, triggers = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(graph), JSON.stringify(graph), JSON.stringify(triggers), now, defId]
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
          (id, user_id, name, icon, description, source_kind, source_id, source_version, channel_session, channel_share, channel_api, enabled, is_builtin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [app.appId, null, app.name, app.icon, app.description, 'workflow', defId, 1, 1, 0, 0, 1, 1, now, now]
      )
      insertedApps++
    } else {
      await ds.query(
        `UPDATE apps SET name = ?, icon = ?, description = ?, source_version = ?, updated_at = ? WHERE id = ?`,
        [app.name, app.icon, app.description, 1, now, app.appId]
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
      await ds.query(
        `INSERT INTO assets
          (id, user_id, category, sub_category, name, kind, text_content, source_type, is_builtin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
