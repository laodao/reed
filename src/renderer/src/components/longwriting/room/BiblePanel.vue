<template>
  <div class="panel">
    <div class="head">
      <h4>🌏 故事圣经</h4>
      <span class="cnt">{{ total }} 已入库</span>
    </div>
    <div class="search-wrap">
      <input v-model="keyword" class="search" placeholder="搜索设定…" />
    </div>
    <div class="scroll">
      <div v-if="total === 0" class="empty">还没有入库设定——讨论出的卡片采纳后会出现在这里</div>
      <div v-for="g in groups" :key="g.key" class="group">
        <div class="group-head">
          <span class="gico">{{ g.ico }}</span>{{ g.label }}
          <span class="gcnt">{{ g.entries.length }}</span>
        </div>
        <div
          v-for="e in g.entries"
          :key="e.id"
          class="entry"
          @click="openEntry(g, e)"
        >
          <span class="eico">{{ g.ico }}</span>
          <span class="ename">{{ e.name }}</span>
          <span class="esub">{{ e.sub }}</span>
        </div>
      </div>
      <div v-if="total > 0 && shownTotal === 0" class="no-result">没有匹配的设定</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

defineOptions({ name: 'RoomBiblePanel' })

const props = defineProps<{ projectId: string; storyType?: string }>()
const emit = defineEmits<{
  (e: 'ask', text: string): void
  (e: 'open-editor', stage?: string): void
}>()

interface BibleEntry {
  id: string
  name: string
  sub: string
}
interface BibleGroup {
  key: string
  label: string
  ico: string
  entries: BibleEntry[]
  /** 跳转高级编辑器的阶段 */
  stage?: string
}

const keyword = ref('')
const groups = ref<BibleGroup[]>([])

const total = computed(() => groups.value.reduce((n, g) => n + g.entries.length, 0))
const shownTotal = computed(() =>
  groups.value.reduce((n, g) => n + g.entries.filter((e) => matchKeyword(e)).length, 0),
)

function matchKeyword(e: BibleEntry): boolean {
  const k = keyword.value.trim()
  if (!k) return true
  return e.name.includes(k) || e.sub.includes(k)
}

function openEntry(g: BibleGroup, e: BibleEntry): void {
  emit('ask', `关于「${e.name}」（${g.label}）：`)
  void e
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

onMounted(async () => {
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

  groups.value = [
    {
      key: 'overview', label: '概要', ico: '📘', stage: 'overview',
      entries: overview && String(overview.title || '').trim()
        ? [{ id: 'overview', name: String(overview.title), sub: String(overview.summary || '').slice(0, 30) }]
        : [],
    },
    {
      key: 'character', label: '人物', ico: '🧑', stage: 'characters',
      entries: list(characters).map((c) => ({ id: c.id, name: String(c.name || ''), sub: String(c.rolePosition || c.occupation || '') })),
    },
    {
      key: 'plot', label: '故事线', ico: '🧵', stage: 'plot',
      entries: list(plots).map((p) => ({ id: p.id, name: String(p.title || ''), sub: String(p.summary || '').slice(0, 30) })),
    },
    {
      key: 'faction', label: '势力', ico: '⛩️', stage: 'background',
      entries: list(factions).map((f) => ({ id: f.id, name: String(f.name || ''), sub: String(f.description || '').slice(0, 30) })),
    },
    {
      key: 'skill', label: '武功/技能', ico: '⚔️', stage: 'skills',
      entries: list(skills).map((s) => ({ id: s.id, name: String(s.name || ''), sub: String(s.type || '') })),
    },
    {
      key: 'item', label: '物品', ico: '💎', stage: 'skills',
      entries: list(items).map((i) => ({ id: i.id, name: String(i.name || ''), sub: String(i.type || '') })),
    },
    {
      key: 'location', label: '地点', ico: '🏔️', stage: 'background',
      entries: list(locations).map((l) => ({ id: l.id, name: String(l.name || ''), sub: String(l.description || '').slice(0, 30) })),
    },
    {
      key: 'outline', label: '大纲', ico: '🌳', stage: 'outline',
      entries: outlineNodes.map((n) => ({ id: n.id, name: String(n.name || ''), sub: String(n.nodeType || '') })),
    },
  ]
})
</script>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.head { display: flex; align-items: baseline; gap: 8px; padding: 12px 16px 8px; }
.head h4 { font-size: 13px; font-weight: 600; }
.cnt { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; }
.search-wrap { padding: 0 12px 8px; }
.search {
  width: 100%; border: 1px solid var(--el-border-color); border-radius: 8px; padding: 6px 12px;
  font-size: 12.5px; outline: none; font-family: inherit; background: var(--el-fill-color-light);
  color: var(--el-text-color-primary); transition: border-color 0.15s; box-sizing: border-box;
}
.search:focus { border-color: var(--el-color-primary); background: var(--el-bg-color); }
.scroll { flex: 1; overflow-y: auto; padding: 0 12px 14px; }
.empty { text-align: center; font-size: 12px; color: var(--el-text-color-placeholder); padding: 20px 8px; line-height: 1.7; }
.no-result { text-align: center; color: var(--el-text-color-secondary); font-size: 12px; padding: 20px 0; }
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
</style>
