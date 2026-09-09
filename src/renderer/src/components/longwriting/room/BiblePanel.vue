<template>
  <div class="panel">
    <!-- 讨论成果（共识账本）：非空才出现，默认折叠——原型设定集为单一面板，账本作为其上的轻量区 -->
    <div v-if="ledger.length > 0" class="ledger">
      <div class="ledger-bar" @click="ledgerOpen = !ledgerOpen">
        <span class="ledger-title">✦ 讨论成果</span>
        <span class="ledger-cnt">{{ confirmedCount }} 已定 · {{ tentativeCount }} 讨论中<template v-if="rejectedCount"> · {{ rejectedCount }} 已否决</template></span>
        <span class="ledger-arrow">{{ ledgerOpen ? '▾' : '▸' }}</span>
      </div>
      <button class="ledger-distill" title="把讨论成果提炼成卡片" @click.stop="$emit('distill')">⚡ 提炼</button>
      <div v-if="ledgerOpen" class="ledger-body">
        <div v-for="e in ledger" :key="e.id" class="ledger-row">
          <el-popover placement="left" :width="300" trigger="click">
            <template #reference>
              <span class="chip" :class="e.status" :title="e.points.join('；')">
                {{ e.status === 'rejected' ? '✕ ' : '✦ ' }}{{ e.title }}
              </span>
            </template>
            <div class="pop">
              <div class="pop-title">{{ e.title }}</div>
              <ul v-if="e.points.length" class="pop-points">
                <li v-for="(pt, i) in e.points" :key="i">{{ pt }}</li>
              </ul>
              <div class="pop-meta">第 {{ e.sourceTurn }} 轮 · {{ statusLabel(e.status) }}</div>
              <div class="pop-ops">
                <el-button v-if="e.status !== 'confirmed'" size="small" type="primary" @click="$emit('op', { action: 'confirm', entryId: e.id })">确认</el-button>
                <el-button v-if="e.status !== 'rejected'" size="small" @click="$emit('op', { action: 'reject', entryId: e.id })">否决</el-button>
                <el-button size="small" @click="$emit('revise', e)">修改</el-button>
                <el-button size="small" type="danger" text @click="$emit('op', { action: 'discard', entryId: e.id })">丢弃</el-button>
                <el-button size="small" text @click="$emit('ask', e.title)">在对话中追问</el-button>
              </div>
            </div>
          </el-popover>
        </div>
      </div>
    </div>

    <!-- 世界设定集（原型单一面板） -->
    <div class="head">
      <div class="row1">
        <h4>🌏 世界设定集</h4>
        <span class="cnt">{{ total }} 条</span>
        <el-dropdown trigger="click" @command="(k: string) => $emit('ask', `设计一个${kindLabel(k)}：`)">
          <button class="add">＋ 新增</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="g in GROUP_DEFS" :key="g.key" :command="g.key">{{ g.label }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <input v-model="keyword" class="search" placeholder="搜索设定…" />
    </div>
    <div class="scroll">
      <div v-if="total === 0 && !keyword" class="empty">设定集为空——从左侧对话开始</div>
      <div v-for="g in groups" :key="g.key" class="group">
        <div class="group-head">
          <span class="gico">{{ g.ico }}</span>{{ g.label }}
          <span class="gcnt">{{ g.entries.length }}</span>
          <span v-if="g.entries.length === 0" class="todo" @click="$emit('ask', `设计一个${g.label}：`)">待讨论 · 说「设计一个{{ g.label }}」</span>
        </div>
        <div v-for="e in visibleEntries(g)" :key="e.id" class="entry" @click="openDetail(g, e.id)">
          <span class="eico">{{ g.ico }}</span>
          <span class="ename">{{ e.name }}</span>
          <span class="esub">{{ e.sub }}</span>
          <span class="src">{{ e.src }}</span>
        </div>
      </div>
      <div v-if="total > 0 && shownTotal === 0" class="no-result">没有匹配的设定</div>
    </div>

    <!-- 设定详情抽屉（只读 + 溯源 + 追问/跳写作台） -->
    <el-drawer v-model="detailOpen" :title="detailTitle" size="380px" append-to-body>
      <template v-if="detail">
        <div v-if="detail.prov" class="prov-line" @click="$emit('locate-turn', detail.prov.turns[0])">
          ✦ 源自第 {{ detail.prov.turns.join('、') }} 轮讨论 · {{ detail.prov.cardTitle }}（点击回看讨论）
        </div>
        <div v-for="f in detail.fields" :key="f.k" class="detail-row">
          <span class="detail-k">{{ f.k }}</span>
          <span class="detail-v">{{ f.v }}</span>
        </div>
        <div class="detail-ops">
          <el-button size="small" type="primary" @click="askDetail">在对话中追问</el-button>
          <el-button size="small" @click="$emit('open-editor')">在写作台打开</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { ConsensusEntry, ConsensusStatus, LedgerOpInput } from '@shared/types/story-room.types'

defineOptions({ name: 'RoomSettingsPanel' })

const props = defineProps<{
  projectId: string
  ledger: ConsensusEntry[]
  refreshKey?: number
  cards?: Array<Record<string, any>>
}>()
const emit = defineEmits<{
  (e: 'op', op: LedgerOpInput): void
  (e: 'revise', entry: ConsensusEntry): void
  (e: 'ask', text: string): void
  (e: 'distill'): void
  (e: 'open-editor'): void
  (e: 'locate-turn', turn: number): void
}>()

interface BibleEntry {
  id: string
  name: string
  sub: string
  src: string
}
interface BibleGroup {
  key: string
  label: string
  ico: string
  entries: BibleEntry[]
}

const keyword = ref('')
const groups = ref<BibleGroup[]>([])
const ledgerOpen = ref(false)

// ===== 详情抽屉 =====
const detailOpen = ref(false)
const detail = ref<{ title: string; groupLabel: string; fields: Array<{ k: string; v: string }>; prov: { turns: number[]; cardTitle: string } | null; askText: string } | null>(null)
/** 原始行（列表接口即全量字段，无需二次请求） */
const rawRows = new Map<string, Record<string, any>>()

const DETAIL_FIELDS: Record<string, Array<[string, string]>> = {
  overview: [['storyType', '题材'], ['summary', '概要'], ['coreConflict', '核心冲突'], ['coreIdea', '核心创意'], ['estimatedChapters', '预估章节']],
  character: [['gender', '性别'], ['age', '年龄'], ['occupation', '身份'], ['rolePosition', '定位'], ['appearance', '外貌'], ['background', '背景'], ['personality', '性格'], ['abilities', '能力'], ['majorEvents', '重大事件']],
  plot: [['summary', '走向'], ['involvedCharacters', '涉及人物']],
  outline: [['nodeType', '层级'], ['summary', '概要'], ['estimatedWords', '预估字数'], ['status', '状态']],
  faction: [['factionType', '性质'], ['description', '描述']],
  skill: [['type', '类型'], ['level', '品阶'], ['description', '描述'], ['system', '体系']],
  item: [['type', '类型'], ['level', '品级'], ['description', '描述']],
  location: [['type', '类型'], ['importance', '重要性'], ['description', '描述']],
}

/** 溯源：按名称回链已采纳/待定卡片（卡片带 sourceTurns） */
function findProvenance(kind: string, name: string): { turns: number[]; cardTitle: string } | null {
  for (const c of props.cards || []) {
    if (c.status === 'ignored' || c.status === 'failed') continue
    const d = c.data || {}
    let hit = false
    if (kind === 'character') hit = String(d.name || '') === name
    else if (kind === 'plot') hit = String(d.title || '') === name
    else if (kind === 'overview') hit = c.kind === 'overview' && String(d.title || '') === name
    else if (kind === 'world') {
      if (c.kind !== 'world') continue
      hit = ['locations', 'factions', 'skills', 'items'].some((k) =>
        Array.isArray(d[k]) && d[k].some((x: any) => String(x?.name || '') === name))
    }
    if (hit) return { turns: c.sourceTurns || [], cardTitle: c.title }
  }
  return null
}

function openDetail(group: { key: string; label: string }, id: string): void {
  const raw = rawRows.get(id)
  const entry = groups.value.find((g) => g.key === group.key)?.entries.find((e) => e.id === id)
  if (!entry) return
  const fields: Array<{ k: string; v: string }> = []
  if (raw) {
    for (const [key, label] of DETAIL_FIELDS[group.key] || []) {
      const v = raw[key]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue
      fields.push({ k: label, v: Array.isArray(v) ? v.join('、') : String(v).slice(0, 300) })
    }
  }
  detail.value = {
    title: entry.name,
    groupLabel: group.label,
    fields: fields.length > 0 ? fields : [{ k: '简介', v: entry.sub }],
    prov: findProvenance(group.key, entry.name),
    askText: `关于「${entry.name}」（${group.label}）：`,
  }
  detailOpen.value = true
}

const detailTitle = computed(() => (detail.value ? `${detail.value.groupLabel} · ${detail.value.title}` : '设定详情'))

function askDetail(): void {
  if (!detail.value) return
  detailOpen.value = false
  emit('ask', detail.value.askText)
}

const GROUP_DEFS: Array<{ key: string; label: string; ico: string }> = [
  { key: 'overview', label: '概要', ico: '📘' },
  { key: 'character', label: '人物', ico: '🧑' },
  { key: 'plot', label: '故事线', ico: '🧵' },
  { key: 'outline', label: '大纲', ico: '🌳' },
  { key: 'faction', label: '门派', ico: '⛩️' },
  { key: 'skill', label: '武功', ico: '⚔️' },
  { key: 'item', label: '物品', ico: '💎' },
  { key: 'location', label: '地点', ico: '🏔️' },
]

function kindLabel(key: string): string {
  return GROUP_DEFS.find((g) => g.key === key)?.label || key
}

const total = computed(() => groups.value.reduce((n, g) => n + g.entries.length, 0))
const shownTotal = computed(() =>
  groups.value.reduce((n, g) => n + g.entries.filter((e) => matchKeyword(e)).length, 0),
)
const confirmedCount = computed(() => props.ledger.filter((e) => e.status === 'confirmed').length)
const tentativeCount = computed(() => props.ledger.filter((e) => e.status === 'tentative').length)
const rejectedCount = computed(() => props.ledger.filter((e) => e.status === 'rejected').length)

function matchKeyword(e: BibleEntry): boolean {
  const k = keyword.value.trim()
  if (!k) return true
  return e.name.includes(k) || e.sub.includes(k)
}

function visibleEntries(g: BibleGroup): BibleEntry[] {
  return g.entries.filter((e) => matchKeyword(e))
}

function statusLabel(s: ConsensusStatus): string {
  return s === 'confirmed' ? '已定' : s === 'tentative' ? '讨论中' : '已否决'
}

const api = () => window.electronAPI.longwriting

async function ok(p: Promise<{ success: boolean; data?: unknown }>): Promise<any> {
  try {
    const r = await p
    return r?.success ? r.data : null
  } catch {
    return null
  }
}

async function load(): Promise<void> {
  const [overview, characters, plots, factions, skills, items, locations, outlineTree] = await Promise.all([
    ok(api().getStoryOverview(props.projectId)),
    ok(api().getCharacters(props.projectId)),
    ok(api().getPlots(props.projectId)),
    ok(api().getFactions(props.projectId)),
    ok(api().getSkills(props.projectId)),
    ok(api().getItems(props.projectId)),
    ok(api().getLocations(props.projectId)),
    ok(api().getOutlineTree(props.projectId)),
  ])
  const list = (v: unknown): Array<Record<string, any>> => (Array.isArray(v) ? (v as Array<Record<string, any>>) : [])
  const outlineNodes = list(outlineTree)
  const nodeSub = (t: string) => (t === 'volume' ? '卷' : t === 'chapter' ? '章' : '节')
  rawRows.clear()
  const keep = (row: Record<string, any>) => { if (row?.id !== undefined) rawRows.set(String(row.id), row) }
  list(characters).forEach(keep); list(plots).forEach(keep); list(factions).forEach(keep)
  list(skills).forEach(keep); list(items).forEach(keep); list(locations).forEach(keep)
  outlineNodes.forEach(keep)
  if (overview) keep({ id: 'overview', ...overview })

  groups.value = [
    {
      key: 'overview', label: '概要', ico: '📘',
      entries: overview && String(overview.title || '').trim()
        ? [{ id: 'overview', name: String(overview.title), sub: String(overview.summary || '').slice(0, 20), src: '初始' }]
        : [],
    },
    {
      key: 'character', label: '人物', ico: '🧑',
      entries: list(characters).map((c) => ({ id: c.id, name: String(c.name || ''), sub: String(c.rolePosition || c.occupation || '').slice(0, 20), src: '初始' })),
    },
    {
      key: 'plot', label: '故事线', ico: '🧵',
      entries: list(plots).map((p) => ({ id: p.id, name: String(p.title || ''), sub: String(p.summary || '').slice(0, 20), src: '初始' })),
    },
    {
      key: 'outline', label: '大纲', ico: '🌳',
      entries: outlineNodes.map((n) => ({ id: n.id, name: String(n.name || ''), sub: nodeSub(String(n.nodeType || '')), src: '初始' })),
    },
    {
      key: 'faction', label: '门派', ico: '⛩️',
      entries: list(factions).map((f) => ({ id: f.id, name: String(f.name || ''), sub: String(f.description || '').slice(0, 20), src: '初始' })),
    },
    {
      key: 'skill', label: '武功', ico: '⚔️',
      entries: list(skills).map((sk) => ({ id: sk.id, name: String(sk.name || ''), sub: String(sk.type || '') === 'ability' ? '能力' : String(sk.type || ''), src: '初始' })),
    },
    {
      key: 'item', label: '物品', ico: '💎',
      entries: list(items).map((it) => ({ id: it.id, name: String(it.name || ''), sub: String(it.type || '') === 'artifact' ? '至宝' : String(it.type || ''), src: '初始' })),
    },
    {
      key: 'location', label: '地点', ico: '🏔️',
      entries: list(locations).map((l) => ({ id: l.id, name: String(l.name || ''), sub: String(l.description || '').slice(0, 20), src: '初始' })),
    },
  ]
}

watch(() => props.refreshKey, () => { void load() })
onMounted(() => { void load() })
</script>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; flex: 1; background: var(--el-bg-color); }

/* 讨论成果（折叠区） */
.ledger { position: relative; border-bottom: 1px solid var(--el-border-color-lighter); }
.ledger-bar { display: flex; align-items: baseline; gap: 8px; padding: 10px 76px 6px 16px; cursor: pointer; }
.ledger-title { font-size: 12.5px; font-weight: 600; color: var(--el-text-color-primary); }
.ledger-cnt { font-size: 11px; color: var(--el-text-color-secondary); flex: 1; }
.ledger-arrow { font-size: 10px; color: var(--el-text-color-secondary); }
.ledger-distill {
  position: absolute; top: 8px; right: 12px; border: 1px solid var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9); color: var(--el-color-primary); border-radius: 7px;
  font-size: 11px; padding: 1px 7px; cursor: pointer; font-family: inherit;
}
.ledger-distill:hover { background: var(--el-color-primary-light-8); }
.ledger-body { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 12px 10px; }
.ledger-row { display: flex; }
.chip {
  font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer; line-height: 1.6;
  border: 1px solid var(--el-border-color-light); color: var(--el-text-color-regular);
  background: var(--el-fill-color-light); transition: all 0.15s;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chip:hover { border-color: var(--el-color-primary-light-5); }
.chip.confirmed { color: var(--el-color-primary); background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-8); font-weight: 500; }
.chip.rejected { text-decoration: line-through; opacity: 0.62; }
.pop-title { font-weight: 600; font-size: 13.5px; }
.pop-points { margin: 6px 0 6px 18px; font-size: 12.5px; color: var(--el-text-color-regular); line-height: 1.7; }
.pop-meta { font-size: 11px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.pop-ops { display: flex; flex-wrap: wrap; gap: 4px; }

/* 详情抽屉 */
.prov-line {
  font-size: 12px; color: var(--el-color-primary); background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8); border-radius: 8px; padding: 7px 11px;
  margin-bottom: 12px; cursor: pointer; line-height: 1.6;
}
.prov-line:hover { background: var(--el-color-primary-light-8); }
.detail-row { display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px dashed var(--el-border-color-lighter); }
.detail-k { width: 72px; flex-shrink: 0; color: var(--el-text-color-secondary); font-size: 12.5px; }
.detail-v { flex: 1; font-size: 13px; line-height: 1.7; color: var(--el-text-color-primary); word-break: break-word; }
.detail-ops { margin-top: 16px; display: flex; gap: 8px; }

/* 面板头（原型形态） */
.head { padding: 13px 16px 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.row1 { display: flex; align-items: center; gap: 8px; }
.head h4 { font-size: 13.5px; font-weight: 600; letter-spacing: 0.5px; }
.cnt { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; }
.add {
  border: 1px solid var(--el-border-color); background: transparent; border-radius: 7px; cursor: pointer;
  font-size: 12px; color: var(--el-text-color-regular); padding: 2.5px 9px; transition: all 0.15s; font-family: inherit;
}
.add:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.search {
  margin-top: 9px; width: 100%; border: 1px solid var(--el-border-color); border-radius: 8px;
  padding: 7px 12px; font-size: 12.5px; outline: none; font-family: inherit;
  background: var(--el-fill-color-light); color: var(--el-text-color-primary); transition: border-color 0.15s; box-sizing: border-box;
}
.search:focus { border-color: var(--el-color-primary); background: var(--el-bg-color); }
.scroll { flex: 1; overflow-y: auto; padding: 4px 12px 14px; }
.empty { text-align: center; font-size: 12px; color: var(--el-text-color-placeholder); padding: 24px 8px; line-height: 1.7; }
.no-result { text-align: center; color: var(--el-text-color-secondary); font-size: 12px; padding: 24px 0; }

/* 分组（原型形态：扁平 group-head + entry 卡行） */
.group { padding: 7px 4px 0; }
.group-head {
  display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--el-text-color-regular);
  font-weight: 600; padding: 6px 4px 4px; letter-spacing: 0.5px;
}
.gico {
  width: 24px; height: 24px; border-radius: 7px; background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter); display: inline-flex; align-items: center;
  justify-content: center; font-size: 12.5px; font-weight: 400; flex-shrink: 0;
}
.gcnt {
  color: var(--el-text-color-secondary); font-weight: 400; font-size: 10.5px;
  background: var(--el-fill-color-light); border-radius: 999px; padding: 0 7px;
}
.todo { margin-left: auto; font-size: 10.5px; color: var(--el-text-color-secondary); font-weight: 400; cursor: pointer; }
.todo:hover { color: var(--el-color-primary); }
.entry {
  display: flex; align-items: center; gap: 9px; border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px; padding: 7px 11px; margin: 4px 0; cursor: pointer; background: var(--el-bg-color);
  transition: all 0.15s;
}
.entry:hover {
  border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9);
  transform: translateY(-1px);
}
.entry:hover .ename { color: var(--el-color-primary); }
.eico {
  width: 26px; height: 26px; border-radius: 7px; background: var(--el-fill-color-light);
  display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0;
}
.ename { font-size: 13px; font-weight: 500; white-space: nowrap; }
.esub { font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.src {
  font-size: 10px; color: var(--el-text-color-secondary); border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px; padding: 0 6px; flex-shrink: 0; line-height: 16px;
}
</style>
