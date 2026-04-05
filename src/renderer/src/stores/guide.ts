/**
 * 引导状态管理
 * @module stores/guide
 * @description 管理新手引导的完成状态
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 引导存储键
 */
const STORAGE_KEY = 'guide-completed'

/**
 * 引导 Store
 */
export const useGuideStore = defineStore('guide', () => {
  // 已完成的引导列表
  const completedGuides = ref<Set<string>>(new Set())

  /**
   * 初始化
   */
  function init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const list = JSON.parse(stored) as string[]
        completedGuides.value = new Set(list)
      }
    } catch (error) {
      console.error('加载引导状态失败:', error)
    }
  }

  /**
   * 保存到存储
   */
  function save() {
    try {
      const list = Array.from(completedGuides.value)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch (error) {
      console.error('保存引导状态失败:', error)
    }
  }

  /**
   * 检查是否已完成
   */
  function isCompleted(guideKey: string): boolean {
    return completedGuides.value.has(guideKey)
  }

  /**
   * 标记为已完成
   */
  function markCompleted(guideKey: string): void {
    completedGuides.value.add(guideKey)
    save()
  }

  /**
   * 重置引导状态
   */
  function reset(guideKey?: string): void {
    if (guideKey) {
      completedGuides.value.delete(guideKey)
    } else {
      completedGuides.value.clear()
    }
    save()
  }

  /**
   * 获取所有已完成的引导
   */
  function getCompletedList(): string[] {
    return Array.from(completedGuides.value)
  }

  // 初始化
  init()

  return {
    isCompleted,
    markCompleted,
    reset,
    getCompletedList
  }
})

/**
 * 预定义引导键
 */
export const GuideKeys = {
  // 剧集制作引导
  STORY_TO_VIDEO_EDITOR: 'stv:editor',

  // 其他模块引导
  CHAT_BASIC: 'chat:basic',
  IMAGE_GENERATION: 'image:generation',
  LONG_WRITING: 'longwriting:basic'
} as const