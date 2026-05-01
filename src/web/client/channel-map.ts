/**
 * Channel 别名 / 参数转换覆盖表
 * @module web/client/channel-map
 * @description preload 中部分方法名与 IPC channel 不是简单的 "namespace.method"
 *              kebab 化，且部分调用会把多参数包装成单个对象（如
 *              `providerConfig.update(id, data)` → `invoke(channel, { id, data })`）。
 *
 *              这张表显式声明这两类不一致：
 *              - channel：覆盖默认 kebab 化的 channel 名
 *              - wrap：把前端 (...args) 转换为后端 handler 期望的参数列表
 *
 *              对端 handler 收到的 args 列表必须与 Electron preload 调用时一致。
 */

export interface ChannelEntry {
  /** 显式 IPC channel；缺省则按 kebab 化的 namespace:method */
  channel?: string
  /** 参数包装：对应 Electron preload 里把多参数包成 {id, data} 等的逻辑 */
  wrap?: (...args: unknown[]) => unknown[]
}

const wrapIdData = (id: unknown, data: unknown) => [{ id, data }]
const wrapIdRequest = (id: unknown, data: unknown) => [{ id, request: data }]

export const CHANNEL_OVERRIDES: Record<string, ChannelEntry> = {
  // --- settings ---
  'settings.get': { channel: 'settings:get' },
  'settings.set': {
    channel: 'settings:set',
    wrap: (key, value) => [{ key, value }],
  },

  // --- apiKey ---
  'apiKey.list': { channel: 'api-key:list' },
  'apiKey.set': {
    channel: 'api-key:set',
    wrap: (provider, key, endpoint) => [{ provider, key, endpoint }],
  },
  'apiKey.delete': {
    channel: 'api-key:delete',
    wrap: (provider) => [{ provider }],
  },
  'apiKey.test': {
    channel: 'api-key:test',
    wrap: (provider) => [{ provider }],
  },

  // --- providerTemplate ---
  'providerTemplate.list': { channel: 'provider-template:list' },

  // --- providerConfig ---
  'providerConfig.list': { channel: 'provider-config:list' },
  'providerConfig.get': { channel: 'provider-config:get' },
  'providerConfig.create': { channel: 'provider-config:create' },
  'providerConfig.update': {
    channel: 'provider-config:update',
    wrap: wrapIdData,
  },
  'providerConfig.delete': { channel: 'provider-config:delete' },
  'providerConfig.test': { channel: 'provider-config:test' },
  'providerConfig.setDefault': { channel: 'provider-config:set-default' },
  'providerConfig.onChanged': { channel: 'provider-config:changed' },

  // --- chat ---
  'chat.send': { channel: 'chat:send' },
  'chat.stop': { channel: 'chat:stop' },
  'chat.onStream': { channel: 'chat:stream' },

  // --- dialog ---
  'dialog.update': { channel: 'dialog:update', wrap: wrapIdData },

  // --- message ---
  'message.update': {
    channel: 'message:update',
    wrap: (id, content) => [{ id, content }],
  },

  // --- role ---
  'role.update': { channel: 'role:update', wrap: wrapIdData },

  // --- file ---
  'file.writeText': {
    channel: 'file:write-text',
    wrap: (filePath, content) => [{ filePath, content }],
  },
  'file.copy': {
    channel: 'file:copy',
    wrap: (sourcePath, targetPath) => [{ sourcePath, targetPath }],
  },

  // --- knowledgeBase ---
  'knowledgeBase.update': { channel: 'knowledge-base:update', wrap: wrapIdRequest },
  'knowledgeBase.addDocument': {
    channel: 'knowledge-base:add-document',
    wrap: (knowledgeBaseId, data) => [{ knowledgeBaseId, data }],
  },
  'knowledgeBase.addWebpage': {
    channel: 'knowledge-base:add-webpage',
    wrap: (knowledgeBaseId, url) => [{ knowledgeBaseId, url }],
  },
  'knowledgeBase.uploadDocuments': {
    channel: 'knowledge-base:upload-documents',
    wrap: (knowledgeBaseId, files) => [{ knowledgeBaseId, files }],
  },
  'knowledgeBase.getDocumentChunksPaginated': {
    channel: 'knowledge-base:get-document-chunks-paginated',
    wrap: (documentId, page, pageSize) => [{ documentId, page, pageSize }],
  },

  // --- searchEngine ---
  'searchEngine.update': { channel: 'search-engine:update', wrap: wrapIdData },
  'searchEngine.setQuickEnabled': {
    channel: 'search-engine:set-quick-enabled',
    wrap: (engineId, enabled) => [{ engineId, enabled }],
  },

  // --- diary ---
  'diary.updateFolder': { channel: 'diary:update-folder', wrap: wrapIdRequest },
  'diary.updateEntry': { channel: 'diary:update-entry', wrap: wrapIdRequest },
  'diary.moveEntry': {
    channel: 'diary:move-entry',
    wrap: (id, targetFolderId) => [{ id, targetFolderId }],
  },
  'diary.search': {
    channel: 'diary:search',
    wrap: (keyword, folderId) => [{ keyword, folderId }],
  },
  'diary.exportHtml': {
    channel: 'diary:export-html',
    wrap: (entryId, outputPath) => [{ entryId, outputPath }],
  },
  'diary.exportPdf': {
    channel: 'diary:export-pdf',
    wrap: (entryId, outputPath) => [{ entryId, outputPath }],
  },
  'diary.exportDocx': {
    channel: 'diary:export-docx',
    wrap: (entryId, outputPath) => [{ entryId, outputPath }],
  },

  // --- oss ---
  'oss.updateConfig': {
    channel: 'oss:update-config',
    wrap: (id, data) => [{ id, ...(data as Record<string, unknown>) }],
  },
}
