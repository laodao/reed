<template>
  <div class="knowledge-base-page">
    <!-- 左侧边栏 - 知识库列表 -->
    <div class="page-sidebar">
      <div class="sidebar-header">
        <h3>知识库</h3>
        <el-button type="primary" size="small" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div class="sidebar-content">
        <el-scrollbar>
          <div v-if="isLoading" class="loading-state">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <div v-else-if="knowledgeBases.length === 0" class="empty-state">
            <el-icon><FolderOpened /></el-icon>
            <span>暂无知识库</span>
            <el-button type="primary" text @click="openCreateDialog">
              创建第一个知识库
            </el-button>
          </div>

          <div v-else class="kb-list">
            <div
              v-for="kb in knowledgeBases"
              :key="kb.id"
              class="kb-item"
              :class="{ active: currentKnowledgeBase?.id === kb.id }"
              @click="selectKnowledgeBase(kb.id)"
            >
              <div class="kb-icon">
                <el-icon><Folder /></el-icon>
              </div>
              <div class="kb-info">
                <div class="kb-name">{{ kb.name }}</div>
                <div class="kb-stats">
                  <span>{{ kb.documentCount }} 文档</span>
                  <span>{{ kb.vectorCount }} 向量</span>
                </div>
              </div>
              <div class="kb-actions">
                <el-dropdown trigger="click" @command="handleKbAction($event, kb)">
                  <el-button text size="small">
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="edit">编辑</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="page-main">
      <!-- 未选择知识库时显示 -->
      <div v-if="!hasCurrentKnowledgeBase" class="empty-main">
        <el-icon :size="64" color="#c0c4cc"><FolderOpened /></el-icon>
        <h3>选择或创建知识库</h3>
        <p>从左侧选择一个知识库，或创建新的知识库</p>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新建知识库
        </el-button>
      </div>

      <!-- 已选择知识库时显示 -->
      <template v-else>
        <!-- 知识库标题栏 -->
        <div class="main-header">
          <div class="header-left">
            <h2>{{ currentKnowledgeBase?.name }}</h2>
            <span v-if="currentKnowledgeBase?.description" class="description">
              {{ currentKnowledgeBase.description }}
            </span>
          </div>
          <div class="header-right">
            <el-button @click="openSearchPanel = true">
              <el-icon><Search /></el-icon>
              检索知识库
            </el-button>
            <el-button type="primary" @click="selectAndUploadFiles">
              <el-icon><Upload /></el-icon>
              上传文档
            </el-button>
          </div>
        </div>

        <!-- 统计信息 -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-value">{{ currentKnowledgeBase?.documentCount || 0 }}</span>
            <span class="stat-label">文档</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ currentKnowledgeBase?.vectorCount || 0 }}</span>
            <span class="stat-label">向量</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ formatFileSize(currentKnowledgeBase?.totalSize || 0) }}</span>
            <span class="stat-label">总大小</span>
          </div>
        </div>

        <!-- 文档列表 -->
        <div class="document-section">
          <div class="section-header">
            <h3>文档列表</h3>
            <span class="doc-count">共 {{ documentCount }} 个文档</span>
          </div>

          <el-table
            :data="documents"
            v-loading="isLoading"
            style="width: 100%"
          >
            <el-table-column prop="name" label="文件名" min-width="200">
              <template #default="{ row }">
                <div class="doc-name">
                  <el-icon><Document /></el-icon>
                  <span>{{ row.name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="fileType" label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.fileType.toUpperCase() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="fileSize" label="大小" width="100">
              <template #default="{ row }">
                {{ formatFileSize(row.fileSize) }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="160">
              <template #default="{ row }">
                <div class="status-cell">
                  <el-tag :type="getStatusType(row.status)" size="small">
                    {{ getStatusText(row.status) }}
                  </el-tag>
                  <template v-if="row.status === 'processing'">
                    <el-progress
                      :percentage="row.progress"
                      :stroke-width="4"
                      :show-text="false"
                    />
                    <span v-if="getEstimatedTime(row.id)" class="estimated-time">
                      {{ formatEstimatedTime(getEstimatedTime(row.id)!) }}
                    </span>
                  </template>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="chunkCount" label="切片数" width="100">
              <template #default="{ row }">
                {{ row.chunkCount || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="上传时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'failed'"
                  text
                  type="primary"
                  size="small"
                  @click="reprocessDocument(row.id)"
                >
                  重试
                </el-button>
                <el-button
                  text
                  type="danger"
                  size="small"
                  @click="handleDeleteDocument(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </div>

    <!-- 创建知识库对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="创建知识库"
      width="500px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="100px"
      >
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="请输入知识库名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入知识库描述（可选）"
          />
        </el-form-item>
        <el-form-item label="Embedding" prop="embeddingModel">
          <el-select
            v-model="createForm.embeddingModel"
            placeholder="选择 Embedding 模型"
            style="width: 100%"
            @change="handleEmbeddingModelChange"
          >
            <el-option
              v-for="model in embeddingModels"
              :key="model.id"
              :label="model.name"
              :value="model.id"
            >
              <div class="model-option">
                <span>{{ model.name }}</span>
                <span class="model-dimension">{{ model.dimension }}维</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="embeddingModels.length === 0" class="form-tip">
            请先在设置中添加提供商并启用 Embedding 模型
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="isLoading" @click="handleCreateKnowledgeBase">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑知识库对话框 -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑知识库"
      width="500px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-width="100px"
      >
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" placeholder="请输入知识库名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入知识库描述（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="isLoading" @click="handleUpdateKnowledgeBase">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 检索面板 -->
    <el-drawer
      v-model="openSearchPanel"
      title="检索知识库"
      direction="rtl"
      size="500px"
    >
      <div class="search-panel">
        <div class="search-input-section">
          <el-input
            v-model="searchQuery"
            type="textarea"
            :rows="3"
            placeholder="输入检索内容..."
            @keyup.enter="handleSearch"
          />
        </div>

        <div class="search-options">
          <el-form label-width="80px" size="small">
            <el-form-item label="返回数量">
              <el-input-number v-model="searchTopK" :min="1" :max="20" />
            </el-form-item>
            <el-form-item label="向量权重">
              <el-slider v-model="searchVectorWeight" :min="0" :max="1" :step="0.1" />
            </el-form-item>
          </el-form>
        </div>

        <div class="search-actions">
          <el-button @click="clearSearchResults">清除</el-button>
          <el-button type="primary" :loading="isSearching" @click="handleSearch">
            检索
          </el-button>
        </div>

        <div class="search-results">
          <h4 v-if="searchResults.length > 0">检索结果 ({{ searchResults.length }})</h4>
          <el-scrollbar max-height="calc(100vh - 350px)">
            <div
              v-for="(result, index) in searchResults"
              :key="result.chunkId"
              class="result-item"
            >
              <div class="result-header">
                <span class="result-index">#{{ index + 1 }}</span>
                <span class="result-score">相似度: {{ result.score.toFixed(4) }}</span>
                <span class="result-doc">{{ result.documentName }}</span>
              </div>
              <div class="result-content">{{ result.content }}</div>
            </div>
            <div v-if="searchResults.length === 0 && !isSearching" class="no-results">
              <el-icon><Search /></el-icon>
              <span>输入关键词开始检索</span>
            </div>
          </el-scrollbar>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, toRaw } from 'vue'
import {
  Plus,
  FolderOpened,
  Folder,
  MoreFilled,
  Search,
  Upload,
  Document,
  Loading
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useKnowledgeBase } from '@/composables'
import type { KnowledgeBase, KbDocument } from '../../../shared/types/knowledge-base.types'

// 使用知识库 composable
const {
  // 状态
  knowledgeBases,
  currentKnowledgeBase,
  documents,
  searchResults,
  isLoading,
  isSearching,
  hasCurrentKnowledgeBase,
  documentCount,
  embeddingModels,
  hasEmbeddingModels,
  error,
  documentEstimatedTimes,

  // 对话框
  showCreateDialog,
  createForm,
  showEditDialog,
  editForm,

  // 检索
  searchQuery,
  searchTopK,
  searchVectorWeight,

  // 方法
  selectKnowledgeBase,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  openCreateDialog,
  openEditDialog,
  selectAndUploadFiles,
  deleteDocument,
  reprocessDocument,
  searchKnowledgeBase,
  clearSearchResults,
  selectEmbeddingModel,

  // 工具函数
  formatFileSize,
  formatDate,
  getStatusType,
  getStatusText,
  formatEstimatedTime,
  getEstimatedTime
} = useKnowledgeBase()

// 表单引用
const createFormRef = ref<FormInstance>()
const editFormRef = ref<FormInstance>()

// 检索面板
const openSearchPanel = ref(false)

// 编辑的知识库
const editingKb = ref<KnowledgeBase | null>(null)

// 创建表单校验规则
const createRules: FormRules = {
  name: [
    { required: true, message: '请输入知识库名称', trigger: 'blur' },
    { min: 2, max: 50, message: '名称长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  embeddingModel: [
    { required: true, message: '请选择 Embedding 模型', trigger: 'change' }
  ]
}

// 编辑表单校验规则
const editRules: FormRules = {
  name: [
    { required: true, message: '请输入知识库名称', trigger: 'blur' },
    { min: 2, max: 50, message: '名称长度在 2 到 50 个字符', trigger: 'blur' }
  ]
}

/**
 * 处理知识库操作
 */
function handleKbAction(action: string, kb: KnowledgeBase): void {
  if (action === 'edit') {
    editingKb.value = kb
    editForm.value = {
      name: kb.name,
      description: kb.description || ''
    }
    showEditDialog.value = true
  } else if (action === 'delete') {
    ElMessageBox.confirm(
      `确定要删除知识库 "${kb.name}" 吗？删除后将无法恢复，所有文档和向量数据都将被删除。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    ).then(async () => {
      const success = await deleteKnowledgeBase(kb.id)
      if (success) {
        ElMessage.success('删除成功')
      }
    }).catch(() => {
      // 取消删除
    })
  }
}

/**
 * 处理 Embedding 模型选择变化
 */
function handleEmbeddingModelChange(modelId: string): void {
  const model = toRaw(embeddingModels.value.find(m => m.id === modelId))
  if (model) {
    selectEmbeddingModel(model)
  }
}

/**
 * 创建知识库
 */
async function handleCreateKnowledgeBase(): Promise<void> {
  if (!createFormRef.value) return

  try {
    await createFormRef.value.validate()
    const result = await createKnowledgeBase()
    if (result) {
      ElMessage.success('创建成功')
      // 选中新创建的知识库
      selectKnowledgeBase(result.id)
    } else if (error.value) {
      ElMessage.error(error.value)
    }
  } catch (err) {
    console.error('表单验证失败:', err)
  }
}

/**
 * 更新知识库
 */
async function handleUpdateKnowledgeBase(): Promise<void> {
  if (!editFormRef.value || !editingKb.value) return

  await editFormRef.value.validate(async (valid) => {
    if (valid) {
      const success = await updateKnowledgeBase()
      if (success) {
        ElMessage.success('保存成功')
      }
    }
  })
}

/**
 * 删除文档
 */
async function handleDeleteDocument(doc: KbDocument): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要删除文档 "${doc.name}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = await deleteDocument(doc.id)
    if (success) {
      ElMessage.success('删除成功')
    }
  } catch {
    // 取消删除
  }
}

/**
 * 检索
 */
async function handleSearch(): Promise<void> {
  if (!searchQuery.value.trim()) {
    ElMessage.warning('请输入检索内容')
    return
  }

  await searchKnowledgeBase()
}
</script>

<style scoped>
.knowledge-base-page {
  display: flex;
  height: 100%;
  background-color: var(--el-bg-color-page);
}

/* 左侧边栏 */
.page-sidebar {
  width: 280px;
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--el-text-color-secondary);
  gap: 8px;
}

.kb-list {
  padding: 8px;
}

.kb-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.kb-item:hover {
  background-color: var(--el-fill-color-light);
}

.kb-item.active {
  background-color: var(--el-color-primary-light-9);
}

.kb-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background-color: var(--el-color-primary-light-8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  margin-right: 12px;
}

.kb-info {
  flex: 1;
  min-width: 0;
}

.kb-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-stats {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  gap: 12px;
}

.kb-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.kb-item:hover .kb-actions {
  opacity: 1;
}

/* 主内容区域 */
.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
}

.empty-main h3 {
  margin: 0;
  color: var(--el-text-color-primary);
}

.empty-main p {
  margin: 0;
}

/* 主区域头部 */
.main-header {
  padding: 20px 24px;
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
}

.header-left .description {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.header-right {
  display: flex;
  gap: 12px;
}

/* 统计栏 */
.stats-bar {
  padding: 16px 24px;
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  gap: 32px;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.stat-label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

/* 文档区域 */
.document-section {
  flex: 1;
  padding: 20px 24px;
  overflow: auto;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
}

.doc-count {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.doc-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.estimated-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 检索面板 */
.search-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-input-section {
  margin-bottom: 16px;
}

.search-options {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
}

.search-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}

.search-results {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-results h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.result-item {
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 12px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
}

.result-index {
  font-weight: 600;
  color: var(--el-color-primary);
}

.result-score {
  color: var(--el-text-color-secondary);
}

.result-doc {
  color: var(--el-text-color-secondary);
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
  gap: 8px;
}

/* 模型选项 */
.model-option {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.model-dimension {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>