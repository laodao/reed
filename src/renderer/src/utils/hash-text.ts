/**
 * 文本指纹（FNV-1a 32 位）
 * @module renderer/utils/hash-text
 *
 * 用途：为"内容是否变过"这类廉价判定提供稳定指纹——例如聊天页判断某条消息
 * 本轮是否还需要探查 mermaid 代码块。**不用于安全场景**（碰撞只导致多做一次
 * 廉价复核，不影响正确性）。
 */

/** 计算文本指纹（同文本必同值；空串返回 0） */
export function hashText(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    // FNV 质数 16777619，用移位乘法避免精度溢出（Math.imul 为 32 位乘法）
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}