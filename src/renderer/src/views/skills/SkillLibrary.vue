<template>
  <div class="skill-library">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索技能名称/描述/ID…" clearable style="width: 280px" />
      <div class="toolbar-actions">
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
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="body">
      <!-- 左侧列表 -->
      <div class="list">
        <div class="group-title">内置技能（只读，可复制为自定义）</div>
        <div v-for="s in filtered('builtin')" :key="s.id" class="skill-item"
          :class="{ active: selected?.id === s.id }" @click="selected = s">
          <div class="skill-item-name">{{ s.name }}</div>
          <div class="skill-item-id">{{ s.id }}</div>
          <div class="skill-item-desc">{{ s.description }}</div>
        </div>
        <div class="group-title">我的技能</div>
        <div v-if="filtered('user').length === 0" class="empty-hint">还没有自定义技能——新建、导入或从内置复制一个</div>
        <div v-for="s in filtered('user')" :key="s.id" class="skill-item"
          :class="{ active: selected?.id === s.id }" @click="selected = s">
          <div class="skill-item-name">{{ s.name }}</div>
          <div class="skill-item-id">{{ s.id }}</div>
          <div class="skill-item-desc">{{ s.description }}</div>
        </div>
      </div>

      <!-- 右侧详情 -->
      <div class="detail">
        <div v-if="!selected" class="detail-empty">从左侧选择一个技能查看详情</div>
        <template v-else>
          <div class="detail-head">
            <div class="detail-title">
              <h2>{{ selected.name }}</h2>
              <el-tag size="small" :type="selected.source === 'builtin' ? 'info' : 'success'">
                {{ selected.source === 'builtin' ? '内置' : '自定义' }}
              </el-tag>
              <el-tag size="small" type="warning">{{ selected.category }}</el-tag>
            </div>
            <div class="detail-actions">
              <el-button v-if="selected.source === 'builtin'" size="small" @click="fork">复制为自定义</el-button>
              <el-button v-if="selected.source === 'user'" size="small" type="primary" @click="openEdit">编辑</el-button>
              <el-button size="small" @click="exportSkill">导出</el-button>
              <el-button v-if="selected.source === 'user'" size="small" type="danger" @click="removeSkill">删除</el-button>
            </div>
          </div>

          <p class="detail-desc">{{ selected.description }}</p>
          <p v-if="selected.whenToUse" class="detail-when">💡 何时用：{{ selected.whenToUse }}</p>

          <div v-if="selected.inputs.length" class="section">
            <h3>参数（{{ selected.inputs.length }}）</h3>
            <table class="inputs-table">
              <thead><tr><th>键</th><th>名称</th><th>类型</th><th>必填</th><th>默认值</th></tr></thead>
              <tbody>
                <tr v-for="p in selected.inputs" :key="p.key">
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
            <pre class="code-block">{{ selected.systemPrompt || '（无）' }}</pre>
          </div>
          <div class="section">
            <h3>任务正文</h3>
            <pre class="code-block">{{ selected.body }}</pre>
          </div>
          <div v-if="selected.outputDesc" class="section">
            <h3>输出说明</h3>
            <pre class="code-block">{{ selected.outputDesc }}</pre>
          </div>
        </template>
      </div>
    </div>

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
          <el-input v-model="editForm.description" type="textarea" :rows="2" placeholder="这个技能做什么（列表与选择时展示）" />
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
  </div>
</template>

<script setup lang="ts">
/**
 * 技能库（Skill 技能包管理）
 * 内置技能只读展示 + 复制为自定义；用户技能可新建/编辑/删除/导入/导出。
 * 技能包形态：SKILL.md（YAML frontmatter + markdown 正文）+ 可选 prompts/references/assets。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface SkillInput { key: string; label?: string; type?: string; required?: boolean; defaultValue?: unknown; options?: Array<{ label: string; value: string | number }>; help?: string }
interface SkillMeta {
  id: string; name: string; description: string; whenToUse?: string; category: string
  source: 'builtin' | 'user'; dirPath?: string | null
  inputs: SkillInput[]; outputDesc?: string; updatedAt?: string
}
interface SkillFull extends SkillMeta { systemPrompt: string; body: string; modelInvocable: boolean }

const api = () => (window as never as { electronAPI: { skills: any; file: any } }).electronAPI

const loading = ref(false)
const keyword = ref('')
const all = ref<SkillMeta[]>([])
const selected = ref<SkillFull | null>(null)

const filtered = (source: 'builtin' | 'user') => {
  const kw = keyword.value.trim().toLowerCase()
  return all.value.filter(s => s.source === source && (!kw || s.name.toLowerCase().includes(kw) || s.id.includes(kw) || s.description.toLowerCase().includes(kw)))
}

async function load() {
  loading.value = true
  try {
    const r = await api().skills.list()
    all.value = (r?.data ?? []).sort((a: SkillMeta, b: SkillMeta) => (a.source === b.source ? a.id.localeCompare(b.id) : a.source === 'builtin' ? -1 : 1))
    // 选中项保持同步（可能被删除/刷新）
    if (selected.value) {
      const cur = all.value.find(s => s.id === selected.value!.id)
      selected.value = cur ? { ...selected.value, ...cur } : null
    }
  } catch (e: any) {
    ElMessage.error(`技能列表加载失败：${e?.message ?? e}`)
  } finally {
    loading.value = false
  }
}

async function selectSkill(s: SkillMeta) {
  try {
    const r = await api().skills.resolve(s.id)
    selected.value = r?.data ?? null
  } catch {
    selected.value = { ...s, systemPrompt: '', body: '' } as SkillFull
  }
}

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
    if (!r?.success) {
      ElMessage.error(`导入失败：${r?.error ?? '未知错误'}`)
      return
    }
    ElMessage.success(`已导入技能「${r.data?.name}」（${r.data?.id}）`)
    await load()
    if (r.data) await selectSkill(r.data)
  } catch (e: any) {
    ElMessage.error(`导入失败：${e?.message ?? e}`)
  }
}

async function exportSkill() {
  try {
    const picked = await api().file.openFolderDialog()
    const destDir = picked?.filePaths?.[0] ?? picked?.path ?? null
    if (!destDir || !selected.value) return
    const r = await api().skills.exportToPath(selected.value.id, destDir)
    if (!r?.success) {
      ElMessage.error(`导出失败：${r?.error ?? '未知错误'}`)
      return
    }
    ElMessage.success(`已导出到 ${r.data?.path}`)
  } catch (e: any) {
    ElMessage.error(`导出失败：${e?.message ?? e}`)
  }
}

async function fork() {
  if (!selected.value) return
  try {
    const r = await api().skills.forkBuiltin(selected.value.id)
    if (!r?.success) {
      ElMessage.error(`复制失败：${r?.error ?? '未知错误'}`)
      return
    }
    ElMessage.success('已复制为自定义技能（可编辑）')
    await load()
    if (r.data) await selectSkill(r.data)
  } catch (e: any) {
    ElMessage.error(`复制失败：${e?.message ?? e}`)
  }
}

async function removeSkill() {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm(`确定删除技能「${selected.value.name}」？该操作不可恢复。`, '删除技能', { type: 'warning' })
    const r = await api().skills.remove(selected.value.id)
    if (!r?.success) {
      ElMessage.error(`删除失败：${r?.error ?? '未知错误'}`)
      return
    }
    ElMessage.success('已删除')
    selected.value = null
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

function openEdit() {
  if (!selected.value) return
  const s = selected.value
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
  editVisible.value = true
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
        .map(p => ({
          key: p.key.trim(),
          label: p.label || undefined,
          type: p.type,
          required: p.required,
          defaultValue: p.defaultValue !== '' ? p.defaultValue : undefined,
        })),
      systemPrompt: editForm.value.systemPrompt,
      body: editForm.value.body,
      outputDesc: editForm.value.outputDesc,
    }
    const r = editingId.value
      ? await api().skills.update(editingId.value, payload)
      : await api().skills.create(payload)
    if (!r?.success) {
      ElMessage.error(`保存失败：${r?.error ?? '未知错误'}`)
      return
    }
    ElMessage.success('已保存')
    editVisible.value = false
    await load()
    if (r.data) await selectSkill(r.data)
  } catch (e: any) {
    ElMessage.error(`保存失败：${e?.message ?? e}`)
  } finally {
    saving.value = false
  }
}

function typeLabel(t?: string): string {
  return { string: '单行文本', textarea: '多行文本', number: '数字', boolean: '布尔', select: '下拉' }[t ?? 'string'] ?? t ?? '文本'
}

onMounted(load)
</script>

<style scoped>
.skill-library { height: 100%; display: flex; flex-direction: column; padding: 16px; box-sizing: border-box; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.toolbar-actions { display: flex; gap: 8px; }
.body { flex: 1; display: flex; gap: 12px; min-height: 0; }
.list { width: 340px; overflow-y: auto; border-right: 1px solid var(--el-border-color-lighter); padding-right: 10px; }
.group-title { font-size: 12px; color: var(--el-text-color-secondary); margin: 12px 0 6px; font-weight: 600; }
.skill-item { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; cursor: pointer; transition: border-color .15s, background .15s; }
.skill-item:hover { border-color: var(--el-border-color); }
.skill-item.active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.skill-item-name { font-weight: 600; font-size: 14px; }
.skill-item-id { font-size: 11px; color: var(--el-text-color-secondary); font-family: monospace; margin-top: 2px; }
.skill-item-desc { font-size: 12px; color: var(--el-text-color-regular); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.empty-hint { color: var(--el-text-color-secondary); font-size: 12px; padding: 8px 0; }
.detail { flex: 1; overflow-y: auto; padding: 0 4px 0 14px; }
.detail-empty { color: var(--el-text-color-secondary); text-align: center; margin-top: 80px; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.detail-title { display: flex; align-items: center; gap: 8px; }
.detail-title h2 { margin: 0; font-size: 18px; }
.detail-actions { display: flex; gap: 6px; flex-shrink: 0; }
.detail-desc { color: var(--el-text-color-regular); margin: 10px 0 4px; }
.detail-when { color: var(--el-color-warning); font-size: 13px; margin: 4px 0; }
.section { margin-top: 16px; }
.section h3 { font-size: 13px; color: var(--el-text-color-secondary); margin: 0 0 6px; }
.inputs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.inputs-table th, .inputs-table td { border: 1px solid var(--el-border-color-lighter); padding: 5px 8px; text-align: left; }
.inputs-table th { background: var(--el-fill-color-light); }
.code-block { background: var(--el-fill-color-lighter); border-radius: 6px; padding: 10px 12px; font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; margin: 0; }
.inputs-editor { width: 100%; }
.input-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.inputs-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.inputs-hint code { background: var(--el-fill-color-light); padding: 0 4px; border-radius: 3px; }
</style>
