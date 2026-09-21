/**
 * 编号参考板拼装 service（2026-09-21 · 雪麓山庄 v2 复盘 D 项）
 * @module platform/episode-production/render/keyframe/reference-board.service
 *
 * 背景：comfyui 网关（flux-kontext）只吃 1 张参考图，多角色镜头里除第一个角色外
 * 的角色/场景参考图全部被静默丢弃，掌门/大师兄等角色从未被视觉锚定。
 * 改网关协议不现实 → 在生成侧把多张参考图拼成一张带编号的参考板，作为唯一
 * 参考图喂给单图模型，prompt 里同步说明编号与资产的对应关系。
 *
 * 布局：各成员图统一缩放为等高（768px）横排拼接，间距 8px 白边；
 * 每张图正下方画红底白字编号色块（SVG overlay，编号即 prompt 里的 N 号）。
 * SVG 文字渲染失败时退化为纯色编号块（编号仍按从左到右顺序对应）。
 * 总宽超过 2048 时整体等比缩小。
 *
 * 产物落用户图片目录 images/YYYY/MM/DD/board_xxx.png（与 ImageService 存图风格一致），
 * 返回相对 dataPath 的路径（正斜杠），与 asset_image.imagePath 存储口径一致。
 */

import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { getPathProvider } from '@core/interfaces/path.interface'

/** 参考板成员（有序，顺序即编号顺序） */
export interface ReferenceBoardMemberInput {
  /** asset_image.imagePath（相对 dataPath 或绝对路径） */
  imagePath: string
  /** 资产名（prompt 说明段用，如"沈云萝"） */
  name: string
  kind: 'character' | 'location' | 'item'
  /** asset_image.id，落 metadata.referenceBoard.members 用 */
  assetImageId: string
}

export interface ReferenceBoardMember {
  assetImageId: string
  name: string
  kind: 'character' | 'location' | 'item'
  /** 1-based 编号（图上色块 + prompt 说明段里的 N 号） */
  slot: number
}

export interface ReferenceBoardResult {
  /** 拼板产物路径（相对 dataPath，正斜杠） */
  path: string
  width: number
  height: number
  members: ReferenceBoardMember[]
}

/** 成员图统一高度 / 间距 / 编号带高度 / 总宽上限 */
const BOARD_IMAGE_HEIGHT = 768
const BOARD_GAP = 8
const BOARD_BADGE_BAND = 64
const BOARD_MAX_WIDTH = 2048

/** 红底白字圆形编号（SVG；librsvg 渲染阿拉伯数字可靠，中文不可靠故只用数字） */
function badgeSvg(slot: number, withText: boolean, size = 56): Buffer {
  const c = size / 2
  const text = withText
    ? `<text x="${c}" y="${Math.round(c + size * 0.19)}" font-size="${Math.round(size * 0.54)}" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif" fill="#ffffff" text-anchor="middle">${slot}</text>`
    : ''
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="#c0392b"/>${text}</svg>`,
  )
}

export class ReferenceBoardService {
  /**
   * @param resolveDataPath 数据目录解析（可注入，单测用临时目录；缺省走 PathProvider）
   */
  constructor(
    private readonly resolveDataPath: () => string = () => getPathProvider().getDataPath(),
  ) {}

  /** 成员图路径解析：绝对路径直接用，相对路径按 dataPath 拼 */
  private toAbs(p: string): string {
    if (path.isAbsolute(p)) return p
    return path.join(this.resolveDataPath(), p)
  }

  /**
   * 拼一张编号参考板。成员顺序即编号顺序（1..N，从左到右）。
   * @throws 成员为空 / 成员图全部不可读 / sharp 合成失败
   */
  async build(members: ReferenceBoardMemberInput[]): Promise<ReferenceBoardResult> {
    if (members.length === 0) throw new Error('参考板成员为空')

    // 逐张缩放到等高，读不出的成员跳过（其余成员编号不受影响——跳过后再重排 slot）
    const tiles: Array<{ buf: Buffer; width: number; member: ReferenceBoardMemberInput }> = []
    for (const m of members) {
      const abs = this.toAbs(m.imagePath)
      if (!fs.existsSync(abs)) {
        console.warn('[reference-board] 成员图不存在，跳过:', m.imagePath)
        continue
      }
      const buf = await sharp(abs)
        .resize({ height: BOARD_IMAGE_HEIGHT, withoutEnlargement: false })
        .png()
        .toBuffer()
      const meta = await sharp(buf).metadata()
      tiles.push({ buf, width: meta.width ?? BOARD_IMAGE_HEIGHT, member: m })
    }
    if (tiles.length === 0) throw new Error('参考板成员图全部不可读')

    // 总宽超上限 → 等比缩小（sharp resize 取整可能回升 1~2px/张，迭代收紧到 ≤ 上限）
    const gapTotal = BOARD_GAP * (tiles.length - 1)
    const totalWidthOf = () => tiles.reduce((w, t) => w + t.width, 0) + gapTotal
    let targetHeight = BOARD_IMAGE_HEIGHT
    for (let guard = 0; guard < 4 && totalWidthOf() > BOARD_MAX_WIDTH; guard++) {
      targetHeight = Math.max(
        1,
        Math.floor(targetHeight * (BOARD_MAX_WIDTH / totalWidthOf()) * 0.99),
      )
      for (const t of tiles) {
        t.buf = await sharp(t.buf).resize({ height: targetHeight }).png().toBuffer()
        t.width = (await sharp(t.buf).metadata()).width ?? targetHeight
      }
    }
    const imageRowHeight = targetHeight
    const badgeBand = Math.max(32, Math.round(BOARD_BADGE_BAND * (targetHeight / BOARD_IMAGE_HEIGHT)))
    const badgeSize = Math.min(56, badgeBand - 8)
    const totalWidth = tiles.reduce((w, t) => w + t.width, 0) + BOARD_GAP * (tiles.length - 1)
    const totalHeight = imageRowHeight + badgeBand

    // 合成：白底 canvas + 成员图 + 编号色块（编号带在图片下方）
    const tileOverlays: sharp.OverlayOptions[] = []
    const badgePositions: Array<{ slot: number; left: number; top: number }> = []
    let x = 0
    const outMembers: ReferenceBoardMember[] = []
    tiles.forEach((t, i) => {
      const slot = i + 1
      tileOverlays.push({ input: t.buf, left: x, top: 0 })
      badgePositions.push({
        slot,
        left: x + Math.max(0, Math.round((t.width - badgeSize) / 2)),
        top: imageRowHeight + Math.max(0, Math.round((badgeBand - badgeSize) / 2)),
      })
      outMembers.push({
        assetImageId: t.member.assetImageId,
        name: t.member.name,
        kind: t.member.kind,
        slot,
      })
      x += t.width + BOARD_GAP
    })

    const dataPath = this.resolveDataPath()
    const now = new Date()
    const relDir = path.join(
      'images',
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    )
    const absDir = path.join(dataPath, relDir)
    fs.mkdirSync(absDir, { recursive: true })
    const fileName = `board_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
    const absOut = path.join(absDir, fileName)

    const compose = (withText: boolean) =>
      sharp({
        create: {
          width: totalWidth,
          height: totalHeight,
          channels: 3,
          background: '#ffffff',
        },
      })
        .composite([
          ...tileOverlays,
          // 退化路径：编号色块不带文字（纯色块，顺序仍从左到右对应编号）
          ...badgePositions.map((b) => ({
            input: badgeSvg(b.slot, withText, badgeSize),
            left: b.left,
            top: b.top,
          })),
        ])
        .png()

    try {
      await compose(true).toFile(absOut)
    } catch (e) {
      console.warn('[reference-board] SVG 文字渲染失败，退化为纯色编号块:', e)
      await compose(false).toFile(absOut)
    }

    return {
      path: path.join(relDir, fileName).replace(/\\/g, '/'),
      width: totalWidth,
      height: totalHeight,
      members: outMembers,
    }
  }
}
