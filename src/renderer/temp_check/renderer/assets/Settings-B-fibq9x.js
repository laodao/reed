import { d as defineComponent, w as watch, C as createElementBlock, G as Fragment, b as createVNode, a as withCtx, D as createBaseVNode, M as unref, ad as loading_default, H as renderList, e as createTextVNode, Y as createCommentVNode, J as normalizeClass, B as setting_default, aJ as list_default, ah as withDirectives, aK as vShow, L as toDisplayString, c as createBlock, $ as info_filled_default, P as plus_default, aL as refresh_default, h as computed, r as ref, R as reactive, E as ElMessage, f as resolveComponent, o as openBlock, U as delete_default, _ as _export_sfc, aM as useTheme, O as onMounted, aN as availableThemes, S as folder_opened_default, al as folder_default, aq as download_default, ag as upload_default, aO as useAppSettings, V as ElMessageBox, at as normalizeStyle, aP as Transition, aQ as check_default, am as more_filled_default } from "./index-CEiunyEa.js";
const _hoisted_1$2 = {
  key: 0,
  class: "template-select"
};
const _hoisted_2$2 = {
  key: 0,
  class: "loading-templates"
};
const _hoisted_3$2 = {
  key: 1,
  class: "template-grid"
};
const _hoisted_4$2 = ["onClick"];
const _hoisted_5$2 = { class: "template-icon" };
const _hoisted_6$2 = { class: "template-info" };
const _hoisted_7$2 = { class: "template-name" };
const _hoisted_8$2 = { class: "template-desc" };
const _hoisted_9$2 = {
  key: 2,
  class: "load-error"
};
const _hoisted_10$2 = {
  key: 1,
  class: "provider-content"
};
const _hoisted_11$2 = { class: "provider-tabs" };
const _hoisted_12$2 = { class: "provider-main" };
const _hoisted_13$2 = { class: "tab-content info-tab" };
const _hoisted_14$2 = {
  key: 0,
  class: "selected-template"
};
const _hoisted_15$2 = { class: "template-icon-lg" };
const _hoisted_16$2 = { class: "template-details" };
const _hoisted_17$2 = { class: "template-name" };
const _hoisted_18$2 = { class: "template-desc" };
const _hoisted_19$1 = { class: "access-key-hint" };
const _hoisted_20$1 = { class: "multimodal-urls-hint" };
const _hoisted_21$1 = { class: "custom-headers" };
const _hoisted_22$1 = { class: "tab-content models-tab" };
const _hoisted_23$1 = { class: "model-section" };
const _hoisted_24$1 = { class: "section-header" };
const _hoisted_25$1 = {
  key: 0,
  class: "model-list api-models"
};
const _hoisted_26$1 = { class: "model-card-main" };
const _hoisted_27$1 = { class: "model-card-info" };
const _hoisted_28$1 = { class: "model-name" };
const _hoisted_29$1 = { class: "model-id" };
const _hoisted_30$1 = { class: "model-card-features" };
const _hoisted_31$1 = { class: "model-card-actions" };
const _hoisted_32$1 = {
  key: 1,
  class: "enabled-label"
};
const _hoisted_33$1 = {
  key: 1,
  class: "empty-hint"
};
const _hoisted_34$1 = { class: "model-section" };
const _hoisted_35$1 = { class: "section-header" };
const _hoisted_36$1 = {
  key: 0,
  class: "model-list enabled-models"
};
const _hoisted_37$1 = { class: "model-card-main" };
const _hoisted_38$1 = { class: "model-card-info" };
const _hoisted_39$1 = { class: "model-name" };
const _hoisted_40$1 = { class: "model-id" };
const _hoisted_41$1 = { class: "model-card-features" };
const _hoisted_42$1 = { class: "model-card-actions" };
const _hoisted_43$1 = {
  key: 1,
  class: "empty-hint"
};
const _hoisted_44$1 = { class: "dialog-footer" };
const _hoisted_45$1 = {
  key: 0,
  class: "form-hint"
};
const _hoisted_46$1 = { class: "model-capabilities" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "AddProviderDialog",
  props: {
    modelValue: { type: Boolean },
    editConfig: {}
  },
  emits: ["update:modelValue", "saved"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const visible = computed({
      get: () => props.modelValue,
      set: (val) => emit("update:modelValue", val)
    });
    const isEdit = computed(() => !!props.editConfig);
    const templates = ref([]);
    const selectedTemplate = ref(null);
    const formRef = ref();
    const form = reactive({
      name: "",
      shortId: "",
      apiKey: "",
      accessKeyId: "",
      accessKeySecret: "",
      baseUrl: "",
      imageBaseUrl: "",
      videoBaseUrl: "",
      audioBaseUrl: "",
      customHeaders: {},
      models: [],
      // 统一使用 models 存储所有启用的模型
      isDefault: false
    });
    const customHeadersList = ref([]);
    const activeCollapse = ref([]);
    const activeTab = ref("info");
    const saving = ref(false);
    const testing = ref(false);
    const loadingModels = ref(false);
    const loadingTemplates = ref(false);
    const showAddCustomModel = ref(false);
    const isEditingCustomModel = ref(false);
    const editingModelId = ref(null);
    const isEditingApiModel = ref(false);
    const customModelForm = reactive({
      id: "",
      name: "",
      contextWindow: 8192,
      type: "text",
      supportsThinking: false,
      supportsWebSearch: false,
      supportsTools: false
    });
    const apiModels = ref([]);
    const isCustomModel = (modelId) => {
      return !apiModels.value.some((m) => m.id === modelId);
    };
    const isModelEnabled = (modelId) => {
      return form.models.some((m) => m.id === modelId);
    };
    const addApiModelToEnabled = (model) => {
      if (form.models.some((m) => m.id === model.id)) {
        ElMessage.warning("该模型已在启用列表中");
        return;
      }
      isEditingCustomModel.value = false;
      isEditingApiModel.value = true;
      editingModelId.value = model.id;
      customModelForm.id = model.id;
      customModelForm.name = model.name || model.id;
      customModelForm.contextWindow = model.contextWindow || 8192;
      customModelForm.type = model.type || "text";
      customModelForm.supportsThinking = model.supportsThinking || false;
      customModelForm.supportsWebSearch = model.supportsWebSearch || false;
      customModelForm.supportsTools = model.supportsTools || false;
      showAddCustomModel.value = true;
    };
    const addModelToEnabled = addApiModelToEnabled;
    const removeModelFromEnabled = (modelId) => {
      const index = form.models.findIndex((m) => m.id === modelId);
      if (index > -1) {
        form.models.splice(index, 1);
        ElMessage.success("已从启用列表移除");
      }
    };
    const enabledModelsWithInfo = computed(() => {
      return form.models;
    });
    const enabledModelList = enabledModelsWithInfo;
    const templateAuthType = computed(() => selectedTemplate.value?.apiConfig.authType || "bearer");
    const defaultBaseUrl = computed(() => selectedTemplate.value?.apiConfig.baseUrl);
    const defaultImageBaseUrl = computed(() => selectedTemplate.value?.apiConfig.imageBaseUrl);
    const defaultVideoBaseUrl = computed(() => selectedTemplate.value?.apiConfig.videoBaseUrl);
    const defaultAudioBaseUrl = computed(() => selectedTemplate.value?.apiConfig.audioBaseUrl);
    const rules = {
      name: [{ required: true, message: "请输入配置名称", trigger: "blur" }],
      apiKey: [
        {
          required: computed(() => templateAuthType.value !== "none" && !isEdit.value),
          message: "请输入 API 密钥",
          trigger: "blur"
        }
      ]
    };
    const loadTemplates = async () => {
      loadingTemplates.value = true;
      try {
        const result = await window.electronAPI.providerTemplate.list();
        console.log("加载模板结果:", result);
        if (result.success && result.templates) {
          templates.value = result.templates;
        } else {
          console.error("加载模板失败:", result.error);
          ElMessage.error(result.error || "加载模板列表失败");
        }
      } catch (error) {
        console.error("加载模板列表失败:", error);
        ElMessage.error("加载模板列表失败");
      } finally {
        loadingTemplates.value = false;
      }
    };
    const selectTemplate = (template) => {
      selectedTemplate.value = template;
      form.name = `我的 ${template.name}`;
      form.baseUrl = "";
      form.apiKey = "";
      form.models = [];
      customHeadersList.value = [];
      apiModels.value = [];
    };
    const fetchModelsFromApi = async () => {
      if (!selectedTemplate.value && !isEdit.value) return;
      if (!isEdit.value && templateAuthType.value !== "none" && !form.apiKey) {
        return;
      }
      loadingModels.value = true;
      try {
        const result = await window.electronAPI.providerConfig.test({
          configId: isEdit.value ? props.editConfig?.id : void 0,
          templateId: selectedTemplate.value?.id,
          apiKey: form.apiKey || void 0,
          accessKeyId: form.accessKeyId || void 0,
          accessKeySecret: form.accessKeySecret || void 0,
          baseUrl: form.baseUrl || void 0
        });
        if (result.success && result.models) {
          console.log("[fetchModelsFromApi] 获取到的模型:", result.models.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            supportsThinking: m.supportsThinking,
            supportsWebSearch: m.supportsWebSearch,
            supportsTools: m.supportsTools
          })));
          console.log("[fetchModelsFromApi] 当前 models:", [...form.models]);
          console.log("[fetchModelsFromApi] 当前 isEdit:", isEdit.value);
          apiModels.value = result.models;
          ElMessage.success(`获取到 ${result.models.length} 个模型，请勾选需要启用的模型`);
        } else {
          ElMessage.warning(result.message || "获取模型列表失败");
        }
      } catch (error) {
        console.error("获取模型列表失败:", error);
        ElMessage.error("获取模型列表失败");
      } finally {
        loadingModels.value = false;
      }
    };
    const handleTest = async () => {
      if (!selectedTemplate.value && !isEdit.value) return;
      testing.value = true;
      try {
        const result = await window.electronAPI.providerConfig.test({
          configId: isEdit.value ? props.editConfig?.id : void 0,
          templateId: selectedTemplate.value?.id,
          apiKey: form.apiKey || void 0,
          accessKeyId: form.accessKeyId || void 0,
          accessKeySecret: form.accessKeySecret || void 0,
          baseUrl: form.baseUrl || void 0
        });
        if (result.success) {
          ElMessage.success("连接成功");
          if (result.models && result.models.length > 0) {
            apiModels.value = result.models;
          }
        } else {
          ElMessage.error(result.message || "连接失败");
        }
      } catch (error) {
        console.error("测试连接失败:", error);
        ElMessage.error("测试连接失败");
      } finally {
        testing.value = false;
      }
    };
    const handleSave = async () => {
      if (!formRef.value) return;
      try {
        await formRef.value.validate();
      } catch {
        return;
      }
      const customHeaders = {};
      customHeadersList.value.forEach((h) => {
        if (h.key && h.value) {
          customHeaders[h.key] = h.value;
        }
      });
      saving.value = true;
      try {
        const safeStringify = (obj) => {
          try {
            return JSON.parse(JSON.stringify(obj));
          } catch {
            return void 0;
          }
        };
        const modelsToSave = safeStringify(form.models) || [];
        console.log("[handleSave] 准备保存配置, models:", modelsToSave);
        if (isEdit.value && props.editConfig) {
          const result = await window.electronAPI.providerConfig.update(props.editConfig.id, {
            name: form.name,
            shortId: form.shortId || void 0,
            apiKey: form.apiKey || void 0,
            accessKeyId: form.accessKeyId || void 0,
            accessKeySecret: form.accessKeySecret || void 0,
            baseUrl: form.baseUrl || void 0,
            imageBaseUrl: form.imageBaseUrl || void 0,
            videoBaseUrl: form.videoBaseUrl || void 0,
            audioBaseUrl: form.audioBaseUrl || void 0,
            customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : void 0,
            models: modelsToSave.length > 0 ? modelsToSave : void 0,
            isDefault: form.isDefault
          });
          if (result.success) {
            ElMessage.success("配置已更新");
            emit("saved");
            handleClose();
          } else {
            ElMessage.error(result.error || "更新失败");
          }
        } else if (selectedTemplate.value) {
          const result = await window.electronAPI.providerConfig.create({
            templateId: selectedTemplate.value.id,
            name: form.name,
            shortId: form.shortId || void 0,
            apiKey: form.apiKey || void 0,
            accessKeyId: form.accessKeyId || void 0,
            accessKeySecret: form.accessKeySecret || void 0,
            baseUrl: form.baseUrl || void 0,
            imageBaseUrl: form.imageBaseUrl || void 0,
            videoBaseUrl: form.videoBaseUrl || void 0,
            audioBaseUrl: form.audioBaseUrl || void 0,
            customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : void 0,
            models: modelsToSave.length > 0 ? modelsToSave : void 0,
            isDefault: form.isDefault
          });
          if (result.success && result.config) {
            try {
              await window.electronAPI.providerConfig.test({
                configId: result.config.id
              });
            } catch (testError) {
              console.warn("创建后测试连接失败:", testError);
            }
            ElMessage.success("配置已保存");
            emit("saved");
            handleClose();
          } else {
            ElMessage.error(result.error || "保存失败");
          }
        }
      } catch (error) {
        console.error("保存配置失败:", error);
        ElMessage.error("保存配置失败");
      } finally {
        saving.value = false;
      }
    };
    const handleClose = () => {
      visible.value = false;
      selectedTemplate.value = null;
      formRef.value?.resetFields();
      form.name = "";
      form.shortId = "";
      form.apiKey = "";
      form.accessKeyId = "";
      form.accessKeySecret = "";
      form.baseUrl = "";
      form.customHeaders = {};
      form.models = [];
      form.isDefault = false;
      customHeadersList.value = [];
      apiModels.value = [];
      activeCollapse.value = [];
      loadingModels.value = false;
      saving.value = false;
      testing.value = false;
    };
    const addCustomHeader = () => {
      customHeadersList.value.push({ key: "", value: "" });
    };
    const removeCustomHeader = (index) => {
      customHeadersList.value.splice(index, 1);
    };
    const showAddCustomModelDialog = () => {
      isEditingCustomModel.value = false;
      isEditingApiModel.value = false;
      editingModelId.value = null;
      customModelForm.id = "";
      customModelForm.name = "";
      customModelForm.contextWindow = 8192;
      customModelForm.type = "text";
      customModelForm.supportsThinking = false;
      customModelForm.supportsWebSearch = false;
      customModelForm.supportsTools = false;
      showAddCustomModel.value = true;
    };
    const editModelCapabilities = (model) => {
      isEditingCustomModel.value = true;
      isEditingApiModel.value = !isCustomModel(model.id);
      editingModelId.value = model.id;
      customModelForm.id = model.id;
      customModelForm.name = model.name;
      customModelForm.contextWindow = model.contextWindow || 8192;
      customModelForm.type = model.type || "text";
      customModelForm.supportsThinking = model.supportsThinking || false;
      customModelForm.supportsWebSearch = model.supportsWebSearch || false;
      customModelForm.supportsTools = model.supportsTools || false;
      showAddCustomModel.value = true;
    };
    const saveCustomModel = () => {
      if (!customModelForm.id) {
        ElMessage.warning("请输入模型 ID");
        return;
      }
      const modelData = {
        id: customModelForm.id,
        name: customModelForm.name || customModelForm.id,
        type: customModelForm.type,
        contextWindow: customModelForm.contextWindow,
        maxOutputTokens: 4096,
        features: ["chat", "streaming"],
        supportsThinking: customModelForm.supportsThinking,
        supportsWebSearch: customModelForm.supportsWebSearch,
        supportsTools: customModelForm.supportsTools
      };
      if (isEditingApiModel.value) {
        const index = apiModels.value.findIndex((m) => m.id === editingModelId.value);
        if (index > -1) {
          apiModels.value[index] = {
            ...apiModels.value[index],
            ...modelData
          };
        }
        const existingIndex = form.models.findIndex((m) => m.id === customModelForm.id);
        if (existingIndex > -1) {
          form.models[existingIndex] = modelData;
        } else {
          form.models.push(modelData);
        }
      } else if (isEditingCustomModel.value && editingModelId.value) {
        const index = form.models.findIndex((m) => m.id === editingModelId.value);
        if (index > -1) {
          form.models[index] = modelData;
        }
      } else {
        if (form.models.some((m) => m.id === customModelForm.id)) {
          ElMessage.warning("该模型 ID 已存在");
          return;
        }
        form.models.push(modelData);
      }
      customModelForm.id = "";
      customModelForm.name = "";
      customModelForm.contextWindow = 8192;
      customModelForm.type = "text";
      customModelForm.supportsThinking = false;
      customModelForm.supportsWebSearch = false;
      customModelForm.supportsTools = false;
      isEditingCustomModel.value = false;
      isEditingApiModel.value = false;
      editingModelId.value = null;
      showAddCustomModel.value = false;
      ElMessage.success("模型已保存");
    };
    watch(
      () => props.editConfig,
      (config) => {
        console.log("[watch editConfig] 触发, config:", config);
        if (config) {
          form.name = config.name;
          form.shortId = config.shortId || "";
          form.apiKey = "";
          form.accessKeyId = config.accessKeyId || "";
          form.accessKeySecret = "";
          form.baseUrl = config.baseUrl || "";
          form.imageBaseUrl = config.imageBaseUrl || "";
          form.videoBaseUrl = config.videoBaseUrl || "";
          form.audioBaseUrl = config.audioBaseUrl || "";
          form.isDefault = config.isDefault;
          if (config.models && config.models.length > 0) {
            form.models = [...config.models];
          } else {
            form.models = [];
          }
          apiModels.value = [];
          if (config.customHeaders) {
            customHeadersList.value = Object.entries(config.customHeaders).map(([key, value]) => ({
              key,
              value
            }));
          } else {
            customHeadersList.value = [];
          }
          const template = templates.value.find((t) => t.id === config.templateId);
          console.log("[watch editConfig] 找到模板:", template ? template.name : null, "templates数量:", templates.value.length);
          if (template) {
            selectedTemplate.value = template;
          } else {
            console.log("[watch editConfig] 模板未找到，等待加载...");
          }
        } else {
          selectedTemplate.value = null;
        }
      },
      { immediate: true }
    );
    watch(
      templates,
      (newTemplates) => {
        if (props.editConfig && !selectedTemplate.value && newTemplates.length > 0) {
          const template = newTemplates.find((t) => t.id === props.editConfig.templateId);
          if (template) {
            selectedTemplate.value = template;
          }
        }
      },
      { deep: true }
    );
    watch(visible, (val) => {
      if (val) {
        loadTemplates();
      }
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_divider = resolveComponent("el-divider");
      const _component_el_collapse_item = resolveComponent("el-collapse-item");
      const _component_el_collapse = resolveComponent("el-collapse");
      const _component_el_switch = resolveComponent("el-switch");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_checkbox = resolveComponent("el-checkbox");
      return openBlock(), createElementBlock(Fragment, null, [
        createVNode(_component_el_dialog, {
          modelValue: visible.value,
          "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => visible.value = $event),
          title: isEdit.value ? "编辑提供商配置" : "添加提供商",
          width: "960px",
          "close-on-click-modal": false,
          class: "add-provider-dialog",
          onClose: handleClose
        }, {
          footer: withCtx(() => [
            createBaseVNode("div", _hoisted_44$1, [
              !isEdit.value && selectedTemplate.value ? (openBlock(), createBlock(_component_el_button, {
                key: 0,
                onClick: _cache[13] || (_cache[13] = ($event) => selectedTemplate.value = null)
              }, {
                default: withCtx(() => [..._cache[68] || (_cache[68] = [
                  createTextVNode(" 返回 ", -1)
                ])]),
                _: 1
              })) : createCommentVNode("", true),
              createVNode(_component_el_button, { onClick: handleClose }, {
                default: withCtx(() => [..._cache[69] || (_cache[69] = [
                  createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              selectedTemplate.value || isEdit.value ? (openBlock(), createBlock(_component_el_button, {
                key: 1,
                loading: testing.value,
                onClick: handleTest
              }, {
                default: withCtx(() => [..._cache[70] || (_cache[70] = [
                  createTextVNode(" 测试连接 ", -1)
                ])]),
                _: 1
              }, 8, ["loading"])) : createCommentVNode("", true),
              selectedTemplate.value || isEdit.value ? (openBlock(), createBlock(_component_el_button, {
                key: 2,
                type: "primary",
                loading: saving.value,
                onClick: handleSave
              }, {
                default: withCtx(() => [..._cache[71] || (_cache[71] = [
                  createTextVNode(" 保存 ", -1)
                ])]),
                _: 1
              }, 8, ["loading"])) : createCommentVNode("", true)
            ])
          ]),
          default: withCtx(() => [
            !isEdit.value && !selectedTemplate.value ? (openBlock(), createElementBlock("div", _hoisted_1$2, [
              _cache[27] || (_cache[27] = createBaseVNode("h4", null, "选择提供商类型", -1)),
              loadingTemplates.value ? (openBlock(), createElementBlock("div", _hoisted_2$2, [
                createVNode(_component_el_icon, { class: "is-loading" }, {
                  default: withCtx(() => [
                    createVNode(unref(loading_default))
                  ]),
                  _: 1
                }),
                _cache[24] || (_cache[24] = createBaseVNode("span", null, "正在加载提供商模板...", -1))
              ])) : templates.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_3$2, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(templates.value, (template) => {
                  return openBlock(), createElementBlock("div", {
                    key: template.id,
                    class: "template-card",
                    onClick: ($event) => selectTemplate(template)
                  }, [
                    createBaseVNode("div", _hoisted_5$2, toDisplayString(template.icon), 1),
                    createBaseVNode("div", _hoisted_6$2, [
                      createBaseVNode("span", _hoisted_7$2, toDisplayString(template.name), 1),
                      createBaseVNode("span", _hoisted_8$2, toDisplayString(template.description), 1)
                    ])
                  ], 8, _hoisted_4$2);
                }), 128))
              ])) : (openBlock(), createElementBlock("div", _hoisted_9$2, [
                _cache[26] || (_cache[26] = createBaseVNode("span", null, "加载模板失败", -1)),
                createVNode(_component_el_button, {
                  type: "primary",
                  text: "",
                  onClick: loadTemplates
                }, {
                  default: withCtx(() => [..._cache[25] || (_cache[25] = [
                    createTextVNode("重试", -1)
                  ])]),
                  _: 1
                })
              ]))
            ])) : createCommentVNode("", true),
            selectedTemplate.value || isEdit.value ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
              createBaseVNode("div", _hoisted_11$2, [
                createBaseVNode("div", {
                  class: normalizeClass(["tab-item", { active: activeTab.value === "info" }]),
                  onClick: _cache[0] || (_cache[0] = ($event) => activeTab.value = "info")
                }, [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(setting_default))
                    ]),
                    _: 1
                  }),
                  _cache[28] || (_cache[28] = createBaseVNode("span", null, "提供商信息", -1))
                ], 2),
                createBaseVNode("div", {
                  class: normalizeClass(["tab-item", { active: activeTab.value === "models" }]),
                  onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "models")
                }, [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(list_default))
                    ]),
                    _: 1
                  }),
                  _cache[29] || (_cache[29] = createBaseVNode("span", null, "模型管理", -1))
                ], 2)
              ]),
              createBaseVNode("div", _hoisted_12$2, [
                withDirectives(createBaseVNode("div", _hoisted_13$2, [
                  createVNode(_component_el_form, {
                    ref_key: "formRef",
                    ref: formRef,
                    model: form,
                    rules,
                    "label-width": "100px",
                    class: "config-form"
                  }, {
                    default: withCtx(() => [
                      !isEdit.value && selectedTemplate.value ? (openBlock(), createElementBlock("div", _hoisted_14$2, [
                        createBaseVNode("span", _hoisted_15$2, toDisplayString(selectedTemplate.value.icon), 1),
                        createBaseVNode("div", _hoisted_16$2, [
                          createBaseVNode("span", _hoisted_17$2, toDisplayString(selectedTemplate.value.name), 1),
                          createBaseVNode("span", _hoisted_18$2, toDisplayString(selectedTemplate.value.description), 1)
                        ])
                      ])) : createCommentVNode("", true),
                      createVNode(_component_el_form_item, {
                        label: "配置名称",
                        prop: "name"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_input, {
                            modelValue: form.name,
                            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.name = $event),
                            placeholder: "如：我的 OpenAI"
                          }, null, 8, ["modelValue"])
                        ]),
                        _: 1
                      }),
                      createVNode(_component_el_form_item, {
                        label: "提供商 ID",
                        prop: "shortId"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_input, {
                            modelValue: form.shortId,
                            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.shortId = $event),
                            placeholder: "如：openai、deepseek（英文，用于模型显示）",
                            disabled: !!isEdit.value && !!__props.editConfig?.shortId
                          }, null, 8, ["modelValue", "disabled"]),
                          _cache[30] || (_cache[30] = createBaseVNode("div", { class: "form-hint" }, "提供商 ID 用于模型显示，格式为：提供商ID/模型ID", -1))
                        ]),
                        _: 1
                      }),
                      templateAuthType.value !== "none" ? (openBlock(), createBlock(_component_el_form_item, {
                        key: 1,
                        label: "API 密钥",
                        prop: isEdit.value ? void 0 : "apiKey"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_input, {
                            modelValue: form.apiKey,
                            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.apiKey = $event),
                            type: "password",
                            "show-password": "",
                            placeholder: isEdit.value ? "留空保持不变" : "请输入 API 密钥"
                          }, null, 8, ["modelValue", "placeholder"])
                        ]),
                        _: 1
                      }, 8, ["prop"])) : createCommentVNode("", true),
                      selectedTemplate.value?.apiConfig?.requiresAccessKeyForModels ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                        createVNode(_component_el_form_item, { label: "Access Key ID" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input, {
                              modelValue: form.accessKeyId,
                              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.accessKeyId = $event),
                              placeholder: isEdit.value ? "留空保持不变" : "请输入 Access Key ID"
                            }, null, 8, ["modelValue", "placeholder"])
                          ]),
                          _: 1
                        }),
                        createVNode(_component_el_form_item, { label: "Access Key Secret" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input, {
                              modelValue: form.accessKeySecret,
                              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.accessKeySecret = $event),
                              type: "password",
                              "show-password": "",
                              placeholder: isEdit.value ? "留空保持不变" : "请输入 Access Key Secret"
                            }, null, 8, ["modelValue", "placeholder"])
                          ]),
                          _: 1
                        }),
                        createBaseVNode("div", _hoisted_19$1, [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(info_filled_default))
                            ]),
                            _: 1
                          }),
                          _cache[31] || (_cache[31] = createBaseVNode("span", null, 'Access Key 用于获取模型列表，API 密钥用于对话。可在火山引擎控制台的"API 访问密钥"中创建。', -1))
                        ])
                      ], 64)) : createCommentVNode("", true),
                      createVNode(_component_el_collapse, {
                        modelValue: activeCollapse.value,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => activeCollapse.value = $event),
                        class: "advanced-settings"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_collapse_item, {
                            title: "高级设置",
                            name: "advanced"
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_form_item, { label: "API 端点" }, {
                                default: withCtx(() => [
                                  createVNode(_component_el_input, {
                                    modelValue: form.baseUrl,
                                    "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.baseUrl = $event),
                                    placeholder: defaultBaseUrl.value || "自定义 API 端点（用于文本对话）"
                                  }, null, 8, ["modelValue", "placeholder"]),
                                  _cache[32] || (_cache[32] = createBaseVNode("div", { class: "form-hint" }, "用于文本对话的 API 端点", -1))
                                ]),
                                _: 1
                              }),
                              createVNode(_component_el_divider, { "content-position": "left" }, {
                                default: withCtx(() => [..._cache[33] || (_cache[33] = [
                                  createTextVNode("多模态 API 端点", -1)
                                ])]),
                                _: 1
                              }),
                              createBaseVNode("div", _hoisted_20$1, [
                                createVNode(_component_el_icon, null, {
                                  default: withCtx(() => [
                                    createVNode(unref(info_filled_default))
                                  ]),
                                  _: 1
                                }),
                                _cache[34] || (_cache[34] = createBaseVNode("span", null, "部分提供商的图像/视频/语音模型使用不同的 API 端点，如需使用请单独配置", -1))
                              ]),
                              createVNode(_component_el_form_item, { label: "图像 API" }, {
                                default: withCtx(() => [
                                  createVNode(_component_el_input, {
                                    modelValue: form.imageBaseUrl,
                                    "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.imageBaseUrl = $event),
                                    placeholder: defaultImageBaseUrl.value || "图像生成 API 端点（留空则使用默认）"
                                  }, null, 8, ["modelValue", "placeholder"])
                                ]),
                                _: 1
                              }),
                              createVNode(_component_el_form_item, { label: "视频 API" }, {
                                default: withCtx(() => [
                                  createVNode(_component_el_input, {
                                    modelValue: form.videoBaseUrl,
                                    "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.videoBaseUrl = $event),
                                    placeholder: defaultVideoBaseUrl.value || "视频生成 API 端点（留空则使用默认）"
                                  }, null, 8, ["modelValue", "placeholder"])
                                ]),
                                _: 1
                              }),
                              createVNode(_component_el_form_item, { label: "语音 API" }, {
                                default: withCtx(() => [
                                  createVNode(_component_el_input, {
                                    modelValue: form.audioBaseUrl,
                                    "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.audioBaseUrl = $event),
                                    placeholder: defaultAudioBaseUrl.value || "语音生成 API 端点（留空则使用默认）"
                                  }, null, 8, ["modelValue", "placeholder"])
                                ]),
                                _: 1
                              }),
                              createVNode(_component_el_divider, { "content-position": "left" }, {
                                default: withCtx(() => [..._cache[35] || (_cache[35] = [
                                  createTextVNode("自定义设置", -1)
                                ])]),
                                _: 1
                              }),
                              createVNode(_component_el_form_item, { label: "自定义请求头" }, {
                                default: withCtx(() => [
                                  createBaseVNode("div", _hoisted_21$1, [
                                    (openBlock(true), createElementBlock(Fragment, null, renderList(customHeadersList.value, (header, index) => {
                                      return openBlock(), createElementBlock("div", {
                                        key: index,
                                        class: "header-item"
                                      }, [
                                        createVNode(_component_el_input, {
                                          modelValue: header.key,
                                          "onUpdate:modelValue": ($event) => header.key = $event,
                                          placeholder: "Header Name",
                                          class: "header-key"
                                        }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                                        createVNode(_component_el_input, {
                                          modelValue: header.value,
                                          "onUpdate:modelValue": ($event) => header.value = $event,
                                          placeholder: "Header Value",
                                          class: "header-value"
                                        }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                                        createVNode(_component_el_button, {
                                          type: "danger",
                                          text: "",
                                          onClick: ($event) => removeCustomHeader(index)
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
                                      text: "",
                                      onClick: addCustomHeader
                                    }, {
                                      default: withCtx(() => [
                                        createVNode(_component_el_icon, null, {
                                          default: withCtx(() => [
                                            createVNode(unref(plus_default))
                                          ]),
                                          _: 1
                                        }),
                                        _cache[36] || (_cache[36] = createTextVNode(" 添加请求头 ", -1))
                                      ]),
                                      _: 1
                                    })
                                  ])
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }, 8, ["modelValue"]),
                      createVNode(_component_el_form_item, {
                        label: "设为默认",
                        class: "default-switch"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_switch, {
                            modelValue: form.isDefault,
                            "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.isDefault = $event)
                          }, null, 8, ["modelValue"]),
                          _cache[37] || (_cache[37] = createBaseVNode("span", { class: "switch-hint" }, "设为聊天默认使用的提供商", -1))
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }, 8, ["model"])
                ], 512), [
                  [vShow, activeTab.value === "info"]
                ]),
                withDirectives(createBaseVNode("div", _hoisted_22$1, [
                  createBaseVNode("div", _hoisted_23$1, [
                    createBaseVNode("div", _hoisted_24$1, [
                      _cache[39] || (_cache[39] = createBaseVNode("span", { class: "section-title" }, "API 模型", -1)),
                      createVNode(_component_el_button, {
                        type: "primary",
                        size: "small",
                        loading: loadingModels.value,
                        onClick: fetchModelsFromApi
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(refresh_default))
                            ]),
                            _: 1
                          }),
                          _cache[38] || (_cache[38] = createTextVNode(" 从 API 刷新 ", -1))
                        ]),
                        _: 1
                      }, 8, ["loading"])
                    ]),
                    _cache[51] || (_cache[51] = createBaseVNode("div", { class: "section-desc" }, '从提供商 API 获取的模型列表，点击"添加"按钮将模型添加到启用列表', -1)),
                    apiModels.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_25$1, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(apiModels.value, (model) => {
                        return openBlock(), createElementBlock("div", {
                          key: model.id,
                          class: normalizeClass(["model-card", { enabled: isModelEnabled(model.id) }])
                        }, [
                          createBaseVNode("div", _hoisted_26$1, [
                            createBaseVNode("div", _hoisted_27$1, [
                              createBaseVNode("span", _hoisted_28$1, toDisplayString(model.name), 1),
                              createBaseVNode("span", _hoisted_29$1, toDisplayString(model.id), 1)
                            ]),
                            createBaseVNode("div", _hoisted_30$1, [
                              model.type === "multimodal" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 0,
                                type: "success",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[40] || (_cache[40] = [
                                  createTextVNode("多模态", -1)
                                ])]),
                                _: 1
                              })) : model.type === "image" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 1,
                                type: "warning",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[41] || (_cache[41] = [
                                  createTextVNode("图像", -1)
                                ])]),
                                _: 1
                              })) : model.type === "video" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 2,
                                type: "danger",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[42] || (_cache[42] = [
                                  createTextVNode("视频", -1)
                                ])]),
                                _: 1
                              })) : model.type === "audio" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 3,
                                type: "info",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[43] || (_cache[43] = [
                                  createTextVNode("音频", -1)
                                ])]),
                                _: 1
                              })) : model.type === "embedding" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 4,
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[44] || (_cache[44] = [
                                  createTextVNode("嵌入", -1)
                                ])]),
                                _: 1
                              })) : model.type === "rerank" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 5,
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[45] || (_cache[45] = [
                                  createTextVNode("重排序", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              model.supportsThinking ? (openBlock(), createBlock(_component_el_tag, {
                                key: 6,
                                type: "primary",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[46] || (_cache[46] = [
                                  createTextVNode("思考", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              model.supportsWebSearch ? (openBlock(), createBlock(_component_el_tag, {
                                key: 7,
                                type: "primary",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[47] || (_cache[47] = [
                                  createTextVNode("联网", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              model.supportsTools ? (openBlock(), createBlock(_component_el_tag, {
                                key: 8,
                                type: "primary",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[48] || (_cache[48] = [
                                  createTextVNode("工具", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true)
                            ])
                          ]),
                          createBaseVNode("div", _hoisted_31$1, [
                            !isModelEnabled(model.id) ? (openBlock(), createBlock(_component_el_button, {
                              key: 0,
                              type: "primary",
                              size: "small",
                              onClick: ($event) => unref(addModelToEnabled)(model)
                            }, {
                              default: withCtx(() => [..._cache[49] || (_cache[49] = [
                                createTextVNode(" 添加 ", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"])) : (openBlock(), createElementBlock("span", _hoisted_32$1, "已启用"))
                          ])
                        ], 2);
                      }), 128))
                    ])) : (openBlock(), createElementBlock("div", _hoisted_33$1, [..._cache[50] || (_cache[50] = [
                      createBaseVNode("span", null, '暂无 API 模型，请点击"从 API 刷新"获取模型列表', -1)
                    ])]))
                  ]),
                  createBaseVNode("div", _hoisted_34$1, [
                    createBaseVNode("div", _hoisted_35$1, [
                      _cache[53] || (_cache[53] = createBaseVNode("span", { class: "section-title" }, "已启用模型", -1)),
                      selectedTemplate.value?.allowCustomModels ? (openBlock(), createBlock(_component_el_button, {
                        key: 0,
                        type: "primary",
                        size: "small",
                        plain: "",
                        onClick: showAddCustomModelDialog
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(plus_default))
                            ]),
                            _: 1
                          }),
                          _cache[52] || (_cache[52] = createTextVNode(" 添加自定义模型 ", -1))
                        ]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ]),
                    _cache[67] || (_cache[67] = createBaseVNode("div", { class: "section-desc" }, "启用的模型将显示在对话界面的模型选择列表中", -1)),
                    unref(enabledModelList).length > 0 ? (openBlock(), createElementBlock("div", _hoisted_36$1, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(enabledModelList), (model) => {
                        return openBlock(), createElementBlock("div", {
                          key: model.id,
                          class: "model-card enabled"
                        }, [
                          createBaseVNode("div", _hoisted_37$1, [
                            createBaseVNode("div", _hoisted_38$1, [
                              createBaseVNode("span", _hoisted_39$1, [
                                createTextVNode(toDisplayString(model.name) + " ", 1),
                                isCustomModel(model.id) ? (openBlock(), createBlock(_component_el_tag, {
                                  key: 0,
                                  type: "warning",
                                  size: "small"
                                }, {
                                  default: withCtx(() => [..._cache[54] || (_cache[54] = [
                                    createTextVNode("自定义", -1)
                                  ])]),
                                  _: 1
                                })) : createCommentVNode("", true)
                              ]),
                              createBaseVNode("span", _hoisted_40$1, toDisplayString(model.id), 1)
                            ]),
                            createBaseVNode("div", _hoisted_41$1, [
                              model.type === "multimodal" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 0,
                                type: "success",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[55] || (_cache[55] = [
                                  createTextVNode("多模态", -1)
                                ])]),
                                _: 1
                              })) : model.type === "image" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 1,
                                type: "warning",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[56] || (_cache[56] = [
                                  createTextVNode("图像", -1)
                                ])]),
                                _: 1
                              })) : model.type === "video" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 2,
                                type: "danger",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[57] || (_cache[57] = [
                                  createTextVNode("视频", -1)
                                ])]),
                                _: 1
                              })) : model.type === "audio" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 3,
                                type: "info",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[58] || (_cache[58] = [
                                  createTextVNode("音频", -1)
                                ])]),
                                _: 1
                              })) : model.type === "embedding" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 4,
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[59] || (_cache[59] = [
                                  createTextVNode("嵌入", -1)
                                ])]),
                                _: 1
                              })) : model.type === "rerank" ? (openBlock(), createBlock(_component_el_tag, {
                                key: 5,
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[60] || (_cache[60] = [
                                  createTextVNode("重排序", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              model.supportsThinking ? (openBlock(), createBlock(_component_el_tag, {
                                key: 6,
                                type: "primary",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[61] || (_cache[61] = [
                                  createTextVNode("思考", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              model.supportsWebSearch ? (openBlock(), createBlock(_component_el_tag, {
                                key: 7,
                                type: "primary",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[62] || (_cache[62] = [
                                  createTextVNode("联网", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              model.supportsTools ? (openBlock(), createBlock(_component_el_tag, {
                                key: 8,
                                type: "primary",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[63] || (_cache[63] = [
                                  createTextVNode("工具", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true)
                            ])
                          ]),
                          createBaseVNode("div", _hoisted_42$1, [
                            createVNode(_component_el_button, {
                              type: "primary",
                              text: "",
                              size: "small",
                              onClick: ($event) => editModelCapabilities(model)
                            }, {
                              default: withCtx(() => [..._cache[64] || (_cache[64] = [
                                createTextVNode(" 编辑 ", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"]),
                            createVNode(_component_el_button, {
                              type: "danger",
                              text: "",
                              size: "small",
                              onClick: ($event) => removeModelFromEnabled(model.id)
                            }, {
                              default: withCtx(() => [..._cache[65] || (_cache[65] = [
                                createTextVNode(" 移除 ", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"])
                          ])
                        ]);
                      }), 128))
                    ])) : (openBlock(), createElementBlock("div", _hoisted_43$1, [..._cache[66] || (_cache[66] = [
                      createBaseVNode("span", null, "暂无启用的模型，请从 API 模型列表中添加或添加自定义模型", -1)
                    ])]))
                  ])
                ], 512), [
                  [vShow, activeTab.value === "models"]
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showAddCustomModel.value,
          "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => showAddCustomModel.value = $event),
          title: isEditingApiModel.value ? "添加模型" : isEditingCustomModel.value ? "编辑模型" : "添加模型",
          width: "500px",
          "append-to-body": "",
          class: "custom-model-dialog"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[22] || (_cache[22] = ($event) => showAddCustomModel.value = false)
            }, {
              default: withCtx(() => [..._cache[78] || (_cache[78] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: saveCustomModel
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(isEditingApiModel.value ? "添加" : isEditingCustomModel.value ? "保存" : "添加"), 1)
              ]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: customModelForm,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "模型 ID",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: customModelForm.id,
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => customModelForm.id = $event),
                      placeholder: "如：gpt-4-custom",
                      disabled: isEditingCustomModel.value && !isEditingApiModel.value
                    }, null, 8, ["modelValue", "disabled"]),
                    isEditingCustomModel.value && !isEditingApiModel.value ? (openBlock(), createElementBlock("div", _hoisted_45$1, "编辑时不可修改模型 ID")) : createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "模型名称" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: customModelForm.name,
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => customModelForm.name = $event),
                      placeholder: "显示名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "上下文长度" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: customModelForm.contextWindow,
                      "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => customModelForm.contextWindow = $event),
                      min: 1024,
                      step: 1024,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "模型类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: customModelForm.type,
                      "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => customModelForm.type = $event),
                      placeholder: "选择模型类型",
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "文本模型",
                          value: "text"
                        }),
                        createVNode(_component_el_option, {
                          label: "多模态模型（支持图片）",
                          value: "multimodal"
                        }),
                        createVNode(_component_el_option, {
                          label: "图像生成模型",
                          value: "image"
                        }),
                        createVNode(_component_el_option, {
                          label: "视频生成模型",
                          value: "video"
                        }),
                        createVNode(_component_el_option, {
                          label: "音频模型",
                          value: "audio"
                        }),
                        createVNode(_component_el_option, {
                          label: "嵌入模型",
                          value: "embedding"
                        }),
                        createVNode(_component_el_option, {
                          label: "重排序模型",
                          value: "rerank"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "模型能力" }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_46$1, [
                      createVNode(_component_el_checkbox, {
                        modelValue: customModelForm.supportsThinking,
                        "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => customModelForm.supportsThinking = $event)
                      }, {
                        default: withCtx(() => [..._cache[72] || (_cache[72] = [
                          createTextVNode(" 支持深度思考 ", -1)
                        ])]),
                        _: 1
                      }, 8, ["modelValue"]),
                      _cache[75] || (_cache[75] = createBaseVNode("div", { class: "capability-hint" }, "如 DeepSeek R1、OpenAI o1 等支持思维链的模型", -1)),
                      createVNode(_component_el_checkbox, {
                        modelValue: customModelForm.supportsWebSearch,
                        "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => customModelForm.supportsWebSearch = $event)
                      }, {
                        default: withCtx(() => [..._cache[73] || (_cache[73] = [
                          createTextVNode(" 支持联网搜索 ", -1)
                        ])]),
                        _: 1
                      }, 8, ["modelValue"]),
                      _cache[76] || (_cache[76] = createBaseVNode("div", { class: "capability-hint" }, "如 Perplexity sonar 等内置搜索功能的模型", -1)),
                      createVNode(_component_el_checkbox, {
                        modelValue: customModelForm.supportsTools,
                        "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => customModelForm.supportsTools = $event)
                      }, {
                        default: withCtx(() => [..._cache[74] || (_cache[74] = [
                          createTextVNode(" 支持工具调用 ", -1)
                        ])]),
                        _: 1
                      }, 8, ["modelValue"]),
                      _cache[77] || (_cache[77] = createBaseVNode("div", { class: "capability-hint" }, "支持函数调用/工具使用的模型", -1))
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue", "title"])
      ], 64);
    };
  }
});
const AddProviderDialog = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-c6f66d03"]]);
const _hoisted_1$1 = {
  key: 0,
  class: "template-select"
};
const _hoisted_2$1 = {
  key: 0,
  class: "loading-templates"
};
const _hoisted_3$1 = {
  key: 1,
  class: "template-grid"
};
const _hoisted_4$1 = ["onClick"];
const _hoisted_5$1 = { class: "template-icon" };
const _hoisted_6$1 = { class: "template-info" };
const _hoisted_7$1 = { class: "template-name" };
const _hoisted_8$1 = { class: "template-desc" };
const _hoisted_9$1 = {
  key: 2,
  class: "no-templates"
};
const _hoisted_10$1 = {
  key: 1,
  class: "config-form-wrapper"
};
const _hoisted_11$1 = {
  key: 0,
  class: "selected-template"
};
const _hoisted_12$1 = { class: "template-icon-lg" };
const _hoisted_13$1 = { class: "template-details" };
const _hoisted_14$1 = { class: "template-name" };
const _hoisted_15$1 = { class: "template-desc" };
const _hoisted_16$1 = {
  key: 0,
  class: "form-hint"
};
const _hoisted_17$1 = {
  key: 0,
  class: "form-hint"
};
const _hoisted_18$1 = { class: "dialog-footer" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "AddSearchEngineDialog",
  props: {
    modelValue: { type: Boolean },
    editConfig: {},
    templates: {},
    existingConfigs: {}
  },
  emits: ["update:modelValue", "saved"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const visible = computed({
      get: () => props.modelValue,
      set: (val) => emit("update:modelValue", val)
    });
    const isEdit = computed(() => !!props.editConfig);
    const apiTemplates = computed(() => {
      props.existingConfigs.filter((c) => c.isEnabled).map((c) => c.templateId);
      return props.templates.filter(
        (t) => t.authConfig.requiresApiKey && t.category === "api"
      );
    });
    const loadingTemplates = ref(false);
    const selectedTemplate = ref(null);
    const formRef = ref();
    const saving = ref(false);
    const form = ref({
      name: "",
      apiKey: "",
      extraConfig: {},
      maxResults: 5,
      isEnabled: true
    });
    const extraConfigFields = computed(() => {
      if (!selectedTemplate.value?.authConfig.extraConfigFields) return [];
      return selectedTemplate.value.authConfig.extraConfigFields;
    });
    const rules = {
      name: [
        { required: true, message: "请输入配置名称", trigger: "blur" }
      ],
      apiKey: [
        {
          validator: (_rule, value, callback) => {
            if (!isEdit.value && !value) {
              callback(new Error("请输入 API Key"));
            } else {
              callback();
            }
          },
          trigger: "blur"
        }
      ]
    };
    const selectTemplate = (template) => {
      selectedTemplate.value = template;
      form.value.name = template.name;
      if (template.authConfig.extraConfigFields) {
        template.authConfig.extraConfigFields.forEach((field) => {
          if (field.default !== void 0) {
            form.value.extraConfig[field.key] = String(field.default);
          }
        });
      }
    };
    const handleBack = () => {
      if (!isEdit.value) {
        selectedTemplate.value = null;
        form.value = {
          name: "",
          apiKey: "",
          extraConfig: {},
          maxResults: 5,
          isEnabled: true
        };
      }
    };
    const handleSave = async () => {
      if (!formRef.value) return;
      try {
        await formRef.value.validate();
      } catch {
        return;
      }
      saving.value = true;
      try {
        if (isEdit.value && props.editConfig) {
          const updateData = {
            name: form.value.name,
            maxResults: form.value.maxResults,
            isEnabled: form.value.isEnabled
          };
          if (form.value.apiKey) {
            updateData.apiKey = form.value.apiKey;
          }
          if (Object.keys(form.value.extraConfig).length > 0) {
            updateData.extraConfig = { ...form.value.extraConfig };
          }
          const result = await window.electronAPI.searchEngine.update(
            props.editConfig.id,
            updateData
          );
          if (result.success) {
            ElMessage.success("配置已更新");
            emit("saved");
            handleClose();
          } else {
            ElMessage.error(result.error || "保存失败");
          }
        } else if (selectedTemplate.value) {
          const result = await window.electronAPI.searchEngine.create({
            templateId: selectedTemplate.value.id,
            name: form.value.name,
            apiKey: form.value.apiKey,
            extraConfig: Object.keys(form.value.extraConfig).length > 0 ? form.value.extraConfig : void 0,
            maxResults: form.value.maxResults,
            isEnabled: form.value.isEnabled
          });
          if (result.success) {
            ElMessage.success("配置已添加");
            emit("saved");
            handleClose();
          } else {
            ElMessage.error(result.error || "添加失败");
          }
        }
      } catch (error) {
        console.error("保存配置失败:", error);
        ElMessage.error("保存失败");
      } finally {
        saving.value = false;
      }
    };
    const handleClose = () => {
      visible.value = false;
      selectedTemplate.value = null;
      form.value = {
        name: "",
        apiKey: "",
        extraConfig: {},
        maxResults: 5,
        isEnabled: true
      };
    };
    watch(
      () => props.editConfig,
      (config) => {
        if (config) {
          form.value = {
            name: config.name,
            apiKey: "",
            // 编辑时不显示原有密钥
            extraConfig: config.extraConfig ? { ...config.extraConfig } : {},
            maxResults: config.maxResults || 5,
            isEnabled: config.isEnabled
          };
          selectedTemplate.value = props.templates.find((t) => t.id === config.templateId) || null;
        }
      },
      { immediate: true }
    );
    watch(visible, (val) => {
      if (!val) {
        handleClose();
      }
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_switch = resolveComponent("el-switch");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        modelValue: visible.value,
        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => visible.value = $event),
        title: isEdit.value ? "编辑搜索引擎" : "添加搜索引擎",
        width: "650px",
        "close-on-click-modal": false,
        class: "add-search-engine-dialog",
        onClose: handleClose
      }, {
        footer: withCtx(() => [
          createBaseVNode("div", _hoisted_18$1, [
            selectedTemplate.value || isEdit.value ? (openBlock(), createBlock(_component_el_button, {
              key: 0,
              text: "",
              onClick: handleBack
            }, {
              default: withCtx(() => [..._cache[8] || (_cache[8] = [
                createTextVNode(" 返回 ", -1)
              ])]),
              _: 1
            })) : createCommentVNode("", true),
            createVNode(_component_el_button, { onClick: handleClose }, {
              default: withCtx(() => [..._cache[9] || (_cache[9] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            selectedTemplate.value || isEdit.value ? (openBlock(), createBlock(_component_el_button, {
              key: 1,
              type: "primary",
              loading: saving.value,
              onClick: handleSave
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(isEdit.value ? "保存" : "添加"), 1)
              ]),
              _: 1
            }, 8, ["loading"])) : createCommentVNode("", true)
          ])
        ]),
        default: withCtx(() => [
          !isEdit.value && !selectedTemplate.value ? (openBlock(), createElementBlock("div", _hoisted_1$1, [
            _cache[7] || (_cache[7] = createBaseVNode("h4", null, "选择搜索引擎类型", -1)),
            loadingTemplates.value ? (openBlock(), createElementBlock("div", _hoisted_2$1, [
              createVNode(_component_el_icon, { class: "is-loading" }, {
                default: withCtx(() => [
                  createVNode(unref(loading_default))
                ]),
                _: 1
              }),
              _cache[5] || (_cache[5] = createBaseVNode("span", null, "正在加载搜索引擎模板...", -1))
            ])) : apiTemplates.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(apiTemplates.value, (template) => {
                return openBlock(), createElementBlock("div", {
                  key: template.id,
                  class: "template-card",
                  onClick: ($event) => selectTemplate(template)
                }, [
                  createBaseVNode("div", _hoisted_5$1, toDisplayString(template.icon), 1),
                  createBaseVNode("div", _hoisted_6$1, [
                    createBaseVNode("span", _hoisted_7$1, toDisplayString(template.name), 1),
                    createBaseVNode("span", _hoisted_8$1, toDisplayString(template.description), 1)
                  ])
                ], 8, _hoisted_4$1);
              }), 128))
            ])) : (openBlock(), createElementBlock("div", _hoisted_9$1, [..._cache[6] || (_cache[6] = [
              createBaseVNode("span", null, "所有搜索引擎都已配置", -1)
            ])]))
          ])) : createCommentVNode("", true),
          selectedTemplate.value || isEdit.value ? (openBlock(), createElementBlock("div", _hoisted_10$1, [
            createVNode(_component_el_form, {
              ref_key: "formRef",
              ref: formRef,
              model: form.value,
              rules,
              "label-width": "110px",
              class: "config-form"
            }, {
              default: withCtx(() => [
                !isEdit.value && selectedTemplate.value ? (openBlock(), createElementBlock("div", _hoisted_11$1, [
                  createBaseVNode("span", _hoisted_12$1, toDisplayString(selectedTemplate.value.icon), 1),
                  createBaseVNode("div", _hoisted_13$1, [
                    createBaseVNode("span", _hoisted_14$1, toDisplayString(selectedTemplate.value.name), 1),
                    createBaseVNode("span", _hoisted_15$1, toDisplayString(selectedTemplate.value.description), 1)
                  ])
                ])) : createCommentVNode("", true),
                createVNode(_component_el_form_item, {
                  label: "配置名称",
                  prop: "name"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: form.value.name,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.name = $event),
                      placeholder: "如：我的智谱搜索"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "API Key",
                  prop: "apiKey"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: form.value.apiKey,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.apiKey = $event),
                      type: "password",
                      "show-password": "",
                      placeholder: selectedTemplate.value?.authConfig.apiKeyPlaceholder || "请输入 API Key"
                    }, null, 8, ["modelValue", "placeholder"]),
                    isEdit.value ? (openBlock(), createElementBlock("div", _hoisted_16$1, "留空则保持原有密钥不变")) : createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                extraConfigFields.value.length > 0 ? (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(extraConfigFields.value, (field) => {
                  return openBlock(), createBlock(_component_el_form_item, {
                    key: field.key,
                    label: field.label
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_input, {
                        modelValue: form.value.extraConfig[field.key],
                        "onUpdate:modelValue": ($event) => form.value.extraConfig[field.key] = $event,
                        placeholder: field.placeholder
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "placeholder"]),
                      field.description ? (openBlock(), createElementBlock("div", _hoisted_17$1, toDisplayString(field.description), 1)) : createCommentVNode("", true)
                    ]),
                    _: 2
                  }, 1032, ["label"]);
                }), 128)) : createCommentVNode("", true),
                createVNode(_component_el_form_item, { label: "结果数量" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: form.value.maxResults,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.maxResults = $event),
                      min: 1,
                      max: 10,
                      "controls-position": "right"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "启用" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_switch, {
                      modelValue: form.value.isEnabled,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.isEnabled = $event)
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      }, 8, ["modelValue", "title"]);
    };
  }
});
const AddSearchEngineDialog = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-ab3dde87"]]);
const _hoisted_1 = { class: "settings-page" };
const _hoisted_2 = { class: "settings-content" };
const _hoisted_3 = { class: "settings-section" };
const _hoisted_4 = { class: "theme-grid" };
const _hoisted_5 = ["onClick"];
const _hoisted_6 = {
  key: 0,
  class: "theme-check"
};
const _hoisted_7 = { class: "theme-info" };
const _hoisted_8 = { class: "theme-name" };
const _hoisted_9 = { class: "theme-desc" };
const _hoisted_10 = { class: "settings-section" };
const _hoisted_11 = { class: "settings-section" };
const _hoisted_12 = { class: "section-header" };
const _hoisted_13 = {
  key: 0,
  class: "provider-config-list"
};
const _hoisted_14 = { class: "config-icon" };
const _hoisted_15 = { class: "config-info" };
const _hoisted_16 = { class: "config-header" };
const _hoisted_17 = { class: "config-name" };
const _hoisted_18 = { class: "config-details" };
const _hoisted_19 = { class: "config-template" };
const _hoisted_20 = {
  key: 0,
  class: "config-endpoint"
};
const _hoisted_21 = {
  key: 1,
  class: "config-models"
};
const _hoisted_22 = { class: "config-actions" };
const _hoisted_23 = {
  key: 1,
  class: "empty-state"
};
const _hoisted_24 = { class: "settings-section" };
const _hoisted_25 = { class: "path-info" };
const _hoisted_26 = { class: "size-info" };
const _hoisted_27 = { class: "total-size" };
const _hoisted_28 = { class: "size-details" };
const _hoisted_29 = { class: "size-item" };
const _hoisted_30 = { class: "size-item" };
const _hoisted_31 = { class: "size-item" };
const _hoisted_32 = { class: "size-item" };
const _hoisted_33 = { class: "path-actions" };
const _hoisted_34 = { class: "settings-section" };
const _hoisted_35 = { class: "action-buttons" };
const _hoisted_36 = { class: "settings-section" };
const _hoisted_37 = { class: "section-header" };
const _hoisted_38 = { class: "search-engine-group" };
const _hoisted_39 = { class: "quick-engine-list" };
const _hoisted_40 = { class: "engine-icon" };
const _hoisted_41 = { class: "engine-info" };
const _hoisted_42 = { class: "engine-name" };
const _hoisted_43 = { class: "engine-desc" };
const _hoisted_44 = {
  key: 0,
  class: "search-engine-group"
};
const _hoisted_45 = { class: "provider-config-list" };
const _hoisted_46 = { class: "config-icon" };
const _hoisted_47 = { class: "config-info" };
const _hoisted_48 = { class: "config-header" };
const _hoisted_49 = { class: "config-name" };
const _hoisted_50 = { class: "config-details" };
const _hoisted_51 = { class: "config-template" };
const _hoisted_52 = { class: "config-actions" };
const _hoisted_53 = {
  key: 1,
  class: "empty-config"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  ...{
    name: "Settings"
  },
  __name: "Settings",
  setup(__props) {
    const themeNames = {
      techBlue: "科技蓝",
      emerald: "翡翠绿",
      purple: "紫罗兰",
      flame: "火焰橙",
      cosmic: "深空紫",
      midnight: "暗夜黑",
      chineseRed: "朱砂红",
      jadeGreen: "翡翠青",
      inkBlue: "黛蓝",
      goldAmber: "琥珀黄",
      plumPurple: "梅子青"
    };
    const { currentTheme, setTheme } = useTheme();
    const { settings: appSettings, loadSettings: loadAppSettings, setFontSize, setLanguage } = useAppSettings();
    const activeTab = ref("appearance");
    const settings = reactive({
      language: appSettings.language,
      fontSize: appSettings.fontSize
    });
    const dataPathConfig = ref({
      dataPath: "",
      isDefault: true
    });
    const dataSizeInfo = ref({
      total: 0,
      details: {
        database: 0,
        images: 0,
        voice: 0,
        translations: 0,
        other: 0
      }
    });
    const providerConfigs = ref([]);
    const templates = ref([]);
    const showAddDialog = ref(false);
    const editingConfig = ref(void 0);
    const searchEngineTemplates = ref([]);
    const searchEngineConfigs = ref([]);
    const quickSearchEngines = ref([]);
    const disabledQuickEngines = ref([]);
    const showAddSearchEngineDialog = ref(false);
    const editingSearchEngineConfig = ref(void 0);
    const changeTheme = async (themeId) => {
      await setTheme(themeId);
      ElMessage.success("主题已更换");
    };
    const saveSettings = async () => {
      try {
        if (settings.language !== appSettings.language) {
          await setLanguage(settings.language);
        }
        if (settings.fontSize !== appSettings.fontSize) {
          await setFontSize(settings.fontSize);
        }
        ElMessage.success("设置已保存");
      } catch (error) {
        console.error("保存设置失败:", error);
        ElMessage.error("保存设置失败");
      }
    };
    const loadTemplates = async () => {
      try {
        const result = await window.electronAPI.providerTemplate.list();
        if (result.success && result.templates) {
          templates.value = result.templates;
        }
      } catch (error) {
        console.error("加载模板列表失败:", error);
      }
    };
    const loadProviderConfigs = async () => {
      try {
        const result = await window.electronAPI.providerConfig.list();
        if (result.success && result.configs) {
          providerConfigs.value = result.configs;
        }
      } catch (error) {
        console.error("加载提供商配置失败:", error);
      }
    };
    const getTemplateName = (templateId) => {
      const template = templates.value.find((t) => t.id === templateId);
      return template?.name || templateId;
    };
    const getTemplateIcon = (templateId) => {
      const template = templates.value.find((t) => t.id === templateId);
      return template?.icon || "🔌";
    };
    const openAddDialog = () => {
      editingConfig.value = void 0;
      showAddDialog.value = true;
    };
    const toggleConfigEnabled = async (config) => {
      try {
        await window.electronAPI.providerConfig.update(config.id, {
          isEnabled: config.isEnabled
        });
        ElMessage.success(config.isEnabled ? "已启用" : "已禁用");
      } catch (error) {
        console.error("更新配置失败:", error);
        config.isEnabled = !config.isEnabled;
        ElMessage.error("操作失败");
      }
    };
    const setDefaultConfig = async (config) => {
      try {
        const result = await window.electronAPI.providerConfig.setDefault(config.id);
        if (result.success) {
          providerConfigs.value.forEach((c) => {
            c.isDefault = c.id === config.id;
          });
          ElMessage.success("操作成功");
        }
      } catch (error) {
        console.error("设置默认配置失败:", error);
        ElMessage.error("操作失败");
      }
    };
    const editConfig = (config) => {
      editingConfig.value = config;
      showAddDialog.value = true;
    };
    const deleteConfig = async (config) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除该配置吗？ (${config.name})`,
          "确认删除",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const result = await window.electronAPI.providerConfig.delete(config.id);
        if (result.success) {
          await loadProviderConfigs();
          ElMessage.success("已删除");
        } else {
          ElMessage.error(result.error || "操作失败");
        }
      } catch {
      }
    };
    const loadSearchEngineTemplates = async () => {
      try {
        const result = await window.electronAPI.searchEngine.getTemplates();
        if (result.success && result.templates) {
          searchEngineTemplates.value = result.templates;
          quickSearchEngines.value = result.templates.filter(
            (t) => t.category === "web-scrape"
          );
        }
      } catch (error) {
        console.error("加载搜索引擎模板失败:", error);
      }
    };
    const loadSearchEngineConfigs = async () => {
      try {
        const result = await window.electronAPI.searchEngine.list();
        if (result.success && result.configs) {
          searchEngineConfigs.value = result.configs;
        }
      } catch (error) {
        console.error("加载搜索引擎配置失败:", error);
      }
    };
    const loadDisabledQuickEngines = async () => {
      try {
        const result = await window.electronAPI.searchEngine.getDisabledQuickEngines();
        if (result.success && result.disabledEngines) {
          disabledQuickEngines.value = result.disabledEngines;
        }
      } catch (error) {
        console.error("加载被禁用的快速搜索引擎列表失败:", error);
      }
    };
    const getSearchEngineTemplateName = (templateId) => {
      const template = searchEngineTemplates.value.find((t) => t.id === templateId);
      return template?.name || templateId;
    };
    const getSearchEngineTemplateIcon = (templateId) => {
      const template = searchEngineTemplates.value.find((t) => t.id === templateId);
      return template?.icon || "🔍";
    };
    const openAddSearchEngineDialog = () => {
      editingSearchEngineConfig.value = void 0;
      showAddSearchEngineDialog.value = true;
    };
    const toggleSearchEngineEnabled = async (config) => {
      try {
        await window.electronAPI.searchEngine.update(config.id, {
          isEnabled: config.isEnabled
        });
        ElMessage.success(config.isEnabled ? "已启用" : "已禁用");
      } catch (error) {
        console.error("更新搜索引擎配置失败:", error);
        config.isEnabled = !config.isEnabled;
        ElMessage.error("操作失败");
      }
    };
    const toggleQuickEngineEnabled = async (engineId, enabled) => {
      try {
        const result = await window.electronAPI.searchEngine.setQuickEngineEnabled(engineId, enabled);
        if (result.success) {
          if (enabled) {
            disabledQuickEngines.value = disabledQuickEngines.value.filter((id) => id !== engineId);
          } else {
            if (!disabledQuickEngines.value.includes(engineId)) {
              disabledQuickEngines.value.push(engineId);
            }
          }
          ElMessage.success(enabled ? "已启用" : "已禁用");
        }
      } catch (error) {
        console.error("设置快速搜索引擎启用状态失败:", error);
        ElMessage.error("操作失败");
      }
    };
    const setDefaultSearchEngine = async (config) => {
      try {
        const result = await window.electronAPI.searchEngine.setDefault(config.id);
        if (result.success) {
          searchEngineConfigs.value.forEach((c) => {
            c.isDefault = c.id === config.id;
          });
          ElMessage.success("操作成功");
        }
      } catch (error) {
        console.error("设置默认搜索引擎失败:", error);
        ElMessage.error("操作失败");
      }
    };
    const testSearchEngineConfig = async (config) => {
      config.testing = true;
      try {
        const result = await window.electronAPI.searchEngine.test({ configId: config.id });
        if (result.success) {
          config.testResult = "success";
          ElMessage.success("连接测试成功");
        } else {
          config.testResult = "failed";
          ElMessage.error(result.message || "连接测试失败");
        }
        await loadSearchEngineConfigs();
      } catch (error) {
        console.error("测试搜索引擎配置失败:", error);
        ElMessage.error("测试失败");
      } finally {
        config.testing = false;
      }
    };
    const editSearchEngineConfig = (config) => {
      editingSearchEngineConfig.value = config;
      showAddSearchEngineDialog.value = true;
    };
    const deleteSearchEngineConfig = async (config) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除该配置吗？ (${config.name})`,
          "确认删除",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const result = await window.electronAPI.searchEngine.delete(config.id);
        if (result.success) {
          await loadSearchEngineConfigs();
          ElMessage.success("已删除");
        } else {
          ElMessage.error(result.error || "操作失败");
        }
      } catch {
      }
    };
    const openDataFolder = async () => {
      try {
        const result = await window.electronAPI.dataPath.openFolder();
        if (!result.success) {
          ElMessage.error(result.error || "打开目录失败");
        }
      } catch (error) {
        console.error("打开目录失败:", error);
        ElMessage.error("打开目录失败");
      }
    };
    const loadDataPathConfig = async () => {
      try {
        const result = await window.electronAPI.dataPath.getConfig();
        if (result.success && result.data) {
          dataPathConfig.value = result.data;
        }
      } catch (error) {
        console.error("加载数据路径配置失败:", error);
      }
    };
    const loadDataSize = async () => {
      try {
        const result = await window.electronAPI.dataPath.calculateSize();
        if (result.success && result.data) {
          dataSizeInfo.value = result.data;
        }
      } catch (error) {
        console.error("计算数据大小失败:", error);
      }
    };
    const handleChangePath = async () => {
      try {
        const selectResult = await window.electronAPI.dataPath.select();
        if (!selectResult.success || !selectResult.path) {
          return;
        }
        const confirmResult = await ElMessageBox.confirm(
          '是否将现有数据迁移到新路径？选择"迁移"将复制现有数据到新位置，选择"不迁移"则新路径将为空。',
          "数据迁移",
          {
            confirmButtonText: "迁移",
            cancelButtonText: "不迁移",
            distinguishCancelAndClose: true,
            type: "info"
          }
        ).then(() => true).catch((action) => action === "cancel");
        const result = await window.electronAPI.dataPath.set(
          selectResult.path,
          confirmResult === true
        );
        if (result.success) {
          ElMessage.success(confirmResult === true ? "路径已更改，数据已迁移" : "路径已更改");
          await loadDataPathConfig();
          await loadDataSize();
        } else {
          ElMessage.error(result.error || "更改路径失败");
        }
      } catch (error) {
        if (error !== "cancel" && error !== "close") {
          console.error("更改路径失败:", error);
          ElMessage.error("更改路径失败");
        }
      }
    };
    const handleResetPath = async () => {
      try {
        const confirmResult = await ElMessageBox.confirm(
          "是否将现有数据迁移到默认路径？",
          "恢复默认路径",
          {
            confirmButtonText: "迁移",
            cancelButtonText: "不迁移",
            distinguishCancelAndClose: true,
            type: "info"
          }
        ).then(() => true).catch((action) => action === "cancel");
        const result = await window.electronAPI.dataPath.reset(confirmResult === true);
        if (result.success) {
          ElMessage.success("已恢复默认路径");
          await loadDataPathConfig();
          await loadDataSize();
        } else {
          ElMessage.error(result.error || "恢复默认路径失败");
        }
      } catch (error) {
        if (error !== "cancel" && error !== "close") {
          console.error("恢复默认路径失败:", error);
          ElMessage.error("恢复默认路径失败");
        }
      }
    };
    const formatSize = (bytes) => {
      if (bytes === 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      const k = 1024;
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + units[i];
    };
    const exportData = () => {
      ElMessage.info("功能开发中...");
    };
    const importData = () => {
      ElMessage.info("功能开发中...");
    };
    const clearAllData = async () => {
      try {
        await ElMessageBox.confirm(
          "确定要清除所有数据吗？此操作不可恢复！",
          "警告",
          {
            confirmButtonText: "确认",
            cancelButtonText: "取消",
            type: "warning",
            confirmButtonClass: "el-button--danger"
          }
        );
        ElMessage.info("功能开发中...");
      } catch {
      }
    };
    watch(showAddDialog, (visible) => {
      if (!visible) {
        editingConfig.value = void 0;
      }
    });
    onMounted(async () => {
      await loadAppSettings();
      settings.language = appSettings.language;
      settings.fontSize = appSettings.fontSize;
      await loadTemplates();
      await loadProviderConfigs();
      await loadDataPathConfig();
      await loadDataSize();
      await loadSearchEngineTemplates();
      await loadSearchEngineConfigs();
      await loadDisabledQuickEngines();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_radio_button = resolveComponent("el-radio-button");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_switch = resolveComponent("el-switch");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_popover = resolveComponent("el-popover");
      const _component_el_dropdown_item = resolveComponent("el-dropdown-item");
      const _component_el_dropdown_menu = resolveComponent("el-dropdown-menu");
      const _component_el_dropdown = resolveComponent("el-dropdown");
      const _component_el_tabs = resolveComponent("el-tabs");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[49] || (_cache[49] = createBaseVNode("div", { class: "page-header" }, [
          createBaseVNode("h2", null, "系统设置"),
          createBaseVNode("p", null, "配置应用程序的各项参数")
        ], -1)),
        createBaseVNode("div", _hoisted_2, [
          createVNode(_component_el_tabs, {
            modelValue: activeTab.value,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => activeTab.value = $event),
            "tab-position": "left",
            class: "settings-tabs"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_tab_pane, {
                label: "外观设置",
                name: "appearance"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_3, [
                    _cache[6] || (_cache[6] = createBaseVNode("h3", null, "主题颜色", -1)),
                    _cache[7] || (_cache[7] = createBaseVNode("p", { class: "section-desc" }, "选择你喜欢的主题颜色，让界面更具个性化", -1)),
                    createBaseVNode("div", _hoisted_4, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(availableThemes), (theme) => {
                        return openBlock(), createElementBlock("div", {
                          key: theme.id,
                          class: normalizeClass(["theme-card", { active: unref(currentTheme) === theme.id }]),
                          onClick: ($event) => changeTheme(theme.id)
                        }, [
                          createBaseVNode("div", {
                            class: "theme-preview",
                            style: normalizeStyle({ background: theme.gradient })
                          }, [
                            _cache[5] || (_cache[5] = createBaseVNode("div", { class: "theme-preview-inner" }, [
                              createBaseVNode("div", { class: "preview-circle" }),
                              createBaseVNode("div", { class: "preview-lines" }, [
                                createBaseVNode("div", { class: "preview-line" }),
                                createBaseVNode("div", { class: "preview-line short" })
                              ])
                            ], -1)),
                            createVNode(Transition, { name: "check" }, {
                              default: withCtx(() => [
                                unref(currentTheme) === theme.id ? (openBlock(), createElementBlock("div", _hoisted_6, [
                                  createVNode(_component_el_icon, { size: 20 }, {
                                    default: withCtx(() => [
                                      createVNode(unref(check_default))
                                    ]),
                                    _: 1
                                  })
                                ])) : createCommentVNode("", true)
                              ]),
                              _: 2
                            }, 1024)
                          ], 4),
                          createBaseVNode("div", _hoisted_7, [
                            createBaseVNode("span", _hoisted_8, toDisplayString(themeNames[theme.id] || theme.id), 1),
                            createBaseVNode("span", _hoisted_9, toDisplayString(theme.description), 1)
                          ])
                        ], 10, _hoisted_5);
                      }), 128))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_10, [
                    _cache[11] || (_cache[11] = createBaseVNode("h3", null, "界面设置", -1)),
                    createVNode(_component_el_form, { "label-width": "100px" }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "字体大小" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_radio_group, {
                              modelValue: settings.fontSize,
                              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => settings.fontSize = $event),
                              onChange: saveSettings,
                              class: "radio-group"
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_radio_button, { value: "small" }, {
                                  default: withCtx(() => [..._cache[8] || (_cache[8] = [
                                    createTextVNode("小", -1)
                                  ])]),
                                  _: 1
                                }),
                                createVNode(_component_el_radio_button, { value: "medium" }, {
                                  default: withCtx(() => [..._cache[9] || (_cache[9] = [
                                    createTextVNode("中", -1)
                                  ])]),
                                  _: 1
                                }),
                                createVNode(_component_el_radio_button, { value: "large" }, {
                                  default: withCtx(() => [..._cache[10] || (_cache[10] = [
                                    createTextVNode("大", -1)
                                  ])]),
                                  _: 1
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
                  ])
                ]),
                _: 1
              }),
              createVNode(_component_el_tab_pane, {
                label: "AI 模型配置",
                name: "aiModels"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_11, [
                    createBaseVNode("div", _hoisted_12, [
                      _cache[13] || (_cache[13] = createBaseVNode("div", null, [
                        createBaseVNode("h3", null, "提供商配置"),
                        createBaseVNode("p", { class: "section-desc" }, "配置各 AI 服务提供商的 API 密钥和参数")
                      ], -1)),
                      createVNode(_component_el_button, {
                        type: "primary",
                        onClick: openAddDialog
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(plus_default))
                            ]),
                            _: 1
                          }),
                          _cache[12] || (_cache[12] = createTextVNode(" 添加提供商 ", -1))
                        ]),
                        _: 1
                      })
                    ]),
                    providerConfigs.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_13, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(providerConfigs.value, (config) => {
                        return openBlock(), createElementBlock("div", {
                          key: config.id,
                          class: normalizeClass(["provider-config-item", { disabled: !config.isEnabled, "is-default": config.isDefault }])
                        }, [
                          createBaseVNode("div", _hoisted_14, toDisplayString(getTemplateIcon(config.templateId)), 1),
                          createBaseVNode("div", _hoisted_15, [
                            createBaseVNode("div", _hoisted_16, [
                              createBaseVNode("span", _hoisted_17, toDisplayString(config.name), 1),
                              config.isDefault ? (openBlock(), createBlock(_component_el_tag, {
                                key: 0,
                                type: "success",
                                size: "small",
                                effect: "plain"
                              }, {
                                default: withCtx(() => [..._cache[14] || (_cache[14] = [
                                  createTextVNode(" 默认 ", -1)
                                ])]),
                                _: 1
                              })) : createCommentVNode("", true),
                              createVNode(_component_el_tag, {
                                type: config.testResult === "success" ? "success" : config.testResult === "failed" ? "danger" : "info",
                                size: "small",
                                effect: "light"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(config.testResult === "success" ? "已验证" : config.testResult === "failed" ? "验证失败" : "未验证"), 1)
                                ]),
                                _: 2
                              }, 1032, ["type"])
                            ]),
                            createBaseVNode("div", _hoisted_18, [
                              createBaseVNode("span", _hoisted_19, toDisplayString(getTemplateName(config.templateId)), 1),
                              config.baseUrl ? (openBlock(), createElementBlock("span", _hoisted_20, " 端点: " + toDisplayString(config.baseUrl), 1)) : createCommentVNode("", true),
                              config.models && config.models.length > 0 ? (openBlock(), createElementBlock("span", _hoisted_21, " 模型: " + toDisplayString(config.models.length), 1)) : createCommentVNode("", true)
                            ])
                          ]),
                          createBaseVNode("div", _hoisted_22, [
                            createVNode(_component_el_switch, {
                              modelValue: config.isEnabled,
                              "onUpdate:modelValue": ($event) => config.isEnabled = $event,
                              onChange: ($event) => toggleConfigEnabled(config)
                            }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                            createVNode(_component_el_button, {
                              size: "small",
                              onClick: ($event) => editConfig(config)
                            }, {
                              default: withCtx(() => [..._cache[15] || (_cache[15] = [
                                createTextVNode("编辑", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"]),
                            !config.isDefault ? (openBlock(), createBlock(_component_el_button, {
                              key: 0,
                              size: "small",
                              type: "primary",
                              text: "",
                              onClick: ($event) => setDefaultConfig(config)
                            }, {
                              default: withCtx(() => [..._cache[16] || (_cache[16] = [
                                createTextVNode(" 设为默认 ", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"])) : createCommentVNode("", true),
                            createVNode(_component_el_button, {
                              size: "small",
                              type: "danger",
                              text: "",
                              onClick: ($event) => deleteConfig(config)
                            }, {
                              default: withCtx(() => [..._cache[17] || (_cache[17] = [
                                createTextVNode(" 删除 ", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"])
                          ])
                        ], 2);
                      }), 128))
                    ])) : (openBlock(), createElementBlock("div", _hoisted_23, [
                      _cache[19] || (_cache[19] = createBaseVNode("div", { class: "empty-icon" }, "🔌", -1)),
                      _cache[20] || (_cache[20] = createBaseVNode("p", null, "还没有配置任何 AI 提供商", -1)),
                      createVNode(_component_el_button, {
                        type: "primary",
                        onClick: openAddDialog
                      }, {
                        default: withCtx(() => [..._cache[18] || (_cache[18] = [
                          createTextVNode(" 添加第一个提供商 ", -1)
                        ])]),
                        _: 1
                      })
                    ]))
                  ])
                ]),
                _: 1
              }),
              createVNode(_component_el_tab_pane, {
                label: "数据路径",
                name: "data"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_24, [
                    _cache[31] || (_cache[31] = createBaseVNode("h3", null, "数据存储路径", -1)),
                    _cache[32] || (_cache[32] = createBaseVNode("p", { class: "section-desc" }, "设置应用程序数据的存储位置，包括数据库、生成的图片、语音文件等", -1)),
                    createVNode(_component_el_form, { "label-width": "100px" }, {
                      default: withCtx(() => [
                        createVNode(_component_el_form_item, { label: "当前路径" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_input, {
                              modelValue: dataPathConfig.value.dataPath,
                              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => dataPathConfig.value.dataPath = $event),
                              disabled: "",
                              class: "path-input"
                            }, {
                              append: withCtx(() => [
                                createVNode(_component_el_button, { onClick: openDataFolder }, {
                                  default: withCtx(() => [
                                    createVNode(_component_el_icon, null, {
                                      default: withCtx(() => [
                                        createVNode(unref(folder_opened_default))
                                      ]),
                                      _: 1
                                    }),
                                    _cache[21] || (_cache[21] = createTextVNode(" 打开目录 ", -1))
                                  ]),
                                  _: 1
                                })
                              ]),
                              _: 1
                            }, 8, ["modelValue"]),
                            createBaseVNode("div", _hoisted_25, [
                              dataPathConfig.value.isDefault ? (openBlock(), createBlock(_component_el_tag, {
                                key: 0,
                                type: "info",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[22] || (_cache[22] = [
                                  createTextVNode("默认路径", -1)
                                ])]),
                                _: 1
                              })) : (openBlock(), createBlock(_component_el_tag, {
                                key: 1,
                                type: "success",
                                size: "small"
                              }, {
                                default: withCtx(() => [..._cache[23] || (_cache[23] = [
                                  createTextVNode("自定义路径", -1)
                                ])]),
                                _: 1
                              }))
                            ])
                          ]),
                          _: 1
                        }),
                        createVNode(_component_el_form_item, { label: "数据大小" }, {
                          default: withCtx(() => [
                            createBaseVNode("div", _hoisted_26, [
                              createBaseVNode("span", _hoisted_27, toDisplayString(formatSize(dataSizeInfo.value.total)), 1),
                              createVNode(_component_el_popover, {
                                placement: "right",
                                width: 300,
                                trigger: "click"
                              }, {
                                reference: withCtx(() => [
                                  createVNode(_component_el_button, {
                                    text: "",
                                    size: "small"
                                  }, {
                                    default: withCtx(() => [
                                      createVNode(_component_el_icon, null, {
                                        default: withCtx(() => [
                                          createVNode(unref(info_filled_default))
                                        ]),
                                        _: 1
                                      }),
                                      _cache[24] || (_cache[24] = createTextVNode(" 查看详情 ", -1))
                                    ]),
                                    _: 1
                                  })
                                ]),
                                default: withCtx(() => [
                                  createBaseVNode("div", _hoisted_28, [
                                    createBaseVNode("div", _hoisted_29, [
                                      _cache[25] || (_cache[25] = createBaseVNode("span", null, "数据库", -1)),
                                      createBaseVNode("span", null, toDisplayString(formatSize(dataSizeInfo.value.details.database)), 1)
                                    ]),
                                    createBaseVNode("div", _hoisted_30, [
                                      _cache[26] || (_cache[26] = createBaseVNode("span", null, "图片", -1)),
                                      createBaseVNode("span", null, toDisplayString(formatSize(dataSizeInfo.value.details.images)), 1)
                                    ]),
                                    createBaseVNode("div", _hoisted_31, [
                                      _cache[27] || (_cache[27] = createBaseVNode("span", null, "语音", -1)),
                                      createBaseVNode("span", null, toDisplayString(formatSize(dataSizeInfo.value.details.voice)), 1)
                                    ]),
                                    createBaseVNode("div", _hoisted_32, [
                                      _cache[28] || (_cache[28] = createBaseVNode("span", null, "翻译", -1)),
                                      createBaseVNode("span", null, toDisplayString(formatSize(dataSizeInfo.value.details.translations)), 1)
                                    ])
                                  ])
                                ]),
                                _: 1
                              })
                            ])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    createBaseVNode("div", _hoisted_33, [
                      createVNode(_component_el_button, {
                        type: "primary",
                        onClick: handleChangePath
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(folder_default))
                            ]),
                            _: 1
                          }),
                          _cache[29] || (_cache[29] = createTextVNode(" 更改路径 ", -1))
                        ]),
                        _: 1
                      }),
                      !dataPathConfig.value.isDefault ? (openBlock(), createBlock(_component_el_button, {
                        key: 0,
                        onClick: handleResetPath
                      }, {
                        default: withCtx(() => [..._cache[30] || (_cache[30] = [
                          createTextVNode(" 恢复默认路径 ", -1)
                        ])]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_34, [
                    _cache[36] || (_cache[36] = createBaseVNode("h3", null, "数据操作", -1)),
                    createBaseVNode("div", _hoisted_35, [
                      createVNode(_component_el_button, {
                        onClick: exportData,
                        class: "action-btn"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(download_default))
                            ]),
                            _: 1
                          }),
                          _cache[33] || (_cache[33] = createTextVNode(" 导出数据 ", -1))
                        ]),
                        _: 1
                      }),
                      createVNode(_component_el_button, {
                        onClick: importData,
                        class: "action-btn"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(upload_default))
                            ]),
                            _: 1
                          }),
                          _cache[34] || (_cache[34] = createTextVNode(" 导入数据 ", -1))
                        ]),
                        _: 1
                      }),
                      createVNode(_component_el_button, {
                        type: "danger",
                        onClick: clearAllData,
                        class: "action-btn danger"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(delete_default))
                            ]),
                            _: 1
                          }),
                          _cache[35] || (_cache[35] = createTextVNode(" 清除所有数据 ", -1))
                        ]),
                        _: 1
                      })
                    ])
                  ])
                ]),
                _: 1
              }),
              createVNode(_component_el_tab_pane, {
                label: "搜索引擎",
                name: "searchEngine"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_36, [
                    createBaseVNode("div", _hoisted_37, [
                      _cache[38] || (_cache[38] = createBaseVNode("div", null, [
                        createBaseVNode("h3", null, "搜索引擎配置"),
                        createBaseVNode("p", { class: "section-desc" }, "配置联网搜索所需的搜索引擎（智谱 AI、Tavily 需要 API Key）")
                      ], -1)),
                      createVNode(_component_el_button, {
                        type: "primary",
                        onClick: openAddSearchEngineDialog
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(plus_default))
                            ]),
                            _: 1
                          }),
                          _cache[37] || (_cache[37] = createTextVNode(" 添加配置 ", -1))
                        ]),
                        _: 1
                      })
                    ]),
                    createBaseVNode("div", _hoisted_38, [
                      _cache[39] || (_cache[39] = createBaseVNode("h4", { class: "group-title" }, "快速搜索", -1)),
                      _cache[40] || (_cache[40] = createBaseVNode("p", { class: "group-desc" }, "以下搜索引擎无需配置，可直接使用", -1)),
                      createBaseVNode("div", _hoisted_39, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(quickSearchEngines.value, (engine) => {
                          return openBlock(), createElementBlock("div", {
                            key: engine.id,
                            class: normalizeClass(["quick-engine-item", { disabled: disabledQuickEngines.value.includes(engine.id) }])
                          }, [
                            createBaseVNode("div", _hoisted_40, toDisplayString(engine.icon), 1),
                            createBaseVNode("div", _hoisted_41, [
                              createBaseVNode("span", _hoisted_42, toDisplayString(engine.name), 1),
                              createBaseVNode("span", _hoisted_43, toDisplayString(engine.description), 1)
                            ]),
                            createVNode(_component_el_switch, {
                              "model-value": !disabledQuickEngines.value.includes(engine.id),
                              onChange: (val) => toggleQuickEngineEnabled(engine.id, val)
                            }, null, 8, ["model-value", "onChange"])
                          ], 2);
                        }), 128))
                      ])
                    ]),
                    searchEngineConfigs.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_44, [
                      _cache[46] || (_cache[46] = createBaseVNode("h4", { class: "group-title" }, "已配置的搜索引擎", -1)),
                      createBaseVNode("div", _hoisted_45, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(searchEngineConfigs.value, (config) => {
                          return openBlock(), createElementBlock("div", {
                            key: config.id,
                            class: normalizeClass(["provider-config-item", { disabled: !config.isEnabled, "is-default": config.isDefault }])
                          }, [
                            createBaseVNode("div", _hoisted_46, toDisplayString(getSearchEngineTemplateIcon(config.templateId)), 1),
                            createBaseVNode("div", _hoisted_47, [
                              createBaseVNode("div", _hoisted_48, [
                                createBaseVNode("span", _hoisted_49, toDisplayString(config.name), 1),
                                config.isDefault ? (openBlock(), createBlock(_component_el_tag, {
                                  key: 0,
                                  type: "success",
                                  size: "small",
                                  effect: "plain"
                                }, {
                                  default: withCtx(() => [..._cache[41] || (_cache[41] = [
                                    createTextVNode(" 默认 ", -1)
                                  ])]),
                                  _: 1
                                })) : createCommentVNode("", true),
                                createVNode(_component_el_tag, {
                                  type: config.testResult === "success" ? "success" : config.testResult === "failed" ? "danger" : "info",
                                  size: "small",
                                  effect: "light"
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(config.testResult === "success" ? "已验证" : config.testResult === "failed" ? "验证失败" : "未验证"), 1)
                                  ]),
                                  _: 2
                                }, 1032, ["type"])
                              ]),
                              createBaseVNode("div", _hoisted_50, [
                                createBaseVNode("span", _hoisted_51, toDisplayString(getSearchEngineTemplateName(config.templateId)), 1)
                              ])
                            ]),
                            createBaseVNode("div", _hoisted_52, [
                              createVNode(_component_el_switch, {
                                modelValue: config.isEnabled,
                                "onUpdate:modelValue": ($event) => config.isEnabled = $event,
                                onChange: ($event) => toggleSearchEngineEnabled(config)
                              }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                              createVNode(_component_el_button, {
                                text: "",
                                size: "small",
                                onClick: ($event) => testSearchEngineConfig(config),
                                loading: config.testing
                              }, {
                                default: withCtx(() => [..._cache[42] || (_cache[42] = [
                                  createTextVNode(" 测试 ", -1)
                                ])]),
                                _: 1
                              }, 8, ["onClick", "loading"]),
                              createVNode(_component_el_button, {
                                text: "",
                                size: "small",
                                onClick: ($event) => setDefaultSearchEngine(config),
                                disabled: config.isDefault
                              }, {
                                default: withCtx(() => [..._cache[43] || (_cache[43] = [
                                  createTextVNode(" 设为默认 ", -1)
                                ])]),
                                _: 1
                              }, 8, ["onClick", "disabled"]),
                              createVNode(_component_el_dropdown, { trigger: "click" }, {
                                dropdown: withCtx(() => [
                                  createVNode(_component_el_dropdown_menu, null, {
                                    default: withCtx(() => [
                                      createVNode(_component_el_dropdown_item, {
                                        onClick: ($event) => editSearchEngineConfig(config)
                                      }, {
                                        default: withCtx(() => [..._cache[44] || (_cache[44] = [
                                          createTextVNode(" 编辑 ", -1)
                                        ])]),
                                        _: 1
                                      }, 8, ["onClick"]),
                                      createVNode(_component_el_dropdown_item, {
                                        onClick: ($event) => deleteSearchEngineConfig(config),
                                        divided: ""
                                      }, {
                                        default: withCtx(() => [..._cache[45] || (_cache[45] = [
                                          createTextVNode(" 删除 ", -1)
                                        ])]),
                                        _: 1
                                      }, 8, ["onClick"])
                                    ]),
                                    _: 2
                                  }, 1024)
                                ]),
                                default: withCtx(() => [
                                  createVNode(_component_el_button, {
                                    text: "",
                                    size: "small"
                                  }, {
                                    default: withCtx(() => [
                                      createVNode(_component_el_icon, null, {
                                        default: withCtx(() => [
                                          createVNode(unref(more_filled_default))
                                        ]),
                                        _: 1
                                      })
                                    ]),
                                    _: 1
                                  })
                                ]),
                                _: 2
                              }, 1024)
                            ])
                          ], 2);
                        }), 128))
                      ])
                    ])) : (openBlock(), createElementBlock("div", _hoisted_53, [..._cache[47] || (_cache[47] = [
                      createBaseVNode("p", null, "暂无已配置的搜索引擎", -1),
                      createBaseVNode("p", { class: "hint" }, "智谱 AI、Tavily 等 API 型搜索引擎需要配置 API Key 后才能使用", -1)
                    ])]))
                  ])
                ]),
                _: 1
              }),
              createVNode(_component_el_tab_pane, {
                label: "关于",
                name: "about"
              }, {
                default: withCtx(() => [..._cache[48] || (_cache[48] = [
                  createBaseVNode("div", { class: "settings-section about-section" }, [
                    createBaseVNode("div", { class: "app-logo" }, [
                      createBaseVNode("div", { class: "logo-circle" }, [
                        createBaseVNode("span", null, "TB")
                      ])
                    ]),
                    createBaseVNode("h2", { class: "app-title gradient-text" }, "The Bot"),
                    createBaseVNode("p", { class: "app-version" }, "版本 0.1.0"),
                    createBaseVNode("p", { class: "app-desc" }, "AI 工具箱 - 集成多种 AI 能力的跨平台桌面应用"),
                    createBaseVNode("div", { class: "info-list" }, [
                      createBaseVNode("div", { class: "info-item" }, [
                        createBaseVNode("span", { class: "info-label" }, "作者"),
                        createBaseVNode("span", { class: "info-value" }, "Daoge")
                      ]),
                      createBaseVNode("div", { class: "info-item" }, [
                        createBaseVNode("span", { class: "info-label" }, "许可证"),
                        createBaseVNode("span", { class: "info-value" }, "MIT")
                      ]),
                      createBaseVNode("div", { class: "info-item" }, [
                        createBaseVNode("span", { class: "info-label" }, "技术栈"),
                        createBaseVNode("span", { class: "info-value" }, "Electron + Vue3 + TypeScript")
                      ])
                    ])
                  ], -1)
                ])]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]),
        createVNode(AddProviderDialog, {
          modelValue: showAddDialog.value,
          "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => showAddDialog.value = $event),
          "edit-config": editingConfig.value,
          onSaved: loadProviderConfigs
        }, null, 8, ["modelValue", "edit-config"]),
        createVNode(AddSearchEngineDialog, {
          modelValue: showAddSearchEngineDialog.value,
          "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => showAddSearchEngineDialog.value = $event),
          "edit-config": editingSearchEngineConfig.value,
          templates: searchEngineTemplates.value,
          "existing-configs": searchEngineConfigs.value,
          onSaved: loadSearchEngineConfigs
        }, null, 8, ["modelValue", "edit-config", "templates", "existing-configs"])
      ]);
    };
  }
});
const Settings = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-4af706b5"]]);
export {
  Settings as default
};
