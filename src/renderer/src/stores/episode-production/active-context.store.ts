/**
 * episode-production · 活动上下文 store（P6-T22 资产侧栏 context-aware）
 * @module renderer/stores/episode-production/active-context.store
 *
 * 让 AssetSidebar 根据当前 stage 的"上下文"（当前场景 / 当前分镜 / 当前
 * 关键帧）智能高亮相关资产，而不是死板的清单。
 *
 * 各 stage 在选中数据变化时调 setActiveContext 更新 ID 集合：
 *   - ③ 剧本（currentScene 变化）：场景出场角色 + 地点
 *   - ④ 分镜（selectedStoryboardId 变化）：分镜级 storyboard_characters
 *     ⊕ 场景级回退；地点同场景；道具来自场景的 props
 *   - ⑤ 制作（selectedStoryboardId 变化，含关键帧）：同 ④
 *   - ⑥ 合成 / ① 内容 / ② 资产：clear()（侧栏隐藏或不需要 context）
 *
 * AssetSidebar 读 activeIds 给 sidebar-item 加 active class（高亮）；
 * 不在 active 集合的 item 弱化（降饱和度）但仍可点击。
 *
 * activeStage 字段供 sidebar 区分：'none' 时不渲染高亮（全部正常）。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ActiveContextStage =
  | 'none'         // 不需要高亮（① ② ⑥ stage）
  | 'scripting'    // ③ 剧本
  | 'storyboarding' // ④ 分镜
  | 'producing'    // ⑤ 制作

export const useEpActiveContextStore = defineStore('ep-active-context', () => {
  /** 当前激活的 stage（决定高亮规则） */
  const activeStage = ref<ActiveContextStage>('none')

  /** 角色 ID 集合（Set 用 Array 实现避免响应式 Set 兼容性问题） */
  const activeCharacterIds = ref<string[]>([])
  const activeLocationIds = ref<string[]>([])
  const activeItemIds = ref<string[]>([])
  const activeVoiceIds = ref<string[]>([])

  /** 当前激活的场景 / 分镜 / 关键帧名（用于 sidebar 顶部状态提示） */
  const activeContextLabel = ref<string>('')

  function setContext(input: {
    stage: ActiveContextStage
    characterIds?: string[]
    locationIds?: string[]
    itemIds?: string[]
    voiceIds?: string[]
    label?: string
  }): void {
    activeStage.value = input.stage
    activeCharacterIds.value = input.characterIds ?? []
    activeLocationIds.value = input.locationIds ?? []
    activeItemIds.value = input.itemIds ?? []
    activeVoiceIds.value = input.voiceIds ?? []
    activeContextLabel.value = input.label ?? ''
  }

  function clear(): void {
    activeStage.value = 'none'
    activeCharacterIds.value = []
    activeLocationIds.value = []
    activeItemIds.value = []
    activeVoiceIds.value = []
    activeContextLabel.value = ''
  }

  function isCharacterActive(id: string): boolean {
    return activeCharacterIds.value.includes(id)
  }
  function isLocationActive(id: string): boolean {
    return activeLocationIds.value.includes(id)
  }
  function isItemActive(id: string): boolean {
    return activeItemIds.value.includes(id)
  }
  function isVoiceActive(id: string): boolean {
    return activeVoiceIds.value.includes(id)
  }

  return {
    activeStage,
    activeCharacterIds,
    activeLocationIds,
    activeItemIds,
    activeVoiceIds,
    activeContextLabel,
    setContext,
    clear,
    isCharacterActive,
    isLocationActive,
    isItemActive,
    isVoiceActive,
  }
})
