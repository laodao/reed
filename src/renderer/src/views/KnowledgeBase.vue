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
                <el-dropdown v-if="group.folderId" trigger="click" @command="(cmd: string) => cmd === 'rename' ? openRenameFolderDialog({ id: group.folderId!, name: group.folderName ?? '' }) : handleDeleteFolder({ id: group.folderId!, name: group.folderName ?? '' })">
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
        <!-- 知识库标题栏（含统计信息） -->
        <div class="main-header">
          <div class="header-left">
            <div class="header-title-row">
              <h2>{{ currentKnowledgeBase?.name }}</h2>
              <div class="header-stats">
                <span class="header-stat"><b>{{ currentKnowledgeBase?.documentCount || 0 }}</b> 文档</span>
                <span class="header-stat"><b>{{ currentKnowledgeBase?.vectorCount || 0 }}</b> 向量</span>
                <span class="header-stat"><b>{{ formatFileSize(currentKnowledgeBase?.totalSize || 0) }}</b> 总大小</span>
              </div>
            </div>
            <span v-if="currentKnowledgeBase?.description" class="description">
              {{ currentKnowledgeBase.description }}
            </span>
          </div>
          <div class="header-right">
            <!-- 检索对文档与 QA 两个数据面都有效（QA 命中直出、未命中走文档 RAG） -->
            <el-button @click="openSearchPanel = true">
              <el-icon><Search /></el-icon>
              检索知识库
            </el-button>
            <!-- 添加网页 / 上传文档 是文档向操作，在「文档」tab 区头部 -->
          </div>
        </div>

        <!-- 数据面页签：文档 / QA 问答对 -->
        <div class="data-tabs">
          <button
            type="button"
            class="data-tab"
            :class="{ active: activeDataTab === 'docs' }"
            @click="activeDataTab = 'docs'"
          >
            文档
            <span class="tab-count">{{ documents.length }}</span>
          </button>
          <button
            type="button"
            class="data-tab"
            :class="{ active: activeDataTab === 'qa' }"
            @click="activeDataTab = 'qa'"
          >
            QA 问答对
            <span class="tab-count">{{ qaPairs.length }}</span>
          </button>
          <button
            type="button"
            class="data-tab"
            :class="{ active: activeDataTab === 'brain' }"
            @click="activeDataTab = 'brain'"
          >
            大脑
            <span v-if="brainStats" class="tab-count">{{ brainStats }}</span>
          </button>
        </div>

        <!-- 文档列表（三段式：头部操作区 / 表格滚动区 / 底部固定分页栏） -->
        <div v-show="activeDataTab === 'docs'" class="docs-panel">
          <div class="section-header">
            <h3>文档列表</h3>
            <span class="doc-count">共 {{ documentCount }} 个文档</span>
            <div class="section-actions">
              <el-button size="small" @click="showAddWebpageDialog = true">
                <el-icon><Link /></el-icon>
                添加网页
              </el-button>
              <el-button size="small" type="primary" @click="handleUploadDocuments">
                <el-icon><Upload /></el-icon>
                上传文档
              </el-button>
            </div>
          </div>

          <!-- 表格滚动区：列表内部滚动，分页栏固定在底部不随列表滚动 -->
          <div class="docs-table-region" v-loading="isLoading">
          <el-table
            :data="paginatedDocuments"
            empty-text="暂无文档，点击右上角「上传文档」添加"
            style="width: 100%"
          >
            <el-table-column type="index" label="序号" width="70" align="center" />
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

          <!-- 底部固定分页栏：列表内部滚动时保持可见 -->
          <div v-if="documents.length > 0" class="docs-pagination-bar">
            <el-pagination
              :current-page="docPage"
              :page-size="docPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="documents.length"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="handleDocCurrentChange"
              @size-change="handleDocSizeChange"
            />
          </div>
        </div>

        <!-- D1 QA 问答对列表 -->
        <div v-if="activeDataTab === 'brain' && currentKnowledgeBase" class="document-section">
          <BrainPanel :kb-id="currentKnowledgeBase.id" @stats="brainStatsCount" />
        </div>

        <div v-if="activeDataTab === 'qa'" class="document-section">
          <div class="section-header">
            <h3>QA 问答对</h3>
            <span class="doc-count">共 {{ qaPairs.length }} 条（命中即直出答案，未命中走文档 RAG）</span>
            <div class="section-actions">
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
            @change="(v: string | null) => { editForm.rerankConfig = v ? JSON.stringify({ providerConfigId: v.split('::')[0], modelId: v.split('::')[1] }) : null }">
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
      width="1100px"
      destroy-on-close
    >
      <div class="chunks-layout">
        <!-- M5 章节树面板：点选章节看摘要 + 只看该章节切片 -->
        <div class="chapter-panel" v-loading="chapterTreeLoading">
          <div class="chapter-panel-header">
            <span>章节树</span>
            <span class="chapter-stats" v-if="chapterStats.total > 0">
              摘要 {{ chapterStats.done }}/{{ chapterStats.total }}
            </span>
          </div>
          <div v-if="chapterTree.length === 0 && !chapterTreeLoading" class="chapter-empty">
            暂无章节数据（文档重新处理后可生成）
          </div>
          <template v-else>
            <el-input
              v-model="chapterTitleFilter"
              class="chapter-filter-input"
              size="small"
              clearable
              placeholder="按标题筛选章节"
            />
            <el-tree
              ref="chapterTreeRef"
              :data="chapterTree"
              node-key="id"
              :props="{ label: 'title', children: 'children' }"
              :default-expanded-keys="defaultExpandedChapterKeys"
              :filter-node-method="filterChapterNode"
              highlight-current
              @node-click="handleChapterClick"
            >
              <template #default="{ data }">
                <span class="chapter-node">
                  <el-tag v-if="data.summaryStatus === 'done'" size="small" type="success" disable-transitions>摘要</el-tag>
                  <el-tag v-else-if="data.summaryStatus === 'failed'" size="small" type="danger" disable-transitions>失败</el-tag>
                  <span class="chapter-title">{{ data.title }}</span>
                </span>
              </template>
            </el-tree>
          </template>
          <div class="chapter-summary" v-if="selectedChapter">
            <div class="chapter-summary-header">本章摘要</div>
            <div class="chapter-summary-body">
              {{ selectedChapter.summary || (selectedChapter.summaryStatus === 'failed' ? `生成失败：${selectedChapter.summaryError || '未知原因'}` : '摘要生成中…') }}
            </div>
          </div>
          <div class="chapter-actions">
            <el-button size="small" text type="primary" :loading="chapterSummarizing" @click="handleSummarizeChapters">
              生成/重试摘要
            </el-button>
          </div>
        </div>

        <!-- 分片列表 -->
        <div v-loading="chunksLoading" class="chunks-container">
        <div class="chunks-filter-bar" v-if="filterChapterTitle">
          <span>仅看章节：{{ filterChapterTitle }}</span>
          <el-button text size="small" type="primary" @click="clearChapterFilter">清除过滤</el-button>
        </div>
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
  Link
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useKnowledgeBase } from '@/composables'
import BrainPanel from '@/components/knowledge-base/BrainPanel.vue'
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
  error,

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
  loadKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  openCreateDialog,
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
const activeDataTab = ref<'docs' | 'qa' | 'brain'>('docs')
const brainStats = ref<number | null>(null)
function brainStatsCount(n: number): void {
  brainStats.value = n
}
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

// ==================== 文档列表分页 ====================
// 说明：store 持有当前知识库的完整文档列表（处理进度/状态事件按 id 在全量中回写），
// 页面在真实全量数据上做切片分页；列表内部滚动，分页栏固定在底部。
const docPage = ref(1)
const docPageSize = ref(10)

/** 当前页文档（切片自全量 documents，进度回写实时反映到当前页） */
const paginatedDocuments = computed(() => {
  const start = (docPage.value - 1) * docPageSize.value
  return documents.value.slice(start, start + docPageSize.value)
})

/** 页码越界修正：删除文档后当前页可能超出总页数，回退到最后一页 */
watch(
  [docPageSize, () => documents.value.length],
  () => {
    const lastPage = Math.max(1, Math.ceil(documents.value.length / docPageSize.value))
    if (docPage.value > lastPage) docPage.value = lastPage
  },
)

/** 切换知识库后回到第一页（store 会重载全量文档列表） */
watch(
  () => currentKnowledgeBase.value?.id,
  () => {
    docPage.value = 1
  },
)

/** 点击页码/上一页/下一页 */
function handleDocCurrentChange(page: number): void {
  docPage.value = page
}

/**
 * 切换每页条数：保持当前视野首条仍可见（按变化前的页码换算新页码），
 * 而不是粗暴回到第 1 页丢位置。
 */
function handleDocSizeChange(newSize: number): void {
  const oldSize = docPageSize.value
  const firstIndex = (docPage.value - 1) * oldSize + 1
  docPageSize.value = newSize
  docPage.value = Math.max(1, Math.ceil(firstIndex / newSize))
}

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

// M5 章节树（kb_chapters；字段与 IPC getChapterTree 返回一致）
interface ChapterNode {
  id: string
  title: string
  level: number
  parentId: string | null
  summary: string | null
  summaryStatus: 'pending' | 'done' | 'failed'
  summaryError: string | null
  children?: ChapterNode[]
}
const chapterTree = ref<ChapterNode[]>([])
const chapterTreeLoading = ref(false)
const chapterTreeRef = ref<{ filter: (value: string) => void } | null>(null)
const chapterStats = ref<{ total: number; done: number; failed: number }>({ total: 0, done: 0, failed: 0 })
const selectedChapter = ref<ChapterNode | null>(null)
/** 章节树标题过滤关键字 */
const chapterTitleFilter = ref('')
/** 当前章节过滤（空=全部切片） */
const filterChapterTitle = ref('')
const chapterSummarizing = ref(false)

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
  // M5：重置章节过滤 + 并行加载章节树（章节树/摘要来自文档处理时的结构检测与摘要服务）
  selectedChapter.value = null
  filterChapterTitle.value = ''
  void loadChapterTree(doc.id)
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
      chunksPageSize,
      filterChapterTitle.value || undefined
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

// ==================== M5 章节树 ====================

/** 加载章节树（含摘要与进度） */
async function loadChapterTree(documentId: string): Promise<void> {
  chapterTreeLoading.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.getChapterTree(documentId)
    if (resp.success && resp.data) {
      chapterTree.value = (resp.data.tree || []) as ChapterNode[]
      chapterStats.value = resp.data.stats
    } else {
      chapterTree.value = []
      chapterStats.value = { total: 0, done: 0, failed: 0 }
    }
  } catch {
    chapterTree.value = []
  } finally {
    chapterTreeLoading.value = false
  }
}

/** 点选章节：展示摘要，并只看该章节切片（后端全量过滤） */
async function handleChapterClick(node: ChapterNode): Promise<void> {
  selectedChapter.value = node
  filterChapterTitle.value = node.title
  chunksCurrentPage.value = 1
  await loadChunksPage()
}

/** 章节树默认展开节点：小树全展开；大树（如 PDF 书签 2000+ 条）只展开一级，避免一次性渲染全部节点 */
const defaultExpandedChapterKeys = computed<string[]>(() => {
  if (chapterTree.value.length === 0) return []
  if (chapterStats.value.total <= 200) {
    const keys: string[] = []
    const walk = (nodes: ChapterNode[]): void => {
      for (const n of nodes) {
        keys.push(n.id)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(chapterTree.value)
    return keys
  }
  return chapterTree.value.map(n => n.id)
})

/** 树内按标题过滤（大树必备：numpy-user.pdf 有 2137 个章节节点） */
watch(chapterTitleFilter, (kw) => {
  chapterTreeRef.value?.filter(kw)
})

function filterChapterNode(value: string, data: ChapterNode): boolean {
  if (!value) return true
  return (data.title || '').toLowerCase().includes(value.toLowerCase())
}

/** 清除章节过滤（回到全部切片） */
async function clearChapterFilter(): Promise<void> {
  selectedChapter.value = null
  filterChapterTitle.value = ''
  chunksCurrentPage.value = 1
  await loadChunksPage()
}

/** 手动生成/重试章节摘要（自动调度失败或存量文档场景） */
async function handleSummarizeChapters(): Promise<void> {
  if (!currentChunkDocument.value) return
  chapterSummarizing.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.summarizeDocument(currentChunkDocument.value.id, true)
    if (resp.success) {
      // 单次最多生成 60 条（成本护栏），剩余的可再次点击继续
      const remaining = resp.data?.remaining ?? 0
      const base = `摘要完成：成功 ${resp.data?.done ?? 0}，失败 ${resp.data?.failed ?? 0}`
      ElMessage.success(remaining > 0 ? `${base}，剩余 ${remaining} 条可再次点击继续` : base)
      await loadChapterTree(currentChunkDocument.value.id)
    } else {
      ElMessage.error(resp.error || '生成章节摘要失败')
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '生成章节摘要失败')
  } finally {
    chapterSummarizing.value = false
  }
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
 * 选择并上传文档（页面级包装）：上传成功后 store 会按仓库顺序（createdAt DESC）
 * 重载全量列表，新文档排在列表头部，翻回第一页即可看到。
 */
async function handleUploadDocuments(): Promise<void> {
  const uploaded = await selectAndUploadFiles()
  if (uploaded && uploaded.length > 0) {
    docPage.value = 1
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
      // 仓库按 createdAt DESC 排序，新网页是最新文档：插入头部并回第一页展示
      documents.value = [response.data, ...documents.value]
      docPage.value = 1
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
  margin: 0;
  font-size: 20px;
}

/* 标题 + 统计信息同行 */
.header-title-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}

.header-stats {
  display: flex;
  align-items: baseline;
  gap: 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.header-stat b {
  color: var(--el-color-primary);
  font-weight: 600;
  font-size: 15px;
  margin-right: 2px;
}

.header-left .description {
  display: block;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 4px;
}

.header-right {
  display: flex;
  gap: 12px;
}

/* 数据面页签（文档 / QA 问答对） */
.data-tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}

.data-tab {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.2s, border-color 0.2s;
}

.data-tab:hover {
  color: var(--el-color-primary);
}

.data-tab.active {
  color: var(--el-color-primary);
  font-weight: 600;
  border-bottom-color: var(--el-color-primary);
}

.tab-count {
  font-size: 11px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 16px;
  color: var(--el-text-color-secondary);
}

.data-tab.active .tab-count {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

/* 文档数据面（QA tab 沿用上方 .document-section 的整体滚动） */
.document-section {
  flex: 1;
  padding: 20px 24px;
  overflow: auto;
}

/* 文档列表三段式：头部操作区固定，表格区内部滚动，分页栏固定在底部 */
.docs-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 0;
}

.docs-panel .section-header {
  flex: none;
  margin-bottom: 12px;
}

.docs-table-region {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background-color: var(--el-bg-color);
}

/* 分页栏固定底部：不随列表内部滚动 */
.docs-pagination-bar {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0;
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

.section-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
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

/* M5 分片对话框：章节树 + 分片列表 分栏 */
.chunks-layout {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.chapter-panel {
  width: 320px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-lighter);
  padding-right: 12px;
  max-height: 60vh;
  overflow-y: auto;
}
.chapter-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
}
.chapter-stats { color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
.chapter-filter-input { margin-bottom: 6px; }
.chapter-empty { color: var(--el-text-color-secondary); font-size: 12px; padding: 12px 0; line-height: 1.6; }
.chapter-node { display: inline-flex; align-items: center; gap: 6px; }
.chapter-title { font-size: 12px; }
.chapter-summary {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}
.chapter-summary-header { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.chapter-summary-body { font-size: 12px; color: var(--el-text-color-regular); line-height: 1.6; }
.chapter-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.chunks-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-color-primary-light-9);
  padding: 4px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
}

/* 文档分片对话框 */
.chunks-layout .chunks-container {
  flex: 1;
  min-width: 0;
}
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