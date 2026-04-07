import { bp as BaseTransition, bq as BaseTransitionPropsValidators, br as Comment, bs as DeprecationTypes, bt as EffectScope, bu as ErrorCodes, bv as ErrorTypeStrings, G as Fragment, bw as KeepAlive, bx as ReactiveEffect, by as Static, bz as Suspense, bA as Teleport, bB as Text, bC as TrackOpTypes, aP as Transition, bD as TransitionGroup, bE as TriggerOpTypes, bF as VueElement, bG as assertNumber, bH as callWithAsyncErrorHandling, bI as callWithErrorHandling, bJ as camelize, bK as capitalize, bL as cloneVNode, bM as compatUtils, h as computed, bN as createApp, c as createBlock, Y as createCommentVNode, C as createElementBlock, D as createBaseVNode, bO as createHydrationRenderer, bP as createPropsRestProxy, bQ as createRenderer, bR as createSSRApp, bS as createSlots, F as createStaticVNode, e as createTextVNode, b as createVNode, bT as customRef, bU as defineAsyncComponent, d as defineComponent, bV as defineCustomElement, bW as defineEmits, bX as defineExpose, bY as defineModel, bZ as defineOptions, b_ as defineProps, b$ as defineSSRCustomElement, c0 as defineSlots, c1 as devtools, c2 as effect, c3 as effectScope, c4 as getCurrentInstance, c5 as getCurrentScope, c6 as getCurrentWatcher, c7 as getTransitionRawChildren, c8 as guardReactiveProps, c9 as h, ca as handleError, cb as hasInjectionContext, cc as hydrate, cd as hydrateOnIdle, ce as hydrateOnInteraction, cf as hydrateOnMediaQuery, cg as hydrateOnVisible, ch as initCustomFormatter, ci as initDirectivesForSSR, cj as inject, ck as isMemoSame, cl as isProxy, cm as isReactive, cn as isReadonly, ai as isRef, co as isRuntimeOnly, cp as isShallow, cq as isVNode, t as markRaw, cr as mergeDefaults, cs as mergeModels, ct as mergeProps, cu as nextTick, cv as nodeOps, J as normalizeClass, cw as normalizeProps, at as normalizeStyle, cx as onActivated, cy as onBeforeMount, cz as onBeforeUnmount, cA as onBeforeUpdate, cB as onDeactivated, cC as onErrorCaptured, O as onMounted, cD as onRenderTracked, cE as onRenderTriggered, cF as onScopeDispose, cG as onServerPrefetch, ap as onUnmounted, cH as onUpdated, cI as onWatcherCleanup, o as openBlock, cJ as patchProp, cK as popScopeId, b9 as provide, cL as proxyRefs, cM as pushScopeId, cN as queuePostFlushCb, R as reactive, cO as readonly, r as ref, cP as registerRuntimeCompiler, cQ as render, H as renderList, cR as renderSlot, f as resolveComponent, ak as resolveDirective, K as resolveDynamicComponent, cS as resolveFilter, cT as resolveTransitionHooks, cU as setBlockTracking, cV as setDevtoolsHook, cW as setTransitionHooks, cX as shallowReactive, cY as shallowReadonly, cZ as shallowRef, c_ as ssrContextKey, c$ as ssrUtils, d0 as stop, L as toDisplayString, d1 as toHandlerKey, d2 as toHandlers, ab as toRaw, d3 as toRef, d4 as toRefs, d5 as toValue, d6 as transformVNodeArgs, d7 as triggerRef, M as unref, d8 as useAttrs, d9 as useCssModule, da as useCssVars, db as useHost, dc as useId, dd as useModel, de as useSSRContext, df as useShadowRoot, dg as useSlots, dh as useTemplateRef, di as useTransitionState, dj as vModelCheckbox, dk as vModelDynamic, dl as vModelRadio, dm as vModelSelect, as as vModelText, aK as vShow, dn as version$1, dp as warn, w as watch, dq as watchEffect, dr as watchPostEffect, ds as watchSyncEffect, dt as withAsyncContext, a as withCtx, du as withDefaults, ah as withDirectives, aj as withKeys, dv as withMemo, T as withModifiers, dw as withScopeId, A as magic_stick_default, b2 as close_default, E as ElMessage, _ as _export_sfc, dx as getAugmentedNamespace, a6 as getDefaultExportFromCjs, a5 as commonjsGlobal, dy as rank_default, ao as edit_default, U as delete_default, y as document_default, P as plus_default, V as ElMessageBox, aQ as check_default, x as picture_default, I as useRouter, bj as user_default, dz as connection_default, N as arrow_right_default, ar as arrow_down_default, aq as download_default, dA as fold_default, X as arrow_left_default, b6 as clock_default, b7 as document_checked_default, dB as collection_default, b4 as view_default, $ as info_filled_default, ad as loading_default, aL as refresh_default, b8 as refresh_left_default, W as useTabsStore, B as setting_default, a0 as useRoute } from "./index-CEiunyEa.js";
import { _ as _sfc_main$9 } from "./CreateCharacterDialog.vue_vue_type_script_setup_true_lang-DCnQRx6s.js";
import { _ as _sfc_main$a } from "./MarkdownEditor.vue_vue_type_style_index_0_lang-Dkwf67xc.js";
import { g } from "./marked.esm-zOC1-fXp.js";
/**
* vue v3.5.29
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const compile = () => {
};
const vue_runtime_esmBundler = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BaseTransition,
  BaseTransitionPropsValidators,
  Comment,
  DeprecationTypes,
  EffectScope,
  ErrorCodes,
  ErrorTypeStrings,
  Fragment,
  KeepAlive,
  ReactiveEffect,
  Static,
  Suspense,
  Teleport,
  Text,
  TrackOpTypes,
  Transition,
  TransitionGroup,
  TriggerOpTypes,
  VueElement,
  assertNumber,
  callWithAsyncErrorHandling,
  callWithErrorHandling,
  camelize,
  capitalize,
  cloneVNode,
  compatUtils,
  compile,
  computed,
  createApp,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode: createBaseVNode,
  createHydrationRenderer,
  createPropsRestProxy,
  createRenderer,
  createSSRApp,
  createSlots,
  createStaticVNode,
  createTextVNode,
  createVNode,
  customRef,
  defineAsyncComponent,
  defineComponent,
  defineCustomElement,
  defineEmits,
  defineExpose,
  defineModel,
  defineOptions,
  defineProps,
  defineSSRCustomElement,
  defineSlots,
  devtools,
  effect,
  effectScope,
  getCurrentInstance,
  getCurrentScope,
  getCurrentWatcher,
  getTransitionRawChildren,
  guardReactiveProps,
  h,
  handleError,
  hasInjectionContext,
  hydrate,
  hydrateOnIdle,
  hydrateOnInteraction,
  hydrateOnMediaQuery,
  hydrateOnVisible,
  initCustomFormatter,
  initDirectivesForSSR,
  inject,
  isMemoSame,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  isRuntimeOnly,
  isShallow,
  isVNode,
  markRaw,
  mergeDefaults,
  mergeModels,
  mergeProps,
  nextTick,
  nodeOps,
  normalizeClass,
  normalizeProps,
  normalizeStyle,
  onActivated,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMounted,
  onRenderTracked,
  onRenderTriggered,
  onScopeDispose,
  onServerPrefetch,
  onUnmounted,
  onUpdated,
  onWatcherCleanup,
  openBlock,
  patchProp,
  popScopeId,
  provide,
  proxyRefs,
  pushScopeId,
  queuePostFlushCb,
  reactive,
  readonly,
  ref,
  registerRuntimeCompiler,
  render,
  renderList,
  renderSlot,
  resolveComponent,
  resolveDirective,
  resolveDynamicComponent,
  resolveFilter,
  resolveTransitionHooks,
  setBlockTracking,
  setDevtoolsHook,
  setTransitionHooks,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  ssrContextKey,
  ssrUtils,
  stop,
  toDisplayString,
  toHandlerKey,
  toHandlers,
  toRaw,
  toRef,
  toRefs,
  toValue,
  transformVNodeArgs,
  triggerRef,
  unref,
  useAttrs,
  useCssModule,
  useCssVars,
  useHost,
  useId,
  useModel,
  useSSRContext,
  useShadowRoot,
  useSlots,
  useTemplateRef,
  useTransitionState,
  vModelCheckbox,
  vModelDynamic,
  vModelRadio,
  vModelSelect,
  vModelText,
  vShow,
  version: version$1,
  warn,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  withAsyncContext,
  withCtx,
  withDefaults,
  withDirectives,
  withKeys,
  withMemo,
  withModifiers,
  withScopeId
}, Symbol.toStringTag, { value: "Module" }));
const _hoisted_1$8 = { class: "overview-stage" };
const _hoisted_2$8 = { class: "stage-content" };
const _hoisted_3$8 = { class: "action-buttons" };
const _hoisted_4$8 = {
  key: 0,
  class: "generating-progress"
};
const _hoisted_5$8 = {
  key: 1,
  class: "generated-result"
};
const _hoisted_6$8 = { class: "result-content" };
const _hoisted_7$8 = { class: "title-suggestions" };
const _hoisted_8$8 = { class: "result-actions" };
const _sfc_main$8 = /* @__PURE__ */ defineComponent({
  __name: "OverviewStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const selectedModelKey = inject("selectedModelKey", ref(""));
    inject("selectedModel", computed(() => null));
    const dictionary = ref({
      story_type: [],
      style: [],
      target_reader: [],
      estimated_length: []
    });
    const storyTypes = computed(() => {
      if (!dictionary.value.story_type?.length) {
        return [
          { label: "武侠", value: "wuxia" },
          { label: "仙侠", value: "xianxia" },
          { label: "玄幻", value: "xuanhuan" },
          { label: "科幻", value: "kehuan" },
          { label: "悬疑", value: "xuanyi" },
          { label: "都市", value: "dushi" },
          { label: "言情", value: "yanqing" },
          { label: "历史", value: "lishi" },
          { label: "其他", value: "other" }
        ];
      }
      return dictionary.value.story_type.map((item) => ({
        label: item.name,
        value: item.code
      }));
    });
    const styleOptions = computed(() => {
      if (!dictionary.value.style?.length) {
        return [
          { label: "轻松幽默", value: "light" },
          { label: "沉重深刻", value: "heavy" },
          { label: "热血激昂", value: "passionate" },
          { label: "冷峻沉稳", value: "calm" },
          { label: "通俗易懂", value: "popular" },
          { label: "文学性强", value: "literary" }
        ];
      }
      return dictionary.value.style.map((item) => ({
        label: item.name,
        value: item.code
      }));
    });
    const targetReaderOptions = computed(() => {
      if (!dictionary.value.target_reader?.length) {
        return [
          { label: "青少年", value: "teenager" },
          { label: "青年", value: "youth" },
          { label: "中年", value: "middle" },
          { label: "全年龄", value: "all" }
        ];
      }
      return dictionary.value.target_reader.map((item) => ({
        label: item.name,
        value: item.code
      }));
    });
    const estimatedLengthOptions = computed(() => {
      if (!dictionary.value.estimated_length?.length) {
        return [
          { label: "短篇小说（5万字以下）", value: "short" },
          { label: "中篇小说（5-20万字）", value: "medium" },
          { label: "长篇小说（20万字以上）", value: "long" }
        ];
      }
      return dictionary.value.estimated_length.map((item) => ({
        label: item.name,
        value: item.code
      }));
    });
    const form = ref({
      storyType: "other",
      title: "",
      coreIdea: "",
      style: "",
      targetReader: "",
      estimatedLength: "",
      otherRequirements: ""
    });
    const generating = ref(false);
    const currentEventId = ref(null);
    const generatingContent = ref("");
    const generatedOverview = ref(null);
    async function generateOverview() {
      if (!form.value.coreIdea.trim()) {
        ElMessage.warning("请输入核心构思");
        return;
      }
      if (!selectedModelKey.value || !selectedModelKey.value.includes(":")) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      const [providerConfigId, modelId] = selectedModelKey.value.split(":");
      if (!providerConfigId || !modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      console.log("[OverviewStage] 生成概要, providerConfigId:", providerConfigId, "modelId:", modelId);
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `overview-${props.projectId}-${Date.now()}`;
      console.log(`[OverviewStage] 开始生成, eventId: ${currentEventId.value}`);
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          console.log(`[OverviewStage] 收到事件:`, event.type, event.content?.length || 0);
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            console.log(`[OverviewStage] 生成完成, 内容长度: ${generatingContent.value.length}`);
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parseOverviewResult(generatingContent.value);
          } else if (event.type === "error") {
            console.error(`[OverviewStage] 生成错误:`, event.error);
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const input = `故事类型：${getStoryTypeLabel(form.value.storyType)}
核心构思：${form.value.coreIdea}
${form.value.style ? `风格：${form.value.style}` : ""}
${form.value.targetReader ? `目标读者：${form.value.targetReader}` : ""}
${form.value.estimatedLength ? `预估篇幅：${form.value.estimatedLength}` : ""}
${form.value.otherRequirements ? `其他要求：${form.value.otherRequirements}` : ""}`;
      const result = await window.electronAPI.longwriting.generateStoryOverview(
        currentEventId.value,
        props.projectId,
        input,
        providerConfigId,
        modelId
      );
      console.log(`[OverviewStage] API 返回:`, result);
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    function parseOverviewResult(content) {
      console.log(`[OverviewStage] 解析内容:`, content.substring(0, 500));
      try {
        let jsonStr = content;
        if (jsonStr.includes("```json")) {
          jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        } else if (jsonStr.includes("```")) {
          jsonStr = jsonStr.replace(/```\s*/g, "");
        }
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        let cleanJson = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, "").replace(/\n/g, " ");
        const data = JSON.parse(cleanJson);
        const titles = data.title ? [data.title, `${data.title}传`, `${data.title}录`] : ["《未命名故事》"];
        generatedOverview.value = {
          titleSuggestions: titles,
          selectedTitle: data.title || "",
          summary: data.summary || "",
          coreConflict: data.coreConflict || "",
          estimatedChapters: data.estimatedChapters || 100
        };
        if (data.title) {
          form.value.title = data.title;
        }
        if (data.storyType) {
          form.value.storyType = data.storyType;
        }
        emit("update:progress", 15);
      } catch (error) {
        console.error("解析 AI 响应失败:", error);
        if (content.length > 50) {
          generatedOverview.value = {
            titleSuggestions: ["《未命名故事》"],
            selectedTitle: "",
            summary: content.substring(0, 500),
            coreConflict: "",
            estimatedChapters: 100
          };
          ElMessage.warning("AI 返回格式不标准，已显示原始内容");
        } else {
          ElMessage.error("解析 AI 响应失败");
        }
      }
    }
    function getStoryTypeLabel(value) {
      const type = storyTypes.find((t) => t.value === value);
      return type?.label || value;
    }
    function cancelGeneration() {
      if (!currentEventId.value) return;
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    function selectTitle(title) {
      if (generatedOverview.value) {
        generatedOverview.value.selectedTitle = title;
      }
      form.value.title = title;
    }
    function regenerate() {
      generatedOverview.value = null;
    }
    async function confirmOverview() {
      if (!generatedOverview.value) return;
      const finalTitle = generatedOverview.value.selectedTitle || generatedOverview.value.titleSuggestions[0]?.replace(/[《》]/g, "") || "未命名故事";
      const rawForm = toRaw(form.value);
      const rawOverview = toRaw(generatedOverview.value);
      const overviewData = {
        title: finalTitle,
        storyType: rawForm.storyType,
        coreIdea: rawForm.coreIdea,
        style: rawForm.style || void 0,
        targetReader: rawForm.targetReader || void 0,
        estimatedLength: rawForm.estimatedLength || void 0,
        otherRequirements: rawForm.otherRequirements || void 0,
        summary: rawOverview.summary,
        coreConflict: rawOverview.coreConflict,
        estimatedChapters: rawOverview.estimatedChapters
      };
      const result = await window.electronAPI.longwriting.updateStoryOverview(props.projectId, overviewData);
      if (result.success) {
        ElMessage.success("故事概要已保存");
        emit("update:progress", 20);
      } else {
        ElMessage.error(result.error || "保存失败");
      }
    }
    async function loadSavedOverview() {
      try {
        const result = await window.electronAPI.longwriting.getStoryOverview(props.projectId);
        if (result.success && result.data) {
          const data = result.data;
          form.value.title = data.title || "";
          form.value.storyType = data.storyType || "other";
          form.value.coreIdea = data.coreIdea || "";
          form.value.style = data.style || "";
          form.value.targetReader = data.targetReader || "";
          form.value.estimatedLength = data.estimatedLength || "";
          form.value.otherRequirements = data.otherRequirements || "";
          generatedOverview.value = {
            titleSuggestions: data.title ? [data.title] : [],
            selectedTitle: data.title || "",
            summary: data.summary || "",
            coreConflict: data.coreConflict || "",
            estimatedChapters: data.estimatedChapters || 100
          };
        }
      } catch (error) {
        console.error("加载故事概要失败:", error);
      }
    }
    async function loadDictionary() {
      try {
        const result = await window.electronAPI.longwriting.getDictionaryAll();
        if (result.success && result.data) {
          dictionary.value = result.data;
        }
      } catch (error) {
        console.error("加载字典失败:", error);
      }
    }
    onMounted(() => {
      loadDictionary();
      loadSavedOverview();
    });
    return (_ctx, _cache) => {
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_divider = resolveComponent("el-divider");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_input_number = resolveComponent("el-input-number");
      return openBlock(), createElementBlock("div", _hoisted_1$8, [
        _cache[17] || (_cache[17] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "故事概要设计"),
          createBaseVNode("p", { class: "stage-desc" }, "输入核心故事构思，AI 将帮你生成完整的故事概要")
        ], -1)),
        createBaseVNode("div", _hoisted_2$8, [
          createVNode(_component_el_form, {
            model: form.value,
            "label-width": "100px",
            class: "overview-form"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_form_item, { label: "故事类型" }, {
                default: withCtx(() => [
                  createVNode(_component_el_select, {
                    modelValue: form.value.storyType,
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.storyType = $event),
                    placeholder: "选择故事类型"
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(storyTypes.value, (type) => {
                        return openBlock(), createBlock(_component_el_option, {
                          key: type.value,
                          label: type.label,
                          value: type.value
                        }, null, 8, ["label", "value"]);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, { label: "故事标题" }, {
                default: withCtx(() => [
                  createVNode(_component_el_input, {
                    modelValue: form.value.title,
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.title = $event),
                    placeholder: "AI 将根据内容生成标题建议，你也可以自行输入"
                  }, null, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, {
                label: "核心构思",
                required: ""
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_input, {
                    modelValue: form.value.coreIdea,
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.coreIdea = $event),
                    type: "textarea",
                    rows: 4,
                    placeholder: "描述你的故事核心构想，例如：一个普通少年意外获得神秘力量，在修仙世界中逆天改命的故事...",
                    maxlength: "2000",
                    "show-word-limit": ""
                  }, null, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, { label: "故事风格" }, {
                default: withCtx(() => [
                  createVNode(_component_el_select, {
                    modelValue: form.value.style,
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.style = $event),
                    placeholder: "选择故事风格（可选）",
                    clearable: ""
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(styleOptions.value, (opt) => {
                        return openBlock(), createBlock(_component_el_option, {
                          key: opt.value,
                          label: opt.label,
                          value: opt.value
                        }, null, 8, ["label", "value"]);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, { label: "目标读者" }, {
                default: withCtx(() => [
                  createVNode(_component_el_select, {
                    modelValue: form.value.targetReader,
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.targetReader = $event),
                    placeholder: "选择目标读者群体（可选）",
                    clearable: ""
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(targetReaderOptions.value, (opt) => {
                        return openBlock(), createBlock(_component_el_option, {
                          key: opt.value,
                          label: opt.label,
                          value: opt.value
                        }, null, 8, ["label", "value"]);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, { label: "预估字数" }, {
                default: withCtx(() => [
                  createVNode(_component_el_select, {
                    modelValue: form.value.estimatedLength,
                    "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.estimatedLength = $event),
                    placeholder: "选择预估篇幅（可选）",
                    clearable: ""
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(estimatedLengthOptions.value, (opt) => {
                        return openBlock(), createBlock(_component_el_option, {
                          key: opt.value,
                          label: opt.label,
                          value: opt.value
                        }, null, 8, ["label", "value"]);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, { label: "其他要求" }, {
                default: withCtx(() => [
                  createVNode(_component_el_input, {
                    modelValue: form.value.otherRequirements,
                    "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.otherRequirements = $event),
                    type: "textarea",
                    rows: 2,
                    placeholder: "其他特殊要求或限制（可选）"
                  }, null, 8, ["modelValue"])
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["model"]),
          createBaseVNode("div", _hoisted_3$8, [
            !generating.value ? (openBlock(), createBlock(_component_el_button, {
              key: 0,
              type: "primary",
              size: "large",
              onClick: generateOverview
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(magic_stick_default))
                  ]),
                  _: 1
                }),
                _cache[11] || (_cache[11] = createTextVNode(" 生成概要 ", -1))
              ]),
              _: 1
            })) : (openBlock(), createBlock(_component_el_button, {
              key: 1,
              type: "danger",
              size: "large",
              onClick: cancelGeneration
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(close_default))
                  ]),
                  _: 1
                }),
                _cache[12] || (_cache[12] = createTextVNode(" 取消生成 ", -1))
              ]),
              _: 1
            }))
          ]),
          generating.value ? (openBlock(), createElementBlock("div", _hoisted_4$8, [
            createVNode(_component_el_progress, {
              percentage: 100,
              indeterminate: true
            }),
            _cache[13] || (_cache[13] = createBaseVNode("p", { class: "progress-text" }, "AI 正在生成故事概要...", -1))
          ])) : createCommentVNode("", true),
          generatedOverview.value ? (openBlock(), createElementBlock("div", _hoisted_5$8, [
            createVNode(_component_el_divider, null, {
              default: withCtx(() => [..._cache[14] || (_cache[14] = [
                createTextVNode("生成结果（可编辑）", -1)
              ])]),
              _: 1
            }),
            createBaseVNode("div", _hoisted_6$8, [
              createVNode(_component_el_form, {
                model: generatedOverview.value,
                "label-width": "100px"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_form_item, { label: "故事标题" }, {
                    default: withCtx(() => [
                      createBaseVNode("div", _hoisted_7$8, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(generatedOverview.value.titleSuggestions, (title, index2) => {
                          return openBlock(), createBlock(_component_el_tag, {
                            key: index2,
                            type: generatedOverview.value.selectedTitle === title ? "primary" : "default",
                            class: "title-tag",
                            onClick: ($event) => selectTitle(title)
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(title), 1)
                            ]),
                            _: 2
                          }, 1032, ["type", "onClick"]);
                        }), 128))
                      ]),
                      createVNode(_component_el_input, {
                        modelValue: generatedOverview.value.selectedTitle,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => generatedOverview.value.selectedTitle = $event),
                        placeholder: "或直接输入标题",
                        style: { "margin-top": "8px" }
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, { label: "故事概要" }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: generatedOverview.value.summary,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => generatedOverview.value.summary = $event),
                        type: "textarea",
                        rows: 4
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, { label: "核心冲突" }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: generatedOverview.value.coreConflict,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => generatedOverview.value.coreConflict = $event),
                        type: "textarea",
                        rows: 2
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, { label: "预估章节" }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input_number, {
                        modelValue: generatedOverview.value.estimatedChapters,
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => generatedOverview.value.estimatedChapters = $event),
                        min: 1,
                        max: 1e3
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["model"]),
              createBaseVNode("div", _hoisted_8$8, [
                createVNode(_component_el_button, { onClick: regenerate }, {
                  default: withCtx(() => [..._cache[15] || (_cache[15] = [
                    createTextVNode("重新生成", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: confirmOverview
                }, {
                  default: withCtx(() => [..._cache[16] || (_cache[16] = [
                    createTextVNode("确认概要", -1)
                  ])]),
                  _: 1
                })
              ])
            ])
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
});
const OverviewStage = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["__scopeId", "data-v-d8c99785"]]);
var vuedraggable_umd = { exports: {} };
const require$$0 = /* @__PURE__ */ getAugmentedNamespace(vue_runtime_esmBundler);
/**!
 * Sortable 1.14.0
 * @author	RubaXa   <trash@rubaxa.org>
 * @author	owenm    <owen23355@gmail.com>
 * @license MIT
 */
function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    if (enumerableOnly) {
      symbols = symbols.filter(function(sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
    }
    keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    if (i % 2) {
      ownKeys(Object(source), true).forEach(function(key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(Object(source)).forEach(function(key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
  }
  return target;
}
function _typeof(obj) {
  "@babel/helpers - typeof";
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function(obj2) {
      return typeof obj2;
    };
  } else {
    _typeof = function(obj2) {
      return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
    };
  }
  return _typeof(obj);
}
function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _extends() {
  _extends = Object.assign || function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;
  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }
  return target;
}
function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};
  var target = _objectWithoutPropertiesLoose(source, excluded);
  var key, i;
  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }
  return target;
}
function _toConsumableArray(arr) {
  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
}
function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
}
function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
var version = "1.14.0";
function userAgent(pattern) {
  if (typeof window !== "undefined" && window.navigator) {
    return !!/* @__PURE__ */ navigator.userAgent.match(pattern);
  }
}
var IE11OrLess = userAgent(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i);
var Edge = userAgent(/Edge/i);
var FireFox = userAgent(/firefox/i);
var Safari = userAgent(/safari/i) && !userAgent(/chrome/i) && !userAgent(/android/i);
var IOS = userAgent(/iP(ad|od|hone)/i);
var ChromeForAndroid = userAgent(/chrome/i) && userAgent(/android/i);
var captureMode = {
  capture: false,
  passive: false
};
function on(el, event, fn) {
  el.addEventListener(event, fn, !IE11OrLess && captureMode);
}
function off(el, event, fn) {
  el.removeEventListener(event, fn, !IE11OrLess && captureMode);
}
function matches(el, selector) {
  if (!selector) return;
  selector[0] === ">" && (selector = selector.substring(1));
  if (el) {
    try {
      if (el.matches) {
        return el.matches(selector);
      } else if (el.msMatchesSelector) {
        return el.msMatchesSelector(selector);
      } else if (el.webkitMatchesSelector) {
        return el.webkitMatchesSelector(selector);
      }
    } catch (_) {
      return false;
    }
  }
  return false;
}
function getParentOrHost(el) {
  return el.host && el !== document && el.host.nodeType ? el.host : el.parentNode;
}
function closest(el, selector, ctx, includeCTX) {
  if (el) {
    ctx = ctx || document;
    do {
      if (selector != null && (selector[0] === ">" ? el.parentNode === ctx && matches(el, selector) : matches(el, selector)) || includeCTX && el === ctx) {
        return el;
      }
      if (el === ctx) break;
    } while (el = getParentOrHost(el));
  }
  return null;
}
var R_SPACE = /\s+/g;
function toggleClass(el, name, state) {
  if (el && name) {
    if (el.classList) {
      el.classList[state ? "add" : "remove"](name);
    } else {
      var className = (" " + el.className + " ").replace(R_SPACE, " ").replace(" " + name + " ", " ");
      el.className = (className + (state ? " " + name : "")).replace(R_SPACE, " ");
    }
  }
}
function css(el, prop, val) {
  var style = el && el.style;
  if (style) {
    if (val === void 0) {
      if (document.defaultView && document.defaultView.getComputedStyle) {
        val = document.defaultView.getComputedStyle(el, "");
      } else if (el.currentStyle) {
        val = el.currentStyle;
      }
      return prop === void 0 ? val : val[prop];
    } else {
      if (!(prop in style) && prop.indexOf("webkit") === -1) {
        prop = "-webkit-" + prop;
      }
      style[prop] = val + (typeof val === "string" ? "" : "px");
    }
  }
}
function matrix(el, selfOnly) {
  var appliedTransforms = "";
  if (typeof el === "string") {
    appliedTransforms = el;
  } else {
    do {
      var transform = css(el, "transform");
      if (transform && transform !== "none") {
        appliedTransforms = transform + " " + appliedTransforms;
      }
    } while (!selfOnly && (el = el.parentNode));
  }
  var matrixFn = window.DOMMatrix || window.WebKitCSSMatrix || window.CSSMatrix || window.MSCSSMatrix;
  return matrixFn && new matrixFn(appliedTransforms);
}
function find(ctx, tagName, iterator) {
  if (ctx) {
    var list = ctx.getElementsByTagName(tagName), i = 0, n = list.length;
    if (iterator) {
      for (; i < n; i++) {
        iterator(list[i], i);
      }
    }
    return list;
  }
  return [];
}
function getWindowScrollingElement() {
  var scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    return scrollingElement;
  } else {
    return document.documentElement;
  }
}
function getRect(el, relativeToContainingBlock, relativeToNonStaticParent, undoScale, container) {
  if (!el.getBoundingClientRect && el !== window) return;
  var elRect, top, left, bottom, right, height, width;
  if (el !== window && el.parentNode && el !== getWindowScrollingElement()) {
    elRect = el.getBoundingClientRect();
    top = elRect.top;
    left = elRect.left;
    bottom = elRect.bottom;
    right = elRect.right;
    height = elRect.height;
    width = elRect.width;
  } else {
    top = 0;
    left = 0;
    bottom = window.innerHeight;
    right = window.innerWidth;
    height = window.innerHeight;
    width = window.innerWidth;
  }
  if ((relativeToContainingBlock || relativeToNonStaticParent) && el !== window) {
    container = container || el.parentNode;
    if (!IE11OrLess) {
      do {
        if (container && container.getBoundingClientRect && (css(container, "transform") !== "none" || relativeToNonStaticParent && css(container, "position") !== "static")) {
          var containerRect = container.getBoundingClientRect();
          top -= containerRect.top + parseInt(css(container, "border-top-width"));
          left -= containerRect.left + parseInt(css(container, "border-left-width"));
          bottom = top + elRect.height;
          right = left + elRect.width;
          break;
        }
      } while (container = container.parentNode);
    }
  }
  if (undoScale && el !== window) {
    var elMatrix = matrix(container || el), scaleX = elMatrix && elMatrix.a, scaleY = elMatrix && elMatrix.d;
    if (elMatrix) {
      top /= scaleY;
      left /= scaleX;
      width /= scaleX;
      height /= scaleY;
      bottom = top + height;
      right = left + width;
    }
  }
  return {
    top,
    left,
    bottom,
    right,
    width,
    height
  };
}
function isScrolledPast(el, elSide, parentSide) {
  var parent = getParentAutoScrollElement(el, true), elSideVal = getRect(el)[elSide];
  while (parent) {
    var parentSideVal = getRect(parent)[parentSide], visible = void 0;
    {
      visible = elSideVal >= parentSideVal;
    }
    if (!visible) return parent;
    if (parent === getWindowScrollingElement()) break;
    parent = getParentAutoScrollElement(parent, false);
  }
  return false;
}
function getChild(el, childNum, options, includeDragEl) {
  var currentChild = 0, i = 0, children = el.children;
  while (i < children.length) {
    if (children[i].style.display !== "none" && children[i] !== Sortable.ghost && (includeDragEl || children[i] !== Sortable.dragged) && closest(children[i], options.draggable, el, false)) {
      if (currentChild === childNum) {
        return children[i];
      }
      currentChild++;
    }
    i++;
  }
  return null;
}
function lastChild(el, selector) {
  var last = el.lastElementChild;
  while (last && (last === Sortable.ghost || css(last, "display") === "none" || selector && !matches(last, selector))) {
    last = last.previousElementSibling;
  }
  return last || null;
}
function index(el, selector) {
  var index2 = 0;
  if (!el || !el.parentNode) {
    return -1;
  }
  while (el = el.previousElementSibling) {
    if (el.nodeName.toUpperCase() !== "TEMPLATE" && el !== Sortable.clone && (!selector || matches(el, selector))) {
      index2++;
    }
  }
  return index2;
}
function getRelativeScrollOffset(el) {
  var offsetLeft = 0, offsetTop = 0, winScroller = getWindowScrollingElement();
  if (el) {
    do {
      var elMatrix = matrix(el), scaleX = elMatrix.a, scaleY = elMatrix.d;
      offsetLeft += el.scrollLeft * scaleX;
      offsetTop += el.scrollTop * scaleY;
    } while (el !== winScroller && (el = el.parentNode));
  }
  return [offsetLeft, offsetTop];
}
function indexOfObject(arr, obj) {
  for (var i in arr) {
    if (!arr.hasOwnProperty(i)) continue;
    for (var key in obj) {
      if (obj.hasOwnProperty(key) && obj[key] === arr[i][key]) return Number(i);
    }
  }
  return -1;
}
function getParentAutoScrollElement(el, includeSelf) {
  if (!el || !el.getBoundingClientRect) return getWindowScrollingElement();
  var elem = el;
  var gotSelf = false;
  do {
    if (elem.clientWidth < elem.scrollWidth || elem.clientHeight < elem.scrollHeight) {
      var elemCSS = css(elem);
      if (elem.clientWidth < elem.scrollWidth && (elemCSS.overflowX == "auto" || elemCSS.overflowX == "scroll") || elem.clientHeight < elem.scrollHeight && (elemCSS.overflowY == "auto" || elemCSS.overflowY == "scroll")) {
        if (!elem.getBoundingClientRect || elem === document.body) return getWindowScrollingElement();
        if (gotSelf || includeSelf) return elem;
        gotSelf = true;
      }
    }
  } while (elem = elem.parentNode);
  return getWindowScrollingElement();
}
function extend(dst, src) {
  if (dst && src) {
    for (var key in src) {
      if (src.hasOwnProperty(key)) {
        dst[key] = src[key];
      }
    }
  }
  return dst;
}
function isRectEqual(rect1, rect2) {
  return Math.round(rect1.top) === Math.round(rect2.top) && Math.round(rect1.left) === Math.round(rect2.left) && Math.round(rect1.height) === Math.round(rect2.height) && Math.round(rect1.width) === Math.round(rect2.width);
}
var _throttleTimeout;
function throttle(callback, ms) {
  return function() {
    if (!_throttleTimeout) {
      var args = arguments, _this = this;
      if (args.length === 1) {
        callback.call(_this, args[0]);
      } else {
        callback.apply(_this, args);
      }
      _throttleTimeout = setTimeout(function() {
        _throttleTimeout = void 0;
      }, ms);
    }
  };
}
function cancelThrottle() {
  clearTimeout(_throttleTimeout);
  _throttleTimeout = void 0;
}
function scrollBy(el, x, y) {
  el.scrollLeft += x;
  el.scrollTop += y;
}
function clone(el) {
  var Polymer = window.Polymer;
  var $ = window.jQuery || window.Zepto;
  if (Polymer && Polymer.dom) {
    return Polymer.dom(el).cloneNode(true);
  } else if ($) {
    return $(el).clone(true)[0];
  } else {
    return el.cloneNode(true);
  }
}
function setRect(el, rect) {
  css(el, "position", "absolute");
  css(el, "top", rect.top);
  css(el, "left", rect.left);
  css(el, "width", rect.width);
  css(el, "height", rect.height);
}
function unsetRect(el) {
  css(el, "position", "");
  css(el, "top", "");
  css(el, "left", "");
  css(el, "width", "");
  css(el, "height", "");
}
var expando = "Sortable" + (/* @__PURE__ */ new Date()).getTime();
function AnimationStateManager() {
  var animationStates = [], animationCallbackId;
  return {
    captureAnimationState: function captureAnimationState() {
      animationStates = [];
      if (!this.options.animation) return;
      var children = [].slice.call(this.el.children);
      children.forEach(function(child) {
        if (css(child, "display") === "none" || child === Sortable.ghost) return;
        animationStates.push({
          target: child,
          rect: getRect(child)
        });
        var fromRect = _objectSpread2({}, animationStates[animationStates.length - 1].rect);
        if (child.thisAnimationDuration) {
          var childMatrix = matrix(child, true);
          if (childMatrix) {
            fromRect.top -= childMatrix.f;
            fromRect.left -= childMatrix.e;
          }
        }
        child.fromRect = fromRect;
      });
    },
    addAnimationState: function addAnimationState(state) {
      animationStates.push(state);
    },
    removeAnimationState: function removeAnimationState(target) {
      animationStates.splice(indexOfObject(animationStates, {
        target
      }), 1);
    },
    animateAll: function animateAll(callback) {
      var _this = this;
      if (!this.options.animation) {
        clearTimeout(animationCallbackId);
        if (typeof callback === "function") callback();
        return;
      }
      var animating = false, animationTime = 0;
      animationStates.forEach(function(state) {
        var time = 0, target = state.target, fromRect = target.fromRect, toRect = getRect(target), prevFromRect = target.prevFromRect, prevToRect = target.prevToRect, animatingRect = state.rect, targetMatrix = matrix(target, true);
        if (targetMatrix) {
          toRect.top -= targetMatrix.f;
          toRect.left -= targetMatrix.e;
        }
        target.toRect = toRect;
        if (target.thisAnimationDuration) {
          if (isRectEqual(prevFromRect, toRect) && !isRectEqual(fromRect, toRect) && // Make sure animatingRect is on line between toRect & fromRect
          (animatingRect.top - toRect.top) / (animatingRect.left - toRect.left) === (fromRect.top - toRect.top) / (fromRect.left - toRect.left)) {
            time = calculateRealTime(animatingRect, prevFromRect, prevToRect, _this.options);
          }
        }
        if (!isRectEqual(toRect, fromRect)) {
          target.prevFromRect = fromRect;
          target.prevToRect = toRect;
          if (!time) {
            time = _this.options.animation;
          }
          _this.animate(target, animatingRect, toRect, time);
        }
        if (time) {
          animating = true;
          animationTime = Math.max(animationTime, time);
          clearTimeout(target.animationResetTimer);
          target.animationResetTimer = setTimeout(function() {
            target.animationTime = 0;
            target.prevFromRect = null;
            target.fromRect = null;
            target.prevToRect = null;
            target.thisAnimationDuration = null;
          }, time);
          target.thisAnimationDuration = time;
        }
      });
      clearTimeout(animationCallbackId);
      if (!animating) {
        if (typeof callback === "function") callback();
      } else {
        animationCallbackId = setTimeout(function() {
          if (typeof callback === "function") callback();
        }, animationTime);
      }
      animationStates = [];
    },
    animate: function animate(target, currentRect, toRect, duration) {
      if (duration) {
        css(target, "transition", "");
        css(target, "transform", "");
        var elMatrix = matrix(this.el), scaleX = elMatrix && elMatrix.a, scaleY = elMatrix && elMatrix.d, translateX = (currentRect.left - toRect.left) / (scaleX || 1), translateY = (currentRect.top - toRect.top) / (scaleY || 1);
        target.animatingX = !!translateX;
        target.animatingY = !!translateY;
        css(target, "transform", "translate3d(" + translateX + "px," + translateY + "px,0)");
        this.forRepaintDummy = repaint(target);
        css(target, "transition", "transform " + duration + "ms" + (this.options.easing ? " " + this.options.easing : ""));
        css(target, "transform", "translate3d(0,0,0)");
        typeof target.animated === "number" && clearTimeout(target.animated);
        target.animated = setTimeout(function() {
          css(target, "transition", "");
          css(target, "transform", "");
          target.animated = false;
          target.animatingX = false;
          target.animatingY = false;
        }, duration);
      }
    }
  };
}
function repaint(target) {
  return target.offsetWidth;
}
function calculateRealTime(animatingRect, fromRect, toRect, options) {
  return Math.sqrt(Math.pow(fromRect.top - animatingRect.top, 2) + Math.pow(fromRect.left - animatingRect.left, 2)) / Math.sqrt(Math.pow(fromRect.top - toRect.top, 2) + Math.pow(fromRect.left - toRect.left, 2)) * options.animation;
}
var plugins = [];
var defaults = {
  initializeByDefault: true
};
var PluginManager = {
  mount: function mount(plugin) {
    for (var option2 in defaults) {
      if (defaults.hasOwnProperty(option2) && !(option2 in plugin)) {
        plugin[option2] = defaults[option2];
      }
    }
    plugins.forEach(function(p) {
      if (p.pluginName === plugin.pluginName) {
        throw "Sortable: Cannot mount plugin ".concat(plugin.pluginName, " more than once");
      }
    });
    plugins.push(plugin);
  },
  pluginEvent: function pluginEvent(eventName, sortable, evt) {
    var _this = this;
    this.eventCanceled = false;
    evt.cancel = function() {
      _this.eventCanceled = true;
    };
    var eventNameGlobal = eventName + "Global";
    plugins.forEach(function(plugin) {
      if (!sortable[plugin.pluginName]) return;
      if (sortable[plugin.pluginName][eventNameGlobal]) {
        sortable[plugin.pluginName][eventNameGlobal](_objectSpread2({
          sortable
        }, evt));
      }
      if (sortable.options[plugin.pluginName] && sortable[plugin.pluginName][eventName]) {
        sortable[plugin.pluginName][eventName](_objectSpread2({
          sortable
        }, evt));
      }
    });
  },
  initializePlugins: function initializePlugins(sortable, el, defaults2, options) {
    plugins.forEach(function(plugin) {
      var pluginName = plugin.pluginName;
      if (!sortable.options[pluginName] && !plugin.initializeByDefault) return;
      var initialized = new plugin(sortable, el, sortable.options);
      initialized.sortable = sortable;
      initialized.options = sortable.options;
      sortable[pluginName] = initialized;
      _extends(defaults2, initialized.defaults);
    });
    for (var option2 in sortable.options) {
      if (!sortable.options.hasOwnProperty(option2)) continue;
      var modified = this.modifyOption(sortable, option2, sortable.options[option2]);
      if (typeof modified !== "undefined") {
        sortable.options[option2] = modified;
      }
    }
  },
  getEventProperties: function getEventProperties(name, sortable) {
    var eventProperties = {};
    plugins.forEach(function(plugin) {
      if (typeof plugin.eventProperties !== "function") return;
      _extends(eventProperties, plugin.eventProperties.call(sortable[plugin.pluginName], name));
    });
    return eventProperties;
  },
  modifyOption: function modifyOption(sortable, name, value) {
    var modifiedValue;
    plugins.forEach(function(plugin) {
      if (!sortable[plugin.pluginName]) return;
      if (plugin.optionListeners && typeof plugin.optionListeners[name] === "function") {
        modifiedValue = plugin.optionListeners[name].call(sortable[plugin.pluginName], value);
      }
    });
    return modifiedValue;
  }
};
function dispatchEvent(_ref) {
  var sortable = _ref.sortable, rootEl2 = _ref.rootEl, name = _ref.name, targetEl = _ref.targetEl, cloneEl2 = _ref.cloneEl, toEl = _ref.toEl, fromEl = _ref.fromEl, oldIndex2 = _ref.oldIndex, newIndex2 = _ref.newIndex, oldDraggableIndex2 = _ref.oldDraggableIndex, newDraggableIndex2 = _ref.newDraggableIndex, originalEvent = _ref.originalEvent, putSortable2 = _ref.putSortable, extraEventProperties = _ref.extraEventProperties;
  sortable = sortable || rootEl2 && rootEl2[expando];
  if (!sortable) return;
  var evt, options = sortable.options, onName = "on" + name.charAt(0).toUpperCase() + name.substr(1);
  if (window.CustomEvent && !IE11OrLess && !Edge) {
    evt = new CustomEvent(name, {
      bubbles: true,
      cancelable: true
    });
  } else {
    evt = document.createEvent("Event");
    evt.initEvent(name, true, true);
  }
  evt.to = toEl || rootEl2;
  evt.from = fromEl || rootEl2;
  evt.item = targetEl || rootEl2;
  evt.clone = cloneEl2;
  evt.oldIndex = oldIndex2;
  evt.newIndex = newIndex2;
  evt.oldDraggableIndex = oldDraggableIndex2;
  evt.newDraggableIndex = newDraggableIndex2;
  evt.originalEvent = originalEvent;
  evt.pullMode = putSortable2 ? putSortable2.lastPutMode : void 0;
  var allEventProperties = _objectSpread2(_objectSpread2({}, extraEventProperties), PluginManager.getEventProperties(name, sortable));
  for (var option2 in allEventProperties) {
    evt[option2] = allEventProperties[option2];
  }
  if (rootEl2) {
    rootEl2.dispatchEvent(evt);
  }
  if (options[onName]) {
    options[onName].call(sortable, evt);
  }
}
var _excluded = ["evt"];
var pluginEvent2 = function pluginEvent3(eventName, sortable) {
  var _ref = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {}, originalEvent = _ref.evt, data = _objectWithoutProperties(_ref, _excluded);
  PluginManager.pluginEvent.bind(Sortable)(eventName, sortable, _objectSpread2({
    dragEl,
    parentEl,
    ghostEl,
    rootEl,
    nextEl,
    lastDownEl,
    cloneEl,
    cloneHidden,
    dragStarted: moved,
    putSortable,
    activeSortable: Sortable.active,
    originalEvent,
    oldIndex,
    oldDraggableIndex,
    newIndex,
    newDraggableIndex,
    hideGhostForTarget: _hideGhostForTarget,
    unhideGhostForTarget: _unhideGhostForTarget,
    cloneNowHidden: function cloneNowHidden() {
      cloneHidden = true;
    },
    cloneNowShown: function cloneNowShown() {
      cloneHidden = false;
    },
    dispatchSortableEvent: function dispatchSortableEvent(name) {
      _dispatchEvent({
        sortable,
        name,
        originalEvent
      });
    }
  }, data));
};
function _dispatchEvent(info) {
  dispatchEvent(_objectSpread2({
    putSortable,
    cloneEl,
    targetEl: dragEl,
    rootEl,
    oldIndex,
    oldDraggableIndex,
    newIndex,
    newDraggableIndex
  }, info));
}
var dragEl, parentEl, ghostEl, rootEl, nextEl, lastDownEl, cloneEl, cloneHidden, oldIndex, newIndex, oldDraggableIndex, newDraggableIndex, activeGroup, putSortable, awaitingDragStarted = false, ignoreNextClick = false, sortables = [], tapEvt, touchEvt, lastDx, lastDy, tapDistanceLeft, tapDistanceTop, moved, lastTarget, lastDirection, pastFirstInvertThresh = false, isCircumstantialInvert = false, targetMoveDistance, ghostRelativeParent, ghostRelativeParentInitialScroll = [], _silent = false, savedInputChecked = [];
var documentExists = typeof document !== "undefined", PositionGhostAbsolutely = IOS, CSSFloatProperty = Edge || IE11OrLess ? "cssFloat" : "float", supportDraggable = documentExists && !ChromeForAndroid && !IOS && "draggable" in document.createElement("div"), supportCssPointerEvents = function() {
  if (!documentExists) return;
  if (IE11OrLess) {
    return false;
  }
  var el = document.createElement("x");
  el.style.cssText = "pointer-events:auto";
  return el.style.pointerEvents === "auto";
}(), _detectDirection = function _detectDirection2(el, options) {
  var elCSS = css(el), elWidth = parseInt(elCSS.width) - parseInt(elCSS.paddingLeft) - parseInt(elCSS.paddingRight) - parseInt(elCSS.borderLeftWidth) - parseInt(elCSS.borderRightWidth), child1 = getChild(el, 0, options), child2 = getChild(el, 1, options), firstChildCSS = child1 && css(child1), secondChildCSS = child2 && css(child2), firstChildWidth = firstChildCSS && parseInt(firstChildCSS.marginLeft) + parseInt(firstChildCSS.marginRight) + getRect(child1).width, secondChildWidth = secondChildCSS && parseInt(secondChildCSS.marginLeft) + parseInt(secondChildCSS.marginRight) + getRect(child2).width;
  if (elCSS.display === "flex") {
    return elCSS.flexDirection === "column" || elCSS.flexDirection === "column-reverse" ? "vertical" : "horizontal";
  }
  if (elCSS.display === "grid") {
    return elCSS.gridTemplateColumns.split(" ").length <= 1 ? "vertical" : "horizontal";
  }
  if (child1 && firstChildCSS["float"] && firstChildCSS["float"] !== "none") {
    var touchingSideChild2 = firstChildCSS["float"] === "left" ? "left" : "right";
    return child2 && (secondChildCSS.clear === "both" || secondChildCSS.clear === touchingSideChild2) ? "vertical" : "horizontal";
  }
  return child1 && (firstChildCSS.display === "block" || firstChildCSS.display === "flex" || firstChildCSS.display === "table" || firstChildCSS.display === "grid" || firstChildWidth >= elWidth && elCSS[CSSFloatProperty] === "none" || child2 && elCSS[CSSFloatProperty] === "none" && firstChildWidth + secondChildWidth > elWidth) ? "vertical" : "horizontal";
}, _dragElInRowColumn = function _dragElInRowColumn2(dragRect, targetRect, vertical) {
  var dragElS1Opp = vertical ? dragRect.left : dragRect.top, dragElS2Opp = vertical ? dragRect.right : dragRect.bottom, dragElOppLength = vertical ? dragRect.width : dragRect.height, targetS1Opp = vertical ? targetRect.left : targetRect.top, targetS2Opp = vertical ? targetRect.right : targetRect.bottom, targetOppLength = vertical ? targetRect.width : targetRect.height;
  return dragElS1Opp === targetS1Opp || dragElS2Opp === targetS2Opp || dragElS1Opp + dragElOppLength / 2 === targetS1Opp + targetOppLength / 2;
}, _detectNearestEmptySortable = function _detectNearestEmptySortable2(x, y) {
  var ret;
  sortables.some(function(sortable) {
    var threshold = sortable[expando].options.emptyInsertThreshold;
    if (!threshold || lastChild(sortable)) return;
    var rect = getRect(sortable), insideHorizontally = x >= rect.left - threshold && x <= rect.right + threshold, insideVertically = y >= rect.top - threshold && y <= rect.bottom + threshold;
    if (insideHorizontally && insideVertically) {
      return ret = sortable;
    }
  });
  return ret;
}, _prepareGroup = function _prepareGroup2(options) {
  function toFn(value, pull) {
    return function(to, from, dragEl2, evt) {
      var sameGroup = to.options.group.name && from.options.group.name && to.options.group.name === from.options.group.name;
      if (value == null && (pull || sameGroup)) {
        return true;
      } else if (value == null || value === false) {
        return false;
      } else if (pull && value === "clone") {
        return value;
      } else if (typeof value === "function") {
        return toFn(value(to, from, dragEl2, evt), pull)(to, from, dragEl2, evt);
      } else {
        var otherGroup = (pull ? to : from).options.group.name;
        return value === true || typeof value === "string" && value === otherGroup || value.join && value.indexOf(otherGroup) > -1;
      }
    };
  }
  var group = {};
  var originalGroup = options.group;
  if (!originalGroup || _typeof(originalGroup) != "object") {
    originalGroup = {
      name: originalGroup
    };
  }
  group.name = originalGroup.name;
  group.checkPull = toFn(originalGroup.pull, true);
  group.checkPut = toFn(originalGroup.put);
  group.revertClone = originalGroup.revertClone;
  options.group = group;
}, _hideGhostForTarget = function _hideGhostForTarget2() {
  if (!supportCssPointerEvents && ghostEl) {
    css(ghostEl, "display", "none");
  }
}, _unhideGhostForTarget = function _unhideGhostForTarget2() {
  if (!supportCssPointerEvents && ghostEl) {
    css(ghostEl, "display", "");
  }
};
if (documentExists) {
  document.addEventListener("click", function(evt) {
    if (ignoreNextClick) {
      evt.preventDefault();
      evt.stopPropagation && evt.stopPropagation();
      evt.stopImmediatePropagation && evt.stopImmediatePropagation();
      ignoreNextClick = false;
      return false;
    }
  }, true);
}
var nearestEmptyInsertDetectEvent = function nearestEmptyInsertDetectEvent2(evt) {
  if (dragEl) {
    evt = evt.touches ? evt.touches[0] : evt;
    var nearest = _detectNearestEmptySortable(evt.clientX, evt.clientY);
    if (nearest) {
      var event = {};
      for (var i in evt) {
        if (evt.hasOwnProperty(i)) {
          event[i] = evt[i];
        }
      }
      event.target = event.rootEl = nearest;
      event.preventDefault = void 0;
      event.stopPropagation = void 0;
      nearest[expando]._onDragOver(event);
    }
  }
};
var _checkOutsideTargetEl = function _checkOutsideTargetEl2(evt) {
  if (dragEl) {
    dragEl.parentNode[expando]._isOutsideThisEl(evt.target);
  }
};
function Sortable(el, options) {
  if (!(el && el.nodeType && el.nodeType === 1)) {
    throw "Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(el));
  }
  this.el = el;
  this.options = options = _extends({}, options);
  el[expando] = this;
  var defaults2 = {
    group: null,
    sort: true,
    disabled: false,
    store: null,
    handle: null,
    draggable: /^[uo]l$/i.test(el.nodeName) ? ">li" : ">*",
    swapThreshold: 1,
    // percentage; 0 <= x <= 1
    invertSwap: false,
    // invert always
    invertedSwapThreshold: null,
    // will be set to same as swapThreshold if default
    removeCloneOnHide: true,
    direction: function direction() {
      return _detectDirection(el, this.options);
    },
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    ignore: "a, img",
    filter: null,
    preventOnFilter: true,
    animation: 0,
    easing: null,
    setData: function setData(dataTransfer, dragEl2) {
      dataTransfer.setData("Text", dragEl2.textContent);
    },
    dropBubble: false,
    dragoverBubble: false,
    dataIdAttr: "data-id",
    delay: 0,
    delayOnTouchOnly: false,
    touchStartThreshold: (Number.parseInt ? Number : window).parseInt(window.devicePixelRatio, 10) || 1,
    forceFallback: false,
    fallbackClass: "sortable-fallback",
    fallbackOnBody: false,
    fallbackTolerance: 0,
    fallbackOffset: {
      x: 0,
      y: 0
    },
    supportPointer: Sortable.supportPointer !== false && "PointerEvent" in window && !Safari,
    emptyInsertThreshold: 5
  };
  PluginManager.initializePlugins(this, el, defaults2);
  for (var name in defaults2) {
    !(name in options) && (options[name] = defaults2[name]);
  }
  _prepareGroup(options);
  for (var fn in this) {
    if (fn.charAt(0) === "_" && typeof this[fn] === "function") {
      this[fn] = this[fn].bind(this);
    }
  }
  this.nativeDraggable = options.forceFallback ? false : supportDraggable;
  if (this.nativeDraggable) {
    this.options.touchStartThreshold = 1;
  }
  if (options.supportPointer) {
    on(el, "pointerdown", this._onTapStart);
  } else {
    on(el, "mousedown", this._onTapStart);
    on(el, "touchstart", this._onTapStart);
  }
  if (this.nativeDraggable) {
    on(el, "dragover", this);
    on(el, "dragenter", this);
  }
  sortables.push(this.el);
  options.store && options.store.get && this.sort(options.store.get(this) || []);
  _extends(this, AnimationStateManager());
}
Sortable.prototype = /** @lends Sortable.prototype */
{
  constructor: Sortable,
  _isOutsideThisEl: function _isOutsideThisEl(target) {
    if (!this.el.contains(target) && target !== this.el) {
      lastTarget = null;
    }
  },
  _getDirection: function _getDirection(evt, target) {
    return typeof this.options.direction === "function" ? this.options.direction.call(this, evt, target, dragEl) : this.options.direction;
  },
  _onTapStart: function _onTapStart(evt) {
    if (!evt.cancelable) return;
    var _this = this, el = this.el, options = this.options, preventOnFilter = options.preventOnFilter, type = evt.type, touch = evt.touches && evt.touches[0] || evt.pointerType && evt.pointerType === "touch" && evt, target = (touch || evt).target, originalTarget = evt.target.shadowRoot && (evt.path && evt.path[0] || evt.composedPath && evt.composedPath()[0]) || target, filter = options.filter;
    _saveInputCheckedState(el);
    if (dragEl) {
      return;
    }
    if (/mousedown|pointerdown/.test(type) && evt.button !== 0 || options.disabled) {
      return;
    }
    if (originalTarget.isContentEditable) {
      return;
    }
    if (!this.nativeDraggable && Safari && target && target.tagName.toUpperCase() === "SELECT") {
      return;
    }
    target = closest(target, options.draggable, el, false);
    if (target && target.animated) {
      return;
    }
    if (lastDownEl === target) {
      return;
    }
    oldIndex = index(target);
    oldDraggableIndex = index(target, options.draggable);
    if (typeof filter === "function") {
      if (filter.call(this, evt, target, this)) {
        _dispatchEvent({
          sortable: _this,
          rootEl: originalTarget,
          name: "filter",
          targetEl: target,
          toEl: el,
          fromEl: el
        });
        pluginEvent2("filter", _this, {
          evt
        });
        preventOnFilter && evt.cancelable && evt.preventDefault();
        return;
      }
    } else if (filter) {
      filter = filter.split(",").some(function(criteria) {
        criteria = closest(originalTarget, criteria.trim(), el, false);
        if (criteria) {
          _dispatchEvent({
            sortable: _this,
            rootEl: criteria,
            name: "filter",
            targetEl: target,
            fromEl: el,
            toEl: el
          });
          pluginEvent2("filter", _this, {
            evt
          });
          return true;
        }
      });
      if (filter) {
        preventOnFilter && evt.cancelable && evt.preventDefault();
        return;
      }
    }
    if (options.handle && !closest(originalTarget, options.handle, el, false)) {
      return;
    }
    this._prepareDragStart(evt, touch, target);
  },
  _prepareDragStart: function _prepareDragStart(evt, touch, target) {
    var _this = this, el = _this.el, options = _this.options, ownerDocument = el.ownerDocument, dragStartFn;
    if (target && !dragEl && target.parentNode === el) {
      var dragRect = getRect(target);
      rootEl = el;
      dragEl = target;
      parentEl = dragEl.parentNode;
      nextEl = dragEl.nextSibling;
      lastDownEl = target;
      activeGroup = options.group;
      Sortable.dragged = dragEl;
      tapEvt = {
        target: dragEl,
        clientX: (touch || evt).clientX,
        clientY: (touch || evt).clientY
      };
      tapDistanceLeft = tapEvt.clientX - dragRect.left;
      tapDistanceTop = tapEvt.clientY - dragRect.top;
      this._lastX = (touch || evt).clientX;
      this._lastY = (touch || evt).clientY;
      dragEl.style["will-change"] = "all";
      dragStartFn = function dragStartFn2() {
        pluginEvent2("delayEnded", _this, {
          evt
        });
        if (Sortable.eventCanceled) {
          _this._onDrop();
          return;
        }
        _this._disableDelayedDragEvents();
        if (!FireFox && _this.nativeDraggable) {
          dragEl.draggable = true;
        }
        _this._triggerDragStart(evt, touch);
        _dispatchEvent({
          sortable: _this,
          name: "choose",
          originalEvent: evt
        });
        toggleClass(dragEl, options.chosenClass, true);
      };
      options.ignore.split(",").forEach(function(criteria) {
        find(dragEl, criteria.trim(), _disableDraggable);
      });
      on(ownerDocument, "dragover", nearestEmptyInsertDetectEvent);
      on(ownerDocument, "mousemove", nearestEmptyInsertDetectEvent);
      on(ownerDocument, "touchmove", nearestEmptyInsertDetectEvent);
      on(ownerDocument, "mouseup", _this._onDrop);
      on(ownerDocument, "touchend", _this._onDrop);
      on(ownerDocument, "touchcancel", _this._onDrop);
      if (FireFox && this.nativeDraggable) {
        this.options.touchStartThreshold = 4;
        dragEl.draggable = true;
      }
      pluginEvent2("delayStart", this, {
        evt
      });
      if (options.delay && (!options.delayOnTouchOnly || touch) && (!this.nativeDraggable || !(Edge || IE11OrLess))) {
        if (Sortable.eventCanceled) {
          this._onDrop();
          return;
        }
        on(ownerDocument, "mouseup", _this._disableDelayedDrag);
        on(ownerDocument, "touchend", _this._disableDelayedDrag);
        on(ownerDocument, "touchcancel", _this._disableDelayedDrag);
        on(ownerDocument, "mousemove", _this._delayedDragTouchMoveHandler);
        on(ownerDocument, "touchmove", _this._delayedDragTouchMoveHandler);
        options.supportPointer && on(ownerDocument, "pointermove", _this._delayedDragTouchMoveHandler);
        _this._dragStartTimer = setTimeout(dragStartFn, options.delay);
      } else {
        dragStartFn();
      }
    }
  },
  _delayedDragTouchMoveHandler: function _delayedDragTouchMoveHandler(e) {
    var touch = e.touches ? e.touches[0] : e;
    if (Math.max(Math.abs(touch.clientX - this._lastX), Math.abs(touch.clientY - this._lastY)) >= Math.floor(this.options.touchStartThreshold / (this.nativeDraggable && window.devicePixelRatio || 1))) {
      this._disableDelayedDrag();
    }
  },
  _disableDelayedDrag: function _disableDelayedDrag() {
    dragEl && _disableDraggable(dragEl);
    clearTimeout(this._dragStartTimer);
    this._disableDelayedDragEvents();
  },
  _disableDelayedDragEvents: function _disableDelayedDragEvents() {
    var ownerDocument = this.el.ownerDocument;
    off(ownerDocument, "mouseup", this._disableDelayedDrag);
    off(ownerDocument, "touchend", this._disableDelayedDrag);
    off(ownerDocument, "touchcancel", this._disableDelayedDrag);
    off(ownerDocument, "mousemove", this._delayedDragTouchMoveHandler);
    off(ownerDocument, "touchmove", this._delayedDragTouchMoveHandler);
    off(ownerDocument, "pointermove", this._delayedDragTouchMoveHandler);
  },
  _triggerDragStart: function _triggerDragStart(evt, touch) {
    touch = touch || evt.pointerType == "touch" && evt;
    if (!this.nativeDraggable || touch) {
      if (this.options.supportPointer) {
        on(document, "pointermove", this._onTouchMove);
      } else if (touch) {
        on(document, "touchmove", this._onTouchMove);
      } else {
        on(document, "mousemove", this._onTouchMove);
      }
    } else {
      on(dragEl, "dragend", this);
      on(rootEl, "dragstart", this._onDragStart);
    }
    try {
      if (document.selection) {
        _nextTick(function() {
          document.selection.empty();
        });
      } else {
        window.getSelection().removeAllRanges();
      }
    } catch (err) {
    }
  },
  _dragStarted: function _dragStarted(fallback, evt) {
    awaitingDragStarted = false;
    if (rootEl && dragEl) {
      pluginEvent2("dragStarted", this, {
        evt
      });
      if (this.nativeDraggable) {
        on(document, "dragover", _checkOutsideTargetEl);
      }
      var options = this.options;
      !fallback && toggleClass(dragEl, options.dragClass, false);
      toggleClass(dragEl, options.ghostClass, true);
      Sortable.active = this;
      fallback && this._appendGhost();
      _dispatchEvent({
        sortable: this,
        name: "start",
        originalEvent: evt
      });
    } else {
      this._nulling();
    }
  },
  _emulateDragOver: function _emulateDragOver() {
    if (touchEvt) {
      this._lastX = touchEvt.clientX;
      this._lastY = touchEvt.clientY;
      _hideGhostForTarget();
      var target = document.elementFromPoint(touchEvt.clientX, touchEvt.clientY);
      var parent = target;
      while (target && target.shadowRoot) {
        target = target.shadowRoot.elementFromPoint(touchEvt.clientX, touchEvt.clientY);
        if (target === parent) break;
        parent = target;
      }
      dragEl.parentNode[expando]._isOutsideThisEl(target);
      if (parent) {
        do {
          if (parent[expando]) {
            var inserted = void 0;
            inserted = parent[expando]._onDragOver({
              clientX: touchEvt.clientX,
              clientY: touchEvt.clientY,
              target,
              rootEl: parent
            });
            if (inserted && !this.options.dragoverBubble) {
              break;
            }
          }
          target = parent;
        } while (parent = parent.parentNode);
      }
      _unhideGhostForTarget();
    }
  },
  _onTouchMove: function _onTouchMove(evt) {
    if (tapEvt) {
      var options = this.options, fallbackTolerance = options.fallbackTolerance, fallbackOffset = options.fallbackOffset, touch = evt.touches ? evt.touches[0] : evt, ghostMatrix = ghostEl && matrix(ghostEl, true), scaleX = ghostEl && ghostMatrix && ghostMatrix.a, scaleY = ghostEl && ghostMatrix && ghostMatrix.d, relativeScrollOffset = PositionGhostAbsolutely && ghostRelativeParent && getRelativeScrollOffset(ghostRelativeParent), dx = (touch.clientX - tapEvt.clientX + fallbackOffset.x) / (scaleX || 1) + (relativeScrollOffset ? relativeScrollOffset[0] - ghostRelativeParentInitialScroll[0] : 0) / (scaleX || 1), dy = (touch.clientY - tapEvt.clientY + fallbackOffset.y) / (scaleY || 1) + (relativeScrollOffset ? relativeScrollOffset[1] - ghostRelativeParentInitialScroll[1] : 0) / (scaleY || 1);
      if (!Sortable.active && !awaitingDragStarted) {
        if (fallbackTolerance && Math.max(Math.abs(touch.clientX - this._lastX), Math.abs(touch.clientY - this._lastY)) < fallbackTolerance) {
          return;
        }
        this._onDragStart(evt, true);
      }
      if (ghostEl) {
        if (ghostMatrix) {
          ghostMatrix.e += dx - (lastDx || 0);
          ghostMatrix.f += dy - (lastDy || 0);
        } else {
          ghostMatrix = {
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: dx,
            f: dy
          };
        }
        var cssMatrix = "matrix(".concat(ghostMatrix.a, ",").concat(ghostMatrix.b, ",").concat(ghostMatrix.c, ",").concat(ghostMatrix.d, ",").concat(ghostMatrix.e, ",").concat(ghostMatrix.f, ")");
        css(ghostEl, "webkitTransform", cssMatrix);
        css(ghostEl, "mozTransform", cssMatrix);
        css(ghostEl, "msTransform", cssMatrix);
        css(ghostEl, "transform", cssMatrix);
        lastDx = dx;
        lastDy = dy;
        touchEvt = touch;
      }
      evt.cancelable && evt.preventDefault();
    }
  },
  _appendGhost: function _appendGhost() {
    if (!ghostEl) {
      var container = this.options.fallbackOnBody ? document.body : rootEl, rect = getRect(dragEl, true, PositionGhostAbsolutely, true, container), options = this.options;
      if (PositionGhostAbsolutely) {
        ghostRelativeParent = container;
        while (css(ghostRelativeParent, "position") === "static" && css(ghostRelativeParent, "transform") === "none" && ghostRelativeParent !== document) {
          ghostRelativeParent = ghostRelativeParent.parentNode;
        }
        if (ghostRelativeParent !== document.body && ghostRelativeParent !== document.documentElement) {
          if (ghostRelativeParent === document) ghostRelativeParent = getWindowScrollingElement();
          rect.top += ghostRelativeParent.scrollTop;
          rect.left += ghostRelativeParent.scrollLeft;
        } else {
          ghostRelativeParent = getWindowScrollingElement();
        }
        ghostRelativeParentInitialScroll = getRelativeScrollOffset(ghostRelativeParent);
      }
      ghostEl = dragEl.cloneNode(true);
      toggleClass(ghostEl, options.ghostClass, false);
      toggleClass(ghostEl, options.fallbackClass, true);
      toggleClass(ghostEl, options.dragClass, true);
      css(ghostEl, "transition", "");
      css(ghostEl, "transform", "");
      css(ghostEl, "box-sizing", "border-box");
      css(ghostEl, "margin", 0);
      css(ghostEl, "top", rect.top);
      css(ghostEl, "left", rect.left);
      css(ghostEl, "width", rect.width);
      css(ghostEl, "height", rect.height);
      css(ghostEl, "opacity", "0.8");
      css(ghostEl, "position", PositionGhostAbsolutely ? "absolute" : "fixed");
      css(ghostEl, "zIndex", "100000");
      css(ghostEl, "pointerEvents", "none");
      Sortable.ghost = ghostEl;
      container.appendChild(ghostEl);
      css(ghostEl, "transform-origin", tapDistanceLeft / parseInt(ghostEl.style.width) * 100 + "% " + tapDistanceTop / parseInt(ghostEl.style.height) * 100 + "%");
    }
  },
  _onDragStart: function _onDragStart(evt, fallback) {
    var _this = this;
    var dataTransfer = evt.dataTransfer;
    var options = _this.options;
    pluginEvent2("dragStart", this, {
      evt
    });
    if (Sortable.eventCanceled) {
      this._onDrop();
      return;
    }
    pluginEvent2("setupClone", this);
    if (!Sortable.eventCanceled) {
      cloneEl = clone(dragEl);
      cloneEl.draggable = false;
      cloneEl.style["will-change"] = "";
      this._hideClone();
      toggleClass(cloneEl, this.options.chosenClass, false);
      Sortable.clone = cloneEl;
    }
    _this.cloneId = _nextTick(function() {
      pluginEvent2("clone", _this);
      if (Sortable.eventCanceled) return;
      if (!_this.options.removeCloneOnHide) {
        rootEl.insertBefore(cloneEl, dragEl);
      }
      _this._hideClone();
      _dispatchEvent({
        sortable: _this,
        name: "clone"
      });
    });
    !fallback && toggleClass(dragEl, options.dragClass, true);
    if (fallback) {
      ignoreNextClick = true;
      _this._loopId = setInterval(_this._emulateDragOver, 50);
    } else {
      off(document, "mouseup", _this._onDrop);
      off(document, "touchend", _this._onDrop);
      off(document, "touchcancel", _this._onDrop);
      if (dataTransfer) {
        dataTransfer.effectAllowed = "move";
        options.setData && options.setData.call(_this, dataTransfer, dragEl);
      }
      on(document, "drop", _this);
      css(dragEl, "transform", "translateZ(0)");
    }
    awaitingDragStarted = true;
    _this._dragStartId = _nextTick(_this._dragStarted.bind(_this, fallback, evt));
    on(document, "selectstart", _this);
    moved = true;
    if (Safari) {
      css(document.body, "user-select", "none");
    }
  },
  // Returns true - if no further action is needed (either inserted or another condition)
  _onDragOver: function _onDragOver(evt) {
    var el = this.el, target = evt.target, dragRect, targetRect, revert, options = this.options, group = options.group, activeSortable = Sortable.active, isOwner = activeGroup === group, canSort = options.sort, fromSortable = putSortable || activeSortable, vertical, _this = this, completedFired = false;
    if (_silent) return;
    function dragOverEvent(name, extra) {
      pluginEvent2(name, _this, _objectSpread2({
        evt,
        isOwner,
        axis: vertical ? "vertical" : "horizontal",
        revert,
        dragRect,
        targetRect,
        canSort,
        fromSortable,
        target,
        completed,
        onMove: function onMove(target2, after2) {
          return _onMove(rootEl, el, dragEl, dragRect, target2, getRect(target2), evt, after2);
        },
        changed
      }, extra));
    }
    function capture() {
      dragOverEvent("dragOverAnimationCapture");
      _this.captureAnimationState();
      if (_this !== fromSortable) {
        fromSortable.captureAnimationState();
      }
    }
    function completed(insertion) {
      dragOverEvent("dragOverCompleted", {
        insertion
      });
      if (insertion) {
        if (isOwner) {
          activeSortable._hideClone();
        } else {
          activeSortable._showClone(_this);
        }
        if (_this !== fromSortable) {
          toggleClass(dragEl, putSortable ? putSortable.options.ghostClass : activeSortable.options.ghostClass, false);
          toggleClass(dragEl, options.ghostClass, true);
        }
        if (putSortable !== _this && _this !== Sortable.active) {
          putSortable = _this;
        } else if (_this === Sortable.active && putSortable) {
          putSortable = null;
        }
        if (fromSortable === _this) {
          _this._ignoreWhileAnimating = target;
        }
        _this.animateAll(function() {
          dragOverEvent("dragOverAnimationComplete");
          _this._ignoreWhileAnimating = null;
        });
        if (_this !== fromSortable) {
          fromSortable.animateAll();
          fromSortable._ignoreWhileAnimating = null;
        }
      }
      if (target === dragEl && !dragEl.animated || target === el && !target.animated) {
        lastTarget = null;
      }
      if (!options.dragoverBubble && !evt.rootEl && target !== document) {
        dragEl.parentNode[expando]._isOutsideThisEl(evt.target);
        !insertion && nearestEmptyInsertDetectEvent(evt);
      }
      !options.dragoverBubble && evt.stopPropagation && evt.stopPropagation();
      return completedFired = true;
    }
    function changed() {
      newIndex = index(dragEl);
      newDraggableIndex = index(dragEl, options.draggable);
      _dispatchEvent({
        sortable: _this,
        name: "change",
        toEl: el,
        newIndex,
        newDraggableIndex,
        originalEvent: evt
      });
    }
    if (evt.preventDefault !== void 0) {
      evt.cancelable && evt.preventDefault();
    }
    target = closest(target, options.draggable, el, true);
    dragOverEvent("dragOver");
    if (Sortable.eventCanceled) return completedFired;
    if (dragEl.contains(evt.target) || target.animated && target.animatingX && target.animatingY || _this._ignoreWhileAnimating === target) {
      return completed(false);
    }
    ignoreNextClick = false;
    if (activeSortable && !options.disabled && (isOwner ? canSort || (revert = parentEl !== rootEl) : putSortable === this || (this.lastPutMode = activeGroup.checkPull(this, activeSortable, dragEl, evt)) && group.checkPut(this, activeSortable, dragEl, evt))) {
      vertical = this._getDirection(evt, target) === "vertical";
      dragRect = getRect(dragEl);
      dragOverEvent("dragOverValid");
      if (Sortable.eventCanceled) return completedFired;
      if (revert) {
        parentEl = rootEl;
        capture();
        this._hideClone();
        dragOverEvent("revert");
        if (!Sortable.eventCanceled) {
          if (nextEl) {
            rootEl.insertBefore(dragEl, nextEl);
          } else {
            rootEl.appendChild(dragEl);
          }
        }
        return completed(true);
      }
      var elLastChild = lastChild(el, options.draggable);
      if (!elLastChild || _ghostIsLast(evt, vertical, this) && !elLastChild.animated) {
        if (elLastChild === dragEl) {
          return completed(false);
        }
        if (elLastChild && el === evt.target) {
          target = elLastChild;
        }
        if (target) {
          targetRect = getRect(target);
        }
        if (_onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt, !!target) !== false) {
          capture();
          el.appendChild(dragEl);
          parentEl = el;
          changed();
          return completed(true);
        }
      } else if (elLastChild && _ghostIsFirst(evt, vertical, this)) {
        var firstChild = getChild(el, 0, options, true);
        if (firstChild === dragEl) {
          return completed(false);
        }
        target = firstChild;
        targetRect = getRect(target);
        if (_onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt, false) !== false) {
          capture();
          el.insertBefore(dragEl, firstChild);
          parentEl = el;
          changed();
          return completed(true);
        }
      } else if (target.parentNode === el) {
        targetRect = getRect(target);
        var direction = 0, targetBeforeFirstSwap, differentLevel = dragEl.parentNode !== el, differentRowCol = !_dragElInRowColumn(dragEl.animated && dragEl.toRect || dragRect, target.animated && target.toRect || targetRect, vertical), side1 = vertical ? "top" : "left", scrolledPastTop = isScrolledPast(target, "top", "top") || isScrolledPast(dragEl, "top", "top"), scrollBefore = scrolledPastTop ? scrolledPastTop.scrollTop : void 0;
        if (lastTarget !== target) {
          targetBeforeFirstSwap = targetRect[side1];
          pastFirstInvertThresh = false;
          isCircumstantialInvert = !differentRowCol && options.invertSwap || differentLevel;
        }
        direction = _getSwapDirection(evt, target, targetRect, vertical, differentRowCol ? 1 : options.swapThreshold, options.invertedSwapThreshold == null ? options.swapThreshold : options.invertedSwapThreshold, isCircumstantialInvert, lastTarget === target);
        var sibling;
        if (direction !== 0) {
          var dragIndex = index(dragEl);
          do {
            dragIndex -= direction;
            sibling = parentEl.children[dragIndex];
          } while (sibling && (css(sibling, "display") === "none" || sibling === ghostEl));
        }
        if (direction === 0 || sibling === target) {
          return completed(false);
        }
        lastTarget = target;
        lastDirection = direction;
        var nextSibling = target.nextElementSibling, after = false;
        after = direction === 1;
        var moveVector = _onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt, after);
        if (moveVector !== false) {
          if (moveVector === 1 || moveVector === -1) {
            after = moveVector === 1;
          }
          _silent = true;
          setTimeout(_unsilent, 30);
          capture();
          if (after && !nextSibling) {
            el.appendChild(dragEl);
          } else {
            target.parentNode.insertBefore(dragEl, after ? nextSibling : target);
          }
          if (scrolledPastTop) {
            scrollBy(scrolledPastTop, 0, scrollBefore - scrolledPastTop.scrollTop);
          }
          parentEl = dragEl.parentNode;
          if (targetBeforeFirstSwap !== void 0 && !isCircumstantialInvert) {
            targetMoveDistance = Math.abs(targetBeforeFirstSwap - getRect(target)[side1]);
          }
          changed();
          return completed(true);
        }
      }
      if (el.contains(dragEl)) {
        return completed(false);
      }
    }
    return false;
  },
  _ignoreWhileAnimating: null,
  _offMoveEvents: function _offMoveEvents() {
    off(document, "mousemove", this._onTouchMove);
    off(document, "touchmove", this._onTouchMove);
    off(document, "pointermove", this._onTouchMove);
    off(document, "dragover", nearestEmptyInsertDetectEvent);
    off(document, "mousemove", nearestEmptyInsertDetectEvent);
    off(document, "touchmove", nearestEmptyInsertDetectEvent);
  },
  _offUpEvents: function _offUpEvents() {
    var ownerDocument = this.el.ownerDocument;
    off(ownerDocument, "mouseup", this._onDrop);
    off(ownerDocument, "touchend", this._onDrop);
    off(ownerDocument, "pointerup", this._onDrop);
    off(ownerDocument, "touchcancel", this._onDrop);
    off(document, "selectstart", this);
  },
  _onDrop: function _onDrop(evt) {
    var el = this.el, options = this.options;
    newIndex = index(dragEl);
    newDraggableIndex = index(dragEl, options.draggable);
    pluginEvent2("drop", this, {
      evt
    });
    parentEl = dragEl && dragEl.parentNode;
    newIndex = index(dragEl);
    newDraggableIndex = index(dragEl, options.draggable);
    if (Sortable.eventCanceled) {
      this._nulling();
      return;
    }
    awaitingDragStarted = false;
    isCircumstantialInvert = false;
    pastFirstInvertThresh = false;
    clearInterval(this._loopId);
    clearTimeout(this._dragStartTimer);
    _cancelNextTick(this.cloneId);
    _cancelNextTick(this._dragStartId);
    if (this.nativeDraggable) {
      off(document, "drop", this);
      off(el, "dragstart", this._onDragStart);
    }
    this._offMoveEvents();
    this._offUpEvents();
    if (Safari) {
      css(document.body, "user-select", "");
    }
    css(dragEl, "transform", "");
    if (evt) {
      if (moved) {
        evt.cancelable && evt.preventDefault();
        !options.dropBubble && evt.stopPropagation();
      }
      ghostEl && ghostEl.parentNode && ghostEl.parentNode.removeChild(ghostEl);
      if (rootEl === parentEl || putSortable && putSortable.lastPutMode !== "clone") {
        cloneEl && cloneEl.parentNode && cloneEl.parentNode.removeChild(cloneEl);
      }
      if (dragEl) {
        if (this.nativeDraggable) {
          off(dragEl, "dragend", this);
        }
        _disableDraggable(dragEl);
        dragEl.style["will-change"] = "";
        if (moved && !awaitingDragStarted) {
          toggleClass(dragEl, putSortable ? putSortable.options.ghostClass : this.options.ghostClass, false);
        }
        toggleClass(dragEl, this.options.chosenClass, false);
        _dispatchEvent({
          sortable: this,
          name: "unchoose",
          toEl: parentEl,
          newIndex: null,
          newDraggableIndex: null,
          originalEvent: evt
        });
        if (rootEl !== parentEl) {
          if (newIndex >= 0) {
            _dispatchEvent({
              rootEl: parentEl,
              name: "add",
              toEl: parentEl,
              fromEl: rootEl,
              originalEvent: evt
            });
            _dispatchEvent({
              sortable: this,
              name: "remove",
              toEl: parentEl,
              originalEvent: evt
            });
            _dispatchEvent({
              rootEl: parentEl,
              name: "sort",
              toEl: parentEl,
              fromEl: rootEl,
              originalEvent: evt
            });
            _dispatchEvent({
              sortable: this,
              name: "sort",
              toEl: parentEl,
              originalEvent: evt
            });
          }
          putSortable && putSortable.save();
        } else {
          if (newIndex !== oldIndex) {
            if (newIndex >= 0) {
              _dispatchEvent({
                sortable: this,
                name: "update",
                toEl: parentEl,
                originalEvent: evt
              });
              _dispatchEvent({
                sortable: this,
                name: "sort",
                toEl: parentEl,
                originalEvent: evt
              });
            }
          }
        }
        if (Sortable.active) {
          if (newIndex == null || newIndex === -1) {
            newIndex = oldIndex;
            newDraggableIndex = oldDraggableIndex;
          }
          _dispatchEvent({
            sortable: this,
            name: "end",
            toEl: parentEl,
            originalEvent: evt
          });
          this.save();
        }
      }
    }
    this._nulling();
  },
  _nulling: function _nulling() {
    pluginEvent2("nulling", this);
    rootEl = dragEl = parentEl = ghostEl = nextEl = cloneEl = lastDownEl = cloneHidden = tapEvt = touchEvt = moved = newIndex = newDraggableIndex = oldIndex = oldDraggableIndex = lastTarget = lastDirection = putSortable = activeGroup = Sortable.dragged = Sortable.ghost = Sortable.clone = Sortable.active = null;
    savedInputChecked.forEach(function(el) {
      el.checked = true;
    });
    savedInputChecked.length = lastDx = lastDy = 0;
  },
  handleEvent: function handleEvent(evt) {
    switch (evt.type) {
      case "drop":
      case "dragend":
        this._onDrop(evt);
        break;
      case "dragenter":
      case "dragover":
        if (dragEl) {
          this._onDragOver(evt);
          _globalDragOver(evt);
        }
        break;
      case "selectstart":
        evt.preventDefault();
        break;
    }
  },
  /**
   * Serializes the item into an array of string.
   * @returns {String[]}
   */
  toArray: function toArray() {
    var order = [], el, children = this.el.children, i = 0, n = children.length, options = this.options;
    for (; i < n; i++) {
      el = children[i];
      if (closest(el, options.draggable, this.el, false)) {
        order.push(el.getAttribute(options.dataIdAttr) || _generateId(el));
      }
    }
    return order;
  },
  /**
   * Sorts the elements according to the array.
   * @param  {String[]}  order  order of the items
   */
  sort: function sort(order, useAnimation) {
    var items = {}, rootEl2 = this.el;
    this.toArray().forEach(function(id, i) {
      var el = rootEl2.children[i];
      if (closest(el, this.options.draggable, rootEl2, false)) {
        items[id] = el;
      }
    }, this);
    useAnimation && this.captureAnimationState();
    order.forEach(function(id) {
      if (items[id]) {
        rootEl2.removeChild(items[id]);
        rootEl2.appendChild(items[id]);
      }
    });
    useAnimation && this.animateAll();
  },
  /**
   * Save the current sorting
   */
  save: function save() {
    var store = this.options.store;
    store && store.set && store.set(this);
  },
  /**
   * For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree.
   * @param   {HTMLElement}  el
   * @param   {String}       [selector]  default: `options.draggable`
   * @returns {HTMLElement|null}
   */
  closest: function closest$1(el, selector) {
    return closest(el, selector || this.options.draggable, this.el, false);
  },
  /**
   * Set/get option
   * @param   {string} name
   * @param   {*}      [value]
   * @returns {*}
   */
  option: function option(name, value) {
    var options = this.options;
    if (value === void 0) {
      return options[name];
    } else {
      var modifiedValue = PluginManager.modifyOption(this, name, value);
      if (typeof modifiedValue !== "undefined") {
        options[name] = modifiedValue;
      } else {
        options[name] = value;
      }
      if (name === "group") {
        _prepareGroup(options);
      }
    }
  },
  /**
   * Destroy
   */
  destroy: function destroy() {
    pluginEvent2("destroy", this);
    var el = this.el;
    el[expando] = null;
    off(el, "mousedown", this._onTapStart);
    off(el, "touchstart", this._onTapStart);
    off(el, "pointerdown", this._onTapStart);
    if (this.nativeDraggable) {
      off(el, "dragover", this);
      off(el, "dragenter", this);
    }
    Array.prototype.forEach.call(el.querySelectorAll("[draggable]"), function(el2) {
      el2.removeAttribute("draggable");
    });
    this._onDrop();
    this._disableDelayedDragEvents();
    sortables.splice(sortables.indexOf(this.el), 1);
    this.el = el = null;
  },
  _hideClone: function _hideClone() {
    if (!cloneHidden) {
      pluginEvent2("hideClone", this);
      if (Sortable.eventCanceled) return;
      css(cloneEl, "display", "none");
      if (this.options.removeCloneOnHide && cloneEl.parentNode) {
        cloneEl.parentNode.removeChild(cloneEl);
      }
      cloneHidden = true;
    }
  },
  _showClone: function _showClone(putSortable2) {
    if (putSortable2.lastPutMode !== "clone") {
      this._hideClone();
      return;
    }
    if (cloneHidden) {
      pluginEvent2("showClone", this);
      if (Sortable.eventCanceled) return;
      if (dragEl.parentNode == rootEl && !this.options.group.revertClone) {
        rootEl.insertBefore(cloneEl, dragEl);
      } else if (nextEl) {
        rootEl.insertBefore(cloneEl, nextEl);
      } else {
        rootEl.appendChild(cloneEl);
      }
      if (this.options.group.revertClone) {
        this.animate(dragEl, cloneEl);
      }
      css(cloneEl, "display", "");
      cloneHidden = false;
    }
  }
};
function _globalDragOver(evt) {
  if (evt.dataTransfer) {
    evt.dataTransfer.dropEffect = "move";
  }
  evt.cancelable && evt.preventDefault();
}
function _onMove(fromEl, toEl, dragEl2, dragRect, targetEl, targetRect, originalEvent, willInsertAfter) {
  var evt, sortable = fromEl[expando], onMoveFn = sortable.options.onMove, retVal;
  if (window.CustomEvent && !IE11OrLess && !Edge) {
    evt = new CustomEvent("move", {
      bubbles: true,
      cancelable: true
    });
  } else {
    evt = document.createEvent("Event");
    evt.initEvent("move", true, true);
  }
  evt.to = toEl;
  evt.from = fromEl;
  evt.dragged = dragEl2;
  evt.draggedRect = dragRect;
  evt.related = targetEl || toEl;
  evt.relatedRect = targetRect || getRect(toEl);
  evt.willInsertAfter = willInsertAfter;
  evt.originalEvent = originalEvent;
  fromEl.dispatchEvent(evt);
  if (onMoveFn) {
    retVal = onMoveFn.call(sortable, evt, originalEvent);
  }
  return retVal;
}
function _disableDraggable(el) {
  el.draggable = false;
}
function _unsilent() {
  _silent = false;
}
function _ghostIsFirst(evt, vertical, sortable) {
  var rect = getRect(getChild(sortable.el, 0, sortable.options, true));
  var spacer = 10;
  return vertical ? evt.clientX < rect.left - spacer || evt.clientY < rect.top && evt.clientX < rect.right : evt.clientY < rect.top - spacer || evt.clientY < rect.bottom && evt.clientX < rect.left;
}
function _ghostIsLast(evt, vertical, sortable) {
  var rect = getRect(lastChild(sortable.el, sortable.options.draggable));
  var spacer = 10;
  return vertical ? evt.clientX > rect.right + spacer || evt.clientX <= rect.right && evt.clientY > rect.bottom && evt.clientX >= rect.left : evt.clientX > rect.right && evt.clientY > rect.top || evt.clientX <= rect.right && evt.clientY > rect.bottom + spacer;
}
function _getSwapDirection(evt, target, targetRect, vertical, swapThreshold, invertedSwapThreshold, invertSwap, isLastTarget) {
  var mouseOnAxis = vertical ? evt.clientY : evt.clientX, targetLength = vertical ? targetRect.height : targetRect.width, targetS1 = vertical ? targetRect.top : targetRect.left, targetS2 = vertical ? targetRect.bottom : targetRect.right, invert = false;
  if (!invertSwap) {
    if (isLastTarget && targetMoveDistance < targetLength * swapThreshold) {
      if (!pastFirstInvertThresh && (lastDirection === 1 ? mouseOnAxis > targetS1 + targetLength * invertedSwapThreshold / 2 : mouseOnAxis < targetS2 - targetLength * invertedSwapThreshold / 2)) {
        pastFirstInvertThresh = true;
      }
      if (!pastFirstInvertThresh) {
        if (lastDirection === 1 ? mouseOnAxis < targetS1 + targetMoveDistance : mouseOnAxis > targetS2 - targetMoveDistance) {
          return -lastDirection;
        }
      } else {
        invert = true;
      }
    } else {
      if (mouseOnAxis > targetS1 + targetLength * (1 - swapThreshold) / 2 && mouseOnAxis < targetS2 - targetLength * (1 - swapThreshold) / 2) {
        return _getInsertDirection(target);
      }
    }
  }
  invert = invert || invertSwap;
  if (invert) {
    if (mouseOnAxis < targetS1 + targetLength * invertedSwapThreshold / 2 || mouseOnAxis > targetS2 - targetLength * invertedSwapThreshold / 2) {
      return mouseOnAxis > targetS1 + targetLength / 2 ? 1 : -1;
    }
  }
  return 0;
}
function _getInsertDirection(target) {
  if (index(dragEl) < index(target)) {
    return 1;
  } else {
    return -1;
  }
}
function _generateId(el) {
  var str = el.tagName + el.className + el.src + el.href + el.textContent, i = str.length, sum = 0;
  while (i--) {
    sum += str.charCodeAt(i);
  }
  return sum.toString(36);
}
function _saveInputCheckedState(root) {
  savedInputChecked.length = 0;
  var inputs = root.getElementsByTagName("input");
  var idx = inputs.length;
  while (idx--) {
    var el = inputs[idx];
    el.checked && savedInputChecked.push(el);
  }
}
function _nextTick(fn) {
  return setTimeout(fn, 0);
}
function _cancelNextTick(id) {
  return clearTimeout(id);
}
if (documentExists) {
  on(document, "touchmove", function(evt) {
    if ((Sortable.active || awaitingDragStarted) && evt.cancelable) {
      evt.preventDefault();
    }
  });
}
Sortable.utils = {
  on,
  off,
  css,
  find,
  is: function is(el, selector) {
    return !!closest(el, selector, el, false);
  },
  extend,
  throttle,
  closest,
  toggleClass,
  clone,
  index,
  nextTick: _nextTick,
  cancelNextTick: _cancelNextTick,
  detectDirection: _detectDirection,
  getChild
};
Sortable.get = function(element) {
  return element[expando];
};
Sortable.mount = function() {
  for (var _len = arguments.length, plugins2 = new Array(_len), _key = 0; _key < _len; _key++) {
    plugins2[_key] = arguments[_key];
  }
  if (plugins2[0].constructor === Array) plugins2 = plugins2[0];
  plugins2.forEach(function(plugin) {
    if (!plugin.prototype || !plugin.prototype.constructor) {
      throw "Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(plugin));
    }
    if (plugin.utils) Sortable.utils = _objectSpread2(_objectSpread2({}, Sortable.utils), plugin.utils);
    PluginManager.mount(plugin);
  });
};
Sortable.create = function(el, options) {
  return new Sortable(el, options);
};
Sortable.version = version;
var autoScrolls = [], scrollEl, scrollRootEl, scrolling = false, lastAutoScrollX, lastAutoScrollY, touchEvt$1, pointerElemChangedInterval;
function AutoScrollPlugin() {
  function AutoScroll() {
    this.defaults = {
      scroll: true,
      forceAutoScrollFallback: false,
      scrollSensitivity: 30,
      scrollSpeed: 10,
      bubbleScroll: true
    };
    for (var fn in this) {
      if (fn.charAt(0) === "_" && typeof this[fn] === "function") {
        this[fn] = this[fn].bind(this);
      }
    }
  }
  AutoScroll.prototype = {
    dragStarted: function dragStarted2(_ref) {
      var originalEvent = _ref.originalEvent;
      if (this.sortable.nativeDraggable) {
        on(document, "dragover", this._handleAutoScroll);
      } else {
        if (this.options.supportPointer) {
          on(document, "pointermove", this._handleFallbackAutoScroll);
        } else if (originalEvent.touches) {
          on(document, "touchmove", this._handleFallbackAutoScroll);
        } else {
          on(document, "mousemove", this._handleFallbackAutoScroll);
        }
      }
    },
    dragOverCompleted: function dragOverCompleted(_ref2) {
      var originalEvent = _ref2.originalEvent;
      if (!this.options.dragOverBubble && !originalEvent.rootEl) {
        this._handleAutoScroll(originalEvent);
      }
    },
    drop: function drop3() {
      if (this.sortable.nativeDraggable) {
        off(document, "dragover", this._handleAutoScroll);
      } else {
        off(document, "pointermove", this._handleFallbackAutoScroll);
        off(document, "touchmove", this._handleFallbackAutoScroll);
        off(document, "mousemove", this._handleFallbackAutoScroll);
      }
      clearPointerElemChangedInterval();
      clearAutoScrolls();
      cancelThrottle();
    },
    nulling: function nulling() {
      touchEvt$1 = scrollRootEl = scrollEl = scrolling = pointerElemChangedInterval = lastAutoScrollX = lastAutoScrollY = null;
      autoScrolls.length = 0;
    },
    _handleFallbackAutoScroll: function _handleFallbackAutoScroll(evt) {
      this._handleAutoScroll(evt, true);
    },
    _handleAutoScroll: function _handleAutoScroll(evt, fallback) {
      var _this = this;
      var x = (evt.touches ? evt.touches[0] : evt).clientX, y = (evt.touches ? evt.touches[0] : evt).clientY, elem = document.elementFromPoint(x, y);
      touchEvt$1 = evt;
      if (fallback || this.options.forceAutoScrollFallback || Edge || IE11OrLess || Safari) {
        autoScroll(evt, this.options, elem, fallback);
        var ogElemScroller = getParentAutoScrollElement(elem, true);
        if (scrolling && (!pointerElemChangedInterval || x !== lastAutoScrollX || y !== lastAutoScrollY)) {
          pointerElemChangedInterval && clearPointerElemChangedInterval();
          pointerElemChangedInterval = setInterval(function() {
            var newElem = getParentAutoScrollElement(document.elementFromPoint(x, y), true);
            if (newElem !== ogElemScroller) {
              ogElemScroller = newElem;
              clearAutoScrolls();
            }
            autoScroll(evt, _this.options, newElem, fallback);
          }, 10);
          lastAutoScrollX = x;
          lastAutoScrollY = y;
        }
      } else {
        if (!this.options.bubbleScroll || getParentAutoScrollElement(elem, true) === getWindowScrollingElement()) {
          clearAutoScrolls();
          return;
        }
        autoScroll(evt, this.options, getParentAutoScrollElement(elem, false), false);
      }
    }
  };
  return _extends(AutoScroll, {
    pluginName: "scroll",
    initializeByDefault: true
  });
}
function clearAutoScrolls() {
  autoScrolls.forEach(function(autoScroll2) {
    clearInterval(autoScroll2.pid);
  });
  autoScrolls = [];
}
function clearPointerElemChangedInterval() {
  clearInterval(pointerElemChangedInterval);
}
var autoScroll = throttle(function(evt, options, rootEl2, isFallback) {
  if (!options.scroll) return;
  var x = (evt.touches ? evt.touches[0] : evt).clientX, y = (evt.touches ? evt.touches[0] : evt).clientY, sens = options.scrollSensitivity, speed = options.scrollSpeed, winScroller = getWindowScrollingElement();
  var scrollThisInstance = false, scrollCustomFn;
  if (scrollRootEl !== rootEl2) {
    scrollRootEl = rootEl2;
    clearAutoScrolls();
    scrollEl = options.scroll;
    scrollCustomFn = options.scrollFn;
    if (scrollEl === true) {
      scrollEl = getParentAutoScrollElement(rootEl2, true);
    }
  }
  var layersOut = 0;
  var currentParent = scrollEl;
  do {
    var el = currentParent, rect = getRect(el), top = rect.top, bottom = rect.bottom, left = rect.left, right = rect.right, width = rect.width, height = rect.height, canScrollX = void 0, canScrollY = void 0, scrollWidth = el.scrollWidth, scrollHeight = el.scrollHeight, elCSS = css(el), scrollPosX = el.scrollLeft, scrollPosY = el.scrollTop;
    if (el === winScroller) {
      canScrollX = width < scrollWidth && (elCSS.overflowX === "auto" || elCSS.overflowX === "scroll" || elCSS.overflowX === "visible");
      canScrollY = height < scrollHeight && (elCSS.overflowY === "auto" || elCSS.overflowY === "scroll" || elCSS.overflowY === "visible");
    } else {
      canScrollX = width < scrollWidth && (elCSS.overflowX === "auto" || elCSS.overflowX === "scroll");
      canScrollY = height < scrollHeight && (elCSS.overflowY === "auto" || elCSS.overflowY === "scroll");
    }
    var vx = canScrollX && (Math.abs(right - x) <= sens && scrollPosX + width < scrollWidth) - (Math.abs(left - x) <= sens && !!scrollPosX);
    var vy = canScrollY && (Math.abs(bottom - y) <= sens && scrollPosY + height < scrollHeight) - (Math.abs(top - y) <= sens && !!scrollPosY);
    if (!autoScrolls[layersOut]) {
      for (var i = 0; i <= layersOut; i++) {
        if (!autoScrolls[i]) {
          autoScrolls[i] = {};
        }
      }
    }
    if (autoScrolls[layersOut].vx != vx || autoScrolls[layersOut].vy != vy || autoScrolls[layersOut].el !== el) {
      autoScrolls[layersOut].el = el;
      autoScrolls[layersOut].vx = vx;
      autoScrolls[layersOut].vy = vy;
      clearInterval(autoScrolls[layersOut].pid);
      if (vx != 0 || vy != 0) {
        scrollThisInstance = true;
        autoScrolls[layersOut].pid = setInterval(function() {
          if (isFallback && this.layer === 0) {
            Sortable.active._onTouchMove(touchEvt$1);
          }
          var scrollOffsetY = autoScrolls[this.layer].vy ? autoScrolls[this.layer].vy * speed : 0;
          var scrollOffsetX = autoScrolls[this.layer].vx ? autoScrolls[this.layer].vx * speed : 0;
          if (typeof scrollCustomFn === "function") {
            if (scrollCustomFn.call(Sortable.dragged.parentNode[expando], scrollOffsetX, scrollOffsetY, evt, touchEvt$1, autoScrolls[this.layer].el) !== "continue") {
              return;
            }
          }
          scrollBy(autoScrolls[this.layer].el, scrollOffsetX, scrollOffsetY);
        }.bind({
          layer: layersOut
        }), 24);
      }
    }
    layersOut++;
  } while (options.bubbleScroll && currentParent !== winScroller && (currentParent = getParentAutoScrollElement(currentParent, false)));
  scrolling = scrollThisInstance;
}, 30);
var drop = function drop2(_ref) {
  var originalEvent = _ref.originalEvent, putSortable2 = _ref.putSortable, dragEl2 = _ref.dragEl, activeSortable = _ref.activeSortable, dispatchSortableEvent = _ref.dispatchSortableEvent, hideGhostForTarget = _ref.hideGhostForTarget, unhideGhostForTarget = _ref.unhideGhostForTarget;
  if (!originalEvent) return;
  var toSortable = putSortable2 || activeSortable;
  hideGhostForTarget();
  var touch = originalEvent.changedTouches && originalEvent.changedTouches.length ? originalEvent.changedTouches[0] : originalEvent;
  var target = document.elementFromPoint(touch.clientX, touch.clientY);
  unhideGhostForTarget();
  if (toSortable && !toSortable.el.contains(target)) {
    dispatchSortableEvent("spill");
    this.onSpill({
      dragEl: dragEl2,
      putSortable: putSortable2
    });
  }
};
function Revert() {
}
Revert.prototype = {
  startIndex: null,
  dragStart: function dragStart(_ref2) {
    var oldDraggableIndex2 = _ref2.oldDraggableIndex;
    this.startIndex = oldDraggableIndex2;
  },
  onSpill: function onSpill(_ref3) {
    var dragEl2 = _ref3.dragEl, putSortable2 = _ref3.putSortable;
    this.sortable.captureAnimationState();
    if (putSortable2) {
      putSortable2.captureAnimationState();
    }
    var nextSibling = getChild(this.sortable.el, this.startIndex, this.options);
    if (nextSibling) {
      this.sortable.el.insertBefore(dragEl2, nextSibling);
    } else {
      this.sortable.el.appendChild(dragEl2);
    }
    this.sortable.animateAll();
    if (putSortable2) {
      putSortable2.animateAll();
    }
  },
  drop
};
_extends(Revert, {
  pluginName: "revertOnSpill"
});
function Remove() {
}
Remove.prototype = {
  onSpill: function onSpill2(_ref4) {
    var dragEl2 = _ref4.dragEl, putSortable2 = _ref4.putSortable;
    var parentSortable = putSortable2 || this.sortable;
    parentSortable.captureAnimationState();
    dragEl2.parentNode && dragEl2.parentNode.removeChild(dragEl2);
    parentSortable.animateAll();
  },
  drop
};
_extends(Remove, {
  pluginName: "removeOnSpill"
});
var lastSwapEl;
function SwapPlugin() {
  function Swap() {
    this.defaults = {
      swapClass: "sortable-swap-highlight"
    };
  }
  Swap.prototype = {
    dragStart: function dragStart2(_ref) {
      var dragEl2 = _ref.dragEl;
      lastSwapEl = dragEl2;
    },
    dragOverValid: function dragOverValid(_ref2) {
      var completed = _ref2.completed, target = _ref2.target, onMove = _ref2.onMove, activeSortable = _ref2.activeSortable, changed = _ref2.changed, cancel = _ref2.cancel;
      if (!activeSortable.options.swap) return;
      var el = this.sortable.el, options = this.options;
      if (target && target !== el) {
        var prevSwapEl = lastSwapEl;
        if (onMove(target) !== false) {
          toggleClass(target, options.swapClass, true);
          lastSwapEl = target;
        } else {
          lastSwapEl = null;
        }
        if (prevSwapEl && prevSwapEl !== lastSwapEl) {
          toggleClass(prevSwapEl, options.swapClass, false);
        }
      }
      changed();
      completed(true);
      cancel();
    },
    drop: function drop3(_ref3) {
      var activeSortable = _ref3.activeSortable, putSortable2 = _ref3.putSortable, dragEl2 = _ref3.dragEl;
      var toSortable = putSortable2 || this.sortable;
      var options = this.options;
      lastSwapEl && toggleClass(lastSwapEl, options.swapClass, false);
      if (lastSwapEl && (options.swap || putSortable2 && putSortable2.options.swap)) {
        if (dragEl2 !== lastSwapEl) {
          toSortable.captureAnimationState();
          if (toSortable !== activeSortable) activeSortable.captureAnimationState();
          swapNodes(dragEl2, lastSwapEl);
          toSortable.animateAll();
          if (toSortable !== activeSortable) activeSortable.animateAll();
        }
      }
    },
    nulling: function nulling() {
      lastSwapEl = null;
    }
  };
  return _extends(Swap, {
    pluginName: "swap",
    eventProperties: function eventProperties() {
      return {
        swapItem: lastSwapEl
      };
    }
  });
}
function swapNodes(n1, n2) {
  var p1 = n1.parentNode, p2 = n2.parentNode, i1, i2;
  if (!p1 || !p2 || p1.isEqualNode(n2) || p2.isEqualNode(n1)) return;
  i1 = index(n1);
  i2 = index(n2);
  if (p1.isEqualNode(p2) && i1 < i2) {
    i2++;
  }
  p1.insertBefore(n2, p1.children[i1]);
  p2.insertBefore(n1, p2.children[i2]);
}
var multiDragElements = [], multiDragClones = [], lastMultiDragSelect, multiDragSortable, initialFolding = false, folding = false, dragStarted = false, dragEl$1, clonesFromRect, clonesHidden;
function MultiDragPlugin() {
  function MultiDrag(sortable) {
    for (var fn in this) {
      if (fn.charAt(0) === "_" && typeof this[fn] === "function") {
        this[fn] = this[fn].bind(this);
      }
    }
    if (sortable.options.supportPointer) {
      on(document, "pointerup", this._deselectMultiDrag);
    } else {
      on(document, "mouseup", this._deselectMultiDrag);
      on(document, "touchend", this._deselectMultiDrag);
    }
    on(document, "keydown", this._checkKeyDown);
    on(document, "keyup", this._checkKeyUp);
    this.defaults = {
      selectedClass: "sortable-selected",
      multiDragKey: null,
      setData: function setData(dataTransfer, dragEl2) {
        var data = "";
        if (multiDragElements.length && multiDragSortable === sortable) {
          multiDragElements.forEach(function(multiDragElement, i) {
            data += (!i ? "" : ", ") + multiDragElement.textContent;
          });
        } else {
          data = dragEl2.textContent;
        }
        dataTransfer.setData("Text", data);
      }
    };
  }
  MultiDrag.prototype = {
    multiDragKeyDown: false,
    isMultiDrag: false,
    delayStartGlobal: function delayStartGlobal(_ref) {
      var dragged = _ref.dragEl;
      dragEl$1 = dragged;
    },
    delayEnded: function delayEnded() {
      this.isMultiDrag = ~multiDragElements.indexOf(dragEl$1);
    },
    setupClone: function setupClone(_ref2) {
      var sortable = _ref2.sortable, cancel = _ref2.cancel;
      if (!this.isMultiDrag) return;
      for (var i = 0; i < multiDragElements.length; i++) {
        multiDragClones.push(clone(multiDragElements[i]));
        multiDragClones[i].sortableIndex = multiDragElements[i].sortableIndex;
        multiDragClones[i].draggable = false;
        multiDragClones[i].style["will-change"] = "";
        toggleClass(multiDragClones[i], this.options.selectedClass, false);
        multiDragElements[i] === dragEl$1 && toggleClass(multiDragClones[i], this.options.chosenClass, false);
      }
      sortable._hideClone();
      cancel();
    },
    clone: function clone2(_ref3) {
      var sortable = _ref3.sortable, rootEl2 = _ref3.rootEl, dispatchSortableEvent = _ref3.dispatchSortableEvent, cancel = _ref3.cancel;
      if (!this.isMultiDrag) return;
      if (!this.options.removeCloneOnHide) {
        if (multiDragElements.length && multiDragSortable === sortable) {
          insertMultiDragClones(true, rootEl2);
          dispatchSortableEvent("clone");
          cancel();
        }
      }
    },
    showClone: function showClone(_ref4) {
      var cloneNowShown = _ref4.cloneNowShown, rootEl2 = _ref4.rootEl, cancel = _ref4.cancel;
      if (!this.isMultiDrag) return;
      insertMultiDragClones(false, rootEl2);
      multiDragClones.forEach(function(clone2) {
        css(clone2, "display", "");
      });
      cloneNowShown();
      clonesHidden = false;
      cancel();
    },
    hideClone: function hideClone(_ref5) {
      var _this = this;
      _ref5.sortable;
      var cloneNowHidden = _ref5.cloneNowHidden, cancel = _ref5.cancel;
      if (!this.isMultiDrag) return;
      multiDragClones.forEach(function(clone2) {
        css(clone2, "display", "none");
        if (_this.options.removeCloneOnHide && clone2.parentNode) {
          clone2.parentNode.removeChild(clone2);
        }
      });
      cloneNowHidden();
      clonesHidden = true;
      cancel();
    },
    dragStartGlobal: function dragStartGlobal(_ref6) {
      _ref6.sortable;
      if (!this.isMultiDrag && multiDragSortable) {
        multiDragSortable.multiDrag._deselectMultiDrag();
      }
      multiDragElements.forEach(function(multiDragElement) {
        multiDragElement.sortableIndex = index(multiDragElement);
      });
      multiDragElements = multiDragElements.sort(function(a, b) {
        return a.sortableIndex - b.sortableIndex;
      });
      dragStarted = true;
    },
    dragStarted: function dragStarted2(_ref7) {
      var _this2 = this;
      var sortable = _ref7.sortable;
      if (!this.isMultiDrag) return;
      if (this.options.sort) {
        sortable.captureAnimationState();
        if (this.options.animation) {
          multiDragElements.forEach(function(multiDragElement) {
            if (multiDragElement === dragEl$1) return;
            css(multiDragElement, "position", "absolute");
          });
          var dragRect = getRect(dragEl$1, false, true, true);
          multiDragElements.forEach(function(multiDragElement) {
            if (multiDragElement === dragEl$1) return;
            setRect(multiDragElement, dragRect);
          });
          folding = true;
          initialFolding = true;
        }
      }
      sortable.animateAll(function() {
        folding = false;
        initialFolding = false;
        if (_this2.options.animation) {
          multiDragElements.forEach(function(multiDragElement) {
            unsetRect(multiDragElement);
          });
        }
        if (_this2.options.sort) {
          removeMultiDragElements();
        }
      });
    },
    dragOver: function dragOver(_ref8) {
      var target = _ref8.target, completed = _ref8.completed, cancel = _ref8.cancel;
      if (folding && ~multiDragElements.indexOf(target)) {
        completed(false);
        cancel();
      }
    },
    revert: function revert(_ref9) {
      var fromSortable = _ref9.fromSortable, rootEl2 = _ref9.rootEl, sortable = _ref9.sortable, dragRect = _ref9.dragRect;
      if (multiDragElements.length > 1) {
        multiDragElements.forEach(function(multiDragElement) {
          sortable.addAnimationState({
            target: multiDragElement,
            rect: folding ? getRect(multiDragElement) : dragRect
          });
          unsetRect(multiDragElement);
          multiDragElement.fromRect = dragRect;
          fromSortable.removeAnimationState(multiDragElement);
        });
        folding = false;
        insertMultiDragElements(!this.options.removeCloneOnHide, rootEl2);
      }
    },
    dragOverCompleted: function dragOverCompleted(_ref10) {
      var sortable = _ref10.sortable, isOwner = _ref10.isOwner, insertion = _ref10.insertion, activeSortable = _ref10.activeSortable, parentEl2 = _ref10.parentEl, putSortable2 = _ref10.putSortable;
      var options = this.options;
      if (insertion) {
        if (isOwner) {
          activeSortable._hideClone();
        }
        initialFolding = false;
        if (options.animation && multiDragElements.length > 1 && (folding || !isOwner && !activeSortable.options.sort && !putSortable2)) {
          var dragRectAbsolute = getRect(dragEl$1, false, true, true);
          multiDragElements.forEach(function(multiDragElement) {
            if (multiDragElement === dragEl$1) return;
            setRect(multiDragElement, dragRectAbsolute);
            parentEl2.appendChild(multiDragElement);
          });
          folding = true;
        }
        if (!isOwner) {
          if (!folding) {
            removeMultiDragElements();
          }
          if (multiDragElements.length > 1) {
            var clonesHiddenBefore = clonesHidden;
            activeSortable._showClone(sortable);
            if (activeSortable.options.animation && !clonesHidden && clonesHiddenBefore) {
              multiDragClones.forEach(function(clone2) {
                activeSortable.addAnimationState({
                  target: clone2,
                  rect: clonesFromRect
                });
                clone2.fromRect = clonesFromRect;
                clone2.thisAnimationDuration = null;
              });
            }
          } else {
            activeSortable._showClone(sortable);
          }
        }
      }
    },
    dragOverAnimationCapture: function dragOverAnimationCapture(_ref11) {
      var dragRect = _ref11.dragRect, isOwner = _ref11.isOwner, activeSortable = _ref11.activeSortable;
      multiDragElements.forEach(function(multiDragElement) {
        multiDragElement.thisAnimationDuration = null;
      });
      if (activeSortable.options.animation && !isOwner && activeSortable.multiDrag.isMultiDrag) {
        clonesFromRect = _extends({}, dragRect);
        var dragMatrix = matrix(dragEl$1, true);
        clonesFromRect.top -= dragMatrix.f;
        clonesFromRect.left -= dragMatrix.e;
      }
    },
    dragOverAnimationComplete: function dragOverAnimationComplete() {
      if (folding) {
        folding = false;
        removeMultiDragElements();
      }
    },
    drop: function drop3(_ref12) {
      var evt = _ref12.originalEvent, rootEl2 = _ref12.rootEl, parentEl2 = _ref12.parentEl, sortable = _ref12.sortable, dispatchSortableEvent = _ref12.dispatchSortableEvent, oldIndex2 = _ref12.oldIndex, putSortable2 = _ref12.putSortable;
      var toSortable = putSortable2 || this.sortable;
      if (!evt) return;
      var options = this.options, children = parentEl2.children;
      if (!dragStarted) {
        if (options.multiDragKey && !this.multiDragKeyDown) {
          this._deselectMultiDrag();
        }
        toggleClass(dragEl$1, options.selectedClass, !~multiDragElements.indexOf(dragEl$1));
        if (!~multiDragElements.indexOf(dragEl$1)) {
          multiDragElements.push(dragEl$1);
          dispatchEvent({
            sortable,
            rootEl: rootEl2,
            name: "select",
            targetEl: dragEl$1
          });
          if (evt.shiftKey && lastMultiDragSelect && sortable.el.contains(lastMultiDragSelect)) {
            var lastIndex = index(lastMultiDragSelect), currentIndex = index(dragEl$1);
            if (~lastIndex && ~currentIndex && lastIndex !== currentIndex) {
              var n, i;
              if (currentIndex > lastIndex) {
                i = lastIndex;
                n = currentIndex;
              } else {
                i = currentIndex;
                n = lastIndex + 1;
              }
              for (; i < n; i++) {
                if (~multiDragElements.indexOf(children[i])) continue;
                toggleClass(children[i], options.selectedClass, true);
                multiDragElements.push(children[i]);
                dispatchEvent({
                  sortable,
                  rootEl: rootEl2,
                  name: "select",
                  targetEl: children[i]
                });
              }
            }
          } else {
            lastMultiDragSelect = dragEl$1;
          }
          multiDragSortable = toSortable;
        } else {
          multiDragElements.splice(multiDragElements.indexOf(dragEl$1), 1);
          lastMultiDragSelect = null;
          dispatchEvent({
            sortable,
            rootEl: rootEl2,
            name: "deselect",
            targetEl: dragEl$1
          });
        }
      }
      if (dragStarted && this.isMultiDrag) {
        folding = false;
        if ((parentEl2[expando].options.sort || parentEl2 !== rootEl2) && multiDragElements.length > 1) {
          var dragRect = getRect(dragEl$1), multiDragIndex = index(dragEl$1, ":not(." + this.options.selectedClass + ")");
          if (!initialFolding && options.animation) dragEl$1.thisAnimationDuration = null;
          toSortable.captureAnimationState();
          if (!initialFolding) {
            if (options.animation) {
              dragEl$1.fromRect = dragRect;
              multiDragElements.forEach(function(multiDragElement) {
                multiDragElement.thisAnimationDuration = null;
                if (multiDragElement !== dragEl$1) {
                  var rect = folding ? getRect(multiDragElement) : dragRect;
                  multiDragElement.fromRect = rect;
                  toSortable.addAnimationState({
                    target: multiDragElement,
                    rect
                  });
                }
              });
            }
            removeMultiDragElements();
            multiDragElements.forEach(function(multiDragElement) {
              if (children[multiDragIndex]) {
                parentEl2.insertBefore(multiDragElement, children[multiDragIndex]);
              } else {
                parentEl2.appendChild(multiDragElement);
              }
              multiDragIndex++;
            });
            if (oldIndex2 === index(dragEl$1)) {
              var update = false;
              multiDragElements.forEach(function(multiDragElement) {
                if (multiDragElement.sortableIndex !== index(multiDragElement)) {
                  update = true;
                  return;
                }
              });
              if (update) {
                dispatchSortableEvent("update");
              }
            }
          }
          multiDragElements.forEach(function(multiDragElement) {
            unsetRect(multiDragElement);
          });
          toSortable.animateAll();
        }
        multiDragSortable = toSortable;
      }
      if (rootEl2 === parentEl2 || putSortable2 && putSortable2.lastPutMode !== "clone") {
        multiDragClones.forEach(function(clone2) {
          clone2.parentNode && clone2.parentNode.removeChild(clone2);
        });
      }
    },
    nullingGlobal: function nullingGlobal() {
      this.isMultiDrag = dragStarted = false;
      multiDragClones.length = 0;
    },
    destroyGlobal: function destroyGlobal() {
      this._deselectMultiDrag();
      off(document, "pointerup", this._deselectMultiDrag);
      off(document, "mouseup", this._deselectMultiDrag);
      off(document, "touchend", this._deselectMultiDrag);
      off(document, "keydown", this._checkKeyDown);
      off(document, "keyup", this._checkKeyUp);
    },
    _deselectMultiDrag: function _deselectMultiDrag(evt) {
      if (typeof dragStarted !== "undefined" && dragStarted) return;
      if (multiDragSortable !== this.sortable) return;
      if (evt && closest(evt.target, this.options.draggable, this.sortable.el, false)) return;
      if (evt && evt.button !== 0) return;
      while (multiDragElements.length) {
        var el = multiDragElements[0];
        toggleClass(el, this.options.selectedClass, false);
        multiDragElements.shift();
        dispatchEvent({
          sortable: this.sortable,
          rootEl: this.sortable.el,
          name: "deselect",
          targetEl: el
        });
      }
    },
    _checkKeyDown: function _checkKeyDown(evt) {
      if (evt.key === this.options.multiDragKey) {
        this.multiDragKeyDown = true;
      }
    },
    _checkKeyUp: function _checkKeyUp(evt) {
      if (evt.key === this.options.multiDragKey) {
        this.multiDragKeyDown = false;
      }
    }
  };
  return _extends(MultiDrag, {
    // Static methods & properties
    pluginName: "multiDrag",
    utils: {
      /**
       * Selects the provided multi-drag item
       * @param  {HTMLElement} el    The element to be selected
       */
      select: function select(el) {
        var sortable = el.parentNode[expando];
        if (!sortable || !sortable.options.multiDrag || ~multiDragElements.indexOf(el)) return;
        if (multiDragSortable && multiDragSortable !== sortable) {
          multiDragSortable.multiDrag._deselectMultiDrag();
          multiDragSortable = sortable;
        }
        toggleClass(el, sortable.options.selectedClass, true);
        multiDragElements.push(el);
      },
      /**
       * Deselects the provided multi-drag item
       * @param  {HTMLElement} el    The element to be deselected
       */
      deselect: function deselect(el) {
        var sortable = el.parentNode[expando], index2 = multiDragElements.indexOf(el);
        if (!sortable || !sortable.options.multiDrag || !~index2) return;
        toggleClass(el, sortable.options.selectedClass, false);
        multiDragElements.splice(index2, 1);
      }
    },
    eventProperties: function eventProperties() {
      var _this3 = this;
      var oldIndicies = [], newIndicies = [];
      multiDragElements.forEach(function(multiDragElement) {
        oldIndicies.push({
          multiDragElement,
          index: multiDragElement.sortableIndex
        });
        var newIndex2;
        if (folding && multiDragElement !== dragEl$1) {
          newIndex2 = -1;
        } else if (folding) {
          newIndex2 = index(multiDragElement, ":not(." + _this3.options.selectedClass + ")");
        } else {
          newIndex2 = index(multiDragElement);
        }
        newIndicies.push({
          multiDragElement,
          index: newIndex2
        });
      });
      return {
        items: _toConsumableArray(multiDragElements),
        clones: [].concat(multiDragClones),
        oldIndicies,
        newIndicies
      };
    },
    optionListeners: {
      multiDragKey: function multiDragKey(key) {
        key = key.toLowerCase();
        if (key === "ctrl") {
          key = "Control";
        } else if (key.length > 1) {
          key = key.charAt(0).toUpperCase() + key.substr(1);
        }
        return key;
      }
    }
  });
}
function insertMultiDragElements(clonesInserted, rootEl2) {
  multiDragElements.forEach(function(multiDragElement, i) {
    var target = rootEl2.children[multiDragElement.sortableIndex + (clonesInserted ? Number(i) : 0)];
    if (target) {
      rootEl2.insertBefore(multiDragElement, target);
    } else {
      rootEl2.appendChild(multiDragElement);
    }
  });
}
function insertMultiDragClones(elementsInserted, rootEl2) {
  multiDragClones.forEach(function(clone2, i) {
    var target = rootEl2.children[clone2.sortableIndex + (elementsInserted ? Number(i) : 0)];
    if (target) {
      rootEl2.insertBefore(clone2, target);
    } else {
      rootEl2.appendChild(clone2);
    }
  });
}
function removeMultiDragElements() {
  multiDragElements.forEach(function(multiDragElement) {
    if (multiDragElement === dragEl$1) return;
    multiDragElement.parentNode && multiDragElement.parentNode.removeChild(multiDragElement);
  });
}
Sortable.mount(new AutoScrollPlugin());
Sortable.mount(Remove, Revert);
const sortable_esm = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  MultiDrag: MultiDragPlugin,
  Sortable,
  Swap: SwapPlugin,
  default: Sortable
}, Symbol.toStringTag, { value: "Module" }));
const require$$1 = /* @__PURE__ */ getAugmentedNamespace(sortable_esm);
(function(module, exports$1) {
  (function webpackUniversalModuleDefinition(root, factory) {
    module.exports = factory(require$$0, require$$1);
  })(typeof self !== "undefined" ? self : commonjsGlobal, function(__WEBPACK_EXTERNAL_MODULE__8bbf__, __WEBPACK_EXTERNAL_MODULE_a352__) {
    return (
      /******/
      function(modules) {
        var installedModules = {};
        function __webpack_require__(moduleId) {
          if (installedModules[moduleId]) {
            return installedModules[moduleId].exports;
          }
          var module2 = installedModules[moduleId] = {
            /******/
            i: moduleId,
            /******/
            l: false,
            /******/
            exports: {}
            /******/
          };
          modules[moduleId].call(module2.exports, module2, module2.exports, __webpack_require__);
          module2.l = true;
          return module2.exports;
        }
        __webpack_require__.m = modules;
        __webpack_require__.c = installedModules;
        __webpack_require__.d = function(exports$12, name, getter) {
          if (!__webpack_require__.o(exports$12, name)) {
            Object.defineProperty(exports$12, name, { enumerable: true, get: getter });
          }
        };
        __webpack_require__.r = function(exports$12) {
          if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            Object.defineProperty(exports$12, Symbol.toStringTag, { value: "Module" });
          }
          Object.defineProperty(exports$12, "__esModule", { value: true });
        };
        __webpack_require__.t = function(value, mode) {
          if (mode & 1) value = __webpack_require__(value);
          if (mode & 8) return value;
          if (mode & 4 && typeof value === "object" && value && value.__esModule) return value;
          var ns = /* @__PURE__ */ Object.create(null);
          __webpack_require__.r(ns);
          Object.defineProperty(ns, "default", { enumerable: true, value });
          if (mode & 2 && typeof value != "string") for (var key in value) __webpack_require__.d(ns, key, function(key2) {
            return value[key2];
          }.bind(null, key));
          return ns;
        };
        __webpack_require__.n = function(module2) {
          var getter = module2 && module2.__esModule ? (
            /******/
            function getDefault() {
              return module2["default"];
            }
          ) : (
            /******/
            function getModuleExports() {
              return module2;
            }
          );
          __webpack_require__.d(getter, "a", getter);
          return getter;
        };
        __webpack_require__.o = function(object, property) {
          return Object.prototype.hasOwnProperty.call(object, property);
        };
        __webpack_require__.p = "";
        return __webpack_require__(__webpack_require__.s = "fb15");
      }({
        /***/
        "00ee": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var wellKnownSymbol = __webpack_require__("b622");
            var TO_STRING_TAG = wellKnownSymbol("toStringTag");
            var test = {};
            test[TO_STRING_TAG] = "z";
            module2.exports = String(test) === "[object z]";
          }
        ),
        /***/
        "0366": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var aFunction = __webpack_require__("1c0b");
            module2.exports = function(fn, that, length) {
              aFunction(fn);
              if (that === void 0) return fn;
              switch (length) {
                case 0:
                  return function() {
                    return fn.call(that);
                  };
                case 1:
                  return function(a) {
                    return fn.call(that, a);
                  };
                case 2:
                  return function(a, b) {
                    return fn.call(that, a, b);
                  };
                case 3:
                  return function(a, b, c) {
                    return fn.call(that, a, b, c);
                  };
              }
              return function() {
                return fn.apply(that, arguments);
              };
            };
          }
        ),
        /***/
        "057f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toIndexedObject = __webpack_require__("fc6a");
            var nativeGetOwnPropertyNames = __webpack_require__("241c").f;
            var toString = {}.toString;
            var windowNames = typeof window == "object" && window && Object.getOwnPropertyNames ? Object.getOwnPropertyNames(window) : [];
            var getWindowNames = function(it) {
              try {
                return nativeGetOwnPropertyNames(it);
              } catch (error) {
                return windowNames.slice();
              }
            };
            module2.exports.f = function getOwnPropertyNames(it) {
              return windowNames && toString.call(it) == "[object Window]" ? getWindowNames(it) : nativeGetOwnPropertyNames(toIndexedObject(it));
            };
          }
        ),
        /***/
        "06cf": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var propertyIsEnumerableModule = __webpack_require__("d1e7");
            var createPropertyDescriptor = __webpack_require__("5c6c");
            var toIndexedObject = __webpack_require__("fc6a");
            var toPrimitive = __webpack_require__("c04e");
            var has = __webpack_require__("5135");
            var IE8_DOM_DEFINE = __webpack_require__("0cfb");
            var nativeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
            exports$12.f = DESCRIPTORS ? nativeGetOwnPropertyDescriptor : function getOwnPropertyDescriptor(O, P) {
              O = toIndexedObject(O);
              P = toPrimitive(P, true);
              if (IE8_DOM_DEFINE) try {
                return nativeGetOwnPropertyDescriptor(O, P);
              } catch (error) {
              }
              if (has(O, P)) return createPropertyDescriptor(!propertyIsEnumerableModule.f.call(O, P), O[P]);
            };
          }
        ),
        /***/
        "0cfb": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var fails = __webpack_require__("d039");
            var createElement = __webpack_require__("cc12");
            module2.exports = !DESCRIPTORS && !fails(function() {
              return Object.defineProperty(createElement("div"), "a", {
                get: function() {
                  return 7;
                }
              }).a != 7;
            });
          }
        ),
        /***/
        "13d5": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $reduce = __webpack_require__("d58f").left;
            var arrayMethodIsStrict = __webpack_require__("a640");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var STRICT_METHOD = arrayMethodIsStrict("reduce");
            var USES_TO_LENGTH = arrayMethodUsesToLength("reduce", { 1: 0 });
            $({ target: "Array", proto: true, forced: !STRICT_METHOD || !USES_TO_LENGTH }, {
              reduce: function reduce(callbackfn) {
                return $reduce(this, callbackfn, arguments.length, arguments.length > 1 ? arguments[1] : void 0);
              }
            });
          }
        ),
        /***/
        "14c3": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var classof = __webpack_require__("c6b6");
            var regexpExec = __webpack_require__("9263");
            module2.exports = function(R, S) {
              var exec = R.exec;
              if (typeof exec === "function") {
                var result = exec.call(R, S);
                if (typeof result !== "object") {
                  throw TypeError("RegExp exec method returned something other than an Object or null");
                }
                return result;
              }
              if (classof(R) !== "RegExp") {
                throw TypeError("RegExp#exec called on incompatible receiver");
              }
              return regexpExec.call(R, S);
            };
          }
        ),
        /***/
        "159b": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var DOMIterables = __webpack_require__("fdbc");
            var forEach = __webpack_require__("17c2");
            var createNonEnumerableProperty = __webpack_require__("9112");
            for (var COLLECTION_NAME in DOMIterables) {
              var Collection = global[COLLECTION_NAME];
              var CollectionPrototype = Collection && Collection.prototype;
              if (CollectionPrototype && CollectionPrototype.forEach !== forEach) try {
                createNonEnumerableProperty(CollectionPrototype, "forEach", forEach);
              } catch (error) {
                CollectionPrototype.forEach = forEach;
              }
            }
          }
        ),
        /***/
        "17c2": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $forEach = __webpack_require__("b727").forEach;
            var arrayMethodIsStrict = __webpack_require__("a640");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var STRICT_METHOD = arrayMethodIsStrict("forEach");
            var USES_TO_LENGTH = arrayMethodUsesToLength("forEach");
            module2.exports = !STRICT_METHOD || !USES_TO_LENGTH ? function forEach(callbackfn) {
              return $forEach(this, callbackfn, arguments.length > 1 ? arguments[1] : void 0);
            } : [].forEach;
          }
        ),
        /***/
        "1be4": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var getBuiltIn = __webpack_require__("d066");
            module2.exports = getBuiltIn("document", "documentElement");
          }
        ),
        /***/
        "1c0b": (
          /***/
          function(module2, exports$12) {
            module2.exports = function(it) {
              if (typeof it != "function") {
                throw TypeError(String(it) + " is not a function");
              }
              return it;
            };
          }
        ),
        /***/
        "1c7e": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var wellKnownSymbol = __webpack_require__("b622");
            var ITERATOR = wellKnownSymbol("iterator");
            var SAFE_CLOSING = false;
            try {
              var called = 0;
              var iteratorWithReturn = {
                next: function() {
                  return { done: !!called++ };
                },
                "return": function() {
                  SAFE_CLOSING = true;
                }
              };
              iteratorWithReturn[ITERATOR] = function() {
                return this;
              };
              Array.from(iteratorWithReturn, function() {
                throw 2;
              });
            } catch (error) {
            }
            module2.exports = function(exec, SKIP_CLOSING) {
              if (!SKIP_CLOSING && !SAFE_CLOSING) return false;
              var ITERATION_SUPPORT = false;
              try {
                var object = {};
                object[ITERATOR] = function() {
                  return {
                    next: function() {
                      return { done: ITERATION_SUPPORT = true };
                    }
                  };
                };
                exec(object);
              } catch (error) {
              }
              return ITERATION_SUPPORT;
            };
          }
        ),
        /***/
        "1d80": (
          /***/
          function(module2, exports$12) {
            module2.exports = function(it) {
              if (it == void 0) throw TypeError("Can't call method on " + it);
              return it;
            };
          }
        ),
        /***/
        "1dde": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            var wellKnownSymbol = __webpack_require__("b622");
            var V8_VERSION = __webpack_require__("2d00");
            var SPECIES = wellKnownSymbol("species");
            module2.exports = function(METHOD_NAME) {
              return V8_VERSION >= 51 || !fails(function() {
                var array = [];
                var constructor = array.constructor = {};
                constructor[SPECIES] = function() {
                  return { foo: 1 };
                };
                return array[METHOD_NAME](Boolean).foo !== 1;
              });
            };
          }
        ),
        /***/
        "23cb": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toInteger = __webpack_require__("a691");
            var max = Math.max;
            var min = Math.min;
            module2.exports = function(index2, length) {
              var integer = toInteger(index2);
              return integer < 0 ? max(integer + length, 0) : min(integer, length);
            };
          }
        ),
        /***/
        "23e7": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var getOwnPropertyDescriptor = __webpack_require__("06cf").f;
            var createNonEnumerableProperty = __webpack_require__("9112");
            var redefine = __webpack_require__("6eeb");
            var setGlobal = __webpack_require__("ce4e");
            var copyConstructorProperties = __webpack_require__("e893");
            var isForced = __webpack_require__("94ca");
            module2.exports = function(options, source) {
              var TARGET = options.target;
              var GLOBAL = options.global;
              var STATIC = options.stat;
              var FORCED, target, key, targetProperty, sourceProperty, descriptor;
              if (GLOBAL) {
                target = global;
              } else if (STATIC) {
                target = global[TARGET] || setGlobal(TARGET, {});
              } else {
                target = (global[TARGET] || {}).prototype;
              }
              if (target) for (key in source) {
                sourceProperty = source[key];
                if (options.noTargetGet) {
                  descriptor = getOwnPropertyDescriptor(target, key);
                  targetProperty = descriptor && descriptor.value;
                } else targetProperty = target[key];
                FORCED = isForced(GLOBAL ? key : TARGET + (STATIC ? "." : "#") + key, options.forced);
                if (!FORCED && targetProperty !== void 0) {
                  if (typeof sourceProperty === typeof targetProperty) continue;
                  copyConstructorProperties(sourceProperty, targetProperty);
                }
                if (options.sham || targetProperty && targetProperty.sham) {
                  createNonEnumerableProperty(sourceProperty, "sham", true);
                }
                redefine(target, key, sourceProperty, options);
              }
            };
          }
        ),
        /***/
        "241c": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var internalObjectKeys = __webpack_require__("ca84");
            var enumBugKeys = __webpack_require__("7839");
            var hiddenKeys = enumBugKeys.concat("length", "prototype");
            exports$12.f = Object.getOwnPropertyNames || function getOwnPropertyNames(O) {
              return internalObjectKeys(O, hiddenKeys);
            };
          }
        ),
        /***/
        "25f0": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var redefine = __webpack_require__("6eeb");
            var anObject = __webpack_require__("825a");
            var fails = __webpack_require__("d039");
            var flags = __webpack_require__("ad6d");
            var TO_STRING = "toString";
            var RegExpPrototype = RegExp.prototype;
            var nativeToString = RegExpPrototype[TO_STRING];
            var NOT_GENERIC = fails(function() {
              return nativeToString.call({ source: "a", flags: "b" }) != "/a/b";
            });
            var INCORRECT_NAME = nativeToString.name != TO_STRING;
            if (NOT_GENERIC || INCORRECT_NAME) {
              redefine(RegExp.prototype, TO_STRING, function toString() {
                var R = anObject(this);
                var p = String(R.source);
                var rf = R.flags;
                var f = String(rf === void 0 && R instanceof RegExp && !("flags" in RegExpPrototype) ? flags.call(R) : rf);
                return "/" + p + "/" + f;
              }, { unsafe: true });
            }
          }
        ),
        /***/
        "2ca0": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var getOwnPropertyDescriptor = __webpack_require__("06cf").f;
            var toLength = __webpack_require__("50c4");
            var notARegExp = __webpack_require__("5a34");
            var requireObjectCoercible = __webpack_require__("1d80");
            var correctIsRegExpLogic = __webpack_require__("ab13");
            var IS_PURE = __webpack_require__("c430");
            var nativeStartsWith = "".startsWith;
            var min = Math.min;
            var CORRECT_IS_REGEXP_LOGIC = correctIsRegExpLogic("startsWith");
            var MDN_POLYFILL_BUG = !IS_PURE && !CORRECT_IS_REGEXP_LOGIC && !!function() {
              var descriptor = getOwnPropertyDescriptor(String.prototype, "startsWith");
              return descriptor && !descriptor.writable;
            }();
            $({ target: "String", proto: true, forced: !MDN_POLYFILL_BUG && !CORRECT_IS_REGEXP_LOGIC }, {
              startsWith: function startsWith(searchString) {
                var that = String(requireObjectCoercible(this));
                notARegExp(searchString);
                var index2 = toLength(min(arguments.length > 1 ? arguments[1] : void 0, that.length));
                var search = String(searchString);
                return nativeStartsWith ? nativeStartsWith.call(that, search, index2) : that.slice(index2, index2 + search.length) === search;
              }
            });
          }
        ),
        /***/
        "2d00": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var userAgent2 = __webpack_require__("342f");
            var process = global.process;
            var versions = process && process.versions;
            var v8 = versions && versions.v8;
            var match, version2;
            if (v8) {
              match = v8.split(".");
              version2 = match[0] + match[1];
            } else if (userAgent2) {
              match = userAgent2.match(/Edge\/(\d+)/);
              if (!match || match[1] >= 74) {
                match = userAgent2.match(/Chrome\/(\d+)/);
                if (match) version2 = match[1];
              }
            }
            module2.exports = version2 && +version2;
          }
        ),
        /***/
        "342f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var getBuiltIn = __webpack_require__("d066");
            module2.exports = getBuiltIn("navigator", "userAgent") || "";
          }
        ),
        /***/
        "35a1": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var classof = __webpack_require__("f5df");
            var Iterators = __webpack_require__("3f8c");
            var wellKnownSymbol = __webpack_require__("b622");
            var ITERATOR = wellKnownSymbol("iterator");
            module2.exports = function(it) {
              if (it != void 0) return it[ITERATOR] || it["@@iterator"] || Iterators[classof(it)];
            };
          }
        ),
        /***/
        "37e8": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var definePropertyModule = __webpack_require__("9bf2");
            var anObject = __webpack_require__("825a");
            var objectKeys = __webpack_require__("df75");
            module2.exports = DESCRIPTORS ? Object.defineProperties : function defineProperties(O, Properties) {
              anObject(O);
              var keys = objectKeys(Properties);
              var length = keys.length;
              var index2 = 0;
              var key;
              while (length > index2) definePropertyModule.f(O, key = keys[index2++], Properties[key]);
              return O;
            };
          }
        ),
        /***/
        "3bbe": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isObject = __webpack_require__("861d");
            module2.exports = function(it) {
              if (!isObject(it) && it !== null) {
                throw TypeError("Can't set " + String(it) + " as a prototype");
              }
              return it;
            };
          }
        ),
        /***/
        "3ca3": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var charAt = __webpack_require__("6547").charAt;
            var InternalStateModule = __webpack_require__("69f3");
            var defineIterator = __webpack_require__("7dd0");
            var STRING_ITERATOR = "String Iterator";
            var setInternalState = InternalStateModule.set;
            var getInternalState = InternalStateModule.getterFor(STRING_ITERATOR);
            defineIterator(String, "String", function(iterated) {
              setInternalState(this, {
                type: STRING_ITERATOR,
                string: String(iterated),
                index: 0
              });
            }, function next() {
              var state = getInternalState(this);
              var string = state.string;
              var index2 = state.index;
              var point;
              if (index2 >= string.length) return { value: void 0, done: true };
              point = charAt(string, index2);
              state.index += point.length;
              return { value: point, done: false };
            });
          }
        ),
        /***/
        "3f8c": (
          /***/
          function(module2, exports$12) {
            module2.exports = {};
          }
        ),
        /***/
        "4160": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var forEach = __webpack_require__("17c2");
            $({ target: "Array", proto: true, forced: [].forEach != forEach }, {
              forEach
            });
          }
        ),
        /***/
        "428f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            module2.exports = global;
          }
        ),
        /***/
        "44ad": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            var classof = __webpack_require__("c6b6");
            var split = "".split;
            module2.exports = fails(function() {
              return !Object("z").propertyIsEnumerable(0);
            }) ? function(it) {
              return classof(it) == "String" ? split.call(it, "") : Object(it);
            } : Object;
          }
        ),
        /***/
        "44d2": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var wellKnownSymbol = __webpack_require__("b622");
            var create = __webpack_require__("7c73");
            var definePropertyModule = __webpack_require__("9bf2");
            var UNSCOPABLES = wellKnownSymbol("unscopables");
            var ArrayPrototype = Array.prototype;
            if (ArrayPrototype[UNSCOPABLES] == void 0) {
              definePropertyModule.f(ArrayPrototype, UNSCOPABLES, {
                configurable: true,
                value: create(null)
              });
            }
            module2.exports = function(key) {
              ArrayPrototype[UNSCOPABLES][key] = true;
            };
          }
        ),
        /***/
        "44e7": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isObject = __webpack_require__("861d");
            var classof = __webpack_require__("c6b6");
            var wellKnownSymbol = __webpack_require__("b622");
            var MATCH = wellKnownSymbol("match");
            module2.exports = function(it) {
              var isRegExp;
              return isObject(it) && ((isRegExp = it[MATCH]) !== void 0 ? !!isRegExp : classof(it) == "RegExp");
            };
          }
        ),
        /***/
        "4930": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            module2.exports = !!Object.getOwnPropertySymbols && !fails(function() {
              return !String(Symbol());
            });
          }
        ),
        /***/
        "4d64": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toIndexedObject = __webpack_require__("fc6a");
            var toLength = __webpack_require__("50c4");
            var toAbsoluteIndex = __webpack_require__("23cb");
            var createMethod = function(IS_INCLUDES) {
              return function($this, el, fromIndex) {
                var O = toIndexedObject($this);
                var length = toLength(O.length);
                var index2 = toAbsoluteIndex(fromIndex, length);
                var value;
                if (IS_INCLUDES && el != el) while (length > index2) {
                  value = O[index2++];
                  if (value != value) return true;
                }
                else for (; length > index2; index2++) {
                  if ((IS_INCLUDES || index2 in O) && O[index2] === el) return IS_INCLUDES || index2 || 0;
                }
                return !IS_INCLUDES && -1;
              };
            };
            module2.exports = {
              // `Array.prototype.includes` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.includes
              includes: createMethod(true),
              // `Array.prototype.indexOf` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.indexof
              indexOf: createMethod(false)
            };
          }
        ),
        /***/
        "4de4": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $filter = __webpack_require__("b727").filter;
            var arrayMethodHasSpeciesSupport = __webpack_require__("1dde");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var HAS_SPECIES_SUPPORT = arrayMethodHasSpeciesSupport("filter");
            var USES_TO_LENGTH = arrayMethodUsesToLength("filter");
            $({ target: "Array", proto: true, forced: !HAS_SPECIES_SUPPORT || !USES_TO_LENGTH }, {
              filter: function filter(callbackfn) {
                return $filter(this, callbackfn, arguments.length > 1 ? arguments[1] : void 0);
              }
            });
          }
        ),
        /***/
        "4df4": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var bind = __webpack_require__("0366");
            var toObject = __webpack_require__("7b0b");
            var callWithSafeIterationClosing = __webpack_require__("9bdd");
            var isArrayIteratorMethod = __webpack_require__("e95a");
            var toLength = __webpack_require__("50c4");
            var createProperty = __webpack_require__("8418");
            var getIteratorMethod = __webpack_require__("35a1");
            module2.exports = function from(arrayLike) {
              var O = toObject(arrayLike);
              var C = typeof this == "function" ? this : Array;
              var argumentsLength = arguments.length;
              var mapfn = argumentsLength > 1 ? arguments[1] : void 0;
              var mapping = mapfn !== void 0;
              var iteratorMethod = getIteratorMethod(O);
              var index2 = 0;
              var length, result, step, iterator, next, value;
              if (mapping) mapfn = bind(mapfn, argumentsLength > 2 ? arguments[2] : void 0, 2);
              if (iteratorMethod != void 0 && !(C == Array && isArrayIteratorMethod(iteratorMethod))) {
                iterator = iteratorMethod.call(O);
                next = iterator.next;
                result = new C();
                for (; !(step = next.call(iterator)).done; index2++) {
                  value = mapping ? callWithSafeIterationClosing(iterator, mapfn, [step.value, index2], true) : step.value;
                  createProperty(result, index2, value);
                }
              } else {
                length = toLength(O.length);
                result = new C(length);
                for (; length > index2; index2++) {
                  value = mapping ? mapfn(O[index2], index2) : O[index2];
                  createProperty(result, index2, value);
                }
              }
              result.length = index2;
              return result;
            };
          }
        ),
        /***/
        "4fad": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $entries = __webpack_require__("6f53").entries;
            $({ target: "Object", stat: true }, {
              entries: function entries(O) {
                return $entries(O);
              }
            });
          }
        ),
        /***/
        "50c4": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toInteger = __webpack_require__("a691");
            var min = Math.min;
            module2.exports = function(argument) {
              return argument > 0 ? min(toInteger(argument), 9007199254740991) : 0;
            };
          }
        ),
        /***/
        "5135": (
          /***/
          function(module2, exports$12) {
            var hasOwnProperty = {}.hasOwnProperty;
            module2.exports = function(it, key) {
              return hasOwnProperty.call(it, key);
            };
          }
        ),
        /***/
        "5319": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fixRegExpWellKnownSymbolLogic = __webpack_require__("d784");
            var anObject = __webpack_require__("825a");
            var toObject = __webpack_require__("7b0b");
            var toLength = __webpack_require__("50c4");
            var toInteger = __webpack_require__("a691");
            var requireObjectCoercible = __webpack_require__("1d80");
            var advanceStringIndex = __webpack_require__("8aa5");
            var regExpExec = __webpack_require__("14c3");
            var max = Math.max;
            var min = Math.min;
            var floor = Math.floor;
            var SUBSTITUTION_SYMBOLS = /\$([$&'`]|\d\d?|<[^>]*>)/g;
            var SUBSTITUTION_SYMBOLS_NO_NAMED = /\$([$&'`]|\d\d?)/g;
            var maybeToString = function(it) {
              return it === void 0 ? it : String(it);
            };
            fixRegExpWellKnownSymbolLogic("replace", 2, function(REPLACE, nativeReplace, maybeCallNative, reason) {
              var REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE = reason.REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE;
              var REPLACE_KEEPS_$0 = reason.REPLACE_KEEPS_$0;
              var UNSAFE_SUBSTITUTE = REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE ? "$" : "$0";
              return [
                // `String.prototype.replace` method
                // https://tc39.github.io/ecma262/#sec-string.prototype.replace
                function replace(searchValue, replaceValue) {
                  var O = requireObjectCoercible(this);
                  var replacer = searchValue == void 0 ? void 0 : searchValue[REPLACE];
                  return replacer !== void 0 ? replacer.call(searchValue, O, replaceValue) : nativeReplace.call(String(O), searchValue, replaceValue);
                },
                // `RegExp.prototype[@@replace]` method
                // https://tc39.github.io/ecma262/#sec-regexp.prototype-@@replace
                function(regexp, replaceValue) {
                  if (!REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE && REPLACE_KEEPS_$0 || typeof replaceValue === "string" && replaceValue.indexOf(UNSAFE_SUBSTITUTE) === -1) {
                    var res = maybeCallNative(nativeReplace, regexp, this, replaceValue);
                    if (res.done) return res.value;
                  }
                  var rx = anObject(regexp);
                  var S = String(this);
                  var functionalReplace = typeof replaceValue === "function";
                  if (!functionalReplace) replaceValue = String(replaceValue);
                  var global = rx.global;
                  if (global) {
                    var fullUnicode = rx.unicode;
                    rx.lastIndex = 0;
                  }
                  var results = [];
                  while (true) {
                    var result = regExpExec(rx, S);
                    if (result === null) break;
                    results.push(result);
                    if (!global) break;
                    var matchStr = String(result[0]);
                    if (matchStr === "") rx.lastIndex = advanceStringIndex(S, toLength(rx.lastIndex), fullUnicode);
                  }
                  var accumulatedResult = "";
                  var nextSourcePosition = 0;
                  for (var i = 0; i < results.length; i++) {
                    result = results[i];
                    var matched = String(result[0]);
                    var position = max(min(toInteger(result.index), S.length), 0);
                    var captures = [];
                    for (var j = 1; j < result.length; j++) captures.push(maybeToString(result[j]));
                    var namedCaptures = result.groups;
                    if (functionalReplace) {
                      var replacerArgs = [matched].concat(captures, position, S);
                      if (namedCaptures !== void 0) replacerArgs.push(namedCaptures);
                      var replacement = String(replaceValue.apply(void 0, replacerArgs));
                    } else {
                      replacement = getSubstitution(matched, S, position, captures, namedCaptures, replaceValue);
                    }
                    if (position >= nextSourcePosition) {
                      accumulatedResult += S.slice(nextSourcePosition, position) + replacement;
                      nextSourcePosition = position + matched.length;
                    }
                  }
                  return accumulatedResult + S.slice(nextSourcePosition);
                }
              ];
              function getSubstitution(matched, str, position, captures, namedCaptures, replacement) {
                var tailPos = position + matched.length;
                var m = captures.length;
                var symbols = SUBSTITUTION_SYMBOLS_NO_NAMED;
                if (namedCaptures !== void 0) {
                  namedCaptures = toObject(namedCaptures);
                  symbols = SUBSTITUTION_SYMBOLS;
                }
                return nativeReplace.call(replacement, symbols, function(match, ch) {
                  var capture;
                  switch (ch.charAt(0)) {
                    case "$":
                      return "$";
                    case "&":
                      return matched;
                    case "`":
                      return str.slice(0, position);
                    case "'":
                      return str.slice(tailPos);
                    case "<":
                      capture = namedCaptures[ch.slice(1, -1)];
                      break;
                    default:
                      var n = +ch;
                      if (n === 0) return match;
                      if (n > m) {
                        var f = floor(n / 10);
                        if (f === 0) return match;
                        if (f <= m) return captures[f - 1] === void 0 ? ch.charAt(1) : captures[f - 1] + ch.charAt(1);
                        return match;
                      }
                      capture = captures[n - 1];
                  }
                  return capture === void 0 ? "" : capture;
                });
              }
            });
          }
        ),
        /***/
        "5692": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var IS_PURE = __webpack_require__("c430");
            var store = __webpack_require__("c6cd");
            (module2.exports = function(key, value) {
              return store[key] || (store[key] = value !== void 0 ? value : {});
            })("versions", []).push({
              version: "3.6.5",
              mode: IS_PURE ? "pure" : "global",
              copyright: "© 2020 Denis Pushkarev (zloirock.ru)"
            });
          }
        ),
        /***/
        "56ef": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var getBuiltIn = __webpack_require__("d066");
            var getOwnPropertyNamesModule = __webpack_require__("241c");
            var getOwnPropertySymbolsModule = __webpack_require__("7418");
            var anObject = __webpack_require__("825a");
            module2.exports = getBuiltIn("Reflect", "ownKeys") || function ownKeys2(it) {
              var keys = getOwnPropertyNamesModule.f(anObject(it));
              var getOwnPropertySymbols = getOwnPropertySymbolsModule.f;
              return getOwnPropertySymbols ? keys.concat(getOwnPropertySymbols(it)) : keys;
            };
          }
        ),
        /***/
        "5a34": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isRegExp = __webpack_require__("44e7");
            module2.exports = function(it) {
              if (isRegExp(it)) {
                throw TypeError("The method doesn't accept regular expressions");
              }
              return it;
            };
          }
        ),
        /***/
        "5c6c": (
          /***/
          function(module2, exports$12) {
            module2.exports = function(bitmap, value) {
              return {
                enumerable: !(bitmap & 1),
                configurable: !(bitmap & 2),
                writable: !(bitmap & 4),
                value
              };
            };
          }
        ),
        /***/
        "5db7": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var flattenIntoArray = __webpack_require__("a2bf");
            var toObject = __webpack_require__("7b0b");
            var toLength = __webpack_require__("50c4");
            var aFunction = __webpack_require__("1c0b");
            var arraySpeciesCreate = __webpack_require__("65f0");
            $({ target: "Array", proto: true }, {
              flatMap: function flatMap(callbackfn) {
                var O = toObject(this);
                var sourceLen = toLength(O.length);
                var A;
                aFunction(callbackfn);
                A = arraySpeciesCreate(O, 0);
                A.length = flattenIntoArray(A, O, O, sourceLen, 0, 1, callbackfn, arguments.length > 1 ? arguments[1] : void 0);
                return A;
              }
            });
          }
        ),
        /***/
        "6547": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toInteger = __webpack_require__("a691");
            var requireObjectCoercible = __webpack_require__("1d80");
            var createMethod = function(CONVERT_TO_STRING) {
              return function($this, pos) {
                var S = String(requireObjectCoercible($this));
                var position = toInteger(pos);
                var size = S.length;
                var first, second;
                if (position < 0 || position >= size) return CONVERT_TO_STRING ? "" : void 0;
                first = S.charCodeAt(position);
                return first < 55296 || first > 56319 || position + 1 === size || (second = S.charCodeAt(position + 1)) < 56320 || second > 57343 ? CONVERT_TO_STRING ? S.charAt(position) : first : CONVERT_TO_STRING ? S.slice(position, position + 2) : (first - 55296 << 10) + (second - 56320) + 65536;
              };
            };
            module2.exports = {
              // `String.prototype.codePointAt` method
              // https://tc39.github.io/ecma262/#sec-string.prototype.codepointat
              codeAt: createMethod(false),
              // `String.prototype.at` method
              // https://github.com/mathiasbynens/String.prototype.at
              charAt: createMethod(true)
            };
          }
        ),
        /***/
        "65f0": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isObject = __webpack_require__("861d");
            var isArray = __webpack_require__("e8b5");
            var wellKnownSymbol = __webpack_require__("b622");
            var SPECIES = wellKnownSymbol("species");
            module2.exports = function(originalArray, length) {
              var C;
              if (isArray(originalArray)) {
                C = originalArray.constructor;
                if (typeof C == "function" && (C === Array || isArray(C.prototype))) C = void 0;
                else if (isObject(C)) {
                  C = C[SPECIES];
                  if (C === null) C = void 0;
                }
              }
              return new (C === void 0 ? Array : C)(length === 0 ? 0 : length);
            };
          }
        ),
        /***/
        "69f3": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var NATIVE_WEAK_MAP = __webpack_require__("7f9a");
            var global = __webpack_require__("da84");
            var isObject = __webpack_require__("861d");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var objectHas = __webpack_require__("5135");
            var sharedKey = __webpack_require__("f772");
            var hiddenKeys = __webpack_require__("d012");
            var WeakMap = global.WeakMap;
            var set, get, has;
            var enforce = function(it) {
              return has(it) ? get(it) : set(it, {});
            };
            var getterFor = function(TYPE) {
              return function(it) {
                var state;
                if (!isObject(it) || (state = get(it)).type !== TYPE) {
                  throw TypeError("Incompatible receiver, " + TYPE + " required");
                }
                return state;
              };
            };
            if (NATIVE_WEAK_MAP) {
              var store = new WeakMap();
              var wmget = store.get;
              var wmhas = store.has;
              var wmset = store.set;
              set = function(it, metadata) {
                wmset.call(store, it, metadata);
                return metadata;
              };
              get = function(it) {
                return wmget.call(store, it) || {};
              };
              has = function(it) {
                return wmhas.call(store, it);
              };
            } else {
              var STATE = sharedKey("state");
              hiddenKeys[STATE] = true;
              set = function(it, metadata) {
                createNonEnumerableProperty(it, STATE, metadata);
                return metadata;
              };
              get = function(it) {
                return objectHas(it, STATE) ? it[STATE] : {};
              };
              has = function(it) {
                return objectHas(it, STATE);
              };
            }
            module2.exports = {
              set,
              get,
              has,
              enforce,
              getterFor
            };
          }
        ),
        /***/
        "6eeb": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var has = __webpack_require__("5135");
            var setGlobal = __webpack_require__("ce4e");
            var inspectSource = __webpack_require__("8925");
            var InternalStateModule = __webpack_require__("69f3");
            var getInternalState = InternalStateModule.get;
            var enforceInternalState = InternalStateModule.enforce;
            var TEMPLATE = String(String).split("String");
            (module2.exports = function(O, key, value, options) {
              var unsafe = options ? !!options.unsafe : false;
              var simple = options ? !!options.enumerable : false;
              var noTargetGet = options ? !!options.noTargetGet : false;
              if (typeof value == "function") {
                if (typeof key == "string" && !has(value, "name")) createNonEnumerableProperty(value, "name", key);
                enforceInternalState(value).source = TEMPLATE.join(typeof key == "string" ? key : "");
              }
              if (O === global) {
                if (simple) O[key] = value;
                else setGlobal(key, value);
                return;
              } else if (!unsafe) {
                delete O[key];
              } else if (!noTargetGet && O[key]) {
                simple = true;
              }
              if (simple) O[key] = value;
              else createNonEnumerableProperty(O, key, value);
            })(Function.prototype, "toString", function toString() {
              return typeof this == "function" && getInternalState(this).source || inspectSource(this);
            });
          }
        ),
        /***/
        "6f53": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var objectKeys = __webpack_require__("df75");
            var toIndexedObject = __webpack_require__("fc6a");
            var propertyIsEnumerable = __webpack_require__("d1e7").f;
            var createMethod = function(TO_ENTRIES) {
              return function(it) {
                var O = toIndexedObject(it);
                var keys = objectKeys(O);
                var length = keys.length;
                var i = 0;
                var result = [];
                var key;
                while (length > i) {
                  key = keys[i++];
                  if (!DESCRIPTORS || propertyIsEnumerable.call(O, key)) {
                    result.push(TO_ENTRIES ? [key, O[key]] : O[key]);
                  }
                }
                return result;
              };
            };
            module2.exports = {
              // `Object.entries` method
              // https://tc39.github.io/ecma262/#sec-object.entries
              entries: createMethod(true),
              // `Object.values` method
              // https://tc39.github.io/ecma262/#sec-object.values
              values: createMethod(false)
            };
          }
        ),
        /***/
        "73d9": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var addToUnscopables = __webpack_require__("44d2");
            addToUnscopables("flatMap");
          }
        ),
        /***/
        "7418": (
          /***/
          function(module2, exports$12) {
            exports$12.f = Object.getOwnPropertySymbols;
          }
        ),
        /***/
        "746f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var path = __webpack_require__("428f");
            var has = __webpack_require__("5135");
            var wrappedWellKnownSymbolModule = __webpack_require__("e538");
            var defineProperty = __webpack_require__("9bf2").f;
            module2.exports = function(NAME) {
              var Symbol2 = path.Symbol || (path.Symbol = {});
              if (!has(Symbol2, NAME)) defineProperty(Symbol2, NAME, {
                value: wrappedWellKnownSymbolModule.f(NAME)
              });
            };
          }
        ),
        /***/
        "7839": (
          /***/
          function(module2, exports$12) {
            module2.exports = [
              "constructor",
              "hasOwnProperty",
              "isPrototypeOf",
              "propertyIsEnumerable",
              "toLocaleString",
              "toString",
              "valueOf"
            ];
          }
        ),
        /***/
        "7b0b": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var requireObjectCoercible = __webpack_require__("1d80");
            module2.exports = function(argument) {
              return Object(requireObjectCoercible(argument));
            };
          }
        ),
        /***/
        "7c73": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var anObject = __webpack_require__("825a");
            var defineProperties = __webpack_require__("37e8");
            var enumBugKeys = __webpack_require__("7839");
            var hiddenKeys = __webpack_require__("d012");
            var html = __webpack_require__("1be4");
            var documentCreateElement = __webpack_require__("cc12");
            var sharedKey = __webpack_require__("f772");
            var GT = ">";
            var LT = "<";
            var PROTOTYPE = "prototype";
            var SCRIPT = "script";
            var IE_PROTO = sharedKey("IE_PROTO");
            var EmptyConstructor = function() {
            };
            var scriptTag = function(content) {
              return LT + SCRIPT + GT + content + LT + "/" + SCRIPT + GT;
            };
            var NullProtoObjectViaActiveX = function(activeXDocument2) {
              activeXDocument2.write(scriptTag(""));
              activeXDocument2.close();
              var temp = activeXDocument2.parentWindow.Object;
              activeXDocument2 = null;
              return temp;
            };
            var NullProtoObjectViaIFrame = function() {
              var iframe = documentCreateElement("iframe");
              var JS = "java" + SCRIPT + ":";
              var iframeDocument;
              iframe.style.display = "none";
              html.appendChild(iframe);
              iframe.src = String(JS);
              iframeDocument = iframe.contentWindow.document;
              iframeDocument.open();
              iframeDocument.write(scriptTag("document.F=Object"));
              iframeDocument.close();
              return iframeDocument.F;
            };
            var activeXDocument;
            var NullProtoObject = function() {
              try {
                activeXDocument = document.domain && new ActiveXObject("htmlfile");
              } catch (error) {
              }
              NullProtoObject = activeXDocument ? NullProtoObjectViaActiveX(activeXDocument) : NullProtoObjectViaIFrame();
              var length = enumBugKeys.length;
              while (length--) delete NullProtoObject[PROTOTYPE][enumBugKeys[length]];
              return NullProtoObject();
            };
            hiddenKeys[IE_PROTO] = true;
            module2.exports = Object.create || function create(O, Properties) {
              var result;
              if (O !== null) {
                EmptyConstructor[PROTOTYPE] = anObject(O);
                result = new EmptyConstructor();
                EmptyConstructor[PROTOTYPE] = null;
                result[IE_PROTO] = O;
              } else result = NullProtoObject();
              return Properties === void 0 ? result : defineProperties(result, Properties);
            };
          }
        ),
        /***/
        "7dd0": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var createIteratorConstructor = __webpack_require__("9ed3");
            var getPrototypeOf = __webpack_require__("e163");
            var setPrototypeOf = __webpack_require__("d2bb");
            var setToStringTag = __webpack_require__("d44e");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var redefine = __webpack_require__("6eeb");
            var wellKnownSymbol = __webpack_require__("b622");
            var IS_PURE = __webpack_require__("c430");
            var Iterators = __webpack_require__("3f8c");
            var IteratorsCore = __webpack_require__("ae93");
            var IteratorPrototype = IteratorsCore.IteratorPrototype;
            var BUGGY_SAFARI_ITERATORS = IteratorsCore.BUGGY_SAFARI_ITERATORS;
            var ITERATOR = wellKnownSymbol("iterator");
            var KEYS = "keys";
            var VALUES = "values";
            var ENTRIES = "entries";
            var returnThis = function() {
              return this;
            };
            module2.exports = function(Iterable, NAME, IteratorConstructor, next, DEFAULT, IS_SET, FORCED) {
              createIteratorConstructor(IteratorConstructor, NAME, next);
              var getIterationMethod = function(KIND) {
                if (KIND === DEFAULT && defaultIterator) return defaultIterator;
                if (!BUGGY_SAFARI_ITERATORS && KIND in IterablePrototype) return IterablePrototype[KIND];
                switch (KIND) {
                  case KEYS:
                    return function keys() {
                      return new IteratorConstructor(this, KIND);
                    };
                  case VALUES:
                    return function values() {
                      return new IteratorConstructor(this, KIND);
                    };
                  case ENTRIES:
                    return function entries() {
                      return new IteratorConstructor(this, KIND);
                    };
                }
                return function() {
                  return new IteratorConstructor(this);
                };
              };
              var TO_STRING_TAG = NAME + " Iterator";
              var INCORRECT_VALUES_NAME = false;
              var IterablePrototype = Iterable.prototype;
              var nativeIterator = IterablePrototype[ITERATOR] || IterablePrototype["@@iterator"] || DEFAULT && IterablePrototype[DEFAULT];
              var defaultIterator = !BUGGY_SAFARI_ITERATORS && nativeIterator || getIterationMethod(DEFAULT);
              var anyNativeIterator = NAME == "Array" ? IterablePrototype.entries || nativeIterator : nativeIterator;
              var CurrentIteratorPrototype, methods, KEY;
              if (anyNativeIterator) {
                CurrentIteratorPrototype = getPrototypeOf(anyNativeIterator.call(new Iterable()));
                if (IteratorPrototype !== Object.prototype && CurrentIteratorPrototype.next) {
                  if (!IS_PURE && getPrototypeOf(CurrentIteratorPrototype) !== IteratorPrototype) {
                    if (setPrototypeOf) {
                      setPrototypeOf(CurrentIteratorPrototype, IteratorPrototype);
                    } else if (typeof CurrentIteratorPrototype[ITERATOR] != "function") {
                      createNonEnumerableProperty(CurrentIteratorPrototype, ITERATOR, returnThis);
                    }
                  }
                  setToStringTag(CurrentIteratorPrototype, TO_STRING_TAG, true, true);
                  if (IS_PURE) Iterators[TO_STRING_TAG] = returnThis;
                }
              }
              if (DEFAULT == VALUES && nativeIterator && nativeIterator.name !== VALUES) {
                INCORRECT_VALUES_NAME = true;
                defaultIterator = function values() {
                  return nativeIterator.call(this);
                };
              }
              if ((!IS_PURE || FORCED) && IterablePrototype[ITERATOR] !== defaultIterator) {
                createNonEnumerableProperty(IterablePrototype, ITERATOR, defaultIterator);
              }
              Iterators[NAME] = defaultIterator;
              if (DEFAULT) {
                methods = {
                  values: getIterationMethod(VALUES),
                  keys: IS_SET ? defaultIterator : getIterationMethod(KEYS),
                  entries: getIterationMethod(ENTRIES)
                };
                if (FORCED) for (KEY in methods) {
                  if (BUGGY_SAFARI_ITERATORS || INCORRECT_VALUES_NAME || !(KEY in IterablePrototype)) {
                    redefine(IterablePrototype, KEY, methods[KEY]);
                  }
                }
                else $({ target: NAME, proto: true, forced: BUGGY_SAFARI_ITERATORS || INCORRECT_VALUES_NAME }, methods);
              }
              return methods;
            };
          }
        ),
        /***/
        "7f9a": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var inspectSource = __webpack_require__("8925");
            var WeakMap = global.WeakMap;
            module2.exports = typeof WeakMap === "function" && /native code/.test(inspectSource(WeakMap));
          }
        ),
        /***/
        "825a": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isObject = __webpack_require__("861d");
            module2.exports = function(it) {
              if (!isObject(it)) {
                throw TypeError(String(it) + " is not an object");
              }
              return it;
            };
          }
        ),
        /***/
        "83ab": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            module2.exports = !fails(function() {
              return Object.defineProperty({}, 1, { get: function() {
                return 7;
              } })[1] != 7;
            });
          }
        ),
        /***/
        "8418": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toPrimitive = __webpack_require__("c04e");
            var definePropertyModule = __webpack_require__("9bf2");
            var createPropertyDescriptor = __webpack_require__("5c6c");
            module2.exports = function(object, key, value) {
              var propertyKey = toPrimitive(key);
              if (propertyKey in object) definePropertyModule.f(object, propertyKey, createPropertyDescriptor(0, value));
              else object[propertyKey] = value;
            };
          }
        ),
        /***/
        "861d": (
          /***/
          function(module2, exports$12) {
            module2.exports = function(it) {
              return typeof it === "object" ? it !== null : typeof it === "function";
            };
          }
        ),
        /***/
        "8875": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;
            (function(root, factory) {
              {
                !(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_FACTORY__ = factory, __WEBPACK_AMD_DEFINE_RESULT__ = typeof __WEBPACK_AMD_DEFINE_FACTORY__ === "function" ? __WEBPACK_AMD_DEFINE_FACTORY__.apply(exports$12, __WEBPACK_AMD_DEFINE_ARRAY__) : __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_RESULT__ !== void 0 && (module2.exports = __WEBPACK_AMD_DEFINE_RESULT__));
              }
            })(typeof self !== "undefined" ? self : this, function() {
              function getCurrentScript() {
                var descriptor = Object.getOwnPropertyDescriptor(document, "currentScript");
                if (!descriptor && "currentScript" in document && document.currentScript) {
                  return document.currentScript;
                }
                if (descriptor && descriptor.get !== getCurrentScript && document.currentScript) {
                  return document.currentScript;
                }
                try {
                  throw new Error();
                } catch (err) {
                  var ieStackRegExp = /.*at [^(]*\((.*):(.+):(.+)\)$/ig, ffStackRegExp = /@([^@]*):(\d+):(\d+)\s*$/ig, stackDetails = ieStackRegExp.exec(err.stack) || ffStackRegExp.exec(err.stack), scriptLocation = stackDetails && stackDetails[1] || false, line = stackDetails && stackDetails[2] || false, currentLocation = document.location.href.replace(document.location.hash, ""), pageSource, inlineScriptSourceRegExp, inlineScriptSource, scripts = document.getElementsByTagName("script");
                  if (scriptLocation === currentLocation) {
                    pageSource = document.documentElement.outerHTML;
                    inlineScriptSourceRegExp = new RegExp("(?:[^\\n]+?\\n){0," + (line - 2) + "}[^<]*<script>([\\d\\D]*?)<\\/script>[\\d\\D]*", "i");
                    inlineScriptSource = pageSource.replace(inlineScriptSourceRegExp, "$1").trim();
                  }
                  for (var i = 0; i < scripts.length; i++) {
                    if (scripts[i].readyState === "interactive") {
                      return scripts[i];
                    }
                    if (scripts[i].src === scriptLocation) {
                      return scripts[i];
                    }
                    if (scriptLocation === currentLocation && scripts[i].innerHTML && scripts[i].innerHTML.trim() === inlineScriptSource) {
                      return scripts[i];
                    }
                  }
                  return null;
                }
              }
              return getCurrentScript;
            });
          }
        ),
        /***/
        "8925": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var store = __webpack_require__("c6cd");
            var functionToString = Function.toString;
            if (typeof store.inspectSource != "function") {
              store.inspectSource = function(it) {
                return functionToString.call(it);
              };
            }
            module2.exports = store.inspectSource;
          }
        ),
        /***/
        "8aa5": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var charAt = __webpack_require__("6547").charAt;
            module2.exports = function(S, index2, unicode) {
              return index2 + (unicode ? charAt(S, index2).length : 1);
            };
          }
        ),
        /***/
        "8bbf": (
          /***/
          function(module2, exports$12) {
            module2.exports = __WEBPACK_EXTERNAL_MODULE__8bbf__;
          }
        ),
        /***/
        "90e3": (
          /***/
          function(module2, exports$12) {
            var id = 0;
            var postfix = Math.random();
            module2.exports = function(key) {
              return "Symbol(" + String(key === void 0 ? "" : key) + ")_" + (++id + postfix).toString(36);
            };
          }
        ),
        /***/
        "9112": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var definePropertyModule = __webpack_require__("9bf2");
            var createPropertyDescriptor = __webpack_require__("5c6c");
            module2.exports = DESCRIPTORS ? function(object, key, value) {
              return definePropertyModule.f(object, key, createPropertyDescriptor(1, value));
            } : function(object, key, value) {
              object[key] = value;
              return object;
            };
          }
        ),
        /***/
        "9263": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var regexpFlags = __webpack_require__("ad6d");
            var stickyHelpers = __webpack_require__("9f7f");
            var nativeExec = RegExp.prototype.exec;
            var nativeReplace = String.prototype.replace;
            var patchedExec = nativeExec;
            var UPDATES_LAST_INDEX_WRONG = function() {
              var re1 = /a/;
              var re2 = /b*/g;
              nativeExec.call(re1, "a");
              nativeExec.call(re2, "a");
              return re1.lastIndex !== 0 || re2.lastIndex !== 0;
            }();
            var UNSUPPORTED_Y = stickyHelpers.UNSUPPORTED_Y || stickyHelpers.BROKEN_CARET;
            var NPCG_INCLUDED = /()??/.exec("")[1] !== void 0;
            var PATCH = UPDATES_LAST_INDEX_WRONG || NPCG_INCLUDED || UNSUPPORTED_Y;
            if (PATCH) {
              patchedExec = function exec(str) {
                var re = this;
                var lastIndex, reCopy, match, i;
                var sticky = UNSUPPORTED_Y && re.sticky;
                var flags = regexpFlags.call(re);
                var source = re.source;
                var charsAdded = 0;
                var strCopy = str;
                if (sticky) {
                  flags = flags.replace("y", "");
                  if (flags.indexOf("g") === -1) {
                    flags += "g";
                  }
                  strCopy = String(str).slice(re.lastIndex);
                  if (re.lastIndex > 0 && (!re.multiline || re.multiline && str[re.lastIndex - 1] !== "\n")) {
                    source = "(?: " + source + ")";
                    strCopy = " " + strCopy;
                    charsAdded++;
                  }
                  reCopy = new RegExp("^(?:" + source + ")", flags);
                }
                if (NPCG_INCLUDED) {
                  reCopy = new RegExp("^" + source + "$(?!\\s)", flags);
                }
                if (UPDATES_LAST_INDEX_WRONG) lastIndex = re.lastIndex;
                match = nativeExec.call(sticky ? reCopy : re, strCopy);
                if (sticky) {
                  if (match) {
                    match.input = match.input.slice(charsAdded);
                    match[0] = match[0].slice(charsAdded);
                    match.index = re.lastIndex;
                    re.lastIndex += match[0].length;
                  } else re.lastIndex = 0;
                } else if (UPDATES_LAST_INDEX_WRONG && match) {
                  re.lastIndex = re.global ? match.index + match[0].length : lastIndex;
                }
                if (NPCG_INCLUDED && match && match.length > 1) {
                  nativeReplace.call(match[0], reCopy, function() {
                    for (i = 1; i < arguments.length - 2; i++) {
                      if (arguments[i] === void 0) match[i] = void 0;
                    }
                  });
                }
                return match;
              };
            }
            module2.exports = patchedExec;
          }
        ),
        /***/
        "94ca": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            var replacement = /#|\.prototype\./;
            var isForced = function(feature, detection) {
              var value = data[normalize(feature)];
              return value == POLYFILL ? true : value == NATIVE ? false : typeof detection == "function" ? fails(detection) : !!detection;
            };
            var normalize = isForced.normalize = function(string) {
              return String(string).replace(replacement, ".").toLowerCase();
            };
            var data = isForced.data = {};
            var NATIVE = isForced.NATIVE = "N";
            var POLYFILL = isForced.POLYFILL = "P";
            module2.exports = isForced;
          }
        ),
        /***/
        "99af": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var fails = __webpack_require__("d039");
            var isArray = __webpack_require__("e8b5");
            var isObject = __webpack_require__("861d");
            var toObject = __webpack_require__("7b0b");
            var toLength = __webpack_require__("50c4");
            var createProperty = __webpack_require__("8418");
            var arraySpeciesCreate = __webpack_require__("65f0");
            var arrayMethodHasSpeciesSupport = __webpack_require__("1dde");
            var wellKnownSymbol = __webpack_require__("b622");
            var V8_VERSION = __webpack_require__("2d00");
            var IS_CONCAT_SPREADABLE = wellKnownSymbol("isConcatSpreadable");
            var MAX_SAFE_INTEGER = 9007199254740991;
            var MAXIMUM_ALLOWED_INDEX_EXCEEDED = "Maximum allowed index exceeded";
            var IS_CONCAT_SPREADABLE_SUPPORT = V8_VERSION >= 51 || !fails(function() {
              var array = [];
              array[IS_CONCAT_SPREADABLE] = false;
              return array.concat()[0] !== array;
            });
            var SPECIES_SUPPORT = arrayMethodHasSpeciesSupport("concat");
            var isConcatSpreadable = function(O) {
              if (!isObject(O)) return false;
              var spreadable = O[IS_CONCAT_SPREADABLE];
              return spreadable !== void 0 ? !!spreadable : isArray(O);
            };
            var FORCED = !IS_CONCAT_SPREADABLE_SUPPORT || !SPECIES_SUPPORT;
            $({ target: "Array", proto: true, forced: FORCED }, {
              concat: function concat(arg) {
                var O = toObject(this);
                var A = arraySpeciesCreate(O, 0);
                var n = 0;
                var i, k, length, len, E;
                for (i = -1, length = arguments.length; i < length; i++) {
                  E = i === -1 ? O : arguments[i];
                  if (isConcatSpreadable(E)) {
                    len = toLength(E.length);
                    if (n + len > MAX_SAFE_INTEGER) throw TypeError(MAXIMUM_ALLOWED_INDEX_EXCEEDED);
                    for (k = 0; k < len; k++, n++) if (k in E) createProperty(A, n, E[k]);
                  } else {
                    if (n >= MAX_SAFE_INTEGER) throw TypeError(MAXIMUM_ALLOWED_INDEX_EXCEEDED);
                    createProperty(A, n++, E);
                  }
                }
                A.length = n;
                return A;
              }
            });
          }
        ),
        /***/
        "9bdd": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var anObject = __webpack_require__("825a");
            module2.exports = function(iterator, fn, value, ENTRIES) {
              try {
                return ENTRIES ? fn(anObject(value)[0], value[1]) : fn(value);
              } catch (error) {
                var returnMethod = iterator["return"];
                if (returnMethod !== void 0) anObject(returnMethod.call(iterator));
                throw error;
              }
            };
          }
        ),
        /***/
        "9bf2": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var IE8_DOM_DEFINE = __webpack_require__("0cfb");
            var anObject = __webpack_require__("825a");
            var toPrimitive = __webpack_require__("c04e");
            var nativeDefineProperty = Object.defineProperty;
            exports$12.f = DESCRIPTORS ? nativeDefineProperty : function defineProperty(O, P, Attributes) {
              anObject(O);
              P = toPrimitive(P, true);
              anObject(Attributes);
              if (IE8_DOM_DEFINE) try {
                return nativeDefineProperty(O, P, Attributes);
              } catch (error) {
              }
              if ("get" in Attributes || "set" in Attributes) throw TypeError("Accessors not supported");
              if ("value" in Attributes) O[P] = Attributes.value;
              return O;
            };
          }
        ),
        /***/
        "9ed3": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var IteratorPrototype = __webpack_require__("ae93").IteratorPrototype;
            var create = __webpack_require__("7c73");
            var createPropertyDescriptor = __webpack_require__("5c6c");
            var setToStringTag = __webpack_require__("d44e");
            var Iterators = __webpack_require__("3f8c");
            var returnThis = function() {
              return this;
            };
            module2.exports = function(IteratorConstructor, NAME, next) {
              var TO_STRING_TAG = NAME + " Iterator";
              IteratorConstructor.prototype = create(IteratorPrototype, { next: createPropertyDescriptor(1, next) });
              setToStringTag(IteratorConstructor, TO_STRING_TAG, false, true);
              Iterators[TO_STRING_TAG] = returnThis;
              return IteratorConstructor;
            };
          }
        ),
        /***/
        "9f7f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            function RE(s, f) {
              return RegExp(s, f);
            }
            exports$12.UNSUPPORTED_Y = fails(function() {
              var re = RE("a", "y");
              re.lastIndex = 2;
              return re.exec("abcd") != null;
            });
            exports$12.BROKEN_CARET = fails(function() {
              var re = RE("^r", "gy");
              re.lastIndex = 2;
              return re.exec("str") != null;
            });
          }
        ),
        /***/
        "a2bf": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isArray = __webpack_require__("e8b5");
            var toLength = __webpack_require__("50c4");
            var bind = __webpack_require__("0366");
            var flattenIntoArray = function(target, original, source, sourceLen, start, depth, mapper, thisArg) {
              var targetIndex = start;
              var sourceIndex = 0;
              var mapFn = mapper ? bind(mapper, thisArg, 3) : false;
              var element;
              while (sourceIndex < sourceLen) {
                if (sourceIndex in source) {
                  element = mapFn ? mapFn(source[sourceIndex], sourceIndex, original) : source[sourceIndex];
                  if (depth > 0 && isArray(element)) {
                    targetIndex = flattenIntoArray(target, original, element, toLength(element.length), targetIndex, depth - 1) - 1;
                  } else {
                    if (targetIndex >= 9007199254740991) throw TypeError("Exceed the acceptable array length");
                    target[targetIndex] = element;
                  }
                  targetIndex++;
                }
                sourceIndex++;
              }
              return targetIndex;
            };
            module2.exports = flattenIntoArray;
          }
        ),
        /***/
        "a352": (
          /***/
          function(module2, exports$12) {
            module2.exports = __WEBPACK_EXTERNAL_MODULE_a352__;
          }
        ),
        /***/
        "a434": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var toAbsoluteIndex = __webpack_require__("23cb");
            var toInteger = __webpack_require__("a691");
            var toLength = __webpack_require__("50c4");
            var toObject = __webpack_require__("7b0b");
            var arraySpeciesCreate = __webpack_require__("65f0");
            var createProperty = __webpack_require__("8418");
            var arrayMethodHasSpeciesSupport = __webpack_require__("1dde");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var HAS_SPECIES_SUPPORT = arrayMethodHasSpeciesSupport("splice");
            var USES_TO_LENGTH = arrayMethodUsesToLength("splice", { ACCESSORS: true, 0: 0, 1: 2 });
            var max = Math.max;
            var min = Math.min;
            var MAX_SAFE_INTEGER = 9007199254740991;
            var MAXIMUM_ALLOWED_LENGTH_EXCEEDED = "Maximum allowed length exceeded";
            $({ target: "Array", proto: true, forced: !HAS_SPECIES_SUPPORT || !USES_TO_LENGTH }, {
              splice: function splice(start, deleteCount) {
                var O = toObject(this);
                var len = toLength(O.length);
                var actualStart = toAbsoluteIndex(start, len);
                var argumentsLength = arguments.length;
                var insertCount, actualDeleteCount, A, k, from, to;
                if (argumentsLength === 0) {
                  insertCount = actualDeleteCount = 0;
                } else if (argumentsLength === 1) {
                  insertCount = 0;
                  actualDeleteCount = len - actualStart;
                } else {
                  insertCount = argumentsLength - 2;
                  actualDeleteCount = min(max(toInteger(deleteCount), 0), len - actualStart);
                }
                if (len + insertCount - actualDeleteCount > MAX_SAFE_INTEGER) {
                  throw TypeError(MAXIMUM_ALLOWED_LENGTH_EXCEEDED);
                }
                A = arraySpeciesCreate(O, actualDeleteCount);
                for (k = 0; k < actualDeleteCount; k++) {
                  from = actualStart + k;
                  if (from in O) createProperty(A, k, O[from]);
                }
                A.length = actualDeleteCount;
                if (insertCount < actualDeleteCount) {
                  for (k = actualStart; k < len - actualDeleteCount; k++) {
                    from = k + actualDeleteCount;
                    to = k + insertCount;
                    if (from in O) O[to] = O[from];
                    else delete O[to];
                  }
                  for (k = len; k > len - actualDeleteCount + insertCount; k--) delete O[k - 1];
                } else if (insertCount > actualDeleteCount) {
                  for (k = len - actualDeleteCount; k > actualStart; k--) {
                    from = k + actualDeleteCount - 1;
                    to = k + insertCount - 1;
                    if (from in O) O[to] = O[from];
                    else delete O[to];
                  }
                }
                for (k = 0; k < insertCount; k++) {
                  O[k + actualStart] = arguments[k + 2];
                }
                O.length = len - actualDeleteCount + insertCount;
                return A;
              }
            });
          }
        ),
        /***/
        "a4d3": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var global = __webpack_require__("da84");
            var getBuiltIn = __webpack_require__("d066");
            var IS_PURE = __webpack_require__("c430");
            var DESCRIPTORS = __webpack_require__("83ab");
            var NATIVE_SYMBOL = __webpack_require__("4930");
            var USE_SYMBOL_AS_UID = __webpack_require__("fdbf");
            var fails = __webpack_require__("d039");
            var has = __webpack_require__("5135");
            var isArray = __webpack_require__("e8b5");
            var isObject = __webpack_require__("861d");
            var anObject = __webpack_require__("825a");
            var toObject = __webpack_require__("7b0b");
            var toIndexedObject = __webpack_require__("fc6a");
            var toPrimitive = __webpack_require__("c04e");
            var createPropertyDescriptor = __webpack_require__("5c6c");
            var nativeObjectCreate = __webpack_require__("7c73");
            var objectKeys = __webpack_require__("df75");
            var getOwnPropertyNamesModule = __webpack_require__("241c");
            var getOwnPropertyNamesExternal = __webpack_require__("057f");
            var getOwnPropertySymbolsModule = __webpack_require__("7418");
            var getOwnPropertyDescriptorModule = __webpack_require__("06cf");
            var definePropertyModule = __webpack_require__("9bf2");
            var propertyIsEnumerableModule = __webpack_require__("d1e7");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var redefine = __webpack_require__("6eeb");
            var shared = __webpack_require__("5692");
            var sharedKey = __webpack_require__("f772");
            var hiddenKeys = __webpack_require__("d012");
            var uid = __webpack_require__("90e3");
            var wellKnownSymbol = __webpack_require__("b622");
            var wrappedWellKnownSymbolModule = __webpack_require__("e538");
            var defineWellKnownSymbol = __webpack_require__("746f");
            var setToStringTag = __webpack_require__("d44e");
            var InternalStateModule = __webpack_require__("69f3");
            var $forEach = __webpack_require__("b727").forEach;
            var HIDDEN = sharedKey("hidden");
            var SYMBOL = "Symbol";
            var PROTOTYPE = "prototype";
            var TO_PRIMITIVE = wellKnownSymbol("toPrimitive");
            var setInternalState = InternalStateModule.set;
            var getInternalState = InternalStateModule.getterFor(SYMBOL);
            var ObjectPrototype = Object[PROTOTYPE];
            var $Symbol = global.Symbol;
            var $stringify = getBuiltIn("JSON", "stringify");
            var nativeGetOwnPropertyDescriptor = getOwnPropertyDescriptorModule.f;
            var nativeDefineProperty = definePropertyModule.f;
            var nativeGetOwnPropertyNames = getOwnPropertyNamesExternal.f;
            var nativePropertyIsEnumerable = propertyIsEnumerableModule.f;
            var AllSymbols = shared("symbols");
            var ObjectPrototypeSymbols = shared("op-symbols");
            var StringToSymbolRegistry = shared("string-to-symbol-registry");
            var SymbolToStringRegistry = shared("symbol-to-string-registry");
            var WellKnownSymbolsStore = shared("wks");
            var QObject = global.QObject;
            var USE_SETTER = !QObject || !QObject[PROTOTYPE] || !QObject[PROTOTYPE].findChild;
            var setSymbolDescriptor = DESCRIPTORS && fails(function() {
              return nativeObjectCreate(nativeDefineProperty({}, "a", {
                get: function() {
                  return nativeDefineProperty(this, "a", { value: 7 }).a;
                }
              })).a != 7;
            }) ? function(O, P, Attributes) {
              var ObjectPrototypeDescriptor = nativeGetOwnPropertyDescriptor(ObjectPrototype, P);
              if (ObjectPrototypeDescriptor) delete ObjectPrototype[P];
              nativeDefineProperty(O, P, Attributes);
              if (ObjectPrototypeDescriptor && O !== ObjectPrototype) {
                nativeDefineProperty(ObjectPrototype, P, ObjectPrototypeDescriptor);
              }
            } : nativeDefineProperty;
            var wrap = function(tag, description) {
              var symbol = AllSymbols[tag] = nativeObjectCreate($Symbol[PROTOTYPE]);
              setInternalState(symbol, {
                type: SYMBOL,
                tag,
                description
              });
              if (!DESCRIPTORS) symbol.description = description;
              return symbol;
            };
            var isSymbol = USE_SYMBOL_AS_UID ? function(it) {
              return typeof it == "symbol";
            } : function(it) {
              return Object(it) instanceof $Symbol;
            };
            var $defineProperty = function defineProperty(O, P, Attributes) {
              if (O === ObjectPrototype) $defineProperty(ObjectPrototypeSymbols, P, Attributes);
              anObject(O);
              var key = toPrimitive(P, true);
              anObject(Attributes);
              if (has(AllSymbols, key)) {
                if (!Attributes.enumerable) {
                  if (!has(O, HIDDEN)) nativeDefineProperty(O, HIDDEN, createPropertyDescriptor(1, {}));
                  O[HIDDEN][key] = true;
                } else {
                  if (has(O, HIDDEN) && O[HIDDEN][key]) O[HIDDEN][key] = false;
                  Attributes = nativeObjectCreate(Attributes, { enumerable: createPropertyDescriptor(0, false) });
                }
                return setSymbolDescriptor(O, key, Attributes);
              }
              return nativeDefineProperty(O, key, Attributes);
            };
            var $defineProperties = function defineProperties(O, Properties) {
              anObject(O);
              var properties = toIndexedObject(Properties);
              var keys = objectKeys(properties).concat($getOwnPropertySymbols(properties));
              $forEach(keys, function(key) {
                if (!DESCRIPTORS || $propertyIsEnumerable.call(properties, key)) $defineProperty(O, key, properties[key]);
              });
              return O;
            };
            var $create = function create(O, Properties) {
              return Properties === void 0 ? nativeObjectCreate(O) : $defineProperties(nativeObjectCreate(O), Properties);
            };
            var $propertyIsEnumerable = function propertyIsEnumerable(V) {
              var P = toPrimitive(V, true);
              var enumerable = nativePropertyIsEnumerable.call(this, P);
              if (this === ObjectPrototype && has(AllSymbols, P) && !has(ObjectPrototypeSymbols, P)) return false;
              return enumerable || !has(this, P) || !has(AllSymbols, P) || has(this, HIDDEN) && this[HIDDEN][P] ? enumerable : true;
            };
            var $getOwnPropertyDescriptor = function getOwnPropertyDescriptor(O, P) {
              var it = toIndexedObject(O);
              var key = toPrimitive(P, true);
              if (it === ObjectPrototype && has(AllSymbols, key) && !has(ObjectPrototypeSymbols, key)) return;
              var descriptor = nativeGetOwnPropertyDescriptor(it, key);
              if (descriptor && has(AllSymbols, key) && !(has(it, HIDDEN) && it[HIDDEN][key])) {
                descriptor.enumerable = true;
              }
              return descriptor;
            };
            var $getOwnPropertyNames = function getOwnPropertyNames(O) {
              var names = nativeGetOwnPropertyNames(toIndexedObject(O));
              var result = [];
              $forEach(names, function(key) {
                if (!has(AllSymbols, key) && !has(hiddenKeys, key)) result.push(key);
              });
              return result;
            };
            var $getOwnPropertySymbols = function getOwnPropertySymbols(O) {
              var IS_OBJECT_PROTOTYPE = O === ObjectPrototype;
              var names = nativeGetOwnPropertyNames(IS_OBJECT_PROTOTYPE ? ObjectPrototypeSymbols : toIndexedObject(O));
              var result = [];
              $forEach(names, function(key) {
                if (has(AllSymbols, key) && (!IS_OBJECT_PROTOTYPE || has(ObjectPrototype, key))) {
                  result.push(AllSymbols[key]);
                }
              });
              return result;
            };
            if (!NATIVE_SYMBOL) {
              $Symbol = function Symbol2() {
                if (this instanceof $Symbol) throw TypeError("Symbol is not a constructor");
                var description = !arguments.length || arguments[0] === void 0 ? void 0 : String(arguments[0]);
                var tag = uid(description);
                var setter = function(value) {
                  if (this === ObjectPrototype) setter.call(ObjectPrototypeSymbols, value);
                  if (has(this, HIDDEN) && has(this[HIDDEN], tag)) this[HIDDEN][tag] = false;
                  setSymbolDescriptor(this, tag, createPropertyDescriptor(1, value));
                };
                if (DESCRIPTORS && USE_SETTER) setSymbolDescriptor(ObjectPrototype, tag, { configurable: true, set: setter });
                return wrap(tag, description);
              };
              redefine($Symbol[PROTOTYPE], "toString", function toString() {
                return getInternalState(this).tag;
              });
              redefine($Symbol, "withoutSetter", function(description) {
                return wrap(uid(description), description);
              });
              propertyIsEnumerableModule.f = $propertyIsEnumerable;
              definePropertyModule.f = $defineProperty;
              getOwnPropertyDescriptorModule.f = $getOwnPropertyDescriptor;
              getOwnPropertyNamesModule.f = getOwnPropertyNamesExternal.f = $getOwnPropertyNames;
              getOwnPropertySymbolsModule.f = $getOwnPropertySymbols;
              wrappedWellKnownSymbolModule.f = function(name) {
                return wrap(wellKnownSymbol(name), name);
              };
              if (DESCRIPTORS) {
                nativeDefineProperty($Symbol[PROTOTYPE], "description", {
                  configurable: true,
                  get: function description() {
                    return getInternalState(this).description;
                  }
                });
                if (!IS_PURE) {
                  redefine(ObjectPrototype, "propertyIsEnumerable", $propertyIsEnumerable, { unsafe: true });
                }
              }
            }
            $({ global: true, wrap: true, forced: !NATIVE_SYMBOL, sham: !NATIVE_SYMBOL }, {
              Symbol: $Symbol
            });
            $forEach(objectKeys(WellKnownSymbolsStore), function(name) {
              defineWellKnownSymbol(name);
            });
            $({ target: SYMBOL, stat: true, forced: !NATIVE_SYMBOL }, {
              // `Symbol.for` method
              // https://tc39.github.io/ecma262/#sec-symbol.for
              "for": function(key) {
                var string = String(key);
                if (has(StringToSymbolRegistry, string)) return StringToSymbolRegistry[string];
                var symbol = $Symbol(string);
                StringToSymbolRegistry[string] = symbol;
                SymbolToStringRegistry[symbol] = string;
                return symbol;
              },
              // `Symbol.keyFor` method
              // https://tc39.github.io/ecma262/#sec-symbol.keyfor
              keyFor: function keyFor(sym) {
                if (!isSymbol(sym)) throw TypeError(sym + " is not a symbol");
                if (has(SymbolToStringRegistry, sym)) return SymbolToStringRegistry[sym];
              },
              useSetter: function() {
                USE_SETTER = true;
              },
              useSimple: function() {
                USE_SETTER = false;
              }
            });
            $({ target: "Object", stat: true, forced: !NATIVE_SYMBOL, sham: !DESCRIPTORS }, {
              // `Object.create` method
              // https://tc39.github.io/ecma262/#sec-object.create
              create: $create,
              // `Object.defineProperty` method
              // https://tc39.github.io/ecma262/#sec-object.defineproperty
              defineProperty: $defineProperty,
              // `Object.defineProperties` method
              // https://tc39.github.io/ecma262/#sec-object.defineproperties
              defineProperties: $defineProperties,
              // `Object.getOwnPropertyDescriptor` method
              // https://tc39.github.io/ecma262/#sec-object.getownpropertydescriptors
              getOwnPropertyDescriptor: $getOwnPropertyDescriptor
            });
            $({ target: "Object", stat: true, forced: !NATIVE_SYMBOL }, {
              // `Object.getOwnPropertyNames` method
              // https://tc39.github.io/ecma262/#sec-object.getownpropertynames
              getOwnPropertyNames: $getOwnPropertyNames,
              // `Object.getOwnPropertySymbols` method
              // https://tc39.github.io/ecma262/#sec-object.getownpropertysymbols
              getOwnPropertySymbols: $getOwnPropertySymbols
            });
            $({ target: "Object", stat: true, forced: fails(function() {
              getOwnPropertySymbolsModule.f(1);
            }) }, {
              getOwnPropertySymbols: function getOwnPropertySymbols(it) {
                return getOwnPropertySymbolsModule.f(toObject(it));
              }
            });
            if ($stringify) {
              var FORCED_JSON_STRINGIFY = !NATIVE_SYMBOL || fails(function() {
                var symbol = $Symbol();
                return $stringify([symbol]) != "[null]" || $stringify({ a: symbol }) != "{}" || $stringify(Object(symbol)) != "{}";
              });
              $({ target: "JSON", stat: true, forced: FORCED_JSON_STRINGIFY }, {
                // eslint-disable-next-line no-unused-vars
                stringify: function stringify(it, replacer, space) {
                  var args = [it];
                  var index2 = 1;
                  var $replacer;
                  while (arguments.length > index2) args.push(arguments[index2++]);
                  $replacer = replacer;
                  if (!isObject(replacer) && it === void 0 || isSymbol(it)) return;
                  if (!isArray(replacer)) replacer = function(key, value) {
                    if (typeof $replacer == "function") value = $replacer.call(this, key, value);
                    if (!isSymbol(value)) return value;
                  };
                  args[1] = replacer;
                  return $stringify.apply(null, args);
                }
              });
            }
            if (!$Symbol[PROTOTYPE][TO_PRIMITIVE]) {
              createNonEnumerableProperty($Symbol[PROTOTYPE], TO_PRIMITIVE, $Symbol[PROTOTYPE].valueOf);
            }
            setToStringTag($Symbol, SYMBOL);
            hiddenKeys[HIDDEN] = true;
          }
        ),
        /***/
        "a630": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var from = __webpack_require__("4df4");
            var checkCorrectnessOfIteration = __webpack_require__("1c7e");
            var INCORRECT_ITERATION = !checkCorrectnessOfIteration(function(iterable) {
              Array.from(iterable);
            });
            $({ target: "Array", stat: true, forced: INCORRECT_ITERATION }, {
              from
            });
          }
        ),
        /***/
        "a640": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            module2.exports = function(METHOD_NAME, argument) {
              var method = [][METHOD_NAME];
              return !!method && fails(function() {
                method.call(null, argument || function() {
                  throw 1;
                }, 1);
              });
            };
          }
        ),
        /***/
        "a691": (
          /***/
          function(module2, exports$12) {
            var ceil = Math.ceil;
            var floor = Math.floor;
            module2.exports = function(argument) {
              return isNaN(argument = +argument) ? 0 : (argument > 0 ? floor : ceil)(argument);
            };
          }
        ),
        /***/
        "ab13": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var wellKnownSymbol = __webpack_require__("b622");
            var MATCH = wellKnownSymbol("match");
            module2.exports = function(METHOD_NAME) {
              var regexp = /./;
              try {
                "/./"[METHOD_NAME](regexp);
              } catch (e) {
                try {
                  regexp[MATCH] = false;
                  return "/./"[METHOD_NAME](regexp);
                } catch (f) {
                }
              }
              return false;
            };
          }
        ),
        /***/
        "ac1f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var exec = __webpack_require__("9263");
            $({ target: "RegExp", proto: true, forced: /./.exec !== exec }, {
              exec
            });
          }
        ),
        /***/
        "ad6d": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var anObject = __webpack_require__("825a");
            module2.exports = function() {
              var that = anObject(this);
              var result = "";
              if (that.global) result += "g";
              if (that.ignoreCase) result += "i";
              if (that.multiline) result += "m";
              if (that.dotAll) result += "s";
              if (that.unicode) result += "u";
              if (that.sticky) result += "y";
              return result;
            };
          }
        ),
        /***/
        "ae40": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var fails = __webpack_require__("d039");
            var has = __webpack_require__("5135");
            var defineProperty = Object.defineProperty;
            var cache = {};
            var thrower = function(it) {
              throw it;
            };
            module2.exports = function(METHOD_NAME, options) {
              if (has(cache, METHOD_NAME)) return cache[METHOD_NAME];
              if (!options) options = {};
              var method = [][METHOD_NAME];
              var ACCESSORS = has(options, "ACCESSORS") ? options.ACCESSORS : false;
              var argument0 = has(options, 0) ? options[0] : thrower;
              var argument1 = has(options, 1) ? options[1] : void 0;
              return cache[METHOD_NAME] = !!method && !fails(function() {
                if (ACCESSORS && !DESCRIPTORS) return true;
                var O = { length: -1 };
                if (ACCESSORS) defineProperty(O, 1, { enumerable: true, get: thrower });
                else O[1] = 1;
                method.call(O, argument0, argument1);
              });
            };
          }
        ),
        /***/
        "ae93": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var getPrototypeOf = __webpack_require__("e163");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var has = __webpack_require__("5135");
            var wellKnownSymbol = __webpack_require__("b622");
            var IS_PURE = __webpack_require__("c430");
            var ITERATOR = wellKnownSymbol("iterator");
            var BUGGY_SAFARI_ITERATORS = false;
            var returnThis = function() {
              return this;
            };
            var IteratorPrototype, PrototypeOfArrayIteratorPrototype, arrayIterator;
            if ([].keys) {
              arrayIterator = [].keys();
              if (!("next" in arrayIterator)) BUGGY_SAFARI_ITERATORS = true;
              else {
                PrototypeOfArrayIteratorPrototype = getPrototypeOf(getPrototypeOf(arrayIterator));
                if (PrototypeOfArrayIteratorPrototype !== Object.prototype) IteratorPrototype = PrototypeOfArrayIteratorPrototype;
              }
            }
            if (IteratorPrototype == void 0) IteratorPrototype = {};
            if (!IS_PURE && !has(IteratorPrototype, ITERATOR)) {
              createNonEnumerableProperty(IteratorPrototype, ITERATOR, returnThis);
            }
            module2.exports = {
              IteratorPrototype,
              BUGGY_SAFARI_ITERATORS
            };
          }
        ),
        /***/
        "b041": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var TO_STRING_TAG_SUPPORT = __webpack_require__("00ee");
            var classof = __webpack_require__("f5df");
            module2.exports = TO_STRING_TAG_SUPPORT ? {}.toString : function toString() {
              return "[object " + classof(this) + "]";
            };
          }
        ),
        /***/
        "b0c0": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var DESCRIPTORS = __webpack_require__("83ab");
            var defineProperty = __webpack_require__("9bf2").f;
            var FunctionPrototype = Function.prototype;
            var FunctionPrototypeToString = FunctionPrototype.toString;
            var nameRE = /^\s*function ([^ (]*)/;
            var NAME = "name";
            if (DESCRIPTORS && !(NAME in FunctionPrototype)) {
              defineProperty(FunctionPrototype, NAME, {
                configurable: true,
                get: function() {
                  try {
                    return FunctionPrototypeToString.call(this).match(nameRE)[1];
                  } catch (error) {
                    return "";
                  }
                }
              });
            }
          }
        ),
        /***/
        "b622": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var shared = __webpack_require__("5692");
            var has = __webpack_require__("5135");
            var uid = __webpack_require__("90e3");
            var NATIVE_SYMBOL = __webpack_require__("4930");
            var USE_SYMBOL_AS_UID = __webpack_require__("fdbf");
            var WellKnownSymbolsStore = shared("wks");
            var Symbol2 = global.Symbol;
            var createWellKnownSymbol = USE_SYMBOL_AS_UID ? Symbol2 : Symbol2 && Symbol2.withoutSetter || uid;
            module2.exports = function(name) {
              if (!has(WellKnownSymbolsStore, name)) {
                if (NATIVE_SYMBOL && has(Symbol2, name)) WellKnownSymbolsStore[name] = Symbol2[name];
                else WellKnownSymbolsStore[name] = createWellKnownSymbol("Symbol." + name);
              }
              return WellKnownSymbolsStore[name];
            };
          }
        ),
        /***/
        "b64b": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var toObject = __webpack_require__("7b0b");
            var nativeKeys = __webpack_require__("df75");
            var fails = __webpack_require__("d039");
            var FAILS_ON_PRIMITIVES = fails(function() {
              nativeKeys(1);
            });
            $({ target: "Object", stat: true, forced: FAILS_ON_PRIMITIVES }, {
              keys: function keys(it) {
                return nativeKeys(toObject(it));
              }
            });
          }
        ),
        /***/
        "b727": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var bind = __webpack_require__("0366");
            var IndexedObject = __webpack_require__("44ad");
            var toObject = __webpack_require__("7b0b");
            var toLength = __webpack_require__("50c4");
            var arraySpeciesCreate = __webpack_require__("65f0");
            var push = [].push;
            var createMethod = function(TYPE) {
              var IS_MAP = TYPE == 1;
              var IS_FILTER = TYPE == 2;
              var IS_SOME = TYPE == 3;
              var IS_EVERY = TYPE == 4;
              var IS_FIND_INDEX = TYPE == 6;
              var NO_HOLES = TYPE == 5 || IS_FIND_INDEX;
              return function($this, callbackfn, that, specificCreate) {
                var O = toObject($this);
                var self2 = IndexedObject(O);
                var boundFunction = bind(callbackfn, that, 3);
                var length = toLength(self2.length);
                var index2 = 0;
                var create = specificCreate || arraySpeciesCreate;
                var target = IS_MAP ? create($this, length) : IS_FILTER ? create($this, 0) : void 0;
                var value, result;
                for (; length > index2; index2++) if (NO_HOLES || index2 in self2) {
                  value = self2[index2];
                  result = boundFunction(value, index2, O);
                  if (TYPE) {
                    if (IS_MAP) target[index2] = result;
                    else if (result) switch (TYPE) {
                      case 3:
                        return true;
                      case 5:
                        return value;
                      case 6:
                        return index2;
                      case 2:
                        push.call(target, value);
                    }
                    else if (IS_EVERY) return false;
                  }
                }
                return IS_FIND_INDEX ? -1 : IS_SOME || IS_EVERY ? IS_EVERY : target;
              };
            };
            module2.exports = {
              // `Array.prototype.forEach` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.foreach
              forEach: createMethod(0),
              // `Array.prototype.map` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.map
              map: createMethod(1),
              // `Array.prototype.filter` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.filter
              filter: createMethod(2),
              // `Array.prototype.some` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.some
              some: createMethod(3),
              // `Array.prototype.every` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.every
              every: createMethod(4),
              // `Array.prototype.find` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.find
              find: createMethod(5),
              // `Array.prototype.findIndex` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.findIndex
              findIndex: createMethod(6)
            };
          }
        ),
        /***/
        "c04e": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var isObject = __webpack_require__("861d");
            module2.exports = function(input, PREFERRED_STRING) {
              if (!isObject(input)) return input;
              var fn, val;
              if (PREFERRED_STRING && typeof (fn = input.toString) == "function" && !isObject(val = fn.call(input))) return val;
              if (typeof (fn = input.valueOf) == "function" && !isObject(val = fn.call(input))) return val;
              if (!PREFERRED_STRING && typeof (fn = input.toString) == "function" && !isObject(val = fn.call(input))) return val;
              throw TypeError("Can't convert object to primitive value");
            };
          }
        ),
        /***/
        "c430": (
          /***/
          function(module2, exports$12) {
            module2.exports = false;
          }
        ),
        /***/
        "c6b6": (
          /***/
          function(module2, exports$12) {
            var toString = {}.toString;
            module2.exports = function(it) {
              return toString.call(it).slice(8, -1);
            };
          }
        ),
        /***/
        "c6cd": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var setGlobal = __webpack_require__("ce4e");
            var SHARED = "__core-js_shared__";
            var store = global[SHARED] || setGlobal(SHARED, {});
            module2.exports = store;
          }
        ),
        /***/
        "c740": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $findIndex = __webpack_require__("b727").findIndex;
            var addToUnscopables = __webpack_require__("44d2");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var FIND_INDEX = "findIndex";
            var SKIPS_HOLES = true;
            var USES_TO_LENGTH = arrayMethodUsesToLength(FIND_INDEX);
            if (FIND_INDEX in []) Array(1)[FIND_INDEX](function() {
              SKIPS_HOLES = false;
            });
            $({ target: "Array", proto: true, forced: SKIPS_HOLES || !USES_TO_LENGTH }, {
              findIndex: function findIndex(callbackfn) {
                return $findIndex(this, callbackfn, arguments.length > 1 ? arguments[1] : void 0);
              }
            });
            addToUnscopables(FIND_INDEX);
          }
        ),
        /***/
        "c8ba": (
          /***/
          function(module2, exports$12) {
            var g2;
            g2 = /* @__PURE__ */ function() {
              return this;
            }();
            try {
              g2 = g2 || new Function("return this")();
            } catch (e) {
              if (typeof window === "object") g2 = window;
            }
            module2.exports = g2;
          }
        ),
        /***/
        "c975": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $indexOf = __webpack_require__("4d64").indexOf;
            var arrayMethodIsStrict = __webpack_require__("a640");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var nativeIndexOf = [].indexOf;
            var NEGATIVE_ZERO = !!nativeIndexOf && 1 / [1].indexOf(1, -0) < 0;
            var STRICT_METHOD = arrayMethodIsStrict("indexOf");
            var USES_TO_LENGTH = arrayMethodUsesToLength("indexOf", { ACCESSORS: true, 1: 0 });
            $({ target: "Array", proto: true, forced: NEGATIVE_ZERO || !STRICT_METHOD || !USES_TO_LENGTH }, {
              indexOf: function indexOf(searchElement) {
                return NEGATIVE_ZERO ? nativeIndexOf.apply(this, arguments) || 0 : $indexOf(this, searchElement, arguments.length > 1 ? arguments[1] : void 0);
              }
            });
          }
        ),
        /***/
        "ca84": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var has = __webpack_require__("5135");
            var toIndexedObject = __webpack_require__("fc6a");
            var indexOf = __webpack_require__("4d64").indexOf;
            var hiddenKeys = __webpack_require__("d012");
            module2.exports = function(object, names) {
              var O = toIndexedObject(object);
              var i = 0;
              var result = [];
              var key;
              for (key in O) !has(hiddenKeys, key) && has(O, key) && result.push(key);
              while (names.length > i) if (has(O, key = names[i++])) {
                ~indexOf(result, key) || result.push(key);
              }
              return result;
            };
          }
        ),
        /***/
        "caad": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $includes = __webpack_require__("4d64").includes;
            var addToUnscopables = __webpack_require__("44d2");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var USES_TO_LENGTH = arrayMethodUsesToLength("indexOf", { ACCESSORS: true, 1: 0 });
            $({ target: "Array", proto: true, forced: !USES_TO_LENGTH }, {
              includes: function includes(el) {
                return $includes(this, el, arguments.length > 1 ? arguments[1] : void 0);
              }
            });
            addToUnscopables("includes");
          }
        ),
        /***/
        "cc12": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var isObject = __webpack_require__("861d");
            var document2 = global.document;
            var EXISTS = isObject(document2) && isObject(document2.createElement);
            module2.exports = function(it) {
              return EXISTS ? document2.createElement(it) : {};
            };
          }
        ),
        /***/
        "ce4e": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var createNonEnumerableProperty = __webpack_require__("9112");
            module2.exports = function(key, value) {
              try {
                createNonEnumerableProperty(global, key, value);
              } catch (error) {
                global[key] = value;
              }
              return value;
            };
          }
        ),
        /***/
        "d012": (
          /***/
          function(module2, exports$12) {
            module2.exports = {};
          }
        ),
        /***/
        "d039": (
          /***/
          function(module2, exports$12) {
            module2.exports = function(exec) {
              try {
                return !!exec();
              } catch (error) {
                return true;
              }
            };
          }
        ),
        /***/
        "d066": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var path = __webpack_require__("428f");
            var global = __webpack_require__("da84");
            var aFunction = function(variable) {
              return typeof variable == "function" ? variable : void 0;
            };
            module2.exports = function(namespace, method) {
              return arguments.length < 2 ? aFunction(path[namespace]) || aFunction(global[namespace]) : path[namespace] && path[namespace][method] || global[namespace] && global[namespace][method];
            };
          }
        ),
        /***/
        "d1e7": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var nativePropertyIsEnumerable = {}.propertyIsEnumerable;
            var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
            var NASHORN_BUG = getOwnPropertyDescriptor && !nativePropertyIsEnumerable.call({ 1: 2 }, 1);
            exports$12.f = NASHORN_BUG ? function propertyIsEnumerable(V) {
              var descriptor = getOwnPropertyDescriptor(this, V);
              return !!descriptor && descriptor.enumerable;
            } : nativePropertyIsEnumerable;
          }
        ),
        /***/
        "d28b": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var defineWellKnownSymbol = __webpack_require__("746f");
            defineWellKnownSymbol("iterator");
          }
        ),
        /***/
        "d2bb": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var anObject = __webpack_require__("825a");
            var aPossiblePrototype = __webpack_require__("3bbe");
            module2.exports = Object.setPrototypeOf || ("__proto__" in {} ? function() {
              var CORRECT_SETTER = false;
              var test = {};
              var setter;
              try {
                setter = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__").set;
                setter.call(test, []);
                CORRECT_SETTER = test instanceof Array;
              } catch (error) {
              }
              return function setPrototypeOf(O, proto) {
                anObject(O);
                aPossiblePrototype(proto);
                if (CORRECT_SETTER) setter.call(O, proto);
                else O.__proto__ = proto;
                return O;
              };
            }() : void 0);
          }
        ),
        /***/
        "d3b7": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var TO_STRING_TAG_SUPPORT = __webpack_require__("00ee");
            var redefine = __webpack_require__("6eeb");
            var toString = __webpack_require__("b041");
            if (!TO_STRING_TAG_SUPPORT) {
              redefine(Object.prototype, "toString", toString, { unsafe: true });
            }
          }
        ),
        /***/
        "d44e": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var defineProperty = __webpack_require__("9bf2").f;
            var has = __webpack_require__("5135");
            var wellKnownSymbol = __webpack_require__("b622");
            var TO_STRING_TAG = wellKnownSymbol("toStringTag");
            module2.exports = function(it, TAG, STATIC) {
              if (it && !has(it = STATIC ? it : it.prototype, TO_STRING_TAG)) {
                defineProperty(it, TO_STRING_TAG, { configurable: true, value: TAG });
              }
            };
          }
        ),
        /***/
        "d58f": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var aFunction = __webpack_require__("1c0b");
            var toObject = __webpack_require__("7b0b");
            var IndexedObject = __webpack_require__("44ad");
            var toLength = __webpack_require__("50c4");
            var createMethod = function(IS_RIGHT) {
              return function(that, callbackfn, argumentsLength, memo) {
                aFunction(callbackfn);
                var O = toObject(that);
                var self2 = IndexedObject(O);
                var length = toLength(O.length);
                var index2 = IS_RIGHT ? length - 1 : 0;
                var i = IS_RIGHT ? -1 : 1;
                if (argumentsLength < 2) while (true) {
                  if (index2 in self2) {
                    memo = self2[index2];
                    index2 += i;
                    break;
                  }
                  index2 += i;
                  if (IS_RIGHT ? index2 < 0 : length <= index2) {
                    throw TypeError("Reduce of empty array with no initial value");
                  }
                }
                for (; IS_RIGHT ? index2 >= 0 : length > index2; index2 += i) if (index2 in self2) {
                  memo = callbackfn(memo, self2[index2], index2, O);
                }
                return memo;
              };
            };
            module2.exports = {
              // `Array.prototype.reduce` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.reduce
              left: createMethod(false),
              // `Array.prototype.reduceRight` method
              // https://tc39.github.io/ecma262/#sec-array.prototype.reduceright
              right: createMethod(true)
            };
          }
        ),
        /***/
        "d784": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            __webpack_require__("ac1f");
            var redefine = __webpack_require__("6eeb");
            var fails = __webpack_require__("d039");
            var wellKnownSymbol = __webpack_require__("b622");
            var regexpExec = __webpack_require__("9263");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var SPECIES = wellKnownSymbol("species");
            var REPLACE_SUPPORTS_NAMED_GROUPS = !fails(function() {
              var re = /./;
              re.exec = function() {
                var result = [];
                result.groups = { a: "7" };
                return result;
              };
              return "".replace(re, "$<a>") !== "7";
            });
            var REPLACE_KEEPS_$0 = function() {
              return "a".replace(/./, "$0") === "$0";
            }();
            var REPLACE = wellKnownSymbol("replace");
            var REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE = function() {
              if (/./[REPLACE]) {
                return /./[REPLACE]("a", "$0") === "";
              }
              return false;
            }();
            var SPLIT_WORKS_WITH_OVERWRITTEN_EXEC = !fails(function() {
              var re = /(?:)/;
              var originalExec = re.exec;
              re.exec = function() {
                return originalExec.apply(this, arguments);
              };
              var result = "ab".split(re);
              return result.length !== 2 || result[0] !== "a" || result[1] !== "b";
            });
            module2.exports = function(KEY, length, exec, sham) {
              var SYMBOL = wellKnownSymbol(KEY);
              var DELEGATES_TO_SYMBOL = !fails(function() {
                var O = {};
                O[SYMBOL] = function() {
                  return 7;
                };
                return ""[KEY](O) != 7;
              });
              var DELEGATES_TO_EXEC = DELEGATES_TO_SYMBOL && !fails(function() {
                var execCalled = false;
                var re = /a/;
                if (KEY === "split") {
                  re = {};
                  re.constructor = {};
                  re.constructor[SPECIES] = function() {
                    return re;
                  };
                  re.flags = "";
                  re[SYMBOL] = /./[SYMBOL];
                }
                re.exec = function() {
                  execCalled = true;
                  return null;
                };
                re[SYMBOL]("");
                return !execCalled;
              });
              if (!DELEGATES_TO_SYMBOL || !DELEGATES_TO_EXEC || KEY === "replace" && !(REPLACE_SUPPORTS_NAMED_GROUPS && REPLACE_KEEPS_$0 && !REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE) || KEY === "split" && !SPLIT_WORKS_WITH_OVERWRITTEN_EXEC) {
                var nativeRegExpMethod = /./[SYMBOL];
                var methods = exec(SYMBOL, ""[KEY], function(nativeMethod, regexp, str, arg2, forceStringMethod) {
                  if (regexp.exec === regexpExec) {
                    if (DELEGATES_TO_SYMBOL && !forceStringMethod) {
                      return { done: true, value: nativeRegExpMethod.call(regexp, str, arg2) };
                    }
                    return { done: true, value: nativeMethod.call(str, regexp, arg2) };
                  }
                  return { done: false };
                }, {
                  REPLACE_KEEPS_$0,
                  REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE
                });
                var stringMethod = methods[0];
                var regexMethod = methods[1];
                redefine(String.prototype, KEY, stringMethod);
                redefine(
                  RegExp.prototype,
                  SYMBOL,
                  length == 2 ? function(string, arg) {
                    return regexMethod.call(string, this, arg);
                  } : function(string) {
                    return regexMethod.call(string, this);
                  }
                );
              }
              if (sham) createNonEnumerableProperty(RegExp.prototype[SYMBOL], "sham", true);
            };
          }
        ),
        /***/
        "d81d": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var $map = __webpack_require__("b727").map;
            var arrayMethodHasSpeciesSupport = __webpack_require__("1dde");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var HAS_SPECIES_SUPPORT = arrayMethodHasSpeciesSupport("map");
            var USES_TO_LENGTH = arrayMethodUsesToLength("map");
            $({ target: "Array", proto: true, forced: !HAS_SPECIES_SUPPORT || !USES_TO_LENGTH }, {
              map: function map(callbackfn) {
                return $map(this, callbackfn, arguments.length > 1 ? arguments[1] : void 0);
              }
            });
          }
        ),
        /***/
        "da84": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            (function(global) {
              var check = function(it) {
                return it && it.Math == Math && it;
              };
              module2.exports = // eslint-disable-next-line no-undef
              check(typeof globalThis == "object" && globalThis) || check(typeof window == "object" && window) || check(typeof self == "object" && self) || check(typeof global == "object" && global) || // eslint-disable-next-line no-new-func
              Function("return this")();
            }).call(this, __webpack_require__("c8ba"));
          }
        ),
        /***/
        "dbb4": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var DESCRIPTORS = __webpack_require__("83ab");
            var ownKeys2 = __webpack_require__("56ef");
            var toIndexedObject = __webpack_require__("fc6a");
            var getOwnPropertyDescriptorModule = __webpack_require__("06cf");
            var createProperty = __webpack_require__("8418");
            $({ target: "Object", stat: true, sham: !DESCRIPTORS }, {
              getOwnPropertyDescriptors: function getOwnPropertyDescriptors(object) {
                var O = toIndexedObject(object);
                var getOwnPropertyDescriptor = getOwnPropertyDescriptorModule.f;
                var keys = ownKeys2(O);
                var result = {};
                var index2 = 0;
                var key, descriptor;
                while (keys.length > index2) {
                  descriptor = getOwnPropertyDescriptor(O, key = keys[index2++]);
                  if (descriptor !== void 0) createProperty(result, key, descriptor);
                }
                return result;
              }
            });
          }
        ),
        /***/
        "dbf1": (
          /***/
          function(module2, __webpack_exports__, __webpack_require__) {
            (function(global) {
              __webpack_require__.d(__webpack_exports__, "a", function() {
                return console2;
              });
              function getConsole() {
                if (typeof window !== "undefined") {
                  return window.console;
                }
                return global.console;
              }
              var console2 = getConsole();
            }).call(this, __webpack_require__("c8ba"));
          }
        ),
        /***/
        "ddb0": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var global = __webpack_require__("da84");
            var DOMIterables = __webpack_require__("fdbc");
            var ArrayIteratorMethods = __webpack_require__("e260");
            var createNonEnumerableProperty = __webpack_require__("9112");
            var wellKnownSymbol = __webpack_require__("b622");
            var ITERATOR = wellKnownSymbol("iterator");
            var TO_STRING_TAG = wellKnownSymbol("toStringTag");
            var ArrayValues = ArrayIteratorMethods.values;
            for (var COLLECTION_NAME in DOMIterables) {
              var Collection = global[COLLECTION_NAME];
              var CollectionPrototype = Collection && Collection.prototype;
              if (CollectionPrototype) {
                if (CollectionPrototype[ITERATOR] !== ArrayValues) try {
                  createNonEnumerableProperty(CollectionPrototype, ITERATOR, ArrayValues);
                } catch (error) {
                  CollectionPrototype[ITERATOR] = ArrayValues;
                }
                if (!CollectionPrototype[TO_STRING_TAG]) {
                  createNonEnumerableProperty(CollectionPrototype, TO_STRING_TAG, COLLECTION_NAME);
                }
                if (DOMIterables[COLLECTION_NAME]) for (var METHOD_NAME in ArrayIteratorMethods) {
                  if (CollectionPrototype[METHOD_NAME] !== ArrayIteratorMethods[METHOD_NAME]) try {
                    createNonEnumerableProperty(CollectionPrototype, METHOD_NAME, ArrayIteratorMethods[METHOD_NAME]);
                  } catch (error) {
                    CollectionPrototype[METHOD_NAME] = ArrayIteratorMethods[METHOD_NAME];
                  }
                }
              }
            }
          }
        ),
        /***/
        "df75": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var internalObjectKeys = __webpack_require__("ca84");
            var enumBugKeys = __webpack_require__("7839");
            module2.exports = Object.keys || function keys(O) {
              return internalObjectKeys(O, enumBugKeys);
            };
          }
        ),
        /***/
        "e01a": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var DESCRIPTORS = __webpack_require__("83ab");
            var global = __webpack_require__("da84");
            var has = __webpack_require__("5135");
            var isObject = __webpack_require__("861d");
            var defineProperty = __webpack_require__("9bf2").f;
            var copyConstructorProperties = __webpack_require__("e893");
            var NativeSymbol = global.Symbol;
            if (DESCRIPTORS && typeof NativeSymbol == "function" && (!("description" in NativeSymbol.prototype) || // Safari 12 bug
            NativeSymbol().description !== void 0)) {
              var EmptyStringDescriptionStore = {};
              var SymbolWrapper = function Symbol2() {
                var description = arguments.length < 1 || arguments[0] === void 0 ? void 0 : String(arguments[0]);
                var result = this instanceof SymbolWrapper ? new NativeSymbol(description) : description === void 0 ? NativeSymbol() : NativeSymbol(description);
                if (description === "") EmptyStringDescriptionStore[result] = true;
                return result;
              };
              copyConstructorProperties(SymbolWrapper, NativeSymbol);
              var symbolPrototype = SymbolWrapper.prototype = NativeSymbol.prototype;
              symbolPrototype.constructor = SymbolWrapper;
              var symbolToString = symbolPrototype.toString;
              var native = String(NativeSymbol("test")) == "Symbol(test)";
              var regexp = /^Symbol\((.*)\)[^)]+$/;
              defineProperty(symbolPrototype, "description", {
                configurable: true,
                get: function description() {
                  var symbol = isObject(this) ? this.valueOf() : this;
                  var string = symbolToString.call(symbol);
                  if (has(EmptyStringDescriptionStore, symbol)) return "";
                  var desc = native ? string.slice(7, -1) : string.replace(regexp, "$1");
                  return desc === "" ? void 0 : desc;
                }
              });
              $({ global: true, forced: true }, {
                Symbol: SymbolWrapper
              });
            }
          }
        ),
        /***/
        "e163": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var has = __webpack_require__("5135");
            var toObject = __webpack_require__("7b0b");
            var sharedKey = __webpack_require__("f772");
            var CORRECT_PROTOTYPE_GETTER = __webpack_require__("e177");
            var IE_PROTO = sharedKey("IE_PROTO");
            var ObjectPrototype = Object.prototype;
            module2.exports = CORRECT_PROTOTYPE_GETTER ? Object.getPrototypeOf : function(O) {
              O = toObject(O);
              if (has(O, IE_PROTO)) return O[IE_PROTO];
              if (typeof O.constructor == "function" && O instanceof O.constructor) {
                return O.constructor.prototype;
              }
              return O instanceof Object ? ObjectPrototype : null;
            };
          }
        ),
        /***/
        "e177": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var fails = __webpack_require__("d039");
            module2.exports = !fails(function() {
              function F() {
              }
              F.prototype.constructor = null;
              return Object.getPrototypeOf(new F()) !== F.prototype;
            });
          }
        ),
        /***/
        "e260": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var toIndexedObject = __webpack_require__("fc6a");
            var addToUnscopables = __webpack_require__("44d2");
            var Iterators = __webpack_require__("3f8c");
            var InternalStateModule = __webpack_require__("69f3");
            var defineIterator = __webpack_require__("7dd0");
            var ARRAY_ITERATOR = "Array Iterator";
            var setInternalState = InternalStateModule.set;
            var getInternalState = InternalStateModule.getterFor(ARRAY_ITERATOR);
            module2.exports = defineIterator(Array, "Array", function(iterated, kind) {
              setInternalState(this, {
                type: ARRAY_ITERATOR,
                target: toIndexedObject(iterated),
                // target
                index: 0,
                // next index
                kind
                // kind
              });
            }, function() {
              var state = getInternalState(this);
              var target = state.target;
              var kind = state.kind;
              var index2 = state.index++;
              if (!target || index2 >= target.length) {
                state.target = void 0;
                return { value: void 0, done: true };
              }
              if (kind == "keys") return { value: index2, done: false };
              if (kind == "values") return { value: target[index2], done: false };
              return { value: [index2, target[index2]], done: false };
            }, "values");
            Iterators.Arguments = Iterators.Array;
            addToUnscopables("keys");
            addToUnscopables("values");
            addToUnscopables("entries");
          }
        ),
        /***/
        "e439": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var fails = __webpack_require__("d039");
            var toIndexedObject = __webpack_require__("fc6a");
            var nativeGetOwnPropertyDescriptor = __webpack_require__("06cf").f;
            var DESCRIPTORS = __webpack_require__("83ab");
            var FAILS_ON_PRIMITIVES = fails(function() {
              nativeGetOwnPropertyDescriptor(1);
            });
            var FORCED = !DESCRIPTORS || FAILS_ON_PRIMITIVES;
            $({ target: "Object", stat: true, forced: FORCED, sham: !DESCRIPTORS }, {
              getOwnPropertyDescriptor: function getOwnPropertyDescriptor(it, key) {
                return nativeGetOwnPropertyDescriptor(toIndexedObject(it), key);
              }
            });
          }
        ),
        /***/
        "e538": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var wellKnownSymbol = __webpack_require__("b622");
            exports$12.f = wellKnownSymbol;
          }
        ),
        /***/
        "e893": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var has = __webpack_require__("5135");
            var ownKeys2 = __webpack_require__("56ef");
            var getOwnPropertyDescriptorModule = __webpack_require__("06cf");
            var definePropertyModule = __webpack_require__("9bf2");
            module2.exports = function(target, source) {
              var keys = ownKeys2(source);
              var defineProperty = definePropertyModule.f;
              var getOwnPropertyDescriptor = getOwnPropertyDescriptorModule.f;
              for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (!has(target, key)) defineProperty(target, key, getOwnPropertyDescriptor(source, key));
              }
            };
          }
        ),
        /***/
        "e8b5": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var classof = __webpack_require__("c6b6");
            module2.exports = Array.isArray || function isArray(arg) {
              return classof(arg) == "Array";
            };
          }
        ),
        /***/
        "e95a": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var wellKnownSymbol = __webpack_require__("b622");
            var Iterators = __webpack_require__("3f8c");
            var ITERATOR = wellKnownSymbol("iterator");
            var ArrayPrototype = Array.prototype;
            module2.exports = function(it) {
              return it !== void 0 && (Iterators.Array === it || ArrayPrototype[ITERATOR] === it);
            };
          }
        ),
        /***/
        "f5df": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var TO_STRING_TAG_SUPPORT = __webpack_require__("00ee");
            var classofRaw = __webpack_require__("c6b6");
            var wellKnownSymbol = __webpack_require__("b622");
            var TO_STRING_TAG = wellKnownSymbol("toStringTag");
            var CORRECT_ARGUMENTS = classofRaw(/* @__PURE__ */ function() {
              return arguments;
            }()) == "Arguments";
            var tryGet = function(it, key) {
              try {
                return it[key];
              } catch (error) {
              }
            };
            module2.exports = TO_STRING_TAG_SUPPORT ? classofRaw : function(it) {
              var O, tag, result;
              return it === void 0 ? "Undefined" : it === null ? "Null" : typeof (tag = tryGet(O = Object(it), TO_STRING_TAG)) == "string" ? tag : CORRECT_ARGUMENTS ? classofRaw(O) : (result = classofRaw(O)) == "Object" && typeof O.callee == "function" ? "Arguments" : result;
            };
          }
        ),
        /***/
        "f772": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var shared = __webpack_require__("5692");
            var uid = __webpack_require__("90e3");
            var keys = shared("keys");
            module2.exports = function(key) {
              return keys[key] || (keys[key] = uid(key));
            };
          }
        ),
        /***/
        "fb15": (
          /***/
          function(module2, __webpack_exports__, __webpack_require__) {
            __webpack_require__.r(__webpack_exports__);
            if (typeof window !== "undefined") {
              var currentScript = window.document.currentScript;
              {
                var getCurrentScript = __webpack_require__("8875");
                currentScript = getCurrentScript();
                if (!("currentScript" in document)) {
                  Object.defineProperty(document, "currentScript", { get: getCurrentScript });
                }
              }
              var src = currentScript && currentScript.src.match(/(.+\/)[^/]+\.js(\?.*)?$/);
              if (src) {
                __webpack_require__.p = src[1];
              }
            }
            __webpack_require__("99af");
            __webpack_require__("4de4");
            __webpack_require__("4160");
            __webpack_require__("c975");
            __webpack_require__("d81d");
            __webpack_require__("a434");
            __webpack_require__("159b");
            __webpack_require__("a4d3");
            __webpack_require__("e439");
            __webpack_require__("dbb4");
            __webpack_require__("b64b");
            function _defineProperty2(obj, key, value) {
              if (key in obj) {
                Object.defineProperty(obj, key, {
                  value,
                  enumerable: true,
                  configurable: true,
                  writable: true
                });
              } else {
                obj[key] = value;
              }
              return obj;
            }
            function ownKeys2(object, enumerableOnly) {
              var keys = Object.keys(object);
              if (Object.getOwnPropertySymbols) {
                var symbols = Object.getOwnPropertySymbols(object);
                if (enumerableOnly) symbols = symbols.filter(function(sym) {
                  return Object.getOwnPropertyDescriptor(object, sym).enumerable;
                });
                keys.push.apply(keys, symbols);
              }
              return keys;
            }
            function _objectSpread22(target) {
              for (var i = 1; i < arguments.length; i++) {
                var source = arguments[i] != null ? arguments[i] : {};
                if (i % 2) {
                  ownKeys2(Object(source), true).forEach(function(key) {
                    _defineProperty2(target, key, source[key]);
                  });
                } else if (Object.getOwnPropertyDescriptors) {
                  Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
                } else {
                  ownKeys2(Object(source)).forEach(function(key) {
                    Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
                  });
                }
              }
              return target;
            }
            function _arrayWithHoles(arr) {
              if (Array.isArray(arr)) return arr;
            }
            __webpack_require__("e01a");
            __webpack_require__("d28b");
            __webpack_require__("e260");
            __webpack_require__("d3b7");
            __webpack_require__("3ca3");
            __webpack_require__("ddb0");
            function _iterableToArrayLimit(arr, i) {
              if (typeof Symbol === "undefined" || !(Symbol.iterator in Object(arr))) return;
              var _arr = [];
              var _n = true;
              var _d = false;
              var _e = void 0;
              try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                  _arr.push(_s.value);
                  if (i && _arr.length === i) break;
                }
              } catch (err) {
                _d = true;
                _e = err;
              } finally {
                try {
                  if (!_n && _i["return"] != null) _i["return"]();
                } finally {
                  if (_d) throw _e;
                }
              }
              return _arr;
            }
            __webpack_require__("a630");
            __webpack_require__("fb6a");
            __webpack_require__("b0c0");
            __webpack_require__("25f0");
            function _arrayLikeToArray2(arr, len) {
              if (len == null || len > arr.length) len = arr.length;
              for (var i = 0, arr2 = new Array(len); i < len; i++) {
                arr2[i] = arr[i];
              }
              return arr2;
            }
            function _unsupportedIterableToArray2(o, minLen) {
              if (!o) return;
              if (typeof o === "string") return _arrayLikeToArray2(o, minLen);
              var n = Object.prototype.toString.call(o).slice(8, -1);
              if (n === "Object" && o.constructor) n = o.constructor.name;
              if (n === "Map" || n === "Set") return Array.from(o);
              if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray2(o, minLen);
            }
            function _nonIterableRest() {
              throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
            }
            function _slicedToArray(arr, i) {
              return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray2(arr, i) || _nonIterableRest();
            }
            function _arrayWithoutHoles2(arr) {
              if (Array.isArray(arr)) return _arrayLikeToArray2(arr);
            }
            function _iterableToArray2(iter) {
              if (typeof Symbol !== "undefined" && Symbol.iterator in Object(iter)) return Array.from(iter);
            }
            function _nonIterableSpread2() {
              throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
            }
            function _toConsumableArray2(arr) {
              return _arrayWithoutHoles2(arr) || _iterableToArray2(arr) || _unsupportedIterableToArray2(arr) || _nonIterableSpread2();
            }
            var external_commonjs_sortablejs_commonjs2_sortablejs_amd_sortablejs_root_Sortable_ = __webpack_require__("a352");
            var external_commonjs_sortablejs_commonjs2_sortablejs_amd_sortablejs_root_Sortable_default = /* @__PURE__ */ __webpack_require__.n(external_commonjs_sortablejs_commonjs2_sortablejs_amd_sortablejs_root_Sortable_);
            function removeNode(node) {
              if (node.parentElement !== null) {
                node.parentElement.removeChild(node);
              }
            }
            function insertNodeAt(fatherNode, node, position) {
              var refNode = position === 0 ? fatherNode.children[0] : fatherNode.children[position - 1].nextSibling;
              fatherNode.insertBefore(node, refNode);
            }
            var console2 = __webpack_require__("dbf1");
            __webpack_require__("13d5");
            __webpack_require__("4fad");
            __webpack_require__("ac1f");
            __webpack_require__("5319");
            function cached(fn) {
              var cache = /* @__PURE__ */ Object.create(null);
              return function cachedFn(str) {
                var hit = cache[str];
                return hit || (cache[str] = fn(str));
              };
            }
            var regex = /-(\w)/g;
            var camelize2 = cached(function(str) {
              return str.replace(regex, function(_, c) {
                return c.toUpperCase();
              });
            });
            __webpack_require__("5db7");
            __webpack_require__("73d9");
            var manageAndEmit = ["Start", "Add", "Remove", "Update", "End"];
            var emit = ["Choose", "Unchoose", "Sort", "Filter", "Clone"];
            var manage = ["Move"];
            var eventHandlerNames = [manage, manageAndEmit, emit].flatMap(function(events2) {
              return events2;
            }).map(function(evt) {
              return "on".concat(evt);
            });
            var events = {
              manage,
              manageAndEmit,
              emit
            };
            function isReadOnly(eventName) {
              return eventHandlerNames.indexOf(eventName) !== -1;
            }
            __webpack_require__("caad");
            __webpack_require__("2ca0");
            var tags = ["a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map", "mark", "math", "menu", "menuitem", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp", "script", "section", "select", "slot", "small", "source", "span", "strong", "style", "sub", "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr"];
            function isHtmlTag(name) {
              return tags.includes(name);
            }
            function isTransition(name) {
              return ["transition-group", "TransitionGroup"].includes(name);
            }
            function isHtmlAttribute(value) {
              return ["id", "class", "role", "style"].includes(value) || value.startsWith("data-") || value.startsWith("aria-") || value.startsWith("on");
            }
            function project(entries) {
              return entries.reduce(function(res, _ref) {
                var _ref2 = _slicedToArray(_ref, 2), key = _ref2[0], value = _ref2[1];
                res[key] = value;
                return res;
              }, {});
            }
            function getComponentAttributes(_ref3) {
              var $attrs = _ref3.$attrs, _ref3$componentData = _ref3.componentData, componentData = _ref3$componentData === void 0 ? {} : _ref3$componentData;
              var attributes = project(Object.entries($attrs).filter(function(_ref4) {
                var _ref5 = _slicedToArray(_ref4, 2), key = _ref5[0];
                _ref5[1];
                return isHtmlAttribute(key);
              }));
              return _objectSpread22(_objectSpread22({}, attributes), componentData);
            }
            function createSortableOption(_ref6) {
              var $attrs = _ref6.$attrs, callBackBuilder = _ref6.callBackBuilder;
              var options = project(getValidSortableEntries($attrs));
              Object.entries(callBackBuilder).forEach(function(_ref7) {
                var _ref8 = _slicedToArray(_ref7, 2), eventType = _ref8[0], eventBuilder = _ref8[1];
                events[eventType].forEach(function(event) {
                  options["on".concat(event)] = eventBuilder(event);
                });
              });
              var draggable2 = "[data-draggable]".concat(options.draggable || "");
              return _objectSpread22(_objectSpread22({}, options), {}, {
                draggable: draggable2
              });
            }
            function getValidSortableEntries(value) {
              return Object.entries(value).filter(function(_ref9) {
                var _ref10 = _slicedToArray(_ref9, 2), key = _ref10[0];
                _ref10[1];
                return !isHtmlAttribute(key);
              }).map(function(_ref11) {
                var _ref12 = _slicedToArray(_ref11, 2), key = _ref12[0], value2 = _ref12[1];
                return [camelize2(key), value2];
              }).filter(function(_ref13) {
                var _ref14 = _slicedToArray(_ref13, 2), key = _ref14[0];
                _ref14[1];
                return !isReadOnly(key);
              });
            }
            __webpack_require__("c740");
            function _classCallCheck(instance, Constructor) {
              if (!(instance instanceof Constructor)) {
                throw new TypeError("Cannot call a class as a function");
              }
            }
            function _defineProperties(target, props2) {
              for (var i = 0; i < props2.length; i++) {
                var descriptor = props2[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
              }
            }
            function _createClass(Constructor, protoProps, staticProps) {
              if (protoProps) _defineProperties(Constructor.prototype, protoProps);
              return Constructor;
            }
            var getHtmlElementFromNode = function getHtmlElementFromNode2(_ref) {
              var el = _ref.el;
              return el;
            };
            var addContext = function addContext2(domElement, context) {
              return domElement.__draggable_context = context;
            };
            var getContext = function getContext2(domElement) {
              return domElement.__draggable_context;
            };
            var componentStructure_ComponentStructure = /* @__PURE__ */ function() {
              function ComponentStructure(_ref2) {
                var _ref2$nodes = _ref2.nodes, header = _ref2$nodes.header, defaultNodes = _ref2$nodes.default, footer = _ref2$nodes.footer, root = _ref2.root, realList = _ref2.realList;
                _classCallCheck(this, ComponentStructure);
                this.defaultNodes = defaultNodes;
                this.children = [].concat(_toConsumableArray2(header), _toConsumableArray2(defaultNodes), _toConsumableArray2(footer));
                this.externalComponent = root.externalComponent;
                this.rootTransition = root.transition;
                this.tag = root.tag;
                this.realList = realList;
              }
              _createClass(ComponentStructure, [{
                key: "render",
                value: function render2(h2, attributes) {
                  var tag = this.tag, children = this.children, _isRootComponent = this._isRootComponent;
                  var option2 = !_isRootComponent ? children : {
                    default: function _default() {
                      return children;
                    }
                  };
                  return h2(tag, attributes, option2);
                }
              }, {
                key: "updated",
                value: function updated() {
                  var defaultNodes = this.defaultNodes, realList = this.realList;
                  defaultNodes.forEach(function(node, index2) {
                    addContext(getHtmlElementFromNode(node), {
                      element: realList[index2],
                      index: index2
                    });
                  });
                }
              }, {
                key: "getUnderlyingVm",
                value: function getUnderlyingVm(domElement) {
                  return getContext(domElement);
                }
              }, {
                key: "getVmIndexFromDomIndex",
                value: function getVmIndexFromDomIndex(domIndex, element) {
                  var defaultNodes = this.defaultNodes;
                  var length = defaultNodes.length;
                  var domChildren = element.children;
                  var domElement = domChildren.item(domIndex);
                  if (domElement === null) {
                    return length;
                  }
                  var context = getContext(domElement);
                  if (context) {
                    return context.index;
                  }
                  if (length === 0) {
                    return 0;
                  }
                  var firstDomListElement = getHtmlElementFromNode(defaultNodes[0]);
                  var indexFirstDomListElement = _toConsumableArray2(domChildren).findIndex(function(element2) {
                    return element2 === firstDomListElement;
                  });
                  return domIndex < indexFirstDomListElement ? 0 : length;
                }
              }, {
                key: "_isRootComponent",
                get: function get() {
                  return this.externalComponent || this.rootTransition;
                }
              }]);
              return ComponentStructure;
            }();
            var external_commonjs_vue_commonjs2_vue_root_Vue_ = __webpack_require__("8bbf");
            function getSlot(slots, key) {
              var slotValue = slots[key];
              return slotValue ? slotValue() : [];
            }
            function computeNodes(_ref) {
              var $slots = _ref.$slots, realList = _ref.realList, getKey = _ref.getKey;
              var normalizedList = realList || [];
              var _map = ["header", "footer"].map(function(name) {
                return getSlot($slots, name);
              }), _map2 = _slicedToArray(_map, 2), header = _map2[0], footer = _map2[1];
              var item = $slots.item;
              if (!item) {
                throw new Error("draggable element must have an item slot");
              }
              var defaultNodes = normalizedList.flatMap(function(element, index2) {
                return item({
                  element,
                  index: index2
                }).map(function(node) {
                  node.key = getKey(element);
                  node.props = _objectSpread22(_objectSpread22({}, node.props || {}), {}, {
                    "data-draggable": true
                  });
                  return node;
                });
              });
              if (defaultNodes.length !== normalizedList.length) {
                throw new Error("Item slot must have only one child");
              }
              return {
                header,
                footer,
                default: defaultNodes
              };
            }
            function getRootInformation(tag) {
              var transition = isTransition(tag);
              var externalComponent = !isHtmlTag(tag) && !transition;
              return {
                transition,
                externalComponent,
                tag: externalComponent ? Object(external_commonjs_vue_commonjs2_vue_root_Vue_["resolveComponent"])(tag) : transition ? external_commonjs_vue_commonjs2_vue_root_Vue_["TransitionGroup"] : tag
              };
            }
            function computeComponentStructure(_ref2) {
              var $slots = _ref2.$slots, tag = _ref2.tag, realList = _ref2.realList, getKey = _ref2.getKey;
              var nodes = computeNodes({
                $slots,
                realList,
                getKey
              });
              var root = getRootInformation(tag);
              return new componentStructure_ComponentStructure({
                nodes,
                root,
                realList
              });
            }
            function _emit(evtName, evtData) {
              var _this = this;
              Object(external_commonjs_vue_commonjs2_vue_root_Vue_["nextTick"])(function() {
                return _this.$emit(evtName.toLowerCase(), evtData);
              });
            }
            function _manage(evtName) {
              var _this2 = this;
              return function(evtData, originalElement) {
                if (_this2.realList !== null) {
                  return _this2["onDrag".concat(evtName)](evtData, originalElement);
                }
              };
            }
            function _manageAndEmit(evtName) {
              var _this3 = this;
              var delegateCallBack = _manage.call(this, evtName);
              return function(evtData, originalElement) {
                delegateCallBack.call(_this3, evtData, originalElement);
                _emit.call(_this3, evtName, evtData);
              };
            }
            var draggingElement = null;
            var props = {
              list: {
                type: Array,
                required: false,
                default: null
              },
              modelValue: {
                type: Array,
                required: false,
                default: null
              },
              itemKey: {
                type: [String, Function],
                required: true
              },
              clone: {
                type: Function,
                default: function _default(original) {
                  return original;
                }
              },
              tag: {
                type: String,
                default: "div"
              },
              move: {
                type: Function,
                default: null
              },
              componentData: {
                type: Object,
                required: false,
                default: null
              }
            };
            var emits = ["update:modelValue", "change"].concat(_toConsumableArray2([].concat(_toConsumableArray2(events.manageAndEmit), _toConsumableArray2(events.emit)).map(function(evt) {
              return evt.toLowerCase();
            })));
            var draggableComponent = Object(external_commonjs_vue_commonjs2_vue_root_Vue_["defineComponent"])({
              name: "draggable",
              inheritAttrs: false,
              props,
              emits,
              data: function data() {
                return {
                  error: false
                };
              },
              render: function render2() {
                try {
                  this.error = false;
                  var $slots = this.$slots, $attrs = this.$attrs, tag = this.tag, componentData = this.componentData, realList = this.realList, getKey = this.getKey;
                  var componentStructure = computeComponentStructure({
                    $slots,
                    tag,
                    realList,
                    getKey
                  });
                  this.componentStructure = componentStructure;
                  var attributes = getComponentAttributes({
                    $attrs,
                    componentData
                  });
                  return componentStructure.render(external_commonjs_vue_commonjs2_vue_root_Vue_["h"], attributes);
                } catch (err) {
                  this.error = true;
                  return Object(external_commonjs_vue_commonjs2_vue_root_Vue_["h"])("pre", {
                    style: {
                      color: "red"
                    }
                  }, err.stack);
                }
              },
              created: function created() {
                if (this.list !== null && this.modelValue !== null) {
                  console2[
                    "a"
                    /* console */
                  ].error("modelValue and list props are mutually exclusive! Please set one or another.");
                }
              },
              mounted: function mounted() {
                var _this4 = this;
                if (this.error) {
                  return;
                }
                var $attrs = this.$attrs, $el = this.$el, componentStructure = this.componentStructure;
                componentStructure.updated();
                var sortableOptions = createSortableOption({
                  $attrs,
                  callBackBuilder: {
                    manageAndEmit: function manageAndEmit2(event) {
                      return _manageAndEmit.call(_this4, event);
                    },
                    emit: function emit2(event) {
                      return _emit.bind(_this4, event);
                    },
                    manage: function manage2(event) {
                      return _manage.call(_this4, event);
                    }
                  }
                });
                var targetDomElement = $el.nodeType === 1 ? $el : $el.parentElement;
                this._sortable = new external_commonjs_sortablejs_commonjs2_sortablejs_amd_sortablejs_root_Sortable_default.a(targetDomElement, sortableOptions);
                this.targetDomElement = targetDomElement;
                targetDomElement.__draggable_component__ = this;
              },
              updated: function updated() {
                this.componentStructure.updated();
              },
              beforeUnmount: function beforeUnmount() {
                if (this._sortable !== void 0) this._sortable.destroy();
              },
              computed: {
                realList: function realList() {
                  var list = this.list;
                  return list ? list : this.modelValue;
                },
                getKey: function getKey() {
                  var itemKey = this.itemKey;
                  if (typeof itemKey === "function") {
                    return itemKey;
                  }
                  return function(element) {
                    return element[itemKey];
                  };
                }
              },
              watch: {
                $attrs: {
                  handler: function handler(newOptionValue) {
                    var _sortable = this._sortable;
                    if (!_sortable) return;
                    getValidSortableEntries(newOptionValue).forEach(function(_ref) {
                      var _ref2 = _slicedToArray(_ref, 2), key = _ref2[0], value = _ref2[1];
                      _sortable.option(key, value);
                    });
                  },
                  deep: true
                }
              },
              methods: {
                getUnderlyingVm: function getUnderlyingVm(domElement) {
                  return this.componentStructure.getUnderlyingVm(domElement) || null;
                },
                getUnderlyingPotencialDraggableComponent: function getUnderlyingPotencialDraggableComponent(htmElement) {
                  return htmElement.__draggable_component__;
                },
                emitChanges: function emitChanges(evt) {
                  var _this5 = this;
                  Object(external_commonjs_vue_commonjs2_vue_root_Vue_["nextTick"])(function() {
                    return _this5.$emit("change", evt);
                  });
                },
                alterList: function alterList(onList) {
                  if (this.list) {
                    onList(this.list);
                    return;
                  }
                  var newList = _toConsumableArray2(this.modelValue);
                  onList(newList);
                  this.$emit("update:modelValue", newList);
                },
                spliceList: function spliceList() {
                  var _arguments = arguments;
                  var spliceList2 = function spliceList3(list) {
                    return list.splice.apply(list, _toConsumableArray2(_arguments));
                  };
                  this.alterList(spliceList2);
                },
                updatePosition: function updatePosition(oldIndex2, newIndex2) {
                  var updatePosition2 = function updatePosition3(list) {
                    return list.splice(newIndex2, 0, list.splice(oldIndex2, 1)[0]);
                  };
                  this.alterList(updatePosition2);
                },
                getRelatedContextFromMoveEvent: function getRelatedContextFromMoveEvent(_ref3) {
                  var to = _ref3.to, related = _ref3.related;
                  var component = this.getUnderlyingPotencialDraggableComponent(to);
                  if (!component) {
                    return {
                      component
                    };
                  }
                  var list = component.realList;
                  var context = {
                    list,
                    component
                  };
                  if (to !== related && list) {
                    var destination = component.getUnderlyingVm(related) || {};
                    return _objectSpread22(_objectSpread22({}, destination), context);
                  }
                  return context;
                },
                getVmIndexFromDomIndex: function getVmIndexFromDomIndex(domIndex) {
                  return this.componentStructure.getVmIndexFromDomIndex(domIndex, this.targetDomElement);
                },
                onDragStart: function onDragStart(evt) {
                  this.context = this.getUnderlyingVm(evt.item);
                  evt.item._underlying_vm_ = this.clone(this.context.element);
                  draggingElement = evt.item;
                },
                onDragAdd: function onDragAdd(evt) {
                  var element = evt.item._underlying_vm_;
                  if (element === void 0) {
                    return;
                  }
                  removeNode(evt.item);
                  var newIndex2 = this.getVmIndexFromDomIndex(evt.newIndex);
                  this.spliceList(newIndex2, 0, element);
                  var added = {
                    element,
                    newIndex: newIndex2
                  };
                  this.emitChanges({
                    added
                  });
                },
                onDragRemove: function onDragRemove(evt) {
                  insertNodeAt(this.$el, evt.item, evt.oldIndex);
                  if (evt.pullMode === "clone") {
                    removeNode(evt.clone);
                    return;
                  }
                  var _this$context = this.context, oldIndex2 = _this$context.index, element = _this$context.element;
                  this.spliceList(oldIndex2, 1);
                  var removed = {
                    element,
                    oldIndex: oldIndex2
                  };
                  this.emitChanges({
                    removed
                  });
                },
                onDragUpdate: function onDragUpdate(evt) {
                  removeNode(evt.item);
                  insertNodeAt(evt.from, evt.item, evt.oldIndex);
                  var oldIndex2 = this.context.index;
                  var newIndex2 = this.getVmIndexFromDomIndex(evt.newIndex);
                  this.updatePosition(oldIndex2, newIndex2);
                  var moved2 = {
                    element: this.context.element,
                    oldIndex: oldIndex2,
                    newIndex: newIndex2
                  };
                  this.emitChanges({
                    moved: moved2
                  });
                },
                computeFutureIndex: function computeFutureIndex(relatedContext, evt) {
                  if (!relatedContext.element) {
                    return 0;
                  }
                  var domChildren = _toConsumableArray2(evt.to.children).filter(function(el) {
                    return el.style["display"] !== "none";
                  });
                  var currentDomIndex = domChildren.indexOf(evt.related);
                  var currentIndex = relatedContext.component.getVmIndexFromDomIndex(currentDomIndex);
                  var draggedInList = domChildren.indexOf(draggingElement) !== -1;
                  return draggedInList || !evt.willInsertAfter ? currentIndex : currentIndex + 1;
                },
                onDragMove: function onDragMove(evt, originalEvent) {
                  var move = this.move, realList = this.realList;
                  if (!move || !realList) {
                    return true;
                  }
                  var relatedContext = this.getRelatedContextFromMoveEvent(evt);
                  var futureIndex = this.computeFutureIndex(relatedContext, evt);
                  var draggedContext = _objectSpread22(_objectSpread22({}, this.context), {}, {
                    futureIndex
                  });
                  var sendEvent = _objectSpread22(_objectSpread22({}, evt), {}, {
                    relatedContext,
                    draggedContext
                  });
                  return move(sendEvent, originalEvent);
                },
                onDragEnd: function onDragEnd() {
                  draggingElement = null;
                }
              }
            });
            var vuedraggable = draggableComponent;
            __webpack_exports__["default"] = vuedraggable;
          }
        ),
        /***/
        "fb6a": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var $ = __webpack_require__("23e7");
            var isObject = __webpack_require__("861d");
            var isArray = __webpack_require__("e8b5");
            var toAbsoluteIndex = __webpack_require__("23cb");
            var toLength = __webpack_require__("50c4");
            var toIndexedObject = __webpack_require__("fc6a");
            var createProperty = __webpack_require__("8418");
            var wellKnownSymbol = __webpack_require__("b622");
            var arrayMethodHasSpeciesSupport = __webpack_require__("1dde");
            var arrayMethodUsesToLength = __webpack_require__("ae40");
            var HAS_SPECIES_SUPPORT = arrayMethodHasSpeciesSupport("slice");
            var USES_TO_LENGTH = arrayMethodUsesToLength("slice", { ACCESSORS: true, 0: 0, 1: 2 });
            var SPECIES = wellKnownSymbol("species");
            var nativeSlice = [].slice;
            var max = Math.max;
            $({ target: "Array", proto: true, forced: !HAS_SPECIES_SUPPORT || !USES_TO_LENGTH }, {
              slice: function slice(start, end) {
                var O = toIndexedObject(this);
                var length = toLength(O.length);
                var k = toAbsoluteIndex(start, length);
                var fin = toAbsoluteIndex(end === void 0 ? length : end, length);
                var Constructor, result, n;
                if (isArray(O)) {
                  Constructor = O.constructor;
                  if (typeof Constructor == "function" && (Constructor === Array || isArray(Constructor.prototype))) {
                    Constructor = void 0;
                  } else if (isObject(Constructor)) {
                    Constructor = Constructor[SPECIES];
                    if (Constructor === null) Constructor = void 0;
                  }
                  if (Constructor === Array || Constructor === void 0) {
                    return nativeSlice.call(O, k, fin);
                  }
                }
                result = new (Constructor === void 0 ? Array : Constructor)(max(fin - k, 0));
                for (n = 0; k < fin; k++, n++) if (k in O) createProperty(result, n, O[k]);
                result.length = n;
                return result;
              }
            });
          }
        ),
        /***/
        "fc6a": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var IndexedObject = __webpack_require__("44ad");
            var requireObjectCoercible = __webpack_require__("1d80");
            module2.exports = function(it) {
              return IndexedObject(requireObjectCoercible(it));
            };
          }
        ),
        /***/
        "fdbc": (
          /***/
          function(module2, exports$12) {
            module2.exports = {
              CSSRuleList: 0,
              CSSStyleDeclaration: 0,
              CSSValueList: 0,
              ClientRectList: 0,
              DOMRectList: 0,
              DOMStringList: 0,
              DOMTokenList: 1,
              DataTransferItemList: 0,
              FileList: 0,
              HTMLAllCollection: 0,
              HTMLCollection: 0,
              HTMLFormElement: 0,
              HTMLSelectElement: 0,
              MediaList: 0,
              MimeTypeArray: 0,
              NamedNodeMap: 0,
              NodeList: 1,
              PaintRequestList: 0,
              Plugin: 0,
              PluginArray: 0,
              SVGLengthList: 0,
              SVGNumberList: 0,
              SVGPathSegList: 0,
              SVGPointList: 0,
              SVGStringList: 0,
              SVGTransformList: 0,
              SourceBufferList: 0,
              StyleSheetList: 0,
              TextTrackCueList: 0,
              TextTrackList: 0,
              TouchList: 0
            };
          }
        ),
        /***/
        "fdbf": (
          /***/
          function(module2, exports$12, __webpack_require__) {
            var NATIVE_SYMBOL = __webpack_require__("4930");
            module2.exports = NATIVE_SYMBOL && !Symbol.sham && typeof Symbol.iterator == "symbol";
          }
        )
        /******/
      })["default"]
    );
  });
})(vuedraggable_umd);
var vuedraggable_umdExports = vuedraggable_umd.exports;
const draggable = /* @__PURE__ */ getDefaultExportFromCjs(vuedraggable_umdExports);
const _hoisted_1$7 = { class: "plot-stage" };
const _hoisted_2$7 = { class: "stage-content" };
const _hoisted_3$7 = {
  key: 0,
  class: "plot-list"
};
const _hoisted_4$7 = { class: "plot-header" };
const _hoisted_5$7 = { class: "drag-handle" };
const _hoisted_6$7 = { class: "plot-number" };
const _hoisted_7$7 = { class: "plot-title" };
const _hoisted_8$7 = { class: "plot-actions" };
const _hoisted_9$7 = { class: "plot-summary" };
const _hoisted_10$7 = {
  key: 0,
  class: "plot-meta"
};
const _hoisted_11$7 = {
  key: 1,
  class: "empty-state"
};
const _hoisted_12$7 = {
  key: 2,
  class: "generating-progress"
};
const _hoisted_13$7 = {
  key: 0,
  class: "generating-content"
};
const _hoisted_14$7 = {
  key: 3,
  class: "action-buttons"
};
const _sfc_main$7 = /* @__PURE__ */ defineComponent({
  __name: "PlotStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const selectedModelRef = inject("selectedModel");
    const selectedModel = computed(() => selectedModelRef?.value);
    const plots = ref([]);
    const characterNames = ref([]);
    const generating = ref(false);
    const generatingContent = ref("");
    const currentEventId = ref(null);
    const showAddDialog = ref(false);
    const editingPlotId = ref(null);
    const plotForm = ref({
      title: "",
      summary: "",
      involvedCharacters: [],
      notes: ""
    });
    async function loadPlots() {
      console.log("[PlotStage] loadPlots 被调用, projectId:", props.projectId);
      try {
        const result = await window.electronAPI.longwriting.getPlots(props.projectId);
        console.log("[PlotStage] getPlots 结果:", result);
        if (result.success) {
          plots.value = result.data || [];
          console.log("[PlotStage] 加载到情节数量:", plots.value.length);
          updateProgress();
        } else {
          console.error("[PlotStage] 加载情节失败:", result.error);
        }
      } catch (error) {
        console.error("[PlotStage] 加载情节失败:", error);
      }
    }
    async function loadCharacterNames() {
      try {
        const result = await window.electronAPI.longwriting.getCharacters(props.projectId);
        if (result.success && result.data) {
          characterNames.value = result.data.map((c) => c.name);
        }
      } catch (error) {
        console.error("加载角色列表失败:", error);
      }
    }
    function updateProgress() {
      const count = plots.value.length;
      if (count >= 10) {
        emit("update:progress", 20);
      } else if (count >= 5) {
        emit("update:progress", 15);
      } else if (count > 0) {
        emit("update:progress", 12);
      } else {
        emit("update:progress", 10);
      }
    }
    async function generatePlots() {
      console.log("[PlotStage] generatePlots 被调用");
      console.log("[PlotStage] selectedModelRef:", selectedModelRef);
      console.log("[PlotStage] selectedModel.value:", selectedModel.value);
      if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
        console.error("[PlotStage] 未选择模型, providerId:", selectedModel.value?.providerId, "modelId:", selectedModel.value?.modelId);
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      console.log("[PlotStage] 开始生成情节, providerId:", selectedModel.value.providerId, "modelId:", selectedModel.value.modelId);
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `plots-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          console.log("[PlotStage] 收到事件:", event.type);
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            console.log("[PlotStage] 生成完成, 内容长度:", generatingContent.value.length);
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parsePlotsResult(generatingContent.value);
          } else if (event.type === "error") {
            console.error("[PlotStage] 生成错误:", event.error);
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generatePlots(
        currentEventId.value,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      console.log("[PlotStage] generatePlots API 返回:", result);
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parsePlotsResult(content) {
      console.log("[PlotStage] parsePlotsResult 被调用, 内容长度:", content.length);
      console.log("[PlotStage] 内容预览:", content.substring(0, 500));
      try {
        let jsonStr = content;
        if (jsonStr.includes("```json")) {
          jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        } else if (jsonStr.includes("```")) {
          jsonStr = jsonStr.replace(/```\s*/g, "");
        }
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.error("[PlotStage] 未找到 JSON 数组");
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        console.log("[PlotStage] 找到 JSON 数组, 长度:", jsonMatch[0].length);
        const data = JSON.parse(jsonMatch[0]);
        console.log("[PlotStage] 解析后的数据:", data);
        if (!Array.isArray(data) || data.length === 0) {
          console.error("[PlotStage] 数据不是数组或为空");
          ElMessage.warning("AI 未生成有效的情节数据");
          return;
        }
        console.log("[PlotStage] 准备批量创建情节, 数量:", data.length, "projectId:", props.projectId);
        const createResult = await window.electronAPI.longwriting.batchCreatePlots(props.projectId, data);
        console.log("[PlotStage] batchCreatePlots 结果:", createResult);
        if (createResult.success) {
          plots.value = createResult.data || [];
          console.log("[PlotStage] 情节创建成功, 数量:", plots.value.length);
          ElMessage.success(`成功生成 ${plots.value.length} 个情节`);
          updateProgress();
        } else {
          console.error("[PlotStage] 创建情节失败:", createResult.error);
          ElMessage.error(createResult.error || "保存情节失败");
        }
      } catch (error) {
        console.error("[PlotStage] 解析 AI 响应失败:", error);
        ElMessage.error("解析 AI 响应失败");
      }
    }
    function startEdit(plot) {
      editingPlotId.value = plot.id;
      plotForm.value = {
        title: plot.title,
        summary: plot.summary,
        involvedCharacters: [...plot.involvedCharacters || []],
        notes: plot.notes || ""
      };
      showAddDialog.value = true;
    }
    async function savePlot() {
      if (!plotForm.value.title.trim()) {
        ElMessage.warning("请输入情节标题");
        return;
      }
      if (!plotForm.value.summary.trim()) {
        ElMessage.warning("请输入情节概要");
        return;
      }
      const formData = toRaw(plotForm.value);
      try {
        if (editingPlotId.value) {
          const result = await window.electronAPI.longwriting.updatePlot(editingPlotId.value, {
            title: formData.title,
            summary: formData.summary,
            involvedCharacters: formData.involvedCharacters,
            notes: formData.notes
          });
          if (result.success) {
            ElMessage.success("情节已更新");
            await loadPlots();
          } else {
            ElMessage.error(result.error || "更新失败");
          }
        } else {
          const result = await window.electronAPI.longwriting.createPlot({
            projectId: props.projectId,
            title: formData.title,
            summary: formData.summary,
            involvedCharacters: formData.involvedCharacters,
            notes: formData.notes
          });
          if (result.success) {
            ElMessage.success("情节已添加");
            await loadPlots();
          } else {
            ElMessage.error(result.error || "添加失败");
          }
        }
        showAddDialog.value = false;
        resetForm();
      } catch (error) {
        console.error("保存情节失败:", error);
        ElMessage.error("保存失败");
      }
    }
    async function deletePlot(id) {
      try {
        await ElMessageBox.confirm("确定要删除这个情节吗？", "提示", {
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deletePlot(id);
        if (result.success) {
          ElMessage.success("情节已删除");
          await loadPlots();
        } else {
          ElMessage.error(result.error || "删除失败");
        }
      } catch {
      }
    }
    async function clearAllPlots() {
      try {
        await ElMessageBox.confirm("确定要清空所有情节吗？此操作不可恢复。", "警告", {
          type: "warning"
        });
        for (const plot of plots.value) {
          await window.electronAPI.longwriting.deletePlot(plot.id);
        }
        plots.value = [];
        ElMessage.success("已清空所有情节");
        updateProgress();
      } catch {
      }
    }
    async function onDragEnd() {
      const orderList = plots.value.map((plot, index2) => ({
        id: plot.id,
        order: index2
      }));
      const result = await window.electronAPI.longwriting.reorderPlots(props.projectId, orderList);
      if (!result.success) {
        ElMessage.error("排序保存失败");
        await loadPlots();
      }
    }
    function resetForm() {
      editingPlotId.value = null;
      plotForm.value = {
        title: "",
        summary: "",
        involvedCharacters: [],
        notes: ""
      };
    }
    onMounted(() => {
      console.log("[PlotStage] onMounted 被调用, projectId:", props.projectId);
      loadPlots();
      loadCharacterNames();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1$7, [
        _cache[14] || (_cache[14] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "故事情节设计"),
          createBaseVNode("p", { class: "stage-desc" }, "规划故事的主要情节脉络，为大纲设计提供基础")
        ], -1)),
        createBaseVNode("div", _hoisted_2$7, [
          plots.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_3$7, [
            createVNode(unref(draggable), {
              modelValue: plots.value,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => plots.value = $event),
              "item-key": "id",
              handle: ".drag-handle",
              animation: "200",
              onEnd: onDragEnd
            }, {
              item: withCtx(({ element, index: index2 }) => [
                createBaseVNode("div", {
                  class: normalizeClass(["plot-card", { editing: editingPlotId.value === element.id }])
                }, [
                  createBaseVNode("div", _hoisted_4$7, [
                    createBaseVNode("div", _hoisted_5$7, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(rank_default))
                        ]),
                        _: 1
                      })
                    ]),
                    createBaseVNode("span", _hoisted_6$7, toDisplayString(index2 + 1), 1),
                    createBaseVNode("h4", _hoisted_7$7, toDisplayString(element.title), 1),
                    createBaseVNode("div", _hoisted_8$7, [
                      createVNode(_component_el_button, {
                        text: "",
                        size: "small",
                        onClick: ($event) => startEdit(element)
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(edit_default))
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }, 8, ["onClick"]),
                      createVNode(_component_el_button, {
                        text: "",
                        size: "small",
                        type: "danger",
                        onClick: ($event) => deletePlot(element.id)
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
                  ]),
                  createBaseVNode("p", _hoisted_9$7, toDisplayString(element.summary), 1),
                  element.involvedCharacters?.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_10$7, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(element.involvedCharacters, (char) => {
                      return openBlock(), createBlock(_component_el_tag, {
                        key: char,
                        size: "small",
                        type: "info",
                        class: "character-tag"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(char), 1)
                        ]),
                        _: 2
                      }, 1024);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ], 2)
              ]),
              _: 1
            }, 8, ["modelValue"])
          ])) : !generating.value ? (openBlock(), createElementBlock("div", _hoisted_11$7, [
            createVNode(_component_el_empty, { description: "暂无情节" }, {
              image: withCtx(() => [
                createVNode(_component_el_icon, {
                  size: 64,
                  color: "#C0C4CC"
                }, {
                  default: withCtx(() => [
                    createVNode(unref(document_default))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ])) : createCommentVNode("", true),
          generating.value ? (openBlock(), createElementBlock("div", _hoisted_12$7, [
            createVNode(_component_el_progress, {
              percentage: 100,
              indeterminate: true
            }),
            _cache[8] || (_cache[8] = createBaseVNode("p", { class: "progress-text" }, "AI 正在生成故事情节...", -1)),
            generatingContent.value ? (openBlock(), createElementBlock("div", _hoisted_13$7, [
              createBaseVNode("pre", null, toDisplayString(generatingContent.value), 1)
            ])) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          !generating.value ? (openBlock(), createElementBlock("div", _hoisted_14$7, [
            createVNode(_component_el_button, {
              type: "primary",
              onClick: generatePlots,
              disabled: plots.value.length > 0
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(magic_stick_default))
                  ]),
                  _: 1
                }),
                _cache[9] || (_cache[9] = createTextVNode(" AI 生成情节 ", -1))
              ]),
              _: 1
            }, 8, ["disabled"]),
            createVNode(_component_el_button, {
              onClick: _cache[1] || (_cache[1] = ($event) => showAddDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[10] || (_cache[10] = createTextVNode(" 手动添加 ", -1))
              ]),
              _: 1
            }),
            plots.value.length > 0 ? (openBlock(), createBlock(_component_el_button, {
              key: 0,
              type: "danger",
              plain: "",
              onClick: clearAllPlots
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(delete_default))
                  ]),
                  _: 1
                }),
                _cache[11] || (_cache[11] = createTextVNode(" 清空全部 ", -1))
              ]),
              _: 1
            })) : createCommentVNode("", true)
          ])) : createCommentVNode("", true)
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showAddDialog.value,
          "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => showAddDialog.value = $event),
          title: editingPlotId.value ? "编辑情节" : "添加情节",
          width: "600px",
          onClose: resetForm
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[6] || (_cache[6] = ($event) => showAddDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[12] || (_cache[12] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: savePlot
            }, {
              default: withCtx(() => [..._cache[13] || (_cache[13] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: plotForm.value,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "情节标题",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: plotForm.value.title,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => plotForm.value.title = $event),
                      placeholder: "输入情节标题",
                      maxlength: "50",
                      "show-word-limit": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "情节概要",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: plotForm.value.summary,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => plotForm.value.summary = $event),
                      type: "textarea",
                      rows: 4,
                      placeholder: "描述这个情节的主要内容...",
                      maxlength: "500",
                      "show-word-limit": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "涉及角色" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: plotForm.value.involvedCharacters,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => plotForm.value.involvedCharacters = $event),
                      multiple: "",
                      filterable: "",
                      "allow-create": "",
                      "default-first-option": "",
                      placeholder: "选择或输入涉及的角色"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(characterNames.value, (char) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: char,
                            label: char,
                            value: char
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "备注" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: plotForm.value.notes,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => plotForm.value.notes = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "可选的备注信息"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"])
      ]);
    };
  }
});
const PlotStage = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-af53dc12"]]);
const _hoisted_1$6 = { class: "background-stage" };
const _hoisted_2$6 = { class: "stage-header" };
const _hoisted_3$6 = { class: "era-form" };
const _hoisted_4$6 = { class: "form-row" };
const _hoisted_5$6 = { class: "form-row" };
const _hoisted_6$6 = { class: "form-label-row" };
const _hoisted_7$6 = { class: "form-row" };
const _hoisted_8$6 = { class: "form-label-row" };
const _hoisted_9$6 = { class: "form-row" };
const _hoisted_10$6 = { class: "form-label-row" };
const _hoisted_11$6 = { class: "form-row" };
const _hoisted_12$6 = { class: "form-label-row" };
const _hoisted_13$6 = { class: "form-row" };
const _hoisted_14$6 = { class: "form-label-row" };
const _hoisted_15$6 = { class: "form-row" };
const _hoisted_16$6 = { class: "form-label-row" };
const _hoisted_17$6 = { class: "form-actions" };
const _hoisted_18$5 = { class: "map-list" };
const _hoisted_19$5 = {
  key: 0,
  class: "map-image"
};
const _hoisted_20$5 = ["src"];
const _hoisted_21$5 = {
  key: 1,
  class: "map-image map-image-placeholder"
};
const _hoisted_22$5 = { class: "map-info" };
const _hoisted_23$5 = { class: "map-tags" };
const _hoisted_24$5 = { class: "map-desc" };
const _hoisted_25$5 = {
  key: 0,
  class: "map-ai-data"
};
const _hoisted_26$5 = { class: "ai-data-content" };
const _hoisted_27$5 = { key: 0 };
const _hoisted_28$5 = { key: 1 };
const _hoisted_29$5 = { key: 2 };
const _hoisted_30$5 = { class: "map-actions" };
const _hoisted_31$4 = { class: "location-list" };
const _hoisted_32$4 = { class: "tab-actions" };
const _hoisted_33$2 = { class: "location-info" };
const _hoisted_34$2 = { class: "location-tags" };
const _hoisted_35$2 = { class: "location-desc" };
const _hoisted_36$2 = { class: "location-actions" };
const _hoisted_37$2 = { class: "faction-section" };
const _hoisted_38$2 = { class: "tab-actions" };
const _hoisted_39$2 = { class: "faction-filter" };
const _hoisted_40$2 = { class: "faction-list" };
const _hoisted_41$2 = { class: "faction-info" };
const _hoisted_42$2 = { class: "faction-header" };
const _hoisted_43$2 = {
  key: 0,
  class: "faction-location"
};
const _hoisted_44$2 = { class: "faction-desc" };
const _hoisted_45$2 = { class: "faction-actions" };
const _hoisted_46$2 = { style: { "margin-top": "-8px", "color": "var(--text-color-secondary)", "font-size": "13px" } };
const _hoisted_47$2 = { class: "ai-result-list" };
const _hoisted_48$2 = { class: "ai-result-content" };
const _hoisted_49$2 = { class: "ai-result-header" };
const _hoisted_50$2 = { class: "ai-result-name" };
const _hoisted_51$2 = { class: "ai-result-desc" };
const _hoisted_52$2 = { class: "ai-result-list" };
const _hoisted_53$2 = { class: "ai-result-content" };
const _hoisted_54$2 = { class: "ai-result-header" };
const _hoisted_55$2 = { class: "ai-result-name" };
const _hoisted_56$1 = { class: "ai-result-desc" };
const _sfc_main$6 = /* @__PURE__ */ defineComponent({
  __name: "BackgroundStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const selectedModelRef = inject("selectedModel");
    const selectedModel = computed(() => selectedModelRef?.value);
    const imageProviderModels = inject("imageProviderModels");
    const selectedImageModelKey = ref("");
    const selectedImageModel = computed(() => {
      if (!selectedImageModelKey.value) return null;
      const [providerId, modelId] = selectedImageModelKey.value.split(":");
      return { providerId, modelId };
    });
    const activeTab = ref("era");
    const eraForm = ref({
      eraType: "ancient",
      eraDescription: "",
      socialStructure: "",
      techLevel: "",
      specialRules: "",
      factionDistribution: "",
      geographicOrientation: ""
    });
    const locations = ref([]);
    const showLocationDialog = ref(false);
    const editingLocationId = ref(null);
    const locationForm = ref({
      name: "",
      type: "city",
      importance: "important",
      description: "",
      mapId: ""
    });
    const factions = ref([]);
    const factionFilter = ref("all");
    const filteredFactions = computed(() => {
      if (factionFilter.value === "all") {
        return factions.value;
      }
      return factions.value.filter((f) => f.factionType === factionFilter.value);
    });
    const showFactionDialog = ref(false);
    const editingFactionId = ref(null);
    const factionForm = ref({
      factionType: "country",
      name: "",
      locationId: "",
      description: ""
    });
    const maps = ref([]);
    const showMapDialog = ref(false);
    const editingMapId = ref(null);
    const mapForm = ref({
      name: "",
      orientation: "other",
      characteristics: ""
    });
    const showAIMapDataDialog = ref(false);
    const aiMapDataPrompt = ref("");
    const generatingMapData = ref(false);
    const showMapImageDialog = ref(false);
    const generatingImageMap = ref(null);
    const generatingMapImage = ref(false);
    const saveStatus = ref("idle");
    const polishingField = ref(null);
    const polishingContent = ref("");
    const generatingLocations = ref(false);
    const aiLocationResults = ref([]);
    const showAILocationDialog = ref(false);
    const generatingFactions = ref(false);
    const aiFactionResults = ref([]);
    const showAIFactionDialog = ref(false);
    const saveStatusText = computed(() => {
      switch (saveStatus.value) {
        case "saving":
          return "保存中...";
        case "saved":
          return "已保存";
        default:
          return "";
      }
    });
    function getLocationTypeLabel(type) {
      const labels = {
        city: "城市",
        village: "村庄",
        mountain: "山脉",
        palace: "宫殿",
        forest: "森林",
        sea: "海域",
        building: "建筑",
        other: "其他"
      };
      return labels[type] || type;
    }
    function getImportanceLabel(importance) {
      const labels = {
        main: "主要",
        important: "重要",
        auxiliary: "辅助"
      };
      return labels[importance] || importance;
    }
    function getFactionTypeLabel(type) {
      const labels = {
        country: "国别",
        camp: "阵营",
        sect: "门派"
      };
      return labels[type] || type;
    }
    function getFactionTagType(type) {
      const types = {
        country: "",
        camp: "success",
        sect: "warning"
      };
      return types[type] || "info";
    }
    function getLocationName(locationId) {
      const location = locations.value.find((loc) => loc.id === locationId);
      return location?.name || "未知";
    }
    function getMapName(mapId) {
      const map = maps.value.find((m) => m.id === mapId);
      return map?.name || "未知";
    }
    function getMapImageUrl(imagePath) {
      if (!imagePath) return "";
      const normalizedPath = imagePath.replace(/\\/g, "/");
      return `local-image:///${normalizedPath}`;
    }
    async function loadFactions() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getFactions(props.projectId);
      if (result.success) {
        factions.value = result.data || [];
      }
    }
    function editFaction(faction) {
      editingFactionId.value = faction.id;
      factionForm.value = {
        factionType: faction.factionType,
        name: faction.name,
        locationId: faction.locationId || "",
        description: faction.description
      };
      showFactionDialog.value = true;
    }
    async function deleteFaction(id) {
      const result = await window.electronAPI.longwriting.deleteFaction(id);
      if (result.success) {
        await loadFactions();
        ElMessage.success("势力已删除");
      }
    }
    async function saveFaction() {
      if (!factionForm.value.name) {
        ElMessage.warning("请输入势力名称");
        return;
      }
      const formData = toRaw(factionForm.value);
      if (editingFactionId.value) {
        const result = await window.electronAPI.longwriting.updateFaction(editingFactionId.value, formData);
        if (result.success) {
          ElMessage.success("势力已更新");
        } else {
          ElMessage.error(result.error || "更新失败");
        }
      } else {
        const result = await window.electronAPI.longwriting.createFaction({
          projectId: props.projectId,
          ...formData
        });
        if (result.success) {
          ElMessage.success("势力已添加");
        } else {
          ElMessage.error(result.error || "添加失败");
        }
      }
      showFactionDialog.value = false;
      editingFactionId.value = null;
      factionForm.value = {
        factionType: "country",
        name: "",
        locationId: "",
        description: ""
      };
      await loadFactions();
      emit("update:progress", 35);
    }
    function getMapOrientationLabel(orientation) {
      const labels = {
        north: "北方",
        south: "南方",
        east: "东方",
        west: "西方",
        central: "中央",
        northeast: "东北",
        northwest: "西北",
        southeast: "东南",
        southwest: "西南",
        other: "其他"
      };
      return labels[orientation] || orientation;
    }
    async function loadMaps() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getMaps(props.projectId);
      if (result.success) {
        maps.value = result.data || [];
      }
    }
    function editMap(map) {
      editingMapId.value = map.id;
      mapForm.value = {
        name: map.name,
        orientation: map.orientation || "other",
        characteristics: map.characteristics || ""
      };
      showMapDialog.value = true;
    }
    async function deleteMap(id) {
      const result = await window.electronAPI.longwriting.deleteMap(id);
      if (result.success) {
        await loadMaps();
        ElMessage.success("地图已删除");
      }
    }
    async function saveMap() {
      if (!mapForm.value.name) {
        ElMessage.warning("请输入地图名称");
        return;
      }
      const formData = toRaw(mapForm.value);
      if (editingMapId.value) {
        const result = await window.electronAPI.longwriting.updateMap(editingMapId.value, formData);
        if (result.success) {
          ElMessage.success("地图已更新");
        } else {
          ElMessage.error(result.error || "更新失败");
        }
      } else {
        const result = await window.electronAPI.longwriting.createMap({
          projectId: props.projectId,
          ...formData
        });
        if (result.success) {
          ElMessage.success("地图已添加");
        } else {
          ElMessage.error(result.error || "添加失败");
        }
      }
      showMapDialog.value = false;
      editingMapId.value = null;
      mapForm.value = {
        name: "",
        orientation: "other",
        characteristics: ""
      };
      await loadMaps();
      emit("update:progress", 30);
    }
    function showGenerateMapImageDialog(map) {
      generatingImageMap.value = { id: map.id, name: map.name };
      if (!selectedImageModelKey.value && imageProviderModels?.value && imageProviderModels.value.length > 0) {
        const firstProvider = imageProviderModels.value[0];
        if (firstProvider.models.length > 0) {
          selectedImageModelKey.value = `${firstProvider.id}:${firstProvider.models[0].id}`;
        }
      }
      showMapImageDialog.value = true;
    }
    async function generateMapImage() {
      if (!generatingImageMap.value || !selectedImageModel.value?.providerId) return;
      generatingMapImage.value = true;
      try {
        const result = await window.electronAPI.longwriting.generateMapImage(
          props.projectId,
          generatingImageMap.value.id,
          selectedImageModel.value.providerId,
          selectedImageModel.value.modelId
        );
        if (result.success) {
          ElMessage.success("地图图片已生成");
          await loadMaps();
        } else {
          ElMessage.error(result.error || "生成失败");
        }
      } catch (error) {
        ElMessage.error("生成失败: " + error.message);
      } finally {
        generatingMapImage.value = false;
        showMapImageDialog.value = false;
        generatingImageMap.value = null;
      }
    }
    async function generateMapData() {
      if (!selectedModel.value?.providerId) {
        ElMessage.warning("请先选择 AI 模型");
        return;
      }
      generatingMapData.value = true;
      const eventId = `map-data-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        eventId,
        (event) => {
          if (event.type === "done") {
            generatingMapData.value = false;
            unsubscribe();
            if (event.data || event.content) {
              try {
                const data = event.data || (event.content ? JSON.parse(event.content) : null);
                if (data && editingMapId.value) {
                  window.electronAPI.longwriting.updateMap(editingMapId.value, {
                    aiGeneratedData: data
                  });
                  ElMessage.success("地图数据已生成");
                  loadMaps();
                }
              } catch (e) {
                console.error("解析 AI 生成数据失败:", e);
              }
            }
            showAIMapDataDialog.value = false;
            aiMapDataPrompt.value = "";
          } else if (event.type === "error") {
            generatingMapData.value = false;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateMapData(
        eventId,
        props.projectId,
        editingMapId.value || "",
        aiMapDataPrompt.value,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generatingMapData.value = false;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function loadBackground() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getBackground(props.projectId);
      if (result.success && result.data) {
        eraForm.value = {
          eraType: result.data.eraType || "ancient",
          eraDescription: result.data.eraDescription || "",
          socialStructure: result.data.socialStructure || "",
          techLevel: result.data.techLevel || "",
          specialRules: result.data.specialRules || "",
          factionDistribution: result.data.factionDistribution || "",
          geographicOrientation: result.data.geographicOrientation || ""
        };
      }
    }
    async function saveBackground() {
      console.log("saveBackground 被调用, projectId:", props.projectId);
      if (!props.projectId) return;
      saveStatus.value = "saving";
      const data = toRaw(eraForm.value);
      console.log("准备调用 updateBackground, data:", data);
      try {
        const result = await window.electronAPI.longwriting.updateBackground(props.projectId, data);
        console.log("updateBackground 返回结果:", result);
        if (result.success) {
          saveStatus.value = "saved";
          emit("update:progress", 25);
          ElMessage.success("背景设定已保存");
          setTimeout(() => {
            saveStatus.value = "idle";
          }, 2e3);
        } else {
          saveStatus.value = "idle";
          ElMessage.error(result.error || "保存失败");
        }
      } catch (error) {
        console.error("updateBackground 调用出错:", error);
        saveStatus.value = "idle";
        ElMessage.error("保存失败: " + error);
      }
    }
    async function loadLocations() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getLocations(props.projectId);
      if (result.success) {
        locations.value = result.data || [];
      }
    }
    function editLocation(location) {
      editingLocationId.value = location.id;
      locationForm.value = {
        name: location.name,
        type: location.type,
        importance: location.importance,
        description: location.description,
        mapId: location.mapId || ""
      };
      showLocationDialog.value = true;
    }
    async function deleteLocation(id) {
      const result = await window.electronAPI.longwriting.deleteLocation(id);
      if (result.success) {
        await loadLocations();
        ElMessage.success("地点已删除");
      }
    }
    async function saveLocation() {
      if (!locationForm.value.name) {
        ElMessage.warning("请输入地点名称");
        return;
      }
      const formData = toRaw(locationForm.value);
      if (editingLocationId.value) {
        const result = await window.electronAPI.longwriting.updateLocation(editingLocationId.value, formData);
        if (result.success) {
          ElMessage.success("地点已更新");
        }
      } else {
        const result = await window.electronAPI.longwriting.createLocation({
          projectId: props.projectId,
          ...formData
        });
        if (result.success) {
          ElMessage.success("地点已添加");
        }
      }
      showLocationDialog.value = false;
      editingLocationId.value = null;
      locationForm.value = {
        name: "",
        type: "city",
        importance: "important",
        description: "",
        mapId: ""
      };
      await loadLocations();
      emit("update:progress", 35);
    }
    async function polishField(field) {
      if (!props.projectId) return;
      if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      const content = eraForm.value[field];
      if (!content.trim()) {
        ElMessage.warning("请先输入内容");
        return;
      }
      polishingField.value = field;
      polishingContent.value = "";
      const eventId = `polish-${props.projectId}-${field}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        eventId,
        (event) => {
          if (event.type === "content" && event.content) {
            polishingContent.value += event.content;
          } else if (event.type === "done") {
            polishingField.value = null;
            unsubscribe();
            eraForm.value[field] = polishingContent.value.trim();
            ElMessage.success("润色完成");
          } else if (event.type === "error") {
            polishingField.value = null;
            unsubscribe();
            ElMessage.error(event.error || "润色失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.polishBackground(
        eventId,
        props.projectId,
        field,
        eraForm.value.eraType,
        content,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        polishingField.value = null;
        unsubscribe();
        ElMessage.error(result.error || "润色失败");
      }
    }
    async function generateLocationsFromAI() {
      if (!props.projectId) return;
      if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      generatingLocations.value = true;
      aiLocationResults.value = [];
      const eventId = `gen-locations-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        eventId,
        (event) => {
          if (event.type === "done") {
            generatingLocations.value = false;
            unsubscribe();
            try {
              const data = event.data || (event.content ? JSON.parse(event.content) : null);
              if (data && Array.isArray(data)) {
                aiLocationResults.value = data.map((item) => ({ ...item, selected: true }));
                showAILocationDialog.value = true;
              } else {
                ElMessage.warning("未生成有效的地点建议");
              }
            } catch (e) {
              console.error("解析地点数据失败:", e);
              ElMessage.error("解析地点数据失败");
            }
          } else if (event.type === "error") {
            generatingLocations.value = false;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateLocations(
        eventId,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generatingLocations.value = false;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function adoptSelectedLocations() {
      const selectedItems = aiLocationResults.value.filter((item) => item.selected);
      if (selectedItems.length === 0) {
        ElMessage.warning("请至少选择一个地点");
        return;
      }
      let successCount = 0;
      for (const item of selectedItems) {
        const result = await window.electronAPI.longwriting.createLocation({
          projectId: props.projectId,
          name: item.name,
          type: item.type,
          importance: item.importance,
          description: item.description,
          mapId: item.suggestedMapId || void 0
        });
        if (result.success) {
          successCount++;
        }
      }
      ElMessage.success(`已添加 ${successCount} 个地点`);
      showAILocationDialog.value = false;
      aiLocationResults.value = [];
      await loadLocations();
      emit("update:progress", 35);
    }
    async function generateFactionsFromAI() {
      if (!props.projectId) return;
      if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      generatingFactions.value = true;
      aiFactionResults.value = [];
      const eventId = `gen-factions-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        eventId,
        (event) => {
          if (event.type === "done") {
            generatingFactions.value = false;
            unsubscribe();
            try {
              const data = event.data || (event.content ? JSON.parse(event.content) : null);
              if (data && Array.isArray(data)) {
                aiFactionResults.value = data.map((item) => ({ ...item, selected: true }));
                showAIFactionDialog.value = true;
              } else {
                ElMessage.warning("未生成有效的势力建议");
              }
            } catch (e) {
              console.error("解析势力数据失败:", e);
              ElMessage.error("解析势力数据失败");
            }
          } else if (event.type === "error") {
            generatingFactions.value = false;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateFactions(
        eventId,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generatingFactions.value = false;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function adoptSelectedFactions() {
      const selectedItems = aiFactionResults.value.filter((item) => item.selected);
      if (selectedItems.length === 0) {
        ElMessage.warning("请至少选择一个势力");
        return;
      }
      let successCount = 0;
      for (const item of selectedItems) {
        let locationId = void 0;
        if (item.suggestedLocationName) {
          const matchedLocation = locations.value.find(
            (loc) => loc.name === item.suggestedLocationName
          );
          if (matchedLocation) {
            locationId = matchedLocation.id;
          }
        }
        const result = await window.electronAPI.longwriting.createFaction({
          projectId: props.projectId,
          factionType: item.factionType,
          name: item.name,
          locationId,
          description: item.description
        });
        if (result.success) {
          successCount++;
        }
      }
      ElMessage.success(`已添加 ${successCount} 个势力`);
      showAIFactionDialog.value = false;
      aiFactionResults.value = [];
      await loadFactions();
      emit("update:progress", 35);
    }
    onMounted(() => {
      loadBackground();
      loadMaps();
      loadLocations();
      loadFactions();
    });
    return (_ctx, _cache) => {
      const _component_el_radio_button = resolveComponent("el-radio-button");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tooltip = resolveComponent("el-tooltip");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_collapse_item = resolveComponent("el-collapse-item");
      const _component_el_collapse = resolveComponent("el-collapse");
      const _component_el_alert = resolveComponent("el-alert");
      const _component_el_tabs = resolveComponent("el-tabs");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_radio = resolveComponent("el-radio");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_checkbox = resolveComponent("el-checkbox");
      return openBlock(), createElementBlock("div", _hoisted_1$6, [
        createBaseVNode("div", _hoisted_2$6, [
          _cache[47] || (_cache[47] = createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("h2", null, "时代背景与地点设定"),
            createBaseVNode("p", { class: "stage-desc" }, "设定故事发生的时代背景和主要地点场景")
          ], -1)),
          saveStatus.value !== "idle" ? (openBlock(), createElementBlock("span", {
            key: 0,
            class: normalizeClass(["save-status", saveStatus.value])
          }, toDisplayString(saveStatusText.value), 3)) : createCommentVNode("", true)
        ]),
        createVNode(_component_el_tabs, {
          modelValue: activeTab.value,
          "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => activeTab.value = $event),
          class: "background-tabs"
        }, {
          default: withCtx(() => [
            createVNode(_component_el_tab_pane, {
              label: "时代背景",
              name: "era"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_3$6, [
                  createBaseVNode("div", _hoisted_4$6, [
                    _cache[52] || (_cache[52] = createBaseVNode("label", { class: "form-label" }, "时代类型", -1)),
                    createVNode(_component_el_radio_group, {
                      modelValue: eraForm.value.eraType,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => eraForm.value.eraType = $event),
                      class: "era-type-group"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio_button, { value: "ancient" }, {
                          default: withCtx(() => [..._cache[48] || (_cache[48] = [
                            createTextVNode("古代", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio_button, { value: "modern" }, {
                          default: withCtx(() => [..._cache[49] || (_cache[49] = [
                            createTextVNode("现代", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio_button, { value: "future" }, {
                          default: withCtx(() => [..._cache[50] || (_cache[50] = [
                            createTextVNode("未来", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio_button, { value: "fictional" }, {
                          default: withCtx(() => [..._cache[51] || (_cache[51] = [
                            createTextVNode("架空", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_5$6, [
                    createBaseVNode("div", _hoisted_6$6, [
                      _cache[54] || (_cache[54] = createBaseVNode("label", { class: "form-label" }, "时代描述", -1)),
                      createVNode(_component_el_tooltip, {
                        content: "AI 润色可丰富描述内容",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            icon: unref(magic_stick_default),
                            loading: polishingField.value === "eraDescription",
                            disabled: !eraForm.value.eraDescription.trim(),
                            onClick: _cache[1] || (_cache[1] = ($event) => polishField("eraDescription"))
                          }, {
                            default: withCtx(() => [..._cache[53] || (_cache[53] = [
                              createTextVNode(" 润色 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["icon", "loading", "disabled"])
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: eraForm.value.eraDescription,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => eraForm.value.eraDescription = $event),
                      type: "textarea",
                      rows: 4,
                      placeholder: "描述故事发生的时代背景，如朝代、历史时期、虚构纪元等...",
                      resize: "none"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_7$6, [
                    createBaseVNode("div", _hoisted_8$6, [
                      _cache[56] || (_cache[56] = createBaseVNode("label", { class: "form-label" }, "社会结构", -1)),
                      createVNode(_component_el_tooltip, {
                        content: "AI 润色可丰富描述内容",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            icon: unref(magic_stick_default),
                            loading: polishingField.value === "socialStructure",
                            disabled: !eraForm.value.socialStructure.trim(),
                            onClick: _cache[3] || (_cache[3] = ($event) => polishField("socialStructure"))
                          }, {
                            default: withCtx(() => [..._cache[55] || (_cache[55] = [
                              createTextVNode(" 润色 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["icon", "loading", "disabled"])
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: eraForm.value.socialStructure,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => eraForm.value.socialStructure = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述社会阶层、权力结构、等级制度等...",
                      resize: "none"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_9$6, [
                    createBaseVNode("div", _hoisted_10$6, [
                      _cache[58] || (_cache[58] = createBaseVNode("label", { class: "form-label" }, "技术水平", -1)),
                      createVNode(_component_el_tooltip, {
                        content: "AI 润色可丰富描述内容",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            icon: unref(magic_stick_default),
                            loading: polishingField.value === "techLevel",
                            disabled: !eraForm.value.techLevel.trim(),
                            onClick: _cache[5] || (_cache[5] = ($event) => polishField("techLevel"))
                          }, {
                            default: withCtx(() => [..._cache[57] || (_cache[57] = [
                              createTextVNode(" 润色 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["icon", "loading", "disabled"])
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: eraForm.value.techLevel,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => eraForm.value.techLevel = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "描述科技发展水平、生产力状况、特殊技术等...",
                      resize: "none"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_11$6, [
                    createBaseVNode("div", _hoisted_12$6, [
                      _cache[60] || (_cache[60] = createBaseVNode("label", { class: "form-label" }, "特殊设定", -1)),
                      createVNode(_component_el_tooltip, {
                        content: "AI 润色可丰富描述内容",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            icon: unref(magic_stick_default),
                            loading: polishingField.value === "specialRules",
                            disabled: !eraForm.value.specialRules.trim(),
                            onClick: _cache[7] || (_cache[7] = ($event) => polishField("specialRules"))
                          }, {
                            default: withCtx(() => [..._cache[59] || (_cache[59] = [
                              createTextVNode(" 润色 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["icon", "loading", "disabled"])
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: eraForm.value.specialRules,
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => eraForm.value.specialRules = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "架空世界的特殊规则、魔法体系、修仙等级等...",
                      resize: "none"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_13$6, [
                    createBaseVNode("div", _hoisted_14$6, [
                      _cache[62] || (_cache[62] = createBaseVNode("label", { class: "form-label" }, "势力分布", -1)),
                      createVNode(_component_el_tooltip, {
                        content: "AI 润色可丰富描述内容，用于辅助势力设定的 AI 生成",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            icon: unref(magic_stick_default),
                            loading: polishingField.value === "factionDistribution",
                            disabled: !eraForm.value.factionDistribution.trim(),
                            onClick: _cache[9] || (_cache[9] = ($event) => polishField("factionDistribution"))
                          }, {
                            default: withCtx(() => [..._cache[61] || (_cache[61] = [
                              createTextVNode(" 润色 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["icon", "loading", "disabled"])
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: eraForm.value.factionDistribution,
                      "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => eraForm.value.factionDistribution = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述世界中的主要势力分布，如各大门派、国家、阵营的地理位置和相互关系，用于辅助地图设定和势力设定的 AI 生成...",
                      resize: "none"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_15$6, [
                    createBaseVNode("div", _hoisted_16$6, [
                      _cache[64] || (_cache[64] = createBaseVNode("label", { class: "form-label" }, "地理方位", -1)),
                      createVNode(_component_el_tooltip, {
                        content: "AI 润色可丰富描述内容，用于辅助地点设定的 AI 生成",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            icon: unref(magic_stick_default),
                            loading: polishingField.value === "geographicOrientation",
                            disabled: !eraForm.value.geographicOrientation.trim(),
                            onClick: _cache[11] || (_cache[11] = ($event) => polishField("geographicOrientation"))
                          }, {
                            default: withCtx(() => [..._cache[63] || (_cache[63] = [
                              createTextVNode(" 润色 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["icon", "loading", "disabled"])
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: eraForm.value.geographicOrientation,
                      "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => eraForm.value.geographicOrientation = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述世界的整体地理格局，如东南西北各区域的特点、气候、地形等，用于辅助地图设定的 AI 生成...",
                      resize: "none"
                    }, null, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_17$6, [
                    createVNode(_component_el_button, {
                      type: "primary",
                      loading: saveStatus.value === "saving",
                      onClick: saveBackground
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(check_default))
                          ]),
                          _: 1
                        }),
                        _cache[65] || (_cache[65] = createTextVNode(" 保存设定 ", -1))
                      ]),
                      _: 1
                    }, 8, ["loading"])
                  ])
                ])
              ]),
              _: 1
            }),
            createVNode(_component_el_tab_pane, {
              label: "地图设定",
              name: "maps"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_18$5, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(maps.value, (map) => {
                    return openBlock(), createElementBlock("div", {
                      key: map.id,
                      class: "map-card"
                    }, [
                      map.imagePath ? (openBlock(), createElementBlock("div", _hoisted_19$5, [
                        createBaseVNode("img", {
                          src: getMapImageUrl(map.imagePath),
                          alt: "地图图片"
                        }, null, 8, _hoisted_20$5)
                      ])) : (openBlock(), createElementBlock("div", _hoisted_21$5, [
                        createVNode(_component_el_icon, { size: "40" }, {
                          default: withCtx(() => [
                            createVNode(unref(picture_default))
                          ]),
                          _: 1
                        }),
                        _cache[66] || (_cache[66] = createBaseVNode("span", null, "暂无图片", -1))
                      ])),
                      createBaseVNode("div", _hoisted_22$5, [
                        createBaseVNode("h4", null, toDisplayString(map.name), 1),
                        createBaseVNode("div", _hoisted_23$5, [
                          createVNode(_component_el_tag, {
                            size: "small",
                            type: "info"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(getMapOrientationLabel(map.orientation)), 1)
                            ]),
                            _: 2
                          }, 1024)
                        ]),
                        createBaseVNode("p", _hoisted_24$5, toDisplayString(map.characteristics), 1),
                        map.aiGeneratedData ? (openBlock(), createElementBlock("div", _hoisted_25$5, [
                          createVNode(_component_el_collapse, null, {
                            default: withCtx(() => [
                              createVNode(_component_el_collapse_item, {
                                title: "AI 生成的详细数据",
                                name: "aiData"
                              }, {
                                default: withCtx(() => [
                                  createBaseVNode("div", _hoisted_26$5, [
                                    map.aiGeneratedData.regions?.length ? (openBlock(), createElementBlock("div", _hoisted_27$5, [
                                      _cache[67] || (_cache[67] = createBaseVNode("strong", null, "区域：", -1)),
                                      (openBlock(true), createElementBlock(Fragment, null, renderList(map.aiGeneratedData.regions, (region) => {
                                        return openBlock(), createElementBlock("span", {
                                          key: region.name
                                        }, toDisplayString(region.name) + "、", 1);
                                      }), 128))
                                    ])) : createCommentVNode("", true),
                                    map.aiGeneratedData.landmarks?.length ? (openBlock(), createElementBlock("div", _hoisted_28$5, [
                                      _cache[68] || (_cache[68] = createBaseVNode("strong", null, "地标：", -1)),
                                      (openBlock(true), createElementBlock(Fragment, null, renderList(map.aiGeneratedData.landmarks, (landmark) => {
                                        return openBlock(), createElementBlock("span", {
                                          key: landmark.name
                                        }, toDisplayString(landmark.name) + "、", 1);
                                      }), 128))
                                    ])) : createCommentVNode("", true),
                                    map.aiGeneratedData.climate ? (openBlock(), createElementBlock("div", _hoisted_29$5, [
                                      _cache[69] || (_cache[69] = createBaseVNode("strong", null, "气候：", -1)),
                                      createTextVNode(toDisplayString(map.aiGeneratedData.climate), 1)
                                    ])) : createCommentVNode("", true)
                                  ])
                                ]),
                                _: 2
                              }, 1024)
                            ]),
                            _: 2
                          }, 1024)
                        ])) : createCommentVNode("", true)
                      ]),
                      createBaseVNode("div", _hoisted_30$5, [
                        createVNode(_component_el_button, {
                          text: "",
                          onClick: ($event) => editMap(map)
                        }, {
                          default: withCtx(() => [..._cache[70] || (_cache[70] = [
                            createTextVNode("编辑", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"]),
                        !map.imagePath ? (openBlock(), createBlock(_component_el_button, {
                          key: 0,
                          text: "",
                          onClick: ($event) => showGenerateMapImageDialog(map)
                        }, {
                          default: withCtx(() => [..._cache[71] || (_cache[71] = [
                            createTextVNode("生成图片", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])) : createCommentVNode("", true),
                        createVNode(_component_el_button, {
                          text: "",
                          type: "danger",
                          onClick: ($event) => deleteMap(map.id)
                        }, {
                          default: withCtx(() => [..._cache[72] || (_cache[72] = [
                            createTextVNode("删除", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])
                      ])
                    ]);
                  }), 128)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    plain: "",
                    class: "add-map-btn",
                    onClick: _cache[13] || (_cache[13] = ($event) => showMapDialog.value = true)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[73] || (_cache[73] = createTextVNode(" 添加地图 ", -1))
                    ]),
                    _: 1
                  })
                ])
              ]),
              _: 1
            }),
            createVNode(_component_el_tab_pane, {
              label: "地点设定",
              name: "locations"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_31$4, [
                  createBaseVNode("div", _hoisted_32$4, [
                    createVNode(_component_el_button, {
                      type: "primary",
                      plain: "",
                      icon: unref(magic_stick_default),
                      loading: generatingLocations.value,
                      disabled: !selectedModel.value?.providerId,
                      onClick: generateLocationsFromAI
                    }, {
                      default: withCtx(() => [..._cache[74] || (_cache[74] = [
                        createTextVNode(" AI 生成地点建议 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["icon", "loading", "disabled"]),
                    !selectedModel.value?.providerId ? (openBlock(), createBlock(_component_el_alert, {
                      key: 0,
                      title: "请先在顶部选择 AI 模型",
                      type: "info",
                      closable: false,
                      "show-icon": "",
                      style: { "margin-left": "12px" }
                    })) : createCommentVNode("", true)
                  ]),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(locations.value, (location) => {
                    return openBlock(), createElementBlock("div", {
                      key: location.id,
                      class: "location-card"
                    }, [
                      createBaseVNode("div", _hoisted_33$2, [
                        createBaseVNode("h4", null, toDisplayString(location.name), 1),
                        createBaseVNode("div", _hoisted_34$2, [
                          createVNode(_component_el_tag, {
                            size: "small",
                            type: "info"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(getLocationTypeLabel(location.type)), 1)
                            ]),
                            _: 2
                          }, 1024),
                          createVNode(_component_el_tag, { size: "small" }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(getImportanceLabel(location.importance)), 1)
                            ]),
                            _: 2
                          }, 1024),
                          location.mapId ? (openBlock(), createBlock(_component_el_tag, {
                            key: 0,
                            size: "small",
                            type: "warning"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(getMapName(location.mapId)), 1)
                            ]),
                            _: 2
                          }, 1024)) : createCommentVNode("", true)
                        ]),
                        createBaseVNode("p", _hoisted_35$2, toDisplayString(location.description), 1)
                      ]),
                      createBaseVNode("div", _hoisted_36$2, [
                        createVNode(_component_el_button, {
                          text: "",
                          onClick: ($event) => editLocation(location)
                        }, {
                          default: withCtx(() => [..._cache[75] || (_cache[75] = [
                            createTextVNode("编辑", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"]),
                        createVNode(_component_el_button, {
                          text: "",
                          type: "danger",
                          onClick: ($event) => deleteLocation(location.id)
                        }, {
                          default: withCtx(() => [..._cache[76] || (_cache[76] = [
                            createTextVNode("删除", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])
                      ])
                    ]);
                  }), 128)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    plain: "",
                    class: "add-location-btn",
                    onClick: _cache[14] || (_cache[14] = ($event) => showLocationDialog.value = true)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[77] || (_cache[77] = createTextVNode(" 添加地点 ", -1))
                    ]),
                    _: 1
                  })
                ])
              ]),
              _: 1
            }),
            createVNode(_component_el_tab_pane, {
              label: "势力设定",
              name: "factions"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_37$2, [
                  createBaseVNode("div", _hoisted_38$2, [
                    createVNode(_component_el_button, {
                      type: "primary",
                      plain: "",
                      icon: unref(magic_stick_default),
                      loading: generatingFactions.value,
                      disabled: !selectedModel.value?.providerId,
                      onClick: generateFactionsFromAI
                    }, {
                      default: withCtx(() => [..._cache[78] || (_cache[78] = [
                        createTextVNode(" AI 生成势力建议 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["icon", "loading", "disabled"]),
                    !selectedModel.value?.providerId ? (openBlock(), createBlock(_component_el_alert, {
                      key: 0,
                      title: "请先在顶部选择 AI 模型",
                      type: "info",
                      closable: false,
                      "show-icon": "",
                      style: { "margin-left": "12px" }
                    })) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_39$2, [
                    createVNode(_component_el_radio_group, {
                      modelValue: factionFilter.value,
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => factionFilter.value = $event),
                      size: "small"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio_button, { value: "all" }, {
                          default: withCtx(() => [..._cache[79] || (_cache[79] = [
                            createTextVNode("全部", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio_button, { value: "country" }, {
                          default: withCtx(() => [..._cache[80] || (_cache[80] = [
                            createTextVNode("国别", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio_button, { value: "camp" }, {
                          default: withCtx(() => [..._cache[81] || (_cache[81] = [
                            createTextVNode("阵营", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio_button, { value: "sect" }, {
                          default: withCtx(() => [..._cache[82] || (_cache[82] = [
                            createTextVNode("门派", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_40$2, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(filteredFactions.value, (faction) => {
                      return openBlock(), createElementBlock("div", {
                        key: faction.id,
                        class: "faction-card"
                      }, [
                        createBaseVNode("div", _hoisted_41$2, [
                          createBaseVNode("div", _hoisted_42$2, [
                            createBaseVNode("h4", null, toDisplayString(faction.name), 1),
                            createVNode(_component_el_tag, {
                              size: "small",
                              type: getFactionTagType(faction.factionType)
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(getFactionTypeLabel(faction.factionType)), 1)
                              ]),
                              _: 2
                            }, 1032, ["type"])
                          ]),
                          faction.locationId ? (openBlock(), createElementBlock("div", _hoisted_43$2, [
                            _cache[83] || (_cache[83] = createBaseVNode("span", { class: "label" }, "所在地：", -1)),
                            createBaseVNode("span", null, toDisplayString(getLocationName(faction.locationId)), 1)
                          ])) : createCommentVNode("", true),
                          createBaseVNode("p", _hoisted_44$2, toDisplayString(faction.description), 1)
                        ]),
                        createBaseVNode("div", _hoisted_45$2, [
                          createVNode(_component_el_button, {
                            text: "",
                            onClick: ($event) => editFaction(faction)
                          }, {
                            default: withCtx(() => [..._cache[84] || (_cache[84] = [
                              createTextVNode("编辑", -1)
                            ])]),
                            _: 1
                          }, 8, ["onClick"]),
                          createVNode(_component_el_button, {
                            text: "",
                            type: "danger",
                            onClick: ($event) => deleteFaction(faction.id)
                          }, {
                            default: withCtx(() => [..._cache[85] || (_cache[85] = [
                              createTextVNode("删除", -1)
                            ])]),
                            _: 1
                          }, 8, ["onClick"])
                        ])
                      ]);
                    }), 128)),
                    createVNode(_component_el_button, {
                      type: "primary",
                      plain: "",
                      class: "add-faction-btn",
                      onClick: _cache[16] || (_cache[16] = ($event) => showFactionDialog.value = true)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(plus_default))
                          ]),
                          _: 1
                        }),
                        _cache[86] || (_cache[86] = createTextVNode(" 添加势力 ", -1))
                      ]),
                      _: 1
                    })
                  ])
                ])
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showLocationDialog.value,
          "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => showLocationDialog.value = $event),
          title: editingLocationId.value ? "编辑地点" : "添加地点",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[23] || (_cache[23] = ($event) => showLocationDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[90] || (_cache[90] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveLocation
            }, {
              default: withCtx(() => [..._cache[91] || (_cache[91] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: locationForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "地点名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: locationForm.value.name,
                      "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => locationForm.value.name = $event),
                      placeholder: "输入地点名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "地点类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: locationForm.value.type,
                      "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => locationForm.value.type = $event),
                      placeholder: "选择地点类型"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "城市",
                          value: "city"
                        }),
                        createVNode(_component_el_option, {
                          label: "村庄",
                          value: "village"
                        }),
                        createVNode(_component_el_option, {
                          label: "山脉",
                          value: "mountain"
                        }),
                        createVNode(_component_el_option, {
                          label: "宫殿",
                          value: "palace"
                        }),
                        createVNode(_component_el_option, {
                          label: "森林",
                          value: "forest"
                        }),
                        createVNode(_component_el_option, {
                          label: "海域",
                          value: "sea"
                        }),
                        createVNode(_component_el_option, {
                          label: "建筑",
                          value: "building"
                        }),
                        createVNode(_component_el_option, {
                          label: "其他",
                          value: "other"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "关联地图" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: locationForm.value.mapId,
                      "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => locationForm.value.mapId = $event),
                      placeholder: "选择关联地图（可选）",
                      clearable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(maps.value, (map) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: map.id,
                            label: map.name,
                            value: map.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "重要程度" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_radio_group, {
                      modelValue: locationForm.value.importance,
                      "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => locationForm.value.importance = $event)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio, { value: "main" }, {
                          default: withCtx(() => [..._cache[87] || (_cache[87] = [
                            createTextVNode("主要场景", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "important" }, {
                          default: withCtx(() => [..._cache[88] || (_cache[88] = [
                            createTextVNode("重要场景", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "auxiliary" }, {
                          default: withCtx(() => [..._cache[89] || (_cache[89] = [
                            createTextVNode("辅助场景", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "地点描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: locationForm.value.description,
                      "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => locationForm.value.description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述地点的环境特征、氛围..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showFactionDialog.value,
          "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => showFactionDialog.value = $event),
          title: editingFactionId.value ? "编辑势力" : "添加势力",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[29] || (_cache[29] = ($event) => showFactionDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[95] || (_cache[95] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveFaction
            }, {
              default: withCtx(() => [..._cache[96] || (_cache[96] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: factionForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "势力类型",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_radio_group, {
                      modelValue: factionForm.value.factionType,
                      "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => factionForm.value.factionType = $event)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio, { value: "country" }, {
                          default: withCtx(() => [..._cache[92] || (_cache[92] = [
                            createTextVNode("国别", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "camp" }, {
                          default: withCtx(() => [..._cache[93] || (_cache[93] = [
                            createTextVNode("阵营", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "sect" }, {
                          default: withCtx(() => [..._cache[94] || (_cache[94] = [
                            createTextVNode("门派", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "势力名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: factionForm.value.name,
                      "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => factionForm.value.name = $event),
                      placeholder: "输入势力名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "所在地" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: factionForm.value.locationId,
                      "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => factionForm.value.locationId = $event),
                      placeholder: "选择所在地（可选）",
                      clearable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(locations.value, (loc) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: loc.id,
                            label: loc.name,
                            value: loc.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "主要特点" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: factionForm.value.description,
                      "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => factionForm.value.description = $event),
                      type: "textarea",
                      rows: 4,
                      placeholder: "描述势力的主要特点、立场、特色等..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showMapDialog.value,
          "onUpdate:modelValue": _cache[36] || (_cache[36] = ($event) => showMapDialog.value = $event),
          title: editingMapId.value ? "编辑地图" : "添加地图",
          width: "550px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[35] || (_cache[35] = ($event) => showMapDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[98] || (_cache[98] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveMap
            }, {
              default: withCtx(() => [..._cache[99] || (_cache[99] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: mapForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "地图名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: mapForm.value.name,
                      "onUpdate:modelValue": _cache[31] || (_cache[31] = ($event) => mapForm.value.name = $event),
                      placeholder: "输入地图名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "地图方位" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: mapForm.value.orientation,
                      "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => mapForm.value.orientation = $event),
                      placeholder: "选择地图方位"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "北方",
                          value: "north"
                        }),
                        createVNode(_component_el_option, {
                          label: "南方",
                          value: "south"
                        }),
                        createVNode(_component_el_option, {
                          label: "东方",
                          value: "east"
                        }),
                        createVNode(_component_el_option, {
                          label: "西方",
                          value: "west"
                        }),
                        createVNode(_component_el_option, {
                          label: "中央",
                          value: "central"
                        }),
                        createVNode(_component_el_option, {
                          label: "东北",
                          value: "northeast"
                        }),
                        createVNode(_component_el_option, {
                          label: "西北",
                          value: "northwest"
                        }),
                        createVNode(_component_el_option, {
                          label: "东南",
                          value: "southeast"
                        }),
                        createVNode(_component_el_option, {
                          label: "西南",
                          value: "southwest"
                        }),
                        createVNode(_component_el_option, {
                          label: "其他",
                          value: "other"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "地图特点" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: mapForm.value.characteristics,
                      "onUpdate:modelValue": _cache[33] || (_cache[33] = ($event) => mapForm.value.characteristics = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述地图的地形特点、气候、重要地标等..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, null, {
                  default: withCtx(() => [
                    createVNode(_component_el_button, {
                      type: "primary",
                      plain: "",
                      onClick: _cache[34] || (_cache[34] = ($event) => showAIMapDataDialog.value = true),
                      disabled: !mapForm.value.name
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(magic_stick_default))
                          ]),
                          _: 1
                        }),
                        _cache[97] || (_cache[97] = createTextVNode(" AI 生成详细数据 ", -1))
                      ]),
                      _: 1
                    }, 8, ["disabled"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showAIMapDataDialog.value,
          "onUpdate:modelValue": _cache[39] || (_cache[39] = ($event) => showAIMapDataDialog.value = $event),
          title: "AI 生成地图数据",
          width: "550px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[38] || (_cache[38] = ($event) => showAIMapDataDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[100] || (_cache[100] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: generateMapData,
              loading: generatingMapData.value,
              disabled: !selectedModel.value?.providerId
            }, {
              default: withCtx(() => [..._cache[101] || (_cache[101] = [
                createTextVNode(" 生成 ", -1)
              ])]),
              _: 1
            }, 8, ["loading", "disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, { "label-width": "80px" }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "提示词" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: aiMapDataPrompt.value,
                      "onUpdate:modelValue": _cache[37] || (_cache[37] = ($event) => aiMapDataPrompt.value = $event),
                      type: "textarea",
                      rows: 4,
                      placeholder: "描述你想要的地图内容，如：一个以山脉为主的北方区域，有三座主要城市..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                !selectedModel.value?.providerId ? (openBlock(), createBlock(_component_el_alert, {
                  key: 0,
                  title: "请先在顶部选择 AI 模型",
                  type: "warning",
                  closable: false,
                  "show-icon": "",
                  style: { "margin-bottom": "16px" }
                })) : createCommentVNode("", true)
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showMapImageDialog.value,
          "onUpdate:modelValue": _cache[42] || (_cache[42] = ($event) => showMapImageDialog.value = $event),
          title: "生成地图图片",
          width: "450px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[41] || (_cache[41] = ($event) => showMapImageDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[102] || (_cache[102] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: generateMapImage,
              loading: generatingMapImage.value,
              disabled: !selectedImageModel.value
            }, {
              default: withCtx(() => [..._cache[103] || (_cache[103] = [
                createTextVNode(" 生成图片 ", -1)
              ])]),
              _: 1
            }, 8, ["loading", "disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, { "label-width": "80px" }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "图像模型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: selectedImageModelKey.value,
                      "onUpdate:modelValue": _cache[40] || (_cache[40] = ($event) => selectedImageModelKey.value = $event),
                      placeholder: "选择图像模型",
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(imageProviderModels) || [], (provider) => {
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
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }),
            createBaseVNode("p", _hoisted_46$2, " 将为地图「" + toDisplayString(generatingImageMap.value?.name) + "」生成图片。 ", 1)
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showAILocationDialog.value,
          "onUpdate:modelValue": _cache[44] || (_cache[44] = ($event) => showAILocationDialog.value = $event),
          title: "AI 生成的地点建议",
          width: "650px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[43] || (_cache[43] = ($event) => showAILocationDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[104] || (_cache[104] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: adoptSelectedLocations
            }, {
              default: withCtx(() => [
                createTextVNode(" 采纳选中 (" + toDisplayString(aiLocationResults.value.filter((i) => i.selected).length) + ") ", 1)
              ]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            _cache[105] || (_cache[105] = createBaseVNode("p", { class: "dialog-tip" }, "以下是 AI 根据背景设定生成的地点建议，请勾选要采纳的地点：", -1)),
            createBaseVNode("div", _hoisted_47$2, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(aiLocationResults.value, (item, index2) => {
                return openBlock(), createElementBlock("div", {
                  key: index2,
                  class: "ai-result-item"
                }, [
                  createVNode(_component_el_checkbox, {
                    modelValue: item.selected,
                    "onUpdate:modelValue": ($event) => item.selected = $event
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createBaseVNode("div", _hoisted_48$2, [
                    createBaseVNode("div", _hoisted_49$2, [
                      createBaseVNode("span", _hoisted_50$2, toDisplayString(item.name), 1),
                      createVNode(_component_el_tag, {
                        size: "small",
                        type: "info"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getLocationTypeLabel(item.type)), 1)
                        ]),
                        _: 2
                      }, 1024),
                      createVNode(_component_el_tag, { size: "small" }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getImportanceLabel(item.importance)), 1)
                        ]),
                        _: 2
                      }, 1024)
                    ]),
                    createBaseVNode("p", _hoisted_51$2, toDisplayString(item.description), 1)
                  ])
                ]);
              }), 128))
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showAIFactionDialog.value,
          "onUpdate:modelValue": _cache[46] || (_cache[46] = ($event) => showAIFactionDialog.value = $event),
          title: "AI 生成的势力建议",
          width: "650px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[45] || (_cache[45] = ($event) => showAIFactionDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[106] || (_cache[106] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: adoptSelectedFactions
            }, {
              default: withCtx(() => [
                createTextVNode(" 采纳选中 (" + toDisplayString(aiFactionResults.value.filter((i) => i.selected).length) + ") ", 1)
              ]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            _cache[107] || (_cache[107] = createBaseVNode("p", { class: "dialog-tip" }, "以下是 AI 根据背景设定生成的势力建议，请勾选要采纳的势力：", -1)),
            createBaseVNode("div", _hoisted_52$2, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(aiFactionResults.value, (item, index2) => {
                return openBlock(), createElementBlock("div", {
                  key: index2,
                  class: "ai-result-item"
                }, [
                  createVNode(_component_el_checkbox, {
                    modelValue: item.selected,
                    "onUpdate:modelValue": ($event) => item.selected = $event
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createBaseVNode("div", _hoisted_53$2, [
                    createBaseVNode("div", _hoisted_54$2, [
                      createBaseVNode("span", _hoisted_55$2, toDisplayString(item.name), 1),
                      createVNode(_component_el_tag, {
                        size: "small",
                        type: getFactionTagType(item.factionType)
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getFactionTypeLabel(item.factionType)), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"]),
                      item.suggestedLocationName ? (openBlock(), createBlock(_component_el_tag, {
                        key: 0,
                        size: "small",
                        type: "warning"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(item.suggestedLocationName), 1)
                        ]),
                        _: 2
                      }, 1024)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("p", _hoisted_56$1, toDisplayString(item.description), 1)
                  ])
                ]);
              }), 128))
            ])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const BackgroundStage = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-39cc62de"]]);
const _hoisted_1$5 = { class: "character-stage" };
const _hoisted_2$5 = { class: "stage-content" };
const _hoisted_3$5 = { class: "character-list" };
const _hoisted_4$5 = { class: "character-avatar" };
const _hoisted_5$5 = { class: "avatar-placeholder" };
const _hoisted_6$5 = {
  key: 1,
  class: "avatar-placeholder"
};
const _hoisted_7$5 = { class: "character-info" };
const _hoisted_8$5 = { class: "character-meta" };
const _hoisted_9$5 = { class: "role-tag" };
const _hoisted_10$5 = { class: "gender-tag" };
const _hoisted_11$5 = { class: "age-tag" };
const _hoisted_12$5 = { class: "character-summary" };
const _hoisted_13$5 = { class: "character-actions" };
const _hoisted_14$5 = { class: "action-buttons" };
const _hoisted_15$5 = {
  key: 0,
  class: "generating-progress"
};
const _hoisted_16$5 = { class: "current-portrait" };
const _hoisted_17$5 = { class: "portrait-placeholder" };
const _hoisted_18$4 = { class: "portrait-name" };
const _hoisted_19$4 = { class: "portrait-selector" };
const _hoisted_20$4 = { class: "selector-step" };
const _hoisted_21$4 = { class: "step-content-with-action" };
const _hoisted_22$4 = {
  key: 0,
  class: "selector-step"
};
const _hoisted_23$4 = { class: "step-header" };
const _hoisted_24$4 = {
  key: 0,
  class: "portrait-grid"
};
const _hoisted_25$4 = ["onClick"];
const _hoisted_26$4 = { class: "portrait-placeholder" };
const _hoisted_27$4 = {
  key: 1,
  class: "portrait-placeholder"
};
const _hoisted_28$4 = { class: "portrait-name" };
const _hoisted_29$4 = { class: "relation-list" };
const _hoisted_30$4 = { class: "relation-character" };
const _hoisted_31$3 = { class: "relation-type" };
const _hoisted_32$3 = { class: "relation-desc" };
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "CharacterStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    useRouter();
    const selectedModel = inject("selectedModel", computed(() => null));
    const characters = ref([]);
    const portraitProjects = ref([]);
    const selectedPortraitProjectId = ref("");
    const characterRelations = ref([]);
    const currentCharacterId = ref("");
    const showCharacterDialog = ref(false);
    const showPortraitLinkDialog = ref(false);
    const showRelationDialog = ref(false);
    const showAddRelationDialog = ref(false);
    const showCreateProjectDialog = ref(false);
    const showCreateCharacterDialog = ref(false);
    const newProjectForm = ref({
      name: "",
      description: ""
    });
    const creatingProject = ref(false);
    const editingCharacter = ref(null);
    const selectedPortraitId = ref("");
    const generating = ref(false);
    const characterForm = ref({
      name: "",
      gender: "male",
      age: 18,
      appearance: "",
      background: "",
      personality: "",
      abilities: "",
      rolePosition: "supporting",
      majorEvents: "",
      portraitId: ""
    });
    const relationForm = ref({
      relatedCharacterId: "",
      relationType: "",
      relationDescription: ""
    });
    const otherCharacters = computed(() => {
      return characters.value.filter((c) => c.id !== currentCharacterId.value);
    });
    function getRoleLabel(role) {
      const labels = {
        protagonist: "主角",
        supporting: "配角",
        antagonist: "反派",
        minor: "次要"
      };
      return labels[role] || role;
    }
    function getGenderLabel(gender) {
      const labels = {
        male: "男",
        female: "女",
        other: "其他"
      };
      return labels[gender] || gender;
    }
    function getPortraitPreview(portraitId) {
      const portrait = availablePortraits.value.find((p) => p.id === portraitId);
      return portrait?.preview || null;
    }
    function getPortraitName(portraitId) {
      const portrait = availablePortraits.value.find((p) => p.id === portraitId);
      return portrait?.name || "未知形象";
    }
    function openPortraitLinkDialog() {
      selectedPortraitId.value = characterForm.value.portraitId || "";
      showPortraitLinkDialog.value = true;
    }
    function getCharacterName(characterId) {
      const character = characters.value.find((c) => c.id === characterId);
      return character?.name || "未知角色";
    }
    async function loadCharacters() {
      const result = await window.electronAPI.longwriting.getCharacters(props.projectId);
      if (result.success) {
        characters.value = result.data || [];
      }
    }
    function editCharacter(character) {
      editingCharacter.value = character;
      characterForm.value = {
        name: character.name,
        gender: character.gender,
        age: character.age,
        appearance: character.appearance,
        background: character.background,
        personality: character.personality,
        abilities: character.abilities,
        rolePosition: character.rolePosition,
        majorEvents: character.majorEvents,
        portraitId: character.portraitId || ""
      };
      showCharacterDialog.value = true;
    }
    function deleteCharacter(id) {
      ElMessageBox.confirm("确定要删除该角色吗？删除后无法恢复。", "删除角色", {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning"
      }).then(async () => {
        const result = await window.electronAPI.longwriting.deleteCharacter(id);
        if (result.success) {
          await loadCharacters();
          ElMessage.success("角色已删除");
          updateProgress();
        }
      }).catch(() => {
      });
    }
    async function saveCharacter() {
      if (!characterForm.value.name) {
        ElMessage.warning("请输入角色名称");
        return;
      }
      const formData = JSON.parse(JSON.stringify(characterForm.value));
      if (editingCharacter.value) {
        const result = await window.electronAPI.longwriting.updateCharacter(editingCharacter.value.id, formData);
        if (result.success) {
          await loadCharacters();
          ElMessage.success("角色已更新");
        } else {
          ElMessage.error(result.error || "更新失败");
        }
      } else {
        const result = await window.electronAPI.longwriting.createCharacter({
          projectId: props.projectId,
          ...formData
        });
        if (result.success) {
          await loadCharacters();
          ElMessage.success("角色已添加");
        } else {
          ElMessage.error(result.error || "添加失败");
        }
      }
      showCharacterDialog.value = false;
      resetCharacterForm();
      updateProgress();
    }
    function resetCharacterForm() {
      editingCharacter.value = null;
      characterForm.value = {
        name: "",
        gender: "male",
        age: 18,
        appearance: "",
        background: "",
        personality: "",
        abilities: "",
        rolePosition: "supporting",
        majorEvents: "",
        portraitId: ""
      };
    }
    function confirmPortraitLink() {
      if (selectedPortraitId.value) {
        characterForm.value.portraitId = selectedPortraitId.value;
        showPortraitLinkDialog.value = false;
        selectedPortraitId.value = "";
      }
    }
    async function showRelationsDialog(character) {
      currentCharacterId.value = character.id;
      const result = await window.electronAPI.longwriting.getCharacterRelations(character.id);
      if (result.success) {
        characterRelations.value = result.data || [];
      }
      showRelationDialog.value = true;
    }
    async function addRelation() {
      if (!relationForm.value.relatedCharacterId || !relationForm.value.relationType) {
        ElMessage.warning("请选择关联角色和关系类型");
        return;
      }
      const relationData = JSON.parse(JSON.stringify(relationForm.value));
      const result = await window.electronAPI.longwriting.createCharacterRelation({
        characterId: currentCharacterId.value,
        relatedCharacterId: relationData.relatedCharacterId,
        relationType: relationData.relationType,
        relationDescription: relationData.relationDescription
      });
      if (result.success) {
        await showRelationsDialog(characters.value.find((c) => c.id === currentCharacterId.value));
        showAddRelationDialog.value = false;
        relationForm.value = {
          relatedCharacterId: "",
          relationType: "",
          relationDescription: ""
        };
        ElMessage.success("关系已添加");
      }
    }
    async function deleteRelation(id) {
      const result = await window.electronAPI.longwriting.deleteCharacterRelation(id);
      if (result.success) {
        await showRelationsDialog(characters.value.find((c) => c.id === currentCharacterId.value));
        ElMessage.success("关系已删除");
      }
    }
    const currentEventId = ref(null);
    const generatingContent = ref("");
    async function generateCharacters() {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      console.log("[CharacterStage] 生成角色, providerId:", selectedModel.value.providerId, "modelId:", selectedModel.value.modelId);
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `characters-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          console.log("[CharacterStage] 收到事件:", event.type, event.content?.substring(0, 100));
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            const finalContent = event.content || generatingContent.value;
            console.log("[CharacterStage] 生成完成, 累积内容长度:", generatingContent.value.length, "done内容长度:", event.content?.length || 0);
            if (!finalContent || finalContent.length === 0) {
              ElMessage.error("AI 未返回任何内容");
              return;
            }
            ElMessage.info("正在解析 AI 响应...");
            parseAndShowSuggestions(finalContent);
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateCharacters(
        currentEventId.value,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parseAndShowSuggestions(content) {
      console.log("[CharacterStage] 解析 AI 响应, 内容长度:", content.length);
      console.log("[CharacterStage] AI 响应内容:", content.substring(0, 1e3));
      try {
        let jsonStr = content;
        if (jsonStr.includes("```json")) {
          jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        } else if (jsonStr.includes("```")) {
          jsonStr = jsonStr.replace(/```\s*/g, "");
        }
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.error("[CharacterStage] 未找到 JSON 数组, 内容:", content);
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        console.log("[CharacterStage] 匹配到的 JSON:", jsonMatch[0].substring(0, 500));
        let cleanJson = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, "").replace(/\n/g, " ");
        const suggestedCharacters = JSON.parse(cleanJson);
        console.log("[CharacterStage] 解析到的角色数量:", suggestedCharacters.length);
        if (!Array.isArray(suggestedCharacters) || suggestedCharacters.length === 0) {
          ElMessage.warning("AI 未生成角色建议");
          return;
        }
        const roleList = suggestedCharacters.map((c) => `- ${c.name || "未命名"}（${getRoleLabel(c.rolePosition || "supporting")}）`).join("\n");
        console.log("[CharacterStage] 角色列表:", roleList);
        ElMessage.closeAll();
        ElMessageBox.confirm(
          `AI 建议添加以下 ${suggestedCharacters.length} 个角色：

${roleList}`,
          "AI 生成建议",
          {
            confirmButtonText: "全部添加",
            cancelButtonText: "取消",
            distinguishCancelAndClose: true,
            type: "info"
          }
        ).then(async () => {
          console.log("[CharacterStage] 用户确认添加角色");
          ElMessage.info("正在添加角色...");
          let successCount = 0;
          let failCount = 0;
          for (const suggested of suggestedCharacters) {
            console.log("[CharacterStage] 创建角色:", suggested.name);
            try {
              const result = await window.electronAPI.longwriting.createCharacter({
                projectId: props.projectId,
                name: suggested.name || "未命名角色",
                gender: suggested.gender || "other",
                age: suggested.age || 18,
                rolePosition: suggested.rolePosition || "supporting",
                appearance: suggested.appearance || "",
                background: suggested.background || "",
                personality: suggested.personality || "",
                abilities: suggested.abilities || ""
              });
              console.log("[CharacterStage] 创建角色结果:", result);
              if (result.success) {
                successCount++;
              } else {
                failCount++;
                console.error("[CharacterStage] 创建角色失败:", result.error);
              }
            } catch (err) {
              failCount++;
              console.error("[CharacterStage] 创建角色异常:", err);
            }
          }
          await loadCharacters();
          updateProgress();
          if (failCount === 0) {
            ElMessage.success(`已成功添加 ${successCount} 个角色`);
          } else if (successCount > 0) {
            ElMessage.warning(`添加完成：成功 ${successCount} 个，失败 ${failCount} 个`);
          } else {
            ElMessage.error("添加角色失败");
          }
        }).catch((err) => {
          console.log("[CharacterStage] 用户取消或关闭对话框:", err);
          ElMessage.info("已取消添加角色");
        });
      } catch (error) {
        console.error("[CharacterStage] 解析 AI 响应失败:", error);
        ElMessage.error("解析 AI 响应失败: " + (error instanceof Error ? error.message : "未知错误"));
      }
    }
    function cancelGeneration() {
      if (!currentEventId.value) return;
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    async function createPortraitProject() {
      if (!newProjectForm.value.name.trim()) {
        ElMessage.warning("请输入项目名称");
        return;
      }
      creatingProject.value = true;
      try {
        const projectData = JSON.parse(JSON.stringify(newProjectForm.value));
        const result = await window.electronAPI.portrait.createProject({
          name: projectData.name,
          description: projectData.description
        });
        if (result.success && result.data) {
          ElMessage.success("项目创建成功");
          showCreateProjectDialog.value = false;
          newProjectForm.value = { name: "", description: "" };
          await loadPortraits();
          selectedPortraitProjectId.value = result.data.id;
          await loadProjectCharacters();
        } else {
          ElMessage.error(result.error || "创建失败");
        }
      } catch (error) {
        console.error("创建人像项目失败:", error);
        ElMessage.error("创建失败");
      } finally {
        creatingProject.value = false;
      }
    }
    function handleCreateCharacterSuccess(characterId) {
      showCreateCharacterDialog.value = false;
      loadProjectCharacters();
      selectedPortraitId.value = characterId;
    }
    function updateProgress() {
      const progress = Math.min(55, 30 + characters.value.length * 5);
      emit("update:progress", progress);
    }
    async function loadPortraits() {
      try {
        const projectsResult = await window.electronAPI.portrait.listProjects(1, 100);
        console.log("[CharacterStage] 人像项目列表结果:", projectsResult);
        const projects = projectsResult.data?.projects || [];
        portraitProjects.value = projects.map((p) => ({ id: p.id, name: p.name }));
        await loadAllPortraits(projects);
      } catch (error) {
        console.error("加载人像项目失败:", error);
        portraitProjects.value = [];
      }
    }
    const availablePortraits = ref([]);
    async function loadAllPortraits(projects) {
      const allPortraits = [];
      for (const project of projects) {
        const charactersResult = await window.electronAPI.portrait.listCharacters(project.id);
        const chars = charactersResult.data || [];
        if (charactersResult.success && chars.length) {
          for (const character of chars) {
            const variantsResult = await window.electronAPI.portrait.listVariants(character.id);
            const frontBaseVariant = variantsResult.data?.find(
              (v) => v.angle === "front" && v.type === "base"
            );
            const previewVariant = frontBaseVariant || variantsResult.data?.[0];
            allPortraits.push({
              id: character.id,
              name: character.name,
              preview: previewVariant?.imagePath,
              projectId: project.id
            });
          }
        }
      }
      availablePortraits.value = allPortraits;
      console.log("[CharacterStage] 加载的所有人像:", allPortraits);
    }
    const projectCharacters = ref([]);
    async function loadProjectCharacters() {
      selectedPortraitId.value = "";
      projectCharacters.value = [];
      if (!selectedPortraitProjectId.value) return;
      try {
        const charactersResult = await window.electronAPI.portrait.listCharacters(selectedPortraitProjectId.value);
        const chars = charactersResult.data || [];
        if (charactersResult.success && chars.length) {
          for (const character of chars) {
            const variantsResult = await window.electronAPI.portrait.listVariants(character.id);
            const frontBaseVariant = variantsResult.data?.find(
              (v) => v.angle === "front" && v.type === "base"
            );
            const previewVariant = frontBaseVariant || variantsResult.data?.[0];
            projectCharacters.value.push({
              id: character.id,
              name: character.name,
              preview: previewVariant?.imagePath
            });
          }
        }
        console.log("[CharacterStage] 项目人物形象:", projectCharacters.value);
      } catch (error) {
        console.error("加载项目人物形象失败:", error);
      }
    }
    onMounted(() => {
      loadCharacters();
      loadPortraits();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_col = resolveComponent("el-col");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_row = resolveComponent("el-row");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_empty = resolveComponent("el-empty");
      return openBlock(), createElementBlock("div", _hoisted_1$5, [
        _cache[54] || (_cache[54] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "角色设定"),
          createBaseVNode("p", { class: "stage-desc" }, "创建故事中的角色，设定他们的背景、性格和能力")
        ], -1)),
        createBaseVNode("div", _hoisted_2$5, [
          createBaseVNode("div", _hoisted_3$5, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(characters.value, (character) => {
              return openBlock(), createElementBlock("div", {
                key: character.id,
                class: "character-card"
              }, [
                createBaseVNode("div", _hoisted_4$5, [
                  character.portraitId && getPortraitPreview(character.portraitId) ? (openBlock(), createBlock(_component_el_image, {
                    key: 0,
                    src: getPortraitPreview(character.portraitId),
                    fit: "cover"
                  }, {
                    error: withCtx(() => [
                      createBaseVNode("div", _hoisted_5$5, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(user_default))
                          ]),
                          _: 1
                        })
                      ])
                    ]),
                    _: 1
                  }, 8, ["src"])) : (openBlock(), createElementBlock("div", _hoisted_6$5, [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(user_default))
                      ]),
                      _: 1
                    })
                  ]))
                ]),
                createBaseVNode("div", _hoisted_7$5, [
                  createBaseVNode("h4", null, toDisplayString(character.name), 1),
                  createBaseVNode("div", _hoisted_8$5, [
                    createBaseVNode("span", _hoisted_9$5, toDisplayString(getRoleLabel(character.rolePosition)), 1),
                    createBaseVNode("span", _hoisted_10$5, toDisplayString(getGenderLabel(character.gender)), 1),
                    createBaseVNode("span", _hoisted_11$5, toDisplayString(character.age) + "岁", 1)
                  ]),
                  createBaseVNode("p", _hoisted_12$5, toDisplayString(character.background || "暂无背景描述"), 1)
                ]),
                createBaseVNode("div", _hoisted_13$5, [
                  createVNode(_component_el_button, {
                    text: "",
                    onClick: ($event) => editCharacter(character)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(edit_default))
                        ]),
                        _: 1
                      }),
                      _cache[31] || (_cache[31] = createTextVNode(" 编辑 ", -1))
                    ]),
                    _: 1
                  }, 8, ["onClick"]),
                  createVNode(_component_el_button, {
                    text: "",
                    onClick: ($event) => showRelationsDialog(character)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(connection_default))
                        ]),
                        _: 1
                      }),
                      _cache[32] || (_cache[32] = createTextVNode(" 关系 ", -1))
                    ]),
                    _: 1
                  }, 8, ["onClick"]),
                  createVNode(_component_el_button, {
                    text: "",
                    type: "danger",
                    onClick: ($event) => deleteCharacter(character.id)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(delete_default))
                        ]),
                        _: 1
                      }),
                      _cache[33] || (_cache[33] = createTextVNode(" 删除 ", -1))
                    ]),
                    _: 1
                  }, 8, ["onClick"])
                ])
              ]);
            }), 128)),
            createVNode(_component_el_button, {
              type: "primary",
              plain: "",
              class: "add-character-btn",
              onClick: _cache[0] || (_cache[0] = ($event) => showCharacterDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[34] || (_cache[34] = createTextVNode(" 添加角色 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_14$5, [
            !generating.value ? (openBlock(), createBlock(_component_el_button, {
              key: 0,
              type: "primary",
              size: "large",
              onClick: generateCharacters
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(magic_stick_default))
                  ]),
                  _: 1
                }),
                _cache[35] || (_cache[35] = createTextVNode(" AI 生成角色建议 ", -1))
              ]),
              _: 1
            })) : (openBlock(), createBlock(_component_el_button, {
              key: 1,
              type: "danger",
              size: "large",
              onClick: cancelGeneration
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(close_default))
                  ]),
                  _: 1
                }),
                _cache[36] || (_cache[36] = createTextVNode(" 取消生成 ", -1))
              ]),
              _: 1
            }))
          ]),
          generating.value ? (openBlock(), createElementBlock("div", _hoisted_15$5, [
            createVNode(_component_el_progress, {
              percentage: 100,
              indeterminate: true
            }),
            _cache[37] || (_cache[37] = createBaseVNode("p", { class: "progress-text" }, "AI 正在生成角色建议...", -1))
          ])) : createCommentVNode("", true)
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showCharacterDialog.value,
          "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => showCharacterDialog.value = $event),
          title: editingCharacter.value ? "编辑角色" : "添加角色",
          width: "750px",
          "destroy-on-close": "",
          "append-to-body": false,
          "modal-append-to-body": false,
          center: ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[10] || (_cache[10] = ($event) => showCharacterDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[38] || (_cache[38] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveCharacter
            }, {
              default: withCtx(() => [..._cache[39] || (_cache[39] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: characterForm.value,
              "label-width": "100px",
              class: "character-form"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_row, { gutter: 16 }, {
                  default: withCtx(() => [
                    createVNode(_component_el_col, { span: 12 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, {
                          label: "角色名称",
                          required: ""
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input, {
                              modelValue: characterForm.value.name,
                              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => characterForm.value.name = $event),
                              placeholder: "输入角色名称"
                            }, null, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 12 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "角色定位" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: characterForm.value.rolePosition,
                              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => characterForm.value.rolePosition = $event),
                              placeholder: "选择定位",
                              style: { "width": "100%" }
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "主角",
                                  value: "protagonist"
                                }),
                                createVNode(_component_el_option, {
                                  label: "配角",
                                  value: "supporting"
                                }),
                                createVNode(_component_el_option, {
                                  label: "反派",
                                  value: "antagonist"
                                }),
                                createVNode(_component_el_option, {
                                  label: "次要角色",
                                  value: "minor"
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
                createVNode(_component_el_row, { gutter: 16 }, {
                  default: withCtx(() => [
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "性别" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_select, {
                              modelValue: characterForm.value.gender,
                              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => characterForm.value.gender = $event),
                              placeholder: "选择性别",
                              style: { "width": "100%" }
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_option, {
                                  label: "男",
                                  value: "male"
                                }),
                                createVNode(_component_el_option, {
                                  label: "女",
                                  value: "female"
                                }),
                                createVNode(_component_el_option, {
                                  label: "其他",
                                  value: "other"
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
                        createVNode(_component_el_form_item, { label: "年龄" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input_number, {
                              modelValue: characterForm.value.age,
                              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => characterForm.value.age = $event),
                              min: 0,
                              max: 1e3,
                              style: { "width": "100%" }
                            }, null, 8, ["modelValue"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_col, { span: 8 }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "人像形象" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_button, { onClick: openPortraitLinkDialog }, {
                              default: withCtx(() => [
                                createVNode(_component_el_icon, null, {
                                  default: withCtx(() => [
                                    createVNode(unref(picture_default))
                                  ]),
                                  _: 1
                                }),
                                createTextVNode(" " + toDisplayString(characterForm.value.portraitId ? "更换形象" : "关联形象"), 1)
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
                }),
                characterForm.value.portraitId ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 0,
                  label: "当前形象"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_16$5, [
                      getPortraitPreview(characterForm.value.portraitId) ? (openBlock(), createBlock(_component_el_image, {
                        key: 0,
                        src: getPortraitPreview(characterForm.value.portraitId),
                        fit: "cover",
                        class: "portrait-preview-large"
                      }, {
                        error: withCtx(() => [
                          createBaseVNode("div", _hoisted_17$5, [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(picture_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        _: 1
                      }, 8, ["src"])) : createCommentVNode("", true),
                      createBaseVNode("span", _hoisted_18$4, toDisplayString(getPortraitName(characterForm.value.portraitId)), 1)
                    ])
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                createVNode(_component_el_form_item, { label: "外貌描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: characterForm.value.appearance,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => characterForm.value.appearance = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "描述角色的外貌特征..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "背景故事" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: characterForm.value.background,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => characterForm.value.background = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "角色的背景故事、出身经历..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "性格特点" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: characterForm.value.personality,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => characterForm.value.personality = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "角色的性格特点、行事风格..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "能力特长" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: characterForm.value.abilities,
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => characterForm.value.abilities = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "角色的能力、特长、技能..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "主要事件" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: characterForm.value.majorEvents,
                      "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => characterForm.value.majorEvents = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "角色在故事中的主要事件..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showPortraitLinkDialog.value,
          "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => showPortraitLinkDialog.value = $event),
          title: "关联人像形象",
          width: "700px",
          "append-to-body": false,
          "modal-append-to-body": false,
          center: ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[17] || (_cache[17] = ($event) => showPortraitLinkDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[47] || (_cache[47] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !selectedPortraitId.value,
              onClick: confirmPortraitLink
            }, {
              default: withCtx(() => [..._cache[48] || (_cache[48] = [
                createTextVNode(" 确认关联 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_19$4, [
              createBaseVNode("div", _hoisted_20$4, [
                _cache[41] || (_cache[41] = createBaseVNode("div", { class: "step-header" }, [
                  createBaseVNode("span", { class: "step-number" }, "1"),
                  createBaseVNode("span", { class: "step-title" }, "选择人像项目")
                ], -1)),
                createBaseVNode("div", _hoisted_21$4, [
                  createVNode(_component_el_select, {
                    modelValue: selectedPortraitProjectId.value,
                    "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => selectedPortraitProjectId.value = $event),
                    placeholder: "选择人像项目",
                    style: { "flex": "1" },
                    onChange: loadProjectCharacters
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(portraitProjects.value, (project) => {
                        return openBlock(), createBlock(_component_el_option, {
                          key: project.id,
                          label: project.name,
                          value: project.id
                        }, null, 8, ["label", "value"]);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"]),
                  createVNode(_component_el_button, {
                    type: "primary",
                    plain: "",
                    onClick: _cache[13] || (_cache[13] = ($event) => showCreateProjectDialog.value = true)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[40] || (_cache[40] = createTextVNode(" 新建项目 ", -1))
                    ]),
                    _: 1
                  })
                ])
              ]),
              selectedPortraitProjectId.value ? (openBlock(), createElementBlock("div", _hoisted_22$4, [
                createBaseVNode("div", _hoisted_23$4, [
                  _cache[43] || (_cache[43] = createBaseVNode("span", { class: "step-number" }, "2", -1)),
                  _cache[44] || (_cache[44] = createBaseVNode("span", { class: "step-title" }, "选择人物形象", -1)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    text: "",
                    size: "small",
                    onClick: _cache[14] || (_cache[14] = ($event) => showCreateCharacterDialog.value = true)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[42] || (_cache[42] = createTextVNode(" 新建人物 ", -1))
                    ]),
                    _: 1
                  })
                ]),
                projectCharacters.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_24$4, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(projectCharacters.value, (portrait) => {
                    return openBlock(), createElementBlock("div", {
                      key: portrait.id,
                      class: normalizeClass(["portrait-item", { selected: selectedPortraitId.value === portrait.id }]),
                      onClick: ($event) => selectedPortraitId.value = portrait.id
                    }, [
                      portrait.preview ? (openBlock(), createBlock(_component_el_image, {
                        key: 0,
                        src: portrait.preview,
                        fit: "cover"
                      }, {
                        error: withCtx(() => [
                          createBaseVNode("div", _hoisted_26$4, [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(picture_default))
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        _: 1
                      }, 8, ["src"])) : (openBlock(), createElementBlock("div", _hoisted_27$4, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(picture_default))
                          ]),
                          _: 1
                        })
                      ])),
                      createBaseVNode("span", _hoisted_28$4, toDisplayString(portrait.name), 1)
                    ], 10, _hoisted_25$4);
                  }), 128))
                ])) : (openBlock(), createBlock(_component_el_empty, {
                  key: 1,
                  description: "该项目暂无人物形象"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_button, {
                      type: "primary",
                      size: "small",
                      onClick: _cache[15] || (_cache[15] = ($event) => showCreateCharacterDialog.value = true)
                    }, {
                      default: withCtx(() => [..._cache[45] || (_cache[45] = [
                        createTextVNode("创建人物形象", -1)
                      ])]),
                      _: 1
                    })
                  ]),
                  _: 1
                }))
              ])) : createCommentVNode("", true),
              portraitProjects.value.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                key: 1,
                description: "暂无人像项目"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_button, {
                    type: "primary",
                    onClick: _cache[16] || (_cache[16] = ($event) => showCreateProjectDialog.value = true)
                  }, {
                    default: withCtx(() => [..._cache[46] || (_cache[46] = [
                      createTextVNode("创建人像项目", -1)
                    ])]),
                    _: 1
                  })
                ]),
                _: 1
              })) : createCommentVNode("", true)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showCreateProjectDialog.value,
          "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => showCreateProjectDialog.value = $event),
          title: "新建人像项目",
          width: "400px",
          "destroy-on-close": "",
          "append-to-body": false,
          "modal-append-to-body": false,
          center: ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[21] || (_cache[21] = ($event) => showCreateProjectDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[49] || (_cache[49] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: creatingProject.value,
              onClick: createPortraitProject
            }, {
              default: withCtx(() => [..._cache[50] || (_cache[50] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: newProjectForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "项目名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newProjectForm.value.name,
                      "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => newProjectForm.value.name = $event),
                      placeholder: "输入项目名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "项目描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newProjectForm.value.description,
                      "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => newProjectForm.value.description = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "项目描述（可选）"
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
        createVNode(_sfc_main$9, {
          modelValue: showCreateCharacterDialog.value,
          "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => showCreateCharacterDialog.value = $event),
          "project-id": selectedPortraitProjectId.value,
          onSuccess: handleCreateCharacterSuccess
        }, null, 8, ["modelValue", "project-id"]),
        createVNode(_component_el_dialog, {
          modelValue: showRelationDialog.value,
          "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => showRelationDialog.value = $event),
          title: "角色关系管理",
          width: "600px",
          "append-to-body": false,
          "modal-append-to-body": false,
          center: ""
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_29$4, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(characterRelations.value, (relation) => {
                return openBlock(), createElementBlock("div", {
                  key: relation.id,
                  class: "relation-item"
                }, [
                  createBaseVNode("span", _hoisted_30$4, toDisplayString(getCharacterName(relation.relatedCharacterId)), 1),
                  createBaseVNode("span", _hoisted_31$3, toDisplayString(relation.relationType), 1),
                  createBaseVNode("span", _hoisted_32$3, toDisplayString(relation.relationDescription), 1),
                  createVNode(_component_el_button, {
                    text: "",
                    type: "danger",
                    size: "small",
                    onClick: ($event) => deleteRelation(relation.id)
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
                ]);
              }), 128)),
              createVNode(_component_el_button, {
                type: "primary",
                plain: "",
                onClick: _cache[24] || (_cache[24] = ($event) => showAddRelationDialog.value = true)
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(plus_default))
                    ]),
                    _: 1
                  }),
                  _cache[51] || (_cache[51] = createTextVNode(" 添加关系 ", -1))
                ]),
                _: 1
              })
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showAddRelationDialog.value,
          "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => showAddRelationDialog.value = $event),
          title: "添加角色关系",
          width: "400px",
          "append-to-body": false,
          "modal-append-to-body": false,
          center: ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[29] || (_cache[29] = ($event) => showAddRelationDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[52] || (_cache[52] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: addRelation
            }, {
              default: withCtx(() => [..._cache[53] || (_cache[53] = [
                createTextVNode("添加", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: relationForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "关联角色" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: relationForm.value.relatedCharacterId,
                      "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => relationForm.value.relatedCharacterId = $event),
                      placeholder: "选择角色"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(otherCharacters.value, (char) => {
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
                createVNode(_component_el_form_item, { label: "关系类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: relationForm.value.relationType,
                      "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => relationForm.value.relationType = $event),
                      placeholder: "选择关系类型",
                      "allow-create": "",
                      filterable: ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "师徒",
                          value: "师徒"
                        }),
                        createVNode(_component_el_option, {
                          label: "父子",
                          value: "父子"
                        }),
                        createVNode(_component_el_option, {
                          label: "母女",
                          value: "母女"
                        }),
                        createVNode(_component_el_option, {
                          label: "兄弟",
                          value: "兄弟"
                        }),
                        createVNode(_component_el_option, {
                          label: "姐妹",
                          value: "姐妹"
                        }),
                        createVNode(_component_el_option, {
                          label: "恋人",
                          value: "恋人"
                        }),
                        createVNode(_component_el_option, {
                          label: "仇敌",
                          value: "仇敌"
                        }),
                        createVNode(_component_el_option, {
                          label: "朋友",
                          value: "朋友"
                        }),
                        createVNode(_component_el_option, {
                          label: "主仆",
                          value: "主仆"
                        }),
                        createVNode(_component_el_option, {
                          label: "同门",
                          value: "同门"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "关系描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: relationForm.value.relationDescription,
                      "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => relationForm.value.relationDescription = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "描述关系详情..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const CharacterStage = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-a66e7f37"]]);
const _hoisted_1$4 = { class: "skill-item-stage" };
const _hoisted_2$4 = { class: "type-config-section" };
const _hoisted_3$4 = { class: "config-header" };
const _hoisted_4$4 = { class: "type-config-container" };
const _hoisted_5$4 = { class: "type-list-panel" };
const _hoisted_6$4 = ["onClick"];
const _hoisted_7$4 = { class: "type-name" };
const _hoisted_8$4 = { class: "type-code" };
const _hoisted_9$4 = { class: "level-list-panel" };
const _hoisted_10$4 = { class: "panel-header" };
const _hoisted_11$4 = { class: "level-cards" };
const _hoisted_12$4 = { class: "level-header" };
const _hoisted_13$4 = { class: "level-num" };
const _hoisted_14$4 = {
  key: 1,
  class: "empty-tip"
};
const _hoisted_15$4 = {
  class: "config-header",
  style: { "margin-top": "24px" }
};
const _hoisted_16$4 = { class: "type-config-container" };
const _hoisted_17$4 = { class: "type-list-panel" };
const _hoisted_18$3 = ["onClick"];
const _hoisted_19$3 = { class: "type-name" };
const _hoisted_20$3 = { class: "type-code" };
const _hoisted_21$3 = { class: "level-list-panel" };
const _hoisted_22$3 = { class: "panel-header" };
const _hoisted_23$3 = { class: "level-cards" };
const _hoisted_24$3 = { class: "level-header" };
const _hoisted_25$3 = { class: "level-num" };
const _hoisted_26$3 = {
  key: 1,
  class: "empty-tip"
};
const _hoisted_27$3 = { class: "skill-list" };
const _hoisted_28$3 = { class: "skill-header" };
const _hoisted_29$3 = { class: "skill-tags" };
const _hoisted_30$3 = { class: "type-tag" };
const _hoisted_31$2 = { class: "level-tag" };
const _hoisted_32$2 = { class: "skill-content" };
const _hoisted_33$1 = { class: "skill-desc" };
const _hoisted_34$1 = { class: "skill-meta" };
const _hoisted_35$1 = { key: 0 };
const _hoisted_36$1 = { class: "skill-owners" };
const _hoisted_37$1 = {
  key: 0,
  class: "no-owner"
};
const _hoisted_38$1 = { class: "skill-actions" };
const _hoisted_39$1 = { class: "item-list" };
const _hoisted_40$1 = { class: "item-header" };
const _hoisted_41$1 = { class: "item-tags" };
const _hoisted_42$1 = { class: "type-tag" };
const _hoisted_43$1 = { class: "item-content" };
const _hoisted_44$1 = { class: "item-desc" };
const _hoisted_45$1 = { class: "item-meta" };
const _hoisted_46$1 = { key: 0 };
const _hoisted_47$1 = { key: 1 };
const _hoisted_48$1 = { class: "item-actions" };
const _hoisted_49$1 = { class: "action-buttons" };
const _hoisted_50$1 = {
  key: 0,
  class: "generating-progress"
};
const _hoisted_51$1 = { class: "progress-text" };
const _hoisted_52$1 = { class: "level-option" };
const _hoisted_53$1 = { class: "level-desc" };
const _hoisted_54$1 = { class: "level-option" };
const _hoisted_55$1 = { class: "level-desc" };
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "SkillItemStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const selectedModel = inject("selectedModel", computed(() => null));
    const activeTab = ref("types");
    const characters = ref([]);
    const skills = ref([]);
    const items = ref([]);
    const skillTypes = ref([]);
    const itemTypes = ref([]);
    const selectedSkillType = ref(null);
    const selectedItemType = ref(null);
    const skillLevels = ref([]);
    const itemLevels = ref([]);
    const showSkillDialog = ref(false);
    const showItemDialog = ref(false);
    const showAddSkillTypeDialog = ref(false);
    const showAddSkillLevelDialog = ref(false);
    const showAddItemTypeDialog = ref(false);
    const showAddItemLevelDialog = ref(false);
    const editingSkill = ref(null);
    const editingItem = ref(null);
    const generating = ref(false);
    const currentEventId = ref(null);
    const generatingContent = ref("");
    const generateButtonText = computed(() => {
      if (activeTab.value === "types") {
        return "AI 生成技能和物品类型";
      } else if (activeTab.value === "skills") {
        return "AI 生成技能体系";
      } else if (activeTab.value === "items") {
        return "AI 生成物品体系";
      }
      return "AI 生成";
    });
    const generateProgressText = computed(() => {
      if (activeTab.value === "types") {
        return "AI 正在生成技能和物品类型建议...";
      } else if (activeTab.value === "skills") {
        return "AI 正在生成技能体系建议...";
      } else if (activeTab.value === "items") {
        return "AI 正在生成物品体系建议...";
      }
      return "AI 正在生成...";
    });
    const skillForm = ref({
      name: "",
      type: "",
      level: "",
      system: "",
      description: "",
      characterIds: []
    });
    const itemForm = ref({
      name: "",
      type: "",
      level: "",
      description: "",
      ownerId: ""
    });
    const newSkillTypeForm = ref({ code: "", name: "" });
    const newSkillLevelForm = ref({ code: "", name: "", description: "" });
    const newItemTypeForm = ref({ code: "", name: "" });
    const newItemLevelForm = ref({ code: "", name: "", description: "" });
    const skillTypeOptions = computed(() => {
      return skillTypes.value.map((t) => ({ label: t.name, value: t.code }));
    });
    const itemTypeOptions = computed(() => {
      return itemTypes.value.map((t) => ({ label: t.name, value: t.code }));
    });
    const currentSkillLevelOptions = computed(() => {
      if (!skillForm.value.type) return [];
      const levels = skillLevelsMap.value[skillForm.value.type] || [];
      return levels.map((l) => ({ label: l.name, value: l.code, description: l.description }));
    });
    const currentItemLevelOptions = computed(() => {
      if (!itemForm.value.type) return [];
      const levels = itemLevelsMap.value[itemForm.value.type] || [];
      return levels.map((l) => ({ label: l.name, value: l.code, description: l.description }));
    });
    const skillLevelsMap = ref({});
    const itemLevelsMap = ref({});
    function getSkillTypeLabel(code) {
      const type = skillTypes.value.find((t) => t.code === code);
      return type?.name || code;
    }
    function getSkillLevelLabel(typeCode, levelCode) {
      const levels = skillLevelsMap.value[typeCode] || [];
      const level = levels.find((l) => l.code === levelCode);
      return level?.name || levelCode;
    }
    function getItemTypeLabel(code) {
      const type = itemTypes.value.find((t) => t.code === code);
      return type?.name || code;
    }
    function getItemLevelLabel(typeCode, levelCode) {
      const levels = itemLevelsMap.value[typeCode] || [];
      const level = levels.find((l) => l.code === levelCode);
      return level?.name || levelCode;
    }
    function getCharacterName(id) {
      const char = characters.value.find((c) => c.id === id);
      return char?.name || "未知角色";
    }
    function onSkillTypeChange() {
      skillForm.value.level = "";
    }
    function onItemTypeChange() {
      itemForm.value.level = "";
    }
    async function loadSkillTypes() {
      const result = await window.electronAPI.longwriting.getSkillTypeConfigs(props.projectId);
      if (result.success) {
        skillTypes.value = result.data || [];
        for (const type of skillTypes.value) {
          await loadSkillLevelsForType(type.code);
        }
        if (skillTypes.value.length > 0 && !selectedSkillType.value) {
          selectSkillType(skillTypes.value[0]);
        }
      }
    }
    async function loadSkillLevelsForType(skillTypeCode) {
      const result = await window.electronAPI.longwriting.getSkillLevels(props.projectId, skillTypeCode);
      if (result.success) {
        skillLevelsMap.value[skillTypeCode] = result.data || [];
      }
    }
    async function selectSkillType(type) {
      selectedSkillType.value = type;
      const result = await window.electronAPI.longwriting.getSkillLevels(props.projectId, type.code);
      if (result.success) {
        skillLevels.value = result.data || [];
      }
    }
    async function createSkillType() {
      if (!newSkillTypeForm.value.code || !newSkillTypeForm.value.name) return;
      const result = await window.electronAPI.longwriting.createSkillTypeConfig({
        projectId: props.projectId,
        code: newSkillTypeForm.value.code,
        name: newSkillTypeForm.value.name
      });
      if (result.success) {
        await loadSkillTypes();
        showAddSkillTypeDialog.value = false;
        newSkillTypeForm.value = { code: "", name: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function deleteSkillType(id) {
      try {
        await ElMessageBox.confirm("确定要删除该技能类型吗？关联的等级也会被删除。", "删除确认", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteSkillTypeConfig(id);
        if (result.success) {
          if (selectedSkillType.value?.id === id) {
            selectedSkillType.value = null;
            skillLevels.value = [];
          }
          await loadSkillTypes();
          ElMessage.success("删除成功");
        }
      } catch {
      }
    }
    async function createSkillLevel() {
      if (!selectedSkillType.value || !newSkillLevelForm.value.code || !newSkillLevelForm.value.name) return;
      const result = await window.electronAPI.longwriting.createSkillLevel({
        projectId: props.projectId,
        skillTypeCode: selectedSkillType.value.code,
        code: newSkillLevelForm.value.code,
        name: newSkillLevelForm.value.name,
        description: newSkillLevelForm.value.description
      });
      if (result.success) {
        await selectSkillType(selectedSkillType.value);
        await loadSkillLevelsForType(selectedSkillType.value.code);
        showAddSkillLevelDialog.value = false;
        newSkillLevelForm.value = { code: "", name: "", description: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function updateSkillLevel(level) {
      await window.electronAPI.longwriting.updateSkillLevel(level.id, {
        name: level.name,
        description: level.description
      });
      await loadSkillLevelsForType(level.skillTypeCode);
    }
    async function deleteSkillLevel(id) {
      const result = await window.electronAPI.longwriting.deleteSkillLevel(id);
      if (result.success && selectedSkillType.value) {
        await selectSkillType(selectedSkillType.value);
        await loadSkillLevelsForType(selectedSkillType.value.code);
      }
    }
    async function loadItemTypes() {
      const result = await window.electronAPI.longwriting.getItemTypeConfigs(props.projectId);
      if (result.success) {
        itemTypes.value = result.data || [];
        for (const type of itemTypes.value) {
          await loadItemLevelsForType(type.code);
        }
        if (itemTypes.value.length > 0 && !selectedItemType.value) {
          selectItemType(itemTypes.value[0]);
        }
      }
    }
    async function loadItemLevelsForType(itemTypeCode) {
      const result = await window.electronAPI.longwriting.getItemLevels(props.projectId, itemTypeCode);
      if (result.success) {
        itemLevelsMap.value[itemTypeCode] = result.data || [];
      }
    }
    async function selectItemType(type) {
      selectedItemType.value = type;
      const result = await window.electronAPI.longwriting.getItemLevels(props.projectId, type.code);
      if (result.success) {
        itemLevels.value = result.data || [];
      }
    }
    async function createItemType() {
      if (!newItemTypeForm.value.code || !newItemTypeForm.value.name) return;
      const result = await window.electronAPI.longwriting.createItemTypeConfig({
        projectId: props.projectId,
        code: newItemTypeForm.value.code,
        name: newItemTypeForm.value.name
      });
      if (result.success) {
        await loadItemTypes();
        showAddItemTypeDialog.value = false;
        newItemTypeForm.value = { code: "", name: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function deleteItemType(id) {
      try {
        await ElMessageBox.confirm("确定要删除该物品类型吗？关联的等级也会被删除。", "删除确认", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteItemTypeConfig(id);
        if (result.success) {
          if (selectedItemType.value?.id === id) {
            selectedItemType.value = null;
            itemLevels.value = [];
          }
          await loadItemTypes();
          ElMessage.success("删除成功");
        }
      } catch {
      }
    }
    async function createItemLevel() {
      if (!selectedItemType.value || !newItemLevelForm.value.code || !newItemLevelForm.value.name) return;
      const result = await window.electronAPI.longwriting.createItemLevel({
        projectId: props.projectId,
        itemTypeCode: selectedItemType.value.code,
        code: newItemLevelForm.value.code,
        name: newItemLevelForm.value.name,
        description: newItemLevelForm.value.description
      });
      if (result.success) {
        await selectItemType(selectedItemType.value);
        await loadItemLevelsForType(selectedItemType.value.code);
        showAddItemLevelDialog.value = false;
        newItemLevelForm.value = { code: "", name: "", description: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function updateItemLevel(level) {
      await window.electronAPI.longwriting.updateItemLevel(level.id, {
        name: level.name,
        description: level.description
      });
      await loadItemLevelsForType(level.itemTypeCode);
    }
    async function deleteItemLevel(id) {
      const result = await window.electronAPI.longwriting.deleteItemLevel(id);
      if (result.success && selectedItemType.value) {
        await selectItemType(selectedItemType.value);
        await loadItemLevelsForType(selectedItemType.value.code);
      }
    }
    function editSkill(skill) {
      editingSkill.value = skill;
      skillForm.value = {
        name: skill.name,
        type: skill.type,
        level: skill.level,
        system: skill.system,
        description: skill.description,
        characterIds: skill.characterIds
      };
      showSkillDialog.value = true;
    }
    async function deleteSkill(id) {
      try {
        await ElMessageBox.confirm("确定要删除该技能吗？", "删除技能", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteSkill(id);
        if (result.success) {
          await loadSkills();
          ElMessage.success("技能已删除");
          updateProgress();
        }
      } catch {
      }
    }
    async function saveSkill() {
      if (!skillForm.value.name) {
        ElMessage.warning("请输入技能名称");
        return;
      }
      const skillData = JSON.parse(JSON.stringify(skillForm.value));
      if (editingSkill.value) {
        const result = await window.electronAPI.longwriting.updateSkill(editingSkill.value.id, skillData);
        if (result.success) {
          await loadSkills();
          ElMessage.success("技能已更新");
        }
      } else {
        const result = await window.electronAPI.longwriting.createSkill({
          projectId: props.projectId,
          ...skillData
        });
        if (result.success) {
          await loadSkills();
          ElMessage.success("技能已添加");
        }
      }
      showSkillDialog.value = false;
      editingSkill.value = null;
      skillForm.value = { name: "", type: "", level: "", system: "", description: "", characterIds: [] };
      updateProgress();
    }
    function editItem(item) {
      editingItem.value = item;
      itemForm.value = {
        name: item.name,
        type: item.type,
        level: item.level,
        description: item.description,
        ownerId: item.ownerId || ""
      };
      showItemDialog.value = true;
    }
    async function deleteItem(id) {
      try {
        await ElMessageBox.confirm("确定要删除该物品吗？", "删除物品", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteItem(id);
        if (result.success) {
          await loadItems();
          ElMessage.success("物品已删除");
          updateProgress();
        }
      } catch {
      }
    }
    async function saveItem() {
      if (!itemForm.value.name) {
        ElMessage.warning("请输入物品名称");
        return;
      }
      const rawForm = JSON.parse(JSON.stringify(itemForm.value));
      const itemData = { ...rawForm, ownerId: rawForm.ownerId || void 0 };
      if (editingItem.value) {
        const result = await window.electronAPI.longwriting.updateItem(editingItem.value.id, itemData);
        if (result.success) {
          await loadItems();
          ElMessage.success("物品已更新");
        }
      } else {
        const result = await window.electronAPI.longwriting.createItem({
          projectId: props.projectId,
          ...itemData
        });
        if (result.success) {
          await loadItems();
          ElMessage.success("物品已添加");
        }
      }
      showItemDialog.value = false;
      editingItem.value = null;
      itemForm.value = { name: "", type: "", level: "", description: "", ownerId: "" };
      updateProgress();
    }
    async function handleGenerate() {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      if (activeTab.value === "types") {
        await generateTypes();
      } else if (activeTab.value === "skills") {
        await generateSkills();
      } else if (activeTab.value === "items") {
        await generateItems();
      }
    }
    async function generateTypes() {
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `types-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parseTypesResult(generatingContent.value);
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateSkillItemTypes(
        currentEventId.value,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parseTypesResult(content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        const data = JSON.parse(jsonMatch[0]);
        const skillTypes2 = data.skillTypes || [];
        const itemTypes2 = data.itemTypes || [];
        if (skillTypes2.length === 0 && itemTypes2.length === 0) {
          ElMessage.warning("AI 未生成类型建议");
          return;
        }
        const skillTypeNames = skillTypes2.map((t) => `- ${t.name} (${t.code})`).join("\n") || "无";
        const itemTypeNames = itemTypes2.map((t) => `- ${t.name} (${t.code})`).join("\n") || "无";
        await ElMessageBox.confirm(
          `AI 建议添加以下类型配置：

技能类型：
${skillTypeNames}

物品类型：
${itemTypeNames}`,
          "AI 生成类型建议",
          { confirmButtonText: "全部添加", cancelButtonText: "取消", type: "info" }
        );
        for (const type of skillTypes2) {
          await window.electronAPI.longwriting.createSkillTypeConfig({
            projectId: props.projectId,
            code: type.code,
            name: type.name
          });
        }
        for (const type of itemTypes2) {
          await window.electronAPI.longwriting.createItemTypeConfig({
            projectId: props.projectId,
            code: type.code,
            name: type.name
          });
        }
        await loadData();
        ElMessage.success("类型配置已添加");
      } catch (error) {
        if (error !== "cancel") {
          ElMessage.error("解析 AI 响应失败");
        }
      }
    }
    async function generateSkills() {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `skills-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parseSkillsResult(generatingContent.value);
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateSkillsOnly(
        currentEventId.value,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parseSkillsResult(content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        const data = JSON.parse(jsonMatch[0]);
        const suggestedSkills = data.skills || [];
        if (suggestedSkills.length === 0) {
          ElMessage.warning("AI 未生成技能建议");
          return;
        }
        await ElMessageBox.confirm(
          `AI 建议添加以下技能：

${suggestedSkills.map((s) => `- ${s.name}`).join("\n")}`,
          "AI 生成技能建议",
          { confirmButtonText: "全部添加", cancelButtonText: "取消", type: "info" }
        );
        for (const suggested of suggestedSkills) {
          await window.electronAPI.longwriting.createSkill({
            projectId: props.projectId,
            ...suggested,
            characterIds: []
          });
        }
        await loadData();
        ElMessage.success("技能已添加");
      } catch (error) {
        if (error !== "cancel") {
          ElMessage.error("解析 AI 响应失败");
        }
      }
    }
    async function generateItems() {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `items-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parseItemsResult(generatingContent.value);
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateItemsOnly(
        currentEventId.value,
        props.projectId,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parseItemsResult(content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        const data = JSON.parse(jsonMatch[0]);
        const suggestedItems = data.items || [];
        if (suggestedItems.length === 0) {
          ElMessage.warning("AI 未生成物品建议");
          return;
        }
        await ElMessageBox.confirm(
          `AI 建议添加以下物品：

${suggestedItems.map((i) => `- ${i.name}`).join("\n")}`,
          "AI 生成物品建议",
          { confirmButtonText: "全部添加", cancelButtonText: "取消", type: "info" }
        );
        for (const suggested of suggestedItems) {
          await window.electronAPI.longwriting.createItem({
            projectId: props.projectId,
            ...suggested
          });
        }
        await loadData();
        ElMessage.success("物品已添加");
      } catch (error) {
        if (error !== "cancel") {
          ElMessage.error("解析 AI 响应失败");
        }
      }
    }
    function cancelGeneration() {
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    function updateProgress() {
      const total = skills.value.length + items.value.length;
      const progress = Math.min(65, 55 + total * 2);
      emit("update:progress", progress);
    }
    async function loadCharacters() {
      const result = await window.electronAPI.longwriting.getCharacters(props.projectId);
      if (result.success) {
        characters.value = result.data || [];
      }
    }
    async function loadSkills() {
      const result = await window.electronAPI.longwriting.getSkills(props.projectId);
      if (result.success) {
        skills.value = result.data || [];
      }
    }
    async function loadItems() {
      const result = await window.electronAPI.longwriting.getItems(props.projectId);
      if (result.success) {
        items.value = result.data || [];
      }
    }
    async function loadData() {
      await Promise.all([
        loadSkillTypes(),
        loadItemTypes(),
        loadCharacters(),
        loadSkills(),
        loadItems()
      ]);
      updateProgress();
    }
    async function initDefaultConfigs() {
      const result = await window.electronAPI.longwriting.initDefaultTypeConfigs(props.projectId);
      if (result.success) {
        await loadSkillTypes();
        await loadItemTypes();
      }
    }
    onMounted(async () => {
      await loadData();
      if (skillTypes.value.length === 0 && itemTypes.value.length === 0) {
        await initDefaultConfigs();
      }
    });
    watch(() => props.projectId, () => {
      loadData();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_tabs = resolveComponent("el-tabs");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        _cache[64] || (_cache[64] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "技能与物品设定"),
          createBaseVNode("p", { class: "stage-desc" }, "设定故事中的技能体系和重要物品（可选阶段）")
        ], -1)),
        createVNode(_component_el_tabs, {
          modelValue: activeTab.value,
          "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => activeTab.value = $event)
        }, {
          default: withCtx(() => [
            createVNode(_component_el_tab_pane, {
              label: "类型设定",
              name: "types"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_2$4, [
                  createBaseVNode("div", _hoisted_3$4, [
                    _cache[41] || (_cache[41] = createBaseVNode("h3", null, "技能类型与等级", -1)),
                    createVNode(_component_el_button, {
                      size: "small",
                      type: "primary",
                      onClick: _cache[0] || (_cache[0] = ($event) => showAddSkillTypeDialog.value = true)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(plus_default))
                          ]),
                          _: 1
                        }),
                        _cache[40] || (_cache[40] = createTextVNode(" 添加类型 ", -1))
                      ]),
                      _: 1
                    })
                  ]),
                  createBaseVNode("div", _hoisted_4$4, [
                    createBaseVNode("div", _hoisted_5$4, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(skillTypes.value, (skillType) => {
                        return openBlock(), createElementBlock("div", {
                          key: skillType.id,
                          class: normalizeClass(["type-item", { active: selectedSkillType.value?.id === skillType.id }]),
                          onClick: ($event) => selectSkillType(skillType)
                        }, [
                          createBaseVNode("span", _hoisted_7$4, toDisplayString(skillType.name), 1),
                          createBaseVNode("span", _hoisted_8$4, toDisplayString(skillType.code), 1),
                          createVNode(_component_el_button, {
                            text: "",
                            size: "small",
                            type: "danger",
                            onClick: withModifiers(($event) => deleteSkillType(skillType.id), ["stop"])
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
                        ], 10, _hoisted_6$4);
                      }), 128))
                    ]),
                    createBaseVNode("div", _hoisted_9$4, [
                      selectedSkillType.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createBaseVNode("div", _hoisted_10$4, [
                          createBaseVNode("span", null, toDisplayString(selectedSkillType.value.name) + " - 等级", 1),
                          createVNode(_component_el_button, {
                            size: "small",
                            onClick: _cache[1] || (_cache[1] = ($event) => showAddSkillLevelDialog.value = true)
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
                        createBaseVNode("div", _hoisted_11$4, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(skillLevels.value, (level) => {
                            return openBlock(), createElementBlock("div", {
                              key: level.id,
                              class: "level-card-small"
                            }, [
                              createBaseVNode("div", _hoisted_12$4, [
                                createBaseVNode("span", _hoisted_13$4, toDisplayString(level.sortOrder + 1), 1),
                                createVNode(_component_el_input, {
                                  modelValue: level.name,
                                  "onUpdate:modelValue": ($event) => level.name = $event,
                                  size: "small",
                                  onChange: ($event) => updateSkillLevel(level)
                                }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                                createVNode(_component_el_button, {
                                  text: "",
                                  size: "small",
                                  type: "danger",
                                  onClick: ($event) => deleteSkillLevel(level.id)
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
                              ]),
                              createVNode(_component_el_input, {
                                modelValue: level.description,
                                "onUpdate:modelValue": ($event) => level.description = $event,
                                type: "textarea",
                                rows: 2,
                                size: "small",
                                placeholder: "等级描述",
                                onChange: ($event) => updateSkillLevel(level)
                              }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"])
                            ]);
                          }), 128))
                        ])
                      ], 64)) : (openBlock(), createElementBlock("div", _hoisted_14$4, "选择左侧类型查看等级"))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_15$4, [
                    _cache[43] || (_cache[43] = createBaseVNode("h3", null, "物品类型与等级", -1)),
                    createVNode(_component_el_button, {
                      size: "small",
                      type: "primary",
                      onClick: _cache[2] || (_cache[2] = ($event) => showAddItemTypeDialog.value = true)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(plus_default))
                          ]),
                          _: 1
                        }),
                        _cache[42] || (_cache[42] = createTextVNode(" 添加类型 ", -1))
                      ]),
                      _: 1
                    })
                  ]),
                  createBaseVNode("div", _hoisted_16$4, [
                    createBaseVNode("div", _hoisted_17$4, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(itemTypes.value, (itemType) => {
                        return openBlock(), createElementBlock("div", {
                          key: itemType.id,
                          class: normalizeClass(["type-item", { active: selectedItemType.value?.id === itemType.id }]),
                          onClick: ($event) => selectItemType(itemType)
                        }, [
                          createBaseVNode("span", _hoisted_19$3, toDisplayString(itemType.name), 1),
                          createBaseVNode("span", _hoisted_20$3, toDisplayString(itemType.code), 1),
                          createVNode(_component_el_button, {
                            text: "",
                            size: "small",
                            type: "danger",
                            onClick: withModifiers(($event) => deleteItemType(itemType.id), ["stop"])
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
                        ], 10, _hoisted_18$3);
                      }), 128))
                    ]),
                    createBaseVNode("div", _hoisted_21$3, [
                      selectedItemType.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createBaseVNode("div", _hoisted_22$3, [
                          createBaseVNode("span", null, toDisplayString(selectedItemType.value.name) + " - 等级", 1),
                          createVNode(_component_el_button, {
                            size: "small",
                            onClick: _cache[3] || (_cache[3] = ($event) => showAddItemLevelDialog.value = true)
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
                        createBaseVNode("div", _hoisted_23$3, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(itemLevels.value, (level) => {
                            return openBlock(), createElementBlock("div", {
                              key: level.id,
                              class: "level-card-small"
                            }, [
                              createBaseVNode("div", _hoisted_24$3, [
                                createBaseVNode("span", _hoisted_25$3, toDisplayString(level.sortOrder + 1), 1),
                                createVNode(_component_el_input, {
                                  modelValue: level.name,
                                  "onUpdate:modelValue": ($event) => level.name = $event,
                                  size: "small",
                                  onChange: ($event) => updateItemLevel(level)
                                }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                                createVNode(_component_el_button, {
                                  text: "",
                                  size: "small",
                                  type: "danger",
                                  onClick: ($event) => deleteItemLevel(level.id)
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
                              ]),
                              createVNode(_component_el_input, {
                                modelValue: level.description,
                                "onUpdate:modelValue": ($event) => level.description = $event,
                                type: "textarea",
                                rows: 2,
                                size: "small",
                                placeholder: "等级描述",
                                onChange: ($event) => updateItemLevel(level)
                              }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"])
                            ]);
                          }), 128))
                        ])
                      ], 64)) : (openBlock(), createElementBlock("div", _hoisted_26$3, "选择左侧类型查看等级"))
                    ])
                  ])
                ])
              ]),
              _: 1
            }),
            createVNode(_component_el_tab_pane, {
              label: "技能设定",
              name: "skills"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_27$3, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(skills.value, (skill) => {
                    return openBlock(), createElementBlock("div", {
                      key: skill.id,
                      class: "skill-card"
                    }, [
                      createBaseVNode("div", _hoisted_28$3, [
                        createBaseVNode("h4", null, toDisplayString(skill.name), 1),
                        createBaseVNode("div", _hoisted_29$3, [
                          createBaseVNode("span", _hoisted_30$3, toDisplayString(getSkillTypeLabel(skill.type)), 1),
                          createBaseVNode("span", _hoisted_31$2, toDisplayString(getSkillLevelLabel(skill.type, skill.level)), 1)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_32$2, [
                        createBaseVNode("p", _hoisted_33$1, toDisplayString(skill.description || "暂无描述"), 1),
                        createBaseVNode("div", _hoisted_34$1, [
                          skill.system ? (openBlock(), createElementBlock("span", _hoisted_35$1, "所属体系：" + toDisplayString(skill.system), 1)) : createCommentVNode("", true)
                        ]),
                        createBaseVNode("div", _hoisted_36$1, [
                          _cache[44] || (_cache[44] = createBaseVNode("span", { class: "owners-label" }, "掌握角色：", -1)),
                          (openBlock(true), createElementBlock(Fragment, null, renderList(skill.characterIds, (charId) => {
                            return openBlock(), createBlock(_component_el_tag, {
                              key: charId,
                              size: "small",
                              class: "owner-tag"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(getCharacterName(charId)), 1)
                              ]),
                              _: 2
                            }, 1024);
                          }), 128)),
                          skill.characterIds.length === 0 ? (openBlock(), createElementBlock("span", _hoisted_37$1, "暂无")) : createCommentVNode("", true)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_38$1, [
                        createVNode(_component_el_button, {
                          text: "",
                          onClick: ($event) => editSkill(skill)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(edit_default))
                              ]),
                              _: 1
                            }),
                            _cache[45] || (_cache[45] = createTextVNode(" 编辑 ", -1))
                          ]),
                          _: 1
                        }, 8, ["onClick"]),
                        createVNode(_component_el_button, {
                          text: "",
                          type: "danger",
                          onClick: ($event) => deleteSkill(skill.id)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(delete_default))
                              ]),
                              _: 1
                            }),
                            _cache[46] || (_cache[46] = createTextVNode(" 删除 ", -1))
                          ]),
                          _: 1
                        }, 8, ["onClick"])
                      ])
                    ]);
                  }), 128)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    plain: "",
                    class: "add-btn",
                    onClick: _cache[4] || (_cache[4] = ($event) => showSkillDialog.value = true)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[47] || (_cache[47] = createTextVNode(" 添加技能 ", -1))
                    ]),
                    _: 1
                  })
                ])
              ]),
              _: 1
            }),
            createVNode(_component_el_tab_pane, {
              label: "物品设定",
              name: "items"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_39$1, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
                    return openBlock(), createElementBlock("div", {
                      key: item.id,
                      class: "item-card"
                    }, [
                      createBaseVNode("div", _hoisted_40$1, [
                        createBaseVNode("h4", null, toDisplayString(item.name), 1),
                        createBaseVNode("div", _hoisted_41$1, [
                          createBaseVNode("span", _hoisted_42$1, toDisplayString(getItemTypeLabel(item.type)), 1),
                          createBaseVNode("span", {
                            class: normalizeClass(["level-tag", item.level])
                          }, toDisplayString(getItemLevelLabel(item.type, item.level)), 3)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_43$1, [
                        createBaseVNode("p", _hoisted_44$1, toDisplayString(item.description || "暂无描述"), 1),
                        createBaseVNode("div", _hoisted_45$1, [
                          item.ownerId ? (openBlock(), createElementBlock("span", _hoisted_46$1, "持有者：" + toDisplayString(getCharacterName(item.ownerId)), 1)) : (openBlock(), createElementBlock("span", _hoisted_47$1, "持有者：暂无"))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_48$1, [
                        createVNode(_component_el_button, {
                          text: "",
                          onClick: ($event) => editItem(item)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(edit_default))
                              ]),
                              _: 1
                            }),
                            _cache[48] || (_cache[48] = createTextVNode(" 编辑 ", -1))
                          ]),
                          _: 1
                        }, 8, ["onClick"]),
                        createVNode(_component_el_button, {
                          text: "",
                          type: "danger",
                          onClick: ($event) => deleteItem(item.id)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(delete_default))
                              ]),
                              _: 1
                            }),
                            _cache[49] || (_cache[49] = createTextVNode(" 删除 ", -1))
                          ]),
                          _: 1
                        }, 8, ["onClick"])
                      ])
                    ]);
                  }), 128)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    plain: "",
                    class: "add-btn",
                    onClick: _cache[5] || (_cache[5] = ($event) => showItemDialog.value = true)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[50] || (_cache[50] = createTextVNode(" 添加物品 ", -1))
                    ]),
                    _: 1
                  })
                ])
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createBaseVNode("div", _hoisted_49$1, [
          !generating.value ? (openBlock(), createBlock(_component_el_button, {
            key: 0,
            type: "primary",
            size: "large",
            onClick: handleGenerate
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(magic_stick_default))
                ]),
                _: 1
              }),
              createTextVNode(" " + toDisplayString(generateButtonText.value), 1)
            ]),
            _: 1
          })) : (openBlock(), createBlock(_component_el_button, {
            key: 1,
            type: "danger",
            size: "large",
            onClick: cancelGeneration
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(close_default))
                ]),
                _: 1
              }),
              _cache[51] || (_cache[51] = createTextVNode(" 取消生成 ", -1))
            ]),
            _: 1
          }))
        ]),
        generating.value ? (openBlock(), createElementBlock("div", _hoisted_50$1, [
          createVNode(_component_el_progress, {
            percentage: 100,
            indeterminate: true
          }),
          createBaseVNode("p", _hoisted_51$1, toDisplayString(generateProgressText.value), 1)
        ])) : createCommentVNode("", true),
        createVNode(_component_el_dialog, {
          modelValue: showAddSkillTypeDialog.value,
          "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => showAddSkillTypeDialog.value = $event),
          title: "添加技能类型",
          width: "400px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[9] || (_cache[9] = ($event) => showAddSkillTypeDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[52] || (_cache[52] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !newSkillTypeForm.value.code || !newSkillTypeForm.value.name,
              onClick: createSkillType
            }, {
              default: withCtx(() => [..._cache[53] || (_cache[53] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: newSkillTypeForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "类型编码",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newSkillTypeForm.value.code,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => newSkillTypeForm.value.code = $event),
                      placeholder: "请输入编码（英文）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "类型名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newSkillTypeForm.value.name,
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => newSkillTypeForm.value.name = $event),
                      placeholder: "请输入名称"
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
          modelValue: showAddSkillLevelDialog.value,
          "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => showAddSkillLevelDialog.value = $event),
          title: "添加技能等级",
          width: "450px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[14] || (_cache[14] = ($event) => showAddSkillLevelDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[54] || (_cache[54] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !newSkillLevelForm.value.code || !newSkillLevelForm.value.name,
              onClick: createSkillLevel
            }, {
              default: withCtx(() => [..._cache[55] || (_cache[55] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: newSkillLevelForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "等级编码",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newSkillLevelForm.value.code,
                      "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => newSkillLevelForm.value.code = $event),
                      placeholder: "请输入编码（英文）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "等级名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newSkillLevelForm.value.name,
                      "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => newSkillLevelForm.value.name = $event),
                      placeholder: "请输入名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "等级描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newSkillLevelForm.value.description,
                      "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => newSkillLevelForm.value.description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述此等级的特征、能力等"
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
          modelValue: showAddItemTypeDialog.value,
          "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => showAddItemTypeDialog.value = $event),
          title: "添加物品类型",
          width: "400px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[18] || (_cache[18] = ($event) => showAddItemTypeDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[56] || (_cache[56] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !newItemTypeForm.value.code || !newItemTypeForm.value.name,
              onClick: createItemType
            }, {
              default: withCtx(() => [..._cache[57] || (_cache[57] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: newItemTypeForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "类型编码",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newItemTypeForm.value.code,
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => newItemTypeForm.value.code = $event),
                      placeholder: "请输入编码（英文）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "类型名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newItemTypeForm.value.name,
                      "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => newItemTypeForm.value.name = $event),
                      placeholder: "请输入名称"
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
          modelValue: showAddItemLevelDialog.value,
          "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => showAddItemLevelDialog.value = $event),
          title: "添加物品等级",
          width: "450px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[23] || (_cache[23] = ($event) => showAddItemLevelDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[58] || (_cache[58] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !newItemLevelForm.value.code || !newItemLevelForm.value.name,
              onClick: createItemLevel
            }, {
              default: withCtx(() => [..._cache[59] || (_cache[59] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: newItemLevelForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "等级编码",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newItemLevelForm.value.code,
                      "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => newItemLevelForm.value.code = $event),
                      placeholder: "请输入编码（英文）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "等级名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newItemLevelForm.value.name,
                      "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => newItemLevelForm.value.name = $event),
                      placeholder: "请输入名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "等级描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newItemLevelForm.value.description,
                      "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => newItemLevelForm.value.description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述此等级的外观、能量特征等"
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
          modelValue: showSkillDialog.value,
          "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => showSkillDialog.value = $event),
          title: editingSkill.value ? "编辑技能" : "添加技能",
          width: "500px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[31] || (_cache[31] = ($event) => showSkillDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[60] || (_cache[60] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveSkill
            }, {
              default: withCtx(() => [..._cache[61] || (_cache[61] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: skillForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "技能名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: skillForm.value.name,
                      "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => skillForm.value.name = $event),
                      placeholder: "输入技能名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "技能类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: skillForm.value.type,
                      "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => skillForm.value.type = $event),
                      placeholder: "选择技能类型",
                      onChange: onSkillTypeChange
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(skillTypeOptions.value, (opt) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: opt.value,
                            label: opt.label,
                            value: opt.value
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "技能等级" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: skillForm.value.level,
                      "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => skillForm.value.level = $event),
                      placeholder: "选择等级"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(currentSkillLevelOptions.value, (opt) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: opt.value,
                            label: opt.label,
                            value: opt.value
                          }, {
                            default: withCtx(() => [
                              createBaseVNode("div", _hoisted_52$1, [
                                createBaseVNode("span", null, toDisplayString(opt.label), 1),
                                createBaseVNode("span", _hoisted_53$1, toDisplayString(opt.description), 1)
                              ])
                            ]),
                            _: 2
                          }, 1032, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "所属体系" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: skillForm.value.system,
                      "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => skillForm.value.system = $event),
                      placeholder: "门派/体系名称（可选）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "技能描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: skillForm.value.description,
                      "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => skillForm.value.description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述技能的特点、效果..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "掌握角色" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: skillForm.value.characterIds,
                      "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => skillForm.value.characterIds = $event),
                      multiple: "",
                      placeholder: "选择掌握此技能的角色"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(characters.value, (char) => {
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
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showItemDialog.value,
          "onUpdate:modelValue": _cache[39] || (_cache[39] = ($event) => showItemDialog.value = $event),
          title: editingItem.value ? "编辑物品" : "添加物品",
          width: "500px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[38] || (_cache[38] = ($event) => showItemDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[62] || (_cache[62] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveItem
            }, {
              default: withCtx(() => [..._cache[63] || (_cache[63] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: itemForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "物品名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: itemForm.value.name,
                      "onUpdate:modelValue": _cache[33] || (_cache[33] = ($event) => itemForm.value.name = $event),
                      placeholder: "输入物品名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "物品类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: itemForm.value.type,
                      "onUpdate:modelValue": _cache[34] || (_cache[34] = ($event) => itemForm.value.type = $event),
                      placeholder: "选择物品类型",
                      onChange: onItemTypeChange
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(itemTypeOptions.value, (opt) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: opt.value,
                            label: opt.label,
                            value: opt.value
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "物品等级" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: itemForm.value.level,
                      "onUpdate:modelValue": _cache[35] || (_cache[35] = ($event) => itemForm.value.level = $event),
                      placeholder: "选择等级"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(currentItemLevelOptions.value, (opt) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: opt.value,
                            label: opt.label,
                            value: opt.value
                          }, {
                            default: withCtx(() => [
                              createBaseVNode("div", _hoisted_54$1, [
                                createBaseVNode("span", null, toDisplayString(opt.label), 1),
                                createBaseVNode("span", _hoisted_55$1, toDisplayString(opt.description), 1)
                              ])
                            ]),
                            _: 2
                          }, 1032, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "物品描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: itemForm.value.description,
                      "onUpdate:modelValue": _cache[36] || (_cache[36] = ($event) => itemForm.value.description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "描述物品的外观、功能、来历..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "持有者" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: itemForm.value.ownerId,
                      "onUpdate:modelValue": _cache[37] || (_cache[37] = ($event) => itemForm.value.ownerId = $event),
                      placeholder: "选择持有角色（可选）",
                      clearable: ""
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(characters.value, (char) => {
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
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"])
      ]);
    };
  }
});
const SkillItemStage = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-0f000016"]]);
const _hoisted_1$3 = { class: "outline-stage" };
const _hoisted_2$3 = { class: "stage-content" };
const _hoisted_3$3 = { class: "outline-tree" };
const _hoisted_4$3 = {
  key: 0,
  class: "empty-outline"
};
const _hoisted_5$3 = ["onClick"];
const _hoisted_6$3 = ["onClick"];
const _hoisted_7$3 = { class: "node-title" };
const _hoisted_8$3 = { class: "node-type-tag" };
const _hoisted_9$3 = { class: "node-meta" };
const _hoisted_10$3 = { key: 0 };
const _hoisted_11$3 = { class: "node-actions" };
const _hoisted_12$3 = {
  key: 0,
  class: "node-children"
};
const _hoisted_13$3 = ["onClick"];
const _hoisted_14$3 = ["onClick"];
const _hoisted_15$3 = { class: "node-title" };
const _hoisted_16$3 = { class: "node-type-tag" };
const _hoisted_17$3 = { class: "node-meta" };
const _hoisted_18$2 = { key: 0 };
const _hoisted_19$2 = { class: "node-actions" };
const _hoisted_20$2 = {
  key: 0,
  class: "node-children"
};
const _hoisted_21$2 = { class: "node-header" };
const _hoisted_22$2 = { class: "node-title" };
const _hoisted_23$2 = { class: "node-type-tag" };
const _hoisted_24$2 = { class: "node-meta" };
const _hoisted_25$2 = { key: 0 };
const _hoisted_26$2 = { class: "node-actions" };
const _hoisted_27$2 = { class: "action-buttons" };
const _hoisted_28$2 = {
  key: 0,
  class: "generating-progress"
};
const _hoisted_29$2 = {
  key: 0,
  class: "form-tip"
};
const _hoisted_30$2 = {
  key: 0,
  class: "form-tip"
};
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "OutlineStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const selectedModel = inject("selectedModel", computed(() => null));
    const outlineNodes = ref([]);
    const expandedNodes = ref([]);
    const characters = ref([]);
    const locations = ref([]);
    const showNodeDialog = ref(false);
    const editingNode = ref(null);
    const parentNodeId = ref(null);
    const generating = ref(false);
    const currentEventId = ref(null);
    const generatingContent = ref("");
    const loading = ref(false);
    const nodeForm = ref({
      name: "",
      nodeType: "volume",
      summary: "",
      estimatedWords: 0,
      involvedCharacters: [],
      involvedLocations: [],
      status: "pending"
    });
    const rootNodes = computed(() => {
      return outlineNodes.value.filter((n) => !n.parentId).sort((a, b) => a.orderIndex - b.orderIndex);
    });
    function getChildren(parentId) {
      return outlineNodes.value.filter((n) => n.parentId === parentId).sort((a, b) => a.orderIndex - b.orderIndex);
    }
    function hasChildren(nodeId) {
      return outlineNodes.value.some((n) => n.parentId === nodeId);
    }
    function toggleExpand(nodeId) {
      const index2 = expandedNodes.value.indexOf(nodeId);
      if (index2 === -1) {
        expandedNodes.value.push(nodeId);
      } else {
        expandedNodes.value.splice(index2, 1);
      }
    }
    function getNodeTypeName(type) {
      const names = {
        volume: "卷",
        chapter: "章",
        section: "节"
      };
      return names[type] || type;
    }
    function getStatusName(status) {
      const names = {
        pending: "待写",
        progressing: "进行中",
        completed: "已完成"
      };
      return names[status] || status;
    }
    function addRootNode() {
      parentNodeId.value = null;
      editingNode.value = null;
      nodeForm.value = {
        name: "",
        nodeType: "volume",
        summary: "",
        estimatedWords: 0,
        involvedCharacters: [],
        involvedLocations: [],
        status: "pending"
      };
      showNodeDialog.value = true;
    }
    function addChildNode(parent) {
      parentNodeId.value = parent.id;
      let childType = "chapter";
      if (parent.nodeType === "chapter") {
        childType = "section";
      }
      editingNode.value = null;
      nodeForm.value = {
        name: "",
        nodeType: childType,
        summary: "",
        estimatedWords: 0,
        involvedCharacters: [],
        involvedLocations: [],
        status: "pending"
      };
      showNodeDialog.value = true;
    }
    function editNode(node) {
      editingNode.value = node;
      parentNodeId.value = node.parentId || null;
      nodeForm.value = {
        name: node.name,
        nodeType: node.nodeType,
        summary: node.summary,
        estimatedWords: node.estimatedWords,
        involvedCharacters: node.involvedCharacters,
        involvedLocations: node.involvedLocations,
        status: node.status
      };
      showNodeDialog.value = true;
    }
    async function deleteNode(id) {
      const node = outlineNodes.value.find((n) => n.id === id);
      if (!node) return;
      const hasChildrenNodes = hasChildren(id);
      try {
        let collectChildren = function(parentId) {
          outlineNodes.value.forEach((n) => {
            if (n.parentId === parentId && !toDelete.includes(n.id)) {
              toDelete.push(n.id);
              collectChildren(n.id);
            }
          });
        };
        await ElMessageBox.confirm(
          hasChildrenNodes ? "该节点有子节点，删除将一并删除所有子节点，确定要删除吗？" : "确定要删除该节点吗？",
          "删除节点",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const toDelete = [id];
        collectChildren(id);
        for (const deleteId of toDelete.reverse()) {
          await window.electronAPI.longwriting.deleteOutline(deleteId);
        }
        await loadOutlineTree();
        expandedNodes.value = expandedNodes.value.filter((eId) => !toDelete.includes(eId));
        ElMessage.success("节点已删除");
        updateProgress();
      } catch {
      }
    }
    async function saveNode() {
      if (!nodeForm.value.name) {
        ElMessage.warning("请输入节点名称");
        return;
      }
      const formData = JSON.parse(JSON.stringify(nodeForm.value));
      if (editingNode.value) {
        const result = await window.electronAPI.longwriting.updateOutline(editingNode.value.id, {
          name: formData.name,
          nodeType: formData.nodeType,
          summary: formData.summary,
          estimatedWords: formData.estimatedWords,
          involvedCharacters: formData.involvedCharacters,
          involvedLocations: formData.involvedLocations,
          status: formData.status
        });
        if (result.success) {
          await loadOutlineTree();
          ElMessage.success("节点已更新");
        } else {
          ElMessage.error(result.error || "更新失败");
        }
      } else {
        const siblings = parentNodeId.value ? getChildren(parentNodeId.value) : rootNodes.value;
        const newLevel = parentNodeId.value ? (outlineNodes.value.find((n) => n.id === parentNodeId.value)?.level || 0) + 1 : 1;
        const result = await window.electronAPI.longwriting.createOutline({
          projectId: props.projectId,
          parentId: parentNodeId.value || void 0,
          name: formData.name,
          level: newLevel,
          nodeType: formData.nodeType,
          summary: formData.summary,
          involvedCharacters: formData.involvedCharacters,
          involvedLocations: formData.involvedLocations,
          status: formData.status,
          estimatedWords: formData.estimatedWords,
          orderIndex: siblings.length
        });
        if (result.success) {
          await loadOutlineTree();
          ElMessage.success("节点已添加");
          if (parentNodeId.value && !expandedNodes.value.includes(parentNodeId.value)) {
            expandedNodes.value.push(parentNodeId.value);
          }
        } else {
          ElMessage.error(result.error || "添加失败");
        }
      }
      showNodeDialog.value = false;
      resetNodeForm();
      updateProgress();
    }
    function resetNodeForm() {
      editingNode.value = null;
      parentNodeId.value = null;
      nodeForm.value = {
        name: "",
        nodeType: "volume",
        summary: "",
        estimatedWords: 0,
        involvedCharacters: [],
        involvedLocations: [],
        status: "pending"
      };
    }
    async function generateOutline() {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      console.log("[OutlineStage] 生成大纲, providerId:", selectedModel.value.providerId, "modelId:", selectedModel.value.modelId);
      generating.value = true;
      generatingContent.value = "准备生成大纲...";
      currentEventId.value = `outline-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "progress" && event.content) {
            generatingContent.value = event.content;
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      try {
        const result = await window.electronAPI.longwriting.generateOutlineStory(
          currentEventId.value,
          props.projectId,
          selectedModel.value.providerId,
          selectedModel.value.modelId
        );
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        if (!result.success) {
          ElMessage.error(result.error || "生成失败");
        } else if (result.data && result.data.length > 0) {
          showOutlineConfirm(result.data);
        } else {
          ElMessage.error("生成结果为空");
        }
      } catch (error) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error("生成失败: " + error);
      }
    }
    async function showOutlineConfirm(suggestedOutline) {
      if (!Array.isArray(suggestedOutline) || suggestedOutline.length === 0) {
        ElMessage.warning("AI 未生成大纲建议");
        return;
      }
      ElMessageBox.confirm(
        `AI 建议生成以下大纲结构：

${suggestedOutline.map((o) => `- ${o.name}（预估${o.estimatedWords || 0}字）`).join("\n")}`,
        "AI 生成建议",
        {
          confirmButtonText: "采纳建议",
          cancelButtonText: "取消",
          type: "info"
        }
      ).then(async () => {
        console.log("开始创建大纲，建议数据:", suggestedOutline);
        try {
          for (let i = 0; i < suggestedOutline.length; i++) {
            const volume = suggestedOutline[i];
            console.log("创建卷:", volume.name);
            const volumeResult = await window.electronAPI.longwriting.createOutline({
              projectId: props.projectId,
              name: volume.name,
              level: 1,
              nodeType: "volume",
              summary: volume.summary || "",
              estimatedWords: volume.estimatedWords || 0,
              involvedCharacters: [],
              involvedLocations: [],
              status: "pending",
              orderIndex: i
            });
            console.log("卷创建结果:", volumeResult);
            if (volumeResult.success && volume.chapters && Array.isArray(volume.chapters)) {
              const volumeId = volumeResult.data.id;
              for (let j = 0; j < volume.chapters.length; j++) {
                const chapter = volume.chapters[j];
                const chapterResult = await window.electronAPI.longwriting.createOutline({
                  projectId: props.projectId,
                  parentId: volumeId,
                  name: chapter.name,
                  level: 2,
                  nodeType: "chapter",
                  summary: chapter.summary || "",
                  estimatedWords: chapter.estimatedWords || 0,
                  involvedCharacters: [],
                  involvedLocations: [],
                  status: "pending",
                  orderIndex: j
                });
                console.log("章创建结果:", chapterResult);
                if (chapterResult.success && chapter.sections && Array.isArray(chapter.sections)) {
                  const chapterId = chapterResult.data.id;
                  for (let k = 0; k < chapter.sections.length; k++) {
                    const section = chapter.sections[k];
                    await window.electronAPI.longwriting.createOutline({
                      projectId: props.projectId,
                      parentId: chapterId,
                      name: section.name,
                      level: 3,
                      nodeType: "section",
                      summary: section.summary || "",
                      estimatedWords: section.estimatedWords || 0,
                      involvedCharacters: [],
                      involvedLocations: [],
                      status: "pending",
                      orderIndex: k
                    });
                  }
                }
              }
            }
          }
          console.log("大纲创建完成，重新加载...");
          await loadOutlineTree();
          console.log("大纲树加载完成:", outlineNodes.value);
          updateProgress();
          ElMessage.success("大纲已生成");
        } catch (error) {
          console.error("创建大纲失败:", error);
          ElMessage.error("创建大纲失败: " + error);
        }
      }).catch((err) => {
        console.log("用户取消或出错:", err);
      });
    }
    function cancelGeneration() {
      if (!currentEventId.value) return;
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    function updateProgress() {
      const completedCount = outlineNodes.value.filter((n) => n.status === "completed").length;
      const total = outlineNodes.value.length;
      const progress = Math.min(75, 65 + Math.floor(completedCount / Math.max(total, 1) * 10));
      emit("update:progress", progress);
    }
    async function loadOutlineTree() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId);
      if (result.success) {
        outlineNodes.value = result.data || [];
      }
    }
    async function loadCharacters() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getCharacters(props.projectId);
      if (result.success) {
        characters.value = result.data || [];
      }
    }
    async function loadLocations() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getLocations(props.projectId);
      if (result.success) {
        locations.value = result.data || [];
      }
    }
    async function loadReferences() {
      loading.value = true;
      await Promise.all([
        loadOutlineTree(),
        loadCharacters(),
        loadLocations()
      ]);
      loading.value = false;
      updateProgress();
    }
    onMounted(() => {
      loadReferences();
    });
    watch(() => props.projectId, () => {
      loadReferences();
    });
    return (_ctx, _cache) => {
      const _component_el_button = resolveComponent("el-button");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_radio = resolveComponent("el-radio");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        _cache[26] || (_cache[26] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "大纲设计"),
          createBaseVNode("p", { class: "stage-desc" }, "设计故事结构大纲，支持多层级嵌套（卷/章/节）")
        ], -1)),
        createBaseVNode("div", _hoisted_2$3, [
          createBaseVNode("div", _hoisted_3$3, [
            outlineNodes.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_4$3, [
              createVNode(_component_el_empty, { description: "暂无大纲" }, {
                default: withCtx(() => [
                  createVNode(_component_el_button, {
                    type: "primary",
                    onClick: addRootNode
                  }, {
                    default: withCtx(() => [..._cache[9] || (_cache[9] = [
                      createTextVNode("添加第一卷", -1)
                    ])]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(rootNodes.value, (node) => {
                return openBlock(), createElementBlock("div", {
                  key: node.id,
                  class: "outline-node volume-node"
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["node-header", { expanded: expandedNodes.value.includes(node.id), clickable: hasChildren(node.id) }]),
                    onClick: ($event) => hasChildren(node.id) && toggleExpand(node.id)
                  }, [
                    createBaseVNode("div", {
                      class: "node-expand",
                      onClick: withModifiers(($event) => toggleExpand(node.id), ["stop"])
                    }, [
                      hasChildren(node.id) ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                        default: withCtx(() => [
                          !expandedNodes.value.includes(node.id) ? (openBlock(), createBlock(unref(arrow_right_default), { key: 0 })) : (openBlock(), createBlock(unref(arrow_down_default), { key: 1 }))
                        ]),
                        _: 2
                      }, 1024)) : createCommentVNode("", true)
                    ], 8, _hoisted_6$3),
                    createBaseVNode("div", _hoisted_7$3, [
                      createBaseVNode("span", _hoisted_8$3, toDisplayString(getNodeTypeName(node.nodeType)), 1),
                      createBaseVNode("h4", null, toDisplayString(node.name), 1),
                      createBaseVNode("span", {
                        class: normalizeClass(["node-status", node.status])
                      }, toDisplayString(getStatusName(node.status)), 3)
                    ]),
                    createBaseVNode("div", _hoisted_9$3, [
                      node.estimatedWords ? (openBlock(), createElementBlock("span", _hoisted_10$3, toDisplayString(node.estimatedWords) + "字", 1)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_11$3, [
                      createVNode(_component_el_button, {
                        text: "",
                        size: "small",
                        onClick: ($event) => addChildNode(node)
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(plus_default))
                            ]),
                            _: 1
                          }),
                          _cache[10] || (_cache[10] = createTextVNode(" 添加子节点 ", -1))
                        ]),
                        _: 1
                      }, 8, ["onClick"]),
                      createVNode(_component_el_button, {
                        text: "",
                        size: "small",
                        onClick: ($event) => editNode(node)
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(edit_default))
                            ]),
                            _: 1
                          }),
                          _cache[11] || (_cache[11] = createTextVNode(" 编辑 ", -1))
                        ]),
                        _: 1
                      }, 8, ["onClick"]),
                      createVNode(_component_el_button, {
                        text: "",
                        size: "small",
                        type: "danger",
                        onClick: ($event) => deleteNode(node.id)
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
                  ], 10, _hoisted_5$3),
                  expandedNodes.value.includes(node.id) ? (openBlock(), createElementBlock("div", _hoisted_12$3, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(getChildren(node.id), (child) => {
                      return openBlock(), createElementBlock("div", {
                        key: child.id,
                        class: "outline-node chapter-node"
                      }, [
                        createBaseVNode("div", {
                          class: normalizeClass(["node-header", { expanded: expandedNodes.value.includes(child.id), clickable: hasChildren(child.id) }]),
                          onClick: ($event) => hasChildren(child.id) && toggleExpand(child.id)
                        }, [
                          createBaseVNode("div", {
                            class: "node-expand",
                            onClick: withModifiers(($event) => toggleExpand(child.id), ["stop"])
                          }, [
                            hasChildren(child.id) ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                              default: withCtx(() => [
                                !expandedNodes.value.includes(child.id) ? (openBlock(), createBlock(unref(arrow_right_default), { key: 0 })) : (openBlock(), createBlock(unref(arrow_down_default), { key: 1 }))
                              ]),
                              _: 2
                            }, 1024)) : createCommentVNode("", true)
                          ], 8, _hoisted_14$3),
                          createBaseVNode("div", _hoisted_15$3, [
                            createBaseVNode("span", _hoisted_16$3, toDisplayString(getNodeTypeName(child.nodeType)), 1),
                            createBaseVNode("h4", null, toDisplayString(child.name), 1),
                            createBaseVNode("span", {
                              class: normalizeClass(["node-status", child.status])
                            }, toDisplayString(getStatusName(child.status)), 3)
                          ]),
                          createBaseVNode("div", _hoisted_17$3, [
                            child.estimatedWords ? (openBlock(), createElementBlock("span", _hoisted_18$2, toDisplayString(child.estimatedWords) + "字", 1)) : createCommentVNode("", true),
                            child.involvedCharacters.length > 0 ? (openBlock(), createBlock(_component_el_tag, {
                              key: 1,
                              size: "small",
                              class: "char-tag"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(child.involvedCharacters.length) + "角色 ", 1)
                              ]),
                              _: 2
                            }, 1024)) : createCommentVNode("", true)
                          ]),
                          createBaseVNode("div", _hoisted_19$2, [
                            createVNode(_component_el_button, {
                              text: "",
                              size: "small",
                              onClick: ($event) => addChildNode(child)
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_icon, null, {
                                  default: withCtx(() => [
                                    createVNode(unref(plus_default))
                                  ]),
                                  _: 1
                                }),
                                _cache[12] || (_cache[12] = createTextVNode(" 添加小节 ", -1))
                              ]),
                              _: 1
                            }, 8, ["onClick"]),
                            createVNode(_component_el_button, {
                              text: "",
                              size: "small",
                              onClick: ($event) => editNode(child)
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_icon, null, {
                                  default: withCtx(() => [
                                    createVNode(unref(edit_default))
                                  ]),
                                  _: 1
                                })
                              ]),
                              _: 1
                            }, 8, ["onClick"]),
                            createVNode(_component_el_button, {
                              text: "",
                              size: "small",
                              type: "danger",
                              onClick: ($event) => deleteNode(child.id)
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
                        ], 10, _hoisted_13$3),
                        expandedNodes.value.includes(child.id) ? (openBlock(), createElementBlock("div", _hoisted_20$2, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(getChildren(child.id), (section) => {
                            return openBlock(), createElementBlock("div", {
                              key: section.id,
                              class: "outline-node section-node"
                            }, [
                              createBaseVNode("div", _hoisted_21$2, [
                                _cache[13] || (_cache[13] = createBaseVNode("div", { class: "node-expand" }, null, -1)),
                                createBaseVNode("div", _hoisted_22$2, [
                                  createBaseVNode("span", _hoisted_23$2, toDisplayString(getNodeTypeName(section.nodeType)), 1),
                                  createBaseVNode("h4", null, toDisplayString(section.name), 1),
                                  createBaseVNode("span", {
                                    class: normalizeClass(["node-status", section.status])
                                  }, toDisplayString(getStatusName(section.status)), 3)
                                ]),
                                createBaseVNode("div", _hoisted_24$2, [
                                  section.estimatedWords ? (openBlock(), createElementBlock("span", _hoisted_25$2, toDisplayString(section.estimatedWords) + "字", 1)) : createCommentVNode("", true)
                                ]),
                                createBaseVNode("div", _hoisted_26$2, [
                                  createVNode(_component_el_button, {
                                    text: "",
                                    size: "small",
                                    onClick: ($event) => editNode(section)
                                  }, {
                                    default: withCtx(() => [
                                      createVNode(_component_el_icon, null, {
                                        default: withCtx(() => [
                                          createVNode(unref(edit_default))
                                        ]),
                                        _: 1
                                      })
                                    ]),
                                    _: 1
                                  }, 8, ["onClick"]),
                                  createVNode(_component_el_button, {
                                    text: "",
                                    size: "small",
                                    type: "danger",
                                    onClick: ($event) => deleteNode(section.id)
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
                              ])
                            ]);
                          }), 128))
                        ])) : createCommentVNode("", true)
                      ]);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ]);
              }), 128)),
              createVNode(_component_el_button, {
                type: "primary",
                plain: "",
                class: "add-btn",
                onClick: addRootNode
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(plus_default))
                    ]),
                    _: 1
                  }),
                  _cache[14] || (_cache[14] = createTextVNode(" 添加新卷 ", -1))
                ]),
                _: 1
              })
            ], 64))
          ]),
          createBaseVNode("div", _hoisted_27$2, [
            !generating.value ? (openBlock(), createBlock(_component_el_button, {
              key: 0,
              type: "primary",
              size: "large",
              onClick: generateOutline
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(magic_stick_default))
                  ]),
                  _: 1
                }),
                _cache[15] || (_cache[15] = createTextVNode(" AI 生成大纲建议 ", -1))
              ]),
              _: 1
            })) : (openBlock(), createBlock(_component_el_button, {
              key: 1,
              type: "danger",
              size: "large",
              onClick: cancelGeneration
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(close_default))
                  ]),
                  _: 1
                }),
                _cache[16] || (_cache[16] = createTextVNode(" 取消生成 ", -1))
              ]),
              _: 1
            }))
          ]),
          generating.value ? (openBlock(), createElementBlock("div", _hoisted_28$2, [
            createVNode(_component_el_progress, {
              percentage: 100,
              indeterminate: true
            }),
            _cache[17] || (_cache[17] = createBaseVNode("p", { class: "progress-text" }, "AI 正在生成大纲...", -1))
          ])) : createCommentVNode("", true)
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showNodeDialog.value,
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => showNodeDialog.value = $event),
          title: editingNode.value ? "编辑大纲节点" : "添加大纲节点",
          width: "600px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[7] || (_cache[7] = ($event) => showNodeDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[24] || (_cache[24] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveNode
            }, {
              default: withCtx(() => [..._cache[25] || (_cache[25] = [
                createTextVNode("保存", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: nodeForm.value,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "节点名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: nodeForm.value.name,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => nodeForm.value.name = $event),
                      placeholder: "输入节点名称，如：第一卷 少年崛起"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "节点类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_radio_group, {
                      modelValue: nodeForm.value.nodeType,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => nodeForm.value.nodeType = $event),
                      disabled: !!editingNode.value
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio, { value: "volume" }, {
                          default: withCtx(() => [..._cache[18] || (_cache[18] = [
                            createTextVNode("卷", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "chapter" }, {
                          default: withCtx(() => [..._cache[19] || (_cache[19] = [
                            createTextVNode("章", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "section" }, {
                          default: withCtx(() => [..._cache[20] || (_cache[20] = [
                            createTextVNode("节", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue", "disabled"]),
                    editingNode.value ? (openBlock(), createElementBlock("span", _hoisted_29$2, "节点类型不可修改")) : createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "节点概要" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: nodeForm.value.summary,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => nodeForm.value.summary = $event),
                      type: "textarea",
                      rows: 4,
                      placeholder: "描述本节点的主要内容..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "预估字数" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: nodeForm.value.estimatedWords,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => nodeForm.value.estimatedWords = $event),
                      min: 0,
                      step: 500
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "涉及角色" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: nodeForm.value.involvedCharacters,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => nodeForm.value.involvedCharacters = $event),
                      multiple: "",
                      placeholder: "选择涉及的角色"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(characters.value, (char) => {
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
                createVNode(_component_el_form_item, { label: "涉及地点" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: nodeForm.value.involvedLocations,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => nodeForm.value.involvedLocations = $event),
                      multiple: "",
                      placeholder: "选择涉及的地点"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(locations.value, (loc) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: loc.id,
                            label: loc.name,
                            value: loc.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "状态" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_radio_group, {
                      modelValue: nodeForm.value.status,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => nodeForm.value.status = $event),
                      disabled: !!editingNode.value
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio, { value: "pending" }, {
                          default: withCtx(() => [..._cache[21] || (_cache[21] = [
                            createTextVNode("待写", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "progressing" }, {
                          default: withCtx(() => [..._cache[22] || (_cache[22] = [
                            createTextVNode("进行中", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "completed" }, {
                          default: withCtx(() => [..._cache[23] || (_cache[23] = [
                            createTextVNode("已完成", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue", "disabled"]),
                    editingNode.value ? (openBlock(), createElementBlock("span", _hoisted_30$2, "状态在章节写作阶段自动更新")) : createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"])
      ]);
    };
  }
});
const OutlineStage = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-b34d2135"]]);
const _hoisted_1$2 = { class: "chapter-stage" };
const _hoisted_2$2 = { class: "stage-header" };
const _hoisted_3$2 = { class: "stage-content" };
const _hoisted_4$2 = { class: "chapter-layout" };
const _hoisted_5$2 = { class: "outline-tree-panel" };
const _hoisted_6$2 = { class: "tree-header" };
const _hoisted_7$2 = { class: "node-name" };
const _hoisted_8$2 = {
  key: 0,
  class: "empty-chapter"
};
const _hoisted_9$2 = {
  key: 1,
  class: "single-chapter-container"
};
const _hoisted_10$2 = {
  key: 0,
  class: "chapter-nav"
};
const _hoisted_11$2 = { class: "chapter-position" };
const _hoisted_12$2 = { class: "chapter-title-bar" };
const _hoisted_13$2 = { class: "title-left" };
const _hoisted_14$2 = { class: "chapter-type" };
const _hoisted_15$2 = { class: "chapter-title" };
const _hoisted_16$2 = {
  key: 0,
  class: "word-count"
};
const _hoisted_17$2 = {
  key: 1,
  class: "preview-hint"
};
const _hoisted_18$1 = { class: "title-actions" };
const _hoisted_19$1 = {
  key: 0,
  class: "chapter-info"
};
const _hoisted_20$1 = {
  key: 0,
  class: "chapter-summary"
};
const _hoisted_21$1 = {
  key: 1,
  class: "chapter-tags"
};
const _hoisted_22$1 = {
  key: 1,
  class: "chapter-editor-wrapper"
};
const _hoisted_23$1 = {
  key: 2,
  class: "chapter-preview-wrapper"
};
const _hoisted_24$1 = ["innerHTML"];
const _hoisted_25$1 = {
  key: 0,
  class: "prewrite-section"
};
const _hoisted_26$1 = { class: "prewrite-header" };
const _hoisted_27$1 = { class: "prewrite-content" };
const _hoisted_28$1 = {
  key: 1,
  class: "prewrite-streaming"
};
const _hoisted_29$1 = {
  key: 0,
  class: "memory-stats-hint"
};
const _hoisted_30$1 = {
  key: 1,
  class: "prewrite-loading"
};
const _hoisted_31$1 = { class: "version-list" };
const _hoisted_32$1 = { class: "version-info" };
const _hoisted_33 = { class: "version-number" };
const _hoisted_34 = { class: "version-date" };
const _hoisted_35 = { class: "version-words" };
const _hoisted_36 = { class: "version-actions" };
const _hoisted_37 = { class: "preview-content" };
const _hoisted_38 = {
  key: 0,
  class: "memory-extracting"
};
const _hoisted_39 = {
  key: 1,
  class: "memory-list"
};
const _hoisted_40 = { class: "memory-header" };
const _hoisted_41 = { class: "dialog-content-scroll" };
const _hoisted_42 = {
  key: 0,
  class: "memory-extracting"
};
const _hoisted_43 = {
  key: 1,
  class: "memory-list"
};
const _hoisted_44 = { class: "memory-header" };
const _hoisted_45 = { class: "entity-name" };
const _hoisted_46 = {
  key: 0,
  class: "key-changes"
};
const _hoisted_47 = { class: "dialog-content-scroll" };
const _hoisted_48 = {
  key: 0,
  class: "memory-extracting"
};
const _hoisted_49 = {
  key: 1,
  class: "memory-list"
};
const _hoisted_50 = { class: "memory-header" };
const _hoisted_51 = { class: "entity-name" };
const _hoisted_52 = { class: "state-summary-display" };
const _hoisted_53 = {
  key: 0,
  class: "key-changes"
};
const _hoisted_54 = { class: "dialog-content-scroll" };
const _hoisted_55 = {
  key: 0,
  class: "entity-section"
};
const _hoisted_56 = { class: "entity-header" };
const _hoisted_57 = { class: "entity-name" };
const _hoisted_58 = { class: "entity-description" };
const _hoisted_59 = {
  key: 0,
  class: "entity-reason"
};
const _hoisted_60 = {
  key: 1,
  class: "entity-section"
};
const _hoisted_61 = { class: "entity-header" };
const _hoisted_62 = { class: "entity-name" };
const _hoisted_63 = { class: "entity-description" };
const _hoisted_64 = {
  key: 0,
  class: "entity-reason"
};
const _hoisted_65 = {
  key: 2,
  class: "entity-section"
};
const _hoisted_66 = { class: "entity-header" };
const _hoisted_67 = { class: "entity-name" };
const _hoisted_68 = { class: "entity-description" };
const _hoisted_69 = {
  key: 0,
  class: "entity-reason"
};
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "ChapterStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    useRouter();
    const selectedModel = inject("selectedModel", computed(() => null));
    const outlineNodes = ref([]);
    const characters = ref([]);
    const locations = ref([]);
    const activeOutlineId = ref("");
    const chapterContentMap = ref({});
    const chapterIdMap = ref({});
    const chaptersPanelRef = ref(null);
    const versions = ref([]);
    const showVersionDialog = ref(false);
    const showPreviewDialog = ref(false);
    const showGenerateDialog = ref(false);
    const previewContent = ref("");
    const currentOutlineForAction = ref(null);
    const generatingMap = ref({});
    const generatingEventIdMap = ref({});
    const savingMap = ref({});
    const autoSave = ref(true);
    const saveTimers = {};
    const lastSavedContent = {};
    const loading = ref(false);
    const generateForm = ref({
      targetWords: 3e3,
      style: "",
      extraPrompt: ""
    });
    const prewriting = ref(false);
    const prewriteContent = ref("");
    const prewriteSaving = ref(false);
    const currentPrewrite = ref(null);
    const extractedMemories = ref([]);
    const showMemoryDialog = ref(false);
    const memoryExtracting = ref(false);
    const memoryStats = ref(null);
    const snapshotStats = ref(null);
    const showStateExtractDialog = ref(false);
    const extractingStates = ref(false);
    const extractedStates = ref([]);
    const showViewStateDialog = ref(false);
    const loadingChapterStates = ref(false);
    const chapterStates = ref([]);
    const currentViewStateOutlineId = ref("");
    const showNewEntitiesDialog = ref(false);
    const detectedNewEntities = ref(null);
    const addingEntities = ref(false);
    const treeProps = {
      children: "children",
      label: "name"
    };
    const treeRef = ref(null);
    const outlineTreeData = computed(() => {
      return buildOutlineTree(outlineNodes.value);
    });
    const allOutlines = computed(() => {
      const leafNodes = outlineNodes.value.filter((n) => isLeafNode(n.id));
      const orderedIds = [];
      function collectLeafIds(nodes) {
        for (const node of nodes) {
          if (isLeafNode(node.id)) {
            orderedIds.push(node.id);
          } else if (node.children && node.children.length > 0) {
            collectLeafIds(node.children);
          }
        }
      }
      collectLeafIds(outlineTreeData.value);
      return orderedIds.map((id) => leafNodes.find((n) => n.id === id)).filter(Boolean);
    });
    function isLeafNode(nodeId) {
      return !outlineNodes.value.some((n) => n.parentId === nodeId);
    }
    function getLeafChildren(nodeId) {
      const result = [];
      const node = outlineNodes.value.find((n) => n.id === nodeId);
      if (!node) return result;
      if (isLeafNode(nodeId)) {
        result.push(nodeId);
      } else {
        const children = outlineNodes.value.filter((n) => n.parentId === nodeId);
        for (const child of children) {
          result.push(...getLeafChildren(child.id));
        }
      }
      return result;
    }
    const isEditableNode = computed(() => {
      if (!activeOutlineId.value) return false;
      return isLeafNode(activeOutlineId.value);
    });
    const nodePreviewContent = computed(() => {
      if (!activeOutlineId.value) return "";
      const leafIds = getLeafChildren(activeOutlineId.value);
      const parts = [];
      for (const leafId of leafIds) {
        const node = outlineNodes.value.find((n) => n.id === leafId);
        const content = chapterContentMap.value[leafId] || "";
        if (node && content) {
          parts.push(`## ${node.name}

${content}`);
        }
      }
      return parts.join("\n\n---\n\n");
    });
    function renderMarkdown(content) {
      if (!content) return "";
      return g(content);
    }
    const currentChapterIndex = computed(() => {
      if (!activeOutlineId.value) return 0;
      return allOutlines.value.findIndex((o) => o.id === activeOutlineId.value);
    });
    const currentNode = computed(() => {
      if (!activeOutlineId.value) return null;
      return outlineNodes.value.find((n) => n.id === activeOutlineId.value) || null;
    });
    const currentChapter = computed(() => {
      if (!activeOutlineId.value) return null;
      if (isLeafNode(activeOutlineId.value)) {
        return outlineNodes.value.find((n) => n.id === activeOutlineId.value) || null;
      }
      return null;
    });
    function prevChapter() {
      if (currentChapterIndex.value > 0) {
        const prevOutline = allOutlines.value[currentChapterIndex.value - 1];
        activeOutlineId.value = prevOutline.id;
        treeRef.value?.setCurrentKey(prevOutline.id);
      }
    }
    function nextChapter() {
      if (currentChapterIndex.value < allOutlines.value.length - 1) {
        const nextOutline = allOutlines.value[currentChapterIndex.value + 1];
        activeOutlineId.value = nextOutline.id;
        treeRef.value?.setCurrentKey(nextOutline.id);
      }
    }
    function buildOutlineTree(nodes) {
      const nodeMap = /* @__PURE__ */ new Map();
      const rootNodes = [];
      for (const node of nodes) {
        nodeMap.set(node.id, {
          ...node,
          children: []
        });
      }
      for (const node of nodes) {
        const treeNode = nodeMap.get(node.id);
        if (node.parentId && nodeMap.has(node.parentId)) {
          const parent = nodeMap.get(node.parentId);
          parent.children.push(treeNode);
        } else {
          rootNodes.push(treeNode);
        }
      }
      return rootNodes;
    }
    function collapseAll() {
      const nodes = treeRef.value?.store?.nodesMap;
      if (nodes) {
        for (const key in nodes) {
          nodes[key].expanded = false;
        }
      }
    }
    function handleNodeClick(data) {
      activeOutlineId.value = data.id;
      treeRef.value?.setCurrentKey(data.id);
    }
    function getNodeTypeName(type) {
      const names = {
        volume: "卷",
        chapter: "章",
        section: "节"
      };
      return type ? names[type] : "节";
    }
    function getStatusName(status) {
      const names = {
        pending: "待写",
        progressing: "进行中",
        completed: "已完成"
      };
      return status ? names[status] : "待写";
    }
    function getStatusType(status) {
      const types = {
        pending: "info",
        progressing: "warning",
        completed: "success"
      };
      return status ? types[status] : "info";
    }
    function getCharacterName(id) {
      const char = characters.value.find((c) => c.id === id);
      return char?.name || "未知角色";
    }
    function getLocationName(id) {
      const loc = locations.value.find((l) => l.id === id);
      return loc?.name || "未知地点";
    }
    function formatDate(timestamp) {
      return new Date(timestamp).toLocaleString("zh-CN");
    }
    function getChapterWordCount(outlineId) {
      return chapterContentMap.value[outlineId]?.length || 0;
    }
    function getEditorPlaceholder(outline) {
      return `编写「${outline.name}」的内容，或点击"AI 生成"自动生成...`;
    }
    async function loadAllChapters() {
      if (allOutlines.value.length === 0) return;
      const outlineIds = allOutlines.value.map((o) => o.id);
      const result = await window.electronAPI.longwriting.getChaptersByOutlineIds(outlineIds);
      if (result.success && result.data) {
        for (const outlineId of outlineIds) {
          const chapter = result.data[outlineId];
          if (chapter) {
            chapterIdMap.value[outlineId] = chapter.id;
            chapterContentMap.value[outlineId] = chapter.content || "";
            lastSavedContent[outlineId] = chapter.content || "";
          } else {
            chapterIdMap.value[outlineId] = "";
            chapterContentMap.value[outlineId] = "";
            lastSavedContent[outlineId] = "";
          }
        }
      }
    }
    async function loadVersions(chapterId) {
      const result = await window.electronAPI.longwriting.getChapterVersions(chapterId);
      if (result.success) {
        versions.value = result.data || [];
      }
    }
    async function saveChapter(outlineId) {
      const content = chapterContentMap.value[outlineId];
      if (content === void 0) return;
      savingMap.value[outlineId] = true;
      try {
        const result = await window.electronAPI.longwriting.saveChapter(outlineId, content);
        if (result.success) {
          chapterIdMap.value[outlineId] = result.data.id;
          ElMessage.success("章节已保存");
          const outline = outlineNodes.value.find((n) => n.id === outlineId);
          if (outline && outline.status === "pending") {
            await window.electronAPI.longwriting.updateOutline(outlineId, { status: "progressing" });
            await loadOutlineTree();
          }
          updateProgress();
        } else {
          ElMessage.error(result.error || "保存失败");
        }
      } finally {
        savingMap.value[outlineId] = false;
      }
    }
    async function startGenerate(outline) {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先在顶部选择 AI 模型");
        return;
      }
      currentOutlineForAction.value = outline;
      generateForm.value.targetWords = outline.estimatedWords || 3e3;
      prewriteContent.value = "";
      currentPrewrite.value = null;
      try {
        const result = await window.electronAPI.longwriting.getPrewrite(outline.id);
        if (result.success && result.data) {
          currentPrewrite.value = result.data;
          prewriteContent.value = result.data.content || "";
        }
      } catch (error) {
        console.error("加载预写失败:", error);
      }
      await loadMemoryStats();
      showGenerateDialog.value = true;
    }
    function clearPrewrite() {
      prewriteContent.value = "";
    }
    async function generatePrewrite() {
      if (!currentOutlineForAction.value || !selectedModel.value) return;
      prewriting.value = true;
      prewriteContent.value = "";
      const outline = currentOutlineForAction.value;
      const eventId = `prewrite-${outline.id}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        eventId,
        (event) => {
          if (event.type === "content" && event.content) {
            prewriteContent.value += event.content;
          } else if (event.type === "done") {
            prewriting.value = false;
            unsubscribe();
          } else if (event.type === "error") {
            prewriting.value = false;
            ElMessage.error(event.error || "预写生成失败");
            unsubscribe();
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateChapterPrewrite(
        eventId,
        props.projectId,
        outline.id,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        prewriting.value = false;
        unsubscribe();
        ElMessage.error(result.error || "预写生成失败");
      }
    }
    async function savePrewriteOnly() {
      if (!currentOutlineForAction.value || !prewriteContent.value) return;
      prewriteSaving.value = true;
      try {
        const result = await window.electronAPI.longwriting.savePrewrite({
          outlineId: currentOutlineForAction.value.id,
          content: prewriteContent.value
        });
        if (result.success) {
          currentPrewrite.value = result.data;
          ElMessage.success("预写已保存");
        } else {
          ElMessage.error(result.error || "保存失败");
        }
      } catch (error) {
        ElMessage.error("保存失败：" + error.message);
      } finally {
        prewriteSaving.value = false;
      }
    }
    async function confirmPrewriteAndExtract() {
      if (!currentOutlineForAction.value || !prewriteContent.value) return;
      prewriteSaving.value = true;
      try {
        const saveResult = await window.electronAPI.longwriting.savePrewrite({
          outlineId: currentOutlineForAction.value.id,
          content: prewriteContent.value
        });
        if (!saveResult.success) {
          ElMessage.error(saveResult.error || "保存预写失败");
          return;
        }
        currentPrewrite.value = saveResult.data;
      } catch (error) {
        ElMessage.error("保存预写失败：" + error.message);
        return;
      } finally {
        prewriteSaving.value = false;
      }
      showMemoryDialog.value = true;
      memoryExtracting.value = true;
      extractedMemories.value = [];
      try {
        const chapterNumber = calculateChapterNumber(currentOutlineForAction.value.id);
        const result = await window.electronAPI.longwriting.extractMemories(
          props.projectId,
          currentOutlineForAction.value.id,
          prewriteContent.value,
          chapterNumber,
          selectedModel.value?.providerId,
          selectedModel.value?.modelId
        );
        if (result.success && result.data) {
          extractedMemories.value = result.data.map((m) => ({
            memoryType: ["character_event", "location_event", "item_event", "relationship_change", "faction_event", "general"].includes(m.memoryType) ? m.memoryType : "general",
            title: m.title || "未命名事件",
            description: m.description || "",
            involvedEntities: Array.isArray(m.involvedEntities) ? m.involvedEntities : [],
            importance: ["critical", "normal", "minor"].includes(m.importance) ? m.importance : "normal"
          }));
        } else {
          ElMessage.error(result.error || "提取记忆失败");
        }
      } catch (error) {
        ElMessage.error("提取记忆失败：" + error.message);
      } finally {
        memoryExtracting.value = false;
      }
    }
    function calculateChapterNumber(outlineId) {
      let count = 0;
      for (const node of outlineNodes.value) {
        if (node.nodeType === "chapter" || node.nodeType === "section") {
          count++;
        }
        if (node.id === outlineId) {
          return count;
        }
      }
      return count || 1;
    }
    async function saveMemories() {
      if (!currentOutlineForAction.value || extractedMemories.value.length === 0) return;
      try {
        const chapterNumber = calculateChapterNumber(currentOutlineForAction.value.id);
        const memoriesToCreate = JSON.parse(JSON.stringify(extractedMemories.value.map((m) => ({
          projectId: props.projectId,
          sourceOutlineId: currentOutlineForAction.value.id,
          memoryType: m.memoryType,
          title: m.title,
          description: m.description,
          involvedEntities: m.involvedEntities || [],
          chapterNumber,
          importance: m.importance
        }))));
        const result = await window.electronAPI.longwriting.batchCreateMemories(memoriesToCreate);
        if (result.success) {
          await window.electronAPI.longwriting.confirmPrewrite(currentOutlineForAction.value.id);
          if (currentPrewrite.value) {
            currentPrewrite.value.isConfirmed = true;
          }
          ElMessage.success(`已保存 ${result.data?.length || 0} 条记忆`);
          showMemoryDialog.value = false;
          await loadMemoryStats();
        } else {
          ElMessage.error(result.error || "保存记忆失败");
        }
      } catch (error) {
        ElMessage.error("保存记忆失败：" + error.message);
      }
    }
    async function loadMemoryStats() {
      try {
        const result = await window.electronAPI.longwriting.getMemoryStats(props.projectId);
        if (result.success && result.data) {
          memoryStats.value = {
            total: result.data.total,
            active: result.data.active
          };
        }
      } catch (error) {
        console.error("加载记忆统计失败:", error);
      }
    }
    async function loadSnapshotStats() {
      try {
        const result = await window.electronAPI.longwriting.getSnapshotStats(props.projectId);
        if (result.success && result.data) {
          snapshotStats.value = {
            total: result.data.total,
            byEntityType: result.data.byEntityType
          };
        }
      } catch (error) {
        console.error("加载快照统计失败:", error);
      }
    }
    async function extractEntityStatesFromChapter(outlineId) {
      if (!selectedModel.value || !selectedModel.value.providerId || !selectedModel.value.modelId) {
        ElMessage.warning("请先选择 AI 模型");
        return;
      }
      const content = chapterContentMap.value[outlineId];
      if (!content || content.length < 100) {
        ElMessage.warning("章节内容太短，无法提取状态");
        return;
      }
      const outline = outlineNodes.value.find((n) => n.id === outlineId);
      if (!outline) return;
      extractingStates.value = true;
      extractedStates.value = [];
      try {
        const chapterNumber = calculateChapterNumber(outlineId);
        const involvedEntities = [];
        for (const charId of outline.involvedCharacters || []) {
          const char = characters.value.find((c) => c.id === charId);
          if (char) {
            involvedEntities.push({ type: "character", id: char.id, name: char.name });
          }
        }
        for (const locId of outline.involvedLocations || []) {
          const loc = locations.value.find((l) => l.id === locId);
          if (loc) {
            involvedEntities.push({ type: "location", id: loc.id, name: loc.name });
          }
        }
        if (involvedEntities.length === 0) {
          ElMessage.info("正在识别章节涉及的实体...");
          const recognizeResult = await window.electronAPI.longwriting.recognizeChapterEntities(
            props.projectId,
            content,
            selectedModel.value.providerId,
            selectedModel.value.modelId
          );
          if (!recognizeResult.success || !recognizeResult.data) {
            ElMessage.error(recognizeResult.error || "识别实体失败");
            extractingStates.value = false;
            return;
          }
          const recognizedData = recognizeResult.data;
          const recognizedChars = recognizedData.characters || [];
          const recognizedLocs = recognizedData.locations || [];
          if (recognizedData.newEntities && (recognizedData.newEntities.newCharacters?.length > 0 || recognizedData.newEntities.newLocations?.length > 0 || recognizedData.newEntities.newItems?.length > 0)) {
            detectedNewEntities.value = recognizedData.newEntities;
            showNewEntitiesDialog.value = true;
          }
          if (recognizedChars.length === 0 && recognizedLocs.length === 0 && !detectedNewEntities.value) {
            ElMessage.warning("未识别到章节涉及的角色或地点");
            extractingStates.value = false;
            return;
          }
          const charIds = recognizedChars.map((c) => c.id);
          const locIds = recognizedLocs.map((l) => l.id);
          await window.electronAPI.longwriting.updateOutline(outlineId, {
            involvedCharacters: charIds,
            involvedLocations: locIds
          });
          outline.involvedCharacters = charIds;
          outline.involvedLocations = locIds;
          for (const char of recognizedChars) {
            involvedEntities.push({ type: "character", id: char.id, name: char.name });
          }
          for (const loc of recognizedLocs) {
            involvedEntities.push({ type: "location", id: loc.id, name: loc.name });
          }
          ElMessage.success(`已识别 ${recognizedChars.length} 个角色，${recognizedLocs.length} 个地点`);
        }
        const result = await window.electronAPI.longwriting.extractEntityStates(
          props.projectId,
          outlineId,
          content,
          chapterNumber,
          involvedEntities,
          selectedModel.value.providerId,
          selectedModel.value.modelId
        );
        if (result.success && result.data) {
          extractedStates.value = result.data;
          if (result.data.length > 0) {
            showStateExtractDialog.value = true;
          } else {
            ElMessage.info("未检测到实体状态变化");
          }
        } else {
          ElMessage.error(result.error || "提取实体状态失败");
        }
      } catch (error) {
        ElMessage.error("提取实体状态失败：" + error.message);
      } finally {
        extractingStates.value = false;
      }
    }
    async function saveEntityStates() {
      if (extractedStates.value.length === 0) return;
      try {
        const outline = currentChapter.value;
        if (!outline) return;
        const chapterNumber = calculateChapterNumber(outline.id);
        const statesToCreate = JSON.parse(JSON.stringify(extractedStates.value.map((s) => ({
          projectId: props.projectId,
          entityType: s.entityType,
          entityId: s.entityId,
          entityName: s.entityName,
          chapterNumber,
          stateSummary: s.stateSummary,
          keyChanges: s.keyChanges || []
        }))));
        const result = await window.electronAPI.longwriting.batchCreateEntityStateSnapshots(statesToCreate);
        if (result.success) {
          ElMessage.success(`已保存 ${result.data?.length || 0} 个实体状态快照`);
          showStateExtractDialog.value = false;
          await loadSnapshotStats();
        } else {
          ElMessage.error(result.error || "保存状态快照失败");
        }
      } catch (error) {
        ElMessage.error("保存状态快照失败：" + error.message);
      }
    }
    async function handleAddNewEntities() {
      if (!detectedNewEntities.value) return;
      addingEntities.value = true;
      try {
        const result = await window.electronAPI.longwriting.autoAddEntities(
          props.projectId,
          detectedNewEntities.value.newCharacters,
          detectedNewEntities.value.newLocations,
          detectedNewEntities.value.newItems
        );
        if (result.success) {
          const added = result.data;
          const totalAdded = (added.addedCharacters?.length || 0) + (added.addedLocations?.length || 0) + (added.addedItems?.length || 0);
          if (totalAdded > 0) {
            ElMessage.success(`已添加 ${totalAdded} 个新实体到项目`);
            await loadCharacters();
            await loadLocations();
            if (added.errors && added.errors.length > 0) {
              ElMessage.warning(added.errors.join("; "));
            }
          }
          showNewEntitiesDialog.value = false;
          detectedNewEntities.value = null;
        } else {
          ElMessage.error(result.error || "添加新实体失败");
        }
      } catch (error) {
        ElMessage.error("添加新实体失败：" + error.message);
      } finally {
        addingEntities.value = false;
      }
    }
    function handleIgnoreNewEntities() {
      showNewEntitiesDialog.value = false;
      detectedNewEntities.value = null;
    }
    function getImportanceTagType(importance) {
      switch (importance) {
        case "main":
          return "danger";
        case "secondary":
          return "warning";
        case "temporary":
          return "info";
        default:
          return "";
      }
    }
    function getImportanceName(importance) {
      const names = {
        main: "主要",
        secondary: "次要",
        temporary: "临时"
      };
      return names[importance] || importance;
    }
    async function viewChapterStates(outlineId) {
      currentViewStateOutlineId.value = outlineId;
      loadingChapterStates.value = true;
      chapterStates.value = [];
      showViewStateDialog.value = true;
      try {
        const chapterNumber = calculateChapterNumber(outlineId);
        const result = await window.electronAPI.longwriting.getEntityStatesByChapter(props.projectId, chapterNumber);
        if (result.success && result.data) {
          chapterStates.value = result.data;
        } else {
          ElMessage.error(result.error || "加载状态快照失败");
        }
      } catch (error) {
        ElMessage.error("加载状态快照失败：" + error.message);
      } finally {
        loadingChapterStates.value = false;
      }
    }
    async function deleteState(stateId) {
      try {
        await ElMessageBox.confirm("确定要删除该状态快照吗？", "确认删除", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteEntityStateSnapshot(stateId);
        if (result.success) {
          chapterStates.value = chapterStates.value.filter((s) => s.id !== stateId);
          ElMessage.success("删除成功");
          await loadSnapshotStats();
        } else {
          ElMessage.error(result.error || "删除失败");
        }
      } catch {
      }
    }
    async function executeGeneration() {
      if (!currentOutlineForAction.value) return;
      const outline = currentOutlineForAction.value;
      const outlineId = outline.id;
      showGenerateDialog.value = false;
      generatingMap.value[outlineId] = true;
      chapterContentMap.value[outlineId] = "";
      console.log("[ChapterStage] 生成章节, providerId:", selectedModel.value?.providerId, "modelId:", selectedModel.value?.modelId);
      const eventId = `chapter-${outlineId}-${Date.now()}`;
      generatingEventIdMap.value[outlineId] = eventId;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        eventId,
        (event) => {
          if (event.type === "content" && event.content) {
            chapterContentMap.value[outlineId] += event.content;
          } else if (event.type === "done") {
            generatingMap.value[outlineId] = false;
            generatingEventIdMap.value[outlineId] = null;
            if (autoSave.value && chapterContentMap.value[outlineId]) {
              saveChapter(outlineId);
            }
            ElMessage.success("章节内容已生成");
            unsubscribe();
          } else if (event.type === "error") {
            generatingMap.value[outlineId] = false;
            generatingEventIdMap.value[outlineId] = null;
            ElMessage.error(event.error || "生成失败");
            unsubscribe();
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateChapter(
        eventId,
        props.projectId,
        outlineId,
        generateForm.value.targetWords,
        selectedModel.value.providerId,
        selectedModel.value.modelId
      );
      if (!result.success) {
        generatingMap.value[outlineId] = false;
        generatingEventIdMap.value[outlineId] = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
      currentOutlineForAction.value = null;
    }
    function cancelGenerate(outlineId) {
      const eventId = generatingEventIdMap.value[outlineId];
      if (eventId) {
        generatingMap.value[outlineId] = false;
        generatingEventIdMap.value[outlineId] = null;
        ElMessage.info("已取消生成");
      }
    }
    async function showVersions(outline) {
      currentOutlineForAction.value = outline;
      const chapterId = chapterIdMap.value[outline.id];
      if (chapterId) {
        await loadVersions(chapterId);
      } else {
        versions.value = [];
      }
      showVersionDialog.value = true;
    }
    function previewVersion(version2) {
      previewContent.value = version2.content;
      showPreviewDialog.value = true;
    }
    async function restoreVersion(version2) {
      if (version2.isLocked) {
        ElMessage.warning("该版本已锁定，无法恢复");
        return;
      }
      try {
        await ElMessageBox.confirm(
          "恢复历史版本将替换当前内容，确定要恢复吗？",
          "恢复版本",
          {
            confirmButtonText: "恢复",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        if (!currentOutlineForAction.value) return;
        const chapterId = chapterIdMap.value[currentOutlineForAction.value.id];
        if (!chapterId) return;
        const result = await window.electronAPI.longwriting.restoreChapterVersion(chapterId, version2.id);
        if (result.success) {
          chapterContentMap.value[currentOutlineForAction.value.id] = result.data.content || "";
          await loadVersions(chapterId);
          ElMessage.success(`已恢复到版本 ${version2.versionNumber}`);
        } else {
          ElMessage.error(result.error || "恢复失败");
        }
      } catch {
      }
    }
    function goToOutline() {
      emit("update:progress", 65);
    }
    function updateProgress() {
      const completedNodes = outlineNodes.value.filter((n) => n.status === "completed").length;
      const totalNodes = outlineNodes.value.filter((n) => n.nodeType === "chapter" || n.nodeType === "section").length;
      const progress = Math.min(100, 75 + Math.floor(completedNodes / Math.max(totalNodes, 1) * 25));
      emit("update:progress", progress);
    }
    async function exportChapter(outlineId) {
      const content = chapterContentMap.value[outlineId];
      if (!content) {
        ElMessage.warning("该章节暂无内容");
        return;
      }
      const node = outlineNodes.value.find((n) => n.id === outlineId);
      const fileName = node ? node.name : `章节_${outlineId}`;
      try {
        const result = await window.electronAPI.longwriting.exportChapter({
          outlineId,
          content,
          fileName,
          format: "txt"
        });
        if (result.success) {
          ElMessage.success(`已导出：${result.data}`);
        } else {
          ElMessage.error(result.error || "导出失败");
        }
      } catch (error) {
        ElMessage.error("导出失败：" + error.message);
      }
    }
    async function exportNode(nodeId) {
      const leafIds = getLeafChildren(nodeId);
      if (leafIds.length === 0) {
        ElMessage.warning("该节点下暂无内容");
        return;
      }
      const node = outlineNodes.value.find((n) => n.id === nodeId);
      const nodeName = node ? node.name : `节点_${nodeId}`;
      const parts = [];
      for (const leafId of leafIds) {
        const leafNode = outlineNodes.value.find((n) => n.id === leafId);
        const content = chapterContentMap.value[leafId] || "";
        if (content) {
          parts.push(`## ${leafNode?.name || "未命名"}

${content}`);
        }
      }
      if (parts.length === 0) {
        ElMessage.warning("该节点下暂无内容");
        return;
      }
      const fullContent = parts.join("\n\n---\n\n");
      try {
        const result = await window.electronAPI.longwriting.exportChapter({
          outlineId: nodeId,
          content: fullContent,
          fileName: nodeName,
          format: "txt"
        });
        if (result.success) {
          ElMessage.success(`已导出：${result.data}`);
        } else {
          ElMessage.error(result.error || "导出失败");
        }
      } catch (error) {
        ElMessage.error("导出失败：" + error.message);
      }
    }
    async function exportAll() {
      if (allOutlines.value.length === 0) {
        ElMessage.warning("暂无章节内容");
        return;
      }
      const parts = [];
      for (const outline of allOutlines.value) {
        const content = chapterContentMap.value[outline.id] || "";
        if (content) {
          parts.push(`## ${outline.name}

${content}`);
        }
      }
      if (parts.length === 0) {
        ElMessage.warning("暂无章节内容");
        return;
      }
      const fullContent = parts.join("\n\n---\n\n");
      try {
        const result = await window.electronAPI.longwriting.exportChapter({
          outlineId: props.projectId,
          content: fullContent,
          fileName: "全部章节",
          format: "txt"
        });
        if (result.success) {
          ElMessage.success(`已导出：${result.data}`);
        } else {
          ElMessage.error(result.error || "导出失败");
        }
      } catch (error) {
        ElMessage.error("导出失败：" + error.message);
      }
    }
    async function loadOutlineTree() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId);
      if (result.success) {
        outlineNodes.value = result.data || [];
      }
    }
    async function loadCharacters() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getCharacters(props.projectId);
      if (result.success) {
        characters.value = result.data || [];
      }
    }
    async function loadLocations() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getLocations(props.projectId);
      if (result.success) {
        locations.value = result.data || [];
      }
    }
    async function loadData() {
      loading.value = true;
      autoSave.value = false;
      await Promise.all([
        loadOutlineTree(),
        loadCharacters(),
        loadLocations()
      ]);
      await loadAllChapters();
      await loadSnapshotStats();
      loading.value = false;
      nextTick(() => {
        autoSave.value = true;
      });
      if (allOutlines.value.length > 0) {
        activeOutlineId.value = allOutlines.value[0].id;
      }
      updateProgress();
    }
    watch(chapterContentMap, (newVal) => {
      if (!autoSave.value) return;
      for (const outlineId in newVal) {
        if (chapterIdMap.value[outlineId]) {
          const currentContent = newVal[outlineId];
          if (lastSavedContent[outlineId] === currentContent) continue;
          if (saveTimers[outlineId]) clearTimeout(saveTimers[outlineId]);
          saveTimers[outlineId] = setTimeout(() => {
            saveChapter(outlineId);
            lastSavedContent[outlineId] = currentContent;
          }, 3e3);
        }
      }
    }, { deep: true });
    watch(() => props.projectId, () => {
      loadData();
    });
    onMounted(() => {
      loadData();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tree = resolveComponent("el-tree");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          _cache[25] || (_cache[25] = createBaseVNode("h2", null, "章节写作", -1)),
          _cache[26] || (_cache[26] = createBaseVNode("p", { class: "stage-desc" }, "根据大纲生成章节内容，支持手动编辑和版本管理", -1)),
          createVNode(_component_el_button, {
            type: "primary",
            size: "small",
            class: "header-export-btn",
            onClick: exportAll
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(download_default))
                ]),
                _: 1
              }),
              _cache[24] || (_cache[24] = createTextVNode(" 导出全部 ", -1))
            ]),
            _: 1
          })
        ]),
        createBaseVNode("div", _hoisted_3$2, [
          createBaseVNode("div", _hoisted_4$2, [
            createBaseVNode("div", _hoisted_5$2, [
              createBaseVNode("div", _hoisted_6$2, [
                _cache[28] || (_cache[28] = createBaseVNode("h3", null, "大纲目录", -1)),
                createVNode(_component_el_button, {
                  text: "",
                  size: "small",
                  onClick: collapseAll
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(fold_default))
                      ]),
                      _: 1
                    }),
                    _cache[27] || (_cache[27] = createTextVNode(" 折叠 ", -1))
                  ]),
                  _: 1
                })
              ]),
              createVNode(_component_el_tree, {
                ref_key: "treeRef",
                ref: treeRef,
                data: outlineTreeData.value,
                props: treeProps,
                "highlight-current": true,
                "expand-on-click-node": false,
                "default-expand-all": true,
                "node-key": "id",
                class: "outline-tree",
                onNodeClick: handleNodeClick
              }, {
                default: withCtx(({ node, data }) => [
                  createBaseVNode("div", {
                    class: normalizeClass(["tree-node", { active: data.id === activeOutlineId.value }])
                  }, [
                    createBaseVNode("span", _hoisted_7$2, toDisplayString(data.name), 1),
                    createBaseVNode("span", {
                      class: normalizeClass(["node-status", data.status])
                    }, toDisplayString(getStatusName(data.status)), 3)
                  ], 2)
                ]),
                _: 1
              }, 8, ["data"]),
              outlineTreeData.value.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                key: 0,
                description: "暂无大纲数据"
              })) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", {
              class: "chapters-panel",
              ref_key: "chaptersPanelRef",
              ref: chaptersPanelRef
            }, [
              outlineTreeData.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_8$2, [
                createVNode(_component_el_empty, { description: "请先在大纲设计阶段创建大纲" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_button, {
                      type: "primary",
                      onClick: goToOutline
                    }, {
                      default: withCtx(() => [..._cache[29] || (_cache[29] = [
                        createTextVNode("前往大纲设计", -1)
                      ])]),
                      _: 1
                    })
                  ]),
                  _: 1
                })
              ])) : (openBlock(), createElementBlock("div", _hoisted_9$2, [
                isEditableNode.value && currentChapter.value ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
                  createVNode(_component_el_button, {
                    disabled: currentChapterIndex.value <= 0,
                    onClick: prevChapter
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(arrow_left_default))
                        ]),
                        _: 1
                      }),
                      _cache[30] || (_cache[30] = createTextVNode(" 上一节 ", -1))
                    ]),
                    _: 1
                  }, 8, ["disabled"]),
                  createBaseVNode("span", _hoisted_11$2, toDisplayString(currentChapter.value.name), 1),
                  createVNode(_component_el_button, {
                    disabled: currentChapterIndex.value >= allOutlines.value.length - 1,
                    onClick: nextChapter
                  }, {
                    default: withCtx(() => [
                      _cache[31] || (_cache[31] = createTextVNode(" 下一节 ", -1)),
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(arrow_right_default))
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }, 8, ["disabled"])
                ])) : createCommentVNode("", true),
                currentNode.value ? (openBlock(), createElementBlock("div", {
                  key: 1,
                  class: normalizeClass(["chapter-card", { active: isEditableNode.value }])
                }, [
                  createBaseVNode("div", _hoisted_12$2, [
                    createBaseVNode("div", _hoisted_13$2, [
                      createBaseVNode("span", _hoisted_14$2, toDisplayString(getNodeTypeName(currentNode.value.nodeType)), 1),
                      createBaseVNode("h3", _hoisted_15$2, toDisplayString(currentNode.value.name), 1),
                      createVNode(_component_el_tag, {
                        type: getStatusType(currentNode.value.status),
                        size: "small"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getStatusName(currentNode.value.status)), 1)
                        ]),
                        _: 1
                      }, 8, ["type"]),
                      isEditableNode.value && getChapterWordCount(currentNode.value.id) ? (openBlock(), createElementBlock("span", _hoisted_16$2, toDisplayString(getChapterWordCount(currentNode.value.id)) + " 字 ", 1)) : createCommentVNode("", true),
                      !isEditableNode.value ? (openBlock(), createElementBlock("span", _hoisted_17$2, " 预览模式 ")) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_18$1, [
                      isEditableNode.value && currentChapter.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        !generatingMap.value[currentChapter.value.id] ? (openBlock(), createBlock(_component_el_button, {
                          key: 0,
                          type: "primary",
                          size: "small",
                          onClick: _cache[0] || (_cache[0] = ($event) => startGenerate(currentChapter.value))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(magic_stick_default))
                              ]),
                              _: 1
                            }),
                            _cache[32] || (_cache[32] = createTextVNode(" AI 生成 ", -1))
                          ]),
                          _: 1
                        })) : (openBlock(), createBlock(_component_el_button, {
                          key: 1,
                          type: "danger",
                          size: "small",
                          onClick: _cache[1] || (_cache[1] = ($event) => cancelGenerate(currentChapter.value.id))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(close_default))
                              ]),
                              _: 1
                            }),
                            _cache[33] || (_cache[33] = createTextVNode(" 取消 ", -1))
                          ]),
                          _: 1
                        })),
                        createVNode(_component_el_button, {
                          size: "small",
                          onClick: _cache[2] || (_cache[2] = ($event) => showVersions(currentChapter.value))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(clock_default))
                              ]),
                              _: 1
                            }),
                            _cache[34] || (_cache[34] = createTextVNode(" 版本 ", -1))
                          ]),
                          _: 1
                        }),
                        createVNode(_component_el_button, {
                          size: "small",
                          onClick: _cache[3] || (_cache[3] = ($event) => exportChapter(currentChapter.value.id))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(download_default))
                              ]),
                              _: 1
                            }),
                            _cache[35] || (_cache[35] = createTextVNode(" 导出 ", -1))
                          ]),
                          _: 1
                        }),
                        createVNode(_component_el_button, {
                          size: "small",
                          loading: savingMap.value[currentChapter.value.id],
                          onClick: _cache[4] || (_cache[4] = ($event) => saveChapter(currentChapter.value.id))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(document_checked_default))
                              ]),
                              _: 1
                            }),
                            _cache[36] || (_cache[36] = createTextVNode(" 保存 ", -1))
                          ]),
                          _: 1
                        }, 8, ["loading"]),
                        createVNode(_component_el_button, {
                          size: "small",
                          loading: extractingStates.value,
                          disabled: !chapterContentMap.value[currentChapter.value.id] || chapterContentMap.value[currentChapter.value.id].length < 100,
                          onClick: _cache[5] || (_cache[5] = ($event) => extractEntityStatesFromChapter(currentChapter.value.id))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(collection_default))
                              ]),
                              _: 1
                            }),
                            _cache[37] || (_cache[37] = createTextVNode(" 提取状态 ", -1))
                          ]),
                          _: 1
                        }, 8, ["loading", "disabled"]),
                        createVNode(_component_el_button, {
                          size: "small",
                          onClick: _cache[6] || (_cache[6] = ($event) => viewChapterStates(currentChapter.value.id))
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(view_default))
                              ]),
                              _: 1
                            }),
                            _cache[38] || (_cache[38] = createTextVNode(" 查看状态 ", -1))
                          ]),
                          _: 1
                        })
                      ], 64)) : !isEditableNode.value && currentNode.value ? (openBlock(), createBlock(_component_el_button, {
                        key: 1,
                        size: "small",
                        onClick: _cache[7] || (_cache[7] = ($event) => exportNode(currentNode.value.id))
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(download_default))
                            ]),
                            _: 1
                          }),
                          _cache[39] || (_cache[39] = createTextVNode(" 导出 ", -1))
                        ]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ])
                  ]),
                  currentNode.value.summary || currentNode.value.involvedCharacters?.length || currentNode.value.involvedLocations?.length ? (openBlock(), createElementBlock("div", _hoisted_19$1, [
                    currentNode.value.summary ? (openBlock(), createElementBlock("p", _hoisted_20$1, toDisplayString(currentNode.value.summary), 1)) : createCommentVNode("", true),
                    currentNode.value.involvedCharacters?.length > 0 || currentNode.value.involvedLocations?.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_21$1, [
                      currentNode.value.involvedCharacters?.length > 0 ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentNode.value.involvedCharacters, (id) => {
                        return openBlock(), createBlock(_component_el_tag, {
                          key: id,
                          size: "small",
                          type: "info"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(getCharacterName(id)), 1)
                          ]),
                          _: 2
                        }, 1024);
                      }), 128)) : createCommentVNode("", true),
                      currentNode.value.involvedLocations?.length > 0 ? (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(currentNode.value.involvedLocations, (id) => {
                        return openBlock(), createBlock(_component_el_tag, {
                          key: id,
                          size: "small",
                          type: "warning"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(getLocationName(id)), 1)
                          ]),
                          _: 2
                        }, 1024);
                      }), 128)) : createCommentVNode("", true)
                    ])) : createCommentVNode("", true)
                  ])) : createCommentVNode("", true),
                  isEditableNode.value && currentChapter.value ? (openBlock(), createElementBlock("div", _hoisted_22$1, [
                    (openBlock(), createBlock(_sfc_main$a, {
                      key: currentChapter.value.id,
                      modelValue: chapterContentMap.value[currentChapter.value.id],
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => chapterContentMap.value[currentChapter.value.id] = $event),
                      placeholder: getEditorPlaceholder(currentChapter.value),
                      height: "100%",
                      mode: "split"
                    }, null, 8, ["modelValue", "placeholder"]))
                  ])) : (openBlock(), createElementBlock("div", _hoisted_23$1, [
                    nodePreviewContent.value ? (openBlock(), createElementBlock("div", {
                      key: 0,
                      class: "preview-content-area",
                      innerHTML: renderMarkdown(nodePreviewContent.value)
                    }, null, 8, _hoisted_24$1)) : (openBlock(), createBlock(_component_el_empty, {
                      key: 1,
                      description: "暂无内容，请在左侧选择具体的节进行编辑"
                    }))
                  ]))
                ], 2)) : createCommentVNode("", true)
              ]))
            ], 512)
          ])
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showGenerateDialog.value,
          "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => showGenerateDialog.value = $event),
          title: "AI 生成参数",
          width: "550px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[13] || (_cache[13] = ($event) => showGenerateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[44] || (_cache[44] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            prewriteContent.value ? (openBlock(), createBlock(_component_el_button, {
              key: 0,
              loading: prewriteSaving.value,
              onClick: savePrewriteOnly
            }, {
              default: withCtx(() => [..._cache[45] || (_cache[45] = [
                createTextVNode(" 保存预写 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])) : createCommentVNode("", true),
            prewriteContent.value && !currentPrewrite.value?.isConfirmed ? (openBlock(), createBlock(_component_el_button, {
              key: 1,
              type: "success",
              onClick: confirmPrewriteAndExtract
            }, {
              default: withCtx(() => [..._cache[46] || (_cache[46] = [
                createTextVNode(" 确认预写 ", -1)
              ])]),
              _: 1
            })) : createCommentVNode("", true),
            !prewriteContent.value && !prewriting.value ? (openBlock(), createBlock(_component_el_button, {
              key: 2,
              type: "default",
              onClick: generatePrewrite
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(document_default))
                  ]),
                  _: 1
                }),
                _cache[47] || (_cache[47] = createTextVNode(" AI 预写 ", -1))
              ]),
              _: 1
            })) : createCommentVNode("", true),
            prewriteContent.value ? (openBlock(), createBlock(_component_el_button, {
              key: 3,
              type: "default",
              onClick: generatePrewrite
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(refresh_default))
                  ]),
                  _: 1
                }),
                _cache[48] || (_cache[48] = createTextVNode(" 重新预写 ", -1))
              ]),
              _: 1
            })) : createCommentVNode("", true),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: executeGeneration
            }, {
              default: withCtx(() => [..._cache[49] || (_cache[49] = [
                createTextVNode(" 开始生成 ", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: generateForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "目标字数" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: generateForm.value.targetWords,
                      "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => generateForm.value.targetWords = $event),
                      min: 500,
                      max: 5e4,
                      step: 500
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "写作风格" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: generateForm.value.style,
                      "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => generateForm.value.style = $event),
                      placeholder: "选择写作风格"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "默认",
                          value: ""
                        }),
                        createVNode(_component_el_option, {
                          label: "轻松幽默",
                          value: "light"
                        }),
                        createVNode(_component_el_option, {
                          label: "沉重深刻",
                          value: "heavy"
                        }),
                        createVNode(_component_el_option, {
                          label: "热血激昂",
                          value: "passionate"
                        }),
                        createVNode(_component_el_option, {
                          label: "冷峻沉稳",
                          value: "calm"
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
                      modelValue: generateForm.value.extraPrompt,
                      "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => generateForm.value.extraPrompt = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "其他写作要求..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"]),
            prewriteContent.value || prewriting.value ? (openBlock(), createElementBlock("div", _hoisted_25$1, [
              createBaseVNode("div", _hoisted_26$1, [
                _cache[42] || (_cache[42] = createBaseVNode("span", { class: "prewrite-title" }, "AI 预写提纲", -1)),
                currentPrewrite.value?.isConfirmed ? (openBlock(), createBlock(_component_el_tag, {
                  key: 0,
                  type: "success",
                  size: "small"
                }, {
                  default: withCtx(() => [..._cache[40] || (_cache[40] = [
                    createTextVNode("已确认", -1)
                  ])]),
                  _: 1
                })) : createCommentVNode("", true),
                !currentPrewrite.value?.isConfirmed ? (openBlock(), createBlock(_component_el_button, {
                  key: 1,
                  text: "",
                  size: "small",
                  onClick: clearPrewrite
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(close_default))
                      ]),
                      _: 1
                    }),
                    _cache[41] || (_cache[41] = createTextVNode(" 清除 ", -1))
                  ]),
                  _: 1
                })) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_27$1, [
                !prewriting.value ? (openBlock(), createBlock(_component_el_input, {
                  key: 0,
                  modelValue: prewriteContent.value,
                  "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => prewriteContent.value = $event),
                  type: "textarea",
                  rows: 8,
                  disabled: currentPrewrite.value?.isConfirmed,
                  placeholder: "预写内容..."
                }, null, 8, ["modelValue", "disabled"])) : (openBlock(), createElementBlock("div", _hoisted_28$1, [
                  createBaseVNode("pre", null, toDisplayString(prewriteContent.value), 1)
                ]))
              ]),
              memoryStats.value ? (openBlock(), createElementBlock("div", _hoisted_29$1, [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(info_filled_default))
                  ]),
                  _: 1
                }),
                createBaseVNode("span", null, "已加载 " + toDisplayString(memoryStats.value.active) + " 条相关记忆", 1)
              ])) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            prewriting.value ? (openBlock(), createElementBlock("div", _hoisted_30$1, [
              createVNode(_component_el_icon, { class: "is-loading" }, {
                default: withCtx(() => [
                  createVNode(unref(loading_default))
                ]),
                _: 1
              }),
              _cache[43] || (_cache[43] = createBaseVNode("span", null, "AI 正在生成预写提纲...", -1))
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showVersionDialog.value,
          "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => showVersionDialog.value = $event),
          title: "版本历史",
          width: "600px"
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_31$1, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(versions.value, (version2) => {
                return openBlock(), createElementBlock("div", {
                  key: version2.id,
                  class: "version-item"
                }, [
                  createBaseVNode("div", _hoisted_32$1, [
                    createBaseVNode("span", _hoisted_33, "版本 " + toDisplayString(version2.versionNumber), 1),
                    createBaseVNode("span", {
                      class: normalizeClass(["version-type", version2.versionType])
                    }, toDisplayString(version2.versionType === "generated" ? "AI生成" : "手动编辑"), 3),
                    createBaseVNode("span", _hoisted_34, toDisplayString(formatDate(version2.createdAt)), 1),
                    createBaseVNode("span", _hoisted_35, toDisplayString(version2.wordCount) + "字", 1),
                    version2.isLocked ? (openBlock(), createBlock(_component_el_tag, {
                      key: 0,
                      type: "warning",
                      size: "small"
                    }, {
                      default: withCtx(() => [..._cache[50] || (_cache[50] = [
                        createTextVNode("已锁定", -1)
                      ])]),
                      _: 1
                    })) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_36, [
                    createVNode(_component_el_button, {
                      text: "",
                      size: "small",
                      onClick: ($event) => previewVersion(version2)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(view_default))
                          ]),
                          _: 1
                        }),
                        _cache[51] || (_cache[51] = createTextVNode(" 预览 ", -1))
                      ]),
                      _: 1
                    }, 8, ["onClick"]),
                    createVNode(_component_el_button, {
                      text: "",
                      size: "small",
                      disabled: version2.isLocked,
                      onClick: ($event) => restoreVersion(version2)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(refresh_left_default))
                          ]),
                          _: 1
                        }),
                        _cache[52] || (_cache[52] = createTextVNode(" 恢复 ", -1))
                      ]),
                      _: 1
                    }, 8, ["disabled", "onClick"])
                  ])
                ]);
              }), 128)),
              versions.value.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                key: 0,
                description: "暂无历史版本"
              })) : createCommentVNode("", true)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showPreviewDialog.value,
          "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => showPreviewDialog.value = $event),
          title: "版本预览",
          width: "700px"
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_37, [
              createBaseVNode("pre", null, toDisplayString(previewContent.value), 1)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showMemoryDialog.value,
          "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => showMemoryDialog.value = $event),
          title: "确认记忆",
          width: "700px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[17] || (_cache[17] = ($event) => showMemoryDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[55] || (_cache[55] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: extractedMemories.value.length === 0,
              onClick: saveMemories
            }, {
              default: withCtx(() => [..._cache[56] || (_cache[56] = [
                createTextVNode(" 保存记忆 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            memoryExtracting.value ? (openBlock(), createElementBlock("div", _hoisted_38, [
              createVNode(_component_el_icon, { class: "is-loading" }, {
                default: withCtx(() => [
                  createVNode(unref(loading_default))
                ]),
                _: 1
              }),
              _cache[53] || (_cache[53] = createBaseVNode("span", null, "AI 正在从预写内容中提取关键记忆...", -1))
            ])) : extractedMemories.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_39, [
              _cache[54] || (_cache[54] = createBaseVNode("p", { class: "memory-hint" }, "以下是从预写内容中提取的关键记忆，请确认是否保存：", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(extractedMemories.value, (memory, index2) => {
                return openBlock(), createElementBlock("div", {
                  key: index2,
                  class: "memory-item"
                }, [
                  createBaseVNode("div", _hoisted_40, [
                    createVNode(_component_el_select, {
                      modelValue: memory.importance,
                      "onUpdate:modelValue": ($event) => memory.importance = $event,
                      size: "small",
                      style: { "width": "100px" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "关键",
                          value: "critical"
                        }),
                        createVNode(_component_el_option, {
                          label: "重要",
                          value: "normal"
                        }),
                        createVNode(_component_el_option, {
                          label: "次要",
                          value: "minor"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue", "onUpdate:modelValue"]),
                    createVNode(_component_el_select, {
                      modelValue: memory.memoryType,
                      "onUpdate:modelValue": ($event) => memory.memoryType = $event,
                      size: "small",
                      style: { "width": "120px" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "角色事件",
                          value: "character_event"
                        }),
                        createVNode(_component_el_option, {
                          label: "地点事件",
                          value: "location_event"
                        }),
                        createVNode(_component_el_option, {
                          label: "物品事件",
                          value: "item_event"
                        }),
                        createVNode(_component_el_option, {
                          label: "关系变化",
                          value: "relationship_change"
                        }),
                        createVNode(_component_el_option, {
                          label: "势力事件",
                          value: "faction_event"
                        }),
                        createVNode(_component_el_option, {
                          label: "技能事件",
                          value: "skill_event"
                        }),
                        createVNode(_component_el_option, {
                          label: "一般事件",
                          value: "general"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue", "onUpdate:modelValue"])
                  ]),
                  createVNode(_component_el_input, {
                    modelValue: memory.title,
                    "onUpdate:modelValue": ($event) => memory.title = $event,
                    placeholder: "记忆标题",
                    size: "small",
                    style: { "margin-bottom": "8px" }
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createVNode(_component_el_input, {
                    modelValue: memory.description,
                    "onUpdate:modelValue": ($event) => memory.description = $event,
                    type: "textarea",
                    rows: 2,
                    placeholder: "详细描述"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"])
                ]);
              }), 128))
            ])) : (openBlock(), createBlock(_component_el_empty, {
              key: 2,
              description: "未能从预写内容中提取到关键记忆"
            }))
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showStateExtractDialog.value,
          "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => showStateExtractDialog.value = $event),
          title: "确认实体状态",
          width: "700px",
          style: { maxHeight: "80vh" },
          class: "state-dialog"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[19] || (_cache[19] = ($event) => showStateExtractDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[60] || (_cache[60] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: extractedStates.value.length === 0,
              onClick: saveEntityStates
            }, {
              default: withCtx(() => [..._cache[61] || (_cache[61] = [
                createTextVNode(" 保存状态快照 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_41, [
              extractingStates.value ? (openBlock(), createElementBlock("div", _hoisted_42, [
                createVNode(_component_el_icon, { class: "is-loading" }, {
                  default: withCtx(() => [
                    createVNode(unref(loading_default))
                  ]),
                  _: 1
                }),
                _cache[57] || (_cache[57] = createBaseVNode("span", null, "AI 正在分析章节内容，提取实体状态变化...", -1))
              ])) : extractedStates.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_43, [
                _cache[59] || (_cache[59] = createBaseVNode("p", { class: "memory-hint" }, "以下是从章节中提取的实体状态快照，请确认是否保存：", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(extractedStates.value, (state, index2) => {
                  return openBlock(), createElementBlock("div", {
                    key: index2,
                    class: "memory-item"
                  }, [
                    createBaseVNode("div", _hoisted_44, [
                      createVNode(_component_el_tag, {
                        size: "small",
                        type: state.entityType === "character" ? "primary" : state.entityType === "location" ? "warning" : "info"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(state.entityType === "character" ? "角色" : state.entityType === "location" ? "地点" : state.entityType === "item" ? "物品" : state.entityType === "faction" ? "势力" : "技能"), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"]),
                      createBaseVNode("span", _hoisted_45, toDisplayString(state.entityName), 1)
                    ]),
                    createVNode(_component_el_input, {
                      modelValue: state.stateSummary,
                      "onUpdate:modelValue": ($event) => state.stateSummary = $event,
                      type: "textarea",
                      rows: 3,
                      placeholder: "状态摘要",
                      style: { "margin-top": "8px" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                    state.keyChanges && state.keyChanges.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_46, [
                      _cache[58] || (_cache[58] = createBaseVNode("span", { class: "key-changes-label" }, "关键变化：", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(state.keyChanges, (change, i) => {
                        return openBlock(), createBlock(_component_el_tag, {
                          key: i,
                          size: "small",
                          type: "info",
                          style: { "margin-right": "4px" }
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(change), 1)
                          ]),
                          _: 2
                        }, 1024);
                      }), 128))
                    ])) : createCommentVNode("", true)
                  ]);
                }), 128))
              ])) : (openBlock(), createBlock(_component_el_empty, {
                key: 2,
                description: "未能检测到实体状态变化"
              }))
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showViewStateDialog.value,
          "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => showViewStateDialog.value = $event),
          title: "章节实体状态",
          width: "700px",
          class: "state-dialog"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[21] || (_cache[21] = ($event) => showViewStateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[66] || (_cache[66] = [
                createTextVNode("关闭", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_47, [
              loadingChapterStates.value ? (openBlock(), createElementBlock("div", _hoisted_48, [
                createVNode(_component_el_icon, { class: "is-loading" }, {
                  default: withCtx(() => [
                    createVNode(unref(loading_default))
                  ]),
                  _: 1
                }),
                _cache[62] || (_cache[62] = createBaseVNode("span", null, "正在加载章节状态...", -1))
              ])) : chapterStates.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_49, [
                _cache[65] || (_cache[65] = createBaseVNode("p", { class: "memory-hint" }, "以下是当前章节已保存的实体状态快照：", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(chapterStates.value, (state, index2) => {
                  return openBlock(), createElementBlock("div", {
                    key: index2,
                    class: "memory-item"
                  }, [
                    createBaseVNode("div", _hoisted_50, [
                      createVNode(_component_el_tag, {
                        size: "small",
                        type: state.entityType === "character" ? "primary" : state.entityType === "location" ? "warning" : "info"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(state.entityType === "character" ? "角色" : state.entityType === "location" ? "地点" : state.entityType === "item" ? "物品" : state.entityType === "faction" ? "势力" : "技能"), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"]),
                      createBaseVNode("span", _hoisted_51, toDisplayString(state.entityName), 1),
                      createVNode(_component_el_button, {
                        type: "danger",
                        size: "small",
                        text: "",
                        onClick: ($event) => deleteState(state.id),
                        style: { "margin-left": "auto" }
                      }, {
                        default: withCtx(() => [..._cache[63] || (_cache[63] = [
                          createTextVNode(" 删除 ", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])
                    ]),
                    createBaseVNode("div", _hoisted_52, toDisplayString(state.stateSummary), 1),
                    state.keyChanges && state.keyChanges.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_53, [
                      _cache[64] || (_cache[64] = createBaseVNode("span", { class: "key-changes-label" }, "关键变化：", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(state.keyChanges, (change, i) => {
                        return openBlock(), createBlock(_component_el_tag, {
                          key: i,
                          size: "small",
                          type: "info",
                          style: { "margin-right": "4px" }
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(change), 1)
                          ]),
                          _: 2
                        }, 1024);
                      }), 128))
                    ])) : createCommentVNode("", true)
                  ]);
                }), 128))
              ])) : (openBlock(), createBlock(_component_el_empty, {
                key: 2,
                description: "该章节暂无已保存的实体状态"
              }))
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showNewEntitiesDialog.value,
          "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => showNewEntitiesDialog.value = $event),
          title: "检测到新实体",
          width: "700px",
          class: "state-dialog"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, { onClick: handleIgnoreNewEntities }, {
              default: withCtx(() => [..._cache[71] || (_cache[71] = [
                createTextVNode("忽略", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: addingEntities.value,
              onClick: handleAddNewEntities
            }, {
              default: withCtx(() => [..._cache[72] || (_cache[72] = [
                createTextVNode(" 添加到项目 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_54, [
              _cache[70] || (_cache[70] = createBaseVNode("p", { class: "memory-hint" }, "以下是从章节中检测到的新实体，请选择是否添加到项目：", -1)),
              detectedNewEntities.value?.newCharacters?.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_55, [
                _cache[67] || (_cache[67] = createBaseVNode("h4", { class: "section-title" }, "新角色", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(detectedNewEntities.value.newCharacters, (char, index2) => {
                  return openBlock(), createElementBlock("div", {
                    key: "char-" + index2,
                    class: "new-entity-item"
                  }, [
                    createBaseVNode("div", _hoisted_56, [
                      createBaseVNode("span", _hoisted_57, toDisplayString(char.name), 1),
                      createVNode(_component_el_tag, {
                        type: getImportanceTagType(char.suggestedImportance),
                        size: "small"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getImportanceName(char.suggestedImportance)), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ]),
                    createBaseVNode("div", _hoisted_58, toDisplayString(char.description), 1),
                    char.reason ? (openBlock(), createElementBlock("div", _hoisted_59, toDisplayString(char.reason), 1)) : createCommentVNode("", true)
                  ]);
                }), 128))
              ])) : createCommentVNode("", true),
              detectedNewEntities.value?.newLocations?.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_60, [
                _cache[68] || (_cache[68] = createBaseVNode("h4", { class: "section-title" }, "新地点", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(detectedNewEntities.value.newLocations, (loc, index2) => {
                  return openBlock(), createElementBlock("div", {
                    key: "loc-" + index2,
                    class: "new-entity-item"
                  }, [
                    createBaseVNode("div", _hoisted_61, [
                      createBaseVNode("span", _hoisted_62, toDisplayString(loc.name), 1),
                      createVNode(_component_el_tag, {
                        type: getImportanceTagType(loc.suggestedImportance),
                        size: "small"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getImportanceName(loc.suggestedImportance)), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ]),
                    createBaseVNode("div", _hoisted_63, toDisplayString(loc.description), 1),
                    loc.reason ? (openBlock(), createElementBlock("div", _hoisted_64, toDisplayString(loc.reason), 1)) : createCommentVNode("", true)
                  ]);
                }), 128))
              ])) : createCommentVNode("", true),
              detectedNewEntities.value?.newItems?.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_65, [
                _cache[69] || (_cache[69] = createBaseVNode("h4", { class: "section-title" }, "新物品", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(detectedNewEntities.value.newItems, (item, index2) => {
                  return openBlock(), createElementBlock("div", {
                    key: "item-" + index2,
                    class: "new-entity-item"
                  }, [
                    createBaseVNode("div", _hoisted_66, [
                      createBaseVNode("span", _hoisted_67, toDisplayString(item.name), 1),
                      createVNode(_component_el_tag, {
                        type: getImportanceTagType(item.suggestedImportance),
                        size: "small"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(getImportanceName(item.suggestedImportance)), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ]),
                    createBaseVNode("div", _hoisted_68, toDisplayString(item.description), 1),
                    item.reason ? (openBlock(), createElementBlock("div", _hoisted_69, toDisplayString(item.reason), 1)) : createCommentVNode("", true)
                  ]);
                }), 128))
              ])) : createCommentVNode("", true)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const ChapterStage = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-a350f73b"]]);
const _hoisted_1$1 = { class: "config-container" };
const _hoisted_2$1 = { class: "type-panel" };
const _hoisted_3$1 = { class: "panel-header" };
const _hoisted_4$1 = { class: "type-list" };
const _hoisted_5$1 = ["onClick"];
const _hoisted_6$1 = { class: "type-name" };
const _hoisted_7$1 = { class: "type-code" };
const _hoisted_8$1 = { class: "level-panel" };
const _hoisted_9$1 = { class: "panel-header" };
const _hoisted_10$1 = { class: "level-list" };
const _hoisted_11$1 = { class: "level-header" };
const _hoisted_12$1 = { class: "level-index" };
const _hoisted_13$1 = { class: "level-code" };
const _hoisted_14$1 = { class: "level-desc" };
const _hoisted_15$1 = {
  key: 0,
  class: "empty-tip"
};
const _hoisted_16$1 = {
  key: 1,
  class: "empty-panel"
};
const _hoisted_17$1 = { class: "config-container" };
const _hoisted_18 = { class: "type-panel" };
const _hoisted_19 = { class: "panel-header" };
const _hoisted_20 = { class: "type-list" };
const _hoisted_21 = ["onClick"];
const _hoisted_22 = { class: "type-name" };
const _hoisted_23 = { class: "type-code" };
const _hoisted_24 = { class: "level-panel" };
const _hoisted_25 = { class: "panel-header" };
const _hoisted_26 = { class: "level-list" };
const _hoisted_27 = { class: "level-header" };
const _hoisted_28 = { class: "level-index" };
const _hoisted_29 = { class: "level-code" };
const _hoisted_30 = { class: "level-desc" };
const _hoisted_31 = {
  key: 0,
  class: "empty-tip"
};
const _hoisted_32 = {
  key: 1,
  class: "empty-panel"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ProjectSettingsDialog",
  props: {
    visible: { type: Boolean },
    projectId: {}
  },
  emits: ["update:visible"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const activeTab = ref("skills");
    const skillTypes = ref([]);
    const selectedSkillType = ref(null);
    const skillLevels = ref([]);
    const itemTypes = ref([]);
    const selectedItemType = ref(null);
    const itemLevels = ref([]);
    const showAddSkillTypeDialog = ref(false);
    const showAddSkillLevelDialog = ref(false);
    const showAddItemTypeDialog = ref(false);
    const showAddItemLevelDialog = ref(false);
    const newSkillTypeForm = ref({ code: "", name: "" });
    const newSkillLevelForm = ref({ code: "", name: "", description: "" });
    const newItemTypeForm = ref({ code: "", name: "" });
    const newItemLevelForm = ref({ code: "", name: "", description: "" });
    async function loadSkillTypes() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getSkillTypeConfigs(props.projectId);
      if (result.success) {
        skillTypes.value = result.data || [];
        if (skillTypes.value.length > 0 && !selectedSkillType.value) {
          selectSkillType(skillTypes.value[0]);
        }
      }
    }
    async function selectSkillType(type) {
      selectedSkillType.value = type;
      await loadSkillLevels();
    }
    async function loadSkillLevels() {
      if (!selectedSkillType.value) {
        skillLevels.value = [];
        return;
      }
      const result = await window.electronAPI.longwriting.getSkillLevels(props.projectId, selectedSkillType.value.code);
      if (result.success) {
        skillLevels.value = result.data || [];
      }
    }
    async function createSkillType() {
      if (!newSkillTypeForm.value.code || !newSkillTypeForm.value.name) return;
      const result = await window.electronAPI.longwriting.createSkillTypeConfig({
        projectId: props.projectId,
        code: newSkillTypeForm.value.code,
        name: newSkillTypeForm.value.name
      });
      if (result.success) {
        await loadSkillTypes();
        showAddSkillTypeDialog.value = false;
        newSkillTypeForm.value = { code: "", name: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function deleteSkillType(id) {
      try {
        await ElMessageBox.confirm("确定要删除该技能类型吗？关联的等级也会被删除。", "删除确认", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteSkillTypeConfig(id);
        if (result.success) {
          if (selectedSkillType.value?.id === id) {
            selectedSkillType.value = null;
            skillLevels.value = [];
          }
          await loadSkillTypes();
          ElMessage.success("删除成功");
        } else {
          ElMessage.error("删除失败：" + (result.error || "未知错误"));
        }
      } catch {
      }
    }
    async function createSkillLevel() {
      if (!selectedSkillType.value || !newSkillLevelForm.value.code || !newSkillLevelForm.value.name) return;
      const result = await window.electronAPI.longwriting.createSkillLevel({
        projectId: props.projectId,
        skillTypeCode: selectedSkillType.value.code,
        code: newSkillLevelForm.value.code,
        name: newSkillLevelForm.value.name,
        description: newSkillLevelForm.value.description
      });
      if (result.success) {
        await loadSkillLevels();
        showAddSkillLevelDialog.value = false;
        newSkillLevelForm.value = { code: "", name: "", description: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function updateSkillLevel(level) {
      const result = await window.electronAPI.longwriting.updateSkillLevel(level.id, {
        name: level.name,
        description: level.description
      });
      if (result.success) {
        ElMessage.success("更新成功");
      } else {
        ElMessage.error("更新失败：" + (result.error || "未知错误"));
      }
    }
    async function deleteSkillLevel(id) {
      try {
        await ElMessageBox.confirm("确定要删除该等级吗？", "删除确认", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteSkillLevel(id);
        if (result.success) {
          await loadSkillLevels();
          ElMessage.success("删除成功");
        } else {
          ElMessage.error("删除失败：" + (result.error || "未知错误"));
        }
      } catch {
      }
    }
    async function loadItemTypes() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getItemTypeConfigs(props.projectId);
      if (result.success) {
        itemTypes.value = result.data || [];
        if (itemTypes.value.length > 0 && !selectedItemType.value) {
          selectItemType(itemTypes.value[0]);
        }
      }
    }
    async function selectItemType(type) {
      selectedItemType.value = type;
      await loadItemLevels();
    }
    async function loadItemLevels() {
      if (!selectedItemType.value) {
        itemLevels.value = [];
        return;
      }
      const result = await window.electronAPI.longwriting.getItemLevels(props.projectId, selectedItemType.value.code);
      if (result.success) {
        itemLevels.value = result.data || [];
      }
    }
    async function createItemType() {
      if (!newItemTypeForm.value.code || !newItemTypeForm.value.name) return;
      const result = await window.electronAPI.longwriting.createItemTypeConfig({
        projectId: props.projectId,
        code: newItemTypeForm.value.code,
        name: newItemTypeForm.value.name
      });
      if (result.success) {
        await loadItemTypes();
        showAddItemTypeDialog.value = false;
        newItemTypeForm.value = { code: "", name: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function deleteItemType(id) {
      try {
        await ElMessageBox.confirm("确定要删除该物品类型吗？关联的等级也会被删除。", "删除确认", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteItemTypeConfig(id);
        if (result.success) {
          if (selectedItemType.value?.id === id) {
            selectedItemType.value = null;
            itemLevels.value = [];
          }
          await loadItemTypes();
          ElMessage.success("删除成功");
        } else {
          ElMessage.error("删除失败：" + (result.error || "未知错误"));
        }
      } catch {
      }
    }
    async function createItemLevel() {
      if (!selectedItemType.value || !newItemLevelForm.value.code || !newItemLevelForm.value.name) return;
      const result = await window.electronAPI.longwriting.createItemLevel({
        projectId: props.projectId,
        itemTypeCode: selectedItemType.value.code,
        code: newItemLevelForm.value.code,
        name: newItemLevelForm.value.name,
        description: newItemLevelForm.value.description
      });
      if (result.success) {
        await loadItemLevels();
        showAddItemLevelDialog.value = false;
        newItemLevelForm.value = { code: "", name: "", description: "" };
        ElMessage.success("创建成功");
      } else {
        ElMessage.error("创建失败：" + (result.error || "未知错误"));
      }
    }
    async function updateItemLevel(level) {
      const result = await window.electronAPI.longwriting.updateItemLevel(level.id, {
        name: level.name,
        description: level.description
      });
      if (result.success) {
        ElMessage.success("更新成功");
      } else {
        ElMessage.error("更新失败：" + (result.error || "未知错误"));
      }
    }
    async function deleteItemLevel(id) {
      try {
        await ElMessageBox.confirm("确定要删除该等级吗？", "删除确认", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const result = await window.electronAPI.longwriting.deleteItemLevel(id);
        if (result.success) {
          await loadItemLevels();
          ElMessage.success("删除成功");
        } else {
          ElMessage.error("删除失败：" + (result.error || "未知错误"));
        }
      } catch {
      }
    }
    async function initDefaultConfigs() {
      const result = await window.electronAPI.longwriting.initDefaultTypeConfigs(props.projectId);
      if (result.success) {
        await loadSkillTypes();
        await loadItemTypes();
      }
    }
    async function loadData() {
      await loadSkillTypes();
      await loadItemTypes();
      if (skillTypes.value.length === 0 && itemTypes.value.length === 0) {
        await initDefaultConfigs();
      }
    }
    watch(() => props.visible, (newVal) => {
      if (newVal) {
        loadData();
      }
    });
    onMounted(() => {
      if (props.visible) {
        loadData();
      }
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_tabs = resolveComponent("el-tabs");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        "model-value": __props.visible,
        "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => _ctx.$emit("update:visible", $event)),
        title: "项目设定",
        width: "1000px",
        top: "5vh",
        "destroy-on-close": ""
      }, {
        default: withCtx(() => [
          createVNode(_component_el_tabs, {
            modelValue: activeTab.value,
            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => activeTab.value = $event)
          }, {
            default: withCtx(() => [
              createVNode(_component_el_tab_pane, {
                label: "技能类型设定",
                name: "skills"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_1$1, [
                    createBaseVNode("div", _hoisted_2$1, [
                      createBaseVNode("div", _hoisted_3$1, [
                        _cache[25] || (_cache[25] = createBaseVNode("span", null, "技能类型", -1)),
                        createVNode(_component_el_button, {
                          size: "small",
                          type: "primary",
                          onClick: _cache[0] || (_cache[0] = ($event) => showAddSkillTypeDialog.value = true)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(plus_default))
                              ]),
                              _: 1
                            }),
                            _cache[24] || (_cache[24] = createTextVNode(" 添加 ", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      createBaseVNode("div", _hoisted_4$1, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(skillTypes.value, (skillType) => {
                          return openBlock(), createElementBlock("div", {
                            key: skillType.id,
                            class: normalizeClass(["type-item", { active: selectedSkillType.value?.id === skillType.id }]),
                            onClick: ($event) => selectSkillType(skillType)
                          }, [
                            createBaseVNode("div", _hoisted_6$1, toDisplayString(skillType.name), 1),
                            createBaseVNode("div", _hoisted_7$1, toDisplayString(skillType.code), 1),
                            createVNode(_component_el_button, {
                              text: "",
                              size: "small",
                              type: "danger",
                              onClick: withModifiers(($event) => deleteSkillType(skillType.id), ["stop"])
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
                          ], 10, _hoisted_5$1);
                        }), 128))
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_8$1, [
                      selectedSkillType.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createBaseVNode("div", _hoisted_9$1, [
                          createBaseVNode("span", null, toDisplayString(selectedSkillType.value.name) + " - 等级设定", 1),
                          createVNode(_component_el_button, {
                            size: "small",
                            type: "primary",
                            onClick: _cache[1] || (_cache[1] = ($event) => showAddSkillLevelDialog.value = true)
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(plus_default))
                                ]),
                                _: 1
                              }),
                              _cache[26] || (_cache[26] = createTextVNode(" 添加等级 ", -1))
                            ]),
                            _: 1
                          })
                        ]),
                        createBaseVNode("div", _hoisted_10$1, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(skillLevels.value, (level) => {
                            return openBlock(), createElementBlock("div", {
                              key: level.id,
                              class: "level-card"
                            }, [
                              createBaseVNode("div", _hoisted_11$1, [
                                createBaseVNode("span", _hoisted_12$1, toDisplayString(level.sortOrder + 1), 1),
                                createVNode(_component_el_input, {
                                  modelValue: level.name,
                                  "onUpdate:modelValue": ($event) => level.name = $event,
                                  placeholder: "等级名称",
                                  size: "small",
                                  onChange: ($event) => updateSkillLevel(level)
                                }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                                createVNode(_component_el_button, {
                                  text: "",
                                  size: "small",
                                  type: "danger",
                                  onClick: ($event) => deleteSkillLevel(level.id)
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
                              ]),
                              createBaseVNode("div", _hoisted_13$1, [
                                _cache[27] || (_cache[27] = createBaseVNode("span", null, "编码：", -1)),
                                createVNode(_component_el_input, {
                                  "model-value": level.code,
                                  size: "small",
                                  disabled: ""
                                }, null, 8, ["model-value"])
                              ]),
                              createBaseVNode("div", _hoisted_14$1, [
                                _cache[28] || (_cache[28] = createBaseVNode("span", null, "描述：", -1)),
                                createVNode(_component_el_input, {
                                  modelValue: level.description,
                                  "onUpdate:modelValue": ($event) => level.description = $event,
                                  type: "textarea",
                                  rows: 2,
                                  placeholder: "描述此等级的特征、能力等",
                                  onChange: ($event) => updateSkillLevel(level)
                                }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"])
                              ])
                            ]);
                          }), 128)),
                          skillLevels.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_15$1, " 暂无等级，请添加 ")) : createCommentVNode("", true)
                        ])
                      ], 64)) : (openBlock(), createElementBlock("div", _hoisted_16$1, " 请在左侧选择一个技能类型 "))
                    ])
                  ])
                ]),
                _: 1
              }),
              createVNode(_component_el_tab_pane, {
                label: "物品类型设定",
                name: "items"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_17$1, [
                    createBaseVNode("div", _hoisted_18, [
                      createBaseVNode("div", _hoisted_19, [
                        _cache[30] || (_cache[30] = createBaseVNode("span", null, "物品类型", -1)),
                        createVNode(_component_el_button, {
                          size: "small",
                          type: "primary",
                          onClick: _cache[2] || (_cache[2] = ($event) => showAddItemTypeDialog.value = true)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(plus_default))
                              ]),
                              _: 1
                            }),
                            _cache[29] || (_cache[29] = createTextVNode(" 添加 ", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      createBaseVNode("div", _hoisted_20, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(itemTypes.value, (itemType) => {
                          return openBlock(), createElementBlock("div", {
                            key: itemType.id,
                            class: normalizeClass(["type-item", { active: selectedItemType.value?.id === itemType.id }]),
                            onClick: ($event) => selectItemType(itemType)
                          }, [
                            createBaseVNode("div", _hoisted_22, toDisplayString(itemType.name), 1),
                            createBaseVNode("div", _hoisted_23, toDisplayString(itemType.code), 1),
                            createVNode(_component_el_button, {
                              text: "",
                              size: "small",
                              type: "danger",
                              onClick: withModifiers(($event) => deleteItemType(itemType.id), ["stop"])
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
                          ], 10, _hoisted_21);
                        }), 128))
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_24, [
                      selectedItemType.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createBaseVNode("div", _hoisted_25, [
                          createBaseVNode("span", null, toDisplayString(selectedItemType.value.name) + " - 等级设定", 1),
                          createVNode(_component_el_button, {
                            size: "small",
                            type: "primary",
                            onClick: _cache[3] || (_cache[3] = ($event) => showAddItemLevelDialog.value = true)
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(plus_default))
                                ]),
                                _: 1
                              }),
                              _cache[31] || (_cache[31] = createTextVNode(" 添加等级 ", -1))
                            ]),
                            _: 1
                          })
                        ]),
                        createBaseVNode("div", _hoisted_26, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(itemLevels.value, (level) => {
                            return openBlock(), createElementBlock("div", {
                              key: level.id,
                              class: "level-card"
                            }, [
                              createBaseVNode("div", _hoisted_27, [
                                createBaseVNode("span", _hoisted_28, toDisplayString(level.sortOrder + 1), 1),
                                createVNode(_component_el_input, {
                                  modelValue: level.name,
                                  "onUpdate:modelValue": ($event) => level.name = $event,
                                  placeholder: "等级名称",
                                  size: "small",
                                  onChange: ($event) => updateItemLevel(level)
                                }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                                createVNode(_component_el_button, {
                                  text: "",
                                  size: "small",
                                  type: "danger",
                                  onClick: ($event) => deleteItemLevel(level.id)
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
                              ]),
                              createBaseVNode("div", _hoisted_29, [
                                _cache[32] || (_cache[32] = createBaseVNode("span", null, "编码：", -1)),
                                createVNode(_component_el_input, {
                                  "model-value": level.code,
                                  size: "small",
                                  disabled: ""
                                }, null, 8, ["model-value"])
                              ]),
                              createBaseVNode("div", _hoisted_30, [
                                _cache[33] || (_cache[33] = createBaseVNode("span", null, "描述：", -1)),
                                createVNode(_component_el_input, {
                                  modelValue: level.description,
                                  "onUpdate:modelValue": ($event) => level.description = $event,
                                  type: "textarea",
                                  rows: 2,
                                  placeholder: "描述此等级的外观、能量特征等",
                                  onChange: ($event) => updateItemLevel(level)
                                }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"])
                              ])
                            ]);
                          }), 128)),
                          itemLevels.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_31, " 暂无等级，请添加 ")) : createCommentVNode("", true)
                        ])
                      ], 64)) : (openBlock(), createElementBlock("div", _hoisted_32, " 请在左侧选择一个物品类型 "))
                    ])
                  ])
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"]),
          createVNode(_component_el_dialog, {
            modelValue: showAddSkillTypeDialog.value,
            "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => showAddSkillTypeDialog.value = $event),
            title: "添加技能类型",
            width: "400px",
            "destroy-on-close": "",
            "append-to-body": ""
          }, {
            footer: withCtx(() => [
              createVNode(_component_el_button, {
                onClick: _cache[7] || (_cache[7] = ($event) => showAddSkillTypeDialog.value = false)
              }, {
                default: withCtx(() => [..._cache[34] || (_cache[34] = [
                  createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              createVNode(_component_el_button, {
                type: "primary",
                disabled: !newSkillTypeForm.value.code || !newSkillTypeForm.value.name,
                onClick: createSkillType
              }, {
                default: withCtx(() => [..._cache[35] || (_cache[35] = [
                  createTextVNode(" 创建 ", -1)
                ])]),
                _: 1
              }, 8, ["disabled"])
            ]),
            default: withCtx(() => [
              createVNode(_component_el_form, {
                model: newSkillTypeForm.value,
                "label-width": "80px"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_form_item, {
                    label: "类型编码",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newSkillTypeForm.value.code,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => newSkillTypeForm.value.code = $event),
                        placeholder: "请输入编码（英文）"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, {
                    label: "类型名称",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newSkillTypeForm.value.name,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => newSkillTypeForm.value.name = $event),
                        placeholder: "请输入名称"
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
            modelValue: showAddSkillLevelDialog.value,
            "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => showAddSkillLevelDialog.value = $event),
            title: "添加技能等级",
            width: "450px",
            "destroy-on-close": "",
            "append-to-body": ""
          }, {
            footer: withCtx(() => [
              createVNode(_component_el_button, {
                onClick: _cache[12] || (_cache[12] = ($event) => showAddSkillLevelDialog.value = false)
              }, {
                default: withCtx(() => [..._cache[36] || (_cache[36] = [
                  createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              createVNode(_component_el_button, {
                type: "primary",
                disabled: !newSkillLevelForm.value.code || !newSkillLevelForm.value.name,
                onClick: createSkillLevel
              }, {
                default: withCtx(() => [..._cache[37] || (_cache[37] = [
                  createTextVNode(" 创建 ", -1)
                ])]),
                _: 1
              }, 8, ["disabled"])
            ]),
            default: withCtx(() => [
              createVNode(_component_el_form, {
                model: newSkillLevelForm.value,
                "label-width": "80px"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_form_item, {
                    label: "等级编码",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newSkillLevelForm.value.code,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => newSkillLevelForm.value.code = $event),
                        placeholder: "请输入编码（英文）"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, {
                    label: "等级名称",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newSkillLevelForm.value.name,
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => newSkillLevelForm.value.name = $event),
                        placeholder: "请输入名称"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, { label: "等级描述" }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newSkillLevelForm.value.description,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => newSkillLevelForm.value.description = $event),
                        type: "textarea",
                        rows: 3,
                        placeholder: "描述此等级的特征、能力等"
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
            modelValue: showAddItemTypeDialog.value,
            "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => showAddItemTypeDialog.value = $event),
            title: "添加物品类型",
            width: "400px",
            "destroy-on-close": "",
            "append-to-body": ""
          }, {
            footer: withCtx(() => [
              createVNode(_component_el_button, {
                onClick: _cache[16] || (_cache[16] = ($event) => showAddItemTypeDialog.value = false)
              }, {
                default: withCtx(() => [..._cache[38] || (_cache[38] = [
                  createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              createVNode(_component_el_button, {
                type: "primary",
                disabled: !newItemTypeForm.value.code || !newItemTypeForm.value.name,
                onClick: createItemType
              }, {
                default: withCtx(() => [..._cache[39] || (_cache[39] = [
                  createTextVNode(" 创建 ", -1)
                ])]),
                _: 1
              }, 8, ["disabled"])
            ]),
            default: withCtx(() => [
              createVNode(_component_el_form, {
                model: newItemTypeForm.value,
                "label-width": "80px"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_form_item, {
                    label: "类型编码",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newItemTypeForm.value.code,
                        "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => newItemTypeForm.value.code = $event),
                        placeholder: "请输入编码（英文）"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, {
                    label: "类型名称",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newItemTypeForm.value.name,
                        "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => newItemTypeForm.value.name = $event),
                        placeholder: "请输入名称"
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
            modelValue: showAddItemLevelDialog.value,
            "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => showAddItemLevelDialog.value = $event),
            title: "添加物品等级",
            width: "450px",
            "destroy-on-close": "",
            "append-to-body": ""
          }, {
            footer: withCtx(() => [
              createVNode(_component_el_button, {
                onClick: _cache[21] || (_cache[21] = ($event) => showAddItemLevelDialog.value = false)
              }, {
                default: withCtx(() => [..._cache[40] || (_cache[40] = [
                  createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              createVNode(_component_el_button, {
                type: "primary",
                disabled: !newItemLevelForm.value.code || !newItemLevelForm.value.name,
                onClick: createItemLevel
              }, {
                default: withCtx(() => [..._cache[41] || (_cache[41] = [
                  createTextVNode(" 创建 ", -1)
                ])]),
                _: 1
              }, 8, ["disabled"])
            ]),
            default: withCtx(() => [
              createVNode(_component_el_form, {
                model: newItemLevelForm.value,
                "label-width": "80px"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_form_item, {
                    label: "等级编码",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newItemLevelForm.value.code,
                        "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => newItemLevelForm.value.code = $event),
                        placeholder: "请输入编码（英文）"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, {
                    label: "等级名称",
                    required: ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newItemLevelForm.value.name,
                        "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => newItemLevelForm.value.name = $event),
                        placeholder: "请输入名称"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_form_item, { label: "等级描述" }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: newItemLevelForm.value.description,
                        "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => newItemLevelForm.value.description = $event),
                        type: "textarea",
                        rows: 3,
                        placeholder: "描述此等级的外观、能量特征等"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["model"])
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
});
const ProjectSettingsDialog = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-2c32f6e4"]]);
const _hoisted_1 = { class: "story-editor" };
const _hoisted_2 = { class: "editor-header" };
const _hoisted_3 = { class: "header-left" };
const _hoisted_4 = { class: "header-center" };
const _hoisted_5 = { class: "project-title" };
const _hoisted_6 = { class: "header-right" };
const _hoisted_7 = { class: "stage-nav" };
const _hoisted_8 = { class: "stage-list" };
const _hoisted_9 = ["onClick"];
const _hoisted_10 = { class: "stage-number" };
const _hoisted_11 = { class: "stage-info" };
const _hoisted_12 = { class: "stage-label" };
const _hoisted_13 = { class: "nav-model-selector" };
const _hoisted_14 = { class: "model-option" };
const _hoisted_15 = { class: "model-name" };
const _hoisted_16 = { class: "model-context" };
const _hoisted_17 = { class: "preview-content" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  ...{
    name: "StoryEditor"
  },
  __name: "StoryEditor",
  setup(__props) {
    const route = useRoute();
    const router = useRouter();
    const tabsStore = useTabsStore();
    const projectId = computed(() => route.params.id);
    const project = ref(null);
    const currentStage = ref("overview");
    const showPreview = ref(false);
    const showSettingsDialog = ref(false);
    const providerConfigs = ref([]);
    const providerTemplates = ref([]);
    const selectedModelKey = ref("");
    const modelSearchKeyword = ref("");
    const loadingModels = ref(true);
    function isTextModel(type) {
      return type === void 0 || type === "text" || type === "multimodal";
    }
    function isImageModel(type) {
      return type === "image";
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
          result.push({
            id: config.id,
            name: config.name,
            shortId: config.shortId || config.name,
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
        const models = [];
        const template = providerTemplates.value.find((t) => t.id === config.templateId);
        if (config.models && config.models.length > 0) {
          for (const model of config.models) {
            if (isImageModel(model.type)) {
              models.push({
                id: model.id,
                name: model.name
              });
            }
          }
        } else if (template && template.models.length > 0) {
          for (const model of template.models) {
            if (isImageModel(model.type)) {
              models.push({
                id: model.id,
                name: model.name || model.id
              });
            }
          }
        }
        if (models.length > 0) {
          result.push({
            id: config.id,
            name: config.name,
            shortId: config.shortId || config.name,
            models
          });
        }
      }
      return result;
    });
    const filteredProviderModels = computed(() => {
      if (!modelSearchKeyword.value) {
        return providerModels.value;
      }
      const keyword = modelSearchKeyword.value.toLowerCase();
      const result = [];
      for (const provider of providerModels.value) {
        const filteredModels = provider.models.filter(
          (model) => model.name.toLowerCase().includes(keyword) || model.id.toLowerCase().includes(keyword) || provider.name.toLowerCase().includes(keyword) || provider.shortId.toLowerCase().includes(keyword)
        );
        if (filteredModels.length > 0) {
          result.push({ ...provider, models: filteredModels });
        }
      }
      return result;
    });
    function filterModels(keyword) {
      modelSearchKeyword.value = keyword;
    }
    function formatContext(contextWindow) {
      if (contextWindow >= 1e6) {
        return `${(contextWindow / 1e6).toFixed(1)}M`;
      }
      if (contextWindow >= 1e3) {
        return `${Math.round(contextWindow / 1e3)}K`;
      }
      return `${contextWindow}`;
    }
    async function loadProviderConfigs() {
      loadingModels.value = true;
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
            if (firstProvider.models.length > 0) {
              selectedModelKey.value = `${firstProvider.id}:${firstProvider.models[0].id}`;
            }
          }
        }
      } catch (error) {
        console.error("加载提供商配置失败:", error);
      } finally {
        loadingModels.value = false;
      }
    }
    const selectedModel = computed(() => {
      if (!selectedModelKey.value) return null;
      const [providerId, modelId] = selectedModelKey.value.split(":");
      return { providerId, modelId };
    });
    provide("selectedModel", selectedModel);
    provide("selectedModelKey", selectedModelKey);
    provide("imageProviderModels", imageProviderModels);
    const storyStages = [
      { key: "overview", label: "故事概要" },
      { key: "background", label: "背景设定" },
      { key: "characters", label: "角色设定" },
      { key: "skills", label: "技能物品" },
      { key: "plot", label: "故事情节" },
      { key: "outline", label: "大纲设计" },
      { key: "chapters", label: "章节写作" }
    ];
    provide("projectId", projectId);
    function goBack() {
      router.push("/longwriting");
    }
    function setStage(stage) {
      currentStage.value = stage;
    }
    function isStageCompleted(stage) {
      const stageOrder = storyStages.map((s) => s.key);
      const currentIndex = stageOrder.indexOf(currentStage.value);
      const stageIndex = stageOrder.indexOf(stage);
      return stageIndex < currentIndex;
    }
    function updateProgress(progress) {
      console.log("更新进度:", progress);
    }
    function skipToOutline() {
      setStage("outline");
    }
    async function loadProject() {
      const result = await window.electronAPI.longwriting.getProject(projectId.value);
      if (result.success && result.data) {
        project.value = result.data;
        currentStage.value = result.data.stage;
        tabsStore.updateTabTitle(route.path, result.data.name);
      } else {
        ElMessage.error("加载项目失败：" + (result.error || "未知错误"));
      }
    }
    onMounted(() => {
      loadProject();
      loadProviderConfigs();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createVNode(_component_el_button, { onClick: goBack }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_left_default))
                  ]),
                  _: 1
                }),
                _cache[5] || (_cache[5] = createTextVNode(" 返回 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("span", _hoisted_5, toDisplayString(project.value?.name || "加载中..."), 1)
          ]),
          createBaseVNode("div", _hoisted_6, [
            createVNode(_component_el_button, {
              onClick: _cache[0] || (_cache[0] = ($event) => showPreview.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(view_default))
                  ]),
                  _: 1
                }),
                _cache[6] || (_cache[6] = createTextVNode(" 设定集 ", -1))
              ]),
              _: 1
            }),
            createVNode(_component_el_button, {
              onClick: _cache[1] || (_cache[1] = ($event) => showSettingsDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(setting_default))
                  ]),
                  _: 1
                }),
                _cache[7] || (_cache[7] = createTextVNode(" 设定 ", -1))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_7, [
          createBaseVNode("div", _hoisted_8, [
            (openBlock(), createElementBlock(Fragment, null, renderList(storyStages, (stage, index2) => {
              return createBaseVNode("div", {
                key: stage.key,
                class: normalizeClass(["stage-item", { active: currentStage.value === stage.key, completed: isStageCompleted(stage.key) }]),
                onClick: ($event) => setStage(stage.key)
              }, [
                createBaseVNode("div", _hoisted_10, toDisplayString(index2 + 1), 1),
                createBaseVNode("div", _hoisted_11, [
                  createBaseVNode("span", _hoisted_12, toDisplayString(stage.label), 1)
                ])
              ], 10, _hoisted_9);
            }), 64))
          ]),
          createBaseVNode("div", _hoisted_13, [
            createVNode(_component_el_select, {
              modelValue: selectedModelKey.value,
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => selectedModelKey.value = $event),
              placeholder: "选择模型",
              class: "model-select",
              filterable: "",
              "filter-method": filterModels,
              loading: loadingModels.value
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
                          label: `${provider.shortId}/${model.name}`,
                          value: `${provider.id}:${model.id}`
                        }, {
                          default: withCtx(() => [
                            createBaseVNode("div", _hoisted_14, [
                              createBaseVNode("span", _hoisted_15, toDisplayString(provider.shortId) + "/" + toDisplayString(model.name), 1),
                              createBaseVNode("span", _hoisted_16, toDisplayString(formatContext(model.contextWindow)), 1)
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
            }, 8, ["modelValue", "loading"])
          ])
        ]),
        createBaseVNode("div", {
          class: normalizeClass(["editor-content", { "no-scroll": currentStage.value === "chapters" }])
        }, [
          currentStage.value === "overview" ? (openBlock(), createBlock(OverviewStage, {
            key: 0,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "plot" ? (openBlock(), createBlock(PlotStage, {
            key: 1,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "background" ? (openBlock(), createBlock(BackgroundStage, {
            key: 2,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "characters" ? (openBlock(), createBlock(CharacterStage, {
            key: 3,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "skills" ? (openBlock(), createBlock(SkillItemStage, {
            key: 4,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress,
            onSkip: skipToOutline
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "outline" ? (openBlock(), createBlock(OutlineStage, {
            key: 5,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "chapters" ? (openBlock(), createBlock(ChapterStage, {
            key: 6,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true)
        ], 2),
        createVNode(_component_el_dialog, {
          modelValue: showPreview.value,
          "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => showPreview.value = $event),
          title: "设定集预览",
          width: "90%",
          top: "5vh"
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_17, [
              createVNode(_component_el_empty, { description: "设定集预览功能开发中..." })
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(ProjectSettingsDialog, {
          visible: showSettingsDialog.value,
          "onUpdate:visible": _cache[4] || (_cache[4] = ($event) => showSettingsDialog.value = $event),
          "project-id": projectId.value
        }, null, 8, ["visible", "project-id"])
      ]);
    };
  }
});
const StoryEditor = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-32033863"]]);
export {
  StoryEditor as default
};
