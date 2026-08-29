/**
 * 响应体限长读取（评审 #100）
 * @module core/modules/workflow/nodes/response-body
 * @description 抓取/报告类出向请求的响应体统一经此读取：恶意或超大响应
 *              全量入内存可 OOM。有 content-length 头在读流前直接拒绝；
 *              无声明头时流式累计字节，超限即中止并取消连接。
 *              默认上限 50MB，与资产存储 downloadFromUrl 上限对齐。
 */

/** 默认响应体字节上限：50MB */
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024

/**
 * 读取响应体为 Buffer，强制字节上限。
 * @param res fetch 响应（兼容仅实现 text() 的 Response-like 对象：退化为整读后仍校验大小）
 * @param limitBytes 字节上限（缺省 MAX_RESPONSE_BYTES）
 * @throws Error 超限时抛出，并尝试取消底层连接
 */
export async function readBodyWithLimit(res: Response, limitBytes: number = MAX_RESPONSE_BYTES): Promise<Buffer> {
  const headers = res.headers as Headers | undefined
  const declared = headers && typeof headers.get === 'function' ? Number(headers.get('content-length') ?? '') : NaN
  if (Number.isFinite(declared) && declared > limitBytes) {
    await safeCancel(res)
    throw new Error(`响应体超出上限：content-length ${declared} 字节 > ${limitBytes} 字节`)
  }
  const body = res.body as ReadableStream<Uint8Array> | null | undefined
  if (!body || typeof body.getReader !== 'function') {
    // Response-like（测试 mock / 内部封装无流式 body）：整读，读后校验
    const text = await res.text()
    const size = Buffer.byteLength(text)
    if (size > limitBytes) {
      await safeCancel(res)
      throw new Error(`响应体超出上限：已读 ${size} 字节 > ${limitBytes} 字节`)
    }
    return Buffer.from(text, 'utf8')
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limitBytes) {
        throw new Error(`响应体超出上限：已读 ${total} 字节 > ${limitBytes} 字节`)
      }
      chunks.push(value)
    }
  } catch (e) {
    await safeCancel(reader)
    throw e
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

/** 读取响应体为 UTF-8 文本，强制字节上限（内部走 readBodyWithLimit） */
export async function readTextWithLimit(res: Response, limitBytes?: number): Promise<string> {
  const buf = await readBodyWithLimit(res, limitBytes)
  return buf.toString('utf8')
}

async function safeCancel(target: Response | ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    if (target instanceof Response) {
      const body = target.body as ReadableStream<Uint8Array> | null
      if (body && typeof body.cancel === 'function') await body.cancel()
    } else {
      await target.cancel()
    }
  } catch {
    /* 连接可能已关闭，忽略 */
  }
}
