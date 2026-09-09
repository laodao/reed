/**
 * 领域学习输入意图路由（第 3 项阶段一；前后端共用纯函数）
 * @module shared/utils/domain-learning-intent
 *
 * 答疑框不设模式、同框自动判断去向：
 * - 'tutor'：学习/答疑类输入（基于讲义引证问答，落 dl_question 历史）——默认；
 * - 'task' ：明确的任务指令（研究/整理/规划/汇总生成等"离开当前讲义的工作"），
 *            由任务会话执行（可拆子步骤、调技能/读资料、dl_* 落库）。
 *
 * 判定为可离线测试的启发式规则（强任务动词优先；"总结/汇总/分析"等弱词须带
 * 产出型宾语才判任务，避免把答疑里的"总结一下"误路由）。规则不完备性如实：
 * 拿不准一律回 'tutor'（答疑框主职 + 不会把答疑误送任务）。
 */

export type DlIntentRoute = 'tutor' | 'task'

/** 强任务信号：动词/短语直接面向"离开讲义的工作" */
const STRONG_TASK_PATTERNS: RegExp[] = [
  /研究|调研|深挖/,
  /检索|查证|搜索资料|联网查|查一下资料/,
  /整理|梳理|归纳/,
  /规划|计划|学习路线|学习计划/,
  /拆解|分步|拆成|细化/,
  /生成|起草|制作|写成|做一份|写一份|产出/,
  /复习提纲|讲义合集|起步研究|领域地图/,
  /对比.{0,10}(资料|文章|来源|两篇|多篇)/,
]

/** 弱任务信号：需要带"产出型宾语"（提纲/清单/报告/成文…）才判任务 */
const WEAK_TASK_PATTERNS: RegExp[] = [
  /(总结|汇总|收集|分析).{0,16}(提纲|清单|报告|成文|文档|资料|多篇|对比)/,
]

const NOISE = /[\s　\r\n]+/g

/** 判定该输入应走答疑（tutor）还是任务执行（task） */
export function routeDlIntent(input: string): DlIntentRoute {
  const text = String(input ?? '').replace(NOISE, '')
  if (!text) return 'tutor'
  for (const re of STRONG_TASK_PATTERNS) if (re.test(text)) return 'task'
  for (const re of WEAK_TASK_PATTERNS) if (re.test(text)) return 'task'
  return 'tutor'
}
