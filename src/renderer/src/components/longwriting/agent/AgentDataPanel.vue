<template>
  <div class="agent-data-panel">
    <!-- Tab 条 -->
    <div class="panel-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="panel-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <el-icon><component :is="tab.icon" /></el-icon>
        <span>{{ tab.label }}</span>
        <span v-if="badgeCount(tab.key)" class="tab-badge">{{ badgeCount(tab.key) }}</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="panel-content">
      <!-- 概览 -->
      <div v-show="activeTab === 'overview'" class="tab-body">
        <template v-if="data.overview">
          <div class="overview-hero">
            <div class="hero-title">{{ data.overview.title || '未命名' }}</div>
            <el-tag size="small" effect="plain" round>{{ typeLabel(data.overview.storyType) }}</el-tag>
          </div>
          <div class="overview-block">
            <div class="block-label">一句话概念</div>
            <div class="block-text">{{ data.overview.summary || '—' }}</div>
          </div>
          <div class="overview-block">
            <div class="block-label">核心冲突</div>
            <div class="block-text">{{ data.overview.coreConflict || '—' }}</div>
          </div>
          <div class="overview-block" v-if="data.overview.estimatedChapters">
            <div class="block-label">预估篇幅</div>
            <div class="block-text">{{ data.overview.estimatedChapters }} 章</div>
          </div>
        </template>
        <div v-else class="panel-empty">
          <el-icon><Notebook /></el-icon>
          <p>还没有故事概要</p>
          <span>在对话里告诉我你的想法</span>
        </div>

        <!-- 生产状态 -->
        <div v-if="productionState" class="state-list">
          <div class="state-title">创作进度</div>
          <div class="state-item" v-for="s in stateItems" :key="s.key" :class="{ done: s.done }">
            <el-icon class="state-icon">
              <CircleCheckFilled v-if="s.done" />
              <CircleClose v-else />
            </el-icon>
            <span>{{ s.label }}</span>
            <span class="state-count">{{ s.count }}</span>
          </div>
        </div>
      </div>

      <!-- 人物 -->
      <div v-show="activeTab === 'characters'" class="tab-body">
        <div v-if="data.characters.length" class="char-grid">
          <div
            v-for="c in data.characters"
            :key="c.id"
            class="char-card"
            @click="showCharacter(c)"
          >
            <div class="char-avatar" :style="{ background: avatarColor(c.name) }">{{ (c.name || '?').slice(0, 1) }}</div>
            <div class="char-info">
              <div class="char-name">{{ c.name }}</div>
              <el-tag size="small" :type="roleTagType(c.rolePosition)" effect="light">{{ roleLabel(c.rolePosition) }}</el-tag>
            </div>
            <div class="char-brief">{{ c.personality || c.background || c.occupation || '' }}</div>
          </div>
        </div>
        <div v-else class="panel-empty">
          <el-icon><User /></el-icon>
          <p>还没有人物</p>
          <span>让 AI 帮你设计角色</span>
        </div>
      </div>

      <!-- 世界 -->
      <div v-show="activeTab === 'world'" class="tab-body">
        <template v-if="hasWorld">
          <div v-if="data.background" class="world-group">
            <div class="group-header"><el-icon><Flag /></el-icon> 时代背景</div>
            <div class="group-text">{{ data.background.eraDescription || data.background.socialStructure || '（待补充）' }}</div>
          </div>
          <WorldList v-if="data.locations.length" title="地点" icon="location" :items="data.locations" />
          <WorldList v-if="data.factions.length" title="势力" icon="flag" :items="data.factions" />
          <WorldList v-if="data.skills.length" title="技能" icon="magic" :items="data.skills" />
          <WorldList v-if="data.items.length" title="物品" icon="box" :items="data.items" />
        </template>
        <div v-else class="panel-empty">
          <el-icon><Flag /></el-icon>
          <p>还没有世界设定</p>
          <span>让 AI 搭建世界观</span>
        </div>
      </div>

      <!-- 故事线 -->
      <div v-show="activeTab === 'plots'" class="tab-body">
        <div v-if="data.plots.length" class="plot-list">
          <div v-for="(p, i) in data.plots" :key="p.id" class="plot-item">
            <div class="plot-index">{{ i + 1 }}</div>
            <div class="plot-body">
              <div class="plot-title">{{ p.title }}</div>
              <div class="plot-summary">{{ p.summary }}</div>
            </div>
          </div>
        </div>
        <div v-else class="panel-empty">
          <el-icon><List /></el-icon>
          <p>还没有故事线</p>
          <span>让 AI 规划剧情走向</span>
        </div>
      </div>

      <!-- 大纲 -->
      <div v-show="activeTab === 'outline'" class="tab-body">
        <div v-if="data.outlineTree.length" class="outline-tree">
          <OutlineNode
            v-for="root in roots"
            :key="root.id"
            :node="root"
            :chapters-map="data.chaptersMap"
            :depth="0"
            @open-chapter="showChapter"
          />
        </div>
        <div v-else class="panel-empty">
          <el-icon><Files /></el-icon>
          <p>还没有大纲</p>
          <span>让 AI 生成故事大纲</span>
        </div>
      </div>

      <!-- 章节 -->
      <div v-show="activeTab === 'chapters'" class="tab-body">
        <div v-if="writtenChapters.length" class="chapter-list">
          <div v-for="leaf in writtenChapters" :key="leaf.id" class="chapter-item" @click="showChapter(leaf)">
            <div class="chapter-icon"><el-icon><Document /></el-icon></div>
            <div class="chapter-info">
              <div class="chapter-name">{{ leaf.name }}</div>
              <div class="chapter-meta">{{ wordCount(data.chaptersMap[leaf.id]?.content) }}</div>
            </div>
            <el-icon class="chapter-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
        <div v-else class="panel-empty">
          <el-icon><Document /></el-icon>
          <p>还没有写好的章节</p>
          <span>大纲就绪后，让 AI 开始写</span>
        </div>
      </div>
    </div>

    <!-- 人物详情弹窗 -->
    <el-dialog v-model="charDialog.visible" :title="charDialog.character?.name || '人物详情'" width="480px" append-to-body>
      <div v-if="charDialog.character" class="char-detail">
        <div class="detail-grid">
          <div class="detail-item" v-if="charDialog.character.rolePosition"><label>定位</label><span>{{ roleLabel(charDialog.character.rolePosition) }}</span></div>
          <div class="detail-item" v-if="charDialog.character.gender"><label>性别</label><span>{{ genderLabel(charDialog.character.gender) }}</span></div>
          <div class="detail-item" v-if="charDialog.character.age"><label>年龄</label><span>{{ charDialog.character.age }}</span></div>
          <div class="detail-item" v-if="charDialog.character.occupation"><label>职业</label><span>{{ charDialog.character.occupation }}</span></div>
        </div>
        <div class="detail-block" v-if="charDialog.character.personality"><label>性格</label><p>{{ charDialog.character.personality }}</p></div>
        <div class="detail-block" v-if="charDialog.character.appearance"><label>外貌</label><p>{{ charDialog.character.appearance }}</p></div>
        <div class="detail-block" v-if="charDialog.character.background"><label>背景</label><p>{{ charDialog.character.background }}</p></div>
        <div class="detail-block" v-if="charDialog.character.abilities"><label>能力</label><p>{{ charDialog.character.abilities }}</p></div>
      </div>
    </el-dialog>

    <!-- 章节阅读弹窗 -->
    <el-dialog v-model="chapterDialog.visible" :title="chapterDialog.node?.name || '章节'" width="640px" append-to-body>
      <div class="chapter-read">
        <div v-if="chapterDialog.content" class="chapter-content">{{ chapterDialog.content }}</div>
        <div v-else class="panel-empty">
          <el-icon><Document /></el-icon>
          <p>本章还没有正文</p>
          <span>在对话里让 AI 写这一章</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 数据面板：概览/人物/世界/故事线/大纲/章节 分区展示 + 详情弹窗。
 * 数据来自 useAgentPanelData（父组件持有，事件驱动刷新）。
 */
import { ref, computed, h } from 'vue'
import type { Component } from 'vue'
import {
  Notebook, User, Flag, List, Files, Document,
  Location, MagicStick, Box, CircleCheckFilled, CircleClose, ArrowRight,
} from '@element-plus/icons-vue'
import type { AgentPanelData, AgentProductionStateLite } from '@/composables/useAgentPanelData'

const props = defineProps<{
  data: AgentPanelData
  productionState: AgentProductionStateLite | null
}>()

const TABS: Array<{ key: string; label: string; icon: Component }> = [
  { key: 'overview', label: '概览', icon: Notebook },
  { key: 'characters', label: '人物', icon: User },
  { key: 'world', label: '世界', icon: Flag },
  { key: 'plots', label: '故事线', icon: List },
  { key: 'outline', label: '大纲', icon: Files },
  { key: 'chapters', label: '章节', icon: Document },
]

const activeTab = ref('overview')

function badgeCount(key: string): number {
  switch (key) {
    case 'characters': return props.data.characters.length
    case 'plots': return props.data.plots.length
    case 'world': {
      const d = props.data
      return d.locations.length + d.factions.length + d.skills.length + d.items.length + (d.background ? 1 : 0)
    }
    case 'outline': return props.data.outlineTree.length
    case 'chapters': return Object.keys(props.data.chaptersMap).length
    default: return 0
  }
}

// ==================== 概览 ====================

function typeLabel(type?: string): string {
  const map: Record<string, string> = {
    wuxia: '武侠', xianxia: '仙侠', xuanhuan: '玄幻', kehuan: '科幻',
    xuanyi: '悬疑', dushi: '都市', yanqing: '言情', lishi: '历史', other: '其他',
  }
  return map[type || ''] || '未指定'
}

const stateItems = computed(() => {
  const ps = props.productionState
  if (!ps) return []
  return [
    { key: 'overview', label: '故事概要', done: ps.overview?.exists, count: ps.overview?.title || '' },
    { key: 'characters', label: '人物', done: (ps.characters?.count || 0) > 0, count: `${ps.characters?.count || 0} 位` },
    {
      key: 'world', label: '世界设定',
      done: !!ps.world?.background || (ps.world?.locations || 0) + (ps.world?.factions || 0) + (ps.world?.skills || 0) + (ps.world?.items || 0) > 0,
      count: '',
    },
    { key: 'plots', label: '故事线', done: (ps.plots?.count || 0) > 0, count: `${ps.plots?.count || 0} 条` },
    { key: 'outline', label: '大纲', done: (ps.outline?.total || 0) > 0, count: `${ps.outline?.written || 0}/${ps.outline?.total || 0}` },
    { key: 'chapters', label: '章节', done: (ps.chapters?.written || 0) > 0, count: `${ps.chapters?.written || 0} 章` },
  ]
})

// ==================== 人物 ====================

function roleLabel(role?: string): string {
  const map: Record<string, string> = { protagonist: '主角', supporting: '配角', antagonist: '反派', minor: '龙套' }
  return map[role || ''] || '角色'
}

function roleTagType(role?: string): 'primary' | 'danger' | 'info' | 'warning' {
  if (role === 'protagonist') return 'primary'
  if (role === 'antagonist') return 'danger'
  if (role === 'supporting') return 'warning'
  return 'info'
}

const AVATAR_COLORS = ['#5b8c85', '#c94043', '#4a7cb8', '#c9a04a', '#7d5a6a', '#5d8a66']
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function genderLabel(g?: string): string {
  return g === 'male' ? '男' : g === 'female' ? '女' : '其他'
}

const charDialog = ref<{ visible: boolean; character: any | null }>({ visible: false, character: null })
function showCharacter(c: any): void {
  charDialog.value = { visible: true, character: c }
}

// ==================== 世界 ====================

const hasWorld = computed(() => {
  const d = props.data
  return !!d.background || d.locations.length > 0 || d.factions.length > 0 || d.skills.length > 0 || d.items.length > 0
})

// ==================== 大纲 / 章节 ====================

const roots = computed(() => props.data.outlineTree.filter((n: any) => !n.parentId))

function wordCount(content?: string): string {
  if (!content) return '未写'
  const words = content.length
  if (words < 1000) return `${words} 字`
  return `${Math.round(words / 100) / 10} 千字`
}

const chapterDialog = ref<{ visible: boolean; node: any | null; content: string }>({ visible: false, node: null, content: '' })
function showChapter(node: any): void {
  chapterDialog.value = {
    visible: true,
    node,
    content: props.data.chaptersMap[node.id]?.content || '',
  }
}

const writtenChapters = computed(() => {
  const written: any[] = []
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if ((n.nodeType === 'chapter' || n.nodeType === 'section') && props.data.chaptersMap[n.id]) {
        written.push(n)
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(props.data.outlineTree)
  return written
})

/** 进度带点击 → 切换到指定 Tab */
function setActiveTab(key: string): void {
  activeTab.value = key
}

defineExpose({ setActiveTab })

// ==================== 子组件：世界列表 / 大纲节点（render 函数实现，避免嵌套模板复杂度） ====================

const WORLD_ICONS: Record<string, Component> = {
  location: Location, flag: Flag, magic: MagicStick, box: Box,
}

const WorldList = {
  name: 'WorldList',
  props: {
    title: { type: String, required: true },
    icon: { type: String, required: true },
    items: { type: Array, required: true },
  },
  setup(props: any) {
    return () =>
      h('div', { class: 'world-group' }, [
        h('div', { class: 'group-header' }, [
          h(WORLD_ICONS[props.icon] || Flag, { style: { fontSize: '14px' } }),
          h('span', props.title),
          h('span', { class: 'group-count' }, `${props.items.length}`),
        ]),
        ...props.items.slice(0, 8).map((item: any) =>
          h('div', { class: 'world-item' }, [
            h('div', { class: 'world-item-name' }, item.name),
            h('div', { class: 'world-item-desc' }, item.description || ''),
          ]),
        ),
      ])
  },
}

const OutlineNode = {
  name: 'OutlineNode',
  props: {
    node: { type: Object, required: true },
    chaptersMap: { type: Object, required: true },
    depth: { type: Number, required: true },
  },
  emits: ['openChapter'],
  setup(props: any, { emit }: any) {
    const nodeTypeLabel = (t: string) => (t === 'volume' ? '卷' : t === 'chapter' ? '章' : '节')
    return () => {
      const n = props.node
      const children = (n.children || []).map((c: any) =>
        h(OutlineNode, {
          node: c,
          chaptersMap: props.chaptersMap,
          depth: props.depth + 1,
          onOpenChapter: (node: any) => emit('openChapter', node),
        }),
      )
      return h('div', { class: ['outline-node', `depth-${props.depth}`] }, [
        h(
          'div',
          {
            class: ['outline-row', { leaf: n.nodeType === 'chapter' || n.nodeType === 'section' }],
            onClick: () => {
              if (n.nodeType === 'chapter' || n.nodeType === 'section') emit('openChapter', n)
            },
          },
          [
            h('span', { class: 'outline-type' }, nodeTypeLabel(n.nodeType)),
            h('span', { class: 'outline-name' }, n.name),
            props.chaptersMap[n.id]
              ? h('span', { class: 'outline-status done' }, '✓')
              : h('span', { class: 'outline-status' }, '○'),
          ],
        ),
        ...children,
      ])
    }
  },
}
</script>

<style lang="scss" scoped>
.agent-data-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-color);
  border-left: 1px solid var(--border-color-lighter);
}

.panel-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--border-color-lighter);
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--fill-color-light);
    color: var(--text-color-regular);
  }

  &.active {
    background: var(--color-primary-light-9);
    color: var(--color-primary);
    border-color: var(--color-primary-light-5);
    font-weight: 500;
  }

  .tab-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: #fff;
    font-size: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

.panel-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// ==================== 空态 ====================

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 16px;
  color: var(--text-color-placeholder);
  text-align: center;

  .el-icon {
    font-size: 30px;
    opacity: 0.5;
  }

  p {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--text-color-secondary);
  }

  span {
    font-size: 12px;
  }
}

// ==================== 概览 ====================

.overview-hero {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  .hero-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color-primary);
  }
}

.overview-block {
  .block-label {
    font-size: 11px;
    color: var(--text-color-placeholder);
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }

  .block-text {
    font-size: 13px;
    color: var(--text-color-regular);
    line-height: 1.7;
    background: var(--fill-color-lighter);
    border-radius: var(--radius-md);
    padding: 10px 12px;
  }
}

.state-list {
  margin-top: 8px;
  border-top: 1px dashed var(--border-color-lighter);
  padding-top: 12px;

  .state-title {
    font-size: 11px;
    color: var(--text-color-placeholder);
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }

  .state-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    font-size: 13px;
    color: var(--text-color-secondary);

    .state-icon {
      color: var(--text-color-placeholder);
    }

    &.done {
      color: var(--text-color-regular);

      .state-icon {
        color: var(--color-success);
      }
    }

    .state-count {
      margin-left: auto;
      font-size: 12px;
      color: var(--text-color-placeholder);
    }
  }
}

// ==================== 人物 ====================

.char-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.char-card {
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light-5);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }
}

.char-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.char-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;

  .char-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color-primary);
  }
}

.char-brief {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// ==================== 世界 ====================

.world-group {
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  padding: 10px 12px;

  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color-primary);
    margin-bottom: 8px;

    .group-count {
      margin-left: auto;
      font-size: 11px;
      color: var(--text-color-placeholder);
      font-weight: 400;
    }
  }

  .world-item {
    padding: 4px 0;
    border-top: 1px dashed var(--border-color-lighter);

    .world-item-name {
      font-size: 13px;
      color: var(--text-color-regular);
      font-weight: 500;
    }

    .world-item-desc {
      font-size: 12px;
      color: var(--text-color-secondary);
      line-height: 1.5;
      margin-top: 2px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
}

.group-text {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.6;
}

// ==================== 故事线 ====================

.plot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plot-item {
  display: flex;
  gap: 10px;
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  padding: 10px 12px;

  .plot-index {
    width: 22px;
    height: 22px;
    border-radius: var(--radius-full);
    background: var(--color-primary-light-9);
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .plot-body {
    min-width: 0;

    .plot-title {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-color-primary);
    }

    .plot-summary {
      font-size: 12px;
      color: var(--text-color-secondary);
      line-height: 1.6;
      margin-top: 3px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
}

// ==================== 大纲 ====================

.outline-node {
  .outline-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: var(--radius-sm);
    cursor: default;

    &:hover {
      background: var(--fill-color-light);
    }

    &.leaf {
      cursor: pointer;
    }

    .outline-type {
      font-size: 10px;
      color: var(--text-color-placeholder);
      border: 1px solid var(--border-color-light);
      border-radius: 4px;
      padding: 0 4px;
      flex-shrink: 0;
    }

    .outline-name {
      font-size: 13px;
      color: var(--text-color-regular);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .outline-status {
      font-size: 11px;
      color: var(--text-color-placeholder);

      &.done {
        color: var(--color-success);
      }
    }
  }

  &.depth-1 .outline-row { padding-left: 16px; }
  &.depth-2 .outline-row { padding-left: 28px; }
}

// ==================== 章节 ====================

.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light-5);
    transform: translateX(2px);
  }

  .chapter-icon {
    color: var(--color-primary);
    font-size: 16px;
  }

  .chapter-info {
    flex: 1;
    min-width: 0;

    .chapter-name {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-color-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chapter-meta {
      font-size: 11px;
      color: var(--text-color-placeholder);
      margin-top: 2px;
    }
  }

  .chapter-arrow {
    color: var(--text-color-placeholder);
    font-size: 13px;
  }
}

// ==================== 详情弹窗 ====================

.char-detail {
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    margin-bottom: 12px;

    .detail-item {
      display: flex;
      gap: 6px;
      font-size: 13px;

      label {
        color: var(--text-color-placeholder);
        flex-shrink: 0;
      }

      span {
        color: var(--text-color-regular);
      }
    }
  }

  .detail-block {
    margin-bottom: 10px;

    label {
      font-size: 12px;
      color: var(--text-color-placeholder);
    }

    p {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--text-color-regular);
      line-height: 1.7;
      white-space: pre-wrap;
    }
  }
}

.chapter-read {
  .chapter-content {
    font-size: 14px;
    line-height: 1.9;
    color: var(--text-color-regular);
    white-space: pre-wrap;
    max-height: 60vh;
    overflow-y: auto;
  }
}
</style>
