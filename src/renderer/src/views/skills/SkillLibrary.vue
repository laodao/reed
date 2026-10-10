<template>
  <div class="skill-market">
    <!-- 市场头部：标签页 + 操作 -->
    <div class="market-head">
      <div class="market-title">
        <span class="market-logo">🧩</span>
        <h1>技能库</h1>
        <el-tag size="small" type="info" class="market-ver">v1.0</el-tag>
        <span class="market-sub">社区可复用的 AI 技能包 —— 内置预置 + 自定义，工作流「技能调用」节点使用</span>
      </div>
      <div class="head-actions">
        <el-dropdown trigger="click" @command="importSkill">
          <el-button>导入技能▾</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="file">导入技能文件（.md / SKILL.md）</el-dropdown-item>
              <el-dropdown-item command="dir">导入技能目录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" @click="openCreate">＋ 新建技能</el-button>
        <el-button type="warning" @click="distillVisible = true">✦ AI 蒸馏</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <!-- 搜索 -->
    <div class="search-bar">
      <el-input v-model="keyword" placeholder="搜索技能名称 / 描述 / ID，如：脚本、公众号、分析…" clearable>
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <!-- 分类筛选 chips -->
    <div class="cat-chips">
      <span class="cat-chip" :class="{ active: category === '' }" @click="category = ''">全部</span>
      <span v-for="c in categories" :key="c" class="cat-chip" :class="{ active: category === c }" @click="category = c">{{ c }}</span>
    </div>

    <!-- 技能卡片网格 -->
    <div class="grid">
      <div v-for="s in shown" :key="s.id" class="card" @click="openDetail(s.id)">
        <div class="card-head">
          <div class="card-icon">{{ categoryIcon(s.category) }}</div>
          <div class="card-title">
            <div class="card-name">{{ s.name }}
              <el-tag size="small" :type="s.source === 'builtin' ? 'info' : 'success'" class="src-tag">
                {{ s.source === 'builtin' ? '内置' : '我的' }}
              </el-tag>
            </div>
            <div class="card-id">{{ s.id }}</div>
          </div>
        </div>
        <div class="card-desc">{{ s.description }}</div>
        <div class="card-foot">
          <span class="card-cat">{{ s.category }}</span>
          <div class="card-actions">
            <template v-if="s.source === 'builtin'">
              <el-button size="small" @click.stop="fork(s.id)">复制为自定义</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click.stop="openEditById(s.id)">编辑</el-button>
              <el-button size="small" type="danger" @click.stop="removeSkillById(s.id)">删除</el-button>
            </template>
          </div>
        </div>
      </div>
      <div v-if="filtered.length === 0" class="grid-empty">没有匹配的技能——新建、导入或从内置复制一个</div>
    </div>

    <!-- 分页 -->
    <div v-if="filtered.length > 0" class="page-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="filtered.length"
        :page-sizes="[12, 24, 48, 96]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailVisible" width="700px" top="6vh">
      <template #header>
        <div class="detail-title">
          <span class="detail-icon">{{ categoryIcon(detail?.category ?? '') }}</span>
          <span class="detail-name">{{ detail?.name }}</span>
          <el-tag size="small" :type="detail?.source === 'builtin' ? 'info' : 'success'">
            {{ detail?.source === 'builtin' ? '内置' : '自定义' }}
          </el-tag>
          <el-tag size="small" type="warning">{{ detail?.category }}</el-tag>
        </div>
      </template>
      <div class="detail-body">
        <p class="detail-desc">{{ detail?.description }}</p>
        <p v-if="detail?.whenToUse" class="detail-when">💡 何时用：{{ detail.whenToUse }}</p>
        <div v-if="detail?.inputs?.length" class="section">
          <h3>参数（{{ detail.inputs.length }}）</h3>
          <table class="inputs-table">
            <thead><tr><th>键</th><th>名称</th><th>类型</th><th>必填</th><th>默认值</th></tr></thead>
            <tbody>
              <tr v-for="p in detail.inputs" :key="p.key">
                <td><code>{{ p.key }}</code></td>
                <td>{{ p.label || '—' }}</td>
                <td>{{ typeLabel(p.type) }}</td>
                <td>{{ p.required ? '是' : '—' }}</td>
                <td>{{ p.defaultValue ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="section">
          <h3>系统提示词</h3>
          <pre class="code-block">{{ detail?.systemPrompt || '（无）' }}</pre>
        </div>
        <div class="section">
          <h3>任务正文</h3>
          <pre class="code-block">{{ detail?.body }}</pre>
        </div>
        <div v-if="detail?.outputDesc" class="section">
          <h3>输出说明</h3>
          <pre class="code-block">{{ detail.outputDesc }}</pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="closeDetail">关闭</el-button>
        <el-button v-if="detail?.source === 'builtin'" @click="fork(detail.id)">复制为自定义</el-button>
        <el-button v-if="detail?.source === 'user'" type="primary" @click="openEditById(detail.id)">编辑</el-button>
        <el-button @click="exportSkill(detail?.id)">导出</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="editVisible" :title="editingId ? '编辑技能' : '新建技能'" width="760px" top="6vh">
      <el-form label-width="110px" label-position="left">
        <el-form-item label="技能 ID" required>
          <el-input v-model="editForm.name" :disabled="!!editingId" placeholder="kebab-case，如 short-video-script（目录名/节点引用用）" />
        </el-form-item>
        <el-form-item label="展示名">
          <el-input v-model="editForm.title" placeholder="中文展示名（缺省=ID）" />
        </el-form-item>
        <el-form-item label="描述" required>
          <el-input v-model="editForm.description" type="textarea" :rows="2" placeholder="这个技能做什么（列表卡片展示）" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="editForm.category" placeholder="内容创作 / 文案写作 / 分析 / 办公…" />
        </el-form-item>
        <el-form-item label="何时使用">
          <el-input v-model="editForm.whenToUse" placeholder="什么时候该用这个技能（可选）" />
        </el-form-item>
        <el-form-item label="参数">
          <div class="inputs-editor">
            <div v-for="(p, i) in editForm.inputs" :key="i" class="input-row">
              <el-input v-model="p.key" placeholder="参数键" size="small" style="width: 120px" />
              <el-input v-model="p.label" placeholder="名称" size="small" style="width: 110px" />
              <el-select v-model="p.type" size="small" style="width: 100px">
                <el-option label="单行" value="string" />
                <el-option label="多行" value="textarea" />
                <el-option label="数字" value="number" />
                <el-option label="布尔" value="boolean" />
                <el-option label="下拉" value="select" />
              </el-select>
              <el-checkbox v-model="p.required" size="small">必填</el-checkbox>
              <el-input v-model="p.defaultValue" placeholder="默认值" size="small" style="width: 100px" />
              <el-button text type="danger" size="small" @click="editForm.inputs.splice(i, 1)">✕</el-button>
            </div>
            <el-button size="small" text type="primary"
              @click="editForm.inputs.push({ key: '', label: '', type: 'string', required: false, defaultValue: '' })">＋ 参数</el-button>
            <div class="inputs-hint">正文/系统提示词中用 <code v-pre>{{param.键}}</code> 引用参数</div>
          </div>
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input v-model="editForm.systemPrompt" type="textarea" :rows="4" placeholder="角色设定与要求，可含 {{param.键}}（可选）" />
        </el-form-item>
        <el-form-item label="任务正文" required>
          <el-input v-model="editForm.body" type="textarea" :rows="10" placeholder="任务指令（markdown），可含 {{param.键}} 占位；技能包 references/ 目录中的文档会自动拼入上下文" />
        </el-form-item>
        <el-form-item label="输出说明">
          <el-input v-model="editForm.outputDesc" type="textarea" :rows="2" placeholder="期望的输出格式（引导模型，可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!canSave" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- AI 蒸馏：从他人内容生成技能 -->
    <SkillDistillDialog v-model="distillVisible" @created="onDistillCreated" />
  </div>
</template>

<script setup lang="ts">
/**
 * 技能库（参考 DSH 插件市场形态）：标签页（全部/内置/我的）+ 搜索 + 分类筛选 + 卡片网格。
 * 内置技能只读 + 复制为自定义；用户技能可新建/编辑/删除/导入/导出。
 * 技能包形态：SKILL.md（YAML frontmatter + markdown 正文）+ 可选 prompts/references/assets。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import SkillDistillDialog from './SkillDistillDialog.vue'

interface SkillInput { key: string; label?: string; type?: string; required?: boolean; defaultValue?: unknown; options?: Array<{ label: string; value: string | number }>; help?: string }
interface SkillMeta {
  id: string; name: string; description: string; whenToUse?: string; category: string
  source: 'builtin' | 'user'; dirPath?: string | null
  inputs: SkillInput[]; outputDesc?: string; createdAt?: string; updatedAt?: string
}
interface SkillFull extends SkillMeta { systemPrompt: string; body: string; modelInvocable: boolean }

const api = () => (window as never as { electronAPI: { skills: any; file: any } }).electronAPI

const loading = ref(false)
const keyword = ref('')
const tab = ref<'all' | 'builtin' | 'user'>('all')
const category = ref('')
const all = ref<SkillMeta[]>([])
const detail = ref<SkillFull | null>(null)
const detailVisible = ref(false)

const categories = computed(() => [...new Set(all.value.map(s => s.category).filter(Boolean))].sort())

// ── 分页（筛选条件变化时回到第一页） ──
const page = ref(1)
const pageSize = ref(24)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return all.value.filter(s => {
    if (tab.value !== 'all' && s.source !== tab.value) return false
    if (category.value && s.category !== category.value) return false
    if (!kw) return true
    return s.name.toLowerCase().includes(kw) || s.id.includes(kw) || s.description.toLowerCase().includes(kw)
  })
})

/** 当前页卡片（页码越界自动收敛到最后一页——删除/切换筛选后列表变短的场景） */
const shown = computed(() => {
  const pages = Math.max(1, Math.ceil(filtered.value.length / pageSize.value))
  const p = Math.min(page.value, pages)
  return filtered.value.slice((p - 1) * pageSize.value, p * pageSize.value)
})

watch([keyword, category, tab], () => { page.value = 1 })

function categoryIcon(cat: string): string {
  const map: Record<string, string> = { '内容创作': '🎬', '文案写作': '✍️', '分析': '🔎', '办公': '⚙️', '知识提炼': '📚', '营销': '📣', '技术': '🛠️' }
  return map[cat] ?? '⚡'
}

async function load() {
  loading.value = true
  try {
    const r = await api().skills.list()
    all.value = r?.data ?? [] // 后端已按创建时间倒序（最新在前；内置无时间排后）
  } catch (e: any) {
    ElMessage.error(`技能列表加载失败：${e?.message ?? e}`)
  } finally {
    loading.value = false
  }
}

async function openDetail(id: string) {
  try {
    const r = await api().skills.resolve(id)
    detail.value = r?.data ?? null
    if (detail.value) detailVisible.value = true
  } catch {
    ElMessage.error('技能详情加载失败')
  }
}
function closeDetail() { detailVisible.value = false }

// ── 导入/导出/复制/删除 ──
async function importSkill(cmd: 'file' | 'dir') {
  try {
    const fileApi = api().file
    const picked = cmd === 'file'
      ? await fileApi.openDialog({ filters: [{ name: '技能文件', extensions: ['md'] }] })
      : await fileApi.openFolderDialog()
    const path = picked?.filePaths?.[0] ?? picked?.path ?? null
    if (!path) return
    const r = await api().skills.importFromPath(path)
    if (!r?.success) { ElMessage.error(`导入失败：${r?.error ?? '未知错误'}`); return }
    ElMessage.success(`已导入技能「${r.data?.name}」（${r.data?.id}）`)
    await load()
  } catch (e: any) {
    ElMessage.error(`导入失败：${e?.message ?? e}`)
  }
}

async function exportSkill(id?: string) {
  const skillId = id ?? detail.value?.id
  if (!skillId) return
  try {
    const picked = await api().file.openFolderDialog()
    const destDir = picked?.filePaths?.[0] ?? picked?.path ?? null
    if (!destDir) return
    const r = await api().skills.exportToPath(skillId, destDir)
    if (!r?.success) { ElMessage.error(`导出失败：${r?.error ?? '未知错误'}`); return }
    ElMessage.success(`已导出到 ${r.data?.path}`)
  } catch (e: any) {
    ElMessage.error(`导出失败：${e?.message ?? e}`)
  }
}

async function fork(id: string) {
  try {
    const r = await api().skills.forkBuiltin(id)
    if (!r?.success) { ElMessage.error(`复制失败：${r?.error ?? '未知错误'}`); return }
    ElMessage.success('已复制为自定义技能（可编辑）')
    await load()
  } catch (e: any) {
    ElMessage.error(`复制失败：${e?.message ?? e}`)
  }
}

async function removeSkillById(id: string) {
  try {
    await ElMessageBox.confirm(`确定删除技能「${id}」？该操作不可恢复。`, '删除技能', { type: 'warning' })
    const r = await api().skills.remove(id)
    if (!r?.success) { ElMessage.error(`删除失败：${r?.error ?? '未知错误'}`); return }
    ElMessage.success('已删除')
    detailVisible.value = false
    await load()
  } catch (e: any) {
    if (e === 'cancel' || e?.message === 'cancel') return
    ElMessage.error(`删除失败：${e?.message ?? e}`)
  }
}

// ── 新建/编辑 ──
const editVisible = ref(false)
const editingId = ref('')
const saving = ref(false)
const editForm = ref({
  name: '', title: '', description: '', category: '', whenToUse: '',
  inputs: [] as Array<{ key: string; label: string; type: string; required: boolean; defaultValue: string }>,
  systemPrompt: '', body: '', outputDesc: '',
})

const canSave = computed(() =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(editForm.value.name) &&
  !!editForm.value.description.trim() &&
  !!editForm.value.body.trim()
)

function openCreate() {
  editingId.value = ''
  editForm.value = { name: '', title: '', description: '', category: '', whenToUse: '', inputs: [], systemPrompt: '', body: '', outputDesc: '' }
  editVisible.value = true
}

async function openEditById(id: string) {
  try {
    const r = await api().skills.get(id)
    const s = r?.data as SkillFull | null
    if (!s) { ElMessage.error('技能不存在'); return }
    editingId.value = s.id
    editForm.value = {
      name: s.id,
      title: s.name === s.id ? '' : s.name,
      description: s.description,
      category: s.category === '未分类' ? '' : s.category,
      whenToUse: s.whenToUse ?? '',
      inputs: s.inputs.map(p => ({ key: p.key, label: p.label ?? '', type: p.type ?? 'string', required: !!p.required, defaultValue: p.defaultValue !== undefined ? String(p.defaultValue) : '' })),
      systemPrompt: s.systemPrompt,
      body: s.body,
      outputDesc: s.outputDesc ?? '',
    }
    detailVisible.value = false
    editVisible.value = true
  } catch (e: any) {
    ElMessage.error(`加载失败：${e?.message ?? e}`)
  }
}

async function saveEdit() {
  saving.value = true
  try {
    const payload = {
      name: editForm.value.name,
      title: editForm.value.title,
      description: editForm.value.description,
      category: editForm.value.category,
      whenToUse: editForm.value.whenToUse,
      inputs: editForm.value.inputs
        .filter(p => p.key.trim())
        .map(p => ({ key: p.key.trim(), label: p.label || undefined, type: p.type, required: p.required, defaultValue: p.defaultValue !== '' ? p.defaultValue : undefined })),
      systemPrompt: editForm.value.systemPrompt,
      body: editForm.value.body,
      outputDesc: editForm.value.outputDesc,
    }
    const r = editingId.value
      ? await api().skills.update(editingId.value, payload)
      : await api().skills.create(payload)
    if (!r?.success) { ElMessage.error(`保存失败：${r?.error ?? '未知错误'}`); return }
    ElMessage.success('已保存')
    editVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(`保存失败：${e?.message ?? e}`)
  } finally {
    saving.value = false
  }
}

function typeLabel(t?: string): string {
  return { string: '单行文本', textarea: '多行文本', number: '数字', boolean: '布尔', select: '下拉' }[t ?? 'string'] ?? t ?? '文本'
}

// ── AI 蒸馏 ──
const distillVisible = ref(false)

/** 蒸馏完成：刷新列表并直接打开新技能详情（成功体验闭环：蒸完即见） */
async function onDistillCreated(skillId: string) {
  await load()
  await openDetail(skillId)
}

onMounted(load)
</script>

<style scoped>
.skill-market { height: 100%; display: flex; flex-direction: column; padding: 18px 20px; box-sizing: border-box; overflow-y: auto; }
.market-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
.market-title { display: flex; align-items: center; gap: 8px; }
.market-logo { font-size: 22px; }
.market-title h1 { margin: 0; font-size: 20px; }
.market-ver { font-family: monospace; }
.market-sub { color: var(--el-text-color-secondary); font-size: 12px; }
.head-actions { display: flex; gap: 8px; flex-shrink: 0; }
.search-bar { max-width: 520px; margin-bottom: 12px; }
.cat-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.cat-chip { padding: 4px 14px; border-radius: 16px; font-size: 13px; cursor: pointer; background: var(--el-fill-color-light); color: var(--el-text-color-regular); border: 1px solid var(--el-border-color-lighter); transition: all .15s; }
.cat-chip:hover { border-color: var(--el-color-primary); }
.cat-chip.active { background: var(--el-color-primary); color: #fff; border-color: var(--el-color-primary); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.card { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 14px; cursor: pointer; transition: box-shadow .15s, border-color .15s; background: #fff; }
.card:hover { border-color: var(--el-color-primary); box-shadow: 0 4px 16px rgba(0,0,0,.06); }
.card-head { display: flex; align-items: flex-start; gap: 10px; }
.card-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--el-fill-color-light); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.card-title { flex: 1; min-width: 0; }
.card-name { font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px; }
.src-tag { flex-shrink: 0; }
.card-id { font-size: 11px; color: var(--el-text-color-secondary); font-family: monospace; margin-top: 2px; }
.card-desc { font-size: 13px; color: var(--el-text-color-regular); margin: 10px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 40px; }
.card-foot { display: flex; justify-content: space-between; align-items: center; }
.card-cat { font-size: 12px; color: var(--el-text-color-secondary); }
.card-actions { display: flex; gap: 6px; }
.grid-empty { grid-column: 1 / -1; color: var(--el-text-color-secondary); text-align: center; padding: 40px 0; }
.page-bar { display: flex; justify-content: center; margin-top: 18px; }
.detail-title { display: flex; align-items: center; gap: 8px; }
.detail-icon { font-size: 20px; }
.detail-name { font-size: 18px; font-weight: 600; }
.detail-body { max-height: 62vh; overflow-y: auto; }
.detail-desc { color: var(--el-text-color-regular); margin: 0 0 8px; }
.detail-when { color: var(--el-color-warning); font-size: 13px; margin: 4px 0; }
.section { margin-top: 14px; }
.section h3 { font-size: 13px; color: var(--el-text-color-secondary); margin: 0 0 6px; }
.inputs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.inputs-table th, .inputs-table td { border: 1px solid var(--el-border-color-lighter); padding: 5px 8px; text-align: left; }
.inputs-table th { background: var(--el-fill-color-light); }
.code-block { background: var(--el-fill-color-lighter); border-radius: 6px; padding: 10px 12px; font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow-y: auto; margin: 0; }
.inputs-editor { width: 100%; }
.input-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.inputs-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.inputs-hint code { background: var(--el-fill-color-light); padding: 0 4px; border-radius: 3px; }
</style>
