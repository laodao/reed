<template>
  <!--
    一键生成对话框：勾选要生成的衍生图（以主图为参考，系统固定提示词），
    确定后批量生成。
  -->
  <el-dialog
    v-model="visible"
    title="一键生成"
    width="420px"
    append-to-body
    destroy-on-close
  >
    <div class="hint">勾选要生成的图（以主图为参考，保持面容/发型/服饰/背景一致）</div>
    <div v-if="items.length === 0" class="empty">当前没有待生成的图，所有角度都已生成。</div>
    <el-checkbox-group v-else v-model="selected" class="slot-list">
      <el-checkbox v-for="item in items" :key="item.label" :value="item.label" class="slot-item">
        <span class="slot-title">{{ item.title }}</span>
      </el-checkbox>
    </el-checkbox-group>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="generating"
        :disabled="selected.length === 0"
        @click="onConfirm"
      >
        生成（{{ selected.length }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface BatchDeriveItem {
  label: string
  title: string
  category: string
}

const props = defineProps<{
  modelValue: boolean
  items: BatchDeriveItem[]
  generating?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', labels: string[]): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const selected = ref<string[]>([])

watch(visible, (v) => {
  if (v) selected.value = props.items.map(i => i.label)
})

function onConfirm(): void {
  if (selected.value.length === 0) return
  emit('confirm', [...selected.value])
  visible.value = false
}
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
.empty {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 30px 0;
  text-align: center;
}
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}
.slot-item {
  margin-right: 0;
}
.slot-title {
  font-size: 13px;
}
</style>
