/**
 * useWorkbenchStageNavigation · 工作台 stage 切换 + 门控（FU3 拆分）
 * @module composables/use-workbench-stage-navigation
 *
 * 把 EpisodeWorkbench.vue 中 P6-T13/T16/T17/T18/T20 累积的 stage 切换 +
 * 门控 + AssetSidebar / StageHeaderBar / StageContent / StageStoryboard
 * 跳转 handler 集中，让 EpisodeWorkbench template 只关心组件装配。
 *
 * 接收：
 *   - activeTab：父组件持有的 ref（当前 stage）
 *   - selectedAsset：父组件持有的 ref（② 资产 stage 选中编辑的资产）
 *   - dialogs：父组件 reactive（StoryboardEditDialog 触发用）
 *   - headerBarRef：父组件 StageHeaderBar 引用（reload 进度）
 *
 * 返回 8 个 handler：
 *   onNavigateStage, onOpenAsset, onAddAsset,
 *   onPreviewEpisode, onSelectStoryboard, onEditStoryboardFromStage,
 *   onJumpToProductionWithSb, onContentConfirmed
 */

import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  useEpEpisodeStore,
} from '@/stores/episode-production'
import type {
  EpisodeStatus,
  StageEnterDecision,
} from '../../../shared/types/episode-production'
import type {
  Storyboard,
  VideoEpisode,
} from '../../../shared/types/story-to-video.types'

type WorkbenchStage = Exclude<EpisodeStatus, 'completed'>
type AssetKind = 'character' | 'location' | 'item' | 'voice'

interface DialogsState {
  storyboardEdit: boolean
  editingStoryboard: Storyboard | null
}

interface UseWorkbenchStageNavigationInput {
  activeTab: Ref<WorkbenchStage>
  selectedAsset: Ref<{ type: AssetKind; id: string } | null>
  dialogs: DialogsState
  headerBarRef: Ref<{ reload: () => Promise<void> } | null>
  /** 父组件 selectEpisode（episodeStore.selectEpisode 包装），让路由
   *  episodeId 变化后能触发 store 加载 script/scenes/storyboards 链路 */
  selectEpisode: (ep: VideoEpisode) => Promise<void>
}

export function useWorkbenchStageNavigation(
  input: UseWorkbenchStageNavigationInput,
) {
  const episodeStore = useEpEpisodeStore()

  /**
   * P6-T13/T16/T17 顶部进度条点击 → 经门控决策 → 切到对应 stage tab。
   *
   * P6-T16 门控逻辑（spec §2.3 软引导 + 末端硬锁）：
   *   - 同状态 / 回退：StageGate 直接 allowed=true → 切换
   *   - 前向跳转 + 前置阶段已完成：allowed=true → 切换
   *   - 前向跳转 + 前置未完成 + canForce=true：弹 confirm 列 gaps[]
   *   - canForce=false（末端硬锁）：弹 alert
   *   - IPC 失败 / 数据缺失：软放过
   */
  async function onNavigateStage(status: EpisodeStatus): Promise<void> {
    if (status === 'completed') {
      ElMessage.info('剧集已完成')
      return
    }
    const ep = episodeStore.currentEpisode
    if (!ep) {
      input.activeTab.value = status as WorkbenchStage
      return
    }
    try {
      const api = (window as any).electronAPI?.episodeProduction
      if (!api?.canEnterStage) {
        input.activeTab.value = status as WorkbenchStage
        return
      }
      const resp = await api.canEnterStage(ep.id, ep.status as EpisodeStatus, status)
      if (!resp?.success) {
        console.warn('canEnterStage 返回失败，软放过：', resp?.error)
        input.activeTab.value = status as WorkbenchStage
        return
      }
      const decision = resp.data as StageEnterDecision
      if (decision.allowed) {
        input.activeTab.value = status as WorkbenchStage
        return
      }
      if (!decision.canForce) {
        const gapList = decision.gaps.map((g) => `• ${g.message}`).join('\n')
        await ElMessageBox.alert(
          `不能进入此阶段（末端硬锁）：\n\n${gapList}\n\n请先完成上述项再试。`,
          '阶段门控',
          { type: 'error', confirmButtonText: '知道了' },
        )
        return
      }
      const gapList = decision.gaps.map((g) => `• ${g.message}`).join('\n')
      try {
        await ElMessageBox.confirm(
          `前置阶段还有 ${decision.gaps.length} 项未完成：\n\n${gapList}\n\n仍要进入吗？`,
          '前置未完成',
          {
            confirmButtonText: '仍要进入',
            cancelButtonText: '回到 ② 资产',
            type: 'warning',
          },
        )
        input.activeTab.value = status as WorkbenchStage
      } catch {
        input.activeTab.value = 'asset_prep'
      }
    } catch (e: any) {
      console.warn('门控调用异常，软放过：', e)
      input.activeTab.value = status as WorkbenchStage
    }
  }

  /** P6-T14 左侧资产侧栏点击单条资产 */
  function onOpenAsset(kind: AssetKind, id: string): void {
    input.activeTab.value = 'asset_prep'
    input.selectedAsset.value = { type: kind, id }
  }

  /**
   * 右侧资产侧栏"+ 添加 X"。
   * FU6-T3：跳到 ② 资产 stage —— 真正的新建按钮在 AssetStageViewV2 里
   * （v2 已内置 promptCreateStandalone + voice 复刻 dialog），跳过去 user 立刻就能点。
   *
   * 2026-05-08 T12：voice 不再 toast 跳走 — 资产 stage 的「+ 复刻新音色」按钮
   * 已直接打开 VoiceCloneDialog 走完整复刻链路。这里统一只做切 tab + 提示。
   */
  function onAddAsset(kind: AssetKind): void {
    input.activeTab.value = 'asset_prep'
    input.selectedAsset.value = null
    // 2026-05-08 T12：voice 不再 toast 跳走 — 资产 stage 的「+ 复刻新音色」
    // 按钮已直接打开 VoiceCloneDialog 走完整复刻链路。这里统一只做切 tab。
    const labelMap = {
      character: '角色',
      location: '地点',
      item: '物品',
      voice: '复刻新音色',
    } as const
    ElMessage.info(`已切到 ② 资产，点列表头部"+ ${labelMap[kind]}"创建`)
  }

  /** P6-T15 底部时间线"⏵ 试播" */
  function onPreviewEpisode(): void {
    input.activeTab.value = 'composing'
    ElMessage.info('已跳到 ⑥ 合成 stage — 请点"导出 MP4"获得最新成片')
  }

  /** P6-T15 底部时间线点击单个分镜 cell（待 P6 follow-up 暴露 prop） */
  function onSelectStoryboard(storyboardId: string): void {
    void storyboardId
    input.activeTab.value = 'producing'
  }

  /** P6-T20 StageStoryboardView "编辑分镜配置" → StoryboardEditDialog */
  function onEditStoryboardFromStage(sb: Storyboard): void {
    input.dialogs.editingStoryboard = sb
    input.dialogs.storyboardEdit = true
  }

  /** P6-T20 StageStoryboardView "去 ⑤ 制作"（待 P6 follow-up 暴露 prop） */
  function onJumpToProductionWithSb(storyboardId: string): void {
    void storyboardId
    input.activeTab.value = 'producing'
  }

  /** P6-T18 ① 内容 stage "确认要素" → 切 ② 资产 + 刷新阶段进度 */
  async function onContentConfirmed(): Promise<void> {
    input.activeTab.value = 'asset_prep'
    await input.headerBarRef.value?.reload()
  }

  return {
    onNavigateStage,
    onOpenAsset,
    onAddAsset,
    onPreviewEpisode,
    onSelectStoryboard,
    onEditStoryboardFromStage,
    onJumpToProductionWithSb,
    onContentConfirmed,
  }
}
