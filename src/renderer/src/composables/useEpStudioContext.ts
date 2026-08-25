/**
 * 剧集制作 · 新版工作台上下文
 * @module composables/useEpStudioContext
 *
 * 持有当前 projectId / episodeId / activeTab / 选中场景 / 选中资产，
 * 供中央工作区 + 右侧 agent 面板共同消费（面板借 context 感知"当前在干吗"）。
 * 由路由 params 初始化；切换剧集/场景/资产时更新。
 */
import { ref, computed } from 'vue'
import type { Ref } from 'vue'

export type EpStudioTab = 'script' | 'asset' | 'storyboard' | 'compose'

export interface EpStudioContext {
  projectId: Ref<string>
  episodeId: Ref<string>
  activeTab: Ref<EpStudioTab>
  selectedSceneId: Ref<string | null>
  selectedAsset: Ref<{ kind: 'character' | 'location' | 'item'; id: string; name: string } | null>
}

export function useEpStudioContext(initial: { projectId?: string; episodeId?: string }) {
  const projectId = ref(initial.projectId ?? '')
  const episodeId = ref(initial.episodeId ?? '')
  const activeTab = ref<EpStudioTab>('script')
  const selectedSceneId = ref<string | null>(null)
  const selectedAsset = ref<{ kind: 'character' | 'location' | 'item'; id: string; name: string } | null>(null)

  const contextHint = computed<string | null>(() => {
    if (selectedSceneId.value) return `当前选中场景：${selectedSceneId.value}`
    if (selectedAsset.value) return `当前选中${assetKindLabel(selectedAsset.value.kind)}：${selectedAsset.value.name}`
    return null
  })

  function setTab(tab: EpStudioTab): void {
    activeTab.value = tab
  }

  function setEpisode(id: string): void {
    episodeId.value = id
    // 切换剧集时清空场景/资产选择，避免跨剧集残留
    selectedSceneId.value = null
    selectedAsset.value = null
  }

  function setScene(id: string | null): void {
    selectedSceneId.value = id
  }

  function setAsset(asset: { kind: 'character' | 'location' | 'item'; id: string; name: string } | null): void {
    selectedAsset.value = asset
  }

  return { projectId, episodeId, activeTab, selectedSceneId, selectedAsset, contextHint, setTab, setEpisode, setScene, setAsset }
}

function assetKindLabel(kind: string): string {
  return kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品'
}

/** 供组件读取类型（保持导出) */
export type EpStudioContextApi = ReturnType<typeof useEpStudioContext>
