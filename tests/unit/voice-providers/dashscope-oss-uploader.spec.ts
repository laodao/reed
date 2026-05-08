/**
 * DashScopeOssUploader 单元测试
 * @see src/core/voice-providers/dashscope-oss-uploader.ts
 *
 * 覆盖：
 * - 成功路径：GET getPolicy → POST OSS multipart → 返回 oss:// URL
 * - 错误路径：apiKey 缺失 / 文件不存在 / getPolicy 4xx / 响应缺字段 / OSS 上传 4xx
 * - 关键 payload 验证：multipart 字段全 + key 拼装 + Authorization 头
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  DashScopeOssUploader,
  DashScopeUploadError,
} from '@core/voice-providers/dashscope-oss-uploader'

/** 写一份临时音频文件供上传，测试结束清理 */
function writeTempAudio(content: Buffer = Buffer.from('fake-wav')): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `dso-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
  )
  fs.writeFileSync(tmpFile, content)
  return tmpFile
}

/** 构造一个标准的 getPolicy 成功响应 */
function policyResponseOk() {
  return {
    request_id: 'req-xxx',
    data: {
      policy: 'eyJlxxx',
      signature: 'Sm/tv7DcZu==',
      upload_dir: 'dashscope-instant/abc/2026-05-07/uuid-1',
      upload_host: 'https://dashscope-file-mgr.oss-cn-beijing.aliyuncs.com',
      oss_access_key_id: 'LTAm5xxx',
      x_oss_object_acl: 'private',
      x_oss_forbid_overwrite: 'true',
      expire_in_seconds: 300,
    },
  }
}

describe('DashScopeOssUploader', () => {
  const tmpFiles: string[] = []
  afterEach(() => {
    while (tmpFiles.length) {
      const f = tmpFiles.pop()!
      try {
        fs.unlinkSync(f)
      } catch {
        /* 忽略 */
      }
    }
  })

  describe('constructor', () => {
    it('apiKey 缺失时抛错', () => {
      expect(() => new DashScopeOssUploader('')).toThrow(/apiKey is required/)
      expect(() => new DashScopeOssUploader('   ')).toThrow(/apiKey is required/)
    })
  })

  describe('uploadFile · 成功路径', () => {
    it('调用 getPolicy + OSS POST 后返回 oss:// URL', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fileName = path.basename(tmp)

      let policyCallUrl = ''
      let policyHeaders: any = null
      let ossCallUrl = ''
      let ossBody: FormData | null = null

      const fakeFetch = async (input: any, init?: any): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.url
        if (url.includes('/uploads?action=getPolicy')) {
          policyCallUrl = url
          policyHeaders = init?.headers ?? {}
          return new Response(JSON.stringify(policyResponseOk()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        // OSS POST
        ossCallUrl = url
        ossBody = init?.body as FormData
        return new Response('', { status: 200 })
      }

      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })

      const ossUrl = await uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus')

      // 1. URL 拼装正确
      expect(ossUrl).toBe(
        `oss://dashscope-instant/abc/2026-05-07/uuid-1/${fileName}`,
      )

      // 2. policy 请求 URL + 鉴权头
      expect(policyCallUrl).toContain('action=getPolicy')
      expect(policyCallUrl).toContain('model=cosyvoice-v3.5-plus')
      expect(policyHeaders).toMatchObject({
        Authorization: 'Bearer sk-test',
      })

      // 3. OSS POST 命中 upload_host
      expect(ossCallUrl).toBe(policyResponseOk().data.upload_host)

      // 4. multipart 字段齐
      expect(ossBody).toBeInstanceOf(FormData)
      const fd = ossBody as unknown as FormData
      expect(fd.get('OSSAccessKeyId')).toBe('LTAm5xxx')
      expect(fd.get('Signature')).toBe('Sm/tv7DcZu==')
      expect(fd.get('policy')).toBe('eyJlxxx')
      expect(fd.get('x-oss-object-acl')).toBe('private')
      expect(fd.get('x-oss-forbid-overwrite')).toBe('true')
      expect(fd.get('success_action_status')).toBe('200')
      expect(fd.get('key')).toBe(
        `dashscope-instant/abc/2026-05-07/uuid-1/${fileName}`,
      )
      // file 是 Blob/File；存在即可
      expect(fd.get('file')).toBeTruthy()
    })

    it('OSS 返回 204 也视为成功（success_action_status 缺省时）', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (input: any): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.url
        if (url.includes('action=getPolicy')) {
          return new Response(JSON.stringify(policyResponseOk()), {
            status: 200,
          })
        }
        // 204 No Content 必须 body=null（fetch Response 构造器约束）
        return new Response(null, { status: 204 })
      }
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      const ossUrl = await uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus')
      expect(ossUrl).toMatch(/^oss:\/\/dashscope-instant\//)
    })
  })

  describe('uploadFile · 错误路径', () => {
    it('文件不存在抛 DashScopeUploadError stage=fs', async () => {
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: (async () => new Response('', { status: 200 })) as any,
      })
      await expect(
        uploader.uploadFile('/path/does/not/exist.wav', 'cosyvoice-v3.5-plus'),
      ).rejects.toMatchObject({
        name: 'DashScopeUploadError',
        stage: 'fs',
      })
    })

    it('filePath 为空字符串抛错', async () => {
      const uploader = new DashScopeOssUploader('sk-test')
      await expect(uploader.uploadFile('', 'm')).rejects.toMatchObject({
        stage: 'fs',
      })
    })

    it('model 为空字符串抛错', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const uploader = new DashScopeOssUploader('sk-test')
      await expect(uploader.uploadFile(tmp, '')).rejects.toMatchObject({
        stage: 'policy',
      })
    })

    it('getPolicy 返回 401 抛 stage=policy + statusCode', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (): Promise<Response> =>
        new Response('Unauthorized', { status: 401 })
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      await expect(
        uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus'),
      ).rejects.toMatchObject({
        name: 'DashScopeUploadError',
        stage: 'policy',
        statusCode: 401,
      })
    })

    it('getPolicy 响应缺 data.upload_host 抛 stage=policy', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            request_id: 'req',
            // data 缺 upload_host
            data: { policy: 'p', signature: 's' },
          }),
          { status: 200 },
        )
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      await expect(
        uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus'),
      ).rejects.toMatchObject({
        stage: 'policy',
      })
    })

    it('getPolicy 响应不是 JSON 抛 stage=policy', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (): Promise<Response> =>
        new Response('<html>5xx</html>', { status: 200 })
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      await expect(
        uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus'),
      ).rejects.toMatchObject({
        stage: 'policy',
      })
    })

    it('getPolicy 网络错误抛 stage=policy（无 statusCode）', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (): Promise<Response> => {
        throw new Error('ECONNRESET')
      }
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      const err = await uploader
        .uploadFile(tmp, 'cosyvoice-v3.5-plus')
        .catch((e) => e)
      expect(err).toBeInstanceOf(DashScopeUploadError)
      expect((err as DashScopeUploadError).stage).toBe('policy')
      expect((err as DashScopeUploadError).statusCode).toBeUndefined()
    })

    it('OSS 上传 4xx 抛 stage=oss-upload + statusCode', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (input: any): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.url
        if (url.includes('action=getPolicy')) {
          return new Response(JSON.stringify(policyResponseOk()), {
            status: 200,
          })
        }
        return new Response('SignatureDoesNotMatch', { status: 403 })
      }
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      await expect(
        uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus'),
      ).rejects.toMatchObject({
        name: 'DashScopeUploadError',
        stage: 'oss-upload',
        statusCode: 403,
      })
    })

    it('OSS 上传网络错误抛 stage=oss-upload', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      const fakeFetch = async (input: any): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.url
        if (url.includes('action=getPolicy')) {
          return new Response(JSON.stringify(policyResponseOk()), {
            status: 200,
          })
        }
        throw new Error('ETIMEDOUT')
      }
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
      })
      await expect(
        uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus'),
      ).rejects.toMatchObject({
        stage: 'oss-upload',
      })
    })
  })

  describe('uploadFile · 自定义 baseUrl', () => {
    it('支持指向国际端点', async () => {
      const tmp = writeTempAudio()
      tmpFiles.push(tmp)
      let policyUrlSeen = ''
      const fakeFetch = async (input: any): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.url
        if (url.includes('action=getPolicy')) {
          policyUrlSeen = url
          return new Response(JSON.stringify(policyResponseOk()), {
            status: 200,
          })
        }
        return new Response('', { status: 200 })
      }
      const uploader = new DashScopeOssUploader('sk-test', {
        fetchImpl: fakeFetch as typeof fetch,
        baseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1',
      })
      await uploader.uploadFile(tmp, 'cosyvoice-v3.5-plus')
      expect(policyUrlSeen).toContain(
        'https://dashscope-intl.aliyuncs.com/api/v1/uploads',
      )
    })
  })
})
