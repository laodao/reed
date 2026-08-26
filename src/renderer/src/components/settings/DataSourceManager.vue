<template>
  <div class="datasource-settings">
    <!-- 数据源列表 -->
    <div class="settings-section">
      <div class="section-header">
        <div>
          <h3>数据库数据源</h3>
          <p class="section-desc">工作流「数据表」节点可连接的外部数据库（PostgreSQL/MySQL 等）；连接密码经系统安全存储加密，绝不落明文</p>
        </div>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>
          添加数据源
        </el-button>
      </div>

      <div v-if="sources.length" class="tool-list">
        <div v-for="s in sources" :key="s.id" class="tool-item">
          <span class="item-icon">{{ driverIcon(s.driver) }}</span>
          <div class="item-info">
            <span class="item-name">{{ s.name }}</span>
            <span class="item-desc">{{ driverMeta(s.driver) }} · {{ s.host }}:{{ s.port }}/{{ s.database }}{{ s.ssl ? ' (SSL)' : '' }}{{ s.hasPassword ? '' : ' · 未设置密码' }}</span>
          </div>
          <div class="item-actions">
            <el-switch :model-value="s.isEnabled" size="small" @change="toggleEnabled(s)" />
            <el-button text size="small" :loading="testingId === s.id" :disabled="!!testingId && testingId !== s.id" @click="testSource(s)">
              测试连接
            </el-button>
            <el-button text size="small" @click="openDialog(s)">编辑</el-button>
            <el-button text type="danger" size="small" @click="deleteSource(s)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-tip">暂无数据源——添加后即可在工作流「数据表」节点中选择外部数据库读写</div>
    </div>

    <!-- 添加/编辑数据源对话框 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑数据源' : '添加数据源'" width="560px" :close-on-click-modal="false">
      <el-form label-width="110px" label-position="left">
        <el-form-item label="显示名" required>
          <el-input v-model="form.name" placeholder="如「金融业务库」" />
        </el-form-item>
        <el-form-item label="数据库类型" required>
          <el-select v-model="form.driver" style="width: 100%" @change="onDriverChange">
            <el-option v-for="d in DRIVERS" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="服务器地址" required>
          <el-input v-model="form.host" placeholder="db.example.com 或 127.0.0.1" />
        </el-form-item>
        <el-form-item label="端口" required>
          <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 160px" />
        </el-form-item>
        <el-form-item label="数据库名" required>
          <el-input v-model="form.database" placeholder="如 finance" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="数据库用户名" />
        </el-form-item>
        <el-form-item label="密码" :required="!editing">
          <el-input v-model="form.password" type="password" show-password :placeholder="editing ? '留空保持原密码不变' : '数据库密码'" />
        </el-form-item>
        <el-form-item label="SSL 加密">
          <el-switch v-model="form.ssl" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!canSave" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 设置页「数据源」Tab（工作流「数据表」节点 · 外部数据库连接配置）
 * 数据源 CRUD + 测试连接；密码经 SecureStorage 加密存储（编辑时不回显密文）
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { DATA_SOURCE_DRIVER_META } from '@shared/types/datasource.types'

const DRIVERS = Object.values(DATA_SOURCE_DRIVER_META).map(m => ({ value: m.driver, label: m.label }))

const api = () => (window as never as { electronAPI: { datasource: any } }).electronAPI.datasource

interface SourceView {
  id: string
  name: string
  driver: string
  host: string
  port: number
  database: string
  username: string | null
  ssl: boolean
  isEnabled: boolean
  hasPassword: boolean
}

const sources = ref<SourceView[]>([])
const testingId = ref<string>('')

function driverMeta(driver: string): string {
  return DATA_SOURCE_DRIVER_META[driver as keyof typeof DATA_SOURCE_DRIVER_META]?.label ?? driver
}
function driverIcon(driver: string): string {
  const map: Record<string, string> = { postgres: '🐘', mysql: '🐬', sqlserver: '🗄️', clickhouse: '🫙' }
  return map[driver] ?? '🗄️'
}

async function load() {
  const r = await api().list()
  if (r.success && r.data) {
    sources.value = r.data
  } else {
    ElMessage.error(r.error || '加载数据源列表失败')
  }
}

// ---- 对话框 ----
const dialogVisible = ref(false)
const editing = ref<SourceView | null>(null)
const form = reactive({
  name: '',
  driver: 'postgres' as string,
  host: '',
  port: 5432,
  database: '',
  username: '',
  password: '',
  ssl: false,
})

function onDriverChange() {
  form.port = DATA_SOURCE_DRIVER_META[form.driver as keyof typeof DATA_SOURCE_DRIVER_META]?.defaultPort ?? 5432
}

function openDialog(s?: SourceView) {
  editing.value = s ?? null
  Object.assign(form, {
    name: s?.name ?? '',
    driver: s?.driver ?? 'postgres',
    host: s?.host ?? '',
    port: s?.port ?? DATA_SOURCE_DRIVER_META.postgres.defaultPort,
    database: s?.database ?? '',
    username: s?.username ?? '',
    password: '',
    ssl: s?.ssl ?? false,
  })
  dialogVisible.value = true
}

const canSave = computed(() =>
  !!form.name.trim() &&
  !!form.host.trim() &&
  !!form.port &&
  !!form.database.trim() &&
  // 新增必须填写密码；编辑可留空（保留原密文）
  (!!editing.value || !!form.password.trim())
)

async function save() {
  const payload = {
    name: form.name.trim(),
    driver: form.driver,
    host: form.host.trim(),
    port: form.port,
    database: form.database.trim(),
    username: form.username.trim() || undefined,
    password: form.password.trim() || undefined,
    ssl: form.ssl,
  }
  const r = editing.value
    ? await api().update(editing.value.id, payload)
    : await api().create(payload)
  if (r.success) {
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await load()
  } else {
    ElMessage.error(r.error || '保存失败')
  }
}

async function testSource(s: SourceView) {
  testingId.value = s.id
  try {
    const r = await api().testConnection(s.id)
    const data = r.data
    if (r.success && data?.success) {
      ElMessage.success(data.message || '连接成功')
    } else {
      // 测试失败也视为 operation 返回成功（外层 success=true），展示 data.message
      ElMessage.error(data?.message || r.error || '连接失败')
    }
  } catch (e) {
    console.error('测试数据源连接失败', e)
    ElMessage.error('测试连接失败')
  } finally {
    testingId.value = ''
  }
}

async function toggleEnabled(s: SourceView) {
  const r = await api().toggleEnabled(s.id)
  if (r.success) await load()
  else ElMessage.error(r.error || '切换失败')
}

async function deleteSource(s: SourceView) {
  try {
    await ElMessageBox.confirm(`确定删除数据源「${s.name}」？`, '确认', { type: 'warning' })
  } catch { return }
  const r = await api().delete(s.id)
  if (r.success) {
    ElMessage.success('已删除')
    await load()
  } else {
    ElMessage.error(r.error || '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.datasource-settings { display: flex; flex-direction: column; gap: 16px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.section-header h3 { margin: 0 0 4px; font-size: 16px; }
.section-desc { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); }
.tool-list { display: flex; flex-direction: column; gap: 10px; }
.tool-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.item-icon { font-size: 20px; width: 28px; text-align: center; flex-shrink: 0; }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.item-name { font-weight: 600; font-size: 13px; }
.item-desc { font-size: 12px; color: var(--el-text-color-secondary); }
.item-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.empty-tip { padding: 24px; text-align: center; font-size: 12px; color: var(--el-text-color-secondary); border: 1px dashed var(--el-border-color-lighter); border-radius: 8px; }
</style>
