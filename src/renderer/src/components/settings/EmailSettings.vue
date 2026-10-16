<template>
  <div class="email-settings">
    <!-- 邮箱账号列表 -->
    <div class="settings-section">
      <div class="section-header">
        <div>
          <h3>邮箱账号</h3>
          <p class="section-desc">工作流「邮件收发」工具使用的账号（SMTP 发送 + IMAP 接收）；授权码经系统安全存储加密，绝不落明文</p>
        </div>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>
          添加账号
        </el-button>
      </div>
      <div v-if="accounts.length" class="tool-list">
        <div v-for="a in accounts" :key="a.id" class="tool-item">
          <span class="item-icon">✉️</span>
          <div class="item-info">
            <span class="item-name">{{ a.name }}</span>
            <span class="item-desc">{{ a.user }} · IMAP {{ a.imapHost }}:{{ a.imapPort }}{{ a.imapSecure ? ' (SSL)' : '' }} · SMTP {{ a.smtpHost }}:{{ a.smtpPort }}{{ a.smtpSecure ? ' (SSL)' : ' (STARTTLS)' }}</span>
          </div>
          <div class="item-actions">
            <el-button text size="small" :loading="testingId === a.id" :disabled="!!testingId && testingId !== a.id" @click="testAccount(a)">
              测试连接
            </el-button>
            <el-button text size="small" @click="openDialog(a)">编辑</el-button>
            <el-button text type="danger" size="small" @click="deleteAccount(a)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-tip">暂无邮箱账号——添加后即可在工作流「邮件收发」工具中选择使用</div>
    </div>

    <!-- 添加/编辑账号对话框 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑邮箱账号' : '添加邮箱账号'" width="640px" :close-on-click-modal="false">
      <el-form label-width="130px" label-position="left">
        <!-- 通用邮箱服务器预设：选择后自动填充 IMAP/SMTP 默认值（用户仍可手动修改） -->
        <el-form-item label="邮箱服务商">
          <el-select v-model="presetKey" clearable filterable placeholder="选择预设自动填充服务器（可再手动修改）" style="width: 100%" @change="applyPreset">
            <el-option v-for="p in SERVER_PRESETS" :key="p.key" :label="p.label" :value="p.key" />
          </el-select>
          <div v-if="presetHint" class="sub-hint">{{ presetHint }}</div>
        </el-form-item>
        <el-form-item label="显示名" required>
          <el-input v-model="form.name" placeholder="如「工作邮箱」" />
        </el-form-item>
        <el-form-item label="邮箱账号" required>
          <el-input v-model="form.user" placeholder="user@example.com" />
        </el-form-item>
        <el-form-item label="授权码/密码" :required="!editing">
          <el-input v-model="form.pass" type="password" show-password :placeholder="editing ? '留空保持原授权码不变' : '邮箱授权码（非登录密码）'" />
        </el-form-item>
        <el-divider content-position="left">IMAP 收信</el-divider>
        <el-form-item label="IMAP 服务器" required>
          <el-input v-model="form.imapHost" placeholder="imap.example.com" />
        </el-form-item>
        <el-form-item label="IMAP 端口">
          <el-input-number v-model="form.imapPort" :min="1" :max="65535" style="width: 160px" />
        </el-form-item>
        <el-form-item label="IMAP 加密">
          <el-switch v-model="form.imapSecure" active-text="SSL/TLS" />
        </el-form-item>
        <el-divider content-position="left">SMTP 发信</el-divider>
        <el-form-item label="SMTP 服务器" required>
          <el-input v-model="form.smtpHost" placeholder="smtp.example.com" />
        </el-form-item>
        <el-form-item label="SMTP 端口">
          <el-input-number v-model="form.smtpPort" :min="1" :max="65535" style="width: 160px" />
        </el-form-item>
        <el-form-item label="SMTP 加密">
          <el-switch v-model="form.smtpSecure" active-text="SSL/TLS" inactive-text="STARTTLS" />
        </el-form-item>
        <el-form-item label="发件人显示名">
          <el-input v-model="form.fromName" placeholder="收件人看到的发件人名称" />
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
 * 设置页「邮箱账号」Tab（邮件收发工具 · 账号配置）
 * 邮箱账号 CRUD + 测试连接 + 通用邮箱服务器预设（网易/QQ/企业邮/Gmail/Outlook/阿里云）
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { EmailAccount } from '@shared/types/email.types'

const api = () => (window as never as { electronAPI: { email: any } }).electronAPI.email

/**
 * 通用邮箱服务器预设（内置表）
 * smtpSecure=false 表示 587 端口使用 STARTTLS（nodemailer secure=false）
 */
interface ServerPreset {
  key: string
  label: string
  hint?: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
}
const SERVER_PRESETS: ServerPreset[] = [
  { key: '163', label: '网易 163', imapHost: 'imap.163.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.163.com', smtpPort: 465, smtpSecure: true },
  { key: 'qq', label: 'QQ 邮箱', imapHost: 'imap.qq.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.qq.com', smtpPort: 465, smtpSecure: true },
  { key: 'exmail', label: '腾讯企业邮', imapHost: 'imap.exmail.qq.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.exmail.qq.com', smtpPort: 465, smtpSecure: true },
  { key: 'gmail', label: 'Gmail', imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true, hint: '建议使用应用专用密码' },
  { key: 'outlook', label: 'Outlook', imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, hint: 'SMTP 使用 STARTTLS（587 端口）' },
  { key: 'aliyun', label: '阿里云企业邮', imapHost: 'imap.qiye.aliyun.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.qiye.aliyun.com', smtpPort: 465, smtpSecure: true },
]

const accounts = ref<EmailAccount[]>([])

/** 当前正在测试连接的账号 id（行内 loading） */
const testingId = ref<string | null>(null)

async function load() {
  const r = await api().listAccounts()
  if (r.success) accounts.value = r.data ?? []
  else ElMessage.error(r.error ?? '加载邮箱账号失败')
}

// ---- 添加/编辑对话框 ----
const dialogVisible = ref(false)
const editing = ref<EmailAccount | null>(null)
const presetKey = ref<string>('')
const presetHint = ref('')
const form = reactive({
  name: '',
  user: '',
  pass: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  fromName: '',
})

function openDialog(acc?: EmailAccount) {
  editing.value = acc ?? null
  presetKey.value = ''
  presetHint.value = ''
  Object.assign(form, {
    name: acc?.name ?? '',
    user: acc?.user ?? '',
    // 编辑时不回显授权码（密文不回传，留空表示保持原值）
    pass: '',
    imapHost: acc?.imapHost ?? '',
    imapPort: acc?.imapPort ?? 993,
    imapSecure: acc?.imapSecure ?? true,
    smtpHost: acc?.smtpHost ?? '',
    smtpPort: acc?.smtpPort ?? 465,
    smtpSecure: acc?.smtpSecure ?? true,
    fromName: acc?.fromName ?? '',
  })
  dialogVisible.value = true
}

/** 选择服务器预设：自动填充 IMAP/SMTP 默认值（用户仍可手动修改） */
function applyPreset(key: string) {
  if (!key) return
  const p = SERVER_PRESETS.find(x => x.key === key)
  if (!p) return
  form.imapHost = p.imapHost
  form.imapPort = p.imapPort
  form.imapSecure = p.imapSecure
  form.smtpHost = p.smtpHost
  form.smtpPort = p.smtpPort
  form.smtpSecure = p.smtpSecure
  presetHint.value = p.hint ?? ''
}

const canSave = computed(() =>
  !!form.name.trim() &&
  !!form.user.trim() &&
  !!form.imapHost.trim() &&
  !!form.imapPort &&
  !!form.smtpHost.trim() &&
  !!form.smtpPort &&
  // 新增必须填写授权码；编辑可留空（保留原密文）
  (!!editing.value || !!form.pass.trim())
)

async function save() {
  const payload = {
    id: editing.value?.id,
    name: form.name.trim(),
    user: form.user.trim(),
    pass: form.pass.trim() || undefined,
    imapHost: form.imapHost.trim(),
    imapPort: form.imapPort,
    imapSecure: form.imapSecure,
    smtpHost: form.smtpHost.trim(),
    smtpPort: form.smtpPort,
    smtpSecure: form.smtpSecure,
    fromName: form.fromName.trim(),
  }
  const r = await api().saveAccount(payload)
  if (r.success) {
    ElMessage.success(editing.value ? '邮箱账号已更新' : '邮箱账号已添加')
    dialogVisible.value = false
    await load()
  } else {
    ElMessage.error(r.error ?? '保存失败')
  }
}

// ---- 测试连接 ----
async function testAccount(acc: EmailAccount) {
  testingId.value = acc.id
  try {
    const r = await api().testAccount(acc.id)
    if (r.success && r.data?.success) {
      const parts = [`IMAP ${r.data.imap ? '✓' : '✗'}`, `SMTP ${r.data.smtp ? '✓' : '✗'}`]
      ElMessage.success(`「${acc.name}」连接正常：${parts.join(' · ')}`)
    } else {
      const detail = r.data?.error || r.error
      ElMessage.error(`「${acc.name}」连接失败：${detail || '请检查服务器配置与授权码'}`)
    }
  } finally {
    testingId.value = null
  }
}

// ---- 删除 ----
async function deleteAccount(acc: EmailAccount) {
  try {
    await ElMessageBox.confirm(`删除邮箱账号「${acc.name}」？引用它的工作流邮件工具将失效。`, '删除邮箱账号', { type: 'warning' })
  } catch { return }
  const r = await api().deleteAccount(acc.id)
  if (r.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(r.error ?? '删除失败')
}

onMounted(load)
</script>

<style scoped>
.email-settings { max-width: 860px; }
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
.sub-hint { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 4px; }
</style>
