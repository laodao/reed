<template>
  <div class="background-stage">
    <div class="stage-header">
      <h2>时代背景与地点设定</h2>
      <p class="stage-desc">设定故事发生的时代背景和主要地点场景</p>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 时代背景 -->
      <el-tab-pane label="时代背景" name="era">
        <el-form :model="eraForm" label-width="100px" class="content-form">
          <el-form-item label="时代类型">
            <el-radio-group v-model="eraForm.eraType">
              <el-radio value="ancient">古代</el-radio>
              <el-radio value="modern">现代</el-radio>
              <el-radio value="future">未来</el-radio>
              <el-radio value="fictional">架空</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="时代描述">
            <el-input
              v-model="eraForm.eraDescription"
              type="textarea"
              :rows="3"
              placeholder="描述故事发生的时代背景..."
            />
          </el-form-item>
          <el-form-item label="社会结构">
            <el-input
              v-model="eraForm.socialStructure"
              type="textarea"
              :rows="2"
              placeholder="描述社会结构、阶层划分..."
            />
          </el-form-item>
          <el-form-item label="技术水平">
            <el-input
              v-model="eraForm.techLevel"
              placeholder="描述技术水平、科技程度..."
            />
          </el-form-item>
          <el-form-item label="特殊设定">
            <el-input
              v-model="eraForm.specialRules"
              type="textarea"
              :rows="2"
              placeholder="架空世界的特殊规则、设定..."
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 地点设定 -->
      <el-tab-pane label="地点设定" name="locations">
        <div class="location-list">
          <div v-for="location in locations" :key="location.id" class="location-card">
            <div class="location-info">
              <h4>{{ location.name }}</h4>
              <span class="location-type">{{ getLocationTypeLabel(location.type) }}</span>
              <span class="location-importance">{{ getImportanceLabel(location.importance) }}</span>
            </div>
            <div class="location-actions">
              <el-button text @click="editLocation(location)">编辑</el-button>
              <el-button text type="danger" @click="deleteLocation(location.id)">删除</el-button>
            </div>
          </div>
          <el-button type="primary" plain @click="showLocationDialog = true">
            <el-icon><Plus /></el-icon>
            添加地点
          </el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

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

// 加载状态
const loading = ref(false)

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
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.updateBackground(props.projectId, eraForm.value)
  if (result.success) {
    emit('update:progress', 25)
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

  if (editingLocationId.value) {
    // 更新
    const result = await window.electronAPI.longwriting.updateLocation(editingLocationId.value, locationForm.value)
    if (result.success) {
      ElMessage.success('地点已更新')
    }
  } else {
    // 创建
    const result = await window.electronAPI.longwriting.createLocation({
      projectId: props.projectId,
      ...locationForm.value
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

// 监听背景表单变化自动保存
watch(eraForm, () => {
  saveBackground()
}, { deep: true })

onMounted(() => {
  loadBackground()
  loadLocations()
})
</script>

<style lang="scss" scoped>
.background-stage {
  max-width: 800px;
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

.content-form {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.location-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.location-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);

  .location-info {
    h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 500;
    }

    span {
      font-size: 12px;
      color: var(--text-color-secondary);
      margin-right: 8px;
    }
  }
}
</style>