/**
 * 邮箱模块 IPC 处理器（邮件收发工具 · 邮箱账号配置）
 * @module electron/ipc/handlers/email.handler
 * @description 薄适配层：email:* 通道 → EmailService（测试连接）+ email_accounts 仓库（账号 CRUD）。
 *              业务在 core 的 EmailService / EmailAccountRepository（架构铁律：handler 不写业务）。
 *              安全纪律：授权码（pass）明文只从渲染进程进入，本层经 SecureStorage 加密后落库
 *              （passEnc），绝不明文持久化；列表/详情均不返回明文。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { getEmailService } from '@core/services/email.service'
import type { EmailAccountRepository, CreateEmailAccountInput, UpdateEmailAccountInput } from '@core/database/repositories/email-account.repository'
import type { EmailAccount } from '@shared/types/email.types'
import type { IpcResponse } from '@shared/types/ipc.types'

/**
 * 保存邮箱账号入参（email:save-account 通道载荷）
 * pass 为明文授权码/密码：新增必填；编辑时留空表示保留原密文（passEnc 不变）
 */
export interface SaveEmailAccountInput {
  /** 编辑时传入；缺省为新增 */
  id?: string
  /** 显示名 */
  name: string
  /** IMAP 服务器（收信） */
  imapHost: string
  /** IMAP 端口（如 993） */
  imapPort: number
  /** IMAP 是否 SSL/TLS 加密 */
  imapSecure: boolean
  /** SMTP 服务器（发信） */
  smtpHost: string
  /** SMTP 端口（如 465 / 587） */
  smtpPort: number
  /** SMTP 是否 SSL/TLS 加密（587 常用 STARTTLS） */
  smtpSecure: boolean
  /** 邮箱账号（登录名） */
  user: string
  /** 明文授权码/密码（服务端加密后存 passEnc；编辑留空保留原密文） */
  pass?: string
  /** 发件人显示名 */
  fromName: string
}

export function registerEmailHandlers(): void {
  // ==================== 邮箱账号 CRUD ====================
  ipcBridge.handle('email:list-accounts', () =>
    wrap(() => listAccounts())
  )
  ipcBridge.handle('email:save-account', (_e, p: SaveEmailAccountInput) =>
    wrap(() => saveAccount(p))
  )
  ipcBridge.handle('email:delete-account', (_e, p: { id: string }) =>
    wrap(async () => { await deleteAccount(p.id); return { deleted: true } })
  )

  // ==================== 测试连接 ====================
  ipcBridge.handle('email:test-account', (_e, p: { id: string }) =>
    wrap(() => getEmailService().testAccount({ accountId: p.id }))
  )
}

/** 列表：取全部邮箱账号（passEnc 密文原样带出，前端不展示明文） */
async function listAccounts(): Promise<EmailAccount[]> {
  return emailRepo().list()
}

/** 保存（新增/编辑）：授权码加密后落库；编辑时留空保留原密文 */
async function saveAccount(p: SaveEmailAccountInput): Promise<EmailAccount> {
  const repo = emailRepo()

  // ---- 必填校验 ----
  const name = requireText(p.name, '显示名')
  const user = requireText(p.user, '邮箱账号')
  const imapHost = requireText(p.imapHost, 'IMAP 服务器')
  const smtpHost = requireText(p.smtpHost, 'SMTP 服务器')
  const imapPort = requirePort(p.imapPort, 'IMAP 端口')
  const smtpPort = requirePort(p.smtpPort, 'SMTP 端口')

  // ---- 授权码加密（新增必填；编辑留空则 passEnc 缺省，仓库 update 保持原密文） ----
  let passEnc: string | undefined
  if (p.pass && p.pass.trim()) {
    const ss = getSecureStorage()
    if (!ss.isInitialized()) await ss.initialize()
    passEnc = ss.encrypt(p.pass.trim())
  }

  // host 为兼容展示字段：与 IMAP 服务器保持一致（实际连接以 imap*/smtp* 为准）
  const base: Omit<CreateEmailAccountInput, 'passEnc'> = {
    name,
    host: imapHost,
    imapHost,
    imapPort,
    imapSecure: !!p.imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure: !!p.smtpSecure,
    user,
    fromName: (p.fromName ?? '').trim() || null,
  }

  // ---- 编辑：pass 留空保留原密文 ----
  if (p.id) {
    const existing = await repo.findById(p.id)
    if (!existing) throw new Error('账号不存在，可能已被删除')
    const patch: UpdateEmailAccountInput = { ...base, passEnc }
    const saved = await repo.update(p.id, patch)
    if (!saved) throw new Error('保存失败：账号不存在')
    return saved
  }

  // ---- 新增：必须提供授权码 ----
  if (!passEnc) throw new Error('新增账号必须填写授权码/密码')
  return repo.create({ ...base, passEnc })
}

/** 删除账号（引用该账号的工作流邮件工具将失效） */
async function deleteAccount(id: string): Promise<void> {
  await emailRepo().delete(id)
}

// ==================== 内部工具 ====================

/** 取邮箱账号仓库（未初始化直接抛错，由 wrap 转成 {success:false}） */
function emailRepo(): EmailAccountRepository {
  const repo = getCoreDatabaseManager().emailAccounts
  if (!repo) throw new Error('数据库未初始化（邮箱账号仓库未就绪）')
  return repo
}

/** 必填文本校验 */
function requireText(v: string | undefined, label: string): string {
  if (!v || !v.trim()) throw new Error(`${label}不能为空`)
  return v.trim()
}

/** 端口校验（1-65535 整数） */
function requirePort(v: number | undefined, label: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${label}必须是 1-65535 的整数`)
  return n
}

/** 统一 IpcResponse 包裹（与 tool.handler.wrap 同构） */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}
