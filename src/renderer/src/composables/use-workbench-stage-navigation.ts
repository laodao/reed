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
type WorkbenchStage = 'pending' | 'asset_prep' | 'storyboarding' | 'producing' | 'composing'

/** scripting status 映射到合并 tab pending；其余 status 直接用作 tab name */
function toTabName(status: EpisodeStatus): WorkbenchStage {
  return status === 'scripting' ? 'pending' : (status as WorkbenchStage)
}
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

  /**
   * ① 内容 stage "确认要素" 完成后只刷新阶段进度（spec 2026-05-08 v3 不再自动跳转）。
   * 跳转由用户主动点 stage 进度条决定，header 上的"确认要素"按钮自然消失即视觉反馈。
   */
  async function onContentConfirmed(): Promise<void> {
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
