/**
 * 设计包服务（46 号：研讨室长程任务产物 + 整体确认制）
 * @module core/packs/longwriting/story-room/room-design
 *
 * design 模式的写工具（lw_save_*）只把设计产物落进「设计包」草稿
 * （wizard_state.room.designPackages，零 schema 迁移）；任务结束后发
 * `design:ready`，用户在确认面板整包/逐项确认后才走正式落库：
 * - card     → StoryRoomDistillerService.persistByKind（与 ⚡ 采纳同路径）
 * - event    → lwEvents.create（chapterNumber=0 → state=planned）
 * - relation → lwGraphEdges（new=名称解析建边；ended=终结仍生效边）
 *
 * 所有写操作经 mutateRoomState 串行队列（async mutator 会被队列 await，
 * 串行语义保持）；包数量/条目数量有上限防膨胀。
 */

import { createLogger } from '@core/utils/logger'
import type { DesignItem, DesignItemKind, DesignPackage, RoomWorkspaceState } from '@shared/types/story-room.types'
import type { GraphEntityType } from '@shared/types/longwriting.types'
import { mutateRoomState } from './room-state'
import { StoryRoomDistillerService } from './room-distiller'
import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'

const logger = createLogger('StoryRoomDesign')

/** 保留的包总数上限（最老终态包先清理；draft 不清） */
const DESIGN_PACKAGE_CAP = 20
/** 单包含条目上限（超限的写工具调用会被拒绝并提示收尾） */
export const DESIGN_ITEM_CAP = 24

export interface AddDesignItemInput {
  kind: DesignItemKind
  label: string
  payload: Record<string, any>
  note?: string
  /** 任务标题（建包时用；已建包则更新空/默认标题） */
  taskTitle?: string
  sourceTurn?: number
}

/** 取当前 draft 包（无则建；写路径串行） */
export async function ensureDraftPackage(
  db: any,
  projectId: string,
  opts: { taskTitle?: string; sourceTurn?: number } = {},
): Promise<DesignPackage> {
  const next = await mutateRoomState(db, projectId, (cur) => {
    const draft = cur.designPackages.find((p) => p.status === 'draft')
    if (draft) {
      if (opts.taskTitle && (!draft.title || draft.title === '设计任务')) {
        return {
          ...cur,
          designPackages: cur.designPackages.map((p) =>
            p.id === draft.id ? { ...p, title: opts.taskTitle! } : p,
          ),
        }
      }
      return cur
    }
    const seq = cur.designSeq + 1
    const pkg: DesignPackage = {
      id: `dp_${seq}_${Date.now().toString(36)}`,
      title: opts.taskTitle || '设计任务',
      status: 'draft',
      items: [],
      sourceTurn: opts.sourceTurn ?? cur.turnNo,
      createdAt: Date.now(),
    }
    return trimPackages({ ...cur, designPackages: [...cur.designPackages, pkg], designSeq: seq })
  })
  const pkg = next.designPackages.find((p) => p.status === 'draft')
  if (!pkg) throw new Error('设计包草稿创建失败（状态写入异常）')
  return pkg
}

/** 追加设计条目到 draft 包（满员抛错，由工具层转为可读提示） */
export async function addDesignItem(
  db: any,
  projectId: string,
  input: AddDesignItemInput,
): Promise<DesignItem> {
  const next = await mutateRoomState(db, projectId, (cur) => {
    const draft = cur.designPackages.find((p) => p.status === 'draft')
    if (!draft) throw new Error('设计包草稿不存在（应先 ensureDraftPackage）')
    if (draft.items.length >= DESIGN_ITEM_CAP) {
      throw new Error(`设计包已满（${DESIGN_ITEM_CAP} 项）——请收尾本轮任务，待用户确认后再继续`)
    }
    const item: DesignItem = {
      id: `di_${draft.items.length + 1}_${Date.now().toString(36)}`,
      kind: input.kind,
      label: input.label,
      payload: input.payload,
      note: input.note,
      createdAt: Date.now(),
    }
    const packages = cur.designPackages.map((p) =>
      p.id === draft.id ? { ...draft, items: [...draft.items, item] } : p,
    )
    return { ...cur, designPackages: packages }
  })
  const pkg = next.designPackages.find((p) => p.status === 'draft')
  return pkg!.items[pkg!.items.length - 1]
}

export interface DesignConfirmResult {
  itemId: string
  label: string
  ok: boolean
  message: string
}

/**
 * 确认设计包（整包或逐项）：确认项走正式落库，逐项容错。
 * - itemIds 缺省 = 整包确认（包转 confirmed）；给定 = 部分确认（剩余项留在 draft）
 */
export async function confirmDesignPackage(
  db: any,
  projectId: string,
  packageId: string,
  itemIds?: string[],
): Promise<{ ok: boolean; results: DesignConfirmResult[] }> {
  const distiller = StoryRoomDistillerService.getInstance()
  const graph = new GraphService(db)
  const results: DesignConfirmResult[] = []

  const next = await mutateRoomState(db, projectId, async (cur) => {
    const pkg = cur.designPackages.find((p) => p.id === packageId)
    if (!pkg) throw new Error(`设计包不存在：${packageId}`)
    if (pkg.status !== 'draft') throw new Error('该设计包已处理过')
    const targets = itemIds?.length ? pkg.items.filter((i) => itemIds.includes(i.id)) : pkg.items
    const rest = itemIds?.length ? pkg.items.filter((i) => !itemIds.includes(i.id)) : []

    // 实跑修复：落库失败的条目保留在草稿包里（旧实现无论成败一律移出，失败即丢数据）
    const failed: DesignItem[] = []
    for (const item of targets) {
      const r = await persistDesignItem(db, projectId, item, distiller, graph)
      if (!r.ok) failed.push(item)
      results.push({ itemId: item.id, label: item.label, ok: r.ok, message: r.message })
    }

    const allOk = failed.length === 0
    const packages = cur.designPackages.map((p) =>
      p.id === packageId
        ? {
            ...p,
            items: [...rest, ...failed],
            status: itemIds?.length ? p.status : allOk ? ('confirmed' as const) : ('draft' as const),
            confirmedAt: itemIds?.length ? p.confirmedAt : allOk ? Date.now() : p.confirmedAt,
          }
        : p,
    )
    return trimPackages({ ...cur, designPackages: packages })
  })

  const pkg = next.designPackages.find((p) => p.id === packageId)
  const okAll = results.every((r) => r.ok)
  logger.info(
    `[story-room] 设计包确认 project=${projectId} pkg=${packageId} items=${results.length} ok=${okAll} 状态=${pkg?.status}`,
  )
  return { ok: okAll, results }
}

/** 驳回设计包（不改正式表） */
export async function discardDesignPackage(db: any, projectId: string, packageId: string): Promise<void> {
  await mutateRoomState(db, projectId, (cur) => {
    const packages = cur.designPackages.map((p) =>
      p.id === packageId && p.status === 'draft'
        ? { ...p, status: 'discarded' as const, confirmedAt: Date.now() }
        : p,
    )
    return trimPackages({ ...cur, designPackages: packages })
  })
}

/** 单条设计项落正式表（确认时调用；逐项容错，失败返回消息不抛错） */
async function persistDesignItem(
  db: any,
  projectId: string,
  item: DesignItem,
  distiller: StoryRoomDistillerService,
  graph: GraphService,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (item.kind === 'card') {
      // 实跑修复：lw_save_card 的 payload 形状是 { taskTitle, card:{kind,title,data,…} }——
      // 旧实现读 payload.kind/payload.data 恒为 undefined，卡片一律误落 custom 分支且数据为空
      const raw = item.payload as Record<string, any>
      const shell = (raw.card ?? raw) as Record<string, any>
      const card = {
        id: item.id,
        kind: (shell.kind ?? raw.kind ?? 'custom') as never,
        title: String(shell.title ?? item.label),
        data: ((shell.data ?? raw.data ?? shell) as Record<string, any>),
        status: 'pending' as const,
        sourceTurns: (shell.sourceTurns ?? raw.sourceTurns ?? []) as number[],
        createdAt: item.createdAt,
      }
      const r = await distiller.persistByKind(db, projectId, card as never, card.data)
      return { ok: r.ok || !!r.skipped, message: r.message }
    }

    if (item.kind === 'event') {
      const p = item.payload as {
        name?: string
        description?: string
        involvedEntities?: Array<{ type: string; id?: string; name: string }>
        stateBefore?: string
        stateAfter?: string
        chapterNumber?: number
      }
      const chapter = Number(p.chapterNumber) || 0
      const row = await db?.lwEvents?.create({
        projectId,
        name: String(p.name || item.label),
        description: p.description,
        chapterNumber: chapter,
        involvedEntities: p.involvedEntities,
        stateBefore: p.stateBefore,
        stateAfter: p.stateAfter,
        state: chapter > 0 ? 'happened' : 'planned',
      })
      return { ok: !!row, message: row ? `事件已登记（第 ${chapter || '—'} 章 · ${row.state ?? 'happened'}）` : '事件落库失败' }
    }

    if (item.kind === 'relation') {
      const p = item.payload as {
        sourceType?: GraphEntityType
        sourceName?: string
        targetType?: GraphEntityType
        targetName?: string
        changeType?: 'new' | 'ended'
        relationType?: string
        description?: string
        validFromChapter?: number
      }
      if (p.changeType === 'ended') {
        // 终结 source↔target 间 relationType 的仍生效边（研讨期默认=故事开始前已终结）
        const r = await graph.applyRelationChanges(
          projectId,
          [{
            changeType: 'ended',
            sourceType: p.sourceType ?? 'character',
            sourceName: String(p.sourceName || ''),
            targetType: p.targetType ?? 'character',
            targetName: String(p.targetName || ''),
            relationType: String(p.relationType || 'related'),
            description: p.description,
          }],
          p.validFromChapter ?? 0,
        )
        return { ok: r.ended > 0, message: r.ended > 0 ? `已终结 ${r.ended} 段关系` : '未找到仍生效的该关系' }
      }
      const r = await graph.syncEntityRelations(
        projectId,
        [{
          sourceType: p.sourceType ?? 'character',
          sourceName: String(p.sourceName || ''),
          targetType: p.targetType ?? 'character',
          targetName: String(p.targetName || ''),
          relationType: String(p.relationType || 'related'),
          description: p.description,
        }],
        { validFromChapter: p.validFromChapter ?? 1, origin: { type: 'discussion' } },
      )
      // 实跑修复：已存在（skipped）与建边成功同视为完成——否则重复提交的关系永远卡在草稿包
      return {
        ok: r.created > 0 || r.skipped > 0,
        message: r.created > 0 ? '关系已建边' : r.skipped > 0 ? '关系已存在，未重复建边' : '关系落库失败（名称未解析或数据缺失）',
      }
    }

    return { ok: false, message: `未知条目类型：${item.kind}` }
  } catch (e: any) {
    return { ok: false, message: e?.message || '落库异常' }
  }
}

/** 终态包超过保留上限时清最老（draft 永不清） */
function trimPackages(cur: RoomWorkspaceState): RoomWorkspaceState {
  const terminal = cur.designPackages.filter((p) => p.status !== 'draft')
  if (terminal.length <= DESIGN_PACKAGE_CAP) return cur
  const dropIds = new Set(
    terminal
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, terminal.length - DESIGN_PACKAGE_CAP)
      .map((p) => p.id),
  )
  return { ...cur, designPackages: cur.designPackages.filter((p) => !dropIds.has(p.id)) }
}
