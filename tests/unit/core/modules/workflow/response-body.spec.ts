/**
 * 响应体限长读取测试（评审 #100）
 * @description 超大/恶意响应全量入内存可 OOM：content-length 超限直接拒绝；
 *              无 content-length 时流式累计，超限即中止。text 工具函数同步覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readBodyWithLimit, readTextWithLimit, MAX_RESPONSE_BYTES } from '@core/modules/workflow/nodes/response-body'

function resWith(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers })
}

describe('response-body 限长读取', () => {
  it('正常小响应完整读取', async () => {
    const res = resWith('hello')
    const buf = await readBodyWithLimit(res)
    expect(buf.toString('utf8')).toBe('hello')
  })

  it('content-length 超限 → 直接拒绝不发读流', async () => {
    const res = resWith('x', { 'content-length': String(MAX_RESPONSE_BYTES + 1) })
    // body 与声明不一致没关系——声明超限就应在读取前拒绝
    await expect(readBodyWithLimit(res)).rejects.toThrow('超出')
  })

  it('无 content-length，流式累计超限 → 中止并报错', async () => {
    const big = 'a'.repeat(1024)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 远超 64KB 测试上限的块
        for (let i = 0; i < 200; i++) controller.enqueue(new TextEncoder().encode(big))
        controller.close()
      },
    })
    const res = new Response(stream, { status: 200 })
    await expect(readBodyWithLimit(res, 64 * 1024)).rejects.toThrow('超出')
  })

  it('流式累计未超限 → 完整拼合', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 4; i++) controller.enqueue(new TextEncoder().encode('ab'))
        controller.close()
      },
    })
    const res = new Response(stream, { status: 200 })
    const buf = await readBodyWithLimit(res, 64 * 1024)
    expect(buf.toString('utf8')).toBe('abababab')
  })

  it('readTextWithLimit: 正常文本', async () => {
    const text = await readTextWithLimit(resWith('你好'), 64 * 1024)
    expect(text).toBe('你好')
  })

  it('readTextWithLimit: 超限抛错', async () => {
    await expect(readTextWithLimit(resWith('x', { 'content-length': String(MAX_RESPONSE_BYTES + 1) }), undefined)).rejects.toThrow('超出')
  })
})
