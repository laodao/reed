/**
 * 领域学习：跨端共享的展示文案（单一来源）
 * @module shared/utils/domain-learning-labels
 *
 * 背景：讲义导出（后端拼 markdown）与界面（前端标签）都需要"掌握度/讲义状态"的中文文案。
 * 双端各写一份必然漂移，故收口到 shared，前端 `views/domain-learning/domain-learning-ui.ts`
 * 从这里重导出（调用方零改动）。
 */

import type { DlMastery } from '../types/domain-learning.types'

/** 掌握度 → 展示文案（mastered 绿 / learning 橙 / untouched+review 灰） */
export const DL_MASTERY_LABELS: Record<string, string> = {
  mastered: '已理解',
  learning: '学习中',
  untouched: '待学',
  review: '待复习',
}

/** 掌握度 → 展示文案（未知原样回退「待学」） */
export function masteryLabel(m: DlMastery | string | null | undefined): string {
  return DL_MASTERY_LABELS[String(m ?? '')] ?? '待学'
}

/** 讲义状态 → 展示文案（draft=AI 草稿待人审；published=已确认发布） */
export const DL_CARD_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
}

/** 讲义状态 → 展示文案（未知原样回显） */
export function cardStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? '')
  return DL_CARD_STATUS_LABELS[s] ?? s
}

/** 知识本质类型 → 展示文案（讲义头/导出元信息用；未知原样回显） */
export const DL_ESSENCE_LABELS: Record<string, string> = {
  'K-concept': '概念',
  'K-oper': '做法',
  'K-stmt': '陈述',
  'K-inst': '实例',
  'K-agent': '主体',
  'K-open': '开放问题',
}

/** 知识本质类型 → 展示文案 */
export function essenceLabel(t: string | null | undefined): string {
  const s = String(t ?? '')
  return DL_ESSENCE_LABELS[s] ?? s
}

/**
 * 知识节点类型 → 展示文案（DlNodeType 全 16 种 + group 目录）。
 * 单一来源：前端图例（renderer/views/domain-learning/domain-learning-ui.ts 的
 * DL_NODE_TYPE_META）只保留颜色/说明，label 从这里取，避免双端漂移。
 */
export const DL_NODE_TYPE_LABELS: Record<string, string> = {
  group: '目录',
  concept: '概念',
  fact: '事实',
  definition: '定义',
  axiom: '公理/假设',
  theory: '理论/模型',
  method: '方法/流程',
  artifact: '产物/工件',
  paper: '论文/文献',
  standard: '标准/协议',
  regulation: '法规/监管',
  procedure: '操作规范',
  case: '案例',
  person: '人物/机构',
  controversy: '争议/开放问题',
  principle: '原则',
}

/** 知识节点类型 → 展示文案（未知回退「其他」） */
export function nodeTypeLabel(t: string | null | undefined): string {
  return DL_NODE_TYPE_LABELS[String(t ?? '')] ?? '其他'
}