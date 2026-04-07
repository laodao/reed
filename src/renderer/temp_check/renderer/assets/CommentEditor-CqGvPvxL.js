import { d as defineComponent, w as watch, O as onMounted, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, G as Fragment, H as renderList, M as unref, ag as upload_default, e as createTextVNode, af as link_default, a$ as edit_pen_default, c as createBlock, A as magic_stick_default, b2 as close_default, Y as createCommentVNode, b3 as upload_filled_default, L as toDisplayString, r as ref, E as ElMessage, ab as toRaw, f as resolveComponent, o as openBlock, y as document_default, J as normalizeClass, b4 as view_default, a2 as refresh_right_default, U as delete_default, _ as _export_sfc, P as plus_default, h as computed, V as ElMessageBox, b5 as arrow_up_default, ar as arrow_down_default, b6 as clock_default, b7 as document_checked_default, b8 as refresh_left_default, W as useTabsStore, X as arrow_left_default, aq as download_default, a0 as useRoute, I as useRouter, b9 as provide } from "./index-CEiunyEa.js";
const _hoisted_1$4 = { class: "topic-stage" };
const _hoisted_2$4 = { class: "stage-content" };
const _hoisted_3$4 = { class: "section-block" };
const _hoisted_4$4 = { class: "section-block" };
const _hoisted_5$4 = { class: "material-list" };
const _hoisted_6$3 = { class: "material-icon" };
const _hoisted_7$3 = { class: "material-info" };
const _hoisted_8$3 = { class: "material-meta" };
const _hoisted_9$3 = { class: "material-type" };
const _hoisted_10$3 = {
  key: 0,
  class: "retry-count"
};
const _hoisted_11$3 = { class: "material-source" };
const _hoisted_12$1 = { class: "material-actions" };
const _hoisted_13$1 = { class: "add-material-buttons" };
const _hoisted_14$1 = { class: "action-buttons" };
const _hoisted_15$1 = {
  key: 0,
  class: "generating-progress"
};
const _hoisted_16$1 = { class: "preview-content" };
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "TopicStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const topicForm = ref({
      title: "",
      type: "other",
      coreArgument: "",
      targetReader: "",
      style: "",
      estimatedWords: 5e3
    });
    const materials = ref([]);
    const showFileDialog = ref(false);
    const showUrlDialog = ref(false);
    const showManualDialog = ref(false);
    const showPreviewDialog = ref(false);
    const previewContent = ref("");
    const generating = ref(false);
    const currentEventId = ref(null);
    const generatingContent = ref("");
    const loading = ref(false);
    const urlForm = ref({
      name: "",
      url: ""
    });
    const manualForm = ref({
      name: "",
      content: ""
    });
    const pendingFile = ref(null);
    function getMaterialTypeLabel(type) {
      const labels = {
        file: "文件",
        url: "网址",
        manual: "手动"
      };
      return labels[type] || type;
    }
    function getMaterialStatusLabel(status) {
      const labels = {
        pending: "处理中",
        success: "成功",
        failed: "失败"
      };
      return labels[status] || status;
    }
    function handleFileChange(uploadFile) {
      pendingFile.value = uploadFile.raw;
    }
    async function addFileMaterial() {
      if (!pendingFile.value) {
        ElMessage.warning("请先选择文件");
        return;
      }
      const result = await window.electronAPI.longwriting.createMaterial({
        projectId: props.projectId,
        name: pendingFile.value.name,
        type: "file",
        source: pendingFile.value.path || pendingFile.value.name,
        status: "pending"
      });
      if (result.success) {
        showFileDialog.value = false;
        pendingFile.value = null;
        ElMessage.success("文件已添加，正在处理中...");
        processMaterialAsync(result.data.id);
        await loadMaterials();
      } else {
        ElMessage.error(result.error || "添加失败");
      }
    }
    async function addUrlMaterial() {
      if (!urlForm.value.url) {
        ElMessage.warning("请输入网址");
        return;
      }
      const rawUrlForm = toRaw(urlForm.value);
      const result = await window.electronAPI.longwriting.createMaterial({
        projectId: props.projectId,
        name: rawUrlForm.name || rawUrlForm.url,
        type: "url",
        source: rawUrlForm.url,
        status: "pending"
      });
      if (result.success) {
        showUrlDialog.value = false;
        urlForm.value = { name: "", url: "" };
        ElMessage.success("网址已添加，正在抓取内容...");
        processMaterialAsync(result.data.id);
        await loadMaterials();
      } else {
        ElMessage.error(result.error || "添加失败");
      }
    }
    async function addManualMaterial() {
      if (!manualForm.value.content) {
        ElMessage.warning("请输入内容");
        return;
      }
      const rawManualForm = toRaw(manualForm.value);
      const result = await window.electronAPI.longwriting.createMaterial({
        projectId: props.projectId,
        name: rawManualForm.name || `素材 ${materials.value.length + 1}`,
        type: "manual",
        source: "手动输入",
        content: rawManualForm.content,
        status: "success"
      });
      if (result.success) {
        await loadMaterials();
        showManualDialog.value = false;
        manualForm.value = { name: "", content: "" };
        ElMessage.success("素材已添加");
        updateProgress();
      } else {
        ElMessage.error(result.error || "添加失败");
      }
    }
    async function processMaterialAsync(materialId) {
      try {
        const result = await window.electronAPI.longwriting.processMaterial(materialId);
        if (result.success) {
          await loadMaterials();
          updateProgress();
        } else {
          ElMessage.error(result.error || "素材处理失败");
        }
      } catch (error) {
        console.error("素材处理异常:", error);
        ElMessage.error("素材处理异常");
      }
    }
    function previewMaterial(material) {
      previewContent.value = material.content || "内容暂未加载";
      showPreviewDialog.value = true;
    }
    async function retryMaterial(material) {
      if (material.retryCount >= 5) {
        ElMessage.warning("已达到最大重试次数");
        return;
      }
      const result = await window.electronAPI.longwriting.updateMaterialStatus(material.id, "pending");
      if (result.success) {
        await loadMaterials();
        ElMessage.info("正在重试...");
      }
    }
    async function deleteMaterial(id) {
      const result = await window.electronAPI.longwriting.deleteMaterial(id);
      if (result.success) {
        await loadMaterials();
        ElMessage.success("素材已删除");
        updateProgress();
      } else {
        ElMessage.error(result.error || "删除失败");
      }
    }
    async function generateOutline() {
      if (!topicForm.value.title) {
        ElMessage.warning("请输入评论主题");
        return;
      }
      await saveTopic();
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `outline-comment-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parseOutlineResult(generatingContent.value);
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateOutlineComment(currentEventId.value, props.projectId);
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parseOutlineResult(content) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        const suggestedOutline = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(suggestedOutline) || suggestedOutline.length === 0) {
          ElMessage.warning("AI 未生成大纲建议");
          return;
        }
        for (let i = 0; i < suggestedOutline.length; i++) {
          const section = suggestedOutline[i];
          await window.electronAPI.longwriting.createOutline({
            projectId: props.projectId,
            name: section.name,
            level: 1,
            nodeType: "section",
            summary: section.summary || "",
            estimatedWords: section.estimatedWords || 500,
            involvedCharacters: [],
            involvedLocations: [],
            status: "pending",
            orderIndex: i
          });
        }
        ElMessage.success("大纲建议已生成，请前往大纲设计查看");
        emit("update:progress", 35);
      } catch (error) {
        console.error("解析 AI 响应失败:", error);
        ElMessage.error("解析 AI 响应失败");
      }
    }
    function cancelGeneration() {
      if (!currentEventId.value) return;
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    function updateProgress() {
      const progress = Math.min(30, 10 + materials.value.length * 5);
      emit("update:progress", progress);
    }
    async function loadMaterials() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getMaterials(props.projectId);
      if (result.success) {
        materials.value = result.data || [];
      }
    }
    async function loadTopic() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getStoryOverview(props.projectId);
      if (result.success && result.data) {
        topicForm.value = {
          title: result.data.title || "",
          type: "other",
          coreArgument: result.data.coreTheme || "",
          targetReader: "",
          style: "",
          estimatedWords: result.data.estimatedWords || 5e3
        };
      }
    }
    async function saveTopic() {
      if (!props.projectId) return;
      await window.electronAPI.longwriting.updateStoryOverview(props.projectId, {
        title: topicForm.value.title,
        coreTheme: topicForm.value.coreArgument,
        estimatedWords: topicForm.value.estimatedWords
      });
    }
    async function loadData() {
      loading.value = true;
      await Promise.all([
        loadMaterials(),
        loadTopic()
      ]);
      loading.value = false;
      updateProgress();
    }
    watch(() => props.projectId, () => {
      loadData();
    });
    onMounted(() => {
      loadData();
    });
    return (_ctx, _cache) => {
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_upload = resolveComponent("el-upload");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        _cache[39] || (_cache[39] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "主题与素材"),
          createBaseVNode("p", { class: "stage-desc" }, "设定评论的主题和收集相关素材")
        ], -1)),
        createBaseVNode("div", _hoisted_2$4, [
          createBaseVNode("div", _hoisted_3$4, [
            _cache[20] || (_cache[20] = createBaseVNode("h3", null, "主题设定", -1)),
            createVNode(_component_el_form, {
              model: topicForm.value,
              "label-width": "100px",
              class: "topic-form"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "评论主题",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: topicForm.value.title,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => topicForm.value.title = $event),
                      placeholder: "输入评论主题，如：论《红楼梦》的人物塑造艺术"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "评论类型" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: topicForm.value.type,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => topicForm.value.type = $event),
                      placeholder: "选择评论类型"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "文学评论",
                          value: "literature"
                        }),
                        createVNode(_component_el_option, {
                          label: "影评",
                          value: "movie"
                        }),
                        createVNode(_component_el_option, {
                          label: "书评",
                          value: "book"
                        }),
                        createVNode(_component_el_option, {
                          label: "乐评",
                          value: "music"
                        }),
                        createVNode(_component_el_option, {
                          label: "艺术评论",
                          value: "art"
                        }),
                        createVNode(_component_el_option, {
                          label: "社会评论",
                          value: "society"
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
                createVNode(_component_el_form_item, { label: "核心观点" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: topicForm.value.coreArgument,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => topicForm.value.coreArgument = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "阐述你的核心观点和立场..."
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "目标读者" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: topicForm.value.targetReader,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => topicForm.value.targetReader = $event),
                      placeholder: "选择目标读者群体",
                      clearable: ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "学术读者",
                          value: "academic"
                        }),
                        createVNode(_component_el_option, {
                          label: "普通读者",
                          value: "general"
                        }),
                        createVNode(_component_el_option, {
                          label: "专业人士",
                          value: "professional"
                        }),
                        createVNode(_component_el_option, {
                          label: "学生群体",
                          value: "student"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "写作风格" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: topicForm.value.style,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => topicForm.value.style = $event),
                      placeholder: "选择写作风格",
                      clearable: ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "学术严谨",
                          value: "academic"
                        }),
                        createVNode(_component_el_option, {
                          label: "通俗易懂",
                          value: "popular"
                        }),
                        createVNode(_component_el_option, {
                          label: "文艺感性",
                          value: "artistic"
                        }),
                        createVNode(_component_el_option, {
                          label: "犀利批判",
                          value: "critical"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "预估字数" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input_number, {
                      modelValue: topicForm.value.estimatedWords,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => topicForm.value.estimatedWords = $event),
                      min: 1e3,
                      max: 5e4,
                      step: 500
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          createBaseVNode("div", _hoisted_4$4, [
            _cache[27] || (_cache[27] = createBaseVNode("h3", null, "素材管理", -1)),
            createBaseVNode("div", _hoisted_5$4, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(materials.value, (material) => {
                return openBlock(), createElementBlock("div", {
                  key: material.id,
                  class: "material-card"
                }, [
                  createBaseVNode("div", _hoisted_6$3, [
                    material.type === "file" ? (openBlock(), createBlock(_component_el_icon, { key: 0 }, {
                      default: withCtx(() => [
                        createVNode(unref(document_default))
                      ]),
                      _: 1
                    })) : material.type === "url" ? (openBlock(), createBlock(_component_el_icon, { key: 1 }, {
                      default: withCtx(() => [
                        createVNode(unref(link_default))
                      ]),
                      _: 1
                    })) : (openBlock(), createBlock(_component_el_icon, { key: 2 }, {
                      default: withCtx(() => [
                        createVNode(unref(edit_pen_default))
                      ]),
                      _: 1
                    }))
                  ]),
                  createBaseVNode("div", _hoisted_7$3, [
                    createBaseVNode("h4", null, toDisplayString(material.name), 1),
                    createBaseVNode("div", _hoisted_8$3, [
                      createBaseVNode("span", _hoisted_9$3, toDisplayString(getMaterialTypeLabel(material.type)), 1),
                      createBaseVNode("span", {
                        class: normalizeClass(["material-status", material.status])
                      }, toDisplayString(getMaterialStatusLabel(material.status)), 3),
                      material.retryCount > 0 ? (openBlock(), createElementBlock("span", _hoisted_10$3, " 重试 " + toDisplayString(material.retryCount) + " 次 ", 1)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("p", _hoisted_11$3, toDisplayString(material.source), 1)
                  ]),
                  createBaseVNode("div", _hoisted_12$1, [
                    createVNode(_component_el_button, {
                      text: "",
                      size: "small",
                      onClick: ($event) => previewMaterial(material)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(view_default))
                          ]),
                          _: 1
                        }),
                        _cache[21] || (_cache[21] = createTextVNode(" 预览 ", -1))
                      ]),
                      _: 1
                    }, 8, ["onClick"]),
                    material.status === "failed" ? (openBlock(), createBlock(_component_el_button, {
                      key: 0,
                      text: "",
                      size: "small",
                      onClick: ($event) => retryMaterial(material)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(refresh_right_default))
                          ]),
                          _: 1
                        }),
                        _cache[22] || (_cache[22] = createTextVNode(" 重试 ", -1))
                      ]),
                      _: 1
                    }, 8, ["onClick"])) : createCommentVNode("", true),
                    createVNode(_component_el_button, {
                      text: "",
                      size: "small",
                      type: "danger",
                      onClick: ($event) => deleteMaterial(material.id)
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(delete_default))
                          ]),
                          _: 1
                        }),
                        _cache[23] || (_cache[23] = createTextVNode(" 删除 ", -1))
                      ]),
                      _: 1
                    }, 8, ["onClick"])
                  ])
                ]);
              }), 128)),
              createBaseVNode("div", _hoisted_13$1, [
                createVNode(_component_el_button, {
                  onClick: _cache[6] || (_cache[6] = ($event) => showFileDialog.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(upload_default))
                      ]),
                      _: 1
                    }),
                    _cache[24] || (_cache[24] = createTextVNode(" 上传文件 ", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  onClick: _cache[7] || (_cache[7] = ($event) => showUrlDialog.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(link_default))
                      ]),
                      _: 1
                    }),
                    _cache[25] || (_cache[25] = createTextVNode(" 添加网址 ", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  onClick: _cache[8] || (_cache[8] = ($event) => showManualDialog.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(edit_pen_default))
                      ]),
                      _: 1
                    }),
                    _cache[26] || (_cache[26] = createTextVNode(" 手动输入 ", -1))
                  ]),
                  _: 1
                })
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_14$1, [
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
                _cache[28] || (_cache[28] = createTextVNode(" 生成大纲建议 ", -1))
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
                _cache[29] || (_cache[29] = createTextVNode(" 取消生成 ", -1))
              ]),
              _: 1
            }))
          ]),
          generating.value ? (openBlock(), createElementBlock("div", _hoisted_15$1, [
            createVNode(_component_el_progress, {
              percentage: 100,
              indeterminate: true
            }),
            _cache[30] || (_cache[30] = createBaseVNode("p", { class: "progress-text" }, "AI 正在生成大纲建议...", -1))
          ])) : createCommentVNode("", true)
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showFileDialog.value,
          "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => showFileDialog.value = $event),
          title: "上传文件",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[9] || (_cache[9] = ($event) => showFileDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[33] || (_cache[33] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: addFileMaterial
            }, {
              default: withCtx(() => [..._cache[34] || (_cache[34] = [
                createTextVNode("添加", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_upload, {
              drag: "",
              "auto-upload": false,
              "on-change": handleFileChange,
              accept: ".txt,.md,.doc,.docx,.pdf"
            }, {
              tip: withCtx(() => [..._cache[31] || (_cache[31] = [
                createBaseVNode("div", { class: "el-upload__tip" }, " 支持 txt、md、doc、docx、pdf 格式文件 ", -1)
              ])]),
              default: withCtx(() => [
                createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                  default: withCtx(() => [
                    createVNode(unref(upload_filled_default))
                  ]),
                  _: 1
                }),
                _cache[32] || (_cache[32] = createBaseVNode("div", { class: "el-upload__text" }, [
                  createTextVNode(" 拖拽文件到此处，或"),
                  createBaseVNode("em", null, "点击上传")
                ], -1))
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showUrlDialog.value,
          "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => showUrlDialog.value = $event),
          title: "添加网址",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[13] || (_cache[13] = ($event) => showUrlDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[35] || (_cache[35] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: addUrlMaterial
            }, {
              default: withCtx(() => [..._cache[36] || (_cache[36] = [
                createTextVNode("抓取并添加", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: urlForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "素材名称" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: urlForm.value.name,
                      "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => urlForm.value.name = $event),
                      placeholder: "给素材起个名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "网址",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: urlForm.value.url,
                      "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => urlForm.value.url = $event),
                      placeholder: "输入要抓取的网址"
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
          modelValue: showManualDialog.value,
          "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => showManualDialog.value = $event),
          title: "手动输入素材",
          width: "600px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[17] || (_cache[17] = ($event) => showManualDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[37] || (_cache[37] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: addManualMaterial
            }, {
              default: withCtx(() => [..._cache[38] || (_cache[38] = [
                createTextVNode("添加", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: manualForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "素材名称" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: manualForm.value.name,
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => manualForm.value.name = $event),
                      placeholder: "给素材起个名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "内容",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: manualForm.value.content,
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => manualForm.value.content = $event),
                      type: "textarea",
                      rows: 10,
                      placeholder: "粘贴或输入素材内容..."
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
          modelValue: showPreviewDialog.value,
          "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => showPreviewDialog.value = $event),
          title: "素材预览",
          width: "700px"
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_16$1, [
              createBaseVNode("pre", null, toDisplayString(previewContent.value), 1)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const TopicStage = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-74437fb7"]]);
const _hoisted_1$3 = { class: "outline-stage" };
const _hoisted_2$3 = { class: "stage-content" };
const _hoisted_3$3 = { class: "outline-list" };
const _hoisted_4$3 = { class: "item-header" };
const _hoisted_5$3 = { class: "item-number" };
const _hoisted_6$2 = { class: "item-actions" };
const _hoisted_7$2 = { class: "item-content" };
const _hoisted_8$2 = { class: "item-meta" };
const _hoisted_9$2 = { class: "action-buttons" };
const _hoisted_10$2 = {
  key: 0,
  class: "generating-progress"
};
const _hoisted_11$2 = { class: "outline-stats" };
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "OutlineStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const outlineSections = ref([]);
    const generating = ref(false);
    const currentEventId = ref(null);
    const generatingContent = ref("");
    const loading = ref(false);
    const totalEstimatedWords = computed(() => {
      return outlineSections.value.reduce((sum, s) => sum + (s.estimatedWords || 0), 0);
    });
    const completedSections = computed(() => {
      return outlineSections.value.filter((s) => s.status === "completed").length;
    });
    async function loadOutline() {
      if (!props.projectId) return;
      loading.value = true;
      const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId);
      if (result.success) {
        outlineSections.value = (result.data || []).filter((o) => o.nodeType === "section" || !o.parentId).sort((a, b) => a.orderIndex - b.orderIndex);
      }
      loading.value = false;
    }
    async function addSection() {
      const result = await window.electronAPI.longwriting.createOutline({
        projectId: props.projectId,
        name: "",
        nodeType: "section",
        level: 1,
        summary: "",
        estimatedWords: 500,
        orderIndex: outlineSections.value.length
      });
      if (result.success) {
        outlineSections.value.push(result.data);
      } else {
        ElMessage.error(result.error || "添加失败");
      }
    }
    async function deleteSection(index) {
      try {
        await ElMessageBox.confirm("确定要删除该段落吗？", "删除段落", {
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          type: "warning"
        });
        const section = outlineSections.value[index];
        const result = await window.electronAPI.longwriting.deleteOutline(section.id);
        if (result.success) {
          outlineSections.value.splice(index, 1);
          ElMessage.success("段落已删除");
        } else {
          ElMessage.error(result.error || "删除失败");
        }
      } catch {
      }
    }
    async function moveSection(index, direction) {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= outlineSections.value.length) return;
      const temp = outlineSections.value[index];
      outlineSections.value[index] = outlineSections.value[newIndex];
      outlineSections.value[newIndex] = temp;
      await Promise.all([
        window.electronAPI.longwriting.updateOutline(outlineSections.value[index].id, { orderIndex: index }),
        window.electronAPI.longwriting.updateOutline(outlineSections.value[newIndex].id, { orderIndex: newIndex })
      ]);
    }
    async function updateSection(section) {
      const rawSection = toRaw(section);
      await window.electronAPI.longwriting.updateOutline(rawSection.id, {
        name: rawSection.name,
        summary: rawSection.summary,
        estimatedWords: rawSection.estimatedWords
      });
    }
    async function generateOutline() {
      generating.value = true;
      generatingContent.value = "";
      currentEventId.value = `outline-comment-${props.projectId}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "content" && event.content) {
            generatingContent.value += event.content;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            parseOutlineResult(generatingContent.value);
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            unsubscribe();
            ElMessage.error(event.error || "生成失败");
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateOutlineComment(currentEventId.value, props.projectId);
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    async function parseOutlineResult(content) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          ElMessage.warning("AI 返回格式不正确，请重试");
          return;
        }
        const suggestedSections = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(suggestedSections) || suggestedSections.length === 0) {
          ElMessage.warning("AI 未生成大纲建议");
          return;
        }
        try {
          await ElMessageBox.confirm(
            `AI 建议生成以下大纲：

${suggestedSections.map((s, i) => `${i + 1}. ${s.name}（${s.estimatedWords || 500}字）`).join("\n")}`,
            "AI 生成建议",
            {
              confirmButtonText: "采纳建议",
              cancelButtonText: "取消",
              type: "info"
            }
          );
          for (const section of outlineSections.value) {
            await window.electronAPI.longwriting.deleteOutline(section.id);
          }
          for (let i = 0; i < suggestedSections.length; i++) {
            const suggested = suggestedSections[i];
            await window.electronAPI.longwriting.createOutline({
              projectId: props.projectId,
              name: suggested.name || "",
              nodeType: "section",
              level: 1,
              summary: suggested.summary || "",
              estimatedWords: suggested.estimatedWords || 500,
              orderIndex: i
            });
          }
          await loadOutline();
          updateProgress();
          ElMessage.success("大纲已生成");
        } catch {
        }
      } catch (error) {
        console.error("解析 AI 响应失败:", error);
        ElMessage.error("解析 AI 响应失败");
      }
    }
    function cancelGeneration() {
      if (!currentEventId.value) return;
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    function updateProgress() {
      emit("update:progress", 60);
    }
    watch(() => props.projectId, () => {
      loadOutline();
    });
    onMounted(() => {
      loadOutline();
    });
    return (_ctx, _cache) => {
      const _component_el_input = resolveComponent("el-input");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_statistic = resolveComponent("el-statistic");
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        _cache[5] || (_cache[5] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "大纲设计"),
          createBaseVNode("p", { class: "stage-desc" }, "设计评论文章的结构大纲")
        ], -1)),
        createBaseVNode("div", _hoisted_2$3, [
          createBaseVNode("div", _hoisted_3$3, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(outlineSections.value, (section, index) => {
              return openBlock(), createElementBlock("div", {
                key: section.id,
                class: "outline-item"
              }, [
                createBaseVNode("div", _hoisted_4$3, [
                  createBaseVNode("div", _hoisted_5$3, toDisplayString(index + 1), 1),
                  createVNode(_component_el_input, {
                    modelValue: section.name,
                    "onUpdate:modelValue": ($event) => section.name = $event,
                    placeholder: "输入段落标题",
                    class: "item-title-input",
                    onChange: ($event) => updateSection(section)
                  }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                  createBaseVNode("div", _hoisted_6$2, [
                    createVNode(_component_el_button, {
                      text: "",
                      onClick: ($event) => moveSection(index, -1),
                      disabled: index === 0
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(arrow_up_default))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["onClick", "disabled"]),
                    createVNode(_component_el_button, {
                      text: "",
                      onClick: ($event) => moveSection(index, 1),
                      disabled: index === outlineSections.value.length - 1
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(arrow_down_default))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["onClick", "disabled"]),
                    createVNode(_component_el_button, {
                      text: "",
                      type: "danger",
                      onClick: ($event) => deleteSection(index)
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
                createBaseVNode("div", _hoisted_7$2, [
                  createVNode(_component_el_input, {
                    modelValue: section.summary,
                    "onUpdate:modelValue": ($event) => section.summary = $event,
                    type: "textarea",
                    rows: 2,
                    placeholder: "描述本段落的要点...",
                    onChange: ($event) => updateSection(section)
                  }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"])
                ]),
                createBaseVNode("div", _hoisted_8$2, [
                  createVNode(_component_el_input_number, {
                    modelValue: section.estimatedWords,
                    "onUpdate:modelValue": ($event) => section.estimatedWords = $event,
                    min: 100,
                    max: 1e4,
                    step: 100,
                    size: "small",
                    onChange: ($event) => updateSection(section)
                  }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"]),
                  _cache[0] || (_cache[0] = createBaseVNode("span", { class: "words-label" }, "预估字数", -1))
                ])
              ]);
            }), 128)),
            createVNode(_component_el_button, {
              type: "primary",
              plain: "",
              class: "add-btn",
              onClick: addSection
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[1] || (_cache[1] = createTextVNode(" 添加段落 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_9$2, [
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
                _cache[2] || (_cache[2] = createTextVNode(" AI 生成大纲建议 ", -1))
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
                _cache[3] || (_cache[3] = createTextVNode(" 取消生成 ", -1))
              ]),
              _: 1
            }))
          ]),
          generating.value ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
            createVNode(_component_el_progress, {
              percentage: 100,
              indeterminate: true
            }),
            _cache[4] || (_cache[4] = createBaseVNode("p", { class: "progress-text" }, "AI 正在生成大纲建议...", -1))
          ])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_11$2, [
            createVNode(_component_el_statistic, {
              title: "总段落数",
              value: outlineSections.value.length
            }, null, 8, ["value"]),
            createVNode(_component_el_statistic, {
              title: "预估总字数",
              value: totalEstimatedWords.value
            }, null, 8, ["value"]),
            createVNode(_component_el_statistic, {
              title: "已写段落",
              value: completedSections.value
            }, null, 8, ["value"])
          ])
        ])
      ]);
    };
  }
});
const CommentOutlineStage = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-3dbc28cc"]]);
const _hoisted_1$2 = { class: "chapter-stage" };
const _hoisted_2$2 = { class: "stage-content" };
const _hoisted_3$2 = { class: "section-selector" };
const _hoisted_4$2 = {
  key: 0,
  class: "empty-section"
};
const _hoisted_5$2 = { class: "section-info" };
const _hoisted_6$1 = { class: "info-header" };
const _hoisted_7$1 = { class: "info-meta" };
const _hoisted_8$1 = { class: "info-summary" };
const _hoisted_9$1 = { class: "material-reference" };
const _hoisted_10$1 = { class: "reference-header" };
const _hoisted_11$1 = { class: "reference-list" };
const _hoisted_12 = {
  key: 0,
  class: "no-reference"
};
const _hoisted_13 = { class: "editor-container" };
const _hoisted_14 = { class: "editor-toolbar" };
const _hoisted_15 = { class: "toolbar-right" };
const _hoisted_16 = { class: "word-count" };
const _hoisted_17 = { class: "version-list" };
const _hoisted_18 = { class: "version-info" };
const _hoisted_19 = { class: "version-number" };
const _hoisted_20 = { class: "version-date" };
const _hoisted_21 = { class: "version-words" };
const _hoisted_22 = { class: "version-actions" };
const _hoisted_23 = { class: "material-select-list" };
const _hoisted_24 = ["onClick"];
const _hoisted_25 = { class: "material-name" };
const _hoisted_26 = { class: "material-type" };
const _hoisted_27 = { class: "preview-content" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "ChapterStage",
  props: {
    projectId: {}
  },
  emits: ["update:progress"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const outlineSections = ref([]);
    const selectedSectionId = ref("");
    const currentChapterId = ref(null);
    const sectionContent = ref("");
    const currentWordCount = ref(0);
    const versions = ref([]);
    const availableMaterials = ref([]);
    const referencedMaterials = ref([]);
    const selectedMaterialIds = ref([]);
    const showVersionDialog = ref(false);
    const showMaterialDialog = ref(false);
    const showPreviewDialog = ref(false);
    const previewContent = ref("");
    const generating = ref(false);
    const loading = ref(false);
    const selectedSection = computed(() => {
      return outlineSections.value.find((s) => s.id === selectedSectionId.value);
    });
    const wordProgress = computed(() => {
      if (!selectedSection.value?.estimatedWords) return 0;
      return Math.min(100, Math.round(currentWordCount.value / selectedSection.value.estimatedWords * 100));
    });
    function getMaterialTypeLabel(type) {
      const labels = {
        file: "文件",
        url: "网址",
        manual: "手动"
      };
      return labels[type] || type;
    }
    function formatDate(timestamp) {
      return new Date(timestamp).toLocaleString("zh-CN");
    }
    async function loadSection(sectionId) {
      if (!sectionId) {
        sectionContent.value = "";
        versions.value = [];
        referencedMaterials.value = [];
        currentChapterId.value = null;
        return;
      }
      const result = await window.electronAPI.longwriting.getChapter(sectionId);
      if (result.success && result.data) {
        currentChapterId.value = result.data.id;
        sectionContent.value = result.data.content || "";
        currentWordCount.value = sectionContent.value.length;
        const versionsResult = await window.electronAPI.longwriting.getChapterVersions(result.data.id);
        if (versionsResult.success) {
          versions.value = versionsResult.data || [];
        }
      } else {
        currentChapterId.value = null;
        sectionContent.value = "";
        currentWordCount.value = 0;
        versions.value = [];
      }
      referencedMaterials.value = [];
      selectedMaterialIds.value = [];
    }
    function updateWordCount() {
      currentWordCount.value = sectionContent.value.length;
    }
    async function saveSection() {
      if (!selectedSectionId.value) return;
      const result = await window.electronAPI.longwriting.saveChapter(selectedSectionId.value, sectionContent.value);
      if (result.success) {
        currentChapterId.value = result.data.id;
        ElMessage.success("内容已保存");
        if (selectedSection.value && currentWordCount.value >= (selectedSection.value.estimatedWords || 0) * 0.8) {
          await window.electronAPI.longwriting.updateOutline(selectedSection.value.id, { status: "completed" });
          await loadOutlineSections();
        }
        updateProgress();
      } else {
        ElMessage.error(result.error || "保存失败");
      }
    }
    const currentEventId = ref(null);
    async function generateSection() {
      if (!selectedSectionId.value) {
        ElMessage.warning("请先选择段落");
        return;
      }
      generating.value = true;
      sectionContent.value = "";
      currentEventId.value = `section-${selectedSectionId.value}-${Date.now()}`;
      const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
        currentEventId.value,
        (event) => {
          if (event.type === "content" && event.content) {
            sectionContent.value += event.content;
            currentWordCount.value = sectionContent.value.length;
          } else if (event.type === "done") {
            generating.value = false;
            currentEventId.value = null;
            ElMessage.success("内容已生成");
            unsubscribe();
          } else if (event.type === "error") {
            generating.value = false;
            currentEventId.value = null;
            ElMessage.error(event.error || "生成失败");
            unsubscribe();
          }
        }
      );
      const result = await window.electronAPI.longwriting.generateSection(
        currentEventId.value,
        props.projectId,
        selectedSectionId.value,
        selectedSection.value?.estimatedWords
      );
      if (!result.success) {
        generating.value = false;
        currentEventId.value = null;
        unsubscribe();
        ElMessage.error(result.error || "生成失败");
      }
    }
    function cancelGeneration() {
      if (!currentEventId.value) return;
      generating.value = false;
      currentEventId.value = null;
      ElMessage.info("已取消生成");
    }
    function previewVersion(version) {
      previewContent.value = version.content;
    }
    async function restoreVersion(version) {
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
        if (!currentChapterId.value) return;
        const result = await window.electronAPI.longwriting.restoreChapterVersion(currentChapterId.value, version.id);
        if (result.success) {
          sectionContent.value = result.data.content || "";
          currentWordCount.value = sectionContent.value.length;
          ElMessage.success(`已恢复到版本 ${version.versionNumber}`);
        } else {
          ElMessage.error(result.error || "恢复失败");
        }
      } catch {
      }
    }
    function toggleMaterial(materialId) {
      const index = selectedMaterialIds.value.indexOf(materialId);
      if (index === -1) {
        selectedMaterialIds.value.push(materialId);
      } else {
        selectedMaterialIds.value.splice(index, 1);
      }
    }
    function confirmMaterials() {
      referencedMaterials.value = availableMaterials.value.filter(
        (m) => selectedMaterialIds.value.includes(m.id)
      );
      showMaterialDialog.value = false;
    }
    function removeReference(materialId) {
      const index = referencedMaterials.value.findIndex((m) => m.id === materialId);
      if (index !== -1) {
        referencedMaterials.value.splice(index, 1);
      }
      selectedMaterialIds.value = selectedMaterialIds.value.filter((id) => id !== materialId);
    }
    function goToOutline() {
      emit("update:progress", 35);
    }
    function updateProgress() {
      const completedCount = outlineSections.value.filter((s) => s.status === "completed").length;
      const total = outlineSections.value.length;
      const progress = Math.min(100, 60 + Math.floor(completedCount / Math.max(total, 1) * 40));
      emit("update:progress", progress);
    }
    async function loadOutlineSections() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getOutlineTree(props.projectId);
      if (result.success) {
        outlineSections.value = (result.data || []).filter((o) => o.nodeType === "section" || !o.parentId).sort((a, b) => a.orderIndex - b.orderIndex);
      }
    }
    async function loadMaterials() {
      if (!props.projectId) return;
      const result = await window.electronAPI.longwriting.getMaterials(props.projectId);
      if (result.success) {
        availableMaterials.value = result.data || [];
      }
    }
    async function loadData() {
      loading.value = true;
      await Promise.all([
        loadOutlineSections(),
        loadMaterials()
      ]);
      loading.value = false;
      updateProgress();
    }
    watch(() => props.projectId, () => {
      loadData();
    });
    onMounted(() => {
      loadData();
    });
    return (_ctx, _cache) => {
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_checkbox = resolveComponent("el-checkbox");
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        _cache[19] || (_cache[19] = createBaseVNode("div", { class: "stage-header" }, [
          createBaseVNode("h2", null, "章节写作"),
          createBaseVNode("p", { class: "stage-desc" }, "根据大纲撰写评论内容")
        ], -1)),
        createBaseVNode("div", _hoisted_2$2, [
          createBaseVNode("div", _hoisted_3$2, [
            createVNode(_component_el_select, {
              modelValue: selectedSectionId.value,
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedSectionId.value = $event),
              placeholder: "选择要写作的段落",
              onChange: loadSection
            }, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList(outlineSections.value, (section, index) => {
                  return openBlock(), createBlock(_component_el_option, {
                    key: section.id,
                    label: `${index + 1}. ${section.name || "未命名段落"}`,
                    value: section.id
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("span", null, toDisplayString(index + 1) + ". " + toDisplayString(section.name || "未命名段落"), 1),
                      createVNode(_component_el_tag, {
                        type: section.status === "completed" ? "success" : "info",
                        size: "small",
                        class: "status-tag"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(section.status === "completed" ? "已完成" : "待写"), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ]),
                    _: 2
                  }, 1032, ["label", "value"]);
                }), 128))
              ]),
              _: 1
            }, 8, ["modelValue"])
          ]),
          !selectedSectionId.value ? (openBlock(), createElementBlock("div", _hoisted_4$2, [
            createVNode(_component_el_empty, { description: "请先选择要写作的段落" }, {
              default: withCtx(() => [
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: goToOutline
                }, {
                  default: withCtx(() => [..._cache[8] || (_cache[8] = [
                    createTextVNode("前往大纲设计", -1)
                  ])]),
                  _: 1
                })
              ]),
              _: 1
            })
          ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_5$2, [
              createBaseVNode("div", _hoisted_6$1, [
                createBaseVNode("h3", null, toDisplayString(selectedSection.value?.name), 1),
                createBaseVNode("div", _hoisted_7$1, [
                  createBaseVNode("span", null, "预估字数：" + toDisplayString(selectedSection.value?.estimatedWords || 0) + "字", 1),
                  createBaseVNode("span", null, "当前字数：" + toDisplayString(currentWordCount.value) + "字", 1)
                ])
              ]),
              createBaseVNode("p", _hoisted_8$1, toDisplayString(selectedSection.value?.summary || "暂无概要"), 1)
            ]),
            createBaseVNode("div", _hoisted_9$1, [
              createBaseVNode("div", _hoisted_10$1, [
                _cache[10] || (_cache[10] = createBaseVNode("span", null, "素材引用", -1)),
                createVNode(_component_el_button, {
                  text: "",
                  size: "small",
                  onClick: _cache[1] || (_cache[1] = ($event) => showMaterialDialog.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(plus_default))
                      ]),
                      _: 1
                    }),
                    _cache[9] || (_cache[9] = createTextVNode(" 添加引用 ", -1))
                  ]),
                  _: 1
                })
              ]),
              createBaseVNode("div", _hoisted_11$1, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(referencedMaterials.value, (ref2) => {
                  return openBlock(), createBlock(_component_el_tag, {
                    key: ref2.id,
                    closable: "",
                    onClose: ($event) => removeReference(ref2.id)
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(ref2.name), 1)
                    ]),
                    _: 2
                  }, 1032, ["onClose"]);
                }), 128)),
                referencedMaterials.value.length === 0 ? (openBlock(), createElementBlock("span", _hoisted_12, " 暂无引用素材 ")) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("div", _hoisted_14, [
                !generating.value ? (openBlock(), createBlock(_component_el_button, {
                  key: 0,
                  type: "primary",
                  onClick: generateSection
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(magic_stick_default))
                      ]),
                      _: 1
                    }),
                    _cache[11] || (_cache[11] = createTextVNode(" AI 生成 ", -1))
                  ]),
                  _: 1
                })) : (openBlock(), createBlock(_component_el_button, {
                  key: 1,
                  type: "danger",
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
                })),
                createVNode(_component_el_button, {
                  loading: generating.value,
                  onClick: _cache[2] || (_cache[2] = ($event) => showVersionDialog.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(clock_default))
                      ]),
                      _: 1
                    }),
                    _cache[13] || (_cache[13] = createTextVNode(" 版本历史 ", -1))
                  ]),
                  _: 1
                }, 8, ["loading"]),
                createVNode(_component_el_button, {
                  type: "success",
                  onClick: saveSection
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(document_checked_default))
                      ]),
                      _: 1
                    }),
                    _cache[14] || (_cache[14] = createTextVNode(" 保存 ", -1))
                  ]),
                  _: 1
                }),
                createBaseVNode("div", _hoisted_15, [
                  createBaseVNode("span", _hoisted_16, toDisplayString(currentWordCount.value) + "字", 1),
                  createVNode(_component_el_progress, {
                    percentage: wordProgress.value,
                    status: wordProgress.value >= 100 ? "success" : "",
                    "show-text": false,
                    class: "progress-bar"
                  }, null, 8, ["percentage", "status"])
                ])
              ]),
              createVNode(_component_el_input, {
                modelValue: sectionContent.value,
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => sectionContent.value = $event),
                type: "textarea",
                rows: 18,
                placeholder: "在这里编写评论内容，或点击'AI 生成'自动生成...",
                class: "section-editor",
                onInput: updateWordCount
              }, null, 8, ["modelValue"])
            ]),
            createVNode(_component_el_dialog, {
              modelValue: showVersionDialog.value,
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => showVersionDialog.value = $event),
              title: "版本历史",
              width: "600px"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_17, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(versions.value, (version) => {
                    return openBlock(), createElementBlock("div", {
                      key: version.id,
                      class: "version-item"
                    }, [
                      createBaseVNode("div", _hoisted_18, [
                        createBaseVNode("span", _hoisted_19, "版本 " + toDisplayString(version.versionNumber), 1),
                        createBaseVNode("span", {
                          class: normalizeClass(["version-type", version.versionType])
                        }, toDisplayString(version.versionType === "generated" ? "AI生成" : "手动编辑"), 3),
                        createBaseVNode("span", _hoisted_20, toDisplayString(formatDate(version.createdAt)), 1),
                        createBaseVNode("span", _hoisted_21, toDisplayString(version.wordCount) + "字", 1)
                      ]),
                      createBaseVNode("div", _hoisted_22, [
                        createVNode(_component_el_button, {
                          text: "",
                          size: "small",
                          onClick: ($event) => previewVersion(version)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(view_default))
                              ]),
                              _: 1
                            }),
                            _cache[15] || (_cache[15] = createTextVNode(" 预览 ", -1))
                          ]),
                          _: 1
                        }, 8, ["onClick"]),
                        createVNode(_component_el_button, {
                          text: "",
                          size: "small",
                          onClick: ($event) => restoreVersion(version)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                createVNode(unref(refresh_left_default))
                              ]),
                              _: 1
                            }),
                            _cache[16] || (_cache[16] = createTextVNode(" 恢复 ", -1))
                          ]),
                          _: 1
                        }, 8, ["onClick"])
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
              modelValue: showMaterialDialog.value,
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => showMaterialDialog.value = $event),
              title: "选择素材",
              width: "500px"
            }, {
              footer: withCtx(() => [
                createVNode(_component_el_button, {
                  onClick: _cache[5] || (_cache[5] = ($event) => showMaterialDialog.value = false)
                }, {
                  default: withCtx(() => [..._cache[17] || (_cache[17] = [
                    createTextVNode("取消", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: confirmMaterials
                }, {
                  default: withCtx(() => [..._cache[18] || (_cache[18] = [
                    createTextVNode("确认", -1)
                  ])]),
                  _: 1
                })
              ]),
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_23, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(availableMaterials.value, (material) => {
                    return openBlock(), createElementBlock("div", {
                      key: material.id,
                      class: normalizeClass(["material-select-item", { selected: selectedMaterialIds.value.includes(material.id) }]),
                      onClick: ($event) => toggleMaterial(material.id)
                    }, [
                      createVNode(_component_el_checkbox, {
                        "model-value": selectedMaterialIds.value.includes(material.id)
                      }, null, 8, ["model-value"]),
                      createBaseVNode("span", _hoisted_25, toDisplayString(material.name), 1),
                      createBaseVNode("span", _hoisted_26, toDisplayString(getMaterialTypeLabel(material.type)), 1)
                    ], 10, _hoisted_24);
                  }), 128)),
                  availableMaterials.value.length === 0 ? (openBlock(), createBlock(_component_el_empty, {
                    key: 0,
                    description: "暂无可用素材"
                  })) : createCommentVNode("", true)
                ])
              ]),
              _: 1
            }, 8, ["modelValue"]),
            createVNode(_component_el_dialog, {
              modelValue: showPreviewDialog.value,
              "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => showPreviewDialog.value = $event),
              title: "版本预览",
              width: "700px"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_27, [
                  createBaseVNode("pre", null, toDisplayString(previewContent.value), 1)
                ])
              ]),
              _: 1
            }, 8, ["modelValue"])
          ], 64))
        ])
      ]);
    };
  }
});
const CommentChapterStage = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-fda9ff3b"]]);
const _hoisted_1$1 = { class: "export-dialog" };
const _hoisted_2$1 = { class: "export-options" };
const _hoisted_3$1 = { class: "option-icon" };
const _hoisted_4$1 = { class: "option-icon" };
const _hoisted_5$1 = {
  key: 0,
  class: "export-progress"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ExportDialog",
  props: {
    visible: { type: Boolean },
    projectId: {},
    projectName: {}
  },
  emits: ["update:visible"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const exporting = ref(false);
    async function handleExport(format) {
      if (exporting.value) return;
      exporting.value = true;
      try {
        let result;
        if (format === "markdown") {
          result = await window.electronAPI.longwriting.exportMarkdown(props.projectId);
        } else {
          result = await window.electronAPI.longwriting.exportWord(props.projectId);
        }
        if (result.success) {
          if (result.message === "用户取消") {
          } else {
            ElMessage.success("导出成功");
            emit("update:visible", false);
          }
        } else {
          ElMessage.error(result.error || "导出失败");
        }
      } catch (error) {
        ElMessage.error("导出失败：" + error.message);
      } finally {
        exporting.value = false;
      }
    }
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createBlock(_component_el_dialog, {
        "model-value": __props.visible,
        title: "导出作品",
        width: "500px",
        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => emit("update:visible", $event))
      }, {
        footer: withCtx(() => [
          createVNode(_component_el_button, {
            onClick: _cache[2] || (_cache[2] = ($event) => emit("update:visible", false))
          }, {
            default: withCtx(() => [..._cache[8] || (_cache[8] = [
              createTextVNode("关闭", -1)
            ])]),
            _: 1
          })
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$1, [
            _cache[7] || (_cache[7] = createBaseVNode("div", { class: "export-info" }, [
              createBaseVNode("p", { class: "info-text" }, "将作品导出为以下格式：")
            ], -1)),
            createBaseVNode("div", _hoisted_2$1, [
              createBaseVNode("div", {
                class: "export-option",
                onClick: _cache[0] || (_cache[0] = ($event) => handleExport("markdown"))
              }, [
                createBaseVNode("div", _hoisted_3$1, [
                  createVNode(_component_el_icon, { size: "32" }, {
                    default: withCtx(() => [
                      createVNode(unref(document_default))
                    ]),
                    _: 1
                  })
                ]),
                _cache[4] || (_cache[4] = createBaseVNode("div", { class: "option-info" }, [
                  createBaseVNode("h4", null, "Markdown 文件"),
                  createBaseVNode("p", null, ".md 格式，适合备份和二次编辑")
                ], -1))
              ]),
              createBaseVNode("div", {
                class: "export-option",
                onClick: _cache[1] || (_cache[1] = ($event) => handleExport("word"))
              }, [
                createBaseVNode("div", _hoisted_4$1, [
                  createVNode(_component_el_icon, { size: "32" }, {
                    default: withCtx(() => [
                      createVNode(unref(document_default))
                    ]),
                    _: 1
                  })
                ]),
                _cache[5] || (_cache[5] = createBaseVNode("div", { class: "option-info" }, [
                  createBaseVNode("h4", null, "Word 文档"),
                  createBaseVNode("p", null, ".docx 格式，适合打印和分享")
                ], -1))
              ])
            ]),
            exporting.value ? (openBlock(), createElementBlock("div", _hoisted_5$1, [
              createVNode(_component_el_progress, {
                percentage: 100,
                indeterminate: true
              }),
              _cache[6] || (_cache[6] = createBaseVNode("p", null, "正在导出...", -1))
            ])) : createCommentVNode("", true)
          ])
        ]),
        _: 1
      }, 8, ["model-value"]);
    };
  }
});
const ExportDialog = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-6e13e406"]]);
const _hoisted_1 = { class: "comment-editor" };
const _hoisted_2 = { class: "editor-header" };
const _hoisted_3 = { class: "header-left" };
const _hoisted_4 = { class: "project-title" };
const _hoisted_5 = { class: "header-right" };
const _hoisted_6 = { class: "stage-nav" };
const _hoisted_7 = ["onClick"];
const _hoisted_8 = { class: "stage-number" };
const _hoisted_9 = { class: "stage-info" };
const _hoisted_10 = { class: "stage-label" };
const _hoisted_11 = { class: "editor-content" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  ...{
    name: "CommentEditor"
  },
  __name: "CommentEditor",
  setup(__props) {
    const route = useRoute();
    const router = useRouter();
    const tabsStore = useTabsStore();
    const projectId = computed(() => route.params.id);
    const project = ref(null);
    const currentStage = ref("topic");
    const showExport = ref(false);
    const commentStages = [
      { key: "topic", label: "主题素材" },
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
      const stageOrder = ["topic", "outline", "chapters"];
      const currentIndex = stageOrder.indexOf(currentStage.value);
      const stageIndex = stageOrder.indexOf(stage);
      return stageIndex < currentIndex;
    }
    function updateProgress(progress) {
      console.log("更新进度:", progress);
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
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
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
                _cache[2] || (_cache[2] = createTextVNode(" 返回 ", -1))
              ]),
              _: 1
            }),
            createBaseVNode("span", _hoisted_4, toDisplayString(project.value?.name || "加载中..."), 1)
          ]),
          createBaseVNode("div", _hoisted_5, [
            createVNode(_component_el_button, {
              type: "primary",
              onClick: _cache[0] || (_cache[0] = ($event) => showExport.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(download_default))
                  ]),
                  _: 1
                }),
                _cache[3] || (_cache[3] = createTextVNode(" 导出 ", -1))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_6, [
          (openBlock(), createElementBlock(Fragment, null, renderList(commentStages, (stage, index) => {
            return createBaseVNode("div", {
              key: stage.key,
              class: normalizeClass(["stage-item", { active: currentStage.value === stage.key, completed: isStageCompleted(stage.key) }]),
              onClick: ($event) => setStage(stage.key)
            }, [
              createBaseVNode("div", _hoisted_8, toDisplayString(index + 1), 1),
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("span", _hoisted_10, toDisplayString(stage.label), 1)
              ])
            ], 10, _hoisted_7);
          }), 64))
        ]),
        createBaseVNode("div", _hoisted_11, [
          currentStage.value === "topic" ? (openBlock(), createBlock(TopicStage, {
            key: 0,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "outline" ? (openBlock(), createBlock(CommentOutlineStage, {
            key: 1,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true),
          currentStage.value === "chapters" ? (openBlock(), createBlock(CommentChapterStage, {
            key: 2,
            "project-id": projectId.value,
            "onUpdate:progress": updateProgress
          }, null, 8, ["project-id"])) : createCommentVNode("", true)
        ]),
        createVNode(ExportDialog, {
          visible: showExport.value,
          "onUpdate:visible": _cache[1] || (_cache[1] = ($event) => showExport.value = $event),
          "project-id": projectId.value,
          "project-name": project.value?.name || ""
        }, null, 8, ["visible", "project-id", "project-name"])
      ]);
    };
  }
});
const CommentEditor = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ef0ea7fd"]]);
export {
  CommentEditor as default
};
