import { d as defineComponent, w as watch, c as createBlock, a as withCtx, b as createVNode, e as createTextVNode, r as ref, E as ElMessage, f as resolveComponent, o as openBlock } from "./index-CEiunyEa.js";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "CreateCharacterDialog",
  props: {
    modelValue: { type: Boolean },
    projectId: {}
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
      if (!formRef.value) return;
      try {
        await formRef.value.validate();
      } catch {
        return;
      }
      loading.value = true;
      try {
        const result = await window.electronAPI.portrait.createCharacter({
          projectId: props.projectId,
          name: form.value.name,
          gender: form.value.gender,
          race: form.value.race,
          age: form.value.age,
          height: form.value.height,
          weight: form.value.weight,
          description: form.value.description || void 0
        });
        if (result.success && result.data) {
          ElMessage.success("人物形象创建成功");
          emit("update:modelValue", false);
          emit("success", result.data.id);
          resetForm();
        } else {
          ElMessage.error(result.error || "创建失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "创建失败");
      } finally {
        loading.value = false;
      }
    }
    function resetForm() {
      form.value = {
        name: "",
        gender: "male",
        race: "asian",
        age: 25,
        height: 170,
        weight: 60,
        description: ""
      };
    }
    watch(() => props.modelValue, (val) => {
      if (val) {
        resetForm();
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
        title: "创建人物形象",
        width: "650px",
        "close-on-click-modal": false,
        "append-to-body": false,
        "modal-append-to-body": false,
        center: ""
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
              createTextVNode("创建", -1)
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
export {
  _sfc_main as _
};
