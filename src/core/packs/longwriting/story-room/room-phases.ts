/**
 * 研讨室阶段配置与题材问题库（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-phases
 *
 * 阶段策略是数据配置而非散落 prompt（设计文档 §6）。问题库内置四套题材
 * 初版（设计文档 §13-4），字典 category=`room-questions` 可覆盖（item.code
 * = 题材关键字，item.content = 问题文本，多条换行分隔；code=`通用` 兜底）。
 */

import { createLogger } from '@core/utils/logger'
import type { ContentTarget, RoomPhaseId } from '@shared/types/story-room.types'

const logger = createLogger('StoryRoomPhases')

export interface RoomPhaseDef {
  id: RoomPhaseId
  label: string
  order: number
  /** 主编行为约束（注入 system，随阶段切换） */
  strategy: string
  /** 门建议提示（AI 判断素材成熟时引导推进的参考） */
  gateHint: string
}

export const ROOM_PHASES: Record<RoomPhaseId, RoomPhaseDef> = {
  'story-core': {
    id: 'story-core',
    label: '故事核',
    order: 1,
    strategy: `当前阶段聚焦「故事核」三要素：一句话前提、核心冲突、钩子。
- 先问后提：信息不足时每轮最多问 1-2 个尖锐的具体问题（如"他'废'的代价是什么？"），禁止问卷式提问（"请填写主角姓名/年龄/性别"）。
- 方向不明时给 2-3 个带取舍说明的选项（"A 退婚流：爽感快但俗；B 沉冤流：慢热但人物弧光厚"），不罗列维度清单。
- 用户提出明显俗套时直接指出并给替代方案，敢反驳。
- 三要素齐了就建议推进："概要三要素齐了，整理成概要卡？"。`,
    gateHint: '一句话前提 + 核心冲突 + 钩子都已明确',
  },
  characters: {
    id: 'characters',
    label: '人物',
    order: 2,
    strategy: `当前阶段聚焦人物：动机、性格、弧光、关系网。
- 每个主要人物都要能回答"他为什么非这样不可"——动机要具体、有代价。
- 警惕工具人：配角也要有自己的欲求；人物之间要有关系张力（谁欠谁、谁瞒谁）。
- 人物设定要回扣故事核：与核心冲突无关的设定果断砍掉。
- 人物立起来了就建议整理成人物卡。`,
    gateHint: '主角与关键配角的动机/弧光/关系网已立住',
  },
  plots: {
    id: 'plots',
    label: '故事线',
    order: 3,
    strategy: `当前阶段聚焦故事线：主线 + 副线、节拍与冲突升级。
- 每条故事线说清：起点状态 → 冲突升级链 → 终点状态。
- 副线必须服务主线（映照/反衬/供给资源），否则合并或砍掉。
- 检查人物弧光与故事线咬合：转变发生在哪些节拍上。
- 故事线成型就建议整理成故事线卡。`,
    gateHint: '主线节拍完整、副线与主线咬合关系明确',
  },
  outline: {
    id: 'outline',
    label: '大纲',
    order: 4,
    strategy: `当前阶段聚焦大纲。`,
    gateHint: '大纲结构完整（逐卷/逐集确认通过）',
  },
  writing: {
    id: 'writing',
    label: '写作',
    order: 5,
    strategy: `研讨已进入写作阶段，你是写作教练位：
- 研讨室不再直接产出正文——用户要写某章时，生成章节卡（开头预览 + 本章要点），引导"在编辑器中打开"。
- 每章写完主动检查连贯性：发现前后矛盾（人物状态/时间线/设定冲突）以矛盾卡提醒。
- 用户回来讨论调整时，提醒受影响的章节与大纲（"第 3 条故事线依赖旧动机，建议重议"）。`,
    gateHint: '全程开放，无门',
  },
}

export const ROOM_PHASE_ORDER: RoomPhaseId[] = ['story-core', 'characters', 'plots', 'outline', 'writing']

export function getPhaseDef(id: RoomPhaseId): RoomPhaseDef {
  return ROOM_PHASES[id] ?? ROOM_PHASES['story-core']
}

export function nextPhase(id: RoomPhaseId): RoomPhaseId | null {
  const idx = ROOM_PHASE_ORDER.indexOf(id)
  if (idx === -1 || idx === ROOM_PHASE_ORDER.length - 1) return null
  return ROOM_PHASE_ORDER[idx + 1]
}

/** 大纲阶段的分卷策略按内容目标分叉（v2.1 修订 9：短剧纳入本轮） */
const OUTLINE_NOVEL_STRATEGY = `
长篇大纲：卷 → 章 两级结构（每卷 10-30 章）。每章一句话要点 + 钩子 + 推进哪条故事线。
逐卷产出：先提第一卷大纲卡，确认后再继续下一卷——不要一次铺完全部卷。`

const OUTLINE_SCRIPT_STRATEGY = `
分集大纲（短剧）：集 → 场 两级结构。每集给：集号、标题、钩子（开头 10 秒）、
反转/卡点（集尾）、出场人物。节奏纪律：前 3 集必须强钩子 + 高反转密度；
每集结尾必须是悬念或情绪爆点。逐集产出分集大纲卡。`

export function buildStrategySection(phase: RoomPhaseId, contentTarget: ContentTarget): string {
  const def = getPhaseDef(phase)
  if (phase === 'outline') {
    return def.strategy + (contentTarget === 'script' ? OUTLINE_SCRIPT_STRATEGY : OUTLINE_NOVEL_STRATEGY)
  }
  return def.strategy
}

// ==================== 题材问题库 ====================

/** 内置四套题材初版 + 通用兜底（key = 题材关键字包含匹配） */
export const BUILTIN_QUESTION_BANKS: Record<string, string[]> = {
  玄幻: [
    '金手指的能力边界与代价是什么？（无敌会杀死中段冲突）',
    '力量体系的稀缺性靠什么维系？（资源、血脉还是领悟）',
    '主角与最强反派的实力差距如何动态变化？',
  ],
  修仙: [
    '修为境界与心境成长的错位在哪里？（实力快于心境是经典爆点）',
    '宗门规则与主角自由意志的第一次正面冲突是什么？',
  ],
  都市: [
    '主角的职业/身份与核心冲突如何强关联？（避免职业只是背景板）',
    '金钱、权力、信息三类资源的来源与代价分别是什么？',
    '现实逻辑的锚点在哪里？哪些地方允许戏剧化夸张？',
  ],
  言情: [
    '情感障碍是什么？为什么不可回避、不可轻易化解？',
    '两个人的弧光各自是什么？谁先低头、谁先成长？',
    '副线 CP 的功能是映照主线还是供给喜剧缓冲？',
  ],
  短剧: [
    '前 3 集的钩子分别是什么？（第 1 集前 10 秒决定完播率）',
    '反转密度与情绪爽点如何排布？（每集至少一个情绪高点）',
    '每集结尾的卡点是悬念、误会还是情绪爆点？',
  ],
}

export function pickBuiltinBank(storyType?: string | null): string[] {
  const t = String(storyType || '')
  for (const key of Object.keys(BUILTIN_QUESTION_BANKS)) {
    if (t.includes(key)) return BUILTIN_QUESTION_BANKS[key]
  }
  return [
    '主角最不可能做的一件事是什么？什么会逼他做？',
    '故事世界里"人人都知道、只有主角不知道"的事是什么？',
    '如果删掉这个设定，故事还成立吗？（每个设定都要过这一问）',
  ]
}

/**
 * 问题库读取：字典 category=`room-questions` 覆盖内置（item.code=题材关键字，
 * item.content=问题文本多条换行分隔）。字典未配置/读取失败 → 内置兜底。
 */
export async function loadQuestionBank(db: any, storyType?: string | null): Promise<string[]> {
  try {
    const items = await db?.lwDictionaries?.getByCategory?.('room-questions')
    if (Array.isArray(items) && items.length > 0) {
      const t = String(storyType || '')
      const match = items.find((it: any) => it?.code && t.includes(String(it.code)))
      const fallback = items.find((it: any) => String(it?.code || '') === '通用')
      const chosen = match || fallback
      const lines = String(chosen?.content ?? chosen?.name ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length > 0) return lines
    }
  } catch (e) {
    logger.warn('[story-room] 字典问题库读取失败（内置兜底）', e)
  }
  return pickBuiltinBank(storyType)
}
