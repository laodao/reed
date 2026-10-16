<template>
  <el-dialog
    :model-value="modelValue"
    title="剧本全文"
    width="760px"
    top="6vh"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="script-text">
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="场次">{{ sceneCount }} 场</el-descriptions-item>
        <el-descriptions-item label="正文字数">{{ content.length }} 字</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="approved ? 'success' : 'warning'" size="small">
            {{ approved ? '已定稿' : '草稿' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="synopsis" class="block">
        <div class="field-label">梗概</div>
        <p class="synopsis">{{ synopsis }}</p>
      </div>

      <div class="field-label">正文</div>
      <pre v-if="content" class="content">{{ content }}</pre>
      <el-empty v-else description="该剧本还没有正文（只有拆分出的场次）" :image-size="70" />
    </div>

    <template #footer>
      <el-button :disabled="!content" @click="onCopy">
        <el-icon><CopyDocument /></el-icon>
        复制正文
      </el-button>
      <el-button type="primary" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 剧本全文查看（③ 剧本 stage · 只读）。
 *
 * 中央工作区按场次展示，正文（script_content）平时看不到；而「追加剧本」是往正文
 * 末尾累加的，用户需要能确认累加结果，所以给一个只读全文弹窗（含复制）。
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'

const props = defineProps<{
  /** 弹窗显隐（v-model） */
  modelValue: boolean
  /** 剧本对象（含 scriptContent / synopsis / status） */
  script: any
  /** 已有场次数量 */
  sceneCount?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const content = computed<string>(() => props.script?.scriptContent ?? '')
const synopsis = computed<string>(() => props.script?.synopsis ?? '')
const approved = computed<boolean>(() => props.script?.status === 'approved')

async function onCopy(): Promise<void> {
  if (!content.value) return
  try {
    await navigator.clipboard.writeText(content.value)
    ElMessage.success('正文已复制到剪贴板')
  } catch (e: any) {
    ElMessage.error(e?.message || '复制失败')
  }
}
</script>

<style lang="scss" scoped>
.script-text {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 66vh;
  overflow-y: auto;
  padding-right: 4px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  letter-spacing: 0.3px;
}

.synopsis {
  margin: 0;
  padding: 10px 12px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-color-regular);
}

.content {
  margin: 0;
  padding: 12px 14px;
  background: var(--fill-color-lighter);
  border: 1px solid var(--border-color-lighter);
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-color-regular);
}
</style>
