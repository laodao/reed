/**
 * Web 端 electronAPI 桥接
 * @module web/client/bridge
 * @description 在浏览器端用 Proxy 动态构造 window.electronAPI，与 preload
 *              暴露的对象保持调用契约一致。
 *
 *              注意：preload 暴露的 API 是嵌套对象（如 electronAPI.dialog.list()），
 *              该 Proxy 假定每个调用最终对应一个 IPC channel：
 *              - 形式 1：直接的 method 调用 → channel = `<namespace>:<methodKebab>`
 *              - 形式 2：监听器（onXxx / onChanged）→ channel = `<namespace>:<eventKebab>`，返回 unsubscribe
 *
 *              Channel 名称完全沿用 src/preload/index.ts 中定义的 IPC_CHANNELS，
 *              如 `dialog:list`、`message:create`、`chat:stream` 等。
 *
 *              这要求各 namespace 提供"channel 映射表"（preload 显式声明）。
 *              这里采取通用策略：约定 method 名转 kebab-case 后拼接，再由
 *              channel-overrides 表覆盖特殊命名。
 */

import { rpcInvoke } from './http-rpc'
import { on as wsOn, configureWsBase } from './ws-client'
import { CHANNEL_OVERRIDES, type ChannelEntry } from './channel-map'

function camelToKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * 把 dot path（如 'episodeProduction.asset.character.list'）拆成 namespace + method 用于 channel-map 查找。
 * 兼容旧两段式（'episodeProduction.listProjects'）和新多段式（'episodeProduction.asset.character.list'）。
 */
function resolveEntryByPath(dotPath: string): ChannelEntry & { channel: string } {
  // 优先精确查找完整 dot path（channel-map 的 key 已是完整 dot 形式）
  const override = CHANNEL_OVERRIDES[dotPath]
  if (override?.channel) {
    return {
      channel: override.channel,
      wrap: override.wrap,
      eventChannel: override.eventChannel,
      legacyEventArg: override.legacyEventArg,
    }
  }
  // 兜底：取 dot path 最后一段为 method，前面拼成 namespace；
  // 用 camelToKebab 拼默认 channel。这条路径只有 channel-map 没覆盖时走到。
  const lastDotIdx = dotPath.lastIndexOf('.')
  const namespace = lastDotIdx >= 0 ? dotPath.slice(0, lastDotIdx) : ''
  const method = lastDotIdx >= 0 ? dotPath.slice(lastDotIdx + 1) : dotPath
  return {
    channel: namespace
      ? `${camelToKebab(namespace.replace(/\./g, '-'))}:${camelToKebab(method)}`
      : camelToKebab(method),
  }
}

/**
 * 创建支持任意层级嵌套的 callable namespace proxy：
 *   electronAPI.episodeProduction.listProjects(args)                  → rpcInvoke(channel, ...args) — 两层嵌套
 *   electronAPI.episodeProduction.asset.character.list(projectId)     → rpcInvoke(channel, ...args) — 多层嵌套
 *   electronAPI.<ns>.on<Event>(cb)                                    → wsOn(channel, cb)
 *
 * 实现要点：
 * - 返回 callable Proxy（target 是函数）—— 支持继续 .property 访问 + 直接调用
 * - prefix 用 dot path 累积；调用时按完整 prefix 查 channel-map
 * - 任意一层都可继续访问 sub-namespace 也可直接调用，不需提前知道是哪种
 */
function createNamespaceProxy(prefix: string): unknown {
  const target = function () {} as any
  return new Proxy(target, {
    get(_t, prop: string) {
      if (typeof prop !== 'string') return undefined

      // onXxx / onYyyChanged：订阅事件（仅在 prop 是 onXxx 形式时识别）
      if (prop.startsWith('on') && prop.length > 2 && prop[2] === prop[2].toUpperCase()) {
        return (...args: unknown[]) => {
          const fullPath = `${prefix}.${prop}`
          const entry = resolveEntryByPath(fullPath)
          const cb = args[args.length - 1] as (...cbArgs: unknown[]) => void
          if (typeof cb !== 'function') {
            console.warn(`[bridge] ${fullPath} 调用缺少回调函数（最后一个参数）`)
            return () => {}
          }
          const channel = entry.eventChannel
            ? entry.eventChannel(...args.slice(0, -1))
            : entry.channel
          const wrapped = entry.legacyEventArg
            ? (data: unknown) => cb(undefined, data)
            : cb
          return wsOn(channel, wrapped)
        }
      }

      // 否则继续累积 prefix，返回又一层 callable proxy
      return createNamespaceProxy(`${prefix}.${prop}`)
    },
    apply(_t, _thisArg, args: unknown[]) {
      // 直接调用：按当前 prefix 查 channel-map
      const entry = resolveEntryByPath(prefix)
      const finalArgs = entry.wrap ? entry.wrap(...args) : args
      return rpcInvoke(entry.channel, ...finalArgs)
    },
  })
}

/**
 * 顶级事件 channel 映射（preload 顶级 onXxx 直接调 ipcRenderer.on）
 */
const TOP_LEVEL_EVENT_CHANNELS: Record<string, string> = {
  onError: 'error:show',
  onAutoSaveStatus: 'autosave:status',
  onShortcut: 'shortcut:triggered',
}

/**
 * 安装到 window.electronAPI；同时注册 WebSocket 基址。
 */
export function installWebElectronApi(opts?: { wsBase?: string }): void {
  if (opts?.wsBase) configureWsBase(opts.wsBase)
  if (typeof window === 'undefined') return

  // 与 preload 对齐的所有命名空间——只在调用时按需创建
  const root = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (typeof prop !== 'string') return undefined

        // 顶级 onXxx 事件订阅器
        if (TOP_LEVEL_EVENT_CHANNELS[prop]) {
          const channel = TOP_LEVEL_EVENT_CHANNELS[prop]
          // preload 形态：(callback) => unsubscribe
          // wsOn 也返回 unsubscribe，签名兼容
          return (cb: (event: unknown, data: unknown) => void) => {
            // preload 的 callback 收 (event, data) 两个参数；ws 推送只有 data
            return wsOn(channel, (data: unknown) => cb({}, data))
          }
        }

        // 通用 onXxx（顶级未在表中的也允许，比如未来新增）：当作没有命名空间的事件
        if (prop.startsWith('on') && prop.length > 2 && prop[2] === prop[2].toUpperCase()) {
          return (cb: (data: unknown) => void) => wsOn(camelToKebab(prop.slice(2)), cb)
        }

        // 否则视为命名空间
        return createNamespaceProxy(prop)
      },
    },
  )
  ;(window as any).electronAPI = root
}
