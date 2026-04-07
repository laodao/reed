import { d as defineComponent, W as useTabsStore, w as watch, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, X as arrow_left_default, e as createTextVNode, L as toDisplayString, B as setting_default, P as plus_default, G as Fragment, H as renderList, c as createBlock, Y as createCommentVNode, A as magic_stick_default, Z as video_play_default, $ as info_filled_default, r as ref, h as computed, R as reactive, E as ElMessage, f as resolveComponent, a0 as useRoute, I as useRouter, o as openBlock, J as normalizeClass, T as withModifiers, U as delete_default, a1 as zoom_in_default, x as picture_default, a2 as refresh_right_default, V as ElMessageBox, _ as _export_sfc } from "./index-CEiunyEa.js";
import { u as useStoryToVideoStore } from "./story-to-video--As1mzZs.js";
const _hoisted_1 = { class: "video-project-editor" };
const _hoisted_2 = { class: "editor-header" };
const _hoisted_3 = { class: "header-left" };
const _hoisted_4 = { class: "header-center" };
const _hoisted_5 = { class: "project-title" };
const _hoisted_6 = { class: "header-right" };
const _hoisted_7 = { class: "editor-content" };
const _hoisted_8 = { class: "left-panel" };
const _hoisted_9 = { class: "panel-header" };
const _hoisted_10 = { class: "episode-list" };
const _hoisted_11 = ["onClick"];
const _hoisted_12 = { class: "episode-number" };
const _hoisted_13 = { class: "episode-title" };
const _hoisted_14 = { class: "episode-status" };
const _hoisted_15 = { class: "center-panel" };
const _hoisted_16 = { class: "script-editor-new" };
const _hoisted_17 = { class: "scene-nav-sidebar" };
const _hoisted_18 = { class: "sidebar-header" };
const _hoisted_19 = { class: "scene-nav-list" };
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { class: "scene-nav-number" };
const _hoisted_22 = { class: "scene-nav-location" };
const _hoisted_23 = { class: "scene-nav-time" };
const _hoisted_24 = { class: "content-header" };
const _hoisted_25 = { class: "header-actions" };
const _hoisted_26 = { class: "script-content-body" };
const _hoisted_27 = ["id"];
const _hoisted_28 = { class: "scene-header-line" };
const _hoisted_29 = ["innerHTML"];
const _hoisted_30 = {
  key: 1,
  class: "no-script-content"
};
const _hoisted_31 = {
  key: 2,
  class: "no-script-content"
};
const _hoisted_32 = { class: "character-bindings" };
const _hoisted_33 = { class: "bindings-header" };
const _hoisted_34 = { class: "bindings-list" };
const _hoisted_35 = { class: "binding-character" };
const _hoisted_36 = { class: "binding-config" };
const _hoisted_37 = { class: "binding-actions" };
const _hoisted_38 = { class: "right-panel" };
const _hoisted_39 = { class: "panel-header" };
const _hoisted_40 = { class: "panel-actions" };
const _hoisted_41 = { class: "storyboard-list" };
const _hoisted_42 = ["onClick", "onDblclick"];
const _hoisted_43 = { class: "storyboard-item-left" };
const _hoisted_44 = ["onClick"];
const _hoisted_45 = ["src", "alt"];
const _hoisted_46 = { class: "preview-overlay" };
const _hoisted_47 = {
  key: 1,
  class: "storyboard-preview placeholder"
};
const _hoisted_48 = { class: "storyboard-info" };
const _hoisted_49 = { class: "storyboard-header" };
const _hoisted_50 = { class: "shot-number" };
const _hoisted_51 = { class: "storyboard-description" };
const _hoisted_52 = { class: "storyboard-meta" };
const _hoisted_53 = {
  key: 0,
  class: "selected-storyboard-info"
};
const _hoisted_54 = { class: "shot-label" };
const _hoisted_55 = { class: "shot-type" };
const _hoisted_56 = {
  key: 1,
  class: "no-selection-hint"
};
const _hoisted_57 = { class: "frame-description-preview" };
const _hoisted_58 = { class: "outline-hint" };
const _hoisted_59 = { class: "generate-info" };
const _hoisted_60 = { class: "synthesis-progress" };
const _hoisted_61 = { class: "progress-text" };
const _hoisted_62 = { class: "preview-container" };
const _hoisted_63 = ["src"];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "VideoProjectEditor",
  setup(__props) {
    const route = useRoute();
    const router = useRouter();
    const store = useStoryToVideoStore();
    const tabsStore = useTabsStore();
    function truncateTitle(title, maxLength = 5) {
      if (!title) return "";
      if (title.length <= maxLength) return title;
      return title.substring(0, maxLength) + "...";
    }
    function modelToString(model) {
      if (!model) return "";
      return `${model.providerConfigId}:${model.modelId}`;
    }
    function stringToModel(str) {
      if (!str) return null;
      const parts = str.split(":");
      if (parts.length !== 2) return null;
      return { providerConfigId: parts[0], modelId: parts[1] };
    }
    const projectId = computed(() => route.params.projectId);
    const activeTab = ref("script");
    const scriptSynopsis = ref("");
    const currentSceneIndex = ref(0);
    const scriptContentRef = ref(null);
    const chapters = ref([]);
    const outlineTreeRef = ref(null);
    const outlineSearchText = ref("");
    const outlineTreeData = ref([]);
    const outlineCascaderProps = {
      value: "id",
      label: "name",
      children: "children",
      checkStrictly: false,
      // 只能选择最后一级
      emitPath: false
      // 只返回最后选中的值
    };
    const outlineCascaderData = computed(() => {
      return outlineTreeData.value.map((volume) => ({
        id: volume.id,
        name: volume.name,
        nodeType: volume.nodeType,
        children: volume.children?.map((chapter) => ({
          id: chapter.id,
          name: chapter.name,
          nodeType: chapter.nodeType,
          // 只保留节级别的children
          children: chapter.children?.filter((section) => section.nodeType === "section").map((section) => ({
            id: section.id,
            name: section.name,
            nodeType: section.nodeType,
            // 保存路径信息用于生成标题
            volumeOrder: section.volumeOrder,
            volumeName: section.volumeName,
            chapterOrder: section.chapterOrder,
            chapterName: section.chapterName,
            sectionPosition: section.sectionPosition
          }))
        }))
      }));
    });
    const selectedOutlineInfo = ref(null);
    const showCreateEpisodeDialog = ref(false);
    const showEditEpisodeDialog = ref(false);
    const editingEpisodeId = ref("");
    const showSettingsDialog = ref(false);
    const showBindCharacterDialog = ref(false);
    const showGenerateImagesDialog = ref(false);
    const showSynthesisDialog = ref(false);
    const showStoryboardEditDialog = ref(false);
    const selectedStoryboard = ref(null);
    const editingStoryboard = ref(null);
    const showImagePreview = ref(false);
    const previewImageUrl = ref("");
    const openImagePreview = (url) => {
      if (url) {
        previewImageUrl.value = url;
        showImagePreview.value = true;
      }
    };
    const shotTypeLabels = {
      extreme_long: "大远景",
      long: "远景",
      full: "全景",
      medium: "中景",
      medium_close: "中近景",
      close: "近景",
      extreme_close: "特写",
      detail: "细节特写"
    };
    const cameraAngleLabels = {
      eye_level: "平视",
      high: "俯视",
      low: "仰视",
      dutch: "倾斜",
      birds_eye: "鸟瞰",
      worms_eye: "虫视"
    };
    const cameraMovementLabels = {
      static: "固定",
      pan_left: "左摇",
      pan_right: "右摇",
      tilt_up: "上仰",
      tilt_down: "下俯",
      dolly_in: "推近",
      dolly_out: "拉远",
      zoom_in: "放大",
      zoom_out: "缩小",
      tracking: "跟拍",
      crane: "升降"
    };
    function getShotTypeLabel(type) {
      return shotTypeLabels[type] || type;
    }
    function getCameraAngleLabel(angle) {
      return cameraAngleLabels[angle] || angle;
    }
    function getCameraMovementLabel(movement) {
      return cameraMovementLabels[movement] || movement;
    }
    function goToVideoProduction() {
      if (!store.currentScene) {
        ElMessage.warning("请先选择场景");
        return;
      }
      router.push(`/story-to-video/${projectId.value}/production/${store.currentScene.id}`);
    }
    const showRegenerateDialog = ref(false);
    const regeneratingStoryboard = ref(null);
    const regenerateForm = reactive({
      styleName: "cinematic",
      additionalPrompt: ""
    });
    function openRegenerateDialog(storyboard) {
      regeneratingStoryboard.value = storyboard;
      regenerateForm.styleName = "cinematic";
      regenerateForm.additionalPrompt = "";
      showRegenerateDialog.value = true;
    }
    async function regenerateStoryboardImage() {
      if (!regeneratingStoryboard.value) return;
      try {
        const result = await store.generateStoryboardImage(
          regeneratingStoryboard.value.id,
          regenerateForm.styleName,
          void 0,
          void 0,
          regenerateForm.additionalPrompt
        );
        if (result) {
          ElMessage.success("画面生成成功");
          showRegenerateDialog.value = false;
        } else {
          ElMessage.error("画面生成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "画面生成失败");
      }
    }
    async function confirmDeleteStoryboardImage(storyboard) {
      try {
        await ElMessageBox.confirm("确定要删除这个画面吗？删除后可以重新生成。", "删除画面", {
          type: "warning"
        });
        ElMessage.success("画面已删除");
      } catch {
      }
    }
    const storyboardEditForm = reactive({
      shotNumber: 1,
      shotType: "medium",
      cameraAngle: "eye_level",
      cameraMovement: "static",
      duration: 3,
      frameDescription: "",
      transitionType: "cut",
      transitionDuration: 500,
      transitionDirection: void 0
    });
    const bindCharacterForm = reactive({
      characterId: "",
      voiceType: "female_gentle",
      speechRate: 1,
      description: ""
    });
    const availableCharacters = computed(() => {
      const boundIds = store.characterBindings.map((b) => b.longWritingCharacterId);
      return longWritingCharacters.value.filter((c) => !boundIds.includes(c.id));
    });
    const imageGenerateForm = reactive({
      styleName: "cinematic"
    });
    const synthesisForm = reactive({
      quality: "standard"
    });
    const synthesisProgress = reactive({
      phase: "",
      progress: 0
    });
    const generatingImage = ref(false);
    const episodeForm = reactive({
      episodeNumber: 1,
      title: "",
      outlineId: ""
    });
    const projectSettings = reactive({
      name: "",
      config: {
        aspectRatio: "16:9",
        resolution: 1080,
        fps: 30,
        defaultTransition: "fade",
        stylePrompt: "",
        // 模型配置（使用字符串格式 "providerConfigId:modelId"）
        scriptModel: "",
        storyboardModel: "",
        imageModel: "",
        videoModel: "",
        audioModel: ""
      }
    });
    const longWritingCharacters = ref([]);
    const providerConfigs = ref([]);
    const providerTemplates = ref([]);
    const selectedModelKey = ref("");
    function isTextModel(type) {
      return type === void 0 || type === "text" || type === "multimodal";
    }
    const providerModels = computed(() => {
      const result = [];
      for (const config of providerConfigs.value) {
        if (!config.isEnabled) continue;
        const models = [];
        const template = providerTemplates.value.find((t) => t.id === config.templateId);
        if (config.models && config.models.length > 0) {
          for (const model of config.models) {
            if (!isTextModel(model.type)) continue;
            models.push({
              id: model.id,
              name: model.name,
              contextWindow: model.contextWindow,
              type: model.type
            });
          }
        } else if (template && template.models.length > 0) {
          for (const model of template.models) {
            if (!isTextModel(model.type)) continue;
            models.push({
              id: model.id,
              name: model.name || model.id,
              contextWindow: model.contextWindow || 8192,
              type: model.type
            });
          }
        }
        if (models.length > 0) {
          const displayShortId = config.shortId || config.name;
          result.push({
            id: config.id,
            name: config.name,
            shortId: displayShortId,
            models
          });
        }
      }
      return result;
    });
    const imageProviderModels = computed(() => {
      const result = [];
      for (const config of providerConfigs.value) {
        if (!config.isEnabled) continue;
        const template = providerTemplates.value.find((t) => t.id === config.templateId);
        const supportsImage = template?.capabilities?.includes("image");
        if (!supportsImage) continue;
        const models = [];
        if (config.models && config.models.length > 0) {
          for (const model of config.models) {
            if (model.type === "text" || model.type === "embedding") continue;
            models.push({
              id: model.id,
              name: model.name,
              type: model.type
            });
          }
        } else if (template && template.models.length > 0) {
          for (const model of template.models) {
            if (model.type === "text" || model.type === "embedding") continue;
            models.push({
              id: model.id,
              name: model.name || model.id,
              type: model.type
            });
          }
        } else {
          models.push({
            id: "default",
            name: "默认模型",
            type: "image"
          });
        }
        if (models.length > 0) {
          const displayShortId = config.shortId || config.name;
          result.push({
            id: config.id,
            name: config.name,
            shortId: displayShortId,
            models
          });
        }
      }
      return result;
    });
    const videoProviderModels = computed(() => {
      const result = [];
      for (const config of providerConfigs.value) {
        if (!config.isEnabled) continue;
        const template = providerTemplates.value.find((t) => t.id === config.templateId);
        const models = [];
        if (config.models && config.models.length > 0) {
          for (const model of config.models) {
            if (model.type === "video" || model.type === "multimodal") {
              models.push({
                id: model.id,
                name: model.name,
                type: model.type
              });
            }
          }
        } else if (template && template.models.length > 0) {
          for (const model of template.models) {
            if (model.type === "video" || model.type === "multimodal") {
              models.push({
                id: model.id,
                name: model.name || model.id,
                type: model.type
              });
            }
          }
        }
        if (models.length > 0) {
          const displayShortId = config.shortId || config.name;
          result.push({
            id: config.id,
            name: config.name,
            shortId: displayShortId,
            models
          });
        }
      }
      if (result.length === 0) {
        return textProviderModels.value;
      }
      return result;
    });
    const audioProviderModels = computed(() => {
      const result = [];
      for (const config of providerConfigs.value) {
        if (!config.isEnabled) continue;
        const template = providerTemplates.value.find((t) => t.id === config.templateId);
        const models = [];
        if (config.models && config.models.length > 0) {
          for (const model of config.models) {
            if (model.type === "audio") {
              models.push({
                id: model.id,
                name: model.name,
                type: model.type
              });
            }
          }
        } else if (template && template.models.length > 0) {
          for (const model of template.models) {
            if (model.type === "audio") {
              models.push({
                id: model.id,
                name: model.name || model.id,
                type: model.type
              });
            }
          }
        }
        if (models.length > 0) {
          const displayShortId = config.shortId || config.name;
          result.push({
            id: config.id,
            name: config.name,
            shortId: displayShortId,
            models
          });
        }
      }
      return result;
    });
    const textProviderModels = computed(() => {
      const result = [];
      for (const config of providerConfigs.value) {
        if (!config.isEnabled) continue;
        const models = [];
        const template = providerTemplates.value.find((t) => t.id === config.templateId);
        if (config.models && config.models.length > 0) {
          for (const model of config.models) {
            if (!model.type || model.type === "text" || model.type === "multimodal") {
              models.push({
                id: model.id,
                name: model.name,
                contextWindow: model.contextWindow,
                type: model.type
              });
            }
          }
        } else if (template && template.models.length > 0) {
          for (const model of template.models) {
            if (!model.type || model.type === "text" || model.type === "multimodal") {
              models.push({
                id: model.id,
                name: model.name || model.id,
                contextWindow: model.contextWindow || 8192,
                type: model.type
              });
            }
          }
        }
        if (models.length > 0) {
          const displayShortId = config.shortId || config.name;
          result.push({
            id: config.id,
            name: config.name,
            shortId: displayShortId,
            models
          });
        }
      }
      return result;
    });
    async function loadProviderConfigs() {
      try {
        const templatesResponse = await window.electronAPI.providerTemplate.list();
        if (templatesResponse.success && templatesResponse.templates) {
          providerTemplates.value = templatesResponse.templates;
        }
        const response = await window.electronAPI.providerConfig.list();
        if (response.success && response.configs) {
          providerConfigs.value = response.configs.filter((c) => c.isEnabled);
          if (!selectedModelKey.value && providerModels.value.length > 0) {
            const firstProvider = providerModels.value[0];
            const firstModel = firstProvider.models[0];
            selectedModelKey.value = `${firstProvider.id}:${firstModel.id}`;
            store.updateSelectedModel(firstProvider.id, firstModel.id);
          }
        }
      } catch (error) {
        console.error("加载提供商配置失败:", error);
      }
    }
    async function loadProject() {
      await loadProviderConfigs();
      await store.loadProject(projectId.value);
      if (store.currentProject) {
        const projectName = truncateTitle(store.currentProject.name);
        tabsStore.updateTabTitle(route.path, projectName);
        await store.loadEpisodes(projectId.value);
        await store.loadCharacterBindings(projectId.value);
        if (store.currentProject.longWritingProjectId) {
          await loadLongWritingData(store.currentProject.longWritingProjectId);
        }
        projectSettings.name = store.currentProject.name;
        const config = store.currentProject.config;
        projectSettings.config = {
          ...config,
          scriptModel: modelToString(config.scriptModel),
          storyboardModel: modelToString(config.storyboardModel),
          imageModel: modelToString(config.imageModel),
          videoModel: modelToString(config.videoModel),
          audioModel: modelToString(config.audioModel)
        };
        if (store.episodes.length === 1) {
          console.log("[VideoProjectEditor] 自动选中唯一的剧集");
          await selectEpisode(store.episodes[0]);
        }
      }
    }
    async function loadLongWritingData(longWritingProjectId) {
      try {
        const outlineResponse = await window.electronAPI.longwriting.getOutlineTree(longWritingProjectId);
        console.log("章节响应:", outlineResponse);
        if (outlineResponse.success && outlineResponse.data) {
          chapters.value = outlineResponse.data.map((o) => ({
            id: o.id,
            order: o.orderIndex,
            title: o.name
          }));
          buildOutlineTree(outlineResponse.data);
        }
        const charResponse = await window.electronAPI.longwriting.getCharacters(longWritingProjectId);
        console.log("角色响应:", charResponse);
        if (charResponse.success && charResponse.data) {
          longWritingCharacters.value = charResponse.data.map((c) => ({
            id: c.id,
            name: c.name
          }));
        }
      } catch (error) {
        console.error("加载长文数据失败:", error);
      }
    }
    function buildOutlineTree(outlines) {
      const volumes = outlines.filter((o) => o.nodeType === "volume").sort((a, b) => a.orderIndex - b.orderIndex);
      const chaptersData = outlines.filter((o) => o.nodeType === "chapter").sort((a, b) => a.orderIndex - b.orderIndex);
      const sections = outlines.filter((o) => o.nodeType === "section").sort((a, b) => a.orderIndex - b.orderIndex);
      const tree = [];
      let volumeNumber = 0;
      for (const volume of volumes) {
        volumeNumber++;
        const volumeNode = {
          id: volume.id,
          name: volume.name,
          nodeType: "volume",
          orderIndex: volume.orderIndex,
          volumePosition: volumeNumber,
          // 位置序号
          children: []
        };
        const volumeChapters = chaptersData.filter((c) => c.parentId === volume.id);
        let chapterNumber = 0;
        for (const chapter of volumeChapters) {
          chapterNumber++;
          const chapterNode = {
            id: chapter.id,
            name: chapter.name,
            nodeType: "chapter",
            orderIndex: chapter.orderIndex,
            volumeOrder: volumeNumber,
            // 使用卷的位置序号
            volumeName: volume.name,
            chapterPosition: chapterNumber,
            // 章节位置序号
            children: []
          };
          const chapterSections = sections.filter((s) => s.parentId === chapter.id);
          let sectionNumber = 0;
          for (const section of chapterSections) {
            sectionNumber++;
            const sectionNode = {
              id: section.id,
              name: section.name,
              nodeType: "section",
              orderIndex: section.orderIndex,
              volumeOrder: volumeNumber,
              // 使用卷的位置序号
              volumeName: volume.name,
              chapterOrder: chapterNumber,
              // 使用章节的位置序号
              chapterName: chapter.name,
              sectionPosition: sectionNumber
              // 节的位置序号
            };
            chapterNode.children.push(sectionNode);
          }
          volumeNode.children.push(chapterNode);
        }
        tree.push(volumeNode);
      }
      if (volumes.length === 0 && chaptersData.length > 0) {
        let chapterNumber = 0;
        for (const chapter of chaptersData) {
          chapterNumber++;
          const chapterNode = {
            id: chapter.id,
            name: chapter.name,
            nodeType: "chapter",
            orderIndex: chapter.orderIndex,
            chapterPosition: chapterNumber,
            children: []
          };
          const chapterSections = sections.filter((s) => s.parentId === chapter.id);
          let sectionNumber = 0;
          for (const section of chapterSections) {
            sectionNumber++;
            const sectionNode = {
              id: section.id,
              name: section.name,
              nodeType: "section",
              orderIndex: section.orderIndex,
              chapterOrder: chapterNumber,
              chapterName: chapter.name,
              sectionPosition: sectionNumber
            };
            chapterNode.children.push(sectionNode);
          }
          tree.push(chapterNode);
        }
      }
      outlineTreeData.value = tree;
    }
    function handleOutlineCascaderChange(value) {
      if (!value) {
        episodeForm.outlineId = "";
        selectedOutlineInfo.value = null;
        episodeForm.title = "";
        return;
      }
      const findNode = (nodes, id) => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      const selectedNode = findNode(outlineTreeData.value, value);
      if (!selectedNode || selectedNode.nodeType !== "section") {
        ElMessage.warning('请选择"节"级别的章节');
        episodeForm.outlineId = "";
        return;
      }
      episodeForm.outlineId = selectedNode.id;
      const volumeNum = selectedNode.volumeOrder || 0;
      const chapterNum = selectedNode.chapterOrder || 0;
      const sectionNum = selectedNode.sectionPosition || 1;
      selectedOutlineInfo.value = {
        id: selectedNode.id,
        volumeOrder: volumeNum,
        volumeName: selectedNode.volumeName || "",
        chapterOrder: chapterNum,
        chapterName: selectedNode.chapterName || "",
        sectionOrder: sectionNum,
        sectionName: selectedNode.name
      };
      episodeForm.title = selectedNode.name;
    }
    function goBack() {
      router.push("/story-to-video");
    }
    async function selectEpisode(episode) {
      await store.selectEpisode(episode);
      if (store.currentScript) {
        scriptSynopsis.value = store.currentScript.synopsis;
      }
    }
    async function confirmDeleteEpisode(episode) {
      try {
        await ElMessageBox.confirm(
          `确定要删除「第${episode.episodeNumber}集：${episode.title}」吗？删除后可在数据库中恢复。`,
          "删除剧集",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const success = await store.deleteEpisode(episode.id);
        if (success) {
          ElMessage.success("删除成功");
        } else {
          ElMessage.error(store.error || "删除失败");
        }
      } catch {
      }
    }
    function openCreateEpisodeDialog() {
      episodeForm.episodeNumber = store.episodes.length + 1;
      episodeForm.title = "";
      episodeForm.outlineId = "";
      selectedOutlineInfo.value = null;
      outlineSearchText.value = "";
      outlineTreeRef.value?.setCurrentKey(null);
      showCreateEpisodeDialog.value = true;
    }
    async function createEpisode() {
      if (!episodeForm.title.trim()) {
        ElMessage.warning("请输入剧集标题");
        return;
      }
      const episode = await store.createEpisode(
        projectId.value,
        episodeForm.outlineId || "",
        episodeForm.episodeNumber,
        episodeForm.title
      );
      if (episode) {
        ElMessage.success("创建成功");
        showCreateEpisodeDialog.value = false;
        episodeForm.episodeNumber = store.episodes.length + 1;
        episodeForm.title = "";
        episodeForm.outlineId = "";
        selectedOutlineInfo.value = null;
        outlineSearchText.value = "";
        outlineTreeRef.value?.setCurrentKey(null);
        await selectEpisode(episode);
        if (episodeForm.outlineId) {
          await autoBindCharactersFromOutline(episodeForm.outlineId);
        }
      } else {
        ElMessage.error(store.error || "创建失败");
      }
    }
    function openEditEpisodeDialog(episode) {
      editingEpisodeId.value = episode.id;
      episodeForm.episodeNumber = episode.episodeNumber;
      episodeForm.title = episode.title;
      showEditEpisodeDialog.value = true;
    }
    async function updateEpisode() {
      if (!episodeForm.title.trim()) {
        ElMessage.warning("请输入剧集标题");
        return;
      }
      const episode = await store.updateEpisode(
        editingEpisodeId.value,
        {
          episodeNumber: episodeForm.episodeNumber,
          title: episodeForm.title
        }
      );
      if (episode) {
        ElMessage.success("保存成功");
        showEditEpisodeDialog.value = false;
      } else {
        ElMessage.error(store.error || "保存失败");
      }
    }
    async function autoBindCharactersFromOutline(outlineId) {
      try {
        const outlineResponse = await window.electronAPI.longwriting.getOutline(outlineId);
        if (!outlineResponse.success || !outlineResponse.data) return;
        const outline = outlineResponse.data;
        const involvedCharacterIds = outline.involvedCharacters || [];
        if (involvedCharacterIds.length === 0) return;
        let boundCount = 0;
        for (const charId of involvedCharacterIds) {
          const existingBinding = store.getBindingByCharacterId(charId);
          if (existingBinding) continue;
          const charInfo = longWritingCharacters.value.find((c) => c.id === charId);
          if (!charInfo) continue;
          const binding = await store.bindCharacter(
            projectId.value,
            charId,
            "female_gentle",
            // 默认声音
            1,
            // 默认语速
            ""
            // 描述
          );
          if (binding) {
            boundCount++;
          }
        }
        if (boundCount > 0) {
          ElMessage.success(`已自动绑定 ${boundCount} 个角色`);
        }
      } catch (error) {
        console.error("自动绑定角色失败:", error);
      }
    }
    async function saveScriptSynopsis() {
      if (!store.currentScript) return;
      await store.updateScript(store.currentScript.id, { synopsis: scriptSynopsis.value });
    }
    function getLocationTypeLabel(type) {
      const labels = {
        interior: "内景",
        exterior: "外景",
        mixed: "混合"
      };
      return labels[type] || type;
    }
    function getTimeOfDayLabel(time) {
      const labels = {
        morning: "早晨",
        noon: "中午",
        afternoon: "下午",
        evening: "傍晚",
        night: "夜晚",
        dawn: "黎明",
        dusk: "黄昏"
      };
      return labels[time] || time;
    }
    function formatSceneHeader(scene) {
      const typeLabel = scene.locationType === "interior" ? "INT." : scene.locationType === "exterior" ? "EXT." : "INT./EXT.";
      const timeLabel = getTimeOfDayLabel(scene.timeOfDay);
      return `${typeLabel} ${scene.location} - ${timeLabel}`;
    }
    function formatSceneScriptContent(scene, index) {
      if (!store.currentScript?.scriptContent) {
        return `<p class="no-content">场景内容尚未生成</p>`;
      }
      const fullContent = store.currentScript.scriptContent;
      const sceneHeader = formatSceneHeader(scene);
      const nextSceneIndex = index + 1;
      let nextSceneHeader = "";
      if (nextSceneIndex < store.scenes.length) {
        nextSceneHeader = formatSceneHeader(store.scenes[nextSceneIndex]);
      }
      const headerIndex = fullContent.indexOf(sceneHeader);
      if (headerIndex === -1) {
        const altHeader = scene.locationType === "interior" ? `INT. ${scene.location}` : scene.locationType === "exterior" ? `EXT. ${scene.location}` : `INT./EXT. ${scene.location}`;
        const altHeaderIndex = fullContent.indexOf(altHeader);
        if (altHeaderIndex !== -1) {
          let endIndex2 = fullContent.length;
          if (nextSceneIndex < store.scenes.length) {
            const nextAltHeader = store.scenes[nextSceneIndex].locationType === "interior" ? `INT. ${store.scenes[nextSceneIndex].location}` : store.scenes[nextSceneIndex].locationType === "exterior" ? `EXT. ${store.scenes[nextSceneIndex].location}` : `INT./EXT. ${store.scenes[nextSceneIndex].location}`;
            const nextIndex = fullContent.indexOf(nextAltHeader, altHeaderIndex + altHeader.length);
            if (nextIndex !== -1) {
              endIndex2 = nextIndex;
            }
          }
          const content2 = fullContent.substring(altHeaderIndex, endIndex2);
          return formatScriptToHtml(content2);
        }
        return `<div class="fallback-content">
      <p class="narration">${scene.narration}</p>
      ${scene.dialogues.map((d) => `
        <div class="dialogue">
          <span class="character-name">${d.characterName}</span>
          <span class="parenthetical">${d.emotion || ""}</span>
          <p class="text">${d.text}</p>
        </div>
      `).join("")}
    </div>`;
      }
      let endIndex = fullContent.length;
      if (nextSceneHeader && nextSceneIndex < store.scenes.length) {
        const nextIndex = fullContent.indexOf(nextSceneHeader, headerIndex + sceneHeader.length);
        if (nextIndex !== -1) {
          endIndex = nextIndex;
        }
      }
      const content = fullContent.substring(headerIndex, endIndex);
      return formatScriptToHtml(content);
    }
    function formatScriptToHtml(text) {
      if (!text) return "";
      const shotTerms = [
        "特写",
        "远景",
        "全景",
        "中景",
        "近景",
        "大远景",
        "大特写",
        "细节特写",
        "中近景",
        "主观镜头",
        "跟拍",
        "摇镜头",
        "移镜头",
        "俯拍",
        "仰拍",
        "侧拍",
        "正面镜头",
        "背面镜头",
        "过肩镜头",
        "双人镜头",
        "三人镜头",
        "群像镜头",
        "定格",
        "慢动作",
        "快切"
      ];
      const lines = text.split("\n");
      const htmlLines = [];
      let lastLineWasEmpty = false;
      let lastLineWasCharacterName = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          if (!lastLineWasEmpty) {
            htmlLines.push('<div class="empty-line"></div>');
            lastLineWasEmpty = true;
          }
          lastLineWasCharacterName = false;
          continue;
        }
        lastLineWasEmpty = false;
        if (line.match(/^(INT\.|EXT\.|INT\.\/EXT\.)/i)) {
          htmlLines.push(`<div class="scene-header-line">${escapeHtml(line)}</div>`);
          lastLineWasCharacterName = false;
          continue;
        }
        if (line.match(/^(CUT TO:|FADE OUT\.|FADE IN:|SMASH CUT TO:|DISSOLVE TO:)/i)) {
          htmlLines.push(`<div class="transition-line">${escapeHtml(line)}</div>`);
          lastLineWasCharacterName = false;
          continue;
        }
        if (line.match(/^\s{10,}[A-Z\u4e00-\u9fa5]+/)) {
          const charMatch = line.match(/^\s+(.+)$/);
          if (charMatch && charMatch[1].length < 20) {
            const characterName = charMatch[1];
            htmlLines.push(`<div class="character-name-line"><strong>${escapeHtml(characterName)}</strong>：</div>`);
            lastLineWasCharacterName = true;
            continue;
          }
        }
        if (line.match(/^\s{5,}\([^)]+\)\s*$/)) {
          htmlLines.push(`<div class="parenthetical-line">${escapeHtml(line.trim())}</div>`);
          lastLineWasCharacterName = false;
          continue;
        }
        if (line.match(/^\s{5,}/)) {
          if (lastLineWasCharacterName) {
            htmlLines.push(`<div class="dialogue-line">${escapeHtml(line.trim())}</div>`);
            continue;
          }
        }
        if (line.length > 0) {
          let processedLine = escapeHtml(line);
          shotTerms.forEach((term) => {
            const regex = new RegExp(`(${term})`, "g");
            processedLine = processedLine.replace(regex, "<strong>$1</strong>");
          });
          htmlLines.push(`<p class="action-line">${processedLine}</p>`);
        }
        lastLineWasCharacterName = false;
      }
      return htmlLines.join("\n");
    }
    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    function scrollToScene(index) {
      currentSceneIndex.value = index;
      const element = document.getElementById(`scene-${index}`);
      const container = document.querySelector(".script-content-body");
      if (element && container) {
        container.scrollTo({
          top: element.offsetTop - 16,
          behavior: "smooth"
        });
      }
      if (store.scenes[index]) {
        store.selectScene(store.scenes[index]);
      }
      selectedStoryboard.value = null;
    }
    async function generateScript() {
      if (!store.currentProject) {
        ElMessage.warning("项目数据加载中，请稍候");
        return;
      }
      if (!store.currentEpisode) {
        if (store.episodes.length === 0) {
          ElMessage.warning("请先在左侧面板添加剧集");
        } else {
          ElMessage.warning("请在左侧面板选择要生成剧本的剧集");
        }
        return;
      }
      if (!store.currentEpisode.outlineId) {
        ElMessage.warning("该剧集未关联章节，无法生成剧本");
        return;
      }
      const scriptModel = store.currentProject.config?.scriptModel;
      if (!scriptModel?.providerConfigId || !scriptModel?.modelId) {
        ElMessage.warning("请先在项目设置中配置剧本生成模型");
        return;
      }
      try {
        ElMessage.info("正在生成剧本，请稍候...");
        const result = await store.generateScript(
          store.currentProject.id,
          store.currentEpisode.outlineId,
          scriptModel.providerConfigId,
          scriptModel.modelId
        );
        if (result) {
          ElMessage.success(`剧本生成成功，共 ${result.scenes.length} 个场景`);
          scriptSynopsis.value = result.script.synopsis;
          await store.loadEpisodes(store.currentProject.id);
          const updatedEpisode = store.episodes.find((e) => e.id === store.currentEpisode?.id);
          if (updatedEpisode) {
            await store.selectEpisode(updatedEpisode);
          }
        } else {
          ElMessage.error(store.error || "生成剧本失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "生成剧本失败");
      }
    }
    async function generateScenes() {
      if (!store.currentScript) {
        ElMessage.warning("请先生成剧本");
        return;
      }
      if (!store.selectedProviderConfigId || !store.selectedModelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      try {
        ElMessage.info("正在拆分场景，请稍候...");
        const result = await store.generateScenes(
          store.currentScript.id,
          store.selectedProviderConfigId,
          store.selectedModelId
        );
        if (result) {
          ElMessage.success(`场景拆分成功，共 ${result.length} 个场景`);
        } else {
          ElMessage.error(store.error || "拆分场景失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "拆分场景失败");
      }
    }
    function openStoryboardEdit(storyboard) {
      editingStoryboard.value = storyboard;
      storyboardEditForm.shotNumber = storyboard.shotNumber;
      storyboardEditForm.shotType = storyboard.shotType;
      storyboardEditForm.cameraAngle = storyboard.cameraAngle;
      storyboardEditForm.cameraMovement = storyboard.cameraMovement;
      storyboardEditForm.duration = storyboard.duration;
      storyboardEditForm.frameDescription = storyboard.frameDescription;
      storyboardEditForm.transitionType = storyboard.transition.type;
      storyboardEditForm.transitionDuration = storyboard.transition.duration;
      storyboardEditForm.transitionDirection = storyboard.transition.direction;
      showStoryboardEditDialog.value = true;
    }
    function selectStoryboard(storyboard) {
      if (selectedStoryboard.value?.id === storyboard.id) {
        selectedStoryboard.value = null;
      } else {
        selectedStoryboard.value = storyboard;
      }
    }
    async function saveStoryboardEdit() {
      if (!editingStoryboard.value) return;
      const success = await store.updateStoryboard(editingStoryboard.value.id, {
        shotNumber: storyboardEditForm.shotNumber,
        shotType: storyboardEditForm.shotType,
        cameraAngle: storyboardEditForm.cameraAngle,
        cameraMovement: storyboardEditForm.cameraMovement,
        duration: storyboardEditForm.duration,
        frameDescription: storyboardEditForm.frameDescription,
        transition: {
          type: storyboardEditForm.transitionType,
          duration: storyboardEditForm.transitionDuration,
          direction: storyboardEditForm.transitionDirection,
          easing: "ease_out"
        }
      });
      if (success) {
        ElMessage.success("分镜已更新");
        showStoryboardEditDialog.value = false;
        editingStoryboard.value = null;
      } else {
        ElMessage.error(store.error || "保存失败");
      }
    }
    async function generateStoryboards() {
      if (!store.currentScript) {
        ElMessage.warning("请先生成剧本");
        return;
      }
      if (store.scenes.length === 0) {
        ElMessage.warning("请先拆分场景");
        return;
      }
      const storyboardModel = store.currentProject?.config?.storyboardModel;
      if (!storyboardModel?.providerConfigId || !storyboardModel?.modelId) {
        ElMessage.warning("请先在项目设置中配置分镜生成模型");
        return;
      }
      try {
        const confirm = await ElMessageBox.confirm(
          `将为 ${store.scenes.length} 个场景生成分镜，是否继续？`,
          "生成分镜",
          { confirmButtonText: "生成", cancelButtonText: "取消", type: "info" }
        ).catch(() => false);
        if (!confirm) return;
        ElMessage.info("正在生成分镜，请稍候...");
        const result = await store.generateStoryboards(
          store.currentScript.id,
          storyboardModel.providerConfigId,
          storyboardModel.modelId
        );
        if (result) {
          ElMessage.success(`分镜生成成功，共 ${result.length} 个镜头`);
        } else {
          ElMessage.error(store.error || "生成分镜失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "生成分镜失败");
      }
    }
    async function generateSingleStoryboardImage() {
      if (!selectedStoryboard.value) {
        ElMessage.warning("请先选择一个分镜");
        return;
      }
      const imageModel = store.currentProject?.config?.imageModel;
      if (!imageModel?.providerConfigId || !imageModel?.modelId) {
        ElMessage.warning("请先在项目设置中配置画面生成模型");
        return;
      }
      console.log("[generateSingleStoryboardImage] 使用模型:", imageModel);
      try {
        generatingImage.value = true;
        showGenerateImagesDialog.value = false;
        ElMessage.info(`正在生成镜头 ${selectedStoryboard.value.shotNumber} 的画面，请稍候...`);
        const result = await store.generateStoryboardImage(
          selectedStoryboard.value.id,
          imageGenerateForm.styleName,
          imageModel.providerConfigId,
          imageModel.modelId
        );
        if (result) {
          ElMessage.success("画面生成成功");
          selectedStoryboard.value = result;
        } else {
          const errorMsg = store.error || "生成画面失败";
          console.error("[generateSingleStoryboardImage] 错误:", errorMsg);
          ElMessage.error(errorMsg);
        }
      } catch (error) {
        console.error("[generateSingleStoryboardImage] 异常:", error);
        ElMessage.error(error.message || "生成画面失败");
      } finally {
        generatingImage.value = false;
      }
    }
    async function saveProjectSettings() {
      if (!store.currentProject) return;
      const configToSave = {
        ...projectSettings.config,
        scriptModel: stringToModel(projectSettings.config.scriptModel),
        storyboardModel: stringToModel(projectSettings.config.storyboardModel),
        imageModel: stringToModel(projectSettings.config.imageModel),
        videoModel: stringToModel(projectSettings.config.videoModel),
        audioModel: stringToModel(projectSettings.config.audioModel)
      };
      const success = await store.updateProject(store.currentProject.id, {
        name: projectSettings.name,
        config: configToSave
      });
      if (success) {
        ElMessage.success("保存成功");
        showSettingsDialog.value = false;
      } else {
        ElMessage.error(store.error || "保存失败");
      }
    }
    function getEpisodeStatusLabel(status) {
      const labels = {
        draft: "草稿",
        pending: "待处理",
        script_completed: "剧本完成",
        storyboard_completed: "分镜完成",
        production: "制作中",
        completed: "完成"
      };
      return labels[status] || status;
    }
    function getEpisodeStatusType(status) {
      const types = {
        draft: "info",
        script_completed: "warning",
        storyboard_completed: "",
        production: "",
        completed: "success"
      };
      return types[status] || "info";
    }
    function getCharacterName(characterId) {
      const char = longWritingCharacters.value.find((c) => c.id === characterId);
      return char?.name || characterId;
    }
    async function handleBindCharacter() {
      if (!bindCharacterForm.characterId || !store.currentProject) {
        ElMessage.warning("请选择角色");
        return;
      }
      const result = await store.bindCharacter(
        store.currentProject.id,
        bindCharacterForm.characterId,
        void 0,
        // portraitId 暂时不绑定
        {
          voiceId: bindCharacterForm.voiceType,
          speed: bindCharacterForm.speechRate,
          pitch: 1
        },
        bindCharacterForm.description ? {
          baseDescription: bindCharacterForm.description
        } : void 0
      );
      if (result) {
        ElMessage.success("角色绑定成功");
        showBindCharacterDialog.value = false;
        bindCharacterForm.characterId = "";
        bindCharacterForm.voiceType = "female_gentle";
        bindCharacterForm.speechRate = 1;
        bindCharacterForm.description = "";
      } else {
        ElMessage.error(store.error || "绑定失败");
      }
    }
    function editBinding(binding) {
      ElMessage.info("编辑角色绑定功能开发中...");
    }
    async function removeBinding(binding) {
      try {
        await ElMessageBox.confirm("确定要移除该角色绑定吗？", "确认", {
          type: "warning"
        });
        await store.deleteCharacterBinding(binding.id);
        ElMessage.success("移除成功");
      } catch {
      }
    }
    async function synthesizeVideo() {
      if (!store.currentScene) {
        ElMessage.warning("请先选择场景");
        return;
      }
      try {
        synthesisProgress.phase = "shots";
        synthesisProgress.progress = 0;
        const result = await store.synthesizeSceneVideo(
          store.currentScene.id,
          synthesisForm.quality,
          (phase, progress) => {
            synthesisProgress.phase = phase;
            synthesisProgress.progress = Math.round(progress);
          }
        );
        if (result) {
          ElMessage.success(`视频合成成功，时长 ${result.duration} 秒`);
          showSynthesisDialog.value = false;
        } else {
          ElMessage.error(store.error || "视频合成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "视频合成失败");
      } finally {
        synthesisProgress.phase = "";
        synthesisProgress.progress = 0;
      }
    }
    function getSynthesisPhaseLabel(phase) {
      const labels = {
        shots: "生成镜头视频",
        audio: "合成音频",
        merge: "合并视频片段",
        final: "最终合成",
        complete: "完成"
      };
      return labels[phase] || phase;
    }
    watch(projectId, () => {
      loadProject();
    }, { immediate: true });
    watch(() => store.episodes.length, (length) => {
      episodeForm.episodeNumber = length + 1;
    });
    watch(outlineSearchText, (val) => {
      outlineTreeRef.value?.filter(val);
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_Edit = resolveComponent("Edit");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_collapse_item = resolveComponent("el-collapse-item");
      const _component_el_collapse = resolveComponent("el-collapse");
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_tabs = resolveComponent("el-tabs");
      const _component_el_tooltip = resolveComponent("el-tooltip");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_cascader = resolveComponent("el-cascader");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_divider = resolveComponent("el-divider");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_col = resolveComponent("el-col");
      const _component_el_row = resolveComponent("el-row");
      const _component_el_slider = resolveComponent("el-slider");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createVNode(_component_el_button, {
              text: "",
              onClick: goBack
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_left_default))
                  ]),
                  _: 1
                }),
                _cache[54] || (_cache[54] = createTextVNode(" 返回 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("h2", _hoisted_5, toDisplayString(unref(store).currentProject?.name || "加载中..."), 1)
          ]),
          createBaseVNode("div", _hoisted_6, [
            createVNode(_component_el_button, {
              onClick: _cache[0] || (_cache[0] = ($event) => showSettingsDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(setting_default))
                  ]),
                  _: 1
                }),
                _cache[55] || (_cache[55] = createTextVNode(" 项目设置 ", -1))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_7, [
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("div", _hoisted_9, [
              _cache[56] || (_cache[56] = createBaseVNode("h3", null, "剧集列表", -1)),
              createVNode(_component_el_button, {
                type: "primary",
                size: "small",
                onClick: openCreateEpisodeDialog,
                circle: ""
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(plus_default))
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            createBaseVNode("div", _hoisted_10, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).episodes, (episode) => {
                return openBlock(), createElementBlock("div", {
                  key: episode.id,
                  class: normalizeClass(["episode-item", { active: unref(store).currentEpisode?.id === episode.id }]),
                  onClick: ($event) => selectEpisode(episode)
                }, [
                  createBaseVNode("div", _hoisted_12, "第" + toDisplayString(episode.episodeNumber) + "集", 1),
                  createBaseVNode("div", _hoisted_13, toDisplayString(episode.title), 1),
                  createBaseVNode("div", _hoisted_14, [
                    createVNode(_component_el_tag, {
                      size: "small",
                      type: getEpisodeStatusType(episode.status)
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(getEpisodeStatusLabel(episode.status)), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  createBaseVNode("div", {
                    class: "episode-actions",
                    onClick: _cache[1] || (_cache[1] = withModifiers(() => {
                    }, ["stop"]))
                  }, [
                    createVNode(_component_el_button, {
                      text: "",
                      type: "primary",
                      size: "small",
                      onClick: ($event) => openEditEpisodeDialog(episode)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(_component_Edit)
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["onClick"]),
                    createVNode(_component_el_button, {
                      text: "",
                      type: "danger",
                      size: "small",
                      onClick: ($event) => confirmDeleteEpisode(episode)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(delete_default))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["onClick"])
                  ])
                ], 10, _hoisted_11);
              }), 128)),
              unref(store).episodes.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                key: 0,
                description: "暂无剧集",
                "image-size": 80
              })) : createCommentVNode("", true)
            ])
          ]),
          createBaseVNode("div", _hoisted_15, [
            unref(store).currentEpisode ? (openBlock(), createBlock(_component_el_tabs, {
              key: 0,
              modelValue: activeTab.value,
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => activeTab.value = $event),
              class: "editor-tabs"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_tab_pane, {
                  label: "剧本",
                  name: "script"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_16, [
                      createBaseVNode("div", _hoisted_17, [
                        createBaseVNode("div", _hoisted_18, [
                          _cache[58] || (_cache[58] = createBaseVNode("h4", null, "场景导航", -1)),
                          createVNode(_component_el_button, {
                            size: "small",
                            loading: unref(store).generating,
                            disabled: unref(store).generating,
                            onClick: generateScript
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(magic_stick_default))
                                ]),
                                _: 1
                              }),
                              _cache[57] || (_cache[57] = createTextVNode(" AI 生成剧本 ", -1))
                            ]),
                            _: 1
                          }, 8, ["loading", "disabled"])
                        ]),
                        createBaseVNode("div", _hoisted_19, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).scenes, (scene, index) => {
                            return openBlock(), createElementBlock("div", {
                              key: scene.id,
                              class: normalizeClass(["scene-nav-item", { active: currentSceneIndex.value === index }]),
                              onClick: ($event) => scrollToScene(index)
                            }, [
                              createBaseVNode("div", _hoisted_21, "场景 " + toDisplayString(scene.sceneNumber), 1),
                              createBaseVNode("div", _hoisted_22, toDisplayString(scene.location), 1),
                              createBaseVNode("div", _hoisted_23, [
                                createVNode(_component_el_tag, {
                                  size: "small",
                                  type: "info"
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(getLocationTypeLabel(scene.locationType)), 1)
                                  ]),
                                  _: 2
                                }, 1024),
                                createVNode(_component_el_tag, { size: "small" }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(getTimeOfDayLabel(scene.timeOfDay)), 1)
                                  ]),
                                  _: 2
                                }, 1024)
                              ])
                            ], 10, _hoisted_20);
                          }), 128)),
                          unref(store).scenes.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                            key: 0,
                            description: "暂无场景",
                            "image-size": 60
                          })) : createCommentVNode("", true)
                        ])
                      ]),
                      createBaseVNode("div", {
                        class: "script-content-area",
                        ref_key: "scriptContentRef",
                        ref: scriptContentRef
                      }, [
                        createBaseVNode("div", _hoisted_24, [
                          _cache[60] || (_cache[60] = createBaseVNode("h4", null, "剧本正文", -1)),
                          createBaseVNode("div", _hoisted_25, [
                            unref(store).currentScript && !unref(store).currentScript.scriptContent ? (openBlock(), createBlock(_component_el_button, {
                              key: 0,
                              size: "small",
                              loading: unref(store).generating,
                              disabled: unref(store).generating,
                              onClick: generateScenes
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_icon, null, {
                                  default: withCtx(() => [
                                    createVNode(unref(magic_stick_default))
                                  ]),
                                  _: 1
                                }),
                                _cache[59] || (_cache[59] = createTextVNode(" 拆分场景 ", -1))
                              ]),
                              _: 1
                            }, 8, ["loading", "disabled"])) : createCommentVNode("", true)
                          ])
                        ]),
                        createBaseVNode("div", _hoisted_26, [
                          unref(store).currentScript?.scriptContent ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(unref(store).scenes, (scene, index) => {
                            return openBlock(), createElementBlock("div", {
                              key: scene.id,
                              id: `scene-${index}`,
                              class: normalizeClass(["scene-block", { active: currentSceneIndex.value === index }])
                            }, [
                              createBaseVNode("div", _hoisted_28, toDisplayString(formatSceneHeader(scene)), 1),
                              createBaseVNode("div", {
                                class: "scene-script-content",
                                innerHTML: formatSceneScriptContent(scene, index)
                              }, null, 8, _hoisted_29)
                            ], 10, _hoisted_27);
                          }), 128)) : unref(store).currentScript ? (openBlock(), createElementBlock("div", _hoisted_30, [
                            createVNode(_component_el_empty, {
                              description: "剧本正文尚未生成",
                              "image-size": 120
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_button, {
                                  type: "primary",
                                  onClick: generateScript,
                                  loading: unref(store).generating
                                }, {
                                  default: withCtx(() => [..._cache[61] || (_cache[61] = [
                                    createTextVNode(" 生成完整剧本 ", -1)
                                  ])]),
                                  _: 1
                                }, 8, ["loading"])
                              ]),
                              _: 1
                            })
                          ])) : (openBlock(), createElementBlock("div", _hoisted_31, [
                            createVNode(_component_el_empty, {
                              description: "请先生成剧本",
                              "image-size": 120
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_button, {
                                  type: "primary",
                                  onClick: generateScript,
                                  loading: unref(store).generating
                                }, {
                                  default: withCtx(() => [..._cache[62] || (_cache[62] = [
                                    createTextVNode(" AI 生成剧本 ", -1)
                                  ])]),
                                  _: 1
                                }, 8, ["loading"])
                              ]),
                              _: 1
                            })
                          ]))
                        ])
                      ], 512)
                    ]),
                    createVNode(_component_el_collapse, { class: "script-synopsis-collapse" }, {
                      default: withCtx(() => [
                        createVNode(_component_el_collapse_item, {
                          title: "章节梗概",
                          name: "synopsis"
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input, {
                              modelValue: scriptSynopsis.value,
                              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => scriptSynopsis.value = $event),
                              type: "textarea",
                              rows: 3,
                              placeholder: "输入或生成剧本概要...",
                              onBlur: saveScriptSynopsis
                            }, null, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_component_el_tab_pane, {
                  label: "角色绑定",
                  name: "characters"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_32, [
                      createBaseVNode("div", _hoisted_33, [
                        _cache[64] || (_cache[64] = createBaseVNode("h4", null, "角色绑定配置", -1)),
                        createVNode(_component_el_button, {
                          size: "small",
                          onClick: _cache[3] || (_cache[3] = ($event) => showBindCharacterDialog.value = true)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(plus_default))
                              ]),
                              _: 1
                            }),
                            _cache[63] || (_cache[63] = createTextVNode(" 绑定角色 ", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      createBaseVNode("div", _hoisted_34, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).characterBindings, (binding) => {
                          return openBlock(), createElementBlock("div", {
                            key: binding.id,
                            class: "binding-item"
                          }, [
                            createBaseVNode("div", _hoisted_35, toDisplayString(getCharacterName(binding.longWritingCharacterId)), 1),
                            createBaseVNode("div", _hoisted_36, [
                              binding.portraitId ? (openBlock(), createBlock(_component_el_tag, {
                                key: 0,
                                size: "small",
                                type: "success"
                              }, {
                                default: withCtx(() => [..._cache[65] || (_cache[65] = [
                                  createTextVNode(" 已绑定人像 ", -1)
                                ])]),
                                _: 1
                              })) : (openBlock(), createBlock(_component_el_tag, {
                                key: 1,
                                size: "small",
                                type: "info"
                              }, {
                                default: withCtx(() => [..._cache[66] || (_cache[66] = [
                                  createTextVNode(" 未绑定人像 ", -1)
                                ])]),
                                _: 1
                              }))
                            ]),
                            createBaseVNode("div", _hoisted_37, [
                              createVNode(_component_el_button, {
                                text: "",
                                size: "small",
                                onClick: ($event) => editBinding(binding)
                              }, {
                                default: withCtx(() => [..._cache[67] || (_cache[67] = [
                                  createTextVNode(" 编辑 ", -1)
                                ])]),
                                _: 1
                              }, 8, ["onClick"]),
                              createVNode(_component_el_button, {
                                text: "",
                                size: "small",
                                type: "danger",
                                onClick: ($event) => removeBinding(binding)
                              }, {
                                default: withCtx(() => [..._cache[68] || (_cache[68] = [
                                  createTextVNode(" 移除 ", -1)
                                ])]),
                                _: 1
                              }, 8, ["onClick"])
                            ])
                          ]);
                        }), 128)),
                        unref(store).characterBindings.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                          key: 0,
                          description: "暂无角色绑定",
                          "image-size": 60
                        })) : createCommentVNode("", true)
                      ])
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["modelValue"])) : (openBlock(), createBlock(_component_el_empty, {
              key: 1,
              description: "请选择或创建剧集",
              "image-size": 120
            }))
          ]),
          createBaseVNode("div", _hoisted_38, [
            unref(store).currentScene ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createBaseVNode("div", _hoisted_39, [
                _cache[71] || (_cache[71] = createBaseVNode("h3", null, "分镜列表", -1)),
                createBaseVNode("div", _hoisted_40, [
                  createVNode(_component_el_button, {
                    size: "small",
                    loading: unref(store).generating,
                    disabled: unref(store).generating,
                    onClick: generateStoryboards
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(magic_stick_default))
                        ]),
                        _: 1
                      }),
                      _cache[69] || (_cache[69] = createTextVNode(" 生成分镜 ", -1))
                    ]),
                    _: 1
                  }, 8, ["loading", "disabled"]),
                  unref(store).storyboards.length > 0 ? (openBlock(), createBlock(_component_el_button, {
                    key: 0,
                    size: "small",
                    type: "primary",
                    onClick: goToVideoProduction
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(video_play_default))
                        ]),
                        _: 1
                      }),
                      _cache[70] || (_cache[70] = createTextVNode(" 视频制作 ", -1))
                    ]),
                    _: 1
                  })) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("div", _hoisted_41, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).storyboards, (storyboard) => {
                  return openBlock(), createElementBlock("div", {
                    key: storyboard.id,
                    class: normalizeClass(["storyboard-item", {
                      "has-image": storyboard.frameImage,
                      "selected": selectedStoryboard.value?.id === storyboard.id
                    }]),
                    onClick: ($event) => selectStoryboard(storyboard),
                    onDblclick: ($event) => openStoryboardEdit(storyboard)
                  }, [
                    createBaseVNode("div", _hoisted_43, [
                      storyboard.frameImage ? (openBlock(), createElementBlock("div", {
                        key: 0,
                        class: "storyboard-preview",
                        onClick: withModifiers(($event) => openImagePreview(storyboard.frameImage.filePath || storyboard.frameImage.url), ["stop"])
                      }, [
                        createBaseVNode("img", {
                          src: storyboard.frameImage.filePath || storyboard.frameImage.url,
                          alt: `镜头${storyboard.shotNumber}`
                        }, null, 8, _hoisted_45),
                        createBaseVNode("div", _hoisted_46, [
                          createVNode(_component_el_icon, { size: "20" }, {
                            default: withCtx(() => [
                              createVNode(unref(zoom_in_default))
                            ]),
                            _: 1
                          })
                        ])
                      ], 8, _hoisted_44)) : (openBlock(), createElementBlock("div", _hoisted_47, [
                        createVNode(_component_el_icon, { size: "32" }, {
                          default: withCtx(() => [
                            createVNode(unref(picture_default))
                          ]),
                          _: 1
                        }),
                        _cache[72] || (_cache[72] = createBaseVNode("span", null, "待生成", -1))
                      ])),
                      createBaseVNode("div", _hoisted_48, [
                        createBaseVNode("div", _hoisted_49, [
                          createBaseVNode("span", _hoisted_50, "镜头 " + toDisplayString(storyboard.shotNumber), 1),
                          createVNode(_component_el_tag, { size: "small" }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(getShotTypeLabel(storyboard.shotType)), 1)
                            ]),
                            _: 2
                          }, 1024),
                          storyboard.frameImage ? (openBlock(), createBlock(_component_el_tag, {
                            key: 0,
                            size: "small",
                            type: "success"
                          }, {
                            default: withCtx(() => [..._cache[73] || (_cache[73] = [
                              createTextVNode("已生成", -1)
                            ])]),
                            _: 1
                          })) : createCommentVNode("", true)
                        ]),
                        createBaseVNode("div", _hoisted_51, toDisplayString(storyboard.frameDescription), 1),
                        createBaseVNode("div", _hoisted_52, [
                          createBaseVNode("span", null, toDisplayString(storyboard.duration) + "s", 1),
                          createBaseVNode("span", null, toDisplayString(getCameraAngleLabel(storyboard.cameraAngle)), 1),
                          createBaseVNode("span", null, toDisplayString(getCameraMovementLabel(storyboard.cameraMovement)), 1)
                        ])
                      ])
                    ]),
                    createBaseVNode("div", {
                      class: "storyboard-item-actions",
                      onClick: _cache[5] || (_cache[5] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createVNode(_component_el_tooltip, {
                        content: "重新生成",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          storyboard.frameImage ? (openBlock(), createBlock(_component_el_button, {
                            key: 0,
                            circle: "",
                            size: "small",
                            onClick: ($event) => openRegenerateDialog(storyboard)
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(refresh_right_default))
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }, 8, ["onClick"])) : createCommentVNode("", true)
                        ]),
                        _: 2
                      }, 1024),
                      createVNode(_component_el_tooltip, {
                        content: "删除画面",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          storyboard.frameImage ? (openBlock(), createBlock(_component_el_button, {
                            key: 0,
                            circle: "",
                            size: "small",
                            type: "danger",
                            onClick: ($event) => confirmDeleteStoryboardImage(storyboard)
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(delete_default))
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }, 8, ["onClick"])) : createCommentVNode("", true)
                        ]),
                        _: 2
                      }, 1024)
                    ])
                  ], 42, _hoisted_42);
                }), 128))
              ]),
              unref(store).storyboards.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                key: 0,
                description: "暂无分镜",
                "image-size": 80
              })) : createCommentVNode("", true)
            ], 64)) : (openBlock(), createBlock(_component_el_empty, {
              key: 1,
              description: "请选择场景",
              "image-size": 80
            }))
          ])
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showGenerateImagesDialog.value,
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => showGenerateImagesDialog.value = $event),
          title: "生成分镜画面",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[7] || (_cache[7] = ($event) => showGenerateImagesDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[76] || (_cache[76] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: generatingImage.value,
              onClick: generateSingleStoryboardImage
            }, {
              default: withCtx(() => [..._cache[77] || (_cache[77] = [
                createTextVNode(" 开始生成 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: imageGenerateForm,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "选中分镜" }, {
                  default: withCtx(() => [
                    selectedStoryboard.value ? (openBlock(), createElementBlock("div", _hoisted_53, [
                      createBaseVNode("span", _hoisted_54, "镜头 " + toDisplayString(selectedStoryboard.value.shotNumber), 1),
                      createBaseVNode("span", _hoisted_55, toDisplayString(selectedStoryboard.value.shotType), 1),
                      selectedStoryboard.value.frameImage ? (openBlock(), createBlock(_component_el_tag, {
                        key: 0,
                        type: "success",
                        size: "small"
                      }, {
                        default: withCtx(() => [..._cache[74] || (_cache[74] = [
                          createTextVNode("已有画面", -1)
                        ])]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_tag, {
                        key: 1,
                        type: "info",
                        size: "small"
                      }, {
                        default: withCtx(() => [..._cache[75] || (_cache[75] = [
                          createTextVNode("待生成", -1)
                        ])]),
                        _: 1
                      }))
                    ])) : (openBlock(), createElementBlock("div", _hoisted_56, "请先选择一个分镜"))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "图像风格" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: imageGenerateForm.styleName,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => imageGenerateForm.styleName = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "电影风格",
                          value: "cinematic"
                        }),
                        createVNode(_component_el_option, {
                          label: "动漫风格",
                          value: "anime"
                        }),
                        createVNode(_component_el_option, {
                          label: "写实风格",
                          value: "realistic"
                        }),
                        createVNode(_component_el_option, {
                          label: "奇幻风格",
                          value: "fantasy"
                        }),
                        createVNode(_component_el_option, {
                          label: "古风仙侠",
                          value: "ancient_chinese"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "画面描述" }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_57, toDisplayString(selectedStoryboard.value?.frameDescription || "暂无描述"), 1)
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showCreateEpisodeDialog.value,
          "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => showCreateEpisodeDialog.value = $event),
          title: "创建剧集",
          width: "600px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[12] || (_cache[12] = ($event) => showCreateEpisodeDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[79] || (_cache[79] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(store).loading,
              onClick: createEpisode
            }, {
              default: withCtx(() => [..._cache[80] || (_cache[80] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: episodeForm,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "剧集序号" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: episodeForm.episodeNumber,
                      "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => episodeForm.episodeNumber = $event),
                      min: 1,
                      max: 999
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "剧集标题" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: episodeForm.title,
                      "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => episodeForm.title = $event),
                      placeholder: "选择章节后自动生成，或手动输入"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "关联章节" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_cascader, {
                      modelValue: episodeForm.outlineId,
                      "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => episodeForm.outlineId = $event),
                      options: outlineCascaderData.value,
                      props: outlineCascaderProps,
                      placeholder: "请选择章节（卷/章/节）",
                      filterable: "",
                      clearable: "",
                      style: { "width": "100%" },
                      onChange: handleOutlineCascaderChange
                    }, null, 8, ["modelValue", "options"]),
                    createBaseVNode("div", _hoisted_58, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(info_filled_default))
                        ]),
                        _: 1
                      }),
                      _cache[78] || (_cache[78] = createBaseVNode("span", null, '选择"节"级别的章节创建剧集', -1))
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showEditEpisodeDialog.value,
          "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => showEditEpisodeDialog.value = $event),
          title: "编辑剧集",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[16] || (_cache[16] = ($event) => showEditEpisodeDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[81] || (_cache[81] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(store).loading,
              onClick: updateEpisode
            }, {
              default: withCtx(() => [..._cache[82] || (_cache[82] = [
                createTextVNode(" 保存 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: episodeForm,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "剧集序号" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: episodeForm.episodeNumber,
                      "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => episodeForm.episodeNumber = $event),
                      min: 1,
                      max: 999
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "剧集标题" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: episodeForm.title,
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => episodeForm.title = $event),
                      placeholder: "请输入剧集标题"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showSynthesisDialog.value,
          "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => showSynthesisDialog.value = $event),
          title: "合成场景视频",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[19] || (_cache[19] = ($event) => showSynthesisDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[83] || (_cache[83] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(store).loading || synthesisProgress.progress > 0,
              onClick: synthesizeVideo
            }, {
              default: withCtx(() => [..._cache[84] || (_cache[84] = [
                createTextVNode(" 开始合成 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: synthesisForm,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "视频质量" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: synthesisForm.quality,
                      "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => synthesisForm.quality = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "标准 (1080p 30fps)",
                          value: "standard"
                        }),
                        createVNode(_component_el_option, {
                          label: "高清 (1080p 高码率)",
                          value: "high"
                        }),
                        createVNode(_component_el_option, {
                          label: "流畅 (720p 24fps)",
                          value: "low"
                        }),
                        createVNode(_component_el_option, {
                          label: "竖屏 (1080x1920)",
                          value: "vertical"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "说明" }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_59, " 将合成 " + toDisplayString(unref(store).storyboards.length) + " 个镜头为完整视频 ", 1)
                  ]),
                  _: 1
                }),
                synthesisProgress.phase ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 0,
                  label: "进度"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_60, [
                      createVNode(_component_el_progress, {
                        percentage: synthesisProgress.progress,
                        status: synthesisProgress.progress === 100 ? "success" : ""
                      }, null, 8, ["percentage", "status"]),
                      createBaseVNode("span", _hoisted_61, toDisplayString(getSynthesisPhaseLabel(synthesisProgress.phase)), 1)
                    ])
                  ]),
                  _: 1
                })) : createCommentVNode("", true)
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showSettingsDialog.value,
          "onUpdate:modelValue": _cache[31] || (_cache[31] = ($event) => showSettingsDialog.value = $event),
          title: "项目设置",
          width: "700px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[30] || (_cache[30] = ($event) => showSettingsDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[92] || (_cache[92] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(store).loading,
              onClick: saveProjectSettings
            }, {
              default: withCtx(() => [..._cache[93] || (_cache[93] = [
                createTextVNode(" 保存 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            unref(store).currentProject ? (openBlock(), createBlock(_component_el_form, {
              key: 0,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_divider, { "content-position": "left" }, {
                  default: withCtx(() => [..._cache[85] || (_cache[85] = [
                    createTextVNode("基本设置", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "项目名称" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: projectSettings.name,
                      "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => projectSettings.name = $event)
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "画幅比例" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.aspectRatio,
                      "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => projectSettings.config.aspectRatio = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "16:9 (横屏)",
                          value: "16:9"
                        }),
                        createVNode(_component_el_option, {
                          label: "9:16 (竖屏)",
                          value: "9:16"
                        }),
                        createVNode(_component_el_option, {
                          label: "4:3 (标准)",
                          value: "4:3"
                        }),
                        createVNode(_component_el_option, {
                          label: "1:1 (方形)",
                          value: "1:1"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "分辨率" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.resolution,
                      "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => projectSettings.config.resolution = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "4K",
                          value: 2160
                        }),
                        createVNode(_component_el_option, {
                          label: "2K",
                          value: 1440
                        }),
                        createVNode(_component_el_option, {
                          label: "1080p",
                          value: 1080
                        }),
                        createVNode(_component_el_option, {
                          label: "720p",
                          value: 720
                        }),
                        createVNode(_component_el_option, {
                          label: "480p",
                          value: 480
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "帧率" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.fps,
                      "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => projectSettings.config.fps = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "24 fps",
                          value: 24
                        }),
                        createVNode(_component_el_option, {
                          label: "25 fps",
                          value: 25
                        }),
                        createVNode(_component_el_option, {
                          label: "30 fps",
                          value: 30
                        }),
                        createVNode(_component_el_option, {
                          label: "60 fps",
                          value: 60
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_divider, { "content-position": "left" }, {
                  default: withCtx(() => [..._cache[86] || (_cache[86] = [
                    createTextVNode("模型设置", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "剧本生成" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.scriptModel,
                      "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => projectSettings.config.scriptModel = $event),
                      placeholder: "选择剧本生成模型",
                      style: { "width": "100%" },
                      clearable: "",
                      filterable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(textProviderModels.value, (provider) => {
                          return openBlock(), createBlock(_component_el_option_group, {
                            key: provider.id,
                            label: provider.name
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(provider.models, (model) => {
                                return openBlock(), createBlock(_component_el_option, {
                                  key: `${provider.id}:${model.id}`,
                                  label: `${provider.shortId}/${model.name}`,
                                  value: `${provider.id}:${model.id}`
                                }, null, 8, ["label", "value"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["label"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    _cache[87] || (_cache[87] = createBaseVNode("div", { class: "model-hint" }, "用于AI生成剧本和场景拆分", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "分镜生成" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.storyboardModel,
                      "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => projectSettings.config.storyboardModel = $event),
                      placeholder: "选择分镜生成模型",
                      style: { "width": "100%" },
                      clearable: "",
                      filterable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(textProviderModels.value, (provider) => {
                          return openBlock(), createBlock(_component_el_option_group, {
                            key: provider.id,
                            label: provider.name
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(provider.models, (model) => {
                                return openBlock(), createBlock(_component_el_option, {
                                  key: `${provider.id}:${model.id}`,
                                  label: `${provider.shortId}/${model.name}`,
                                  value: `${provider.id}:${model.id}`
                                }, null, 8, ["label", "value"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["label"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    _cache[88] || (_cache[88] = createBaseVNode("div", { class: "model-hint" }, "用于AI生成分镜设计", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "画面生成" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.imageModel,
                      "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => projectSettings.config.imageModel = $event),
                      placeholder: "选择画面生成模型",
                      style: { "width": "100%" },
                      clearable: "",
                      filterable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(imageProviderModels.value, (provider) => {
                          return openBlock(), createBlock(_component_el_option_group, {
                            key: provider.id,
                            label: provider.name
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(provider.models, (model) => {
                                return openBlock(), createBlock(_component_el_option, {
                                  key: `${provider.id}:${model.id}`,
                                  label: `${provider.shortId}/${model.name}`,
                                  value: `${provider.id}:${model.id}`
                                }, null, 8, ["label", "value"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["label"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    _cache[89] || (_cache[89] = createBaseVNode("div", { class: "model-hint" }, "用于生成分镜画面图像", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "视频合成" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.videoModel,
                      "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => projectSettings.config.videoModel = $event),
                      placeholder: "选择视频合成模型",
                      style: { "width": "100%" },
                      clearable: "",
                      filterable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(videoProviderModels.value, (provider) => {
                          return openBlock(), createBlock(_component_el_option_group, {
                            key: provider.id,
                            label: provider.name
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(provider.models, (model) => {
                                return openBlock(), createBlock(_component_el_option, {
                                  key: `${provider.id}:${model.id}`,
                                  label: `${provider.shortId}/${model.name}`,
                                  value: `${provider.id}:${model.id}`
                                }, null, 8, ["label", "value"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["label"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    _cache[90] || (_cache[90] = createBaseVNode("div", { class: "model-hint" }, "用于合成场景视频（可选）", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "音频生成" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: projectSettings.config.audioModel,
                      "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => projectSettings.config.audioModel = $event),
                      placeholder: "选择音频生成模型",
                      style: { "width": "100%" },
                      clearable: "",
                      filterable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(audioProviderModels.value, (provider) => {
                          return openBlock(), createBlock(_component_el_option_group, {
                            key: provider.id,
                            label: provider.name
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(provider.models, (model) => {
                                return openBlock(), createBlock(_component_el_option, {
                                  key: `${provider.id}:${model.id}`,
                                  label: `${provider.shortId}/${model.name}`,
                                  value: `${provider.id}:${model.id}`
                                }, null, 8, ["label", "value"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["label"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    _cache[91] || (_cache[91] = createBaseVNode("div", { class: "model-hint" }, "用于生成角色配音（可选）", -1))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showStoryboardEditDialog.value,
          "onUpdate:modelValue": _cache[42] || (_cache[42] = ($event) => showStoryboardEditDialog.value = $event),
          title: "编辑分镜",
          width: "800px",
          "close-on-click-modal": false
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[41] || (_cache[41] = ($event) => showStoryboardEditDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[97] || (_cache[97] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(store).loading,
              onClick: saveStoryboardEdit
            }, {
              default: withCtx(() => [..._cache[98] || (_cache[98] = [
                createTextVNode(" 保存 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            editingStoryboard.value ? (openBlock(), createBlock(_component_el_form, {
              key: 0,
              model: storyboardEditForm,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_row, { gutter: 20 }, {
                  default: withCtx(() => [
                    createVNode(_component_el_col, { span: 12 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "镜头号" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input_number, {
                              modelValue: storyboardEditForm.shotNumber,
                              "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => storyboardEditForm.shotNumber = $event),
                              min: 1,
                              max: 100
                            }, null, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 12 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "时长(秒)" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input_number, {
                              modelValue: storyboardEditForm.duration,
                              "onUpdate:modelValue": _cache[33] || (_cache[33] = ($event) => storyboardEditForm.duration = $event),
                              min: 0.5,
                              max: 60,
                              step: 0.5,
                              precision: 1
                            }, null, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_component_el_divider, { "content-position": "left" }, {
                  default: withCtx(() => [..._cache[94] || (_cache[94] = [
                    createTextVNode("镜头参数", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_row, { gutter: 20 }, {
                  default: withCtx(() => [
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "景别" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: storyboardEditForm.shotType,
                              "onUpdate:modelValue": _cache[34] || (_cache[34] = ($event) => storyboardEditForm.shotType = $event),
                              style: { "width": "100%" }
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "大远景",
                                  value: "extreme_long"
                                }),
                                createVNode(_component_el_option, {
                                  label: "远景",
                                  value: "long"
                                }),
                                createVNode(_component_el_option, {
                                  label: "全景",
                                  value: "full"
                                }),
                                createVNode(_component_el_option, {
                                  label: "中景",
                                  value: "medium"
                                }),
                                createVNode(_component_el_option, {
                                  label: "中近景",
                                  value: "medium_close"
                                }),
                                createVNode(_component_el_option, {
                                  label: "近景",
                                  value: "close"
                                }),
                                createVNode(_component_el_option, {
                                  label: "特写",
                                  value: "extreme_close"
                                }),
                                createVNode(_component_el_option, {
                                  label: "大特写",
                                  value: "detail"
                                })
                              ]),
                              _: 1
                            }, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "角度" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: storyboardEditForm.cameraAngle,
                              "onUpdate:modelValue": _cache[35] || (_cache[35] = ($event) => storyboardEditForm.cameraAngle = $event),
                              style: { "width": "100%" }
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "平视",
                                  value: "eye_level"
                                }),
                                createVNode(_component_el_option, {
                                  label: "俯拍",
                                  value: "high"
                                }),
                                createVNode(_component_el_option, {
                                  label: "仰拍",
                                  value: "low"
                                }),
                                createVNode(_component_el_option, {
                                  label: "荷兰角",
                                  value: "dutch"
                                }),
                                createVNode(_component_el_option, {
                                  label: "鸟瞰",
                                  value: "birds_eye"
                                }),
                                createVNode(_component_el_option, {
                                  label: "虫视",
                                  value: "worms_eye"
                                })
                              ]),
                              _: 1
                            }, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "运镜" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: storyboardEditForm.cameraMovement,
                              "onUpdate:modelValue": _cache[36] || (_cache[36] = ($event) => storyboardEditForm.cameraMovement = $event),
                              style: { "width": "100%" }
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "固定",
                                  value: "static"
                                }),
                                createVNode(_component_el_option, {
                                  label: "左摇",
                                  value: "pan_left"
                                }),
                                createVNode(_component_el_option, {
                                  label: "右摇",
                                  value: "pan_right"
                                }),
                                createVNode(_component_el_option, {
                                  label: "上仰",
                                  value: "tilt_up"
                                }),
                                createVNode(_component_el_option, {
                                  label: "下俯",
                                  value: "tilt_down"
                                }),
                                createVNode(_component_el_option, {
                                  label: "推镜",
                                  value: "dolly_in"
                                }),
                                createVNode(_component_el_option, {
                                  label: "拉镜",
                                  value: "dolly_out"
                                }),
                                createVNode(_component_el_option, {
                                  label: "左移",
                                  value: "truck_left"
                                }),
                                createVNode(_component_el_option, {
                                  label: "右移",
                                  value: "truck_right"
                                }),
                                createVNode(_component_el_option, {
                                  label: "变焦推进",
                                  value: "zoom_in"
                                }),
                                createVNode(_component_el_option, {
                                  label: "变焦拉远",
                                  value: "zoom_out"
                                }),
                                createVNode(_component_el_option, {
                                  label: "升镜",
                                  value: "crane_up"
                                }),
                                createVNode(_component_el_option, {
                                  label: "降镜",
                                  value: "crane_down"
                                }),
                                createVNode(_component_el_option, {
                                  label: "手持",
                                  value: "handheld"
                                }),
                                createVNode(_component_el_option, {
                                  label: "环绕",
                                  value: "orbit"
                                })
                              ]),
                              _: 1
                            }, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "画面描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: storyboardEditForm.frameDescription,
                      "onUpdate:modelValue": _cache[37] || (_cache[37] = ($event) => storyboardEditForm.frameDescription = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述画面内容、构图、角色位置等"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_divider, { "content-position": "left" }, {
                  default: withCtx(() => [..._cache[95] || (_cache[95] = [
                    createTextVNode("转场设置", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_row, { gutter: 20 }, {
                  default: withCtx(() => [
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "转场类型" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: storyboardEditForm.transitionType,
                              "onUpdate:modelValue": _cache[38] || (_cache[38] = ($event) => storyboardEditForm.transitionType = $event),
                              style: { "width": "100%" }
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "硬切",
                                  value: "cut"
                                }),
                                createVNode(_component_el_option, {
                                  label: "淡入淡出",
                                  value: "fade"
                                }),
                                createVNode(_component_el_option, {
                                  label: "溶解",
                                  value: "dissolve"
                                }),
                                createVNode(_component_el_option, {
                                  label: "擦除",
                                  value: "wipe"
                                }),
                                createVNode(_component_el_option, {
                                  label: "滑动",
                                  value: "slide"
                                }),
                                createVNode(_component_el_option, {
                                  label: "缩放",
                                  value: "zoom"
                                }),
                                createVNode(_component_el_option, {
                                  label: "光圈",
                                  value: "iris"
                                }),
                                createVNode(_component_el_option, {
                                  label: "甩镜",
                                  value: "whip"
                                })
                              ]),
                              _: 1
                            }, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "转场时长" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input_number, {
                              modelValue: storyboardEditForm.transitionDuration,
                              "onUpdate:modelValue": _cache[39] || (_cache[39] = ($event) => storyboardEditForm.transitionDuration = $event),
                              min: 0,
                              max: 3e3,
                              step: 100
                            }, null, 8, ["modelValue"]),
                            _cache[96] || (_cache[96] = createBaseVNode("span", { class: "form-hint" }, "ms", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "滑动方向" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: storyboardEditForm.transitionDirection,
                              "onUpdate:modelValue": _cache[40] || (_cache[40] = ($event) => storyboardEditForm.transitionDirection = $event),
                              style: { "width": "100%" },
                              disabled: !["slide", "wipe"].includes(storyboardEditForm.transitionType)
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "向左",
                                  value: "left"
                                }),
                                createVNode(_component_el_option, {
                                  label: "向右",
                                  value: "right"
                                }),
                                createVNode(_component_el_option, {
                                  label: "向上",
                                  value: "up"
                                }),
                                createVNode(_component_el_option, {
                                  label: "向下",
                                  value: "down"
                                })
                              ]),
                              _: 1
                            }, 8, ["modelValue", "disabled"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showBindCharacterDialog.value,
          "onUpdate:modelValue": _cache[48] || (_cache[48] = ($event) => showBindCharacterDialog.value = $event),
          title: "绑定角色",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[47] || (_cache[47] = ($event) => showBindCharacterDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[99] || (_cache[99] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !bindCharacterForm.characterId,
              loading: unref(store).loading,
              onClick: handleBindCharacter
            }, {
              default: withCtx(() => [..._cache[100] || (_cache[100] = [
                createTextVNode(" 绑定 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled", "loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: bindCharacterForm,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "选择角色" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: bindCharacterForm.characterId,
                      "onUpdate:modelValue": _cache[43] || (_cache[43] = ($event) => bindCharacterForm.characterId = $event),
                      placeholder: "请选择角色",
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(availableCharacters.value, (char) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: char.id,
                            label: char.name,
                            value: char.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "声音类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: bindCharacterForm.voiceType,
                      "onUpdate:modelValue": _cache[44] || (_cache[44] = ($event) => bindCharacterForm.voiceType = $event),
                      placeholder: "选择声音类型",
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "男声-沉稳",
                          value: "male_calm"
                        }),
                        createVNode(_component_el_option, {
                          label: "男声-活力",
                          value: "male_energetic"
                        }),
                        createVNode(_component_el_option, {
                          label: "女声-温柔",
                          value: "female_gentle"
                        }),
                        createVNode(_component_el_option, {
                          label: "女声-活泼",
                          value: "female_lively"
                        }),
                        createVNode(_component_el_option, {
                          label: "童声",
                          value: "child"
                        }),
                        createVNode(_component_el_option, {
                          label: "老年-男",
                          value: "elder_male"
                        }),
                        createVNode(_component_el_option, {
                          label: "老年-女",
                          value: "elder_female"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "语速" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_slider, {
                      modelValue: bindCharacterForm.speechRate,
                      "onUpdate:modelValue": _cache[45] || (_cache[45] = ($event) => bindCharacterForm.speechRate = $event),
                      min: 0.5,
                      max: 2,
                      step: 0.1,
                      "show-stops": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "角色描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: bindCharacterForm.description,
                      "onUpdate:modelValue": _cache[46] || (_cache[46] = ($event) => bindCharacterForm.description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "输入角色外貌描述，用于生成人物形象（可选）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showImagePreview.value,
          "onUpdate:modelValue": _cache[49] || (_cache[49] = ($event) => showImagePreview.value = $event),
          title: "画面预览",
          width: "90%",
          top: "5vh",
          class: "image-preview-dialog",
          "destroy-on-close": ""
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_62, [
              createBaseVNode("img", {
                src: previewImageUrl.value,
                alt: "预览图片",
                class: "preview-image"
              }, null, 8, _hoisted_63)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showRegenerateDialog.value,
          "onUpdate:modelValue": _cache[53] || (_cache[53] = ($event) => showRegenerateDialog.value = $event),
          title: "重新生成画面",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[52] || (_cache[52] = ($event) => showRegenerateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[101] || (_cache[101] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: regenerateStoryboardImage
            }, {
              default: withCtx(() => [..._cache[102] || (_cache[102] = [
                createTextVNode("开始生成", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, { "label-width": "80px" }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "镜头" }, {
                  default: withCtx(() => [
                    createTextVNode(" 镜头 " + toDisplayString(regeneratingStoryboard.value?.shotNumber), 1)
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "风格" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: regenerateForm.styleName,
                      "onUpdate:modelValue": _cache[50] || (_cache[50] = ($event) => regenerateForm.styleName = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "电影风格",
                          value: "cinematic"
                        }),
                        createVNode(_component_el_option, {
                          label: "动漫风格",
                          value: "anime"
                        }),
                        createVNode(_component_el_option, {
                          label: "写实风格",
                          value: "realistic"
                        }),
                        createVNode(_component_el_option, {
                          label: "奇幻风格",
                          value: "fantasy"
                        }),
                        createVNode(_component_el_option, {
                          label: "古风仙侠",
                          value: "ancient_chinese"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "附加提示" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: regenerateForm.additionalPrompt,
                      "onUpdate:modelValue": _cache[51] || (_cache[51] = ($event) => regenerateForm.additionalPrompt = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "输入额外的画面描述，如：更暗的光线、增加细节等"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const VideoProjectEditor = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-127a1bba"]]);
export {
  VideoProjectEditor as default
};
