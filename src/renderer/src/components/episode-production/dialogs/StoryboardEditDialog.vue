<template>
  <el-dialog
    v-model="visible"
    title="编辑分镜"
    width="800px"
    :close-on-click-modal="false"
  >
    <el-form v-if="storyboard" :model="form" label-width="100px">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="镜头号">
            <el-input-number v-model="form.shotNumber" :min="1" :max="100" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="时长(秒)">
            <el-input-number v-model="form.duration" :min="0.5" :max="60" :step="0.5" :precision="1" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider content-position="left">镜头参数</el-divider>

      <el-row :gutter="20">
        <el-col :span="8">
          <el-form-item label="景别">
            <el-select v-model="form.shotType" style="width: 100%">
              <el-option label="大远景" value="extreme_long" />
              <el-option label="远景" value="long" />
              <el-option label="全景" value="full" />
              <el-option label="中景" value="medium" />
              <el-option label="中近景" value="medium_close" />
              <el-option label="近景" value="close" />
              <el-option label="特写" value="extreme_close" />
              <el-option label="大特写" value="detail" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="角度">
            <el-select v-model="form.cameraAngle" style="width: 100%">
              <el-option label="平视" value="eye_level" />
              <el-option label="俯拍" value="high" />
              <el-option label="仰拍" value="low" />
              <el-option label="荷兰角" value="dutch" />
              <el-option label="鸟瞰" value="birds_eye" />
              <el-option label="虫视" value="worms_eye" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="运镜">
            <el-select v-model="form.cameraMovement" style="width: 100%">
              <el-option label="固定" value="static" />
              <el-option label="左摇" value="pan_left" />
              <el-option label="右摇" value="pan_right" />
              <el-option label="上仰" value="tilt_up" />
              <el-option label="下俯" value="tilt_down" />
              <el-option label="推镜" value="dolly_in" />
              <el-option label="拉镜" value="dolly_out" />
              <el-option label="左移" value="truck_left" />
              <el-option label="右移" value="truck_right" />
              <el-option label="变焦推进" value="zoom_in" />
              <el-option label="变焦拉远" value="zoom_out" />
              <el-option label="升镜" value="crane_up" />
              <el-option label="降镜" value="crane_down" />
              <el-option label="手持" value="handheld" />
              <el-option label="环绕" value="orbit" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="画面描述">
        <el-input
          v-model="form.frameDescription"
          type="textarea"
          :rows="3"
          placeholder="描述画面内容、构图、角色位置等"
        />
      </el-form-item>

      <el-divider content-position="left">转场设置</el-divider>

      <el-row :gutter="20">
        <el-col :span="8">
          <el-form-item label="转场类型">
            <el-select v-model="form.transitionType" style="width: 100%">
              <el-option label="硬切" value="cut" />
              <el-option label="淡入淡出" value="fade" />
              <el-option label="溶解" value="dissolve" />
              <el-option label="擦除" value="wipe" />
              <el-option label="滑动" value="slide" />
              <el-option label="缩放" value="zoom" />
              <el-option label="光圈" value="iris" />
              <el-option label="甩镜" value="whip" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="转场时长">
            <el-input-number v-model="form.transitionDuration" :min="0" :max="3000" :step="100" />
            <span class="form-hint">ms</span>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="滑动方向">
            <el-select
              v-model="form.transitionDirection"
              style="width: 100%"
              :disabled="!['slide', 'wipe'].includes(form.transitionType)"
            >
              <el-option label="向左" value="left" />
              <el-option label="向右" value="right" />
              <el-option label="向上" value="up" />
              <el-option label="向下" value="down" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import type { Storyboard } from '../../../../shared/types/story-to-video.types'

const props = defineProps<{
  modelValue: boolean
  storyboard: Storyboard | null
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'saved': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const store = useStoryToVideoStore()
const loading = computed(() => store.loading)

const form = reactive({
  shotNumber: 1,
  shotType: 'medium' as string,
  cameraAngle: 'eye_level' as string,
  cameraMovement: 'static' as string,
  duration: 3,
  frameDescription: '',
  transitionType: 'cut' as string,
  transitionDuration: 500,
  transitionDirection: undefined as 'left' | 'right' | 'up' | 'down' | undefined
})

// 打开时填充表单
watch(() => props.storyboard, (storyboard) => {
  if (storyboard) {
    form.shotNumber = storyboard.shotNumber
    form.shotType = storyboard.shotType as string
    form.cameraAngle = storyboard.cameraAngle as string
    form.cameraMovement = storyboard.cameraMovement as string
    form.duration = storyboard.duration
    form.frameDescription = storyboard.frameDescription
    form.transitionType = storyboard.transition.type as string
    form.transitionDuration = storyboard.transition.duration
    form.transitionDirection = storyboard.transition.direction
  }
})

async function handleSubmit() {
  if (!props.storyboard) return

  const success = await store.updateStoryboard(props.storyboard.id, {
    shotNumber: form.shotNumber,
    shotType: form.shotType as any,
    cameraAngle: form.cameraAngle as any,
    cameraMovement: form.cameraMovement as any,
    duration: form.duration,
    frameDescription: form.frameDescription,
    transition: {
      type: form.transitionType as any,
      duration: form.transitionDuration,
      direction: form.transitionDirection,
      easing: 'ease_out'
    }
  })

  if (success) {
    ElMessage.success('分镜已更新')
    visible.value = false
    emit('saved')
  } else {
    ElMessage.error(store.error || '保存失败')
  }
}
</script>

<style scoped lang="scss">
.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
