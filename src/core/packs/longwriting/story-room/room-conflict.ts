/**
 * 疑点 AI 解题服务（52 号 UI 优化）
 * @module core/packs/longwriting/story-room/room-conflict
 *
 * 一致性疑点（R1-R9）的解决思路生成与受控执行：
 * - plan：按疑点聚合「局部真相」——涉及实体的状态时间线、关系边、相关章节的大纲与正文片段、
 *   伏笔台账行——只喂图谱邻域而非全书，模型在结构化证据上给诊断 + 候选解决方案；
 * - execute：只执行受控动作（伏笔标记回收/弃置、未登记人名入册、忽略队列行、修正误报切片），
 *   正文修改永远以「建议文本」形式交作者确认，不静默改稿。
 *
 * 模型能否理清错综关联？单靠塞全书既超窗又稀释注意力；正确姿势是图谱检索式上下文：
 * 疑点自带的结构化邻域（状态时间线/关系/事件）就是模型需要的全部局部真相。
 */
import { createLogger } from '@core/utils/logger'
import { generateRoomText } from './room-llm'
import { GraphService } from '@core/platform/services/longwriting/graph/graph.service'
import { extractJsonObject } from '@core/platform/services/longwriting/story-persist'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

const logger = createLogger('StoryRoomConflict')

export interface ConflictInput {
  rule?: string
  message?: string
  entityName?: string
  entityType?: string
  chapterNumber?: number
}

export interface ConflictPlanOption {
  action: 'edit_chapter' | 'mark_foreshadow_paid' | 'mark_foreshadow_dropped' | 'adopt_character' | 'ignore_queue_row' | 'fix_snapshot' | 'none'
  label: string
  detail: string
  /** edit_chapter：建议的修改文本与目标章节 */
  editText?: { chapterName?: string; chapterNumber?: number; text: string }
  /** 受控动作所需的载荷（伏笔 id / 队列行 id / 切片 id 等） */
  applyPayload?: Record<string, unknown>
}

export interface ConflictPlan {
  diagnosis: string
  options: ConflictPlanOption[]
  recommended?: number
}

const ACTIONS_ALLOWED = ['edit_chapter', 'mark_foreshadow_paid', 'mark_foreshadow_dropped', 'adopt_character', 'ignore_queue_row', 'fix_snapshot', 'none']

/** 从疑点消息里抠出章节号集合（「第 3 章埋下，已写至第 10 章」等表述） */
function chaptersFromMessage(message: string): number[] {
  const out: number[] = []
  for (const m of message.matchAll(/第\s*(\d+)\s*章/g)) {
    const n = Number(m[1])
    if (Number.isFinite(n)) out.push(n)
  }
  return [...new Set(out)]
}

function clip(text: string, head = 320, tail = 160): string {
  const t = (text || '').trim()
  if (t.length <= head + tail) return t
  return `${t.slice(0, head)}\n……（中段略）……\n${t.slice(-tail)}`
}

/** 组装疑点的「图谱邻域」上下文：实体状态时间线 + 相关章节大纲与正文片段 + 伏笔台账 */
async function assembleContext(db: ICoreDatabaseManager, projectId: string, conflict: ConflictInput): Promise<string> {
  const m = db
  const parts: string[] = []
  const graph = new GraphService(m as never)

  const overview = await m?.lwStoryOverviews?.getByProjectId(projectId)
  if (overview?.summary) parts.push(`【故事概要】${clip(overview.summary, 220, 0)}`)

  const roster = ((await m?.lwCharacters?.getByProjectId(projectId)) || []).map((c: any) => c.name)
  parts.push(`【名册】${roster.join('、') || '（空）'}`)

  parts.push(`【疑点】${conflict.rule ?? ''} ${conflict.message ?? ''}`)

  // 章节材料：疑点消息里提到的章节（至多 3 章），给大纲摘要 + 正文片段
  const chNums = chaptersFromMessage(conflict.message || '').slice(0, 3)
  if (m?.lwOutlines && m?.lwChapters) {
    const outlines = (await m.lwOutlines.getByProjectId(projectId)) || []
    for (const n of chNums) {
      const node = outlines.find(o => o.nodeType === 'chapter' && (o.name.startsWith(`${n} `) || o.name === `第${n}章` || o.orderIndex === n - 1))
      if (!node) continue
      const ch = await m.lwChapters.getByOutlineId(node.id)
      parts.push(`【第 ${n} 章大纲】${clip(node.summary || '', 200, 0)}`)
      if (ch?.content) parts.push(`【第 ${n} 章正文片段】${clip(ch.content)}`)
    }
  }

  // 实体邻域：状态时间线 + 相关事件
  if (conflict.entityName && m?.lwEntityStates) {
    const states = ((await m.lwEntityStates.getByProjectId(projectId)) || [])
      .filter((s: any) => s.entityName === conflict.entityName)
      .sort((a: any, b: any) => a.chapterNumber - b.chapterNumber)
    if (states.length > 0) {
      parts.push(`【${conflict.entityName} 状态时间线】\n${states.map((s: any) => `第${s.chapterNumber}章: ${s.stateSummary}`).join('\n').slice(0, 900)}`)
    }
    try {
      const timeline = await graph.getTimeline(projectId, (conflict.entityType as never) || 'character', conflict.entityId ?? '', undefined as never)
      void timeline
    } catch { /* 时间线可选 */ }
    const evs = ((await m.lwEvents?.getByProjectId(projectId)) || [])
      .filter((e: any) => (e.involvedEntities || '').includes(conflict.entityName!))
      .slice(0, 6)
    if (evs.length > 0) {
      parts.push(`【相关事件】\n${evs.map((e: any) => `第${e.chapterNumber}章 ${e.name}`).join('\n')}`)
    }
  }

  // R8：伏笔台账原文
  if ((conflict.rule === 'R8' || (conflict.message || '').includes('伏笔')) && m?.lwForeshadows) {
    const prefix = (conflict.message.match(/[「「]([^」」]{6,})/)?.[1] || '').slice(0, 24)
    const rows = ((await m.lwForeshadows.getByProjectId(projectId)) || [])
    const row = prefix ? rows.find(f => (f.content || '').includes(prefix)) : undefined
    if (row) {
      parts.push(`【伏笔台账】id=${row.id} status=${row.status} 埋设章=${row.plantedChapter ?? '?'} 回收章=${row.payoffChapter ?? '未'}\n内容：${clip(row.content || '', 200, 0)}`)
    }
  }

  // R9：队列行
  if (conflict.rule === 'R9' && m?.lwCustomEntities) {
    const rows = await m.lwCustomEntities.getByProjectAndKind(projectId, '未登记人物')
    const row = rows.find(r => r.name === conflict.entityName)
    if (row) parts.push(`【未登记队列】${row.name}（首见第 ${(row.fields as any)?.firstChapter ?? '?'} 章）id=${row.id}`)
  }

  return parts.join('\n\n').slice(0, 12000)
}

/** 生成疑点解决思路（结构化 JSON；解析失败 fail-soft 返回诊断文本） */
export async function planConflictResolution(
  db: ICoreDatabaseManager,
  projectId: string,
  conflict: ConflictInput,
  opts: { providerConfigId?: string; modelId?: string } = {},
): Promise<{ ok: boolean; plan?: ConflictPlan; raw?: string; error?: string }> {
  try {
    const context = await assembleContext(db, projectId, conflict)
    const system = `你是长篇小说的连续性写作教练。作者会给你一条一致性检查疑点和它的图谱邻域证据（实体状态时间线/相关章节大纲与正文片段/伏笔台账）。
你的任务：诊断疑点成因，并给出 1-3 个可执行的解决选项。
只输出严格 JSON（不要 markdown 代码块）：
{"diagnosis":"2-4 句成因诊断，引用证据","options":[{"action":"edit_chapter|mark_foreshadow_paid|mark_foreshadow_dropped|adopt_character|ignore_queue_row|fix_snapshot|none","label":"选项名（10字内）","detail":"具体怎么做，改哪一章哪个位置、怎么改，给出可直接使用的文字","editText":{"chapterName":"目标章名（仅 edit_chapter）","chapterNumber":3,"text":"建议插入/替换的正文文字（仅 edit_chapter，50-150 字）"},"applyPayload":{}}],"recommended":0}
约束：
- action 只能取上述枚举；正文修改一律用 edit_chapter（作者人工确认后自行应用），其余动作系统可代执行；
- R8 伏笔超期：若该伏笔在后续章节实际已隐性回收→建议 mark_foreshadow_paid 并说明；若本质是续篇钩子→mark_foreshadow_dropped 并说明；若确需补写→edit_chapter 给出回收段落建议；
- R9 名册外人名：若是有戏份的新角色→adopt_character；若是路人/提取误报→ignore_queue_row；
- R6 状态回退：先判断是提取误报（比喻/势力覆灭而非人物死亡）→fix_snapshot 或 ignore，还是真矛盾→edit_chapter 给出改法。`

    const user = `${context}\n\n请输出解决思路 JSON。`
    const raw = await generateRoomText('conflict-plan', { system, user, maxTokens: 2400 }, opts)
    const json = extractJsonObject(raw)
    if (!json || !Array.isArray(json.options)) {
      return { ok: true, raw, plan: { diagnosis: raw.slice(0, 800), options: [{ action: 'none', label: '仅诊断', detail: raw.slice(0, 800) }] } }
    }
    const options = json.options
      .filter((o: any) => o && ACTIONS_ALLOWED.includes(o.action))
      .map((o: any) => ({
        action: o.action,
        label: String(o.label || o.action).slice(0, 20),
        detail: String(o.detail || ''),
        editText: o.editText && typeof o.editText === 'object' ? { chapterName: o.editText.chapterName, chapterNumber: Number(o.editText.chapterNumber) || undefined, text: String(o.editText.text || '') } : undefined,
        applyPayload: (o.applyPayload && typeof o.applyPayload === 'object' ? o.applyPayload : {}),
      }))
    return { ok: true, plan: { diagnosis: String(json.diagnosis || ''), options: options.length > 0 ? options : [{ action: 'none', label: '仅诊断', detail: String(json.diagnosis || '') }], recommended: Number(json.recommended) || 0 } }
  } catch (e: any) {
    logger.error(`[story-room] 疑点解题失败 project=${projectId}: ${e?.message}`)
    return { ok: false, error: e?.message || String(e) }
  }
}

/** 受控执行：只放行可代执行的动作；返回可读结果 */
export async function executeConflictAction(
  db: ICoreDatabaseManager,
  projectId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (action === 'mark_foreshadow_paid' || action === 'mark_foreshadow_dropped') {
      const id = String(payload.foreshadowId || '')
      if (!id || !db?.lwForeshadows) return { ok: false, message: '缺少伏笔 ID' }
      const status = action === 'mark_foreshadow_paid' ? 'paid' : 'dropped'
      const payoff = action === 'mark_foreshadow_paid' ? Number(payload.payoffChapter) || null : null
      const row = await db.lwForeshadows.setStatus(id, status, payoff)
      return { ok: !!row, message: row ? `伏笔已标记为${status === 'paid' ? `已回收（第 ${payoff ?? '?'} 章）` : '弃置'}` : '伏笔不存在' }
    }
    if (action === 'adopt_character') {
      const name = String(payload.name || '').trim()
      if (!name || !db?.lwCharacters) return { ok: false, message: '缺少角色名' }
      const created = await db.lwCharacters.create({ projectId, name, rolePosition: String(payload.rolePosition || 'supporting'), gender: payload.gender || 'other' } as never)
      // 入册后移出未登记队列
      if (db?.lwCustomEntities) {
        const rows = await db.lwCustomEntities.getByProjectAndKind(projectId, '未登记人物')
        for (const r of rows) if (r.name === name) await db.lwCustomEntities.deleteRow(r.id)
      }
      return { ok: !!created, message: created ? `已将「${name}」入册` : '入册失败' }
    }
    if (action === 'ignore_queue_row') {
      const rowId = String(payload.rowId || '')
      if (!rowId || !db?.lwCustomEntities) return { ok: false, message: '缺少队列行 ID' }
      const ok = await db.lwCustomEntities.deleteRow(rowId)
      return { ok, message: ok ? '已忽略该候选' : '队列行不存在' }
    }
    if (action === 'fix_snapshot') {
      const snapId = String(payload.snapshotId || '')
      const newSummary = String(payload.newStateSummary || '')
      if (!snapId || !db?.lwEntityStates) return { ok: false, message: '缺少切片 ID' }
      const row = await db.lwEntityStates.getById(snapId)
      if (!row) return { ok: false, message: '状态切片不存在' }
      await db.lwEntityStates.update(snapId, { stateSummary: newSummary || `${row.stateSummary}（已人工修正为提取误报）` } as never)
      return { ok: true, message: '状态切片已修正' }
    }
    return { ok: false, message: '该选项不支持自动执行（正文修改请按建议文本人工应用）' }
  } catch (e: any) {
    return { ok: false, message: e?.message || '执行异常' }
  }
}
