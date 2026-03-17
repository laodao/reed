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

  // 对话相关
  DIALOG_LIST: 'dialog:list',
  DIALOG_GET: 'dialog:get',
  DIALOG_CREATE: 'dialog:create',
  DIALOG_UPDATE: 'dialog:update',
  DIALOG_DELETE: 'dialog:delete',

  // 消息相关
  MESSAGE_LIST: 'message:list',
  MESSAGE_CREATE: 'message:create',
  MESSAGE_DELETE: 'message:delete',

  // 角色相关
  ROLE_LIST: 'role:list',
  ROLE_GET: 'role:get',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete'
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

  // API密钥相关
  apiKey: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_LIST),
    set: (provider: string, key: string, endpoint?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_SET, { provider, key, endpoint }),
    delete: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_DELETE, { provider }),
    test: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_TEST, { provider })
  },

  // 对话相关
  dialog: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_GET, id),
    create: (data: { title?: string; modelId: string; roleId?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CREATE, data),
    update: (id: string, data: Partial<{ title: string; systemPrompt: string }>) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_DELETE, id)
  },

  // 消息相关
  message: {
    list: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_LIST, dialogId),
    create: (data: {
      dialogId: string
      role: string
      content: string
      modelId?: string
      tokensUsed?: number
    }) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_CREATE, data),
    delete: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_DELETE, dialogId)
  },

  // 角色相关
  role: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ROLE_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_GET, id),
    create: (data: { name: string; description?: string; systemPrompt?: string; avatar?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLE_CREATE, data),
    update: (
      id: string,
      data: Partial<{ name: string; description: string; systemPrompt: string; avatar: string }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_DELETE, id)
  }
}

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript 类型声明
export type ElectronAPI = typeof electronAPI
