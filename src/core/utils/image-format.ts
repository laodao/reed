/**
 * 图片字节格式识别
 * @module core/utils/image-format
 * @description 修复"生成图 JPEG/WebP 字节被存成 .png 扩展名"的问题：
 *              图像服务保存图片时按字节魔术字决定扩展名与 mimeType，
 *              避免查看器/资产解析按扩展名失败（read_image、前端缩略图等）。
 */

export interface ImageFormatInfo {
  /** 文件扩展名（不含点，如 png/jpg/webp） */
  ext: string
  /** MIME 类型 */
  mime: string
}

/**
 * 通过前几个字节识别图片格式。
 *
 * 识别范围：PNG / JPEG / GIF / WebP / BMP；未知或字节过短 → 兜底 png。
 * 兜底为 png（保持与旧行为兼容），但可被调用方按需再处理。
 *
 * @param buffer - 图片字节
 * @returns 扩展名与 MIME 类型
 */
export function detectImageFormat(buffer: Buffer): ImageFormatInfo {
  if (!buffer || buffer.length < 4) {
    return { ext: 'png', mime: 'image/png' }
  }
  const b = buffer

  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' }
  }
  // JPEG: FF D8
  if (b[0] === 0xff && b[1] === 0xd8) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  // GIF: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { ext: 'gif', mime: 'image/gif' }
  }
  // WebP: RIFF + WEBP(offset 8..11)
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  // BMP: 42 4D
  if (b[0] === 0x42 && b[1] === 0x4d) {
    return { ext: 'bmp', mime: 'image/bmp' }
  }

  // 未知：兜底 png（约等于旧行为，不抛错）
  return { ext: 'png', mime: 'image/png' }
}
