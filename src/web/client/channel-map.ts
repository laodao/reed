/**
 * Channel 契约表（自动从 src/preload/index.ts 推导，单一事实源）
 * @module web/client/channel-map
 * @description Web 端 bridge 用此表把 electronAPI.<ns>.<method>(...args)
 *              映射到正确的后端 channel + 参数形态。preload 中的
 *              ipcRenderer.invoke 关系是契约权威，本表与之保持一致。
 *
 *              修改 preload 后请同步更新本表（见 scripts/gen-channel-map 文档）。
 */


export interface ChannelEntry {
  channel?: string
  wrap?: (...args: unknown[]) => unknown[]
  /**
   * 仅事件订阅（onXxx）使用：根据订阅时传入的非 cb 前置参数计算动态 channel。
   * 例：`onGenerateEvent(eventId, cb)` → `eventChannel(eventId)` 返回
   *     `longwriting:generate:${eventId}`。
   * bridge 在 onXxx 分支检测到此字段，会把除最后一个 cb 外的所有参数转发给它。
   */
  eventChannel?: (...args: unknown[]) => string
  /**
   * 仅事件订阅（onXxx）使用：渲染端的回调签名是否保留 Electron 的 IpcRendererEvent
   * 第一个参数（即 `(event, data) => ...`）。
   * - false / 未设：preload 在 PC 端已 strip 掉 event，回调形如 `(data) => ...`，
   *   Web bridge 直接 `cb(data)`。
   * - true：preload 把 `(event, data)` 透传给业务回调（如 chat.onStream /
   *   image.onGenerationEvent）。Web bridge 模拟成 `cb(undefined, data)` 对齐契约，
   *   避免业务侧 `data` 收到 undefined。
   */
  legacyEventArg?: boolean
}

export const CHANNEL_OVERRIDES: Record<string, ChannelEntry> = {
  'settings.get': { channel: 'settings:get' },
  'settings.set': { channel: 'settings:set', wrap: (key, value) => [{ key, value }] },
  'apiKey.list': { channel: 'api-key:list' },
  'apiKey.set': { channel: 'api-key:set', wrap: (provider, key, endpoint) => [{ provider, key, endpoint }] },
  'apiKey.delete': { channel: 'api-key:delete', wrap: (provider) => [{ provider }] },
  'apiKey.test': { channel: 'api-key:test', wrap: (provider) => [{ provider }] },
  'providerTemplate.list': { channel: 'provider-template:list' },
  'providerConfig.list': { channel: 'provider-config:list' },
  'providerConfig.get': { channel: 'provider-config:get' },
  'providerConfig.create': { channel: 'provider-config:create' },
  'providerConfig.update': { channel: 'provider-config:update', wrap: (id, data) => [{ id, data }] },
  'providerConfig.delete': { channel: 'provider-config:delete' },
  'providerConfig.test': { channel: 'provider-config:test' },
  'providerConfig.setDefault': { channel: 'provider-config:set-default' },
  // AI Hub 统一网关（账号会话/模型刷新/计费）
  'aihub.login': { channel: 'aihub:login' },
  'aihub.register': { channel: 'aihub:register' },
  'aihub.logout': { channel: 'aihub:logout' },
  'aihub.session': { channel: 'aihub:session' },
  'aihub.setEnabled': { channel: 'aihub:set-enabled', wrap: (enabled: unknown) => [{ enabled }] },
  'aihub.enabled': { channel: 'aihub:enabled' },
  'aihub.refreshModels': { channel: 'aihub:refresh-models' },
  'aihub.saveGatewayConfig': { channel: 'aihub:save-gateway-config' },
  'aihub.balance': { channel: 'aihub:balance' },
  'aihub.redeem': { channel: 'aihub:redeem', wrap: (code: unknown) => [{ code }] },
  'aihub.rechargeUrl': { channel: 'aihub:recharge-url' },
  // aihub.onSessionChanged(cb) — 后端 emit('aihub:session-changed', data)；preload 已 strip event
  'aihub.onSessionChanged': { channel: 'aihub:session-changed' },
  'dialog.list': { channel: 'dialog:list' },
  'dialog.listByRole': { channel: 'dialog:list-by-role' },
  'dialog.get': { channel: 'dialog:get' },
  'dialog.create': { channel: 'dialog:create' },
  'dialog.update': { channel: 'dialog:update', wrap: (id, data) => [{ id, data }] },
  'dialog.delete': { channel: 'dialog:delete' },
  'dialog.touch': { channel: 'dialog:touch' },
  'message.list': { channel: 'message:list' },
  'message.get': { channel: 'message:get' },
  'message.create': { channel: 'message:create' },
  'message.update': { channel: 'message:update', wrap: (id, content) => [{ id, content }] },
  'message.delete': { channel: 'message:delete' },
  'message.deleteSingle': { channel: 'message:deleteSingle' },
  'role.list': { channel: 'role:list' },
  'role.get': { channel: 'role:get' },
  'role.create': { channel: 'role:create' },
  'role.update': { channel: 'role:update', wrap: (id, data) => [{ id, data }] },
  'role.delete': { channel: 'role:delete' },
  'role.getDialogCount': { channel: 'role:dialog-count' },
  'chat.send': { channel: 'chat:send' },
  'chat.stop': { channel: 'chat:stop' },
  // chat.onStream(cb) — 后端 emit('chat:stream', event)
  // PC preload 透传 (event, data)，渲染端按 (event, data) 解构 → 标 legacyEventArg
  'chat.onStream': { channel: 'chat:stream', legacyEventArg: true },
  // M5.5 Agent 工作台（29 号）。键名必须含全层级（bridge 按 dot path 精确查找）；
  // preload 契约已是对象入参（wrap 只透传）；preload 已 strip event（无 legacyEventArg）
  'workflow.agentConsole.listSessions': { channel: 'ac:list-sessions' },
  'workflow.agentConsole.getTrajectory': { channel: 'ac:get-trajectory', wrap: (p: unknown) => [p] },
  'workflow.agentConsole.getContext': { channel: 'ac:get-context', wrap: (p: unknown) => [p] },
  'workflow.agentConsole.stop': { channel: 'ac:stop', wrap: (p: unknown) => [p] },
  'workflow.agentConsole.onTrajectory': { channel: 'ac:trajectory' },
  'workflow.agentConsole.onRunUpdate': { channel: 'ac:run-update' },
  'workflow.draftFromNl': { channel: 'wf:draft-from-nl', wrap: (p: unknown) => [p] },
  'image.generate': { channel: 'image:generate' },
  'image.getTaskStatus': { channel: 'image:task-status' },
  'image.stop': { channel: 'image:stop' },
  'image.list': { channel: 'image:list' },
  'image.get': { channel: 'image:get' },
  'image.toggleFavorite': { channel: 'image:toggle-favorite' },
  'image.delete': { channel: 'image:delete' },
  'image.deleteMany': { channel: 'image:delete-many' },
  'image.getProviders': { channel: 'image:providers' },
  'image.getModels': { channel: 'image:models' },
  'image.testProvider': { channel: 'image:test-provider' },
  'image.download': { channel: 'image:download' },
  'image.selectFile': { channel: 'image:select-file' },
  // image.onGenerationEvent(cb) — 后端 emit('image:generation-event', event)
  // PC preload 透传 (event, data)，渲染端 useImage handleGenerationEvent(event, data)
  'image.onGenerationEvent': { channel: 'image:generation-event', legacyEventArg: true },
  'file.openDialog': { channel: 'file:open-dialog' },
  'file.readAsBase64': { channel: 'file:read-base64' },
  'file.saveFile': { channel: 'file:save-dialog' },
  'file.writeTextFile': { channel: 'file:write-text', wrap: (filePath, content) => [{ filePath, content }] },
  'file.writeBinaryFile': { channel: 'file:write-binary', wrap: (filePath, base64) => [{ filePath, base64 }] },
  'file.openFolderDialog': { channel: 'file:open-folder-dialog' },
  'file.copyFile': { channel: 'file:copy', wrap: (sourcePath, targetPath) => [{ sourcePath, targetPath }] },
  'export.messageAsImage': { channel: 'export:message-image' },
  'export.messageAsWord': { channel: 'export:message-word' },
  'export.getObsidianVaults': { channel: 'export:get-obsidian-vaults' },
  'export.getVaultDirectories': { channel: 'export:get-vault-directories' },
  'export.getVaultFiles': { channel: 'export:get-vault-files' },
  'export.toObsidian': { channel: 'export:to-obsidian' },
  'translation.getProviders': { channel: 'translation:providers' },
  'translation.text': { channel: 'translation:text' },
  'translation.file': { channel: 'translation:file' },
  'translation.selectFile': { channel: 'translation:select-file' },
  'translation.history': { channel: 'translation:history' },
  'translation.get': { channel: 'translation:get' },
  'translation.toggleFavorite': { channel: 'translation:toggle-favorite' },
  'translation.delete': { channel: 'translation:delete' },
  'translation.download': { channel: 'translation:download' },
  'translation.openFolder': { channel: 'translation:open-folder' },
  // translation.onProgress / onCompleted / onFailed
  'translation.onProgress': { channel: 'translation:progress' },
  'translation.onCompleted': { channel: 'translation:completed' },
  'translation.onFailed': { channel: 'translation:failed' },
  'voice.getProviders': { channel: 'voice:providers' },
  'voice.getVoices': { channel: 'voice:voices' },
  'voice.tts': { channel: 'voice:tts' },
  'voice.stt': { channel: 'voice:stt' },
  'voice.clone': { channel: 'voice:clone' },
  'voice.selectFile': { channel: 'voice:select-file' },
  'voice.history': { channel: 'voice:history' },
  'voice.delete': { channel: 'voice:delete' },
  'voice.toggleFavorite': { channel: 'voice:toggle-favorite' },
  'voice.getClonedVoices': { channel: 'voice:cloned-list' },
  'voice.deleteClonedVoice': { channel: 'voice:cloned-delete' },
  'voice.refreshCloneStatus': { channel: 'voice:clone-refresh-status' },
  'voice.preview': { channel: 'voice:preview' },
  'voice.download': { channel: 'voice:download' },
  // voice.onTTSCompleted / onSTTCompleted / onCloneCompleted / onCloneFailed
  'voice.onTTSCompleted': { channel: 'voice:tts-completed' },
  'voice.onSTTCompleted': { channel: 'voice:stt-completed' },
  'voice.onCloneCompleted': { channel: 'voice:clone-completed' },
  'voice.onCloneFailed': { channel: 'voice:clone-failed' },
  // 声音设计
  'voice.designVoice': { channel: 'voice:design' },
  'voice.getDesignedVoices': { channel: 'voice:designed-list' },
  'voice.deleteDesignedVoice': { channel: 'voice:designed-delete' },
  'voice.refreshDesignStatus': { channel: 'voice:design-refresh-status' },
  'voice.previewDesignedVoice': { channel: 'voice:design-preview' },
  'dataPath.getConfig': { channel: 'data-path:get-config' },
  'dataPath.select': { channel: 'data-path:select' },
  'dataPath.set': { channel: 'data-path:set' },
  'dataPath.reset': { channel: 'data-path:reset' },
  'dataPath.getMigrationStatus': { channel: 'data-path:migration-status' },
  'dataPath.calculateSize': { channel: 'data-path:calculate-size' },
  'dataPath.openFolder': { channel: 'data-path:open-folder' },
  // ==================== 工作流（与 preload workflow 命名空间严格同步） ====================
  'workflow.listDefinitions': { channel: 'wf:list-definitions' },
  'workflow.getDefinition': { channel: 'wf:get-definition' },
  'workflow.createDefinition': { channel: 'wf:create-definition' },
  'workflow.updateDefinition': { channel: 'wf:update-definition' },
  'workflow.saveDraft': { channel: 'wf:save-draft' },
  'workflow.deleteDefinition': { channel: 'wf:delete-definition' },
  'workflow.publishDefinition': { channel: 'wf:publish-definition' },
  'workflow.validateGraph': { channel: 'wf:validate-graph' },
  'workflow.validateTriggers': { channel: 'wf:validate-triggers' },
  'workflow.exportDefinition': { channel: 'wf:export-definition' },
  'workflow.importDefinition': { channel: 'wf:import-definition' },
  'workflow.startRun': { channel: 'wf:start-run' },
  'workflow.cancelRun': { channel: 'wf:cancel-run' },
  'workflow.resumeRun': { channel: 'wf:resume-run' },
  'workflow.reviewDecide': { channel: 'wf:review-decide' },
  'workflow.getRun': { channel: 'wf:get-run' },
  'workflow.listRunLogs': { channel: 'wf:list-run-logs' },
  'workflow.collectNodeOutput': { channel: 'wf:collect-node-output' },
  'workflow.listRuns': { channel: 'wf:list-runs' },
  'workflow.deleteRun': { channel: 'wf:delete-run' },
  'workflow.getPendingReviews': { channel: 'wf:get-pending-reviews' },
  'workflow.listReviewed': { channel: 'wf:list-reviewed' },
  'workflow.getNodeTrajectories': { channel: 'wf:get-node-trajectories' },
  'workflow.createPlan': { channel: 'at:create-plan' },
  'workflow.approvePlan': { channel: 'at:approve-plan', wrap: (...args: unknown[]) => [{ rootId: args[0] }] },
  'workflow.getTaskTree': { channel: 'at:get-tree', wrap: (...args: unknown[]) => [{ rootId: args[0] }] },
  'workflow.listTaskRoots': { channel: 'at:list-roots' },
  'workflow.taskVerifyDecide': { channel: 'at:verify-decide' },
  'workflow.taskEscalateDecide': { channel: 'at:escalate-decide' },
  'workflow.cancelTask': { channel: 'at:cancel', wrap: (...args: unknown[]) => [{ rootId: args[0] }] },
  'workflow.listMemoryPending': { channel: 'am:list-pending' },
  'workflow.listMemoryActive': { channel: 'am:list-active' },
  'workflow.listMemoryArchived': { channel: 'am:list-archived' },
  'workflow.approveMemory': { channel: 'am:approve', wrap: (...args: unknown[]) => [{ id: args[0] }] },
  'workflow.archiveMemory': { channel: 'am:archive', wrap: (...args: unknown[]) => [{ id: args[0] }] },
  'workflow.addManualMemory': { channel: 'am:add-manual', wrap: (...args: unknown[]) => [args[0]] },
  'workflow.rejectMemory': { channel: 'am:reject', wrap: (...args: unknown[]) => [{ id: args[0] }] },
  'workflow.triggerPreview': { channel: 'wf:trigger-preview' },
  'workflow.listAgentTools': { channel: 'wf:list-agent-tools' },
  'workflow.enableShare': { channel: 'wf:enable-share' },
  'workflow.reportToPdf': { channel: 'wf:report-to-pdf' },
  'workflow.uploadFormFile': { channel: 'wf:form-upload' },
  'workflow.disableShare': { channel: 'wf:disable-share' },
  'workflow.listVersions': { channel: 'wf:list-versions' },
  'workflow.restoreVersion': { channel: 'wf:restore-version' },
  'workflow.onRunEvent': { channel: 'wf:run-event' },
  // ==================== 应用（与 preload app/appSession 严格同步） ====================
  // 应用数据（与 preload appData 严格同步）
  // ==================== P0 工具（与 preload tools 严格同步） ====================
  'tools.listCredentials': { channel: 'tool:list-credentials' },
  'tools.saveCredential': { channel: 'tool:save-credential' },
  'tools.deleteCredential': { channel: 'tool:delete-credential' },
  'tools.listCustom': { channel: 'tool:list-custom' },
  'tools.saveCustom': { channel: 'tool:save-custom' },
  'tools.updateCustom': { channel: 'tool:update-custom' },
  'tools.deleteCustom': { channel: 'tool:delete-custom' },
  'tools.presets': { channel: 'tool:presets' },
  // ==================== 技能（与 preload skills 命名空间严格同步） ====================
  'knowledgeBase.list': { channel: 'knowledge-base:list' },
  'knowledgeBase.get': { channel: 'knowledge-base:get' },
  'knowledgeBase.create': { channel: 'knowledge-base:create' },
  'knowledgeBase.update': { channel: 'knowledge-base:update', wrap: (id, data) => [{ id, request: data }] },
  'knowledgeBase.delete': { channel: 'knowledge-base:delete' },
  'knowledgeBase.listFolders': { channel: 'kb:folder-list' },
  'knowledgeBase.createFolder': { channel: 'kb:folder-create' },
  'knowledgeBase.renameFolder': { channel: 'kb:folder-rename', wrap: (id, name) => [{ id, name }] },
  'knowledgeBase.deleteFolder': { channel: 'kb:folder-delete' },
  'knowledgeBase.listQaPairs': { channel: 'kb-qa:list' },
  'knowledgeBase.addQaPair': { channel: 'kb-qa:add' },
  'knowledgeBase.updateQaPair': { channel: 'kb-qa:update' },
  'knowledgeBase.deleteQaPair': { channel: 'kb-qa:delete' },
  'knowledgeBase.searchQa': { channel: 'kb-qa:search' },
  // 知识大脑（T12）：13 通道，preload 单对象签名直传
  'knowledgeBase.brain.getConfig': { channel: 'kb:brain:get-config', wrap: (kbId: string) => [{ kbId }] },
  'knowledgeBase.brain.updateConfig': { channel: 'kb:brain:update-config' },
  'knowledgeBase.brain.docStatus': { channel: 'kb:brain:doc-status', wrap: (kbId: string) => [{ kbId }] },
  'knowledgeBase.brain.digestDocument': { channel: 'kb:brain:digest-document', wrap: (documentId: string) => [{ documentId }] },
  'knowledgeBase.brain.listAtoms': { channel: 'kb:brain:list-atoms' },
  'knowledgeBase.brain.consolidateRun': { channel: 'kb:brain:consolidate-run', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.consolidateStatus': { channel: 'kb:brain:consolidate-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.cleanupRun': { channel: 'kb:brain:cleanup-run', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.cleanupStatus': { channel: 'kb:brain:cleanup-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.layerRelabelRun': { channel: 'kb:brain:layer-relabel-run', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.layerRelabelStatus': { channel: 'kb:brain:layer-relabel-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.autoLogList': {
    channel: 'kb:brain:auto-log-list',
    wrap: (kbId: unknown, limit?: unknown) => [{ kbId: kbId as string, limit: limit as number | undefined }],
  },
  'knowledgeBase.brain.autoLogUndo': { channel: 'kb:brain:auto-log-undo', wrap: (logId: unknown) => [{ logId: logId as string }] },
  'knowledgeBase.brain.bookPassesRun': { channel: 'kb:brain:book-passes-run', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.readingRun': { channel: 'kb:brain:reading-run', wrap: (kbId: unknown, documentId?: unknown) => [{ kbId: kbId as string, documentId: documentId as string | undefined }] },
  'knowledgeBase.brain.readingStatus': { channel: 'kb:brain:reading-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.graphBuildRun': { channel: 'kb:brain:graph-build-run', wrap: (kbId: unknown, documentId: unknown) => [{ kbId: kbId as string, documentId: documentId as string }] },
  'knowledgeBase.brain.graphData': { channel: 'kb:brain:graph-data', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.reviewRun': { channel: 'kb:brain:review-run', wrap: (kbId: unknown, documentId: unknown, docName: unknown) => [{ kbId: kbId as string, documentId: documentId as string, docName: docName as string }] },
  'knowledgeBase.brain.summaryRun': { channel: 'kb:brain:summary-run', wrap: (kbId: unknown, documentId: unknown, docName: unknown) => [{ kbId: kbId as string, documentId: documentId as string, docName: docName as string }] },
  'knowledgeBase.brain.bookPassesStatus': { channel: 'kb:brain:book-passes-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.foreshadowRun': { channel: 'kb:brain:foreshadow-run', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.foreshadowStatus': { channel: 'kb:brain:foreshadow-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.getAtom': { channel: 'kb:brain:get-atom', wrap: (atomId: string) => [{ atomId }] },
  'knowledgeBase.brain.listNotes': { channel: 'kb:brain:list-notes' },
  'knowledgeBase.brain.proposalInbox': { channel: 'kb:brain:proposal-inbox' },
  'knowledgeBase.brain.decideProposal': { channel: 'kb:brain:decide-proposal' },
  'knowledgeBase.brain.listLens': { channel: 'kb:brain:list-lens', wrap: (kbId: string) => [{ kbId }] },
  'knowledgeBase.brain.upsertLens': { channel: 'kb:brain:upsert-lens' },
  'knowledgeBase.brain.captureReading': { channel: 'kb:brain:capture-reading' },
  'knowledgeBase.brain.stats': { channel: 'kb:brain:stats', wrap: (kbId: string) => [{ kbId }] },
  'knowledgeBase.brain.search': { channel: 'kb:brain:search' },
  'knowledgeBase.brain.distill': { channel: 'kb:brain:distill' },
  'knowledgeBase.brain.conflicts': { channel: 'kb:brain:conflicts', wrap: (kbId: string) => [{ kbId }] },
  'knowledgeBase.brain.resolveConflict': { channel: 'kb:brain:resolve-conflict' },
  'knowledgeBase.brain.research': { channel: 'kb:brain:research', wrap: (question: string) => [{ question }] },
  'knowledgeBase.brain.onResearch': { channel: 'kb:brain:research' },
  'knowledgeBase.brain.onProgress': { channel: 'kb:brain:progress' },
  'knowledgeBase.brain.onStatus': { channel: 'kb:brain:status' },
  'knowledgeBase.brain.exportSkill': { channel: 'kb:brain:export-skill', wrap: (noteId: string) => [{ noteId }] },
  'knowledgeBase.brain.taste': { channel: 'kb:brain:taste', wrap: (kbId: string) => [{ kbId }] },
  'knowledgeBase.brain.listModels': { channel: 'kb:brain:list-models' },
  'knowledgeBase.brain.goalRun': { channel: 'kb:brain:goal-run' },
  'knowledgeBase.brain.goalStatus': { channel: 'kb:brain:goal-status', wrap: (kbId: unknown) => [{ kbId: kbId as string }] },
  'knowledgeBase.brain.reviewNext': { channel: 'kb:brain:review-next' },
  'knowledgeBase.brain.reviewGrade': { channel: 'kb:brain:review-grade' },
  'knowledgeBase.importQaXlsx': { channel: 'kb-qa:import-xlsx' },
  'knowledgeBase.exportQaXlsx': { channel: 'kb-qa:export-xlsx' },
  'knowledgeBase.addDocument': { channel: 'knowledge-base:add-document', wrap: (knowledgeBaseId, data) => [{ knowledgeBaseId, data }] },
  'knowledgeBase.addWebpage': { channel: 'knowledge-base:add-webpage', wrap: (knowledgeBaseId, url) => [{ knowledgeBaseId, url }] },
  'knowledgeBase.uploadDocuments': { channel: 'knowledge-base:upload-documents', wrap: (knowledgeBaseId, files) => [{ knowledgeBaseId, files }] },
  'knowledgeBase.getDocuments': { channel: 'knowledge-base:get-documents' },
  'knowledgeBase.deleteDocument': { channel: 'knowledge-base:delete-document' },
  'knowledgeBase.reprocessDocument': { channel: 'knowledge-base:reprocess-document' },
  'knowledgeBase.resumeDocument': { channel: 'knowledge-base:resume-document' },
  'knowledgeBase.getDocumentChunks': { channel: 'knowledge-base:get-document-chunks' },
  'knowledgeBase.getDocumentChunksPaginated': { channel: 'knowledge-base:get-document-chunks-paginated', wrap: (documentId, page, pageSize, chapterTitle) => [{ documentId, page, pageSize, chapterTitle }] },
  'knowledgeBase.getChunk': { channel: 'knowledge-base:get-chunk' },
  'knowledgeBase.getChapterTree': { channel: 'knowledge-base:get-chapter-tree', wrap: (documentId) => [{ documentId }] },
  'knowledgeBase.summarizeDocument': { channel: 'knowledge-base:summarize-document', wrap: (documentId, retryFailed) => [{ documentId, retryFailed }] },
  'knowledgeBase.search': { channel: 'knowledge-base:search' },
  'knowledgeBase.getEmbeddingModels': { channel: 'knowledge-base:get-embedding-models' },
  'knowledgeBase.getRerankModels': { channel: 'knowledge-base:get-rerank-models' },
  'knowledgeBase.selectFiles': { channel: 'knowledge-base:select-files' },
  'knowledgeBase.getFileLimits': { channel: 'knowledge-base:get-file-limits' },
  // ==================== 领域共学空间（与 preload domainLearning 命名空间严格同步） ====================
  // preload 命名空间是 domainLearning，但后端通道全部为 dl:*，且单 id 参数方法
  // 需要包裹成 { id } 对象形态——必须显式覆盖，否则 Web 端 fallback 生成
  // 'domain-learning:list-spaces'（kebab）与后端 'dl:list-spaces' 不匹配，Web 端整体不可用。
  // 方案确认流程（2026-09-13）
  // domainLearning.onAgentEvent(spaceId, conceptId?, cb) — 后端 emit(`dl:agent:<spaceId>[:<conceptId>]`, event)
  // domainLearning.onStream(eventId, cb) — 后端 emit(`dl:generate:${eventId}`, { type:'content', content })
  // portrait.onGenerationEvent — 后端 emit('portrait:generation-event', event)
  'searchEngine.getTemplates': { channel: 'search-engine:templates' },
  'searchEngine.list': { channel: 'search-engine:list' },
  'searchEngine.get': { channel: 'search-engine:get' },
  'searchEngine.create': { channel: 'search-engine:create' },
  'searchEngine.update': { channel: 'search-engine:update', wrap: (id, data) => [{ id, data }] },
  'searchEngine.delete': { channel: 'search-engine:delete' },
  'searchEngine.test': { channel: 'search-engine:test' },
  'searchEngine.setDefault': { channel: 'search-engine:set-default' },
  'searchEngine.search': { channel: 'search-engine:search' },
  'searchEngine.getDisabledQuickEngines': { channel: 'search-engine:get-disabled-quick' },
  'searchEngine.setQuickEngineEnabled': { channel: 'search-engine:set-quick-enabled', wrap: (engineId, enabled) => [{ engineId, enabled }] },
  // ==================== 信息来源（类别/分组/来源；与 preload infoSource* 严格同步） ====================
  // ==================== 网站 favicon（与 preload favicon 严格同步） ====================
  'favicon.get': { channel: 'favicon:get', wrap: (url) => [{ url }] },
  // ==================== 通用资产库 / 资产中心（与 preload assets 严格同步） ====================
  // preload 命名空间是复数 assets，但后端 handler 注册的是单数 asset:*，且多数单参数方法
  // 需要包裹成 { id } / { category } 等对象形态——必须显式覆盖，否则 Web 端 fallback 生成
  // 'assets:list'（复数）与后端 'asset:list' 不匹配，资产中心在 Web 端整体不可用。
  // longwriting.onGenerateEvent(eventId, cb) — 后端 emit(`longwriting:generate:${eventId}`, ...)
  // longwriting.onNewEntitiesDetected(eventId, cb) — 后端 emit(`longwriting:new-entities-detected:${eventId}`, ...)
  // 阶段2：图谱 / 事件 / 向导 / 取消
  // 对话式工作流 Agent
  // ==================== 故事研讨室（v2.1） ====================
  // ==================== 设定资产库（世界观库 + 角色 IP 库，2026-09-24 P0） ====================
  // longwriting.onRoomEvent(projectId, cb) — 后端 emit(`longwriting:room:${projectId}`, ...)
  'diary.listFolders': { channel: 'diary:list-folders' },
  'diary.getAllFolders': { channel: 'diary:get-all-folders' },
  'diary.createFolder': { channel: 'diary:create-folder' },
  'diary.updateFolder': { channel: 'diary:update-folder', wrap: (id, data) => [{ id, request: data }] },
  'diary.deleteFolder': { channel: 'diary:delete-folder' },
  'diary.listEntries': { channel: 'diary:list-entries' },
  'diary.getEntry': { channel: 'diary:get-entry' },
  'diary.createEntry': { channel: 'diary:create-entry' },
  'diary.updateEntry': { channel: 'diary:update-entry', wrap: (id, data) => [{ id, request: data }] },
  'diary.deleteEntry': { channel: 'diary:delete-entry' },
  'diary.moveEntry': { channel: 'diary:move-entry', wrap: (id, targetFolderId) => [{ id, targetFolderId }] },
  'diary.search': { channel: 'diary:search', wrap: (keyword, folderId) => [{ keyword, folderId }] },
  'diary.getBacklinks': { channel: 'diary:get-backlinks' },
  'diary.listDeleted': { channel: 'diary:list-deleted' },
  'diary.restoreEntry': { channel: 'diary:restore-entry' },
  'diary.purgeEntry': { channel: 'diary:purge-entry' },
  'diary.emptyTrash': { channel: 'diary:empty-trash' },
  'diary.listByDateRange': { channel: 'diary:list-by-date-range', wrap: (from, to, folderId) => [{ from, to, folderId }] },
  'diary.listAllEntries': { channel: 'diary:list-all-entries' },
  'diary.getOnThisDay': { channel: 'diary:get-on-this-day' },
  'diary.getInspiration': { channel: 'diary:get-inspiration' },
  'diary.setFolderBrainOptIn': { channel: 'diary:set-folder-brain-opt-in', wrap: (folderId, enabled) => [{ folderId, enabled }] },
  'diary.uploadAttachment': { channel: 'diary:upload-attachment' },
  'diary.deleteAttachment': { channel: 'diary:delete-attachment' },
  'diary.describeAttachment': { channel: 'diary:describe-attachment' },
  'diary.getWritingPrompt': { channel: 'diary:get-writing-prompt' },
  'diary.createReflection': { channel: 'diary:create-reflection' },
  'diary.exportHtml': { channel: 'diary:export-html', wrap: (entryId, outputPath) => [{ entryId, outputPath }] },
  'diary.exportPdf': { channel: 'diary:export-pdf', wrap: (entryId, outputPath) => [{ entryId, outputPath }] },
  'diary.exportDocx': { channel: 'diary:export-docx', wrap: (entryId, outputPath) => [{ entryId, outputPath }] },
  // 9 帧故事板预览（spec 2026-05-09 ep-redesign §3.2 B7）
  // 跨项目角色库（spec 2026-05-09 ep-redesign §3.2 D2）
  // 视频解析（spec 2026-05-09 ep-redesign §3.2 D5）
  // 数字人池（spec 2026-05-09 ep-redesign §3.2 D3）
  // 视频提取主体（spec 2026-05-09 ep-redesign §3.2 E1 · Phase 5）
  // FU5-A9-L2 分镜背景 ref（panorama_snapshot 绑入分镜）
  // spec 2026-05-08：场景级 AI 润色
  // 追加剧本（已有剧本继续增加内容 · 增量不覆盖已有场次）
  // P4-T6 引用解析 + 完整性校验
  // P5-T8 多关键帧
  // 关键帧一致性校验（2026-09-19）
  // S-05 定妆图确认闸门（2026-09-17）：影响面统计 + 级联重生
  // P5-T13 视频片段
  // 视频片段制重构（2026-09-04）：分段 + 片段级生成
  // S-03 手动分段（2026-09-16 ep-studio-polish）
  // S-07 片段排序
  // S-06 场景级局部重拆 / 局部重生
  // P6-T5 合成 + 导出 MP4
  // S-07 导出留档
  // S-09 用量统计
  // P5-T14/T15 V3 binding-aware 场景音频
  // P6-T13 顶部 6 段阶段进度条（spec §2.1）
  // 剧集项目界面集列表聚合（spec §6.1）
  // P6-T16 阶段门控（spec §2.3 软引导）
  // P5-T32 分镜内角色独立配置（spec §4.5.3）
  // P5/P6-FU1 剧本 binding 修复
  // FU4-1 ① 内容 stage AI 识别要素
  // 「AI 写剧本」生成故事原文
  // 「批量创建剧集」分析剧本文件 + 批量建集
  // FU5-B2 ① 内容 stage 整理 / 取舍
  // ===== V2.5 资产域 channel 映射（与 V2 channel 共存；走 *AssetService） =====
  // 角色资产（10 个）
  // 一键多角度参考图（spec 2026-05-09 ep-redesign §3.2 B3）
  // 角色形象组（spec 2026-05-09 ep-redesign §3.2 D1）
  // 地点资产（9 个）
  // 物品资产（8 个）
  // 语音资产（5 个）
  // 统一图谱（7 个）
  // spec 2026-05-09 多主图模型
  // AI 设定反推（spec 2026-05-07）
  // T01 · 资产写回影响范围统计（参数 (assetType, assetId) 与 preload 透传形态一致，无需 wrap）
  // AI 正向字段提取（spec 2026-05-09 ep-redesign §3.2 B2）
  // 派生（2 个）
  // 引用导入（2 个）
  // 360 全景 + 视角截图（7 个 · P3c Task 4）
  // episodeProduction.on*Progress(cb) — 后端 emit('ep:*-progress', event)
  // PC preload 透传 (event, data)，渲染端按 (_event, data) 解构 → 标 legacyEventArg
  // P6 对话式制作 Agent
  // episodeProduction.onAgentEvent(projectId, episodeId, scope, cb) — 后端 emit(`ep-agent:${projectId}:${episodeId}[:${scope}]`, event)
  // scope=界面域（script/asset-character/storyboard/compose…）：各界面独立订阅；缺省=无域全局通道
  'oss.listConfigs': { channel: 'oss:list-configs' },
  'oss.getConfig': { channel: 'oss:get-config' },
  'oss.createConfig': { channel: 'oss:create-config' },
  'oss.updateConfig': { channel: 'oss:update-config', wrap: (id, data) => [{ id, ...data }] },
  'oss.deleteConfig': { channel: 'oss:delete-config' },
  'oss.setDefault': { channel: 'oss:set-default' },
  'oss.toggleEnabled': { channel: 'oss:toggle-enabled' },
  'oss.testConnection': { channel: 'oss:test-connection' },
  'oss.uploadFile': { channel: 'oss:upload-file' },
  // 业务包（pack:list 走兜底推导也能对上；setEnabled 因 camelCase 需显式映射 + 参数包对象）
  'pack.list': { channel: 'pack:list' },
  'pack.setEnabled': { channel: 'pack:setEnabled', wrap: (packId, enabled) => [{ packId, enabled }] },
  // ==================== 通知中心（与 preload notification 命名空间严格同步） ====================
  'notification.list': { channel: 'notification:list' },
  'notification.markRead': { channel: 'notification:mark-read', wrap: (seqs) => [{ seqs }] },
  'notification.markAllRead': { channel: 'notification:mark-all-read' },
  'notification.unreadCount': { channel: 'notification:unread-count' },
}