/**
 * useWorkbenchStageNavigation · 工作台 stage 切换（FU3 拆分）
 * @module composables/use-workbench-stage-navigation
 *
 * 把 EpisodeWorkbench.vue 中 stage 切换 + AssetSidebar / StageHeaderBar /
 * StageContent / StageStoryboard 跳转 handler 集中，让 EpisodeWorkbench
 * template 只关心组件装配。
 *
 * 接收：
 *   - activeTab：父组件持有的 ref（当前 stage）
 *   - dialogs：父组件 reactive（StoryboardEditDialog 触发用）
 *   - headerBarRef：父组件 StageHeaderBar 引用（reload 进度）
 *
 * 返回 6 个 handler：
 *   onNavigateStage, onPreviewEpisode, onSelectStoryboard, onEditStoryboardFromStage,
 *   onJumpToProductionWithSb, onContentConfirmed
 */

import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  EpisodeStatus,
} from '../../../shared/types/episode-production'
import type {
  Storyboard,
  VideoEpisode,
} from '../../../shared/types/story-to-video.types'

/**
 * Task 10：① 内容 + ③ 剧本 合并后，tab name 只有 5 个（无 scripting）。
 * scripting status 在进度条点击时映射到 pending tab。
 */
type WorkbenchStage = 'pending' | 'storyboarding' | 'producing' | 'composing'

/** scripting status 映射到合并 tab pending；其余 status 直接用作 tab name */
function toTabName(status: EpisodeStatus): WorkbenchStage {
  // scripting / asset_prep 都映射到 pending：
  // - scripting：① 内容 + ③ 剧本 合并（Task 10）
  // - asset_prep：资产入口已迁项目级，episode 无资产 tab
  if (status === 'scripting' || status === 'asset_prep') return 'pending'
  return status as WorkbenchStage
}

interface DialogsState {
  storyboardEdit: boolean
  editingStoryboard: Storyboard | null
}

interface UseWorkbenchStageNavigationInput {
  activeTab: Ref<WorkbenchStage>
  dialogs: DialogsState
  headerBarRef: Ref<{ reload: () => Promise<void> } | null>
  /** 父组件 selectEpisode（episodeStore.selectEpisode 包装），让路由
   *  episodeId 变化后能触发 store 加载 script/scenes/storyboards 链路 */
  selectEpisode: (ep: VideoEpisode) => Promise<void>
}

export function useWorkbenchStageNavigation(
  input: UseWorkbenchStageNavigationInput,
) {
  /**
   * 顶部进度条点击 → 直接切到对应 stage tab。
   *
   * 取消阶段先后强制流程（2026-05-08 user 决策）：任意 stage 可直接进入，
   * 不再走 canEnterStage 门控弹框。"完成剧集" 终态硬锁仍由 StageComposeViewV2
   * 自行校验，与本路径无关。
   */
  function onNavigateStage(status: EpisodeStatus): void {
    if (status === 'completed') {
      ElMessage.info('剧集已完成')
      return
    }
    input.activeTab.value = toTabName(status)
  }

  // onOpenAsset / onAddAsset 已移除（资产编辑迁项目级 ProjectAssetView，AssetSidebar 已删）

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

  /**
   * ① 内容 stage "确认要素" 完成后只刷新阶段进度（spec 2026-05-08 v3 不再自动跳转）。
   * 跳转由用户主动点 stage 进度条决定，header 上的"确认要素"按钮自然消失即视觉反馈。
   */
  async function onContentConfirmed(): Promise<void> {
    await input.headerBarRef.value?.reload()
  }

  return {
    onNavigateStage,
    onPreviewEpisode,
    onSelectStoryboard,
    onEditStoryboardFromStage,
    onJumpToProductionWithSb,
    onContentConfirmed,
  }
}
