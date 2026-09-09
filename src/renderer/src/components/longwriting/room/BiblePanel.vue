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
        <el-dropdown trigger="click" @command="onAddCommand">
          <button class="add">＋ 新增</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="g in groups" :key="g.kindKey" :command="g.storage === 'custom' ? `kind:${g.kindKey}` : g.kindKey">设计{{ g.label }}</el-dropdown-item>
              <el-dropdown-item command="__custom_form" divided>手动新增（表单）…</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <input v-model="keyword" class="search" placeholder="搜索设定…" />
    </div>
    <div class="scroll">
      <div v-if="total === 0 && !keyword" class="empty">设定集为空——从左侧对话开始</div>
      <div v-for="g in groups" :key="g.kindKey" class="group">
        <div class="group-head">
          <span class="gico">{{ g.icon || '📁' }}</span>{{ g.label }}
          <span class="gcnt">{{ g.entries.length }}</span>
          <span v-if="g.entries.length === 0" class="todo" @click="$emit('ask', `设计一个${g.label}：`)">待讨论 · 说「设计一个{{ g.label }}」</span>
        </div>
        <div v-for="e in visibleEntries(g)" :key="e.id" class="entry" @click="openDetail(g, e.id)">
          <span class="eico">{{ g.icon || '📁' }}</span>
          <span class="ename">{{ e.name }}</span>
          <span class="esub">{{ e.aliases?.length ? `${e.sub}（${e.aliases.join('/')}）` : e.sub }}</span>
          <span class="src">{{ e.origin?.type === 'discussion' ? '讨论' : '初始' }}</span>
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
        <div v-if="detail.kindKey === 'foreshadow'" class="detail-ops">
          <el-button size="small" type="success" @click="markForeshadow('paid')">✓ 标记已收</el-button>
          <el-button size="small" type="danger" text @click="markForeshadow('dropped')">弃置</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 手动新增（custom 分类） -->
    <el-dialog v-model="createOpen" title="手动新增设定" width="460px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="分类">
          <el-select v-model="createKindKey" style="width: 100%">
            <el-option v-for="g in groups" :key="g.kindKey" :value="g.kindKey" :label="g.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="createName" placeholder="名称" />
        </el-form-item>
        <el-form-item v-if="(createKind?.entries.length || 0) > 0" label="上级">
          <el-select v-model="createParentId" style="width: 100%" clearable placeholder="无（顶层）">
            <el-option v-for="e in createKind?.entries || []" :key="e.id" :value="e.id" :label="e.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-for="f in (createKind?.fieldsSchema || []).filter((x) => x.key !== 'name')" :key="f.key" :label="f.label">
          <el-select v-if="f.type === 'select'" v-model="createFields[f.key]" style="width: 100%">
            <el-option v-for="o in f.options || []" :key="o" :value="o" :label="o" />
          </el-select>
          <el-input-number v-else-if="f.type === 'number'" v-model="createFields[f.key] as never" style="width: 100%" />
          <el-input v-else-if="f.type === 'textarea'" v-model="createFields[f.key]" type="textarea" :rows="3" />
          <el-input v-else-if="f.type === 'tags'" v-model="createFields[f.key]" placeholder="多个用、分隔" />
          <el-input v-else v-model="createFields[f.key]" />
        </el-form-item>
        <div class="form-tip">entity 类（概要/人物等）请走对话或写作台，此处仅覆盖自定义分类</div>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :disabled="!createName.trim()" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { BibleGroupWire, ConsensusEntry, ConsensusStatus, LedgerOpInput } from '@shared/types/story-room.types'

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
  (e: 'add-kind', kindKey: string): void
  (e: 'foreshadow-status', id: string, status: 'paid' | 'dropped'): void
}>()

const keyword = ref('')
const groups = ref<BibleGroupWire[]>([])
const ledgerOpen = ref(false)

// ===== 详情抽屉（bible:detail：fieldsSchema 驱动 + 关系小节） =====
const detailOpen = ref(false)
const detail = ref<{
  id: string
  title: string
  groupLabel: string
  kindKey: string
  fields: Array<{ k: string; v: string }>
  relations: Array<string>
  prov: { turns: number[]; cardTitle: string } | null
  askText: string
} | null>(null)

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

async function openDetail(g: BibleGroupWire, id: string): Promise<void> {
  const entry = g.entries.find((e) => e.id === id)
  if (!entry) return
  detailOpen.value = true
  // 伏笔：条目 fields 即行数据（含状态），不走 bible:detail
  if (g.kindKey === 'foreshadow') {
    const f = entry.fields as Record<string, any>
    detail.value = {
      id,
      title: entry.name,
      groupLabel: g.label,
      kindKey: g.kindKey,
      fields: [
        { k: '内容', v: String(f.content || entry.name) },
        { k: '埋设', v: f.plantedChapter ? `第 ${f.plantedChapter} 章` : '章节未定' },
        { k: '回收', v: f.payoffChapter ? `第 ${f.payoffChapter} 章` : '尚未回收' },
        { k: '状态', v: f.status === 'paid' ? '已回收' : f.status === 'dropped' ? '已弃置' : '未收' },
      ],
      relations: [],
      prov: findProvenance(g.kindKey, entry.name),
      askText: `关于伏笔「${entry.name}」：`,
    }
    return
  }
  detail.value = {
    id,
    title: entry.name,
    groupLabel: g.label,
    kindKey: g.kindKey,
    fields: [],
    relations: [],
    prov: findProvenance(g.kindKey, entry.name),
    askText: `关于「${entry.name}」（${g.label}）：`,
  }
  try {
    const res = await window.electronAPI.longwriting.bibleDetail(props.projectId, g.kindKey, id)
    if (!res.success || !res.data) throw new Error(res.error || '详情读取失败')
    const schema = g.fieldsSchema || []
    const raw = (res.data.fields || {}) as Record<string, unknown>
    const fields: Array<{ k: string; v: string }> = []
    for (const f of schema) {
      if (f.key === 'name') continue
      const v = raw[f.key]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue
      fields.push({ k: f.label, v: Array.isArray(v) ? v.join('、') : String(v).slice(0, 400) })
    }
    const relations = (res.data.relations || []).map((r: Record<string, any>) => {
      const who = r.targetName || r.target || ''
      const rel = r.relationType || r.label || '关联'
      const from = r.validFromChapter ? `（第${r.validFromChapter}章起）` : ''
      return `${who}：${rel}${from}`
    })
    detail.value = { ...detail.value, fields: fields.length > 0 ? fields : [{ k: '简介', v: entry.sub }], relations }
  } catch {
    detail.value = { ...detail.value!, fields: [{ k: '简介', v: entry.sub }] }
  }
}

const detailTitle = computed(() => (detail.value ? `${detail.value.groupLabel} · ${detail.value.title}` : '设定详情'))

// ===== 手动新增（custom 分类，fieldsSchema 驱动动态表单） =====
const createOpen = ref(false)
const createKindKey = ref('')
const createKind = computed(() => groups.value.find((g) => g.kindKey === createKindKey.value))
const createName = ref('')
const createFields = ref<Record<string, string>>({})
const createParentId = ref('')

function onAddCommand(cmd: string): void {
  if (cmd.startsWith('kind:')) {
    // 动态分类「设计」：插入对话引导 + 记住提炼范围（⚡提炼按此分类执行一次）
    emit('add-kind', cmd)
    emit('ask', `设计一个${kindLabel(cmd.slice(5))}：`)
    return
  }
  if (cmd === '__custom_form') {
    const customKind = groups.value.find((g) => g.storage === 'custom')
    createKindKey.value = customKind?.kindKey || groups.value[0]?.kindKey || ''
    createName.value = ''
    createFields.value = {}
    createOpen.value = true
    return
  }
  emit('ask', `设计一个${kindLabel(cmd)}：`)
}

async function submitCreate(): Promise<void> {
  if (!createKindKey.value || !createName.value.trim()) return
  const fields: Record<string, unknown> = {}
  for (const f of createKind.value?.fieldsSchema || []) {
    if (f.key === 'name') continue
    const v = createFields.value[f.key]
    if (v === undefined || v === '') continue
    fields[f.key] = f.type === 'number' ? Number(v) || 0 : f.type === 'tags' ? v.split(/[,，、]/).map((x) => x.trim()).filter(Boolean) : v
  }
  const res = await window.electronAPI.longwriting.bibleCustomCreate(
    props.projectId, createKindKey.value, createName.value.trim(), fields, { type: 'manual' },
    createParentId.value || null,
  )
  if (res.success) {
    createOpen.value = false
    void load()
    ElMessage.success('已新增设定')
  } else {
    ElMessage.error(res.error || '新增失败')
  }
}

function markForeshadow(status: 'paid' | 'dropped'): void {
  if (!detail.value) return
  emit('foreshadow-status', detail.value.id, status)
  detailOpen.value = false
}

function askDetail(): void {
  if (!detail.value) return
  detailOpen.value = false
  emit('ask', detail.value.askText)
}

function kindLabel(key: string): string {
  return groups.value.find((g) => g.kindKey === key)?.label || key
}

const total = computed(() => groups.value.reduce((n, g) => n + g.entries.length, 0))
const shownTotal = computed(() =>
  groups.value.reduce((n, g) => n + g.entries.filter((e) => matchKeyword(e)).length, 0),
)
const confirmedCount = computed(() => props.ledger.filter((e) => e.status === 'confirmed').length)
const tentativeCount = computed(() => props.ledger.filter((e) => e.status === 'tentative').length)
const rejectedCount = computed(() => props.ledger.filter((e) => e.status === 'rejected').length)

function matchKeyword(e: { name: string; sub: string; aliases?: string[] }): boolean {
  const k = keyword.value.trim()
  if (!k) return true
  return e.name.includes(k) || e.sub.includes(k) || (e.aliases || []).some((a) => a.includes(k))
}

function visibleEntries(g: BibleGroupWire) {
  return g.entries.filter((e) => matchKeyword(e))
}

function statusLabel(s: ConsensusStatus): string {
  return s === 'confirmed' ? '已定' : s === 'tentative' ? '讨论中' : '已否决'
}

async function load(): Promise<void> {
  try {
    const res = await window.electronAPI.longwriting.bibleList(props.projectId)
    if (res.success && Array.isArray(res.data)) groups.value = res.data
  } catch {
    groups.value = []
  }
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

.form-tip { font-size: 11px; color: var(--el-text-color-secondary); line-height: 1.6; }

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
