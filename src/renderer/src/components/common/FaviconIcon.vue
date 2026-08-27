<template>
  <div class="favicon-icon" :style="boxStyle">
    <img
      v-if="dataUrl"
      :src="dataUrl"
      alt=""
      class="favicon-img"
      @error="onLoadError"
    />
    <span v-else-if="loading" class="favicon-loading"></span>
    <span v-else class="favicon-fallback">{{ fallback }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 站点 URL，用于解析域名并抓取 favicon */
    url: string
    /** 图标尺寸（px），默认 28 */
    size?: number
    /** 抓取失败时的兜底字符（emoji/文字） */
    fallback?: string
  }>(),
  {
    size: 28,
    fallback: '📰'
  }
)

const dataUrl = ref('')
const loading = ref(false)
const loadFailed = ref(false)

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.max(12, Math.round(props.size * 0.5))}px`
}))

async function load(): Promise<void> {
  if (!props.url) {
    // 无站点 URL（如自定义模板）：直接显示兜底图标
    loadFailed.value = true
    loading.value = false
    return
  }
  if (loadFailed.value) return
  loading.value = true
  try {
    const api = (window as unknown as { electronAPI?: { favicon?: { get(url: string): Promise<any> } } })
      .electronAPI
    const resp = await api?.favicon?.get(props.url)
    if (resp?.success && resp.data?.dataUrl) {
      dataUrl.value = resp.data.dataUrl
      loading.value = false
      return
    }
  } catch (e) {
    console.warn('[FaviconIcon] 获取 favicon 失败:', props.url, e)
  }
  loadFailed.value = true
  loading.value = false
}

function onLoadError(): void {
  dataUrl.value = ''
  loadFailed.value = true
  loading.value = false
}

onMounted(load)

watch(
  () => props.url,
  () => {
    dataUrl.value = ''
    loadFailed.value = false
    load()
  }
)
</script>

<style lang="scss" scoped>
.favicon-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-color);
}

.favicon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.favicon-loading {
  width: 60%;
  height: 60%;
  border-radius: 4px;
  background: var(--fill-color-light);
  animation: favicon-pulse 1.2s ease-in-out infinite;
}

.favicon-fallback {
  line-height: 1;
  color: var(--text-secondary);
}

@keyframes favicon-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
</style>
