/**
 * 章节写作章法 Skill（54 号）
 * @module core/packs/longwriting/skills/chapter-writing
 *
 * 定位：章法是"可改进的数据"，不是写死的控制流——本模块是章法的单一事实源：
 * - 步骤定义（steps）：设计→自检→人确认→一致性门禁→写正文
 * - 提示词（卡片设计/卡片自检）：被 LongWritingAIService.generateChapterCard 消费
 * - agent 指令（agentInstruction）：注入研讨室主编 agent 的系统提示，
 *   agent 据此用 lw_design_chapter_card / lw_confirm_chapter_card / lw_write_chapter
 *   工具链自主执行章法（人确认发生在对话中）
 *
 * 改章法 = 改这里（提示词与步骤），UI 向导与 agent 两条执行路径同步生效；
 * 一致性门禁（conflict-gate）与章节卡门禁是护栏策略，留在代码层（护栏不该由
 * 提示词决定），除此以外的流程编排全部由本定义驱动。
 */

export interface ChapterWritingStep {
  key: 'design' | 'review' | 'confirm' | 'gate' | 'write'
  title: string
  description: string
  /** 该步的执行者：agent/用户 自主判断编排，或 平台护栏（代码层强制） */
  actor: 'agent' | 'user' | 'guardrail'
}

export const CHAPTER_WRITING_SKILL = {
  name: 'chapter-writing',
  title: '章节写作章法',
  description: '写一章正文前的固定章法：先设计本章、自检、经用户确认、过一致性门禁，才动笔。',
  steps: [
    {
      key: 'design',
      title: '设计本章',
      description: '基于全书概要+本章大纲+前情状态，产出章节设计卡（情节概要/开场钩子/本章爽点/章尾卡点+钩型/出场实体/伏笔动作）',
      actor: 'agent',
    },
    {
      key: 'review',
      title: '自检',
      description: '对照全书总纲与前情审设计卡：是否服务主线、是否与前情冲突、出场是否合规、爽点卡点是否成立，问题呈给用户',
      actor: 'agent',
    },
    {
      key: 'confirm',
      title: '人确认',
      description: '设计卡与自检结果交用户确认；确认动作把设计卡落为已确认状态',
      actor: 'user',
    },
    {
      key: 'gate',
      title: '一致性门禁',
      description: '平台护栏：R1-R10 未处理疑点与"无已确认设计卡"会直接拒绝正文生成',
      actor: 'guardrail',
    },
    {
      key: 'write',
      title: '写正文',
      description: '设计卡经【预写提纲】注入、全书概要与风格注入、前情事实表注入，生成并保存正文',
      actor: 'agent',
    },
  ] as ChapterWritingStep[],
}

/** 章节卡设计提示词（generateChapterCard 消费；prevHookType 由服务端注入） */
export function buildChapterCardDesignSystemPrompt(prevHookType: string | null): string {
  return `你是严格的小说章节主编。在动笔写正文之前，必须先为本章产出一张「章节设计卡」——这是写作章法：先设计、自检、确认，再写正文。

返回 JSON 对象：
{
  "plotSummary": "本章情节概要，150-300字：承接上一章的当前局面→推进→转折/升级→章尾落点；推进节奏与结构由你按本章剧情自行安排，但必须服务全书核心故事",
  "openingHook": "开场钩子，1-2句，承接上一章卡点",
  "highlight": "本章爽点，1-2句，读者的情绪回报点（反转/打脸/突破/揭秘/情感共鸣等，选最适合本章的）",
  "endingCliffhanger": "章尾卡点，1-2句，让读者必须点开下一章",
  "hookType": "章尾卡点钩型，五选一：悬念/危机/情绪/信息/反转",
  "involvedCharacters": [{"name": "角色名（必须与人物册名字逐字一致）", "roleThisChapter": "本章目标/状态/行动"}],
  "involvedLocations": ["地点名（与地点册逐字一致）"],
  "involvedItems": ["物品名（与物品册逐字一致）"],
  "foreshadowAction": "本章伏笔动作：埋什么/收什么（对应已有伏笔清单），无则写'无'"
}

硬性要求：
1. plotSummary 必须与本章大纲概要一致，并把全书核心冲突向前推进一步——禁止写成与主线无关的过场
2. 出场角色从本章大纲涉及角色中选，可增不可造（不得出现人物册外的名字）
3. hookType 与上一章钩型不同（上一章：${prevHookType || '无记录，自选'}）
4. 不得与上一章结束状态冲突`
}

/** 章节卡自检提示词（generateChapterCard 第二段调用） */
export const CHAPTER_CARD_REVIEW_SYSTEM_PROMPT = '你是苛刻的小说审稿编辑。只输出 JSON，不要任何其他文字。'

export function buildChapterCardReviewPrompt(input: {
  overviewSummary: string
  prevStateText: string
  markdown: string
}): string {
  return `【全书核心故事概要】
${input.overviewSummary.slice(0, 600)}

【上一章结束状态】
${input.prevStateText || '无记录'}

【本章设计卡】
${input.markdown}

请审查这张章节设计卡：情节是否服务全书主线、是否与前情状态冲突、出场角色是否合规、爽点与卡点是否成立。返回 JSON：{"ok": true/false, "issues": ["问题1", "问题2"]}（无问题则 issues 为空数组）。只输出 JSON。`
}

/** 注入研讨室主编 agent 系统提示的章法指令（novel 内容目标时启用） */
export const CHAPTER_WRITING_AGENT_INSTRUCTION = `【写正文的章法】用户要你写/改某一章正文时，禁止直接动笔，必须走章法：
1. lw_design_chapter_card 生成该章设计卡（工具内部已做全书概要/前情对齐与自检），把卡片要点与自检问题用自然语言讲给用户听；
2. 用户认可后调 lw_confirm_chapter_card 确认设计（用户未认可前反复修改设计卡即可，不要赌气直接写正文）；
3. lw_write_chapter 生成并保存正文（默认拒绝覆盖已有正文；确要重写先征得用户同意再传 overwrite）。
讨论情节怎么写不算"写正文"，不受此约束。`
