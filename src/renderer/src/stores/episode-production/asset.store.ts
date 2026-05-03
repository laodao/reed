/**
 * episode-production · 资产 · store
 * @module renderer/stores/episode-production/asset.store
 * @description 角色/地点/物品绑定列表及 list/get/bind/update/delete 操作。
 *              拆自原 src/renderer/src/stores/story-to-video.ts。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  CharacterBinding,
  LocationBinding,
  ItemBinding,
} from '../../../../shared/types/story-to-video.types'
import { useEpWorkbenchStore } from './workbench.store'

export const useEpAssetStore = defineStore('ep-asset', () => {
  // ==================== 状态 ====================

  /**
   * 当前项目的角色绑定列表
   */
  const characterBindings = ref<CharacterBinding[]>([])

  /**
   * 当前项目的地点绑定列表
   */
  const locationBindings = ref<LocationBinding[]>([])

  /**
   * 当前项目的物品绑定列表
   */
  const itemBindings = ref<ItemBinding[]>([])

  // ==================== 角色绑定管理 ====================

  /**
   * 加载角色绑定列表
   */
  async function loadCharacterBindings(projectId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.getCharacterBindings(projectId)
      if (response.success && response.data) {
        characterBindings.value = response.data as CharacterBinding[]
      } else {
        wb.error = response.error || '加载角色绑定失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载角色绑定失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 绑定角色
   */
  async function bindCharacter(
    projectId: string,
    longWritingCharacterId: string,
    portraitId?: string,
    voiceConfig?: CharacterBinding['voiceConfig'],
    generateConfig?: CharacterBinding['generateConfig']
  ): Promise<CharacterBinding | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.bindCharacter(
        projectId,
        longWritingCharacterId,
        portraitId,
        voiceConfig ? JSON.parse(JSON.stringify(voiceConfig)) : undefined,
        generateConfig ? JSON.parse(JSON.stringify(generateConfig)) : undefined
      )
      if (response.success && response.data) {
        const binding = response.data as CharacterBinding
        // 更新或添加绑定
        const index = characterBindings.value.findIndex(b => b.id === binding.id)
        if (index !== -1) {
          characterBindings.value[index] = binding
        } else {
          characterBindings.value.push(binding)
        }
        return binding
      } else {
        wb.error = response.error || '绑定角色失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '绑定角色失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新角色绑定
   */
  async function updateCharacterBinding(
    bindingId: string,
    data: Partial<CharacterBinding>
  ): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateCharacterBinding(
        bindingId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedBinding = response.data as CharacterBinding
        const index = characterBindings.value.findIndex(b => b.id === bindingId)
        if (index !== -1) {
          characterBindings.value[index] = updatedBinding
        }
        return true
      } else {
        wb.error = response.error || '更新角色绑定失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新角色绑定失败'
      return false
    }
  }

  /**
   * 删除角色绑定
   */
  async function deleteCharacterBinding(bindingId: string): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.deleteCharacterBinding(bindingId)
      if (response.success) {
        characterBindings.value = characterBindings.value.filter(b => b.id !== bindingId)
        return true
      } else {
        wb.error = response.error || '删除角色绑定失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '删除角色绑定失败'
      return false
    }
  }

  /**
   * 根据长文角色ID获取绑定
   */
  function getBindingByCharacterId(longWritingCharacterId: string): CharacterBinding | undefined {
    return characterBindings.value.find(b => b.longWritingCharacterId === longWritingCharacterId)
  }

  // ==================== 地点绑定管理 ====================

  /**
   * 加载地点绑定列表
   */
  async function loadLocationBindings(projectId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.getLocationBindings(projectId)
      if (response.success && response.data) {
        locationBindings.value = response.data as LocationBinding[]
      } else {
        wb.error = response.error || '加载地点绑定失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载地点绑定失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 绑定地点
   */
  async function bindLocation(
    projectId: string,
    longWritingLocationId: string,
    locationName: string,
    imagePaths?: string[],
    generateConfig?: LocationBinding['generateConfig'],
    generateImages?: boolean
  ): Promise<LocationBinding | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.bindLocation(
        projectId,
        longWritingLocationId,
        locationName,
        imagePaths,
        generateConfig ? JSON.parse(JSON.stringify(generateConfig)) : undefined,
        generateImages
      )
      if (response.success && response.data) {
        const binding = response.data as LocationBinding
        const index = locationBindings.value.findIndex(b => b.id === binding.id)
        if (index !== -1) {
          locationBindings.value[index] = binding
        } else {
          locationBindings.value.push(binding)
        }
        return binding
      } else {
        wb.error = response.error || '绑定地点失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '绑定地点失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新地点绑定
   */
  async function updateLocationBinding(
    bindingId: string,
    data: Partial<LocationBinding>
  ): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateLocationBinding(
        bindingId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedBinding = response.data as LocationBinding
        const index = locationBindings.value.findIndex(b => b.id === bindingId)
        if (index !== -1) {
          locationBindings.value[index] = updatedBinding
        }
        return true
      } else {
        wb.error = response.error || '更新地点绑定失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新地点绑定失败'
      return false
    }
  }

  /**
   * 删除地点绑定
   */
  async function deleteLocationBinding(bindingId: string): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.deleteLocationBinding(bindingId)
      if (response.success) {
        locationBindings.value = locationBindings.value.filter(b => b.id !== bindingId)
        return true
      } else {
        wb.error = response.error || '删除地点绑定失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '删除地点绑定失败'
      return false
    }
  }

  /**
   * 根据长文地点ID获取绑定
   */
  function getBindingByLocationId(longWritingLocationId: string): LocationBinding | undefined {
    return locationBindings.value.find(b => b.longWritingLocationId === longWritingLocationId)
  }

  // ==================== 物品绑定管理 ====================

  /**
   * 加载物品绑定列表
   */
  async function loadItemBindings(projectId: string): Promise<void> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.getItemBindings(projectId)
      if (response.success && response.data) {
        itemBindings.value = response.data as ItemBinding[]
      } else {
        wb.error = response.error || '加载物品绑定失败'
      }
    } catch (e: any) {
      wb.error = e.message || '加载物品绑定失败'
    } finally {
      wb.loading = false
    }
  }

  /**
   * 绑定物品
   */
  async function bindItem(
    projectId: string,
    longWritingItemId: string,
    itemName: string,
    imagePaths?: string[],
    generateConfig?: ItemBinding['generateConfig'],
    generateImages?: boolean
  ): Promise<ItemBinding | null> {
    const wb = useEpWorkbenchStore()
    wb.loading = true
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.bindItem(
        projectId,
        longWritingItemId,
        itemName,
        imagePaths,
        generateConfig ? JSON.parse(JSON.stringify(generateConfig)) : undefined,
        generateImages
      )
      if (response.success && response.data) {
        const binding = response.data as ItemBinding
        const index = itemBindings.value.findIndex(b => b.id === binding.id)
        if (index !== -1) {
          itemBindings.value[index] = binding
        } else {
          itemBindings.value.push(binding)
        }
        return binding
      } else {
        wb.error = response.error || '绑定物品失败'
        return null
      }
    } catch (e: any) {
      wb.error = e.message || '绑定物品失败'
      return null
    } finally {
      wb.loading = false
    }
  }

  /**
   * 更新物品绑定
   */
  async function updateItemBinding(
    bindingId: string,
    data: Partial<ItemBinding>
  ): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.updateItemBinding(
        bindingId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedBinding = response.data as ItemBinding
        const index = itemBindings.value.findIndex(b => b.id === bindingId)
        if (index !== -1) {
          itemBindings.value[index] = updatedBinding
        }
        return true
      } else {
        wb.error = response.error || '更新物品绑定失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '更新物品绑定失败'
      return false
    }
  }

  /**
   * 删除物品绑定
   */
  async function deleteItemBinding(bindingId: string): Promise<boolean> {
    const wb = useEpWorkbenchStore()
    wb.error = null
    try {
      const response = await window.electronAPI.episodeProduction.deleteItemBinding(bindingId)
      if (response.success) {
        itemBindings.value = itemBindings.value.filter(b => b.id !== bindingId)
        return true
      } else {
        wb.error = response.error || '删除物品绑定失败'
        return false
      }
    } catch (e: any) {
      wb.error = e.message || '删除物品绑定失败'
      return false
    }
  }

  /**
   * 根据长文物品ID获取绑定
   */
  function getBindingByItemId(longWritingItemId: string): ItemBinding | undefined {
    return itemBindings.value.find(b => b.longWritingItemId === longWritingItemId)
  }

  // ==================== P3a Task 10 · 新版 4 类资产 store ====================
  // 不复用 V2 字段（characterBindings 等），避免污染 V2 老页面（EpisodeWorkbench.vue）。
  // 这里直接面向新版资产域 IPC（namespace：episodeProduction.asset.*），返回的是
  // 新版 binding 实体（含 sourceType / standaloneName / overrideName 等双源字段）。

  /** 新版角色资产列表（用于 AssetSidebar 等新组件） */
  const epAssetCharacters = ref<any[]>([])
  /** 新版地点资产列表 */
  const epAssetLocations = ref<any[]>([])
  /** 新版物品资产列表 */
  const epAssetItems = ref<any[]>([])
  /** 新版语音资产列表（全局，不属于某 project） */
  const epAssetVoices = ref<any[]>([])

  /**
   * 按项目加载 4 类资产（角色 / 地点 / 物品 / 语音）。
   * 走新版 namespace IPC：episodeProduction.asset.{character|location|item|voice}.list。
   * IPC 返回 IpcResponse<T> = { success, data?, error? }，需解包 .data。
   */
  async function loadAssetsByProject(projectId: string): Promise<void> {
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api) {
      console.warn('[ep-asset.store] electronAPI.episodeProduction.asset 未暴露')
      return
    }
    const [chars, locs, its, vs] = await Promise.all([
      api.character.list(projectId).catch(() => null),
      api.location.list(projectId).catch(() => null),
      api.item.list(projectId).catch(() => null),
      api.voice.list().catch(() => null),
    ])
    // 解包 IpcResponse；任一通道失败/返回非数组都退化为空数组，保证 UI 不崩
    epAssetCharacters.value = chars && chars.success && Array.isArray(chars.data) ? chars.data : []
    epAssetLocations.value = locs && locs.success && Array.isArray(locs.data) ? locs.data : []
    epAssetItems.value = its && its.success && Array.isArray(its.data) ? its.data : []
    epAssetVoices.value = vs && vs.success && Array.isArray(vs.data) ? vs.data : []
  }

  return {
    characterBindings,
    locationBindings,
    itemBindings,
    // 角色绑定
    loadCharacterBindings,
    bindCharacter,
    updateCharacterBinding,
    deleteCharacterBinding,
    getBindingByCharacterId,
    // 地点绑定
    loadLocationBindings,
    bindLocation,
    updateLocationBinding,
    deleteLocationBinding,
    getBindingByLocationId,
    // 物品绑定
    loadItemBindings,
    bindItem,
    updateItemBinding,
    deleteItemBinding,
    getBindingByItemId,
    // P3a Task 10 · 新版 4 类资产
    epAssetCharacters,
    epAssetLocations,
    epAssetItems,
    epAssetVoices,
    loadAssetsByProject,
  }
})
