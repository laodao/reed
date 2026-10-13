<template>
  <!--
    T01 · 资产写回影响范围确认弹窗（ep:asset:get-write-impact 的 UI 载体）

    高危覆盖操作（"设为主图" / 主图"重新生成"）在替换被 ≥1 个分镜引用的主图前弹出，
    让用户在覆盖前知道爆炸半径；文案一律用"约 N 个"（估算口径，不绝对化）。
    确认后仅 emit('confirm')，由父组件执行原操作；本组件不做任何写操作。

    T07 精修工作台复用本组件（task-01 被依赖声明）。
  -->
  <el-dialog
    v-model="visible"
    :title="`确认${actionLabel}`"
    width="480px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="onVisibilityChange"
  >
    <div v-loading="loading" class="impact-body">
      <div class="impact-main">
        <el-icon :size="22" class="impact-icon"><WarningFilled /></el-icon>
        <p class="impact-text">
          该{{ typeLabel }}主图当前被<strong>约 {{ impact?.storyboardCount ?? '?' }} 个分镜</strong>（约
          {{ impact?.episodeCount ?? '?' }} 集）引用，替换后新生成画面将使用新图；历史图保留，可在"历史"中恢复。
        </p>
      </div>

      <!-- 口径说明（估算口径声明 / 未迁移老数据标注） -->
      <div v-if="impact?.notes?.length" class="impact-notes">
        <div class="notes-title">统计口径说明</div>
        <ul>
          <li v-for="(n, i) in impact.notes" :key="i">{{ n }}</li>
        </ul>
      </div>
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onConfirm">
        继续{{ actionLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * @module renderer/components/episode-production/shared/AssetWriteImpactDialog
 * @description 写回影响范围确认弹窗（T01）。
 *
 * props 按 task-01 §2.2：{ assetType, assetId, action }；v-model 控制显隐。
 * 打开时经 ep-asset store 调 ep:asset:get-write-impact 拉取影响面；
 * 确认 → emit('confirm')，取消/关闭 → emit('cancel')。
 * 调用方职责（task-01 §3 交互流）：先自查 storyboardCount===0 直接执行，
 * >0 才打开本弹窗 —— 弹窗内的数据仅作展示刷新。
 */
import { computed, ref, watch } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import { useEpAssetStore } from '@/stores/episode-production/asset.store'
import type { AssetWriteImpact } from '@shared/types/episode-production/domain.types'

const props = defineProps<{
  modelValue: boolean
  assetType: 'character' | 'location' | 'item'
  assetId: string
  /** 触发动作：set-main=设为主图；regenerate=重新生成主图（决定按钮/标题文案） */
  action: 'set-main' | 'regenerate'
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: []
  cancel: []
}>()

const assetStore = useEpAssetStore()

const loading = ref(false)
const impact = ref<AssetWriteImpact | null>(null)

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const typeLabel = computed(
  () => ({ character: '角色', location: '地点', item: '物品' })[props.assetType] ?? '资产',
)

const actionLabel = computed(() =>
  props.action === 'regenerate' ? '重新生成主图' : '设为主图',
)

/** 打开时拉取影响面（IpcResponse 解包失败保持 null，界面显示"?"不阻塞确认） */
async function fetchImpact(): Promise<void> {
  if (!props.assetId) return
  loading.value = true
  try {
    impact.value = await assetStore.getWriteImpact(props.assetType, props.assetId)
  } finally {
    loading.value = false
  }
}

/** el-dialog 关闭来源区分：确认按钮置位后关闭不再误发 cancel（ESC/×/取消都算 cancel） */
let confirmedBeforeClose = false

function onVisibilityChange(v: boolean): void {
  if (!v) {
    if (!confirmedBeforeClose) emit('cancel')
    confirmedBeforeClose = false
  }
}

function onCancel(): void {
  visible.value = false
  emit('cancel')
}

function onConfirm(): void {
  confirmedBeforeClose = true
  visible.value = false
  emit('confirm')
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) void fetchImpact()
  },
  // 初始即打开（modelValue=true 挂载）也要拉取
  { immediate: true },
)
</script>

<style scoped>
.impact-body {
  min-height: 72px;
}

.impact-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.impact-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
  margin-top: 2px;
}

.impact-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
}

.impact-notes {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.notes-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.impact-notes ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
</style>
