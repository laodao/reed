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
              <el-select v-model="characterForm.rolePosition" placeholder="选择定位">
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
              <el-select v-model="characterForm.gender" placeholder="选择性别">
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="年龄">
              <el-input-number v-model="characterForm.age" :min="0" :max="999" controls-position="right" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="人像形象">
              <div class="portrait-field">
                <el-button @click="showPortraitLinkDialog = true">
                  <el-icon><Picture /></el-icon>
                  {{ characterForm.portraitId ? '更换形象' : '关联形象' }}
                </el-button>
                <el-image
                  v-if="characterForm.portraitId && getPortraitPreview(characterForm.portraitId)"
                  :src="getPortraitPreview(characterForm.portraitId)"
                  class="portrait-preview"
                  fit="cover"
                />
              </div>
            </el-form-item>
          </el-col>
        </el-row>

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
      width="500px"
    >
      <div class="portrait-list">
        <el-empty v-if="availablePortraits.length === 0" description="暂无人像形象">
          <el-button type="primary" @click="goToPortraitPage">创建人像形象</el-button>
        </el-empty>
        <div v-else class="portrait-grid">
          <div
            v-for="portrait in availablePortraits"
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
      </div>
      <template #footer>
        <el-button @click="showPortraitLinkDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedPortraitId" @click="confirmPortraitLink">
          确认关联
        </el-button>
      </template>
    </el-dialog>

    <!-- 角色关系对话框 -->
    <el-dialog
      v-model="showRelationDialog"
      title="角色关系管理"
      width="600px"
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, User, Connection, MagicStick, Picture, Close } from '@element-plus/icons-vue'
import type { StoryCharacter, CharacterRelation, CharacterRolePosition } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

const router = useRouter()

// 角色列表
const characters = ref<StoryCharacter[]>([])

// 人像列表（从人像设计模块获取）
const availablePortraits = ref<Array<{ id: string; name: string; preview?: string }>>([])

// 角色关系
const characterRelations = ref<CharacterRelation[]>([])
const currentCharacterId = ref<string>('')

// 对话框状态
const showCharacterDialog = ref(false)
const showPortraitLinkDialog = ref(false)
const showRelationDialog = ref(false)
const showAddRelationDialog = ref(false)

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
  generating.value = true
  generatingContent.value = ''

  // 生成唯一事件 ID
  currentEventId.value = `characters-${props.projectId}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        // 解析并显示建议
        parseAndShowSuggestions(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用 AI API，传递 eventId
  const result = await window.electronAPI.longwriting.generateCharacters(currentEventId.value, props.projectId)

  if (!result.success) {
    generating.value = false
    currentEventId.value = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 解析并显示建议
async function parseAndShowSuggestions(content: string) {
  try {
    // 尝试解析 JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    const suggestedCharacters: Partial<StoryCharacter>[] = JSON.parse(jsonMatch[0])

    if (!Array.isArray(suggestedCharacters) || suggestedCharacters.length === 0) {
      ElMessage.warning('AI 未生成角色建议')
      return
    }

    // 显示确认对话框
    ElMessageBox.confirm(
      `AI 建议添加以下角色：\n${suggestedCharacters.map(c => `- ${c.name}（${getRoleLabel(c.rolePosition!)}）`).join('\n')}`,
      'AI 生成建议',
      {
        confirmButtonText: '全部添加',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true,
        type: 'info'
      }
    ).then(async () => {
      for (const suggested of suggestedCharacters) {
        await window.electronAPI.longwriting.createCharacter({
          projectId: props.projectId,
          ...suggested
        })
      }
      await loadCharacters()
      updateProgress()
      ElMessage.success('角色已添加')
    }).catch(() => {})
  } catch (error) {
    console.error('解析 AI 响应失败:', error)
    ElMessage.error('解析 AI 响应失败')
  }
}

// 取消生成
function cancelGeneration() {
  if (!currentEventId.value) return
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
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

// 加载人像列表
async function loadPortraits() {
  try {
    // 获取所有人像项目
    const projectsResult = await window.electronAPI.portrait.listProjects(1, 100)
    if (!projectsResult.success || !projectsResult.projects?.length) {
      availablePortraits.value = []
      return
    }

    // 收集所有人像角色
    const allPortraits: Array<{ id: string; name: string; preview?: string; projectId: string }> = []

    for (const project of projectsResult.projects) {
      // 获取项目下的角色
      const charactersResult = await window.electronAPI.portrait.listCharacters(project.id)
      if (charactersResult.success && charactersResult.data?.length) {
        for (const character of charactersResult.data) {
          // 获取角色的变体（预览图）
          const variantsResult = await window.electronAPI.portrait.listVariants(character.id)
          // 优先使用正面基础形象作为预览
          const frontBaseVariant = variantsResult.data?.find(
            (v: any) => v.angle === 'front' && v.type === 'base'
          )
          // 如果没有正面基础形象，使用第一个变体
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
  } catch (error) {
    console.error('加载人像列表失败:', error)
    availablePortraits.value = []
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