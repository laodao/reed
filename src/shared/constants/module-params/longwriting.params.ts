/**
 * 「长文写作」模块参数登记表
 * @module shared/constants/module-params/longwriting
 *
 * 一个 Tab 覆盖两个 settings 键（分组级 `settingsKey`）：
 * `longwriting:writing`（章节生成主链） / `longwriting:storyRoom`（故事研讨室）。
 *
 * 两个键的载荷平铺（键名本身已是"模块:对象"）。数值来源为 `longwriting-params.types.ts`。
 *
 * 用户为什么会想调（调研结论）：
 * - 章节生成的输出上限是 `Math.min(目标字数 * 2, 8192)`——目标字数调大照样被 8192 腰斩；
 * - 上下文窗口 32_768 是写死的，长章节/多角色项目一开写就"上下文已满"；
 * - 章节 3000 字 / 段落 500 字 / 上章结尾 550 字 / 记忆注入 10 与 5 条：题材不同量级差很多；
 * - 研讨室历史只注入最近 40 条、单条截 1200 字，聊到中后期主编就开始"忘事"；
 * - 账本容量 60、单次提炼 6 张卡、大纲叶子只列 30 个：长项目会被静默截断。
 */

import {
  LONGWRITING_DEFAULTS as D,
  LONGWRITING_LIMITS as L,
} from '@shared/types/longwriting-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

const WRITING = SETTINGS_KEYS.longwritingWriting
const STORY_ROOM = SETTINGS_KEYS.longwritingStoryRoom

export const LONGWRITING_PARAMS: ModuleParamDefinition = {
  key: 'longwriting',
  feature: 'longwriting',
  name: '长文写作',
  description:
    '章节生成用多大上下文窗口、最多一次写多少字、写作时带上多少前文与记忆；故事研讨室每轮记住多少历史、什么时候压缩前情提要、账本能存多少条。保存后下一次生成/下一轮研讨生效。',
  settingsKey: WRITING,
  effect: 'immediate',
  groups: [
    {
      title: '章节生成',
      description:
        '主链路上的上下文预算与篇幅护栏。「单次生成输出上限」是硬夹——目标字数再大也不会写超过它，长章节要一起调大。',
      settingsKey: WRITING,
      params: [
        {
          kind: 'number',
          path: 'windowTokens',
          label: '上下文窗口',
          hint: '章节工作台按这个数算上下文占用率；调小会让长章节提前报"上下文已满"，调大更能装下多角色/多设定',
          unit: 'Tokens',
          default: D.writing.windowTokens,
          ceiling: L.writing.windowTokens,
          step: 8_192,
        },
        {
          kind: 'number',
          path: 'maxOutputTokens',
          label: '单次生成输出上限',
          hint: '一次生成最多输出多少 token；调小了长章节会被中途截断（目标字数 3000 约需 6000 token）',
          unit: 'Tokens',
          default: D.writing.maxOutputTokens,
          ceiling: L.writing.maxOutputTokens,
          step: 512,
        },
        {
          kind: 'number',
          path: 'chapterTargetWords',
          label: '章节目标字数',
          hint: '大纲没写预估字数时的缺省章节篇幅；调大每章更长，生成更慢也更费 token',
          default: D.writing.chapterTargetWords,
          ceiling: L.writing.chapterTargetWords,
          step: 500,
        },
        {
          kind: 'number',
          path: 'sectionTargetWords',
          label: '段落目标字数',
          hint: '段落（评论段落）生成没指定字数时的缺省篇幅；调小更碎、调大更长',
          default: D.writing.sectionTargetWords,
          ceiling: L.writing.sectionTargetWords,
          step: 100,
        },
        {
          kind: 'number',
          path: 'previousChapterEndingChars',
          label: '上章结尾注入字数',
          hint: '把上一章结尾按段落截这么长喂给模型做衔接；调大衔接更顺（更费上下文），调小容易接不上',
          unit: 'Chars',
          default: D.writing.previousChapterEndingChars,
          ceiling: L.writing.previousChapterEndingChars,
          step: 50,
        },
        {
          kind: 'number',
          path: 'normalMemoryLimit',
          label: '重要记忆注入条数',
          hint: '写作时最多带多少条「重要情节」记忆；调大能少丢伏笔，但更吃上下文',
          default: D.writing.normalMemoryLimit,
          ceiling: L.writing.normalMemoryLimit,
          step: 5,
        },
        {
          kind: 'number',
          path: 'minorMemoryLimit',
          label: '次要记忆注入条数',
          hint: '写作时最多带多少条「其他参考」记忆（取最近几条）；调大细节更多，也更占篇幅',
          default: D.writing.minorMemoryLimit,
          ceiling: L.writing.minorMemoryLimit,
          step: 5,
        },

        {
          kind: 'number',
          path: 'worldContextMaxTokens',
          label: '世界观库注入预算',
          hint: '绑定了世界观库时，体系/规则类常驻设定注入正文的 token 预算；0 为关闭库注入',
          unit: 'Tokens',
          default: D.writing.worldContextMaxTokens,
          ceiling: L.writing.worldContextMaxTokens,
          step: 500,
        },
      ],
    },
    {
      title: '故事研讨室',
      description:
        '主编每轮能看到多少历史、什么时候把旧讨论压成前情提要、账本与卡片能存多少。聊到中后期觉得"主编忘事"就先调历史条数与前情提要上限。',
      settingsKey: STORY_ROOM,
      params: [
        {
          kind: 'number',
          path: 'historyLimit',
          label: '每轮注入历史条数',
          hint: '主编每轮能看到的最近对话条数；调小会"忘掉"刚聊过的内容，调大更连贯但更吃上下文',
          default: D.storyRoom.historyLimit,
          ceiling: L.storyRoom.historyLimit,
          step: 10,
        },
        {
          kind: 'number',
          path: 'historyUserMaxChars',
          label: '历史单条截断（用户输入）',
          hint: '用户每条消息最多带多少字；用户输入多为短句，默认 600 足够',
          unit: 'Chars',
          default: D.storyRoom.historyUserMaxChars,
          ceiling: L.storyRoom.historyUserMaxChars,
          step: 100,
        },
        {
          kind: 'number',
          path: 'historyAssistantMaxChars',
          label: '历史单条截断（主编回复）',
          hint: '主编每条设计消息最多带多少字；截狠了后续轮次模型看不到自己设计的后半段（六扇门复盘 P0），调大更完整',
          unit: 'Chars',
          default: D.storyRoom.historyAssistantMaxChars,
          ceiling: L.storyRoom.historyAssistantMaxChars,
          step: 100,
        },
        {
          kind: 'number',
          path: 'summaryThresholdTurns',
          label: '摘要触发轮数',
          hint: '攒够多少轮未摘要的讨论就压成前情提要；调小更省上下文但摘要更频繁（多花调用）',
          default: D.storyRoom.summaryThresholdTurns,
          ceiling: L.storyRoom.summaryThresholdTurns,
          step: 5,
        },
        {
          kind: 'number',
          path: 'summaryBatchTurns',
          label: '单次压缩轮数',
          hint: '一次压缩多少轮；不得大于上面的触发轮数（超了会自动收到触发轮数，否则水位会跳过中间轮次）',
          default: D.storyRoom.summaryBatchTurns,
          ceiling: L.storyRoom.summaryBatchTurns,
          step: 5,
        },
        {
          kind: 'number',
          path: 'maxSummaryChars',
          label: '前情提要长度上限',
          hint: '前情提要最多多长（超出从头丢最老分段）；调大记得更多，但每轮都要带上、更吃上下文',
          unit: 'Chars',
          default: D.storyRoom.maxSummaryChars,
          ceiling: L.storyRoom.maxSummaryChars,
          step: 1_000,
        },
        {
          kind: 'number',
          path: 'editorMaxSteps',
          label: '主编单轮步数',
          hint: '主编一轮里最多执行几步；上限本职是失控兜底而非预算——正常讨论轮 1~3 步自终，抬高对聊天零成本；设计任务步多，默认 24',
          default: D.storyRoom.editorMaxSteps,
          ceiling: L.storyRoom.editorMaxSteps,
        },
        {
          kind: 'number',
          path: 'ledgerCap',
          label: '共识账本容量',
          hint: '账本最多存多少条共识；满了会先丢最老的"讨论中"再丢"已否决"（已定的不丢）——长项目要调大',
          default: D.storyRoom.ledgerCap,
          ceiling: L.storyRoom.ledgerCap,
          step: 10,
        },
        {
          kind: 'number',
          path: 'maxCardsPerDistill',
          label: '单次提炼卡片上限',
          hint: '一次整理最多产出几张卡片；调小会截断（例如世界观四类没提全），调大一次整理更完整',
          default: D.storyRoom.maxCardsPerDistill,
          ceiling: L.storyRoom.maxCardsPerDistill,
        },
        {
          kind: 'number',
          path: 'outlineLeafLimit',
          label: '大纲叶子节点上限',
          hint: '整理章节卡时最多列出多少个已有大纲叶子节点；大纲很长时调小会让部分章节没法关联',
          default: D.storyRoom.outlineLeafLimit,
          ceiling: L.storyRoom.outlineLeafLimit,
          step: 10,
        },
      ],
    },
  ],
  /**
   * 研讨室：单次压缩轮数不得大于摘要触发轮数。
   * 配错了水位会越过当前轮号（`summarizedTurn + batch > turnNo`），中间轮次再也不会被摘要——
   * 自动把 batch 收到 threshold，并在设置页说明（不静默）。
   */
  crossFieldGuard: (values) => {
    const threshold = values['summaryThresholdTurns'] as number
    const batch = values['summaryBatchTurns'] as number
    if (typeof threshold === 'number' && typeof batch === 'number' && batch > threshold) {
      values['summaryBatchTurns'] = threshold
      return [
        `summaryBatchTurns(${batch}) 大于 summaryThresholdTurns(${threshold})，已把单次压缩轮数收到触发轮数`,
      ]
    }
    return []
  },
}
