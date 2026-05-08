<template>
  <!--
    StageMainHeader · 统一 stage 主区域头部（FU5-A3）

    所有 stage view（① 内容 / ② 资产 / ③ 剧本 / ④ 分镜 / ⑤ 画面+音频 / ⑥ 合成）
    顶部都用这个组件，避免每个 stage 自己写 H3 + 副标题 + actions 布局，导致
    视觉密度 / 间距 / 副标题字号不一致。

    原型对照：
    - main-title 22px 加粗
    - main-subtitle 13px 次要色（含聚合摘要：N 场景 · M 分镜 · 累计 P 秒）
    - 右侧 actions 容器，由 caller 用 #actions slot 注入按钮组
  -->
  <header class="stage-main-header">
    <div class="title-block">
      <h2 class="main-title">
        <slot name="title">{{ title }}</slot>
      </h2>
      <span v-if="$slots.subtitle || subtitle" class="main-subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </span>
    </div>
    <div v-if="$slots.actions" class="actions-block">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  /** 主标题，可被 #title slot 覆盖 */
  title?: string
  /** 副标题（聚合摘要），可被 #subtitle slot 覆盖 */
  subtitle?: string
}>()
</script>

<style scoped>
.stage-main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  min-height: 36px;
}

.title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.main-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
  flex-shrink: 0;
}

.main-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.actions-block {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
