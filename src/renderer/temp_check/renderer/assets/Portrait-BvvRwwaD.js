import { d as defineComponent, w as watch, c as createBlock, a as withCtx, b as createVNode, e as createTextVNode, r as ref, E as ElMessage, f as resolveComponent, o as openBlock, D as createBaseVNode, C as createElementBlock, M as unref, b2 as close_default, P as plus_default, h as computed, _ as _export_sfc, Y as createCommentVNode, G as Fragment, H as renderList, J as normalizeClass, L as toDisplayString, O as onMounted, X as arrow_left_default, aq as download_default, bj as user_default, A as magic_stick_default, N as arrow_right_default, T as withModifiers, aj as withKeys, U as delete_default, ab as toRaw, V as ElMessageBox, al as folder_default, am as more_filled_default, ao as edit_default } from "./index-CEiunyEa.js";
import { _ as _sfc_main$6 } from "./CreateCharacterDialog.vue_vue_type_script_setup_true_lang-DCnQRx6s.js";
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "EditCharacterDialog",
  props: {
    modelValue: { type: Boolean },
    character: {}
  },
  emits: ["update:modelValue", "success"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const formRef = ref();
    const loading = ref(false);
    const form = ref({
      name: "",
      gender: "male",
      race: "asian",
      age: 25,
      height: 170,
      weight: 60,
      description: ""
    });
    const rules = {
      name: [{ required: true, message: "请输入人物姓名", trigger: "blur" }],
      gender: [{ required: true, message: "请选择性别", trigger: "change" }],
      race: [{ required: true, message: "请选择人种", trigger: "change" }],
      age: [{ required: true, message: "请输入年龄", trigger: "blur" }],
      height: [{ required: true, message: "请输入身高", trigger: "blur" }],
      weight: [{ required: true, message: "请输入体重", trigger: "blur" }]
    };
    async function handleSubmit() {
      if (!formRef.value || !props.character) return;
      try {
        await formRef.value.validate();
      } catch {
        return;
      }
      loading.value = true;
      try {
        const result = await window.electronAPI.portrait.updateCharacter({
          id: props.character.id,
          name: form.value.name,
          gender: form.value.gender,
          race: form.value.race,
          age: form.value.age,
          height: form.value.height,
          weight: form.value.weight,
          description: form.value.description || void 0
        });
        if (result.success) {
          ElMessage.success("保存成功");
          emit("update:modelValue", false);
          emit("success");
        } else {
          ElMessage.error(result.error || "保存失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "保存失败");
      } finally {
        loading.value = false;
      }
    }
    watch(() => props.modelValue, (val) => {
      if (val && props.character) {
        form.value = {
          name: props.character.name,
          gender: props.character.gender,
          race: props.character.race,
          age: props.character.age,
          height: props.character.height,
          weight: props.character.weight,
          description: props.character.description || ""
        };
      }
    });
    return (_ctx, _cache) => {
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_radio = resolveComponent("el-radio");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_col = resolveComponent("el-col");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_row = resolveComponent("el-row");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        "model-value": __props.modelValue,
        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => _ctx.$emit("update:modelValue", $event)),
        title: "编辑人物形象",
        width: "650px",
        "close-on-click-modal": false
      }, {
        footer: withCtx(() => [
          createVNode(_component_el_button, {
            onClick: _cache[7] || (_cache[7] = ($event) => _ctx.$emit("update:modelValue", false))
          }, {
            default: withCtx(() => [..._cache[13] || (_cache[13] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_el_button, {
            type: "primary",
            loading: loading.value,
            onClick: handleSubmit
          }, {
            default: withCtx(() => [..._cache[14] || (_cache[14] = [
              createTextVNode("保存", -1)
            ])]),
            _: 1
          }, 8, ["loading"])
        ]),
        default: withCtx(() => [
          createVNode(_component_el_form, {
            ref_key: "formRef",
            ref: formRef,
            model: form.value,
            rules,
            "label-width": "80px"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_form_item, {
                label: "姓名",
                prop: "name"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_input, {
                    modelValue: form.value.name,
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.name = $event),
                    placeholder: "请输入人物姓名"
                  }, null, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_row, { gutter: 16 }, {
                default: withCtx(() => [
                  createVNode(_component_el_col, { span: 12 }, {
                    default: withCtx(() => [
                      createVNode(_component_el_form_item, {
                        label: "性别",
                        prop: "gender"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_radio_group, {
                            modelValue: form.value.gender,
                            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.gender = $event)
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_radio, { value: "male" }, {
                                default: withCtx(() => [..._cache[9] || (_cache[9] = [
                                  createTextVNode("男", -1)
                                ])]),
                                _: 1
                              }),
                              createVNode(_component_el_radio, { value: "female" }, {
                                default: withCtx(() => [..._cache[10] || (_cache[10] = [
                                  createTextVNode("女", -1)
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
                  }),
                  createVNode(_component_el_col, { span: 12 }, {
                    default: withCtx(() => [
                      createVNode(_component_el_form_item, {
                        label: "人种",
                        prop: "race"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_select, {
                            modelValue: form.value.race,
                            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.race = $event),
                            placeholder: "请选择人种",
                            style: { "width": "100%" }
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_option, {
                                label: "亚洲人",
                                value: "asian"
                              }),
                              createVNode(_component_el_option, {
                                label: "欧洲人",
                                value: "european"
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
                      createVNode(_component_el_form_item, {
                        label: "年龄",
                        prop: "age"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_input_number, {
                            modelValue: form.value.age,
                            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.age = $event),
                            min: 1,
                            max: 150,
                            "controls-position": "right",
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
                      createVNode(_component_el_form_item, {
                        label: "身高",
                        prop: "height"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_input_number, {
                            modelValue: form.value.height,
                            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.height = $event),
                            min: 50,
                            max: 250,
                            "controls-position": "right",
                            style: { "width": "100%" }
                          }, {
                            suffix: withCtx(() => [..._cache[11] || (_cache[11] = [
                              createTextVNode("cm", -1)
                            ])]),
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
                      createVNode(_component_el_form_item, {
                        label: "体重",
                        prop: "weight"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_input_number, {
                            modelValue: form.value.weight,
                            "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.weight = $event),
                            min: 20,
                            max: 300,
                            "controls-position": "right",
                            style: { "width": "100%" }
                          }, {
                            suffix: withCtx(() => [..._cache[12] || (_cache[12] = [
                              createTextVNode("kg", -1)
                            ])]),
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
              createVNode(_component_el_form_item, { label: "简介" }, {
                default: withCtx(() => [
                  createVNode(_component_el_input, {
                    modelValue: form.value.description,
                    "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.description = $event),
                    type: "textarea",
                    rows: 3,
                    placeholder: "可选，描述人物特征、职业、性格等..."
                  }, null, 8, ["modelValue"])
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["model"])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
});
const _hoisted_1$4 = { class: "dialog-content" };
const _hoisted_2$4 = { class: "upload-section" };
const _hoisted_3$3 = {
  key: 0,
  class: "image-preview"
};
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "ChangeClothesDialog",
  props: {
    modelValue: { type: Boolean },
    characterId: {},
    variantId: {}
  },
  emits: ["update:modelValue", "success"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const form = ref({
      clothesDescription: "",
      referenceImage: ""
    });
    const loading = ref(false);
    const canSubmit = computed(() => {
      return form.value.clothesDescription.trim();
    });
    async function selectImage() {
      try {
        const result = await window.electronAPI.image.selectFile();
        if (result.success && result.data) {
          form.value.referenceImage = result.data.base64;
        }
      } catch (error) {
        ElMessage.error(error.message || "选择图片失败");
      }
    }
    function removeReferenceImage() {
      form.value.referenceImage = "";
    }
    async function handleSubmit() {
      if (!canSubmit.value || !props.characterId) return;
      loading.value = true;
      try {
        const result = await window.electronAPI.portrait.changeClothes({
          characterId: props.characterId,
          variantId: props.variantId,
          // 传递变体 ID
          clothesDescription: form.value.clothesDescription,
          angles: ["front"]
          // 只针对正面照片
        });
        if (result.success) {
          ElMessage.success("换衣成功");
          emit("update:modelValue", false);
          emit("success");
          form.value.clothesDescription = "";
          form.value.referenceImage = "";
        } else {
          ElMessage.error(result.error || "换衣失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "换衣失败");
      } finally {
        loading.value = false;
      }
    }
    watch(() => props.modelValue, (val) => {
      if (val) {
        form.value.clothesDescription = "";
        form.value.referenceImage = "";
      }
    });
    return (_ctx, _cache) => {
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        "model-value": __props.modelValue,
        "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => _ctx.$emit("update:modelValue", $event)),
        title: "换衣",
        width: "550px"
      }, {
        footer: withCtx(() => [
          createVNode(_component_el_button, {
            onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("update:modelValue", false))
          }, {
            default: withCtx(() => [..._cache[7] || (_cache[7] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_el_button, {
            type: "primary",
            loading: loading.value,
            disabled: !canSubmit.value,
            onClick: handleSubmit
          }, {
            default: withCtx(() => [..._cache[8] || (_cache[8] = [
              createTextVNode(" 应用换衣 ", -1)
            ])]),
            _: 1
          }, 8, ["loading", "disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$4, [
            _cache[6] || (_cache[6] = createBaseVNode("p", { class: "hint-text" }, "为正面形象更换服装，保持人物特征不变", -1)),
            createVNode(_component_el_form, {
              model: form.value,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "服装描述" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: form.value.clothesDescription,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.clothesDescription = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "建议使用英文描述，例如：red suit, white shirt, black tie"
                    }, null, 8, ["modelValue"]),
                    _cache[3] || (_cache[3] = createBaseVNode("p", { class: "input-hint" }, "建议使用英文描述以避免部分云服务的内容审核问题", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "参考图片" }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_2$4, [
                      form.value.referenceImage ? (openBlock(), createElementBlock("div", _hoisted_3$3, [
                        createVNode(_component_el_image, {
                          src: form.value.referenceImage,
                          fit: "contain"
                        }, null, 8, ["src"]),
                        createVNode(_component_el_button, {
                          class: "remove-btn",
                          type: "danger",
                          size: "small",
                          circle: "",
                          onClick: removeReferenceImage
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(close_default))
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        })
                      ])) : (openBlock(), createElementBlock("div", {
                        key: 1,
                        class: "upload-area",
                        onClick: selectImage
                      }, [
                        createVNode(_component_el_icon, { size: "32" }, {
                          default: withCtx(() => [
                            createVNode(unref(plus_default))
                          ]),
                          _: 1
                        }),
                        _cache[4] || (_cache[4] = createBaseVNode("span", null, "上传服装参考图", -1))
                      ]))
                    ]),
                    _cache[5] || (_cache[5] = createBaseVNode("p", { class: "upload-hint" }, "可选：上传服装图片作为参考", -1))
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
});
const ChangeClothesDialog = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-20e19f30"]]);
const PRESET_BACKGROUNDS = [
  { id: "indoor", name: "室内", description: "温馨的室内环境", icon: "🏠" },
  { id: "outdoor", name: "户外", description: "自然户外场景", icon: "🌳" },
  { id: "office", name: "办公室", description: "专业办公环境", icon: "🏢" },
  { id: "studio", name: "工作室", description: "专业摄影工作室", icon: "🎬" },
  { id: "gallery", name: "画廊", description: "艺术画廊背景", icon: "🖼️" },
  { id: "street", name: "街道", description: "城市街道场景", icon: "🛣️" },
  { id: "beach", name: "海滩", description: "海滩度假场景", icon: "🏖️" },
  { id: "mountain", name: "山景", description: "壮丽山景背景", icon: "🏔️" }
];
const ANGLE_LABELS = {
  front: "正面",
  left: "左侧",
  right: "右侧",
  back: "背面"
};
const VARIANT_TYPE_LABELS = {
  base: "基础形象",
  clothes: "换衣变体",
  background: "换背景变体"
};
const GENDER_LABELS = {
  male: "男",
  female: "女"
};
const RACE_LABELS = {
  asian: "亚洲人",
  european: "欧洲人"
};
const _hoisted_1$3 = { class: "dialog-content" };
const _hoisted_2$3 = { class: "preset-grid" };
const _hoisted_3$2 = ["onClick"];
const _hoisted_4$2 = { class: "preset-icon" };
const _hoisted_5$2 = { class: "preset-name" };
const _hoisted_6$2 = { class: "upload-section" };
const _hoisted_7$2 = {
  key: 0,
  class: "image-preview"
};
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "ChangeBackgroundDialog",
  props: {
    modelValue: { type: Boolean },
    characterId: {},
    variantId: {}
  },
  emits: ["update:modelValue", "success"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const form = ref({
      backgroundType: "solid",
      backgroundColor: "#FFFFFF",
      presetScene: "",
      customDescription: "",
      backgroundImage: ""
    });
    const loading = ref(false);
    const canSubmit = computed(() => {
      if (form.value.backgroundType === "solid") return true;
      if (form.value.backgroundType === "preset") return !!form.value.presetScene;
      if (form.value.backgroundType === "custom") return !!form.value.customDescription.trim();
      if (form.value.backgroundType === "image") return !!form.value.backgroundImage;
      return false;
    });
    async function selectBackgroundImage() {
      try {
        const result = await window.electronAPI.image.selectFile();
        if (result.success && result.data) {
          form.value.backgroundImage = result.data.base64;
        }
      } catch (error) {
        ElMessage.error(error.message || "选择图片失败");
      }
    }
    function removeBackgroundImage() {
      form.value.backgroundImage = "";
    }
    async function handleSubmit() {
      if (!canSubmit.value || !props.characterId) return;
      loading.value = true;
      try {
        const result = await window.electronAPI.portrait.changeBackground({
          characterId: props.characterId,
          variantId: props.variantId,
          // 传递变体 ID
          backgroundType: form.value.backgroundType,
          backgroundColor: form.value.backgroundColor,
          presetScene: form.value.presetScene,
          customDescription: form.value.customDescription,
          angles: ["front"]
          // 只针对正面照片
        });
        if (result.success) {
          ElMessage.success("换背景成功");
          emit("update:modelValue", false);
          emit("success");
          resetForm();
        } else {
          ElMessage.error(result.error || "换背景失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "换背景失败");
      } finally {
        loading.value = false;
      }
    }
    function resetForm() {
      form.value = {
        backgroundType: "solid",
        backgroundColor: "#FFFFFF",
        presetScene: "",
        customDescription: "",
        backgroundImage: ""
      };
    }
    watch(() => props.modelValue, (val) => {
      if (val) {
        resetForm();
      }
    });
    return (_ctx, _cache) => {
      const _component_el_radio = resolveComponent("el-radio");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_color_picker = resolveComponent("el-color-picker");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        "model-value": __props.modelValue,
        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => _ctx.$emit("update:modelValue", $event)),
        title: "换背景",
        width: "650px"
      }, {
        footer: withCtx(() => [
          createVNode(_component_el_button, {
            onClick: _cache[3] || (_cache[3] = ($event) => _ctx.$emit("update:modelValue", false))
          }, {
            default: withCtx(() => [..._cache[13] || (_cache[13] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_el_button, {
            type: "primary",
            loading: loading.value,
            disabled: !canSubmit.value,
            onClick: handleSubmit
          }, {
            default: withCtx(() => [..._cache[14] || (_cache[14] = [
              createTextVNode(" 替换背景 ", -1)
            ])]),
            _: 1
          }, 8, ["loading", "disabled"])
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$3, [
            _cache[12] || (_cache[12] = createBaseVNode("p", { class: "hint-text" }, "为正面形象更换背景，保持人物特征不变", -1)),
            createVNode(_component_el_form, {
              model: form.value,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "背景类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_radio_group, {
                      modelValue: form.value.backgroundType,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.backgroundType = $event)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio, { value: "solid" }, {
                          default: withCtx(() => [..._cache[5] || (_cache[5] = [
                            createTextVNode("纯色背景", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "preset" }, {
                          default: withCtx(() => [..._cache[6] || (_cache[6] = [
                            createTextVNode("预设场景", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "custom" }, {
                          default: withCtx(() => [..._cache[7] || (_cache[7] = [
                            createTextVNode("自定义描述", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "image" }, {
                          default: withCtx(() => [..._cache[8] || (_cache[8] = [
                            createTextVNode("上传图片", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                form.value.backgroundType === "solid" ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 0,
                  label: "背景颜色"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_color_picker, {
                      modelValue: form.value.backgroundColor,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.backgroundColor = $event),
                      "show-alpha": ""
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                form.value.backgroundType === "preset" ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 1,
                  label: "选择场景"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_2$3, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(PRESET_BACKGROUNDS), (preset) => {
                        return openBlock(), createElementBlock("div", {
                          key: preset.id,
                          class: normalizeClass(["preset-item", { active: form.value.presetScene === preset.id }]),
                          onClick: ($event) => form.value.presetScene = preset.id
                        }, [
                          createBaseVNode("span", _hoisted_4$2, toDisplayString(preset.icon), 1),
                          createBaseVNode("span", _hoisted_5$2, toDisplayString(preset.name), 1)
                        ], 10, _hoisted_3$2);
                      }), 128))
                    ])
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                form.value.backgroundType === "custom" ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 2,
                  label: "背景描述"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: form.value.customDescription,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.customDescription = $event),
                      type: "textarea",
                      rows: 2,
                      placeholder: "建议使用英文描述，例如：city street at night with neon lights"
                    }, null, 8, ["modelValue"]),
                    _cache[9] || (_cache[9] = createBaseVNode("p", { class: "input-hint" }, "建议使用英文描述以避免部分云服务的内容审核问题", -1))
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                form.value.backgroundType === "image" ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 3,
                  label: "背景图片"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_6$2, [
                      form.value.backgroundImage ? (openBlock(), createElementBlock("div", _hoisted_7$2, [
                        createVNode(_component_el_image, {
                          src: form.value.backgroundImage,
                          fit: "cover"
                        }, null, 8, ["src"]),
                        createVNode(_component_el_button, {
                          class: "remove-btn",
                          type: "danger",
                          size: "small",
                          circle: "",
                          onClick: removeBackgroundImage
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(close_default))
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        })
                      ])) : (openBlock(), createElementBlock("div", {
                        key: 1,
                        class: "upload-area",
                        onClick: selectBackgroundImage
                      }, [
                        createVNode(_component_el_icon, { size: "32" }, {
                          default: withCtx(() => [
                            createVNode(unref(plus_default))
                          ]),
                          _: 1
                        }),
                        _cache[10] || (_cache[10] = createBaseVNode("span", null, "上传背景图片", -1))
                      ]))
                    ]),
                    _cache[11] || (_cache[11] = createBaseVNode("p", { class: "upload-hint" }, "上传背景图片，人物将被合成到新背景中", -1))
                  ]),
                  _: 1
                })) : createCommentVNode("", true)
              ]),
              _: 1
            }, 8, ["model"])
          ])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
});
const ChangeBackgroundDialog = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-955023a7"]]);
const _hoisted_1$2 = { class: "variant-select" };
const _hoisted_2$2 = { class: "select-actions" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "ExportDialog",
  props: {
    modelValue: { type: Boolean },
    characterId: {},
    variants: {}
  },
  emits: ["update:modelValue", "success"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const form = ref({
      type: "zip",
      selectedVariantIds: [],
      gridLayout: "horizontal"
    });
    const loading = ref(false);
    const canSubmit = computed(() => {
      return form.value.selectedVariantIds.length > 0;
    });
    function selectAll() {
      form.value.selectedVariantIds = props.variants.map((v) => v.id);
    }
    function selectNone() {
      form.value.selectedVariantIds = [];
    }
    function getFileName(filePath) {
      const parts = filePath.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1] || "export";
    }
    async function handleSubmit() {
      if (!canSubmit.value || !props.characterId) return;
      loading.value = true;
      try {
        const result = await window.electronAPI.portrait.export({
          characterId: props.characterId,
          variantIds: [...form.value.selectedVariantIds],
          type: form.value.type,
          gridLayout: form.value.gridLayout
        });
        if (!result.success || !result.data) {
          ElMessage.error(result.error || "导出失败");
          return;
        }
        const sourcePath = result.data;
        const fileName = getFileName(sourcePath);
        let filters;
        if (form.value.type === "zip") {
          filters = [{ name: "ZIP 压缩包", extensions: ["zip"] }];
        } else {
          filters = [{ name: "PNG 图片", extensions: ["png"] }];
        }
        const saveResult = await window.electronAPI.file.saveFile({
          defaultPath: fileName,
          filters
        });
        if (!saveResult.success || !saveResult.filePath) {
          return;
        }
        const copyResult = await window.electronAPI.file.copyFile(sourcePath, saveResult.filePath);
        if (copyResult.success) {
          ElMessage.success(`导出成功：${saveResult.filePath}`);
          emit("update:modelValue", false);
          emit("success", saveResult.filePath);
        } else {
          ElMessage.error(copyResult.error || "保存文件失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "导出失败");
      } finally {
        loading.value = false;
      }
    }
    watch(() => props.modelValue, (val) => {
      if (val && props.variants.length > 0) {
        form.value.type = "zip";
        form.value.gridLayout = "horizontal";
        form.value.selectedVariantIds = props.variants.map((v) => v.id);
      }
    });
    return (_ctx, _cache) => {
      const _component_el_radio = resolveComponent("el-radio");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_checkbox = resolveComponent("el-checkbox");
      const _component_el_checkbox_group = resolveComponent("el-checkbox-group");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        "model-value": __props.modelValue,
        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => _ctx.$emit("update:modelValue", $event)),
        title: "导出人物形象",
        width: "500px"
      }, {
        footer: withCtx(() => [
          createVNode(_component_el_button, {
            onClick: _cache[3] || (_cache[3] = ($event) => _ctx.$emit("update:modelValue", false))
          }, {
            default: withCtx(() => [..._cache[12] || (_cache[12] = [
              createTextVNode("取消", -1)
            ])]),
            _: 1
          }),
          createVNode(_component_el_button, {
            type: "primary",
            loading: loading.value,
            disabled: !canSubmit.value,
            onClick: handleSubmit
          }, {
            default: withCtx(() => [..._cache[13] || (_cache[13] = [
              createTextVNode(" 导出 ", -1)
            ])]),
            _: 1
          }, 8, ["loading", "disabled"])
        ]),
        default: withCtx(() => [
          createVNode(_component_el_form, {
            model: form.value,
            "label-width": "100px"
          }, {
            default: withCtx(() => [
              createVNode(_component_el_form_item, { label: "导出类型" }, {
                default: withCtx(() => [
                  createVNode(_component_el_radio_group, {
                    modelValue: form.value.type,
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.type = $event)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_radio, { value: "grid" }, {
                        default: withCtx(() => [..._cache[5] || (_cache[5] = [
                          createTextVNode("拼接图", -1)
                        ])]),
                        _: 1
                      }),
                      createVNode(_component_el_radio, { value: "zip" }, {
                        default: withCtx(() => [..._cache[6] || (_cache[6] = [
                          createTextVNode("压缩包", -1)
                        ])]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_el_form_item, { label: "选择图片" }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_1$2, [
                    createVNode(_component_el_checkbox_group, {
                      modelValue: form.value.selectedVariantIds,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.selectedVariantIds = $event)
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(__props.variants, (variant) => {
                          return openBlock(), createElementBlock("div", {
                            key: variant.id,
                            class: "variant-option"
                          }, [
                            createVNode(_component_el_checkbox, {
                              value: variant.id
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(ANGLE_LABELS)[variant.angle]) + " - " + toDisplayString(unref(VARIANT_TYPE_LABELS)[variant.type]), 1)
                              ]),
                              _: 2
                            }, 1032, ["value"])
                          ]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    createBaseVNode("div", _hoisted_2$2, [
                      createVNode(_component_el_button, {
                        size: "small",
                        onClick: selectAll
                      }, {
                        default: withCtx(() => [..._cache[7] || (_cache[7] = [
                          createTextVNode("全选", -1)
                        ])]),
                        _: 1
                      }),
                      createVNode(_component_el_button, {
                        size: "small",
                        onClick: selectNone
                      }, {
                        default: withCtx(() => [..._cache[8] || (_cache[8] = [
                          createTextVNode("取消全选", -1)
                        ])]),
                        _: 1
                      })
                    ])
                  ])
                ]),
                _: 1
              }),
              form.value.type === "grid" ? (openBlock(), createBlock(_component_el_form_item, {
                key: 0,
                label: "拼接布局"
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_radio_group, {
                    modelValue: form.value.gridLayout,
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.gridLayout = $event)
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_radio, { value: "horizontal" }, {
                        default: withCtx(() => [..._cache[9] || (_cache[9] = [
                          createTextVNode("横向排列", -1)
                        ])]),
                        _: 1
                      }),
                      createVNode(_component_el_radio, { value: "vertical" }, {
                        default: withCtx(() => [..._cache[10] || (_cache[10] = [
                          createTextVNode("纵向排列", -1)
                        ])]),
                        _: 1
                      }),
                      createVNode(_component_el_radio, { value: "2x2" }, {
                        default: withCtx(() => [..._cache[11] || (_cache[11] = [
                          createTextVNode("2x2 网格", -1)
                        ])]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                _: 1
              })) : createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["model"])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
});
const ExportDialog = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-f5bd85f9"]]);
const _hoisted_1$1 = { class: "character-editor" };
const _hoisted_2$1 = { class: "editor-header" };
const _hoisted_3$1 = {
  key: 0,
  class: "header-center"
};
const _hoisted_4$1 = { class: "character-name" };
const _hoisted_5$1 = {
  key: 0,
  class: "generator-section"
};
const _hoisted_6$1 = { class: "generate-panel" };
const _hoisted_7$1 = { class: "panel-header" };
const _hoisted_8$1 = { class: "panel-icon" };
const _hoisted_9$1 = { class: "panel-body" };
const _hoisted_10$1 = { class: "form-row" };
const _hoisted_11$1 = { class: "model-option" };
const _hoisted_12$1 = { class: "model-name" };
const _hoisted_13$1 = {
  key: 0,
  class: "model-size"
};
const _hoisted_14$1 = { class: "form-row" };
const _hoisted_15$1 = { class: "form-row" };
const _hoisted_16$1 = { class: "prompt-wrapper" };
const _hoisted_17$1 = { class: "form-row" };
const _hoisted_18$1 = { class: "form-row" };
const _hoisted_19$1 = { class: "reference-images" };
const _hoisted_20$1 = { class: "panel-footer" };
const _hoisted_21$1 = { class: "editor-content" };
const _hoisted_22$1 = { class: "preview-section" };
const _hoisted_23$1 = { class: "preview-image-large" };
const _hoisted_24$1 = {
  key: 0,
  class: "variant-tabs-wrapper"
};
const _hoisted_25$1 = ["onClick"];
const _hoisted_26 = { class: "preview-actions" };
const _hoisted_27 = { class: "actions-panel" };
const _hoisted_28 = {
  key: 0,
  class: "info-section"
};
const _hoisted_29 = { class: "info-item" };
const _hoisted_30 = { class: "info-value prompt-text" };
const _hoisted_31 = { class: "info-row" };
const _hoisted_32 = { class: "info-item half" };
const _hoisted_33 = { class: "info-value" };
const _hoisted_34 = { class: "info-item half" };
const _hoisted_35 = { class: "info-value" };
const _hoisted_36 = {
  key: 0,
  class: "info-item"
};
const _hoisted_37 = { class: "reference-thumbs" };
const _hoisted_38 = { class: "panel-section" };
const _hoisted_39 = { class: "panel-section" };
const _hoisted_40 = { class: "angle-row" };
const _hoisted_41 = {
  key: 0,
  class: "gallery-section"
};
const _hoisted_42 = { class: "group-header" };
const _hoisted_43 = { class: "group-actions" };
const _hoisted_44 = { class: "group-images" };
const _hoisted_45 = { class: "variant-info" };
const _hoisted_46 = { class: "variant-angle" };
const _hoisted_47 = { class: "variant-actions" };
const _hoisted_48 = {
  key: 0,
  class: "preview-image-container"
};
const _hoisted_49 = ["src"];
const _hoisted_50 = {
  key: 1,
  class: "preview-counter"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "CharacterEditor",
  props: {
    characterId: {},
    project: {}
  },
  emits: ["back", "deleted"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const character = ref(null);
    const variants = ref([]);
    const generating = ref(false);
    const regenerating = ref(false);
    const editing = ref(false);
    const generatingAngles = ref(false);
    const editPrompt = ref("");
    const anglesToGenerate = ref(["left", "right", "back"]);
    const selectedFrontVariantId = ref(null);
    const thumbnailContainerRef = ref(null);
    function scrollThumbnails(direction) {
      if (!thumbnailContainerRef.value) return;
      const scrollAmount = 68 * 4;
      const newScrollLeft = direction === "left" ? thumbnailContainerRef.value.scrollLeft - scrollAmount : thumbnailContainerRef.value.scrollLeft + scrollAmount;
      thumbnailContainerRef.value.scrollTo({
        left: newScrollLeft,
        behavior: "smooth"
      });
    }
    const showClothesDialog = ref(false);
    const showBackgroundDialog = ref(false);
    const showExportDialog = ref(false);
    const showPreviewDialog = ref(false);
    const previewVariant = ref(null);
    const showRefPreviewDialog = ref(false);
    const previewRefImage = ref("");
    const previewIndex = ref(0);
    const currentPreviewList = ref([]);
    const defaultModel = ref(null);
    const availableModels = ref([]);
    const providerModels = ref([]);
    const modelSearchKeyword = ref("");
    const filteredProviderModels = computed(() => {
      if (!modelSearchKeyword.value) {
        return providerModels.value;
      }
      const keyword = modelSearchKeyword.value.toLowerCase();
      return providerModels.value.map((provider) => ({
        ...provider,
        models: provider.models.filter(
          (model) => model.name.toLowerCase().includes(keyword) || model.id.toLowerCase().includes(keyword) || provider.name.toLowerCase().includes(keyword)
        )
      })).filter((provider) => provider.models.length > 0);
    });
    const selectedModelKey = ref("");
    const sizeOptions = [
      { label: "768×1024 (竖版全身)", value: "768x1024" },
      { label: "896×1152 (竖版全身)", value: "896x1152" },
      { label: "1024×1792 (竖版全身)", value: "1024x1792" },
      { label: "1024×1024 (正方形)", value: "1024x1024" },
      { label: "512×512", value: "512x512" },
      { label: "768×768", value: "768x768" },
      { label: "1024×768 (横版)", value: "1024x768" },
      { label: "1792×1024 (横版)", value: "1792x1024" }
    ];
    const generateConfig = ref({
      prompt: "",
      negativePrompt: "",
      size: "768x1024",
      // 默认使用竖版尺寸，更适合全身照
      referenceImages: []
    });
    const defaultPrompt = computed(() => {
      if (!character.value) return "";
      const c = character.value;
      const genderText = c.gender === "male" ? "男性" : "女性";
      const raceText = c.race === "asian" ? "亚洲人" : "欧洲人";
      return `${c.name}，${genderText}，${c.age}岁，${raceText}，身高${c.height}cm，体重${c.weight}kg${c.description ? "，" + c.description : ""}`;
    });
    const hasFrontImage = computed(
      () => variants.value.some((v) => v.angle === "front" && v.type === "base")
    );
    const frontVariants = computed(() => {
      const frontList = variants.value.filter((v) => v.angle === "front");
      return frontList.sort((a, b) => {
        if (a.type === "base" && b.type !== "base") return -1;
        if (a.type !== "base" && b.type === "base") return 1;
        return a.createdAt - b.createdAt;
      });
    });
    const currentFrontVariant = computed(() => {
      if (selectedFrontVariantId.value) {
        return frontVariants.value.find((v) => v.id === selectedFrontVariantId.value);
      }
      return variants.value.find((v) => v.angle === "front" && v.type === "base") || frontVariants.value[0];
    });
    const variantGroups = computed(() => {
      const groups = /* @__PURE__ */ new Map();
      for (const variant of variants.value) {
        let groupId;
        if (variant.type === "base") {
          groupId = "base";
        } else if (variant.angle === "front") {
          groupId = variant.id;
        } else {
          groupId = variant.parentId || variant.id;
        }
        if (!groups.has(groupId)) {
          let title = "基础形象";
          if (variant.type === "clothes") {
            title = `换衣：${variant.variantInfo?.clothesDescription || ""}`;
          } else if (variant.type === "background") {
            title = `换背景：${variant.variantInfo?.backgroundDescription || ""}`;
          }
          groups.set(groupId, {
            id: groupId,
            title,
            variants: [],
            hasAllAngles: false
          });
        }
        const group = groups.get(groupId);
        group.variants.push(variant);
        if (variant.angle === "front") {
          group.frontVariant = variant;
        }
      }
      for (const group of groups.values()) {
        const angles = new Set(group.variants.map((v) => v.angle));
        group.hasAllAngles = angles.has("front") && angles.has("left") && angles.has("right") && angles.has("back");
      }
      const result = Array.from(groups.values());
      result.sort((a, b) => {
        const typeA = a.variants[0]?.type || "base";
        const typeB = b.variants[0]?.type || "base";
        if (typeA === "base" && typeB !== "base") return -1;
        if (typeA !== "base" && typeB === "base") return 1;
        const timeA = Math.min(...a.variants.map((v) => v.createdAt));
        const timeB = Math.min(...b.variants.map((v) => v.createdAt));
        return timeA - timeB;
      });
      const angleOrder = { front: 0, left: 1, right: 2, back: 3 };
      for (const group of result) {
        group.variants.sort((a, b) => {
          if (a.angle === "front" && b.angle !== "front") return -1;
          if (a.angle !== "front" && b.angle === "front") return 1;
          if (a.angle === b.angle) return a.createdAt - b.createdAt;
          return (angleOrder[a.angle] ?? 99) - (angleOrder[b.angle] ?? 99);
        });
      }
      return result;
    });
    async function loadDefaultModel() {
      try {
        const result = await window.electronAPI.image.getProviders();
        if (result.success && result.data) {
          const providers = result.data.filter((p) => p.configured && p.models?.length > 0);
          providerModels.value = providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            models: (provider.models || []).map((model) => ({
              id: model.id,
              name: model.name,
              maxResolution: model.maxResolution
            }))
          }));
          availableModels.value = [];
          for (const provider of providers) {
            for (const model of provider.models || []) {
              availableModels.value.push({
                key: `${provider.id}:${model.id}`,
                label: `${provider.name} - ${model.name}`,
                providerId: provider.id,
                modelId: model.id
              });
            }
          }
          if (availableModels.value.length > 0) {
            const first = availableModels.value[0];
            defaultModel.value = {
              providerId: first.providerId,
              modelId: first.modelId
            };
            selectedModelKey.value = first.key;
          }
        }
      } catch (error) {
        console.error("加载模型失败:", error);
      }
    }
    function filterModels(keyword) {
      modelSearchKeyword.value = keyword;
    }
    function onModelChange(key) {
      const model = availableModels.value.find((m) => m.key === key);
      if (model) {
        defaultModel.value = {
          providerId: model.providerId,
          modelId: model.modelId
        };
      }
    }
    async function selectReferenceImage() {
      try {
        const result = await window.electronAPI.image.selectFile();
        if (result.success && result.data) {
          generateConfig.value.referenceImages.push(result.data.base64);
        }
      } catch (error) {
        ElMessage.error(error.message || "选择图片失败");
      }
    }
    function removeReferenceImage(index) {
      generateConfig.value.referenceImages.splice(index, 1);
    }
    async function loadCharacter() {
      if (!props.characterId) return;
      const result = await window.electronAPI.portrait.getCharacter(props.characterId);
      if (result.success && result.data) {
        character.value = result.data;
        if (result.data.referenceImages) {
          generateConfig.value.referenceImages = [...result.data.referenceImages];
        }
        if (!result.data.prompt) {
          const c = result.data;
          const genderText = c.gender === "male" ? "male" : "female";
          const raceText = c.race === "asian" ? "Asian" : "European";
          generateConfig.value.prompt = `portrait of a person, ${genderText}, ${raceText}, age ${c.age}, height ${c.height}cm, weight ${c.weight}kg${c.description ? ", " + c.description : ""}`;
        } else {
          generateConfig.value.prompt = result.data.prompt;
        }
      }
    }
    async function loadVariants() {
      if (!props.characterId) return;
      const result = await window.electronAPI.portrait.listVariants(props.characterId);
      if (result.success && result.data) {
        variants.value = result.data;
        selectedFrontVariantId.value = null;
      }
    }
    async function handleGenerateFront() {
      if (!character.value || !defaultModel.value) return;
      generating.value = true;
      try {
        const prompt = generateConfig.value.prompt || defaultPrompt.value;
        const referenceImages = toRaw(generateConfig.value.referenceImages);
        const [width, height] = generateConfig.value.size.split("x").map(Number);
        await window.electronAPI.portrait.updateCharacter({
          id: props.characterId,
          providerId: defaultModel.value.providerId,
          modelId: defaultModel.value.modelId,
          prompt,
          referenceImages
        });
        const result = await window.electronAPI.portrait.generate({
          characterId: props.characterId,
          prompt,
          negativePrompt: generateConfig.value.negativePrompt || void 0,
          referenceImages,
          providerId: defaultModel.value.providerId,
          modelId: defaultModel.value.modelId,
          config: {
            angles: ["front"],
            backgroundType: "solid",
            width,
            height
          }
        });
        if (result.success) {
          if (result.warning) {
            ElMessage.warning(result.warning);
          } else {
            ElMessage.success("生成成功");
          }
          loadVariants();
          loadCharacter();
        } else {
          ElMessage.error(result.error || "生成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "生成失败");
      } finally {
        generating.value = false;
      }
    }
    async function handleRegenerateFront() {
      if (!character.value) return;
      try {
        await ElMessageBox.confirm("确定要重新生成正面形象吗？当前形象将被替换。", "确认", { type: "warning" });
      } catch {
        return;
      }
      regenerating.value = true;
      try {
        if (currentFrontVariant.value) {
          await window.electronAPI.portrait.deleteVariant(currentFrontVariant.value.id);
        }
        const char = toRaw(character.value);
        const result = await window.electronAPI.portrait.generate({
          characterId: props.characterId,
          prompt: char.prompt,
          referenceImages: toRaw(char.referenceImages),
          providerId: char.providerId,
          modelId: char.modelId,
          config: {
            angles: ["front"],
            backgroundType: "solid"
          }
        });
        if (result.success) {
          ElMessage.success("重新生成成功");
          loadVariants();
        } else {
          ElMessage.error(result.error || "生成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "生成失败");
      } finally {
        regenerating.value = false;
      }
    }
    async function handleEditFront() {
      if (!editPrompt.value.trim() || !currentFrontVariant.value) return;
      editing.value = true;
      try {
        const result = await window.electronAPI.portrait.editImage({
          characterId: props.characterId,
          variantId: currentFrontVariant.value.id,
          editPrompt: editPrompt.value.trim()
        });
        if (result.success) {
          ElMessage.success("编辑成功");
          editPrompt.value = "";
          loadVariants();
        } else {
          ElMessage.error(result.error || "编辑失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "编辑失败");
      } finally {
        editing.value = false;
      }
    }
    async function handleGenerateAngles() {
      if (anglesToGenerate.value.length === 0) return;
      generatingAngles.value = true;
      try {
        const result = await window.electronAPI.portrait.generateAngles({
          characterId: props.characterId,
          angles: toRaw(anglesToGenerate.value),
          variantId: currentFrontVariant.value?.id
        });
        if (result.success) {
          if (result.warning) {
            ElMessage.warning(result.warning);
          } else {
            ElMessage.success("多角度生成成功");
          }
          loadVariants();
        } else {
          ElMessage.error(result.error || "生成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "生成失败");
      } finally {
        generatingAngles.value = false;
      }
    }
    function openGenerateAnglesForVariant(variant) {
      selectedFrontVariantId.value = variant.id;
      const existingAngles = new Set(
        variants.value.filter((v) => v.parentId === variant.id || v.id === variant.id).map((v) => v.angle)
      );
      anglesToGenerate.value = ["left", "right", "back"].filter((a) => !existingAngles.has(a));
    }
    async function handleDeleteVariant(variant) {
      try {
        await ElMessageBox.confirm("确定要删除此图片吗？", "删除确认", { type: "warning" });
        const result = await window.electronAPI.portrait.deleteVariant(variant.id);
        if (result.success) {
          ElMessage.success("删除成功");
          loadVariants();
        } else {
          ElMessage.error(result.error || "删除失败");
        }
      } catch {
      }
    }
    function handlePreviewImage(variant, type = "front") {
      if (!variant) return;
      previewVariant.value = variant;
      if (type === "front") {
        currentPreviewList.value = frontVariants.value;
      } else {
        let groupId;
        if (variant.type === "base") {
          groupId = "base";
        } else if (variant.angle === "front") {
          groupId = variant.id;
        } else {
          groupId = variant.parentId || variant.id;
        }
        const group = variantGroups.value.find((g) => g.id === groupId);
        if (group) {
          currentPreviewList.value = group.variants;
        } else {
          currentPreviewList.value = [variant];
        }
      }
      previewIndex.value = currentPreviewList.value.findIndex((v) => v.id === variant.id);
      if (previewIndex.value < 0) previewIndex.value = 0;
      showPreviewDialog.value = true;
    }
    function prevImage() {
      if (previewIndex.value > 0) {
        previewIndex.value--;
        previewVariant.value = currentPreviewList.value[previewIndex.value];
      }
    }
    function nextImage() {
      if (previewIndex.value < currentPreviewList.value.length - 1) {
        previewIndex.value++;
        previewVariant.value = currentPreviewList.value[previewIndex.value];
      }
    }
    function handleExport() {
      showExportDialog.value = true;
    }
    async function downloadSingleImage(variant) {
      if (!variant?.imagePath) {
        ElMessage.error("图片不存在");
        return;
      }
      try {
        let imagePath = variant.imagePath;
        if (imagePath.startsWith("local-image:///")) {
          imagePath = imagePath.replace("local-image:///", "");
          if (imagePath.includes("/") && !imagePath.includes("\\")) {
            imagePath = imagePath.replace(/\//g, "\\");
          }
        }
        const parts = imagePath.replace(/\\/g, "/").split("/");
        const fileName = parts[parts.length - 1] || `portrait_${variant.angle}.png`;
        const saveResult = await window.electronAPI.file.saveFile({
          defaultPath: fileName,
          filters: [{ name: "PNG 图片", extensions: ["png"] }]
        });
        if (!saveResult.success || !saveResult.filePath) {
          return;
        }
        const copyResult = await window.electronAPI.file.copyFile(imagePath, saveResult.filePath);
        if (copyResult.success) {
          ElMessage.success(`保存成功：${saveResult.filePath}`);
        } else {
          ElMessage.error(copyResult.error || "保存失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "下载失败");
      }
    }
    function previewReferenceImage(img) {
      previewRefImage.value = img;
      showRefPreviewDialog.value = true;
    }
    watch(() => props.characterId, () => {
      loadCharacter();
      loadVariants();
      loadDefaultModel();
    }, { immediate: true });
    onMounted(() => {
      window.electronAPI.portrait.onGenerationEvent((data) => {
        if (data.type === "generation-completed" && data.characterId === props.characterId) {
          loadVariants();
        }
      });
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_option_group = resolveComponent("el-option-group");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_divider = resolveComponent("el-divider");
      const _component_el_checkbox = resolveComponent("el-checkbox");
      const _component_el_checkbox_group = resolveComponent("el-checkbox-group");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createVNode(_component_el_button, {
            onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("back"))
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(arrow_left_default))
                ]),
                _: 1
              }),
              _cache[18] || (_cache[18] = createTextVNode(" 返回 ", -1))
            ]),
            _: 1
          }),
          character.value ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
            createBaseVNode("span", _hoisted_4$1, toDisplayString(character.value.name), 1),
            createVNode(_component_el_tag, {
              size: "small",
              type: "info",
              effect: "plain"
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(unref(GENDER_LABELS)[character.value.gender]) + " · " + toDisplayString(character.value.age) + "岁 ", 1)
              ]),
              _: 1
            })
          ])) : createCommentVNode("", true),
          hasFrontImage.value ? (openBlock(), createBlock(_component_el_button, {
            key: 1,
            type: "primary",
            onClick: handleExport
          }, {
            default: withCtx(() => [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(download_default))
                ]),
                _: 1
              }),
              _cache[19] || (_cache[19] = createTextVNode(" 导出 ", -1))
            ]),
            _: 1
          })) : createCommentVNode("", true)
        ]),
        !hasFrontImage.value ? (openBlock(), createElementBlock("div", _hoisted_5$1, [
          createBaseVNode("div", _hoisted_6$1, [
            createBaseVNode("div", _hoisted_7$1, [
              createBaseVNode("div", _hoisted_8$1, [
                createVNode(_component_el_icon, { size: 32 }, {
                  default: withCtx(() => [
                    createVNode(unref(user_default))
                  ]),
                  _: 1
                })
              ]),
              _cache[20] || (_cache[20] = createBaseVNode("div", { class: "panel-title" }, [
                createBaseVNode("h3", null, "生成人物形象"),
                createBaseVNode("p", null, "根据人物信息生成正面形象")
              ], -1))
            ]),
            createBaseVNode("div", _hoisted_9$1, [
              createBaseVNode("div", _hoisted_10$1, [
                _cache[21] || (_cache[21] = createBaseVNode("div", { class: "form-label" }, "生成模型", -1)),
                createVNode(_component_el_select, {
                  modelValue: selectedModelKey.value,
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selectedModelKey.value = $event),
                  placeholder: "选择生成模型",
                  class: "model-select",
                  filterable: "",
                  "filter-method": filterModels,
                  onChange: onModelChange
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
                                createBaseVNode("div", _hoisted_11$1, [
                                  createBaseVNode("span", _hoisted_12$1, toDisplayString(model.name), 1),
                                  model.maxResolution ? (openBlock(), createElementBlock("span", _hoisted_13$1, toDisplayString(model.maxResolution), 1)) : createCommentVNode("", true)
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
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_14$1, [
                _cache[22] || (_cache[22] = createBaseVNode("div", { class: "form-label" }, "图片尺寸", -1)),
                createVNode(_component_el_select, {
                  modelValue: generateConfig.value.size,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => generateConfig.value.size = $event),
                  class: "size-select"
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
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_15$1, [
                _cache[24] || (_cache[24] = createBaseVNode("div", { class: "form-label" }, "提示词", -1)),
                createBaseVNode("div", _hoisted_16$1, [
                  createVNode(_component_el_input, {
                    modelValue: generateConfig.value.prompt,
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => generateConfig.value.prompt = $event),
                    type: "textarea",
                    rows: 3,
                    placeholder: "可修改或补充人物描述...",
                    resize: "none",
                    class: "prompt-input"
                  }, null, 8, ["modelValue"]),
                  _cache[23] || (_cache[23] = createBaseVNode("div", { class: "prompt-hint" }, "建议使用英文描述以避免部分云服务的内容审核问题", -1))
                ])
              ]),
              createBaseVNode("div", _hoisted_17$1, [
                _cache[25] || (_cache[25] = createBaseVNode("div", { class: "form-label" }, "反向提示词", -1)),
                createVNode(_component_el_input, {
                  modelValue: generateConfig.value.negativePrompt,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => generateConfig.value.negativePrompt = $event),
                  type: "textarea",
                  rows: 1,
                  placeholder: "不想出现的内容，如：模糊、低质量、变形...",
                  resize: "none",
                  class: "negative-input"
                }, null, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_18$1, [
                _cache[27] || (_cache[27] = createBaseVNode("div", { class: "form-label" }, "参考图片", -1)),
                createBaseVNode("div", _hoisted_19$1, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(generateConfig.value.referenceImages, (img, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: index,
                      class: "reference-image-item"
                    }, [
                      createVNode(_component_el_image, {
                        src: img,
                        fit: "cover"
                      }, null, 8, ["src"]),
                      createVNode(_component_el_button, {
                        class: "remove-btn",
                        type: "danger",
                        size: "small",
                        circle: "",
                        onClick: ($event) => removeReferenceImage(index)
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(close_default))
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }, 8, ["onClick"])
                    ]);
                  }), 128)),
                  generateConfig.value.referenceImages.length < 3 ? (openBlock(), createElementBlock("div", {
                    key: 0,
                    class: "upload-btn",
                    onClick: selectReferenceImage
                  }, [
                    createVNode(_component_el_icon, { size: 20 }, {
                      default: withCtx(() => [
                        createVNode(unref(plus_default))
                      ]),
                      _: 1
                    }),
                    _cache[26] || (_cache[26] = createBaseVNode("span", null, "上传参考图", -1))
                  ])) : createCommentVNode("", true)
                ]),
                _cache[28] || (_cache[28] = createBaseVNode("div", { class: "form-hint" }, "可选，上传参考图片辅助生成（最多3张）", -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_20$1, [
              createVNode(_component_el_button, {
                type: "primary",
                size: "large",
                class: "generate-btn",
                onClick: handleGenerateFront,
                loading: generating.value,
                disabled: !selectedModelKey.value
              }, {
                default: withCtx(() => [
                  !generating.value ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                    default: withCtx(() => [
                      createVNode(unref(magic_stick_default))
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  createTextVNode(" " + toDisplayString(availableModels.value.length > 0 ? "开始生成" : "请先配置图像生成模型"), 1)
                ]),
                _: 1
              }, 8, ["loading", "disabled"])
            ])
          ])
        ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("div", _hoisted_21$1, [
            createBaseVNode("div", _hoisted_22$1, [
              createBaseVNode("div", _hoisted_23$1, [
                createVNode(_component_el_image, {
                  src: currentFrontVariant.value?.imagePath,
                  fit: "contain",
                  onDblclick: _cache[5] || (_cache[5] = ($event) => handlePreviewImage(currentFrontVariant.value, "front"))
                }, null, 8, ["src"])
              ]),
              frontVariants.value.length > 1 ? (openBlock(), createElementBlock("div", _hoisted_24$1, [
                frontVariants.value.length > 4 ? (openBlock(), createBlock(_component_el_button, {
                  key: 0,
                  class: "scroll-btn left",
                  size: "small",
                  circle: "",
                  onClick: _cache[6] || (_cache[6] = ($event) => scrollThumbnails("left"))
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(arrow_left_default))
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                createBaseVNode("div", {
                  class: "variant-tabs",
                  ref_key: "thumbnailContainerRef",
                  ref: thumbnailContainerRef
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(frontVariants.value, (fv) => {
                    return openBlock(), createElementBlock("div", {
                      key: fv.id,
                      class: normalizeClass(["variant-tab", { active: selectedFrontVariantId.value === fv.id }]),
                      onClick: ($event) => selectedFrontVariantId.value = fv.id
                    }, [
                      createVNode(_component_el_image, {
                        src: fv.imagePath,
                        fit: "cover"
                      }, null, 8, ["src"])
                    ], 10, _hoisted_25$1);
                  }), 128))
                ], 512),
                frontVariants.value.length > 4 ? (openBlock(), createBlock(_component_el_button, {
                  key: 1,
                  class: "scroll-btn right",
                  size: "small",
                  circle: "",
                  onClick: _cache[7] || (_cache[7] = ($event) => scrollThumbnails("right"))
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(arrow_right_default))
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                })) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_26, [
                createVNode(_component_el_button, {
                  size: "small",
                  onClick: handleRegenerateFront,
                  loading: regenerating.value
                }, {
                  default: withCtx(() => [..._cache[29] || (_cache[29] = [
                    createTextVNode(" 重新生成 ", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"]),
                createVNode(_component_el_button, {
                  size: "small",
                  onClick: _cache[8] || (_cache[8] = ($event) => showClothesDialog.value = true)
                }, {
                  default: withCtx(() => [..._cache[30] || (_cache[30] = [
                    createTextVNode(" 换衣 ", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  size: "small",
                  onClick: _cache[9] || (_cache[9] = ($event) => showBackgroundDialog.value = true)
                }, {
                  default: withCtx(() => [..._cache[31] || (_cache[31] = [
                    createTextVNode(" 换背景 ", -1)
                  ])]),
                  _: 1
                })
              ])
            ]),
            createBaseVNode("div", _hoisted_27, [
              currentFrontVariant.value ? (openBlock(), createElementBlock("div", _hoisted_28, [
                _cache[36] || (_cache[36] = createBaseVNode("h4", null, "生成信息", -1)),
                createBaseVNode("div", _hoisted_29, [
                  _cache[32] || (_cache[32] = createBaseVNode("span", { class: "info-label" }, "提示词", -1)),
                  createBaseVNode("div", _hoisted_30, toDisplayString(currentFrontVariant.value.prompt || "无"), 1)
                ]),
                createBaseVNode("div", _hoisted_31, [
                  createBaseVNode("div", _hoisted_32, [
                    _cache[33] || (_cache[33] = createBaseVNode("span", { class: "info-label" }, "尺寸", -1)),
                    createBaseVNode("span", _hoisted_33, toDisplayString(currentFrontVariant.value.config?.width || "-") + " × " + toDisplayString(currentFrontVariant.value.config?.height || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_34, [
                    _cache[34] || (_cache[34] = createBaseVNode("span", { class: "info-label" }, "角度", -1)),
                    createBaseVNode("span", _hoisted_35, toDisplayString(unref(ANGLE_LABELS)[currentFrontVariant.value.angle]), 1)
                  ])
                ]),
                character.value?.referenceImages?.length ? (openBlock(), createElementBlock("div", _hoisted_36, [
                  _cache[35] || (_cache[35] = createBaseVNode("span", { class: "info-label" }, "参考图", -1)),
                  createBaseVNode("div", _hoisted_37, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(character.value.referenceImages, (img, idx) => {
                      return openBlock(), createBlock(_component_el_image, {
                        key: idx,
                        src: img,
                        fit: "cover",
                        class: "ref-thumb",
                        onClick: ($event) => previewReferenceImage(img)
                      }, null, 8, ["src", "onClick"]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              createVNode(_component_el_divider),
              createBaseVNode("div", _hoisted_38, [
                _cache[38] || (_cache[38] = createBaseVNode("h4", null, "编辑形象", -1)),
                createVNode(_component_el_input, {
                  modelValue: editPrompt.value,
                  "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => editPrompt.value = $event),
                  type: "textarea",
                  rows: 2,
                  placeholder: "输入编辑指令，如：戴上帽子、改变发型...",
                  resize: "none"
                }, null, 8, ["modelValue"]),
                createVNode(_component_el_button, {
                  type: "primary",
                  disabled: !editPrompt.value.trim() || editing.value,
                  loading: editing.value,
                  onClick: handleEditFront,
                  class: "action-btn"
                }, {
                  default: withCtx(() => [..._cache[37] || (_cache[37] = [
                    createTextVNode(" 编辑形象 ", -1)
                  ])]),
                  _: 1
                }, 8, ["disabled", "loading"])
              ]),
              createVNode(_component_el_divider),
              createBaseVNode("div", _hoisted_39, [
                _cache[43] || (_cache[43] = createBaseVNode("h4", null, "生成其他角度", -1)),
                createBaseVNode("div", _hoisted_40, [
                  createVNode(_component_el_checkbox_group, {
                    modelValue: anglesToGenerate.value,
                    "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => anglesToGenerate.value = $event),
                    class: "angle-checkbox-group"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_checkbox, { value: "left" }, {
                        default: withCtx(() => [..._cache[39] || (_cache[39] = [
                          createTextVNode("左侧", -1)
                        ])]),
                        _: 1
                      }),
                      createVNode(_component_el_checkbox, { value: "right" }, {
                        default: withCtx(() => [..._cache[40] || (_cache[40] = [
                          createTextVNode("右侧", -1)
                        ])]),
                        _: 1
                      }),
                      createVNode(_component_el_checkbox, { value: "back" }, {
                        default: withCtx(() => [..._cache[41] || (_cache[41] = [
                          createTextVNode("背面", -1)
                        ])]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }, 8, ["modelValue"]),
                  createVNode(_component_el_button, {
                    type: "primary",
                    disabled: anglesToGenerate.value.length === 0 || generatingAngles.value,
                    loading: generatingAngles.value,
                    onClick: handleGenerateAngles
                  }, {
                    default: withCtx(() => [..._cache[42] || (_cache[42] = [
                      createTextVNode(" 生成 ", -1)
                    ])]),
                    _: 1
                  }, 8, ["disabled", "loading"])
                ])
              ])
            ])
          ]),
          variantGroups.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_41, [
            _cache[45] || (_cache[45] = createBaseVNode("h3", null, "套图列表", -1)),
            (openBlock(true), createElementBlock(Fragment, null, renderList(variantGroups.value, (group) => {
              return openBlock(), createElementBlock("div", {
                key: group.id,
                class: "variant-group"
              }, [
                createBaseVNode("div", _hoisted_42, [
                  createBaseVNode("h4", null, toDisplayString(group.title), 1),
                  createBaseVNode("div", _hoisted_43, [
                    !group.hasAllAngles && group.frontVariant ? (openBlock(), createBlock(_component_el_button, {
                      key: 0,
                      size: "small",
                      type: "primary",
                      onClick: ($event) => openGenerateAnglesForVariant(group.frontVariant)
                    }, {
                      default: withCtx(() => [..._cache[44] || (_cache[44] = [
                        createTextVNode(" 生成其他角度 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])) : createCommentVNode("", true)
                  ])
                ]),
                createBaseVNode("div", _hoisted_44, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(group.variants, (variant) => {
                    return openBlock(), createElementBlock("div", {
                      key: variant.id,
                      class: "variant-card"
                    }, [
                      createVNode(_component_el_image, {
                        src: variant.imagePath,
                        fit: "contain",
                        onDblclick: ($event) => handlePreviewImage(variant, "group")
                      }, null, 8, ["src", "onDblclick"]),
                      createBaseVNode("div", _hoisted_45, [
                        createBaseVNode("span", _hoisted_46, toDisplayString(unref(ANGLE_LABELS)[variant.angle]), 1),
                        createBaseVNode("div", _hoisted_47, [
                          createVNode(_component_el_button, {
                            type: "primary",
                            size: "small",
                            circle: "",
                            title: "下载",
                            onClick: ($event) => downloadSingleImage(variant)
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(download_default))
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }, 8, ["onClick"]),
                          createVNode(_component_el_button, {
                            type: "danger",
                            size: "small",
                            circle: "",
                            title: "删除",
                            onClick: ($event) => handleDeleteVariant(variant)
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
                ])
              ]);
            }), 128))
          ])) : createCommentVNode("", true)
        ], 64)),
        createVNode(ChangeClothesDialog, {
          modelValue: showClothesDialog.value,
          "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => showClothesDialog.value = $event),
          "character-id": __props.characterId,
          "variant-id": currentFrontVariant.value?.id,
          onSuccess: loadVariants
        }, null, 8, ["modelValue", "character-id", "variant-id"]),
        createVNode(ChangeBackgroundDialog, {
          modelValue: showBackgroundDialog.value,
          "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => showBackgroundDialog.value = $event),
          "character-id": __props.characterId,
          "variant-id": currentFrontVariant.value?.id,
          onSuccess: loadVariants
        }, null, 8, ["modelValue", "character-id", "variant-id"]),
        createVNode(ExportDialog, {
          modelValue: showExportDialog.value,
          "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => showExportDialog.value = $event),
          "character-id": __props.characterId,
          variants: variants.value
        }, null, 8, ["modelValue", "character-id", "variants"]),
        createVNode(_component_el_dialog, {
          modelValue: showPreviewDialog.value,
          "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => showPreviewDialog.value = $event),
          title: previewVariant.value ? unref(ANGLE_LABELS)[previewVariant.value.angle] : "",
          width: "90%",
          class: "preview-dialog",
          "append-to-body": "",
          "destroy-on-close": "",
          onKeydown: [
            withKeys(prevImage, ["left"]),
            withKeys(nextImage, ["right"])
          ]
        }, {
          default: withCtx(() => [
            previewVariant.value ? (openBlock(), createElementBlock("div", _hoisted_48, [
              createBaseVNode("div", {
                class: normalizeClass(["nav-btn nav-prev", { disabled: previewIndex.value === 0 }]),
                onClick: withModifiers(prevImage, ["stop"])
              }, [
                createVNode(_component_el_icon, { size: 32 }, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_left_default))
                  ]),
                  _: 1
                })
              ], 2),
              createBaseVNode("img", {
                src: previewVariant.value.imagePath,
                alt: "预览",
                onClick: withModifiers(nextImage, ["stop"]),
                draggable: "false"
              }, null, 8, _hoisted_49),
              createBaseVNode("div", {
                class: normalizeClass(["nav-btn nav-next", { disabled: previewIndex.value >= currentPreviewList.value.length - 1 }]),
                onClick: withModifiers(nextImage, ["stop"])
              }, [
                createVNode(_component_el_icon, { size: 32 }, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_right_default))
                  ]),
                  _: 1
                })
              ], 2),
              createBaseVNode("div", {
                class: "download-btn",
                onClick: _cache[15] || (_cache[15] = withModifiers(($event) => downloadSingleImage(previewVariant.value), ["stop"]))
              }, [
                createVNode(_component_el_icon, { size: 24 }, {
                  default: withCtx(() => [
                    createVNode(unref(download_default))
                  ]),
                  _: 1
                })
              ])
            ])) : createCommentVNode("", true),
            currentPreviewList.value.length > 1 ? (openBlock(), createElementBlock("div", _hoisted_50, toDisplayString(previewIndex.value + 1) + " / " + toDisplayString(currentPreviewList.value.length), 1)) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showRefPreviewDialog.value,
          "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => showRefPreviewDialog.value = $event),
          title: "参考图",
          width: "auto",
          class: "ref-preview-dialog",
          "append-to-body": ""
        }, {
          default: withCtx(() => [
            createVNode(_component_el_image, {
              src: previewRefImage.value,
              fit: "contain",
              style: { "max-width": "80vw", "max-height": "80vh" }
            }, null, 8, ["src"])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const CharacterEditor = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-6291fb72"]]);
const _hoisted_1 = { class: "portrait-page" };
const _hoisted_2 = { class: "page-sidebar" };
const _hoisted_3 = { class: "sidebar-header" };
const _hoisted_4 = { class: "project-list" };
const _hoisted_5 = ["onClick"];
const _hoisted_6 = { class: "project-preview" };
const _hoisted_7 = { class: "preview-placeholder" };
const _hoisted_8 = {
  key: 1,
  class: "preview-placeholder"
};
const _hoisted_9 = { class: "project-info" };
const _hoisted_10 = { class: "project-name" };
const _hoisted_11 = { class: "project-date" };
const _hoisted_12 = { class: "page-main" };
const _hoisted_13 = {
  key: 0,
  class: "empty-state"
};
const _hoisted_14 = {
  key: 1,
  class: "character-list-page"
};
const _hoisted_15 = { class: "page-header" };
const _hoisted_16 = {
  key: 0,
  class: "character-grid"
};
const _hoisted_17 = ["onClick"];
const _hoisted_18 = { class: "character-avatar" };
const _hoisted_19 = { class: "avatar-placeholder" };
const _hoisted_20 = {
  key: 1,
  class: "avatar-placeholder"
};
const _hoisted_21 = { class: "character-info" };
const _hoisted_22 = { class: "character-desc" };
const _hoisted_23 = { class: "character-race" };
const _hoisted_24 = { class: "character-stats" };
const _hoisted_25 = { class: "card-actions" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Portrait",
  setup(__props) {
    const projects = ref([]);
    const characters = ref([]);
    const allVariants = ref(/* @__PURE__ */ new Map());
    const allCharacters = ref(/* @__PURE__ */ new Map());
    const selectedProjectId = ref("");
    const selectedCharacterId = ref("");
    const showCreateDialog = ref(false);
    const showCreateCharacterDialog = ref(false);
    const showEditCharacterDialog = ref(false);
    const editingCharacter = ref(null);
    const newProjectForm = ref({ name: "" });
    const creating = ref(false);
    const selectedProject = computed(
      () => projects.value.find((p) => p.id === selectedProjectId.value)
    );
    async function loadProjects() {
      const result = await window.electronAPI.portrait.listProjects();
      if (result.success && result.data) {
        projects.value = result.data.projects;
        preloadAllProjectData();
      }
    }
    async function preloadAllProjectData() {
      for (const project of projects.value) {
        try {
          const result = await window.electronAPI.portrait.listCharacters(project.id);
          if (result.success && result.data && result.data.length > 0) {
            allCharacters.value.set(project.id, result.data);
            const firstChar = result.data[0];
            if (!allVariants.value.has(firstChar.id)) {
              const variantsResult = await window.electronAPI.portrait.listVariants(firstChar.id);
              if (variantsResult.success && variantsResult.data) {
                allVariants.value.set(firstChar.id, variantsResult.data);
              }
            }
          }
        } catch (e) {
          console.error("预加载项目数据失败:", e);
        }
      }
    }
    async function loadCharacters() {
      if (!selectedProjectId.value) {
        characters.value = [];
        return;
      }
      const result = await window.electronAPI.portrait.listCharacters(selectedProjectId.value);
      if (result.success && result.data) {
        characters.value = result.data;
        allCharacters.value.set(selectedProjectId.value, result.data);
        for (const char of characters.value) {
          loadVariantsForCharacter(char.id);
        }
      }
    }
    async function loadVariantsForCharacter(characterId) {
      const result = await window.electronAPI.portrait.listVariants(characterId);
      if (result.success && result.data) {
        allVariants.value.set(characterId, result.data);
      }
    }
    function selectProject(id) {
      selectedProjectId.value = id;
      selectedCharacterId.value = "";
      loadCharacters();
    }
    function selectCharacter(id) {
      selectedCharacterId.value = id;
    }
    function getProjectPreview(projectId) {
      const projectCharacters = allCharacters.value.get(projectId) || [];
      for (const char of projectCharacters) {
        const variants = allVariants.value.get(char.id) || [];
        const frontBaseVariant = variants.find((v) => v.angle === "front" && v.type === "base");
        if (frontBaseVariant) return frontBaseVariant.imagePath;
      }
      return "";
    }
    function getCharacterPreview(characterId) {
      const variants = allVariants.value.get(characterId) || [];
      const frontBaseVariant = variants.find((v) => v.angle === "front" && v.type === "base");
      return frontBaseVariant?.imagePath || "";
    }
    function getVariantCount(characterId) {
      return allVariants.value.get(characterId)?.length || 0;
    }
    function formatDate(timestamp) {
      return new Date(timestamp).toLocaleDateString("zh-CN");
    }
    function handleCreateProject() {
      newProjectForm.value.name = "";
      showCreateDialog.value = true;
    }
    async function confirmCreateProject() {
      if (!newProjectForm.value.name.trim()) {
        ElMessage.warning("请输入项目名称");
        return;
      }
      creating.value = true;
      try {
        const result = await window.electronAPI.portrait.createProject({
          name: newProjectForm.value.name.trim()
        });
        if (result.success && result.data) {
          ElMessage.success("项目创建成功");
          showCreateDialog.value = false;
          await loadProjects();
          selectProject(result.data.id);
        } else {
          ElMessage.error(result.error || "创建失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "创建失败");
      } finally {
        creating.value = false;
      }
    }
    async function handleProjectCommand(command, project) {
      if (command === "delete") {
        try {
          await ElMessageBox.confirm("确定要删除此项目吗？所有相关的图片都将被删除。", "删除确认", {
            type: "warning"
          });
          const result = await window.electronAPI.portrait.deleteProject(project.id);
          if (result.success) {
            ElMessage.success("删除成功");
            if (selectedProjectId.value === project.id) {
              selectedProjectId.value = "";
              selectedCharacterId.value = "";
            }
            loadProjects();
          } else {
            ElMessage.error(result.error || "删除失败");
          }
        } catch {
        }
      } else if (command === "rename") {
        const { value } = await ElMessageBox.prompt("请输入新名称", "重命名", {
          inputValue: project.name
        });
        if (value) {
          const result = await window.electronAPI.portrait.updateProject({
            id: project.id,
            name: value
          });
          if (result.success) {
            ElMessage.success("重命名成功");
            loadProjects();
          } else {
            ElMessage.error(result.error || "重命名失败");
          }
        }
      }
    }
    async function handleDeleteCharacter(character) {
      try {
        await ElMessageBox.confirm(`确定要删除人物「${character.name}」吗？所有相关的图片都将被删除。`, "删除确认", {
          type: "warning"
        });
        const result = await window.electronAPI.portrait.deleteCharacter(character.id);
        if (result.success) {
          ElMessage.success("删除成功");
          loadCharacters();
        } else {
          ElMessage.error(result.error || "删除失败");
        }
      } catch {
      }
    }
    function handleCharacterCreated(characterId) {
      loadCharacters();
      selectedCharacterId.value = characterId;
    }
    function handleCharacterUpdated() {
      loadCharacters();
    }
    function openEditCharacterDialog(character) {
      editingCharacter.value = character;
      showEditCharacterDialog.value = true;
    }
    function handleCharacterDeleted() {
      selectedCharacterId.value = "";
      loadCharacters();
    }
    onMounted(async () => {
      await loadProjects();
      window.electronAPI.portrait.onGenerationEvent((data) => {
        if (data.type === "generation-completed") {
          if (data.characterId) {
            loadVariantsForCharacter(data.characterId);
          }
        }
      });
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_image = resolveComponent("el-image");
      const _component_el_dropdown_item = resolveComponent("el-dropdown-item");
      const _component_el_dropdown_menu = resolveComponent("el-dropdown-menu");
      const _component_el_dropdown = resolveComponent("el-dropdown");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            _cache[10] || (_cache[10] = createBaseVNode("span", { class: "sidebar-title" }, "人像项目", -1)),
            createVNode(_component_el_button, {
              type: "primary",
              size: "small",
              onClick: handleCreateProject
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[9] || (_cache[9] = createTextVNode(" 新建 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_4, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(projects.value, (project) => {
              return openBlock(), createElementBlock("div", {
                key: project.id,
                class: normalizeClass(["project-item", { active: selectedProjectId.value === project.id }]),
                onClick: ($event) => selectProject(project.id)
              }, [
                createBaseVNode("div", _hoisted_6, [
                  getProjectPreview(project.id) ? (openBlock(), createBlock(_component_el_image, {
                    key: 0,
                    src: getProjectPreview(project.id),
                    fit: "cover"
                  }, {
                    error: withCtx(() => [
                      createBaseVNode("div", _hoisted_7, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(folder_default))
                          ]),
                          _: 1
                        })
                      ])
                    ]),
                    _: 1
                  }, 8, ["src"])) : (openBlock(), createElementBlock("div", _hoisted_8, [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(folder_default))
                      ]),
                      _: 1
                    })
                  ]))
                ]),
                createBaseVNode("div", _hoisted_9, [
                  createBaseVNode("div", _hoisted_10, toDisplayString(project.name), 1),
                  createBaseVNode("div", _hoisted_11, toDisplayString(formatDate(project.createdAt)), 1)
                ]),
                createVNode(_component_el_dropdown, {
                  trigger: "click",
                  onCommand: ($event) => handleProjectCommand($event, project)
                }, {
                  dropdown: withCtx(() => [
                    createVNode(_component_el_dropdown_menu, null, {
                      default: withCtx(() => [
                        createVNode(_component_el_dropdown_item, { command: "rename" }, {
                          default: withCtx(() => [..._cache[11] || (_cache[11] = [
                            createTextVNode("重命名", -1)
                          ])]),
                          _: 1
                        }),
                        createVNode(_component_el_dropdown_item, {
                          command: "delete",
                          divided: ""
                        }, {
                          default: withCtx(() => [..._cache[12] || (_cache[12] = [
                            createTextVNode("删除", -1)
                          ])]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  default: withCtx(() => [
                    createVNode(_component_el_button, {
                      link: "",
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
                  _: 1
                }, 8, ["onCommand"])
              ], 10, _hoisted_5);
            }), 128)),
            projects.value.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
              key: 0,
              description: "还没有人像项目"
            })) : createCommentVNode("", true)
          ])
        ]),
        createBaseVNode("div", _hoisted_12, [
          !selectedProjectId.value ? (openBlock(), createElementBlock("div", _hoisted_13, [
            createVNode(_component_el_icon, {
              size: 64,
              color: "#c0c4cc"
            }, {
              default: withCtx(() => [
                createVNode(unref(folder_default))
              ]),
              _: 1
            }),
            _cache[13] || (_cache[13] = createBaseVNode("p", null, '请选择一个项目，或点击"新建"创建新项目', -1))
          ])) : !selectedCharacterId.value ? (openBlock(), createElementBlock("div", _hoisted_14, [
            createBaseVNode("div", _hoisted_15, [
              createVNode(_component_el_button, {
                onClick: _cache[0] || (_cache[0] = ($event) => selectedProjectId.value = "")
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(arrow_left_default))
                    ]),
                    _: 1
                  }),
                  _cache[14] || (_cache[14] = createTextVNode(" 返回 ", -1))
                ]),
                _: 1
              }),
              createBaseVNode("h2", null, toDisplayString(selectedProject.value?.name), 1),
              createVNode(_component_el_button, {
                type: "primary",
                onClick: _cache[1] || (_cache[1] = ($event) => showCreateCharacterDialog.value = true)
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(plus_default))
                    ]),
                    _: 1
                  }),
                  _cache[15] || (_cache[15] = createTextVNode(" 创建人物形象 ", -1))
                ]),
                _: 1
              })
            ]),
            characters.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_16, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(characters.value, (character) => {
                return openBlock(), createElementBlock("div", {
                  key: character.id,
                  class: "character-card",
                  onClick: ($event) => selectCharacter(character.id)
                }, [
                  createBaseVNode("div", _hoisted_18, [
                    getCharacterPreview(character.id) ? (openBlock(), createBlock(_component_el_image, {
                      key: 0,
                      src: getCharacterPreview(character.id),
                      fit: "cover"
                    }, {
                      error: withCtx(() => [
                        createBaseVNode("div", _hoisted_19, [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(user_default))
                            ]),
                            _: 1
                          })
                        ])
                      ]),
                      _: 1
                    }, 8, ["src"])) : (openBlock(), createElementBlock("div", _hoisted_20, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(user_default))
                        ]),
                        _: 1
                      })
                    ]))
                  ]),
                  createBaseVNode("div", _hoisted_21, [
                    createBaseVNode("h4", null, toDisplayString(character.name), 1),
                    createBaseVNode("p", _hoisted_22, toDisplayString(unref(GENDER_LABELS)[character.gender]) + " · " + toDisplayString(character.age) + "岁 · " + toDisplayString(character.height) + "cm ", 1),
                    createBaseVNode("p", _hoisted_23, toDisplayString(unref(RACE_LABELS)[character.race]), 1)
                  ]),
                  createBaseVNode("div", _hoisted_24, [
                    createBaseVNode("span", null, toDisplayString(getVariantCount(character.id)) + " 张图片", 1)
                  ]),
                  createBaseVNode("div", _hoisted_25, [
                    createVNode(_component_el_button, {
                      type: "primary",
                      size: "small",
                      circle: "",
                      class: "edit-btn",
                      onClick: withModifiers(($event) => openEditCharacterDialog(character), ["stop"])
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
                      type: "danger",
                      size: "small",
                      circle: "",
                      class: "delete-btn",
                      onClick: withModifiers(($event) => handleDeleteCharacter(character), ["stop"])
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
                ], 8, _hoisted_17);
              }), 128))
            ])) : (openBlock(), createBlock(_component_el_empty, {
              key: 1,
              description: "还没有人物形象，点击上方按钮创建"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: _cache[2] || (_cache[2] = ($event) => showCreateCharacterDialog.value = true)
                }, {
                  default: withCtx(() => [..._cache[16] || (_cache[16] = [
                    createTextVNode(" 创建人物形象 ", -1)
                  ])]),
                  _: 1
                })
              ]),
              _: 1
            }))
          ])) : (openBlock(), createBlock(CharacterEditor, {
            key: 2,
            "character-id": selectedCharacterId.value,
            project: selectedProject.value,
            onBack: _cache[3] || (_cache[3] = ($event) => selectedCharacterId.value = ""),
            onDeleted: handleCharacterDeleted
          }, null, 8, ["character-id", "project"]))
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showCreateDialog.value,
          "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => showCreateDialog.value = $event),
          title: "创建人像项目",
          width: "400px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[5] || (_cache[5] = ($event) => showCreateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[17] || (_cache[17] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: confirmCreateProject,
              loading: creating.value
            }, {
              default: withCtx(() => [..._cache[18] || (_cache[18] = [
                createTextVNode("确定", -1)
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
                createVNode(_component_el_form_item, { label: "项目名称" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newProjectForm.value.name,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => newProjectForm.value.name = $event),
                      placeholder: "请输入项目名称"
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
        createVNode(_sfc_main$6, {
          modelValue: showCreateCharacterDialog.value,
          "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => showCreateCharacterDialog.value = $event),
          "project-id": selectedProjectId.value,
          onSuccess: handleCharacterCreated
        }, null, 8, ["modelValue", "project-id"]),
        createVNode(_sfc_main$5, {
          modelValue: showEditCharacterDialog.value,
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => showEditCharacterDialog.value = $event),
          character: editingCharacter.value,
          onSuccess: handleCharacterUpdated
        }, null, 8, ["modelValue", "character"])
      ]);
    };
  }
});
const Portrait = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f6a660f4"]]);
export {
  Portrait as default
};
