/**
 * narrative/ai/shot-pacing
 * @module platform/episode-production/narrative/ai/shot-pacing
 * @description 分镜节奏密度规则（2026-09-20 EP 管线 prompt 优化，参考
 *              resources/skills/ep-storyboard-director 的密度分档方法论）：
 *              - PACING_DENSITY_PROMPT / NAMING_EMOTION_PROMPT：注入分镜类
 *                prompt 的共享片段（generator 与 cogen 两处共用，保持口径一致）
 *              - validateShotPacing：对生成出的分镜做纯函数密度/时长校验，
 *                只产出警告，不做硬阻断
 */

// ==================== prompt 共享片段 ====================

/**
 * 镜头节奏密度分档（按剧情场景内容驱动，不依赖剧作基调配置项）。
 * 行业基准：短剧向"每 2 秒 1 镜"是留存底线。
 */
export const PACING_DENSITY_PROMPT = `### 镜头节奏密度分档（按剧情场景内容选择，同一场景/片段内可混合档位）
- 钩子开场/冲突爆发/打脸/身份揭示/高潮清算：单镜头 1-1.5s，15s 片段 8-12 镜
- 对话交锋/情绪递进/常规叙事：单镜头 1.5-2.5s，15s 片段 6-9 镜
- 关键台词特写/反转停顿/蓄势：单镜头 2.5-4s
- 情感沉淀/静态凝视/空镜（呼吸镜头）：单镜头 3-8s，仅用于情感节点，整片少量使用
- 硬规则：各镜头 duration 之和必须等于本场景/片段目标总时长；常规叙事段镜头平均时长不得超过 2.5s（"每 2 秒 1 镜"是短剧留存底线），情感沉淀段除外`

/**
 * 命名纪律 + 情绪外化 + 台词长度适配。
 * 命名强一致是为了从源头减少 normalizeAiCharacters 的反查失败。
 */
export const NAMING_EMOTION_PROMPT = `### 命名与情绪表达纪律（必须遵守）
- 命名强一致：角色与道具全程使用名册登记名（与「出场角色」名单一字不差），禁止"他/那个男人/少年"等代词或别称；禁止"三个人""众人""反派们"等群体量词概括，多角色出场须逐个写出登记名
- 情绪具象外化：禁止"很悲伤""非常愤怒"等抽象情绪词，必须写具体身体细节。词库：悲伤=低头/肩膀微颤/眼眶泛红/攥紧衣角；喜悦=嘴角上扬/眉眼舒展/脚步轻快；紧张=频繁看表/手指敲桌/呼吸急促；愤怒=双拳紧握/下颔线紧绷/胸口起伏；释然=长舒一口气/肩膀放松/淡淡微笑
- 台词长度适配镜头时长：3 秒以内的镜头只能容纳一两句短语`

// ==================== 生成结果校验（纯函数，只警告不阻断） ====================

/** 密度窗口大小（秒）：与视频片段预算对齐（Seedance/MiniMax-H3 ≤15s） */
export const SHOT_PACING_WINDOW_SEC = 15
/** 短剧密度下限：每个 15s 窗口至少 6 镜（= 平均每镜 2.5s 的留存底线） */
export const SHOT_PACING_MIN_SHOTS_PER_WINDOW = 6
/** 常规叙事段平均时长上限（秒），情感沉淀段除外 */
export const SHOT_PACING_MAX_AVG_SEC = 2.5
/** 单镜头合法时长区间（秒）：1s 以下无法成镜，8s 为呼吸镜头上限 */
export const SHOT_PACING_MIN_SHOT_SEC = 1
export const SHOT_PACING_MAX_SHOT_SEC = 8
/** 镜头时长之和 vs 目标总时长的容差（秒） */
const DURATION_SUM_TOLERANCE_SEC = 0.5
/** 窗口内容达到该比例才做密度判定（尾部残余小窗不判定） */
const WINDOW_FULL_RATIO = 2 / 3

export interface ShotPacingInput {
  duration: number
}

export interface ShotPacingOptions {
  /** 场景/片段标签，作为警告前缀（如 "场景 3"） */
  sceneLabel?: string
  /** 目标总时长（秒）；传入时校验镜头时长之和，缺省跳过该校验 */
  targetDurationSec?: number
  /** 密度窗口大小（秒），默认 15 */
  windowSec?: number
}

function fmtSec(n: number): string {
  return String(Number(n.toFixed(1)))
}

/**
 * 校验一组分镜的节奏密度与时长。
 *
 * 检查项：
 *   1. duration 非法（非正数/NaN）
 *   2. 单镜头时长超出 1-8s 区间
 *   3. 镜头时长之和 vs 目标总时长（仅当传入 targetDurationSec）
 *   4. 按 windowSec（默认 15s）窗口分组后的镜头密度：窗口内容达到
 *      10s（15s 的 2/3）以上而镜头数 < 6，判定低于短剧密度下限
 *      （警告文案注明情感沉淀段呼吸镜头可忽略，由人判断）
 *
 * @returns 警告文案列表；空数组 = 无问题
 */
export function validateShotPacing(
  shots: ShotPacingInput[],
  opts: ShotPacingOptions = {},
): string[] {
  const warnings: string[] = []
  if (!Array.isArray(shots) || shots.length === 0) return warnings

  const label = opts.sceneLabel ? `${opts.sceneLabel}：` : ''
  const windowSec =
    Number.isFinite(opts.windowSec) && (opts.windowSec as number) > 0
      ? (opts.windowSec as number)
      : SHOT_PACING_WINDOW_SEC

  // 1/2. 单镜校验，累计总时长（非法时长不计入）
  let total = 0
  const validDurations: number[] = []
  shots.forEach((s, i) => {
    const d = s?.duration
    if (!Number.isFinite(d) || d <= 0) {
      warnings.push(`${label}第 ${i + 1} 镜 duration 非法（${String(d)}），应为正数秒`)
      return
    }
    if (d < SHOT_PACING_MIN_SHOT_SEC) {
      warnings.push(`${label}第 ${i + 1} 镜仅 ${fmtSec(d)}s，低于单镜头下限 ${SHOT_PACING_MIN_SHOT_SEC}s`)
    }
    if (d > SHOT_PACING_MAX_SHOT_SEC) {
      warnings.push(
        `${label}第 ${i + 1} 镜 ${fmtSec(d)}s，超过呼吸镜头上限 ${SHOT_PACING_MAX_SHOT_SEC}s`,
      )
    }
    total += d
    validDurations.push(d)
  })

  // 3. 时长之和 vs 目标总时长
  if (
    opts.targetDurationSec != null &&
    Number.isFinite(opts.targetDurationSec) &&
    opts.targetDurationSec > 0 &&
    Math.abs(total - opts.targetDurationSec) > DURATION_SUM_TOLERANCE_SEC
  ) {
    warnings.push(
      `${label}镜头时长之和 ${fmtSec(total)}s 与目标 ${fmtSec(opts.targetDurationSec)}s 不符` +
        `（差 ${fmtSec(Math.abs(total - opts.targetDurationSec))}s）`,
    )
  }

  // 4. 按窗口分组做密度判定（与 segment-planner 的累加切分同语义）
  let windowCount = 0
  let windowDur = 0
  let windowIdx = 0
  const flushWindow = () => {
    if (windowCount === 0) return
    windowIdx += 1
    const avg = windowDur / windowCount
    if (
      windowDur >= windowSec * WINDOW_FULL_RATIO &&
      windowCount < SHOT_PACING_MIN_SHOTS_PER_WINDOW
    ) {
      warnings.push(
        `${label}${fmtSec(windowDur)}s 内容仅 ${windowCount} 镜，低于短剧密度下限 ` +
          `${SHOT_PACING_MIN_SHOTS_PER_WINDOW} 镜（窗口第 ${windowIdx} 段，平均每镜 ${fmtSec(avg)}s > ` +
          `${SHOT_PACING_MAX_AVG_SEC}s；若为情感沉淀段呼吸镜头可忽略）`,
      )
    }
  }
  for (const d of validDurations) {
    if (windowCount > 0 && windowDur + d > windowSec) {
      flushWindow()
      windowCount = 0
      windowDur = 0
    }
    windowCount += 1
    windowDur += d
    // 单镜超窗 → 独成一段，立刻闭合
    if (d > windowSec) {
      flushWindow()
      windowCount = 0
      windowDur = 0
    }
  }
  flushWindow()

  return warnings
}
