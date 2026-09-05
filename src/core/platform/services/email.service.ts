/**
 * 邮箱服务（邮件收发核心：SMTP 发 + IMAP 收）
 * @module core/platform/services/email.service
 * @description 静态类服务，供工作流 tool-call 节点（kind=email）与后续 IPC handler 调用。
 *              支持网易/QQ/163/Gmail/Outlook/企业邮箱（IMAP 与 SMTP 服务器分开配置，授权码认证）。
 *
 * 正文/附件解析：使用 mailparser（package.json 已声明 ^3.9.15，node_modules 已安装）把
 * IMAP 拉取的 RFC822 原始邮件（source Buffer）解析成 { text, html, attachments }。
 * 判断依据：本任务部署前已确认 node_modules/mailparser 可用，故采用 mailparser 首选方案；
 * 若运行环境缺失该包会抛错并被 catch 成 { success:false, error }，不会崩工具执行层。
 *
 * 安全纪律：授权码 passEnc 只存密文，仅在本服务执行连接前解密到内存，绝不出现在日志/DTO。
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ImapFlow, type FetchMessageObject, type MessageStructureObject, type SearchObject } from 'imapflow'
import * as nodemailer from 'nodemailer'
import { simpleParser, type Attachment } from 'mailparser'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import type { EmailAccountRepository } from '@core/database/repositories/email-account.repository'
import type { EmailAccountEntity } from '@core/database/entities/email-account.entity'
import type {
  EmailAccount,
  EmailAttachmentDownloadParams,
  EmailDeleteParams,
  EmailListFilter,
  EmailListResult,
  EmailMarkParams,
  EmailReadParams,
  EmailReadResult,
  EmailSearchParams,
  EmailSendParams,
  EmailSendResult,
  EmailStatusResult,
} from '@shared/types/email.types'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('EmailService')

/** IMAP 连接/读取超时（毫秒），比默认 5min 更激进，避免工作流节点挂死 */
const IMAP_SOCKET_TIMEOUT_MS = 60_000
const IMAP_CONNECT_TIMEOUT_MS = 30_000

/** 邮箱服务（全部静态方法，getEmailService() 返回类引用以便统一调用风格） */
export class EmailService {
  // ==================== 内部工具 ====================

  private static getRepository(): EmailAccountRepository {
    // 复用 DatabaseManager 集中管理的实例（同 translation.service 模式）
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.emailAccounts) {
      throw new Error('EmailAccountRepository not initialized')
    }
    return dbManager.emailAccounts
  }

  /**
   * 取账号原始实体（含 passEnc 密文，仅服务端内存使用；评审 #16：DTO 已剥离密文）。
   * 不存在直接抛错，由各方法 catch 成统一错误结构。
   */
  private static async getAccount(accountId: string): Promise<EmailAccountEntity> {
    const acc = await this.getRepository().getRawById(accountId)
    if (!acc) throw new Error(`邮箱账号不存在：${accountId}`)
    return acc
  }

  /** 解密授权码（SecureStorage；解密失败抛错提示重新保存） */
  private static decryptPass(acc: EmailAccountEntity): string {
    try {
      return getSecureStorage().decrypt(acc.passEnc)
    } catch (e) {
      logger.error('[EmailService] 授权码解密失败', { accountId: acc.id, name: acc.name })
      throw new Error(`邮箱「${acc.name}」授权码解密失败，请重新保存`)
    }
  }

  /** 统一错误消息提取 */
  private static errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  /**
   * IMAP 通用执行器：每次新建连接，执行 fn 后必 logout（失败兜底 close），
   * 保证连接不泄漏；socketTimeout 设 60s 防挂死。
   */
  private static async withImap<T>(acc: EmailAccountEntity, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const pass = this.decryptPass(acc)
    const client = new ImapFlow({
      host: acc.imapHost,
      port: acc.imapPort,
      secure: acc.imapSecure,
      auth: { user: acc.user, pass },
      socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
      connectionTimeout: IMAP_CONNECT_TIMEOUT_MS,
      logger: false,
    })
    try {
      await client.connect()
      return await fn(client)
    } finally {
      // 正常退出先 logout（服务器端优雅关闭）；异常时 logout 可能失败，兜底 close 释放 socket
      try {
        await client.logout()
      } catch {
        try { client.close() } catch { /* 已关闭 */ }
      }
    }
  }

  /** 构造 imapflow 搜索条件（留空字段不传） */
  private static buildSearchQuery(filter: EmailListFilter): SearchObject {
    const query: SearchObject = {}
    if (filter.unreadOnly !== undefined) {
      // seen=false ⇔ 未读（\Seen 标志缺失）
      query.seen = !filter.unreadOnly
    }
    if (filter.from) query.from = filter.from
    if (filter.subject) query.subject = filter.subject
    if (filter.since) query.since = filter.since
    if (filter.before) query.before = filter.before
    return query
  }

  /** 地址对象 → 可读字符串（"Name <addr>"，缺名则纯地址） */
  private static formatAddress(
    list?: Array<{ name?: string; address?: string }> | null,
  ): string {
    const first = list?.[0]
    if (!first) return ''
    if (first.name && first.address) return `${first.name} <${first.address}>`
    return first.address ?? first.name ?? ''
  }

  /** 递归判断 BODYSTRUCTURE 树是否含附件（attachment/inline disposition 或非 text/plain|html 叶子） */
  private static hasAttachmentNode(node: MessageStructureObject): boolean {
    if (node.disposition === 'attachment' || node.disposition === 'inline') return true
    const t = (node.type ?? '').toLowerCase()
    if (!node.childNodes) {
      if (t !== 'text/plain' && t !== 'text/html') return true
      return false
    }
    return (node.childNodes ?? []).some(c => this.hasAttachmentNode(c))
  }

  /** 从 fetch 结果组装摘要 */
  private static toSummary(msg: FetchMessageObject, folder: string): {
    uid: number
    folder: string
    from: string
    to: string
    subject: string
    date: string
    seen: boolean
    hasAttachments: boolean
  } {
    const dateRaw = msg.internalDate ?? msg.envelope?.date
    return {
      uid: msg.uid,
      folder,
      from: this.formatAddress(msg.envelope?.from),
      to: this.formatAddress(msg.envelope?.to),
      subject: msg.envelope?.subject ?? '',
      date: dateRaw instanceof Date ? dateRaw.toISOString() : String(dateRaw ?? ''),
      seen: !!msg.flags?.has('\\Seen'),
      hasAttachments: msg.bodyStructure ? this.hasAttachmentNode(msg.bodyStructure) : false,
    }
  }

  /** 查询执行体（list/search 共用）：search → fetch envelope/flags/internalDate/bodyStructure → 摘要 */
  private static async queryMessages(accountId: string, filter: EmailListFilter): Promise<EmailListResult> {
    try {
      const acc = await this.getAccount(accountId)
      const folder = filter.folder ?? 'INBOX'
      const limit = Math.max(1, filter.limit ?? 20)
      const messages = await this.withImap(acc, async (client) => {
        await client.mailboxOpen(folder)
        const uids = await client.search(this.buildSearchQuery(filter), { uid: true })
        if (!uids || uids.length === 0) return []
        const list: Array<{ uid: number; folder: string; from: string; to: string; subject: string; date: string; seen: boolean; hasAttachments: boolean }> = []
        // fetch 按 uid 升序返回；先全量收集再按日期倒序（最新在前）截断
        for await (const msg of client.fetch(uids, {
          envelope: true,
          flags: true,
          internalDate: true,
          bodyStructure: true,
        }, { uid: true })) {
          list.push(this.toSummary(msg, folder))
        }
        list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        return list.slice(0, limit)
      })
      return { success: true, messages }
    } catch (e) {
      logger.error('[EmailService] 查询邮件失败', e)
      return { success: false, messages: [], error: this.errMsg(e) }
    }
  }

  // ==================== SMTP 发送 ====================

  /** 发送邮件（nodemailer；授权码认证，支持 text/html/附件） */
  static async send(p: EmailSendParams): Promise<EmailSendResult> {
    try {
      const acc = await this.getAccount(p.accountId)
      const pass = this.decryptPass(acc)
      const transporter = nodemailer.createTransport({
        host: acc.smtpHost,
        port: acc.smtpPort,
        secure: acc.smtpSecure,
        auth: { user: acc.user, pass },
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 60_000,
      })
      const attachments = (p.attachments ?? []).map(a => {
        if (a.contentBase64) {
          return { filename: a.filename, content: Buffer.from(a.contentBase64, 'base64') }
        }
        if (a.path) {
          return { filename: a.filename, path: a.path }
        }
        return { filename: a.filename, content: Buffer.from('') }
      })
      const info = await transporter.sendMail({
        from: acc.fromName ? `"${acc.fromName}" <${acc.user}>` : acc.user,
        to: p.to,
        cc: p.cc,
        bcc: p.bcc,
        subject: p.subject,
        text: p.text,
        html: p.html,
        attachments,
      })
      return { success: true, messageId: info.messageId }
    } catch (e) {
      logger.error('[EmailService] 发送邮件失败', e)
      return { success: false, error: this.errMsg(e) }
    }
  }

  // ==================== IMAP 收件 ====================

  /** 读取邮件列表（默认 INBOX，倒序，limit 截断） */
  static async list(p: EmailSearchParams): Promise<EmailListResult> {
    return this.queryMessages(p.accountId, p)
  }

  /** 搜索邮件（同列表，可用更宽条件） */
  static async search(p: EmailSearchParams): Promise<EmailListResult> {
    return this.queryMessages(p.accountId, p)
  }

  /** 读取邮件正文：拉取 RFC822 source → mailparser 解析 text/html/附件清单 */
  static async read(p: EmailReadParams): Promise<EmailReadResult> {
    try {
      const acc = await this.getAccount(p.accountId)
      const folder = p.folder ?? 'INBOX'
      const result = await this.withImap(acc, async (client) => {
        await client.mailboxOpen(folder)
        const msg = await client.fetchOne(String(p.uid), {
          envelope: true,
          flags: true,
          internalDate: true,
          bodyStructure: true,
          source: true,
        }, { uid: true })
        if (!msg) throw new Error(`邮件不存在：uid=${p.uid}`)
        const summary = this.toSummary(msg, folder)
        // mailparser：RFC822 Buffer → text/html/attachments（首选方案，见文件头注释）
        const parsed = await simpleParser(msg.source as Buffer)
        const attachments = (parsed.attachments ?? []).map((a: Attachment) => ({
          filename: a.filename ?? 'unnamed',
          size: a.size ?? a.content.length,
        }))
        return {
          message: {
            ...summary,
            text: parsed.text ?? undefined,
            html: parsed.html || undefined,
            attachments,
          },
        }
      })
      return { success: true, message: result.message }
    } catch (e) {
      logger.error('[EmailService] 读取邮件失败', e)
      return { success: false, error: this.errMsg(e) }
    }
  }

  /** 标记已读/未读（\Seen 标志） */
  static async markSeen(p: EmailMarkParams): Promise<{ success: boolean; error?: string }> {
    try {
      const acc = await this.getAccount(p.accountId)
      await this.withImap(acc, async (client) => {
        await client.mailboxOpen(p.folder ?? 'INBOX')
        if (p.seen) {
          await client.messageFlagsAdd(String(p.uid), ['\\Seen'], { uid: true })
        } else {
          await client.messageFlagsRemove(String(p.uid), ['\\Seen'], { uid: true })
        }
      })
      return { success: true }
    } catch (e) {
      logger.error('[EmailService] 标记邮件失败', e)
      return { success: false, error: this.errMsg(e) }
    }
  }

  /** 删除邮件（imapflow messageDelete：加 \Deleted + expunge / MOVE 由服务端决定） */
  static async delete(p: EmailDeleteParams): Promise<{ success: boolean; error?: string }> {
    try {
      const acc = await this.getAccount(p.accountId)
      await this.withImap(acc, async (client) => {
        await client.mailboxOpen(p.folder ?? 'INBOX')
        await client.messageDelete(String(p.uid), { uid: true })
      })
      return { success: true }
    } catch (e) {
      logger.error('[EmailService] 删除邮件失败', e)
      return { success: false, error: this.errMsg(e) }
    }
  }

  /** 邮箱状态：列出文件夹 + 各自 total/unseen（V1 取前 50 个文件夹，单文件夹失败跳过） */
  static async status(p: { accountId: string }): Promise<EmailStatusResult> {
    try {
      const acc = await this.getAccount(p.accountId)
      const folders = await this.withImap(acc, async (client) => {
        const boxes = await client.list()
        const result: Array<{ name: string; total: number; unseen: number }> = []
        for (const b of boxes.slice(0, 50)) {
          try {
            const st = await client.status(b.path, { messages: true, unseen: true })
            result.push({ name: b.path, total: st.messages ?? 0, unseen: st.unseen ?? 0 })
          } catch (e) {
            logger.warn(`[EmailService] 文件夹 ${b.path} 状态查询失败，跳过`, e)
          }
        }
        return result
      })
      return { success: true, folders }
    } catch (e) {
      logger.error('[EmailService] 邮箱状态查询失败', e)
      return { success: false, folders: [], error: this.errMsg(e) }
    }
  }

  /** 下载附件：解析 RFC822 → 按 filename 匹配 → 写出到 outputDir（缺省系统临时目录） */
  static async downloadAttachment(p: EmailAttachmentDownloadParams): Promise<{
    success: boolean
    filePath?: string
    filename?: string
    size?: number
    error?: string
  }> {
    try {
      const acc = await this.getAccount(p.accountId)
      const out = await this.withImap(acc, async (client) => {
        await client.mailboxOpen(p.folder ?? 'INBOX')
        const msg = await client.fetchOne(String(p.uid), { source: true }, { uid: true })
        if (!msg) throw new Error(`邮件不存在：uid=${p.uid}`)
        const parsed = await simpleParser(msg.source as Buffer)
        const att = (parsed.attachments ?? []).find(a => a.filename === p.filename)
        if (!att) throw new Error(`附件不存在：${p.filename}`)
        // 防路径穿越：只用文件名本体
        const safeName = path.basename(att.filename ?? `attachment_${p.uid}`)
        const dir = p.outputDir ?? path.join(os.tmpdir(), 'the-bot-email-attachments')
        fs.mkdirSync(dir, { recursive: true })
        const filePath = path.join(dir, safeName)
        fs.writeFileSync(filePath, att.content)
        return { filePath, filename: safeName, size: att.size ?? att.content.length }
      })
      return { success: true, ...out }
    } catch (e) {
      logger.error('[EmailService] 下载附件失败', e)
      return { success: false, error: this.errMsg(e) }
    }
  }

  /** 账号连通性测试：IMAP 连接 + SMTP verify（success = 两者都通） */
  static async testAccount(p: { accountId: string }): Promise<{
    success: boolean
    connect?: boolean
    smtp?: boolean
    imap?: boolean
    error?: string
  }> {
    let imap = false
    let smtp = false
    let firstError: string | undefined
    try {
      const acc = await this.getAccount(p.accountId)
      // IMAP：连上即视为通
      try {
        await this.withImap(acc, async () => { imap = true })
      } catch (e) {
        firstError = firstError ?? this.errMsg(e)
      }
      // SMTP：verify 握手
      try {
        const pass = this.decryptPass(acc)
        const transporter = nodemailer.createTransport({
          host: acc.smtpHost,
          port: acc.smtpPort,
          secure: acc.smtpSecure,
          auth: { user: acc.user, pass },
          connectionTimeout: 30_000,
          greetingTimeout: 30_000,
          socketTimeout: 60_000,
        })
        await transporter.verify()
        smtp = true
      } catch (e) {
        firstError = firstError ?? this.errMsg(e)
      }
      return { success: imap && smtp, connect: imap && smtp, imap, smtp, error: firstError }
    } catch (e) {
      logger.error('[EmailService] 账号连通性测试失败', e)
      return { success: false, imap, smtp, error: this.errMsg(e) }
    }
  }
}

/** 邮箱服务访问器（静态类，返回类引用；调用方统一 getEmailService().xxx） */
export function getEmailService(): typeof EmailService {
  return EmailService
}
