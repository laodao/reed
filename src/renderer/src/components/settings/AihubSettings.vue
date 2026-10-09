<template>
  <div class="aihub-settings">
    <!-- AI Hub 账号 -->
    <div class="settings-section">
      <div class="section-header">
        <div>
          <h3>AI Hub 账号</h3>
          <p class="section-desc">
            开启后可登录官方网关，使用全部已注册模型（chat / image / video），免配 API Key，
            按个人 workspace 余额计费；<strong>默认关闭</strong>——默认使用本地账号与自有 API Key，两者互不影响
          </p>
        </div>
        <div class="master-switch">
          <span class="switch-label">{{ session.enabled ? '已开启' : '未开启' }}</span>
          <el-switch
            v-model="session.enabled"
            :loading="switching"
            @change="toggleEnabled"
          />
        </div>
      </div>

      <!-- 总开关关闭（默认态）：仅展示说明，隐藏一切登录/模型入口 -->
      <template v-if="!session.enabled">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="AI Hub 功能未开启（默认）"
          description="当前使用本地认证与自有 API Key，全部功能不受影响。打开右上角开关后才会出现 AI Hub 登录入口，网关模型才会出现在各模型选择器中。"
        />
      </template>

      <!-- 总开关已开启：登录/注册表单 -->
      <template v-else-if="!session.loggedIn">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="未登录 AI Hub"
          description="登录后模型清单自动出现在各模型选择器中（标注「AI Hub」）；登出后自动隐藏，自有 Key 的提供商不受影响。"
          class="login-hint"
        />
        <el-tabs v-model="authMode" class="auth-tabs">
          <el-tab-pane label="登录" name="login">
            <el-form label-width="110px" label-position="left" @submit.prevent>
              <el-form-item label="网关地址">
                <el-input v-model="loginForm.gatewayUrl" placeholder="http://127.0.0.1:8081" />
              </el-form-item>
              <el-form-item label="邮箱/用户名">
                <el-input v-model="loginForm.identity" placeholder="user@example.com" @keyup.enter="doLogin" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="loginForm.password" type="password" show-password @keyup.enter="doLogin" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="busy" @click="doLogin">登录</el-button>
              </el-form-item>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="注册" name="register">
            <el-form label-width="110px" label-position="left" @submit.prevent>
              <el-form-item label="网关地址">
                <el-input v-model="registerForm.gatewayUrl" placeholder="http://127.0.0.1:8081" />
              </el-form-item>
              <el-form-item label="邮箱">
                <el-input v-model="registerForm.email" placeholder="user@example.com" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="registerForm.password" type="password" show-password placeholder="至少 8 位" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="busy" @click="doRegister">注册并登录</el-button>
              </el-form-item>
              <el-form-item>
                <span class="sub-hint">注册即自动开通个人 workspace 并授权全部已注册模型</span>
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </template>

      <!-- 已登录：账号信息 + 余额 + 操作 -->
      <template v-else>
        <div class="session-card">
          <div class="session-row">
            <span class="session-label">当前账号</span>
            <span class="session-value">{{ session.email }}</span>
            <el-tag v-if="!session.valid" type="danger" size="small">已过期，请重新登录</el-tag>
          </div>
          <div class="session-row">
            <span class="session-label">网关地址</span>
            <span class="session-value">{{ session.gatewayUrl }}</span>
          </div>
          <div class="session-row">
            <span class="session-label">登录到期</span>
            <span class="session-value">{{ formatExpiry(session.expiresAt) }}</span>
          </div>
          <div class="session-row">
            <span class="session-label">余额</span>
            <span class="session-value">
              <template v-if="balanceLoading">查询中…</template>
              <template v-else-if="balance !== null">{{ balance.balancePoints.toFixed(2) }} 积分</template>
              <template v-else>—</template>
            </span>
            <el-button size="small" text @click="refreshBalance">刷新</el-button>
          </div>
        </div>

        <div class="action-row">
          <el-button :loading="refreshingModels" @click="doRefreshModels">刷新模型列表</el-button>
          <el-button v-if="session.rechargeUrl" @click="openRecharge">去充值</el-button>
          <el-button type="danger" plain @click="doLogout">登出</el-button>
        </div>

        <!-- 兑换码 -->
        <div class="redeem-row">
          <el-input v-model="redeemCode" placeholder="输入兑换码（卡密）充值" style="max-width: 320px" @keyup.enter="doRedeem" />
          <el-button type="primary" :loading="redeeming" @click="doRedeem">兑换</el-button>
        </div>
        <div v-if="!session.rechargeUrl" class="sub-hint">
          未配置充值门户地址；可在下方「高级」中填写托管充值门户（{WEB_AUTH}/#/recharge），或使用兑换码充值。
        </div>

        <!-- 高级：网关/充值门户地址 -->
        <el-collapse class="advanced-collapse">
          <el-collapse-item title="高级设置（网关 / 充值门户地址）" name="advanced">
            <el-form label-width="110px" label-position="left" @submit.prevent>
              <el-form-item label="网关地址">
                <el-input v-model="advancedForm.gatewayUrl" placeholder="http://127.0.0.1:8081" />
              </el-form-item>
              <el-form-item label="充值门户">
                <el-input v-model="advancedForm.rechargeUrl" placeholder="https://…/#/recharge（可选）" />
              </el-form-item>
              <el-form-item>
                <el-button @click="saveAdvanced">保存地址</el-button>
                <span class="sub-hint" style="margin-left: 12px">修改网关地址后需重新登录生效</span>
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 设置页「AI Hub 账号」Tab（统一网关接入）
 * 登录/注册/登出 + 余额/兑换码/充值门户 + 网关地址配置。
 * 登录成功后 ai-hub provider config 自动创建/启用并物化 JWT，模型清单自动刷新。
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AihubSessionInfo } from '@core/platform/aihub/aihub.types'
import type { AihubBalanceInfo } from '@core/platform/aihub/aihub-billing.service'

const api = () => (window as never as { electronAPI: { aihub: any } }).electronAPI.aihub

const session = reactive<AihubSessionInfo>({ enabled: false, loggedIn: false, valid: false })
const switching = ref(false)
const authMode = ref<'login' | 'register'>('login')
const busy = ref(false)
const balance = ref<AihubBalanceInfo | null>(null)
const balanceLoading = ref(false)
const refreshingModels = ref(false)
const redeemCode = ref('')
const redeeming = ref(false)

const loginForm = reactive({ gatewayUrl: '', identity: '', password: '' })
const registerForm = reactive({ gatewayUrl: '', email: '', password: '' })
const advancedForm = reactive({ gatewayUrl: '', rechargeUrl: '' })

async function loadSession(): Promise<void> {
  try {
    const res = await api().session()
    if (res?.success && res.session) Object.assign(session, res.session)
    advancedForm.gatewayUrl = session.gatewayUrl || ''
    api().rechargeUrl?.().then((r: any) => {
      if (r?.success) session.rechargeUrl = r.url ?? undefined
    })
  } catch (e) {
    console.warn('[AihubSettings] 会话查询失败:', e)
  }
}

/** 总开关切换：关闭即强制登出（后端语义），开启后出现登录入口 */
async function toggleEnabled(): Promise<void> {
  const next = session.enabled
  if (!next) {
    try {
      await ElMessageBox.confirm(
        '关闭后将登出 AI Hub 并停用网关配置，网关模型从所有选择器消失（自有 Key 的提供商不受影响）。确定关闭？',
        '关闭 AI Hub',
        { type: 'warning', confirmButtonText: '关闭', cancelButtonText: '取消' }
      )
    } catch {
      session.enabled = true // 用户取消
      return
    }
  }
  switching.value = true
  try {
    const res = await api().setEnabled(next)
    if (res?.success) {
      Object.assign(session, res.session)
      if (!next) {
        balance.value = null
        ElMessage.success('AI Hub 已关闭（已登出并停用网关模型）')
      } else {
        ElMessage.success('AI Hub 已开启，请登录账号')
      }
    } else {
      session.enabled = !next
      ElMessage.error(res?.error || '操作失败')
    }
  } finally {
    switching.value = false
  }
}

async function doLogin(): Promise<void> {
  busy.value = true
  try {
    const res = await api().login({
      gatewayUrl: loginForm.gatewayUrl || undefined,
      identity: loginForm.identity,
      password: loginForm.password
    })
    if (res?.success) {
      Object.assign(session, res.session)
      ElMessage.success('登录成功，网关模型已可用')
      await refreshBalance()
    } else {
      ElMessage.error(res?.error || '登录失败')
    }
  } finally {
    busy.value = false
  }
}

async function doRegister(): Promise<void> {
  busy.value = true
  try {
    const res = await api().register({
      gatewayUrl: registerForm.gatewayUrl || undefined,
      email: registerForm.email,
      password: registerForm.password
    })
    if (res?.success) {
      Object.assign(session, res.session)
      ElMessage.success('注册成功，已自动登录')
      await refreshBalance()
    } else {
      ElMessage.error(res?.error || '注册失败')
    }
  } finally {
    busy.value = false
  }
}

async function doLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('登出后 AI Hub 网关模型将从所有选择器消失（自有 Key 的提供商不受影响）。确定登出？', '登出 AI Hub', {
      type: 'warning',
      confirmButtonText: '登出',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  const res = await api().logout()
  if (res?.success) {
    Object.assign(session, { loggedIn: false, valid: false, email: undefined, expiresAt: undefined })
    balance.value = null
    ElMessage.success('已登出')
  } else {
    ElMessage.error(res?.error || '登出失败')
  }
}

async function refreshBalance(): Promise<void> {
  balanceLoading.value = true
  try {
    const res = await api().balance()
    if (res?.success) balance.value = res.balance
    else ElMessage.warning(res?.error || '余额查询失败')
  } finally {
    balanceLoading.value = false
  }
}

async function doRefreshModels(): Promise<void> {
  refreshingModels.value = true
  try {
    const res = await api().refreshModels()
    if (res?.success) ElMessage.success(`模型清单已刷新（${res.count} 个模型）`)
    else ElMessage.error(res?.error || '刷新失败')
  } finally {
    refreshingModels.value = false
  }
}

async function doRedeem(): Promise<void> {
  if (!redeemCode.value.trim()) {
    ElMessage.warning('请输入兑换码')
    return
  }
  redeeming.value = true
  try {
    const res = await api().redeem(redeemCode.value.trim())
    if (res?.success) {
      ElMessage.success('兑换成功')
      redeemCode.value = ''
      await refreshBalance()
    } else {
      ElMessage.error(res?.error || '兑换失败')
    }
  } finally {
    redeeming.value = false
  }
}

async function saveAdvanced(): Promise<void> {
  const res = await api().saveGatewayConfig({
    gatewayUrl: advancedForm.gatewayUrl,
    rechargeUrl: advancedForm.rechargeUrl || undefined
  })
  if (res?.success) {
    session.rechargeUrl = advancedForm.rechargeUrl || undefined
    ElMessage.success('地址已保存')
  } else {
    ElMessage.error(res?.error || '保存失败')
  }
}

function openRecharge(): void {
  if (session.rechargeUrl) window.open(session.rechargeUrl, '_blank')
}

function formatExpiry(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

onMounted(loadSession)
</script>

<style scoped>
.aihub-settings .login-hint {
  margin-bottom: 16px;
}
.aihub-settings .master-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aihub-settings .switch-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.aihub-settings .auth-tabs {
  max-width: 560px;
}
.aihub-settings .session-card {
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 16px;
  max-width: 640px;
}
.aihub-settings .session-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}
.aihub-settings .session-label {
  width: 72px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.aihub-settings .session-value {
  color: var(--el-text-color-primary);
}
.aihub-settings .action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.aihub-settings .redeem-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.aihub-settings .advanced-collapse {
  max-width: 640px;
  margin-top: 8px;
}
.aihub-settings .sub-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
