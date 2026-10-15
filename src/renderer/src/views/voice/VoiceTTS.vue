<template>
  <VoiceLayout history-type="tts" sidebar-title="合成历史">
    <TextToSpeech />
  </VoiceLayout>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'VoiceTTS' })
/**
 * 文本转语音独立页（/voice/tts）
 * @module views/voice/VoiceTTS
 *
 * 2026-05-08：从原 Voice.vue 拆出 — 主菜单"语音助手"展开后的子菜单。
 */
import VoiceLayout from './VoiceLayout.vue'
import TextToSpeech from '@/components/voice/TextToSpeech.vue'
</script>
