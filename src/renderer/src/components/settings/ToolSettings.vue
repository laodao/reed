<template>
  <div class="tool-settings">
    <!-- 凭据管理 -->
    <div class="settings-section">
      <div class="section-header">
        <div>
          <h3>第三方凭据</h3>
          <p class="section-desc">API Key 经系统安全存储加密（SecureStorage），工具节点引用时自动解密注入，绝不落明文</p>
        </div>
        <el-button type="primary" @click="openCredDialog">
          <el-icon><Plus /></el-icon>
          添加凭据
        </el-button>
      </div>
      <div v-if="credentials.length" class="tool-list">
        <div v-for="c in credentials" :key="c.id" class="tool-item">
          <span class="item-icon">🔑</span>
          <div class="item-info">
            <span class="item-name">{{ c.name }}</span>
            <span class="item-desc">{{ c.baseUrl || '无默认 BaseURL' }}</span>
          </div>
          <div class="item-actions">
            <el-button text type="danger" size="small" @click="deleteCredential(c)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-tip">暂无凭据——为预设/自定义工具配置 API Key</div>
    </div>

    <!-- 自定义工具 -->
    <div class="settings-section">
      <div class="section-header">
        <div>
          <h3>自定义工具</h3>
          <p class="section-desc">封装常用第三方 API（URL/请求头/参数 schema/鉴权），工作流 tool-call 节点直接引用</p>
        </div>
        <el-button type="primary" @click="openToolDialog()">
          <el-icon><Plus /></el-icon>
          新建工具
        </el-button>
      </div>
      <div v-if="tools.length" class="tool-list">
        <div v-for="t in tools" :key="t.id" class="tool-item">
          <span class="item-icon">🧩</span>
          <div class="item-info">
            <span class="item-name">{{ t.name }}</span>
            <span class="item-desc">{{ t.method }} {{ t.url }}</span>
          </div>
          <div class="item-actions">
            <el-button text size="small" @click="openToolDialog(t)">编辑</el-button>
            <el-button text type="danger" size="small" @click="deleteTool(t)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-tip">暂无自定义工具</div>
    </div>

    <!-- 预设工具展示 -->
    <div class="settings-section">
      <h3>预设工具</h3>
      <p class="section-desc">内置常用第三方 API（只读），tool-call 节点可直接选用（需配置对应凭据）</p>
      <div v-if="presets.length" class="tool-list">
        <div v-for="t in presets" :key="t.id" class="tool-item">
          <span class="item-icon">⭐</span>
          <div class="item-info">
            <span class="item-name">{{ t.name }}</span>
            <span class="item-desc">{{ t.description }}</span>
          </div>
          <el-tag size="small" type="info">{{ t.category }}</el-tag>
        </div>
      </div>
    </div>

    <!-- 凭据对话框 -->
    <el-dialog v-model="credVisible" title="添加凭据" width="460px" :close-on-click-modal="false">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="credForm.name" placeholder="如 Serper / DeepL" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="credForm.apiKey" type="password" show-password placeholder="密钥加密存储，不会明文保存" />
        </el-form-item>
        <el-form-item label="BaseURL">
          <el-input v-model="credForm.baseUrl" placeholder="可选，默认接口地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="credVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!credForm.name || !credForm.apiKey" @click="saveCredential">保存</el-button>
      </template>
    </el-dialog>

    <!-- 自定义工具对话框 -->
    <el-dialog v-model="toolVisible" :title="editingTool ? '编辑工具' : '新建工具'" width="680px" :close-on-click-modal="false">
      <el-form label-width="110px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="toolForm.name" placeholder="工具名，如「我的天气接口」" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="toolForm.description" placeholder="一句话说明用途" />
        </el-form-item>
        <el-form-item label="方法">
          <el-select v-model="toolForm.method" style="width: 100%">
            <el-option v-for="m in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="URL" required>
          <el-input v-model="toolForm.url" placeholder="https://api.example.com/items/{{id}}" />
        </el-form-item>
        <el-form-item label="鉴权方式">
          <el-select v-model="toolForm.authType" style="width: 100%" @change="toolForm.credentialId = toolForm.authType === 'credential' ? toolForm.credentialId : undefined">
            <el-option label="无" value="none" />
            <el-option label="引用凭据（{{credential}} 占位或自动 Bearer）" value="credential" />
            <el-option label="请求头手填" value="header" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="toolForm.authType === 'credential'" label="凭据">
          <el-select v-model="toolForm.credentialId" clearable placeholder="选择凭据" style="width: 100%">
            <el-option v-for="c in credentials" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求头">
          <div class="kv-editor">
            <div v-for="(h, i) in toolForm.headers" :key="i" class="kv-row">
              <el-input v-model="h.key" placeholder="Header 名（如 X-API-KEY）" size="small" />
              <el-input v-model="h.value" placeholder="值，支持 {{param}} / {{credential}}" size="small" />
              <el-button text type="danger" size="small" @click="toolForm.headers.splice(i, 1)">✕</el-button>
            </div>
            <el-button size="small" text type="primary" @click="toolForm.headers.push({ key: '', value: '' })">+ 请求头</el-button>
          </div>
        </el-form-item>
        <el-form-item label="参数 Schema">
          <div class="schema-editor">
            <div v-for="(f, i) in toolForm.paramsSchema" :key="i" class="schema-row">
              <el-input v-model="f.key" placeholder="参数键" size="small" style="width: 110px" />
              <el-input v-model="f.label" placeholder="显示名" size="small" style="width: 110px" />
              <el-select v-model="f.type" size="small" style="width: 100px">
                <el-option label="文本" value="string" />
                <el-option label="数字" value="number" />
                <el-option label="布尔" value="boolean" />
                <el-option label="JSON" value="json" />
                <el-option label="下拉" value="select" />
              </el-select>
              <el-checkbox v-model="f.required" size="small">必填</el-checkbox>
              <el-button text type="danger" size="small" @click="toolForm.paramsSchema.splice(i, 1)">✕</el-button>
              <div v-if="f.type === 'select'" class="schema-options">
                <div v-for="(o, j) in f.options ?? []" :key="j" class="kv-row">
                  <el-input v-model="o.label" placeholder="显示名" size="small" style="width: 110px" />
                  <el-input v-model="o.value" placeholder="值" size="small" style="width: 110px" />
                  <el-button text type="danger" size="small" @click="f.options!.splice(j, 1)">✕</el-button>
                </div>
                <el-button size="small" text type="primary" @click="(f.options ??= []).push({ label: '', value: '' })">+ 选项</el-button>
              </div>
            </div>
            <el-button size="small" text type="primary" @click="toolForm.paramsSchema.push({ key: '', label: '', type: 'string' })">+ 参数</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="toolVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!toolForm.name || !toolForm.url" @click="saveTool">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 设置页「工具」Tab（P0 片1：第三方 API 工具）
 * 凭据管理（加密存储）+ 自定义工具 CRUD + 预设工具展示
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const api = () => (window as never as { electronAPI: { tools: any } }).electronAPI.tools

const credentials = ref<any[]>([])
const tools = ref<any[]>([])
const presets = ref<any[]>([])

async function load() {
  const [c, t, p] = await Promise.all([api().listCredentials(), api().listCustom(), api().presets()])
  if (c.success) credentials.value = c.data ?? []
  if (t.success) tools.value = t.data ?? []
  if (p.success) presets.value = p.data ?? []
}

// ---- 凭据 ----
const credVisible = ref(false)
const credForm = reactive({ name: '', apiKey: '', baseUrl: '' })

function openCredDialog() {
  credForm.name = ''
  credForm.apiKey = ''
  credForm.baseUrl = ''
  credVisible.value = true
}

async function saveCredential() {
  const r = await api().saveCredential({ name: credForm.name, apiKey: credForm.apiKey, baseUrl: credForm.baseUrl || undefined })
  if (r.success) {
    ElMessage.success('凭据已保存（API Key 已加密）')
    credVisible.value = false
    await load()
  } else ElMessage.error(r.error ?? '保存失败')
}

async function deleteCredential(c: any) {
  try {
    await ElMessageBox.confirm(`删除凭据「${c.name}」？引用它的工具将无法注入密钥。`, '删除凭据', { type: 'warning' })
  } catch { return }
  const r = await api().deleteCredential(c.id)
  if (r.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(r.error ?? '删除失败')
}

// ---- 自定义工具 ----
const toolVisible = ref(false)
const editingTool = ref<any>(null)
const toolForm = reactive<any>({
  name: '', description: '', method: 'GET', url: '', headers: [], paramsSchema: [], authType: 'none', credentialId: undefined,
})

function openToolDialog(t?: any) {
  editingTool.value = t ?? null
  if (t) {
    Object.assign(toolForm, {
      name: t.name, description: t.description ?? '', method: t.method, url: t.url,
      headers: (t.headers ?? []).map((h: any) => ({ ...h })),
      paramsSchema: (t.paramsSchema ?? []).map((f: any) => ({ ...f, options: f.options ? f.options.map((o: any) => ({ ...o })) : undefined })),
      authType: t.authType, credentialId: t.credentialId ?? undefined,
    })
  } else {
    Object.assign(toolForm, { name: '', description: '', method: 'GET', url: '', headers: [], paramsSchema: [], authType: 'none', credentialId: undefined })
  }
  toolVisible.value = true
}

async function saveTool() {
  const payload = {
    name: toolForm.name, description: toolForm.description || undefined, method: toolForm.method, url: toolForm.url,
    headers: toolForm.headers.filter((h: any) => h.key || h.value),
    paramsSchema: toolForm.paramsSchema.filter((f: any) => f.key),
    authType: toolForm.authType, credentialId: toolForm.authType === 'credential' ? (toolForm.credentialId ?? null) : null,
  }
  const r = editingTool.value
    ? await api().updateCustom(editingTool.value.id, payload)
    : await api().saveCustom(payload)
  if (r.success) {
    ElMessage.success(editingTool.value ? '工具已更新' : '工具已创建')
    toolVisible.value = false
    await load()
  } else ElMessage.error(r.error ?? '保存失败')
}

async function deleteTool(t: any) {
  try {
    await ElMessageBox.confirm(`删除工具「${t.name}」？引用它的工作流节点将失效。`, '删除工具', { type: 'warning' })
  } catch { return }
  const r = await api().deleteCustom(t.id)
  if (r.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(r.error ?? '删除失败')
}

onMounted(load)
</script>

<style scoped>
.tool-settings { max-width: 860px; }
.settings-section { margin-bottom: 32px; }
.section-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.section-header h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.section-desc { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
.tool-list { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.tool-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.tool-item:last-child { border-bottom: none; }
.item-icon { font-size: 18px; }
.item-info { flex: 1; display: flex; flex-direction: column; }
.item-name { font-weight: 600; font-size: 14px; }
.item-desc { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 2px; }
.item-actions { display: flex; gap: 4px; }
.empty-tip { color: var(--el-text-color-secondary); font-size: 13px; padding: 16px 0; }
.kv-editor, .schema-editor { width: 100%; }
.kv-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.kv-row > .el-input { flex: 1; }
.schema-row { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px; margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.schema-options { width: 100%; padding-left: 12px; margin-top: 4px; }
</style>
