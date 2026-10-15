/**
 * 场景条目 id 口径（提示词优化方案 §3.9 / §4.2，原则 P1 单一事实源）
 * @module platform/episode-production/prompts/scene-id
 *
 * 背景（P0 活 bug）：批量分镜提示词把对白/旁白/动作渲染成 `- 角色: "台词" (情感)`，
 * **不带任何 id**，但输出 schema 要求回填 `dialogueIds` / `narrationId` / `actionIds`——
 * 模型只能瞎编 id，这正是下游 `distributeDialoguesToStoryboards`"按镜数均分"兜底存在的
 * 原因，而均分与镜头内容无关。
 *
 * 修法：prompt 渲染与校验必须共用同一 id 口径。本模块提供该口径的唯一实现，
 * cogen（`storyboard-cogen.ts`）与旧批量/单镜生成器（`storyboard-generator.ts`）都从这里取。
 *
 * 合成 id 规则：有真实 id 用真实 id；无 id 老数据合成稳定 id `<prefix>_noid_<index>`
 * （index = 场景内下标）。真实 id 形如 `dlg_<时间戳>_<序号>` / `dlg_<n>`，
 * 与 `_noid_` 前缀不会冲突。
 *
 * 注：合成 id 只是防御兜底——`StoryboardCogenService.backfillDialogueIds` 会在生成前
 * 为无 id 对白回填真实 id 并落库，正常路径不会走到 `_noid_` 分支
 * （合成 id 没有 scene_dialogues 行，若真落 storyboard_dialogue_links 会触发 FK 失败）。
 */

/** 对白 id 前缀 */
export const DIALOGUE_ID_PREFIX = 'dlg'
/** 旁白 id 前缀（§4.2：旁白获得一等公民地位，需可被镜头承接） */
export const NARRATION_ID_PREFIX = 'nrt'
/** 动作 id 前缀 */
export const ACTION_ID_PREFIX = 'act'

function displayIdOf(prefix: string, item: { id?: unknown } | null | undefined, index: number): string {
  const id = item?.id
  return typeof id === 'string' && id.length > 0 ? id : `${prefix}_noid_${index}`
}

/**
 * 对白在 prompt / 校验中的展示 id。
 * prompt 渲染与 expectedDialogueIds 必须经本函数取同一口径，否则全覆盖校验会误报。
 */
export function dialogueDisplayId(dialogue: { id?: unknown }, index: number): string {
  return displayIdOf(DIALOGUE_ID_PREFIX, dialogue, index)
}

/** 动作在 prompt / 校验中的展示 id（与对白同口径） */
export function actionDisplayId(action: { id?: unknown }, index: number): string {
  return displayIdOf(ACTION_ID_PREFIX, action, index)
}

/**
 * 旁白展示 id（§4.2）。
 *
 * 屏幕上旁白是场景级单条文本（`scene.narration: string`），历史上没有 id，
 * 因此固定返回 `nrt_1`——这样提示词能要求"旁白必须有镜头承接"，
 * 校验侧用同一个常量判断覆盖，无需先做 schema 迁移。
 * 若后续 narration 升级为 `{ id, text }` 对象，本函数改为读取其 id 即可，
 * 调用方无需改动。
 */
export function narrationDisplayId(narration: unknown, index = 0): string | null {
  if (narration == null) return null
  if (typeof narration === 'object' && narration !== null) {
    return displayIdOf(NARRATION_ID_PREFIX, narration as { id?: unknown }, index)
  }
  if (typeof narration === 'string' && narration.trim().length === 0) return null
  return `${NARRATION_ID_PREFIX}_1`
}

/** 旁白默认展示 id（校验侧与 prompt 侧共用同一常量口径） */
export const DEFAULT_NARRATION_ID = `${NARRATION_ID_PREFIX}_1`