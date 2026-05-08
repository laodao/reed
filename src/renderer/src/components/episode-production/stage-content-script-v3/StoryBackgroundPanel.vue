<template>
  <!--
    StoryBackgroundPanel · 故事背景卡（年代 / 地域 / 其他描述）

    从 stage-content-v2 / StageContentViewV2.vue 拆出。
    职责：
      - 通过 episodeStore 获取/保存 storyEra / storyRegion / storyBackgroundExtra
      - 本地 dirty 检测，仅 dirty + 非 readonly 才允许保存
      - readonly = true 时禁用所有输入和保存按钮（剧集已进入后续 stage 锁住）

    备注：
      故事背景没独立的 loadStoryBackground / saveStoryBackground IPC，
      落库依赖 episode 主表的 storyEra / storyRegion / storyBackgroundExtra 字段，
      因此组件内通过 episodeStore.updateEpisode / 当前 episode 同步状态，
      而不是 plan 描述的"组件自己调独立 IPC"。
  -->
  <section class="story-background-panel">
    <div class="panel-header">
      <span class="panel-title">📜 故事背景</span>
      <el-button
        size="small"
        type="primary"
        :disabled="readonly || !storyBgDirty || savingStoryBg"
        :loading="savingStoryBg"
        @click="saveStoryBackground"
      >保存</el-button>
    </div>
    <el-form label-position="top" size="small" class="story-bg-form">
      <el-form-item label="年代">
        <el-input
          v-model="storyBg.era"
          :disabled="readonly"
          placeholder="如：民国初年 / 唐代盛世 / 近未来 2080 年"
        />
      </el-form-item>
      <el-form-item label="地域">
        <el-input
          v-model="storyBg.region"
          :disabled="readonly"
          placeholder="如：江南水乡 / 东京涩谷 / 北欧雪原"
        />
      </el-form-item>
      <el-form-item label="其他描述">
        <el-input
          v-model="storyBg.extra"
          type="textarea"
          :rows="6"
          :disabled="readonly"
          placeholder="阶级背景 / 文化氛围 / 时代关键事件 等自由文本"
        />
      </el-form-item>
    </el-form>
    <div class="story-bg-tip">
      故事背景将作为生成主图 / 派生图的 prompt 锚点，与角色/地点/物品风格一起拼接到 AI prompt。
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useEpEpisodeStore } from '@/stores/episode-production'

defineOptions({ name: 'StoryBackgroundPanel' })

const props = defineProps<{
  episodeId: string
  readonly?: boolean
}>()

const episodeStore = useEpEpisodeStore()

const storyBg = ref<{ era: string; region: string; extra: string }>({
  era: '',
  region: '',
  extra: '',
})
const storyBgInitial = ref<{ era: string; region: string; extra: string }>({
  era: '',
  region: '',
  extra: '',
})
const savingStoryBg = ref(false)

const storyBgDirty = computed(
  () =>
    storyBg.value.era !== storyBgInitial.value.era ||
    storyBg.value.region !== storyBgInitial.value.region ||
    storyBg.value.extra !== storyBgInitial.value.extra,
)

/** 从 store.currentEpisode 拉初始值（不直接读 props.episodeId 之外的数据，避免循环） */
function loadFromStore(): void {
  const ep = episodeStore.currentEpisode
  if (!ep || ep.id !== props.episodeId) {
    storyBg.value = { era: '', region: '', extra: '' }
    storyBgInitial.value = { era: '', region: '', extra: '' }
    return
  }
  const era = ep.storyEra ?? ''
  const region = ep.storyRegion ?? ''
  const extra = ep.storyBackgroundExtra ?? ''
  storyBg.value = { era, region, extra }
  storyBgInitial.value = { era, region, extra }
}

watch(
  () => [props.episodeId, episodeStore.currentEpisode],
  () => {
    loadFromStore()
  },
  { immediate: true, deep: true },
)

async function saveStoryBackground(): Promise<void> {
  if (props.readonly) return
  if (savingStoryBg.value) return
  savingStoryBg.value = true
  try {
    const ok = await episodeStore.updateEpisode(props.episodeId, {
      storyEra: storyBg.value.era,
      storyRegion: storyBg.value.region,
      storyBackgroundExtra: storyBg.value.extra,
    } as any)
    if (ok) {
      storyBgInitial.value = { ...storyBg.value }
      ElMessage.success('故事背景已保存')
    } else {
      ElMessage.error('故事背景保存失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '故事背景保存失败')
  } finally {
    savingStoryBg.value = false
  }
}
</script>

<style scoped lang="scss">
.story-background-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.story-bg-form {
  margin-top: 4px;
}

.story-bg-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.story-bg-tip {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .story-background-panel {
    width: 100%;
  }
}
</style>
