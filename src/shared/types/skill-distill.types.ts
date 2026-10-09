/**
 * 技能蒸馏（内容 → Skill）模块类型
 * @module shared/types/skill-distill.types
 * @description 用户输入他人内容（粘贴文本 / 网页 / 本地文件），LLM 两遍流水线
 *              （逐块笔记 → 仅凭笔记组装）蒸馏成一个标准技能包（SKILL.md +
 *              references/ 卡片），落盘进技能库。设计参照 book-to-skill /
 *              anything-to-skill / colleague-skill 的公开方法论：
 *              提结构不搬原文、生成契约写进 prompt、确定性审计 + 修复、诚实失败。
 *              常量与类型双端同源（core 执行与前端面板共用）。
 */

/** 蒸馏目标技能类型：方法论知识 / 写作风格 / 人物人设 */
export const SKILL_DISTILL_CONTENT_TYPES = ['methodology', 'style', 'persona'] as const
export type SkillDistillContentType = (typeof SKILL_DISTILL_CONTENT_TYPES)[number]

/** 蒸馏任务阶段（前端步骤条按此渲染；终态 done/failed/cancelled） */
export const SKILL_DISTILL_STAGES = [
  'queued',
  'preparing',
  'detecting',
  'noting',
  'assembling',
  'auditing',
  'repairing',
  'writing',
  'done',
  'failed',
  'cancelled',
] as const
export type SkillDistillStage = (typeof SKILL_DISTILL_STAGES)[number]

/** 发起蒸馏请求（handler 入参；text = 粘贴文本或前端已读好的文件内容） */
export interface SkillDistillRequest {
  /** 输入形态：text=纯文本（含前端读好的本地文件）；url=网页链接（后端抓取） */
  inputType: 'text' | 'url'
  /** inputType=text 时的源内容 */
  text?: string
  /** inputType=url 时的网页地址 */
  url?: string
  /** 目标技能类型；auto = 让模型先判型 */
  contentType: SkillDistillContentType | 'auto'
  /** 可选：用户补充的蒸馏重点（技能用途、侧重维度） */
  hints?: string
}

/** 蒸馏进度统计（轮询展示用） */
export interface SkillDistillStats {
  /** 源内容切块数（短文=1） */
  chunksTotal: number
  /** 已完成笔记的块数 */
  chunksDone: number
  llmCalls: number
  sourceChars: number
  notesChars: number
  outputChars: number
  repairPasses: number
}

/** 审计问题（error 级不过审；warn 级提示但放行） */
export interface SkillDistillIssue {
  level: 'error' | 'warn'
  /** 稳定问题码（repair prompt 与前端文案共用） */
  code: string
  message: string
}

/** 组装产物：一个完整技能包草稿（写盘前的中间形态） */
export interface SkillPackageDraft {
  /** 技能 id（kebab-case，=技能包目录名） */
  name: string
  /** 中文展示名 */
  title: string
  description: string
  /** 何时使用（给用户的选择提示） */
  whenToUse: string
  category: string
  /** SKILL.md 正文（markdown） */
  body: string
  /** references/ 卡片（文件名须 .md 结尾且被正文链接） */
  references: Array<{ filename: string; content: string }>
  /** 判型结果（contentType=auto 时由检测步给出） */
  detectedType?: SkillDistillContentType
}

/** 蒸馏任务快照（IPC 轮询返回） */
export interface SkillDistillTaskSnapshot {
  id: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  stage: SkillDistillStage
  /** 0-100 */
  progress: number
  /** 当前阶段的一句话进度（前端日志流） */
  message: string
  contentType: SkillDistillRequest['contentType']
  detectedType?: SkillDistillContentType
  stats: SkillDistillStats
  issues: SkillDistillIssue[]
  error?: string
  /** 成功后：落盘技能 id（=name）与展示名 */
  resultSkillId?: string
  resultSkillName?: string
  createdAt: string
  finishedAt?: string
}

/** 源内容规模上限（防失控；超出截断并如实计入审计提示） */
export const SKILL_DISTILL_SOURCE_MAX_CHARS = 200_000
/** 单块上限：超过则分块走逐块笔记（短文单块直通） */
export const SKILL_DISTILL_CHUNK_MAX_CHARS = 6_000
/** 逐块笔记的笔记预算（字符，约等于 prompt 里要求的输出上限） */
export const SKILL_DISTILL_NOTES_BUDGET_CHARS = 2_500
/** SKILL.md 正文预算（字符）：超 warn、双倍 error——前置加载纪律 */
export const SKILL_DISTILL_BODY_WARN_CHARS = 4_000
export const SKILL_DISTILL_BODY_ERROR_CHARS = 8_000
/** 单张 references 卡片预算 */
export const SKILL_DISTILL_REF_WARN_CHARS = 4_000
export const SKILL_DISTILL_REF_ERROR_CHARS = 8_000
/** 卡片数量上限（超出裁掉并告警——技能包不是资料堆） */
export const SKILL_DISTILL_MAX_REFS = 6
/** description 上限（loader 兼容 + 路由性） */
export const SKILL_DISTILL_DESC_MAX_CHARS = 400
