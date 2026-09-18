/**
 * 知识大脑 IPC 处理器（T12，详细设计 §7.1 核心集）
 * @module core/packs/knowledge-base/handlers/kb-brain.handler
 *
 * 前缀 `kb:brain:` 落在包 manifest 的 'kb:' 前缀内（ipc-guard 自动覆盖）。
 * distill（手动提炼触发）随 T14 上线；review 通道随 M3 FSRS 上线。
 */
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { getKbBrainPanelService } from '@core/platform/services/kb-brain/brain-panel.service'
import type { SearchResult } from '@shared/types/knowledge-base.types'

let kbService: KnowledgeBaseService | null = null
function svc(): KnowledgeBaseService {
  if (!kbService) kbService = new KnowledgeBaseService()
  return kbService
}

export function registerKbBrainHandlers(): void {
  const panel = getKbBrainPanelService()

  ipcBridge.handle('kb:brain:get-config', (_e, p: { kbId: string }) => panel.getConfig(p.kbId))

  ipcBridge.handle('kb:brain:update-config', (_e, p: { kbId: string; patch: Record<string, unknown> }) =>
    panel.updateConfig(p.kbId, p.patch as never),
  )

  ipcBridge.handle('kb:brain:doc-status', async (_e, p: { kbId: string }) => {
    const out = await svc().getDocuments(p.kbId)
    if (!out.success || !out.data) return out
    const db = await import('@core/database/database-manager.interface')
    const manager = db.getCoreDatabaseManager()
    const docs = out.data.map((d) => ({
      id: d.id,
      name: d.name,
      brainStatus: (d as unknown as { brainStatus?: string }).brainStatus ?? null,
      brainProgress: (d as unknown as { brainProgress?: number }).brainProgress ?? null,
      brainError: (d as unknown as { brainError?: string }).brainError ?? null,
    }))
    void manager
    return { success: true, data: docs }
  })

  ipcBridge.handle('kb:brain:list-atoms', (_e, p: { kbId: string; documentId?: string; page?: number; pageSize?: number; status?: string; type?: string }) =>
    panel.listAtoms(p),
  )

  ipcBridge.handle('kb:brain:get-atom', (_e, p: { atomId: string }) => panel.getAtom(p.atomId))

  ipcBridge.handle('kb:brain:list-notes', (_e, p: { kbId: string; status?: string; type?: string; page?: number; pageSize?: number }) =>
    panel.listNotes(p),
  )

  ipcBridge.handle('kb:brain:proposal-inbox', (_e, p: { kbId: string; page?: number; pageSize?: number }) => panel.proposalInbox(p))

  ipcBridge.handle('kb:brain:decide-proposal', (_e, p: { noteId: string; action: 'publish' | 'publish-edited' | 'reject'; patch?: { title?: string; body?: string; description?: string } }) =>
    panel.decideProposal(p),
  )

  ipcBridge.handle('kb:brain:list-lens', (_e, p: { kbId: string }) => panel.listLenses(p.kbId))

  ipcBridge.handle('kb:brain:upsert-lens', (_e, p: { kbId: string; id?: string; title: string; description: string; attendTo: string[]; questions: string[] }) =>
    panel.upsertLens(p),
  )

  ipcBridge.handle('kb:brain:capture-reading', (_e, p: { kbId: string; documentId: string; chapterId?: string; chapterHash?: string; quote: string; remark: string; startOffset?: number; endOffset?: number; lensNoteId?: string }) =>
    panel.captureReading(p),
  )

  ipcBridge.handle('kb:brain:stats', (_e, p: { kbId: string }) => panel.stats(p.kbId))

  // brain 检索直通（论断页签的调试检索 / 面板预览）
  ipcBridge.handle(
    'kb:brain:search',
    async (_e, p: { knowledgeBaseId: string; query: string; topK?: number; include?: Array<'chunk' | 'atom' | 'note'>; lensNoteId?: string; intent?: 'lookup' | 'synthesize' }) =>
      (await svc().search({ ...p })) as { success: boolean; data?: SearchResult[]; error?: string },
  )
}
