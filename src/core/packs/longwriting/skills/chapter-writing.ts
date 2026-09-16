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
      description: '基于全书概要+本章大纲+前情状态，先设计本章的故事情节概要（起承转+章尾落点）与爽点/开场钩子/章尾卡点，再依据这份概要确定出场的角色、地点、物品与本章伏笔动作——产出章节设计卡',
      actor: 'agent',
    },
    {
      key: 'review',
      title: '复核设计',
      description: '对照全书概要与前情复核设计卡：是否服务主线、是否与前情冲突、出场是否合规、爽点卡点是否成立；有问题先改设计，改到自检通过为止',
      actor: 'agent',
    },
    {
      key: 'confirm',
      title: '确认与一致性检查',
      description: '设计卡落为已确认状态（一键模式下自检通过即自动确认，分步模式下由用户确认）；随后平台做一致性检查——未处理疑点会拦下正文生成',
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
      description: '基于已确认的设计卡与设定写正文：设计卡经【预写提纲】注入、全书概要与风格基调注入、前情事实表注入，生成并保存正文',
      actor: 'agent',
    },
  ] as ChapterWritingStep[],
}

/** 章节卡设计提示词（generateChapterCard 消费；prevHookType 由服务端注入） */
export function buildChapterCardDesignSystemPrompt(prevHookType: string | null, nextOutlineText?: string): string {
  const nextBlock = (nextOutlineText ?? '').trim()
    ? `\n5. 下一章大纲（前瞻约束）：${nextOutlineText!.trim()}
   本章不得提前揭示/坐实下一章的核心反转、关键线索或身份谜底——只可做铺垫与暗示。若本章大纲要素与下一章揭示点撞车，把揭示动作后移到下一章，本章只留不指向谜底的钩子
   ⚠ 冲突裁决：若下一章大纲文本中出现了与【作者已拍板的共识】相抵触的元素（如共识规定"某线索延后到第N章揭示"，而下一章大纲文本里含该线索），以共识为准——本章严禁出现该元素，即使它写在下一章大纲文本里；此时本章跳过该线索，直接用不指向谜底的事件收尾`
    : ''
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
4. 不得与上一章结束状态冲突${nextBlock}`
}

/** 章节卡自检提示词（generateChapterCard 第二段调用） */
export const CHAPTER_CARD_REVIEW_SYSTEM_PROMPT = '你是苛刻但公允的小说审稿编辑。只输出 JSON，不要任何其他文字。'

export function buildChapterCardReviewPrompt(input: {
  overviewSummary: string
  prevStateText: string
  markdown: string
  ledgerText?: string
  nextOutlineText?: string
}): string {
  const ledgerBlock = (input.ledgerText ?? '').trim()
    ? `\n【作者已拍板的共识与修正（最高优先级——卡片与作者共识一致即使与上文大纲不同也不是问题）】\n${(input.ledgerText ?? '').trim()}\n`
    : ''
  const nextBlock = (input.nextOutlineText ?? '').trim()
    ? `\n【下一章大纲（前瞻校验用）】\n${input.nextOutlineText!.trim()}
若本章设计卡把下一章的核心反转/关键线索/身份谜底提前揭示或坐实，算硬冲突（铺垫可以，揭底不行）。\n`
    : ''
  return `【全书核心故事概要】
${input.overviewSummary}
${ledgerBlock}
【上一章结束状态】
${input.prevStateText || '无记录'}
${nextBlock}
【本章设计卡】
${input.markdown}

请审查这张章节设计卡：情节是否服务全书主线、是否与前情状态或作者共识硬冲突、出场角色是否合规、爽点与卡点是否成立${input.nextOutlineText ? '、是否提前坐实了下一章的核心揭示' : ''}。
只报告硬冲突（与已确认设定/前情/作者共识直接矛盾、出场不合规、爽点卡点缺失${input.nextOutlineText ? '、提前揭底' : ''}）；风格偏好、措辞差异、上一轮作者已拍板的调整不构成问题——自检必须可收敛，不要为了挑刺而挑刺。
返回 JSON：{"ok": true/false, "issues": ["问题1", "问题2"]}（无问题则 issues 为空数组）。只输出 JSON。`
}

/** 注入研讨室主编 agent 系统提示的章法指令（novel 内容目标时启用） */
export const CHAPTER_WRITING_AGENT_INSTRUCTION = `【写正文的章法】用户要你写/改某一章正文时，禁止直接动笔，必须走章法。默认用一键入口：
1. lw_write_chapter_full（推荐）：一次调用内部自动完成「生成设计卡→自检→依据设计卡确定出场角色/地点/物品并确认→一致性检查→通过后生成并保存正文」。返回 ok=true 即完成；返回 error 含"自检未通过"或一致性问题时，把问题清单讲给用户，确认修正方向后重新调用同一工具。
2. 分步模式（用户要求逐步介入/设计卡自检需人工裁决时）：lw_design_chapter_card 生成设计卡→把卡片要点与自检问题讲给用户→用户认可后 lw_confirm_chapter_card→lw_write_chapter。
3. 禁止事项：禁止不调工具就声称"已写完/已保存"；禁止在自检未通过时赌气直接写正文；重写已有正文必须先征得用户同意（overwrite=true）。
讨论情节怎么写不算"写正文"，不受此约束。`
