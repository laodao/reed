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

function resolveEntry(namespace: string, method: string): ChannelEntry & { channel: string } {
  const key = `${namespace}.${method}`
  const override = CHANNEL_OVERRIDES[key]
  const channel = override?.channel ?? `${camelToKebab(namespace)}:${camelToKebab(method)}`
  return {
    channel,
    wrap: override?.wrap,
    eventChannel: override?.eventChannel,
    legacyEventArg: override?.legacyEventArg,
  }
}

/**
 * 创建一个命名空间代理：electronAPI.<ns>.<method>(args) → rpcInvoke(channel, ...args)
 *                     electronAPI.<ns>.on<Event>(cb)    → wsOn(channel, cb)
 */
function createNamespaceProxy(namespace: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (typeof prop !== 'string') return undefined

        // onXxx / onYyyChanged：订阅事件
        // 支持两种签名：
        //   1) onEvent(cb)              — 静态 channel
        //   2) onEvent(arg1, arg2, cb)  — 动态 channel（需 eventChannel 配置）
        if (prop.startsWith('on') && prop.length > 2 && prop[2] === prop[2].toUpperCase()) {
          return (...args: unknown[]) => {
            const entry = resolveEntry(namespace, prop)
            const cb = args[args.length - 1] as (...cbArgs: unknown[]) => void
            if (typeof cb !== 'function') {
              console.warn(
                `[bridge] ${namespace}.${prop} 调用缺少回调函数（最后一个参数）`,
              )
              return () => {}
            }
            const channel = entry.eventChannel
              ? entry.eventChannel(...args.slice(0, -1))
              : entry.channel
            // 部分 preload 把 IpcRendererEvent 透传给业务回调（chat.onStream /
            // image.onGenerationEvent），渲染端按 (event, data) 解构。Web 这边没
            // 真实 event，模拟成 cb(undefined, data) 对齐契约。
            const wrapped = entry.legacyEventArg
              ? (data: unknown) => cb(undefined, data)
              : cb
            return wsOn(channel, wrapped)
          }
        }

        return (...args: unknown[]) => {
          const entry = resolveEntry(namespace, prop)
          const finalArgs = entry.wrap ? entry.wrap(...args) : args
          return rpcInvoke(entry.channel, ...finalArgs)
        }
      },
    },
  )
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
