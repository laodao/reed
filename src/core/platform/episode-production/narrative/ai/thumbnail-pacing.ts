/**
 * 故事板缩略图 · 叙事节奏分段渲染（提示词优化方案 §3.11）
 * @module platform/episode-production/narrative/ai/thumbnail-pacing
 *
 * 背景（优化前 P0）：`storyboard-thumbnail-generator` 的节奏指令固定 6 条 9 拍
 * （"第 1 帧…第 9 帧"），而 count 支持 9/16/25。count=16/25 时：
 *   - 指令要求输出 16/25 帧，节奏却只讲到第 9 帧 → 第 10-25 格内容无约束；
 *   - "第 9 帧：尾声"与"输出 25 帧并排"自相矛盾，模型行为不可预期。
 *
 * 本模块把叙事弧按 count 动态展开，保持 9 拍时的语义完全不变（回归安全），
 * 非 9 拍时按比例重新分配各幕帧数。
 */

/** 叙事弧的六幕及其权重（9 拍基准：1/2/2/2/1/1） */
const NARRATIVE_ACTS = [
  { key: 'opening', label: '开场（建立场景 + 主角）', weight: 1 },
  { key: 'development', label: '情节展开', weight: 2 },
  { key: 'conflict', label: '冲突 / 转折点', weight: 2 },
  { key: 'climax', label: '高潮 / 关键动作', weight: 2 },
  { key: 'result', label: '结果', weight: 1 },
  { key: 'coda', label: '尾声 / 情绪定格', weight: 1 },
] as const

const NARRATIVE_ACT_TOTAL_WEIGHT = NARRATIVE_ACTS.reduce((sum, a) => sum + a.weight, 0)

/**
 * 把 count 帧按权重分配到六幕，保证各幕至少 1 帧且总和恰为 count。
 *
 * 算法：按权重取整下界 → 用最大余数法把剩余帧派给"相对缺口最大"的幕
 * （缺口 = 理论份额 - 已分配，避免帧堆积到末尾幕导致"尾声"吞掉后半段）。
 */
function allocateActs(count: number): Array<{ label: string; from: number; to: number }> {
  if (count < NARRATIVE_ACTS.length) {
    // 帧数少于幕数：逐帧对到前 count 幕（退化场景）
    return NARRATIVE_ACTS.slice(0, count).map((a, i) => ({ label: a.label, from: i + 1, to: i + 1 }))
  }

  const ideal = NARRATIVE_ACTS.map((a) => (count * a.weight) / NARRATIVE_ACT_TOTAL_WEIGHT)
  const alloc = ideal.map((v) => Math.floor(v))

  // 先满足"每幕至少 1 帧"（不足者从未满幕中借，保证总和守恒）
  let deficit = alloc.reduce((s, v, i) => s + Math.max(0, 1 - v), 0)
  if (deficit > 0) {
    for (let i = 0; i < alloc.length && deficit > 0; i++) {
      if (alloc[i] === 0) {
        alloc[i] = 1
        deficit -= 1
      }
    }
    // 从份额最大的幕里扣回（不低于 1）
    let surplus = alloc.reduce((s, v) => s + v, 0) - count
    const order = [...ideal.keys()].sort((a, b) => ideal[b] - ideal[a])
    for (const i of order) {
      while (surplus > 0 && alloc[i] > 1) {
        alloc[i] -= 1
        surplus -= 1
      }
    }
  }

  // 补齐到 count：每次派给"当前缺口最大"（ideal - alloc）的幕
  let assigned = alloc.reduce((s, v) => s + v, 0)
  while (assigned < count) {
    let best = 0
    let bestGap = -Infinity
    for (let i = 0; i < alloc.length; i++) {
      const gap = ideal[i] - alloc[i]
      if (gap > bestGap) {
        bestGap = gap
        best = i
      }
    }
    alloc[best] += 1
    assigned += 1
  }

  let frame = 1
  return NARRATIVE_ACTS.map((a, i) => {
    const from = frame
    const to = frame + alloc[i] - 1
    frame = to + 1
    return { label: a.label, from, to }
  })
}

/**
 * 渲染叙事节奏指令块。
 *
 * 9 帧时输出与优化前逐字一致的 6 条（第 1 帧 / 第 2-3 帧 / 第 4-5 帧 / 第 6-7 帧 /
 * 第 8 帧 / 第 9 帧），保证既有实测行为不漂移；其余帧数按比例展开。
 */
export function renderNarrativePacing(count: number, _grid?: number): string {
  const acts = allocateActs(count)
  return acts
    .map((a, i) => {
      const range = a.from === a.to ? `第 ${a.from} 帧` : `第 ${a.from}-${a.to} 帧`
      return `${i + 1}. ${range}：${a.label}`
    })
    .join('\n')
}

/** 各幕覆盖的帧区间（测试用，便于断言无空洞/无重叠/无越界） */
export function narrativePacingAllocation(count: number): Array<{ label: string; from: number; to: number }> {
  return allocateActs(count)
}