import { g as defineStore, r as ref, h as computed } from "./index-CEiunyEa.js";
const useStoryToVideoStore = defineStore("storyToVideo", () => {
  const projects = ref([]);
  const currentProject = ref(null);
  const episodes = ref([]);
  const currentEpisode = ref(null);
  const currentScript = ref(null);
  const scenes = ref([]);
  const currentScene = ref(null);
  const storyboards = ref([]);
  const characterBindings = ref([]);
  const loading = ref(false);
  const generating = ref(false);
  const error = ref(null);
  const selectedProviderConfigId = ref(null);
  const selectedModelId = ref(null);
  async function loadProjects(longWritingProjectId) {
    loading.value = true;
    error.value = null;
    try {
      console.log("[StoryToVideoStore] 调用 listProjects API, longWritingProjectId:", longWritingProjectId);
      const response = await window.electronAPI.storyToVideo.listProjects(longWritingProjectId);
      console.log("[StoryToVideoStore] API 响应:", response);
      if (response.success && response.data) {
        projects.value = response.data;
        console.log("[StoryToVideoStore] 设置 projects.value, 数量:", projects.value.length);
      } else {
        error.value = response.error || "加载项目列表失败";
        console.error("[StoryToVideoStore] 加载失败:", error.value);
      }
    } catch (e) {
      error.value = e.message || "加载项目列表失败";
      console.error("[StoryToVideoStore] 异常:", e);
    } finally {
      loading.value = false;
    }
  }
  async function loadProject(projectId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.getProject(projectId);
      if (response.success && response.data) {
        currentProject.value = response.data;
      } else {
        error.value = response.error || "加载项目失败";
      }
    } catch (e) {
      error.value = e.message || "加载项目失败";
    } finally {
      loading.value = false;
    }
  }
  async function createProject(name, longWritingProjectId, config) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.createProject(
        name,
        longWritingProjectId,
        JSON.parse(JSON.stringify(config))
      );
      if (response.success && response.data) {
        const project = response.data;
        projects.value.push(project);
        return project;
      } else {
        error.value = response.error || "创建项目失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "创建项目失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function updateProject(projectId, data) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.updateProject(
        projectId,
        JSON.parse(JSON.stringify(data))
      );
      if (response.success && response.data) {
        const updatedProject = response.data;
        const index = projects.value.findIndex((p) => p.id === projectId);
        if (index !== -1) {
          projects.value[index] = updatedProject;
        }
        if (currentProject.value?.id === projectId) {
          currentProject.value = updatedProject;
        }
        return true;
      } else {
        error.value = response.error || "更新项目失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "更新项目失败";
      return false;
    }
  }
  async function deleteProject(projectId) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.deleteProject(projectId);
      if (response.success) {
        projects.value = projects.value.filter((p) => p.id !== projectId);
        if (currentProject.value?.id === projectId) {
          clearCurrentProject();
        }
        return true;
      } else {
        error.value = response.error || "删除项目失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "删除项目失败";
      return false;
    }
  }
  async function selectProject(project) {
    currentProject.value = project;
    await loadEpisodes(project.id);
    await loadCharacterBindings(project.id);
  }
  function clearCurrentProject() {
    currentProject.value = null;
    episodes.value = [];
    currentEpisode.value = null;
    currentScript.value = null;
    scenes.value = [];
    currentScene.value = null;
    storyboards.value = [];
    characterBindings.value = [];
  }
  async function loadEpisodes(projectId) {
    loading.value = true;
    error.value = null;
    try {
      console.log("[StoryToVideoStore] 加载剧集列表, projectId:", projectId);
      const response = await window.electronAPI.storyToVideo.listEpisodes(projectId);
      console.log("[StoryToVideoStore] 剧集列表响应:", response);
      if (response.success && response.data) {
        episodes.value = response.data;
        console.log("[StoryToVideoStore] 剧集数量:", episodes.value.length);
      } else {
        error.value = response.error || "加载剧集列表失败";
        console.error("[StoryToVideoStore] 加载剧集失败:", error.value);
      }
    } catch (e) {
      error.value = e.message || "加载剧集列表失败";
      console.error("[StoryToVideoStore] 异常:", e);
    } finally {
      loading.value = false;
    }
  }
  async function createEpisode(projectId, outlineId, episodeNumber, title) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.createEpisode(
        projectId,
        outlineId,
        episodeNumber,
        title
      );
      if (response.success && response.data) {
        const episode = response.data;
        episodes.value.push(episode);
        return episode;
      } else {
        error.value = response.error || "创建剧集失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "创建剧集失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function updateEpisode(episodeId, data) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.updateEpisode(episodeId, data);
      if (response.success && response.data) {
        const episode = response.data;
        const index = episodes.value.findIndex((e) => e.id === episodeId);
        if (index !== -1) {
          episodes.value[index] = episode;
        }
        if (currentEpisode.value?.id === episodeId) {
          currentEpisode.value = episode;
        }
        return episode;
      } else {
        error.value = response.error || "更新剧集失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "更新剧集失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function selectEpisode(episode) {
    currentEpisode.value = episode;
    if (episode.scriptId) {
      await loadScript(episode.scriptId);
    } else {
      currentScript.value = null;
      scenes.value = [];
    }
  }
  function clearCurrentEpisode() {
    currentEpisode.value = null;
    currentScript.value = null;
    scenes.value = [];
    currentScene.value = null;
    storyboards.value = [];
  }
  async function deleteEpisode(episodeId) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.deleteEpisode(episodeId);
      if (response.success) {
        episodes.value = episodes.value.filter((e) => e.id !== episodeId);
        if (currentEpisode.value?.id === episodeId) {
          clearCurrentEpisode();
        }
        return true;
      } else {
        error.value = response.error || "删除剧集失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "删除剧集失败";
      return false;
    }
  }
  async function loadScript(scriptId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.getScript(scriptId);
      if (response.success && response.data) {
        currentScript.value = response.data;
        if (currentScript.value) {
          await loadScenes(currentScript.value.id);
        }
      } else {
        error.value = response.error || "加载剧本失败";
      }
    } catch (e) {
      error.value = e.message || "加载剧本失败";
    } finally {
      loading.value = false;
    }
  }
  async function updateScript(scriptId, data) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.updateScript(
        scriptId,
        JSON.parse(JSON.stringify(data))
      );
      if (response.success && response.data) {
        currentScript.value = response.data;
        return true;
      } else {
        error.value = response.error || "更新剧本失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "更新剧本失败";
      return false;
    }
  }
  async function loadScenes(episodeScriptId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.listScenes(episodeScriptId);
      if (response.success && response.data) {
        scenes.value = response.data;
      } else {
        error.value = response.error || "加载场景列表失败";
      }
    } catch (e) {
      error.value = e.message || "加载场景列表失败";
    } finally {
      loading.value = false;
    }
  }
  async function loadScene(sceneId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.getScene(sceneId);
      if (response.success && response.data) {
        currentScene.value = response.data;
      } else {
        error.value = response.error || "加载场景失败";
      }
    } catch (e) {
      error.value = e.message || "加载场景失败";
    } finally {
      loading.value = false;
    }
  }
  async function selectScene(scene) {
    currentScene.value = scene;
    await loadStoryboards(scene.id);
  }
  async function updateScene(sceneId, data) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.updateScene(
        sceneId,
        JSON.parse(JSON.stringify(data))
      );
      if (response.success && response.data) {
        const updatedScene = response.data;
        const index = scenes.value.findIndex((s) => s.id === sceneId);
        if (index !== -1) {
          scenes.value[index] = updatedScene;
        }
        if (currentScene.value?.id === sceneId) {
          currentScene.value = updatedScene;
        }
        return true;
      } else {
        error.value = response.error || "更新场景失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "更新场景失败";
      return false;
    }
  }
  function clearCurrentScene() {
    currentScene.value = null;
    storyboards.value = [];
  }
  async function loadStoryboards(sceneScriptId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.listStoryboards(sceneScriptId);
      if (response.success && response.data) {
        storyboards.value = response.data;
      } else {
        error.value = response.error || "加载分镜列表失败";
      }
    } catch (e) {
      error.value = e.message || "加载分镜列表失败";
    } finally {
      loading.value = false;
    }
  }
  async function updateStoryboard(storyboardId, data) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.updateStoryboard(
        storyboardId,
        JSON.parse(JSON.stringify(data))
      );
      if (response.success && response.data) {
        const updatedStoryboard = response.data;
        const index = storyboards.value.findIndex((s) => s.id === storyboardId);
        if (index !== -1) {
          storyboards.value[index] = updatedStoryboard;
        }
        return true;
      } else {
        error.value = response.error || "更新分镜失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "更新分镜失败";
      return false;
    }
  }
  async function loadCharacterBindings(projectId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.getCharacterBindings(projectId);
      if (response.success && response.data) {
        characterBindings.value = response.data;
      } else {
        error.value = response.error || "加载角色绑定失败";
      }
    } catch (e) {
      error.value = e.message || "加载角色绑定失败";
    } finally {
      loading.value = false;
    }
  }
  async function bindCharacter(projectId, longWritingCharacterId, portraitId, voiceConfig, generateConfig) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.bindCharacter(
        projectId,
        longWritingCharacterId,
        portraitId,
        voiceConfig ? JSON.parse(JSON.stringify(voiceConfig)) : void 0,
        generateConfig ? JSON.parse(JSON.stringify(generateConfig)) : void 0
      );
      if (response.success && response.data) {
        const binding = response.data;
        const index = characterBindings.value.findIndex((b) => b.id === binding.id);
        if (index !== -1) {
          characterBindings.value[index] = binding;
        } else {
          characterBindings.value.push(binding);
        }
        return binding;
      } else {
        error.value = response.error || "绑定角色失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "绑定角色失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function updateCharacterBinding(bindingId, data) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.updateCharacterBinding(
        bindingId,
        JSON.parse(JSON.stringify(data))
      );
      if (response.success && response.data) {
        const updatedBinding = response.data;
        const index = characterBindings.value.findIndex((b) => b.id === bindingId);
        if (index !== -1) {
          characterBindings.value[index] = updatedBinding;
        }
        return true;
      } else {
        error.value = response.error || "更新角色绑定失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "更新角色绑定失败";
      return false;
    }
  }
  async function deleteCharacterBinding(bindingId) {
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.deleteCharacterBinding(bindingId);
      if (response.success) {
        characterBindings.value = characterBindings.value.filter((b) => b.id !== bindingId);
        return true;
      } else {
        error.value = response.error || "删除角色绑定失败";
        return false;
      }
    } catch (e) {
      error.value = e.message || "删除角色绑定失败";
      return false;
    }
  }
  function getBindingByCharacterId(longWritingCharacterId) {
    return characterBindings.value.find((b) => b.longWritingCharacterId === longWritingCharacterId);
  }
  const projectStats = computed(() => {
    if (!currentProject.value) return null;
    return {
      episodeCount: episodes.value.length,
      characterBindingCount: characterBindings.value.length
    };
  });
  const episodeProgress = computed(() => {
    if (!currentEpisode.value) return null;
    return {
      hasScript: !!currentScript.value,
      sceneCount: scenes.value.length,
      storyboardCount: storyboards.value.length
    };
  });
  async function generateScript(projectId, outlineId, providerConfigId, modelId) {
    generating.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.generateScript(
        projectId,
        outlineId,
        providerConfigId,
        modelId
      );
      if (response.success && response.data) {
        const result = response.data;
        currentScript.value = result.script;
        scenes.value = result.scenes;
        return result;
      } else {
        error.value = response.error || "生成剧本失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "生成剧本失败";
      return null;
    } finally {
      generating.value = false;
    }
  }
  async function generateScenes(scriptId, providerConfigId, modelId) {
    generating.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.generateScenes(
        scriptId,
        providerConfigId,
        modelId
      );
      if (response.success && response.data) {
        const result = response.data;
        scenes.value = result;
        return result;
      } else {
        error.value = response.error || "拆分场景失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "拆分场景失败";
      return null;
    } finally {
      generating.value = false;
    }
  }
  async function generateStoryboard(sceneId, providerConfigId, modelId) {
    generating.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboard(
        sceneId,
        providerConfigId,
        modelId
      );
      if (response.success && response.data) {
        const result = response.data;
        storyboards.value = result;
        return result;
      } else {
        error.value = response.error || "生成分镜失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "生成分镜失败";
      return null;
    } finally {
      generating.value = false;
    }
  }
  async function generateStoryboards(scriptId, providerConfigId, modelId) {
    generating.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboards(
        scriptId,
        providerConfigId,
        modelId
      );
      if (response.success && response.data) {
        const result = response.data;
        if (currentScene.value) {
          storyboards.value = result.filter((s) => s.sceneScriptId === currentScene.value.id);
        }
        return result;
      } else {
        error.value = response.error || "批量生成分镜失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "批量生成分镜失败";
      return null;
    } finally {
      generating.value = false;
    }
  }
  async function getStylePresets() {
    try {
      const response = await window.electronAPI.storyToVideo.getStylePresets();
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (e) {
      console.error("获取风格预设失败:", e);
      return null;
    }
  }
  async function generateStoryboardImage(storyboardId, styleName, providerConfigId, modelId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.generateStoryboardImage(
        storyboardId,
        styleName,
        providerConfigId,
        modelId
      );
      if (response.success && response.data) {
        const updatedStoryboard = response.data;
        const index = storyboards.value.findIndex((s) => s.id === storyboardId);
        if (index !== -1) {
          storyboards.value[index] = updatedStoryboard;
        }
        return updatedStoryboard;
      } else {
        error.value = response.error || "生成图像失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "生成图像失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function generateSceneImages(sceneId, styleName, providerConfigId, modelId, onProgress) {
    loading.value = true;
    error.value = null;
    let unsubscribe = null;
    if (onProgress) {
      unsubscribe = window.electronAPI.storyToVideo.onImageProgress(
        (_event, data) => {
          if (data.sceneId === sceneId) {
            onProgress(data.index, data.total);
          }
        }
      );
    }
    try {
      const response = await window.electronAPI.storyToVideo.generateSceneImages(
        sceneId,
        styleName,
        providerConfigId,
        modelId
      );
      if (response.success && response.data) {
        const updatedStoryboards = response.data;
        for (const updated of updatedStoryboards) {
          const index = storyboards.value.findIndex((s) => s.id === updated.id);
          if (index !== -1) {
            storyboards.value[index] = updated;
          }
        }
        return updatedStoryboards;
      } else {
        error.value = response.error || "批量生成图像失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "批量生成图像失败";
      return null;
    } finally {
      loading.value = false;
      if (unsubscribe) {
        unsubscribe();
      }
    }
  }
  async function generateSceneAudio(sceneId, onProgress) {
    loading.value = true;
    error.value = null;
    let unsubscribe = null;
    if (onProgress) {
      unsubscribe = window.electronAPI.storyToVideo.onAudioProgress(
        (_event, data) => {
          if (data.sceneId === sceneId) {
            onProgress(data.type, data.index, data.total);
          }
        }
      );
    }
    try {
      const response = await window.electronAPI.storyToVideo.generateAudio(sceneId);
      if (response.success && response.data) {
        return response.data;
      } else {
        error.value = response.error || "生成音频失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "生成音频失败";
      return null;
    } finally {
      loading.value = false;
      if (unsubscribe) {
        unsubscribe();
      }
    }
  }
  async function getVideoPresets() {
    try {
      const response = await window.electronAPI.storyToVideo.getVideoPresets();
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (e) {
      console.error("获取视频预设失败:", e);
      return null;
    }
  }
  async function synthesizeSceneVideo(sceneId, quality = "standard", onProgress) {
    loading.value = true;
    error.value = null;
    let unsubscribe = null;
    if (onProgress) {
      unsubscribe = window.electronAPI.storyToVideo.onSynthesisProgress(
        (_event, data) => {
          if (data.sceneId === sceneId) {
            onProgress(data.phase, data.progress);
          }
        }
      );
    }
    try {
      const response = await window.electronAPI.storyToVideo.synthesizeSceneVideo(sceneId, quality);
      if (response.success && response.data) {
        return response.data;
      } else {
        error.value = response.error || "视频合成失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "视频合成失败";
      return null;
    } finally {
      loading.value = false;
      if (unsubscribe) {
        unsubscribe();
      }
    }
  }
  async function exportVideo(sourcePath, outputPath, quality = "standard") {
    loading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.storyToVideo.exportVideo(
        sourcePath,
        outputPath,
        quality
      );
      if (response.success && response.data) {
        return response.data;
      } else {
        error.value = response.error || "导出视频失败";
        return null;
      }
    } catch (e) {
      error.value = e.message || "导出视频失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  function updateSelectedModel(providerConfigId, modelId) {
    selectedProviderConfigId.value = providerConfigId;
    selectedModelId.value = modelId;
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
  };
});
export {
  useStoryToVideoStore as u
};
