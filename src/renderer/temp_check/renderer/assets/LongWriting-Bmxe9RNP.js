import { d as defineComponent, f as resolveComponent, o as openBlock, C as createElementBlock, b as createVNode, a as withCtx, c as createBlock, L as toDisplayString, G as Fragment, e as createTextVNode, D as createBaseVNode, aj as withKeys, r as ref, E as ElMessage, V as ElMessageBox, _ as _export_sfc, O as onMounted, M as unref, B as setting_default, P as plus_default, H as renderList, an as reading_default, y as document_default, h as computed, I as useRouter, ao as edit_default, T as withModifiers, U as delete_default } from "./index-CEiunyEa.js";
const _hoisted_1$1 = { class: "dictionary-editor" };
const _hoisted_2$1 = {
  key: 1,
  class: "item-code"
};
const _hoisted_3$1 = {
  key: 1,
  class: "item-name"
};
const _hoisted_4$1 = { class: "add-section" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "DictionaryEditor",
  props: {
    items: {},
    categoryCode: {}
  },
  emits: ["add", "update", "remove"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const newItemCode = ref("");
    const newItemName = ref("");
    const editingId = ref(null);
    const editForm = ref({
      code: "",
      name: ""
    });
    async function handleAdd() {
      if (!newItemCode.value.trim() || !newItemName.value.trim()) {
        ElMessage.warning("请输入编码和名称");
        return;
      }
      emit("add", props.categoryCode, newItemCode.value.trim(), newItemName.value.trim());
      newItemCode.value = "";
      newItemName.value = "";
    }
    function startEdit(item) {
      editingId.value = item.id;
      editForm.value = {
        code: item.code,
        name: item.name
      };
    }
    function cancelEdit() {
      editingId.value = null;
      editForm.value = { code: "", name: "" };
    }
    function saveEdit() {
      if (!editForm.value.code.trim() || !editForm.value.name.trim()) {
        ElMessage.warning("编码和名称不能为空");
        return;
      }
      emit("update", editingId.value, {
        code: editForm.value.code.trim(),
        name: editForm.value.name.trim()
      });
      editingId.value = null;
      editForm.value = { code: "", name: "" };
    }
    async function handleRemove(item) {
      try {
        await ElMessageBox.confirm(
          `确定要删除字典项「${item.name}」吗？`,
          "删除确认",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        emit("remove", props.categoryCode, item.id);
      } catch {
      }
    }
    return (_ctx, _cache) => {
      const _component_el_input = resolveComponent("el-input");
      const _component_el_table_column = resolveComponent("el-table-column");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_table = resolveComponent("el-table");
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createVNode(_component_el_table, {
          data: __props.items,
          size: "small",
          border: "",
          stripe: ""
        }, {
          default: withCtx(() => [
            createVNode(_component_el_table_column, {
              prop: "code",
              label: "编码",
              width: "120"
            }, {
              default: withCtx(({ row }) => [
                editingId.value === row.id ? (openBlock(), createBlock(_component_el_input, {
                  key: 0,
                  modelValue: editForm.value.code,
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => editForm.value.code = $event),
                  size: "small",
                  placeholder: "编码"
                }, null, 8, ["modelValue"])) : (openBlock(), createElementBlock("span", _hoisted_2$1, toDisplayString(row.code), 1))
              ]),
              _: 1
            }),
            createVNode(_component_el_table_column, {
              prop: "name",
              label: "名称"
            }, {
              default: withCtx(({ row }) => [
                editingId.value === row.id ? (openBlock(), createBlock(_component_el_input, {
                  key: 0,
                  modelValue: editForm.value.name,
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => editForm.value.name = $event),
                  size: "small",
                  placeholder: "名称"
                }, null, 8, ["modelValue"])) : (openBlock(), createElementBlock("span", _hoisted_3$1, toDisplayString(row.name), 1))
              ]),
              _: 1
            }),
            createVNode(_component_el_table_column, {
              label: "操作",
              width: "140",
              align: "center"
            }, {
              default: withCtx(({ row }) => [
                editingId.value === row.id ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createVNode(_component_el_button, {
                    size: "small",
                    type: "primary",
                    link: "",
                    onClick: saveEdit
                  }, {
                    default: withCtx(() => [..._cache[4] || (_cache[4] = [
                      createTextVNode("保存", -1)
                    ])]),
                    _: 1
                  }),
                  createVNode(_component_el_button, {
                    size: "small",
                    link: "",
                    onClick: cancelEdit
                  }, {
                    default: withCtx(() => [..._cache[5] || (_cache[5] = [
                      createTextVNode("取消", -1)
                    ])]),
                    _: 1
                  })
                ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createVNode(_component_el_button, {
                    size: "small",
                    link: "",
                    onClick: ($event) => startEdit(row)
                  }, {
                    default: withCtx(() => [..._cache[6] || (_cache[6] = [
                      createTextVNode("编辑", -1)
                    ])]),
                    _: 1
                  }, 8, ["onClick"]),
                  createVNode(_component_el_button, {
                    size: "small",
                    type: "danger",
                    link: "",
                    onClick: ($event) => handleRemove(row)
                  }, {
                    default: withCtx(() => [..._cache[7] || (_cache[7] = [
                      createTextVNode("删除", -1)
                    ])]),
                    _: 1
                  }, 8, ["onClick"])
                ], 64))
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["data"]),
        createBaseVNode("div", _hoisted_4$1, [
          createVNode(_component_el_input, {
            modelValue: newItemCode.value,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => newItemCode.value = $event),
            size: "small",
            placeholder: "编码",
            class: "add-input",
            onKeyup: withKeys(handleAdd, ["enter"])
          }, null, 8, ["modelValue"]),
          createVNode(_component_el_input, {
            modelValue: newItemName.value,
            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => newItemName.value = $event),
            size: "small",
            placeholder: "名称",
            class: "add-input",
            onKeyup: withKeys(handleAdd, ["enter"])
          }, null, 8, ["modelValue"]),
          createVNode(_component_el_button, {
            size: "small",
            type: "primary",
            onClick: handleAdd
          }, {
            default: withCtx(() => [..._cache[8] || (_cache[8] = [
              createTextVNode("新增", -1)
            ])]),
            _: 1
          })
        ])
      ]);
    };
  }
});
const DictionaryEditor = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-0c44e053"]]);
const _hoisted_1 = { class: "longwriting-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-actions" };
const _hoisted_4 = { class: "page-content" };
const _hoisted_5 = {
  key: 0,
  class: "project-list"
};
const _hoisted_6 = ["onClick"];
const _hoisted_7 = { class: "project-icon" };
const _hoisted_8 = { class: "project-info" };
const _hoisted_9 = { class: "project-name" };
const _hoisted_10 = { class: "project-meta" };
const _hoisted_11 = { class: "project-type" };
const _hoisted_12 = { class: "project-stage" };
const _hoisted_13 = { class: "project-progress" };
const _hoisted_14 = { class: "progress-text" };
const _hoisted_15 = { class: "project-actions" };
const _hoisted_16 = {
  key: 1,
  class: "empty-state"
};
const _hoisted_17 = { class: "dictionary-settings" };
const _hoisted_18 = { class: "category-header" };
const _hoisted_19 = { class: "category-info" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "LongWriting",
  setup(__props) {
    const router = useRouter();
    const projects = ref([]);
    const showCreateDialog = ref(false);
    const createForm = ref({
      name: "",
      type: "story"
    });
    const showSettingsDialog = ref(false);
    const activeSettingsTab = ref("");
    const categories = ref([]);
    const filteredCategories = computed(() => {
      const excludedCodes = ["skill_type", "skill_level", "item_type", "item_level"];
      return categories.value.filter((c) => !excludedCodes.includes(c.code));
    });
    const dictionary = ref({});
    const showCategoryDialog = ref(false);
    const editingCategory = ref(null);
    const categoryForm = ref({
      code: "",
      name: ""
    });
    const stageLabels = {
      overview: "故事概要",
      background: "背景设定",
      characters: "角色设定",
      skills: "技能物品",
      outline: "大纲设计",
      chapters: "章节写作",
      topic: "主题素材"
    };
    function getStageLabel(stage) {
      return stageLabels[stage] || stage;
    }
    async function loadProjects() {
      const result = await window.electronAPI.longwriting.getProjects();
      if (result.success) {
        projects.value = result.data;
      } else {
        console.error("加载项目失败:", result.error);
      }
    }
    async function createProject() {
      if (!createForm.value.name) {
        ElMessage.warning("请输入项目名称");
        return;
      }
      try {
        const requestData = {
          name: createForm.value.name,
          type: createForm.value.type
        };
        const result = await window.electronAPI.longwriting.createProject(requestData);
        console.log("createProject result:", result);
        if (result.success && result.data) {
          projects.value.unshift(result.data);
          showCreateDialog.value = false;
          createForm.value = { name: "", type: "story" };
          ElMessage.success("项目创建成功");
        } else {
          ElMessage.error("创建失败：" + (result.error || "未知错误"));
        }
      } catch (error) {
        console.error("createProject error:", error);
        ElMessage.error("创建失败：" + error.message);
      }
    }
    function openProject(project) {
      if (project.type === "story") {
        router.push(`/story-editor/${project.id}`);
      } else {
        router.push(`/comment-editor/${project.id}`);
      }
    }
    function editProject(project) {
      ElMessageBox.prompt("请输入新的项目名称", "编辑项目", {
        confirmButtonText: "保存",
        cancelButtonText: "取消",
        inputValue: project.name
      }).then(async ({ value }) => {
        const result = await window.electronAPI.longwriting.updateProject(project.id, { name: value });
        if (result.success) {
          project.name = value;
          ElMessage.success("项目名称已更新");
        } else {
          ElMessage.error("更新失败：" + result.error);
        }
      }).catch(() => {
      });
    }
    function confirmDeleteProject(project) {
      ElMessageBox.confirm(
        `确定要删除项目"${project.name}"吗？此操作不可恢复。`,
        "删除项目",
        {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        }
      ).then(async () => {
        const result = await window.electronAPI.longwriting.deleteProject(project.id);
        if (result.success) {
          const index = projects.value.findIndex((p) => p.id === project.id);
          if (index !== -1) {
            projects.value.splice(index, 1);
          }
          ElMessage.success("项目已删除");
        } else {
          ElMessage.error("删除失败：" + result.error);
        }
      }).catch(() => {
      });
    }
    async function loadDictionary() {
      try {
        const categoriesResult = await window.electronAPI.longwriting.getDictionaryCategories();
        if (categoriesResult.success && categoriesResult.data) {
          categories.value = categoriesResult.data;
          if (filteredCategories.value.length > 0 && !activeSettingsTab.value) {
            activeSettingsTab.value = filteredCategories.value[0].code;
          }
        }
        const dictResult = await window.electronAPI.longwriting.getDictionaryAll();
        if (dictResult.success && dictResult.data) {
          dictionary.value = dictResult.data;
        }
      } catch (error) {
        console.error("加载字典失败:", error);
      }
    }
    function showAddCategoryDialog() {
      editingCategory.value = null;
      categoryForm.value = { code: "", name: "" };
      showCategoryDialog.value = true;
    }
    function showEditCategoryDialog(category) {
      editingCategory.value = category;
      categoryForm.value = {
        code: category.code,
        name: category.name
      };
      showCategoryDialog.value = true;
    }
    async function saveCategory() {
      if (!categoryForm.value.code.trim() || !categoryForm.value.name.trim()) {
        ElMessage.warning("请输入编码和名称");
        return;
      }
      try {
        if (editingCategory.value) {
          const result = await window.electronAPI.longwriting.updateDictionaryCategory(
            categoryForm.value.code,
            categoryForm.value.name
          );
          if (result.success) {
            const index = categories.value.findIndex((c) => c.code === categoryForm.value.code);
            if (index !== -1) {
              categories.value[index].name = categoryForm.value.name;
            }
            ElMessage.success("分类已更新");
            showCategoryDialog.value = false;
          } else {
            ElMessage.error("更新失败：" + (result.error || "未知错误"));
          }
        } else {
          const result = await window.electronAPI.longwriting.createDictionaryCategory(
            categoryForm.value.code,
            categoryForm.value.name
          );
          if (result.success && result.data) {
            categories.value.push(result.data);
            dictionary.value[result.data.code] = [];
            activeSettingsTab.value = result.data.code;
            ElMessage.success("分类已创建");
            showCategoryDialog.value = false;
          } else {
            ElMessage.error("创建失败：" + (result.error || "未知错误"));
          }
        }
      } catch (error) {
        ElMessage.error("操作失败：" + error.message);
      }
    }
    async function handleRemoveCategory(categoryCode) {
      const category = categories.value.find((c) => c.code === categoryCode);
      if (!category) return;
      try {
        await ElMessageBox.confirm(
          `确定要删除分类「${category.name}」吗？该分类下的所有字典项都会被删除，此操作不可恢复。`,
          "删除分类",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const result = await window.electronAPI.longwriting.deleteDictionaryCategory(categoryCode);
        if (result.success) {
          const index = categories.value.findIndex((c) => c.code === categoryCode);
          if (index !== -1) {
            categories.value.splice(index, 1);
          }
          delete dictionary.value[categoryCode];
          if (activeSettingsTab.value === categoryCode && filteredCategories.value.length > 0) {
            activeSettingsTab.value = filteredCategories.value[0].code;
          }
          ElMessage.success("分类已删除");
        } else {
          ElMessage.error("删除失败：" + (result.error || "未知错误"));
        }
      } catch {
      }
    }
    async function addItem(categoryCode, code, name) {
      if (!code.trim() || !name.trim()) return;
      try {
        const result = await window.electronAPI.longwriting.createDictionaryItem(categoryCode, code.trim(), name.trim());
        if (result.success && result.data) {
          if (!dictionary.value[categoryCode]) {
            dictionary.value[categoryCode] = [];
          }
          dictionary.value[categoryCode].push(result.data);
          ElMessage.success("添加成功");
        } else {
          ElMessage.error("添加失败：" + (result.error || "未知错误"));
        }
      } catch (error) {
        ElMessage.error("添加失败：" + error.message);
      }
    }
    async function updateItem(id, data) {
      try {
        const result = await window.electronAPI.longwriting.updateDictionaryItem(id, data);
        if (result.success && result.data) {
          for (const categoryCode of Object.keys(dictionary.value)) {
            const index = dictionary.value[categoryCode].findIndex((item) => item.id === id);
            if (index !== -1) {
              dictionary.value[categoryCode][index] = result.data;
              break;
            }
          }
          ElMessage.success("更新成功");
        } else {
          ElMessage.error("更新失败：" + (result.error || "未知错误"));
        }
      } catch (error) {
        ElMessage.error("更新失败：" + error.message);
      }
    }
    async function removeItem(categoryCode, id) {
      try {
        const result = await window.electronAPI.longwriting.deleteDictionaryItem(id);
        if (result.success) {
          const index = dictionary.value[categoryCode]?.findIndex((item) => item.id === id);
          if (index !== void 0 && index !== -1) {
            dictionary.value[categoryCode].splice(index, 1);
          }
          ElMessage.success("删除成功");
        } else {
          ElMessage.error("删除失败：" + (result.error || "未知错误"));
        }
      } catch (error) {
        ElMessage.error("删除失败：" + error.message);
      }
    }
    onMounted(() => {
      loadProjects();
      loadDictionary();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_radio = resolveComponent("el-radio");
      const _component_el_radio_group = resolveComponent("el-radio-group");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_tab_pane = resolveComponent("el-tab-pane");
      const _component_el_tabs = resolveComponent("el-tabs");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[15] || (_cache[15] = createBaseVNode("h1", null, "长文写作", -1)),
          createBaseVNode("div", _hoisted_3, [
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
                _cache[13] || (_cache[13] = createTextVNode(" 设置 ", -1))
              ]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: _cache[1] || (_cache[1] = ($event) => showCreateDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[14] || (_cache[14] = createTextVNode(" 新建项目 ", -1))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_4, [
          projects.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_5, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(projects.value, (project) => {
              return openBlock(), createElementBlock("div", {
                key: project.id,
                class: "project-card",
                onClick: ($event) => openProject(project)
              }, [
                createBaseVNode("div", _hoisted_7, [
                  createVNode(_component_el_icon, { size: "32" }, {
                    default: withCtx(() => [
                      project.type === "story" ? (openBlock(), createBlock(unref(reading_default), { key: 0 })) : (openBlock(), createBlock(unref(document_default), { key: 1 }))
                    ]),
                    _: 2
                  }, 1024)
                ]),
                createBaseVNode("div", _hoisted_8, [
                  createBaseVNode("h3", _hoisted_9, toDisplayString(project.name), 1),
                  createBaseVNode("div", _hoisted_10, [
                    createBaseVNode("span", _hoisted_11, toDisplayString(project.type === "story" ? "故事类" : "评论类"), 1),
                    createBaseVNode("span", _hoisted_12, toDisplayString(getStageLabel(project.stage)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_13, [
                    createVNode(_component_el_progress, {
                      percentage: project.progress,
                      "show-text": false
                    }, null, 8, ["percentage"]),
                    createBaseVNode("span", _hoisted_14, toDisplayString(project.progress) + "%", 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_15, [
                  createVNode(_component_el_button, {
                    text: "",
                    onClick: withModifiers(($event) => editProject(project), ["stop"])
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
                    type: "danger",
                    onClick: withModifiers(($event) => confirmDeleteProject(project), ["stop"])
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
              ], 8, _hoisted_6);
            }), 128))
          ])) : (openBlock(), createElementBlock("div", _hoisted_16, [
            createVNode(_component_el_empty, { description: "暂无项目" }, {
              default: withCtx(() => [
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: _cache[2] || (_cache[2] = ($event) => showCreateDialog.value = true)
                }, {
                  default: withCtx(() => [..._cache[16] || (_cache[16] = [
                    createTextVNode("创建第一个项目", -1)
                  ])]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]))
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showCreateDialog.value,
          "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => showCreateDialog.value = $event),
          title: "新建项目",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[5] || (_cache[5] = ($event) => showCreateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[19] || (_cache[19] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !createForm.value.name,
              onClick: createProject
            }, {
              default: withCtx(() => [..._cache[20] || (_cache[20] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: createForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "项目名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: createForm.value.name,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => createForm.value.name = $event),
                      placeholder: "请输入项目名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "项目类型",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_radio_group, {
                      modelValue: createForm.value.type,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => createForm.value.type = $event)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_radio, { value: "story" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(reading_default))
                              ]),
                              _: 1
                            }),
                            _cache[17] || (_cache[17] = createTextVNode(" 故事类 ", -1))
                          ]),
                          _: 1
                        }),
                        createVNode(_component_el_radio, { value: "comment" }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(document_default))
                              ]),
                              _: 1
                            }),
                            _cache[18] || (_cache[18] = createTextVNode(" 评论类 ", -1))
                          ]),
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
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showSettingsDialog.value,
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => showSettingsDialog.value = $event),
          title: "字典设置",
          width: "800px"
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_17, [
              createVNode(_component_el_tabs, {
                modelValue: activeSettingsTab.value,
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => activeSettingsTab.value = $event),
                type: "border-card",
                closable: "",
                onTabRemove: handleRemoveCategory
              }, {
                add: withCtx(() => [
                  createVNode(_component_el_button, {
                    size: "small",
                    onClick: showAddCategoryDialog
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(plus_default))
                        ]),
                        _: 1
                      }),
                      _cache[22] || (_cache[22] = createTextVNode(" 新增分类 ", -1))
                    ]),
                    _: 1
                  })
                ]),
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(filteredCategories.value, (category) => {
                    return openBlock(), createBlock(_component_el_tab_pane, {
                      key: category.code,
                      label: category.name,
                      name: category.code
                    }, {
                      default: withCtx(() => [
                        createBaseVNode("div", _hoisted_18, [
                          createBaseVNode("span", _hoisted_19, "分类编码：" + toDisplayString(category.code), 1),
                          createVNode(_component_el_button, {
                            size: "small",
                            text: "",
                            type: "primary",
                            onClick: ($event) => showEditCategoryDialog(category)
                          }, {
                            default: withCtx(() => [..._cache[21] || (_cache[21] = [
                              createTextVNode(" 编辑分类名称 ", -1)
                            ])]),
                            _: 1
                          }, 8, ["onClick"])
                        ]),
                        createVNode(DictionaryEditor, {
                          items: dictionary.value[category.code] || [],
                          "category-code": category.code,
                          onAdd: addItem,
                          onUpdate: updateItem,
                          onRemove: removeItem
                        }, null, 8, ["items", "category-code"])
                      ]),
                      _: 2
                    }, 1032, ["label", "name"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showCategoryDialog.value,
          "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => showCategoryDialog.value = $event),
          title: editingCategory.value ? "编辑分类" : "新增分类",
          width: "400px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[11] || (_cache[11] = ($event) => showCategoryDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[23] || (_cache[23] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !categoryForm.value.code || !categoryForm.value.name,
              onClick: saveCategory
            }, {
              default: withCtx(() => [..._cache[24] || (_cache[24] = [
                createTextVNode(" 保存 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: categoryForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "分类编码",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: categoryForm.value.code,
                      "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => categoryForm.value.code = $event),
                      placeholder: "请输入编码（英文）",
                      disabled: !!editingCategory.value
                    }, null, 8, ["modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "分类名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: categoryForm.value.name,
                      "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => categoryForm.value.name = $event),
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
        }, 8, ["modelValue", "title"])
      ]);
    };
  }
});
const LongWriting = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-9aafa189"]]);
export {
  LongWriting as default
};
