<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="项目设定"
    width="800px"
    top="5vh"
    destroy-on-close
  >
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

    <!-- 技能编辑对话框 -->
    <el-dialog
      v-model="showSkillDialog"
      :title="editingSkill ? '编辑技能' : '添加技能'"
      width="500px"
      destroy-on-close
      append-to-body
    >
      <el-form :model="skillForm" label-width="80px">
        <el-form-item label="技能名称" required>
          <el-input v-model="skillForm.name" placeholder="输入技能名称" />
        </el-form-item>
        <el-form-item label="技能类型">
          <el-select v-model="skillForm.type" placeholder="选择技能类型">
            <el-option
              v-for="opt in skillTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="技能等级">
          <el-radio-group v-model="skillForm.level">
            <el-radio
              v-for="opt in skillLevelOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio>
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
      append-to-body
    >
      <el-form :model="itemForm" label-width="80px">
        <el-form-item label="物品名称" required>
          <el-input v-model="itemForm.name" placeholder="输入物品名称" />
        </el-form-item>
        <el-form-item label="物品类型">
          <el-select v-model="itemForm.type" placeholder="选择物品类型">
            <el-option
              v-for="opt in itemTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="物品等级">
          <el-radio-group v-model="itemForm.level">
            <el-radio
              v-for="opt in itemLevelOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio>
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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import type { StorySkill, StoryItem, StoryCharacter, DictionaryItem } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  visible: boolean
  projectId: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const activeTab = ref('skills')

// 角色列表
const characters = ref<StoryCharacter[]>([])

// 技能列表
const skills = ref<StorySkill[]>([])

// 物品列表
const items = ref<StoryItem[]>([])

// 字典数据
const dictionary = ref<Record<string, DictionaryItem[]>>({})

// 对话框状态
const showSkillDialog = ref(false)
const showItemDialog = ref(false)

// 编辑状态
const editingSkill = ref<StorySkill | null>(null)
const editingItem = ref<StoryItem | null>(null)

// 技能表单
const skillForm = ref({
  name: '',
  type: 'martial' as string,
  level: 'beginner' as string,
  system: '',
  description: '',
  characterIds: [] as string[]
})

// 物品表单
const itemForm = ref({
  name: '',
  type: 'weapon' as string,
  level: 'common' as string,
  description: '',
  ownerId: ''
})

// 标签映射（从字典加载）
const skillTypeOptions = computed(() => {
  if (!dictionary.value.skill_type?.length) {
    return [
      { label: '武功', value: 'martial' },
      { label: '法术', value: 'magic' },
      { label: '天赋', value: 'talent' },
      { label: '科技', value: 'tech' },
      { label: '其他', value: 'other' }
    ]
  }
  return dictionary.value.skill_type.map(item => ({ label: item.name, value: item.code }))
})

const skillLevelOptions = computed(() => {
  if (!dictionary.value.skill_level?.length) {
    return [
      { label: '初级', value: 'beginner' },
      { label: '中级', value: 'intermediate' },
      { label: '高级', value: 'advanced' },
      { label: '大师', value: 'master' }
    ]
  }
  return dictionary.value.skill_level.map(item => ({ label: item.name, value: item.code }))
})

const itemTypeOptions = computed(() => {
  if (!dictionary.value.item_type?.length) {
    return [
      { label: '武器', value: 'weapon' },
      { label: '神器', value: 'artifact' },
      { label: '丹药', value: 'medicine' },
      { label: '秘籍', value: 'manual' },
      { label: '信物', value: 'token' },
      { label: '其他', value: 'other' }
    ]
  }
  return dictionary.value.item_type.map(item => ({ label: item.name, value: item.code }))
})

const itemLevelOptions = computed(() => {
  if (!dictionary.value.item_level?.length) {
    return [
      { label: '普通', value: 'common' },
      { label: '稀有', value: 'rare' },
      { label: '传说', value: 'legendary' },
      { label: '神级', value: 'divine' }
    ]
  }
  return dictionary.value.item_level.map(item => ({ label: item.name, value: item.code }))
})

function getSkillTypeLabel(type: string): string {
  const opt = skillTypeOptions.value.find(o => o.value === type)
  return opt?.label || type
}

function getSkillLevelLabel(level: string): string {
  const opt = skillLevelOptions.value.find(o => o.value === level)
  return opt?.label || level
}

function getItemTypeLabel(type: string): string {
  const opt = itemTypeOptions.value.find(o => o.value === type)
  return opt?.label || type
}

function getItemLevelLabel(level: string): string {
  const opt = itemLevelOptions.value.find(o => o.value === level)
  return opt?.label || level
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

  const skillData = JSON.parse(JSON.stringify(skillForm.value))

  if (editingSkill.value) {
    const result = await window.electronAPI.longwriting.updateSkill(editingSkill.value.id, skillData)
    if (result.success) {
      await loadSkills()
      ElMessage.success('技能已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    const result = await window.electronAPI.longwriting.createSkill({
      projectId: props.projectId,
      ...skillData
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

  const rawForm = JSON.parse(JSON.stringify(itemForm.value))
  const itemData = {
    ...rawForm,
    ownerId: rawForm.ownerId || undefined
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

// 加载角色列表
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

// 加载字典数据
async function loadDictionary() {
  try {
    const result = await window.electronAPI.longwriting.getDictionaryAll()
    if (result.success && result.data) {
      dictionary.value = result.data
    }
  } catch (error) {
    console.error('加载字典失败:', error)
  }
}

// 加载所有数据
async function loadData() {
  await Promise.all([
    loadDictionary(),
    loadCharacters(),
    loadSkills(),
    loadItems()
  ])
}

// 监听 visible 变化，打开时加载数据
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadData()
  }
})

onMounted(() => {
  if (props.visible) {
    loadData()
  }
})
</script>

<style lang="scss" scoped>
.skill-list,
.item-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
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
</style>