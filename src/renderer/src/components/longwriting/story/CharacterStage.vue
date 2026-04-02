<template>
  <div class="character-stage">
    <div class="stage-header">
      <h2>角色设定</h2>
      <p class="stage-desc">创建故事中的角色，设定他们的背景、性格和能力</p>
    </div>

    <div class="stage-content">
      <!-- 角色列表 -->
      <div class="character-list">
        <div v-for="character in characters" :key="character.id" class="character-card">
          <div class="character-avatar">
            <el-image
              v-if="character.portraitId && getPortraitPreview(character.portraitId)"
              :src="getPortraitPreview(character.portraitId)"
              fit="cover"
            >
              <template #error>
                <div class="avatar-placeholder">
                  <el-icon><User /></el-icon>
                </div>
              </template>
            </el-image>
            <div v-else class="avatar-placeholder">
              <el-icon><User /></el-icon>
            </div>
          </div>
          <div class="character-info">
            <h4>{{ character.name }}</h4>
            <div class="character-meta">
              <span class="role-tag">{{ getRoleLabel(character.rolePosition) }}</span>
              <span class="gender-tag">{{ getGenderLabel(character.gender) }}</span>
              <span class="age-tag">{{ character.age }}岁</span>
            </div>
            <p class="character-summary">{{ character.background || '暂无背景描述' }}</p>
          </div>
          <div class="character-actions">
            <el-button text @click="editCharacter(character)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button text @click="showRelationsDialog(character)">
              <el-icon><Connection /></el-icon>
              关系
            </el-button>
            <el-button text type="danger" @click="deleteCharacter(character.id)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
        </div>

        <!-- 添加角色按钮 -->
        <el-button type="primary" plain class="add-character-btn" @click="showCharacterDialog = true">
          <el-icon><Plus /></el-icon>
          添加角色
        </el-button>
      </div>

      <!-- 快速生成按钮 -->
      <div class="action-buttons">
        <el-button v-if="!generating" type="primary" size="large" @click="generateCharacters">
          <el-icon><MagicStick /></el-icon>
          AI 生成角色建议
        </el-button>
        <el-button v-else type="danger" size="large" @click="cancelGeneration">
          <el-icon><Close /></el-icon>
          取消生成
        </el-button>
      </div>

      <!-- 生成进度显示 -->
      <div v-if="generating" class="generating-progress">
        <el-progress :percentage="100" :indeterminate="true" />
        <p class="progress-text">AI 正在生成角色建议...</p>
      </div>
    </div>

    <!-- 角色编辑对话框 -->
    <el-dialog
      v-model="showCharacterDialog"
      :title="editingCharacter ? '编辑角色' : '添加角色'"
      width="750px"
      destroy-on-close
      :append-to-body="false"
      :modal-append-to-body="false"
      center
    >
      <el-form :model="characterForm" label-width="100px" class="character-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="角色名称" required>
              <el-input v-model="characterForm.name" placeholder="输入角色名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色定位">
              <el-select v-model="characterForm.rolePosition" placeholder="选择定位" style="width: 100%">
                <el-option label="主角" value="protagonist" />
                <el-option label="配角" value="supporting" />
                <el-option label="反派" value="antagonist" />
                <el-option label="次要角色" value="minor" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="性别">
              <el-select v-model="characterForm.gender" placeholder="选择性别" style="width: 100%">
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="年龄">
              <el-input-number v-model="characterForm.age" :min="0" :max="1000" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="人像形象">
              <el-button @click="openPortraitLinkDialog">
                <el-icon><Picture /></el-icon>
                {{ characterForm.portraitId ? '更换形象' : '关联形象' }}
              </el-button>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 已关联的人像预览 -->
        <el-form-item v-if="characterForm.portraitId" label="当前形象">
          <div class="current-portrait">
            <el-image
              v-if="getPortraitPreview(characterForm.portraitId)"
              :src="getPortraitPreview(characterForm.portraitId)"
              fit="cover"
              class="portrait-preview-large"
            >
              <template #error>
                <div class="portrait-placeholder">
                  <el-icon><Picture /></el-icon>
                </div>
              </template>
            </el-image>
            <span class="portrait-name">{{ getPortraitName(characterForm.portraitId) }}</span>
          </div>
        </el-form-item>

        <el-form-item label="外貌描述">
          <el-input
            v-model="characterForm.appearance"
            type="textarea"
            :rows="2"
            placeholder="描述角色的外貌特征..."
          />
        </el-form-item>

        <el-form-item label="背景故事">
          <el-input
            v-model="characterForm.background"
            type="textarea"
            :rows="3"
            placeholder="角色的背景故事、出身经历..."
          />
        </el-form-item>

        <el-form-item label="性格特点">
          <el-input
            v-model="characterForm.personality"
            type="textarea"
            :rows="2"
            placeholder="角色的性格特点、行事风格..."
          />
        </el-form-item>

        <el-form-item label="能力特长">
          <el-input
            v-model="characterForm.abilities"
            type="textarea"
            :rows="2"
            placeholder="角色的能力、特长、技能..."
          />
        </el-form-item>

        <el-form-item label="主要事件">
          <el-input
            v-model="characterForm.majorEvents"
            type="textarea"
            :rows="2"
            placeholder="角色在故事中的主要事件..."
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCharacterDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCharacter">保存</el-button>
      </template>
    </el-dialog>

    <!-- 人像关联对话框 -->
    <el-dialog
      v-model="showPortraitLinkDialog"
      title="关联人像形象"
      width="700px"
      :append-to-body="false"
      :modal-append-to-body="false"
      center
    >
      <div class="portrait-selector">
        <!-- 第一步：选择项目 -->
        <div class="selector-step">
          <div class="step-header">
            <span class="step-number">1</span>
            <span class="step-title">选择人像项目</span>
          </div>
          <div class="step-content-with-action">
            <el-select
              v-model="selectedPortraitProjectId"
              placeholder="选择人像项目"
              style="flex: 1"
              @change="loadProjectCharacters"
            >
              <el-option
                v-for="project in portraitProjects"
                :key="project.id"
                :label="project.name"
                :value="project.id"
              />
            </el-select>
            <el-button type="primary" plain @click="showCreateProjectDialog = true">
              <el-icon><Plus /></el-icon>
              新建项目
            </el-button>
          </div>
        </div>

        <!-- 第二步：选择人物形象 -->
        <div class="selector-step" v-if="selectedPortraitProjectId">
          <div class="step-header">
            <span class="step-number">2</span>
            <span class="step-title">选择人物形象</span>
            <el-button type="primary" text size="small" @click="showCreateCharacterDialog = true">
              <el-icon><Plus /></el-icon>
              新建人物
            </el-button>
          </div>
          <div class="portrait-grid" v-if="projectCharacters.length > 0">
            <div
              v-for="portrait in projectCharacters"
              :key="portrait.id"
              class="portrait-item"
              :class="{ selected: selectedPortraitId === portrait.id }"
              @click="selectedPortraitId = portrait.id"
            >
              <el-image
                v-if="portrait.preview"
                :src="portrait.preview"
                fit="cover"
              >
                <template #error>
                  <div class="portrait-placeholder">
                    <el-icon><Picture /></el-icon>
                  </div>
                </template>
              </el-image>
              <div v-else class="portrait-placeholder">
                <el-icon><Picture /></el-icon>
              </div>
              <span class="portrait-name">{{ portrait.name }}</span>
            </div>
          </div>
          <el-empty v-else description="该项目暂无人物形象">
            <el-button type="primary" size="small" @click="showCreateCharacterDialog = true">创建人物形象</el-button>
          </el-empty>
        </div>

        <!-- 空状态：没有项目 -->
        <el-empty v-if="portraitProjects.length === 0" description="暂无人像项目">
          <el-button type="primary" @click="showCreateProjectDialog = true">创建人像项目</el-button>
        </el-empty>
      </div>
      <template #footer>
        <el-button @click="showPortraitLinkDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedPortraitId" @click="confirmPortraitLink">
          确认关联
        </el-button>
      </template>
    </el-dialog>

    <!-- 新建人像项目对话框 -->
    <el-dialog
      v-model="showCreateProjectDialog"
      title="新建人像项目"
      width="400px"
      destroy-on-close
      :append-to-body="false"
      :modal-append-to-body="false"
      center
    >
      <el-form :model="newProjectForm" label-width="80px">
        <el-form-item label="项目名称" required>
          <el-input v-model="newProjectForm.name" placeholder="输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="newProjectForm.description" type="textarea" :rows="2" placeholder="项目描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateProjectDialog = false">取消</el-button>
        <el-button type="primary" :loading="creatingProject" @click="createPortraitProject">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 新建人物形象对话框（复用人像设计模块的完整界面） -->
    <CreateCharacterDialog
      v-model="showCreateCharacterDialog"
      :project-id="selectedPortraitProjectId"
      @success="handleCreateCharacterSuccess"
    />

    <!-- 角色关系对话框 -->
    <el-dialog
      v-model="showRelationDialog"
      title="角色关系管理"
      width="600px"
      :append-to-body="false"
      :modal-append-to-body="false"
      center
    >
      <div class="relation-list">
        <div v-for="relation in characterRelations" :key="relation.id" class="relation-item">
          <span class="relation-character">{{ getCharacterName(relation.relatedCharacterId) }}</span>
          <span class="relation-type">{{ relation.relationType }}</span>
          <span class="relation-desc">{{ relation.relationDescription }}</span>
          <el-button text type="danger" size="small" @click="deleteRelation(relation.id)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-button type="primary" plain @click="showAddRelationDialog = true">
          <el-icon><Plus /></el-icon>
          添加关系
        </el-button>
      </div>
    </el-dialog>

    <!-- 添加关系对话框 -->
    <el-dialog
      v-model="showAddRelationDialog"
      title="添加角色关系"
      width="400px"
      :append-to-body="false"
      :modal-append-to-body="false"
      center
    >
      <el-form :model="relationForm" label-width="80px">
        <el-form-item label="关联角色">
          <el-select v-model="relationForm.relatedCharacterId" placeholder="选择角色">
            <el-option
              v-for="char in otherCharacters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="关系类型">
          <el-select v-model="relationForm.relationType" placeholder="选择关系类型" allow-create filterable>
            <el-option label="师徒" value="师徒" />
            <el-option label="父子" value="父子" />
            <el-option label="母女" value="母女" />
            <el-option label="兄弟" value="兄弟" />
            <el-option label="姐妹" value="姐妹" />
            <el-option label="恋人" value="恋人" />
            <el-option label="仇敌" value="仇敌" />
            <el-option label="朋友" value="朋友" />
            <el-option label="主仆" value="主仆" />
            <el-option label="同门" value="同门" />
          </el-select>
        </el-form-item>
        <el-form-item label="关系描述">
          <el-input
            v-model="relationForm.relationDescription"
            type="textarea"
            :rows="2"
            placeholder="描述关系详情..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddRelationDialog = false">取消</el-button>
        <el-button type="primary" @click="addRelation">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, User, Connection, MagicStick, Picture, Close } from '@element-plus/icons-vue'
import type { StoryCharacter, CharacterRelation, CharacterRolePosition } from '../../../../shared/types/longwriting.types'
import CreateCharacterDialog from '../../portrait/CreateCharacterDialog.vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

const router = useRouter()

// 从父组件获取选中的模型（是一个 ComputedRef）
const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

// 角色列表
const characters = ref<StoryCharacter[]>([])

// 人像项目列表和角色列表（从人像设计模块获取）
const portraitProjects = ref<Array<{ id: string; name: string }>>([])
const portraitCharacters = ref<Array<{ id: string; name: string; preview?: string; projectId: string }>>([])
const selectedPortraitProjectId = ref<string>('')

// 角色关系
const characterRelations = ref<CharacterRelation[]>([])
const currentCharacterId = ref<string>('')

// 对话框状态
const showCharacterDialog = ref(false)
const showPortraitLinkDialog = ref(false)
const showRelationDialog = ref(false)
const showAddRelationDialog = ref(false)
const showCreateProjectDialog = ref(false)
const showCreateCharacterDialog = ref(false)

// 新建人像项目表单
const newProjectForm = ref({
  name: '',
  description: ''
})
const creatingProject = ref(false)

// 编辑状态
const editingCharacter = ref<StoryCharacter | null>(null)
const selectedPortraitId = ref<string>('')

// 生成状态
const generating = ref(false)

// 表单数据
const characterForm = ref({
  name: '',
  gender: 'male' as 'male' | 'female' | 'other',
  age: 18,
  appearance: '',
  background: '',
  personality: '',
  abilities: '',
  rolePosition: 'supporting' as CharacterRolePosition,
  majorEvents: '',
  portraitId: ''
})

const relationForm = ref({
  relatedCharacterId: '',
  relationType: '',
  relationDescription: ''
})

// 计算属性：除当前角色外的其他角色
const otherCharacters = computed(() => {
  return characters.value.filter(c => c.id !== currentCharacterId.value)
})

// 标签映射
function getRoleLabel(role: CharacterRolePosition): string {
  const labels: Record<CharacterRolePosition, string> = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派',
    minor: '次要'
  }
  return labels[role] || role
}

function getGenderLabel(gender: string): string {
  const labels: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return labels[gender] || gender
}

// 获取人像预览图
function getPortraitPreview(portraitId: string): string | null {
  const portrait = availablePortraits.value.find(p => p.id === portraitId)
  return portrait?.preview || null
}

// 获取人像名称
function getPortraitName(portraitId: string): string {
  const portrait = availablePortraits.value.find(p => p.id === portraitId)
  return portrait?.name || '未知形象'
}

// 打开人像关联对话框
function openPortraitLinkDialog() {
  selectedPortraitId.value = characterForm.value.portraitId || ''
  showPortraitLinkDialog.value = true
}

// 获取角色名称
function getCharacterName(characterId: string): string {
  const character = characters.value.find(c => c.id === characterId)
  return character?.name || '未知角色'
}

// 加载角色列表
async function loadCharacters() {
  const result = await window.electronAPI.longwriting.getCharacters(props.projectId)
  if (result.success) {
    characters.value = result.data || []
  }
}

// 编辑角色
function editCharacter(character: StoryCharacter) {
  editingCharacter.value = character
  characterForm.value = {
    name: character.name,
    gender: character.gender,
    age: character.age,
    appearance: character.appearance,
    background: character.background,
    personality: character.personality,
    abilities: character.abilities,
    rolePosition: character.rolePosition,
    majorEvents: character.majorEvents,
    portraitId: character.portraitId || ''
  }
  showCharacterDialog.value = true
}

// 删除角色
function deleteCharacter(id: string) {
  ElMessageBox.confirm('确定要删除该角色吗？删除后无法恢复。', '删除角色', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const result = await window.electronAPI.longwriting.deleteCharacter(id)
    if (result.success) {
      await loadCharacters()
      ElMessage.success('角色已删除')
      updateProgress()
    }
  }).catch(() => {})
}

// 保存角色
async function saveCharacter() {
  if (!characterForm.value.name) {
    ElMessage.warning('请输入角色名称')
    return
  }

  if (editingCharacter.value) {
    // 更新现有角色
    const result = await window.electronAPI.longwriting.updateCharacter(editingCharacter.value.id, characterForm.value)
    if (result.success) {
      await loadCharacters()
      ElMessage.success('角色已更新')
    }
  } else {
    // 创建新角色
    const result = await window.electronAPI.longwriting.createCharacter({
      projectId: props.projectId,
      ...characterForm.value
    })
    if (result.success) {
      await loadCharacters()
      ElMessage.success('角色已添加')
    }
  }

  showCharacterDialog.value = false
  resetCharacterForm()
  updateProgress()
}

// 重置表单
function resetCharacterForm() {
  editingCharacter.value = null
  characterForm.value = {
    name: '',
    gender: 'male',
    age: 18,
    appearance: '',
    background: '',
    personality: '',
    abilities: '',
    rolePosition: 'supporting',
    majorEvents: '',
    portraitId: ''
  }
}

// 确认人像关联
function confirmPortraitLink() {
  if (selectedPortraitId.value) {
    characterForm.value.portraitId = selectedPortraitId.value
    showPortraitLinkDialog.value = false
    selectedPortraitId.value = ''
  }
}

// 显示关系对话框
async function showRelationsDialog(character: StoryCharacter) {
  currentCharacterId.value = character.id
  const result = await window.electronAPI.longwriting.getCharacterRelations(character.id)
  if (result.success) {
    characterRelations.value = result.data || []
  }
  showRelationDialog.value = true
}

// 添加关系
async function addRelation() {
  if (!relationForm.value.relatedCharacterId || !relationForm.value.relationType) {
    ElMessage.warning('请选择关联角色和关系类型')
    return
  }

  const result = await window.electronAPI.longwriting.createCharacterRelation({
    characterId: currentCharacterId.value,
    relatedCharacterId: relationForm.value.relatedCharacterId,
    relationType: relationForm.value.relationType,
    relationDescription: relationForm.value.relationDescription
  })

  if (result.success) {
    await showRelationsDialog(characters.value.find(c => c.id === currentCharacterId.value)!)
    showAddRelationDialog.value = false
    relationForm.value = {
      relatedCharacterId: '',
      relationType: '',
      relationDescription: ''
    }
    ElMessage.success('关系已添加')
  }
}

// 删除关系
async function deleteRelation(id: string) {
  const result = await window.electronAPI.longwriting.deleteCharacterRelation(id)
  if (result.success) {
    await showRelationsDialog(characters.value.find(c => c.id === currentCharacterId.value)!)
    ElMessage.success('关系已删除')
  }
}

// 当前生成事件 ID
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// AI 生成角色建议
async function generateCharacters() {
  // 检查是否选择了模型（需要同时检查 providerId 和 modelId）
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  console.log('[CharacterStage] 生成角色, providerId:', selectedModel.value.providerId, 'modelId:', selectedModel.value.modelId)

  generating.value = true
  generatingContent.value = ''

  // 生成唯一事件 ID
  currentEventId.value = `characters-${props.projectId}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      console.log('[CharacterStage] 收到事件:', event.type, event.content?.substring(0, 100))

      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()

        // 优先使用 done 事件中的完整内容
        const finalContent = event.content || generatingContent.value
        console.log('[CharacterStage] 生成完成, 累积内容长度:', generatingContent.value.length, 'done内容长度:', event.content?.length || 0)

        if (!finalContent || finalContent.length === 0) {
          ElMessage.error('AI 未返回任何内容')
          return
        }

        // 提示用户正在解析
        ElMessage.info('正在解析 AI 响应...')

        // 解析并显示建议
        parseAndShowSuggestions(finalContent)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用 AI API，传递 eventId 和模型参数
  const result = await window.electronAPI.longwriting.generateCharacters(
    currentEventId.value,
    props.projectId,
    selectedModel.value.providerId,
    selectedModel.value.modelId
  )

  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 解析并显示建议
async function parseAndShowSuggestions(content: string) {
  console.log('[CharacterStage] 解析 AI 响应, 内容长度:', content.length)
  console.log('[CharacterStage] AI 响应内容:', content.substring(0, 1000))

  try {
    // 尝试解析 JSON
    let jsonStr = content

    // 尝试移除可能的 markdown 代码块标记
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '')
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```\s*/g, '')
    }

    // 尝试找到 JSON 数组
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[CharacterStage] 未找到 JSON 数组, 内容:', content)
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    console.log('[CharacterStage] 匹配到的 JSON:', jsonMatch[0].substring(0, 500))

    // 清理 JSON 字符串中的控制字符
    let cleanJson = jsonMatch[0]
      .replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
      .replace(/\n/g, ' ') // 将换行替换为空格

    const suggestedCharacters: Partial<StoryCharacter>[] = JSON.parse(cleanJson)
    console.log('[CharacterStage] 解析到的角色数量:', suggestedCharacters.length)

    if (!Array.isArray(suggestedCharacters) || suggestedCharacters.length === 0) {
      ElMessage.warning('AI 未生成角色建议')
      return
    }

    // 显示确认对话框
    const roleList = suggestedCharacters.map(c => `- ${c.name || '未命名'}（${getRoleLabel(c.rolePosition || 'supporting')}）`).join('\n')
    console.log('[CharacterStage] 角色列表:', roleList)

    // 清除之前的消息
    ElMessage.closeAll()

    ElMessageBox.confirm(
      `AI 建议添加以下 ${suggestedCharacters.length} 个角色：\n\n${roleList}`,
      'AI 生成建议',
      {
        confirmButtonText: '全部添加',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true,
        type: 'info'
      }
    ).then(async () => {
      console.log('[CharacterStage] 用户确认添加角色')
      ElMessage.info('正在添加角色...')

      let successCount = 0
      let failCount = 0

      for (const suggested of suggestedCharacters) {
        console.log('[CharacterStage] 创建角色:', suggested.name)
        try {
          const result = await window.electronAPI.longwriting.createCharacter({
            projectId: props.projectId,
            name: suggested.name || '未命名角色',
            gender: suggested.gender || 'other',
            age: suggested.age || 18,
            rolePosition: suggested.rolePosition || 'supporting',
            appearance: suggested.appearance || '',
            background: suggested.background || '',
            personality: suggested.personality || '',
            abilities: suggested.abilities || ''
          })
          console.log('[CharacterStage] 创建角色结果:', result)
          if (result.success) {
            successCount++
          } else {
            failCount++
            console.error('[CharacterStage] 创建角色失败:', result.error)
          }
        } catch (err) {
          failCount++
          console.error('[CharacterStage] 创建角色异常:', err)
        }
      }

      await loadCharacters()
      updateProgress()

      if (failCount === 0) {
        ElMessage.success(`已成功添加 ${successCount} 个角色`)
      } else if (successCount > 0) {
        ElMessage.warning(`添加完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      } else {
        ElMessage.error('添加角色失败')
      }
    }).catch((err) => {
      console.log('[CharacterStage] 用户取消或关闭对话框:', err)
      ElMessage.info('已取消添加角色')
    })
  } catch (error) {
    console.error('[CharacterStage] 解析 AI 响应失败:', error)
    ElMessage.error('解析 AI 响应失败: ' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// 取消生成
function cancelGeneration() {
  if (!currentEventId.value) return
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

// 创建人像项目
async function createPortraitProject() {
  if (!newProjectForm.value.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }

  creatingProject.value = true
  try {
    const result = await window.electronAPI.portrait.createProject({
      name: newProjectForm.value.name,
      description: newProjectForm.value.description
    })

    if (result.success && result.data) {
      ElMessage.success('项目创建成功')
      showCreateProjectDialog.value = false
      newProjectForm.value = { name: '', description: '' }

      // 刷新项目列表并选中新项目
      await loadPortraits()
      selectedPortraitProjectId.value = result.data.id
      await loadProjectCharacters()
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } catch (error) {
    console.error('创建人像项目失败:', error)
    ElMessage.error('创建失败')
  } finally {
    creatingProject.value = false
  }
}

// 创建人物形象成功后的处理
function handleCreateCharacterSuccess(characterId: string) {
  showCreateCharacterDialog.value = false
  // 刷新人物列表并选中新人物
  loadProjectCharacters()
  selectedPortraitId.value = characterId
}

// 跳转到人像设计页面
function goToPortraitPage() {
  router.push('/portrait')
}

// 更新进度
function updateProgress() {
  const progress = Math.min(55, 30 + characters.value.length * 5)
  emit('update:progress', progress)
}

// 加载人像项目列表
async function loadPortraits() {
  try {
    // 获取所有人像项目
    const projectsResult = await window.electronAPI.portrait.listProjects(1, 100)
    console.log('[CharacterStage] 人像项目列表结果:', projectsResult)

    // API 返回格式: { success: true, data: { projects: [], total } }
    const projects = projectsResult.data?.projects || []
    portraitProjects.value = projects.map((p: any) => ({ id: p.id, name: p.name }))

    // 同时加载所有角色用于已关联形象显示
    await loadAllPortraits(projects)
  } catch (error) {
    console.error('加载人像项目失败:', error)
    portraitProjects.value = []
  }
}

// 加载所有人物形象（用于已关联形象显示）
const availablePortraits = ref<Array<{ id: string; name: string; preview?: string }>>([])

async function loadAllPortraits(projects: any[]) {
  const allPortraits: Array<{ id: string; name: string; preview?: string; projectId: string }> = []

  for (const project of projects) {
    const charactersResult = await window.electronAPI.portrait.listCharacters(project.id)
    const chars = charactersResult.data || []
    if (charactersResult.success && chars.length) {
      for (const character of chars) {
        const variantsResult = await window.electronAPI.portrait.listVariants(character.id)
        const frontBaseVariant = variantsResult.data?.find(
          (v: any) => v.angle === 'front' && v.type === 'base'
        )
        const previewVariant = frontBaseVariant || variantsResult.data?.[0]

        allPortraits.push({
          id: character.id,
          name: character.name,
          preview: previewVariant?.imagePath,
          projectId: project.id
        })
      }
    }
  }

  availablePortraits.value = allPortraits
  console.log('[CharacterStage] 加载的所有人像:', allPortraits)
}

// 当前选中项目的人物形象列表
const projectCharacters = ref<Array<{ id: string; name: string; preview?: string }>>([])

// 加载项目下的人物形象
async function loadProjectCharacters() {
  selectedPortraitId.value = ''
  projectCharacters.value = []

  if (!selectedPortraitProjectId.value) return

  try {
    const charactersResult = await window.electronAPI.portrait.listCharacters(selectedPortraitProjectId.value)
    const chars = charactersResult.data || []

    if (charactersResult.success && chars.length) {
      for (const character of chars) {
        const variantsResult = await window.electronAPI.portrait.listVariants(character.id)
        const frontBaseVariant = variantsResult.data?.find(
          (v: any) => v.angle === 'front' && v.type === 'base'
        )
        const previewVariant = frontBaseVariant || variantsResult.data?.[0]

        projectCharacters.value.push({
          id: character.id,
          name: character.name,
          preview: previewVariant?.imagePath
        })
      }
    }

    console.log('[CharacterStage] 项目人物形象:', projectCharacters.value)
  } catch (error) {
    console.error('加载项目人物形象失败:', error)
  }
}

onMounted(() => {
  loadCharacters()
  loadPortraits()
})
</script>

<style lang="scss" scoped>
.character-stage {
  max-width: 900px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.stage-header {
  margin-bottom: 24px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 8px 0;
  }

  .stage-desc {
    font-size: 14px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.stage-content {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.character-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: var(--fill-color-blank);
  border-radius: 8px;
  border: 1px solid var(--border-color-lighter);
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
}

.character-avatar {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--fill-color-light);

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color-secondary);
  }
}

.character-info {
  flex: 1;
  min-width: 0;

  h4 {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin: 0 0 8px 0;
  }

  .character-meta {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;

    span {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--fill-color-light);
      color: var(--text-color-secondary);
    }

    .role-tag {
      background: var(--color-primary-light-9);
      color: var(--color-primary);
    }
  }

  .character-summary {
    font-size: 14px;
    color: var(--text-color-regular);
    margin: 0;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

.character-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.add-character-btn {
  width: 100%;
  height: 48px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.generating-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--fill-color-lighter);
  border-radius: 8px;

  .progress-text {
    margin-top: 8px;
    font-size: 14px;
    color: var(--text-color-secondary);
    text-align: center;
  }
}

.character-form {
  .portrait-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .portrait-preview {
    width: 60px;
    height: 60px;
    border-radius: 4px;
  }
}

.current-portrait {
  display: flex;
  align-items: center;
  gap: 12px;

  .portrait-preview-large {
    width: 80px;
    height: 80px;
    border-radius: 8px;
  }

  .portrait-name {
    font-size: 14px;
    color: var(--text-color-regular);
  }
}

.portrait-selector {
  .selector-step {
    margin-bottom: 20px;

    .step-content-with-action {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;

      // 让标题和按钮分布在两端
      &:has(.el-button) {
        justify-content: space-between;

        .step-number, .step-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .step-number {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--color-primary);
        color: white;
        font-size: 12px;
        font-weight: 500;
      }

      .step-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-color-primary);
      }
    }
  }

  .portrait-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-top: 12px;
  }

  .portrait-item {
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    border: 2px solid var(--border-color-lighter);
    transition: all 0.2s;

    &:hover {
      border-color: var(--color-primary-light-5);
    }

    &.selected {
      border-color: var(--color-primary);
      background: var(--color-primary-light-9);
    }

    .el-image {
      width: 100%;
      height: 80px;
      border-radius: 4px;
    }

    .portrait-placeholder {
      width: 100%;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--fill-color-light);
      border-radius: 4px;
      color: var(--text-color-secondary);
    }

    .portrait-name {
      display: block;
      text-align: center;
      font-size: 12px;
      color: var(--text-color-regular);
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.portrait-list {
  .portrait-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .portrait-item {
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    border: 2px solid var(--border-color-lighter);
    transition: all 0.2s;

    &:hover {
      border-color: var(--color-primary-light-5);
    }

    &.selected {
      border-color: var(--color-primary);
      background: var(--color-primary-light-9);
    }

    .el-image {
      width: 100%;
      height: 80px;
      border-radius: 4px;
    }

    .portrait-placeholder {
      width: 100%;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--fill-color-light);
      border-radius: 4px;
      color: var(--text-color-secondary);
    }

    .portrait-name {
      display: block;
      text-align: center;
      font-size: 12px;
      color: var(--text-color-regular);
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--fill-color-blank);
  border-radius: 6px;
  border: 1px solid var(--border-color-lighter);

  .relation-character {
    font-weight: 500;
    color: var(--text-color-primary);
  }

  .relation-type {
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--color-primary-light-9);
    color: var(--color-primary);
    font-size: 12px;
  }

  .relation-desc {
    flex: 1;
    font-size: 14px;
    color: var(--text-color-regular);
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>