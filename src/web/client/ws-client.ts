/**
 * Web 端事件订阅（WebSocket 长连接）
 * @module web/client/ws-client
 * @description 自动连接 /events，按 channel 派发到 listener。
 *              提供 .on(channel, cb) / .off(channel, cb) 接口；与 Electron
 *              侧 ipcRenderer.on/removeListener 对齐。
 */

type Listener = (data: unknown) => void

let baseUrl = ''
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Map<string, Set<Listener>>()
let connecting = false

export function configureWsBase(url: string): void {
  baseUrl = url
}

function buildWsUrl(): string {
  if (baseUrl) {
    return baseUrl.replace(/^http/, 'ws') + '/events'
  }
  // 同源
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/events`
}

export function ensureSocket(): void {
  if (socket && socket.readyState === WebSocket.OPEN) return
  if (connecting) return
  connecting = true
  const url = buildWsUrl()
  if (!url) {
    connecting = false
    return
  }
  try {
    socket = new WebSocket(url)
  } catch {
    connecting = false
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    connecting = false
  }
  socket.onclose = () => {
    socket = null
    connecting = false
    scheduleReconnect()
  }
  socket.onerror = () => {
    // 不立即关闭；让 onclose 触发重连
  }
  socket.onmessage = ev => {
    try {
      const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : null
      if (!msg || typeof msg.channel !== 'string') return
      const set = listeners.get(msg.channel)
      if (set) {
        for (const cb of set) {
          try {
            cb(msg.data)
          } catch (e) {
            console.error('[ws] listener throw on', msg.channel, e)
          }
        }
      }
    } catch (e) {
      console.error('[ws] onmessage parse error', e)
    }
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    ensureSocket()
  }, 2000)
}

export function on(channel: string, cb: Listener): () => void {
  let set = listeners.get(channel)
  if (!set) {
    set = new Set()
    listeners.set(channel, set)
  }
  set.add(cb)
  ensureSocket()
  return () => off(channel, cb)
}

export function off(channel: string, cb: Listener): void {
  const set = listeners.get(channel)
  if (!set) return
  set.delete(cb)
  if (set.size === 0) listeners.delete(channel)
}
