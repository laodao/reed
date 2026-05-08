<template>
  <!--
    声音复刻独立页（/voice/clone）
    无 sidebar — 主区直接是 VoiceCloneTab（已自带列表 + 新建按钮 + 试听 / 删除）。
  -->
  <div class="voice-clone-page">
    <VoiceCloneTab />
  </div>
</template>

<script setup lang="ts">
/**
 * 声音复刻独立页
 * @module views/voice/VoiceClone
 *
 * 2026-05-08：从原 Voice.vue 拆出 — 主菜单"语音助手"展开后的子菜单。
 * 与 TTS / STT 不同 —— 复刻不需要历史侧栏，所以不走 VoiceLayout shell。
 */
import VoiceCloneTab from '@/components/voice/VoiceCloneTab.vue'
</script>

<style scoped>
.voice-clone-page {
  height: 100%;
  width: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}
</style>
