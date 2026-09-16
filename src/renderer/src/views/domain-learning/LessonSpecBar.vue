<template>
  <div v-if="spec" class="lesson-spec-bar">
    <!-- 第一行：读者画像 + 学完能做到 + 展开/收起 -->
    <div class="lsb-head">
      <span class="lsb-badge">讲义规格</span>
      <span class="lsb-audience" :title="spec.audience">{{ spec.audience }}</span>
      <span class="lsb-meta">{{ spec.depth }} · 目标 {{ spec.budget.sections }} 区 · 每区 ≤{{ spec.budget.charsPerSection }} 字</span>
      <span class="lsb-toggle" @click="open = !open">{{ open ? '收起' : '展开' }}</span>
    </div>

    <!-- 第二行：区导航（点击跳到该区） -->
    <div v-if="nav.length" class="lsb-nav">
      <span
        v-for="n in nav"
        :key="n.index"
        class="lsb-nav-chip"
        :title="n.job"
        @click="$emit('jump', n.index)"
      >
        <span class="lsb-nav-no">{{ n.no > 0 ? n.no : '·' }}</span>
        <span class="lsb-nav-text">{{ n.title }}</span>
        <span class="lsb-nav-device">{{ n.device }}</span>
      </span>
    </div>

    <!-- 展开区：目标 / 术语 / 记号 / 示例参数 / 视觉计划 -->
    <div v-if="open" class="lsb-detail">
      <div v-if="spec.outcomes?.length" class="lsb-block">
        <span class="lsb-label">学完能做到</span>
        <ul class="lsb-list">
          <li v-for="(o, i) in spec.outcomes" :key="i">{{ o }}</li>
        </ul>
      </div>
      <div v-if="spec.tone" class="lsb-line"><span class="lsb-label">语气</span>{{ spec.tone }}</div>
      <div v-if="spec.glossary?.length" class="lsb-block">
        <span class="lsb-label">术语</span>
        <div class="lsb-chips">
          <el-tooltip v-for="g in spec.glossary" :key="g.term" :content="g.plain" placement="top">
            <span class="lsb-chip">{{ g.term }}</span>
          </el-tooltip>
        </div>
      </div>
      <div v-if="spec.notation?.length" class="lsb-block">
        <span class="lsb-label">记号</span>
        <div class="lsb-chips">
          <el-tooltip
            v-for="n in spec.notation"
            :key="n.symbol"
            :content="`${n.read}${n.example ? `；例：${n.example}` : ''}`"
            placement="top"
          >
            <span class="lsb-chip mono">{{ n.symbol }}</span>
          </el-tooltip>
        </div>
      </div>
      <div v-if="spec.exampleParams?.length" class="lsb-block">
        <span class="lsb-label">示例参数</span>
        <div class="lsb-chips">
          <span v-for="p in spec.exampleParams" :key="p.name" class="lsb-chip">
            {{ p.name }}={{ p.value }}
          </span>
        </div>
      </div>
      <div v-if="spec.visualPlan" class="lsb-line"><span class="lsb-label">视觉计划</span>{{ spec.visualPlan }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">/**
 * 讲义规格条 + 区导航（LessonSpecBar）
 * @module views/domain-learning/LessonSpecBar
 *
 * 背景（2026-09-14 用户反馈「布局单调简陋」）：讲义只有一串章节，读者看不到"这张卡写给谁、
 * 学完能做到什么、一共几节、每节要花多少时间看"。本组件把**已确认的讲义设计规格**
 * （读者画像 / 目标 / 深度篇幅 / 术语与记号 / 示例参数 / 视觉计划）折成一条常驻信息带，
 * 并把区级计划变成**可点击的章节导航**（对应 ppt-master 的 page roster 页面导航思路）。
 *
 * 纪律：只展示已确认规格里的事实——老卡（无 spec）不渲染本条，不猜内容。
 */
import { ref, computed } from 'vue'
import type { DlLessonSpec } from '@shared/types/domain-learning.types'

const props = defineProps<{
  spec?: DlLessonSpec | null
  /** 章节导航（由父级按已渲染的区算好；no=正文序号，index=原 sections 下标） */
  nav?: Array<{ index: number; no: number; title: string; device: string; job: string }>
}>()
defineEmits<{ jump: [index: number] }>()

/** 明细默认收起（规格条常驻但不喧宾夺主） */
const open = ref(false)

const spec = computed(() => props.spec ?? null)
const nav = computed(() => props.nav ?? [])
</script>

<style scoped lang="scss">
.lesson-spec-bar {
  margin-bottom: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--el-color-primary-light-9), transparent 70%);
  overflow: hidden;
}

.lsb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12.5px;

  .lsb-badge {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 8px;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 11px;
  }
  .lsb-audience {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--el-text-color-primary);
  }
  .lsb-meta {
    flex-shrink: 0;
    color: var(--el-text-color-placeholder);
  }
  .lsb-toggle {
    flex-shrink: 0;
    color: var(--el-color-primary);
    cursor: pointer;
    user-select: none;
  }
}

.lsb-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 12px 9px;
}

.lsb-nav-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 3px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
  }

  .lsb-nav-no {
    width: 15px;
    height: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 10.5px;
    font-weight: 700;
  }
  .lsb-nav-device {
    color: var(--el-text-color-placeholder);
    font-size: 11px;
  }
}

.lsb-detail {
  padding: 4px 12px 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}

.lsb-block {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
}
.lsb-line {
  margin-top: 6px;
}
.lsb-label {
  flex-shrink: 0;
  min-width: 60px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.lsb-list {
  margin: 0;
  padding-left: 1.2em;
  list-style: disc;
}
.lsb-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
}
.lsb-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  cursor: default;

  &.mono {
    font-family: var(--el-font-family-mono, monospace);
  }
}
</style>
