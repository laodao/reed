<template>
  <div class="video-production-page">
    <!-- 顶部导航 -->
    <div class="production-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回项目
        </el-button>
        <el-divider direction="vertical" />
        <h2 class="page-title">视频制作</h2>
        <span class="scene-name">{{ scriptStore.currentScene?.location || '加载中...' }}</span>
      </div>
      <div class="header-right">
        <el-tag type="info">共 {{ sbStore.storyboards.length }} 个镜头</el-tag>
        <el-tag v-if="completedCount === sbStore.storyboards.length && sbStore.storyboards.length > 0" type="success">
          画面已全部生成
        </el-tag>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="production-content">
      <!-- 左侧：分镜列表 -->
      <ShotListPanel
        :storyboards="sbStore.storyboards"
        :selected-id="selectedStoryboard?.id ?? null"
        :generating-all="generatingAll"
        @select="onSelectStoryboard"
        @open-image-preview="onOpenImagePreview"
        @open-regenerate-dialog="onOpenRegenerateDialog"
        @delete-image="onConfirmDeleteImage"
        @play-video="onPlayVideo"
        @generate-all="onGenerateAllImages"
        @open-synthesis-dialog="showSynthesisDialog = true"
      />

      <!-- 右侧：分镜详情面板 -->
      <ShotDetailPanel
        :selected-storyboard="selectedStoryboard"
        :has-current-scene="!!scriptStore.currentScene"
        :has-storyboards="sbStore.storyboards.length > 0"
        :dialogues-with-audio="dialoguesWithAudio"
        :current-playing-id="currentPlayingId"
        :is-playing="isPlaying"
        :generating-single="generatingSingle"
        :generating-audio="generatingAudio"
        :synthesizing-single="synthesizingSingle"
        @open-image-preview="onOpenImagePreview"
        @open-regenerate-dialog="onOpenRegenerateDialog"
        @generate-audio="onGenerateStoryboardAudio"
        @open-script-dialog="showScriptDialog = true"
        @toggle-audio="onToggleAudioPlay"
        @synthesize-single="onSynthesizeSingle"
        @play-video="onPlayVideo"
      />
    </div>

    <!-- 重新生成对话框 -->
    <RegenerateImageDialog
      v-model="showRegenerateDialog"
      :shot-number="regeneratingStoryboard?.shotNumber"
      :loading="generatingSingle"
      @confirm="onRegenerateImage"
    />

    <!-- 剧本查看对话框 -->
    <ScriptViewDialog
      v-model="showScriptDialog"
      :scene="scriptStore.currentScene"
    />

    <!-- 视频合成对话框 -->
    <SynthesisDialog
      v-model="showSynthesisDialog"
      :storyboard-count="sbStore.storyboards.length"
      :progress-phase="synthesisProgress.phase"
      :progress-value="synthesisProgress.progress"
      :loading="wbStore.loading"
      @confirm="onSynthesizeVideo"
    />

    <!-- 图片预览对话框 -->
    <el-dialog v-model="showImagePreview" title="画面预览" width="90%" top="5vh" destroy-on-close>
      <div class="preview-container">
        <img :src="previewImageUrl" alt="预览图片" class="preview-image-large" />
      </div>
    </el-dialog>

    <!-- 视频播放对话框 -->
    <el-dialog v-model="showVideoDialog" title="视频播放" width="800px" destroy-on-close>
      <div class="video-player-container">
        <video
          v-if="playingVideoPath"
          :src="playingVideoPath"
          controls
          autoplay
          class="video-player"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'

import {
  useEpWorkbenchStore,
  useEpProjectStore,
  useEpEpisodeStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProductionStore,
  useEpComposeStore,
} from '@/stores/episode-production'
import { useTabsStore } from '@/stores/tabs'
import { toVideoUrl } from '@/utils/asset-url'
import type { Storyboard, Dialogue } from '../../../shared/types/story-to-video.types'

import ShotListPanel from '@/components/episode-production/stage-production/ShotListPanel.vue'
import ShotDetailPanel from '@/components/episode-production/stage-production/ShotDetailPanel.vue'
import ScriptViewDialog from '@/components/episode-production/stage-production/ScriptViewDialog.vue'
import RegenerateImageDialog from '@/components/episode-production/stage-production/RegenerateImageDialog.vue'
import SynthesisDialog from '@/components/episode-production/stage-production/SynthesisDialog.vue'

// ==================== 路由 / store ====================
const route = useRoute()
const router = useRouter()

const wbStore = useEpWorkbenchStore()
const projectStore = useEpProjectStore()
const episodeStore = useEpEpisodeStore()
const scriptStore = useEpScriptStore()
const sbStore = useEpStoryboardStore()
const prodStore = useEpProductionStore()
const composeStore = useEpComposeStore()
const tabsStore = useTabsStore()

// ==================== 路由参数 ====================
const projectId = computed(() => route.params.projectId as string)
const sceneId = computed(() => route.params.sceneId as string)

// ==================== 选中分镜 ====================
const selectedStoryboard = ref<Storyboard | null>(null)

// ==================== 加载/生成状态 ====================
const generatingAll = ref(false)
const generatingSingle = ref(false)
const generatingAudio = ref(false)
const synthesizingSingle = ref(false)

// ==================== 对话框状态 ====================
const showRegenerateDialog = ref(false)
const showImagePreview = ref(false)
const showSynthesisDialog = ref(false)
const showScriptDialog = ref(false)
const showVideoDialog = ref(false)
const previewImageUrl = ref('')
const playingVideoPath = ref('')
const regeneratingStoryboard = ref<Storyboard | null>(null)

// ==================== 合成进度与质量 ====================
const synthesisProgress = { phase: '', progress: 0 }
/** 最近一次在合成对话框中选择的质量，单镜合成时复用 */
const lastSynthesisQuality = ref('standard')

// ==================== 音频播放状态 ====================
const currentPlayingId = ref<string | null>(null)
const isPlaying = ref(false)
const audioElements = new Map<string, HTMLAudioElement>()

// ==================== 计算属性 ====================
const completedCount = computed(() => sbStore.storyboards.filter(s => s.frameImage).length)

/**
 * 截断标题（最多 maxLength 个字 + 省略号）
 */
function truncateTitle(title: string, maxLength = 5): string {
  if (!title) return ''
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength) + '...'
}

/**
 * 过滤选中分镜的对白（有音频的）
 */
const dialoguesWithAudio = computed(() => {
  if (!selectedStoryboard.value || !scriptStore.currentScene || !scriptStore.currentScene.dialogues) return []

  const dialogueIds = selectedStoryboard.value.dialogueIds || []
  const allDialogues = scriptStore.currentScene.dialogues

  // 调试日志
  console.log('[AudioDebug] 分镜 dialogueIds:', dialogueIds)
  console.log('[AudioDebug] 场景对话 IDs:', allDialogues.map(d => d.id))

  // 如果有 dialogueIds 且能匹配到对白，则过滤显示
  if (dialogueIds.length > 0) {
    const filtered = allDialogues.filter(d => dialogueIds.includes(d.id) && d.audioAsset)
    if (filtered.length > 0) return filtered
  }

  // 兜底：当 dialogueIds 为空时，根据分镜序号智能分配对话
  const storyboardList = sbStore.storyboards
  const currentIndex = storyboardList.findIndex(s => s.id === selectedStoryboard.value?.id)
  if (currentIndex >= 0 && storyboardList.length > 0) {
    const dialoguesPerShot = Math.ceil(allDialogues.length / storyboardList.length)
    const startIndex = currentIndex * dialoguesPerShot
    const endIndex = Math.min(startIndex + dialoguesPerShot, allDialogues.length)
    const assignedDialogues = allDialogues.slice(startIndex, endIndex).filter(d => d.audioAsset)
    console.log(`[AudioDebug] 兜底分配: 分镜 ${currentIndex + 1}, 对话 ${startIndex}-${endIndex}`)
    return assignedDialogues
  }

  return allDialogues.filter(d => d.audioAsset)
})

// ==================== 事件处理函数 ====================

function goBack() {
  router.push(`/episode-production/${projectId.value}`)
}

function onSelectStoryboard(storyboard: Storyboard) {
  selectedStoryboard.value = storyboard
}

function onOpenImagePreview(storyboard: Storyboard) {
  if (storyboard.frameImage) {
    previewImageUrl.value = storyboard.frameImage.filePath || storyboard.frameImage.url
    showImagePreview.value = true
  }
}

function onOpenRegenerateDialog(storyboard: Storyboard) {
  regeneratingStoryboard.value = storyboard
  showRegenerateDialog.value = true
}

async function onConfirmDeleteImage(_storyboard: Storyboard) {
  try {
    await ElMessageBox.confirm('确定要删除这个画面吗？删除后可以重新生成。', '删除画面', {
      type: 'warning'
    })
    // TODO: 实现删除画面逻辑
    ElMessage.success('画面已删除')
  } catch {
    // 用户取消
  }
}

function onPlayVideo(storyboard: Storyboard) {
  if (storyboard.videoPath) {
    playingVideoPath.value = toVideoUrl(storyboard.videoPath.replace(/\\/g, '/'))
    showVideoDialog.value = true
  }
}

/** 重新生成（由 RegenerateImageDialog 的 confirm 事件触发） */
async function onRegenerateImage(styleName: string, _additionalPrompt: string) {
  if (!regeneratingStoryboard.value) return

  try {
    generatingSingle.value = true
    const imageModelConfig = projectStore.currentProject?.config?.imageModel
    const result = await prodStore.generateStoryboardImage(
      regeneratingStoryboard.value.id,
      styleName,
      imageModelConfig?.providerConfigId,
      imageModelConfig?.modelId
    )
    if (result) {
      ElMessage.success('画面生成成功')
      showRegenerateDialog.value = false
    } else {
      ElMessage.error(wbStore.error || '画面生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '画面生成失败')
  } finally {
    generatingSingle.value = false
  }
}

async function onGenerateAllImages() {
  const pendingStoryboards = sbStore.storyboards.filter(s => !s.frameImage)
  if (pendingStoryboards.length === 0) {
    ElMessage.info('所有画面已生成')
    return
  }

  const imageModelConfig = projectStore.currentProject?.config?.imageModel

  try {
    generatingAll.value = true
    let successCount = 0

    for (const storyboard of pendingStoryboards) {
      const result = await prodStore.generateStoryboardImage(
        storyboard.id,
        'cinematic',
        imageModelConfig?.providerConfigId,
        imageModelConfig?.modelId
      )
      if (result) {
        successCount++
      }
      // 添加延迟避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    ElMessage.success(`成功生成 ${successCount}/${pendingStoryboards.length} 个画面`)
  } catch (error: any) {
    ElMessage.error(error.message || '批量生成失败')
  } finally {
    generatingAll.value = false
  }
}

async function onGenerateStoryboardAudio() {
  if (!selectedStoryboard.value || !scriptStore.currentScene) return

  try {
    generatingAudio.value = true
    // 生成整个场景的音频（目前没有单独生成分镜音频的接口）
    const result = await prodStore.generateSceneAudio(scriptStore.currentScene.id)
    if (result) {
      ElMessage.success(`镜头 ${selectedStoryboard.value.shotNumber} 音频生成完成`)
      // 重新加载场景以获取更新后的音频数据
      await scriptStore.loadScene(scriptStore.currentScene.id)
    } else {
      ElMessage.error(wbStore.error || '生成音频失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成音频失败')
  } finally {
    generatingAudio.value = false
  }
}

function onToggleAudioPlay(dialogue: Dialogue) {
  if (!dialogue.audioAsset) return

  const audioId = dialogue.id

  // 如果正在播放同一个音频，则暂停
  if (currentPlayingId.value === audioId && isPlaying.value) {
    const audio = audioElements.get(audioId)
    if (audio) {
      audio.pause()
      isPlaying.value = false
    }
    return
  }

  // 停止其他正在播放的音频
  audioElements.forEach((audio, id) => {
    if (id !== audioId) {
      audio.pause()
      audio.currentTime = 0
    }
  })

  // 播放当前音频
  let audio = audioElements.get(audioId)
  if (!audio) {
    const audioPath = dialogue.audioAsset.audioPath
    const src = audioPath ? `file://${audioPath}` : ''
    audio = new Audio(src)
    audio.onended = () => {
      if (currentPlayingId.value === audioId) {
        currentPlayingId.value = null
        isPlaying.value = false
      }
    }
    audio.onerror = () => {
      ElMessage.error('音频加载失败')
      currentPlayingId.value = null
      isPlaying.value = false
    }
    audioElements.set(audioId, audio)
  }

  audio.currentTime = 0
  audio.play()
  currentPlayingId.value = audioId
  isPlaying.value = true
}

/** 合成全部场景视频（由 SynthesisDialog 的 confirm 事件触发） */
async function onSynthesizeVideo(quality: string) {
  lastSynthesisQuality.value = quality
  if (!scriptStore.currentScene) return

  try {
    synthesisProgress.phase = 'shots'
    synthesisProgress.progress = 0

    const result = await composeStore.synthesizeSceneVideo(
      scriptStore.currentScene.id,
      quality,
      (phase, progress) => {
        synthesisProgress.phase = phase
        synthesisProgress.progress = Math.round(progress)
      }
    )

    if (result) {
      ElMessage.success(`视频合成成功，时长 ${result.duration} 秒`)
      showSynthesisDialog.value = false
    } else {
      ElMessage.error(wbStore.error || '视频合成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '视频合成失败')
  } finally {
    synthesisProgress.phase = ''
    synthesisProgress.progress = 0
  }
}

async function onSynthesizeSingle() {
  if (!selectedStoryboard.value || !selectedStoryboard.value.frameImage) {
    ElMessage.warning('请先选择一个有画面的分镜')
    return
  }

  try {
    synthesizingSingle.value = true
    const result = await composeStore.synthesizeStoryboardVideo(
      selectedStoryboard.value.id,
      lastSynthesisQuality.value
    )

    if (result) {
      ElMessage.success(`镜头 ${selectedStoryboard.value.shotNumber} 视频合成成功`)
      // 重新加载分镜列表以更新 videoPath
      if (scriptStore.currentScene) {
        await sbStore.loadStoryboards(scriptStore.currentScene.id)
        // 重新选中当前分镜
        const updated = sbStore.storyboards.find(s => s.id === selectedStoryboard.value?.id)
        if (updated) {
          selectedStoryboard.value = updated
        }
      }
    } else {
      ElMessage.error(wbStore.error || '视频合成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '视频合成失败')
  } finally {
    synthesizingSingle.value = false
  }
}

// ==================== 初始化 ====================
onMounted(async () => {
  await projectStore.loadProject(projectId.value)
  await episodeStore.loadEpisodes(projectId.value)
  // 加载场景并设置当前场景
  await scriptStore.loadScene(sceneId.value)
  // 加载分镜列表
  await sbStore.loadStoryboards(sceneId.value)
  // 更新 Tab 标题为场景地点名称
  if (scriptStore.currentScene?.location) {
    tabsStore.updateTabTitle(route.path, truncateTitle(scriptStore.currentScene.location))
  }
})

// 监听场景变化更新 Tab 标题
watch(
  () => scriptStore.currentScene?.location,
  (location) => {
    if (location) {
      tabsStore.updateTabTitle(route.path, truncateTitle(location))
    }
  }
)
</script>

<style scoped lang="scss">
.video-production-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.production-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .page-title {
      margin: 0;
      font-size: 18px;
    }

    .scene-name {
      color: var(--el-text-color-secondary);
      font-size: 14px;
    }
  }

  .header-right {
    display: flex;
    gap: 12px;
  }
}

.production-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  max-height: 80vh;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.preview-image-large {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}

.video-player-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.video-player {
  max-width: 100%;
  max-height: 70vh;
  outline: none;
}
</style>
