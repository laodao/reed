/**
 * 安全存储回退链测试
 *
 * 真机 bug：加密后端随运行环境切换（有无密钥环）。库里同时存在
 * safeStorage 密文（v11）与旧环境写入的自定义 AES 密文（iv:tag:payload）——
 * 旧实现只试当前激活方式，另一环境的存量密文永久报
 * 「Invalid encrypted data format」。本组用例钉死回退链：
 * 先试当前激活方式，失败再试另一条；全部失败才报错并带各尝试原因。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

/** 可控的 safeStorage 假件：v11 前缀 = 可解；其余抛「Invalid encrypted data format」 */
const fake = vi.hoisted(() => {
  const state = {
    available: true,
    tmpDir: '',
  }
  const safeStorage = {
    isEncryptionAvailable: (): boolean => state.available,
    encryptString: (plain: string): Buffer => Buffer.concat([Buffer.from('v11'), Buffer.from(plain, 'utf8')]),
    decryptString: (buf: Buffer): string => {
      if (buf.subarray(0, 3).toString('utf8') !== 'v11') {
        throw new Error('Invalid encrypted data format')
      }
      return buf.subarray(3).toString('utf8')
    },
  }
  return { state, safeStorage }
})

vi.mock('electron', () => ({
  safeStorage: fake.safeStorage,
  app: { getPath: (_name: string): string => fake.state.tmpDir },
}))

/** 每个用例拿一个全新模块状态的实例（私有静态单例随 resetModules 重置） */
async function freshInstance() {
  vi.resetModules()
  const mod = await import('@electron/services/secure-storage.service')
  return mod.SecureStorageService.getInstance()
}

/** 与服务端实现一致的旧格式加密（AES-256-GCM iv:tag:payload） */
function legacyEncrypt(key: Buffer, plain: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let enc = cipher.update(plain, 'utf8', 'base64')
  enc += cipher.final('base64')
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc}`
}

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-storage-'))
  fake.state.tmpDir = tmpDir
  fake.state.available = true
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('SecureStorageService 回退链', () => {
  it('真机 bug 复现：safeStorage 可用环境解密旧环境自定义 AES 密文 → 回退成功', async () => {
    // 旧环境：safeStorage 不可用 → 自定义 AES 写入 API key
    fake.state.available = false
    const old = await freshInstance()
    await old.initialize()
    const legacyBlob = old.encrypt('sk-legacy-key-123')
    expect(legacyBlob).toContain(':') // iv:tag:payload 形态

    // 新环境：safeStorage 可用（密钥环出现）→ 旧实现在此抛 Invalid encrypted data format
    fake.state.available = true
    const svc = await freshInstance()
    await svc.initialize()
    expect(svc.decrypt(legacyBlob)).toBe('sk-legacy-key-123')
  })

  it('反向：无密钥环环境解密 safeStorage 密文 → 回退到主密钥失败则报错（不谎报成功）', async () => {
    // 有密钥环环境写入 v11 密文
    const cloud = await freshInstance()
    await cloud.initialize()
    const v11Blob = cloud.encrypt('sk-cloud-key')
    expect(v11Blob.startsWith('djEx')).toBe(true) // base64('v11…')

    // 无密钥环环境（无密钥文件）：v11 解不开、无主密钥可回退 → 响亮报错
    //（safeStorage 不可用时不走该路径，attempts 只含 master-key 的原因）
    fake.state.available = false
    const svc = await freshInstance()
    await svc.initialize()
    expect(() => svc.decrypt(v11Blob)).toThrow(/重新输入密钥/)
    expect(() => svc.decrypt(v11Blob)).toThrow(/master-key: Invalid encrypted data format/)
    expect(() => svc.decrypt(v11Blob)).not.toThrow(/safeStorage:/)
  })

  it('同环境往返：safeStorage 密文与自定义密文各自可解', async () => {
    // 密钥文件已存在（历史遗留）+ safeStorage 可用 → 两种密文都能解
    fs.writeFileSync(path.join(tmpDir, 'secure-key'), crypto.randomBytes(32).toString('base64'), { mode: 0o600 })
    const key = Buffer.from(fs.readFileSync(path.join(tmpDir, 'secure-key'), 'utf8').trim(), 'base64')
    const svc = await freshInstance()
    await svc.initialize()
    expect(svc.decrypt(svc.encrypt('plain-a'))).toBe('plain-a')
    expect(svc.decrypt(legacyEncrypt(key, 'plain-b'))).toBe('plain-b')
  })

  it('无密钥环 + 无密钥文件 → 初始化生成并持久化密钥文件（0600，重启可解）', async () => {
    fake.state.available = false
    const svc = await freshInstance()
    await svc.initialize()
    const keyPath = path.join(tmpDir, 'secure-key')
    expect(fs.existsSync(keyPath)).toBe(true)
    expect((fs.statSync(keyPath).mode & 0o777).toString(8)).toBe('600')
    const blob = svc.encrypt('persist-me')
    // 重启（新实例，同 userData）：加载同一密钥文件 → 仍可解
    const restarted = await freshInstance()
    await restarted.initialize()
    expect(restarted.decrypt(blob)).toBe('persist-me')
  })

  it('密钥文件损坏（非 32 字节）→ 不静默覆盖；safeStorage 可用时主功能不受影响', async () => {
    const keyPath = path.join(tmpDir, 'secure-key')
    fs.writeFileSync(keyPath, 'bad-content', { mode: 0o600 })
    const svc = await freshInstance()
    await svc.initialize()
    expect(fs.readFileSync(keyPath, 'utf8')).toBe('bad-content') // 未被覆盖
    expect(svc.decrypt(svc.encrypt('ok'))).toBe('ok')
  })

  it('两种方式都失败 → 报错带两种尝试的原始原因', async () => {
    const keyPath = path.join(tmpDir, 'secure-key')
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('base64'), { mode: 0o600 })
    const svc = await freshInstance()
    await svc.initialize()
    // 既不是 v11 密文、也不是 iv:tag:payload 三段式
    const garbage = Buffer.from('totally-not-encrypted').toString('base64')
    expect(() => svc.decrypt(garbage)).toThrow(/safeStorage: Invalid encrypted data format/)
    expect(() => svc.decrypt(garbage)).toThrow(/master-key: Invalid encrypted data format/)
  })

  it('isEncryptionAvailable：safeStorage 不可用但有主密钥 → 仍可用', async () => {
    fake.state.available = false
    const svc = await freshInstance()
    await svc.initialize()
    expect(svc.isEncryptionAvailable()).toBe(true)
    expect(svc.isInitialized()).toBe(true)
  })
})
