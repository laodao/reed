import { O as onMounted, ap as onUnmounted, h as computed, r as ref, d as defineComponent, w as watch, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, aR as star_default, ah as withDirectives, G as Fragment, J as normalizeClass, N as arrow_right_default, L as toDisplayString, H as renderList, Y as createCommentVNode, e as createTextVNode, x as picture_default, R as reactive, f as resolveComponent, ak as resolveDirective, o as openBlock, ad as loading_default, aS as star_filled_default, T as withModifiers, U as delete_default, E as ElMessage, V as ElMessageBox, _ as _export_sfc, c as createBlock, B as setting_default, a4 as video_pause_default, ag as upload_default, aU as picture_filled_default, aV as warning_filled_default, aW as full_screen_default, aq as download_default, a2 as refresh_right_default, $ as info_filled_default, aT as copy_document_default, aX as grid_default, aY as brush_default, aZ as medal_default, a_ as key_default } from "./index-CEiunyEa.js";
const POLL_INTERVAL = 2e3;
const MAX_POLL_COUNT = 150;
function useImage() {
  const images = ref([]);
  const currentTask = ref(null);
  const providers = ref([]);
  const selectedProviderId = ref("");
  const selectedModelId = ref("");
  const loading = ref(false);
  const generating = ref(false);
  const error = ref(null);
  const pagination = ref({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false
  });
  const favoriteOnly = ref(false);
  let pollTimer = null;
  let pollCount = 0;
  let cleanupEventListener = null;
  const hasSelectedProvider = computed(() => !!selectedProviderId.value);
  const hasSelectedModel = computed(() => !!selectedModelId.value);
  const selectedProvider = computed(
    () => providers.value.find((p) => p.id === selectedProviderId.value)
  );
  const availableModels = computed(() => {
    const allModels = [];
    for (const provider of providers.value) {
      if (provider.models) {
        for (const model of provider.models) {
          allModels.push({
            ...model,
            providerId: provider.id,
            providerName: provider.name
          });
        }
      }
    }
    return allModels;
  });
  const providerModels = computed(() => {
    const result = [];
    for (const provider of providers.value) {
      if (provider.models && provider.models.length > 0) {
        result.push({
          id: provider.id,
          name: provider.name,
          models: provider.models.map((model) => ({
            ...model,
            providerId: provider.id,
            providerName: provider.name
          }))
        });
      }
    }
    return result;
  });
  const selectedModel = computed(
    () => availableModels.value.find((m) => m.id === selectedModelId.value)
  );
  const taskProgress = computed(() => {
    if (!currentTask.value) return 0;
    if (currentTask.value.status === "completed") return 100;
    if (currentTask.value.status === "failed") return 0;
    return currentTask.value.progress || 0;
  });
  const hasMore = computed(() => pagination.value.hasMore);
  async function initialize() {
    await Promise.all([
      loadProviders(),
      loadImages()
    ]);
  }
  async function loadProviders() {
    try {
      loading.value = true;
      error.value = null;
      const response = await window.electronAPI.image.getProviders();
      if (response.success && response.data) {
        providers.value = response.data;
        for (const provider of providers.value) {
          if (provider.configured) {
            await loadModels(provider.id);
          }
        }
        const allModels = availableModels.value;
        if (allModels.length > 0) {
          selectedModelId.value = allModels[0].id;
          selectedProviderId.value = allModels[0].providerId;
        }
      } else {
        error.value = response.error || "加载提供商失败";
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = errorMessage;
      console.error("加载提供商失败:", err);
    } finally {
      loading.value = false;
    }
  }
  async function loadModels(providerId) {
    try {
      const id = providerId || selectedProviderId.value;
      if (!id) return [];
      const response = await window.electronAPI.image.getModels(id);
      if (response.success && response.data) {
        const provider = providers.value.find((p) => p.id === id);
        if (provider) {
          provider.models = response.data;
        }
        return response.data;
      }
      return [];
    } catch (err) {
      console.error("加载模型列表失败:", err);
      return [];
    }
  }
  async function selectProvider(providerId) {
    selectedProviderId.value = providerId;
    selectedModelId.value = "";
    const models = await loadModels(providerId);
    if (models.length > 0) {
      selectedModelId.value = models[0].id;
    }
  }
  function selectModel(modelId) {
    selectedModelId.value = modelId;
  }
  async function generateImage(request) {
    try {
      generating.value = true;
      error.value = null;
      currentTask.value = null;
      const selectedModelInfo = availableModels.value.find((m) => m.id === selectedModelId.value);
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value;
      if (!providerId) {
        error.value = "请选择模型";
        return null;
      }
      if (!selectedModelId.value && !request.model) {
        error.value = "请选择模型";
        return null;
      }
      const generationRequest = {
        model: request.model || selectedModelId.value,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        width: request.width || 1024,
        height: request.height || 1024,
        style: request.style,
        quality: request.quality,
        count: request.count || 1,
        seed: request.seed,
        referenceImage: request.referenceImage
      };
      const response = await window.electronAPI.image.generate({
        providerId,
        ...generationRequest
      });
      if (response.success && response.data?.taskId) {
        const taskId = response.data.taskId;
        currentTask.value = {
          taskId,
          status: "pending",
          progress: 0
        };
        startPolling(taskId);
        return taskId;
      } else {
        error.value = response.error || "生成图像失败";
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = errorMessage;
      console.error("生成图像失败:", err);
      return null;
    } finally {
      generating.value = false;
    }
  }
  function startPolling(taskId) {
    stopPolling();
    pollCount = 0;
    pollTimer = setInterval(async () => {
      pollCount++;
      if (pollCount >= MAX_POLL_COUNT) {
        stopPolling();
        error.value = "任务超时，请稍后查看结果";
        return;
      }
      try {
        const response = await window.electronAPI.image.getTaskStatus(taskId);
        if (response.success && response.data) {
          currentTask.value = response.data;
          if (response.data.status === "completed" || response.data.status === "failed") {
            stopPolling();
            if (response.data.status === "completed") {
              await loadImages();
            }
            if (response.data.status === "failed") {
              error.value = response.data.error || "图像生成失败";
            }
          }
        }
      } catch (err) {
        console.error("轮询任务状态失败:", err);
      }
    }, POLL_INTERVAL);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
  async function stopGeneration() {
    if (!currentTask.value?.taskId) return;
    try {
      const response = await window.electronAPI.image.stop(currentTask.value.taskId);
      if (response.success) {
        stopPolling();
        currentTask.value = {
          ...currentTask.value,
          status: "failed",
          error: "用户取消生成"
        };
      }
    } catch (err) {
      console.error("停止生成失败:", err);
    }
  }
  async function loadImages(page) {
    try {
      loading.value = true;
      error.value = null;
      const targetPage = page ?? 1;
      const response = await window.electronAPI.image.list(
        targetPage,
        pagination.value.pageSize,
        favoriteOnly.value
      );
      if (response.success && response.data) {
        images.value = response.data.images;
        pagination.value = {
          ...pagination.value,
          page: targetPage,
          total: response.data.total,
          hasMore: response.data.hasMore
        };
      } else {
        error.value = response.error || "加载图像列表失败";
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = errorMessage;
      console.error("加载图像列表失败:", err);
    } finally {
      loading.value = false;
    }
  }
  async function loadMoreImages() {
    if (!hasMore.value || loading.value) return;
    try {
      loading.value = true;
      const nextPage = pagination.value.page + 1;
      const response = await window.electronAPI.image.list(
        nextPage,
        pagination.value.pageSize,
        favoriteOnly.value
      );
      if (response.success && response.data) {
        images.value = [...images.value, ...response.data.images];
        pagination.value = {
          ...pagination.value,
          page: nextPage,
          total: response.data.total,
          hasMore: response.data.hasMore
        };
      }
    } catch (err) {
      console.error("加载更多图像失败:", err);
    } finally {
      loading.value = false;
    }
  }
  async function toggleFavoriteFilter() {
    favoriteOnly.value = !favoriteOnly.value;
    await loadImages(1);
  }
  async function toggleFavorite(id) {
    try {
      const response = await window.electronAPI.image.toggleFavorite(id);
      if (response.success) {
        const image = images.value.find((img) => img.id === id);
        if (image) {
          image.favorite = !image.favorite;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error("切换收藏状态失败:", err);
      return false;
    }
  }
  async function deleteImage(id) {
    try {
      const response = await window.electronAPI.image.delete(id);
      if (response.success) {
        images.value = images.value.filter((img) => img.id !== id);
        pagination.value.total--;
        return true;
      }
      return false;
    } catch (err) {
      console.error("删除图像失败:", err);
      return false;
    }
  }
  async function deleteImages(ids) {
    try {
      const response = await window.electronAPI.image.deleteMany(ids);
      if (response.success && response.data !== void 0) {
        const count = response.data;
        images.value = images.value.filter((img) => !ids.includes(img.id));
        pagination.value.total -= count;
        return count;
      }
      return 0;
    } catch (err) {
      console.error("批量删除图像失败:", err);
      return 0;
    }
  }
  async function getImage(id) {
    try {
      const response = await window.electronAPI.image.get(id);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (err) {
      console.error("获取图像详情失败:", err);
      return null;
    }
  }
  async function testProvider(providerId) {
    try {
      const response = await window.electronAPI.image.testProvider(providerId);
      if (response.success && response.data) {
        return response.data;
      }
      return {
        success: false,
        message: response.error || "测试连接失败"
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      return {
        success: false,
        message: errorMessage
      };
    }
  }
  function cleanup() {
    stopPolling();
    images.value = [];
    currentTask.value = null;
    error.value = null;
  }
  async function downloadImage(imageId) {
    try {
      const response = await window.electronAPI.image.download(imageId);
      if (response.success && response.data) {
        return response.data;
      }
      error.value = response.error || "下载失败";
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = errorMessage;
      console.error("下载图像失败:", err);
      return null;
    }
  }
  async function selectReferenceImage() {
    try {
      const response = await window.electronAPI.image.selectFile();
      if (response.success && response.data) {
        return response.data;
      }
      error.value = response.error || "选择图片失败";
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = errorMessage;
      console.error("选择参考图片失败:", err);
      return null;
    }
  }
  function handleGenerationEvent(event, data) {
    console.log("[useImage] 收到图像生成事件:", data);
    switch (data.type) {
      case "generation-started":
        currentTask.value = {
          taskId: data.taskId,
          status: "pending",
          progress: 0
        };
        break;
      case "generation-progress":
        if (currentTask.value && currentTask.value.taskId === data.taskId) {
          currentTask.value = {
            ...currentTask.value,
            status: data.status || "processing",
            progress: data.progress || 0
          };
        }
        break;
      case "generation-completed":
        stopPolling();
        currentTask.value = {
          taskId: data.taskId,
          status: "completed",
          progress: 100,
          images: data.images
        };
        loadImages();
        break;
      case "generation-failed":
        stopPolling();
        currentTask.value = {
          taskId: data.taskId,
          status: "failed",
          error: data.error || "图像生成失败"
        };
        error.value = data.error || "图像生成失败";
        break;
    }
  }
  onMounted(() => {
    initialize();
    cleanupEventListener = window.electronAPI.image.onGenerationEvent(handleGenerationEvent);
  });
  onUnmounted(() => {
    cleanup();
    if (cleanupEventListener) {
      cleanupEventListener();
      cleanupEventListener = null;
    }
  });
  return {
    // 状态
    images,
    currentTask,
    providers,
    selectedProviderId,
    selectedModelId,
    loading,
    generating,
    error,
    pagination,
    favoriteOnly,
    // 计算属性
    hasSelectedProvider,
    hasSelectedModel,
    selectedProvider,
    availableModels,
    providerModels,
    selectedModel,
    taskProgress,
    hasMore,
    // 方法
    initialize,
    loadProviders,
    loadModels,
    selectProvider,
    selectModel,
    generateImage,
    stopGeneration,
    loadImages,
    loadMoreImages,
    toggleFavoriteFilter,
    toggleFavorite,
    deleteImage,
    deleteImages,
    getImage,
    testProvider,
    downloadImage,
    selectReferenceImage,
    cleanup
  };
}
const _hoisted_1$3 = { class: "image-sidebar" };
const _hoisted_2$3 = { class: "sidebar-header" };
const _hoisted_3$3 = { class: "sidebar-content" };
const _hoisted_4$3 = {
  key: 0,
  class: "image-group"
};
const _hoisted_5$2 = { class: "group-count" };
const _hoisted_6$2 = ["onClick"];
const _hoisted_7$2 = { class: "image-thumbnail" };
const _hoisted_8$2 = { class: "image-error" };
const _hoisted_9$2 = { class: "image-loading" };
const _hoisted_10$2 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_11$2 = { class: "image-info" };
const _hoisted_12$2 = ["title"];
const _hoisted_13$2 = { class: "image-meta" };
const _hoisted_14$2 = { class: "image-time" };
const _hoisted_15$2 = { class: "image-size" };
const _hoisted_16$1 = { class: "image-actions" };
const _hoisted_17$1 = {
  key: 1,
  class: "image-group"
};
const _hoisted_18$1 = { class: "group-count" };
const _hoisted_19$1 = ["onClick"];
const _hoisted_20$1 = { class: "image-thumbnail" };
const _hoisted_21$1 = { class: "image-error" };
const _hoisted_22$1 = { class: "image-loading" };
const _hoisted_23 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_24 = { class: "image-info" };
const _hoisted_25 = ["title"];
const _hoisted_26 = { class: "image-meta" };
const _hoisted_27 = { class: "image-time" };
const _hoisted_28 = { class: "image-size" };
const _hoisted_29 = { class: "image-actions" };
const _hoisted_30 = {
  key: 2,
  class: "image-group"
};
const _hoisted_31 = { class: "group-count" };
const _hoisted_32 = ["onClick"];
const _hoisted_33 = { class: "image-thumbnail" };
const _hoisted_34 = { class: "image-error" };
const _hoisted_35 = { class: "image-loading" };
const _hoisted_36 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_37 = { class: "image-info" };
const _hoisted_38 = ["title"];
const _hoisted_39 = { class: "image-meta" };
const _hoisted_40 = { class: "image-time" };
const _hoisted_41 = { class: "image-size" };
const _hoisted_42 = { class: "image-actions" };
const _hoisted_43 = {
  key: 3,
  class: "load-more"
};
const _hoisted_44 = {
  key: 1,
  class: "empty-state"
};
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "ImageSidebar",
  props: {
    modelValue: {}
  },
  emits: ["update:modelValue", "select"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const {
      images,
      loading,
      favoriteOnly,
      hasMore,
      loadMoreImages,
      toggleFavoriteFilter,
      toggleFavorite,
      deleteImage
    } = useImage();
    watch(images, (newImages) => {
      console.log("[ImageSidebar] images 数组更新，数量:", newImages.length);
      if (newImages.length > 0) {
        console.log("[ImageSidebar] 第一张图片:", JSON.stringify(newImages[0], null, 2));
      }
    }, { immediate: true, deep: true });
    const selectedImageId = computed({
      get: () => props.modelValue,
      set: (value) => emit("update:modelValue", value)
    });
    const collapsedGroups = reactive({
      today: false,
      yesterday: false,
      earlier: false
    });
    const groupedImages = computed(() => {
      const today = [];
      const yesterday = [];
      const earlier = [];
      const now = /* @__PURE__ */ new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      for (const image of images.value) {
        const date = typeof image.createdAt === "string" ? new Date(image.createdAt) : image.createdAt;
        if (date >= todayStart) {
          today.push(image);
        } else if (date >= yesterdayStart) {
          yesterday.push(image);
        } else {
          earlier.push(image);
        }
      }
      return { today, yesterday, earlier };
    });
    function toggleGroup(group) {
      collapsedGroups[group] = !collapsedGroups[group];
    }
    function getImageUrl(image) {
      if (image.filePath) {
        console.log("[ImageSidebar] 图片ID:", image.id);
        console.log("[ImageSidebar] filePath类型:", typeof image.filePath);
        console.log("[ImageSidebar] filePath值:", image.filePath);
        console.log("[ImageSidebar] filePath长度:", image.filePath.length);
        const testImg = new window.Image();
        testImg.onload = () => console.log("[ImageSidebar] 测试图片加载成功:", image.filePath);
        testImg.onerror = (e) => console.error("[ImageSidebar] 测试图片加载失败:", e, image.filePath);
        testImg.src = image.filePath;
        return image.filePath;
      }
      console.log("[ImageSidebar] 图片无filePath, image:", JSON.stringify(image));
      return "";
    }
    function handleSelectImage(image) {
      selectedImageId.value = image.id;
      emit("select", image);
    }
    async function handleToggleFavoriteFilter() {
      await toggleFavoriteFilter();
    }
    async function handleToggleFavorite(image) {
      const success = await toggleFavorite(image.id);
      if (success) {
        ElMessage.success(image.favorite ? "已取消收藏" : "已添加收藏");
      }
    }
    async function handleDeleteImage(image) {
      try {
        await ElMessageBox.confirm(
          "确定要删除这张图像吗？删除后无法恢复。",
          "确认删除",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const success = await deleteImage(image.id);
        if (success) {
          ElMessage.success("删除成功");
          if (selectedImageId.value === image.id) {
            selectedImageId.value = "";
          }
        }
      } catch {
      }
    }
    async function handleLoadMore() {
      await loadMoreImages();
    }
    function truncatePrompt(prompt, maxLength = 30) {
      if (prompt.length <= maxLength) return prompt;
      return prompt.substring(0, maxLength) + "...";
    }
    function formatTime(date) {
      const d = typeof date === "string" ? new Date(date) : date;
      const now = /* @__PURE__ */ new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 36e5) {
        const minutes = Math.floor(diff / 6e4);
        return minutes <= 1 ? "刚刚" : `${minutes}分钟前`;
      }
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      }
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return `昨天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
      }
      return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    }
    return (_ctx, _cache) => {
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tooltip = resolveComponent("el-tooltip");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_empty = resolveComponent("el-empty");
      const _directive_loading = resolveDirective("loading");
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        createBaseVNode("div", _hoisted_2$3, [
          _cache[3] || (_cache[3] = createBaseVNode("h3", null, "生成历史", -1)),
          createVNode(_component_el_tooltip, {
            content: "仅显示收藏",
            placement: "bottom"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_button, {
                type: unref(favoriteOnly) ? "primary" : "default",
                icon: unref(star_default),
                circle: "",
                size: "small",
                onClick: handleToggleFavoriteFilter
              }, null, 8, ["type", "icon"])
            ]),
            _: 1
          })
        ]),
        withDirectives((openBlock(), createElementBlock("div", _hoisted_3$3, [
          unref(images).length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            groupedImages.value.today.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_4$3, [
              createBaseVNode("div", {
                class: "group-title",
                onClick: _cache[0] || (_cache[0] = ($event) => toggleGroup("today"))
              }, [
                createVNode(_component_el_icon, {
                  class: normalizeClass(["collapse-icon", { collapsed: collapsedGroups.today }])
                }, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_right_default))
                  ]),
                  _: 1
                }, 8, ["class"]),
                _cache[4] || (_cache[4] = createBaseVNode("span", null, "今天", -1)),
                createBaseVNode("span", _hoisted_5$2, toDisplayString(groupedImages.value.today.length), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["group-content", { collapsed: collapsedGroups.today }])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(groupedImages.value.today, (image) => {
                  return openBlock(), createElementBlock("div", {
                    key: image.id,
                    class: normalizeClass(["image-card", { selected: selectedImageId.value === image.id }]),
                    onClick: ($event) => handleSelectImage(image)
                  }, [
                    createBaseVNode("div", _hoisted_7$2, [
                      createVNode(_component_el_image, {
                        src: getImageUrl(image),
                        alt: image.prompt,
                        fit: "cover",
                        lazy: ""
                      }, {
                        error: withCtx(() => [
                          createBaseVNode("div", _hoisted_8$2, [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(picture_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        placeholder: withCtx(() => [
                          createBaseVNode("div", _hoisted_9$2, [
                            createVNode(_component_el_icon, { class: "is-loading" }, {
                              default: withCtx(() => [
                                createVNode(unref(loading_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        _: 1
                      }, 8, ["src", "alt"]),
                      image.favorite ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(star_filled_default))
                          ]),
                          _: 1
                        })
                      ])) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_11$2, [
                      createBaseVNode("div", {
                        class: "image-prompt",
                        title: image.prompt
                      }, toDisplayString(truncatePrompt(image.prompt)), 9, _hoisted_12$2),
                      createBaseVNode("div", _hoisted_13$2, [
                        createBaseVNode("span", _hoisted_14$2, toDisplayString(formatTime(image.createdAt)), 1),
                        createBaseVNode("span", _hoisted_15$2, toDisplayString(image.width) + "x" + toDisplayString(image.height), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_16$1, [
                      createVNode(_component_el_button, {
                        type: image.favorite ? "warning" : "primary",
                        icon: image.favorite ? unref(star_filled_default) : unref(star_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleToggleFavorite(image), ["stop"])
                      }, null, 8, ["type", "icon", "onClick"]),
                      createVNode(_component_el_button, {
                        type: "danger",
                        icon: unref(delete_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDeleteImage(image), ["stop"])
                      }, null, 8, ["icon", "onClick"])
                    ])
                  ], 10, _hoisted_6$2);
                }), 128))
              ], 2)
            ])) : createCommentVNode("", true),
            groupedImages.value.yesterday.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_17$1, [
              createBaseVNode("div", {
                class: "group-title",
                onClick: _cache[1] || (_cache[1] = ($event) => toggleGroup("yesterday"))
              }, [
                createVNode(_component_el_icon, {
                  class: normalizeClass(["collapse-icon", { collapsed: collapsedGroups.yesterday }])
                }, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_right_default))
                  ]),
                  _: 1
                }, 8, ["class"]),
                _cache[5] || (_cache[5] = createBaseVNode("span", null, "昨天", -1)),
                createBaseVNode("span", _hoisted_18$1, toDisplayString(groupedImages.value.yesterday.length), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["group-content", { collapsed: collapsedGroups.yesterday }])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(groupedImages.value.yesterday, (image) => {
                  return openBlock(), createElementBlock("div", {
                    key: image.id,
                    class: normalizeClass(["image-card", { selected: selectedImageId.value === image.id }]),
                    onClick: ($event) => handleSelectImage(image)
                  }, [
                    createBaseVNode("div", _hoisted_20$1, [
                      createVNode(_component_el_image, {
                        src: getImageUrl(image),
                        alt: image.prompt,
                        fit: "cover",
                        lazy: ""
                      }, {
                        error: withCtx(() => [
                          createBaseVNode("div", _hoisted_21$1, [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(picture_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        placeholder: withCtx(() => [
                          createBaseVNode("div", _hoisted_22$1, [
                            createVNode(_component_el_icon, { class: "is-loading" }, {
                              default: withCtx(() => [
                                createVNode(unref(loading_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        _: 1
                      }, 8, ["src", "alt"]),
                      image.favorite ? (openBlock(), createElementBlock("div", _hoisted_23, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(star_filled_default))
                          ]),
                          _: 1
                        })
                      ])) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_24, [
                      createBaseVNode("div", {
                        class: "image-prompt",
                        title: image.prompt
                      }, toDisplayString(truncatePrompt(image.prompt)), 9, _hoisted_25),
                      createBaseVNode("div", _hoisted_26, [
                        createBaseVNode("span", _hoisted_27, toDisplayString(formatTime(image.createdAt)), 1),
                        createBaseVNode("span", _hoisted_28, toDisplayString(image.width) + "x" + toDisplayString(image.height), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_29, [
                      createVNode(_component_el_button, {
                        type: image.favorite ? "warning" : "primary",
                        icon: image.favorite ? unref(star_filled_default) : unref(star_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleToggleFavorite(image), ["stop"])
                      }, null, 8, ["type", "icon", "onClick"]),
                      createVNode(_component_el_button, {
                        type: "danger",
                        icon: unref(delete_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDeleteImage(image), ["stop"])
                      }, null, 8, ["icon", "onClick"])
                    ])
                  ], 10, _hoisted_19$1);
                }), 128))
              ], 2)
            ])) : createCommentVNode("", true),
            groupedImages.value.earlier.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_30, [
              createBaseVNode("div", {
                class: "group-title",
                onClick: _cache[2] || (_cache[2] = ($event) => toggleGroup("earlier"))
              }, [
                createVNode(_component_el_icon, {
                  class: normalizeClass(["collapse-icon", { collapsed: collapsedGroups.earlier }])
                }, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_right_default))
                  ]),
                  _: 1
                }, 8, ["class"]),
                _cache[6] || (_cache[6] = createBaseVNode("span", null, "更早", -1)),
                createBaseVNode("span", _hoisted_31, toDisplayString(groupedImages.value.earlier.length), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["group-content", { collapsed: collapsedGroups.earlier }])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(groupedImages.value.earlier, (image) => {
                  return openBlock(), createElementBlock("div", {
                    key: image.id,
                    class: normalizeClass(["image-card", { selected: selectedImageId.value === image.id }]),
                    onClick: ($event) => handleSelectImage(image)
                  }, [
                    createBaseVNode("div", _hoisted_33, [
                      createVNode(_component_el_image, {
                        src: getImageUrl(image),
                        alt: image.prompt,
                        fit: "cover",
                        lazy: ""
                      }, {
                        error: withCtx(() => [
                          createBaseVNode("div", _hoisted_34, [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(picture_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        placeholder: withCtx(() => [
                          createBaseVNode("div", _hoisted_35, [
                            createVNode(_component_el_icon, { class: "is-loading" }, {
                              default: withCtx(() => [
                                createVNode(unref(loading_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        _: 1
                      }, 8, ["src", "alt"]),
                      image.favorite ? (openBlock(), createElementBlock("div", _hoisted_36, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(star_filled_default))
                          ]),
                          _: 1
                        })
                      ])) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_37, [
                      createBaseVNode("div", {
                        class: "image-prompt",
                        title: image.prompt
                      }, toDisplayString(truncatePrompt(image.prompt)), 9, _hoisted_38),
                      createBaseVNode("div", _hoisted_39, [
                        createBaseVNode("span", _hoisted_40, toDisplayString(formatTime(image.createdAt)), 1),
                        createBaseVNode("span", _hoisted_41, toDisplayString(image.width) + "x" + toDisplayString(image.height), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_42, [
                      createVNode(_component_el_button, {
                        type: image.favorite ? "warning" : "primary",
                        icon: image.favorite ? unref(star_filled_default) : unref(star_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleToggleFavorite(image), ["stop"])
                      }, null, 8, ["type", "icon", "onClick"]),
                      createVNode(_component_el_button, {
                        type: "danger",
                        icon: unref(delete_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDeleteImage(image), ["stop"])
                      }, null, 8, ["icon", "onClick"])
                    ])
                  ], 10, _hoisted_32);
                }), 128))
              ], 2)
            ])) : createCommentVNode("", true),
            unref(hasMore) ? (openBlock(), createElementBlock("div", _hoisted_43, [
              createVNode(_component_el_button, {
                loading: unref(loading),
                type: "primary",
                text: "",
                onClick: handleLoadMore
              }, {
                default: withCtx(() => [..._cache[7] || (_cache[7] = [
                  createTextVNode(" 加载更多 ", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ])) : createCommentVNode("", true)
          ], 64)) : (openBlock(), createElementBlock("div", _hoisted_44, [
            createVNode(_component_el_empty, { description: "暂无生成记录" }, {
              image: withCtx(() => [
                createVNode(_component_el_icon, { size: 48 }, {
                  default: withCtx(() => [
                    createVNode(unref(picture_default))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]))
        ])), [
          [_directive_loading, unref(loading)]
        ])
      ]);
    };
  }
});
const ImageSidebar = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-009f8760"]]);
const _hoisted_1$2 = { class: "image-generator" };
const _hoisted_2$2 = { class: "top-row" };
const _hoisted_3$2 = { class: "model-option" };
const _hoisted_4$2 = {
  key: 0,
  class: "model-size"
};
const _hoisted_5$1 = { class: "prompt-row" };
const _hoisted_6$1 = { class: "prompt-counter" };
const _hoisted_7$1 = { class: "advanced-row" };
const _hoisted_8$1 = { class: "advanced-row" };
const _hoisted_9$1 = { class: "param-group" };
const _hoisted_10$1 = { class: "param-group" };
const _hoisted_11$1 = { class: "param-group" };
const _hoisted_12$1 = { class: "param-group reference-group" };
const _hoisted_13$1 = {
  key: 1,
  class: "reference-preview"
};
const _hoisted_14$1 = {
  key: 1,
  class: "progress-row"
};
const _hoisted_15$1 = { class: "progress-text" };
const maxPromptLength = 1e3;
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "ImageGenerator",
  props: {
    autoReset: { type: Boolean, default: false }
  },
  emits: ["generated", "error"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const {
      selectedProviderId,
      selectedModelId,
      loading,
      generating,
      error,
      currentTask,
      providerModels,
      taskProgress,
      generateImage,
      stopGeneration,
      selectReferenceImage
    } = useImage();
    const modelSearchKeyword = ref("");
    const selectedModelKey = computed({
      get: () => `${selectedProviderId.value}:${selectedModelId.value}`,
      set: (val) => {
        const parts = val.split(":");
        if (parts.length >= 2) {
          selectedProviderId.value = parts[0];
          selectedModelId.value = parts.slice(1).join(":");
        }
      }
    });
    const filteredProviderModels = computed(() => {
      if (!modelSearchKeyword.value) {
        return providerModels.value;
      }
      const keyword = modelSearchKeyword.value.toLowerCase();
      const result = [];
      for (const provider of providerModels.value) {
        const filteredModels = provider.models.filter(
          (model) => model.name.toLowerCase().includes(keyword) || model.id.toLowerCase().includes(keyword) || provider.name.toLowerCase().includes(keyword)
        );
        if (filteredModels.length > 0) {
          result.push({
            ...provider,
            models: filteredModels
          });
        }
      }
      return result;
    });
    function filterModels(keyword) {
      modelSearchKeyword.value = keyword;
    }
    const prompt = ref("");
    const negativePrompt = ref("");
    const showAdvanced = ref(false);
    const selectedSize = ref("1024x1024");
    const selectedCount = ref(1);
    const selectedStyle = ref("");
    const selectedQuality = ref("");
    const seed = ref(-1);
    const referenceImage = ref("");
    const sizeOptions = [
      { label: "512×512", value: "512x512" },
      { label: "1024×1024", value: "1024x1024" },
      { label: "1024×768", value: "1024x768" },
      { label: "768×1024", value: "768x1024" }
    ];
    const countOptions = [1, 2, 4];
    const styleOptions = [
      { label: "写实", value: "realistic" },
      { label: "动漫", value: "anime" },
      { label: "油画", value: "oil_painting" },
      { label: "水彩", value: "watercolor" },
      { label: "素描", value: "sketch" },
      { label: "3D渲染", value: "3d_render" }
    ];
    const qualityOptions = [
      { label: "标准", value: "standard" },
      { label: "高清", value: "hd" }
    ];
    const canGenerate = computed(() => {
      return selectedModelId.value && prompt.value.trim().length > 0 && prompt.value.length <= maxPromptLength && !loading.value && !generating.value;
    });
    const progressText = computed(() => {
      if (!currentTask.value) return "准备中...";
      switch (currentTask.value.status) {
        case "pending":
          return "任务排队中...";
        case "processing":
          return `正在生成... ${taskProgress.value}%`;
        case "completed":
          return "生成完成！";
        case "failed":
          return "生成失败";
        default:
          return "准备中...";
      }
    });
    async function handleGenerate() {
      if (!canGenerate.value) return;
      const [width, height] = selectedSize.value.split("x").map(Number);
      const taskId = await generateImage({
        prompt: prompt.value.trim(),
        negativePrompt: negativePrompt.value.trim() || void 0,
        width,
        height,
        style: selectedStyle.value || void 0,
        quality: selectedQuality.value || void 0,
        count: selectedCount.value,
        seed: seed.value >= 0 ? seed.value : void 0,
        referenceImage: referenceImage.value || void 0
      });
      if (taskId) {
        emit("generated", taskId);
        if (props.autoReset) {
          prompt.value = "";
          negativePrompt.value = "";
        }
      } else if (error.value) {
        emit("error", error.value);
      }
    }
    async function handleStop() {
      await stopGeneration();
      ElMessage.info("已停止生成");
    }
    async function handleUploadReference() {
      const result = await selectReferenceImage();
      if (result) {
        referenceImage.value = result.base64;
        ElMessage.success(`已选择: ${result.name}`);
      }
    }
    function progressFormat(percentage) {
      return percentage === 100 ? "完成" : `${percentage}%`;
    }
    watch(
      () => currentTask.value?.status,
      (status) => {
        if (status === "completed") {
          ElMessage.success("图像生成完成！");
        } else if (status === "failed") {
          ElMessage.error(currentTask.value?.error || "生成失败");
          emit("error", currentTask.value?.error || "生成失败");
        }
      }
    );
    function setParams(params) {
      prompt.value = params.prompt;
      negativePrompt.value = params.negativePrompt || "";
      const size = `${params.width}x${params.height}`;
      if (sizeOptions.some((opt) => opt.value === size)) {
        selectedSize.value = size;
      }
      selectedStyle.value = params.style || "";
      selectedQuality.value = params.quality || "";
      seed.value = params.seed ?? -1;
      if (params.providerId && params.modelId) {
        selectedProviderId.value = params.providerId;
        selectedModelId.value = params.modelId;
      } else if (params.modelId) {
        selectedModelId.value = params.modelId;
      }
    }
    __expose({
      setParams
    });
    return (_ctx, _cache) => {
      const _component_el_option = resolveComponent("el-option");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tooltip = resolveComponent("el-tooltip");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_alert = resolveComponent("el-alert");
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          createVNode(_component_el_select, {
            modelValue: selectedModelKey.value,
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedModelKey.value = $event),
            placeholder: "选择模型",
            class: "model-select",
            disabled: unref(generating),
            filterable: "",
            "filter-method": filterModels
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(filteredProviderModels.value, (provider) => {
                return openBlock(), createBlock(_component_el_option_group, {
                  key: provider.id,
                  label: provider.name
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(provider.models, (model) => {
                      return openBlock(), createBlock(_component_el_option, {
                        key: `${provider.id}:${model.id}`,
                        label: model.name,
                        value: `${provider.id}:${model.id}`
                      }, {
                        default: withCtx(() => [
                          createBaseVNode("div", _hoisted_3$2, [
                            createBaseVNode("span", null, toDisplayString(model.name), 1),
                            model.maxResolution ? (openBlock(), createElementBlock("span", _hoisted_4$2, toDisplayString(model.maxResolution), 1)) : createCommentVNode("", true)
                          ])
                        ]),
                        _: 2
                      }, 1032, ["label", "value"]);
                    }), 128))
                  ]),
                  _: 2
                }, 1032, ["label"]);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"]),
          createVNode(_component_el_select, {
            modelValue: selectedSize.value,
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selectedSize.value = $event),
            class: "size-select",
            disabled: unref(generating)
          }, {
            default: withCtx(() => [
              (openBlock(), createElementBlock(Fragment, null, renderList(sizeOptions, (size) => {
                return createVNode(_component_el_option, {
                  key: size.value,
                  label: size.label,
                  value: size.value
                }, null, 8, ["label", "value"]);
              }), 64))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"]),
          createVNode(_component_el_select, {
            modelValue: selectedCount.value,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => selectedCount.value = $event),
            class: "count-select",
            disabled: unref(generating)
          }, {
            default: withCtx(() => [
              (openBlock(), createElementBlock(Fragment, null, renderList(countOptions, (count) => {
                return createVNode(_component_el_option, {
                  key: count,
                  label: `${count}张`,
                  value: count
                }, null, 8, ["label", "value"]);
              }), 64))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"]),
          createVNode(_component_el_tooltip, {
            content: "高级选项",
            placement: "top"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_button, {
                type: showAdvanced.value ? "primary" : "default",
                icon: unref(setting_default),
                onClick: _cache[3] || (_cache[3] = ($event) => showAdvanced.value = !showAdvanced.value)
              }, null, 8, ["type", "icon"])
            ]),
            _: 1
          }),
          !unref(generating) ? (openBlock(), createBlock(_component_el_button, {
            key: 0,
            type: "primary",
            disabled: !canGenerate.value,
            loading: unref(loading),
            onClick: handleGenerate
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(picture_default))
                ]),
                _: 1
              }),
              _cache[10] || (_cache[10] = createBaseVNode("span", null, "生成", -1))
            ]),
            _: 1
          }, 8, ["disabled", "loading"])) : (openBlock(), createBlock(_component_el_button, {
            key: 1,
            type: "danger",
            onClick: handleStop
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(video_pause_default))
                ]),
                _: 1
              }),
              _cache[11] || (_cache[11] = createBaseVNode("span", null, "停止", -1))
            ]),
            _: 1
          }))
        ]),
        createBaseVNode("div", _hoisted_5$1, [
          createVNode(_component_el_input, {
            modelValue: prompt.value,
            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => prompt.value = $event),
            type: "textarea",
            rows: 2,
            placeholder: "描述你想要生成的图像...",
            resize: "none",
            class: "prompt-input",
            disabled: unref(generating)
          }, null, 8, ["modelValue", "disabled"]),
          createBaseVNode("span", _hoisted_6$1, toDisplayString(prompt.value.length) + "/" + toDisplayString(maxPromptLength), 1)
        ]),
        showAdvanced.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          createBaseVNode("div", _hoisted_7$1, [
            _cache[12] || (_cache[12] = createBaseVNode("span", { class: "advanced-label" }, "负面提示词", -1)),
            createVNode(_component_el_input, {
              modelValue: negativePrompt.value,
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => negativePrompt.value = $event),
              type: "textarea",
              rows: 1,
              placeholder: "不想出现的内容...",
              resize: "none",
              class: "negative-input",
              disabled: unref(generating)
            }, null, 8, ["modelValue", "disabled"])
          ]),
          createBaseVNode("div", _hoisted_8$1, [
            createBaseVNode("div", _hoisted_9$1, [
              _cache[13] || (_cache[13] = createBaseVNode("span", { class: "param-label" }, "风格", -1)),
              createVNode(_component_el_select, {
                modelValue: selectedStyle.value,
                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => selectedStyle.value = $event),
                placeholder: "默认",
                class: "param-select",
                clearable: "",
                disabled: unref(generating)
              }, {
                default: withCtx(() => [
                  (openBlock(), createElementBlock(Fragment, null, renderList(styleOptions, (style) => {
                    return createVNode(_component_el_option, {
                      key: style.value,
                      label: style.label,
                      value: style.value
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue", "disabled"])
            ]),
            createBaseVNode("div", _hoisted_10$1, [
              _cache[14] || (_cache[14] = createBaseVNode("span", { class: "param-label" }, "质量", -1)),
              createVNode(_component_el_select, {
                modelValue: selectedQuality.value,
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => selectedQuality.value = $event),
                placeholder: "标准",
                class: "param-select",
                clearable: "",
                disabled: unref(generating)
              }, {
                default: withCtx(() => [
                  (openBlock(), createElementBlock(Fragment, null, renderList(qualityOptions, (quality) => {
                    return createVNode(_component_el_option, {
                      key: quality.value,
                      label: quality.label,
                      value: quality.value
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue", "disabled"])
            ]),
            createBaseVNode("div", _hoisted_11$1, [
              _cache[15] || (_cache[15] = createBaseVNode("span", { class: "param-label" }, "种子", -1)),
              createVNode(_component_el_input_number, {
                modelValue: seed.value,
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => seed.value = $event),
                min: -1,
                max: 2147483647,
                placeholder: "随机",
                class: "seed-input",
                disabled: unref(generating),
                "controls-position": "right"
              }, null, 8, ["modelValue", "disabled"])
            ]),
            createBaseVNode("div", _hoisted_12$1, [
              _cache[16] || (_cache[16] = createBaseVNode("span", { class: "param-label" }, "参考图", -1)),
              !referenceImage.value ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "upload-btn",
                onClick: handleUploadReference
              }, [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(upload_default))
                  ]),
                  _: 1
                })
              ])) : (openBlock(), createElementBlock("div", _hoisted_13$1, [
                createVNode(_component_el_image, {
                  src: referenceImage.value,
                  fit: "cover",
                  class: "reference-thumb"
                }, null, 8, ["src"]),
                createVNode(_component_el_button, {
                  type: "danger",
                  icon: unref(delete_default),
                  circle: "",
                  size: "small",
                  class: "remove-btn",
                  onClick: _cache[9] || (_cache[9] = ($event) => referenceImage.value = "")
                }, null, 8, ["icon"])
              ]))
            ])
          ])
        ], 64)) : createCommentVNode("", true),
        unref(generating) ? (openBlock(), createElementBlock("div", _hoisted_14$1, [
          createVNode(_component_el_progress, {
            percentage: unref(taskProgress),
            "stroke-width": 6,
            "show-text": true,
            format: progressFormat
          }, null, 8, ["percentage"]),
          createBaseVNode("span", _hoisted_15$1, toDisplayString(progressText.value), 1)
        ])) : createCommentVNode("", true),
        unref(error) ? (openBlock(), createBlock(_component_el_alert, {
          key: 2,
          title: unref(error),
          type: "error",
          closable: false,
          "show-icon": "",
          class: "error-alert"
        }, null, 8, ["title"])) : createCommentVNode("", true)
      ]);
    };
  }
});
const ImageGenerator = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-c1ba4feb"]]);
const _hoisted_1$1 = { class: "image-result" };
const _hoisted_2$1 = {
  key: 0,
  class: "empty-state"
};
const _hoisted_3$1 = {
  key: 1,
  class: "generating-state"
};
const _hoisted_4$1 = { class: "generating-placeholder" };
const _hoisted_5 = {
  key: 2,
  class: "image-display"
};
const _hoisted_6 = { class: "image-wrapper" };
const _hoisted_7 = { class: "image-error" };
const _hoisted_8 = { class: "image-loading" };
const _hoisted_9 = {
  key: 0,
  class: "status-badge pending"
};
const _hoisted_10 = {
  key: 1,
  class: "status-badge failed"
};
const _hoisted_11 = { class: "action-buttons" };
const _hoisted_12 = {
  key: 0,
  class: "prompt-display"
};
const _hoisted_13 = { class: "prompt-content" };
const _hoisted_14 = { class: "info-bar" };
const _hoisted_15 = {
  key: 0,
  class: "info-item"
};
const _hoisted_16 = {
  key: 1,
  class: "info-item"
};
const _hoisted_17 = {
  key: 2,
  class: "info-item"
};
const _hoisted_18 = {
  key: 3,
  class: "info-item"
};
const _hoisted_19 = {
  key: 0,
  class: "detail-content"
};
const _hoisted_20 = { class: "detail-thumbnail" };
const _hoisted_21 = { class: "fullscreen-image-container" };
const _hoisted_22 = ["src"];
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ImageResult",
  props: {
    image: {}
  },
  emits: ["regenerate", "update", "delete"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const {
      generating,
      taskProgress,
      toggleFavorite,
      deleteImage,
      downloadImage: downloadImageFromApi
    } = useImage();
    const showDetailDialog = ref(false);
    const showFullscreenDialog = ref(false);
    const imageLoaded = ref(false);
    const currentImage = computed(() => props.image);
    function getImageUrl(image) {
      if (image.filePath) {
        if (image.filePath.startsWith("local-image://") || image.filePath.startsWith("http://") || image.filePath.startsWith("https://") || image.filePath.startsWith("data:")) {
          return image.filePath;
        }
        return `local-image://${encodeURIComponent(image.filePath)}`;
      }
      return "";
    }
    function handleImageLoad() {
      imageLoaded.value = true;
    }
    function handleImageError() {
      imageLoaded.value = false;
      ElMessage.error("图像加载失败");
    }
    function handleFullscreen() {
      if (currentImage.value && currentImage.value.status === "completed") {
        showFullscreenDialog.value = true;
      }
    }
    async function handleDownload() {
      if (!currentImage.value) return;
      try {
        const savedPath = await downloadImageFromApi(currentImage.value.id);
        if (savedPath) {
          ElMessage.success(`图像已保存到: ${savedPath}`);
        }
      } catch (err) {
        ElMessage.error("下载失败");
        console.error("下载图像失败:", err);
      }
    }
    async function handleToggleFavorite() {
      if (!currentImage.value) return;
      const success = await toggleFavorite(currentImage.value.id);
      if (success) {
        ElMessage.success(currentImage.value.favorite ? "已取消收藏" : "已添加收藏");
        emit("update", currentImage.value);
      }
    }
    function handleRegenerate() {
      if (!currentImage.value) return;
      emit("regenerate", currentImage.value);
    }
    async function handleDelete() {
      if (!currentImage.value) return;
      try {
        await ElMessageBox.confirm(
          "确定要删除这张图像吗？删除后无法恢复。",
          "确认删除",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const success = await deleteImage(currentImage.value.id);
        if (success) {
          ElMessage.success("删除成功");
          emit("delete", currentImage.value);
        }
      } catch {
      }
    }
    async function handleCopyPrompt() {
      if (!currentImage.value?.prompt) return;
      try {
        await navigator.clipboard.writeText(currentImage.value.prompt);
        ElMessage.success("提示词已复制到剪贴板");
      } catch {
        ElMessage.error("复制失败");
      }
    }
    function getStyleLabel(style) {
      const styleMap = {
        realistic: "写实",
        anime: "动漫",
        oil_painting: "油画",
        watercolor: "水彩",
        sketch: "素描",
        "3d_render": "3D渲染"
      };
      return styleMap[style] || style;
    }
    function getQualityLabel(quality) {
      const qualityMap = {
        standard: "标准",
        hd: "高清"
      };
      return qualityMap[quality] || quality;
    }
    function getStatusTagType(status) {
      const statusMap = {
        pending: "warning",
        completed: "success",
        failed: "danger"
      };
      return statusMap[status] || "info";
    }
    function getStatusLabel(status) {
      const statusMap = {
        pending: "生成中",
        completed: "已完成",
        failed: "失败"
      };
      return statusMap[status] || status;
    }
    function formatDateTime(date) {
      const d = typeof date === "string" ? new Date(date) : date;
      return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    function formatFileSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_descriptions_item = resolveComponent("el-descriptions-item");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_text = resolveComponent("el-text");
      const _component_el_descriptions = resolveComponent("el-descriptions");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        !currentImage.value && !unref(generating) ? (openBlock(), createElementBlock("div", _hoisted_2$1, [
          createVNode(_component_el_empty, { description: "暂无图像" }, {
            image: withCtx(() => [
              createVNode(_component_el_icon, { size: 64 }, {
                default: withCtx(() => [
                  createVNode(unref(picture_default))
                ]),
                _: 1
              })
            ]),
            description: withCtx(() => [..._cache[4] || (_cache[4] = [
              createBaseVNode("p", { class: "empty-tip" }, "请选择图像或生成新图像", -1)
            ])]),
            _: 1
          })
        ])) : unref(generating) && !currentImage.value ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
          createBaseVNode("div", _hoisted_4$1, [
            createVNode(_component_el_icon, {
              class: "is-loading",
              size: 48
            }, {
              default: withCtx(() => [
                createVNode(unref(loading_default))
              ]),
              _: 1
            }),
            _cache[5] || (_cache[5] = createBaseVNode("p", { class: "generating-text" }, "正在生成图像...", -1)),
            createVNode(_component_el_progress, {
              percentage: unref(taskProgress),
              "stroke-width": 6,
              "show-text": true,
              class: "generating-progress"
            }, null, 8, ["percentage"])
          ])
        ])) : currentImage.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
          createBaseVNode("div", {
            class: "image-container",
            onDblclick: handleFullscreen
          }, [
            createBaseVNode("div", _hoisted_6, [
              createVNode(_component_el_image, {
                src: getImageUrl(currentImage.value),
                alt: currentImage.value.prompt || "生成的图像",
                fit: "contain",
                class: "main-image",
                onLoad: handleImageLoad,
                onError: handleImageError
              }, {
                error: withCtx(() => [
                  createBaseVNode("div", _hoisted_7, [
                    createVNode(_component_el_icon, { size: 48 }, {
                      default: withCtx(() => [
                        createVNode(unref(picture_filled_default))
                      ]),
                      _: 1
                    }),
                    _cache[6] || (_cache[6] = createBaseVNode("p", null, "图像加载失败", -1))
                  ])
                ]),
                placeholder: withCtx(() => [
                  createBaseVNode("div", _hoisted_8, [
                    createVNode(_component_el_icon, {
                      class: "is-loading",
                      size: 32
                    }, {
                      default: withCtx(() => [
                        createVNode(unref(loading_default))
                      ]),
                      _: 1
                    })
                  ])
                ]),
                _: 1
              }, 8, ["src", "alt"])
            ]),
            currentImage.value.status === "pending" ? (openBlock(), createElementBlock("div", _hoisted_9, [
              createVNode(_component_el_icon, { class: "is-loading" }, {
                default: withCtx(() => [
                  createVNode(unref(loading_default))
                ]),
                _: 1
              }),
              _cache[7] || (_cache[7] = createBaseVNode("span", null, "生成中", -1))
            ])) : currentImage.value.status === "failed" ? (openBlock(), createElementBlock("div", _hoisted_10, [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(warning_filled_default))
                ]),
                _: 1
              }),
              _cache[8] || (_cache[8] = createBaseVNode("span", null, "生成失败", -1))
            ])) : createCommentVNode("", true)
          ], 32),
          createBaseVNode("div", {
            class: "fullscreen-btn",
            onClick: handleFullscreen
          }, [
            createVNode(_component_el_icon, null, {
              default: withCtx(() => [
                createVNode(unref(full_screen_default))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_11, [
            createVNode(_component_el_button, {
              type: "primary",
              icon: unref(download_default),
              disabled: currentImage.value.status !== "completed",
              onClick: handleDownload
            }, {
              default: withCtx(() => [..._cache[9] || (_cache[9] = [
                createTextVNode(" 下载 ", -1)
              ])]),
              _: 1
            }, 8, ["icon", "disabled"]),
            createVNode(_component_el_button, {
              type: currentImage.value.favorite ? "warning" : "default",
              icon: currentImage.value.favorite ? unref(star_filled_default) : unref(star_default),
              disabled: currentImage.value.status !== "completed",
              onClick: handleToggleFavorite
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(currentImage.value.favorite ? "已收藏" : "收藏"), 1)
              ]),
              _: 1
            }, 8, ["type", "icon", "disabled"]),
            createVNode(_component_el_button, {
              icon: unref(refresh_right_default),
              disabled: currentImage.value.status !== "completed",
              onClick: handleRegenerate
            }, {
              default: withCtx(() => [..._cache[10] || (_cache[10] = [
                createTextVNode(" 重新生成 ", -1)
              ])]),
              _: 1
            }, 8, ["icon", "disabled"]),
            createVNode(_component_el_button, {
              icon: unref(info_filled_default),
              onClick: _cache[0] || (_cache[0] = ($event) => showDetailDialog.value = true)
            }, {
              default: withCtx(() => [..._cache[11] || (_cache[11] = [
                createTextVNode(" 详情 ", -1)
              ])]),
              _: 1
            }, 8, ["icon"]),
            createVNode(_component_el_button, {
              type: "danger",
              icon: unref(delete_default),
              onClick: handleDelete
            }, {
              default: withCtx(() => [..._cache[12] || (_cache[12] = [
                createTextVNode(" 删除 ", -1)
              ])]),
              _: 1
            }, 8, ["icon"])
          ]),
          currentImage.value.prompt ? (openBlock(), createElementBlock("div", _hoisted_12, [
            _cache[14] || (_cache[14] = createBaseVNode("div", { class: "prompt-label" }, "提示词", -1)),
            createBaseVNode("div", _hoisted_13, [
              createTextVNode(toDisplayString(currentImage.value.prompt) + " ", 1),
              createVNode(_component_el_button, {
                type: "primary",
                text: "",
                size: "small",
                icon: unref(copy_document_default),
                onClick: handleCopyPrompt
              }, {
                default: withCtx(() => [..._cache[13] || (_cache[13] = [
                  createTextVNode(" 复制 ", -1)
                ])]),
                _: 1
              }, 8, ["icon"])
            ])
          ])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_14, [
            currentImage.value.width && currentImage.value.height ? (openBlock(), createElementBlock("div", _hoisted_15, [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(grid_default))
                ]),
                _: 1
              }),
              createBaseVNode("span", null, toDisplayString(currentImage.value.width) + " × " + toDisplayString(currentImage.value.height), 1)
            ])) : createCommentVNode("", true),
            currentImage.value.style ? (openBlock(), createElementBlock("div", _hoisted_16, [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(brush_default))
                ]),
                _: 1
              }),
              createBaseVNode("span", null, toDisplayString(getStyleLabel(currentImage.value.style)), 1)
            ])) : createCommentVNode("", true),
            currentImage.value.quality ? (openBlock(), createElementBlock("div", _hoisted_17, [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(medal_default))
                ]),
                _: 1
              }),
              createBaseVNode("span", null, toDisplayString(getQualityLabel(currentImage.value.quality)), 1)
            ])) : createCommentVNode("", true),
            currentImage.value.seed && currentImage.value.seed > 0 ? (openBlock(), createElementBlock("div", _hoisted_18, [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(key_default))
                ]),
                _: 1
              }),
              createBaseVNode("span", null, "种子: " + toDisplayString(currentImage.value.seed), 1)
            ])) : createCommentVNode("", true)
          ])
        ])) : createCommentVNode("", true),
        createVNode(_component_el_dialog, {
          modelValue: showDetailDialog.value,
          "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => showDetailDialog.value = $event),
          title: "图像详情",
          width: "500px",
          "close-on-click-modal": false
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[1] || (_cache[1] = ($event) => showDetailDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[15] || (_cache[15] = [
                createTextVNode("关闭", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              icon: unref(download_default),
              onClick: handleDownload
            }, {
              default: withCtx(() => [..._cache[16] || (_cache[16] = [
                createTextVNode(" 下载图像 ", -1)
              ])]),
              _: 1
            }, 8, ["icon"])
          ]),
          default: withCtx(() => [
            currentImage.value ? (openBlock(), createElementBlock("div", _hoisted_19, [
              createBaseVNode("div", _hoisted_20, [
                createVNode(_component_el_image, {
                  src: getImageUrl(currentImage.value),
                  fit: "contain",
                  class: "thumbnail-image",
                  "preview-src-list": [getImageUrl(currentImage.value)]
                }, null, 8, ["src", "preview-src-list"])
              ]),
              createVNode(_component_el_descriptions, {
                column: 1,
                border: ""
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_descriptions_item, { label: "图像 ID" }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.id), 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_descriptions_item, { label: "状态" }, {
                    default: withCtx(() => [
                      createVNode(_component_el_tag, {
                        type: getStatusTagType(currentImage.value.status)
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getStatusLabel(currentImage.value.status)), 1)
                        ]),
                        _: 1
                      }, 8, ["type"])
                    ]),
                    _: 1
                  }),
                  currentImage.value.prompt ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 0,
                    label: "提示词"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.prompt), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.negativePrompt ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 1,
                    label: "负面提示词"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.negativePrompt), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.width && currentImage.value.height ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 2,
                    label: "尺寸"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.width) + " × " + toDisplayString(currentImage.value.height), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.style ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 3,
                    label: "风格"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(getStyleLabel(currentImage.value.style)), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.quality ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 4,
                    label: "质量"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(getQualityLabel(currentImage.value.quality)), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.seed && currentImage.value.seed > 0 ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 5,
                    label: "种子值"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.seed), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.providerId ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 6,
                    label: "提供商"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.providerId), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.modelId ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 7,
                    label: "模型"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(currentImage.value.modelId), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  createVNode(_component_el_descriptions_item, { label: "创建时间" }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(formatDateTime(currentImage.value.createdAt)), 1)
                    ]),
                    _: 1
                  }),
                  currentImage.value.fileSize ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 8,
                    label: "文件大小"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(formatFileSize(currentImage.value.fileSize)), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  currentImage.value.errorMessage ? (openBlock(), createBlock(_component_el_descriptions_item, {
                    key: 9,
                    label: "错误信息"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_text, { type: "danger" }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(currentImage.value.errorMessage), 1)
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })) : createCommentVNode("", true)
                ]),
                _: 1
              })
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showFullscreenDialog.value,
          "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => showFullscreenDialog.value = $event),
          title: "图像预览",
          width: "90%",
          "close-on-click-modal": true,
          class: "fullscreen-dialog",
          "append-to-body": "",
          "destroy-on-close": ""
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_21, [
              currentImage.value ? (openBlock(), createElementBlock("img", {
                key: 0,
                src: getImageUrl(currentImage.value),
                alt: "预览图片"
              }, null, 8, _hoisted_22)) : createCommentVNode("", true)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const ImageResult = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-194f34d7"]]);
const _hoisted_1 = { class: "image-page" };
const _hoisted_2 = { class: "page-main" };
const _hoisted_3 = { class: "generator-area" };
const _hoisted_4 = { class: "result-area" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Image",
  setup(__props) {
    const {
      images,
      loadImages,
      loadProviders
    } = useImage();
    const selectedImageId = ref("");
    const generatorRef = ref(null);
    const selectedImage = computed(() => {
      if (!selectedImageId.value) return null;
      return images.value.find((img) => img.id === selectedImageId.value) || null;
    });
    function handleSelectImage(image) {
      selectedImageId.value = image.id;
    }
    function handleGenerated(taskId) {
      console.log("图像生成任务已创建:", taskId);
      loadImages();
    }
    function handleError(error) {
      ElMessage.error(error);
    }
    async function handleRegenerate(image) {
      if (generatorRef.value) {
        generatorRef.value.setParams({
          prompt: image.prompt,
          negativePrompt: image.negativePrompt,
          width: image.width || 1024,
          height: image.height || 1024,
          style: image.style,
          quality: image.quality,
          seed: image.seed,
          providerId: image.providerId,
          modelId: image.modelId
        });
      }
      await loadImages();
    }
    function handleImageUpdate(image) {
      loadImages();
    }
    function handleImageDelete(image) {
      selectedImageId.value = "";
      loadImages();
    }
    onMounted(async () => {
      await Promise.all([
        loadProviders(),
        loadImages()
      ]);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(ImageSidebar, {
          modelValue: selectedImageId.value,
          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedImageId.value = $event),
          class: "page-sidebar",
          onSelect: handleSelectImage
        }, null, 8, ["modelValue"]),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createVNode(ImageGenerator, {
              ref_key: "generatorRef",
              ref: generatorRef,
              onGenerated: handleGenerated,
              onError: handleError
            }, null, 512)
          ]),
          createBaseVNode("div", _hoisted_4, [
            createVNode(ImageResult, {
              image: selectedImage.value,
              onRegenerate: handleRegenerate,
              onUpdate: handleImageUpdate,
              onDelete: handleImageDelete
            }, null, 8, ["image"])
          ])
        ])
      ]);
    };
  }
});
const Image = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-dba02ef9"]]);
export {
  Image as default
};
