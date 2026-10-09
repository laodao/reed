/**
 * 技能蒸馏：清洗 / 分块 / 归一 / 审计（纯函数，双端可用）
 * @module shared/utils/skill-distill
 *
 * 纪律（蒸馏自 book-to-skill / anything-to-skill / colleague-skill 的公开方法论）：
 * - 源内容是不可信输入：先剥隐形 Unicode（零宽字符 / Unicode tag 隐写），防提示注入进入
 *   "文档 → 上下文 → 生成技能 → 装进其他 agent" 的供应链；
 * - 长文按标题分块逐块记笔记，组装只看笔记（两遍读取，provenance 在阅读时附着）；
 * - 归一先行（先归一后校验，照搬 ic-blueprint / kb-brain 纪律）：模型多吐字段不致命，
 *   坏条目剔除、缺省填充；
 * - 审计确定性可单测：路由性（description 触发从句）、预算（正文/卡片）、孤儿卡片
 *   （未被正文链接的 reference 永远不会被读）、反抄袭（长句逐字复现源文）、
 *   诚实边界（人设/风格必含）、注入残留。
 */

import {
  SKILL_DISTILL_BODY_ERROR_CHARS,
  SKILL_DISTILL_BODY_WARN_CHARS,
  SKILL_DISTILL_CHUNK_MAX_CHARS,
  SKILL_DISTILL_DESC_MAX_CHARS,
  SKILL_DISTILL_MAX_REFS,
  SKILL_DISTILL_REF_ERROR_CHARS,
  SKILL_DISTILL_REF_WARN_CHARS,
  SKILL_DISTILL_SOURCE_MAX_CHARS,
} from '@shared/types/skill-distill.types'
import type { SkillDistillContentType, SkillDistillIssue, SkillPackageDraft } from '@shared/types/skill-distill.types'
import { SKILL_NAME_PATTERN } from '@shared/types/workflow-skill.types'

// ==================== 源内容清洗 ====================

/**
 * 剥离隐形 Unicode（零宽字符、方向控制符、BMP/星平面私用区——PUA 常被用作
 * 显示为空白/方框的隐写载体）并统一换行。其余内容原样保留。
 * 注意 astral 区间必须带 u 标志：/\uE0000/ 无 u 时被解析成 \uE000+字面量0，
 * 字符类会退化成 [0x30-\uE007]——覆盖全部 CJK，会把中文正文洗没。
 */
export function sanitizeSourceText(text: string): string {
  return (text ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uE000-\uF8FF]/g, '')
    .replace(/[\u{E0000}-\u{E007F}]/gu, '')
    .replace(/\r\n?/g, '\n')
}

/** 源内容规模收口：超上限截断（服务层负责把截断事实写进任务提示） */
export function clampSourceText(text: string, maxChars = SKILL_DISTILL_SOURCE_MAX_CHARS): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

// ==================== 分块 ====================

export interface SourceChunk {
  /** 0 起编号（笔记 provenance 锚点：块#N） */
  index: number
  /** 块标题（取块内首个 markdown 标题；无则空） */
  title: string
  text: string
}

/** 按句子边界切分；无标点的超长句硬切到 maxChars（保证分块上限不被单句击穿） */
function hardSplit(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?|\n/g) ?? [text]
  const out: string[] = []
  let buf = ''
  for (const token of sentences) {
    let s = token
    if (buf.length + s.length > maxChars && buf) {
      out.push(buf)
      buf = ''
    }
    while (s.length > maxChars) {
      if (buf) {
        out.push(buf)
        buf = ''
      }
      out.push(s.slice(0, maxChars))
      s = s.slice(maxChars)
    }
    buf += s
  }
  if (buf.trim()) out.push(buf)
  return out
}

/**
 * 源内容分块：优先按 markdown 标题切（书=章、长文=节），无标题退化为空行段落，
 * 邻近块贪心打包到 maxChars；超长段落按句子硬切。
 * 标题块永远另起一块且标题行与正文首片粘在同一块（标题是块的 provenance 锚点）。
 * 短文（≤maxChars）返回单块——流水线统一走"笔记 → 组装"两遍。
 */
export function chunkSourceText(text: string, maxChars = SKILL_DISTILL_CHUNK_MAX_CHARS): SourceChunk[] {
  const clean = text.trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [{ index: 0, title: '', text: clean }]

  const lines = clean.split('\n')
  interface Unit {
    title: string
    headingLine: string
    text: string
  }
  const units: Unit[] = []
  let cur: Unit | null = null
  const flush = () => {
    if (cur && cur.text.trim()) units.push(cur)
    cur = null
  }
  for (const line of lines) {
    const h = /^#{1,4}\s+(.+)$/.exec(line.trim())
    if (h) {
      flush()
      cur = { title: h[1].trim(), headingLine: line, text: '' }
    } else {
      if (!cur) cur = { title: '', headingLine: '', text: '' }
      cur.text += (cur.text ? '\n' : '') + line
    }
  }
  flush()

  // 无任何标题结构 → 按空行切段落
  let paras: Unit[] = units
  if (units.every(u => !u.title)) {
    paras = []
    for (const u of units) {
      for (const p of u.text.split(/\n{2,}/)) {
        const t = p.trim()
        if (t) paras.push({ title: '', headingLine: '', text: t })
      }
    }
  }

  const chunks: SourceChunk[] = []
  let bufTitle = ''
  let bufText = ''
  const push = () => {
    if (bufText.trim()) chunks.push({ index: chunks.length, title: bufTitle, text: bufText.trim() })
    bufText = ''
    bufTitle = ''
  }
  const append = (piece: string, force = false) => {
    if (!force && bufText && bufText.length + piece.length > maxChars) push()
    bufText = bufText ? `${bufText}\n\n${piece}` : piece
  }
  for (const u of paras) {
    if (u.title) {
      // 标题块另起一块，标题行作为块首；首片正文 force 粘住标题（即便略超预算）
      push()
      bufTitle = u.title
      bufText = u.headingLine
      const body = u.text.trim()
      if (!body) continue
      if (body.length > maxChars) {
        const pieces = hardSplit(body, maxChars)
        append(pieces[0], true)
        for (let i = 1; i < pieces.length; i++) append(pieces[i])
      } else {
        append(body, true)
      }
    } else {
      const body = u.text.trim()
      if (!body) continue
      if (body.length > maxChars) {
        for (const piece of hardSplit(body, maxChars)) append(piece)
      } else {
        append(body)
      }
    }
  }
  push()
  return chunks
}

// ==================== 草稿归一 ====================

/** slug 化：小写、空白/下划线 → 中划线、去非法字符、合并连续中划线 */
export function normalizeSkillName(raw: unknown, fallback: string): string {
  const slug = String(raw ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return SKILL_NAME_PATTERN.test(slug) ? slug : fallback
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 归一卡片文件名：取 basename（模型偶尔带路径）、强制 .md 后缀、小写化 */
function normalizeRefFilename(raw: unknown): string | null {
  const base = (asString(raw)
    .split(/[\\/]/)
    .pop() ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
  if (!base) return null
  return base.endsWith('.md') ? base : `${base}.md`
}

/**
 * 归一模型组装的技能包草稿（先归一后校验）：
 * 名字 slug 化（非法给 fallback）、空字段填缺省、卡片文件名规范化 + 去重 + 截数。
 * 正文/卡片内容为空时保留空串——由 audit 报 error，不在归一层悄悄编内容。
 */
export function normalizeSkillPackageDraft(
  raw: unknown,
  opts: { fallbackName: string; contentType: SkillDistillContentType },
): SkillPackageDraft {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = normalizeSkillName(obj.name, opts.fallbackName)

  const refs: SkillPackageDraft['references'] = []
  const seen = new Set<string>()
  const rawRefs = Array.isArray(obj.references) ? obj.references : []
  for (const r of rawRefs) {
    if (refs.length >= SKILL_DISTILL_MAX_REFS) break
    const rec = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const filename = normalizeRefFilename(rec.filename ?? rec.title)
    const content = asString(rec.content)
    if (!filename || seen.has(filename) || !content) continue
    seen.add(filename)
    refs.push({ filename, content })
  }

  const detected = asString(obj.detectedType)
  return {
    name,
    title: asString(obj.title) || name,
    description: asString(obj.description),
    whenToUse: asString(obj.whenToUse ?? obj.when_to_use),
    category: asString(obj.category),
    body: asString(obj.body),
    references: refs,
    detectedType:
      detected === 'methodology' || detected === 'style' || detected === 'persona'
        ? detected
        : opts.contentType,
  }
}

// ==================== 审计 ====================

/** description 路由性：须含触发从句（当…时 / 适用于 / Use when），否则列表里永远不会被选中 */
const TRIGGER_CLAUSE_RE = /(当[^。，；\n]{2,24}(时|的时候))|适用于|适合用于|use when/i

/** 生成产物里的注入残留（面向 agent 的指令覆写短语——蒸馏一个提示词工程文章时可能误伤，故 warn 级） */
const INJECTION_RESIDUE_RE =
  /ignore\s+(all\s+)?previous|disregard\s+(all\s+)?(prior|above)|忽略(以上|之前|上面|上文)(的)?(所有)?(指令|提示|规则)|<\/?system>|<\/?instructions?>/i

function hasErrors(issues: SkillDistillIssue[]): boolean {
  return issues.some(i => i.level === 'error')
}

/** 从 markdown 提取候选长句（≥minChars 的非代码行片段）用于逐字复现检查 */
function longSentences(text: string, minChars: number): string[] {
  const out: string[] = []
  const inCode = (line: string) => /^\s*(```| {4}|\t)/.test(line)
  for (const line of text.split('\n')) {
    if (inCode(line)) continue
    for (const seg of line.split(/[。！？!?；;]/)) {
      const t = seg.trim()
      if (t.length >= minChars) out.push(t)
    }
  }
  return out
}

export interface AuditOptions {
  /** 源内容（提供时做逐字复现/反抄袭检查） */
  sourceText?: string
  /** 归一层 fallback 用的名字（校验 name 一致性） */
  fallbackName: string
}

/**
 * 确定性审计技能包草稿。error 级不过审（触发修复或失败），warn 级放行但展示。
 * 允许诚实失败：审计从不编造修正，只报告问题。
 */
export function auditSkillPackage(draft: SkillPackageDraft, opts: AuditOptions): SkillDistillIssue[] {
  const issues: SkillDistillIssue[] = []
  const push = (level: SkillDistillIssue['level'], code: string, message: string) => issues.push({ level, code, message })

  // 1) frontmatter 合法性
  if (draft.name !== opts.fallbackName && !SKILL_NAME_PATTERN.test(draft.name)) {
    push('error', 'name-invalid', `技能名 ${draft.name} 不是 kebab-case`)
  }
  if (!draft.description) {
    push('error', 'description-empty', 'description 为空——列表卡片与模型路由全靠它')
  } else {
    if (draft.description.length > SKILL_DISTILL_DESC_MAX_CHARS) {
      push('warn', 'description-over-budget', `description ${draft.description.length} 字，超过 ${SKILL_DISTILL_DESC_MAX_CHARS} 字上限（常驻上下文开销）`)
    }
    if (!TRIGGER_CLAUSE_RE.test(draft.description)) {
      push('warn', 'description-not-routable', 'description 缺少触发从句（如「当需要…时」）——只讲主题不讲场景的描述不会被命中')
    }
  }
  if (!draft.body.trim()) {
    push('error', 'body-empty', 'SKILL.md 正文为空')
  } else {
    if (draft.body.length > SKILL_DISTILL_BODY_ERROR_CHARS) {
      push('error', 'body-over-budget', `正文 ${draft.body.length} 字超过 ${SKILL_DISTILL_BODY_ERROR_CHARS} 字硬上限——技能是地图不是资料堆，把细节移进 references 卡片`)
    } else if (draft.body.length > SKILL_DISTILL_BODY_WARN_CHARS) {
      push('warn', 'body-over-budget', `正文 ${draft.body.length} 字偏长（建议 ≤${SKILL_DISTILL_BODY_WARN_CHARS} 字），重要内容应前置`)
    }
  }

  // 2) 卡片：数量 / 空 / 超预算 / 孤儿（正文没链接的卡片永远不会被打开）
  if (draft.references.length === 0) {
    push('warn', 'no-references', '没有任何 references 卡片——维度细节（框架/决策规则/表达 DNA）建议拆卡，正文只留速览')
  }
  for (const ref of draft.references) {
    if (ref.content.length > SKILL_DISTILL_REF_ERROR_CHARS) {
      push('error', 'reference-over-budget', `卡片 ${ref.filename} ${ref.content.length} 字超过 ${SKILL_DISTILL_REF_ERROR_CHARS} 字硬上限——按维度再拆`)
    } else if (ref.content.length > SKILL_DISTILL_REF_WARN_CHARS) {
      push('warn', 'reference-over-budget', `卡片 ${ref.filename} ${ref.content.length} 字偏长（建议 ≤${SKILL_DISTILL_REF_WARN_CHARS} 字）`)
    }
    if (!draft.body.includes(ref.filename)) {
      push('error', 'orphan-reference', `卡片 ${ref.filename} 未被正文链接——没人链接的卡片永远不会被读，在正文「参考卡片」区补一行链接并注明何时打开`)
    }
  }

  // 3) 诚实边界（人设/风格必含；知识类缺失降为提示）
  const hasBoundary = /诚实边界|局限|不适用|材料不足|未覆盖/.test(draft.body)
  if (!hasBoundary) {
    if (draft.detectedType === 'persona') {
      push('error', 'honest-boundary-missing', '正文缺「诚实边界」——信息不足处必须显式标注，不许编造补齐')
    } else {
      push('warn', 'honest-boundary-missing', '正文未声明覆盖边界（诚实边界/局限/不适用场景）')
    }
  }

  // 4) 注入残留
  const haystack = [draft.body, ...draft.references.map(r => r.content)].join('\n')
  const injection = INJECTION_RESIDUE_RE.exec(haystack)
  if (injection) {
    push('warn', 'injection-residue', `产物含疑似指令注入残留（"${injection[0].slice(0, 24)}"）——源文里的面向 agent 的指令不应进入技能`)
  }

  // 5) 反抄袭：长句逐字复现源文（引用上限 60 字，长复现即搬运）
  if (opts.sourceText) {
    const source = opts.sourceText
    const check = (part: string, where: string) => {
      for (const sentence of longSentences(part, 90)) {
        if (source.includes(sentence)) {
          push('error', 'verbatim-copy', `${where}存在 ≥90 字的逐字搬运句（"${sentence.slice(0, 30)}…"）——提结构与转述，不搬原文；单处引用 ≤60 字`)
          break
        }
      }
    }
    check(draft.body, '正文')
    for (const ref of draft.references) check(ref.content, `卡片 ${ref.filename}`)
  }

  return issues
}

export { hasErrors as auditHasErrors }
