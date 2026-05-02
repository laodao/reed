<template>
  <el-dialog
    v-model="visible"
    title="绑定物品"
    width="500px"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="选择物品">
        <el-select v-model="form.itemId" placeholder="请选择物品" style="width: 100%">
          <el-option
            v-for="item in availableItems"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="物品描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="输入物品描述，用于生成图片（可选）"
        />
      </el-form-item>
      <el-form-item label="自动生成图片">
        <el-switch v-model="form.generateImages" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!form.itemId"
        :loading="loading"
        @click="handleSubmit"
      >
        绑定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useStoryToVideoStore } from '@/stores/story-to-video'

const props = defineProps<{
  modelValue: boolean
  projectId: string
  availableItems: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'bound': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const store = useStoryToVideoStore()
const loading = computed(() => store.loading)

const form = reactive({
  itemId: '',
  description: '',
  generateImages: true
})

// 关闭时重置表单
watch(() => props.modelValue, (val) => {
  if (!val) {
    form.itemId = ''
    form.description = ''
    form.generateImages = true
  }
})

async function handleSubmit() {
  if (!form.itemId) {
    ElMessage.warning('请选择物品')
    return
  }

  const item = props.availableItems.find(i => i.id === form.itemId)
  if (!item) {
    ElMessage.warning('物品不存在')
    return
  }

  const result = await store.bindItem(
    props.projectId,
    form.itemId,
    item.name,
    [],
    form.description ? { baseDescription: form.description } : undefined,
    form.generateImages
  )

  if (result) {
    ElMessage.success('物品绑定成功')
    visible.value = false
    emit('bound')
  } else {
    ElMessage.error(store.error || '绑定失败')
  }
}
</script>
