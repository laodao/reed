/**
 * 设定资产库（世界观库 + 角色 IP 库）IPC 处理器（2026-09-24 P0）
 * @module core/packs/longwriting/handlers/library.handler
 *
 * 通道族 longwriting:library:*——落在 longwriting 包已声明的 ipcChannelPrefixes
 * 'longwriting:' 之内（守卫自动覆盖）；Web 端 channel-map 以 longwriting.library.*
 * 键名追加映射。P0 覆盖：库 CRUD、kinds、条目、库内边、项目绑定、导入实例化。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { WorldLibraryService } from '@core/platform/services/longwriting/library/world-library.service'
import { IpLibraryService } from '@core/platform/services/longwriting/library/ip-library.service'
import { LibraryBindingService } from '@core/platform/services/longwriting/library/binding.service'
import { LibraryAIService } from '@core/platform/services/longwriting/library/library-ai.service'
import { LibrarySyncService } from '@core/platform/services/longwriting/library/library-sync.service'
import type {
  CreateWorldRequest,
  UpdateWorldRequest,
  CreateWorldEntryRequest,
  UpdateWorldEntryRequest,
  CreateIpCharacterRequest,
  UpdateIpCharacterRequest,
  CreateIpEdgeRequest,
  BindWorldRequest,
  ImportIpCharacterRequest,
  WorldBindingConfig,
} from '@shared/types/lw-library.types'

const CHANNELS = {
  // 世界观库
  WORLD_LIST: 'longwriting:library:world:list',
  WORLD_GET: 'longwriting:library:world:get',
  WORLD_CREATE: 'longwriting:library:world:create',
  WORLD_UPDATE: 'longwriting:library:world:update',
  WORLD_DELETE: 'longwriting:library:world:delete',
  WORLD_SEED_TEMPLATE: 'longwriting:library:world:seedTemplate',

  // 世界观分类
  WORLD_KIND_LIST: 'longwriting:library:worldKind:list',
  WORLD_KIND_CREATE: 'longwriting:library:worldKind:create',
  WORLD_KIND_DELETE: 'longwriting:library:worldKind:delete',

  // 世界观条目
  WORLD_ENTRY_LIST: 'longwriting:library:worldEntry:list',
  WORLD_ENTRY_GET: 'longwriting:library:worldEntry:get',
  WORLD_ENTRY_CREATE: 'longwriting:library:worldEntry:create',
  WORLD_ENTRY_UPDATE: 'longwriting:library:worldEntry:update',
  WORLD_ENTRY_DELETE: 'longwriting:library:worldEntry:delete',
  WORLD_ENTRY_REORDER: 'longwriting:library:worldEntry:reorder',

  // 世界观库内关系
  WORLD_EDGE_LIST: 'longwriting:library:worldEdge:list',
  WORLD_EDGE_CREATE: 'longwriting:library:worldEdge:create',
  WORLD_EDGE_DELETE: 'longwriting:library:worldEdge:delete',

  // 角色 IP 库
  IP_LIST: 'longwriting:library:ip:list',
  IP_GET: 'longwriting:library:ip:get',
  IP_CREATE: 'longwriting:library:ip:create',
  IP_UPDATE: 'longwriting:library:ip:update',
  IP_DELETE: 'longwriting:library:ip:delete',

  // IP 库内原型关系
  IP_EDGE_LIST: 'longwriting:library:ipEdge:list',
  IP_EDGE_CREATE: 'longwriting:library:ipEdge:create',
  IP_EDGE_DELETE: 'longwriting:library:ipEdge:delete',

  // 项目绑定与导入
  WORLD_BINDINGS_LIST: 'longwriting:library:listWorldBindings',
  BIND_WORLD: 'longwriting:library:bindWorld',
  UNBIND_WORLD: 'longwriting:library:unbindWorld',
  SET_PRIMARY_WORLD: 'longwriting:library:setPrimaryWorld',
  UPDATE_WORLD_BINDING_CONFIG: 'longwriting:library:updateWorldBindingConfig',
  IMPORT_WORLD_ENTRY: 'longwriting:library:importWorldEntry',
  IP_BINDINGS_LIST: 'longwriting:library:listIpBindings',
  IP_PROJECTS_LIST: 'longwriting:library:listIpProjects',
  IMPORT_IP_CHARACTER: 'longwriting:library:importIpCharacter',
  UNBIND_IP_CHARACTER: 'longwriting:library:unbindIpCharacter',

  // ---- P1（2026-09-25）：AI 生成 / 反向沉淀 / 同步 diff ----
  WORLD_GENERATE: 'longwriting:library:world:generate',
  IP_GENERATE: 'longwriting:library:ip:generate',
  PROMOTE_TO_IP: 'longwriting:library:promoteToIp',
  PROMOTE_TO_LIBRARY: 'longwriting:library:promoteToLibrary',
  SYNC_PREVIEW: 'longwriting:library:syncPreview',
  SYNC_APPLY: 'longwriting:library:syncApply',
} as const

const worldService = new WorldLibraryService()
const ipService = new IpLibraryService()
const bindingService = new LibraryBindingService()
const libraryAiService = new LibraryAIService()
const librarySyncService = new LibrarySyncService()

export function registerLibraryHandlers(): void {
  // ---------- 世界观库 ----------

  ipcBridge.handle(CHANNELS.WORLD_LIST, async (_e, includeArchived?: boolean) => {
    return worldService.listWorlds(includeArchived)
  })

  ipcBridge.handle(CHANNELS.WORLD_GET, async (_e, id: string) => {
    return worldService.getWorld(id)
  })

  ipcBridge.handle(CHANNELS.WORLD_CREATE, async (_e, req: CreateWorldRequest) => {
    return worldService.createWorld(req)
  })

  ipcBridge.handle(CHANNELS.WORLD_UPDATE, async (_e, id: string, req: UpdateWorldRequest) => {
    return worldService.updateWorld(id, req)
  })

  ipcBridge.handle(CHANNELS.WORLD_DELETE, async (_e, id: string) => {
    return worldService.deleteWorld(id)
  })

  ipcBridge.handle(CHANNELS.WORLD_SEED_TEMPLATE, async (_e, worldId: string, templateId: string) => {
    const seeded = await worldService.seedFromTemplate(worldId, templateId)
    return { ok: seeded > 0, seededKinds: seeded }
  })

  // ---------- 世界观分类 ----------

  ipcBridge.handle(CHANNELS.WORLD_KIND_LIST, async (_e, worldId: string) => {
    return worldService.listKinds(worldId)
  })

  ipcBridge.handle(
    CHANNELS.WORLD_KIND_CREATE,
    async (
      _e,
      data: {
        worldId: string
        key: string
        label: string
        icon?: string | null
        sortOrder?: number
        fieldsSchema?: import('@shared/types/lw-library.types').LibraryFieldSchemaItem[] | null
        promptHint?: string | null
      },
    ) => {
      return worldService.createKind(data)
    },
  )

  ipcBridge.handle(CHANNELS.WORLD_KIND_DELETE, async (_e, id: string, worldId: string) => {
    return worldService.deleteKind(id, worldId)
  })

  // ---------- 世界观条目 ----------

  ipcBridge.handle(CHANNELS.WORLD_ENTRY_LIST, async (_e, worldId: string, kindKey?: string) => {
    return worldService.listEntries(worldId, kindKey)
  })

  ipcBridge.handle(CHANNELS.WORLD_ENTRY_GET, async (_e, id: string) => {
    return worldService.getEntry(id)
  })

  ipcBridge.handle(CHANNELS.WORLD_ENTRY_CREATE, async (_e, req: CreateWorldEntryRequest) => {
    return worldService.createEntry(req)
  })

  ipcBridge.handle(CHANNELS.WORLD_ENTRY_UPDATE, async (_e, id: string, req: UpdateWorldEntryRequest) => {
    return worldService.updateEntry(id, req)
  })

  ipcBridge.handle(CHANNELS.WORLD_ENTRY_DELETE, async (_e, id: string) => {
    return worldService.deleteEntry(id)
  })

  ipcBridge.handle(CHANNELS.WORLD_ENTRY_REORDER, async (_e, orderList: { id: string; order: number }[]) => {
    await worldService.reorderEntries(orderList)
    return { ok: true }
  })

  // ---------- 世界观库内关系 ----------

  ipcBridge.handle(CHANNELS.WORLD_EDGE_LIST, async (_e, worldId: string) => {
    return worldService.listEdges(worldId)
  })

  ipcBridge.handle(
    CHANNELS.WORLD_EDGE_CREATE,
    async (_e, data: { worldId: string; sourceId: string; targetId: string; relationType: string; label?: string | null }) => {
      return worldService.createEdge(data)
    },
  )

  ipcBridge.handle(CHANNELS.WORLD_EDGE_DELETE, async (_e, id: string) => {
    return worldService.deleteEdge(id)
  })

  // ---------- 角色 IP 库 ----------

  ipcBridge.handle(CHANNELS.IP_LIST, async (_e, includeArchived?: boolean) => {
    return ipService.listCharacters(includeArchived)
  })

  ipcBridge.handle(CHANNELS.IP_GET, async (_e, id: string) => {
    return ipService.getCharacter(id)
  })

  ipcBridge.handle(CHANNELS.IP_CREATE, async (_e, req: CreateIpCharacterRequest) => {
    return ipService.createCharacter(req)
  })

  ipcBridge.handle(CHANNELS.IP_UPDATE, async (_e, id: string, req: UpdateIpCharacterRequest) => {
    return ipService.updateCharacter(id, req)
  })

  ipcBridge.handle(CHANNELS.IP_DELETE, async (_e, id: string) => {
    return ipService.deleteCharacter(id)
  })

  // ---------- IP 库内原型关系 ----------

  ipcBridge.handle(CHANNELS.IP_EDGE_LIST, async (_e, characterId: string) => {
    return ipService.listEdges(characterId)
  })

  ipcBridge.handle(CHANNELS.IP_EDGE_CREATE, async (_e, req: CreateIpEdgeRequest) => {
    return ipService.createEdge(req)
  })

  ipcBridge.handle(CHANNELS.IP_EDGE_DELETE, async (_e, id: string) => {
    return ipService.deleteEdge(id)
  })

  // ---------- 项目绑定与导入 ----------

  ipcBridge.handle(CHANNELS.WORLD_BINDINGS_LIST, async (_e, projectId: string) => {
    return bindingService.listWorldBindings(projectId)
  })

  ipcBridge.handle(CHANNELS.BIND_WORLD, async (_e, req: BindWorldRequest) => {
    return bindingService.bindWorld(req)
  })

  ipcBridge.handle(CHANNELS.UNBIND_WORLD, async (_e, projectId: string, worldId: string) => {
    return bindingService.unbindWorld(projectId, worldId)
  })

  ipcBridge.handle(CHANNELS.SET_PRIMARY_WORLD, async (_e, projectId: string, bindingId: string) => {
    await bindingService.setPrimaryWorld(projectId, bindingId)
    return { ok: true }
  })

  ipcBridge.handle(CHANNELS.UPDATE_WORLD_BINDING_CONFIG, async (_e, id: string, config: WorldBindingConfig | null) => {
    return bindingService.updateWorldBindingConfig(id, config)
  })

  ipcBridge.handle(CHANNELS.IMPORT_WORLD_ENTRY, async (_e, projectId: string, entryId: string) => {
    return bindingService.importWorldEntry(projectId, entryId)
  })

  ipcBridge.handle(CHANNELS.IP_BINDINGS_LIST, async (_e, projectId: string) => {
    return bindingService.listIpBindings(projectId)
  })

  ipcBridge.handle(CHANNELS.IP_PROJECTS_LIST, async (_e, ipCharacterId: string) => {
    return bindingService.listProjectsByIp(ipCharacterId)
  })

  ipcBridge.handle(CHANNELS.IMPORT_IP_CHARACTER, async (_e, req: ImportIpCharacterRequest) => {
    return bindingService.importIpCharacter(req)
  })

  ipcBridge.handle(
    CHANNELS.UNBIND_IP_CHARACTER,
    async (_e, projectId: string, ipCharacterId: string, deleteProjectCharacter?: boolean) => {
      return bindingService.unbindIpCharacter(projectId, ipCharacterId, deleteProjectCharacter)
    },
  )

  // ---------- P1：AI 生成（流式事件走 longwriting:generate:{eventId}，前端 onGenerateEvent 订阅） ----------

  ipcBridge.handle(
    CHANNELS.WORLD_GENERATE,
    async (
      _e,
      req: {
        eventId: string
        worldId: string
        kindKey: string
        count?: number
        requirements?: string
        providerConfigId?: string
        modelId?: string
      },
    ) => {
      return libraryAiService.generateWorldEntries(req)
    },
  )

  ipcBridge.handle(
    CHANNELS.IP_GENERATE,
    async (
      _e,
      req: {
        eventId: string
        seedIdea: string
        worldId?: string | null
        requirements?: string
        providerConfigId?: string
        modelId?: string
      },
    ) => {
      return libraryAiService.generateIpCharacter(req)
    },
  )

  // ---------- P1：反向沉淀 ----------

  ipcBridge.handle(CHANNELS.PROMOTE_TO_IP, async (_e, projectId: string, characterId: string) => {
    return librarySyncService.promoteCharacterToIp(projectId, characterId)
  })

  ipcBridge.handle(
    CHANNELS.PROMOTE_TO_LIBRARY,
    async (
      _e,
      req: {
        worldId: string
        entityType: 'location' | 'faction' | 'skill' | 'item' | 'custom'
        entityId: string
        kindKey?: string
      },
    ) => {
      return librarySyncService.promoteEntityToLibrary(req.worldId, req.entityType, req.entityId, req.kindKey)
    },
  )

  // ---------- P1：同步 diff ----------

  ipcBridge.handle(CHANNELS.SYNC_PREVIEW, async (_e, projectId: string) => {
    return librarySyncService.previewSync(projectId)
  })

  ipcBridge.handle(
    CHANNELS.SYNC_APPLY,
    async (_e, projectId: string, targets: Array<{ entityType: string; projectEntityId: string }>) => {
      return librarySyncService.applySync(projectId, targets as any)
    },
  )
}
