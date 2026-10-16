/**
 * 故事研讨室渲染层常量（v2.1 M3）
 * @module renderer/components/longwriting/room/roomKinds
 *
 * KINDS/GROUP_ORDER/GENRE_FRAMES 自原型 v3.1 搬运，映射到真实后端通道：
 * 圣经面板分组按 GROUP_ORDER 渲染，每组由 `loader` 从现有 IPC 拉取。
 */

import type { RoomPhaseId } from '@shared/types/story-room.types'

export interface RoomPhaseMeta {
  id: RoomPhaseId
  label: string
  order: number
}

export const ROOM_PHASE_META: RoomPhaseMeta[] = [
  { id: 'story-core', label: '故事核', order: 1 },
  { id: 'characters', label: '人物', order: 2 },
  { id: 'plots', label: '故事线', order: 3 },
  { id: 'outline', label: '大纲', order: 4 },
  { id: 'writing', label: '写作', order: 5 },
]

/** 卡片/要素视觉属性（图标 + 侧色 token 名，色值在组件样式消费） */
export const KIND_META: Record<string, { label: string; ico: string; colorVar: string }> = {
  overview: { label: '概要', ico: '📘', colorVar: 'var(--ka-overview)' },
  character: { label: '人物', ico: '🧑', colorVar: 'var(--ka-character)' },
  plot: { label: '故事线', ico: '🧵', colorVar: 'var(--ka-plot)' },
  outline: { label: '大纲', ico: '🌳', colorVar: 'var(--ka-outline)' },
  faction: { label: '门派/势力', ico: '⛩️', colorVar: 'var(--ka-faction)' },
  skill: { label: '武功/技能', ico: '⚔️', colorVar: 'var(--ka-skill)' },
  item: { label: '物品', ico: '💎', colorVar: 'var(--ka-item)' },
  location: { label: '地点', ico: '🏔️', colorVar: 'var(--ka-location)' },
  nation: { label: '国别', ico: '🏯', colorVar: 'var(--ka-nation)' },
  camp: { label: '阵营', ico: '🚩', colorVar: 'var(--ka-camp)' },
  chapter: { label: '章节', ico: '📄', colorVar: 'var(--ka-outline)' },
  foreshadow: { label: '伏笔', ico: '🪝', colorVar: 'var(--ka-nation)' },
  custom: { label: '设定', ico: '🧩', colorVar: 'var(--ka-overview)' },
  conflict: { label: '矛盾', ico: '⚠️', colorVar: 'var(--el-color-danger)' },
}

/** 卡片 data → 阅读态行（字段标签映射） */
export const CARD_FIELD_LABELS: Record<string, Record<string, string>> = {
  overview: { title: '作品名', storyType: '题材', premise: '一句话', conflict: '核心冲突', coreConflict: '核心冲突', hook: '钩子', summary: '概要', estimatedChapters: '预估章节' },
  character: { name: '姓名', role: '身份', motive: '动机', persona: '性格', arc: '弧光', belong: '归属', background: '背景', personality: '性格', occupation: '身份', rolePosition: '定位', appearance: '外貌', gender: '性别', age: '年龄' },
  plot: { title: '故事线名', arcDesc: '走向', summary: '走向', involve: '涉及' },
  outline: { name: '卷名', index: '集号', title: '集名', hook: '钩子', reversal: '反转/卡点', characters: '出场人物', summary: '概述', estimatedWords: '预估字数' },
  chapter: { outlineName: '章节名', name: '章节名', hook: '开场钩子', preview: '开头预览', points: '本章要点' },
  conflict: { description: '矛盾描述' },
  world: {},
}

/** 题材框架（新增讨论方向时的分组建议，原型 GENRE_FRAMES） */
export const GENRE_FRAMES: Record<string, string[]> = {
  武侠: ['faction', 'skill', 'item', 'location'],
  修仙玄幻: ['faction', 'skill', 'item', 'location'],
  架空历史: ['nation', 'camp', 'location', 'item'],
  都市: ['location', 'camp'],
}
