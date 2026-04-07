import { O as onMounted, ap as onUnmounted, r as ref, h as computed, d as defineComponent, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, aR as star_default, ah as withDirectives, G as Fragment, J as normalizeClass, N as arrow_right_default, L as toDisplayString, H as renderList, Y as createCommentVNode, z as microphone_default, R as reactive, f as resolveComponent, ak as resolveDirective, o as openBlock, c as createBlock, a3 as headset_default, aS as star_filled_default, T as withModifiers, aq as download_default, U as delete_default, E as ElMessage, V as ElMessageBox, _ as _export_sfc, ai as isRef, e as createTextVNode, S as folder_opened_default, aT as copy_document_default } from "./index-CEiunyEa.js";
const VOICE_LANGUAGES = [
  { code: "zh", name: "Chinese" },
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "ru", name: "Russian" },
  { code: "it", name: "Italian" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" }
];
function getVoiceLanguageName(code) {
  const lang = VOICE_LANGUAGES.find((l) => l.code === code);
  return lang?.name || code;
}
const globalTTSGenerating = ref(false);
const globalSTTProcessing = ref(false);
function useVoice() {
  const loading = ref(false);
  const error = ref(null);
  const ttsGenerating = globalTTSGenerating;
  const sttProcessing = globalSTTProcessing;
  const providers = ref([]);
  const voices = ref([]);
  const selectedProviderId = ref("");
  const selectedModelId = ref("");
  const selectedVoiceId = ref("");
  const histories = ref([]);
  const totalHistories = ref(0);
  const favoriteOnly = ref(false);
  const currentLanguage = ref("zh");
  const speed = ref(1);
  const pitch = ref(0);
  const volume = ref(100);
  const inputText = ref("");
  const outputAudioPath = ref(null);
  const selectedAudioFile = ref(null);
  const recognizedText = ref("");
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
  const currentLanguageName = computed(() => getVoiceLanguageName(currentLanguage.value));
  const charCount = computed(() => inputText.value.length);
  const isOverLimit = computed(() => charCount.value > 5e3);
  const selectedSpeaker = computed(
    () => voices.value.find((v) => v.id === selectedVoiceId.value)
  );
  async function loadProviders() {
    try {
      loading.value = true;
      error.value = null;
      const response = await window.electronAPI.voice.getProviders();
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
  async function loadVoices() {
    try {
      loading.value = true;
      error.value = null;
      const response = await window.electronAPI.voice.getVoices(selectedProviderId.value || void 0, currentLanguage.value);
      if (response.success && response.data) {
        voices.value = response.data;
        if (voices.value.length > 0 && !selectedVoiceId.value) {
          selectedVoiceId.value = voices.value[0].id;
        }
      } else {
        error.value = response.error || "加载发音人失败";
      }
    } finally {
      loading.value = false;
    }
  }
  async function loadHistories(page = 1, pageSize = 20, type) {
    try {
      loading.value = true;
      error.value = null;
      const query = {
        page,
        pageSize,
        type,
        favorite: favoriteOnly.value || void 0
      };
      const response = await window.electronAPI.voice.history(query);
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
  async function generateSpeech(text) {
    try {
      ttsGenerating.value = true;
      error.value = null;
      outputAudioPath.value = null;
      const selectedModelInfo = availableModels.value.find((m) => m.id === selectedModelId.value);
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value;
      const request = {
        text: text || inputText.value,
        voiceId: selectedVoiceId.value,
        language: currentLanguage.value,
        speed: speed.value,
        pitch: pitch.value,
        volume: volume.value,
        providerId: providerId || void 0,
        modelId: selectedModelId.value || void 0
      };
      const response = await window.electronAPI.voice.tts(request);
      if (response.success && response.data) {
        outputAudioPath.value = response.data.audioPath;
        await loadHistories();
        return response.data.audioPath;
      } else {
        error.value = response.error || "语音生成失败";
        return null;
      }
    } finally {
      ttsGenerating.value = false;
    }
  }
  async function selectAudioFile() {
    const response = await window.electronAPI.voice.selectFile();
    if (response.success && response.data) {
      selectedAudioFile.value = response.data;
      return response.data;
    }
    error.value = response.error || "选择文件失败";
    return null;
  }
  async function recognizeSpeech(audioPath, audioData) {
    try {
      sttProcessing.value = true;
      error.value = null;
      recognizedText.value = "";
      const selectedModelInfo = availableModels.value.find((m) => m.id === selectedModelId.value);
      const providerId = selectedModelInfo?.providerId || selectedProviderId.value;
      const request = {
        audioPath: audioPath || selectedAudioFile.value?.path,
        audioData,
        language: currentLanguage.value,
        providerId: providerId || void 0,
        modelId: selectedModelId.value || void 0
      };
      const response = await window.electronAPI.voice.stt(request);
      if (response.success && response.data) {
        recognizedText.value = response.data.text;
        await loadHistories();
        return response.data.text;
      } else {
        error.value = response.error || "语音识别失败";
        return null;
      }
    } finally {
      sttProcessing.value = false;
    }
  }
  async function toggleFavorite(id) {
    const response = await window.electronAPI.voice.toggleFavorite(id);
    if (response.success) {
      await loadHistories();
      return true;
    }
    return false;
  }
  async function deleteHistory(id) {
    const response = await window.electronAPI.voice.delete(id);
    if (response.success) {
      await loadHistories();
      return true;
    }
    return false;
  }
  async function toggleFavoriteFilter() {
    favoriteOnly.value = !favoriteOnly.value;
    await loadHistories();
  }
  function clearInput() {
    inputText.value = "";
    outputAudioPath.value = null;
    selectedAudioFile.value = null;
    recognizedText.value = "";
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
    const unsubTTS = window.electronAPI.voice.onTTSCompleted((data) => {
      outputAudioPath.value = data.audioPath;
      ttsGenerating.value = false;
    });
    cleanupFns.push(unsubTTS);
    const unsubSTT = window.electronAPI.voice.onSTTCompleted((data) => {
      recognizedText.value = data.text;
      sttProcessing.value = false;
    });
    cleanupFns.push(unsubSTT);
    await loadProviders();
    await loadVoices();
    await loadHistories();
  });
  onUnmounted(() => {
    cleanupFns.forEach((fn) => fn());
  });
  return {
    // 状态
    loading,
    error,
    ttsGenerating,
    sttProcessing,
    providers,
    voices,
    selectedProviderId,
    selectedModelId,
    selectedVoiceId,
    histories,
    totalHistories,
    favoriteOnly,
    currentLanguage,
    speed,
    pitch,
    volume,
    inputText,
    outputAudioPath,
    selectedAudioFile,
    recognizedText,
    // 计算属性
    selectedProvider,
    availableModels,
    providerModels,
    hasProviders,
    currentLanguageName,
    charCount,
    isOverLimit,
    selectedSpeaker,
    // 方法
    loadProviders,
    loadVoices,
    loadHistories,
    generateSpeech,
    selectAudioFile,
    recognizeSpeech,
    toggleFavorite,
    deleteHistory,
    toggleFavoriteFilter,
    clearInput,
    copyText,
    // 常量
    VOICE_LANGUAGES
  };
}
const _hoisted_1$2 = { class: "voice-sidebar" };
const _hoisted_2$2 = { class: "sidebar-header" };
const _hoisted_3$2 = { class: "sidebar-content" };
const _hoisted_4$2 = {
  key: 0,
  class: "history-group"
};
const _hoisted_5$2 = { class: "group-count" };
const _hoisted_6$2 = ["onClick"];
const _hoisted_7$2 = { class: "history-type" };
const _hoisted_8$2 = { class: "history-content" };
const _hoisted_9$2 = ["title"];
const _hoisted_10$2 = { class: "history-meta" };
const _hoisted_11$2 = { class: "history-type-label" };
const _hoisted_12$2 = { class: "history-time" };
const _hoisted_13$2 = {
  key: 0,
  class: "favorite-badge"
};
const _hoisted_14$2 = { class: "history-actions" };
const _hoisted_15$2 = {
  key: 1,
  class: "history-group"
};
const _hoisted_16$2 = { class: "group-count" };
const _hoisted_17$2 = ["onClick"];
const _hoisted_18$2 = { class: "history-type" };
const _hoisted_19$1 = { class: "history-content" };
const _hoisted_20$1 = ["title"];
const _hoisted_21$1 = { class: "history-meta" };
const _hoisted_22$1 = { class: "history-type-label" };
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
const _hoisted_27 = { class: "group-count" };
const _hoisted_28 = ["onClick"];
const _hoisted_29 = { class: "history-type" };
const _hoisted_30 = { class: "history-content" };
const _hoisted_31 = ["title"];
const _hoisted_32 = { class: "history-meta" };
const _hoisted_33 = { class: "history-type-label" };
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
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "VoiceSidebar",
  props: {
    modelValue: {}
  },
  emits: ["update:modelValue", "select"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const loading = ref(false);
    const histories = ref([]);
    const favoriteOnly = ref(false);
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
    async function loadHistories() {
      try {
        loading.value = true;
        const response = await window.electronAPI.voice.history({
          page: 1,
          pageSize: 50,
          type: "tts",
          // 只加载 TTS 类型的历史记录
          favorite: favoriteOnly.value || void 0
        });
        if (response.success && response.data) {
          histories.value = response.data.list;
        }
      } finally {
        loading.value = false;
      }
    }
    function toggleGroup(group) {
      collapsedGroups[group] = !collapsedGroups[group];
    }
    function handleSelect(history) {
      selectedId.value = history.id;
      emit("select", history);
    }
    async function handleToggleFavoriteFilter() {
      favoriteOnly.value = !favoriteOnly.value;
      await loadHistories();
    }
    async function handleToggleFavorite(history) {
      const response = await window.electronAPI.voice.toggleFavorite(history.id);
      if (response.success) {
        await loadHistories();
        ElMessage.success(history.favorite ? "已取消收藏" : "已添加收藏");
      }
    }
    async function handleDelete(history) {
      try {
        await ElMessageBox.confirm(
          "确定要删除这条语音记录吗？",
          "确认删除",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const response = await window.electronAPI.voice.delete(history.id);
        if (response.success) {
          await loadHistories();
          ElMessage.success("删除成功");
          if (selectedId.value === history.id) {
            selectedId.value = "";
          }
        }
      } catch {
      }
    }
    async function handleDownload(history) {
      if (!history.outputAudioPath) {
        ElMessage.warning("没有可下载的音频文件");
        return;
      }
      const response = await window.electronAPI.voice.download(history.outputAudioPath);
      if (response.success && response.data) {
        ElMessage.success("下载成功");
      } else {
        ElMessage.error(response.error || "下载失败");
      }
    }
    function getPreviewText(history) {
      if (history.type === "tts" && history.inputText) {
        return history.inputText.length > 30 ? history.inputText.substring(0, 30) + "..." : history.inputText;
      }
      if (history.type === "stt" && history.outputText) {
        return history.outputText.length > 30 ? history.outputText.substring(0, 30) + "..." : history.outputText;
      }
      return "语音记录";
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
    onMounted(() => {
      loadHistories();
    });
    return (_ctx, _cache) => {
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tooltip = resolveComponent("el-tooltip");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_empty = resolveComponent("el-empty");
      const _directive_loading = resolveDirective("loading");
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          _cache[3] || (_cache[3] = createBaseVNode("h3", null, "语音历史", -1)),
          createVNode(_component_el_tooltip, {
            content: "仅显示收藏",
            placement: "bottom"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_button, {
                type: favoriteOnly.value ? "warning" : "default",
                icon: unref(star_default),
                circle: "",
                size: "small",
                onClick: handleToggleFavoriteFilter
              }, null, 8, ["type", "icon"])
            ]),
            _: 1
          })
        ]),
        withDirectives((openBlock(), createElementBlock("div", _hoisted_3$2, [
          histories.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            groupedHistories.value.today.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_4$2, [
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
                createBaseVNode("span", _hoisted_5$2, toDisplayString(groupedHistories.value.today.length), 1)
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
                    createBaseVNode("div", _hoisted_7$2, [
                      history.type === "tts" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          createVNode(unref(microphone_default))
                        ]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                        default: withCtx(() => [
                          createVNode(unref(headset_default))
                        ]),
                        _: 1
                      }))
                    ]),
                    createBaseVNode("div", _hoisted_8$2, [
                      createBaseVNode("div", {
                        class: "history-preview",
                        title: getPreviewText(history)
                      }, toDisplayString(getPreviewText(history)), 9, _hoisted_9$2),
                      createBaseVNode("div", _hoisted_10$2, [
                        createBaseVNode("span", _hoisted_11$2, toDisplayString(history.type === "tts" ? "文本转语音" : "语音转文本"), 1),
                        createBaseVNode("span", _hoisted_12$2, toDisplayString(formatTime(history.createdAt)), 1)
                      ])
                    ]),
                    history.favorite ? (openBlock(), createElementBlock("div", _hoisted_13$2, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(star_filled_default))
                        ]),
                        _: 1
                      })
                    ])) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_14$2, [
                      history.type === "tts" && history.outputAudioPath ? (openBlock(), createBlock(_component_el_button, {
                        key: 0,
                        type: "success",
                        icon: unref(download_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDownload(history), ["stop"])
                      }, null, 8, ["icon", "onClick"])) : createCommentVNode("", true),
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
                  ], 10, _hoisted_6$2);
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
                    createBaseVNode("div", _hoisted_18$2, [
                      history.type === "tts" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          createVNode(unref(microphone_default))
                        ]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                        default: withCtx(() => [
                          createVNode(unref(headset_default))
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
                        createBaseVNode("span", _hoisted_22$1, toDisplayString(history.type === "tts" ? "文本转语音" : "语音转文本"), 1),
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
                      history.type === "tts" && history.outputAudioPath ? (openBlock(), createBlock(_component_el_button, {
                        key: 0,
                        type: "success",
                        icon: unref(download_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDownload(history), ["stop"])
                      }, null, 8, ["icon", "onClick"])) : createCommentVNode("", true),
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
                createBaseVNode("span", _hoisted_27, toDisplayString(groupedHistories.value.earlier.length), 1)
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
                      history.type === "tts" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          createVNode(unref(microphone_default))
                        ]),
                        _: 1
                      })) : (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                        default: withCtx(() => [
                          createVNode(unref(headset_default))
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
                        createBaseVNode("span", _hoisted_33, toDisplayString(history.type === "tts" ? "文本转语音" : "语音转文本"), 1),
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
                      history.type === "tts" && history.outputAudioPath ? (openBlock(), createBlock(_component_el_button, {
                        key: 0,
                        type: "success",
                        icon: unref(download_default),
                        circle: "",
                        size: "small",
                        plain: "",
                        onClick: withModifiers(($event) => handleDownload(history), ["stop"])
                      }, null, 8, ["icon", "onClick"])) : createCommentVNode("", true),
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
            createVNode(_component_el_empty, { description: "暂无语音记录" }, {
              image: withCtx(() => [
                createVNode(_component_el_icon, { size: 48 }, {
                  default: withCtx(() => [
                    createVNode(unref(microphone_default))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]))
        ])), [
          [_directive_loading, loading.value]
        ])
      ]);
    };
  }
});
const VoiceSidebar = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-cdc9ef03"]]);
const _hoisted_1$1 = { class: "text-to-speech" };
const _hoisted_2$1 = { class: "top-section" };
const _hoisted_3$1 = { class: "tts-config" };
const _hoisted_4$1 = { class: "config-row" };
const _hoisted_5$1 = { class: "config-row" };
const _hoisted_6$1 = { class: "config-row params-row" };
const _hoisted_7$1 = { class: "param-item" };
const _hoisted_8$1 = { class: "param-item" };
const _hoisted_9$1 = { class: "param-item" };
const _hoisted_10$1 = { class: "text-input-section" };
const _hoisted_11$1 = { class: "input-header" };
const _hoisted_12$1 = { class: "action-bar" };
const _hoisted_13$1 = {
  key: 0,
  class: "output-section"
};
const _hoisted_14$1 = { class: "output-header" };
const _hoisted_15$1 = { class: "output-actions" };
const _hoisted_16$1 = { class: "audio-player" };
const _hoisted_17$1 = ["src"];
const _hoisted_18$1 = {
  key: 0,
  class: "audio-error"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "TextToSpeech",
  setup(__props) {
    const audioRef = ref(null);
    const audioError = ref(null);
    const modelSearchKeyword = ref("");
    const {
      // 状态
      ttsGenerating,
      voices,
      selectedProviderId,
      selectedModelId,
      selectedVoiceId,
      currentLanguage,
      speed,
      pitch,
      volume,
      inputText,
      outputAudioPath,
      // 计算属性
      providerModels,
      charCount,
      isOverLimit,
      // 方法
      generateSpeech,
      clearInput
    } = useVoice();
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
    const audioSrc = computed(() => {
      if (!outputAudioPath.value) return "";
      const normalizedPath = outputAudioPath.value.replace(/\\/g, "/");
      return "file:///" + normalizedPath;
    });
    function handleAudioError(e) {
      const audio = e.target;
      console.error("[TTS] 音频加载错误:", audio.error);
      if (audio.error) {
        switch (audio.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            audioError.value = "音频加载被中止";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            audioError.value = "网络错误，无法加载音频";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            audioError.value = "音频解码失败";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            audioError.value = "不支持的音频格式或路径无效";
            break;
          default:
            audioError.value = `音频加载失败 (错误码: ${audio.error.code})`;
        }
      }
    }
    function handleAudioLoaded() {
      audioError.value = null;
      console.log("[TTS] 音频加载成功");
    }
    async function handleGenerate() {
      const result = await generateSpeech();
      if (result) {
        ElMessage.success("语音生成成功");
      }
    }
    async function handleDownload() {
      if (!outputAudioPath.value) return;
      try {
        const response = await window.electronAPI.voice.download(outputAudioPath.value);
        if (response.success) {
          ElMessage.success("下载成功");
        } else {
          ElMessage.error(response.error || "下载失败");
        }
      } catch (error) {
        ElMessage.error("下载失败");
      }
    }
    async function handleOpenFolder() {
      if (outputAudioPath.value) {
        const response = await window.electronAPI.translation.openFolder(outputAudioPath.value);
        if (!response.success) {
          ElMessage.error(response.error || "打开文件夹失败");
        }
      }
    }
    return (_ctx, _cache) => {
      const _component_el_option = resolveComponent("el-option");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_slider = resolveComponent("el-slider");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_icon = resolveComponent("el-icon");
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("div", _hoisted_3$1, [
            createBaseVNode("div", _hoisted_4$1, [
              createVNode(_component_el_select, {
                modelValue: selectedModelKey.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedModelKey.value = $event),
                placeholder: "选择模型",
                style: { "width": "200px" },
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
              }, 8, ["modelValue"])
            ]),
            createBaseVNode("div", _hoisted_5$1, [
              createVNode(_component_el_select, {
                modelValue: unref(selectedVoiceId),
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => isRef(selectedVoiceId) ? selectedVoiceId.value = $event : null),
                placeholder: "选择发音人",
                style: { "width": "200px" }
              }, {
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(voices), (voice) => {
                    return openBlock(), createBlock(_component_el_option, {
                      key: voice.id,
                      label: voice.name,
                      value: voice.id
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"]),
              createVNode(_component_el_select, {
                modelValue: unref(currentLanguage),
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => isRef(currentLanguage) ? currentLanguage.value = $event : null),
                placeholder: "选择语言",
                style: { "width": "160px" }
              }, {
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(_ctx.VOICE_LANGUAGES, (lang) => {
                    return openBlock(), createBlock(_component_el_option, {
                      key: lang.code,
                      label: lang.name,
                      value: lang.code
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ]),
            createBaseVNode("div", _hoisted_6$1, [
              createBaseVNode("div", _hoisted_7$1, [
                _cache[7] || (_cache[7] = createBaseVNode("span", { class: "param-label" }, "语速", -1)),
                createVNode(_component_el_slider, {
                  modelValue: unref(speed),
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => isRef(speed) ? speed.value = $event : null),
                  min: 0.5,
                  max: 2,
                  step: 0.1,
                  "show-input": "",
                  style: { "width": "200px" }
                }, null, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_8$1, [
                _cache[8] || (_cache[8] = createBaseVNode("span", { class: "param-label" }, "音调", -1)),
                createVNode(_component_el_slider, {
                  modelValue: unref(pitch),
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => isRef(pitch) ? pitch.value = $event : null),
                  min: -12,
                  max: 12,
                  step: 1,
                  "show-input": "",
                  style: { "width": "200px" }
                }, null, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_9$1, [
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "param-label" }, "音量", -1)),
                createVNode(_component_el_slider, {
                  modelValue: unref(volume),
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => isRef(volume) ? volume.value = $event : null),
                  min: 0,
                  max: 100,
                  step: 5,
                  "show-input": "",
                  style: { "width": "200px" }
                }, null, 8, ["modelValue"])
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_10$1, [
            createBaseVNode("div", _hoisted_11$1, [
              _cache[10] || (_cache[10] = createBaseVNode("span", null, "输入文本", -1)),
              createBaseVNode("span", {
                class: normalizeClass(["char-count", { overlimit: unref(isOverLimit) }])
              }, toDisplayString(unref(charCount)) + " / 5000 ", 3)
            ]),
            createVNode(_component_el_input, {
              modelValue: unref(inputText),
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => isRef(inputText) ? inputText.value = $event : null),
              type: "textarea",
              rows: 6,
              placeholder: "请输入要转换为语音的文本...",
              resize: "none"
            }, null, 8, ["modelValue"])
          ]),
          createBaseVNode("div", _hoisted_12$1, [
            createVNode(_component_el_button, { onClick: unref(clearInput) }, {
              default: withCtx(() => [..._cache[11] || (_cache[11] = [
                createTextVNode("清空", -1)
              ])]),
              _: 1
            }, 8, ["onClick"]),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(ttsGenerating),
              disabled: !unref(inputText).trim() || unref(isOverLimit) || !unref(selectedVoiceId),
              onClick: handleGenerate
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(unref(ttsGenerating) ? "生成中..." : "生成语音"), 1)
              ]),
              _: 1
            }, 8, ["loading", "disabled"])
          ])
        ]),
        unref(outputAudioPath) ? (openBlock(), createElementBlock("div", _hoisted_13$1, [
          createBaseVNode("div", _hoisted_14$1, [
            _cache[14] || (_cache[14] = createBaseVNode("span", null, "生成结果", -1)),
            createBaseVNode("div", _hoisted_15$1, [
              createVNode(_component_el_button, {
                text: "",
                size: "small",
                onClick: handleDownload
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(download_default))
                    ]),
                    _: 1
                  }),
                  _cache[12] || (_cache[12] = createTextVNode(" 下载 ", -1))
                ]),
                _: 1
              }),
              createVNode(_component_el_button, {
                text: "",
                size: "small",
                onClick: handleOpenFolder
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(folder_opened_default))
                    ]),
                    _: 1
                  }),
                  _cache[13] || (_cache[13] = createTextVNode(" 打开文件夹 ", -1))
                ]),
                _: 1
              })
            ])
          ]),
          createBaseVNode("div", _hoisted_16$1, [
            createBaseVNode("audio", {
              ref_key: "audioRef",
              ref: audioRef,
              src: audioSrc.value,
              controls: "",
              style: { "width": "100%" },
              onError: handleAudioError,
              onLoadeddata: handleAudioLoaded
            }, null, 40, _hoisted_17$1),
            audioError.value ? (openBlock(), createElementBlock("div", _hoisted_18$1, toDisplayString(audioError.value), 1)) : createCommentVNode("", true)
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const TextToSpeech = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-1826a2c4"]]);
const _hoisted_1 = { class: "voice-page" };
const _hoisted_2 = { class: "page-main" };
const _hoisted_3 = {
  key: 0,
  class: "history-detail"
};
const _hoisted_4 = { class: "detail-section info-section" };
const _hoisted_5 = { class: "info-grid" };
const _hoisted_6 = { class: "info-item" };
const _hoisted_7 = { class: "info-item" };
const _hoisted_8 = { class: "value" };
const _hoisted_9 = { class: "info-item" };
const _hoisted_10 = { class: "value" };
const _hoisted_11 = {
  key: 0,
  class: "info-item"
};
const _hoisted_12 = { class: "value" };
const _hoisted_13 = {
  key: 0,
  class: "detail-section content-section"
};
const _hoisted_14 = { class: "content-panel" };
const _hoisted_15 = { class: "panel-content" };
const _hoisted_16 = {
  key: 0,
  class: "audio-section"
};
const _hoisted_17 = { class: "audio-player" };
const _hoisted_18 = ["src"];
const _hoisted_19 = {
  key: 1,
  class: "detail-section content-section"
};
const _hoisted_20 = {
  key: 0,
  class: "audio-section"
};
const _hoisted_21 = { class: "audio-player" };
const _hoisted_22 = ["src"];
const _hoisted_23 = { class: "content-panel" };
const _hoisted_24 = { class: "panel-header" };
const _hoisted_25 = { class: "panel-content" };
const _hoisted_26 = { class: "dialog-footer" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Voice",
  setup(__props) {
    const selectedHistoryId = ref("");
    const showHistoryDetail = ref(false);
    const historyDetail = ref(null);
    function handleSelectHistory(history) {
      historyDetail.value = history;
      showHistoryDetail.value = true;
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
    return (_ctx, _cache) => {
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(VoiceSidebar, {
          modelValue: selectedHistoryId.value,
          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedHistoryId.value = $event),
          class: "page-sidebar",
          onSelect: handleSelectHistory
        }, null, 8, ["modelValue"]),
        createBaseVNode("div", _hoisted_2, [
          createVNode(TextToSpeech)
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showHistoryDetail.value,
          "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => showHistoryDetail.value = $event),
          title: "语音详情",
          width: "600px",
          "destroy-on-close": "",
          "close-on-click-modal": false
        }, {
          footer: withCtx(() => [
            createBaseVNode("div", _hoisted_26, [
              createVNode(_component_el_button, {
                onClick: _cache[2] || (_cache[2] = ($event) => showHistoryDetail.value = false)
              }, {
                default: withCtx(() => [..._cache[13] || (_cache[13] = [
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
                    _cache[4] || (_cache[4] = createBaseVNode("span", { class: "label" }, "类型", -1)),
                    createVNode(_component_el_tag, {
                      type: historyDetail.value.type === "tts" ? "primary" : "success"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(historyDetail.value.type === "tts" ? "文本转语音" : "语音转文本"), 1)
                      ]),
                      _: 1
                    }, 8, ["type"])
                  ]),
                  createBaseVNode("div", _hoisted_7, [
                    _cache[5] || (_cache[5] = createBaseVNode("span", { class: "label" }, "语言", -1)),
                    createBaseVNode("span", _hoisted_8, toDisplayString(unref(getVoiceLanguageName)(historyDetail.value.language || "zh")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_9, [
                    _cache[6] || (_cache[6] = createBaseVNode("span", { class: "label" }, "时间", -1)),
                    createBaseVNode("span", _hoisted_10, toDisplayString(formatDateTime(historyDetail.value.createdAt)), 1)
                  ]),
                  historyDetail.value.duration ? (openBlock(), createElementBlock("div", _hoisted_11, [
                    _cache[7] || (_cache[7] = createBaseVNode("span", { class: "label" }, "时长", -1)),
                    createBaseVNode("span", _hoisted_12, toDisplayString((historyDetail.value.duration / 1e3).toFixed(1)) + " 秒", 1)
                  ])) : createCommentVNode("", true)
                ])
              ]),
              historyDetail.value.type === "tts" ? (openBlock(), createElementBlock("div", _hoisted_13, [
                createBaseVNode("div", _hoisted_14, [
                  _cache[8] || (_cache[8] = createBaseVNode("div", { class: "panel-header" }, [
                    createBaseVNode("span", null, "输入文本")
                  ], -1)),
                  createBaseVNode("div", _hoisted_15, toDisplayString(historyDetail.value.inputText), 1)
                ]),
                historyDetail.value.outputAudioPath ? (openBlock(), createElementBlock("div", _hoisted_16, [
                  _cache[9] || (_cache[9] = createBaseVNode("div", { class: "panel-header" }, [
                    createBaseVNode("span", null, "生成的音频")
                  ], -1)),
                  createBaseVNode("div", _hoisted_17, [
                    createBaseVNode("audio", {
                      src: "file:///" + historyDetail.value.outputAudioPath.replace(/\\/g, "/"),
                      controls: "",
                      style: { "width": "100%" }
                    }, null, 8, _hoisted_18)
                  ])
                ])) : createCommentVNode("", true)
              ])) : historyDetail.value.type === "stt" ? (openBlock(), createElementBlock("div", _hoisted_19, [
                historyDetail.value.inputAudioPath ? (openBlock(), createElementBlock("div", _hoisted_20, [
                  _cache[10] || (_cache[10] = createBaseVNode("div", { class: "panel-header" }, [
                    createBaseVNode("span", null, "输入音频")
                  ], -1)),
                  createBaseVNode("div", _hoisted_21, [
                    createBaseVNode("audio", {
                      src: "file:///" + historyDetail.value.inputAudioPath.replace(/\\/g, "/"),
                      controls: "",
                      style: { "width": "100%" }
                    }, null, 8, _hoisted_22)
                  ])
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_23, [
                  createBaseVNode("div", _hoisted_24, [
                    _cache[12] || (_cache[12] = createBaseVNode("span", null, "识别结果", -1)),
                    createVNode(_component_el_button, {
                      text: "",
                      size: "small",
                      onClick: _cache[1] || (_cache[1] = ($event) => handleCopyText(historyDetail.value.outputText))
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(copy_document_default))
                          ]),
                          _: 1
                        }),
                        _cache[11] || (_cache[11] = createTextVNode(" 复制 ", -1))
                      ]),
                      _: 1
                    })
                  ]),
                  createBaseVNode("div", _hoisted_25, toDisplayString(historyDetail.value.outputText), 1)
                ])
              ])) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const Voice = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-dab69aac"]]);
export {
  Voice as default
};
