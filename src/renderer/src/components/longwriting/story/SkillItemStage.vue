<template>
  <div class="skill-item-stage">
    <div class="stage-header">
      <h2>技能与物品设定</h2>
      <p class="stage-desc">设定故事中的技能体系和重要物品（可选阶段）</p>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 技能设定 -->
      <el-tab-pane label="技能设定" name="skills">
        <div class="skill-list">
          <div v-for="skill in skills" :key="skill.id" class="skill-card">
            <div class="skill-header">
              <h4>{{ skill.name }}</h4>
              <div class="skill-tags">
                <span class="type-tag">{{ getSkillTypeLabel(skill.type) }}</span>
                <span class="level-tag">{{ getSkillLevelLabel(skill.level) }}</span>
              </div>
            </div>
            <div class="skill-content">
              <p class="skill-desc">{{ skill.description || '暂无描述' }}</p>
              <div class="skill-meta">
                <span v-if="skill.system">所属体系：{{ skill.system }}</span>
              </div>
              <div class="skill-owners">
                <span class="owners-label">掌握角色：</span>
                <el-tag
                  v-for="charId in skill.characterIds"
                  :key="charId"
                  size="small"
                  class="owner-tag"
                >
                  {{ getCharacterName(charId) }}
                </el-tag>
                <span v-if="skill.characterIds.length === 0" class="no-owner">暂无</span>
              </div>
            </div>
            <div class="skill-actions">
              <el-button text @click="editSkill(skill)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button text type="danger" @click="deleteSkill(skill.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </div>
          </div>

          <el-button type="primary" plain class="add-btn" @click="showSkillDialog = true">
            <el-icon><Plus /></el-icon>
            添加技能
          </el-button>
        </div>
      </el-tab-pane>

      <!-- 物品设定 -->
      <el-tab-pane label="物品设定" name="items">
        <div class="item-list">
          <div v-for="item in items" :key="item.id" class="item-card">
            <div class="item-header">
              <h4>{{ item.name }}</h4>
              <div class="item-tags">
                <span class="type-tag">{{ getItemTypeLabel(item.type) }}</span>
                <span class="level-tag" :class="item.level">{{ getItemLevelLabel(item.level) }}</span>
              </div>
            </div>
            <div class="item-content">
              <p class="item-desc">{{ item.description || '暂无描述' }}</p>
              <div class="item-meta">
                <span v-if="item.ownerId">持有者：{{ getCharacterName(item.ownerId) }}</span>
                <span v-else>持有者：暂无</span>
              </div>
            </div>
            <div class="item-actions">
              <el-button text @click="editItem(item)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button text type="danger" @click="deleteItem(item.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </div>
          </div>

          <el-button type="primary" plain class="add-btn" @click="showItemDialog = true">
            <el-icon><Plus /></el-icon>
            添加物品
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 快速生成按钮 -->
    <div class="action-buttons">
      <el-button v-if="!generating" type="primary" size="large" @click="generateSkills">
        <el-icon><MagicStick /></el-icon>
        AI 生成技能体系
      </el-button>
      <el-button v-else type="danger" size="large" @click="cancelGeneration">
        <el-icon><Close /></el-icon>
        取消生成
      </el-button>
    </div>

    <!-- 生成进度 -->
    <div v-if="generating" class="generating-progress">
      <el-progress :percentage="100" :indeterminate="true" />
      <p class="progress-text">AI 正在生成技能和物品建议...</p>
    </div>

    <!-- 技能编辑对话框 -->
    <el-dialog
      v-model="showSkillDialog"
      :title="editingSkill ? '编辑技能' : '添加技能'"
      width="500px"
      destroy-on-close
    >
      <el-form :model="skillForm" label-width="80px">
        <el-form-item label="技能名称" required>
          <el-input v-model="skillForm.name" placeholder="输入技能名称" />
        </el-form-item>
        <el-form-item label="技能类型">
          <el-select v-model="skillForm.type" placeholder="选择技能类型">
            <el-option label="武功" value="martial" />
            <el-option label="法术" value="magic" />
            <el-option label="天赋能力" value="ability" />
            <el-option label="科技技能" value="tech" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="技能等级">
          <el-radio-group v-model="skillForm.level">
            <el-radio value="beginner">初级</el-radio>
            <el-radio value="intermediate">中级</el-radio>
            <el-radio value="advanced">高级</el-radio>
            <el-radio value="master">大师级</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="所属体系">
          <el-input v-model="skillForm.system" placeholder="门派/体系名称（可选）" />
        </el-form-item>
        <el-form-item label="技能描述">
          <el-input
            v-model="skillForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述技能的特点、效果..."
          />
        </el-form-item>
        <el-form-item label="掌握角色">
          <el-select
            v-model="skillForm.characterIds"
            multiple
            placeholder="选择掌握此技能的角色"
          >
            <el-option
              v-for="char in characters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSkillDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSkill">保存</el-button>
      </template>
    </el-dialog>

    <!-- 物品编辑对话框 -->
    <el-dialog
      v-model="showItemDialog"
      :title="editingItem ? '编辑物品' : '添加物品'"
      width="500px"
      destroy-on-close
    >
      <el-form :model="itemForm" label-width="80px">
        <el-form-item label="物品名称" required>
          <el-input v-model="itemForm.name" placeholder="输入物品名称" />
        </el-form-item>
        <el-form-item label="物品类型">
          <el-select v-model="itemForm.type" placeholder="选择物品类型">
            <el-option label="武器" value="weapon" />
            <el-option label="神器" value="artifact" />
            <el-option label="药品丹药" value="medicine" />
            <el-option label="秘籍" value="manual" />
            <el-option label="信物" value="token" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="物品等级">
          <el-radio-group v-model="itemForm.level">
            <el-radio value="common">普通</el-radio>
            <el-radio value="rare">稀有</el-radio>
            <el-radio value="legendary">传说</el-radio>
            <el-radio value="divine">神级</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="物品描述">
          <el-input
            v-model="itemForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述物品的外观、功能、来历..."
          />
        </el-form-item>
        <el-form-item label="持有者">
          <el-select v-model="itemForm.ownerId" placeholder="选择持有角色（可选）" clearable>
            <el-option
              v-for="char in characters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showItemDialog = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, MagicStick, Close } from '@element-plus/icons-vue'
import type { StorySkill, StoryItem, SkillType, SkillLevel, ItemType, ItemLevel, StoryCharacter } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件获取选中的模型（是一个 ComputedRef）
const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

const activeTab = ref('skills')

// 角色列表（用于关联选择）
const characters = ref<StoryCharacter[]>([])

// 技能列表
const skills = ref<StorySkill[]>([])

// 物品列表
const items = ref<StoryItem[]>([])

// 对话框状态
const showSkillDialog = ref(false)
const showItemDialog = ref(false)

// 编辑状态
const editingSkill = ref<StorySkill | null>(null)
const editingItem = ref<StoryItem | null>(null)

// 生成状态
const generating = ref(false)
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// AI 生成技能体系
async function generateSkills() {
  // 检查是否选择了模型（需要同时检查 providerId 和 modelId）
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  console.log('[SkillItemStage] 生成技能, providerId:', selectedModel.value.providerId, 'modelId:', selectedModel.value.modelId)

  generating.value = true
  generatingContent.value = ''

  // 生成唯一事件 ID
  currentEventId.value = `skills-${props.projectId}-${Date.now()}`

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
        // 解析 AI 响应
        parseSkillsItemsResult(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用 AI API，传递 eventId 和模型参数
  const result = await window.electronAPI.longwriting.generateSkillsItems(
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

// 解析 AI 响应
async function parseSkillsItemsResult(content: string) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }

    const data = JSON.parse(jsonMatch[0])
    const suggestedSkills: Partial<StorySkill>[] = data.skills || []
    const suggestedItems: Partial<StoryItem>[] = data.items || []

    if (suggestedSkills.length === 0 && suggestedItems.length === 0) {
      ElMessage.warning('AI 未生成技能或物品建议')
      return
    }

    // 显示确认对话框
    ElMessageBox.confirm(
      `AI 建议添加以下内容：\n\n技能：\n${suggestedSkills.map(s => `- ${s.name}（${getSkillTypeLabel(s.type!)}）`).join('\n') || '无'}\n\n物品：\n${suggestedItems.map(i => `- ${i.name}（${getItemTypeLabel(i.type!)}）`).join('\n') || '无'}`,
      'AI 生成建议',
      {
        confirmButtonText: '全部添加',
        cancelButtonText: '取消',
        type: 'info'
      }
    ).then(async () => {
      // 添加技能
      for (const suggested of suggestedSkills) {
        await window.electronAPI.longwriting.createSkill({
          projectId: props.projectId,
          ...suggested,
          characterIds: []
        })
      }

      // 添加物品
      for (const suggested of suggestedItems) {
        await window.electronAPI.longwriting.createItem({
          projectId: props.projectId,
          ...suggested
        })
      }

      await loadData()
      ElMessage.success('技能和物品已添加')
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

// 加载状态
const loading = ref(false)

// 技能表单
const skillForm = ref({
  name: '',
  type: 'martial' as SkillType,
  level: 'beginner' as SkillLevel,
  system: '',
  description: '',
  characterIds: [] as string[]
})

// 物品表单
const itemForm = ref({
  name: '',
  type: 'weapon' as ItemType,
  level: 'common' as ItemLevel,
  description: '',
  ownerId: ''
})

// 标签映射
function getSkillTypeLabel(type: SkillType): string {
  const labels: Record<SkillType, string> = {
    martial: '武功',
    magic: '法术',
    ability: '天赋',
    tech: '科技',
    other: '其他'
  }
  return labels[type] || type
}

function getSkillLevelLabel(level: SkillLevel): string {
  const labels: Record<SkillLevel, string> = {
    beginner: '初级',
    intermediate: '中级',
    advanced: '高级',
    master: '大师'
  }
  return labels[level] || level
}

function getItemTypeLabel(type: ItemType): string {
  const labels: Record<ItemType, string> = {
    weapon: '武器',
    artifact: '神器',
    medicine: '丹药',
    manual: '秘籍',
    token: '信物',
    other: '其他'
  }
  return labels[type] || type
}

function getItemLevelLabel(level: ItemLevel): string {
  const labels: Record<ItemLevel, string> = {
    common: '普通',
    rare: '稀有',
    legendary: '传说',
    divine: '神级'
  }
  return labels[level] || level
}

function getCharacterName(id: string): string {
  const char = characters.value.find(c => c.id === id)
  return char?.name || '未知角色'
}

// 编辑技能
function editSkill(skill: StorySkill) {
  editingSkill.value = skill
  skillForm.value = {
    name: skill.name,
    type: skill.type,
    level: skill.level,
    system: skill.system,
    description: skill.description,
    characterIds: skill.characterIds
  }
  showSkillDialog.value = true
}

// 删除技能
async function deleteSkill(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该技能吗？', '删除技能', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const result = await window.electronAPI.longwriting.deleteSkill(id)
    if (result.success) {
      await loadSkills()
      ElMessage.success('技能已删除')
      updateProgress()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 保存技能
async function saveSkill() {
  if (!skillForm.value.name) {
    ElMessage.warning('请输入技能名称')
    return
  }

  if (editingSkill.value) {
    const result = await window.electronAPI.longwriting.updateSkill(editingSkill.value.id, skillForm.value)
    if (result.success) {
      await loadSkills()
      ElMessage.success('技能已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    const result = await window.electronAPI.longwriting.createSkill({
      projectId: props.projectId,
      ...skillForm.value
    })
    if (result.success) {
      await loadSkills()
      ElMessage.success('技能已添加')
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  }

  showSkillDialog.value = false
  resetSkillForm()
  updateProgress()
}

function resetSkillForm() {
  editingSkill.value = null
  skillForm.value = {
    name: '',
    type: 'martial',
    level: 'beginner',
    system: '',
    description: '',
    characterIds: []
  }
}

// 编辑物品
function editItem(item: StoryItem) {
  editingItem.value = item
  itemForm.value = {
    name: item.name,
    type: item.type,
    level: item.level,
    description: item.description,
    ownerId: item.ownerId || ''
  }
  showItemDialog.value = true
}

// 删除物品
async function deleteItem(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该物品吗？', '删除物品', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const result = await window.electronAPI.longwriting.deleteItem(id)
    if (result.success) {
      await loadItems()
      ElMessage.success('物品已删除')
      updateProgress()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 保存物品
async function saveItem() {
  if (!itemForm.value.name) {
    ElMessage.warning('请输入物品名称')
    return
  }

  const itemData = {
    ...itemForm.value,
    ownerId: itemForm.value.ownerId || undefined
  }

  if (editingItem.value) {
    const result = await window.electronAPI.longwriting.updateItem(editingItem.value.id, itemData)
    if (result.success) {
      await loadItems()
      ElMessage.success('物品已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    const result = await window.electronAPI.longwriting.createItem({
      projectId: props.projectId,
      ...itemData
    })
    if (result.success) {
      await loadItems()
      ElMessage.success('物品已添加')
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  }

  showItemDialog.value = false
  resetItemForm()
  updateProgress()
}

function resetItemForm() {
  editingItem.value = null
  itemForm.value = {
    name: '',
    type: 'weapon',
    level: 'common',
    description: '',
    ownerId: ''
  }
}

// 更新进度
function updateProgress() {
  const total = skills.value.length + items.value.length
  const progress = Math.min(65, 55 + total * 2)
  emit('update:progress', progress)
}

// 加载角色列表（用于关联选择）
async function loadCharacters() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getCharacters(props.projectId)
  if (result.success) {
    characters.value = result.data || []
  }
}

// 加载技能列表
async function loadSkills() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getSkills(props.projectId)
  if (result.success) {
    skills.value = result.data || []
  }
}

// 加载物品列表
async function loadItems() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getItems(props.projectId)
  if (result.success) {
    items.value = result.data || []
  }
}

// 加载所有数据
async function loadData() {
  loading.value = true
  await Promise.all([
    loadCharacters(),
    loadSkills(),
    loadItems()
  ])
  loading.value = false
  updateProgress()
}

onMounted(() => {
  loadData()
})

// 监听 projectId 变化重新加载
watch(() => props.projectId, () => {
  loadData()
})
</script>

<style lang="scss" scoped>
.skill-item-stage {
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

.skill-list,
.item-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-card,
.item-card {
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

.skill-header,
.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  h4 {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin: 0;
  }

  .skill-tags,
  .item-tags {
    display: flex;
    gap: 8px;

    .type-tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--fill-color-light);
      color: var(--text-color-secondary);
    }

    .level-tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--color-primary-light-9);
      color: var(--color-primary);

      &.legendary {
        background: var(--color-warning-light-9);
        color: var(--color-warning);
      }

      &.divine {
        background: var(--color-danger-light-9);
        color: var(--color-danger);
      }
    }
  }
}

.skill-content,
.item-content {
  .skill-desc,
  .item-desc {
    font-size: 14px;
    color: var(--text-color-regular);
    margin: 0 0 8px 0;
    line-height: 1.5;
  }

  .skill-meta,
  .item-meta {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin-bottom: 8px;
  }
}

.skill-owners {
  display: flex;
  align-items: center;
  gap: 8px;

  .owners-label {
    font-size: 13px;
    color: var(--text-color-secondary);
  }

  .owner-tag {
    font-size: 12px;
  }

  .no-owner {
    font-size: 12px;
    color: var(--text-color-placeholder);
  }
}

.skill-actions,
.item-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.add-btn {
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
</style>