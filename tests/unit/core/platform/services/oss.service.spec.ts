/**
 * OSS 服务单测：endpoint 归一化（无协议 / 带协议 / 已是三级域名 / 自定义域名）、
 * 上传 URL 与签名头、测试连接探针（成功 / 失败错误解析）。
 * @module tests/unit/core/platform/services/oss.service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { OSSService } from '@core/platform/services/oss.service'

// ---- mocks ----
const repoMock = {
  getById: vi.fn(),
  getDefault: vi.fn(),
}
vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({ ossConfigs: repoMock }),
}))
vi.mock('@core/interfaces/storage.interface', () => ({
  getSecureStorage: () => ({
    isInitialized: () => true,
    initialize: async () => {},
    decrypt: () => 'test-secret-123',
    encrypt: (d: string) => `enc:${d}`,
  }),
}))

/** 构造 OSS 返回 */
function ossResponse(status: number, xmlBody?: string): any {
  return { ok: status >= 200 && status < 300, status, text: async () => xmlBody ?? '' }
}

const aliyunConfig: any = {
  id: 'oss_1',
  name: '阿里云',
  provider: 'aliyun',
  accessKeyId: 'LTAI-test',
  accessKeySecret: 'enc:secret',
  region: 'cn-chengdu',
  bucket: 'the-bot',
  endpoint: 'oss-cn-chengdu.aliyuncs.com', // 用户常见填法：不带协议
  customDomain: undefined,
  pathPrefix: 'images',
  isEnabled: true,
  isDefault: true,
}

describe('OSSService', () => {
  const fetchMock = vi.fn()
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oss-svc-test-'))
    vi.stubGlobal('fetch', fetchMock)
    repoMock.getById.mockReset()
    repoMock.getDefault.mockReset()
    repoMock.getById.mockResolvedValue(aliyunConfig)
    ;(OSSService as any).instance = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    fs.rmSync(tempDir, { recursive: true, force: true })
    ;(OSSService as any).instance = null
  })

  function makeLocalFile(name = 'a.png'): string {
    const p = path.join(tempDir, name)
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    return p
  }

  it('上传：endpoint 不带协议 → 自动补协议并用 bucket 三级域名寻址', async () => {
    fetchMock.mockResolvedValue(ossResponse(200))
    const svc = OSSService.getInstance()
    const r = await svc.uploadFile({ configId: 'oss_1', localPath: makeLocalFile() })
    expect(r.success).toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as [string, any]
    expect(url.startsWith('https://the-bot.oss-cn-chengdu.aliyuncs.com/images/')).toBe(true)
    expect(init.method).toBe('PUT')
    expect(init.headers['Authorization']).toMatch(/^OSS LTAI-test:/)
    expect(init.headers['Content-Type']).toBe('image/png')
    expect(init.headers['Date']).toBeTruthy()
    // 成功返回上传 URL（未配 customDomain → 三级域名地址）
    expect(r.url!.startsWith('https://the-bot.oss-cn-chengdu.aliyuncs.com/')).toBe(true)
  })

  it('上传：endpoint 已带 https:// 协议 → 不重复加协议', async () => {
    repoMock.getById.mockResolvedValue({
      ...aliyunConfig,
      endpoint: 'https://oss-cn-chengdu.aliyuncs.com',
    })
    fetchMock.mockResolvedValue(ossResponse(200))
    const svc = OSSService.getInstance()
    const r = await svc.uploadFile({ configId: 'oss_1', localPath: makeLocalFile() })
    expect(r.success).toBe(true)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toMatch(/^https:\/\/the-bot\.oss-cn-chengdu\.aliyuncs\.com\//)
    expect(url).not.toContain('https://https://')
  })

  it('上传：endpoint 本身已是 bucket 三级域名 → 不重复加 bucket 前缀', async () => {
    repoMock.getById.mockResolvedValue({
      ...aliyunConfig,
      endpoint: 'the-bot.oss-cn-chengdu.aliyuncs.com',
    })
    fetchMock.mockResolvedValue(ossResponse(200))
    const svc = OSSService.getInstance()
    const r = await svc.uploadFile({ configId: 'oss_1', localPath: makeLocalFile() })
    expect(r.success).toBe(true)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url.startsWith('https://the-bot.oss-cn-chengdu.aliyuncs.com/images/')).toBe(true)
    expect(url).not.toContain('the-bot.the-bot.')
  })

  it('上传：endpoint 留空 → 由 region 生成地域域名并加 bucket', async () => {
    repoMock.getById.mockResolvedValue({ ...aliyunConfig, endpoint: undefined })
    fetchMock.mockResolvedValue(ossResponse(200))
    const svc = OSSService.getInstance()
    const r = await svc.uploadFile({ configId: 'oss_1', localPath: makeLocalFile() })
    expect(r.success).toBe(true)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url.startsWith('https://the-bot.oss-cn-chengdu.aliyuncs.com/')).toBe(true)
  })

  it('上传：endpoint 是自定义域名（非官方后缀）→ 不加 bucket 前缀', async () => {
    repoMock.getById.mockResolvedValue({
      ...aliyunConfig,
      endpoint: 'https://cdn.example.com', // 自定义 CNAME
      customDomain: 'cdn.example.com',
    })
    fetchMock.mockResolvedValue(ossResponse(200))
    const svc = OSSService.getInstance()
    const r = await svc.uploadFile({ configId: 'oss_1', localPath: makeLocalFile() })
    expect(r.success).toBe(true)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url.startsWith('https://cdn.example.com/')).toBe(true)
    // 自定义域名优先作为公网 URL
    expect(r.url!.startsWith('https://cdn.example.com/')).toBe(true)
  })

  it('上传：OSS 返回 403 SignatureDoesNotMatch → 给出可读错误', async () => {
    fetchMock.mockResolvedValue(
      ossResponse(403, '<Error><Code>SignatureDoesNotMatch</Code><Message>bad</Message></Error>')
    )
    const svc = OSSService.getInstance()
    const r = await svc.uploadFile({ configId: 'oss_1', localPath: makeLocalFile() })
    expect(r.success).toBe(false)
    expect(r.error).toContain('AccessKey')
  })

  it('测试连接：PUT 探针成功 + DELETE 清理 → 成功', async () => {
    fetchMock
      .mockResolvedValueOnce(ossResponse(200)) // PUT
      .mockResolvedValueOnce(ossResponse(204)) // DELETE
    const svc = OSSService.getInstance()
    const r = await svc.testConnection('oss_1')
    expect(r.success).toBe(true)
    expect(r.message).toContain('连接成功')
    // 探针路径以 .connection-test 开头
    const putUrl = fetchMock.mock.calls[0][0] as string
    expect(putUrl).toContain('.connection-test/')
  })

  it('测试连接：PUT 失败（403）→ 解析错误码返回失败', async () => {
    fetchMock.mockResolvedValue(
      ossResponse(403, '<Error><Code>AccessDenied</Code><Message>denied</Message></Error>')
    )
    const svc = OSSService.getInstance()
    const r = await svc.testConnection('oss_1')
    expect(r.success).toBe(false)
    expect(r.message).toContain('连接失败')
    expect(r.message).toContain('无访问权限')
  })

  it('测试连接：fetch 抛网络异常 → 返回失败且带原因', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    const svc = OSSService.getInstance()
    const r = await svc.testConnection('oss_1')
    expect(r.success).toBe(false)
    expect(r.message).toContain('连接失败')
  })
})
