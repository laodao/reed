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
      <div class="header-center">
        <!-- 模型选择（按提供商分组显示） -->
        <el-select
          v-model="selectedModelKey"
          size="small"
          placeholder="选择模型"
          class="model-select"
          filterable
          :filter-method="filterModels"
          @change="handleModelChange"
        >
          <el-option-group
            v-for="provider in filteredProviderModels"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="`${provider.shortId}/${model.name}`"
              :value="`${provider.id}:${model.id}`"
            >
              <div class="model-option">
                <span class="model-name">{{ provider.shortId }}/{{ model.name }}</span>
                <span class="model-context">{{ formatContext(model.contextWindow) }}</span>
              </div>
            </el-option>
          </el-option-group>
        </el-select>
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
          <el-button type="primary" size="small" @click="openCreateEpisodeDialog">
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
                  <el-button
                    size="small"
                    :loading="store.generating"
                    :disabled="store.generating"
                    @click="generateScript"
                  >
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
                    <el-button
                    size="small"
                    :loading="store.generating"
                    :disabled="store.generating"
                    @click="generateScenes"
                  >
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
              <el-button
                size="small"
                :loading="store.generating"
                :disabled="store.generating"
                @click="generateStoryboards"
              >
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
      width="600px"
    >
      <el-form :model="episodeForm" label-width="80px">
        <el-form-item label="剧集序号">
          <el-input-number v-model="episodeForm.episodeNumber" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="剧集标题">
          <el-input v-model="episodeForm.title" placeholder="选择章节后自动生成，或手动输入" />
        </el-form-item>
        <el-form-item label="关联章节">
          <el-cascader
            v-model="episodeForm.outlineId"
            :options="outlineCascaderData"
            :props="outlineCascaderProps"
            placeholder="请选择章节（卷/章/节）"
            filterable
            clearable
            style="width: 100%"
            @change="handleOutlineCascaderChange"
          />
          <div class="outline-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>选择"节"级别的章节创建剧集</span>
          </div>
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
import { ref, reactive, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Setting, Plus, MagicStick, Picture, VideoPlay, Delete, InfoFilled } from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import type { VideoEpisode, VideoProject, SceneScript, CharacterBinding } from '../../../shared/types/story-to-video.types'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'

const route = useRoute()
const router = useRouter()
const store = useStoryToVideoStore()

// 项目ID
const projectId = computed(() => route.params.projectId as string)

// 当前标签页
const activeTab = ref('script')

// 剧本概要
const scriptSynopsis = ref('')

// 章节列表（用于关联剧集）- 原始数据
const chapters = ref<Array<{ id: string; order: number; title: string }>>([])

// 大纲树形数据
interface OutlineTreeNode {
  id: string
  name: string
  nodeType: 'volume' | 'chapter' | 'section'
  orderIndex: number
  children?: OutlineTreeNode[]
  // 用于生成标题的路径信息（使用位置序号）
  volumeOrder?: number // 卷的位置序号（从1开始）
  volumeName?: string
  volumePosition?: number // 卷的位置序号
  chapterOrder?: number // 章节的位置序号（从1开始）
  chapterName?: string
  chapterPosition?: number // 章节的位置序号
  sectionPosition?: number // 节的位置序号
}

const outlineTreeRef = ref<any>(null)
const outlineSearchText = ref('')
const outlineTreeData = ref<OutlineTreeNode[]>([])
const outlineTreeProps = {
  children: 'children',
  label: 'name'
}

// 级联选择器配置
const outlineCascaderProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  checkStrictly: false, // 只能选择最后一级
  emitPath: false // 只返回最后选中的值
}

// 级联选择器数据（只包含节级别的选项）
const outlineCascaderData = computed(() => {
  // 转换树数据为级联选择器格式
  return outlineTreeData.value.map(volume => ({
    id: volume.id,
    name: volume.name,
    nodeType: volume.nodeType,
    children: volume.children?.map(chapter => ({
      id: chapter.id,
      name: chapter.name,
      nodeType: chapter.nodeType,
      // 只保留节级别的children
      children: chapter.children?.filter(section => section.nodeType === 'section')
        .map(section => ({
          id: section.id,
          name: section.name,
          nodeType: section.nodeType,
          // 保存路径信息用于生成标题
          volumeOrder: section.volumeOrder,
          volumeName: section.volumeName,
          chapterOrder: section.chapterOrder,
          chapterName: section.chapterName,
          sectionPosition: section.sectionPosition
        }))
    }))
  }))
})

// 选中的节点的完整路径信息
const selectedOutlineInfo = ref<{
  id: string
  volumeOrder: number
  volumeName: string
  chapterOrder: number
  chapterName: string
  sectionOrder: number
  sectionName: string
} | null>(null)

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

// ========== 模型选择相关 ==========
// 提供商配置列表
const providerConfigs = ref<UserProviderConfig[]>([])
// 提供商模板列表
const providerTemplates = ref<ProviderTemplate[]>([])
// 选中的模型键：格式为 "providerConfigId:modelId"
const selectedModelKey = ref<string>('')
// 模型搜索关键词
const modelSearchKeyword = ref('')

// 辅助函数：判断模型是否为文本类型
function isTextModel(type: string | undefined): boolean {
  return type === undefined || type === 'text' || type === 'multimodal'
}

// 提供商模型列表（用于显示）
const providerModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{ id: string; name: string; contextWindow: number; type?: string }> = []
    const template = providerTemplates.value.find(t => t.id === config.templateId)

    // 使用 models 字段
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          type: model.type
        })
      }
    }
    // 如果 models 为空，使用模板的默认模型列表
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 8192,
          type: model.type
        })
      }
    }

    if (models.length > 0) {
      const displayShortId = config.shortId || config.name
      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  return result
})

// 过滤后的模型列表
const filteredProviderModels = computed(() => {
  if (!modelSearchKeyword.value) {
    return providerModels.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

  for (const provider of providerModels.value) {
    const filteredModels = provider.models.filter(model =>
      model.name.toLowerCase().includes(keyword) ||
      model.id.toLowerCase().includes(keyword) ||
      provider.name.toLowerCase().includes(keyword) ||
      provider.shortId.toLowerCase().includes(keyword)
    )

    if (filteredModels.length > 0) {
      result.push({
        ...provider,
        models: filteredModels
      })
    }
  }

  return result
})

// 模型搜索过滤方法
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

// 格式化上下文窗口大小
function formatContext(contextWindow: number): string {
  if (contextWindow >= 1000000) {
    return `${(contextWindow / 1000000).toFixed(1)}M`
  }
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}K`
  }
  return `${contextWindow}`
}

// 加载提供商配置
async function loadProviderConfigs(): Promise<void> {
  try {
    // 先加载提供商模板
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }

    // 然后加载提供商配置
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)

      // 设置默认模型
      if (!selectedModelKey.value && providerModels.value.length > 0) {
        const firstProvider = providerModels.value[0]
        const firstModel = firstProvider.models[0]
        selectedModelKey.value = `${firstProvider.id}:${firstModel.id}`
        // 同时更新 store
        store.updateSelectedModel(firstProvider.id, firstModel.id)
      }
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// 处理模型变更
function handleModelChange(modelKey: string): void {
  if (!modelKey) return

  const parts = modelKey.split(':')
  if (parts.length < 2) return

  const providerConfigId = parts[0]
  const modelId = parts.slice(1).join(':')

  // 更新到 store
  store.updateSelectedModel(providerConfigId, modelId)
}

// ========== 模型选择相关结束 ==========

// 计算属性：检查是否所有分镜都有图片
const hasAllImages = computed(() => {
  return store.storyboards.length > 0 && store.storyboards.every(sb => sb.frameImage)
})

/**
 * 加载项目数据
 */
async function loadProject() {
  // 加载提供商配置（用于模型选择）
  await loadProviderConfigs()

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

    // 如果只有一个剧集，自动选中
    if (store.episodes.length === 1) {
      console.log('[VideoProjectEditor] 自动选中唯一的剧集')
      await selectEpisode(store.episodes[0])
    }
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
      // 保存原始数据
      chapters.value = outlineResponse.data.map((o: any) => ({
        id: o.id,
        order: o.orderIndex,
        title: o.name
      }))

      // 构建树形结构
      buildOutlineTree(outlineResponse.data)
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
 * 构建大纲树形结构
 * 使用位置序号（从1开始）而非数据库 orderIndex
 */
function buildOutlineTree(outlines: any[]) {
  // 按层级和排序分组，使用 orderIndex 排序
  const volumes: any[] = outlines.filter(o => o.nodeType === 'volume').sort((a, b) => a.orderIndex - b.orderIndex)
  const chaptersData: any[] = outlines.filter(o => o.nodeType === 'chapter').sort((a, b) => a.orderIndex - b.orderIndex)
  const sections: any[] = outlines.filter(o => o.nodeType === 'section').sort((a, b) => a.orderIndex - b.orderIndex)

  // 构建树
  const tree: OutlineTreeNode[] = []

  // 使用位置序号（从1开始）
  let volumeNumber = 0
  for (const volume of volumes) {
    volumeNumber++
    const volumeNode: OutlineTreeNode = {
      id: volume.id,
      name: volume.name,
      nodeType: 'volume',
      orderIndex: volume.orderIndex,
      volumePosition: volumeNumber, // 位置序号
      children: []
    }

    // 找到该卷下的章节
    const volumeChapters = chaptersData.filter(c => c.parentId === volume.id)
    let chapterNumber = 0
    for (const chapter of volumeChapters) {
      chapterNumber++
      const chapterNode: OutlineTreeNode = {
        id: chapter.id,
        name: chapter.name,
        nodeType: 'chapter',
        orderIndex: chapter.orderIndex,
        volumeOrder: volumeNumber, // 使用卷的位置序号
        volumeName: volume.name,
        chapterPosition: chapterNumber, // 章节位置序号
        children: []
      }

      // 找到该章下的节
      const chapterSections = sections.filter(s => s.parentId === chapter.id)
      let sectionNumber = 0
      for (const section of chapterSections) {
        sectionNumber++
        const sectionNode: OutlineTreeNode = {
          id: section.id,
          name: section.name,
          nodeType: 'section',
          orderIndex: section.orderIndex,
          volumeOrder: volumeNumber, // 使用卷的位置序号
          volumeName: volume.name,
          chapterOrder: chapterNumber, // 使用章节的位置序号
          chapterName: chapter.name,
          sectionPosition: sectionNumber // 节的位置序号
        }
        chapterNode.children!.push(sectionNode)
      }

      volumeNode.children!.push(chapterNode)
    }

    tree.push(volumeNode)
  }

  // 处理没有卷的情况，直接是章节
  if (volumes.length === 0 && chaptersData.length > 0) {
    let chapterNumber = 0
    for (const chapter of chaptersData) {
      chapterNumber++
      const chapterNode: OutlineTreeNode = {
        id: chapter.id,
        name: chapter.name,
        nodeType: 'chapter',
        orderIndex: chapter.orderIndex,
        chapterPosition: chapterNumber,
        children: []
      }

      const chapterSections = sections.filter(s => s.parentId === chapter.id)
      let sectionNumber = 0
      for (const section of chapterSections) {
        sectionNumber++
        const sectionNode: OutlineTreeNode = {
          id: section.id,
          name: section.name,
          nodeType: 'section',
          orderIndex: section.orderIndex,
          chapterOrder: chapterNumber,
          chapterName: chapter.name,
          sectionPosition: sectionNumber
        }
        chapterNode.children!.push(sectionNode)
      }

      tree.push(chapterNode)
    }
  }

  outlineTreeData.value = tree
}

/**
 * 过滤大纲节点
 */
function filterOutlineNode(value: string, data: OutlineTreeNode): boolean {
  if (!value) return true
  return data.name.toLowerCase().includes(value.toLowerCase())
}

/**
 * 处理大纲节点选择
 */
function handleOutlineSelect(data: OutlineTreeNode) {
  // 只有节级别可以选中
  if (data.nodeType !== 'section') {
    ElMessage.warning('请选择"节"级别的章节')
    // 清除选择
    outlineTreeRef.value?.setCurrentKey(null)
    episodeForm.outlineId = ''
    selectedOutlineInfo.value = null
    return
  }

  episodeForm.outlineId = data.id

  // 使用位置序号保存选中的完整信息
  const volumeNum = data.volumeOrder || 0
  const chapterNum = data.chapterOrder || 0
  const sectionNum = data.sectionPosition || 1

  selectedOutlineInfo.value = {
    id: data.id,
    volumeOrder: volumeNum,
    volumeName: data.volumeName || '',
    chapterOrder: chapterNum,
    chapterName: data.chapterName || '',
    sectionOrder: sectionNum,
    sectionName: data.name
  }

  // 自动生成标题（使用位置序号）
  const parts: string[] = []
  if (volumeNum > 0) {
    parts.push(`第${volumeNum}卷`)
  }
  if (chapterNum > 0) {
    parts.push(`第${chapterNum}章`)
  }
  parts.push(`第${sectionNum}节`)
  parts.push(data.name)

  episodeForm.title = parts.join(' ')
}

/**
 * 处理级联选择器选择
 */
function handleOutlineCascaderChange(value: string) {
  if (!value) {
    episodeForm.outlineId = ''
    selectedOutlineInfo.value = null
    episodeForm.title = ''
    return
  }

  // 在树数据中查找选中的节点
  const findNode = (nodes: OutlineTreeNode[], id: string): OutlineTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNode(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  const selectedNode = findNode(outlineTreeData.value, value)
  if (!selectedNode || selectedNode.nodeType !== 'section') {
    ElMessage.warning('请选择"节"级别的章节')
    episodeForm.outlineId = ''
    return
  }

  episodeForm.outlineId = selectedNode.id

  // 使用位置序号保存选中的完整信息
  const volumeNum = selectedNode.volumeOrder || 0
  const chapterNum = selectedNode.chapterOrder || 0
  const sectionNum = selectedNode.sectionPosition || 1

  selectedOutlineInfo.value = {
    id: selectedNode.id,
    volumeOrder: volumeNum,
    volumeName: selectedNode.volumeName || '',
    chapterOrder: chapterNum,
    chapterName: selectedNode.chapterName || '',
    sectionOrder: sectionNum,
    sectionName: selectedNode.name
  }

  // 自动生成标题（使用位置序号）
  const parts: string[] = []
  if (volumeNum > 0) {
    parts.push(`第${volumeNum}卷`)
  }
  if (chapterNum > 0) {
    parts.push(`第${chapterNum}章`)
  }
  parts.push(`第${sectionNum}节`)
  parts.push(selectedNode.name)

  episodeForm.title = parts.join(' ')
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
 * 打开创建剧集对话框
 */
function openCreateEpisodeDialog() {
  // 重置表单
  episodeForm.episodeNumber = store.episodes.length + 1
  episodeForm.title = ''
  episodeForm.outlineId = ''
  selectedOutlineInfo.value = null
  outlineSearchText.value = ''
  // 清除树的选择
  outlineTreeRef.value?.setCurrentKey(null)
  showCreateEpisodeDialog.value = true
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
    selectedOutlineInfo.value = null
    outlineSearchText.value = ''
    outlineTreeRef.value?.setCurrentKey(null)
    // 选中新创建的剧集
    await selectEpisode(episode)

    // 自动绑定章节涉及的角色
    if (episodeForm.outlineId) {
      await autoBindCharactersFromOutline(episodeForm.outlineId)
    }
  } else {
    ElMessage.error(store.error || '创建失败')
  }
}

/**
 * 自动绑定章节涉及的角色到视频项目
 */
async function autoBindCharactersFromOutline(outlineId: string) {
  try {
    // 获取大纲节点信息
    const outlineResponse = await window.electronAPI.longwriting.getOutline(outlineId)
    if (!outlineResponse.success || !outlineResponse.data) return

    const outline = outlineResponse.data
    const involvedCharacterIds = outline.involvedCharacters || []

    if (involvedCharacterIds.length === 0) return

    // 绑定这些角色
    let boundCount = 0
    for (const charId of involvedCharacterIds) {
      // 检查是否已绑定
      const existingBinding = store.getBindingByCharacterId(charId)
      if (existingBinding) continue

      // 获取角色信息
      const charInfo = longWritingCharacters.value.find(c => c.id === charId)
      if (!charInfo) continue

      // 绑定角色
      const binding = await store.bindCharacter(
        projectId.value,
        charId,
        'female_gentle', // 默认声音
        1.0, // 默认语速
        '' // 描述
      )

      if (binding) {
        boundCount++
      }
    }

    if (boundCount > 0) {
      ElMessage.success(`已自动绑定 ${boundCount} 个角色`)
    }
  } catch (error) {
    console.error('自动绑定角色失败:', error)
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
  if (!store.currentProject) {
    ElMessage.warning('项目数据加载中，请稍候')
    return
  }

  if (!store.currentEpisode) {
    if (store.episodes.length === 0) {
      ElMessage.warning('请先在左侧面板添加剧集')
    } else {
      ElMessage.warning('请在左侧面板选择要生成剧本的剧集')
    }
    return
  }

  // 检查是否有关联的章节
  if (!store.currentEpisode.outlineId) {
    ElMessage.warning('该剧集未关联章节，无法生成剧本')
    return
  }

  // 检查是否选择了模型
  if (!store.selectedProviderConfigId || !store.selectedModelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  try {
    ElMessage.info('正在生成剧本，请稍候...')

    const result = await store.generateScript(
      store.currentProject.id,
      store.currentEpisode.outlineId,
      store.selectedProviderConfigId,
      store.selectedModelId
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

  // 检查是否选择了模型
  if (!store.selectedProviderConfigId || !store.selectedModelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  try {
    ElMessage.info('正在拆分场景，请稍候...')

    const result = await store.generateScenes(
      store.currentScript.id,
      store.selectedProviderConfigId,
      store.selectedModelId
    )

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

  // 检查是否选择了模型
  if (!store.selectedProviderConfigId || !store.selectedModelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
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

    const result = await store.generateStoryboards(
      store.currentScript.id,
      store.selectedProviderConfigId,
      store.selectedModelId
    )

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

// 监听搜索文本，过滤树
watch(outlineSearchText, (val) => {
  outlineTreeRef.value?.filter(val)
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

  .header-center {
    display: flex;
    align-items: center;
    gap: 8px;

    .model-select {
      width: 200px;

      :deep(.el-input__wrapper) {
        border-radius: 8px;
      }
    }

    .model-option {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;

      .model-name {
        font-size: 13px;
        color: #334155;
      }

      .model-context {
        font-size: 11px;
        color: #94a3b8;
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 4px;
      }
    }
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

.outline-tree-container {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px;
}

.outline-tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  .node-label {
    flex: 1;
  }
}

.outline-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>