<template>
  <VoiceLayout history-type="stt" sidebar-title="识别历史">
    <SpeechToText />
  </VoiceLayout>
</template>

<script setup lang="ts">

// 组件名与路由 name 对齐，供 <keep-alive :include> 匹配（缺失会导致缓存失效、切换重新挂载）
defineOptions({ name: 'VoiceSTT' })
/**
 * 语音转文本独立页（/voice/stt）
 * @module views/voice/VoiceSTT
 *
 * 2026-05-08：从原 Voice.vue 拆出 — 主菜单"语音助手"展开后的子菜单。
 */
import VoiceLayout from './VoiceLayout.vue'
import SpeechToText from '@/components/voice/SpeechToText.vue'
</script>
