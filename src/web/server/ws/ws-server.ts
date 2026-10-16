/**
 * WebSocket 服务
 * @module web/server/ws/ws-server
 * @description 接受 ws://host/events 连接；从 cookie 读 JWT，校验后把客户端
 *              attach 到 WebSocketEventEmitter。后端任意广播事件时仅推送给
 *              当前 ALS userId 对应的所有连接。
 */

import type { Server as HttpServer, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { JWT_COOKIE_NAME, verifyToken } from '../auth/jwt'
import { WebSocketEventEmitter, type WsClient } from '../platform/web-event-emitter'

export function attachWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/events' })
  const emitter = WebSocketEventEmitter.getInstance()

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const token = parseCookie(req.headers.cookie ?? '')[JWT_COOKIE_NAME]
    const payload = token ? verifyToken(token) : null
    if (!payload) {
      ws.close(4401, 'unauthorized')
      return
    }

    const client: WsClient = {
      userId: payload.userId,
      send: (data: string) => ws.send(data),
      isAlive: () => ws.readyState === WebSocket.OPEN,
    }
    emitter.attach(client)

    ws.on('close', () => emitter.detach(client))
    ws.on('error', () => emitter.detach(client))

    // 心跳：客户端可发送 'ping' 字符串，服务端回 'pong'
    ws.on('message', raw => {
      try {
        const msg = raw.toString()
        if (msg === 'ping') ws.send('pong')
      } catch {
        // ignore
      }
    })

    // 通知客户端连接已建立（包含 userId 给前端校验）
    ws.send(JSON.stringify({ channel: '__system__:connected', data: { userId: payload.userId } }))
  })

  return wss
}

function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k) out[k] = decodeURIComponent(rest.join('='))
  }
  return out
}
