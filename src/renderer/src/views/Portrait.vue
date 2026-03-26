<template>
  <div class="portrait-page">
    <!-- 左侧边栏 - 项目列表 -->
    <div class="page-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">人像项目</span>
        <el-button type="primary" size="small" @click="handleCreateProject">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>
      <div class="project-list">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-item"
          :class="{ active: selectedProjectId === project.id }"
          @click="selectProject(project.id)"
        >
          <div class="project-preview">
            <el-image
              v-if="getProjectPreview(project.id)"
              :src="getProjectPreview(project.id)"
              fit="cover"
            >
              <template #error>
                <div class="preview-placeholder">
                  <el-icon><User /></el-icon>
                </div>
              </template>
            </el-image>
            <div v-else class="preview-placeholder">
              <el-icon><User /></el-icon>
            </div>
          </div>
          <div class="project-info">
            <div class="project-name">{{ project.name }}</div>
            <div class="project-date">{{ formatDate(project.createdAt) }}</div>
          </div>
          <el-dropdown trigger="click" @command="handleProjectCommand($event, project)">
            <el-button link size="small">
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">重命名</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <el-empty v-if="projects.length === 0" description="还没有人像项目" />
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 未选择项目时显示引导 -->
      <template v-if="!selectedProjectId">
        <div class="empty-state">
          <el-icon :size="64" color="#c0c4cc"><User /></el-icon>
          <p>请选择一个项目，或点击"新建"创建新项目</p>
        </div>
      </template>

      <!-- 选择项目后显示项目详情 -->
      <template v-else>
        <div class="project-detail">
          <div class="detail-header">
            <div class="detail-title">
              <h3>{{ selectedProject?.name }}</h3>
              <span class="detail-prompt" v-if="selectedProject?.prompt">{{ selectedProject.prompt }}</span>
            </div>
            <div class="detail-actions" v-if="hasFrontImage">
              <!-- 只有正面图时显示生成多角度按钮 -->
              <el-button v-if="!hasOtherAngles" type="success" @click="handleGenerateAngles">
                <el-icon><RefreshRight /></el-icon>
                生成多角度
              </el-button>
              <el-button @click="handleChangeClothes">
                <el-icon><EditPen /></el-icon>
                换衣
              </el-button>
              <el-button @click="handleChangeBackground">
                <el-icon><PictureFilled /></el-icon>
                换背景
              </el-button>
              <el-button type="primary" @click="handleExport">
                <el-icon><Download /></el-icon>
                导出
              </el-button>
            </div>
          </div>

          <!-- 没有正面形象时显示第一步生成面板 -->
          <div class="generator-section" v-if="!hasFrontImage">
            <div class="step-indicator">
              <el-steps :active="0" simple>
                <el-step title="第一步" description="生成正面形象" />
                <el-step title="第二步" description="生成侧面和背面" />
              </el-steps>
            </div>
            <PortraitGenerator
              ref="generatorRef"
              :project-id="selectedProjectId"
              :angles="['front']"
              @generated="handleFrontGenerated"
            />
          </div>

          <!-- 有正面形象但没有其他角度时显示第二步 -->
          <div class="generator-section" v-else-if="hasFrontImage && !hasOtherAngles">
            <div class="step-indicator">
              <el-steps :active="1" simple>
                <el-step title="第一步" description="生成正面形象" status="success" />
                <el-step title="第二步" description="生成侧面和背面" />
              </el-steps>
            </div>
            <div class="angle-generator">
              <div class="front-preview">
                <h4>正面形象已生成</h4>
                <div class="preview-image">
                  <el-image :src="frontVariant?.imagePath" fit="contain" @dblclick="handlePreviewImage(frontVariant)" />
                </div>
              </div>
              <div class="angle-options">
                <h4>选择要生成的角度</h4>
                <el-checkbox-group v-model="anglesToGenerate">
                  <el-checkbox value="left">左侧</el-checkbox>
                  <el-checkbox value="right">右侧</el-checkbox>
                  <el-checkbox value="back">背面</el-checkbox>
                </el-checkbox-group>
                <el-button
                  type="primary"
                  :disabled="anglesToGenerate.length === 0 || generatingAngles"
                  :loading="generatingAngles"
                  @click="doGenerateAngles"
                >
                  生成选中的角度
                </el-button>
              </div>
            </div>
          </div>

          <!-- 有完整形象时显示图片列表 -->
          <template v-else>
            <!-- 基础形象 -->
            <div class="variant-section">
              <div class="section-header">
                <h4 class="section-title">基础形象</h4>
                <el-button v-if="!hasAllAngles" size="small" @click="showAngleGenerator = true">
                  补充角度
                </el-button>
              </div>
              <div class="variant-grid">
                <div
                  v-for="variant in baseVariants"
                  :key="variant.id"
                  class="variant-card"
                >
                  <el-image :src="variant.imagePath" fit="contain" @dblclick="handlePreviewImage(variant)" />
                  <div class="variant-info">
                    <span class="variant-angle">{{ ANGLE_LABELS[variant.angle] }}</span>
                    <el-button
                      type="danger"
                      size="small"
                      circle
                      @click="handleDeleteVariant(variant)"
                    >
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 换衣变体 -->
            <div class="variant-section" v-if="clothesVariants.length > 0">
              <h4 class="section-title">换衣变体</h4>
              <div class="variant-grid">
                <div
                  v-for="variant in clothesVariants"
                  :key="variant.id"
                  class="variant-card"
                >
                  <el-image :src="variant.imagePath" fit="contain" @dblclick="handlePreviewImage(variant)" />
                  <div class="variant-info">
                    <div>
                      <span class="variant-angle">{{ ANGLE_LABELS[variant.angle] }}</span>
                      <span class="variant-desc">{{ variant.variantInfo?.clothesDescription }}</span>
                    </div>
                    <el-button
                      type="danger"
                      size="small"
                      circle
                      @click="handleDeleteVariant(variant)"
                    >
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 换背景变体 -->
            <div class="variant-section" v-if="backgroundVariants.length > 0">
              <h4 class="section-title">换背景变体</h4>
              <div class="variant-grid">
                <div
                  v-for="variant in backgroundVariants"
                  :key="variant.id"
                  class="variant-card"
                >
                  <el-image :src="variant.imagePath" fit="contain" @dblclick="handlePreviewImage(variant)" />
                  <div class="variant-info">
                    <div>
                      <span class="variant-angle">{{ ANGLE_LABELS[variant.angle] }}</span>
                      <span class="variant-desc">{{ variant.variantInfo?.backgroundDescription }}</span>
                    </div>
                    <el-button
                      type="danger"
                      size="small"
                      circle
                      @click="handleDeleteVariant(variant)"
                    >
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>

    <!-- 创建项目对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="创建人像项目"
      width="400px"
    >
      <el-form :model="newProjectForm" label-width="80px">
        <el-form-item label="项目名称">
          <el-input v-model="newProjectForm.name" placeholder="请输入项目名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCreateProject" :loading="creating">确定</el-button>
      </template>
    </el-dialog>

    <!-- 补充角度对话框 -->
    <el-dialog
      v-model="showAngleGenerator"
      title="补充角度"
      width="400px"
    >
      <div class="angle-dialog-content">
        <p>选择要补充的角度：</p>
        <el-checkbox-group v-model="anglesToGenerate">
          <el-checkbox v-if="!hasAngle('left')" value="left">左侧</el-checkbox>
          <el-checkbox v-if="!hasAngle('right')" value="right">右侧</el-checkbox>
          <el-checkbox v-if="!hasAngle('back')" value="back">背面</el-checkbox>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="showAngleGenerator = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="anglesToGenerate.length === 0 || generatingAngles"
          :loading="generatingAngles"
          @click="doGenerateAngles"
        >
          生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 图片预览对话框 -->
    <el-dialog
      v-model="showPreviewDialog"
      :title="previewVariant ? ANGLE_LABELS[previewVariant.angle] : ''"
      width="90%"
      :close-on-click-modal="true"
      class="preview-dialog"
      append-to-body
      destroy-on-close
    >
      <div class="preview-image-container" v-if="previewVariant">
        <img :src="previewVariant.imagePath" alt="预览图片" />
      </div>
    </el-dialog>

    <!-- 换衣对话框 -->
    <ChangeClothesDialog
      v-model="showClothesDialog"
      :project-id="selectedProjectId"
      @success="loadVariants"
    />

    <!-- 换背景对话框 -->
    <ChangeBackgroundDialog
      v-model="showBackgroundDialog"
      :project-id="selectedProjectId"
      @success="loadVariants"
    />

    <!-- 导出对话框 -->
    <ExportDialog
      v-model="showExportDialog"
      :project-id="selectedProjectId"
      :variants="variants"
      @success="handleExportSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, User, MoreFilled, PictureFilled, Download, EditPen, Delete, RefreshRight } from '@element-plus/icons-vue'
import PortraitGenerator from '@/components/portrait/PortraitGenerator.vue'
import ChangeClothesDialog from '@/components/portrait/ChangeClothesDialog.vue'
import ChangeBackgroundDialog from '@/components/portrait/ChangeBackgroundDialog.vue'
import ExportDialog from '@/components/portrait/ExportDialog.vue'
import { ANGLE_LABELS } from '../../../shared/types/portrait.types'
import type { PortraitProject, PortraitVariant, PortraitAngle } from '../../../shared/types/portrait.types'

// ==================== 状态 ====================

const projects = ref<PortraitProject[]>([])
const variants = ref<PortraitVariant[]>([])
const selectedProjectId = ref<string>('')
const generatorRef = ref<InstanceType<typeof PortraitGenerator> | null>(null)

// 对话框状态
const showCreateDialog = ref(false)
const showClothesDialog = ref(false)
const showBackgroundDialog = ref(false)
const showExportDialog = ref(false)
const showAngleGenerator = ref(false)
const showPreviewDialog = ref(false)
const newProjectForm = ref({ name: '' })
const creating = ref(false)

// 角度生成
const anglesToGenerate = ref<PortraitAngle[]>(['left', 'right', 'back'])
const generatingAngles = ref(false)

// 图片预览
const previewVariant = ref<PortraitVariant | null>(null)

// ==================== 计算属性 ====================

const selectedProject = computed(() =>
  projects.value.find(p => p.id === selectedProjectId.value)
)

const baseVariants = computed(() =>
  variants.value.filter(v => v.type === 'base').sort((a, b) => {
    const order = ['front', 'left', 'right', 'back']
    return order.indexOf(a.angle) - order.indexOf(b.angle)
  })
)

const clothesVariants = computed(() =>
  variants.value.filter(v => v.type === 'clothes')
)

const backgroundVariants = computed(() =>
  variants.value.filter(v => v.type === 'background')
)

const frontVariant = computed(() =>
  baseVariants.value.find(v => v.angle === 'front')
)

const hasFrontImage = computed(() =>
  baseVariants.value.some(v => v.angle === 'front')
)

const hasOtherAngles = computed(() =>
  baseVariants.value.some(v => v.angle !== 'front')
)

const hasAllAngles = computed(() => {
  const angles = new Set(baseVariants.value.map(v => v.angle))
  return angles.has('front') && angles.has('left') && angles.has('right') && angles.has('back')
})

// ==================== 方法 ====================

function hasAngle(angle: PortraitAngle): boolean {
  return baseVariants.value.some(v => v.angle === angle)
}

async function loadProjects() {
  const result = await window.electronAPI.portrait.listProjects()
  if (result.success && result.data) {
    projects.value = result.data.projects
  }
}

async function loadVariants() {
  if (!selectedProjectId.value) return
  const result = await window.electronAPI.portrait.listVariants(selectedProjectId.value)
  if (result.success && result.data) {
    variants.value = result.data
  }
}

function selectProject(id: string) {
  selectedProjectId.value = id
  loadVariants()
}

function getProjectPreview(projectId: string): string {
  const projectVariants = variants.value.filter(v => v.projectId === projectId && v.type === 'base' && v.angle === 'front')
  return projectVariants[0]?.imagePath || ''
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function handleFrontGenerated(projectId: string) {
  loadProjects()
  loadVariants()
}

function handleGenerateAngles() {
  anglesToGenerate.value = ['left', 'right', 'back'].filter(a => !hasAngle(a)) as PortraitAngle[]
  showAngleGenerator.value = true
}

async function doGenerateAngles() {
  if (anglesToGenerate.value.length === 0) return

  generatingAngles.value = true
  showAngleGenerator.value = false

  try {
    const result = await window.electronAPI.portrait.generateAngles({
      projectId: selectedProjectId.value,
      angles: [...anglesToGenerate.value] as PortraitAngle[]
    })

    if (result.success) {
      ElMessage.success('多角度生成成功')
      loadVariants()
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generatingAngles.value = false
  }
}

function handlePreviewImage(variant: PortraitVariant) {
  previewVariant.value = variant
  showPreviewDialog.value = true
}

async function handleDeleteVariant(variant: PortraitVariant) {
  try {
    await ElMessageBox.confirm('确定要删除此图片吗？', '删除确认', {
      type: 'warning'
    })
    const result = await window.electronAPI.portrait.deleteVariant(variant.id)
    if (result.success) {
      ElMessage.success('删除成功')
      loadVariants()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

function handleCreateProject() {
  newProjectForm.value.name = ''
  showCreateDialog.value = true
}

async function confirmCreateProject() {
  if (!newProjectForm.value.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }

  creating.value = true
  try {
    const result = await window.electronAPI.portrait.createProject({
      name: newProjectForm.value.name.trim(),
      prompt: '',
      providerId: '',
      modelId: ''
    })

    if (result.success && result.data) {
      ElMessage.success('项目创建成功')
      showCreateDialog.value = false
      await loadProjects()
      selectProject(result.data.id)
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleProjectCommand(command: string, project: PortraitProject) {
  if (command === 'delete') {
    try {
      await ElMessageBox.confirm('确定要删除此项目吗？所有相关的图片都将被删除。', '删除确认', {
        type: 'warning'
      })
      const result = await window.electronAPI.portrait.deleteProject(project.id)
      if (result.success) {
        ElMessage.success('删除成功')
        if (selectedProjectId.value === project.id) {
          selectedProjectId.value = ''
        }
        loadProjects()
      } else {
        ElMessage.error(result.error || '删除失败')
      }
    } catch {
      // 用户取消
    }
  } else if (command === 'rename') {
    const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
      inputValue: project.name
    })
    if (value) {
      const result = await window.electronAPI.portrait.updateProject({
        id: project.id,
        name: value
      })
      if (result.success) {
        ElMessage.success('重命名成功')
        loadProjects()
      } else {
        ElMessage.error(result.error || '重命名失败')
      }
    }
  }
}

function handleChangeClothes() {
  showClothesDialog.value = true
}

function handleChangeBackground() {
  showBackgroundDialog.value = true
}

function handleExport() {
  showExportDialog.value = true
}

function handleExportSuccess(filePath: string) {
  console.log('导出完成:', filePath)
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await loadProjects()
  window.electronAPI.portrait.onGenerationEvent((data) => {
    if (data.type === 'generation-completed') {
      loadProjects()
      loadVariants()
    }
  })
})
</script>

<style lang="scss" scoped>
.portrait-page {
  display: flex;
  height: 100%;
  background: #f5f7fa;
  overflow: hidden;
}

.page-sidebar {
  width: 280px;
  height: 100%;
  background: #fff;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.project-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: var(--el-color-primary-light-9);
  }
}

.project-preview {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color);
  margin-right: 12px;

  .el-image {
    width: 100%;
    height: 100%;
  }

  .preview-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);
  }
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);

  p {
    margin-top: 16px;
    font-size: 14px;
  }
}

.generator-section {
  padding: 20px;
  overflow-y: auto;
}

.step-indicator {
  margin-bottom: 24px;
}

.angle-generator {
  display: flex;
  gap: 32px;
  padding: 20px;
  background: #fff;
  border-radius: 12px;

  .front-preview {
    h4 {
      margin: 0 0 12px;
      color: var(--el-text-color-primary);
    }

    .preview-image {
      width: 256px;
      height: 256px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--el-fill-color);
      cursor: pointer;

      :deep(.el-image) {
        width: 100%;
        height: 100%;
      }
    }
  }

  .angle-options {
    flex: 1;

    h4 {
      margin: 0 0 12px;
      color: var(--el-text-color-primary);
    }

    .el-checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }
  }
}

.project-detail {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.detail-title {
  h3 {
    margin: 0;
    font-size: 20px;
    color: var(--el-text-color-primary);
  }

  .detail-prompt {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
  }
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.variant-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin: 0 0 12px;
}

.variant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.variant-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .el-image {
    width: 100%;
    height: 200px;
    background: var(--el-fill-color);
    cursor: pointer;
  }

  .variant-info {
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .variant-angle {
    font-size: 14px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .variant-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-left: 8px;
  }
}

.angle-dialog-content {
  p {
    margin-bottom: 12px;
  }

  .el-checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}
</style>

<!-- 全屏预览对话框样式（非 scoped） -->
<style lang="scss">
// 遮罩层禁止滚动
.el-overlay {
  overflow: hidden !important;
}

// preview-dialog 类直接加在 el-dialog 上
.el-dialog.preview-dialog {
  width: 90vw !important;
  height: 90vh !important;
  max-width: 90vw !important;
  max-height: 90vh !important;
  margin: 0 !important;
  position: fixed !important;
  top: 5vh !important;
  left: 5vw !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;

  .el-dialog__header {
    flex-shrink: 0 !important;
  }

  .el-dialog__body {
    flex: 1 !important;
    min-height: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
}

// 图片容器 - 填满 body，图片自适应缩放
.preview-image-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}
</style>