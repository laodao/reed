/**
 * 剧集制作状态管理
 * @module stores/story-to-video
 * @description 管理剧集制作的状态，包括项目、剧集、剧本、场景、分镜等
 */

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  VideoProject,
  VideoEpisode,
  EpisodeScript,
  SceneScript,
  Storyboard,
  CharacterBinding,
  VideoProjectConfig
} from '../../../shared/types/story-to-video.types'

/**
 * 使用剧集制作 Store
 */
export const useStoryToVideoStore = defineStore('storyToVideo', () => {
  // ==================== 状态 ====================

  /**
   * 项目列表
   */
  const projects = ref<VideoProject[]>([])

  /**
   * 当前选中的项目
   */
  const currentProject = ref<VideoProject | null>(null)

  /**
   * 当前项目的剧集列表
   */
  const episodes = ref<VideoEpisode[]>([])

  /**
   * 当前选中的剧集
   */
  const currentEpisode = ref<VideoEpisode | null>(null)

  /**
   * 当前剧集的剧本
   */
  const currentScript = ref<EpisodeScript | null>(null)

  /**
   * 当前剧本的场景列表
   */
  const scenes = ref<SceneScript[]>([])

  /**
   * 当前选中的场景
   */
  const currentScene = ref<SceneScript | null>(null)

  /**
   * 当前场景的分镜列表
   */
  const storyboards = ref<Storyboard[]>([])

  /**
   * 当前项目的角色绑定列表
   */
  const characterBindings = ref<CharacterBinding[]>([])

  /**
   * 加载状态
   */
  const loading = ref(false)

  /**
   * AI 生成中状态
   */
  const generating = ref(false)

  /**
   * 错误信息
   */
  const error = ref<string | null>(null)

  /**
   * 当前选中的模型配置ID
   */
  const selectedProviderConfigId = ref<string | null>(null)

  /**
   * 当前选中的模型ID
   */
  const selectedModelId = ref<string | null>(null)

  // ==================== 项目管理 ====================

  /**
   * 加载项目列表
   */
  async function loadProjects(longWritingProjectId?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      console.log('[StoryToVideoStore] 调用 listProjects API, longWritingProjectId:', longWritingProjectId)
      const response = await window.electronAPI.storyToVideo.listProjects(longWritingProjectId)
      console.log('[StoryToVideoStore] API 响应:', response)
      if (response.success && response.data) {
        projects.value = response.data as VideoProject[]
        console.log('[StoryToVideoStore] 设置 projects.value, 数量:', projects.value.length)
      } else {
        error.value = response.error || '加载项目列表失败'
        console.error('[StoryToVideoStore] 加载失败:', error.value)
      }
    } catch (e: any) {
      error.value = e.message || '加载项目列表失败'
      console.error('[StoryToVideoStore] 异常:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载单个项目
   */
  async function loadProject(projectId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.getProject(projectId)
      if (response.success && response.data) {
        currentProject.value = response.data as VideoProject
      } else {
        error.value = response.error || '加载项目失败'
      }
    } catch (e: any) {
      error.value = e.message || '加载项目失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建项目
   */
  async function createProject(
    name: string,
    longWritingProjectId: string,
    config: VideoProjectConfig
  ): Promise<VideoProject | null> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.createProject(
        name,
        longWritingProjectId,
        JSON.parse(JSON.stringify(config))
      )
      if (response.success && response.data) {
        const project = response.data as VideoProject
        projects.value.push(project)
        return project
      } else {
        error.value = response.error || '创建项目失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '创建项目失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新项目
   */
  async function updateProject(
    projectId: string,
    data: { name?: string; status?: string; config?: VideoProjectConfig }
  ): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.updateProject(
        projectId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedProject = response.data as VideoProject
        const index = projects.value.findIndex(p => p.id === projectId)
        if (index !== -1) {
          projects.value[index] = updatedProject
        }
        if (currentProject.value?.id === projectId) {
          currentProject.value = updatedProject
        }
        return true
      } else {
        error.value = response.error || '更新项目失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '更新项目失败'
      return false
    }
  }

  /**
   * 删除项目
   */
  async function deleteProject(projectId: string): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.deleteProject(projectId)
      if (response.success) {
        projects.value = projects.value.filter(p => p.id !== projectId)
        if (currentProject.value?.id === projectId) {
          clearCurrentProject()
        }
        return true
      } else {
        error.value = response.error || '删除项目失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '删除项目失败'
      return false
    }
  }

  /**
   * 选择项目
   */
  async function selectProject(project: VideoProject): Promise<void> {
    currentProject.value = project
    await loadEpisodes(project.id)
    await loadCharacterBindings(project.id)
  }

  /**
   * 清空当前项目
   */
  function clearCurrentProject(): void {
    currentProject.value = null
    episodes.value = []
    currentEpisode.value = null
    currentScript.value = null
    scenes.value = []
    currentScene.value = null
    storyboards.value = []
    characterBindings.value = []
  }

  // ==================== 剧集管理 ====================

  /**
   * 加载剧集列表
   */
  async function loadEpisodes(projectId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      console.log('[StoryToVideoStore] 加载剧集列表, projectId:', projectId)
      const response = await window.electronAPI.storyToVideo.listEpisodes(projectId)
      console.log('[StoryToVideoStore] 剧集列表响应:', response)
      if (response.success && response.data) {
        episodes.value = response.data as VideoEpisode[]
        console.log('[StoryToVideoStore] 剧集数量:', episodes.value.length)
      } else {
        error.value = response.error || '加载剧集列表失败'
        console.error('[StoryToVideoStore] 加载剧集失败:', error.value)
      }
    } catch (e: any) {
      error.value = e.message || '加载剧集列表失败'
      console.error('[StoryToVideoStore] 异常:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建剧集
   */
  async function createEpisode(
    projectId: string,
    outlineId: string,
    episodeNumber: number,
    title: string
  ): Promise<VideoEpisode | null> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.createEpisode(
        projectId,
        outlineId,
        episodeNumber,
        title
      )
      if (response.success && response.data) {
        const episode = response.data as VideoEpisode
        episodes.value.push(episode)
        return episode
      } else {
        error.value = response.error || '创建剧集失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '创建剧集失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新剧集
   */
  async function updateEpisode(
    episodeId: string,
    data: { episodeNumber?: number; title?: string }
  ): Promise<VideoEpisode | null> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.updateEpisode(episodeId, data)
      if (response.success && response.data) {
        const episode = response.data as VideoEpisode
        // 更新列表中的剧集
        const index = episodes.value.findIndex(e => e.id === episodeId)
        if (index !== -1) {
          episodes.value[index] = episode
        }
        // 如果是当前剧集，也更新
        if (currentEpisode.value?.id === episodeId) {
          currentEpisode.value = episode
        }
        return episode
      } else {
        error.value = response.error || '更新剧集失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '更新剧集失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 选择剧集
   */
  async function selectEpisode(episode: VideoEpisode): Promise<void> {
    currentEpisode.value = episode
    if (episode.scriptId) {
      await loadScript(episode.scriptId)
    } else {
      currentScript.value = null
      scenes.value = []
    }
  }

  /**
   * 清空当前剧集
   */
  function clearCurrentEpisode(): void {
    currentEpisode.value = null
    currentScript.value = null
    scenes.value = []
    currentScene.value = null
    storyboards.value = []
  }

  /**
   * 删除剧集
   */
  async function deleteEpisode(episodeId: string): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.deleteEpisode(episodeId)
      if (response.success) {
        // 从列表中移除
        episodes.value = episodes.value.filter(e => e.id !== episodeId)
        // 如果删除的是当前剧集，清空
        if (currentEpisode.value?.id === episodeId) {
          clearCurrentEpisode()
        }
        return true
      } else {
        error.value = response.error || '删除剧集失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '删除剧集失败'
      return false
    }
  }

  // ==================== 剧本管理 ====================

  /**
   * 加载剧本
   */
  async function loadScript(scriptId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.getScript(scriptId)
      if (response.success && response.data) {
        currentScript.value = response.data as EpisodeScript
        // 加载场景列表
        if (currentScript.value) {
          await loadScenes(currentScript.value.id)
        }
      } else {
        error.value = response.error || '加载剧本失败'
      }
    } catch (e: any) {
      error.value = e.message || '加载剧本失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新剧本
   */
  async function updateScript(
    scriptId: string,
    data: Partial<EpisodeScript>
  ): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.updateScript(
        scriptId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        currentScript.value = response.data as EpisodeScript
        return true
      } else {
        error.value = response.error || '更新剧本失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '更新剧本失败'
      return false
    }
  }

  // ==================== 场景管理 ====================

  /**
   * 加载场景列表
   */
  async function loadScenes(episodeScriptId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.listScenes(episodeScriptId)
      if (response.success && response.data) {
        scenes.value = response.data as SceneScript[]
      } else {
        error.value = response.error || '加载场景列表失败'
      }
    } catch (e: any) {
      error.value = e.message || '加载场景列表失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载单个场景
   */
  async function loadScene(sceneId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.getScene(sceneId)
      if (response.success && response.data) {
        currentScene.value = response.data as SceneScript
      } else {
        error.value = response.error || '加载场景失败'
      }
    } catch (e: any) {
      error.value = e.message || '加载场景失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 选择场景
   */
  async function selectScene(scene: SceneScript): Promise<void> {
    currentScene.value = scene
    await loadStoryboards(scene.id)
  }

  /**
   * 更新场景
   */
  async function updateScene(sceneId: string, data: Partial<SceneScript>): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.updateScene(
        sceneId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedScene = response.data as SceneScript
        const index = scenes.value.findIndex(s => s.id === sceneId)
        if (index !== -1) {
          scenes.value[index] = updatedScene
        }
        if (currentScene.value?.id === sceneId) {
          currentScene.value = updatedScene
        }
        return true
      } else {
        error.value = response.error || '更新场景失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '更新场景失败'
      return false
    }
  }

  /**
   * 清空当前场景
   */
  function clearCurrentScene(): void {
    currentScene.value = null
    storyboards.value = []
  }

  // ==================== 分镜管理 ====================

  /**
   * 加载分镜列表
   */
  async function loadStoryboards(sceneScriptId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.listStoryboards(sceneScriptId)
      if (response.success && response.data) {
        storyboards.value = response.data as Storyboard[]
      } else {
        error.value = response.error || '加载分镜列表失败'
      }
    } catch (e: any) {
      error.value = e.message || '加载分镜列表失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新分镜
   */
  async function updateStoryboard(
    storyboardId: string,
    data: Partial<Storyboard>
  ): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.updateStoryboard(
        storyboardId,
        JSON.parse(JSON.stringify(data))
      )
      if (response.success && response.data) {
        const updatedStoryboard = response.data as Storyboard
        const index = storyboards.value.findIndex(s => s.id === storyboardId)
        if (index !== -1) {
          storyboards.value[index] = updatedStoryboard
        }
        return true
      } else {
        error.value = response.error || '更新分镜失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '更新分镜失败'
      return false
    }
  }

  // ==================== 角色绑定管理 ====================

  /**
   * 加载角色绑定列表
   */
  async function loadCharacterBindings(projectId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.getCharacterBindings(projectId)
      if (response.success && response.data) {
        characterBindings.value = response.data as CharacterBinding[]
      } else {
        error.value = response.error || '加载角色绑定失败'
      }
    } catch (e: any) {
      error.value = e.message || '加载角色绑定失败'
    } finally {
      loading.value = false
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
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.bindCharacter(
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
        error.value = response.error || '绑定角色失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '绑定角色失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新角色绑定
   */
  async function updateCharacterBinding(
    bindingId: string,
    data: Partial<CharacterBinding>
  ): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.updateCharacterBinding(
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
        error.value = response.error || '更新角色绑定失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '更新角色绑定失败'
      return false
    }
  }

  /**
   * 删除角色绑定
   */
  async function deleteCharacterBinding(bindingId: string): Promise<boolean> {
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.deleteCharacterBinding(bindingId)
      if (response.success) {
        characterBindings.value = characterBindings.value.filter(b => b.id !== bindingId)
        return true
      } else {
        error.value = response.error || '删除角色绑定失败'
        return false
      }
    } catch (e: any) {
      error.value = e.message || '删除角色绑定失败'
      return false
    }
  }

  /**
   * 根据长文角色ID获取绑定
   */
  function getBindingByCharacterId(longWritingCharacterId: string): CharacterBinding | undefined {
    return characterBindings.value.find(b => b.longWritingCharacterId === longWritingCharacterId)
  }

  // ==================== 计算属性 ====================

  /**
   * 项目统计信息
   */
  const projectStats = computed(() => {
    if (!currentProject.value) return null
    return {
      episodeCount: episodes.value.length,
      characterBindingCount: characterBindings.value.length
    }
  })

  /**
   * 剧集进度统计
   */
  const episodeProgress = computed(() => {
    if (!currentEpisode.value) return null
    return {
      hasScript: !!currentScript.value,
      sceneCount: scenes.value.length,
      storyboardCount: storyboards.value.length
    }
  })

  // ==================== AI 生成 ====================

  /**
   * 生成剧本
   */
  async function generateScript(
    projectId: string,
    outlineId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ script: EpisodeScript; scenes: SceneScript[] } | null> {
    generating.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.generateScript(
        projectId,
        outlineId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as { script: EpisodeScript; scenes: SceneScript[] }
        currentScript.value = result.script
        scenes.value = result.scenes
        return result
      } else {
        error.value = response.error || '生成剧本失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '生成剧本失败'
      return null
    } finally {
      generating.value = false
    }
  }

  /**
   * 生成场景
   */
  async function generateScenes(
    scriptId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<SceneScript[] | null> {
    generating.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.generateScenes(
        scriptId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as SceneScript[]
        scenes.value = result
        return result
      } else {
        error.value = response.error || '拆分场景失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '拆分场景失败'
      return null
    } finally {
      generating.value = false
    }
  }

  /**
   * 生成分镜
   */
  async function generateStoryboard(
    sceneId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<Storyboard[] | null> {
    generating.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboard(
        sceneId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as Storyboard[]
        storyboards.value = result
        return result
      } else {
        error.value = response.error || '生成分镜失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '生成分镜失败'
      return null
    } finally {
      generating.value = false
    }
  }

  /**
   * 批量生成分镜
   */
  async function generateStoryboards(
    scriptId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<Storyboard[] | null> {
    generating.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboards(
        scriptId,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const result = response.data as Storyboard[]
        // 更新当前场景的分镜
        if (currentScene.value) {
          storyboards.value = result.filter(s => s.sceneScriptId === currentScene.value!.id)
        }
        return result
      } else {
        error.value = response.error || '批量生成分镜失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '批量生成分镜失败'
      return null
    } finally {
      generating.value = false
    }
  }

  // ==================== 资源生成 ====================

  /**
   * 获取风格预设列表
   */
  async function getStylePresets(): Promise<Array<{ id: string; name: string }> | null> {
    try {
      const response = await window.electronAPI.storyToVideo.getStylePresets()
      if (response.success && response.data) {
        return response.data as Array<{ id: string; name: string }>
      }
      return null
    } catch (e: any) {
      console.error('获取风格预设失败:', e)
      return null
    }
  }

  /**
   * 生成分镜画面
   */
  async function generateStoryboardImage(
    storyboardId: string,
    styleName: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<Storyboard | null> {
    loading.value = true
    error.value = null
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboardImage(
        storyboardId,
        styleName,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const updatedStoryboard = response.data as Storyboard
        // 更新分镜列表
        const index = storyboards.value.findIndex(s => s.id === storyboardId)
        if (index !== -1) {
          storyboards.value[index] = updatedStoryboard
        }
        return updatedStoryboard
      } else {
        error.value = response.error || '生成图像失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '生成图像失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 批量生成场景画面
   */
  async function generateSceneImages(
    sceneId: string,
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Storyboard[] | null> {
    loading.value = true
    error.value = null

    // 注册进度监听
    let unsubscribe: (() => void) | null = null
    if (onProgress) {
      unsubscribe = window.electronAPI.storyToVideo.onImageProgress(
        (_event, data) => {
          if (data.sceneId === sceneId) {
            onProgress(data.index, data.total)
          }
        }
      )
    }

    try {
      const response = await window.electronAPI.storyToVideo.generateSceneImages(
        sceneId,
        styleName,
        providerConfigId,
        modelId
      )
      if (response.success && response.data) {
        const updatedStoryboards = response.data as Storyboard[]
        // 更新分镜列表
        for (const updated of updatedStoryboards) {
          const index = storyboards.value.findIndex(s => s.id === updated.id)
          if (index !== -1) {
            storyboards.value[index] = updated
          }
        }
        return updatedStoryboards
      } else {
        error.value = response.error || '批量生成图像失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '批量生成图像失败'
      return null
    } finally {
      loading.value = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }

  /**
   * 生成场景音频
   */
  async function generateSceneAudio(
    sceneId: string,
    onProgress?: (type: string, index: number, total: number) => void
  ): Promise<{ narrationPath?: string; dialogueCount: number } | null> {
    loading.value = true
    error.value = null

    // 注册进度监听
    let unsubscribe: (() => void) | null = null
    if (onProgress) {
      unsubscribe = window.electronAPI.storyToVideo.onAudioProgress(
        (_event, data) => {
          if (data.sceneId === sceneId) {
            onProgress(data.type, data.index, data.total)
          }
        }
      )
    }

    try {
      const response = await window.electronAPI.storyToVideo.generateAudio(sceneId)
      if (response.success && response.data) {
        return response.data as { narrationPath?: string; dialogueCount: number }
      } else {
        error.value = response.error || '生成音频失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '生成音频失败'
      return null
    } finally {
      loading.value = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }

  // ==================== 视频合成 ====================

  /**
   * 获取视频预设列表
   */
  async function getVideoPresets(): Promise<Array<{ id: string; name: string }> | null> {
    try {
      const response = await window.electronAPI.storyToVideo.getVideoPresets()
      if (response.success && response.data) {
        return response.data
      }
      return null
    } catch (e: any) {
      console.error('获取视频预设失败:', e)
      return null
    }
  }

  /**
   * 合成场景视频
   */
  async function synthesizeSceneVideo(
    sceneId: string,
    quality: string = 'standard',
    onProgress?: (phase: string, progress: number) => void
  ): Promise<{ outputPath: string; duration: number } | null> {
    loading.value = true
    error.value = null

    // 注册进度监听
    let unsubscribe: (() => void) | null = null
    if (onProgress) {
      unsubscribe = window.electronAPI.storyToVideo.onSynthesisProgress(
        (_event, data) => {
          if (data.sceneId === sceneId) {
            onProgress(data.phase, data.progress)
          }
        }
      )
    }

    try {
      const response = await window.electronAPI.storyToVideo.synthesizeSceneVideo(sceneId, quality)
      if (response.success && response.data) {
        return response.data as { outputPath: string; duration: number }
      } else {
        error.value = response.error || '视频合成失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '视频合成失败'
      return null
    } finally {
      loading.value = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }

  /**
   * 导出视频
   */
  async function exportVideo(
    sourcePath: string,
    outputPath: string,
    quality: string = 'standard'
  ): Promise<{ outputPath: string } | null> {
    loading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.storyToVideo.exportVideo(
        sourcePath,
        outputPath,
        quality
      )
      if (response.success && response.data) {
        return response.data as { outputPath: string }
      } else {
        error.value = response.error || '导出视频失败'
        return null
      }
    } catch (e: any) {
      error.value = e.message || '导出视频失败'
      return null
    } finally {
      loading.value = false
    }
  }

  // ==================== 模型选择 ====================

  /**
   * 更新选中的模型
   */
  function updateSelectedModel(providerConfigId: string, modelId: string): void {
    selectedProviderConfigId.value = providerConfigId
    selectedModelId.value = modelId
  }

  return {
    // 状态
    projects,
    currentProject,
    episodes,
    currentEpisode,
    currentScript,
    scenes,
    currentScene,
    storyboards,
    characterBindings,
    loading,
    generating,
    error,
    // 模型选择状态
    selectedProviderConfigId,
    selectedModelId,
    updateSelectedModel,
    // 计算属性
    projectStats,
    episodeProgress,
    // 项目管理
    loadProjects,
    loadProject,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    clearCurrentProject,
    // 剧集管理
    loadEpisodes,
    createEpisode,
    updateEpisode,
    selectEpisode,
    clearCurrentEpisode,
    deleteEpisode,
    // 剧本管理
    loadScript,
    updateScript,
    // 场景管理
    loadScenes,
    loadScene,
    selectScene,
    updateScene,
    clearCurrentScene,
    // 分镜管理
    loadStoryboards,
    updateStoryboard,
    // 角色绑定管理
    loadCharacterBindings,
    bindCharacter,
    updateCharacterBinding,
    deleteCharacterBinding,
    getBindingByCharacterId,
    // AI 生成
    generateScript,
    generateScenes,
    generateStoryboard,
    generateStoryboards,
    // 资源生成
    getStylePresets,
    generateStoryboardImage,
    generateSceneImages,
    generateSceneAudio,
    // 视频合成
    getVideoPresets,
    synthesizeSceneVideo,
    exportVideo
  }
})