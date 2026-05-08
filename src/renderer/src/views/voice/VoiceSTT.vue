<template>
  <VoiceLayout history-type="stt" sidebar-title="识别历史">
    <SpeechToText />
  </VoiceLayout>
</template>

<script setup lang="ts">
/**
 * 语音转文本独立页（/voice/stt）
 * @module views/voice/VoiceSTT
 *
 * 2026-05-08：从原 Voice.vue 拆出 — 主菜单"语音助手"展开后的子菜单。
 */
import VoiceLayout from './VoiceLayout.vue'
import SpeechToText from '@/components/voice/SpeechToText.vue'
</script>
