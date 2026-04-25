/**
 * 文件服务
 * @module services/file-service
 * @description 处理文件附件的读取和内容转换
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Attachment, AttachmentContent, MessageContent, MessageContentBlock } from '@shared/types'

/**
 * 文件服务
 * 提供文件附件的读取和多模态内容构建功能
 */
export class FileService {
  /**
   * 支持的图片 MIME 类型
   */
  private static readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]

  /**
   * 支持的文本文件 MIME 类型
   */
  private static readonly SUPPORTED_TEXT_TYPES = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',
    'text/xml'
  ]

  /**
   * 读取单个附件内容
   * @param attachment 附件信息
   * @returns 附件内容
   */
  static async readAttachment(attachment: Attachment): Promise<AttachmentContent> {
    const { id, type, fileName, filePath, mimeType } = attachment

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    // 读取文件内容
    const buffer = fs.readFileSync(filePath)
    const base64Data = buffer.toString('base64')

    // 构建附件内容
    const content: AttachmentContent = {
      id,
      type,
      fileName,
      mimeType,
      base64Data
    }

    // 如果是文本类文件，提取文本内容
    if (this.isTextFile(mimeType)) {
      content.textContent = await this.extractTextContent(attachment, buffer)
    }

    return content
  }

  /**
   * 批量读取附件
   * @param attachments 附件列表
   * @returns 附件内容列表
   */
  static async readAttachments(attachments: Attachment[]): Promise<AttachmentContent[]> {
    const results: AttachmentContent[] = []

    for (const attachment of attachments) {
      try {
        const content = await this.readAttachment(attachment)
        results.push(content)
      } catch (error) {
        console.error(`[FileService] 读取附件失败: ${attachment.fileName}`, error)
        // 继续处理其他附件
      }
    }

    return results
  }

  /**
   * 构建多模态消息内容
   * @param textContent 文本内容
   * @param attachments 附件内容列表
   * @returns 多模态消息内容
   */
  static buildMultimodalContent(
    textContent: string,
    attachments?: AttachmentContent[]
  ): MessageContent {
    // 如果没有附件，直接返回纯文本
    if (!attachments || attachments.length === 0) {
      return textContent
    }

    const blocks: MessageContentBlock[] = []

    // 添加文本块（如果有文本内容）
    if (textContent && textContent.trim()) {
      blocks.push({
        type: 'text',
        text: textContent.trim()
      })
    }

    // 处理附件
    for (const attachment of attachments) {
      if (this.isImageFile(attachment.mimeType)) {
        // 图片：转换为 data URL 格式
        const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64Data}`
        blocks.push({
          type: 'image',
          image_url: {
            url: dataUrl
          }
        })
      } else if (attachment.textContent) {
        // 文本文件：添加文本内容
        blocks.push({
          type: 'text',
          text: `\n\n--- 附件: ${attachment.fileName} ---\n${attachment.textContent}\n--- 附件结束 ---`
        })
      } else {
        // 其他类型文件：显示占位符
        blocks.push({
          type: 'text',
          text: `\n\n[附件: ${attachment.fileName}，暂不支持此类型文件的解析]`
        })
      }
    }

    // 如果只有文本块，返回纯文本格式
    if (blocks.length === 1 && blocks[0].type === 'text') {
      return blocks[0].text || ''
    }

    return blocks
  }

  /**
   * 检查是否是图片文件
   * @param mimeType MIME 类型
   * @returns 是否是图片
   */
  static isImageFile(mimeType: string): boolean {
    return this.SUPPORTED_IMAGE_TYPES.includes(mimeType.toLowerCase())
  }

  /**
   * 检查是否是文本文件
   * @param mimeType MIME 类型
   * @returns 是否是文本文件
   */
  static isTextFile(mimeType: string): boolean {
    return this.SUPPORTED_TEXT_TYPES.includes(mimeType.toLowerCase())
  }

  /**
   * 提取文档文本内容
   * @param attachment 附件信息
   * @param buffer 文件缓冲区
   * @returns 提取的文本内容
   */
  private static async extractTextContent(
    attachment: Attachment,
    buffer: Buffer
  ): Promise<string> {
    const { mimeType, fileName } = attachment

    // 纯文本文件直接解码
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return buffer.toString('utf-8')
    }

    // JSON 文件格式化输出
    if (mimeType === 'application/json') {
      try {
        const json = JSON.parse(buffer.toString('utf-8'))
        return JSON.stringify(json, null, 2)
      } catch {
        return buffer.toString('utf-8')
      }
    }

    // 其他文本类型直接解码
    if (this.isTextFile(mimeType)) {
      return buffer.toString('utf-8')
    }

    // PDF、Word、Excel 等复杂文档
    // TODO: 后续可集成 pdf-parse、mammoth、xlsx 等库进行解析
    if (mimeType === 'application/pdf') {
      return `[PDF 文档: ${fileName}，暂不支持解析，请使用支持的格式]`
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return `[Word 文档: ${fileName}，暂不支持解析，请使用支持的格式]`
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      return `[Excel 文档: ${fileName}，暂不支持解析，请使用支持的格式]`
    }

    // 未知类型
    return `[二进制文件: ${fileName}]`
  }

  /**
   * 获取文件大小描述
   * @param bytes 字节数
   * @returns 人类可读的大小描述
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    }
  }
}
