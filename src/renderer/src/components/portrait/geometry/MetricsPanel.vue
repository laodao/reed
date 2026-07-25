<template>
  <div class="metrics-panel">
    <div class="mp-title">面容指标</div>
    <div class="mp-grid">
      <div class="mp-row mp-head">
        <span>指标</span><span>像素</span><span>占比</span>
      </div>
      <div class="mp-row">
        <span>上庭 <i class="est">估计</i></span>
        <span>{{ metrics.upperThird.px }}</span>
        <span>{{ metrics.upperThird.pct }}%</span>
      </div>
      <div class="mp-row" :class="{ changed: changedKeys.has('mid') }">
        <span>中庭</span>
        <span>{{ metrics.midThird.px }}</span>
        <span>{{ metrics.midThird.pct }}%</span>
      </div>
      <div class="mp-row" :class="{ changed: changedKeys.has('lower') }">
        <span>下庭</span>
        <span>{{ metrics.lowerThird.px }}</span>
        <span>{{ metrics.lowerThird.pct }}%</span>
      </div>
      <div class="mp-row">
        <span>三庭比</span>
        <span class="mp-wide">{{ metrics.thirdsRatio }}</span>
      </div>
      <div class="mp-row">
        <span>眼距比</span>
        <span class="mp-wide">{{ metrics.eyeSpacingRatio }}</span>
      </div>
      <div class="mp-row">
        <span>鼻翼宽比</span>
        <span class="mp-wide">{{ metrics.noseWidthRatio }}</span>
      </div>
      <div class="mp-row">
        <span>面长宽比</span>
        <span class="mp-wide">{{ metrics.faceLengthWidthRatio }}</span>
      </div>
      <div class="mp-row">
        <span>下颌角宽比</span>
        <span class="mp-wide">{{ metrics.jawWidthRatio }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FaceMetrics } from './faceMetrics'

/**
 * 面容指标面板（spec §F2）：
 * 三庭（上庭标"估计"）/五眼/脸型比例表格；
 * changedKeys 用于 AI 生成前后对比时高亮变化项。
 */
withDefaults(defineProps<{
  metrics: FaceMetrics
  changedKeys?: Set<string>
}>(), {
  changedKeys: () => new Set<string>(),
})
</script>

<style lang="scss" scoped>
.metrics-panel {
  background: var(--fill-color-light);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.mp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.mp-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mp-row {
  display: grid;
  grid-template-columns: 1fr 64px 56px;
  font-size: 12.5px;
  color: var(--text-regular);

  &.mp-head {
    color: var(--text-placeholder);
    font-size: 11px;
  }

  &.changed {
    color: var(--color-primary);
    font-weight: 600;
  }

  .est {
    font-style: normal;
    font-size: 10px;
    color: var(--color-warning);
    background: var(--color-warning-light-9, #fdf6ec);
    padding: 0 4px;
    border-radius: var(--radius-sm);
    margin-left: 2px;
  }

  .mp-wide {
    grid-column: 2 / 4;
    font-feature-settings: 'tnum';
  }
}
</style>
