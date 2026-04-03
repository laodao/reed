<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="项目设定"
    width="1000px"
    top="5vh"
    destroy-on-close
  >
    <el-tabs v-model="activeTab">
      <!-- 技能类型设定 -->
      <el-tab-pane label="技能类型设定" name="skills">
        <div class="config-container">
          <!-- 左侧类型列表 -->
          <div class="type-panel">
            <div class="panel-header">
              <span>技能类型</span>
              <el-button size="small" type="primary" @click="showAddSkillTypeDialog = true">
                <el-icon><Plus /></el-icon>
                添加
              </el-button>
            </div>
            <div class="type-list">
              <div
                v-for="skillType in skillTypes"
                :key="skillType.id"
                class="type-item"
                :class="{ active: selectedSkillType?.id === skillType.id }"
                @click="selectSkillType(skillType)"
              >
                <div class="type-name">{{ skillType.name }}</div>
                <div class="type-code">{{ skillType.code }}</div>
                <el-button
                  text
                  size="small"
                  type="danger"
                  @click.stop="deleteSkillType(skillType.id)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </div>

          <!-- 右侧等级列表 -->
          <div class="level-panel">
            <template v-if="selectedSkillType">
              <div class="panel-header">
                <span>{{ selectedSkillType.name }} - 等级设定</span>
                <el-button size="small" type="primary" @click="showAddSkillLevelDialog = true">
                  <el-icon><Plus /></el-icon>
                  添加等级
                </el-button>
              </div>
              <div class="level-list">
                <div
                  v-for="level in skillLevels"
                  :key="level.id"
                  class="level-card"
                >
                  <div class="level-header">
                    <span class="level-index">{{ level.sortOrder + 1 }}</span>
                    <el-input
                      v-model="level.name"
                      placeholder="等级名称"
                      size="small"
                      @change="updateSkillLevel(level)"
                    />
                    <el-button text size="small" type="danger" @click="deleteSkillLevel(level.id)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                  <div class="level-code">
                    <span>编码：</span>
                    <el-input
                      :model-value="level.code"
                      size="small"
                      disabled
                    />
                  </div>
                  <div class="level-desc">
                    <span>描述：</span>
                    <el-input
                      v-model="level.description"
                      type="textarea"
                      :rows="2"
                      placeholder="描述此等级的特征、能力等"
                      @change="updateSkillLevel(level)"
                    />
                  </div>
                </div>
                <div v-if="skillLevels.length === 0" class="empty-tip">
                  暂无等级，请添加
                </div>
              </div>
            </template>
            <template v-else>
              <div class="empty-panel">
                请在左侧选择一个技能类型
              </div>
            </template>
          </div>
        </div>
      </el-tab-pane>

      <!-- 物品类型设定 -->
      <el-tab-pane label="物品类型设定" name="items">
        <div class="config-container">
          <!-- 左侧类型列表 -->
          <div class="type-panel">
            <div class="panel-header">
              <span>物品类型</span>
              <el-button size="small" type="primary" @click="showAddItemTypeDialog = true">
                <el-icon><Plus /></el-icon>
                添加
              </el-button>
            </div>
            <div class="type-list">
              <div
                v-for="itemType in itemTypes"
                :key="itemType.id"
                class="type-item"
                :class="{ active: selectedItemType?.id === itemType.id }"
                @click="selectItemType(itemType)"
              >
                <div class="type-name">{{ itemType.name }}</div>
                <div class="type-code">{{ itemType.code }}</div>
                <el-button
                  text
                  size="small"
                  type="danger"
                  @click.stop="deleteItemType(itemType.id)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </div>

          <!-- 右侧等级列表 -->
          <div class="level-panel">
            <template v-if="selectedItemType">
              <div class="panel-header">
                <span>{{ selectedItemType.name }} - 等级设定</span>
                <el-button size="small" type="primary" @click="showAddItemLevelDialog = true">
                  <el-icon><Plus /></el-icon>
                  添加等级
                </el-button>
              </div>
              <div class="level-list">
                <div
                  v-for="level in itemLevels"
                  :key="level.id"
                  class="level-card"
                >
                  <div class="level-header">
                    <span class="level-index">{{ level.sortOrder + 1 }}</span>
                    <el-input
                      v-model="level.name"
                      placeholder="等级名称"
                      size="small"
                      @change="updateItemLevel(level)"
                    />
                    <el-button text size="small" type="danger" @click="deleteItemLevel(level.id)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                  <div class="level-code">
                    <span>编码：</span>
                    <el-input
                      :model-value="level.code"
                      size="small"
                      disabled
                    />
                  </div>
                  <div class="level-desc">
                    <span>描述：</span>
                    <el-input
                      v-model="level.description"
                      type="textarea"
                      :rows="2"
                      placeholder="描述此等级的外观、能量特征等"
                      @change="updateItemLevel(level)"
                    />
                  </div>
                </div>
                <div v-if="itemLevels.length === 0" class="empty-tip">
                  暂无等级，请添加
                </div>
              </div>
            </template>
            <template v-else>
              <div class="empty-panel">
                请在左侧选择一个物品类型
              </div>
            </template>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 添加技能类型对话框 -->
    <el-dialog
      v-model="showAddSkillTypeDialog"
      title="添加技能类型"
      width="400px"
      destroy-on-close
      append-to-body
    >
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
    <el-dialog
      v-model="showAddSkillLevelDialog"
      title="添加技能等级"
      width="450px"
      destroy-on-close
      append-to-body
    >
      <el-form :model="newSkillLevelForm" label-width="80px">
        <el-form-item label="等级编码" required>
          <el-input v-model="newSkillLevelForm.code" placeholder="请输入编码（英文）" />
        </el-form-item>
        <el-form-item label="等级名称" required>
          <el-input v-model="newSkillLevelForm.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="等级描述">
          <el-input
            v-model="newSkillLevelForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述此等级的特征、能力等"
          />
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
    <el-dialog
      v-model="showAddItemTypeDialog"
      title="添加物品类型"
      width="400px"
      destroy-on-close
      append-to-body
    >
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
    <el-dialog
      v-model="showAddItemLevelDialog"
      title="添加物品等级"
      width="450px"
      destroy-on-close
      append-to-body
    >
      <el-form :model="newItemLevelForm" label-width="80px">
        <el-form-item label="等级编码" required>
          <el-input v-model="newItemLevelForm.code" placeholder="请输入编码（英文）" />
        </el-form-item>
        <el-form-item label="等级名称" required>
          <el-input v-model="newItemLevelForm.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="等级描述">
          <el-input
            v-model="newItemLevelForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述此等级的外观、能量特征等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddItemLevelDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!newItemLevelForm.code || !newItemLevelForm.name" @click="createItemLevel">
          创建
        </el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { ProjectSkillTypeConfig, ProjectItemTypeConfig, SkillLevelConfig, ItemLevelConfig } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  visible: boolean
  projectId: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const activeTab = ref('skills')

// 技能类型列表
const skillTypes = ref<ProjectSkillTypeConfig[]>([])
const selectedSkillType = ref<ProjectSkillTypeConfig | null>(null)
const skillLevels = ref<SkillLevelConfig[]>([])

// 物品类型列表
const itemTypes = ref<ProjectItemTypeConfig[]>([])
const selectedItemType = ref<ProjectItemTypeConfig | null>(null)
const itemLevels = ref<ItemLevelConfig[]>([])

// 对话框状态
const showAddSkillTypeDialog = ref(false)
const showAddSkillLevelDialog = ref(false)
const showAddItemTypeDialog = ref(false)
const showAddItemLevelDialog = ref(false)

// 表单数据
const newSkillTypeForm = ref({ code: '', name: '' })
const newSkillLevelForm = ref({ code: '', name: '', description: '' })
const newItemTypeForm = ref({ code: '', name: '' })
const newItemLevelForm = ref({ code: '', name: '', description: '' })

// 加载技能类型
async function loadSkillTypes() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getSkillTypeConfigs(props.projectId)
  if (result.success) {
    skillTypes.value = result.data || []
    if (skillTypes.value.length > 0 && !selectedSkillType.value) {
      selectSkillType(skillTypes.value[0])
    }
  }
}

// 选择技能类型
async function selectSkillType(type: ProjectSkillTypeConfig) {
  selectedSkillType.value = type
  await loadSkillLevels()
}

// 加载技能等级
async function loadSkillLevels() {
  if (!selectedSkillType.value) {
    skillLevels.value = []
    return
  }
  const result = await window.electronAPI.longwriting.getSkillLevels(props.projectId, selectedSkillType.value.code)
  if (result.success) {
    skillLevels.value = result.data || []
  }
}

// 创建技能类型
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

// 删除技能类型
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
    } else {
      ElMessage.error('删除失败：' + (result.error || '未知错误'))
    }
  } catch {
    // 用户取消
  }
}

// 创建技能等级
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
    await loadSkillLevels()
    showAddSkillLevelDialog.value = false
    newSkillLevelForm.value = { code: '', name: '', description: '' }
    ElMessage.success('创建成功')
  } else {
    ElMessage.error('创建失败：' + (result.error || '未知错误'))
  }
}

// 更新技能等级
async function updateSkillLevel(level: SkillLevelConfig) {
  const result = await window.electronAPI.longwriting.updateSkillLevel(level.id, {
    name: level.name,
    description: level.description
  })
  if (result.success) {
    ElMessage.success('更新成功')
  } else {
    ElMessage.error('更新失败：' + (result.error || '未知错误'))
  }
}

// 删除技能等级
async function deleteSkillLevel(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该等级吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const result = await window.electronAPI.longwriting.deleteSkillLevel(id)
    if (result.success) {
      await loadSkillLevels()
      ElMessage.success('删除成功')
    } else {
      ElMessage.error('删除失败：' + (result.error || '未知错误'))
    }
  } catch {
    // 用户取消
  }
}

// 加载物品类型
async function loadItemTypes() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getItemTypeConfigs(props.projectId)
  if (result.success) {
    itemTypes.value = result.data || []
    if (itemTypes.value.length > 0 && !selectedItemType.value) {
      selectItemType(itemTypes.value[0])
    }
  }
}

// 选择物品类型
async function selectItemType(type: ProjectItemTypeConfig) {
  selectedItemType.value = type
  await loadItemLevels()
}

// 加载物品等级
async function loadItemLevels() {
  if (!selectedItemType.value) {
    itemLevels.value = []
    return
  }
  const result = await window.electronAPI.longwriting.getItemLevels(props.projectId, selectedItemType.value.code)
  if (result.success) {
    itemLevels.value = result.data || []
  }
}

// 创建物品类型
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

// 删除物品类型
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
    } else {
      ElMessage.error('删除失败：' + (result.error || '未知错误'))
    }
  } catch {
    // 用户取消
  }
}

// 创建物品等级
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
    await loadItemLevels()
    showAddItemLevelDialog.value = false
    newItemLevelForm.value = { code: '', name: '', description: '' }
    ElMessage.success('创建成功')
  } else {
    ElMessage.error('创建失败：' + (result.error || '未知错误'))
  }
}

// 更新物品等级
async function updateItemLevel(level: ItemLevelConfig) {
  const result = await window.electronAPI.longwriting.updateItemLevel(level.id, {
    name: level.name,
    description: level.description
  })
  if (result.success) {
    ElMessage.success('更新成功')
  } else {
    ElMessage.error('更新失败：' + (result.error || '未知错误'))
  }
}

// 删除物品等级
async function deleteItemLevel(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该等级吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const result = await window.electronAPI.longwriting.deleteItemLevel(id)
    if (result.success) {
      await loadItemLevels()
      ElMessage.success('删除成功')
    } else {
      ElMessage.error('删除失败：' + (result.error || '未知错误'))
    }
  } catch {
    // 用户取消
  }
}

// 初始化默认配置
async function initDefaultConfigs() {
  const result = await window.electronAPI.longwriting.initDefaultTypeConfigs(props.projectId)
  if (result.success) {
    await loadSkillTypes()
    await loadItemTypes()
  }
}

// 加载所有数据
async function loadData() {
  await loadSkillTypes()
  await loadItemTypes()

  // 如果没有数据，初始化默认配置
  if (skillTypes.value.length === 0 && itemTypes.value.length === 0) {
    await initDefaultConfigs()
  }
}

// 监听 visible 变化
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
.config-container {
  display: flex;
  gap: 16px;
  height: 60vh;
}

.type-panel {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.level-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--fill-color-light);
  border-bottom: 1px solid var(--border-color-light);
  font-weight: 500;
}

.type-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.type-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;

  &:hover {
    background: var(--fill-color-light);
  }

  &.active {
    background: var(--color-primary-light-9);
    border: 1px solid var(--color-primary-light-5);
  }

  .type-name {
    flex: 1;
    font-weight: 500;
  }

  .type-code {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-right: 8px;
  }
}

.level-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.level-card {
  padding: 12px;
  background: var(--fill-color-blank);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  margin-bottom: 12px;

  &:hover {
    border-color: var(--color-primary-light-5);
  }
}

.level-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .level-index {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: white;
    border-radius: 50%;
    font-size: 12px;
    flex-shrink: 0;
  }

  .el-input {
    flex: 1;
  }
}

.level-code {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  span {
    width: 50px;
    font-size: 13px;
    color: var(--text-color-secondary);
  }

  .el-input {
    flex: 1;
  }
}

.level-desc {
  display: flex;
  flex-direction: column;
  gap: 8px;

  span {
    font-size: 13px;
    color: var(--text-color-secondary);
  }
}

.empty-tip {
  text-align: center;
  color: var(--text-color-placeholder);
  padding: 40px;
}

.empty-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-placeholder);
  font-size: 14px;
}
</style>