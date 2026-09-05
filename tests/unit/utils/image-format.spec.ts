/**
 * 图片字节格式识别测试
 * @module tests/utils/image-format
 * @description 修复"生成图 JPEG/WebP 字节被存成 .png 扩展名"问题：保存时应按字节格式
 *              决定扩展名与 mimeType。本测试锁定 detectImageFormat 的识别规则。
 */
import { describe, it, expect } from 'vitest'
import { detectImageFormat } from '@core/utils/image-format'

describe('detectImageFormat（图片字节格式识别）', () => {
  it('识别 PNG 字节 → ext=png / mime=image/png', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    expect(detectImageFormat(buf)).toEqual({ ext: 'png', mime: 'image/png' })
  })

  it('识别 JPEG 字节 → ext=jpg / mime=image/jpeg（修复 .png 存 jpeg 的 bug）', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    expect(detectImageFormat(buf)).toEqual({ ext: 'jpg', mime: 'image/jpeg' })
  })

  it('识别 WebP 字节（RIFF....WEBP）→ ext=webp / mime=image/webp', () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    expect(detectImageFormat(buf)).toEqual({ ext: 'webp', mime: 'image/webp' })
  })

  it('识别 GIF 字节 → ext=gif / mime=image/gif', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00])
    expect(detectImageFormat(buf)).toEqual({ ext: 'gif', mime: 'image/gif' })
  })

  it('识别 BMP 字节 → ext=bmp / mime=image/bmp', () => {
    const buf = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00])
    expect(detectImageFormat(buf)).toEqual({ ext: 'bmp', mime: 'image/bmp' })
  })

  it('空/过短字节 → 兜底 png', () => {
    expect(detectImageFormat(Buffer.from([]))).toEqual({ ext: 'png', mime: 'image/png' })
    expect(detectImageFormat(Buffer.from([0x12, 0x34]))).toEqual({ ext: 'png', mime: 'image/png' })
  })

  it('未知魔术字节 → 兜底 png（不抛错）', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20]) // JXL 之类未知
    expect(detectImageFormat(buf)).toEqual({ ext: 'png', mime: 'image/png' })
  })
})
