<template>
  <!--
    EntityRefRenderer · 通用 @xxx 实体引用渲染（spec §4.1 + FU5-A2）

    把文本里 @xxx 形式的引用（如"@张三 缓缓走入 @茶馆"）渲染成
    linked_lw / standalone 双色 tag，让用户看到实体来源 + 与资产的强约束。

    用法：
    <EntityRefRenderer
      :text="梗概文字"
      :entities="[{ name: '张三', sourceType: 'linked_lw' }, ...]"
      @click-entity="onEntityClick"
    />

    匹配规则：
    - 用 `@<name>` 形式匹配（name 不含空格、标点）
    - 在 entities 列表里查 name；找到则渲染 tag，否则保留原文（容错）
    - tag 颜色：linked_lw → primary（蓝） / standalone → warning（橙）

    渲染：vnode 直接组装 <el-tag>，不走 v-html，避免 XSS。
  -->
  <span class="entity-ref-renderer">
    <template v-for="(seg, i) in segments" :key="i">
      <el-tag
        v-if="seg.type === 'entity'"
        :type="seg.sourceType === 'linked_lw' ? 'primary' : 'warning'"
        size="small"
        round
        effect="light"
        class="entity-ref-tag"
        @click="onEntityClick(seg)"
      >
        @{{ seg.name }}
      </el-tag>
      <span v-else class="entity-ref-text">{{ seg.text }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  parseEntityRefs,
  type EntityRefMeta,
  type EntitySegment,
  type Segment,
} from './entity-ref-parser'

const props = defineProps<{
  text: string
  entities: EntityRefMeta[]
}>()

const emit = defineEmits<{
  (e: 'click-entity', entity: EntityRefMeta): void
}>()

const segments = computed<Segment[]>(() =>
  parseEntityRefs(props.text ?? '', props.entities ?? []),
)

function onEntityClick(seg: EntitySegment): void {
  emit('click-entity', {
    name: seg.name,
    sourceType: seg.sourceType,
    id: seg.id,
  })
}
</script>

<style scoped>
.entity-ref-renderer {
  display: inline;
  line-height: inherit;
}

.entity-ref-tag {
  margin: 0 2px;
  cursor: pointer;
  vertical-align: baseline;
  user-select: none;
}

.entity-ref-text {
  white-space: pre-wrap;
}
</style>
