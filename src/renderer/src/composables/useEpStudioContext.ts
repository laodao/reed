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

const TAB_LABELS: Record<EpStudioTab, string> = {
  script: '剧本',
  asset: '资产',
  storyboard: '分镜',
  compose: '合成',
}

export function useEpStudioContext(initial: { projectId?: string; episodeId?: string }) {
  const projectId = ref(initial.projectId ?? '')
  const episodeId = ref(initial.episodeId ?? '')
  const activeTab = ref<EpStudioTab>('script')
  const selectedSceneId = ref<string | null>(null)
  const selectedAsset = ref<{ kind: 'character' | 'location' | 'item'; id: string; name: string } | null>(null)

  // 2026-09-16 S-04：hint 恒含当前 tab（随消息注入 agent 快照，让助手知道用户在哪个阶段页）；
  // 有选中对象时追加选中信息
  const contextHint = computed<string | null>(() => {
    const base = `当前在「${TAB_LABELS[activeTab.value]}」页`
    if (selectedSceneId.value) return `${base}；选中场景：${selectedSceneId.value}`
    if (selectedAsset.value) return `${base}；选中${assetKindLabel(selectedAsset.value.kind)}：${selectedAsset.value.name}`
    return base
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
