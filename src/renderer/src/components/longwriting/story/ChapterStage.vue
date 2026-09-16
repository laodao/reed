<template>
  <div class="chapter-stage">
    <div class="stage-header">
      <h2>章节写作</h2>
      <p class="stage-desc">根据大纲生成章节内容，支持手动编辑和版本管理</p>
      <el-button type="primary" size="small" class="header-export-btn" @click="exportAll">
        <el-icon><Download /></el-icon>
        导出全部
      </el-button>
    </div>

    <div class="stage-content">
      <!-- 左侧大纲树 + 右侧编辑区的布局 -->
      <div class="chapter-layout">
        <!-- 左侧大纲树 -->
        <div class="outline-tree-panel">
          <div class="tree-header">
            <h3>大纲目录</h3>
            <el-button text size="small" @click="collapseAll">
              <el-icon><Fold /></el-icon>
              折叠
            </el-button>
          </div>
          <el-tree
            ref="treeRef"
            :data="outlineTreeData"
            :props="treeProps"
            :highlight-current="true"
            :expand-on-click-node="false"
            :default-expand-all="true"
            node-key="id"
            class="outline-tree"
            @node-click="handleNodeClick"
          >
            <template #default="{ data }">
              <div class="tree-node" :class="{ active: data.id === activeOutlineId }">
                <span class="node-name">{{ data.name }}</span>
                <span class="node-status" :class="data.status">{{ getStatusName(data.status) }}</span>
              </div>
            </template>
          </el-tree>
          <el-empty v-if="outlineTreeData.length === 0" description="暂无大纲数据" />
        </div>

        <!-- 右侧章节编辑区 -->
        <div class="chapters-panel" ref="chaptersPanelRef">
          <div v-if="outlineTreeData.length === 0" class="empty-chapter">
            <el-empty description="请先在大纲设计阶段创建大纲">
              <el-button type="primary" @click="goToOutline">前往大纲设计</el-button>
            </el-empty>
          </div>

          <!-- 单章节编辑模式 -->
          <div v-else class="single-chapter-container">
            <!-- 当前节点卡片（章节导航已并入标题栏中段） -->
            <div v-if="currentNode" class="chapter-card" :class="{ active: isEditableNode }">
              <!-- 节点标题栏 -->
              <div class="chapter-title-bar">
                <div class="title-left">
                  <span class="chapter-type">{{ getNodeTypeName(currentNode.nodeType) }}</span>
                  <h3 class="chapter-title">{{ currentNode.name }}</h3>
                  <el-tag :type="getStatusType(currentNode.status)" size="small">
                    {{ getStatusName(currentNode.status) }}
                  </el-tag>
                  <span class="word-count" v-if="isEditableNode && getChapterWordCount(currentNode.id)">
                    {{ getChapterWordCount(currentNode.id) }} 字
                  </span>
                  <span class="preview-hint" v-if="!isEditableNode">
                    预览模式
                  </span>
                </div>
                <div class="title-center" v-if="isEditableNode && currentChapter">
                  <el-button size="small" :disabled="currentChapterIndex <= 0" @click="prevChapter">
                    <el-icon><ArrowLeft /></el-icon>
                    上一节
                  </el-button>
                  <el-button size="small" :disabled="currentChapterIndex >= allOutlines.length - 1" @click="nextChapter">
                    下一节
                    <el-icon><ArrowRight /></el-icon>
                  </el-button>
                </div>
                <div class="title-actions">
                  <template v-if="isEditableNode && currentChapter">
                    <el-tooltip v-if="!generatingMap[currentChapter.id]" content="AI 生成" placement="top">
                      <el-button type="primary" size="small" @click="startGenerate(currentChapter)">
                        <el-icon><MagicStick /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip v-else content="取消生成" placement="top">
                      <el-button type="danger" size="small" @click="cancelGenerate(currentChapter.id)">
                        <el-icon><Close /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="版本" placement="top">
                      <el-button size="small" @click="showVersions(currentChapter)">
                        <el-icon><Clock /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="导出" placement="top">
                      <el-button size="small" @click="exportChapter(currentChapter.id)">
                        <el-icon><Download /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="保存" placement="top">
                      <el-button
                        size="small"
                        :loading="savingMap[currentChapter.id]"
                        @click="saveChapter(currentChapter.id)"
                      >
                        <el-icon><DocumentChecked /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="提取状态" placement="top">
                      <el-button
                        size="small"
                        :loading="extractingStates"
                        :disabled="!chapterContentMap[currentChapter.id] || chapterContentMap[currentChapter.id].length < 100"
                        @click="extractEntityStatesFromChapter(currentChapter.id)"
                      >
                        <el-icon><Collection /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="查看状态" placement="top">
                      <el-button size="small" @click="viewChapterStates(currentChapter.id)">
                        <el-icon><View /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-tooltip content="一致性检查（疑点定位与修正）" placement="top">
                      <el-badge :value="conflictCount" :hidden="!conflictCount" :max="99" class="conflict-badge">
                        <el-button size="small" @click="openConflictPanel">
                          <el-icon><Warning /></el-icon>
                        </el-button>
                      </el-badge>
                    </el-tooltip>
                  </template>
                  <template v-else-if="!isEditableNode && currentNode">
                    <el-tooltip content="导出" placement="top">
                      <el-button size="small" @click="exportNode(currentNode.id)">
                        <el-icon><Download /></el-icon>
                      </el-button>
                    </el-tooltip>
                  </template>
                </div>
              </div>

              <!-- 章节信息（默认折叠，点击标题行展开/收起；折叠态给编辑器让出纵向空间） -->
              <div class="chapter-info" v-if="currentNode.summary || currentNode.involvedCharacters?.length || currentNode.involvedLocations?.length">
                <div class="info-toggle" @click="infoExpanded = !infoExpanded">
                  <el-icon class="toggle-arrow" :class="{ expanded: infoExpanded }"><ArrowRight /></el-icon>
                  <span class="toggle-label">内容概要</span>
                  <span v-if="!infoExpanded && currentNode.summary" class="toggle-preview">{{ currentNode.summary }}</span>
                </div>
                <div v-show="infoExpanded" class="info-detail">
                  <p v-if="currentNode.summary" class="chapter-summary">{{ currentNode.summary }}</p>
                  <div class="chapter-tags" v-if="currentNode.involvedCharacters?.length > 0 || currentNode.involvedLocations?.length > 0">
                    <template v-if="currentNode.involvedCharacters?.length > 0">
                      <el-tag v-for="id in currentNode.involvedCharacters" :key="id" size="small" type="info">
                        {{ getCharacterName(id) }}
                      </el-tag>
                    </template>
                    <template v-if="currentNode.involvedLocations?.length > 0">
                      <el-tag v-for="id in currentNode.involvedLocations" :key="id" size="small" type="warning">
                        {{ getLocationName(id) }}
                      </el-tag>
                    </template>
                  </div>
                </div>
              </div>

            <div class="chapter-body">
              <!-- 可编辑模式：Markdown 编辑器 -->
              <div v-if="isEditableNode && currentChapter" class="chapter-editor-wrapper">
                <MarkdownEditor
                  ref="editorRef"
                  :key="currentChapter.id"
                  v-model="chapterContentMap[currentChapter.id]"
                  :placeholder="getEditorPlaceholder(currentChapter)"
                  height="100%"
                  mode="split"
                />
              </div>

              <!-- 预览模式：显示所有子节点内容 -->
              <div v-else class="chapter-preview-wrapper">
                <div v-if="nodePreviewContent" class="preview-content-area" v-html="renderMarkdown(nodePreviewContent)"></div>
                <el-empty v-else description="暂无内容，请在左侧选择具体的节进行编辑" />
              </div>

              <!-- 章节工作台：上下文预览面板（38 号；布局修复：右侧栏，不再被纵向堆叠到底部） -->
              <ChapterContextPanel
                v-if="isEditableNode && activeOutlineId"
                :project-id="projectId"
                :outline-id="activeOutlineId"
                :generating="!!generatingMap[activeOutlineId]"
                :target-words="generateForm.targetWords"
                :style="generateForm.style || undefined"
                :extra-prompt="generateForm.extraPrompt || undefined"
                @generate="handleGenerateWithContext"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

    <!-- 一致性检查疑点抽屉（定位/交主编修正/知情保留） -->
    <ChapterConflictPanel
      ref="conflictPanelRef"
      :project-id="projectId"
      :current-outline-id="activeOutlineId"
      @locate="onLocateConflict"
      @fix="onFixConflict"
      @scanned="conflictCount = $event"
    />

    <!-- AI 生成参数设置对话框 -->
    <el-dialog
      v-model="showGenerateDialog"
      title="AI 生成参数"
      width="550px"
    >
      <el-form :model="generateForm" label-width="80px">
        <el-form-item label="目标字数">
          <el-input-number v-model="generateForm.targetWords" :min="500" :max="50000" :step="500" />
        </el-form-item>
        <el-form-item label="写作风格">
          <el-select v-model="generateForm.style" placeholder="选择写作风格">
            <el-option label="默认" value="" />
            <el-option label="轻松幽默" value="light" />
            <el-option label="沉重深刻" value="heavy" />
            <el-option label="热血激昂" value="passionate" />
            <el-option label="冷峻沉稳" value="calm" />
          </el-select>
        </el-form-item>
        <el-form-item label="附加提示">
          <el-input
            v-model="generateForm.extraPrompt"
            type="textarea"
            :rows="2"
            placeholder="其他写作要求..."
          />
        </el-form-item>
      </el-form>

      <!-- 预写内容区域（只读显示） -->
      <div v-if="prewriteContent" class="prewrite-section">
        <div class="prewrite-header">
          <span class="prewrite-title">AI 预写提纲</span>
          <el-tag v-if="currentPrewrite?.isConfirmed" type="success" size="small">已确认</el-tag>
          <span v-else class="prewrite-hint">（预写功能已移至第六步"大纲设计"）</span>
        </div>
        <div class="prewrite-content-readonly">
          <pre>{{ prewriteContent }}</pre>
        </div>
        <div v-if="memoryStats" class="memory-stats-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>已加载 {{ memoryStats.active }} 条相关记忆</span>
        </div>
      </div>

      <!-- 无预写内容提示 -->
      <div v-else class="prewrite-empty-hint">
        <el-icon><InfoFilled /></el-icon>
        <span>暂无预写内容，请先在第六步"大纲设计"中完成预写</span>
      </div>

      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" @click="executeGeneration">
          开始生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 版本历史对话框 -->
    <el-dialog
      v-model="showVersionDialog"
      title="版本历史"
      width="600px"
    >
      <div class="version-list">
        <div v-for="version in versions" :key="version.id" class="version-item">
          <div class="version-info">
            <span class="version-number">版本 {{ version.versionNumber }}</span>
            <span class="version-type" :class="version.versionType">
              {{ version.versionType === 'generated' ? 'AI生成' : '手动编辑' }}
            </span>
            <span class="version-date">{{ formatDate(version.createdAt) }}</span>
            <span class="version-words">{{ version.wordCount }}字</span>
            <el-tag v-if="version.isLocked" type="warning" size="small">已锁定</el-tag>
          </div>
          <div class="version-actions">
            <el-button text size="small" @click="previewVersion(version)">
              <el-icon><View /></el-icon>
              预览
            </el-button>
            <el-button
              text
              size="small"
              :disabled="version.isLocked"
              @click="restoreVersion(version)"
            >
              <el-icon><RefreshLeft /></el-icon>
              恢复
            </el-button>
          </div>
        </div>
        <el-empty v-if="versions.length === 0" description="暂无历史版本" />
      </div>
    </el-dialog>

    <!-- 版本预览对话框 -->
    <el-dialog
      v-model="showPreviewDialog"
      title="版本预览"
      width="700px"
    >
      <div class="preview-content">
        <pre>{{ previewContent }}</pre>
      </div>
    </el-dialog>

    <!-- 实体状态确认对话框 -->
    <el-dialog
      v-model="showStateExtractDialog"
      title="确认实体状态"
      width="700px"
      :style="{ maxHeight: '80vh' }"
      class="state-dialog"
    >
      <div class="dialog-content-scroll">
        <div v-if="extractingStates" class="memory-extracting">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>AI 正在分析章节内容，提取实体状态变化...</span>
        </div>
        <div v-else-if="extractedStates.length > 0" class="memory-list">
          <p class="memory-hint">以下是从章节中提取的实体状态快照，请确认是否保存：</p>
          <div v-for="(state, index) in extractedStates" :key="index" class="memory-item">
            <div class="memory-header">
              <el-tag size="small" :type="state.entityType === 'character' ? 'primary' : state.entityType === 'location' ? 'warning' : 'info'">
                {{ state.entityType === 'character' ? '角色' : state.entityType === 'location' ? '地点' : state.entityType === 'item' ? '物品' : state.entityType === 'faction' ? '势力' : '技能' }}
              </el-tag>
              <span class="entity-name">{{ state.entityName }}</span>
            </div>
            <el-input
              v-model="state.stateSummary"
              type="textarea"
              :rows="3"
              placeholder="状态摘要"
              style="margin-top: 8px;"
            />
            <div v-if="state.keyChanges && state.keyChanges.length > 0" class="key-changes">
              <span class="key-changes-label">关键变化：</span>
              <el-tag v-for="(change, i) in state.keyChanges" :key="i" size="small" type="info" style="margin-right: 4px;">{{ change }}</el-tag>
            </div>
          </div>
        </div>
        <el-empty v-else description="未能检测到实体状态变化" />
      </div>
      <template #footer>
        <el-button @click="cancelStateExtractDialog">取消</el-button>
        <el-button type="primary" :disabled="extractedStates.length === 0" @click="saveEntityStates">
          保存状态快照
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看章节状态对话框 -->
    <el-dialog
      v-model="showViewStateDialog"
      title="章节实体状态"
      width="700px"
      class="state-dialog"
    >
      <div class="dialog-content-scroll">
        <div v-if="loadingChapterStates" class="memory-extracting">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>正在加载章节状态...</span>
        </div>
        <div v-else-if="chapterStates.length > 0" class="memory-list">
          <p class="memory-hint">以下是当前章节已保存的实体状态快照：</p>
          <div v-for="(state, index) in chapterStates" :key="index" class="memory-item">
            <div class="memory-header">
              <el-tag size="small" :type="state.entityType === 'character' ? 'primary' : state.entityType === 'location' ? 'warning' : 'info'">
                {{ state.entityType === 'character' ? '角色' : state.entityType === 'location' ? '地点' : state.entityType === 'item' ? '物品' : state.entityType === 'faction' ? '势力' : '技能' }}
              </el-tag>
              <span class="entity-name">{{ state.entityName }}</span>
              <el-button
                type="danger"
                size="small"
                text
                @click="deleteState(state.id)"
                style="margin-left: auto;"
              >
                删除
              </el-button>
            </div>
            <div class="state-summary-display">{{ state.stateSummary }}</div>
            <div v-if="state.keyChanges && state.keyChanges.length > 0" class="key-changes">
              <span class="key-changes-label">关键变化：</span>
              <el-tag v-for="(change, i) in state.keyChanges" :key="i" size="small" type="info" style="margin-right: 4px;">{{ change }}</el-tag>
            </div>
          </div>
        </div>
        <el-empty v-else description="该章节暂无已保存的实体状态" />
      </div>
      <template #footer>
        <el-button @click="showViewStateDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新实体确认对话框 -->
    <el-dialog
      v-model="showNewEntitiesDialog"
      title="检测到新实体"
      width="700px"
      class="state-dialog"
    >
      <div class="dialog-content-scroll">
        <p class="memory-hint">以下是从章节中检测到的新实体，请选择是否添加到项目：</p>

        <!-- 新角色 -->
        <div v-if="detectedNewEntities?.newCharacters?.length > 0" class="entity-section">
          <h4 class="section-title">新角色</h4>
          <div v-for="(char, index) in detectedNewEntities.newCharacters" :key="'char-' + index" class="new-entity-item">
            <div class="entity-header">
              <span class="entity-name">{{ char.name }}</span>
              <el-tag :type="getImportanceTagType(char.suggestedImportance)" size="small">
                {{ getImportanceName(char.suggestedImportance) }}
              </el-tag>
            </div>
            <div class="entity-description">{{ char.description }}</div>
            <div v-if="char.reason" class="entity-reason">{{ char.reason }}</div>
          </div>
        </div>

        <!-- 新地点 -->
        <div v-if="detectedNewEntities?.newLocations?.length > 0" class="entity-section">
          <h4 class="section-title">新地点</h4>
          <div v-for="(loc, index) in detectedNewEntities.newLocations" :key="'loc-' + index" class="new-entity-item">
            <div class="entity-header">
              <span class="entity-name">{{ loc.name }}</span>
              <el-tag :type="getImportanceTagType(loc.suggestedImportance)" size="small">
                {{ getImportanceName(loc.suggestedImportance) }}
              </el-tag>
            </div>
            <div class="entity-description">{{ loc.description }}</div>
            <div v-if="loc.reason" class="entity-reason">{{ loc.reason }}</div>
          </div>
        </div>

        <!-- 新物品 -->
        <div v-if="detectedNewEntities?.newItems?.length > 0" class="entity-section">
          <h4 class="section-title">新物品</h4>
          <div v-for="(item, index) in detectedNewEntities.newItems" :key="'item-' + index" class="new-entity-item">
            <div class="entity-header">
              <span class="entity-name">{{ item.name }}</span>
              <el-tag :type="getImportanceTagType(item.suggestedImportance)" size="small">
                {{ getImportanceName(item.suggestedImportance) }}
              </el-tag>
            </div>
            <div class="entity-description">{{ item.description }}</div>
            <div v-if="item.reason" class="entity-reason">{{ item.reason }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="handleIgnoreNewEntities">忽略</el-button>
        <el-button type="primary" :loading="addingEntities" @click="handleAddNewEntities">
          添加到项目
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, inject, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Clock, DocumentChecked, View, RefreshLeft, Close, Fold, Download, Loading, InfoFilled, Collection, Warning } from '@element-plus/icons-vue'
import MarkdownEditor from '@/components/common/MarkdownEditor.vue'
import ChapterContextPanel from './ChapterContextPanel.vue'
import ChapterConflictPanel from './ChapterConflictPanel.vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { marked } from 'marked'
import { locateExcerpt } from '@shared/utils/text-locate'
import { buildConflictFixMessage } from '@/utils/conflict-fix'
import type { StoryOutline, ChapterVersion, OutlineStatus, OutlineNodeType, StoryCharacter, ChapterPrewrite } from '../../../../shared/types/longwriting.types'
import type { ElTree } from 'element-plus'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()


// 从父组件获取选中的模型（是一个 ComputedRef）
const selectedModel = inject<ReturnType<typeof computed<{ providerId: string; modelId: string } | null>>>('selectedModel', computed(() => null))

// 大纲节点列表
const outlineNodes = ref<StoryOutline[]>([])

// 角色和地点列表
const characters = ref<StoryCharacter[]>([])
const locations = ref<any[]>([])

// 当前激活的大纲 ID（用于高亮左侧树和右侧卡片）
const activeOutlineId = ref<string>('')

// 章节内容映射（outlineId -> content）
const chapterContentMap = ref<Record<string, string>>({})

// 章节ID映射（outlineId -> chapterId）
const chapterIdMap = ref<Record<string, string>>({})

// 章节卡片DOM引用
const chaptersPanelRef = ref<HTMLElement | null>(null)

// 版本列表
const versions = ref<ChapterVersion[]>([])

// 对话框状态
const showVersionDialog = ref(false)
const showPreviewDialog = ref(false)
const showGenerateDialog = ref(false)
const previewContent = ref('')

// 当前操作的大纲
const currentOutlineForAction = ref<StoryOutline | null>(null)

// 生成状态映射
const generatingMap = ref<Record<string, boolean>>({})
const generatingEventIdMap = ref<Record<string, string | null>>({})

// 保存状态映射
const savingMap = ref<Record<string, boolean>>({})

// 章节内容概要展开态（默认折叠，点击标题行切换）
const infoExpanded = ref(false)

// 自动保存
const autoSave = ref(true)

// 自动保存相关变量
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const lastSavedContent: Record<string, string> = {}

// 加载状态
const loading = ref(false)

// 生成参数表单
const generateForm = ref({
  targetWords: 3000,
  style: '',
  extraPrompt: ''
})

// 预写相关（只读显示）
const prewriteContent = ref('')
const currentPrewrite = ref<ChapterPrewrite | null>(null)

// 记忆统计（用于显示）
const memoryStats = ref<{ total: number; active: number } | null>(null)

// 实体状态快照
const snapshotStats = ref<{ total: number; byEntityType: Record<string, number> } | null>(null)
const showStateExtractDialog = ref(false)
const extractingStates = ref(false)
const extractedStates = ref<any[]>([])
const extractingOutlineId = ref<string>('')  // 记录正在提取状态的章节 ID

// 查看章节状态
const showViewStateDialog = ref(false)
const loadingChapterStates = ref(false)
const chapterStates = ref<any[]>([])
const currentViewStateOutlineId = ref<string>('')

// 新实体检测
const showNewEntitiesDialog = ref(false)
const detectedNewEntities = ref<{
  newCharacters: any[]
  newLocations: any[]
  newItems: any[]
} | null>(null)
const addingEntities = ref(false)

// 树配置
const treeProps = {
  children: 'children',
  label: 'name'
}

// 树引用
const treeRef = ref<InstanceType<typeof ElTree> | null>(null)

// 构建树形数据
const outlineTreeData = computed(() => {
  return buildOutlineTree(outlineNodes.value)
})

// 所有大纲（扁平化，用于渲染右侧卡片）- 只包含最底层节点
const allOutlines = computed(() => {
  // 获取所有最底层节点（没有子节点的节点）
  const leafNodes = outlineNodes.value.filter(n => isLeafNode(n.id))

  // 按照树的结构顺序排序（先遍历树获取顺序）
  const orderedIds: string[] = []
  function collectLeafIds(nodes: any[]) {
    for (const node of nodes) {
      if (isLeafNode(node.id)) {
        orderedIds.push(node.id)
      } else if (node.children && node.children.length > 0) {
        collectLeafIds(node.children)
      }
    }
  }
  collectLeafIds(outlineTreeData.value)

  // 按 orderedIds 的顺序返回
  return orderedIds.map(id => leafNodes.find(n => n.id === id)).filter(Boolean) as StoryOutline[]
})

// 判断节点是否是最底层节点（没有子节点）
function isLeafNode(nodeId: string): boolean {
  return !outlineNodes.value.some(n => n.parentId === nodeId)
}

// 获取节点下的所有最底层子节点ID
function getLeafChildren(nodeId: string): string[] {
  const result: string[] = []
  const node = outlineNodes.value.find(n => n.id === nodeId)
  if (!node) return result

  if (isLeafNode(nodeId)) {
    result.push(nodeId)
  } else {
    // 递归获取所有子节点
    const children = outlineNodes.value.filter(n => n.parentId === nodeId)
    for (const child of children) {
      result.push(...getLeafChildren(child.id))
    }
  }
  return result
}

// 判断当前选中的节点是否可编辑（只有最底层节点可编辑）
const isEditableNode = computed(() => {
  if (!activeOutlineId.value) return false
  return isLeafNode(activeOutlineId.value)
})

// 获取预览内容（合并所有子节点的内容）
const nodePreviewContent = computed(() => {
  if (!activeOutlineId.value) return ''

  const leafIds = getLeafChildren(activeOutlineId.value)
  const parts: string[] = []

  for (const leafId of leafIds) {
    const node = outlineNodes.value.find(n => n.id === leafId)
    const content = chapterContentMap.value[leafId] || ''
    if (node && content) {
      parts.push(`## ${node.name}\n\n${content}`)
    }
  }

  return parts.join('\n\n---\n\n')
})

// 渲染 Markdown 为 HTML
function renderMarkdown(content: string): string {
  if (!content) return ''
  return marked(content) as string
}

// 当前章节索引
const currentChapterIndex = computed(() => {
  if (!activeOutlineId.value) return 0
  return allOutlines.value.findIndex(o => o.id === activeOutlineId.value)
})

// 当前选中的节点（可能是卷、章或节）
const currentNode = computed(() => {
  if (!activeOutlineId.value) return null
  return outlineNodes.value.find(n => n.id === activeOutlineId.value) || null
})

// 当前可编辑的章节（最底层节点）
const currentChapter = computed(() => {
  if (!activeOutlineId.value) return null
  // 如果当前选中的是最底层节点，直接返回
  if (isLeafNode(activeOutlineId.value)) {
    return outlineNodes.value.find(n => n.id === activeOutlineId.value) || null
  }
  // 否则返回 null（非可编辑节点）
  return null
})

// 上一章
function prevChapter() {
  if (currentChapterIndex.value > 0) {
    const prevOutline = allOutlines.value[currentChapterIndex.value - 1]
    activeOutlineId.value = prevOutline.id
    treeRef.value?.setCurrentKey(prevOutline.id)
  }
}

// 下一章
function nextChapter() {
  if (currentChapterIndex.value < allOutlines.value.length - 1) {
    const nextOutline = allOutlines.value[currentChapterIndex.value + 1]
    activeOutlineId.value = nextOutline.id
    treeRef.value?.setCurrentKey(nextOutline.id)
  }
}

// 构建大纲树结构
function buildOutlineTree(nodes: StoryOutline[]): any[] {
  const nodeMap = new Map<string, any>()
  const rootNodes: any[] = []

  // 先创建映射
  for (const node of nodes) {
    nodeMap.set(node.id, {
      ...node,
      children: []
    })
  }

  // 构建树
  for (const node of nodes) {
    const treeNode = nodeMap.get(node.id)!
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!
      parent.children.push(treeNode)
    } else {
      rootNodes.push(treeNode)
    }
  }

  return rootNodes
}


// 折叠所有节点
function collapseAll() {
  const nodes = treeRef.value?.store?.nodesMap
  if (nodes) {
    for (const key in nodes) {
      nodes[key].expanded = false
    }
  }
}

// 处理节点点击 - 切换到对应章节
function handleNodeClick(data: StoryOutline) {
  activeOutlineId.value = data.id
  treeRef.value?.setCurrentKey(data.id)
}

// ==================== 一致性疑点：抽屉入口 / 编辑器定位高亮 / 交主编修正 ====================

const conflictPanelRef = ref<any>(null)
/** 待处理疑点数（工具栏徽标；ChapterConflictPanel 扫描后回报） */
const conflictCount = ref(0)
const editorRef = ref<any>(null)
/** CM5 TextMarker 句柄（换章时旧实例随之销毁，无需逐个清理，这里只兜当前实例） */
let conflictMarks: any[] = []

function clearConflictMarks(): void {
  for (const m of conflictMarks) {
    try { m.clear() } catch { /* 实例已销毁 */ }
  }
  conflictMarks = []
}

function openConflictPanel(): void {
  conflictPanelRef.value?.open()
}

/**
 * 疑点定位：跳章（如需）→ 等 CodeMirror 就绪（切章后编辑器重挂载）→
 * 按 excerpt 现场重锚定（扫描偏移可能已过期）→ markText 高亮 + 滚动选中。
 */
async function onLocateConflict(c: any): Promise<void> {
  const outlineId: string | undefined = c?.locs?.[0]?.outlineId || c?.outlineId
  if (!outlineId) {
    ElMessage.warning('该疑点没有定位信息')
    return
  }
  if (outlineId !== activeOutlineId.value) {
    const node = allOutlines.value.find((o: any) => o.id === outlineId)
    if (!node) {
      ElMessage.warning('未在大纲中找到该章节')
      return
    }
    activeOutlineId.value = outlineId
    treeRef.value?.setCurrentKey(outlineId)
    await nextTick()
  }
  const excerpt: string | undefined = c?.locs?.[0]?.excerpt || c?.entityName
  const content = chapterContentMap.value[outlineId] || ''
  if (!excerpt || !content) {
    ElMessage.info('该疑点为章节级（无正文锚点），已跳到对应章节')
    return
  }
  // 等编辑器就绪：轻壳动态加载重模块 + 切章重挂载，轮询上限约 3s
  let cm: any = null
  for (let i = 0; i < 20 && !cm; i++) {
    cm = editorRef.value?.getCodemirror?.() ?? null
    if (!cm) await new Promise((r) => setTimeout(r, 150))
  }
  const loc = locateExcerpt(content, excerpt, 1)
  if (!loc) {
    ElMessage.warning('原文已变化，无法精确高亮——请按章节内容自行查找')
    return
  }
  if (cm) {
    clearConflictMarks()
    const from = cm.posFromIndex(loc.start)
    const to = cm.posFromIndex(loc.end)
    conflictMarks.push(cm.markText(from, to, { className: 'lw-conflict-mark' }))
    cm.scrollIntoView(from, 120)
    cm.setSelection(from, to)
    cm.focus()
  } else {
    // 降级：轻量占位 textarea 选中（无滚动定位，仅示意）
    const ta: HTMLTextAreaElement | null = editorRef.value?.getFallbackTextarea?.() ?? null
    if (ta) {
      ta.focus()
      ta.setSelectionRange(loc.start, loc.end)
    }
    ElMessage.info('编辑器未就绪，已在文本域中选中（降级）')
  }
}

/** 交主编修正：组装分级修正消息发进研讨室（会话在主进程常驻，跨视图可达） */
async function onFixConflict(c: any): Promise<void> {
  if (!c) return
  try {
    const res = await window.electronAPI.longwriting.roomSend(props.projectId, buildConflictFixMessage(c), {})
    if (res?.success) ElMessage.success('已交主编处理——到研讨室查看进度并确认修正方案')
    else ElMessage.warning(res?.error || '发送失败（研讨室会话可能未就绪）')
  } catch (e: any) {
    ElMessage.warning(e?.message || '发送失败')
  }
}

// 名称映射
function getNodeTypeName(type?: OutlineNodeType): string {
  const names: Record<OutlineNodeType, string> = {
    volume: '卷',
    chapter: '章',
    section: '节'
  }
  return type ? names[type] : '节'
}

function getStatusName(status?: OutlineStatus): string {
  const names: Record<OutlineStatus, string> = {
    pending: '待写',
    progressing: '进行中',
    completed: '已完成'
  }
  return status ? names[status] : '待写'
}

function getStatusType(status?: OutlineStatus): string {
  const types: Record<OutlineStatus, string> = {
    pending: 'info',
    progressing: 'warning',
    completed: 'success'
  }
  return status ? types[status] : 'info'
}

function getCharacterName(id: string): string {
  const char = characters.value.find(c => c.id === id)
  return char?.name || '未知角色'
}

function getLocationName(id: string): string {
  const loc = locations.value.find(l => l.id === id)
  return loc?.name || '未知地点'
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 获取章节字数
function getChapterWordCount(outlineId: string): number {
  return chapterContentMap.value[outlineId]?.length || 0
}


// 获取编辑器占位符
function getEditorPlaceholder(outline: StoryOutline): string {
  return `编写「${outline.name}」的内容，或点击"AI 生成"自动生成...`
}

// 加载所有章节内容
async function loadAllChapters() {
  if (allOutlines.value.length === 0) return

  // 批量获取所有章节内容（一次 API 调用）
  const outlineIds = allOutlines.value.map(o => o.id)
  const result = await window.electronAPI.longwriting.getChaptersByOutlineIds(outlineIds)

  if (result.success && result.data) {
    for (const outlineId of outlineIds) {
      const chapter = result.data[outlineId]
      if (chapter) {
        chapterIdMap.value[outlineId] = chapter.id
        chapterContentMap.value[outlineId] = chapter.content || ''
        // 记录从数据库加载的内容，避免触发不必要的自动保存
        lastSavedContent[outlineId] = chapter.content || ''
      } else {
        chapterIdMap.value[outlineId] = ''
        chapterContentMap.value[outlineId] = ''
        lastSavedContent[outlineId] = ''
      }
    }
  }
}


// 加载版本历史
async function loadVersions(chapterId: string) {
  const result = await window.electronAPI.longwriting.getChapterVersions(chapterId)
  if (result.success) {
    versions.value = result.data || []
  }
}

// 保存章节
async function saveChapter(outlineId: string) {
  const content = chapterContentMap.value[outlineId]
  if (content === undefined) return
  // 52 号数据安全：缓冲为空但库里已有正文 → 视为异常（加载竞态/误清空），拒绝保存
  if (!content.trim() && (lastSavedContent[outlineId] || '').trim()) {
    delete saveTimers[outlineId]
    ElMessage.warning('章节内容为空，已跳过自动保存（防止覆盖已有正文）')
    return
  }

  savingMap.value[outlineId] = true
  try {
    const result = await window.electronAPI.longwriting.saveChapter(outlineId, content)
    if (result.success) {
      chapterIdMap.value[outlineId] = result.data.id
      // 复核修复：保存成功才推进自动保存水位（失败则保持 dirty，下次自动保存重试）
      lastSavedContent[outlineId] = content
      ElMessage.success('章节已保存')

      // 更新大纲状态为进行中
      const outline = outlineNodes.value.find(n => n.id === outlineId)
      if (outline && outline.status === 'pending') {
        await window.electronAPI.longwriting.updateOutline(outlineId, { status: 'progressing' })
        await loadOutlineTree()
      }

      updateProgress()
      // 图谱动态更新：章节保存后跑统一流水线（事件提取/状态快照/自动建边/章节摘要）
      void runChapterGraphPipeline(outlineId)
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } finally {
    savingMap.value[outlineId] = false
  }
}

/**
 * 章节图谱流水线（与向导流程一致，ChapterGraphProcessor 完整链路）：
 * 提取事件 → 实体状态快照 → 自动建边 → 章节状态摘要，失败不影响正文保存。
 * 图谱时间线/状态历史的数据来源：每章保存后自动更新。
 */
async function runChapterGraphPipeline(outlineId: string): Promise<void> {
  const content = chapterContentMap.value[outlineId] || ''
  if (!content.trim() || content.length < 100) return
  try {
    const chapterNo = calculateChapterNumber(outlineId)
    const r = await window.electronAPI.longwriting.graphExtractChapter(
      props.projectId,
      outlineId,
      content,
      chapterNo,
      selectedModel.value?.providerId,
      selectedModel.value?.modelId,
    )
    if (r.success && r.data) {
      const { events, stateCount } = r.data
      const parts: string[] = []
      if (events?.length) parts.push(`${events.length} 个事件`)
      if (stateCount) parts.push(`${stateCount} 条状态更新`)
      if (parts.length) console.log('[ChapterStage] 图谱已更新（' + parts.join('，') + '）')
    }
  } catch (e) {
    console.error('[ChapterStage] 章节图谱流水线失败（不影响正文保存）:', e)
  }
}

// 处理章节生成完成后的自动保存（图谱流水线由 saveChapter 统一触发）
async function handleChapterGenerated(outlineId: string) {
  try {
    // 先保存章节（内部会触发章节图谱流水线）
    await saveChapter(outlineId)
  } catch (e) {
    console.error('[ChapterStage] handleChapterGenerated 失败:', e)
  }
}

// 开始生成 - 显示对话框
async function startGenerate(outline: StoryOutline) {
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  currentOutlineForAction.value = outline
  generateForm.value.targetWords = outline.estimatedWords || 3000
  prewriteContent.value = '' // 清空预写内容
  currentPrewrite.value = null

  // 加载已保存的预写
  try {
    const result = await window.electronAPI.longwriting.getPrewrite(outline.id)
    if (result.success && result.data) {
      currentPrewrite.value = result.data
      prewriteContent.value = result.data.content || ''
    }
  } catch (error) {
    console.error('加载预写失败:', error)
  }

  // 加载记忆统计
  await loadMemoryStats()

  showGenerateDialog.value = true
}

// 计算章节序号
function calculateChapterNumber(outlineId: string): number {
  let count = 0
  for (const node of outlineNodes.value) {
    if (node.nodeType === 'chapter' || node.nodeType === 'section') {
      count++
    }
    if (node.id === outlineId) {
      return count
    }
  }
  return count || 1
}

// 加载记忆统计
async function loadMemoryStats() {
  try {
    const result = await window.electronAPI.longwriting.getMemoryStats(props.projectId)
    if (result.success && result.data) {
      memoryStats.value = {
        total: result.data.total,
        active: result.data.active
      }
    }
  } catch (error) {
    console.error('加载记忆统计失败:', error)
  }
}

// 加载状态快照统计
async function loadSnapshotStats() {
  try {
    const result = await window.electronAPI.longwriting.getSnapshotStats(props.projectId)
    if (result.success && result.data) {
      snapshotStats.value = {
        total: result.data.total,
        byEntityType: result.data.byEntityType
      }
    }
  } catch (error) {
    console.error('加载快照统计失败:', error)
  }
}

// 提取章节实体状态
async function extractEntityStatesFromChapter(outlineId: string) {
  if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
    ElMessage.warning('请先选择 AI 模型')
    return
  }

  const content = chapterContentMap.value[outlineId]
  if (!content || content.length < 100) {
    ElMessage.warning('章节内容太短，无法提取状态')
    return
  }

  const outline = outlineNodes.value.find(n => n.id === outlineId)
  if (!outline) return

  extractingStates.value = true
  extractedStates.value = []
  extractingOutlineId.value = outlineId  // 记录当前正在提取状态的章节 ID

  try {
    const chapterNumber = calculateChapterNumber(outlineId)

    // 第一步：检测章节中出现的所有实体（包括新实体）
    ElMessage.info('正在检测章节中的实体...')

    const detectResult = await window.electronAPI.longwriting.detectNewEntities(
      props.projectId,
      content,
      outlineId,
      chapterNumber
    )

    // 第二步：如果有新实体，自动添加到数据库
    let addedCount = { characters: 0, locations: 0, items: 0 }
    if (detectResult.success && detectResult.data) {
      const newEntities = detectResult.data
      const hasNewEntities = newEntities.newCharacters?.length > 0 ||
                            newEntities.newLocations?.length > 0 ||
                            newEntities.newItems?.length > 0

      if (hasNewEntities) {
        ElMessage.info(`发现新实体：${newEntities.newCharacters?.length || 0} 个角色，${newEntities.newLocations?.length || 0} 个地点，${newEntities.newItems?.length || 0} 个物品，正在添加...`)

        const addResult = await window.electronAPI.longwriting.autoAddEntities(
          props.projectId,
          newEntities.newCharacters,
          newEntities.newLocations,
          newEntities.newItems
        )

        if (addResult.success && addResult.data) {
          addedCount.characters = addResult.data.addedCharacters?.length || 0
          addedCount.locations = addResult.data.addedLocations?.length || 0
          addedCount.items = addResult.data.addedItems?.length || 0
          ElMessage.success(`已添加 ${addedCount.characters} 个角色，${addedCount.locations} 个地点，${addedCount.items} 个物品`)

          // 刷新本地角色、地点、物品列表
          await loadCharacters()
          await loadLocations()
        }
      }
    }

    // 第三步：构建涉及的实体列表（包括已有和新添加的）
    const involvedEntities: Array<{ type: string; id: string; name: string }> = []

    // 重新获取最新的角色和地点列表（包含新添加的）
    const latestCharactersResult = await window.electronAPI.longwriting.getCharacters(props.projectId)
    const latestLocationsResult = await window.electronAPI.longwriting.getLocations(props.projectId)
    const latestItemsResult = await window.electronAPI.longwriting.getItems(props.projectId)

    const latestCharacters = latestCharactersResult.success ? latestCharactersResult.data || [] : []
    const latestLocations = latestLocationsResult.success ? latestLocationsResult.data || [] : []
    const latestItems = latestItemsResult.success ? latestItemsResult.data || [] : []

    // 识别章节中涉及的所有实体（通过名称匹配）
    const recognizedEntityNames = new Set<string>()

    // 检查每个角色是否在章节中出现
    for (const char of latestCharacters) {
      if (content.includes(char.name)) {
        involvedEntities.push({ type: 'character', id: char.id, name: char.name })
        recognizedEntityNames.add(char.name)
      }
    }

    // 检查每个地点是否在章节中出现
    for (const loc of latestLocations) {
      if (content.includes(loc.name)) {
        involvedEntities.push({ type: 'location', id: loc.id, name: loc.name })
        recognizedEntityNames.add(loc.name)
      }
    }

    // 检查每个物品是否在章节中出现
    for (const item of latestItems) {
      if (content.includes(item.name)) {
        involvedEntities.push({ type: 'item', id: item.id, name: item.name })
        recognizedEntityNames.add(item.name)
      }
    }

    // 更新大纲的涉及实体（同步更新）
    const charIds = involvedEntities.filter(e => e.type === 'character').map(e => e.id)
    const locIds = involvedEntities.filter(e => e.type === 'location').map(e => e.id)
    await window.electronAPI.longwriting.updateOutline(outlineId, {
      involvedCharacters: charIds,
      involvedLocations: locIds
    })
    outline.involvedCharacters = charIds
    outline.involvedLocations = locIds

    // 如果没有识别到任何实体
    if (involvedEntities.length === 0) {
      ElMessage.warning('未识别到章节涉及的角色、地点或物品')
      extractingStates.value = false
      return
    }

    ElMessage.info(`识别到 ${involvedEntities.filter(e => e.type === 'character').length} 个角色，${involvedEntities.filter(e => e.type === 'location').length} 个地点，${involvedEntities.filter(e => e.type === 'item').length} 个物品，正在提取状态...`)

    // 第四步：提取所有实体的状态
    const result = await window.electronAPI.longwriting.extractEntityStates(
      props.projectId,
      outlineId,
      content,
      chapterNumber,
      involvedEntities,
      selectedModel.value.providerId,
      selectedModel.value.modelId
    )

    if (result.success && result.data) {
      extractedStates.value = result.data
      if (result.data.length > 0) {
        showStateExtractDialog.value = true
      } else {
        ElMessage.info('未检测到实体状态变化')
        extractingOutlineId.value = ''  // 清除章节 ID
      }
    } else {
      ElMessage.error(result.error || '提取实体状态失败')
      extractingOutlineId.value = ''  // 清除章节 ID
    }
  } catch (error: any) {
    ElMessage.error('提取实体状态失败：' + error.message)
    extractingOutlineId.value = ''  // 清除章节 ID
  } finally {
    extractingStates.value = false
  }
}

// 取消状态提取对话框
function cancelStateExtractDialog() {
  showStateExtractDialog.value = false
  extractingOutlineId.value = ''  // 清除章节 ID
  extractedStates.value = []  // 清除提取的状态
}

// 保存提取的实体状态
async function saveEntityStates() {
  if (extractedStates.value.length === 0) return

  try {
    // 使用提取时记录的章节 ID，而不是当前选中的章节
    const outlineId = extractingOutlineId.value
    if (!outlineId) {
      ElMessage.error('章节信息丢失，请重新提取状态')
      return
    }

    const outline = outlineNodes.value.find(n => n.id === outlineId)
    if (!outline) {
      ElMessage.error('章节不存在，请重新提取状态')
      return
    }

    const chapterNumber = calculateChapterNumber(outlineId)

    // 序列化数据
    const statesToCreate = JSON.parse(JSON.stringify(extractedStates.value.map(s => ({
      projectId: props.projectId,
      entityType: s.entityType,
      entityId: s.entityId,
      entityName: s.entityName,
      chapterNumber,
      stateSummary: s.stateSummary,
      keyChanges: s.keyChanges || []
    }))))

    const result = await window.electronAPI.longwriting.batchCreateEntityStateSnapshots(statesToCreate)
    if (result.success) {
      ElMessage.success(`已保存 ${result.data?.length || 0} 个实体状态快照`)
      showStateExtractDialog.value = false
      extractingOutlineId.value = ''  // 清除章节 ID
      await loadSnapshotStats()
    } else {
      ElMessage.error(result.error || '保存状态快照失败')
    }
  } catch (error: any) {
    ElMessage.error('保存状态快照失败：' + error.message)
  }
}

// 处理检测到的新实体
async function handleAddNewEntities() {
  if (!detectedNewEntities.value) return

  addingEntities.value = true
  try {
    const result = await window.electronAPI.longwriting.autoAddEntities(
      props.projectId,
      detectedNewEntities.value.newCharacters,
      detectedNewEntities.value.newLocations,
      detectedNewEntities.value.newItems
    )

    if (result.success) {
      const added = result.data
      const totalAdded =
        (added.addedCharacters?.length || 0) +
        (added.addedLocations?.length || 0) +
        (added.addedItems?.length || 0)

      if (totalAdded > 0) {
        ElMessage.success(`已添加 ${totalAdded} 个新实体到项目`)

        // 刷新角色和地点列表
        await loadCharacters()
        await loadLocations()

        // 如果有错误，也显示
        if (added.errors && added.errors.length > 0) {
          ElMessage.warning(added.errors.join('; '))
        }
      }

      showNewEntitiesDialog.value = false
      detectedNewEntities.value = null
    } else {
      ElMessage.error(result.error || '添加新实体失败')
    }
  } catch (error: any) {
    ElMessage.error('添加新实体失败：' + error.message)
  } finally {
    addingEntities.value = false
  }
}

// 忽略新实体
function handleIgnoreNewEntities() {
  showNewEntitiesDialog.value = false
  detectedNewEntities.value = null
}

// 获取重要性标签类型
function getImportanceTagType(importance: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  switch (importance) {
    case 'main': return 'danger'
    case 'secondary': return 'warning'
    case 'temporary': return 'info'
    default: return ''
  }
}

// 获取重要性显示名称
function getImportanceName(importance: string): string {
  const names: Record<string, string> = {
    main: '主要',
    secondary: '次要',
    temporary: '临时'
  }
  return names[importance] || importance
}

// 查看章节已保存的状态
async function viewChapterStates(outlineId: string) {
  currentViewStateOutlineId.value = outlineId
  loadingChapterStates.value = true
  chapterStates.value = []
  showViewStateDialog.value = true

  try {
    const chapterNumber = calculateChapterNumber(outlineId)
    const result = await window.electronAPI.longwriting.getEntityStatesByChapter(props.projectId, chapterNumber)

    if (result.success && result.data) {
      chapterStates.value = result.data
    } else {
      ElMessage.error(result.error || '加载状态快照失败')
    }
  } catch (error: any) {
    ElMessage.error('加载状态快照失败：' + error.message)
  } finally {
    loadingChapterStates.value = false
  }
}

// 删除状态快照
async function deleteState(stateId: string) {
  try {
    await ElMessageBox.confirm('确定要删除该状态快照吗？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const result = await window.electronAPI.longwriting.deleteEntityStateSnapshot(stateId)
    if (result.success) {
      chapterStates.value = chapterStates.value.filter(s => s.id !== stateId)
      ElMessage.success('删除成功')
      await loadSnapshotStats()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

// 执行生成
async function executeGeneration() {
  if (!currentOutlineForAction.value) return

  const outline = currentOutlineForAction.value
  const outlineId = outline.id

  showGenerateDialog.value = false
  generatingMap.value[outlineId] = true
  const previousContent = chapterContentMap.value[outlineId] || ''
  chapterContentMap.value[outlineId] = '' // 清空当前内容（失败时恢复）

  console.log('[ChapterStage] 生成章节, providerId:', selectedModel.value?.providerId, 'modelId:', selectedModel.value?.modelId)

  // 生成唯一事件 ID
  const eventId = `chapter-${outlineId}-${Date.now()}`
  generatingEventIdMap.value[outlineId] = eventId

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        chapterContentMap.value[outlineId] += event.content
      } else if (event.type === 'done') {
        generatingMap.value[outlineId] = false
        generatingEventIdMap.value[outlineId] = null
        // 自动保存并提取状态摘要
        if (autoSave.value && chapterContentMap.value[outlineId]) {
          handleChapterGenerated(outlineId)
        }
        ElMessage.success('章节内容已生成')
        unsubscribe()
      } else if (event.type === 'error') {
        generatingMap.value[outlineId] = false
        generatingEventIdMap.value[outlineId] = null
        if (!chapterContentMap.value[outlineId] && previousContent) chapterContentMap.value[outlineId] = previousContent
        ElMessage.error(event.error || '生成失败')
        unsubscribe()
      }
    }
  )

  // 调用 AI API（写作风格/附加提示激活：传入后端并入章节 prompt）
  const result = await window.electronAPI.longwriting.generateChapter(
    eventId,
    props.projectId,
    outlineId,
    generateForm.value.targetWords,
    selectedModel.value!.providerId,
    selectedModel.value!.modelId,
    generateForm.value.style || undefined,
    generateForm.value.extraPrompt || undefined,
    { skipChapterCardGate: true }
  )

  if (!result.success) {
    generatingMap.value[outlineId] = false
    generatingEventIdMap.value[outlineId] = null
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }

  currentOutlineForAction.value = null
}

// 章节工作台（38 号）：按勾选上下文生成——流式/自动保存与 confirmGenerate 同链路
async function handleGenerateWithContext(payload: { enabledItemIds: string[]; itemTextOverrides: Record<string, string> }) {
  const outlineId = activeOutlineId.value
  if (!outlineId || !selectedModel.value) {
    ElMessage.warning('请先选择章节与写作模型')
    return
  }
  if (generatingMap.value[outlineId]) {
    ElMessage.warning('该章节正在生成中')
    return
  }

  generatingMap.value[outlineId] = true
  // 52 号数据安全修复：记下清空前的内容——门禁拒绝/生成失败时必须恢复，
  // 否则空缓冲会被 3 秒自动保存落库，覆盖已有正文（实跑中第 2 章曾被清空）
  const previousContent = chapterContentMap.value[outlineId] || ''
  chapterContentMap.value[outlineId] = ''

  const eventId = `chapter-${outlineId}-${Date.now()}`
  generatingEventIdMap.value[outlineId] = eventId

  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        chapterContentMap.value[outlineId] += event.content
      } else if (event.type === 'done') {
        generatingMap.value[outlineId] = false
        generatingEventIdMap.value[outlineId] = null
        if (autoSave.value && chapterContentMap.value[outlineId]) {
          handleChapterGenerated(outlineId)
        }
        ElMessage.success('章节内容已生成（按勾选上下文）')
        unsubscribe()
      } else if (event.type === 'error') {
        generatingMap.value[outlineId] = false
        generatingEventIdMap.value[outlineId] = null
        if (!chapterContentMap.value[outlineId] && previousContent) chapterContentMap.value[outlineId] = previousContent
        ElMessage.error(event.error || '生成失败')
        unsubscribe()
      }
    }
  )

  const result = await window.electronAPI.longwriting.generateChapterWithContext(
    eventId,
    props.projectId,
    outlineId,
    {
      targetWords: generateForm.value.targetWords,
      style: generateForm.value.style || undefined,
      extraPrompt: generateForm.value.extraPrompt || undefined,
      enabledItemIds: payload.enabledItemIds,
      providerConfigId: selectedModel.value.providerId,
      modelId: selectedModel.value.modelId,
    }
  )

  if (!result.success) {
    generatingMap.value[outlineId] = false
    generatingEventIdMap.value[outlineId] = null
    unsubscribe()
    // 数据安全：未产生任何内容即失败（如门禁拦截）→ 恢复清空前的正文
    if (!chapterContentMap.value[outlineId] && previousContent) chapterContentMap.value[outlineId] = previousContent
    ElMessage.error(result.error || '生成失败')
  }
}

// 取消生成
function cancelGenerate(outlineId: string) {
  const eventId = generatingEventIdMap.value[outlineId]
  if (eventId) {
    generatingMap.value[outlineId] = false
    generatingEventIdMap.value[outlineId] = null
    ElMessage.info('已取消生成')
  }
}

// 显示版本历史
async function showVersions(outline: StoryOutline) {
  currentOutlineForAction.value = outline
  const chapterId = chapterIdMap.value[outline.id]
  if (chapterId) {
    await loadVersions(chapterId)
  } else {
    versions.value = []
  }
  showVersionDialog.value = true
}

// 预览版本
function previewVersion(version: ChapterVersion) {
  previewContent.value = version.content
  showPreviewDialog.value = true
}

// 恢复版本
async function restoreVersion(version: ChapterVersion) {
  if (version.isLocked) {
    ElMessage.warning('该版本已锁定，无法恢复')
    return
  }

  try {
    await ElMessageBox.confirm(
      '恢复历史版本将替换当前内容，确定要恢复吗？',
      '恢复版本',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (!currentOutlineForAction.value) return
    const chapterId = chapterIdMap.value[currentOutlineForAction.value.id]
    if (!chapterId) return

    const result = await window.electronAPI.longwriting.restoreChapterVersion(chapterId, version.id)
    if (result.success) {
      chapterContentMap.value[currentOutlineForAction.value.id] = result.data.content || ''
      await loadVersions(chapterId)
      ElMessage.success(`已恢复到版本 ${version.versionNumber}`)
    } else {
      ElMessage.error(result.error || '恢复失败')
    }
  } catch {
    // 用户取消
  }
}

// 前往大纲设计
function goToOutline() {
  emit('update:progress', 65)
}

// 更新进度
function updateProgress() {
  const completedNodes = outlineNodes.value.filter(n => n.status === 'completed').length
  const totalNodes = outlineNodes.value.filter(n => n.nodeType === 'chapter' || n.nodeType === 'section').length
  const progress = Math.min(100, 75 + Math.floor((completedNodes / Math.max(totalNodes, 1)) * 25))
  emit('update:progress', progress)
}

// ==================== 导出功能 ====================

// 导出单个章节（节）
async function exportChapter(outlineId: string) {
  const content = chapterContentMap.value[outlineId]
  if (!content) {
    ElMessage.warning('该章节暂无内容')
    return
  }

  const node = outlineNodes.value.find(n => n.id === outlineId)
  const fileName = node ? node.name : `章节_${outlineId}`

  try {
    const result = await window.electronAPI.longwriting.exportChapter({
      outlineId,
      content,
      fileName,
      format: 'txt'
    })

    if (result.success) {
      ElMessage.success(`已导出：${result.data}`)
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error: any) {
    ElMessage.error('导出失败：' + error.message)
  }
}

// 导出节点（卷或章）
async function exportNode(nodeId: string) {
  const leafIds = getLeafChildren(nodeId)
  if (leafIds.length === 0) {
    ElMessage.warning('该节点下暂无内容')
    return
  }

  const node = outlineNodes.value.find(n => n.id === nodeId)
  const nodeName = node ? node.name : `节点_${nodeId}`

  // 收集所有子节点内容
  const parts: string[] = []
  for (const leafId of leafIds) {
    const leafNode = outlineNodes.value.find(n => n.id === leafId)
    const content = chapterContentMap.value[leafId] || ''
    if (content) {
      parts.push(`## ${leafNode?.name || '未命名'}\n\n${content}`)
    }
  }

  if (parts.length === 0) {
    ElMessage.warning('该节点下暂无内容')
    return
  }

  const fullContent = parts.join('\n\n---\n\n')

  try {
    const result = await window.electronAPI.longwriting.exportChapter({
      outlineId: nodeId,
      content: fullContent,
      fileName: nodeName,
      format: 'txt'
    })

    if (result.success) {
      ElMessage.success(`已导出：${result.data}`)
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error: any) {
    ElMessage.error('导出失败：' + error.message)
  }
}

// 导出全部章节
async function exportAll() {
  if (allOutlines.value.length === 0) {
    ElMessage.warning('暂无章节内容')
    return
  }

  // 收集所有章节内容
  const parts: string[] = []
  for (const outline of allOutlines.value) {
    const content = chapterContentMap.value[outline.id] || ''
    if (content) {
      parts.push(`## ${outline.name}\n\n${content}`)
    }
  }

  if (parts.length === 0) {
    ElMessage.warning('暂无章节内容')
    return
  }

  const fullContent = parts.join('\n\n---\n\n')

  try {
    const result = await window.electronAPI.longwriting.exportChapter({
      outlineId: props.projectId,
      content: fullContent,
      fileName: '全部章节',
      format: 'txt'
    })

    if (result.success) {
      ElMessage.success(`已导出：${result.data}`)
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error: any) {
    ElMessage.error('导出失败：' + error.message)
  }
}

// 加载大纲树
async function loadOutlineTree() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId)
  if (result.success) {
    outlineNodes.value = result.data || []
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

// 加载地点列表
async function loadLocations() {
  if (!props.projectId) return
  const result = await window.electronAPI.longwriting.getLocations(props.projectId)
  if (result.success) {
    locations.value = result.data || []
  }
}

// 加载大纲和引用数据
async function loadData() {
  loading.value = true
  // 临时禁用自动保存，避免加载时触发不必要的保存
  autoSave.value = false

  await Promise.all([
    loadOutlineTree(),
    loadCharacters(),
    loadLocations()
  ])

  // 加载所有章节内容
  await loadAllChapters()

  // 加载快照统计
  await loadSnapshotStats()

  loading.value = false

  // 加载完成后恢复自动保存
  nextTick(() => {
    autoSave.value = true
  })

  // 设置初始激活节点
  if (allOutlines.value.length > 0) {
    activeOutlineId.value = allOutlines.value[0].id
  }

  updateProgress()
}

// 自动保存 - 使用防抖，记录上一次保存的内容以避免重复保存
watch(chapterContentMap, (newVal) => {
  if (!autoSave.value) return

  for (const outlineId in newVal) {
    // 只保存已有 ID 的章节，且内容有变化
    if (chapterIdMap.value[outlineId]) {
      const currentContent = newVal[outlineId]
      // 如果内容与上次保存的内容相同，跳过
      if (lastSavedContent[outlineId] === currentContent) continue

      if (saveTimers[outlineId]) clearTimeout(saveTimers[outlineId])
      saveTimers[outlineId] = setTimeout(() => {
        void saveChapter(outlineId)
        // 复核修复：不再提前标记 lastSavedContent——旧实现在保存发起前就
        // 记水位，保存失败后该版本内容被去重逻辑永久跳过，静默丢失。
        // lastSavedContent 只在 saveChapter 成功分支更新。
      }, 3000)
    }
  }
}, { deep: true })

// 监听 projectId 变化重新加载
watch(() => props.projectId, () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<style lang="scss" scoped>
.chapter-stage {
  margin: 0 auto;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.stage-header {
  margin-bottom: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;

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
    flex: 1;
  }

  .header-export-btn {
    flex-shrink: 0;
  }
}

.stage-content {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chapter-layout {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.outline-tree-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .tree-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--fill-color-lighter);
    border-bottom: 1px solid var(--border-color-lighter);

    h3 {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
    }
  }

  .outline-tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    :deep(.el-tree-node__content) {
      height: auto;
      padding: 8px 4px;
    }

    .tree-node {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;

      &.active {
        .node-name {
          color: var(--color-primary);
          font-weight: 500;
        }
      }

      .node-name {
        flex: 1;
        font-size: 13px;
        color: var(--text-color-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-status {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;

        &.pending {
          background: var(--color-info-light-9);
          color: var(--color-info);
        }

        &.progressing {
          background: var(--color-warning-light-9);
          color: var(--color-warning);
        }

        &.completed {
          background: var(--color-success-light-9);
          color: var(--color-success);
        }
      }
    }
  }
}

// 右侧章节编辑面板
.chapters-panel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// 单章节容器
.single-chapter-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.empty-chapter {
  padding: 60px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

// 章节卡片样式
.chapter-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--fill-color-blank);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  min-height: 0;
  overflow: hidden;
  transition: all 0.2s ease;

  &.active {
    border-color: var(--color-primary-light-3);
    box-shadow: 0 2px 12px rgba(var(--color-primary-rgb), 0.12);
  }
}

// 标题栏（紧凑；三段式：标题信息 | 上一节/下一节 | icon 操作，两侧 flex:1 保证中段真正居中）
.chapter-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--fill-color-lighter);
  border-bottom: 1px solid var(--border-color-lighter);
  flex-shrink: 0;

  .title-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;

    .chapter-type {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--color-primary-light-9);
      color: var(--color-primary);
      flex-shrink: 0;
    }

    .chapter-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .word-count {
      font-size: 12px;
      color: var(--text-color-secondary);
      flex-shrink: 0;
    }
  }

  .title-center {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .title-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    flex: 1;
    min-width: 0;

    // 疑点徽标：包着工具按钮，垂直对齐修正
    .conflict-badge {
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
    }
  }
}

// 章节信息（可折叠：标题行常显，内容默认收起）
.chapter-info {
  padding: 0 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  flex-shrink: 0;

  .info-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    cursor: pointer;
    user-select: none;
    min-width: 0;

    .toggle-arrow {
      font-size: 12px;
      color: var(--text-color-secondary);
      transition: transform 0.2s ease;
      flex-shrink: 0;

      &.expanded {
        transform: rotate(90deg);
      }
    }

    .toggle-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-color-secondary);
      flex-shrink: 0;
    }

    .toggle-preview {
      font-size: 12px;
      color: var(--text-color-secondary);
      opacity: 0.75;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
  }

  .info-detail {
    padding-bottom: 8px;
  }

  .chapter-summary {
    font-size: 12px;
    color: var(--text-color-secondary);
    line-height: 1.5;
    margin: 0 0 6px 0;
  }

  .chapter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
}

// 卡片主体：编辑器/预览 + 右侧上下文面板横向排列（布局修复：原纵向堆叠把面板挤到底部）
.chapter-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
}

// 编辑器容器
.chapter-editor-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// 预览模式提示
.preview-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  background: var(--color-info-light-9);
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

// 预览容器
.chapter-preview-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-color);

  .preview-content-area {
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.8;
    color: var(--text-color-primary);

    :deep(h2) {
      font-size: 18px;
      font-weight: 600;
      margin: 24px 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color-lighter);
      color: var(--text-color-primary);
    }

    :deep(h3) {
      font-size: 16px;
      font-weight: 500;
      margin: 20px 0 12px 0;
      color: var(--text-color-primary);
    }

    :deep(p) {
      margin-bottom: 16px;
      color: var(--text-color-primary);
    }

    :deep(hr) {
      border: none;
      border-top: 1px dashed var(--border-color-light);
      margin: 32px 0;
    }

    :deep(blockquote) {
      border-left: 4px solid var(--color-primary);
      padding-left: 16px;
      margin: 16px 0;
      color: var(--text-color-secondary);
    }
  }
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--fill-color-blank);
  border-radius: 6px;
  border: 1px solid var(--border-color-lighter);

  .version-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .version-number {
      font-weight: 500;
      color: var(--text-color-primary);
    }

    .version-type {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;

      &.generated {
        background: var(--color-primary-light-9);
        color: var(--color-primary);
      }

      &.manual {
        background: var(--color-success-light-9);
        color: var(--color-success);
      }
    }

    .version-date,
    .version-words {
      font-size: 12px;
      color: var(--text-color-secondary);
    }
  }

  .version-actions {
    display: flex;
    gap: 4px;
  }
}

.preview-content {
  background: var(--fill-color-lighter);
  padding: 16px;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;

  pre {
    margin: 0;
    font-family: 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}

// 预写样式
.prewrite-section {
  margin-top: 16px;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.prewrite-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--fill-color-light);
  border-bottom: 1px solid var(--border-color-lighter);
}

.prewrite-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-primary);
}

.prewrite-content {
  padding: 12px;
  background: var(--fill-color-blank);

  .el-textarea__inner {
    font-family: 'Microsoft YaHei', sans-serif;
    font-size: 13px;
    line-height: 1.8;
    border-radius: 4px;
  }

  .prewrite-streaming {
    max-height: 300px;
    overflow-y: auto;

    pre {
      margin: 0;
      font-family: 'Microsoft YaHei', sans-serif;
      font-size: 13px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: var(--text-color-regular);
    }
  }
}

.prewrite-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--text-color-secondary);
  font-size: 14px;

  .el-icon {
    font-size: 18px;
  }
}

// 记忆统计提示
.memory-stats-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-info-light-9);
  border-top: 1px solid var(--border-color-lighter);
  font-size: 12px;
  color: var(--color-info);

  .el-icon {
    font-size: 14px;
  }
}

// 记忆提取中
.memory-extracting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-color-secondary);
  font-size: 14px;

  .el-icon {
    font-size: 24px;
    color: var(--color-primary);
  }
}

// 记忆列表
.memory-list {
  .memory-hint {
    margin-bottom: 16px;
    font-size: 14px;
    color: var(--text-color-secondary);
  }

  .memory-item {
    padding: 12px;
    margin-bottom: 12px;
    background: var(--fill-color-lighter);
    border-radius: 8px;
    border: 1px solid var(--border-color-lighter);

    .memory-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .entity-name {
        font-weight: 500;
        font-size: 14px;
      }
    }

    .key-changes {
      margin-top: 8px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;

      .key-changes-label {
        font-size: 12px;
        color: var(--text-color-secondary);
      }
    }

    .state-summary-display {
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--bg-color);
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: var(--text-color-primary);
    }
  }
}

// 状态对话框样式
.state-dialog {
  :deep(.el-dialog__body) {
    padding: 16px 20px;
    max-height: 60vh;
    overflow: hidden;
  }
}

.dialog-content-scroll {
  max-height: calc(60vh - 20px);
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

// 新实体确认对话框样式
.entity-section {
  margin-bottom: 20px;

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color-lighter);
  }
}

.new-entity-item {
  padding: 12px;
  margin-bottom: 10px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--border-color-lighter);

  .entity-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    .entity-name {
      font-weight: 500;
      font-size: 14px;
    }
  }

  .entity-description {
    font-size: 13px;
    color: var(--text-color-regular);
    line-height: 1.5;
  }

  .entity-reason {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-color-secondary);
  }
}

// 预写只读显示样式
.prewrite-content-readonly {
  padding: 12px;
  background: var(--fill-color-blank);
  border: 1px solid var(--border-color-light);
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-color-primary);
  }
}

.prewrite-empty-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--color-info-light-9);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);

  .el-icon {
    color: var(--color-info);
  }
}

.prewrite-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
}
</style>