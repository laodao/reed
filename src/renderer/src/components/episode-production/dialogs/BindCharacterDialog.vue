<template>
  <el-dialog
    v-model="visible"
    title="绑定角色"
    width="500px"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="选择角色">
        <el-select v-model="form.characterId" placeholder="请选择角色" style="width: 100%">
          <el-option
            v-for="char in availableCharacters"
            :key="char.id"
            :label="char.name"
            :value="char.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="声音类型">
        <el-select v-model="form.voiceType" placeholder="选择声音类型" style="width: 100%">
          <el-option label="男声-沉稳" value="male_calm" />
          <el-option label="男声-活力" value="male_energetic" />
          <el-option label="女声-温柔" value="female_gentle" />
          <el-option label="女声-活泼" value="female_lively" />
          <el-option label="童声" value="child" />
          <el-option label="老年-男" value="elder_male" />
          <el-option label="老年-女" value="elder_female" />
        </el-select>
      </el-form-item>
      <el-form-item label="语速">
        <el-slider v-model="form.speechRate" :min="0.5" :max="2" :step="0.1" show-stops />
      </el-form-item>
      <el-form-item label="角色描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="输入角色外貌描述，用于生成人物形象（可选）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!form.characterId"
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
  availableCharacters: Array<{ id: string; name: string }>
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
  characterId: '',
  voiceType: 'female_gentle',
  speechRate: 1.0,
  description: ''
})

// 关闭时重置表单
watch(() => props.modelValue, (val) => {
  if (!val) {
    form.characterId = ''
    form.voiceType = 'female_gentle'
    form.speechRate = 1.0
    form.description = ''
  }
})

async function handleSubmit() {
  if (!form.characterId) {
    ElMessage.warning('请选择角色')
    return
  }

  const result = await store.bindCharacter(
    props.projectId,
    form.characterId,
    undefined,
    {
      voiceId: form.voiceType,
      speed: form.speechRate,
      pitch: 1.0
    },
    form.description ? { baseDescription: form.description } : undefined
  )

  if (result) {
    ElMessage.success('角色绑定成功')
    visible.value = false
    emit('bound')
  } else {
    ElMessage.error(store.error || '绑定失败')
  }
}
</script>
