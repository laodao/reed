import { O as onMounted, ap as onUnmounted, r as ref, h as computed, d as defineComponent, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, aR as star_default, ah as withDirectives, G as Fragment, J as normalizeClass, N as arrow_right_default, L as toDisplayString, H as renderList, Y as createCommentVNode, a$ as edit_pen_default, R as reactive, f as resolveComponent, ak as resolveDirective, o as openBlock, c as createBlock, y as document_default, aS as star_filled_default, T as withModifiers, U as delete_default, E as ElMessage, V as ElMessageBox, _ as _export_sfc, ai as isRef, b0 as switch_default, e as createTextVNode, ad as loading_default, aT as copy_document_default, ag as upload_default, b1 as circle_check_default, S as folder_opened_default, aq as download_default } from "./index-CEiunyEa.js";
const LANGUAGES = [
  { code: "auto", name: "自动检测" },
  { code: "zh", name: "中文" },
  { code: "en", name: "英语" },
  { code: "ja", name: "日语" },
  { code: "ko", name: "韩语" },
  { code: "fr", name: "法语" },
  { code: "de", name: "德语" },
  { code: "es", name: "西班牙语" },
  { code: "ru", name: "俄语" },
  { code: "pt", name: "葡萄牙语" },
  { code: "it", name: "意大利语" },
  { code: "ar", name: "阿拉伯语" },
  { code: "th", name: "泰语" },
  { code: "vi", name: "越南语" }
];
function getLanguageName(code) {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.name || code;
}
const globalTranslating = ref(false);
const globalFileProgress = ref(0);
const globalCurrentTranslationId = ref(null);
function useTranslation() {
  const loading = ref(false);
  const error = ref(null);
  const translating = globalTranslating;
  const providers = ref([]);
  const selectedProviderId = ref("");
  const selectedModelId = ref("");
  const histories = ref([]);
  const totalHistories = ref(0);
  const favoriteOnly = ref(false);
  const sourceLanguage = ref("auto");
  const targetLanguage = ref("en");
  const sourceText = ref("");
  const targetText = ref("");
  const fileProgress = globalFileProgress;
  const selectedFile = ref(null);
  const currentTranslationId = globalCurrentTranslationId;
  let realtimeTimer = null;
  const cleanupFns = [];
  const selectedProvider = computed(
    () => providers.value.find((p) => p.id === selectedProviderId.value)
  );
  const availableModels = computed(() => {
    const allModels = [];
    for (const provider of providers.value) {
      if (provider.models) {
        for (const model of provider.models) {
          allModels.push({
            id: model.id,
            name: model.name,
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
            id: model.id,
            name: model.name,
            providerId: provider.id,
            providerName: provider.name
          }))
        });
      }
    }
    return result;
  });
  const hasProviders = computed(() => providers.value.length > 0);
  const sourceLanguageName = computed(() => getLanguageName(sourceLanguage.value));
  const targetLanguageName = computed(() => getLanguageName(targetLanguage.value));
  const charCount = computed(() => sourceText.value.length);
  const isOverLimit = computed(() => charCount.value > 5e3);
  async function loadProviders() {
    try {
      loading.value = true;
      error.value = null;
      const response = await window.electronAPI.translation.getProviders();
      if (response.success && response.data) {
        providers.value = response.data;
        const allModels = availableModels.value;
        if (allModels.length > 0) {
          selectedModelId.value = allModels[0].id;
          selectedProviderId.value = allModels[0].providerId;
        }
      } else {
        error.value = response.error || "加载提供商失败";
      }
    } finally {
      loading.value = false;
    }
  }
  async function loadHistories(page = 1, pageSize = 20) {
    try {
      loading.value = true;
      error.value = null;
      const query = {
        page,
        pageSize,
        favorite: favoriteOnly.value || void 0
      };
      const response = await window.electronAPI.translation.history(query);
      if (response.success && response.data) {
        histories.value = response.data.list;
        totalHistories.value = response.data.total;
      } else {
        error.value = response.error || "加载历史失败";
      }
    } finally {
      loading.value = false;
    }
  }
  async function translateText(request) {
    try {
      translating.value = true;
      error.value = null;
      const selectedModelInfo = availableModels.value.find((m) => m.id === selectedModelId.value);
      const providerId = request?.providerId || selectedModelInfo?.providerId || selectedProviderId.value;
      const response = await window.electronAPI.translation.text({
        text: request?.text || sourceText.value,
        sourceLanguage: request?.sourceLanguage || sourceLanguage.value,
        targetLanguage: request?.targetLanguage || targetLanguage.value,
        providerId: providerId || void 0,
        modelId: request?.modelId || selectedModelId.value || void 0
      });
      if (response.success && response.data) {
        targetText.value = response.data.translatedText;
        if (response.data.detectedLanguage) {
          sourceLanguage.value = response.data.detectedLanguage;
        }
        await loadHistories();
        return response.data.translatedText;
      } else {
        error.value = response.error || "翻译失败";
        return null;
      }
    } finally {
      translating.value = false;
    }
  }
  async function selectFile() {
    const response = await window.electronAPI.translation.selectFile();
    if (response.success && response.data) {
      selectedFile.value = response.data;
      return response.data;
    }
    error.value = response.error || "选择文件失败";
    return null;
  }
  async function translateFile() {
    if (!selectedFile.value) return null;
    try {
      error.value = null;
      fileProgress.value = 0;
      const selectedModelInfo = availableModels.value.find((m) => m.id === selectedModelId.value);
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value;
      const response = await window.electronAPI.translation.file({
        filePath: selectedFile.value.path,
        sourceLanguage: sourceLanguage.value,
        targetLanguage: targetLanguage.value,
        providerId: providerId || void 0,
        modelId: selectedModelId.value || void 0
      });
      if (response.success && response.data) {
        translating.value = true;
        currentTranslationId.value = response.data.translationId;
        return response.data.translationId;
      } else {
        error.value = response.error || "文件翻译失败";
        return null;
      }
    } catch (err) {
      error.value = err.message || "文件翻译失败";
      return null;
    }
  }
  function cancelFileTranslation() {
    translating.value = false;
    fileProgress.value = 0;
    currentTranslationId.value = null;
  }
  function restoreFromHistory(history) {
    sourceLanguage.value = history.sourceLanguage;
    targetLanguage.value = history.targetLanguage;
    if (history.type === "text") {
      sourceText.value = history.sourceText || "";
      targetText.value = history.targetText || "";
    } else if (history.type === "file") {
      if (history.sourceFile) {
        const fileName = history.sourceFileName || history.sourceFile.split(/[/\\]/).pop() || history.sourceFile;
        selectedFile.value = {
          path: history.sourceFile,
          name: fileName,
          size: history.wordCount
        };
      }
    }
    if (history.providerId) {
      selectedProviderId.value = history.providerId;
    }
    if (history.modelId) {
      selectedModelId.value = history.modelId;
    }
  }
  async function toggleFavorite(id) {
    const response = await window.electronAPI.translation.toggleFavorite(id);
    if (response.success) {
      await loadHistories();
      return true;
    }
    return false;
  }
  async function deleteHistory(id) {
    const response = await window.electronAPI.translation.delete(id);
    if (response.success) {
      await loadHistories();
      return true;
    }
    return false;
  }
  async function downloadResult(id) {
    const response = await window.electronAPI.translation.download(id);
    if (response.success && response.data) {
      return response.data;
    }
    error.value = response.error || "下载失败";
    return null;
  }
  async function toggleFavoriteFilter() {
    favoriteOnly.value = !favoriteOnly.value;
    await loadHistories();
  }
  function swapLanguages() {
    if (sourceLanguage.value === "auto") return;
    const temp = sourceLanguage.value;
    sourceLanguage.value = targetLanguage.value;
    targetLanguage.value = temp;
  }
  function startRealtimeTranslation() {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer);
    }
    realtimeTimer = setTimeout(() => {
      if (sourceText.value.trim()) {
        translateText();
      }
    }, 500);
  }
  function stopRealtimeTranslation() {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer);
      realtimeTimer = null;
    }
  }
  function clearTranslation() {
    sourceText.value = "";
    targetText.value = "";
    selectedFile.value = null;
    fileProgress.value = 0;
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  onMounted(async () => {
    const unsubProgress = window.electronAPI.translation.onProgress((data) => {
      if (currentTranslationId.value === data.translationId) {
        fileProgress.value = data.progress;
      }
    });
    cleanupFns.push(unsubProgress);
    const unsubCompleted = window.electronAPI.translation.onCompleted(async (data) => {
      if (currentTranslationId.value === data.translationId) {
        translating.value = false;
        fileProgress.value = 100;
        currentTranslationId.value = null;
        await loadHistories();
        window.dispatchEvent(new CustomEvent("translation-completed", {
          detail: { targetFile: data.targetFile }
        }));
      }
    });
    cleanupFns.push(unsubCompleted);
    const unsubFailed = window.electronAPI.translation.onFailed((data) => {
      if (currentTranslationId.value === data.translationId) {
        translating.value = false;
        fileProgress.value = 0;
        currentTranslationId.value = null;
        error.value = data.error;
        window.dispatchEvent(new CustomEvent("translation-failed", {
          detail: { error: data.error }
        }));
      }
    });
    cleanupFns.push(unsubFailed);
    await loadProviders();
    await loadHistories();
  });
  onUnmounted(() => {
    stopRealtimeTranslation();
    cleanupFns.forEach((fn) => fn());
  });
  return {
    // 状态
    loading,
    error,
    translating,
    providers,
    selectedProviderId,
    selectedModelId,
    histories,
    totalHistories,
    favoriteOnly,
    sourceLanguage,
    targetLanguage,
    sourceText,
    targetText,
    fileProgress,
    selectedFile,
    currentTranslationId,
    // 计算属性
    selectedProvider,
    availableModels,
    providerModels,
    hasProviders,
    sourceLanguageName,
    targetLanguageName,
    charCount,
    isOverLimit,
    // 方法
    loadHistories,
    translateText,
    selectFile,
    translateFile,
    cancelFileTranslation,
    restoreFromHistory,
    toggleFavorite,
    deleteHistory,
    downloadResult,
    toggleFavoriteFilter,
    swapLanguages,
    startRealtimeTranslation,
    stopRealtimeTranslation,
    clearTranslation,
    copyText,
    loadProviders,
    // 常量
    LANGUAGES
  };
}
const _hoisted_1$3 = { class: "translation-sidebar" };
const _hoisted_2$3 = { class: "sidebar-header" };
const _hoisted_3$3 = { class: "sidebar-content" };
const _hoisted_4$3 = {
  key: 0,
  class: "history-group"
};
const _hoisted_5$3 = { class: "group-count" };
const _hoisted_6$3 = ["onClick"];
const _hoisted_7$3 = { class: "history-type" };
const _hoisted_8$3 = { class: "history-content" };
const _hoisted_9$3 = ["title"];
const _hoisted_10$3 = { class: "history-meta" };
const _hoisted_11$3 = { class: "language-pair" };
const _hoisted_12$3 = { class: "history-time" };
const _hoisted_13$3 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_14$3 = { class: "history-actions" };
const _hoisted_15$2 = {
  key: 1,
  class: "history-group"
};
const _hoisted_16$2 = { class: "group-count" };
const _hoisted_17$2 = ["onClick"];
const _hoisted_18$1 = { class: "history-type" };
const _hoisted_19$1 = { class: "history-content" };
const _hoisted_20$1 = ["title"];
const _hoisted_21$1 = { class: "history-meta" };
const _hoisted_22$1 = { class: "language-pair" };
const _hoisted_23$1 = { class: "history-time" };
const _hoisted_24$1 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_25$1 = { class: "history-actions" };
const _hoisted_26$1 = {
  key: 2,
  class: "history-group"
};
const _hoisted_27$1 = { class: "group-count" };
const _hoisted_28 = ["onClick"];
const _hoisted_29 = { class: "history-type" };
const _hoisted_30 = { class: "history-content" };
const _hoisted_31 = ["title"];
const _hoisted_32 = { class: "history-meta" };
const _hoisted_33 = { class: "language-pair" };
const _hoisted_34 = { class: "history-time" };
const _hoisted_35 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_36 = { class: "history-actions" };
const _hoisted_37 = {
  key: 1,
  class: "empty-state"
};
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "TranslationSidebar",
  props: {
    modelValue: {}
  },
  emits: ["update:modelValue", "select"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const {
      histories,
      loading,
      favoriteOnly,
      toggleFavoriteFilter,
      toggleFavorite,
      deleteHistory
    } = useTranslation();
    const selectedId = computed({
      get: () => props.modelValue,
      set: (value) => emit("update:modelValue", value)
    });
    const collapsedGroups = reactive({
      today: false,
      yesterday: false,
      earlier: false
    });
    const groupedHistories = computed(() => {
      const today = [];
      const yesterday = [];
      const earlier = [];
      const now = /* @__PURE__ */ new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      for (const history of histories.value) {
        const date = typeof history.createdAt === "string" ? new Date(history.createdAt) : history.createdAt;
        if (date >= todayStart) {
          today.push(history);
        } else if (date >= yesterdayStart) {
          yesterday.push(history);
        } else {
          earlier.push(history);
        }
      }
      return { today, yesterday, earlier };
    });
    function toggleGroup(group) {
      collapsedGroups[group] = !collapsedGroups[group];
    }
    function handleSelect(history) {
      selectedId.value = history.id;
      emit("select", history);
    }
    async function handleToggleFavoriteFilter() {
      await toggleFavoriteFilter();
    }
    async function handleToggleFavorite(history) {
      const success = await toggleFavorite(history.id);
      if (success) {
        ElMessage.success(history.favorite ? "已取消收藏" : "已添加收藏");
      }
    }
    async function handleDelete(history) {
      try {
        await ElMessageBox.confirm(
          "确定要删除这条翻译记录吗？",
          "确认删除",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const success = await deleteHistory(history.id);
        if (success) {
          ElMessage.success("删除成功");
          if (selectedId.value === history.id) {
            selectedId.value = "";
          }
        }
      } catch {
      }
    }
    function getPreviewText(history) {
      if (history.type === "text" && history.sourceText) {
        return history.sourceText.length > 30 ? history.sourceText.substring(0, 30) + "..." : history.sourceText;
      }
      if (history.type === "file" && history.sourceFileName) {
        return history.sourceFileName;
      }
      return "翻译记录";
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
      const _component_el_empty = resolveComponent("el-empty");
      const _directive_loading = resolveDirective("loading");
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        createBaseVNode("div", _hoisted_2$3, [
          _cache[3] || (_cache[3] = createBaseVNode("h3", null, "翻译历史", -1)),
          createVNode(_component_el_tooltip, {
            content: "仅显示收藏",
            placement: "bottom"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_button, {
                type: unref(favoriteOnly) ? "warning" : "default",
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
          unref(histories).length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            groupedHistories.value.today.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_4$3, [
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
                createBaseVNode("span", _hoisted_5$3, toDisplayString(groupedHistories.value.today.length), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["group-content", { collapsed: collapsedGroups.today }])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(groupedHistories.value.today, (history) => {
                  return openBlock(), createElementBlock("div", {
                    key: history.id,
                    class: normalizeClass(["history-card", { selected: selectedId.value === history.id }]),
                    onClick: ($event) => handleSelect(history)
                  }, [
                    createBaseVNode("div", _hoisted_7$3, [
                      history.type === "text" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          createVNode(unref(edit_pen_default))
                        ]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                        default: withCtx(() => [
                          createVNode(unref(document_default))
                        ]),
                        _: 1
                      }))
                    ]),
                    createBaseVNode("div", _hoisted_8$3, [
                      createBaseVNode("div", {
                        class: "history-preview",
                        title: getPreviewText(history)
                      }, toDisplayString(getPreviewText(history)), 9, _hoisted_9$3),
                      createBaseVNode("div", _hoisted_10$3, [
                        createBaseVNode("span", _hoisted_11$3, toDisplayString(unref(getLanguageName)(history.sourceLanguage)) + " → " + toDisplayString(unref(getLanguageName)(history.targetLanguage)), 1),
                        createBaseVNode("span", _hoisted_12$3, toDisplayString(formatTime(history.createdAt)), 1)
                      ])
                    ]),
                    history.favorite ? (openBlock(), createElementBlock("div", _hoisted_13$3, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(star_filled_default))
                        ]),
                        _: 1
                      })
                    ])) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_14$3, [
                      createVNode(_component_el_button, {
                        type: history.favorite ? "warning" : "primary",
                        icon: history.favorite ? unref(star_filled_default) : unref(star_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleToggleFavorite(history), ["stop"])
                      }, null, 8, ["type", "icon", "onClick"]),
                      createVNode(_component_el_button, {
                        type: "danger",
                        icon: unref(delete_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDelete(history), ["stop"])
                      }, null, 8, ["icon", "onClick"])
                    ])
                  ], 10, _hoisted_6$3);
                }), 128))
              ], 2)
            ])) : createCommentVNode("", true),
            groupedHistories.value.yesterday.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_15$2, [
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
                createBaseVNode("span", _hoisted_16$2, toDisplayString(groupedHistories.value.yesterday.length), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["group-content", { collapsed: collapsedGroups.yesterday }])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(groupedHistories.value.yesterday, (history) => {
                  return openBlock(), createElementBlock("div", {
                    key: history.id,
                    class: normalizeClass(["history-card", { selected: selectedId.value === history.id }]),
                    onClick: ($event) => handleSelect(history)
                  }, [
                    createBaseVNode("div", _hoisted_18$1, [
                      history.type === "text" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          createVNode(unref(edit_pen_default))
                        ]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                        default: withCtx(() => [
                          createVNode(unref(document_default))
                        ]),
                        _: 1
                      }))
                    ]),
                    createBaseVNode("div", _hoisted_19$1, [
                      createBaseVNode("div", {
                        class: "history-preview",
                        title: getPreviewText(history)
                      }, toDisplayString(getPreviewText(history)), 9, _hoisted_20$1),
                      createBaseVNode("div", _hoisted_21$1, [
                        createBaseVNode("span", _hoisted_22$1, toDisplayString(unref(getLanguageName)(history.sourceLanguage)) + " → " + toDisplayString(unref(getLanguageName)(history.targetLanguage)), 1),
                        createBaseVNode("span", _hoisted_23$1, toDisplayString(formatTime(history.createdAt)), 1)
                      ])
                    ]),
                    history.favorite ? (openBlock(), createElementBlock("div", _hoisted_24$1, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(star_filled_default))
                        ]),
                        _: 1
                      })
                    ])) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_25$1, [
                      createVNode(_component_el_button, {
                        type: history.favorite ? "warning" : "primary",
                        icon: history.favorite ? unref(star_filled_default) : unref(star_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleToggleFavorite(history), ["stop"])
                      }, null, 8, ["type", "icon", "onClick"]),
                      createVNode(_component_el_button, {
                        type: "danger",
                        icon: unref(delete_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDelete(history), ["stop"])
                      }, null, 8, ["icon", "onClick"])
                    ])
                  ], 10, _hoisted_17$2);
                }), 128))
              ], 2)
            ])) : createCommentVNode("", true),
            groupedHistories.value.earlier.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_26$1, [
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
                createBaseVNode("span", _hoisted_27$1, toDisplayString(groupedHistories.value.earlier.length), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["group-content", { collapsed: collapsedGroups.earlier }])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(groupedHistories.value.earlier, (history) => {
                  return openBlock(), createElementBlock("div", {
                    key: history.id,
                    class: normalizeClass(["history-card", { selected: selectedId.value === history.id }]),
                    onClick: ($event) => handleSelect(history)
                  }, [
                    createBaseVNode("div", _hoisted_29, [
                      history.type === "text" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          createVNode(unref(edit_pen_default))
                        ]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                        default: withCtx(() => [
                          createVNode(unref(document_default))
                        ]),
                        _: 1
                      }))
                    ]),
                    createBaseVNode("div", _hoisted_30, [
                      createBaseVNode("div", {
                        class: "history-preview",
                        title: getPreviewText(history)
                      }, toDisplayString(getPreviewText(history)), 9, _hoisted_31),
                      createBaseVNode("div", _hoisted_32, [
                        createBaseVNode("span", _hoisted_33, toDisplayString(unref(getLanguageName)(history.sourceLanguage)) + " → " + toDisplayString(unref(getLanguageName)(history.targetLanguage)), 1),
                        createBaseVNode("span", _hoisted_34, toDisplayString(formatTime(history.createdAt)), 1)
                      ])
                    ]),
                    history.favorite ? (openBlock(), createElementBlock("div", _hoisted_35, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(star_filled_default))
                        ]),
                        _: 1
                      })
                    ])) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_36, [
                      createVNode(_component_el_button, {
                        type: history.favorite ? "warning" : "primary",
                        icon: history.favorite ? unref(star_filled_default) : unref(star_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleToggleFavorite(history), ["stop"])
                      }, null, 8, ["type", "icon", "onClick"]),
                      createVNode(_component_el_button, {
                        type: "danger",
                        icon: unref(delete_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDelete(history), ["stop"])
                      }, null, 8, ["icon", "onClick"])
                    ])
                  ], 10, _hoisted_28);
                }), 128))
              ], 2)
            ])) : createCommentVNode("", true)
          ], 64)) : (openBlock(), createElementBlock("div", _hoisted_37, [
            createVNode(_component_el_empty, { description: "暂无翻译记录" }, {
              image: withCtx(() => [
                createVNode(_component_el_icon, { size: 48 }, {
                  default: withCtx(() => [
                    createVNode(unref(edit_pen_default))
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
const TranslationSidebar = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-44c679fb"]]);
const _hoisted_1$2 = { class: "text-translation" };
const _hoisted_2$2 = { class: "model-section" };
const _hoisted_3$2 = { class: "model-selector" };
const _hoisted_4$2 = { class: "language-bar" };
const _hoisted_5$2 = { class: "translation-area" };
const _hoisted_6$2 = { class: "text-panel" };
const _hoisted_7$2 = { class: "panel-footer" };
const _hoisted_8$2 = { class: "text-panel" };
const _hoisted_9$2 = { class: "result-area" };
const _hoisted_10$2 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_11$2 = {
  key: 1,
  class: "result-text"
};
const _hoisted_12$2 = {
  key: 2,
  class: "empty-state"
};
const _hoisted_13$2 = { class: "panel-footer" };
const _hoisted_14$2 = { class: "action-bar" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "TextTranslation",
  setup(__props) {
    const {
      translating,
      error,
      selectedProviderId,
      selectedModelId,
      providerModels,
      hasProviders,
      sourceLanguage,
      targetLanguage,
      sourceText,
      targetText,
      charCount,
      isOverLimit,
      translateText,
      swapLanguages,
      clearTranslation,
      copyText,
      LANGUAGES: LANGUAGES2
    } = useTranslation();
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
    function handleInput() {
    }
    return (_ctx, _cache) => {
      const _component_el_option = resolveComponent("el-option");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_alert = resolveComponent("el-alert");
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          createBaseVNode("div", _hoisted_3$2, [
            createVNode(_component_el_select, {
              modelValue: selectedModelKey.value,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedModelKey.value = $event),
              placeholder: "选择模型",
              class: "model-select",
              disabled: unref(translating),
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
                        }, null, 8, ["label", "value"]);
                      }), 128))
                    ]),
                    _: 2
                  }, 1032, ["label"]);
                }), 128))
              ]),
              _: 1
            }, 8, ["modelValue", "disabled"])
          ])
        ]),
        createBaseVNode("div", _hoisted_4$2, [
          createVNode(_component_el_select, {
            modelValue: unref(sourceLanguage),
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => isRef(sourceLanguage) ? sourceLanguage.value = $event : null),
            placeholder: "源语言",
            class: "language-select",
            disabled: unref(translating)
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(LANGUAGES2), (lang) => {
                return openBlock(), createBlock(_component_el_option, {
                  key: lang.code,
                  label: lang.name,
                  value: lang.code
                }, null, 8, ["label", "value"]);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"]),
          createVNode(_component_el_button, {
            icon: unref(switch_default),
            circle: "",
            disabled: unref(sourceLanguage) === "auto" || unref(translating),
            onClick: unref(swapLanguages)
          }, null, 8, ["icon", "disabled", "onClick"]),
          createVNode(_component_el_select, {
            modelValue: unref(targetLanguage),
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => isRef(targetLanguage) ? targetLanguage.value = $event : null),
            placeholder: "目标语言",
            class: "language-select",
            disabled: unref(translating)
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(LANGUAGES2).filter((l) => l.code !== "auto"), (lang) => {
                return openBlock(), createBlock(_component_el_option, {
                  key: lang.code,
                  label: lang.name,
                  value: lang.code
                }, null, 8, ["label", "value"]);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"])
        ]),
        createBaseVNode("div", _hoisted_5$2, [
          createBaseVNode("div", _hoisted_6$2, [
            createVNode(_component_el_input, {
              modelValue: unref(sourceText),
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => isRef(sourceText) ? sourceText.value = $event : null),
              type: "textarea",
              rows: 10,
              placeholder: "输入要翻译的文本...",
              disabled: unref(translating),
              onInput: handleInput
            }, null, 8, ["modelValue", "disabled"]),
            createBaseVNode("div", _hoisted_7$2, [
              createBaseVNode("span", {
                class: normalizeClass(["char-count", { over: unref(isOverLimit) }])
              }, toDisplayString(unref(charCount)) + "/5000 ", 3),
              createVNode(_component_el_button, {
                text: "",
                onClick: unref(clearTranslation),
                disabled: unref(translating)
              }, {
                default: withCtx(() => [..._cache[7] || (_cache[7] = [
                  createTextVNode(" 清空 ", -1)
                ])]),
                _: 1
              }, 8, ["onClick", "disabled"])
            ])
          ]),
          createBaseVNode("div", _hoisted_8$2, [
            createBaseVNode("div", _hoisted_9$2, [
              unref(translating) ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
                createVNode(_component_el_icon, { class: "is-loading" }, {
                  default: withCtx(() => [
                    createVNode(unref(loading_default))
                  ]),
                  _: 1
                }),
                _cache[8] || (_cache[8] = createBaseVNode("span", null, "翻译中...", -1))
              ])) : unref(targetText) ? (openBlock(), createElementBlock("div", _hoisted_11$2, toDisplayString(unref(targetText)), 1)) : (openBlock(), createElementBlock("div", _hoisted_12$2, " 翻译结果将显示在这里 "))
            ]),
            createBaseVNode("div", _hoisted_13$2, [
              createVNode(_component_el_button, {
                text: "",
                disabled: !unref(targetText),
                onClick: _cache[4] || (_cache[4] = ($event) => unref(copyText)(unref(targetText)))
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(copy_document_default))
                    ]),
                    _: 1
                  }),
                  _cache[9] || (_cache[9] = createTextVNode(" 复制 ", -1))
                ]),
                _: 1
              }, 8, ["disabled"])
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_14$2, [
          createVNode(_component_el_button, {
            type: "primary",
            size: "large",
            loading: unref(translating),
            disabled: !unref(sourceText).trim() || unref(isOverLimit) || !unref(hasProviders),
            onClick: _cache[5] || (_cache[5] = ($event) => unref(translateText)())
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(unref(hasProviders) ? "翻译" : "无可用提供商"), 1)
            ]),
            _: 1
          }, 8, ["loading", "disabled"])
        ]),
        unref(error) ? (openBlock(), createBlock(_component_el_alert, {
          key: 0,
          title: unref(error),
          type: "error",
          "show-icon": "",
          closable: "",
          onClose: _cache[6] || (_cache[6] = ($event) => error.value = null)
        }, null, 8, ["title"])) : createCommentVNode("", true)
      ]);
    };
  }
});
const TextTranslation = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-a4324117"]]);
const _hoisted_1$1 = { class: "file-translation" };
const _hoisted_2$1 = { class: "model-section" };
const _hoisted_3$1 = { class: "model-selector" };
const _hoisted_4$1 = { class: "language-bar" };
const _hoisted_5$1 = { class: "upload-area" };
const _hoisted_6$1 = {
  key: 1,
  class: "file-info"
};
const _hoisted_7$1 = { class: "file-icon" };
const _hoisted_8$1 = { class: "file-details" };
const _hoisted_9$1 = { class: "file-name" };
const _hoisted_10$1 = { class: "file-size" };
const _hoisted_11$1 = {
  key: 0,
  class: "progress-area"
};
const _hoisted_12$1 = { class: "progress-text" };
const _hoisted_13$1 = {
  key: 1,
  class: "result-area"
};
const _hoisted_14$1 = { class: "result-header" };
const _hoisted_15$1 = { class: "result-info" };
const _hoisted_16$1 = { class: "result-actions" };
const _hoisted_17$1 = { class: "action-bar" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "FileTranslation",
  setup(__props) {
    const {
      translating,
      error,
      selectedModelId,
      availableModels,
      hasProviders,
      sourceLanguage,
      targetLanguage,
      selectedFile,
      fileProgress,
      selectFile,
      translateFile,
      cancelFileTranslation,
      swapLanguages,
      clearTranslation,
      LANGUAGES: LANGUAGES2
    } = useTranslation();
    const translationResult = ref(null);
    async function handleSelectFile() {
      await selectFile();
    }
    async function handleDropFile(event) {
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!["md", "txt"].includes(ext || "")) {
          ElMessage.error("不支持的文件格式，请上传 .md 或 .txt 文件");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          ElMessage.error("文件大小超过限制（最大 5MB）");
          return;
        }
        ElMessage.warning("请点击上传区域选择文件");
      }
    }
    async function handleTranslate() {
      translationResult.value = null;
      const result = await translateFile();
      if (result) {
        ElMessage.info("翻译任务已开始，请等待...");
      } else if (error.value) {
        ElMessage.error(error.value);
      }
    }
    function handleCancel() {
      cancelFileTranslation();
      ElMessage.warning("已取消翻译");
    }
    function handleClearFile() {
      clearTranslation();
      translationResult.value = null;
    }
    function handleClearResult() {
      translationResult.value = null;
    }
    async function handleOpenFolder() {
      if (translationResult.value) {
        const response = await window.electronAPI.translation.openFolder(translationResult.value);
        if (!response.success) {
          ElMessage.error(response.error || "打开文件夹失败");
        }
      }
    }
    function formatFileSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    function handleTranslationCompleted(event) {
      const { targetFile } = event.detail;
      translationResult.value = targetFile;
      ElMessage.success("翻译完成！");
    }
    function handleTranslationFailed(event) {
      const { error: err } = event.detail;
      ElMessage.error(`翻译失败: ${err}`);
    }
    onMounted(() => {
      window.addEventListener("translation-completed", handleTranslationCompleted);
      window.addEventListener("translation-failed", handleTranslationFailed);
    });
    onUnmounted(() => {
      window.removeEventListener("translation-completed", handleTranslationCompleted);
      window.removeEventListener("translation-failed", handleTranslationFailed);
    });
    return (_ctx, _cache) => {
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_alert = resolveComponent("el-alert");
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("div", _hoisted_3$1, [
            createVNode(_component_el_select, {
              modelValue: unref(selectedModelId),
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => isRef(selectedModelId) ? selectedModelId.value = $event : null),
              placeholder: "选择模型",
              class: "model-select",
              disabled: unref(translating)
            }, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(availableModels), (model) => {
                  return openBlock(), createBlock(_component_el_option, {
                    key: model.id,
                    label: model.name,
                    value: model.id
                  }, null, 8, ["label", "value"]);
                }), 128))
              ]),
              _: 1
            }, 8, ["modelValue", "disabled"])
          ])
        ]),
        createBaseVNode("div", _hoisted_4$1, [
          createVNode(_component_el_select, {
            modelValue: unref(sourceLanguage),
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => isRef(sourceLanguage) ? sourceLanguage.value = $event : null),
            placeholder: "源语言",
            class: "language-select",
            disabled: unref(translating)
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(LANGUAGES2), (lang) => {
                return openBlock(), createBlock(_component_el_option, {
                  key: lang.code,
                  label: lang.name,
                  value: lang.code
                }, null, 8, ["label", "value"]);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"]),
          createVNode(_component_el_button, {
            icon: unref(switch_default),
            circle: "",
            disabled: unref(sourceLanguage) === "auto" || unref(translating),
            onClick: unref(swapLanguages)
          }, null, 8, ["icon", "disabled", "onClick"]),
          createVNode(_component_el_select, {
            modelValue: unref(targetLanguage),
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => isRef(targetLanguage) ? targetLanguage.value = $event : null),
            placeholder: "目标语言",
            class: "language-select",
            disabled: unref(translating)
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(LANGUAGES2).filter((l) => l.code !== "auto"), (lang) => {
                return openBlock(), createBlock(_component_el_option, {
                  key: lang.code,
                  label: lang.name,
                  value: lang.code
                }, null, 8, ["label", "value"]);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue", "disabled"])
        ]),
        createBaseVNode("div", _hoisted_5$1, [
          !unref(selectedFile) ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "upload-box",
            onClick: handleSelectFile,
            onDragover: _cache[3] || (_cache[3] = withModifiers(() => {
            }, ["prevent"])),
            onDrop: withModifiers(handleDropFile, ["prevent"])
          }, [
            createVNode(_component_el_icon, { size: 48 }, {
              default: withCtx(() => [
                createVNode(unref(upload_default))
              ]),
              _: 1
            }),
            _cache[5] || (_cache[5] = createBaseVNode("p", { class: "upload-text" }, "点击或拖拽上传文件", -1)),
            _cache[6] || (_cache[6] = createBaseVNode("p", { class: "upload-tip" }, "支持 .md .txt 格式，最大 5MB", -1))
          ], 32)) : (openBlock(), createElementBlock("div", _hoisted_6$1, [
            createBaseVNode("div", _hoisted_7$1, [
              createVNode(_component_el_icon, { size: 32 }, {
                default: withCtx(() => [
                  createVNode(unref(document_default))
                ]),
                _: 1
              })
            ]),
            createBaseVNode("div", _hoisted_8$1, [
              createBaseVNode("p", _hoisted_9$1, toDisplayString(unref(selectedFile).name), 1),
              createBaseVNode("p", _hoisted_10$1, toDisplayString(formatFileSize(unref(selectedFile).size)), 1)
            ]),
            createVNode(_component_el_button, {
              type: "danger",
              icon: unref(delete_default),
              circle: "",
              disabled: unref(translating),
              onClick: handleClearFile
            }, null, 8, ["icon", "disabled"])
          ]))
        ]),
        unref(translating) ? (openBlock(), createElementBlock("div", _hoisted_11$1, [
          createVNode(_component_el_progress, {
            percentage: unref(fileProgress),
            "stroke-width": 8,
            "show-text": true
          }, null, 8, ["percentage"]),
          createBaseVNode("p", _hoisted_12$1, "正在翻译... " + toDisplayString(unref(fileProgress)) + "%", 1),
          createVNode(_component_el_button, {
            type: "warning",
            size: "small",
            onClick: handleCancel,
            style: { "margin-top": "12px" }
          }, {
            default: withCtx(() => [..._cache[7] || (_cache[7] = [
              createTextVNode(" 取消翻译 ", -1)
            ])]),
            _: 1
          })
        ])) : createCommentVNode("", true),
        translationResult.value && !unref(translating) ? (openBlock(), createElementBlock("div", _hoisted_13$1, [
          createBaseVNode("div", _hoisted_14$1, [
            createVNode(_component_el_icon, { class: "success-icon" }, {
              default: withCtx(() => [
                createVNode(unref(circle_check_default))
              ]),
              _: 1
            }),
            _cache[8] || (_cache[8] = createBaseVNode("span", null, "翻译完成", -1))
          ]),
          createBaseVNode("div", _hoisted_15$1, [
            createBaseVNode("p", null, [
              _cache[9] || (_cache[9] = createBaseVNode("strong", null, "源文件：", -1)),
              createTextVNode(toDisplayString(unref(selectedFile)?.name), 1)
            ]),
            createBaseVNode("p", null, [
              _cache[10] || (_cache[10] = createBaseVNode("strong", null, "翻译结果：", -1)),
              createTextVNode(toDisplayString(translationResult.value), 1)
            ])
          ]),
          createBaseVNode("div", _hoisted_16$1, [
            createVNode(_component_el_button, {
              type: "primary",
              onClick: handleOpenFolder
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(folder_opened_default))
                  ]),
                  _: 1
                }),
                _cache[11] || (_cache[11] = createTextVNode(" 打开文件夹 ", -1))
              ]),
              _: 1
            }),
            createVNode(_component_el_button, { onClick: handleClearResult }, {
              default: withCtx(() => [..._cache[12] || (_cache[12] = [
                createTextVNode(" 清除结果 ", -1)
              ])]),
              _: 1
            })
          ])
        ])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_17$1, [
          createVNode(_component_el_button, {
            type: "primary",
            size: "large",
            loading: unref(translating),
            disabled: !unref(selectedFile) || !unref(hasProviders),
            onClick: handleTranslate
          }, {
            default: withCtx(() => [
              createTextVNode(toDisplayString(unref(hasProviders) ? unref(translating) ? "翻译中..." : "开始翻译" : "无可用提供商"), 1)
            ]),
            _: 1
          }, 8, ["loading", "disabled"])
        ]),
        unref(error) ? (openBlock(), createBlock(_component_el_alert, {
          key: 2,
          title: unref(error),
          type: "error",
          "show-icon": "",
          closable: "",
          onClose: _cache[4] || (_cache[4] = ($event) => error.value = null)
        }, null, 8, ["title"])) : createCommentVNode("", true)
      ]);
    };
  }
});
const FileTranslation = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-2abeb7a4"]]);
const _hoisted_1 = { class: "translation-page" };
const _hoisted_2 = { class: "page-main" };
const _hoisted_3 = {
  key: 0,
  class: "history-detail"
};
const _hoisted_4 = { class: "detail-section info-section" };
const _hoisted_5 = { class: "info-grid" };
const _hoisted_6 = { class: "info-item" };
const _hoisted_7 = { class: "value" };
const _hoisted_8 = { class: "info-item" };
const _hoisted_9 = { class: "value" };
const _hoisted_10 = { class: "info-item" };
const _hoisted_11 = { class: "value" };
const _hoisted_12 = {
  key: 0,
  class: "info-item full-width"
};
const _hoisted_13 = { class: "value error" };
const _hoisted_14 = {
  key: 0,
  class: "detail-section content-section"
};
const _hoisted_15 = { class: "content-panel" };
const _hoisted_16 = { class: "panel-content" };
const _hoisted_17 = { class: "content-panel" };
const _hoisted_18 = { class: "panel-header" };
const _hoisted_19 = { class: "panel-content" };
const _hoisted_20 = {
  key: 1,
  class: "detail-section content-section"
};
const _hoisted_21 = { class: "file-info-grid" };
const _hoisted_22 = { class: "file-info-item" };
const _hoisted_23 = { class: "value" };
const _hoisted_24 = {
  key: 0,
  class: "file-info-item"
};
const _hoisted_25 = { class: "value" };
const _hoisted_26 = { class: "file-info-item" };
const _hoisted_27 = { class: "dialog-footer" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Translate",
  setup(__props) {
    const {
      downloadResult
    } = useTranslation();
    const activeTab = ref("text");
    const selectedHistoryId = ref("");
    const showHistoryDetail = ref(false);
    const historyDetail = ref(null);
    function handleSelectHistory(history) {
      historyDetail.value = history;
      showHistoryDetail.value = true;
    }
    async function handleDownloadResult() {
      if (historyDetail.value) {
        const result = await downloadResult(historyDetail.value.id);
        if (result) {
          ElMessage.success("保存成功");
        }
      }
    }
    async function handleOpenFolder() {
      if (historyDetail.value?.targetFile) {
        const response = await window.electronAPI.translation.openFolder(historyDetail.value.targetFile);
        if (!response.success) {
          ElMessage.error(response.error || "打开文件夹失败");
        }
      }
    }
    async function handleCopyText(text) {
      if (text) {
        await navigator.clipboard.writeText(text);
        ElMessage.success("已复制到剪贴板");
      }
    }
    function formatDateTime(date) {
      const d = typeof date === "string" ? new Date(date) : date;
      return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    function getStatusType(status) {
      switch (status) {
        case "completed":
          return "success";
        case "processing":
          return "warning";
        case "failed":
          return "danger";
        default:
          return "info";
      }
    }
    function getStatusText(status) {
      switch (status) {
        case "completed":
          return "已完成";
        case "processing":
          return "处理中";
        case "failed":
          return "失败";
        case "pending":
          return "等待中";
        default:
          return status;
      }
    }
    return (_ctx, _cache) => {
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_tabs = resolveComponent("el-tabs");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(TranslationSidebar, {
          modelValue: selectedHistoryId.value,
          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedHistoryId.value = $event),
          class: "page-sidebar",
          onSelect: handleSelectHistory
        }, null, 8, ["modelValue"]),
        createBaseVNode("div", _hoisted_2, [
          createVNode(_component_el_tabs, {
            modelValue: activeTab.value,
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => activeTab.value = $event),
            class: "translation-tabs"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_tab_pane, {
                label: "文本翻译",
                name: "text"
              }, {
                default: withCtx(() => [
                  createVNode(TextTranslation)
                ]),
                _: 1
              }),
              createVNode(_component_el_tab_pane, {
                label: "文件翻译",
                name: "file"
              }, {
                default: withCtx(() => [
                  createVNode(FileTranslation)
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showHistoryDetail.value,
          "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => showHistoryDetail.value = $event),
          title: historyDetail.value?.type === "text" ? "文本翻译详情" : "文件翻译详情",
          width: "80%",
          top: "5vh",
          "destroy-on-close": "",
          "close-on-click-modal": false
        }, {
          footer: withCtx(() => [
            createBaseVNode("div", _hoisted_27, [
              historyDetail.value?.type === "file" && historyDetail.value?.targetFile ? (openBlock(), createBlock(_component_el_button, {
                key: 0,
                type: "primary",
                onClick: handleDownloadResult
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(download_default))
                    ]),
                    _: 1
                  }),
                  _cache[15] || (_cache[15] = createTextVNode(" 下载翻译结果 ", -1))
                ]),
                _: 1
              })) : createCommentVNode("", true),
              historyDetail.value?.type === "file" && historyDetail.value?.targetFile ? (openBlock(), createBlock(_component_el_button, {
                key: 1,
                onClick: handleOpenFolder
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(folder_opened_default))
                    ]),
                    _: 1
                  }),
                  _cache[16] || (_cache[16] = createTextVNode(" 打开文件夹 ", -1))
                ]),
                _: 1
              })) : createCommentVNode("", true),
              createVNode(_component_el_button, {
                onClick: _cache[3] || (_cache[3] = ($event) => showHistoryDetail.value = false)
              }, {
                default: withCtx(() => [..._cache[17] || (_cache[17] = [
                  createTextVNode("关闭", -1)
                ])]),
                _: 1
              })
            ])
          ]),
          default: withCtx(() => [
            historyDetail.value ? (openBlock(), createElementBlock("div", _hoisted_3, [
              createBaseVNode("div", _hoisted_4, [
                createBaseVNode("div", _hoisted_5, [
                  createBaseVNode("div", _hoisted_6, [
                    _cache[5] || (_cache[5] = createBaseVNode("span", { class: "label" }, "翻译语言", -1)),
                    createBaseVNode("span", _hoisted_7, toDisplayString(unref(getLanguageName)(historyDetail.value.sourceLanguage)) + " → " + toDisplayString(unref(getLanguageName)(historyDetail.value.targetLanguage)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_8, [
                    _cache[6] || (_cache[6] = createBaseVNode("span", { class: "label" }, "字数", -1)),
                    createBaseVNode("span", _hoisted_9, toDisplayString(historyDetail.value.wordCount) + " 字", 1)
                  ]),
                  createBaseVNode("div", _hoisted_10, [
                    _cache[7] || (_cache[7] = createBaseVNode("span", { class: "label" }, "翻译时间", -1)),
                    createBaseVNode("span", _hoisted_11, toDisplayString(formatDateTime(historyDetail.value.createdAt)), 1)
                  ]),
                  historyDetail.value.status === "failed" ? (openBlock(), createElementBlock("div", _hoisted_12, [
                    _cache[8] || (_cache[8] = createBaseVNode("span", { class: "label" }, "错误信息", -1)),
                    createBaseVNode("span", _hoisted_13, toDisplayString(historyDetail.value.errorMessage), 1)
                  ])) : createCommentVNode("", true)
                ])
              ]),
              historyDetail.value.type === "text" ? (openBlock(), createElementBlock("div", _hoisted_14, [
                createBaseVNode("div", _hoisted_15, [
                  _cache[9] || (_cache[9] = createBaseVNode("div", { class: "panel-header" }, [
                    createBaseVNode("span", null, "原文")
                  ], -1)),
                  createBaseVNode("div", _hoisted_16, toDisplayString(historyDetail.value.sourceText), 1)
                ]),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("div", _hoisted_18, [
                    _cache[11] || (_cache[11] = createBaseVNode("span", null, "译文", -1)),
                    createVNode(_component_el_button, {
                      text: "",
                      size: "small",
                      onClick: _cache[2] || (_cache[2] = ($event) => handleCopyText(historyDetail.value.targetText))
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(copy_document_default))
                          ]),
                          _: 1
                        }),
                        _cache[10] || (_cache[10] = createTextVNode(" 复制 ", -1))
                      ]),
                      _: 1
                    })
                  ]),
                  createBaseVNode("div", _hoisted_19, toDisplayString(historyDetail.value.targetText), 1)
                ])
              ])) : historyDetail.value.type === "file" ? (openBlock(), createElementBlock("div", _hoisted_20, [
                createBaseVNode("div", _hoisted_21, [
                  createBaseVNode("div", _hoisted_22, [
                    _cache[12] || (_cache[12] = createBaseVNode("span", { class: "label" }, "源文件", -1)),
                    createBaseVNode("span", _hoisted_23, toDisplayString(historyDetail.value.sourceFileName), 1)
                  ]),
                  historyDetail.value.targetFile ? (openBlock(), createElementBlock("div", _hoisted_24, [
                    _cache[13] || (_cache[13] = createBaseVNode("span", { class: "label" }, "翻译结果", -1)),
                    createBaseVNode("span", _hoisted_25, toDisplayString(historyDetail.value.targetFile), 1)
                  ])) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_26, [
                    _cache[14] || (_cache[14] = createBaseVNode("span", { class: "label" }, "状态", -1)),
                    createVNode(_component_el_tag, {
                      type: getStatusType(historyDetail.value.status),
                      size: "large"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(getStatusText(historyDetail.value.status)), 1)
                      ]),
                      _: 1
                    }, 8, ["type"])
                  ])
                ])
              ])) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue", "title"])
      ]);
    };
  }
});
const Translate = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-675f0388"]]);
export {
  Translate as default
};
