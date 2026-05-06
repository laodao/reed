<template>
  <!--
    AssetEditDrawer · 资产编辑右抽屉（FU5-A8 / B2 决策）

    user 5/6 决策 B2：在 ③ 剧本 / ④ 分镜 / ⑤ 画面+音频 / ⑥ 合成 stage 中
    点右侧 sidebar 的资产 → 弹右抽屉编辑，不脱离当前 stage（之前是全屏跳到
    ② 资产 stage 二级编辑页，回来就丢失 stage 状态）。

    ② 资产 stage 内点击仍走全屏 sub-page（主区即资产管理，宽敞编辑更合理），
    本组件只服务 ③④⑤⑥。

    内部按 assetType 装配对应 *AssetEditor —— 复用既有 4 个 editor 组件。
    后续 phase C 如果重写 editor，本组件只换 import 不改外部接口。

    使用：
    <AssetEditDrawer
      v-model="open"
      :asset-type="type"
      :binding-id="id"
      @saved="onSaved"
    />
  -->
  <el-drawer
    v-model="visible"
    direction="rtl"
    :size="drawerSize"
    :destroy-on-close="true"
    :before-close="onBeforeClose"
    :with-header="false"
    class="asset-edit-drawer"
  >
    <CharacterAssetEditor
      v-if="open && assetType === 'character'"
      :binding-id="bindingId"
      @close="close"
      @saved="onSaved"
    />
    <LocationAssetEditor
      v-else-if="open && assetType === 'location'"
      :binding-id="bindingId"
      @close="close"
      @saved="onSaved"
    />
    <ItemAssetEditor
      v-else-if="open && assetType === 'item'"
      :binding-id="bindingId"
      @close="close"
      @saved="onSaved"
    />
    <VoiceAssetEditor
      v-else-if="open && assetType === 'voice'"
      :voice-id="bindingId"
      @close="close"
      @saved="onSaved"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
// FU5-C2 · 切到 V2 角色编辑器（身份块 + 长文同步 banner + 风格锚点 + 显式保存）
import CharacterAssetEditor from '../stage-asset-v2/character/CharacterAssetEditorV2.vue'
// FU5-C3 · 切到 V2 地点编辑器
import LocationAssetEditor from '../stage-asset-v2/location/LocationAssetEditorV2.vue'
import ItemAssetEditor from '../stage-asset/item/ItemAssetEditor.vue'
import VoiceAssetEditor from '../stage-asset/voice/VoiceAssetEditor.vue'

export type AssetEditDrawerType = 'character' | 'location' | 'item' | 'voice'

const props = withDefaults(
  defineProps<{
    /** 抽屉显隐（v-model） */
    open: boolean
    /** 编辑哪类资产 */
    assetType: AssetEditDrawerType | null
    /** binding id（voice 类用 voice id） */
    bindingId: string | null
    /** 抽屉宽度 */
    drawerSize?: string
  }>(),
  {
    drawerSize: '60%',
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const visible = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

function close(): void {
  emit('update:open', false)
}

function onSaved(): void {
  emit('saved')
}

/**
 * before-close 钩子：默认允许关闭。
 * 后续可加"未保存改动确认"——但每个 *AssetEditor 内部已有自己的保存语义，
 * 这里不做拦截，避免双重提示。
 */
function onBeforeClose(done: () => void): void {
  done()
}
</script>

<style scoped>
.asset-edit-drawer :deep(.el-drawer__body) {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
