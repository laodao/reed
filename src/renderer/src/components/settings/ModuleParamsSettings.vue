<template>
  <div class="settings-section module-params">
    <div class="mp-head">
      <div>
        <h3>参数设置</h3>
        <p class="section-desc">
          按模块查看和调整系统参数（步数、次数、超时、上限、开关等）。每一项都标注了内置默认值、代码级硬上限与生效时机；
          只写你改过的项，没碰过的继续跟随内置默认（将来默认值改进能吃到）。
        </p>
      </div>
      <div class="mp-switch">
        <span class="mp-switch-label">
          向用户开放参数编辑
          <span class="mp-hint">关闭后本页收起，已保存的参数继续生效；随时可再打开</span>
        </span>
        <el-switch :model-value="uiEnabled" @update:model-value="onToggleUi" />
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="3" animated />

    <template v-else>
      <el-alert
        v-if="!uiEnabled"
        type="info"
        :closable="false"
        show-icon
        title="参数编辑已收起"
        description="当前仍按已保存的参数运行（可点右上角开关重新展开编辑区）。"
      />

      <el-tabs v-else v-model="activeModule" tab-position="top" class="mp-tabs">
        <el-tab-pane
          v-for="m in MODULE_PARAMS"
          :key="m.key"
          :label="m.name"
          :name="m.key"
          lazy
        >
          <ModuleParamPanel :definition="m" />
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 设置页「参数设置」区块（2026-09-13 用户需求第二轮）
 * @module components/settings/ModuleParamsSettings
 *
 * 用户诉求：「这个功能应该叫参数设置，界面内按照模块应该有多个 tab，每个模块有一个 tab，
 * 把每个模块的相关参数设置都要做成这类参数设置功能。」
 *
 * 结构：
 * - 顶层 = 平台开关（`ui:params.enabled`，是否向用户开放参数编辑）+ 模块 Tab 列表；
 * - Tab 列表来自 `MODULE_PARAMS` 登记表（**不在前端写死 Tab**）；
 * - 每个 Tab 的内容由 `ModuleParamPanel` 按登记表通用渲染。
 *
 * 兼容：第一轮的开关在 `agent:budget.ui.enabled`，这里读取时兜底
 * （老用户若已关掉，仍然保持关闭），保存一律写新键 `ui:params`。
 */
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MODULE_PARAMS } from '@shared/constants/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'
import ModuleParamPanel from './ModuleParamPanel.vue'

const activeModule = ref(MODULE_PARAMS[0]?.key ?? '')
const uiEnabled = ref(true)
const loading = ref(false)

function apiAny(): any {
  return (window as unknown as { electronAPI?: any }).electronAPI
}

function readEnabled(value: unknown): boolean | null {
  if (value && typeof value === 'object' && typeof (value as { enabled?: unknown }).enabled === 'boolean') {
    return (value as { enabled: boolean }).enabled
  }
  return null
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = await apiAny()?.settings.get(SETTINGS_KEYS.uiParams)
    let enabled = r?.success ? readEnabled(r.data) : null
    if (enabled === null) {
      // 兼容第一轮：开关原先在 agent:budget.ui.enabled（只有显式 false 才算关闭）
      const legacy = await apiAny()?.settings.get(SETTINGS_KEYS.agentBudget)
      const old = readEnabled(legacy?.success ? legacy.data?.ui : null)
      enabled = old === false ? false : true
    }
    uiEnabled.value = enabled
  } catch (e) {
    console.error('[ModuleParamsSettings] 读取参数设置开关失败:', e)
  } finally {
    loading.value = false
  }
}

async function onToggleUi(next: string | number | boolean): Promise<void> {
  const enabled = next === true
  uiEnabled.value = enabled
  try {
    const resp = await apiAny()?.settings.set(SETTINGS_KEYS.uiParams, { enabled })
    if (resp && resp.success === false) throw new Error(resp.error ?? '保存失败')
    ElMessage.success(enabled ? '已开放参数编辑' : '已收起参数编辑（已保存的参数继续生效）')
  } catch (e) {
    uiEnabled.value = !enabled // 回滚
    console.error('[ModuleParamsSettings] 保存开关失败:', e)
    ElMessage.error('保存失败')
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped lang="scss">
.module-params {
  .mp-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }

  .mp-switch {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
    padding-top: 4px;
  }

  .mp-switch-label {
    display: flex;
    flex-direction: column;
    text-align: right;
    font-size: 13px;
  }

  .mp-hint {
    font-size: 11.5px;
    color: var(--el-text-color-secondary);
  }

  .mp-tabs {
    margin-top: 8px;
  }
}
</style>
