/**
 * 邮箱模块类型（邮件收发核心后端）
 * @module shared/types/email.types
 * @description 邮箱账号（SMTP 发 / IMAP 收，授权码认证）+ 收发/检索/标记/删除等操作入参出参。
 *              常量与类型双端同源（core 执行与前端面板共用）。
 */

/** 收件协议：当前仅支持 IMAP（IMAP 与 SMTP 服务器地址独立配置，不少邮箱二者不同） */
export type EmailProtocol = 'imap'

/**
 * 邮箱账号（email_accounts 表字段同名直出）
 * 说明：imapHost/imapPort/imapSecure 与 smtpHost/smtpPort/smtpSecure 分开配置，
 *      因为网易/QQ/163/Gmail/Outlook/企业邮箱的 IMAP 与 SMTP 服务器地址往往不同。
 *      host 为兼容字段，保留展示用途，实际连接以 imapHost/smtpHost 为准。
 */
export interface EmailAccount {
  id: string
  /** 显示名 */
  name: string
  /** 服务器（兼容展示字段；实际连接用 imapHost/smtpHost） */
  host: string
  imapHost: string
  /** 默认 993 */
  imapPort: number
  /** 默认 true */
  imapSecure: boolean
  smtpHost: string
  /** 默认 465 */
  smtpPort: number
  /** 默认 true */
  smtpSecure: boolean
  /** 邮箱账号 */
  user: string
  /** 是否已配置密码（仓库层从 pass_enc 存在性派生；密文不出仓库层——评审 #16） */
  hasPassword?: boolean
  /** 发件人显示名 */
  fromName: string
  createdAt: Date | null
  updatedAt: Date | null
}

/** 发送邮件入参 */
export interface EmailSendParams {
  accountId: string
  /** 收件人 */
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  /** 纯文本 */
  text?: string
  /** HTML */
  html?: string
  attachments?: Array<{ filename: string; contentBase64?: string; path?: string }>
}

/** 发送邮件出参 */
export interface EmailSendResult {
  success: boolean
  messageId?: string
  error?: string
}

/** 列表/搜索过滤条件 */
export type EmailListFilter = {
  /** 默认 INBOX */
  folder?: string
  /** 发件人包含 */
  from?: string
  /** 主题包含 */
  subject?: string
  /** ISO date 之后 */
  since?: string
  /** ISO date 之前 */
  before?: string
  unreadOnly?: boolean
  /** 默认 20 */
  limit?: number
}

/** 邮件摘要（列表项） */
export interface EmailMessageSummary {
  uid: number
  folder: string
  from: string
  to: string
  subject: string
  /** ISO */
  date: string
  seen: boolean
  hasAttachments: boolean
}

/** 邮件列表出参 */
export interface EmailListResult {
  success: boolean
  messages: EmailMessageSummary[]
  error?: string
}

/** 读取邮件正文入参 */
export interface EmailReadParams {
  accountId: string
  uid: number
  folder?: string
}

/** 读取邮件正文出参（正文/附件仅 V1 提供 text/html/附件清单） */
export interface EmailReadResult {
  success: boolean
  message?: EmailMessageSummary & {
    text?: string
    html?: string
    attachments?: Array<{ filename: string; size: number }>
  }
  error?: string
}

/** 搜索入参：同列表条件 + 账号 */
export interface EmailSearchParams extends EmailListFilter {
  accountId: string
}

/** 标记已读/未读入参 */
export interface EmailMarkParams {
  accountId: string
  uid: number
  seen: boolean
  folder?: string
}

/** 删除邮件入参 */
export interface EmailDeleteParams {
  accountId: string
  uid: number
  folder?: string
}

/** 邮箱文件夹状态 */
export interface EmailFolderStatus {
  name: string
  total: number
  unseen: number
}

/** 邮箱状态出参 */
export interface EmailStatusResult {
  success: boolean
  folders: EmailFolderStatus[]
  error?: string
}

/** 下载附件入参 */
export interface EmailAttachmentDownloadParams {
  accountId: string
  uid: number
  filename: string
  folder?: string
  /** 落盘目录（缺省走工具执行层默认目录） */
  outputDir?: string
}
