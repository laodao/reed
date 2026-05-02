/**
 * episode-production · 合成相关 · IPC handler（预留，当前合成逻辑在 render/video.handler 中）
 * @module electron/ipc/handlers/episode-production/compose.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

/**
 * 注册合成相关 IPC 处理器（当前阶段为空占位，后续扩展时在此添加）
 */
export function registerComposeHandlers(): void {
  // 当前阶段合成相关逻辑已在 render/video.handler 中注册，此处预留扩展点
}
