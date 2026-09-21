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
 *
 * 2026-09-21：sharp 合成全部在 common/sharp-worker 子进程执行（libvips 高频调用
 * 崩 Electron 主进程实测）；本 service 只剩路径解析 + 落盘位置 + 结果装配。
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { workerMakeBoard } from '@core/platform/episode-production/common/sharp-worker'

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

    // 读不出的成员跳过（其余成员编号不受影响——worker 对幸存成员重排 slot）
    const absMembers = members
      .filter((m) => {
        const abs = this.toAbs(m.imagePath)
        if (!fs.existsSync(abs)) {
          console.warn('[reference-board] 成员图不存在，跳过:', m.imagePath)
          return false
        }
        return true
      })
      .map((m) => ({
        imagePath: this.toAbs(m.imagePath),
        name: m.name,
        kind: m.kind,
        assetImageId: m.assetImageId,
      }))
    if (absMembers.length === 0) throw new Error('参考板成员图全部不可读')

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

    const out = await workerMakeBoard({ members: absMembers, outPath: absOut })

    return {
      path: path.join(relDir, fileName).replace(/\\/g, '/'),
      width: out.width,
      height: out.height,
      members: out.members.map((m) => ({
        assetImageId: m.assetImageId,
        name: m.name,
        kind: m.kind as ReferenceBoardMember['kind'],
        slot: m.slot,
      })),
    }
  }
}
