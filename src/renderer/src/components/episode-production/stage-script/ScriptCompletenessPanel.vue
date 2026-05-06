<template>
  <!--
    ScriptCompletenessPanel · 剧本完整性面板（spec §4.1 + P4-T8）

    功能：
      - 调 IPC ep:validate-episode-script 校验整剧本
      - 红/黄/绿状态：error / warning / 全绿
      - 列出 violations：每条带场景编号 + 等级标签 + 中文描述 + 跳转按钮
      - 点击违例 → emit('jump-to-scene', sceneScriptId) 让父组件滚动到对应场景
      - 刷新按钮重新校验
      - 校验时显示 loading
  -->
  <div class="script-completeness-panel">
    <div class="panel-header">
      <div class="status-display">
        <el-tag v-if="loading" type="info" size="default">
          <el-icon class="is-loading"><Loading /></el-icon>
          校验中...
        </el-tag>
        <el-tag v-else-if="!report" type="info" size="default">未校验</el-tag>
        <el-tag v-else-if="report.errorCount > 0" type="danger" size="default">
          {{ report.errorCount }} 项必须处理
        </el-tag>
        <el-tag v-else-if="report.warningCount > 0" type="warning" size="default">
          {{ report.warningCount }} 项提醒
        </el-tag>
        <el-tag v-else type="success" size="default">
          <el-icon><CircleCheck /></el-icon>
          全部就绪
        </el-tag>
      </div>
      <el-button
        size="small"
        :loading="loading"
        :disabled="!episodeScriptId"
        @click="runValidation"
      >
        <el-icon><Refresh /></el-icon>
        {{ report ? '重新校验' : '校验完整性' }}
      </el-button>
    </div>

    <div v-if="report && report.violations.length > 0" class="violations-list">
      <div
        v-for="(v, idx) in report.violations"
        :key="`${v.code}-${v.sceneScriptId}-${v.context.targetId ?? idx}`"
        class="violation-item"
        :class="`level-${v.level}`"
      >
        <div class="violation-row">
          <el-tag
            size="small"
            :type="v.level === 'error' ? 'danger' : 'warning'"
            class="level-tag"
          >
            场景 {{ v.sceneNumber }}
          </el-tag>
          <span class="violation-code">{{ codeShort(v.code) }}</span>
          <span class="row-spacer" />
          <!--
            FU6-T4 显式修复入口：
              - binding 类 → 跳到场景并打开 binding picker（fix-violation 事件）
              - 主图类 → 提示父组件去 ② 资产 stage 生成主图
              - 声音类 → 提示父组件打开声音绑定
            父组件根据 v.code 分发处理。
          -->
          <el-button
            size="small"
            :type="v.level === 'error' ? 'danger' : 'warning'"
            link
            @click.stop="emit('fix-violation', v)"
          >
            {{ fixActionLabel(v.code) }} →
          </el-button>
        </div>
        <div
          class="violation-message"
          @click="emit('jump-to-scene', v.sceneScriptId)"
        >
          {{ v.message }}
        </div>
      </div>
    </div>

    <div v-if="report && report.errorCount === 0 && report.warningCount === 0" class="all-green">
      <el-icon class="big-check"><CircleCheck /></el-icon>
      <div>剧本所有引用均已绑定到资产，主图就绪，可以进入下一阶段。</div>
    </div>

    <div v-if="errorMessage" class="error-banner">
      <el-icon><Warning /></el-icon>
      校验失败：{{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ScriptCompletenessPanel（P4-T8）
 *
 * Props：
 *   - episodeScriptId：剧本 ID
 *   - autoRunOnMount：是否进入页面就跑一次校验（默认 false，避免页面打开就异步报错）
 *
 * Emits：
 *   - jump-to-scene(sceneScriptId)：父组件应滚动定位到该场景
 *
 * 内部直接调 window.electronAPI.episodeProduction.validateEpisodeScript（双端共用）
 */
import { onMounted, ref, watch } from 'vue'
import { CircleCheck, Loading, Refresh, Warning } from '@element-plus/icons-vue'

interface CompletenessViolation {
  level: 'error' | 'warning'
  code: string
  message: string
  sceneScriptId: string
  sceneNumber: number
  context: {
    targetType: string
    targetId?: string
    bindingId?: string
  }
}

interface CompletenessReport {
  ok: boolean
  errorCount: number
  warningCount: number
  violations: CompletenessViolation[]
}

const props = withDefaults(
  defineProps<{
    episodeScriptId: string | null
    autoRunOnMount?: boolean
  }>(),
  { autoRunOnMount: false },
)

const emit = defineEmits<{
  (e: 'jump-to-scene', sceneScriptId: string): void
  (e: 'report-changed', report: CompletenessReport | null): void
  /** FU6-T4 显式修复入口：父组件根据 v.code 分发 picker / stage 跳转 */
  (e: 'fix-violation', violation: CompletenessViolation): void
}>()

const loading = ref(false)
const report = ref<CompletenessReport | null>(null)
const errorMessage = ref<string | null>(null)

const codeMap: Record<string, string> = {
  LOCATION_BINDING_MISSING: '地点未绑定',
  LOCATION_BINDING_UNRESOLVED: '地点丢失',
  LOCATION_MAIN_IMAGE_MISSING: '地点缺主图',
  CHARACTER_BINDING_MISSING: '角色未绑定',
  CHARACTER_BINDING_UNRESOLVED: '角色丢失',
  CHARACTER_MAIN_IMAGE_MISSING: '角色缺主图',
  DIALOGUE_CHARACTER_MISSING: '对话角色未绑',
  DIALOGUE_CHARACTER_UNRESOLVED: '对话角色丢失',
  DIALOGUE_VOICE_MISSING: '对话缺声音',
  ACTION_CHARACTER_UNRESOLVED: '动作角色丢失',
  PROP_BINDING_MISSING: '道具未绑定',
  PROP_BINDING_UNRESOLVED: '道具丢失',
  PROP_MAIN_IMAGE_MISSING: '道具缺主图',
}

function codeShort(code: string): string {
  return codeMap[code] ?? code
}

/* FU6-T4 修复按钮文案：根据违例 code 分类提示动作目的地 */
function fixActionLabel(code: string): string {
  if (code.endsWith('_MAIN_IMAGE_MISSING')) return '去生成主图'
  if (code === 'DIALOGUE_VOICE_MISSING') return '去绑声音'
  if (code.endsWith('_BINDING_MISSING')) return '去绑定资产'
  if (code.endsWith('_BINDING_UNRESOLVED') || code.endsWith('_UNRESOLVED'))
    return '去重新选择'
  return '去修复'
}

async function runValidation(): Promise<void> {
  if (!props.episodeScriptId) return
  loading.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.validateEpisodeScript) {
      throw new Error('IPC validateEpisodeScript 未暴露')
    }
    const resp = await api.validateEpisodeScript(props.episodeScriptId)
    if (!resp?.success) {
      throw new Error(resp?.error || '校验失败')
    }
    report.value = resp.data as CompletenessReport
    emit('report-changed', report.value)
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
    report.value = null
    emit('report-changed', null)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.episodeScriptId,
  () => {
    // 切剧本时清空旧报告
    report.value = null
    errorMessage.value = null
  },
)

onMounted(() => {
  if (props.autoRunOnMount && props.episodeScriptId) runValidation()
})

defineExpose({ runValidation })
</script>

<style scoped>
.script-completeness-panel {
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-display {
  display: flex;
  align-items: center;
  gap: 6px;
}

.violations-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.violation-item {
  padding: 6px 8px;
  border-radius: 4px;
  transition: background-color 0.1s;
}

.violation-item:hover {
  background: var(--el-color-primary-light-9);
}

.row-spacer {
  flex: 1;
}

.violation-message {
  cursor: pointer;
}

.violation-item.level-error {
  border-left: 3px solid var(--el-color-danger);
}

.violation-item.level-warning {
  border-left: 3px solid var(--el-color-warning);
}

.violation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.violation-code {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.violation-message {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.all-green {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  color: var(--el-color-success);
  font-size: 13px;
}

.all-green .big-check {
  font-size: 18px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  margin-top: 6px;
  color: var(--el-color-danger);
  font-size: 12px;
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
}
</style>
