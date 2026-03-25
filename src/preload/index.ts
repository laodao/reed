/**
 * 预加载脚本
 * @module preload/index
 * @description 通过 contextBridge 安全暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'

// IPC 通道名称常量
const IPC_CHANNELS = {
  // 设置相关
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // API密钥相关
  API_KEY_LIST: 'api-key:list',
  API_KEY_SET: 'api-key:set',
  API_KEY_DELETE: 'api-key:delete',
  API_KEY_TEST: 'api-key:test',

  // 提供商模板相关
  PROVIDER_TEMPLATE_LIST: 'provider-template:list',

  // 提供商配置相关
  PROVIDER_CONFIG_LIST: 'provider-config:list',
  PROVIDER_CONFIG_GET: 'provider-config:get',
  PROVIDER_CONFIG_CREATE: 'provider-config:create',
  PROVIDER_CONFIG_UPDATE: 'provider-config:update',
  PROVIDER_CONFIG_DELETE: 'provider-config:delete',
  PROVIDER_CONFIG_TEST: 'provider-config:test',
  PROVIDER_CONFIG_SET_DEFAULT: 'provider-config:set-default',
  PROVIDER_CONFIG_CHANGED: 'provider-config:changed',

  // 对话相关
  DIALOG_LIST: 'dialog:list',
  DIALOG_LIST_BY_ROLE: 'dialog:list-by-role',
  DIALOG_GET: 'dialog:get',
  DIALOG_CREATE: 'dialog:create',
  DIALOG_UPDATE: 'dialog:update',
  DIALOG_DELETE: 'dialog:delete',

  // 消息相关
  MESSAGE_LIST: 'message:list',
  MESSAGE_CREATE: 'message:create',
  MESSAGE_GET: 'message:get',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',

  // 角色相关
  ROLE_LIST: 'role:list',
  ROLE_GET: 'role:get',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  ROLE_DIALOG_COUNT: 'role:dialog-count',

  // 聊天相关（流式）
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_STOP: 'chat:stop',

  // 图像生成相关
  IMAGE_GENERATE: 'image:generate',
  IMAGE_TASK_STATUS: 'image:task-status',
  IMAGE_STOP: 'image:stop',
  IMAGE_LIST: 'image:list',
  IMAGE_GET: 'image:get',
  IMAGE_TOGGLE_FAVORITE: 'image:toggle-favorite',
  IMAGE_DELETE: 'image:delete',
  IMAGE_DELETE_MANY: 'image:delete-many',
  IMAGE_PROVIDERS: 'image:providers',
  IMAGE_MODELS: 'image:models',
  IMAGE_TEST_PROVIDER: 'image:test-provider',
  IMAGE_DOWNLOAD: 'image:download',
  IMAGE_SELECT_FILE: 'image:select-file'
} as const

/**
 * 暴露给渲染进程的 API
 */
const electronAPI = {
  // 设置相关
  settings: {
    get: (key?: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value })
  },

  // API密钥相关（保留兼容）
  apiKey: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_LIST),
    set: (provider: string, key: string, endpoint?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_SET, { provider, key, endpoint }),
    delete: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_DELETE, { provider }),
    test: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_TEST, { provider })
  },

  // 提供商模板相关
  providerTemplate: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_TEMPLATE_LIST)
  },

  // 提供商配置相关
  providerConfig: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_GET, id),
    create: (data: {
      templateId: string
      name: string
      shortId?: string
      apiKey?: string
      accessKeyId?: string
      accessKeySecret?: string
      baseUrl?: string
      imageBaseUrl?: string
      videoBaseUrl?: string
      audioBaseUrl?: string
      customHeaders?: Record<string, string>
      customParams?: Record<string, unknown>
      models?: Array<{
        id: string
        name: string
        type?: string
        contextWindow: number
        maxOutputTokens: number
        features: string[]
        supportsThinking?: boolean
        supportsWebSearch?: boolean
        supportsTools?: boolean
      }>
      isEnabled?: boolean
      isDefault?: boolean
    }) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_CREATE, data),
    update: (
      id: string,
      data: Partial<{
        name: string
        shortId: string
        apiKey: string
        accessKeyId: string
        accessKeySecret: string
        baseUrl: string
        imageBaseUrl: string
        videoBaseUrl: string
        audioBaseUrl: string
        customHeaders: Record<string, string>
        customParams: Record<string, unknown>
        models?: Array<{
          id: string
          name: string
          type?: string
          contextWindow: number
          maxOutputTokens: number
          features: string[]
          supportsThinking?: boolean
          supportsWebSearch?: boolean
          supportsTools?: boolean
        }>
        isEnabled: boolean
        isDefault: boolean
      }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_DELETE, id),
    test: (data: {
      configId?: string
      templateId?: string
      apiKey?: string
      accessKeyId?: string
      accessKeySecret?: string
      baseUrl?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_TEST, data),
    setDefault: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_SET_DEFAULT, id),
    // 监听配置变化
    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.PROVIDER_CONFIG_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_CONFIG_CHANGED, handler)
    }
  },

  // 对话相关
  dialog: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_LIST),
    listByRole: (roleId: string | null) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_LIST_BY_ROLE, roleId),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_GET, id),
    create: (data: {
      title?: string
      modelId: string
      providerConfigId?: string
      roleId?: string
      systemPrompt?: string
      contextConfig?: { maxMessages: number; maxTokens: number }
    }) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CREATE, data),
    update: (
      id: string,
      data: Partial<{
        title: string
        systemPrompt: string
        contextConfig: { maxMessages: number; maxTokens: number }
        modelId: string
        providerConfigId: string
      }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_DELETE, id)
  },

  // 消息相关
  message: {
    list: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_LIST, dialogId),
    get: (messageId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_GET, messageId),
    create: (data: {
      dialogId: string
      role: 'user' | 'assistant' | 'system'
      content: string
      modelId?: string
      tokensUsed?: number
      attachments?: Array<{
        id: string
        type: 'image' | 'document'
        fileName: string
        filePath: string
        fileSize: number
        mimeType: string
      }>
      metadata?: {
        thinkingChain?: string
        webSearch?: Array<{ title: string; url: string; snippet: string }>
        knowledgeBase?: string[]
      }
    }) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_CREATE, data),
    update: (
      id: string,
      content: string
    ) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_UPDATE, { id, content }),
    delete: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_DELETE, dialogId),
    deleteSingle: (messageId: string) => ipcRenderer.invoke('message:deleteSingle', messageId)
  },

  // 角色相关
  role: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ROLE_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_GET, id),
    create: (data: {
      name: string
      description?: string
      systemPrompt?: string
      avatar?: string
      // 模型配置
      defaultModelId?: string
      defaultProviderConfigId?: string
      autoResetModel?: boolean
      // 生成参数
      temperature?: number
      topP?: number
      maxContextMessages?: number
      maxTokens?: number
      enableStream?: boolean
      customParams?: Record<string, unknown>
    }) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_CREATE, data),
    update: (
      id: string,
      data: Partial<{
        name: string
        description: string
        systemPrompt: string
        avatar: string
        // 模型配置
        defaultModelId: string
        defaultProviderConfigId: string
        autoResetModel: boolean
        // 生成参数
        temperature: number
        topP: number
        maxContextMessages: number
        maxTokens: number
        enableStream: boolean
        customParams: Record<string, unknown>
      }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_DELETE, id),
    getDialogCount: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_DIALOG_COUNT, id)
  },

  // 聊天相关（流式消息）
  chat: {
    send: (data: {
      dialogId: string
      content: string
      attachments?: Array<{
        id: string
        type: 'image' | 'document'
        fileName: string
        filePath: string
        fileSize: number
        mimeType: string
      }>
      enableWebSearch?: boolean
      enableThinkingChain?: boolean
      modelId?: string
      providerConfigId?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, data),
    stop: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, dialogId),
    onStream: (callback: (event: any, data: any) => void) => {
      const handler = (event: any, data: any) => callback(event, data)
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM, handler)
    }
  },

  // 图像生成相关
  image: {
    // 生成图像
    generate: (request: {
      providerId: string
      modelId: string
      prompt: string
      negativePrompt?: string
      width: number
      height: number
      style?: string
      quality?: string
      count?: number
      seed?: number
      referenceImage?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_GENERATE, request),
    // 获取任务状态
    getTaskStatus: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_TASK_STATUS, taskId),
    // 停止生成
    stop: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_STOP, taskId),
    // 获取图像列表
    list: (page?: number, pageSize?: number, favoriteOnly?: boolean, status?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIST, page, pageSize, favoriteOnly, status),
    // 获取单个图像
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_GET, id),
    // 切换收藏状态
    toggleFavorite: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_TOGGLE_FAVORITE, id),
    // 删除图像
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_DELETE, id),
    // 批量删除图像
    deleteMany: (ids: string[]) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_DELETE_MANY, ids),
    // 获取图像提供商列表
    getProviders: () => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_PROVIDERS),
    // 获取图像模型列表
    getModels: (providerId?: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_MODELS, providerId),
    // 测试提供商连接
    testProvider: (providerId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_TEST_PROVIDER, providerId),
    // 下载图像到本地
    download: (imageId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_DOWNLOAD, imageId),
    // 选择参考图片
    selectFile: () =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_SELECT_FILE),
    // 监听图像生成事件
    onGenerationEvent: (callback: (event: any, data: {
      type: 'generation-started' | 'generation-progress' | 'generation-completed' | 'generation-failed'
      taskId: string
      images?: any[]
      status?: string
      progress?: number
      error?: string
    }) => void) => {
      const handler = (event: any, data: any) => callback(event, data)
      ipcRenderer.on('image:generation-event', handler)
      return () => ipcRenderer.removeListener('image:generation-event', handler)
    }
  },

  // 文件对话框
  file: {
    // 打开文件选择对话框
    openDialog: (options?: {
      multiple?: boolean
      filters?: Array<{ name: string; extensions: string[] }>
    }) => ipcRenderer.invoke('file:open-dialog', options),
    // 读取文件内容（用于预览）
    readAsBase64: (filePath: string) => ipcRenderer.invoke('file:read-base64', filePath)
  },

  // 翻译相关
  translation: {
    // 获取翻译提供商列表
    getProviders: () => ipcRenderer.invoke('translation:providers'),
    // 文本翻译
    text: (request: {
      text: string
      sourceLanguage: string
      targetLanguage: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('translation:text', request),
    // 文件翻译
    file: (request: {
      filePath: string
      sourceLanguage: string
      targetLanguage: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('translation:file', request),
    // 选择文件
    selectFile: () => ipcRenderer.invoke('translation:select-file'),
    // 获取历史
    history: (query: {
      page: number
      pageSize: number
      type?: 'text' | 'file'
      favorite?: boolean
    }) => ipcRenderer.invoke('translation:history', query),
    // 获取详情
    get: (id: string) => ipcRenderer.invoke('translation:get', id),
    // 切换收藏
    toggleFavorite: (id: string) => ipcRenderer.invoke('translation:toggle-favorite', id),
    // 删除
    delete: (id: string) => ipcRenderer.invoke('translation:delete', id),
    // 下载
    download: (id: string) => ipcRenderer.invoke('translation:download', id),
    // 进度监听
    onProgress: (callback: (data: { translationId: string; progress: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('translation:progress', handler)
      return () => ipcRenderer.removeListener('translation:progress', handler)
    },
    // 完成监听
    onCompleted: (callback: (data: { translationId: string; targetFile: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('translation:completed', handler)
      return () => ipcRenderer.removeListener('translation:completed', handler)
    },
    // 失败监听
    onFailed: (callback: (data: { translationId: string; error: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('translation:failed', handler)
      return () => ipcRenderer.removeListener('translation:failed', handler)
    },
    // 打开文件夹
    openFolder: (filePath: string) => ipcRenderer.invoke('translation:open-folder', filePath)
  },

  // 语音相关
  voice: {
    // 获取语音提供商列表
    getProviders: () => ipcRenderer.invoke('voice:providers'),
    // 获取发音人列表
    getVoices: (providerId?: string, language?: string) =>
      ipcRenderer.invoke('voice:voices', providerId, language),
    // 文本转语音
    tts: (request: {
      text: string
      voiceId: string
      language?: string
      speed?: number
      pitch?: number
      volume?: number
      emotion?: string
      style?: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('voice:tts', request),
    // 语音转文本
    stt: (request: {
      audioPath?: string
      audioData?: string
      language?: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('voice:stt', request),
    // 语音复刻
    clone: (request: {
      name: string
      sampleAudioPath?: string
      sampleAudioData?: string
      providerId?: string
    }) => ipcRenderer.invoke('voice:clone', request),
    // 选择音频文件
    selectFile: () => ipcRenderer.invoke('voice:select-file'),
    // 获取语音历史
    history: (query: {
      page: number
      pageSize: number
      type?: 'tts' | 'stt'
      favorite?: boolean
    }) => ipcRenderer.invoke('voice:history', query),
    // 删除语音记录
    delete: (id: string) => ipcRenderer.invoke('voice:delete', id),
    // 切换收藏
    toggleFavorite: (id: string) => ipcRenderer.invoke('voice:toggle-favorite', id),
    // 获取复刻声音列表
    getClonedVoices: () => ipcRenderer.invoke('voice:cloned-list'),
    // 删除复刻声音
    deleteClonedVoice: (id: string) => ipcRenderer.invoke('voice:cloned-delete', id),
    // TTS 完成监听
    onTTSCompleted: (callback: (data: { recordId: string; audioPath: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('voice:tts-completed', handler)
      return () => ipcRenderer.removeListener('voice:tts-completed', handler)
    },
    // STT 完成监听
    onSTTCompleted: (callback: (data: { recordId: string; text: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('voice:stt-completed', handler)
      return () => ipcRenderer.removeListener('voice:stt-completed', handler)
    },
    // 下载音频
    download: (audioPath: string) => ipcRenderer.invoke('voice:download', audioPath)
  },

  // 数据路径相关
  dataPath: {
    // 获取数据路径配置
    getConfig: () => ipcRenderer.invoke('data-path:get-config'),
    // 选择数据路径
    select: () => ipcRenderer.invoke('data-path:select'),
    // 设置数据路径
    set: (newPath: string, migrate?: boolean) => ipcRenderer.invoke('data-path:set', newPath, migrate),
    // 重置为默认路径
    reset: (migrate?: boolean) => ipcRenderer.invoke('data-path:reset', migrate),
    // 获取迁移状态
    getMigrationStatus: () => ipcRenderer.invoke('data-path:migration-status'),
    // 计算数据大小
    calculateSize: () => ipcRenderer.invoke('data-path:calculate-size'),
    // 打开数据目录
    openFolder: () => ipcRenderer.invoke('data-path:open-folder')
  }
}

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript 类型声明
export type ElectronAPI = typeof electronAPI
