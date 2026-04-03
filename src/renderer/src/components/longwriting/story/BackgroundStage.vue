<template>
  <div class="background-stage">
    <div class="stage-header">
      <div class="header-left">
        <h2>时代背景与地点设定</h2>
        <p class="stage-desc">设定故事发生的时代背景和主要地点场景</p>
      </div>
      <!-- 保存状态提示 -->
      <span v-if="saveStatus !== 'idle'" class="save-status" :class="saveStatus">
        {{ saveStatusText }}
      </span>
    </div>

    <el-tabs v-model="activeTab" class="background-tabs">
      <!-- 时代背景 -->
      <el-tab-pane label="时代背景" name="era">
        <div class="era-form">
          <!-- 时代类型 -->
          <div class="form-row">
            <label class="form-label">时代类型</label>
            <el-radio-group v-model="eraForm.eraType" class="era-type-group">
              <el-radio-button value="ancient">古代</el-radio-button>
              <el-radio-button value="modern">现代</el-radio-button>
              <el-radio-button value="future">未来</el-radio-button>
              <el-radio-button value="fictional">架空</el-radio-button>
            </el-radio-group>
          </div>

          <!-- 时代描述 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">时代描述</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'eraDescription'"
                  :disabled="!eraForm.eraDescription.trim()"
                  @click="polishField('eraDescription')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.eraDescription"
              type="textarea"
              :rows="4"
              placeholder="描述故事发生的时代背景，如朝代、历史时期、虚构纪元等..."
              resize="none"
            />
          </div>

          <!-- 社会结构 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">社会结构</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'socialStructure'"
                  :disabled="!eraForm.socialStructure.trim()"
                  @click="polishField('socialStructure')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.socialStructure"
              type="textarea"
              :rows="3"
              placeholder="描述社会阶层、权力结构、等级制度等..."
              resize="none"
            />
          </div>

          <!-- 技术水平 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">技术水平</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'techLevel'"
                  :disabled="!eraForm.techLevel.trim()"
                  @click="polishField('techLevel')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.techLevel"
              type="textarea"
              :rows="2"
              placeholder="描述科技发展水平、生产力状况、特殊技术等..."
              resize="none"
            />
          </div>

          <!-- 特殊设定 -->
          <div class="form-row">
            <label class="form-label">特殊设定</label>
            <el-input
              v-model="eraForm.specialRules"
              type="textarea"
              :rows="3"
              placeholder="架空世界的特殊规则、魔法体系、修仙等级等..."
              resize="none"
            />
          </div>

          <!-- 保存按钮 -->
          <div class="form-actions">
            <el-button type="primary" :loading="saveStatus === 'saving'" @click="saveBackground">
              <el-icon><Check /></el-icon>
              保存设定
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 地点设定 -->
      <el-tab-pane label="地点设定" name="locations">
        <div class="location-list">
          <div v-for="location in locations" :key="location.id" class="location-card">
            <div class="location-info">
              <h4>{{ location.name }}</h4>
              <div class="location-tags">
                <el-tag size="small" type="info">{{ getLocationTypeLabel(location.type) }}</el-tag>
                <el-tag size="small">{{ getImportanceLabel(location.importance) }}</el-tag>
              </div>
              <p class="location-desc">{{ location.description }}</p>
            </div>
            <div class="location-actions">
              <el-button text @click="editLocation(location)">编辑</el-button>
              <el-button text type="danger" @click="deleteLocation(location.id)">删除</el-button>
            </div>
          </div>
          <el-button type="primary" plain class="add-location-btn" @click="showLocationDialog = true">
            <el-icon><Plus /></el-icon>
            添加地点
          </el-button>
        </div>
      </el-tab-pane>

      <!-- 势力设定 -->
      <el-tab-pane label="势力设定" name="factions">
        <div class="faction-section">
          <!-- 势力类型筛选 -->
          <div class="faction-filter">
            <el-radio-group v-model="factionFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="country">国别</el-radio-button>
              <el-radio-button value="camp">阵营</el-radio-button>
              <el-radio-button value="sect">门派</el-radio-button>
            </el-radio-group>
          </div>

          <!-- 势力列表 -->
          <div class="faction-list">
            <div v-for="faction in filteredFactions" :key="faction.id" class="faction-card">
              <div class="faction-info">
                <div class="faction-header">
                  <h4>{{ faction.name }}</h4>
                  <el-tag size="small" :type="getFactionTagType(faction.factionType)">
                    {{ getFactionTypeLabel(faction.factionType) }}
                  </el-tag>
                </div>
                <div v-if="faction.locationId" class="faction-location">
                  <span class="label">所在地：</span>
                  <span>{{ getLocationName(faction.locationId) }}</span>
                </div>
                <p class="faction-desc">{{ faction.description }}</p>
              </div>
              <div class="faction-actions">
                <el-button text @click="editFaction(faction)">编辑</el-button>
                <el-button text type="danger" @click="deleteFaction(faction.id)">删除</el-button>
              </div>
            </div>
            <el-button type="primary" plain class="add-faction-btn" @click="showFactionDialog = true">
              <el-icon><Plus /></el-icon>
              添加势力
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 地点编辑对话框 -->
    <el-dialog v-model="showLocationDialog" title="添加地点" width="500px">
      <el-form :model="locationForm" label-width="80px">
        <el-form-item label="地点名称" required>
          <el-input v-model="locationForm.name" placeholder="输入地点名称" />
        </el-form-item>
        <el-form-item label="地点类型">
          <el-select v-model="locationForm.type" placeholder="选择地点类型">
            <el-option label="城市" value="city" />
            <el-option label="村庄" value="village" />
            <el-option label="山脉" value="mountain" />
            <el-option label="宫殿" value="palace" />
            <el-option label="森林" value="forest" />
            <el-option label="海域" value="sea" />
            <el-option label="建筑" value="building" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="重要程度">
          <el-radio-group v-model="locationForm.importance">
            <el-radio value="main">主要场景</el-radio>
            <el-radio value="important">重要场景</el-radio>
            <el-radio value="auxiliary">辅助场景</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="地点描述">
          <el-input
            v-model="locationForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述地点的环境特征、氛围..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLocationDialog = false">取消</el-button>
        <el-button type="primary" @click="saveLocation">保存</el-button>
      </template>
    </el-dialog>

    <!-- 势力编辑对话框 -->
    <el-dialog v-model="showFactionDialog" :title="editingFactionId ? '编辑势力' : '添加势力'" width="500px">
      <el-form :model="factionForm" label-width="80px">
        <el-form-item label="势力类型" required>
          <el-radio-group v-model="factionForm.factionType">
            <el-radio value="country">国别</el-radio>
            <el-radio value="camp">阵营</el-radio>
            <el-radio value="sect">门派</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="势力名称" required>
          <el-input v-model="factionForm.name" placeholder="输入势力名称" />
        </el-form-item>
        <el-form-item label="所在地">
          <el-select v-model="factionForm.locationId" placeholder="选择所在地（可选）" clearable>
            <el-option
              v-for="loc in locations"
              :key="loc.id"
              :label="loc.name"
              :value="loc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="主要特点">
          <el-input
            v-model="factionForm.description"
            type="textarea"
            :rows="4"
            placeholder="描述势力的主要特点、立场、特色等..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showFactionDialog = false">取消</el-button>
        <el-button type="primary" @click="saveFaction">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, inject, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, MagicStick, Check } from '@element-plus/icons-vue'
import type { ComputedRef } from 'vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件注入选中的模型（computed ref）
const selectedModelRef = inject<ComputedRef<{ providerConfigId: string; modelId: string } | null>>('selectedModel')
// 获取当前选中的模型值
const selectedModel = computed(() => selectedModelRef?.value)

const activeTab = ref('era')

// 时代背景表单
const eraForm = ref({
  eraType: 'ancient',
  eraDescription: '',
  socialStructure: '',
  techLevel: '',
  specialRules: ''
})

// 地点列表
const locations = ref<Array<{
  id: string
  name: string
  type: string
  importance: string
  description: string
}>>([])

// 地点对话框
const showLocationDialog = ref(false)
const editingLocationId = ref<string | null>(null)
const locationForm = ref({
  name: '',
  type: 'city',
  importance: 'important',
  description: ''
})

// 势力列表
const factions = ref<Array<{
  id: string
  projectId: string
  factionType: 'country' | 'camp' | 'sect'
  name: string
  locationId?: string
  description: string
  sortOrder: number
}>>([])

// 势力筛选
const factionFilter = ref<'all' | 'country' | 'camp' | 'sect'>('all')

// 筛选后的势力列表
const filteredFactions = computed(() => {
  if (factionFilter.value === 'all') {
    return factions.value
  }
  return factions.value.filter(f => f.factionType === factionFilter.value)
})

// 势力对话框
const showFactionDialog = ref(false)
const editingFactionId = ref<string | null>(null)
const factionForm = ref({
  factionType: 'country' as 'country' | 'camp' | 'sect',
  name: '',
  locationId: '',
  description: ''
})

// 加载状态
const loading = ref(false)
// 保存状态
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
// 润色状态
const polishingField = ref<'eraDescription' | 'socialStructure' | 'techLevel' | null>(null)
const polishingContent = ref('')

// 保存状态文字
const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saving': return '保存中...'
    case 'saved': return '已保存'
    default: return ''
  }
})

function getLocationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    city: '城市',
    village: '村庄',
    mountain: '山脉',
    palace: '宫殿',
    forest: '森林',
    sea: '海域',
    building: '建筑',
    other: '其他'
  }
  return labels[type] || type
}

function getImportanceLabel(importance: string): string {
  const labels: Record<string, string> = {
    main: '主要',
    important: '重要',
    auxiliary: '辅助'
  }
  return labels[importance] || importance
}

// 势力相关函数
function getFactionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    country: '国别',
    camp: '阵营',
    sect: '门派'
  }
  return labels[type] || type
}

function getFactionTagType(type: string): '' | 'success' | 'warning' | 'info' {
  const types: Record<string, '' | 'success' | 'warning' | 'info'> = {
    country: '',
    camp: 'success',
    sect: 'warning'
  }
  return types[type] || 'info'
}

function getLocationName(locationId: string): string {
  const location = locations.value.find(loc => loc.id === locationId)
  return location?.name || '未知'
}

// 加载势力列表
async function loadFactions() {
  console.log('[loadFactions] 加载势力列表, projectId:', props.projectId)
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getFactions(props.projectId)
  console.log('[loadFactions] 结果:', result)
  if (result.success) {
    factions.value = result.data || []
    console.log('[loadFactions] 势力数量:', factions.value.length)
  }
}

function editFaction(faction: any) {
  editingFactionId.value = faction.id
  factionForm.value = {
    factionType: faction.factionType,
    name: faction.name,
    locationId: faction.locationId || '',
    description: faction.description
  }
  showFactionDialog.value = true
}

async function deleteFaction(id: string) {
  const result = await window.electronAPI.longwriting.deleteFaction(id)
  if (result.success) {
    await loadFactions()
    ElMessage.success('势力已删除')
  }
}

async function saveFaction() {
  console.log('[saveFaction] 开始保存, projectId:', props.projectId)
  if (!factionForm.value.name) {
    ElMessage.warning('请输入势力名称')
    return
  }

  const formData = toRaw(factionForm.value)
  console.log('[saveFaction] formData:', formData)

  if (editingFactionId.value) {
    // 更新
    console.log('[saveFaction] 更新势力, id:', editingFactionId.value)
    const result = await window.electronAPI.longwriting.updateFaction(editingFactionId.value, formData)
    console.log('[saveFaction] 更新结果:', result)
    if (result.success) {
      ElMessage.success('势力已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    // 创建
    const createData = {
      projectId: props.projectId,
      ...formData
    }
    console.log('[saveFaction] 创建势力, data:', createData)
    const result = await window.electronAPI.longwriting.createFaction(createData)
    console.log('[saveFaction] 创建结果:', result)
    if (result.success) {
      ElMessage.success('势力已添加')
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  }

  showFactionDialog.value = false
  editingFactionId.value = null
  factionForm.value = {
    factionType: 'country',
    name: '',
    locationId: '',
    description: ''
  }
  await loadFactions()
  emit('update:progress', 35)
}

// 加载背景设定
async function loadBackground() {
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getBackground(props.projectId)
  if (result.success && result.data) {
    eraForm.value = {
      eraType: result.data.eraType || 'ancient',
      eraDescription: result.data.eraDescription || '',
      socialStructure: result.data.socialStructure || '',
      techLevel: result.data.techLevel || '',
      specialRules: result.data.specialRules || ''
    }
  }
}

// 保存背景设定
async function saveBackground() {
  console.log('saveBackground 被调用, projectId:', props.projectId)
  if (!props.projectId) return

  saveStatus.value = 'saving'
  // 使用 toRaw 将响应式对象转换为普通对象，避免 IPC 序列化错误
  const data = toRaw(eraForm.value)
  console.log('准备调用 updateBackground, data:', data)
  try {
    const result = await window.electronAPI.longwriting.updateBackground(props.projectId, data)
    console.log('updateBackground 返回结果:', result)
    if (result.success) {
      saveStatus.value = 'saved'
      emit('update:progress', 25)
      ElMessage.success('背景设定已保存')
      setTimeout(() => {
        saveStatus.value = 'idle'
      }, 2000)
    } else {
      saveStatus.value = 'idle'
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error) {
    console.error('updateBackground 调用出错:', error)
    saveStatus.value = 'idle'
    ElMessage.error('保存失败: ' + error)
  }
}

// 加载地点列表
async function loadLocations() {
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getLocations(props.projectId)
  if (result.success) {
    locations.value = result.data || []
  }
}

function editLocation(location: any) {
  editingLocationId.value = location.id
  locationForm.value = {
    name: location.name,
    type: location.type,
    importance: location.importance,
    description: location.description
  }
  showLocationDialog.value = true
}

async function deleteLocation(id: string) {
  const result = await window.electronAPI.longwriting.deleteLocation(id)
  if (result.success) {
    await loadLocations()
    ElMessage.success('地点已删除')
  }
}

async function saveLocation() {
  if (!locationForm.value.name) {
    ElMessage.warning('请输入地点名称')
    return
  }

  // 使用 toRaw 将响应式对象转换为普通对象
  const formData = toRaw(locationForm.value)

  if (editingLocationId.value) {
    // 更新
    const result = await window.electronAPI.longwriting.updateLocation(editingLocationId.value, formData)
    if (result.success) {
      ElMessage.success('地点已更新')
    }
  } else {
    // 创建
    const result = await window.electronAPI.longwriting.createLocation({
      projectId: props.projectId,
      ...formData
    })
    if (result.success) {
      ElMessage.success('地点已添加')
    }
  }

  showLocationDialog.value = false
  editingLocationId.value = null
  locationForm.value = {
    name: '',
    type: 'city',
    importance: 'important',
    description: ''
  }
  await loadLocations()
  emit('update:progress', 35)
}

// AI 润色功能
async function polishField(field: 'eraDescription' | 'socialStructure' | 'techLevel') {
  if (!props.projectId) return

  // 检查是否选择了模型
  if (!selectedModel.value?.providerConfigId || !selectedModel.value?.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  const content = eraForm.value[field]
  if (!content.trim()) {
    ElMessage.warning('请先输入内容')
    return
  }

  polishingField.value = field
  polishingContent.value = ''

  const eventId = `polish-${props.projectId}-${field}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        polishingContent.value += event.content
      } else if (event.type === 'done') {
        polishingField.value = null
        unsubscribe()
        // 更新表单内容
        eraForm.value[field] = polishingContent.value.trim()
        ElMessage.success('润色完成')
      } else if (event.type === 'error') {
        polishingField.value = null
        unsubscribe()
        ElMessage.error(event.error || '润色失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.polishBackground(
    eventId,
    props.projectId,
    field,
    eraForm.value.eraType,
    content,
    selectedModel.value.providerConfigId,
    selectedModel.value.modelId
  )

  if (!result.success) {
    polishingField.value = null
    unsubscribe()
    ElMessage.error(result.error || '润色失败')
  }
}

onMounted(() => {
  loadBackground()
  loadLocations()
  loadFactions()
})
</script>

<style lang="scss" scoped>
.background-stage {
  max-width: 900px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  .header-left {
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

  .save-status {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 16px;

    &.saving {
      color: var(--color-primary);
      background: var(--color-primary-light-9);
    }

    &.saved {
      color: var(--color-success);
      background: var(--color-success-light-9);
    }
  }
}

.background-tabs {
  :deep(.el-tabs__content) {
    padding: 20px 0;
  }
}

.era-form {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.form-row {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-regular);
  margin-bottom: 8px;
}

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  .form-label {
    margin-bottom: 0;
  }
}

.era-type-group {
  display: flex;
  gap: 0;

  :deep(.el-radio-button__inner) {
    border-radius: 0;
  }

  :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-radius: 8px 0 0 8px;
  }

  :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-radius: 0 8px 8px 0;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 8px;
  border-top: 1px solid var(--border-color-lighter);
}

.location-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.location-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  .location-info {
    flex: 1;

    h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--text-color-primary);
    }

    .location-tags {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .location-desc {
      margin: 0;
      font-size: 13px;
      color: var(--text-color-secondary);
      line-height: 1.6;
    }
  }

  .location-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .location-actions {
    opacity: 1;
  }
}

.add-location-btn {
  width: 100%;
  border-style: dashed;
}

// 势力设定样式
.faction-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.faction-filter {
  display: flex;
  justify-content: flex-start;
}

.faction-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.faction-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  .faction-info {
    flex: 1;

    .faction-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;

      h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        color: var(--text-color-primary);
      }
    }

    .faction-location {
      font-size: 13px;
      color: var(--text-color-secondary);
      margin-bottom: 8px;

      .label {
        color: var(--text-color-placeholder);
      }
    }

    .faction-desc {
      margin: 0;
      font-size: 13px;
      color: var(--text-color-secondary);
      line-height: 1.6;
    }
  }

  .faction-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .faction-actions {
    opacity: 1;
  }
}

.add-faction-btn {
  width: 100%;
  border-style: dashed;
}
</style>