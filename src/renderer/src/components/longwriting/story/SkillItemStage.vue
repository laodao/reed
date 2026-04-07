<template>
  <div class="skill-item-stage">
    <div class="stage-header">
      <h2>技能与物品设定</h2>
      <p class="stage-desc">设定故事中的技能体系和重要物品（可选阶段）</p>
    </div>

    <el-tabs v-model="activeTab" :before-leave="handleTabLeave">
      <!-- 类型设定 -->
      <el-tab-pane label="类型设定" name="types">
        <div class="type-config-section">
          <div class="config-header">
            <h3>技能类型与等级</h3>
            <el-button size="small" type="primary" @click="showAddSkillTypeDialog = true">
              <el-icon><Plus /></el-icon>
              添加类型
            </el-button>
          </div>
          <div class="type-config-container">
            <div class="type-list-panel">
              <div
                v-for="skillType in skillTypes"
                :key="skillType.id"
                class="type-item"
                :class="{ active: selectedSkillType?.id === skillType.id }"
                @click="selectSkillType(skillType)"
              >
                <span class="type-name">{{ skillType.name }}</span>
                <span class="type-code">{{ skillType.code }}</span>
                <el-button text size="small" type="danger" @click.stop="deleteSkillType(skillType.id)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="level-list-panel">
              <template v-if="selectedSkillType">
                <div class="panel-header">
                  <span>{{ selectedSkillType.name }} - 等级</span>
                  <el-button size="small" @click="showAddSkillLevelDialog = true">
                    <el-icon><Plus /></el-icon>
                  </el-button>
                </div>
                <div class="level-cards">
                  <div v-for="level in skillLevels" :key="level.id" class="level-card-small">
                    <div class="level-header">
                      <span class="level-num">{{ level.sortOrder + 1 }}</span>
                      <el-input v-model="level.name" size="small" @change="updateSkillLevel(level)" />
                      <el-button text size="small" type="danger" @click="deleteSkillLevel(level.id)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                    <el-input
                      v-model="level.description"
                      type="textarea"
                      :rows="2"
                      size="small"
                      placeholder="等级描述"
                      @change="updateSkillLevel(level)"
                    />
                  </div>
                </div>
              </template>
              <div v-else class="empty-tip">选择左侧类型查看等级</div>
            </div>
          </div>

          <div class="config-header" style="margin-top: 24px;">
            <h3>物品类型与等级</h3>
            <el-button size="small" type="primary" @click="showAddItemTypeDialog = true">
              <el-icon><Plus /></el-icon>
              添加类型
            </el-button>
          </div>
          <div class="type-config-container">
            <div class="type-list-panel">
              <div
                v-for="itemType in itemTypes"
                :key="itemType.id"
                class="type-item"
                :class="{ active: selectedItemType?.id === itemType.id }"
                @click="selectItemType(itemType)"
              >
                <span class="type-name">{{ itemType.name }}</span>
                <span class="type-code">{{ itemType.code }}</span>
                <el-button text size="small" type="danger" @click.stop="deleteItemType(itemType.id)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="level-list-panel">
              <template v-if="selectedItemType">
                <div class="panel-header">
                  <span>{{ selectedItemType.name }} - 等级</span>
                  <el-button size="small" @click="showAddItemLevelDialog = true">
                    <el-icon><Plus /></el-icon>
                  </el-button>
                </div>
                <div class="level-cards">
                  <div v-for="level in itemLevels" :key="level.id" class="level-card-small">
                    <div class="level-header">
                      <span class="level-num">{{ level.sortOrder + 1 }}</span>
                      <el-input v-model="level.name" size="small" @change="updateItemLevel(level)" />
                      <el-button text size="small" type="danger" @click="deleteItemLevel(level.id)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                    <el-input
                      v-model="level.description"
                      type="textarea"
                      :rows="2"
                      size="small"
                      placeholder="等级描述"
                      @change="updateItemLevel(level)"
                    />
                  </div>
                </div>
              </template>
              <div v-else class="empty-tip">选择左侧类型查看等级</div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 技能设定 -->
      <el-tab-pane name="skills">
        <template #label>
          <span :class="{ 'disabled-tab': !isFeatureEnabled('skill') }">技能设定</span>
        </template>
        <div class="skill-list">
          <div v-for="skill in skills" :key="skill.id" class="skill-card">
            <div class="skill-header">
              <h4>{{ skill.name }}</h4>
              <div class="skill-tags">
                <span class="type-tag">{{ getSkillTypeLabel(skill.type) }}</span>
                <span class="level-tag">{{ getSkillLevelLabel(skill.type, skill.level) }}</span>
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
      <el-tab-pane name="items">
        <template #label>
          <span :class="{ 'disabled-tab': !isFeatureEnabled('item') }">物品设定</span>
        </template>
        <div class="item-list">
          <div v-for="item in items" :key="item.id" class="item-card">
            <div class="item-header">
              <h4>{{ item.name }}</h4>
              <div class="item-tags">
                <span class="type-tag">{{ getItemTypeLabel(item.type) }}</span>
                <span class="level-tag" :class="item.level">{{ getItemLevelLabel(item.type, item.level) }}</span>
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
      <el-button v-if="!generating" type="primary" size="large" @click="handleGenerate">
        <el-icon><MagicStick /></el-icon>
        {{ generateButtonText }}
      </el-button>
      <el-button v-else type="danger" size="large" @click="cancelGeneration">
        <el-icon><Close /></el-icon>
        取消生成
      </el-button>
    </div>

    <!-- 生成进度 -->
    <div v-if="generating" class="generating-progress">
      <el-progress :percentage="100" :indeterminate="true" />
      <p class="progress-text">{{ generateProgressText }}</p>
    </div>

    <!-- 添加技能类型对话框 -->
    <el-dialog v-model="showAddSkillTypeDialog" title="添加技能类型" width="400px" destroy-on-close>
      <el-form :model="newSkillTypeForm" label-width="80px">
        <el-form-item label="类型编码" required>
          <el-input v-model="newSkillTypeForm.code" placeholder="请输入编码（英文）" />
        </el-form-item>
        <el-form-item label="类型名称" required>
          <el-input v-model="newSkillTypeForm.name" placeholder="请输入名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddSkillTypeDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!newSkillTypeForm.code || !newSkillTypeForm.name" @click="createSkillType">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加技能等级对话框 -->
    <el-dialog v-model="showAddSkillLevelDialog" title="添加技能等级" width="450px" destroy-on-close>
      <el-form :model="newSkillLevelForm" label-width="80px">
        <el-form-item label="等级编码" required>
          <el-input v-model="newSkillLevelForm.code" placeholder="请输入编码（英文）" />
        </el-form-item>
        <el-form-item label="等级名称" required>
          <el-input v-model="newSkillLevelForm.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="等级描述">
          <el-input v-model="newSkillLevelForm.description" type="textarea" :rows="3" placeholder="描述此等级的特征、能力等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddSkillLevelDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!newSkillLevelForm.code || !newSkillLevelForm.name" @click="createSkillLevel">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加物品类型对话框 -->
    <el-dialog v-model="showAddItemTypeDialog" title="添加物品类型" width="400px" destroy-on-close>
      <el-form :model="newItemTypeForm" label-width="80px">
        <el-form-item label="类型编码" required>
          <el-input v-model="newItemTypeForm.code" placeholder="请输入编码（英文）" />
        </el-form-item>
        <el-form-item label="类型名称" required>
          <el-input v-model="newItemTypeForm.name" placeholder="请输入名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddItemTypeDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!newItemTypeForm.code || !newItemTypeForm.name" @click="createItemType">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加物品等级对话框 -->
    <el-dialog v-model="showAddItemLevelDialog" title="添加物品等级" width="450px" destroy-on-close>
      <el-form :model="newItemLevelForm" label-width="80px">
        <el-form-item label="等级编码" required>
          <el-input v-model="newItemLevelForm.code" placeholder="请输入编码（英文）" />
        </el-form-item>
        <el-form-item label="等级名称" required>
          <el-input v-model="newItemLevelForm.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="等级描述">
          <el-input v-model="newItemLevelForm.description" type="textarea" :rows="3" placeholder="描述此等级的外观、能量特征等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddItemLevelDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!newItemLevelForm.code || !newItemLevelForm.name" @click="createItemLevel">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 技能编辑对话框 -->
    <el-dialog v-model="showSkillDialog" :title="editingSkill ? '编辑技能' : '添加技能'" width="500px" destroy-on-close>
      <el-form :model="skillForm" label-width="80px">
        <el-form-item label="技能名称" required>
          <el-input v-model="skillForm.name" placeholder="输入技能名称" />
        </el-form-item>
        <el-form-item label="技能类型">
          <el-select v-model="skillForm.type" placeholder="选择技能类型" @change="onSkillTypeChange">
            <el-option v-for="opt in skillTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="技能等级">
          <el-select v-model="skillForm.level" placeholder="选择等级">
            <el-option v-for="opt in currentSkillLevelOptions" :key="opt.value" :label="opt.label" :value="opt.value">
              <div class="level-option">
                <span>{{ opt.label }}</span>
                <span class="level-desc">{{ opt.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="所属体系">
          <el-input v-model="skillForm.system" placeholder="门派/体系名称（可选）" />
        </el-form-item>
        <el-form-item label="技能描述">
          <el-input v-model="skillForm.description" type="textarea" :rows="3" placeholder="描述技能的特点、效果..." />
        </el-form-item>
        <el-form-item label="掌握角色">
          <el-select v-model="skillForm.characterIds" multiple placeholder="选择掌握此技能的角色">
            <el-option v-for="char in characters" :key="char.id" :label="char.name" :value="char.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSkillDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSkill">保存</el-button>
      </template>
    </el-dialog>

    <!-- 物品编辑对话框 -->
    <el-dialog v-model="showItemDialog" :title="editingItem ? '编辑物品' : '添加物品'" width="500px" destroy-on-close>
      <el-form :model="itemForm" label-width="80px">
        <el-form-item label="物品名称" required>
          <el-input v-model="itemForm.name" placeholder="输入物品名称" />
        </el-form-item>
        <el-form-item label="物品类型">
          <el-select v-model="itemForm.type" placeholder="选择物品类型" @change="onItemTypeChange">
            <el-option v-for="opt in itemTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="物品等级">
          <el-select v-model="itemForm.level" placeholder="选择等级">
            <el-option v-for="opt in currentItemLevelOptions" :key="opt.value" :label="opt.label" :value="opt.value">
              <div class="level-option">
                <span>{{ opt.label }}</span>
                <span class="level-desc">{{ opt.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="物品描述">
          <el-input v-model="itemForm.description" type="textarea" :rows="3" placeholder="描述物品的外观、功能、来历..." />
        </el-form-item>
        <el-form-item label="持有者">
          <el-select v-model="itemForm.ownerId" placeholder="选择持有角色（可选）" clearable>
            <el-option v-for="char in characters" :key="char.id" :label="char.name" :value="char.id" />
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
import type { StorySkill, StoryItem, StoryCharacter, ProjectSkillTypeConfig, ProjectItemTypeConfig, SkillLevelConfig, ItemLevelConfig } from '../../../../shared/types/longwriting.types'
import type { Ref } from 'vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件注入功能开关
const enabledFeatures = inject<Ref<string[]>>('enabledFeatures', ref([]))

// 检查功能是否启用
function isFeatureEnabled(feature: string): boolean {
  return enabledFeatures.value.includes(feature)
}

const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

const activeTab = ref('types')
const characters = ref<StoryCharacter[]>([])
const skills = ref<StorySkill[]>([])
const items = ref<StoryItem[]>([])

// Tab 切换前检查功能是否启用
function handleTabLeave(activeName: string, oldActiveName: string): boolean {
  if (activeName === 'skills' && !isFeatureEnabled('skill')) {
    ElMessage.warning('技能功能未启用，请在故事概要中开启"技能"选项')
    return false
  }
  if (activeName === 'items' && !isFeatureEnabled('item')) {
    ElMessage.warning('物品功能未启用，请在故事概要中开启"物品"选项')
    return false
  }
  return true
}

// 类型配置数据
const skillTypes = ref<ProjectSkillTypeConfig[]>([])
const itemTypes = ref<ProjectItemTypeConfig[]>([])
const selectedSkillType = ref<ProjectSkillTypeConfig | null>(null)
const selectedItemType = ref<ProjectItemTypeConfig | null>(null)
const skillLevels = ref<SkillLevelConfig[]>([])
const itemLevels = ref<ItemLevelConfig[]>([])

// 对话框状态
const showSkillDialog = ref(false)
const showItemDialog = ref(false)
const showAddSkillTypeDialog = ref(false)
const showAddSkillLevelDialog = ref(false)
const showAddItemTypeDialog = ref(false)
const showAddItemLevelDialog = ref(false)

const editingSkill = ref<StorySkill | null>(null)
const editingItem = ref<StoryItem | null>(null)

const generating = ref(false)
const currentEventId = ref<string | null>(null)
const generatingContent = ref('')

// 根据 activeTab 显示不同的按钮文本
const generateButtonText = computed(() => {
  if (activeTab.value === 'types') {
    return 'AI 生成技能和物品类型'
  } else if (activeTab.value === 'skills') {
    return 'AI 生成技能体系'
  } else if (activeTab.value === 'items') {
    return 'AI 生成物品体系'
  }
  return 'AI 生成'
})

// 根据 activeTab 显示不同的进度文本
const generateProgressText = computed(() => {
  if (activeTab.value === 'types') {
    return 'AI 正在生成技能和物品类型建议...'
  } else if (activeTab.value === 'skills') {
    return 'AI 正在生成技能体系建议...'
  } else if (activeTab.value === 'items') {
    return 'AI 正在生成物品体系建议...'
  }
  return 'AI 正在生成...'
})

// 表单数据
const skillForm = ref({
  name: '',
  type: '' as string,
  level: '' as string,
  system: '',
  description: '',
  characterIds: [] as string[]
})

const itemForm = ref({
  name: '',
  type: '' as string,
  level: '' as string,
  description: '',
  ownerId: ''
})

const newSkillTypeForm = ref({ code: '', name: '' })
const newSkillLevelForm = ref({ code: '', name: '', description: '' })
const newItemTypeForm = ref({ code: '', name: '' })
const newItemLevelForm = ref({ code: '', name: '', description: '' })

// ==================== 类型配置相关 ====================

const skillTypeOptions = computed(() => {
  return skillTypes.value.map(t => ({ label: t.name, value: t.code }))
})

const itemTypeOptions = computed(() => {
  return itemTypes.value.map(t => ({ label: t.name, value: t.code }))
})

// 根据选中的类型获取对应的等级选项
const currentSkillLevelOptions = computed(() => {
  if (!skillForm.value.type) return []
  const levels = skillLevelsMap.value[skillForm.value.type] || []
  return levels.map(l => ({ label: l.name, value: l.code, description: l.description }))
})

const currentItemLevelOptions = computed(() => {
  if (!itemForm.value.type) return []
  const levels = itemLevelsMap.value[itemForm.value.type] || []
  return levels.map(l => ({ label: l.name, value: l.code, description: l.description }))
})

// 等级映射（类型编码 -> 等级列表）
const skillLevelsMap = ref<Record<string, SkillLevelConfig[]>>({})
const itemLevelsMap = ref<Record<string, ItemLevelConfig[]>>({})

function getSkillTypeLabel(code: string): string {
  const type = skillTypes.value.find(t => t.code === code)
  return type?.name || code
}

function getSkillLevelLabel(typeCode: string, levelCode: string): string {
  const levels = skillLevelsMap.value[typeCode] || []
  const level = levels.find(l => l.code === levelCode)
  return level?.name || levelCode
}

function getItemTypeLabel(code: string): string {
  const type = itemTypes.value.find(t => t.code === code)
  return type?.name || code
}

function getItemLevelLabel(typeCode: string, levelCode: string): string {
  const levels = itemLevelsMap.value[typeCode] || []
  const level = levels.find(l => l.code === levelCode)
  return level?.name || levelCode
}

function getCharacterName(id: string): string {
  const char = characters.value.find(c => c.id === id)
  return char?.name || '未知角色'
}

function onSkillTypeChange() {
  skillForm.value.level = ''
}

function onItemTypeChange() {
  itemForm.value.level = ''
}

// ==================== 类型配置 CRUD ====================

async function loadSkillTypes() {
  const result = await window.electronAPI.longwriting.getSkillTypeConfigs(props.projectId)
  if (result.success) {
    skillTypes.value = result.data || []
    // 加载所有技能类型的等级
    for (const type of skillTypes.value) {
      await loadSkillLevelsForType(type.code)
    }
    if (skillTypes.value.length > 0 && !selectedSkillType.value) {
      selectSkillType(skillTypes.value[0])
    }
  }
}

async function loadSkillLevelsForType(skillTypeCode: string) {
  const result = await window.electronAPI.longwriting.getSkillLevels(props.projectId, skillTypeCode)
  if (result.success) {
    skillLevelsMap.value[skillTypeCode] = result.data || []
  }
}

async function selectSkillType(type: ProjectSkillTypeConfig) {
  selectedSkillType.value = type
  const result = await window.electronAPI.longwriting.getSkillLevels(props.projectId, type.code)
  if (result.success) {
    skillLevels.value = result.data || []
  }
}

async function createSkillType() {
  if (!newSkillTypeForm.value.code || !newSkillTypeForm.value.name) return
  const result = await window.electronAPI.longwriting.createSkillTypeConfig({
    projectId: props.projectId,
    code: newSkillTypeForm.value.code,
    name: newSkillTypeForm.value.name
  })
  if (result.success) {
    await loadSkillTypes()
    showAddSkillTypeDialog.value = false
    newSkillTypeForm.value = { code: '', name: '' }
    ElMessage.success('创建成功')
  } else {
    ElMessage.error('创建失败：' + (result.error || '未知错误'))
  }
}

async function deleteSkillType(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该技能类型吗？关联的等级也会被删除。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const result = await window.electronAPI.longwriting.deleteSkillTypeConfig(id)
    if (result.success) {
      if (selectedSkillType.value?.id === id) {
        selectedSkillType.value = null
        skillLevels.value = []
      }
      await loadSkillTypes()
      ElMessage.success('删除成功')
    }
  } catch {}
}

async function createSkillLevel() {
  if (!selectedSkillType.value || !newSkillLevelForm.value.code || !newSkillLevelForm.value.name) return
  const result = await window.electronAPI.longwriting.createSkillLevel({
    projectId: props.projectId,
    skillTypeCode: selectedSkillType.value.code,
    code: newSkillLevelForm.value.code,
    name: newSkillLevelForm.value.name,
    description: newSkillLevelForm.value.description
  })
  if (result.success) {
    await selectSkillType(selectedSkillType.value)
    await loadSkillLevelsForType(selectedSkillType.value.code)
    showAddSkillLevelDialog.value = false
    newSkillLevelForm.value = { code: '', name: '', description: '' }
    ElMessage.success('创建成功')
  } else {
    ElMessage.error('创建失败：' + (result.error || '未知错误'))
  }
}

async function updateSkillLevel(level: SkillLevelConfig) {
  await window.electronAPI.longwriting.updateSkillLevel(level.id, {
    name: level.name,
    description: level.description
  })
  await loadSkillLevelsForType(level.skillTypeCode)
}

async function deleteSkillLevel(id: string) {
  const result = await window.electronAPI.longwriting.deleteSkillLevel(id)
  if (result.success && selectedSkillType.value) {
    await selectSkillType(selectedSkillType.value)
    await loadSkillLevelsForType(selectedSkillType.value.code)
  }
}

// 物品类型相关
async function loadItemTypes() {
  const result = await window.electronAPI.longwriting.getItemTypeConfigs(props.projectId)
  if (result.success) {
    itemTypes.value = result.data || []
    for (const type of itemTypes.value) {
      await loadItemLevelsForType(type.code)
    }
    if (itemTypes.value.length > 0 && !selectedItemType.value) {
      selectItemType(itemTypes.value[0])
    }
  }
}

async function loadItemLevelsForType(itemTypeCode: string) {
  const result = await window.electronAPI.longwriting.getItemLevels(props.projectId, itemTypeCode)
  if (result.success) {
    itemLevelsMap.value[itemTypeCode] = result.data || []
  }
}

async function selectItemType(type: ProjectItemTypeConfig) {
  selectedItemType.value = type
  const result = await window.electronAPI.longwriting.getItemLevels(props.projectId, type.code)
  if (result.success) {
    itemLevels.value = result.data || []
  }
}

async function createItemType() {
  if (!newItemTypeForm.value.code || !newItemTypeForm.value.name) return
  const result = await window.electronAPI.longwriting.createItemTypeConfig({
    projectId: props.projectId,
    code: newItemTypeForm.value.code,
    name: newItemTypeForm.value.name
  })
  if (result.success) {
    await loadItemTypes()
    showAddItemTypeDialog.value = false
    newItemTypeForm.value = { code: '', name: '' }
    ElMessage.success('创建成功')
  } else {
    ElMessage.error('创建失败：' + (result.error || '未知错误'))
  }
}

async function deleteItemType(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该物品类型吗？关联的等级也会被删除。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const result = await window.electronAPI.longwriting.deleteItemTypeConfig(id)
    if (result.success) {
      if (selectedItemType.value?.id === id) {
        selectedItemType.value = null
        itemLevels.value = []
      }
      await loadItemTypes()
      ElMessage.success('删除成功')
    }
  } catch {}
}

async function createItemLevel() {
  if (!selectedItemType.value || !newItemLevelForm.value.code || !newItemLevelForm.value.name) return
  const result = await window.electronAPI.longwriting.createItemLevel({
    projectId: props.projectId,
    itemTypeCode: selectedItemType.value.code,
    code: newItemLevelForm.value.code,
    name: newItemLevelForm.value.name,
    description: newItemLevelForm.value.description
  })
  if (result.success) {
    await selectItemType(selectedItemType.value)
    await loadItemLevelsForType(selectedItemType.value.code)
    showAddItemLevelDialog.value = false
    newItemLevelForm.value = { code: '', name: '', description: '' }
    ElMessage.success('创建成功')
  } else {
    ElMessage.error('创建失败：' + (result.error || '未知错误'))
  }
}

async function updateItemLevel(level: ItemLevelConfig) {
  await window.electronAPI.longwriting.updateItemLevel(level.id, {
    name: level.name,
    description: level.description
  })
  await loadItemLevelsForType(level.itemTypeCode)
}

async function deleteItemLevel(id: string) {
  const result = await window.electronAPI.longwriting.deleteItemLevel(id)
  if (result.success && selectedItemType.value) {
    await selectItemType(selectedItemType.value)
    await loadItemLevelsForType(selectedItemType.value.code)
  }
}

// ==================== 技能物品 CRUD ====================

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
    }
  } catch {}
}

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
    }
  } else {
    const result = await window.electronAPI.longwriting.createSkill({
      projectId: props.projectId,
      ...skillData
    })
    if (result.success) {
      await loadSkills()
      ElMessage.success('技能已添加')
    }
  }
  showSkillDialog.value = false
  editingSkill.value = null
  skillForm.value = { name: '', type: '', level: '', system: '', description: '', characterIds: [] }
  updateProgress()
}

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
    }
  } catch {}
}

async function saveItem() {
  if (!itemForm.value.name) {
    ElMessage.warning('请输入物品名称')
    return
  }
  const rawForm = JSON.parse(JSON.stringify(itemForm.value))
  const itemData = { ...rawForm, ownerId: rawForm.ownerId || undefined }
  if (editingItem.value) {
    const result = await window.electronAPI.longwriting.updateItem(editingItem.value.id, itemData)
    if (result.success) {
      await loadItems()
      ElMessage.success('物品已更新')
    }
  } else {
    const result = await window.electronAPI.longwriting.createItem({
      projectId: props.projectId,
      ...itemData
    })
    if (result.success) {
      await loadItems()
      ElMessage.success('物品已添加')
    }
  }
  showItemDialog.value = false
  editingItem.value = null
  itemForm.value = { name: '', type: '', level: '', description: '', ownerId: '' }
  updateProgress()
}

// ==================== AI 生成 ====================

// 根据当前 tab 处理不同的生成
async function handleGenerate() {
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  if (activeTab.value === 'types') {
    await generateTypes()
  } else if (activeTab.value === 'skills') {
    await generateSkills()
  } else if (activeTab.value === 'items') {
    await generateItems()
  }
}

// 生成技能和物品类型配置
async function generateTypes() {
  generating.value = true
  generatingContent.value = ''
  currentEventId.value = `types-${props.projectId}-${Date.now()}`

  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        parseTypesResult(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.generateSkillItemTypes(
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

// 解析类型生成结果
async function parseTypesResult(content: string) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }
    const data = JSON.parse(jsonMatch[0])
    const skillTypes = data.skillTypes || []
    const itemTypes = data.itemTypes || []

    if (skillTypes.length === 0 && itemTypes.length === 0) {
      ElMessage.warning('AI 未生成类型建议')
      return
    }

    // 显示确认对话框
    const skillTypeNames = skillTypes.map((t: any) => `- ${t.name} (${t.code})`).join('\n') || '无'
    const itemTypeNames = itemTypes.map((t: any) => `- ${t.name} (${t.code})`).join('\n') || '无'

    await ElMessageBox.confirm(
      `AI 建议添加以下类型配置：\n\n技能类型：\n${skillTypeNames}\n\n物品类型：\n${itemTypeNames}`,
      'AI 生成类型建议',
      { confirmButtonText: '全部添加', cancelButtonText: '取消', type: 'info' }
    )

    // 创建技能类型
    for (const type of skillTypes) {
      await window.electronAPI.longwriting.createSkillTypeConfig({
        projectId: props.projectId,
        code: type.code,
        name: type.name
      })
    }

    // 创建物品类型
    for (const type of itemTypes) {
      await window.electronAPI.longwriting.createItemTypeConfig({
        projectId: props.projectId,
        code: type.code,
        name: type.name
      })
    }

    await loadData()
    ElMessage.success('类型配置已添加')
  } catch (error) {
    // 用户取消不报错
    if (error !== 'cancel') {
      ElMessage.error('解析 AI 响应失败')
    }
  }
}

async function generateSkills() {
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }
  generating.value = true
  generatingContent.value = ''
  currentEventId.value = `skills-${props.projectId}-${Date.now()}`

  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        parseSkillsResult(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.generateSkillsOnly(
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

// 只解析技能结果
async function parseSkillsResult(content: string) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }
    const data = JSON.parse(jsonMatch[0])
    const suggestedSkills: Partial<StorySkill>[] = data.skills || []
    if (suggestedSkills.length === 0) {
      ElMessage.warning('AI 未生成技能建议')
      return
    }
    await ElMessageBox.confirm(
      `AI 建议添加以下技能：\n\n${suggestedSkills.map(s => `- ${s.name}`).join('\n')}`,
      'AI 生成技能建议',
      { confirmButtonText: '全部添加', cancelButtonText: '取消', type: 'info' }
    )
    for (const suggested of suggestedSkills) {
      await window.electronAPI.longwriting.createSkill({
        projectId: props.projectId,
        ...suggested,
        characterIds: []
      })
    }
    await loadData()
    ElMessage.success('技能已添加')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('解析 AI 响应失败')
    }
  }
}

// 生成物品体系
async function generateItems() {
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }
  generating.value = true
  generatingContent.value = ''
  currentEventId.value = `items-${props.projectId}-${Date.now()}`

  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    currentEventId.value,
    (event: { type: string; content?: string; error?: string; data?: any }) => {
      if (event.type === 'content' && event.content) {
        generatingContent.value += event.content
      } else if (event.type === 'done') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        parseItemsResult(generatingContent.value)
      } else if (event.type === 'error') {
        generating.value = false
        currentEventId.value = null
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.generateItemsOnly(
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

// 只解析物品结果
async function parseItemsResult(content: string) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      ElMessage.warning('AI 返回格式不正确，请重试')
      return
    }
    const data = JSON.parse(jsonMatch[0])
    const suggestedItems: Partial<StoryItem>[] = data.items || []
    if (suggestedItems.length === 0) {
      ElMessage.warning('AI 未生成物品建议')
      return
    }
    await ElMessageBox.confirm(
      `AI 建议添加以下物品：\n\n${suggestedItems.map(i => `- ${i.name}`).join('\n')}`,
      'AI 生成物品建议',
      { confirmButtonText: '全部添加', cancelButtonText: '取消', type: 'info' }
    )
    for (const suggested of suggestedItems) {
      await window.electronAPI.longwriting.createItem({
        projectId: props.projectId,
        ...suggested
      })
    }
    await loadData()
    ElMessage.success('物品已添加')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('解析 AI 响应失败')
    }
  }
}

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
    ElMessageBox.confirm(
      `AI 建议添加以下内容：\n\n技能：\n${suggestedSkills.map(s => `- ${s.name}`).join('\n') || '无'}\n\n物品：\n${suggestedItems.map(i => `- ${i.name}`).join('\n') || '无'}`,
      'AI 生成建议',
      { confirmButtonText: '全部添加', cancelButtonText: '取消', type: 'info' }
    ).then(async () => {
      for (const suggested of suggestedSkills) {
        await window.electronAPI.longwriting.createSkill({
          projectId: props.projectId,
          ...suggested,
          characterIds: []
        })
      }
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
    ElMessage.error('解析 AI 响应失败')
  }
}

function cancelGeneration() {
  generating.value = false
  currentEventId.value = null
  ElMessage.info('已取消生成')
}

function updateProgress() {
  const total = skills.value.length + items.value.length
  const progress = Math.min(65, 55 + total * 2)
  emit('update:progress', progress)
}

async function loadCharacters() {
  const result = await window.electronAPI.longwriting.getCharacters(props.projectId)
  if (result.success) {
    characters.value = result.data || []
  }
}

async function loadSkills() {
  const result = await window.electronAPI.longwriting.getSkills(props.projectId)
  if (result.success) {
    skills.value = result.data || []
  }
}

async function loadItems() {
  const result = await window.electronAPI.longwriting.getItems(props.projectId)
  if (result.success) {
    items.value = result.data || []
  }
}

async function loadData() {
  await Promise.all([
    loadSkillTypes(),
    loadItemTypes(),
    loadCharacters(),
    loadSkills(),
    loadItems()
  ])
  updateProgress()
}

// 初始化默认配置
async function initDefaultConfigs() {
  const result = await window.electronAPI.longwriting.initDefaultTypeConfigs(props.projectId)
  if (result.success) {
    await loadSkillTypes()
    await loadItemTypes()
  }
}

onMounted(async () => {
  await loadData()
  // 如果没有类型配置，初始化默认
  if (skillTypes.value.length === 0 && itemTypes.value.length === 0) {
    await initDefaultConfigs()
  }
})

watch(() => props.projectId, () => {
  loadData()
})
</script>

<style lang="scss" scoped>
.skill-item-stage {
  max-width: 1000px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 12px;

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 4px 0;
  }

  .stage-desc {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.type-config-section {
  padding: 16px 0;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h3 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
  }
}

.type-config-container {
  display: flex;
  gap: 16px;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.type-list-panel {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-light);
  max-height: 300px;
  overflow-y: auto;
}

.type-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color-lighter);

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
  }

  .type-name {
    flex: 1;
    font-size: 13px;
  }

  .type-code {
    font-size: 11px;
    color: var(--text-color-secondary);
    margin-right: 8px;
  }
}

.level-list-panel {
  flex: 1;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
}

.level-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.level-card-small {
  padding: 8px;
  background: var(--fill-color-lighter);
  border-radius: 6px;
}

.level-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .level-num {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: white;
    border-radius: 50%;
    font-size: 11px;
    flex-shrink: 0;
  }

  .el-input {
    flex: 1;
  }
}

.empty-tip {
  text-align: center;
  color: var(--text-color-placeholder);
  padding: 40px;
  font-size: 13px;
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

.level-option {
  display: flex;
  justify-content: space-between;
  width: 100%;

  .level-desc {
    font-size: 12px;
    color: var(--text-color-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.disabled-tab {
  color: var(--text-color-placeholder);
  cursor: not-allowed;
}
</style>