/**
 * 关键帧参考链策略（spec §4.3 · P5-T7）
 * @module modules/episode-production/render/keyframe/keyframe-chain-strategy
 *
 * 核心算法：把"分镜由 N 张关键帧组成"转化为生成顺序 + 参考依赖。
 *
 * 顺序（spec §4.3）：
 *   1. 第 1 帧（开始帧）：无参考帧，提示词 = 资产引用 + 镜头语言 + 开始时刻描述
 *   2. 最后一帧（结束帧）：参考 [开始帧]，提示词 = 资产引用 + 结束时刻描述
 *   3. 中间帧：参考 [开始帧, 结束帧]，提示词 = 资产引用 + 中间时刻动作
 *
 * 重生成传播（spec §4.3）：
 *   - 改 start → 提示重生成 middle + end（默认勾选）
 *   - 改 middle → 仅重生成自己
 *   - 改 end → 提示重生成 middle（默认勾选）
 *
 * 时间分布：start=0%，end=100%，middle 在中间等距分布。
 *
 * 纯函数模块：无 IO 无 DI，便于单测覆盖；service 层用 plan + 资源装配执行实际生成。
 */

export type KeyframeRole = 'start' | 'middle' | 'end' | 'extra'

/** 计划生成的一帧 */
export interface KeyframePlan {
  /** 0-based 帧序号 */
  frameIndex: number
  frameRole: KeyframeRole
  /** 0~1，分镜时长内的相对位置 */
  timePercent: number
  /** 生成此帧时要参考的其他帧 frameIndex（按 plan 内顺序，已生成的） */
  referenceFrameIndexes: number[]
}

/**
 * 计划 N 张关键帧的生成顺序 + 参考依赖。
 *
 * @param keyframeCount 关键帧总数（合法范围 1~9，超出会 clamp）
 * @returns plan[]，按生成顺序排列（先 start，再 end，再各 middle）；frameIndex 反映时序位置
 *
 * 例：keyframeCount = 3 → plan order:
 *   [0] frameIndex=0 role=start   timePercent=0    references=[]
 *   [1] frameIndex=2 role=end     timePercent=1    references=[0]
 *   [2] frameIndex=1 role=middle  timePercent=0.5  references=[0, 2]
 */
export function planKeyframes(keyframeCount: number): KeyframePlan[] {
  const n = Math.max(1, Math.min(9, Math.floor(keyframeCount)))
  if (n === 1) {
    return [{ frameIndex: 0, frameRole: 'start', timePercent: 0, referenceFrameIndexes: [] }]
  }
  // n >= 2
  const lastIndex = n - 1
  const plan: KeyframePlan[] = []

  // 1. 开始帧
  plan.push({
    frameIndex: 0,
    frameRole: 'start',
    timePercent: 0,
    referenceFrameIndexes: [],
  })

  // 2. 结束帧
  plan.push({
    frameIndex: lastIndex,
    frameRole: 'end',
    timePercent: 1,
    referenceFrameIndexes: [0],
  })

  // 3. 中间帧（按 frameIndex 升序生成，每张都参考 [start, end]）
  for (let i = 1; i < lastIndex; i++) {
    plan.push({
      frameIndex: i,
      frameRole: 'middle',
      timePercent: i / lastIndex,
      referenceFrameIndexes: [0, lastIndex],
    })
  }

  return plan
}

/** 重生成传播结果 */
export interface RegenPropagation {
  /** 必须重生成的帧（含被改动的那一帧自身） */
  required: number[]
  /** 建议默认勾选重生成的帧（依赖于改动帧的下游） */
  suggested: number[]
}

/**
 * 计算改动某一帧后的传播范围（spec §4.3）：
 *
 * - 改 start (frameIndex=0)：required = [0]; suggested = [所有 middle, end]
 * - 改 middle (frameIndex 1..N-2)：required = [自己]; suggested = []
 * - 改 end (frameIndex=N-1)：required = [end]; suggested = [所有 middle]
 *
 * @param changedFrameIndex 改动的帧 frameIndex
 * @param keyframeCount 分镜的总关键帧数
 */
export function planRegenPropagation(
  changedFrameIndex: number,
  keyframeCount: number,
): RegenPropagation {
  const n = Math.max(1, Math.min(9, Math.floor(keyframeCount)))
  if (changedFrameIndex < 0 || changedFrameIndex >= n) {
    return { required: [], suggested: [] }
  }
  if (n === 1) {
    return { required: [0], suggested: [] }
  }
  const lastIndex = n - 1
  const isStart = changedFrameIndex === 0
  const isEnd = changedFrameIndex === lastIndex
  const isMiddle = !isStart && !isEnd

  if (isStart) {
    const downstream: number[] = []
    for (let i = 1; i < lastIndex; i++) downstream.push(i) // 中间
    if (lastIndex >= 1) downstream.push(lastIndex) // 结束
    return { required: [0], suggested: downstream }
  }

  if (isEnd) {
    const middles: number[] = []
    for (let i = 1; i < lastIndex; i++) middles.push(i)
    return { required: [lastIndex], suggested: middles }
  }

  // middle：仅自己
  return { required: [changedFrameIndex], suggested: [] }
}

/**
 * 把帧角色映射到提示词时刻描述前缀（spec §4.3）。
 * 用于 prompt builder 在 start/middle/end 三档生成不同的时刻语言。
 */
export function describeFrameMoment(role: KeyframeRole, timePercent: number): string {
  if (role === 'start') return '场景开始时刻：人物刚进入位置 / 动作即将展开'
  if (role === 'end') return '场景结束时刻：动作完成 / 情绪到位 / 镜头将切换'
  if (role === 'middle') {
    const pct = Math.round(timePercent * 100)
    return `场景中段（约 ${pct}%）：动作过程 / 表情过渡 / 走位中`
  }
  return '附加参考帧'
}
