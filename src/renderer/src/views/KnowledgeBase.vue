<template>
  <div class="knowledge-base-page">
    <!-- 左侧边栏 - 知识库列表 -->
    <div class="page-sidebar">
      <div class="sidebar-header">
        <h3>知识库</h3>
        <div class="sidebar-header-actions">
          <el-button text size="small" title="新建目录" @click="openCreateFolderDialog">
            <el-icon><FolderAdd /></el-icon>
          </el-button>
          <el-button type="primary" size="small" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
            新建
          </el-button>
        </div>
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
            <!-- 按目录分组展示（it 行业 / 能源行业 / 未分类） -->
            <template v-for="group in kbByFolder" :key="group.folderId ?? '__uncat__'">
              <div class="kb-group-header">
                <span class="kb-group-name">{{ group.folderName }}</span>
                <span class="kb-group-count">{{ group.items.length }}</span>
                <el-dropdown v-if="group.folderId" trigger="click" @command="(cmd: string) => cmd === 'rename' ? openRenameFolderDialog({ id: group.folderId, name: group.folderName }) : handleDeleteFolder({ id: group.folderId, name: group.folderName })">
                  <el-button text size="small" @click.stop>
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="rename">重命名</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>删除目录</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <div
                v-for="kb in group.items"
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
                <div class="kb-actions" @click.stop>
                  <el-dropdown trigger="click" @command="handleKbAction($event, kb)">
                    <el-button text size="small" @click.stop>
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
            </template>
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
            <el-button @click="showAddWebpageDialog = true">
              <el-icon><Link /></el-icon>
              添加网页
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

        <!-- D1：文档 / QA 问答对 两个数据面切换 -->
        <el-radio-group v-model="activeDataTab" size="small" style="margin-bottom: 12px">
          <el-radio-button value="docs">文档</el-radio-button>
          <el-radio-button value="qa">QA 问答对</el-radio-button>
        </el-radio-group>

        <!-- 文档列表 -->
        <div v-show="activeDataTab === 'docs'" class="document-section">
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
                  <!-- 失败时 hover 显示具体错误信息 -->
                  <el-tooltip
                    v-if="row.status === 'failed' && row.errorMessage"
                    :content="row.errorMessage"
                    placement="top"
                    :show-after="200"
                  >
                    <el-tag :type="getStatusType(row.status)" size="small" class="status-tag-error">
                      {{ getStatusText(row.status) }} ?
                    </el-tag>
                  </el-tooltip>
                  <el-tag v-else :type="getStatusType(row.status)" size="small">
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
            <el-table-column label="操作" width="200" fixed="right" class-name="action-column">
              <template #default="{ row }">
                <div class="action-buttons">
                  <el-button
                    v-if="row.status === 'completed'"
                    text
                    type="primary"
                    size="small"
                    @click="handleViewChunks(row)"
                  >
                    查看
                  </el-button>
                  <!-- pending/processing 之外都能重新处理：
                       failed 重试；completed 重建索引；pending（首次处理中断卡住的）手动触发 -->
                  <el-button
                    v-if="row.status === 'failed' || row.status === 'completed' || row.status === 'pending'"
                    text
                    type="primary"
                    size="small"
                    @click="handleReprocessDocument(row.id)"
                  >
                    {{ row.status === 'failed' ? '重试' : (row.status === 'pending' ? '处理' : '重新处理') }}
                  </el-button>
                  <el-button
                    text
                    type="danger"
                    size="small"
                    @click="handleDeleteDocument(row)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- D1 QA 问答对列表 -->
        <div v-if="activeDataTab === 'qa'" class="document-section">
          <div class="section-header">
            <h3>QA 问答对</h3>
            <span class="doc-count">共 {{ qaPairs.length }} 条（命中即直出答案，未命中走文档 RAG）</span>
            <div style="display: flex; gap: 8px">
              <el-button size="small" type="primary" @click="openQaDialog()">新增问答</el-button>
              <el-button size="small" @click="qaImportInput?.click()">导入 xlsx</el-button>
              <el-button size="small" @click="handleExportQa">导出 xlsx</el-button>
            </div>
          </div>
          <input ref="qaImportInput" type="file" accept=".xlsx" style="display: none" @change="handleImportQa" />
          <el-table :data="qaPairs" v-loading="qaLoading" style="width: 100%">
            <el-table-column prop="question" label="问题" min-width="220" show-overflow-tooltip />
            <el-table-column prop="answer" label="答案" min-width="260" show-overflow-tooltip />
            <el-table-column label="相似问题" min-width="180">
              <template #default="{ row }">
                <span>{{ (row.similarQuestions ?? []).join('；') || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openQaDialog(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDeleteQa(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </div>

    <!-- D1 QA 编辑对话框 -->
    <el-dialog v-model="qaDialogVisible" :title="qaEditingId ? '编辑问答' : '新增问答'" width="560px">
      <el-form label-position="top">
        <el-form-item label="问题" required>
          <el-input v-model="qaForm.question" placeholder="标准问法（检索主向量）" />
        </el-form-item>
        <el-form-item label="答案" required>
          <el-input v-model="qaForm.answer" type="textarea" :rows="3" placeholder="命中后直出的标准答案" />
        </el-form-item>
        <el-form-item label="相似问题（每行一个，同样向量化提升召回）">
          <el-input v-model="qaForm.similarText" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="qaDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="qaSaving" @click="handleSaveQa">保存</el-button>
      </template>
    </el-dialog>

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
        <el-form-item label="所属目录">
          <el-select v-model="createForm.folderId" clearable placeholder="未分类" style="width: 100%">
            <el-option v-for="f in kbFolders" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
          <div class="form-tip">按目录分组组织知识库（如 it 行业、能源行业）；留空为未分类</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="isLoading" @click="handleCreateKnowledgeBase">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 目录管理对话框（新建/重命名） -->
    <el-dialog
      v-model="folderDialogVisible"
      :title="folderDialogMode === 'rename' ? '重命名目录' : '新建目录'"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px" @submit.prevent>
        <el-form-item label="目录名称">
          <el-input
            v-model="folderNameInput"
            placeholder="如：it 行业、能源行业"
            @keyup.enter="handleSaveFolder"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveFolder">保存</el-button>
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
        <el-form-item label="重排序模型">
          <el-select v-model="editRerankValue" clearable placeholder="不重排（默认）" style="width: 100%"
            @change="v => { editForm.rerankConfig = v ? JSON.stringify({ providerConfigId: v.split('::')[0], modelId: v.split('::')[1] }) : null }">
            <el-option v-for="m in rerankModels" :key="m.providerConfigId + '::' + m.id"
              :label="m.name" :value="m.providerConfigId + '::' + m.id" />
          </el-select>
          <div class="rerank-hint">检索后按相关度重排（需提供商含 rerank 类型模型）</div>
        </el-form-item>
        <el-form-item label="所属目录">
          <el-select v-model="editForm.folderId" clearable placeholder="未分类" style="width: 100%">
            <el-option v-for="f in kbFolders" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
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

    <!-- 文档分片查看对话框 -->
    <el-dialog
      v-model="showChunksDialog"
      :title="`文档分片 - ${currentChunkDocument?.name || ''}`"
      width="900px"
      destroy-on-close
    >
      <div v-loading="chunksLoading" class="chunks-container">
        <div v-if="paginatedChunks.length === 0 && !chunksLoading" class="empty-chunks">
          <el-icon :size="48"><Document /></el-icon>
          <span>暂无分片数据</span>
        </div>
        <div v-else class="chunks-list">
          <div class="chunks-header">
            <span>共 {{ chunksTotal }} 个切片</span>
          </div>
          <el-table
            :data="paginatedChunks"
            style="width: 100%"
            @row-click="handleRowClick"
          >
            <el-table-column prop="chunkIndex" label="序号" width="80">
              <template #default="{ row }">
                #{{ row.chunkIndex + 1 }}
              </template>
            </el-table-column>
            <el-table-column label="位置信息" width="150">
              <template #default="{ row }">
                <span v-if="row.metadata?.page">第 {{ row.metadata.page }} 页</span>
                <span v-else-if="row.startOffset && row.endOffset">
                  {{ row.startOffset }} - {{ row.endOffset }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click.stop="viewChunkContent(row)">
                  查看内容
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页 -->
          <div class="chunks-pagination" v-if="chunksTotal > chunksPageSize">
            <el-pagination
              v-model:current-page="chunksCurrentPage"
              :page-size="chunksPageSize"
              :total="chunksTotal"
              layout="prev, pager, next"
              @current-change="handleChunksPageChange"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showChunksDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 单个切片内容查看对话框 -->
    <el-dialog
      v-model="showChunkContentDialog"
      :title="`切片内容 #${currentViewingChunk?.chunkIndex !== undefined ? currentViewingChunk.chunkIndex + 1 : ''}`"
      width="700px"
      destroy-on-close
    >
      <div v-loading="chunkContentLoading" class="chunk-content-container">
        <div v-if="chunkContent" class="chunk-content-text">
          {{ chunkContent }}
        </div>
        <div v-else-if="!chunkContentLoading" class="empty-chunk-content">
          <span>无法加载切片内容</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="showChunkContentDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 添加网页对话框 -->
    <el-dialog
      v-model="showAddWebpageDialog"
      title="添加网页"
      width="500px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="网页地址">
          <el-input
            v-model="webpageUrl"
            placeholder="请输入网页 URL，如 https://example.com/article"
            clearable
            @keyup.enter="handleAddWebpage"
          />
        </el-form-item>
        <el-form-item>
          <div class="webpage-tips">
            <p>支持 HTTP/HTTPS 协议的网页链接</p>
            <p>系统将自动提取网页正文内容并添加到知识库</p>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddWebpageDialog = false">取消</el-button>
        <el-button type="primary" :loading="addingWebpage" @click="handleAddWebpage">
          添加
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'KnowledgeBase' })
import { ref, reactive, computed, onMounted, toRaw, watch } from 'vue'
import {
  Plus,
  FolderOpened,
  Folder,
  FolderAdd,
  MoreFilled,
  Search,
  Upload,
  Document,
  Loading,
  View,
  Link
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useKnowledgeBase } from '@/composables'
import { saveBlobAs } from '@/utils/file-saver'
import type { KnowledgeBase, KbDocument, KbChunk } from '../../../shared/types/knowledge-base.types'

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
  getDocumentChunks,
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

// ==================== D2 rerank 重排序 ====================
const rerankModels = ref<Array<{ id: string; name: string; providerConfigId: string }>>([])
const editRerankValue = ref('')

async function loadRerankModels(): Promise<void> {
  const resp = await window.electronAPI.knowledgeBase.getRerankModels()
  if (resp.success) rerankModels.value = resp.data ?? []
}

/** rerankConfig JSON -> providerConfigId::modelId 选择值 */
function rerankValueOf(raw: string): string {
  try {
    const cfg = JSON.parse(raw)
    return cfg?.providerConfigId && cfg?.modelId ? `${cfg.providerConfigId}::${cfg.modelId}` : ''
  } catch {
    return ''
  }
}

// ==================== D1 QA 问答对 ====================
const activeDataTab = ref<'docs' | 'qa'>('docs')
const qaPairs = ref<Array<{ id: string; question: string; answer: string; similarQuestions: string[] }>>([])
const qaLoading = ref(false)
const qaDialogVisible = ref(false)
const qaSaving = ref(false)
const qaEditingId = ref<string | null>(null)
const qaImportInput = ref<HTMLInputElement>()
const qaForm = reactive({ question: '', answer: '', similarText: '' })

/** 加载当前 KB 的 QA 对（切到 QA tab / 保存删除后刷新） */
async function loadQaPairs(): Promise<void> {
  if (!currentKnowledgeBase.value) return
  qaLoading.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.listQaPairs(currentKnowledgeBase.value.id)
    if (resp.success) qaPairs.value = resp.data ?? []
    else ElMessage.error(resp.error ?? '加载 QA 对失败')
  } finally {
    qaLoading.value = false
  }
}

watch(activeDataTab, tab => {
  if (tab === 'qa') void loadQaPairs()
})

function openQaDialog(row?: { id: string; question: string; answer: string; similarQuestions: string[] }): void {
  qaEditingId.value = row?.id ?? null
  qaForm.question = row?.question ?? ''
  qaForm.answer = row?.answer ?? ''
  qaForm.similarText = (row?.similarQuestions ?? []).join('\n')
  qaDialogVisible.value = true
}

async function handleSaveQa(): Promise<void> {
  if (!currentKnowledgeBase.value) return
  if (!qaForm.question.trim() || !qaForm.answer.trim()) {
    ElMessage.warning('问题和答案都不能为空')
    return
  }
  qaSaving.value = true
  try {
    const payload = {
      question: qaForm.question.trim(),
      answer: qaForm.answer.trim(),
      similarQuestions: qaForm.similarText.split('\n').map(x => x.trim()).filter(Boolean),
    }
    const resp = qaEditingId.value
      ? await window.electronAPI.knowledgeBase.updateQaPair({ id: qaEditingId.value, ...payload })
      : await window.electronAPI.knowledgeBase.addQaPair({ knowledgeBaseId: currentKnowledgeBase.value.id, ...payload })
    if (resp.success) {
      ElMessage.success('已保存')
      qaDialogVisible.value = false
      await loadQaPairs()
    } else {
      ElMessage.error(resp.error ?? '保存失败')
    }
  } finally {
    qaSaving.value = false
  }
}

async function handleDeleteQa(row: { id: string; question: string }): Promise<void> {
  await ElMessageBox.confirm(`删除问答对「${row.question}」？`, '删除')
  const resp = await window.electronAPI.knowledgeBase.deleteQaPair(row.id)
  if (resp.success) { ElMessage.success('已删除'); await loadQaPairs() }
  else ElMessage.error(resp.error ?? '删除失败')
}

/** xlsx 导入：文件读 base64 后走 IPC */
async function handleImportQa(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选同一文件
  if (!file || !currentKnowledgeBase.value) return
  const base64 = (await fileToBase64(file)).split(',')[1] ?? ''
  const resp = await window.electronAPI.knowledgeBase.importQaXlsx(currentKnowledgeBase.value.id, base64)
  if (resp.success) {
    ElMessage.success(`导入成功 ${resp.data?.imported ?? 0} 条，失败 ${resp.data?.failed ?? 0} 条`)
    await loadQaPairs()
  } else {
    ElMessage.error(resp.error ?? '导入失败')
  }
}

async function handleExportQa(): Promise<void> {
  if (!currentKnowledgeBase.value) return
  const resp = await window.electronAPI.knowledgeBase.exportQaXlsx(currentKnowledgeBase.value.id)
  if (!resp.success || !resp.data) { ElMessage.error(resp.error ?? '导出失败'); return }
  const bin = atob(resp.data.base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  await saveBlobAs(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
    defaultName: resp.data.fileName,
  })
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 表单引用
const createFormRef = ref<FormInstance>()
const editFormRef = ref<FormInstance>()

// 检索面板
const openSearchPanel = ref(false)

// 文档分片查看
const showChunksDialog = ref(false)
const chunksLoading = ref(false)
const paginatedChunks = ref<KbChunk[]>([])
const currentChunkDocument = ref<KbDocument | null>(null)
const chunksCurrentPage = ref(1)
const chunksPageSize = 20
const chunksTotal = ref(0)

// 单个切片内容查看
const showChunkContentDialog = ref(false)
const chunkContentLoading = ref(false)
const chunkContent = ref('')
const currentViewingChunk = ref<KbChunk | null>(null)

// 添加网页
const showAddWebpageDialog = ref(false)
const webpageUrl = ref('')
const addingWebpage = ref(false)

// 编辑的知识库
const editingKb = ref<KnowledgeBase | null>(null)

// ==================== 知识库目录（分组/分类，如 it 行业、能源行业） ====================
const kbFolders = ref<Array<{ id: string; name: string; parentId?: string | null }>>([])
const folderLoading = ref(false)
const folderDialogVisible = ref(false)
const folderDialogMode = ref<'create' | 'rename'>('create')
const folderEditingId = ref<string | null>(null)
const folderNameInput = ref('')

/** 加载目录列表 */
async function loadFolders(): Promise<void> {
  folderLoading.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.listFolders()
    if (resp.success) kbFolders.value = resp.data ?? []
  } catch (e: any) {
    console.error('[KnowledgeBase] 加载目录失败', e)
  } finally {
    folderLoading.value = false
  }
}

/** 知识库按目录分组：folderId -> 组内列表（未分类 = null 键） */
const kbByFolder = computed<Array<{ folderId: string | null; folderName: string; items: KnowledgeBase[] }>>(() => {
  const groups = new Map<string | null, KnowledgeBase[]>()
  for (const kb of knowledgeBases.value) {
    const key = kb.folderId ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(kb)
  }
  const out: Array<{ folderId: string | null; folderName: string; items: KnowledgeBase[] }> = []
  for (const folder of kbFolders.value) {
    const items = groups.get(folder.id) ?? []
    out.push({ folderId: folder.id, folderName: folder.name, items })
  }
  const uncategorized = groups.get(null) ?? []
  if (uncategorized.length > 0) out.push({ folderId: null, folderName: '未分类', items: uncategorized })
  return out
})

function openCreateFolderDialog(): void {
  folderDialogMode.value = 'create'
  folderEditingId.value = null
  folderNameInput.value = ''
  folderDialogVisible.value = true
}

function openRenameFolderDialog(folder: { id: string; name: string }): void {
  folderDialogMode.value = 'rename'
  folderEditingId.value = folder.id
  folderNameInput.value = folder.name
  folderDialogVisible.value = true
}

async function handleSaveFolder(): Promise<void> {
  const name = folderNameInput.value.trim()
  if (!name) { ElMessage.warning('请输入目录名称'); return }
  if (folderDialogMode.value === 'rename' && folderEditingId.value) {
    const resp = await window.electronAPI.knowledgeBase.renameFolder(folderEditingId.value, name)
    if (resp.success) ElMessage.success('已重命名')
    else ElMessage.error(resp.error ?? '重命名失败')
  } else {
    const resp = await window.electronAPI.knowledgeBase.createFolder(name)
    if (resp.success) ElMessage.success('目录已创建')
    else ElMessage.error(resp.error ?? '创建失败')
  }
  folderDialogVisible.value = false
  await loadFolders()
}

async function handleDeleteFolder(folder: { id: string; name: string }): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除目录「${folder.name}」后，其中的知识库将移到「未分类」（知识库与数据不受影响）。确定删除？`,
      '删除目录',
      { type: 'warning' },
    )
    const resp = await window.electronAPI.knowledgeBase.deleteFolder(folder.id)
    if (resp.success) {
      ElMessage.success('目录已删除')
      await Promise.all([loadFolders(), loadKnowledgeBases()])
    } else {
      ElMessage.error(resp.error ?? '删除失败')
    }
  } catch {
    // 取消删除
  }
}

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
      description: kb.description || '',
      folderId: kb.folderId ?? null
    }
    showEditDialog.value = true
    // D2：回填 rerank 选择值
    editRerankValue.value = kb.rerankConfig ? rerankValueOf(kb.rerankConfig) : ''
    loadRerankModels()
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

/**
 * 查看文档分片
 */
async function handleViewChunks(doc: KbDocument): Promise<void> {
  if (doc.status !== 'completed') {
    ElMessage.warning('文档尚未处理完成，无法查看分片')
    return
  }

  currentChunkDocument.value = doc
  showChunksDialog.value = true
  chunksCurrentPage.value = 1
  await loadChunksPage()
}

/**
 * 重新处理文档（页面级包装：带成功/失败提示，失败原因直接展示给用户）
 */
async function handleReprocessDocument(documentId: string): Promise<void> {
  const ok = await reprocessDocument(documentId)
  if (ok) {
    ElMessage.success('已开始处理文档')
  } else {
    // store 把失败原因写进 error，这里显式弹出（此前只写不显示，点击像"无效"）
    ElMessage.error(error.value || '处理文档失败')
  }
}

/**
 * 加载分页数据
 */
async function loadChunksPage(): Promise<void> {
  if (!currentChunkDocument.value) return

  chunksLoading.value = true
  paginatedChunks.value = []

  try {
    const response = await window.electronAPI.knowledgeBase.getDocumentChunksPaginated(
      currentChunkDocument.value.id,
      chunksCurrentPage.value,
      chunksPageSize
    )
    if (response.success && response.data) {
      paginatedChunks.value = response.data.chunks
      chunksTotal.value = response.data.total
    } else {
      ElMessage.error(response.error || '获取文档分片失败')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '获取文档分片失败')
  } finally {
    chunksLoading.value = false
  }
}

/**
 * 分页变化处理
 */
function handleChunksPageChange(page: number): void {
  chunksCurrentPage.value = page
  loadChunksPage()
}

/**
 * 点击行查看内容
 */
function handleRowClick(row: KbChunk): void {
  viewChunkContent(row)
}

/**
 * 查看单个切片内容
 */
async function viewChunkContent(chunk: KbChunk): Promise<void> {
  currentViewingChunk.value = chunk
  showChunkContentDialog.value = true
  chunkContentLoading.value = true
  chunkContent.value = ''

  try {
    const response = await window.electronAPI.knowledgeBase.getChunk(chunk.id)
    if (response.success && response.data) {
      chunkContent.value = response.data.content || ''
    } else {
      ElMessage.error(response.error || '获取切片内容失败')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '获取切片内容失败')
  } finally {
    chunkContentLoading.value = false
  }
}

/**
 * 添加网页
 */
async function handleAddWebpage(): Promise<void> {
  const url = webpageUrl.value.trim()
  if (!url) {
    ElMessage.warning('请输入网页地址')
    return
  }

  // 验证 URL 格式
  try {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      ElMessage.warning('仅支持 HTTP/HTTPS 协议')
      return
    }
  } catch {
    ElMessage.warning('请输入有效的网页地址')
    return
  }

  addingWebpage.value = true
  try {
    const response = await window.electronAPI.knowledgeBase.addWebpage(
      currentKnowledgeBase.value!.id,
      url
    )
    if (response.success && response.data) {
      ElMessage.success('网页添加成功，正在处理中...')
      showAddWebpageDialog.value = false
      webpageUrl.value = ''
      // 刷新文档列表
      documents.value = [...documents.value, response.data]
    } else {
      ElMessage.error(response.error || '添加网页失败')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '添加网页失败')
  } finally {
    addingWebpage.value = false
  }
}

// 加载知识库目录（与 composable 内的知识库列表加载并行）
onMounted(() => {
  void loadFolders()
})
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

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 目录分组标题 */
.kb-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.kb-group-name {
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-group-count {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
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

/* 文档表格操作列样式 */
:deep(.action-column) {
  .cell {
    overflow: visible;
  }
}

.action-buttons {
  display: flex;
  gap: 4px;
  opacity: 1 !important;
  background-color: var(--el-bg-color);
  padding: 4px;
  border-radius: 4px;
}

/* 文档分片对话框 */
.chunks-container {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
}

.empty-chunks {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
  gap: 12px;
}

.chunks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chunks-header {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.chunks-pagination {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* 单个切片内容对话框 */
.chunk-content-container {
  min-height: 100px;
  max-height: 60vh;
  overflow-y: auto;
}

.chunk-content-text {
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.empty-chunk-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
}

/* 添加网页提示 */
.webpage-tips {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.webpage-tips p {
  margin: 4px 0;
}
.rerank-hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.4; }
</style>