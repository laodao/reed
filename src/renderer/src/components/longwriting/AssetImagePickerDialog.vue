<template>
  <el-dialog
    :model-value="visible"
    title="从系统资产选择图片"
    width="780px"
    top="8vh"
    @update:model-value="$emit('update:visible', $event)"
    @open="onOpen"
  >
    <div class="asset-image-picker">
      <div class="picker-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索资产名称"
          clearable
          @keyup.enter="load(1)"
          @clear="load(1)"
        >
          <template #append>
            <el-button @click="load(1)">
              <el-icon><Search /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <div v-loading="loading" class="picker-grid">
        <div
          v-for="asset in assets"
          :key="asset.id"
          class="picker-cell"
          :class="{ selected: selected?.id === asset.id }"
          @click="selected = asset"
        >
          <img :src="previewUrl(asset)" loading="lazy" alt="" />
          <div class="cell-name" :title="asset.name">{{ asset.name }}</div>
          <el-icon v-if="selected?.id === asset.id" class="cell-check">
            <CircleCheckFilled />
          </el-icon>
        </div>
        <el-empty
          v-if="!loading && assets.length === 0"
          :description="keyword ? '没有匹配的图片资产' : '暂无图片资产，可先在资产中心上传'"
          class="picker-empty"
        />
      </div>

      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        class="picker-pagination"
        @current-change="load"
      />
    </div>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :disabled="!selected" @click="confirmSelect">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Search, CircleCheckFilled } from '@element-plus/icons-vue'
import type { AssetRecord } from '../../../../shared/types/asset.types'
import { toImageUrl } from '../../utils/asset-url'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 选中一张图片资产（点确定时） */
  select: [asset: AssetRecord]
}>()

const keyword = ref('')
const page = ref(1)
const pageSize = 24
const total = ref(0)
const loading = ref(false)
const assets = ref<AssetRecord[]>([])
const selected = ref<AssetRecord | null>(null)

function previewUrl(asset: AssetRecord): string {
  if (asset.kind === 'file' && asset.storagePath) return toImageUrl(asset.storagePath)
  if (asset.kind === 'url' && asset.url) return asset.url
  return ''
}

function onOpen() {
  selected.value = null
  keyword.value = ''
  load(1)
}

async function load(targetPage?: number) {
  if (targetPage) page.value = targetPage
  loading.value = true
  try {
    const resp = await window.electronAPI.assets.list({
      category: 'image',
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize
    })
    if (resp.success) {
      assets.value = resp.data?.items ?? []
      total.value = resp.data?.total ?? 0
      // 翻页/搜索后清掉不在当前页的选中项
      if (selected.value && !assets.value.some(a => a.id === selected.value?.id)) {
        selected.value = null
      }
    }
  } finally {
    loading.value = false
  }
}

function confirmSelect() {
  if (!selected.value) return
  emit('select', selected.value)
  emit('update:visible', false)
}
</script>

<style lang="scss" scoped>
.asset-image-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.picker-toolbar {
  display: flex;
}

.picker-grid {
  min-height: 260px;
  max-height: 46vh;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  align-content: start;
}

.picker-cell {
  position: relative;
  border: 2px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: var(--fill-color-lighter);
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--color-primary-light-5);
  }

  &.selected {
    border-color: var(--color-primary);
  }

  img {
    width: 100%;
    height: 100px;
    object-fit: cover;
    display: block;
  }

  .cell-name {
    padding: 6px 8px;
    font-size: 12px;
    color: var(--text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-check {
    position: absolute;
    top: 6px;
    right: 6px;
    color: var(--color-primary);
    background: #fff;
    border-radius: 50%;
    font-size: 18px;
  }
}

.picker-empty {
  grid-column: 1 / -1;
}

.picker-pagination {
  justify-content: flex-end;
}
</style>
