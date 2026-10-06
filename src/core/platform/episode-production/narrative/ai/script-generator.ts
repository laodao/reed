/**
 * narrative/ai/script-generator
 * @module platform/episode-production/narrative/ai/script-generator
 * @description 剧本（章节梗概 + 场景拆分）生成器。spec §4.1 要求 AI 输出 binding_id 强约束。
 *
 * 改造要点（P4-T4）：
 * - 入参从 `Array<{id, name}>` 改为 AssetRosterForScript（含 characters / locations / items 三类）
 * - 提示词把三类资产花名册一并喂给 AI，要求按 binding_id 引用，禁止裸字符串
 * - 解析阶段优先取 AI 给的 *BindingId；空 / 未命中 roster 时按 name 回退到匹配 binding，
 *   依然找不到时落 null（validator 会标违例 → UI 提示用户手动绑）
 */

import type {
  FullScriptGenerationResult,
  GeneratedScene,
  GeneratedSceneCharacter,
  GeneratedDialogue,
  GeneratedAction,
  GeneratedScenePropRef,
  AssetRosterForScript,
  AssetRosterEntry,
  SceneScript,
} from '@shared/types/episode-production'
import type { ScriptGenerationResult } from './types'
import { callAI, callAIWithContinue, extractJsonFromResponse, parseJsonString } from './_helpers'
import { validateScriptCoverage, coverageWarnings } from './script-coverage'
import { buildScriptGenerationDiscipline } from '@core/platform/services/writing-methodology'
import { normalizeBindingName } from '@core/platform/episode-production/assets/services/binding-name-utils'

// ==================== 提示词共享片段（2026-10-06 §2.4：迁到 prompts/specs 单一来源） ====================
//
// 剧本生成 / AI 续写 / 粘贴正文拆分 / 梗概→场景 / 单场景重拆 五类任务共用同一套输出契约
// （marker 标记、场景 JSON 结构、binding 强约束、字段质量要求）。片段现集中定义在
// `prompts/specs/index.ts`（单文件单导出），本文件只 import，不再各自抄写——
// 历史上 `generateScenesFromSynopsis` 手抄片段①导致与片段①漂移。

import {
  BINDING_CONSTRAINT_SPEC,
  SCENE_SPLIT_PRINCIPLES_SPEC,
  SCENE_JSON_EXAMPLE_SPEC,
  FIELD_QUALITY_SPEC,
  ROSTER_LIST_SPEC,
  SCRIPT_FIDELITY_SPEC,
  DIALOGUE_SINGLE_SOURCE_SPEC,
  NARRATION_QUALITY_SPEC,
} from '../../prompts/specs'
import {
  renderStoryBackgroundBlock,
  renderTargetDurationGuidance,
  type PromptContext,
} from '../../prompts/prompt-context'
import { renderGenreDiscipline } from '../../prompts/genre-profiles'
import { createDefaultPromptContext } from '../../prompts/prompt-context'

export {
  BINDING_CONSTRAINT_SPEC,
  SCENE_SPLIT_PRINCIPLES_SPEC,
  SCENE_JSON_EXAMPLE_SPEC,
  FIELD_QUALITY_SPEC,
  ROSTER_LIST_SPEC,
  SCRIPT_FIDELITY_SPEC,
}

/**
 * 剧作改编纪律片段（§3.4：改由体裁档案提供，标题只出现一次）。
 *
 * 历史问题：本文件曾用 `SCRIPT_ADAPTATION_DISCIPLINE_SPEC` 包一层标题、
 * `buildScriptGenerationDiscipline()` 又返回同一标题 —— 渲染后 H2 连续出现两次。
 */
function adaptationDisciplineSpec(ctx: PromptContext): string {
  return renderGenreDiscipline(ctx.genre)
}

/**
 * 占位符填充：把 `{key}` 全部替换为 value。
 *
 * 用 split/join 而不是 String.replace —— 后者会把替换值里的 `$&` / `$'` / `$1`
 * 当成特殊模式，剧本正文里出现 `$` 时会被悄悄改写。
 */
function fillPromptTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(value),
    template,
  )
}

// ==================== 提示词模板 ====================

/**
 * 剧本生成提示词骨架（不含上下文段；由 `buildScriptGenerationPrompt` 拼装）。
 *
 * 结构（§3.4 目标结构）：
 *   ① 角色定位 → ② 输出协议骨架（marker/schema，P1 代码单源）
 *   → ③【故事背景】（新增，PromptContext 注入）
 *   → ④ 体裁纪律片段（按 genre 从体裁档案注入，不再是写死的短剧纪律）
 *   → ⑤ 保真纪律 + 台词单一来源声明
 *   → ⑥ JSON 示例 + 字段质量 + 旁白规范
 *   → ⑦ 花名册 + 篇幅目标 + 章节内容
 *
 * 优化前缺 ③④（无故事背景注入、短剧纪律写死），⑥缺旁白规范，⑤缺台词单一来源声明。
 */
const SCRIPT_GENERATION_SKELETON = `你是一位拥有10年以上一线影视工业经验的职业编剧。

{STORY_BACKGROUND}

## ⚠️⚠️⚠️ 最重要：你必须输出结构化 JSON 场景数据！

**这是你最重要的任务！如果不输出 JSON 场景数据，整个任务就是失败的！**

输出顺序（必须严格遵守）：
1. **先输出 JSON 场景数据**（最重要的部分）
2. 再输出章节梗概
3. 最后输出剧本正文

---

## 第一部分：结构化场景数据（JSON格式） - ⭐必须输出

格式要求：
- 开头写：【场景数据开始】
- 结尾写：【场景数据结束】
- 中间是完整的 JSON 数据（必须包含 scenes 数组）
- JSON 必须合法，可直接解析
- **这部分绝对不能跳过！如果跳过，整个生成将失败！**

---

## 第二部分：章节梗概

格式要求：
- 开头写：【梗概开始】
- 结尾写：【梗概结束】
- 中间是 50-100 字的章节概要

---

## 第三部分：完整剧本正文

格式要求：
- 开头写：【剧本正文开始】
- 结尾写：【剧本正文结束】
- 中间是标准剧本格式（中文场景标题；动作描写现在时；角色对白居中缩进）
- 严禁使用 Markdown 格式
- 仅使用纯文本标准剧本缩进与换行

---

{BINDING_CONSTRAINT_SPEC}

---

{SCENE_SPLIT_PRINCIPLES_SPEC}

---

{ADAPTATION_DISCIPLINE_SPEC}

---

{SCRIPT_FIDELITY_SPEC}

---

{DIALOGUE_SINGLE_SOURCE_SPEC}

---

{SCENE_JSON_EXAMPLE_SPEC}

---

{FIELD_QUALITY_SPEC}

---

{NARRATION_QUALITY_SPEC}

{ROSTER_LIST_SPEC}

{TARGET_DURATION_GUIDANCE}

## 章节内容

{chapterContent}`

/**
 * 构建整集剧本生成提示词（上下文注入版，§3.4）。
 *
 * 渲染顺序与片段全部来自注册表；`ctx` 决定故事背景与体裁纪律。
 * 渲染后再由调用方用 `fillPromptTemplate` 注入花名册与章节内容
 * （保留 `{characters}`/`{locations}`/`{items}`/`{chapterContent}` 占位符）。
 *
 * @param ctx PromptContext（缺省不注入业务变量，行为等价优化前）
 */
export function buildScriptGenerationPrompt(ctx: PromptContext = createDefaultPromptContext()): string {
  return fillPromptTemplate(SCRIPT_GENERATION_SKELETON, {
    STORY_BACKGROUND: renderStoryBackgroundBlock(ctx),
    BINDING_CONSTRAINT_SPEC,
    SCENE_SPLIT_PRINCIPLES_SPEC,
    ADAPTATION_DISCIPLINE_SPEC: adaptationDisciplineSpec(ctx),
    SCRIPT_FIDELITY_SPEC,
    DIALOGUE_SINGLE_SOURCE_SPEC,
    SCENE_JSON_EXAMPLE_SPEC,
    FIELD_QUALITY_SPEC,
    NARRATION_QUALITY_SPEC,
    ROSTER_LIST_SPEC,
    TARGET_DURATION_GUIDANCE: renderTargetDurationGuidance(ctx),
  })
    // 可选段（背景/体裁纪律/篇幅目标）为空时收拢多余空行——
    // 优化前只拼固定片段不存在该问题，引入可选段后必须处理，否则提示词出现 3+ 连续空行
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * 向后兼容的静态模板（= 无上下文版本的渲染结果，仍保留花名册/章节内容占位符）。
 *
 * 供既有调用方继续使用；新代码请用 `buildScriptGenerationPrompt(ctx)`。
 */
const SCRIPT_GENERATION_PROMPT = buildScriptGenerationPrompt()

/**
 * 渲染完整剧本生成提示词：上下文段 + 花名册 + 章节内容（§3.4）。
 *
 * 统一走 `fillPromptTemplate`（split/join 实现）——优化前三处调用点用的是
 * `String.replace` 链，剧本正文里出现 `$&` / `$'` / `$1` 时会被当成特殊模式**静默改写**。
 *
 * @param chapterContent 章节内容
 * @param roster         三类资产花名册
 * @param ctx            PromptContext（缺省不注入业务变量）
 */
function renderScriptGenerationPrompt(
  chapterContent: string,
  roster: AssetRosterForScript,
  ctx?: PromptContext,
): string {
  const template = ctx ? buildScriptGenerationPrompt(ctx) : SCRIPT_GENERATION_PROMPT
  return fillPromptTemplate(template, {
    characters: formatRosterList(roster.characters),
    locations: formatRosterList(roster.locations),
    items: formatRosterList(roster.items),
    chapterContent,
  })
}

/**
 * AI 续写提示词（已有剧本 → 往下继续增加内容）。
 *
 * 场景：剧本没写完就先开机制作了，后续要陆续往里加内容。
 * 与"重新生成"的根本区别——**只增量、不覆盖**：
 * - 只输出本次新增的正文与场景，禁止重复 / 改写已有内容
 * - 新增场景场次号从 {startSceneNumber} 起接续，禁止从 1 重新编号
 *
 * 输出 marker 与生成提示词保持一致，解析复用 extractFullScriptFromResponse。
 */
const SCRIPT_CONTINUATION_PROMPT = `你是一位拥有10年以上一线影视工业经验的职业编剧。
你正在为一部**已经开拍**的剧集续写剧本：此前只写完了前面一部分，现在需要往下继续增加内容。
续写必须与已有剧情、人物性格、世界观、伏笔完全连贯。

{STORY_BACKGROUND}

## ⚠️⚠️⚠️ 最重要：你必须输出结构化 JSON 场景数据！

**这是你最重要的任务！如果不输出 JSON 场景数据，整个任务就是失败的！**

输出顺序（必须严格遵守）：
1. **先输出 JSON 场景数据**（本次新增的场景）
2. 再输出本段梗概
3. 最后输出本段剧本正文

---

## 第一部分：结构化场景数据（JSON格式） - ⭐必须输出

格式要求：
- 开头写：【场景数据开始】
- 结尾写：【场景数据结束】
- 中间是完整的 JSON 数据（必须包含 scenes 数组）
- JSON 必须合法，可直接解析
- **场次号从第 {startSceneNumber} 场开始按顺序递增**（接续已有场次，严禁从 1 重新编号）
- **只输出本次新增的场景，严禁重复已经存在的场次**
- **这部分绝对不能跳过！如果跳过，整个生成将失败！**

---

## 第二部分：本段梗概

格式要求：
- 开头写：【梗概开始】
- 结尾写：【梗概结束】
- 中间是 50-100 字，只概括本次新增部分的剧情

---

## 第三部分：本段剧本正文

格式要求：
- 开头写：【剧本正文开始】
- 结尾写：【剧本正文结束】
- 中间是标准剧本格式（中文场景标题；动作描写现在时；角色对白居中缩进）
- **只写本次新增部分，严禁重复或改写已有正文**
- 严禁使用 Markdown 格式
- 仅使用纯文本标准剧本缩进与换行

---

${BINDING_CONSTRAINT_SPEC}

---

${SCENE_SPLIT_PRINCIPLES_SPEC}

---

${SCENE_JSON_EXAMPLE_SPEC}

---

${FIELD_QUALITY_SPEC}

---

{SCRIPT_FIDELITY_SPEC}

## 已有剧情正文（只读上下文 · 不要重复输出）

{existingScriptContent}

## 已有场次一览（只读上下文 · 新增场次必须接着往下排）

{existingScenesSummary}

## 本次续写要求

{instruction}

${ROSTER_LIST_SPEC}`

/**
 * 「粘贴正文 → 拆场景」提示词（手动追加剧本用）。
 *
 * 正文由用户自己提供，所以不要求 AI 输出正文/梗概，只要结构化场景。
 * 解析仍走 extractFullScriptFromResponse（它容忍缺少梗概与正文），调用方只取 scenes。
 */
const SCENE_SPLIT_FROM_TEXT_PROMPT = `你是一位拥有10年以上一线影视工业经验的职业编剧。
下面是一段**已经写好的剧本正文**（纯文本，可能是标准剧本格式，也可能是小说体叙述），
请把它拆分成结构化的场景数据，供影视工业化制作使用。

{STORY_BACKGROUND}

## ⚠️⚠️⚠️ 最重要：你必须输出结构化 JSON 场景数据！

输出要求：
- 用【场景数据开始】开头，用【场景数据结束】结尾，中间是合法、可直接解析的 JSON
- JSON 必须包含 scenes 数组
- **场次号从第 {startSceneNumber} 场开始按顺序递增**（接续已有场次，严禁从 1 重新编号）
- **只拆分这段正文里已有的情节，严禁补写正文里没有的内容**
- **正文中的每一句对白都必须进入 dialogues，不得整句丢弃**；伏笔物件、约定/规则、笑点等关键节拍必须各有场次承接
- 正文没写明的视觉细节（空间布局 / 材质 / 光线 / 服装）按下方字段质量要求合理补全，不要留空字符串

---

${SCENE_SPLIT_PRINCIPLES_SPEC}

---

${BINDING_CONSTRAINT_SPEC}

---

${SCENE_JSON_EXAMPLE_SPEC}

---

${FIELD_QUALITY_SPEC}

## 已有场次一览（只读上下文 · 新增场次必须接着往下排）

{existingScenesSummary}

## 待拆分的剧本正文

{scriptText}

${ROSTER_LIST_SPEC}`

/**
 * 49 号：正文救援提示词——场景 JSON 吃掉全部输出预算时（finish=length 截断在 JSON 内），
 * 用小输出预算单独补写剧本正文，不再让整次生成失败。
 */
/**
 * 正文救援提示词骨架（场景 JSON 吃光输出预算导致正文缺失时，小预算单独补写正文）。
 *
 * §3.4 修正三处与主路径的不一致：
 *   1. 正文格式措辞缺"居中缩进"（主路径有）——救援正文与主路径正文会拼接进同一剧集，
 *      格式必须一致；
 *   2. 缺保真纪律（SCRIPT_FIDELITY_SPEC）——而它的产出恰恰要参与覆盖度比对；
 *   3. 缺物品列表（主路径三类花名册齐全）。
 */
const SCRIPT_BODY_ONLY_PROMPT = `基于以下章节内容，直接撰写完整剧本正文。
只输出剧本正文，不要输出 JSON 场景数据，不要输出梗概。

格式要求：
- 开头写：【剧本正文开始】
- 结尾写：【剧本正文结束】
- 中间是标准剧本格式（中文场景标题；动作描写现在时；角色对白居中缩进）
- 严禁使用 Markdown
- 仅使用纯文本标准剧本缩进与换行

{ADAPTATION_DISCIPLINE_SPEC}

---

{SCRIPT_FIDELITY_SPEC}

## 可用角色列表

{characters}

## 可用地点列表

{locations}

## 可用物品列表

{items}

## 章节内容

{chapterContent}`

/**
 * 构建正文救援提示词（上下文注入版）。
 *
 * @param ctx PromptContext（缺省不注入体裁纪律，行为等价优化前）
 */
export function buildScriptBodyOnlyPrompt(ctx: PromptContext = createDefaultPromptContext()): string {
  return fillPromptTemplate(SCRIPT_BODY_ONLY_PROMPT, {
    ADAPTATION_DISCIPLINE_SPEC: adaptationDisciplineSpec(ctx),
    SCRIPT_FIDELITY_SPEC,
  })
}

// ==================== 辅助函数 ====================

/**
 * 把 roster 转成提示词里的清单字符串。
 * 空 roster 输出 "(无)"，避免 AI 看到空字符串导致格式幻觉。
 */
function formatRosterList(entries: AssetRosterEntry[]): string {
  if (entries.length === 0) return '(无)'
  return entries
    .map((e) => `- bindingId: ${e.bindingId}, 名称: ${e.name}${e.description ? `, 描述: ${e.description}` : ''}`)
    .join('\n')
}

/**
 * 按 name 在 roster 中查 binding ID（AI 给错 ID 或没给时的兜底）。
 * 归一化口径与 binding-name-utils 一致（书名号/全角空格/大小写差异都能命中）。
 */
function lookupBindingByName(
  entries: AssetRosterEntry[],
  name: string | undefined | null,
): string | null {
  if (!name) return null
  const norm = normalizeBindingName(name)
  if (!norm) return null
  const match = entries.find((e) => normalizeBindingName(e.name) === norm)
  return match ? match.bindingId : null
}

/**
 * 解析 AI 给的 binding ID：
 * 1. AI 字段非空且命中 roster → 用 AI 给的
 * 2. AI 字段空 / 不在 roster → 按 name 回退查 roster
 * 3. 还查不到 → null（validator 会标违例）
 */
function resolveBindingId(
  entries: AssetRosterEntry[],
  rawBindingId: unknown,
  fallbackName: string | undefined | null,
): string | null {
  if (typeof rawBindingId === 'string' && rawBindingId.length > 0) {
    if (entries.some((e) => e.bindingId === rawBindingId)) {
      return rawBindingId
    }
  }
  return lookupBindingByName(entries, fallbackName)
}

// ==================== 主类 ====================

/** AI 续写入参（已有剧本 → 继续往下增加内容） */
export interface ContinueScriptInput {
  /** 已有剧本正文（空字符串表示这段剧本还没有正文，仅按场景接续） */
  existingScriptContent: string
  /** 已有场次一览（ScriptAppendService.buildExistingScenesSummary 产出） */
  existingScenesSummary: string
  /** 用户续写要求（自由文本，直接进提示词） */
  instruction: string
  /** 新增场景的起始场次号（= 已有最大场次号 + 1） */
  startSceneNumber: number
  roster: AssetRosterForScript
  providerConfigId?: string
  modelId?: string
}

/** 「粘贴正文 → 拆场景」入参（手动追加剧本） */
export interface SplitScriptTextInput {
  /** 待拆分的剧本正文（用户粘贴 / 手输） */
  scriptText: string
  /** 已有场次一览 */
  existingScenesSummary: string
  /** 新增场景的起始场次号 */
  startSceneNumber: number
  roster: AssetRosterForScript
  providerConfigId?: string
  modelId?: string
}

/** 续写提示词骨架（不再由本文件内联维护，见 buildContinuationPrompt） */

/** 按入参渲染续写提示词（导出给单测断言，AI 调用走 continueScript） */
export function buildContinuationPrompt(
  input: ContinueScriptInput,
  ctx: PromptContext = createDefaultPromptContext(),
): string {
  return fillPromptTemplate(SCRIPT_CONTINUATION_PROMPT, {
    STORY_BACKGROUND: renderStoryBackgroundBlock(ctx),
    // §3.4 / C2：续写此前**有意不含保真纪律**（假设"输入已是剧本"），
    // 但"按大纲续写新章节"场景下输入恰是原著正文，没有保真纪律就会丢对白。
    // 现在按背景是否来自原文统一注入。
    SCRIPT_FIDELITY_SPEC,
    startSceneNumber: String(input.startSceneNumber),
    existingScriptContent: input.existingScriptContent.trim() || '(暂无正文)',
    existingScenesSummary: input.existingScenesSummary.trim() || '(暂无场次)',
    instruction: input.instruction.trim(),
    characters: formatRosterList(input.roster.characters),
    locations: formatRosterList(input.roster.locations),
    items: formatRosterList(input.roster.items),
  })
}

/** 按入参渲染「正文拆场景」提示词（导出给单测断言） */
export function buildSceneSplitFromTextPrompt(
  input: SplitScriptTextInput,
  ctx: PromptContext = createDefaultPromptContext(),
): string {
  return fillPromptTemplate(SCENE_SPLIT_FROM_TEXT_PROMPT, {
    STORY_BACKGROUND: renderStoryBackgroundBlock(ctx),
    startSceneNumber: String(input.startSceneNumber),
    existingScenesSummary: input.existingScenesSummary.trim() || '(暂无场次)',
    scriptText: input.scriptText.trim(),
    characters: formatRosterList(input.roster.characters),
    locations: formatRosterList(input.roster.locations),
    items: formatRosterList(input.roster.items),
  })
}

/**
 * 剧本生成器
 */
export class EpisodeScriptGenerator {
  private static instance: EpisodeScriptGenerator

  private constructor() {}

  static getInstance(): EpisodeScriptGenerator {
    if (!EpisodeScriptGenerator.instance) {
      EpisodeScriptGenerator.instance = new EpisodeScriptGenerator()
    }
    return EpisodeScriptGenerator.instance
  }

  // ==================== 私有辅助方法 ====================

  private parseJsonString(jsonStr: string): any {
    return parseJsonString(jsonStr)
  }

  /**
   * 从完整剧本响应中提取三部分内容
   * 支持新旧两种格式标记：
   * - 新格式：【梗概开始】【梗概结束】等（适配国产大模型）
   * - 旧格式：===SYNOPSIS=== ===SYNOPSIS_END=== 等（兼容旧版）
   *
   * BUG-2 前置（v2.3）：添加结构化路径追踪，统计每种解析路径的命中频率。
   * 这些数据用于判断是否有必要做标记系统统一。
   */
  private extractFullScriptFromResponse(
    response: string,
    roster: AssetRosterForScript,
  ): FullScriptGenerationResult {
    console.log('[EpisodeScriptGenerator] 解析完整剧本响应，长度:', response.length)
    console.log('[EpisodeScriptGenerator] 响应前1000字符:', response.substring(0, 1000))

    // BUG-2 前置：解析路径追踪
    const pathTrace = {
      synopsisPath: 'none' as 'new' | 'old' | 'json-fallback' | 'none',
      scriptPath: 'new' as 'new' | 'old' | 'none',
      scenesPath: 'none' as 'new' | 'old' | 'json-block' | 'fallback' | 'failed',
      scenesCount: 0,
    }

    let synopsis = ''
    let scriptContent = ''
    let scenes: GeneratedScene[] = []

    // 新格式：【梗概开始】【梗概结束】
    const synopsisMatchNew = response.match(/【梗概开始】\s*([\s\S]*?)\s*【梗概结束】/)
    if (synopsisMatchNew) {
      synopsis = synopsisMatchNew[1].trim()
      pathTrace.synopsisPath = 'new'
    }

    // 旧格式兼容：===SYNOPSIS=== ===SYNOPSIS_END===
    if (!synopsis) {
      const synopsisMatchOld = response.match(/===SYNOPSIS===\s*([\s\S]*?)\s*===SYNOPSIS_END===/)
      if (synopsisMatchOld) {
        synopsis = synopsisMatchOld[1].trim()
        pathTrace.synopsisPath = 'old'
      }
    }

    // 新格式：【剧本正文开始】【剧本正文结束】
    const scriptMatchNew = response.match(/【剧本正文开始】\s*([\s\S]*?)\s*【剧本正文结束】/)
    if (scriptMatchNew) {
      scriptContent = scriptMatchNew[1].trim()
      pathTrace.scriptPath = 'new'
    }

    // 旧格式兼容
    if (!scriptContent) {
      const scriptMatchOld = response.match(/===SCRIPT===\s*([\s\S]*?)\s*===SCRIPT_END===/)
      if (scriptMatchOld) {
        scriptContent = scriptMatchOld[1].trim()
        pathTrace.scriptPath = 'old'
      }
    }

    // 场景数据解析（尝试多种格式）
    // 1. 新格式：【场景数据开始】【场景数据结束】
    const scenesMatchNew = response.match(/【场景数据开始】\s*([\s\S]*?)\s*【场景数据结束】/)
    if (scenesMatchNew) {
      console.log('[EpisodeScriptGenerator] 找到新格式场景标记')
      scenes = this.parseScenesJson(scenesMatchNew[1].trim(), roster)
      pathTrace.scenesPath = 'new'
    }

    // 2. 旧格式：===SCENES_JSON=== ===SCENES_JSON_END===
    if (scenes.length === 0) {
      const scenesMatchOld = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
      if (scenesMatchOld) {
        console.log('[EpisodeScriptGenerator] 找到旧格式场景标记')
        scenes = this.parseScenesJson(scenesMatchOld[1].trim(), roster)
        pathTrace.scenesPath = 'old'
      }
    }

    // 3. ```json 代码块格式（DeepSeek 常用）
    if (scenes.length === 0) {
      const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonBlockMatch) {
        console.log('[EpisodeScriptGenerator] 找到 json 代码块')
        scenes = this.parseScenesJson(jsonBlockMatch[1].trim(), roster)
        pathTrace.scenesPath = 'json-block'
      }
    }

    // 4. 直接查找 scenes 数组（兜底）
    if (scenes.length === 0) {
      const scenesArrayMatch = response.match(/"scenes"\s*:\s*\[/)
      if (scenesArrayMatch) {
        console.log('[EpisodeScriptGenerator] 尝试直接提取 scenes 数组')
        const start = scenesArrayMatch.index!
        const jsonStr = this.extractJsonFromPosition(response, start)
        if (jsonStr) {
          try {
            const data = this.parseJsonString(jsonStr)
            if (data.scenes && Array.isArray(data.scenes)) {
              scenes = this.convertSceneDataToGeneratedScenes(data.scenes, roster)
              pathTrace.scenesPath = 'fallback'
            }
          } catch (e) {
            console.error('[EpisodeScriptGenerator] 直接提取 scenes 失败:', e)
          }
        }
      }
    }

    if (!synopsis) {
      // 从场景数据中提取 synopsis（如果 AI 把梗概放在 JSON 里）
      try {
        const anyJsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*"scenes"[\s\S]*\}/)
        if (anyJsonMatch) {
          const data = this.parseJsonString(anyJsonMatch[0])
          if (data.synopsis) {
            synopsis = data.synopsis
            pathTrace.synopsisPath = 'json-fallback'
          }
        }
      } catch {
        // 忽略
      }
    }

    // 记录场景数
    pathTrace.scenesCount = scenes.length
    if (scenes.length === 0) pathTrace.scenesPath = 'failed'

    if (!scriptContent) console.warn('[EpisodeScriptGenerator] 未找到剧本正文')
    if (scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 未找到场景数据，请检查 AI 输出格式')
      console.log('[EpisodeScriptGenerator] 响应后1000字符:', response.substring(Math.max(0, response.length - 1000)))
    } else {
      console.log('[EpisodeScriptGenerator] 成功解析场景数:', scenes.length)
    }

    // BUG-2 前置：输出结构化路径追踪日志（JSON 格式，便于后续统计）
    console.log('[EpisodeScriptGenerator] 解析路径追踪:', JSON.stringify(pathTrace))

    return { synopsis, scriptContent, scenes }
  }

  /**
   * 解析场景 JSON 数据
   */
  private parseScenesJson(jsonStr: string, roster: AssetRosterForScript): GeneratedScene[] {
    try {
      const scenesData = this.parseJsonString(jsonStr)
      if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
        return this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
      }
    } catch (e) {
      console.error('[EpisodeScriptGenerator] 解析场景 JSON 失败:', e)
    }
    return []
  }

  /**
   * 从指定位置提取完整 JSON 对象
   */
  private extractJsonFromPosition(response: string, startPos: number): string | null {
    // 找到包含 scenes 的完整 JSON 对象
    let braceCount = 0
    let jsonStart = -1
    for (let i = startPos; i >= 0; i--) {
      if (response[i] === '{') {
        jsonStart = i
        break
      }
    }
    if (jsonStart === -1) return null

    let jsonEnd = -1
    braceCount = 0
    for (let i = jsonStart; i < response.length; i++) {
      if (response[i] === '{') braceCount++
      else if (response[i] === '}') {
        braceCount--
        if (braceCount === 0) {
          jsonEnd = i + 1
          break
        }
      }
    }
    if (jsonEnd === -1) return null

    return response.substring(jsonStart, jsonEnd)
  }

  /**
   * 将 AI 返回的场景数据转换为 GeneratedScene 格式（带 binding_id 解析）。
   */
  private convertSceneDataToGeneratedScenes(
    sceneData: any[],
    roster: AssetRosterForScript,
  ): GeneratedScene[] {
    return sceneData.map((scene, index) => {
      const characters: GeneratedSceneCharacter[] = (scene.characters || []).map(
        (char: any) => {
          const props: GeneratedScenePropRef[] = Array.isArray(char.props)
            ? char.props
                .map((p: any) => this.normalizeProp(p, roster))
                .filter((p: GeneratedScenePropRef | null): p is GeneratedScenePropRef => p !== null)
            : []
          return {
            characterBindingId: resolveBindingId(
              roster.characters,
              char.characterBindingId,
              char.characterName,
            ),
            characterId: char.characterId || '',
            characterName: char.characterName || '未知角色',
            portraitId: char.portraitId,
            position: char.position || 'center',
            expression: char.expression,
            action: char.action,
            outfit: char.outfit,
            props,
          }
        },
      )

      const dialogues: GeneratedDialogue[] = (scene.dialogues || []).map(
        (dlg: any, dlgIndex: number) => {
          // AI 漏填说话人时的兜底：本场景只有一个角色时，对话必属该角色
          const soleChar =
            !dlg.characterName && !dlg.characterBindingId && characters.length === 1
              ? characters[0]!
              : null
          return {
            id: dlg.id || `dlg_${Date.now()}_${dlgIndex}`,
            characterBindingId: resolveBindingId(
              roster.characters,
              dlg.characterBindingId ?? soleChar?.characterBindingId,
              dlg.characterName ?? soleChar?.characterName,
            ),
            characterId: dlg.characterId || '',
            characterName: dlg.characterName || soleChar?.characterName || '未知角色',
            text: dlg.text || '',
            emotion: dlg.emotion,
            volume: dlg.volume || 'normal',
            pace: dlg.pace || 'normal',
            pause: dlg.pause || 0,
            voiceId: dlg.voiceId ?? null,
          }
        },
      )

      const actions: GeneratedAction[] = (scene.actions || []).map(
        (act: any, actIndex: number) => ({
          id: act.id || `act_${Date.now()}_${actIndex}`,
          // 群像动作允许 null（AI 可能不传 characterBindingId 也不传 characterName）
          characterBindingId: resolveBindingId(
            roster.characters,
            act.characterBindingId,
            act.characterName,
          ),
          characterId: act.characterId,
          description: act.description || '',
          timing: act.timing || 'before',
          duration: act.duration,
        }),
      )

      return {
        sceneNumber: scene.sceneNumber || index + 1,
        location: scene.location || '未知地点',
        locationBindingId: resolveBindingId(
          roster.locations,
          scene.locationBindingId,
          scene.location,
        ),
        locationType: scene.locationType || 'interior',
        timeOfDay: scene.timeOfDay || 'morning',
        weather: scene.weather,
        sceneDescription: scene.sceneDescription || '',
        locationKeyObjects: Array.isArray(scene.locationKeyObjects)
          ? scene.locationKeyObjects.filter((obj: unknown) => typeof obj === 'string')
          : [],
        mood: scene.mood || '',
        lighting: scene.lighting,
        characters,
        originalText: scene.originalText || '',
        narration: scene.narration || '',
        dialogues,
        actions,
      } as GeneratedScene
    })
  }

  /** 把一条 prop（可能是字符串或 {itemBindingId,name}）规范化为 GeneratedScenePropRef */
  private normalizeProp(
    raw: unknown,
    roster: AssetRosterForScript,
  ): GeneratedScenePropRef | null {
    if (raw == null) return null
    if (typeof raw === 'string') {
      // 老格式：纯字符串 → 仅按 name 匹配
      const trimmed = raw.trim()
      if (!trimmed) return null
      return {
        itemBindingId: lookupBindingByName(roster.items, trimmed),
        name: trimmed,
      }
    }
    if (typeof raw === 'object') {
      const obj = raw as { itemBindingId?: unknown; name?: unknown }
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (!name) return null
      return {
        itemBindingId: resolveBindingId(roster.items, obj.itemBindingId, name),
        name,
      }
    }
    return null
  }

  // ==================== 公开方法 ====================

  /**
   * 生成完整剧本（含正文 + 结构化数据 + binding 引用强约束）
   *
   * @param ctx PromptContext（§3.4：故事背景/体裁纪律/篇幅目标注入；
   *            缺省不注入，行为等价优化前）
   */
  async generateFullScript(
    chapterContent: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
    ctx?: PromptContext,
  ): Promise<FullScriptGenerationResult> {
    console.log('[EpisodeScriptGenerator] 开始生成剧本...')
    console.log('[EpisodeScriptGenerator] 资产花名册:', {
      characters: roster.characters.length,
      locations: roster.locations.length,
      items: roster.items.length
    })

    const prompt = renderScriptGenerationPrompt(chapterContent, roster, ctx)

    const systemPrompt =
      '你是一位拥有10年以上一线影视工业经验的职业编剧。请严格按照要求的格式输出，不要添加任何额外的开场白或结束语。所有引用必须使用提供的 binding ID，不要瞎编 ID。必须输出【场景数据开始】【场景数据结束】标记的 JSON 场景数据！'

    console.log('[EpisodeScriptGenerator] 调用 AI，提示词长度:', prompt.length)

    const response = await callAIWithContinue(prompt, systemPrompt, 16000, providerConfigId, modelId, 2, { temperature: 0.3 })

    // 49 号：正文被截断时续写一次（fail-soft——续写失败保留原样，走既有解析兜底）
    let fullResponse = response
    if (response.includes('【剧本正文开始】') && !response.includes('【剧本正文结束】')) {
      try {
        const tail = response.slice(-1200)
        const cont = await callAI(
          `你上一轮的剧本输出在正文处被截断了。以下是你已输出内容的结尾片段：\n${tail}\n请从截断处直接继续输出剩余剧本正文：不要重复已输出的内容，不要添加任何说明，输出完毕后以【剧本正文结束】收尾。`,
          systemPrompt,
          8000,
          providerConfigId,
          modelId,
          { temperature: 0.3 },
        )
        fullResponse = response.trimEnd() + '\n' + cont.replace(/【剧本正文开始】/g, '').trim()
        console.log('[EpisodeScriptGenerator] 正文截断续写完成，拼接后长度:', fullResponse.length)
      } catch (e) {
        console.warn('[EpisodeScriptGenerator] 正文续写失败（保留原输出）:', e instanceof Error ? e.message : String(e))
      }
    }

    // 输出完整的 AI 响应（用于诊断 DeepSeek 格式问题）
    console.log('[EpisodeScriptGenerator] AI 响应长度:', fullResponse.length)

    // 检查响应中是否有场景标记
    const hasNewFormat = fullResponse.includes('【场景数据开始】')
    const hasOldFormat = fullResponse.includes('===SCENES_JSON===')
    const hasJsonBlock = fullResponse.includes('```json')
    const hasScenesArray = fullResponse.includes('"scenes"')

    console.log('[EpisodeScriptGenerator] 格式检测:', {
      '新格式【场景数据】': hasNewFormat,
      '旧格式===SCENES_JSON===': hasOldFormat,
      'json代码块': hasJsonBlock,
      'scenes数组': hasScenesArray
    })

    const result = this.extractFullScriptFromResponse(fullResponse, roster)

    if (!result.synopsis) console.warn('[EpisodeScriptGenerator] 生成的剧本缺少梗概')
    if (!result.scriptContent) {
      // 49 号：场景 JSON 吃光输出预算（截断在 JSON 内）导致正文缺失——单独补写正文
      console.warn('[EpisodeScriptGenerator] 正文缺失，走正文单独补写救援路径')
      const rescuePrompt = fillPromptTemplate(buildScriptBodyOnlyPrompt(ctx), {
        characters: formatRosterList(roster.characters),
        locations: formatRosterList(roster.locations),
        items: formatRosterList(roster.items),
        chapterContent,
      })
      try {
        const bodyResp = await callAI(rescuePrompt, systemPrompt, 8000, providerConfigId, modelId, { temperature: 0.3 })
        const bodyMatch = bodyResp.match(/【剧本正文开始】\s*([\s\S]*?)\s*【剧本正文结束】/)
        const body = (bodyMatch ? bodyMatch[1] : bodyResp).trim()
        if (body) {
          result.scriptContent = body
          if (!result.synopsis) {
            result.synopsis = chapterContent.slice(0, 100)
          }
          console.log('[EpisodeScriptGenerator] 正文救援成功，长度:', body.length)
        }
      } catch (e) {
        console.warn('[EpisodeScriptGenerator] 正文救援失败:', e instanceof Error ? e.message : String(e))
      }
    }
    if (!result.scriptContent) {
      throw new Error('生成的剧本缺少剧本正文，请检查 AI 模型是否支持长文本输出')
    }
    // S1：空场景与缺正文同等待遇——handler 拿到结果会进「删旧场景+建新场景」事务，
    // 这里放行等于删光旧场景后新场景为 0，必须抛错阻断
    if (result.scenes.length === 0) {
      throw new Error('生成的剧本缺少结构化场景数据，请重试或检查 AI 模型是否支持长文本输出')
    }

    console.log('[EpisodeScriptGenerator] 解析结果:', {
      synopsisLength: result.synopsis.length,
      scriptContentLength: result.scriptContent.length,
      scenesCount: result.scenes.length
    })

    // 2026-09-21：原文覆盖度校验（仿 shot-pacing；只警告不阻断）——
    // 雪麓山庄实测丢过整段对白与伏笔，这里把缺失对白打到主进程日志。
    for (const w of coverageWarnings(validateScriptCoverage(
      chapterContent,
      [
        ...result.scenes.flatMap(s => (s.dialogues ?? []).map(d => d.text)),
        ...result.scenes.map(s => s.narration ?? ''),
        result.scriptContent,
      ],
    ))) {
      console.warn(`[script-coverage] ${w}`)
    }

    return result
  }

  /**
   * 仅生成结构化剧本（无正文，兼容老入口）
   */
  async generateScript(
    chapterContent: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<ScriptGenerationResult> {
    const prompt = renderScriptGenerationPrompt(chapterContent, roster)

    const systemPrompt =
      '你是一个专业的影视编剧，擅长将小说转换为视频剧本。请严格按照要求格式输出，所有引用使用提供的 binding ID。'

    const response = await callAI(prompt, systemPrompt, 8192, providerConfigId, modelId, { temperature: 0.3 })
    const result = extractJsonFromResponse(response)

    if (!result.synopsis || !Array.isArray(result.scenes)) {
      throw new Error('生成的剧本格式不正确，缺少必要字段')
    }
    // 注：这里走的是简化模式（无正文），调用方一般用 generateFullScript
    result.scenes = this.convertSceneDataToGeneratedScenes(result.scenes, roster)
    return result as ScriptGenerationResult
  }

  /**
   * AI 续写剧本（增量 · 不覆盖已有内容）。
   *
   * 场景：剧本没写完就先开机制作，后续陆续往剧本里加内容（spec 剧本 stage「继续增加剧本」）。
   * 返回的 scenes 由 AI 按 startSceneNumber 连续编号；调用方 ScriptAppendService
   * 仍会兜底重编号一次，防止 AI 不听话把场次号写乱。
   *
   * @throws 当 AI 既没给出正文、也没给出场景时（此时追加毫无意义）
   */
  async continueScript(input: ContinueScriptInput): Promise<FullScriptGenerationResult> {
    if (!input.instruction.trim()) {
      throw new Error('续写要求不能为空')
    }

    const prompt = buildContinuationPrompt(input)
    const systemPrompt =
      '你是一位拥有10年以上一线影视工业经验的职业编剧，正在为一部已开拍的剧集续写剧本。' +
      '请严格按照要求格式输出，不要添加任何开场白或结束语。' +
      '所有引用必须使用提供的 binding ID，不要瞎编 ID。' +
      '必须输出【场景数据开始】【场景数据结束】标记的 JSON 场景数据，且只输出本次新增的场景。'

    const response = await callAIWithContinue(
      prompt,
      systemPrompt,
      16000,
      input.providerConfigId,
      input.modelId,
      2,
      { temperature: 0.3 },
    )
    const result = this.extractFullScriptFromResponse(response, input.roster)

    if (!result.scriptContent && result.scenes.length === 0) {
      throw new Error(
        'AI 没有返回可用的续写内容（既无剧本正文也无场景数据），请重试或把续写要求写得更具体',
      )
    }
    if (!result.scriptContent) {
      console.warn('[EpisodeScriptGenerator] 续写结果缺少剧本正文，仅追加场景数据')
    }
    if (result.scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 续写结果缺少场景数据，仅追加剧本正文')
    }
    return result
  }

  /**
   * 把用户粘贴的剧本正文拆成结构化场景（手动追加剧本）。
   *
   * 正文由用户提供，因此不产出正文/梗概，只取场景数组。
   * 解析不出场景时返回空数组（不抛错）——调用方会让用户看到"只追加正文"的提示，
   * 而不是把用户已经写好的正文卡在门外。
   */
  async splitScriptTextToScenes(
    input: SplitScriptTextInput,
  ): Promise<GeneratedScene[]> {
    if (!input.scriptText.trim()) {
      throw new Error('待拆分的剧本正文为空')
    }

    const prompt = buildSceneSplitFromTextPrompt(input)
    const systemPrompt =
      '你是一位专业的影视编剧。请把给定的剧本正文拆成结构化场景数据，' +
      '严格按照要求格式输出，不要添加任何开场白或结束语，所有引用使用提供的 binding ID。'

    const response = await callAIWithContinue(
      prompt,
      systemPrompt,
      16000,
      input.providerConfigId,
      input.modelId,
      2,
      { temperature: 0.3 },
    )
    const result = this.extractFullScriptFromResponse(response, input.roster)
    if (result.scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 未能从正文中识别出场景')
    }
    // 2026-09-21：粘贴正文拆分也做覆盖度校验（只警告不阻断）
    for (const w of coverageWarnings(validateScriptCoverage(
      input.scriptText,
      [
        ...result.scenes.flatMap(s => (s.dialogues ?? []).map(d => d.text)),
        ...result.scenes.map(s => s.narration ?? ''),
      ],
    ))) {
      console.warn(`[script-coverage] ${w}`)
    }
    return result.scenes
  }

  /**
   * 从章节梗概 / 剧本正文拆分场景（spec §4.1 强引用）
   * 用于 handleGenerateScenes 场景——已有 synopsis / scriptContent，仅需生成结构化场景数据。
   * options.source：'scriptContent' 时提示词按「剧本正文」语义引导（正文含对白/动作，拆分更准）；
   * 默认 'synopsis' 保持既有调用兼容。
   */
  async generateScenesFromSynopsis(
    synopsis: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
    options?: { source?: 'synopsis' | 'scriptContent' },
  ): Promise<GeneratedScene[]> {
    const sourceLabel = options?.source === 'scriptContent' ? '剧本正文' : '章节梗概'
    // 简化提示词：只输出场景数据，不需要剧本正文
    const prompt = `你是一位专业的影视编剧。请将以下${sourceLabel}拆分为结构化的场景数据。

## 输出要求

使用 ===SCENES_JSON=== 作为开始标记，===SCENES_JSON_END=== 作为结束标记。
输出 JSON 格式的结构化场景数据。

## ⭐ 强约束：所有引用必须使用 binding ID（不允许裸字符串）

下面给出本项目可用的 **角色 / 地点 / 物品** 资产清单。每条都有一个 binding ID。
你输出 JSON 时必须用 ID 引用：
- locationBindingId（场景级）：从【可用地点列表】里选一项的 bindingId 填入
- characterBindingId（出场角色 / 对话 / 动作）：从【可用角色列表】里选
- itemBindingId（道具）：从【可用物品列表】里选

如果场景中出现的对象在清单里**找不到对应项**，把对应 bindingId 字段填 null（不要瞎编 ID），
并在 location/characterName/name 字段保留实际名字以便人工补全。

## JSON 场景数据格式

{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "茶馆",
      "locationBindingId": "lb_xxxxx",
      "locationType": "interior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "茶馆呈长方形，东侧柜台摆放茶罐，南侧临街大门，西侧靠墙方桌数张，北侧雅座屏风隔断。木质横梁、青花瓷茶具、水墨挂画、红木桌椅",
      "locationKeyObjects": ["柜台", "茶罐", "方桌", "屏风", "青花瓷茶具"],
      "mood": "市井烟火",
      "lighting": "晨光从南侧大门斜射入，明亮暖色调，室内微尘飘浮",
      "characters": [
        {
          "characterBindingId": "cb_xxxxx",
          "characterName": "张三",
          "position": "center",
          "expression": "凝重",
          "action": "推门进入",
          "outfit": "蓝色长衫（深蓝色，文人风格）",
          "props": [
            { "itemBindingId": "ib_xxxxx", "name": "茶壶" }
          ]
        }
      ],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {
          "id": "dlg_1",
          "characterBindingId": "cb_xxxxx",
          "characterName": "张三",
          "text": "请来一壶碧螺春",
          "emotion": "平静",
          "volume": "normal",
          "pace": "normal",
          "pause": 0
        }
      ],
      "actions": [...]
    }
  ]
}

## ⭐ 字段输出质量要求（必须严格遵守）

### sceneDescription（场景视觉描述）
必须包含：空间布局（房间形状+各方位陈设）+ 陈设材质 + 关键物件。
示例："闺房呈方形，东侧梳妆台配铜镜，南侧临窗，西侧纱幔床榻。木质横梁、雕花屏风、香炉"

### locationKeyObjects（地点关键物件列表）
列出本场景会出现的道具名称（3-6个），用于地点绑定参考。

### lighting（光线描述）
必须包含：光源+方向+强度+色调。
示例："晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调"

### outfit（角色服装）
格式：服装名称（颜色，风格）
示例："素色衣裙（淡青色，古典仕女风格）"

### dialogues（对话列表）
每条对话**必须**带 characterName 和 text：
- characterName 从本场景 characters 名单里选择，逐字一致；剧本原文里对白前有说话人名的必须保留，不得丢失；
- text 为对白的完整台词原文，**不得为空**；
- 能确定时同时给 characterBindingId。

## 可用角色列表

${formatRosterList(roster.characters)}

## 可用地点列表

${formatRosterList(roster.locations)}

## 可用物品列表

${formatRosterList(roster.items)}

## ${sourceLabel}

${synopsis}`

    const systemPrompt =
      '你是一位专业的影视编剧。请严格按照要求格式输出场景数据，所有引用使用提供的 binding ID。不要添加任何开场白或结束语。'

    const response = await callAI(prompt, systemPrompt, 8192, providerConfigId, modelId, { temperature: 0.3 })

    return this.parseScenesResponse(response, roster)
  }

  /**
   * S-06 场景级局部重拆（tasks/2026-09-16-ep-studio-polish）：只重新生成单个
   * 场景的结构化数据，其它场景不动。以该场景现有内容（原文/旁白/对白/动作）
   * 为源材料重出全部结构化字段；binding 强约束与整集拆分一致。
   * 返回的 sceneNumber 强制回写为原场景编号（不信任 AI 回填）。
   */
  async regenerateScene(
    scene: SceneScript,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<GeneratedScene> {
    const prompt = `你是一位专业的影视编剧。下面给出一个场景的现有内容，请重新输出该场景的结构化数据（剧情走向与场景编号保持不变，重出全部结构化字段）。

## 输出要求

使用 ===SCENES_JSON=== 作为开始标记，===SCENES_JSON_END=== 作为结束标记。
输出 JSON 格式的结构化场景数据，"scenes" 数组恰好包含 1 个场景，sceneNumber 必须为 ${scene.sceneNumber}。

${BINDING_CONSTRAINT_SPEC}

${SCENE_JSON_EXAMPLE_SPEC}

${FIELD_QUALITY_SPEC}

${fillPromptTemplate(ROSTER_LIST_SPEC, {
  characters: formatRosterList(roster.characters),
  locations: formatRosterList(roster.locations),
  items: formatRosterList(roster.items),
})}

## 场景源材料

场景编号：${scene.sceneNumber}
地点：${scene.location}
场景描述：${scene.sceneDescription ?? '（无）'}
氛围：${scene.mood ?? '（无）'}
原文片段：${scene.originalText ?? '（无）'}
旁白：${scene.narration ?? '（无）'}
现有对白：${JSON.stringify(scene.dialogues ?? [])}
现有动作：${JSON.stringify(scene.actions ?? [])}`

    const systemPrompt =
      '你是一位专业的影视编剧。请严格按照要求格式输出场景数据，所有引用使用提供的 binding ID。不要添加任何开场白或结束语。'

    const response = await callAI(prompt, systemPrompt, 8192, providerConfigId, modelId, { temperature: 0.3 })

    const scenes = this.parseScenesResponse(response, roster)
    if (scenes.length === 0) {
      throw new Error('AI 未返回该场景的结构化数据')
    }
    const result = scenes[0]
    result.sceneNumber = scene.sceneNumber
    return result
  }

  /**
   * 解析 ===SCENES_JSON=== / ```json 包裹的场景数据
   * （generateScenesFromSynopsis / regenerateScene 共用）。
   */
  private parseScenesResponse(
    response: string,
    roster: AssetRosterForScript,
  ): GeneratedScene[] {
    const scenesMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
    if (!scenesMatch) {
      // 尝试 ```json 格式
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        const scenesData = this.parseJsonString(jsonMatch[1].trim())
        if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
          return this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
        }
      }
      throw new Error('AI 响应中未找到场景数据')
    }

    const scenesData = this.parseJsonString(scenesMatch[1].trim())
    if (!scenesData.scenes || !Array.isArray(scenesData.scenes)) {
      throw new Error('生成的场景数据格式不正确')
    }

    return this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
  }
}

// ==================== 测试用导出（仅用于单测） ====================

/** @internal 测试用：暴露纯函数解析器，便于不调 AI 的情况下验证 binding 解析逻辑 */
export const __test = {
  formatRosterList,
  lookupBindingByName,
  resolveBindingId,
  buildPrompt: (roster: AssetRosterForScript, chapterContent: string): string =>
    renderScriptGenerationPrompt(chapterContent, roster),
  /** 暴露 convertSceneDataToGeneratedScenes 供单测 */
  convertScenes: (sceneData: unknown[], roster: AssetRosterForScript): GeneratedScene[] => {
    const inst = EpisodeScriptGenerator.getInstance()
    return (inst as any).convertSceneDataToGeneratedScenes(sceneData, roster)
  },
}
