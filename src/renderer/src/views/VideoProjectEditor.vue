<template>
  <div class="video-project-editor">
    <!-- 顶部导航 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-divider direction="vertical" />
        <h2 class="project-title">{{ store.currentProject?.name || '加载中...' }}</h2>
      </div>
      <div class="header-right">
        <el-button @click="showSettingsDialog = true">
          <el-icon><Setting /></el-icon>
          项目设置
        </el-button>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="editor-content">
      <!-- 左侧面板 - 剧集列表 -->
      <div class="left-panel">
        <div class="panel-header">
          <h3>剧集列表</h3>
          <el-button type="primary" size="small" @click="showCreateEpisodeDialog = true">
            <el-icon><Plus /></el-icon>
            添加剧集
          </el-button>
        </div>

        <div class="episode-list">
          <div
            v-for="episode in store.episodes"
            :key="episode.id"
            class="episode-item"
            :class="{ active: store.currentEpisode?.id === episode.id }"
            @click="selectEpisode(episode)"
          >
            <div class="episode-number">第{{ episode.episodeNumber }}集</div>
            <div class="episode-title">{{ episode.title }}</div>
            <div class="episode-status">
              <el-tag size="small" :type="getEpisodeStatusType(episode.status)">
                {{ getEpisodeStatusLabel(episode.status) }}
              </el-tag>
            </div>
            <div class="episode-actions" @click.stop>
              <el-button text type="danger" size="small" @click="confirmDeleteEpisode(episode)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <el-empty v-if="store.episodes.length === 0" description="暂无剧集" :image-size="80" />
        </div>
      </div>

      <!-- 中间区域 - 剧本/场景 -->
      <div class="center-panel">
        <template v-if="store.currentEpisode">
          <el-tabs v-model="activeTab" class="editor-tabs">
            <!-- 剧本标签页 -->
            <el-tab-pane label="剧本" name="script">
              <div class="script-editor">
                <div class="script-header">
                  <h4>剧本概要</h4>
                  <el-button size="small" @click="generateScript">
                    <el-icon><MagicStick /></el-icon>
                    AI 生成剧本
                  </el-button>
                </div>
                <el-input
                  v-model="scriptSynopsis"
                  type="textarea"
                  :rows="4"
                  placeholder="输入或生成剧本概要..."
                  @blur="saveScriptSynopsis"
                />

                <div class="scene-section">
                  <div class="section-header">
                    <h4>场景列表 ({{ store.scenes.length }})</h4>
                    <el-button size="small" @click="generateScenes">
                      <el-icon><MagicStick /></el-icon>
                      拆分场景
                    </el-button>
                  </div>

                  <div class="scene-list">
                    <div
                      v-for="scene in store.scenes"
                      :key="scene.id"
                      class="scene-item"
                      :class="{ active: store.currentScene?.id === scene.id }"
                      @click="selectScene(scene)"
                    >
                      <div class="scene-number">场景 {{ scene.sceneNumber }}</div>
                      <div class="scene-location">{{ scene.location }}</div>
                      <div class="scene-info">
                        <el-tag size="small" type="info">{{ scene.timeOfDay }}</el-tag>
                        <span class="scene-duration">{{ scene.narration.length }} 字</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 角色绑定标签页 -->
            <el-tab-pane label="角色绑定" name="characters">
              <div class="character-bindings">
                <div class="bindings-header">
                  <h4>角色绑定配置</h4>
                  <el-button size="small" @click="showBindCharacterDialog = true">
                    <el-icon><Plus /></el-icon>
                    绑定角色
                  </el-button>
                </div>

                <div class="bindings-list">
                  <div
                    v-for="binding in store.characterBindings"
                    :key="binding.id"
                    class="binding-item"
                  >
                    <div class="binding-character">
                      {{ getCharacterName(binding.longWritingCharacterId) }}
                    </div>
                    <div class="binding-config">
                      <el-tag v-if="binding.portraitId" size="small" type="success">
                        已绑定人像
                      </el-tag>
                      <el-tag v-else size="small" type="info">
                        未绑定人像
                      </el-tag>
                    </div>
                    <div class="binding-actions">
                      <el-button text size="small" @click="editBinding(binding)">
                        编辑
                      </el-button>
                      <el-button text size="small" type="danger" @click="removeBinding(binding)">
                        移除
                      </el-button>
                    </div>
                  </div>

                  <el-empty v-if="store.characterBindings.length === 0" description="暂无角色绑定" :image-size="60" />
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>

        <el-empty v-else description="请选择或创建剧集" :image-size="120" />
      </div>

      <!-- 右侧面板 - 分镜 -->
      <div class="right-panel">
        <template v-if="store.currentScene">
          <div class="panel-header">
            <h3>分镜列表</h3>
            <div class="panel-actions">
              <el-button size="small" @click="generateStoryboards">
                <el-icon><MagicStick /></el-icon>
                生成分镜
              </el-button>
              <el-button
                v-if="store.storyboards.length > 0"
                size="small"
                type="primary"
                @click="showGenerateImagesDialog = true"
              >
                <el-icon><Picture /></el-icon>
                生成画面
              </el-button>
              <el-button
                v-if="hasAllImages"
                size="small"
                type="success"
                @click="showSynthesisDialog = true"
              >
                <el-icon><VideoPlay /></el-icon>
                合成视频
              </el-button>
            </div>
          </div>

          <div class="storyboard-list">
            <div
              v-for="storyboard in store.storyboards"
              :key="storyboard.id"
              class="storyboard-item"
              :class="{ 'has-image': storyboard.frameImage }"
            >
              <!-- 画面预览 -->
              <div v-if="storyboard.frameImage" class="storyboard-preview">
                <img :src="storyboard.frameImage.url" :alt="`镜头${storyboard.shotNumber}`" />
              </div>
              <div v-else class="storyboard-preview placeholder">
                <el-icon size="32"><Picture /></el-icon>
                <span>待生成</span>
              </div>

              <div class="storyboard-info">
                <div class="storyboard-header">
                  <span class="shot-number">镜头 {{ storyboard.shotNumber }}</span>
                  <el-tag size="small">{{ storyboard.shotType }}</el-tag>
                </div>
                <div class="storyboard-description">
                  {{ storyboard.frameDescription }}
                </div>
                <div class="storyboard-meta">
                  <span>{{ storyboard.duration }}s</span>
                  <span>{{ storyboard.cameraAngle }}</span>
                  <span>{{ storyboard.cameraMovement }}</span>
                </div>
              </div>
            </div>
          </div>

          <el-empty v-if="store.storyboards.length === 0" description="暂无分镜" :image-size="80" />
        </template>

        <el-empty v-else description="请选择场景" :image-size="80" />
      </div>
    </div>

    <!-- 生成画面对话框 -->
    <el-dialog
      v-model="showGenerateImagesDialog"
      title="生成分镜画面"
      width="500px"
    >
      <el-form :model="imageGenerateForm" label-width="80px">
        <el-form-item label="图像风格">
          <el-select v-model="imageGenerateForm.styleName" style="width: 100%">
            <el-option label="电影风格" value="cinematic" />
            <el-option label="动漫风格" value="anime" />
            <el-option label="写实风格" value="realistic" />
            <el-option label="奇幻风格" value="fantasy" />
            <el-option label="古风仙侠" value="ancient_chinese" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <div class="generate-info">
            将为当前场景的 {{ store.storyboards.length }} 个分镜生成画面
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateImagesDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="store.loading"
          @click="generateSceneImages"
        >
          开始生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 创建剧集对话框 -->
    <el-dialog
      v-model="showCreateEpisodeDialog"
      title="创建剧集"
      width="500px"
    >
      <el-form :model="episodeForm" label-width="80px">
        <el-form-item label="剧集序号">
          <el-input-number v-model="episodeForm.episodeNumber" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="剧集标题">
          <el-input v-model="episodeForm.title" placeholder="请输入剧集标题" />
        </el-form-item>
        <el-form-item label="关联章节">
          <el-select v-model="episodeForm.outlineId" placeholder="选择关联的章节（可选）" clearable style="width: 100%">
            <el-option
              v-for="chapter in chapters"
              :key="chapter.id"
              :label="`第${chapter.order}章: ${chapter.title}`"
              :value="chapter.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateEpisodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading" @click="createEpisode">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 视频合成对话框 -->
    <el-dialog
      v-model="showSynthesisDialog"
      title="合成场景视频"
      width="500px"
    >
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
          <div class="generate-info">
            将合成 {{ store.storyboards.length }} 个镜头为完整视频
          </div>
        </el-form-item>
        <el-form-item v-if="synthesisProgress.phase" label="进度">
          <div class="synthesis-progress">
            <el-progress
              :percentage="synthesisProgress.progress"
              :status="synthesisProgress.progress === 100 ? 'success' : ''"
            />
            <span class="progress-text">
              {{ getSynthesisPhaseLabel(synthesisProgress.phase) }}
            </span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSynthesisDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="store.loading || synthesisProgress.progress > 0"
          @click="synthesizeVideo"
        >
          开始合成
        </el-button>
      </template>
    </el-dialog>

    <!-- 项目设置对话框 -->
    <el-dialog
      v-model="showSettingsDialog"
      title="项目设置"
      width="600px"
    >
      <el-form v-if="store.currentProject" label-width="100px">
        <el-form-item label="项目名称">
          <el-input v-model="projectSettings.name" />
        </el-form-item>
        <el-form-item label="画幅比例">
          <el-select v-model="projectSettings.config.aspectRatio" style="width: 100%">
            <el-option label="16:9 (横屏)" value="16:9" />
            <el-option label="9:16 (竖屏)" value="9:16" />
            <el-option label="4:3 (标准)" value="4:3" />
            <el-option label="1:1 (方形)" value="1:1" />
          </el-select>
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="projectSettings.config.resolution" style="width: 100%">
            <el-option label="4K" :value="2160" />
            <el-option label="2K" :value="1440" />
            <el-option label="1080p" :value="1080" />
            <el-option label="720p" :value="720" />
            <el-option label="480p" :value="480" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率">
          <el-select v-model="projectSettings.config.fps" style="width: 100%">
            <el-option label="24 fps" :value="24" />
            <el-option label="25 fps" :value="25" />
            <el-option label="30 fps" :value="30" />
            <el-option label="60 fps" :value="60" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading" @click="saveProjectSettings">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 绑定角色对话框 -->
    <el-dialog
      v-model="showBindCharacterDialog"
      title="绑定角色"
      width="500px"
    >
      <el-form :model="bindCharacterForm" label-width="100px">
        <el-form-item label="选择角色">
          <el-select v-model="bindCharacterForm.characterId" placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="char in availableCharacters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="声音类型">
          <el-select v-model="bindCharacterForm.voiceType" placeholder="选择声音类型" style="width: 100%">
            <el-option label="男声-沉稳" value="male_calm" />
            <el-option label="男声-活力" value="male_energetic" />
            <el-option label="女声-温柔" value="female_gentle" />
            <el-option label="女声-活泼" value="female_lively" />
            <el-option label="童声" value="child" />
            <el-option label="老年-男" value="elder_male" />
            <el-option label="老年-女" value="elder_female" />
          </el-select>
        </el-form-item>
        <el-form-item label="语速">
          <el-slider v-model="bindCharacterForm.speechRate" :min="0.5" :max="2" :step="0.1" show-stops />
        </el-form-item>
        <el-form-item label="角色描述">
          <el-input
            v-model="bindCharacterForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入角色外貌描述，用于生成人物形象（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBindCharacterDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!bindCharacterForm.characterId"
          :loading="store.loading"
          @click="handleBindCharacter"
        >
          绑定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Setting, Plus, MagicStick, Picture, VideoPlay, Delete } from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import type { VideoEpisode, VideoProject, SceneScript, CharacterBinding } from '../../../shared/types/story-to-video.types'

const route = useRoute()
const router = useRouter()
const store = useStoryToVideoStore()

// 项目ID
const projectId = computed(() => route.params.projectId as string)

// 当前标签页
const activeTab = ref('script')

// 剧本概要
const scriptSynopsis = ref('')

// 章节列表（用于关联剧集）
const chapters = ref<Array<{ id: string; order: number; title: string }>>([])

// 对话框状态
const showCreateEpisodeDialog = ref(false)
const showSettingsDialog = ref(false)
const showBindCharacterDialog = ref(false)
const showGenerateImagesDialog = ref(false)
const showSynthesisDialog = ref(false)

// 绑定角色表单
const bindCharacterForm = reactive({
  characterId: '',
  voiceType: 'female_gentle',
  speechRate: 1.0,
  description: ''
})

// 计算属性：可绑定的角色（排除已绑定的）
const availableCharacters = computed(() => {
  const boundIds = store.characterBindings.map(b => b.longWritingCharacterId)
  return longWritingCharacters.value.filter(c => !boundIds.includes(c.id))
})

// 图像生成表单
const imageGenerateForm = reactive({
  styleName: 'cinematic'
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

// 创建剧集表单
const episodeForm = reactive({
  episodeNumber: 1,
  title: '',
  outlineId: ''
})

// 项目设置表单
const projectSettings = reactive({
  name: '',
  config: {
    aspectRatio: '16:9' as const,
    resolution: 1080,
    fps: 30,
    defaultTransition: 'fade' as const,
    stylePrompt: ''
  }
})

// 长文角色列表
const longWritingCharacters = ref<Array<{ id: string; name: string }>>([])

// 计算属性：检查是否所有分镜都有图片
const hasAllImages = computed(() => {
  return store.storyboards.length > 0 && store.storyboards.every(sb => sb.frameImage)
})

/**
 * 加载项目数据
 */
async function loadProject() {
  await store.loadProject(projectId.value)
  if (store.currentProject) {
    // 加载剧集列表
    await store.loadEpisodes(projectId.value)
    // 加载角色绑定
    await store.loadCharacterBindings(projectId.value)
    // 加载关联的长文项目数据
    if (store.currentProject.longWritingProjectId) {
      await loadLongWritingData(store.currentProject.longWritingProjectId)
    }
    // 更新项目设置表单
    projectSettings.name = store.currentProject.name
    projectSettings.config = { ...store.currentProject.config }
  }
}

/**
 * 加载长文项目数据
 */
async function loadLongWritingData(longWritingProjectId: string) {
  try {
    // 加载章节列表
    const outlineResponse = await window.electronAPI.longwriting.getOutlineTree(longWritingProjectId)
    console.log('章节响应:', outlineResponse)
    if (outlineResponse.success && outlineResponse.data) {
      chapters.value = outlineResponse.data.map((o: any) => ({
        id: o.id,
        order: o.orderIndex,
        title: o.name
      }))
    }

    // 加载角色列表
    const charResponse = await window.electronAPI.longwriting.getCharacters(longWritingProjectId)
    console.log('角色响应:', charResponse)
    if (charResponse.success && charResponse.data) {
      longWritingCharacters.value = charResponse.data.map((c: any) => ({
        id: c.id,
        name: c.name
      }))
    }
  } catch (error) {
    console.error('加载长文数据失败:', error)
  }
}

/**
 * 返回项目列表
 */
function goBack() {
  router.push('/story-to-video')
}

/**
 * 选择剧集
 */
async function selectEpisode(episode: VideoEpisode) {
  await store.selectEpisode(episode)
  if (store.currentScript) {
    scriptSynopsis.value = store.currentScript.synopsis
  }
}

/**
 * 确认删除剧集
 */
async function confirmDeleteEpisode(episode: VideoEpisode) {
  try {
    await ElMessageBox.confirm(
      `确定要删除「第${episode.episodeNumber}集：${episode.title}」吗？删除后可在数据库中恢复。`,
      '删除剧集',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = await store.deleteEpisode(episode.id)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error(store.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

/**
 * 创建剧集
 */
async function createEpisode() {
  if (!episodeForm.title.trim()) {
    ElMessage.warning('请输入剧集标题')
    return
  }

  const episode = await store.createEpisode(
    projectId.value,
    episodeForm.outlineId || '',
    episodeForm.episodeNumber,
    episodeForm.title
  )

  if (episode) {
    ElMessage.success('创建成功')
    showCreateEpisodeDialog.value = false
    // 重置表单
    episodeForm.episodeNumber = store.episodes.length + 1
    episodeForm.title = ''
    episodeForm.outlineId = ''
    // 选中新创建的剧集
    await selectEpisode(episode)
  } else {
    ElMessage.error(store.error || '创建失败')
  }
}

/**
 * 选择场景
 */
async function selectScene(scene: SceneScript) {
  await store.selectScene(scene)
}

/**
 * 保存剧本概要
 */
async function saveScriptSynopsis() {
  if (!store.currentScript) return
  await store.updateScript(store.currentScript.id, { synopsis: scriptSynopsis.value })
}

/**
 * 生成剧本（AI）
 */
async function generateScript() {
  if (!store.currentProject || !store.currentEpisode) {
    ElMessage.warning('请先选择剧集')
    return
  }

  // 检查是否有关联的章节
  if (!store.currentEpisode.outlineId) {
    ElMessage.warning('该剧集未关联章节，无法生成剧本')
    return
  }

  try {
    ElMessage.info('正在生成剧本，请稍候...')

    const result = await store.generateScript(
      store.currentProject.id,
      store.currentEpisode.outlineId
    )

    if (result) {
      ElMessage.success(`剧本生成成功，共 ${result.scenes.length} 个场景`)
      scriptSynopsis.value = result.script.synopsis
    } else {
      ElMessage.error(store.error || '生成剧本失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成剧本失败')
  }
}

/**
 * 拆分场景（AI）
 */
async function generateScenes() {
  if (!store.currentScript) {
    ElMessage.warning('请先生成剧本')
    return
  }

  try {
    ElMessage.info('正在拆分场景，请稍候...')

    const result = await store.generateScenes(store.currentScript.id)

    if (result) {
      ElMessage.success(`场景拆分成功，共 ${result.length} 个场景`)
    } else {
      ElMessage.error(store.error || '拆分场景失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '拆分场景失败')
  }
}

/**
 * 生成分镜（AI）
 */
async function generateStoryboards() {
  if (!store.currentScript) {
    ElMessage.warning('请先生成剧本')
    return
  }

  if (store.scenes.length === 0) {
    ElMessage.warning('请先拆分场景')
    return
  }

  try {
    const confirm = await ElMessageBox.confirm(
      `将为 ${store.scenes.length} 个场景生成分镜，是否继续？`,
      '生成分镜',
      { confirmButtonText: '生成', cancelButtonText: '取消', type: 'info' }
    ).catch(() => false)

    if (!confirm) return

    ElMessage.info('正在生成分镜，请稍候...')

    const result = await store.generateStoryboards(store.currentScript.id)

    if (result) {
      ElMessage.success(`分镜生成成功，共 ${result.length} 个镜头`)
    } else {
      ElMessage.error(store.error || '生成分镜失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成分镜失败')
  }
}

/**
 * 生成场景画面
 */
async function generateSceneImages() {
  if (!store.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }

  if (store.storyboards.length === 0) {
    ElMessage.warning('请先生成分镜')
    showGenerateImagesDialog.value = false
    return
  }

  try {
    showGenerateImagesDialog.value = false
    ElMessage.info('正在生成分镜画面，请稍候...')

    const result = await store.generateSceneImages(
      store.currentScene.id,
      imageGenerateForm.styleName,
      undefined,
      undefined,
      (index, total) => {
        // 进度回调
        console.log(`生成进度: ${index + 1}/${total}`)
      }
    )

    if (result) {
      ElMessage.success(`画面生成成功，共 ${result.length} 张`)
    } else {
      ElMessage.error(store.error || '生成画面失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成画面失败')
  }
}

/**
 * 保存项目设置
 */
async function saveProjectSettings() {
  if (!store.currentProject) return

  const success = await store.updateProject(store.currentProject.id, {
    name: projectSettings.name,
    config: projectSettings.config
  })

  if (success) {
    ElMessage.success('保存成功')
    showSettingsDialog.value = false
  } else {
    ElMessage.error(store.error || '保存失败')
  }
}

/**
 * 获取剧集状态标签
 */
function getEpisodeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    script_completed: '剧本完成',
    storyboard_completed: '分镜完成',
    production: '制作中',
    completed: '完成'
  }
  return labels[status] || status
}

/**
 * 获取剧集状态类型
 */
function getEpisodeStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    script_completed: 'warning',
    storyboard_completed: '',
    production: '',
    completed: 'success'
  }
  return types[status] || 'info'
}

/**
 * 获取角色名称
 */
function getCharacterName(characterId: string): string {
  const char = longWritingCharacters.value.find(c => c.id === characterId)
  return char?.name || characterId
}

/**
 * 绑定角色
 */
async function handleBindCharacter() {
  if (!bindCharacterForm.characterId || !store.currentProject) {
    ElMessage.warning('请选择角色')
    return
  }

  const result = await store.bindCharacter(
    store.currentProject.id,
    bindCharacterForm.characterId,
    undefined, // portraitId 暂时不绑定
    {
      voiceId: bindCharacterForm.voiceType,
      speed: bindCharacterForm.speechRate,
      pitch: 1.0
    },
    bindCharacterForm.description ? {
      baseDescription: bindCharacterForm.description
    } : undefined
  )

  if (result) {
    ElMessage.success('角色绑定成功')
    showBindCharacterDialog.value = false
    // 重置表单
    bindCharacterForm.characterId = ''
    bindCharacterForm.voiceType = 'female_gentle'
    bindCharacterForm.speechRate = 1.0
    bindCharacterForm.description = ''
  } else {
    ElMessage.error(store.error || '绑定失败')
  }
}

/**
 * 编辑绑定
 */
function editBinding(binding: CharacterBinding) {
  ElMessage.info('编辑角色绑定功能开发中...')
}

/**
 * 移除绑定
 */
async function removeBinding(binding: CharacterBinding) {
  try {
    await ElMessageBox.confirm('确定要移除该角色绑定吗？', '确认', {
      type: 'warning'
    })
    await store.deleteCharacterBinding(binding.id)
    ElMessage.success('移除成功')
  } catch {
    // 用户取消
  }
}

/**
 * 合成视频
 */
async function synthesizeVideo() {
  if (!store.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }

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

/**
 * 获取合成阶段标签
 */
function getSynthesisPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    shots: '生成镜头视频',
    audio: '合成音频',
    merge: '合并视频片段',
    final: '最终合成',
    complete: '完成'
  }
  return labels[phase] || phase
}

// 监听项目ID变化
watch(projectId, () => {
  loadProject()
}, { immediate: true })

// 设置默认剧集序号
watch(() => store.episodes.length, (length) => {
  episodeForm.episodeNumber = length + 1
})
</script>

<style scoped lang="scss">
.video-project-editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .project-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }
}

.editor-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel,
.right-panel {
  width: 280px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
}

.right-panel {
  border-right: none;
  border-left: 1px solid var(--el-border-color-light);
}

.center-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-light);

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
}

.episode-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.episode-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  padding-right: 40px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;

  &:hover {
    background: var(--el-fill-color-light);

    .episode-actions {
      opacity: 1;
    }
  }

  &.active {
    background: var(--el-color-primary-light-9);
  }

  .episode-number {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .episode-title {
    font-size: 14px;
    font-weight: 500;
  }

  .episode-status {
    margin-top: 4px;
  }

  .episode-actions {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    transition: opacity 0.2s;
  }
}

.editor-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 16px;
    background: var(--el-bg-color);
  }

  :deep(.el-tabs__content) {
    flex: 1;
    overflow: auto;
    padding: 16px;
  }
}

.script-editor {
  .script-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
    }
  }

  .scene-section {
    margin-top: 24px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
      }
    }
  }
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .scene-number {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .scene-location {
    font-size: 14px;
    font-weight: 500;
  }

  .scene-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.storyboard-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.storyboard-item {
  padding: 12px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  gap: 12px;

  &.has-image {
    flex-direction: column;

    .storyboard-preview {
      width: 100%;
      aspect-ratio: 16/9;
    }
  }

  .storyboard-preview {
    width: 80px;
    height: 45px;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;

    &.placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--el-fill-color);
      color: var(--el-text-color-placeholder);
      font-size: 10px;
      gap: 2px;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .storyboard-info {
    flex: 1;
    min-width: 0;
  }

  .storyboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .shot-number {
      font-size: 12px;
      font-weight: 500;
    }
  }

  .storyboard-description {
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.5;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .storyboard-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    flex-wrap: wrap;
  }
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.generate-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.synthesis-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .progress-text {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.character-bindings {
  .bindings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
    }
  }
}

.bindings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.binding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;

  .binding-character {
    font-weight: 500;
  }

  .binding-actions {
    display: flex;
    gap: 4px;
  }
}
</style>