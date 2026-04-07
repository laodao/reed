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
        <span class="scene-name">{{ store.currentScene?.location || '加载中...' }}</span>
      </div>
      <div class="header-right">
        <el-tag type="info">共 {{ store.storyboards.length }} 个镜头</el-tag>
        <el-tag v-if="completedCount === store.storyboards.length" type="success">画面已全部生成</el-tag>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="production-content">
      <!-- 左侧：分镜列表 -->
      <div class="storyboard-panel">
        <div class="panel-header">
          <h3>分镜列表</h3>
          <div class="panel-actions">
            <el-button size="small" @click="generateAllImages" :loading="generatingAll" :disabled="completedCount === store.storyboards.length">
              <el-icon><Picture /></el-icon>
              {{ generatingAll ? '批量生成中...' : '批量生成画面' }}
            </el-button>
          </div>
        </div>

        <div class="storyboard-grid">
          <div
            v-for="storyboard in store.storyboards"
            :key="storyboard.id"
            class="storyboard-card"
            :class="{ 'has-image': storyboard.frameImage, 'selected': selectedStoryboard?.id === storyboard.id }"
            @click="selectStoryboard(storyboard)"
          >
            <!-- 画面预览 -->
            <div class="card-preview">
              <div v-if="storyboard.frameImage" class="preview-image" @click.stop="openImagePreview(storyboard)">
                <img :src="storyboard.frameImage.filePath || storyboard.frameImage.url" :alt="`镜头${storyboard.shotNumber}`" />
                <div class="preview-overlay">
                  <el-icon size="24"><ZoomIn /></el-icon>
                </div>
              </div>
              <div v-else class="preview-placeholder">
                <el-icon size="32"><Picture /></el-icon>
                <span>待生成</span>
              </div>

              <!-- 操作按钮 -->
              <div class="card-actions">
                <el-tooltip content="重新生成" placement="top" v-if="storyboard.frameImage">
                  <el-button circle size="small" @click.stop="openRegenerateDialog(storyboard)">
                    <el-icon><RefreshRight /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="删除画面" placement="top" v-if="storyboard.frameImage">
                  <el-button circle size="small" type="danger" @click.stop="confirmDeleteImage(storyboard)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>

              <!-- 状态标签 -->
              <div class="card-status">
                <el-tag size="small" :type="storyboard.frameImage ? 'success' : 'info'">
                  镜头 {{ storyboard.shotNumber }}
                </el-tag>
              </div>
            </div>

            <!-- 分镜信息 -->
            <div class="card-info">
              <div class="card-meta">
                <span>{{ getShotTypeLabel(storyboard.shotType) }}</span>
                <span>{{ storyboard.duration }}s</span>
              </div>
              <div class="card-description">
                {{ storyboard.frameDescription || '暂无描述' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：操作面板 -->
      <div class="operation-panel">
        <!-- 固定标题栏 -->
        <div class="panel-header-fixed" v-if="selectedStoryboard">
          <h3>镜头 {{ selectedStoryboard.shotNumber }} 详情</h3>
        </div>

        <!-- 可滚动内容区域 -->
        <div class="panel-content">
          <!-- 选中的分镜详情 -->
          <div class="detail-section" v-if="selectedStoryboard">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="景别">{{ getShotTypeLabel(selectedStoryboard.shotType) }}</el-descriptions-item>
              <el-descriptions-item label="角度">{{ getCameraAngleLabel(selectedStoryboard.cameraAngle) }}</el-descriptions-item>
              <el-descriptions-item label="运镜">{{ getCameraMovementLabel(selectedStoryboard.cameraMovement) }}</el-descriptions-item>
              <el-descriptions-item label="时长">{{ selectedStoryboard.duration }}秒</el-descriptions-item>
              <el-descriptions-item label="画面描述">
                <div class="description-text">{{ selectedStoryboard.frameDescription }}</div>
              </el-descriptions-item>
            </el-descriptions>

            <!-- 预览大图 -->
            <div v-if="selectedStoryboard.frameImage" class="detail-preview" @click="openImagePreview(selectedStoryboard)">
              <img :src="selectedStoryboard.frameImage.filePath || selectedStoryboard.frameImage.url" alt="预览" />
              <div class="preview-overlay">
                <el-icon size="24"><ZoomIn /></el-icon>
                <span>点击查看大图</span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="detail-actions">
              <el-button type="primary" size="small" @click="openRegenerateDialog(selectedStoryboard)" :loading="generatingSingle">
                <el-icon><RefreshRight /></el-icon>
                {{ selectedStoryboard.frameImage ? '重新生成' : '生成画面' }}
              </el-button>
              <el-button v-if="selectedStoryboard.frameImage" type="warning" size="small" @click="generateStoryboardAudio" :loading="generatingAudio">
                <el-icon><Headset /></el-icon>
                生成音频
              </el-button>
              <el-button v-if="storyboardDialogues.length > 0" size="small" @click="showDialogueDialog = true">
                <el-icon><ChatDotRound /></el-icon>
                查看对白
              </el-button>
            </div>
          </div>

          <el-empty v-else description="请选择一个分镜" :image-size="80" />

          <!-- 音频播放区域 -->
          <div class="audio-section" v-if="selectedStoryboard">
            <h4>本镜头音频</h4>
            <div v-if="storyboardDialoguesWithAudio.length > 0" class="audio-list">
              <div
                v-for="(dialogue, index) in storyboardDialoguesWithAudio"
                :key="dialogue.id"
                class="audio-item"
              >
                <div class="audio-info">
                  <span class="audio-character">{{ dialogue.characterName }}</span>
                  <span class="audio-text">{{ dialogue.text }}</span>
                </div>
                <div class="audio-controls">
                  <el-button
                    circle
                    size="small"
                    :type="currentPlayingId === dialogue.id ? 'primary' : 'default'"
                    @click="toggleAudioPlay(dialogue)"
                  >
                    <el-icon>
                      <VideoPause v-if="currentPlayingId === dialogue.id && isPlaying" />
                      <VideoPlay v-else />
                    </el-icon>
                  </el-button>
                </div>
              </div>
            </div>
            <div v-else class="audio-empty">暂无音频</div>
          </div>
        </div>

        <!-- 固定底部操作栏 -->
        <div class="bottom-actions-fixed" v-if="store.storyboards.length > 0">
          <div class="action-buttons">
            <el-button
              v-if="selectedStoryboard?.frameImage"
              type="warning"
              @click="synthesizeSingleStoryboard"
              :loading="synthesizingSingle"
            >
              <el-icon><VideoPlay /></el-icon>
              合成当前镜头
            </el-button>
            <el-button type="success" @click="showSynthesisDialog = true" :disabled="!hasAllImages">
              <el-icon><VideoPlay /></el-icon>
              合成全部视频
            </el-button>
          </div>
          <div class="action-hint" v-if="!hasAllImages">
            <el-icon><InfoFilled /></el-icon>
            请先为所有分镜生成画面
          </div>
        </div>
      </div>
    </div>

    <!-- 重新生成对话框 -->
    <el-dialog v-model="showRegenerateDialog" title="重新生成画面" width="500px">
      <el-form label-width="80px">
        <el-form-item label="镜头">
          镜头 {{ regeneratingStoryboard?.shotNumber }}
        </el-form-item>
        <el-form-item label="风格">
          <el-select v-model="regenerateForm.styleName" style="width: 100%">
            <el-option label="电影风格" value="cinematic" />
            <el-option label="动漫风格" value="anime" />
            <el-option label="写实风格" value="realistic" />
            <el-option label="奇幻风格" value="fantasy" />
            <el-option label="古风仙侠" value="ancient_chinese" />
          </el-select>
        </el-form-item>
        <el-form-item label="附加提示">
          <el-input
            v-model="regenerateForm.additionalPrompt"
            type="textarea"
            :rows="3"
            placeholder="输入额外的画面描述，如：更暗的光线、增加细节等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRegenerateDialog = false">取消</el-button>
        <el-button type="primary" @click="regenerateImage" :loading="generatingSingle">开始生成</el-button>
      </template>
    </el-dialog>

    <!-- 对白查看对话框 -->
    <el-dialog v-model="showDialogueDialog" title="镜头对白" width="500px">
      <div v-if="selectedStoryboard" class="dialogue-dialog-content">
        <div class="dialogue-header">
          <el-tag>镜头 {{ selectedStoryboard.shotNumber }}</el-tag>
          <span class="dialogue-count">共 {{ storyboardDialogues.length }} 条对白</span>
        </div>
        <div class="dialogue-list-dialog">
          <div
            v-for="dialogue in storyboardDialogues"
            :key="dialogue.id"
            class="dialogue-item-dialog"
          >
            <div class="dialogue-character">
              <el-tag size="small" type="info">{{ dialogue.characterName }}</el-tag>
              <el-tag v-if="dialogue.emotion" size="small" effect="plain">{{ dialogue.emotion }}</el-tag>
            </div>
            <div class="dialogue-text">{{ dialogue.text }}</div>
            <div class="dialogue-meta" v-if="dialogue.volume || dialogue.pace">
              <span v-if="dialogue.volume !== 'normal'">{{ dialogue.volume === 'loud' ? '大声' : '低语' }}</span>
              <span v-if="dialogue.pace !== 'normal'">{{ dialogue.pace === 'fast' ? '快语速' : '慢语速' }}</span>
            </div>
          </div>
        </div>
        <el-empty v-if="storyboardDialogues.length === 0" description="暂无对白" :image-size="60" />
      </div>
    </el-dialog>

    <!-- 图片预览对话框 -->
    <el-dialog v-model="showImagePreview" title="画面预览" width="90%" top="5vh" destroy-on-close>
      <div class="preview-container">
        <img :src="previewImageUrl" alt="预览图片" class="preview-image-large" />
      </div>
    </el-dialog>

    <!-- 视频合成对话框 -->
    <el-dialog v-model="showSynthesisDialog" title="合成场景视频" width="500px">
      <el-form :model="synthesisForm" label-width="80px">
        <el-form-item label="视频质量">
          <el-select v-model="synthesisForm.quality" style="width: 100%">
            <el-option label="标准 (1080p 30fps)" value="standard" />
            <el-option label="高清 (1080p 高码率)" value="high" />
            <el-option label="流畅 (720p 24fps)" value="low" />
            <el-option label="竖屏 (1080x1920)" value="vertical" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <div class="generate-info">将合成 {{ store.storyboards.length }} 个镜头为完整视频</div>
        </el-form-item>
        <el-form-item v-if="synthesisProgress.phase" label="进度">
          <div class="synthesis-progress">
            <el-progress :percentage="synthesisProgress.progress" :status="synthesisProgress.progress === 100 ? 'success' : ''" />
            <span class="progress-label">{{ getSynthesisPhaseLabel(synthesisProgress.phase) }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSynthesisDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading || synthesisProgress.progress > 0" @click="synthesizeVideo">
          开始合成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Picture, ZoomIn, RefreshRight, Delete, Headset, VideoPlay, InfoFilled, VideoPause, ChatDotRound
} from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import { useTabsStore } from '@/stores/tabs'
import type { Storyboard, Dialogue, AudioAsset } from '../../../shared/types/story-to-video.types'

const route = useRoute()
const router = useRouter()
const store = useStoryToVideoStore()
const tabsStore = useTabsStore()

/**
 * 截断标题（最多 maxLength 个字 + 省略号）
 */
function truncateTitle(title: string, maxLength = 5): string {
  if (!title) return ''
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength) + '...'
}

// 路由参数
const projectId = computed(() => route.params.projectId as string)
const sceneId = computed(() => route.params.sceneId as string)

// 选中的分镜
const selectedStoryboard = ref<Storyboard | null>(null)

// 生成状态
const generatingAll = ref(false)
const generatingSingle = ref(false)
const generatingAudio = ref(false)
const synthesizingSingle = ref(false)

// 对话框状态
const showRegenerateDialog = ref(false)
const showImagePreview = ref(false)
const showSynthesisDialog = ref(false)
const showDialogueDialog = ref(false)
const previewImageUrl = ref('')
const regeneratingStoryboard = ref<Storyboard | null>(null)

// 重新生成表单
const regenerateForm = reactive({
  styleName: 'cinematic',
  additionalPrompt: ''
})

// 视频合成表单
const synthesisForm = reactive({
  quality: 'standard'
})

// 合成进度
const synthesisProgress = reactive({
  phase: '',
  progress: 0
})

// 音频播放状态
const currentPlayingId = ref<string | null>(null)
const isPlaying = ref(false)
const audioElements = new Map<string, HTMLAudioElement>()

// 计算属性
const completedCount = computed(() => store.storyboards.filter(s => s.frameImage).length)
const hasAllImages = computed(() => store.storyboards.length > 0 && store.storyboards.every(s => s.frameImage))

// 过滤选中分镜的对白（有音频的）
const storyboardDialoguesWithAudio = computed(() => {
  if (!selectedStoryboard.value || !store.currentScene || !store.currentScene.dialogues) return []

  const dialogueIds = selectedStoryboard.value.dialogueIds || []
  const allDialogues = store.currentScene.dialogues

  // 调试日志
  console.log('[AudioDebug] 分镜 dialogueIds:', dialogueIds)
  console.log('[AudioDebug] 场景对话 IDs:', allDialogues.map(d => d.id))

  // 如果有 dialogueIds 且能匹配到对白，则过滤显示
  if (dialogueIds.length > 0) {
    const filtered = allDialogues.filter(d => dialogueIds.includes(d.id) && d.audioAsset)
    if (filtered.length > 0) return filtered
  }

  // 兜底：当 dialogueIds 为空时，根据分镜序号智能分配对话
  // 按分镜数量平均分配对话
  const storyboardList = store.storyboards
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

// 获取选中分镜的所有对白（包括没有音频的）
const storyboardDialogues = computed(() => {
  if (!store.currentScene || !store.currentScene.dialogues) return []

  const allDialogues = store.currentScene.dialogues

  // 如果有选中的分镜且有 dialogueIds，尝试过滤
  if (selectedStoryboard.value) {
    const dialogueIds = selectedStoryboard.value.dialogueIds || []
    if (dialogueIds.length > 0) {
      const filtered = allDialogues.filter(d => dialogueIds.includes(d.id))
      if (filtered.length > 0) return filtered
    }

    // 兜底：根据分镜序号智能分配
    const storyboardList = store.storyboards
    const currentIndex = storyboardList.findIndex(s => s.id === selectedStoryboard.value?.id)
    if (currentIndex >= 0 && storyboardList.length > 0) {
      const dialoguesPerShot = Math.ceil(allDialogues.length / storyboardList.length)
      const startIndex = currentIndex * dialoguesPerShot
      const endIndex = Math.min(startIndex + dialoguesPerShot, allDialogues.length)
      return allDialogues.slice(startIndex, endIndex)
    }
  }

  return allDialogues
})

// 获取音频 URL
function getAudioSrc(audioAsset: AudioAsset): string {
  // AudioAsset 类型使用 audioPath 字段
  if (audioAsset.audioPath) {
    // Electron 环境下，使用自定义协议访问本地文件
    return `file://${audioAsset.audioPath}`
  }
  return ''
}

// 播放/暂停音频
function toggleAudioPlay(dialogue: Dialogue) {
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
    audio = new Audio(getAudioSrc(dialogue.audioAsset))
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

// 中文映射
const shotTypeLabels: Record<string, string> = {
  extreme_long: '大远景',
  long: '远景',
  full: '全景',
  medium: '中景',
  medium_close: '中近景',
  close: '近景',
  extreme_close: '特写',
  detail: '细节特写'
}

const cameraAngleLabels: Record<string, string> = {
  eye_level: '平视',
  high: '俯视',
  low: '仰视',
  dutch: '倾斜',
  birds_eye: '鸟瞰',
  worms_eye: '虫视'
}

const cameraMovementLabels: Record<string, string> = {
  static: '固定',
  pan_left: '左摇',
  pan_right: '右摇',
  tilt_up: '上仰',
  tilt_down: '下俯',
  dolly_in: '推近',
  dolly_out: '拉远',
  zoom_in: '放大',
  zoom_out: '缩小',
  tracking: '跟拍',
  crane: '升降'
}

function getShotTypeLabel(type: string): string {
  return shotTypeLabels[type] || type
}

function getCameraAngleLabel(angle: string): string {
  return cameraAngleLabels[angle] || angle
}

function getCameraMovementLabel(movement: string): string {
  return cameraMovementLabels[movement] || movement
}

function getSynthesisPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    shots: '生成镜头视频',
    audio: '合成音频',
    merge: '合并视频片段',
    final: '最终合成'
  }
  return labels[phase] || phase
}

// 返回项目页
function goBack() {
  router.push(`/story-to-video/${projectId.value}`)
}

// 选择分镜
function selectStoryboard(storyboard: Storyboard) {
  selectedStoryboard.value = storyboard
}

// 打开图片预览
function openImagePreview(storyboard: Storyboard) {
  if (storyboard.frameImage) {
    previewImageUrl.value = storyboard.frameImage.filePath || storyboard.frameImage.url
    showImagePreview.value = true
  }
}

// 打开重新生成对话框
function openRegenerateDialog(storyboard: Storyboard) {
  regeneratingStoryboard.value = storyboard
  regenerateForm.styleName = 'cinematic'
  regenerateForm.additionalPrompt = ''
  showRegenerateDialog.value = true
}

// 生成单个分镜画面
async function generateSingleImage(storyboard: Storyboard) {
  try {
    generatingSingle.value = true
    const result = await store.generateStoryboardImage(
      storyboard.id,
      regenerateForm.styleName,
      undefined,
      undefined,
      regenerateForm.additionalPrompt
    )
    if (result) {
      ElMessage.success('画面生成成功')
      showRegenerateDialog.value = false
    } else {
      ElMessage.error('画面生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '画面生成失败')
  } finally {
    generatingSingle.value = false
  }
}

// 重新生成画面
async function regenerateImage() {
  if (!regeneratingStoryboard.value) return
  await generateSingleImage(regeneratingStoryboard.value)
}

// 批量生成画面
async function generateAllImages() {
  const pendingStoryboards = store.storyboards.filter(s => !s.frameImage)
  if (pendingStoryboards.length === 0) {
    ElMessage.info('所有画面已生成')
    return
  }

  try {
    generatingAll.value = true
    let successCount = 0

    for (const storyboard of pendingStoryboards) {
      const result = await store.generateStoryboardImage(storyboard.id, 'cinematic')
      if (result) {
        successCount++
      }
      // 添加延迟避免API限流
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    ElMessage.success(`成功生成 ${successCount}/${pendingStoryboards.length} 个画面`)
  } catch (error: any) {
    ElMessage.error(error.message || '批量生成失败')
  } finally {
    generatingAll.value = false
  }
}

// 确认删除画面
async function confirmDeleteImage(storyboard: Storyboard) {
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

// 生成音频
async function generateAudio() {
  if (!store.currentScene) return

  try {
    generatingAudio.value = true
    const result = await store.generateSceneAudio(store.currentScene.id)
    if (result) {
      ElMessage.success('音频生成完成')
      // 重新加载场景以获取更新后的音频数据
      await store.loadScene(store.currentScene.id)
    } else {
      ElMessage.error(store.error || '生成音频失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成音频失败')
  } finally {
    generatingAudio.value = false
  }
}

// 生成当前分镜的音频
async function generateStoryboardAudio() {
  if (!selectedStoryboard.value || !store.currentScene) return

  try {
    generatingAudio.value = true
    // 生成整个场景的音频（目前没有单独生成分镜音频的接口）
    const result = await store.generateSceneAudio(store.currentScene.id)
    if (result) {
      ElMessage.success(`镜头 ${selectedStoryboard.value.shotNumber} 音频生成完成`)
      // 重新加载场景以获取更新后的音频数据
      await store.loadScene(store.currentScene.id)
    } else {
      ElMessage.error(store.error || '生成音频失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成音频失败')
  } finally {
    generatingAudio.value = false
  }
}

// 合成视频
async function synthesizeVideo() {
  if (!store.currentScene) return

  try {
    synthesisProgress.phase = 'shots'
    synthesisProgress.progress = 0

    const result = await store.synthesizeSceneVideo(
      store.currentScene.id,
      synthesisForm.quality,
      (phase, progress) => {
        synthesisProgress.phase = phase
        synthesisProgress.progress = Math.round(progress)
      }
    )

    if (result) {
      ElMessage.success(`视频合成成功，时长 ${result.duration} 秒`)
      showSynthesisDialog.value = false
    } else {
      ElMessage.error(store.error || '视频合成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '视频合成失败')
  } finally {
    synthesisProgress.phase = ''
    synthesisProgress.progress = 0
  }
}

// 合成单个分镜视频
async function synthesizeSingleStoryboard() {
  if (!selectedStoryboard.value || !selectedStoryboard.value.frameImage) {
    ElMessage.warning('请先选择一个有画面的分镜')
    return
  }

  try {
    synthesizingSingle.value = true
    const result = await store.synthesizeStoryboardVideo(
      selectedStoryboard.value.id,
      synthesisForm.quality
    )

    if (result) {
      ElMessage.success(`镜头 ${selectedStoryboard.value.shotNumber} 视频合成成功`)
    } else {
      ElMessage.error(store.error || '视频合成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '视频合成失败')
  } finally {
    synthesizingSingle.value = false
  }
}

// 初始化
onMounted(async () => {
  await store.loadProject(projectId.value)
  await store.loadEpisodes(projectId.value)
  // 加载场景并设置当前场景
  await store.loadScene(sceneId.value)
  // 加载分镜列表
  await store.loadStoryboards(sceneId.value)
  // 更新 Tab 标题为场景地点名称
  if (store.currentScene?.location) {
    tabsStore.updateTabTitle(route.path, truncateTitle(store.currentScene.location))
  }
})

// 监听场景变化更新 Tab 标题
watch(
  () => store.currentScene?.location,
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

.storyboard-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color-light);

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .storyboard-grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    align-content: start;
  }
}

.storyboard-card {
  background: var(--el-fill-color-blank);
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.selected {
    border-color: var(--el-color-primary);
  }

  &.has-image {
    .card-preview {
      background: #000;
    }
  }

  .card-preview {
    position: relative;
    aspect-ratio: 16/9;
    background: var(--el-fill-color);

    .preview-image {
      width: 100%;
      height: 100%;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .preview-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        opacity: 0;
        transition: opacity 0.2s;
      }

      &:hover .preview-overlay {
        opacity: 1;
      }
    }

    .preview-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--el-text-color-placeholder);
    }

    .card-actions {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    &:hover .card-actions {
      opacity: 1;
    }

    .card-status {
      position: absolute;
      bottom: 8px;
      left: 8px;
    }
  }

  .card-info {
    padding: 12px;

    .card-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-bottom: 8px;
    }

    .card-description {
      font-size: 13px;
      line-height: 1.4;
      color: var(--el-text-color-regular);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
}

.operation-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);

  .panel-header-fixed {
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color-light);
    flex-shrink: 0;

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .detail-section {
    padding: 12px;

    .description-text {
      max-height: 80px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.5;
    }

    .detail-preview {
      margin-top: 12px;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      position: relative;
      cursor: pointer;

      img {
        width: 100%;
        display: block;
      }

      .preview-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: white;
        opacity: 0;
        transition: opacity 0.2s;
      }

      &:hover .preview-overlay {
        opacity: 1;
      }
    }

    .detail-actions {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
  }

  .bottom-actions-fixed {
    padding: 12px 16px;
    border-top: 1px solid var(--el-border-color-light);
    background: var(--el-bg-color);
    flex-shrink: 0;

    .action-buttons {
      display: flex;
      gap: 12px;
    }

    .action-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
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

.synthesis-progress {
  .progress-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 8px;
    display: block;
  }
}

.generate-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.audio-section {
  padding: 8px 12px;

  h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }

  .audio-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 150px;
    overflow-y: auto;
  }

  .audio-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--el-fill-color-light);
    border-radius: 6px;
    transition: background 0.2s;

    &:hover {
      background: var(--el-fill-color);
    }

    .audio-info {
      flex: 1;
      min-width: 0;

      .audio-character {
        display: block;
        font-weight: 500;
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      .audio-text {
        display: block;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .audio-controls {
      flex-shrink: 0;
      margin-left: 8px;
    }
  }

  .audio-empty {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    text-align: center;
    padding: 8px;
  }
}

// 对白弹出对话框样式
.dialogue-dialog-content {
  .dialogue-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    .dialogue-count {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }

  .dialogue-list-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 400px;
    overflow-y: auto;
  }

  .dialogue-item-dialog {
    padding: 12px;
    background: var(--el-fill-color-light);
    border-radius: 8px;

    .dialogue-character {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .dialogue-text {
      font-size: 14px;
      line-height: 1.6;
      color: var(--el-text-color-primary);
    }

    .dialogue-meta {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
}
</style>