/**
 * useChat 初始化链路单测
 *
 * 性能回归：进入 AI 对话页时 initialize() 的 IPC 调用链——
 * 原实现 selectLastDialog 会重复 dialog.list()、再按角色回源 listByRole，
 * 共 3 次对话列表查询（2 次全量 + 1 次按角色），拖慢首次打开。
 * 优化后只允许：role.list + dialog.list（并行）+ message.list（选中对话消息）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChat } from '../../../../src/renderer/src/composables/useChat'

/** 模拟数据 */
const roles = [
  { id: 'default-assistant', name: '默认助手', isBuiltin: true, systemPrompt: '' },
  { id: 'role-1', name: '写作助手', isBuiltin: false, systemPrompt: 'p' }
]
const dialogs = [
  { id: 'd-latest', title: '最近对话', roleId: 'role-1', modelId: 'm', providerConfigId: 'pc', messageCount: 1, createdAt: new Date('2026-08-01T10:00:00Z'), updatedAt: new Date('2026-08-02T10:00:00Z') },
  { id: 'd-old', title: '旧对话', roleId: null, modelId: 'm', providerConfigId: 'pc', messageCount: 0, createdAt: new Date('2026-07-01T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z') }
]
const messages = [
  { id: 'msg-1', dialogId: 'd-latest', role: 'user', content: 'hi', createdAt: new Date('2026-08-02T09:00:00Z') }
]

function installElectronAPIMock() {
  const calls: string[] = []
  const api = {
    role: {
      list: vi.fn(async () => { calls.push('role.list'); return { success: true, roles } })
    },
    dialog: {
      list: vi.fn(async () => { calls.push('dialog.list'); return { success: true, dialogs } }),
      listByRole: vi.fn(async (roleId: string | null) => { calls.push(`dialog.listByRole:${roleId}`); return { success: true, dialogs: dialogs.filter(d => d.roleId === roleId) } }),
      touch: vi.fn(async () => { calls.push('dialog.touch'); return { success: true } })
    },
    message: {
      list: vi.fn(async (dialogId: string) => { calls.push(`message.list:${dialogId}`); return { success: true, messages: messages.filter(m => m.dialogId === dialogId) } })
    }
  }
  ;(globalThis as any).window = { electronAPI: api }
  return { api, calls }
}

describe('useChat.initialize 初始化链路（性能回归）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('只查询一次对话列表：不重复 dialog.list、不按角色回源 listByRole', async () => {
    const { api, calls } = installElectronAPIMock()
    const chat = useChat()

    await chat.initialize()

    // 对话列表只查一次全量
    expect(api.dialog.list).toHaveBeenCalledTimes(1)
    // 不再按角色回源（客户端过滤已覆盖侧边栏话题列表）
    expect(api.dialog.listByRole).not.toHaveBeenCalled()
    // 角色列表查一次
    expect(api.role.list).toHaveBeenCalledTimes(1)
    // 消息只加载选中对话
    expect(api.message.list).toHaveBeenCalledTimes(1)
    expect(api.message.list).toHaveBeenCalledWith('d-latest')
    // 总调用数：role.list + dialog.list + message.list + dialog.touch = 4
    expect(calls.length).toBe(4)
  })

  it('选中最近对话（全量列表第一个），并切到话题 tab', async () => {
    installElectronAPIMock()
    const chat = useChat()

    await chat.initialize()

    expect(chat.currentDialog.value?.id).toBe('d-latest')
    expect(chat.currentTab.value).toBe('topics')
    // 最近对话关联角色被选中
    expect(chat.selectedRole.value?.id).toBe('role-1')
  })

  it('消息从数据库加载并缓存', async () => {
    installElectronAPIMock()
    const chat = useChat()

    await chat.initialize()

    expect(chat.messages.value.length).toBe(1)
    expect(chat.messages.value[0].id).toBe('msg-1')
  })

  it('没有对话时不报错，保持默认状态', async () => {
    const api = installElectronAPIMock().api
    api.dialog.list.mockResolvedValueOnce({ success: true, dialogs: [] })
    const chat = useChat()

    await chat.initialize()

    expect(chat.currentDialog.value).toBeNull()
    expect(chat.currentTab.value).toBe('assistants')
    // 没有对话就不查消息
    expect(api.message.list).not.toHaveBeenCalled()
  })
})
