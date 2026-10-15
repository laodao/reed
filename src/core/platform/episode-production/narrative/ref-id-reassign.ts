/**
 * 场次内引用 id（对话 / 动作）重发工具
 * @module platform/episode-production/narrative/ref-id-reassign
 *
 * 背景（2026-09-24 审计 S3）：SceneBindingWriter 曾直接信任 AI 给的 id 作为主键
 * （`dlg.id || 生成`），而 AI 习惯每场从 `dlg_1` / `act_1` 开始编号，兜底生成又是
 * 每场独立计数 —— 同批次跨场景撞主键，`save()` 变 upsert 静默覆盖前一场的行。
 * 所以写库前对整批场景的 dlg_/act_ id 统一重发；scene_scripts JSON 列与
 * scene_dialogues / scene_actions 桥接表写入同一份重发后的对象，天然保持一致。
 * append 路径（ScriptAppendService.reassignRefIds）与本写库路径共用本模块。
 */

import type { GeneratedScene } from '@shared/types/episode-production'

/** 场次内引用 id 的批次序号（保证同一批次内不重复） */
let refIdSeq = 0

/** 生成新的引用 id（对话 / 动作），与 SceneBindingWriter 内部风格保持一致 */
export function nextRefId(prefix: 'dlg' | 'act'): string {
  refIdSeq += 1
  return `${prefix}_${Date.now().toString(36)}_${refIdSeq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

/**
 * 重发对话 / 动作 id。
 *
 * SceneBindingWriter 用 AI 给的 id 作为主键（`dlg.id || 生成`），而 AI 习惯从
 * `dlg_1` / `act_1` 开始编号 —— 同批次跨场景必然撞主键；追加时旧的
 * scene_dialogues / scene_actions 行还在库里，直接写也会冲突。所以写库前统一
 * 重发 id。返回新对象数组，不修改入参。
 */
export function reassignRefIds(scenes: GeneratedScene[]): GeneratedScene[] {
  return scenes.map((scene) => ({
    ...scene,
    dialogues: (scene.dialogues ?? []).map((dialogue) => ({
      ...dialogue,
      id: nextRefId('dlg'),
    })),
    actions: (scene.actions ?? []).map((action) => ({
      ...action,
      id: nextRefId('act'),
    })),
  }))
}
