import { d as defineComponent, O as onMounted, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, P as plus_default, e as createTextVNode, G as Fragment, H as renderList, Q as video_camera_default, r as ref, R as reactive, E as ElMessage, f as resolveComponent, I as useRouter, o as openBlock, L as toDisplayString, S as folder_opened_default, T as withModifiers, U as delete_default, c as createBlock, V as ElMessageBox, _ as _export_sfc } from "./index-CEiunyEa.js";
import { u as useStoryToVideoStore } from "./story-to-video--As1mzZs.js";
const _hoisted_1 = { class: "story-to-video-page" };
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
const _hoisted_11 = { class: "project-status" };
const _hoisted_12 = { class: "project-date" };
const _hoisted_13 = { class: "project-config" };
const _hoisted_14 = { class: "project-actions" };
const _hoisted_15 = {
  key: 1,
  class: "empty-state"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "StoryToVideo",
  setup(__props) {
    const router = useRouter();
    const store = useStoryToVideoStore();
    const longWritingProjects = ref([]);
    const showCreateDialog = ref(false);
    const createForm = reactive({
      name: "",
      longWritingProjectId: "",
      config: {
        aspectRatio: "16:9",
        resolution: 1080,
        fps: 30,
        defaultTransition: "fade",
        stylePrompt: ""
      }
    });
    async function loadData() {
      console.log("[StoryToVideo] 开始加载数据...");
      await store.loadProjects();
      console.log("[StoryToVideo] 加载项目完成, 项目数量:", store.projects.length);
      console.log("[StoryToVideo] 项目列表:", store.projects);
      await loadLongWritingProjects();
    }
    async function loadLongWritingProjects() {
      try {
        const response = await window.electronAPI.longwriting.getProjects();
        console.log("长文项目响应:", response);
        if (response.success && response.data) {
          longWritingProjects.value = response.data.map((p) => ({
            id: p.id,
            name: p.name
          }));
        }
      } catch (error) {
        console.error("加载长文项目失败:", error);
      }
    }
    async function createProject() {
      if (!createForm.name.trim()) {
        ElMessage.warning("请输入项目名称");
        return;
      }
      const project = await store.createProject(
        createForm.name,
        createForm.longWritingProjectId || "",
        createForm.config
      );
      if (project) {
        ElMessage.success("创建成功");
        showCreateDialog.value = false;
        createForm.name = "";
        createForm.longWritingProjectId = "";
        createForm.config = {
          aspectRatio: "16:9",
          resolution: 1080,
          fps: 30,
          defaultTransition: "fade",
          stylePrompt: ""
        };
        router.push(`/story-to-video/${project.id}`);
      } else {
        ElMessage.error(store.error || "创建失败");
      }
    }
    function openProject(project) {
      router.push(`/story-to-video/${project.id}`);
    }
    async function confirmDeleteProject(project) {
      try {
        await ElMessageBox.confirm(
          `确定要删除项目「${project.name}」吗？此操作不可恢复。`,
          "删除确认",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const success = await store.deleteProject(project.id);
        if (success) {
          ElMessage.success("删除成功");
        } else {
          ElMessage.error(store.error || "删除失败");
        }
      } catch {
      }
    }
    function getStatusLabel(status) {
      const statusMap = {
        draft: "草稿",
        in_progress: "制作中",
        completed: "已完成",
        archived: "已归档"
      };
      return statusMap[status] || status;
    }
    function formatDate(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
    }
    onMounted(() => {
      loadData();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_divider = resolveComponent("el-divider");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[12] || (_cache[12] = createBaseVNode("h1", null, "剧集制作", -1)),
          createBaseVNode("div", _hoisted_3, [
            createVNode(_component_el_button, {
              type: "primary",
              onClick: _cache[0] || (_cache[0] = ($event) => showCreateDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[11] || (_cache[11] = createTextVNode(" 新建项目 ", -1))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_4, [
          unref(store).projects.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_5, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).projects, (project) => {
              return openBlock(), createElementBlock("div", {
                key: project.id,
                class: "project-card",
                onClick: ($event) => openProject(project)
              }, [
                createBaseVNode("div", _hoisted_7, [
                  createVNode(_component_el_icon, { size: "32" }, {
                    default: withCtx(() => [
                      createVNode(unref(video_camera_default))
                    ]),
                    _: 1
                  })
                ]),
                createBaseVNode("div", _hoisted_8, [
                  createBaseVNode("h3", _hoisted_9, toDisplayString(project.name), 1),
                  createBaseVNode("div", _hoisted_10, [
                    createBaseVNode("span", _hoisted_11, toDisplayString(getStatusLabel(project.status)), 1),
                    createBaseVNode("span", _hoisted_12, toDisplayString(formatDate(project.createdAt)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_13, [
                    createVNode(_component_el_tag, {
                      size: "small",
                      type: "info"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(project.config.aspectRatio), 1)
                      ]),
                      _: 2
                    }, 1024),
                    createVNode(_component_el_tag, {
                      size: "small",
                      type: "info"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(project.config.resolution) + "p ", 1)
                      ]),
                      _: 2
                    }, 1024),
                    createVNode(_component_el_tag, {
                      size: "small",
                      type: "info"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(project.config.fps) + "fps ", 1)
                      ]),
                      _: 2
                    }, 1024)
                  ])
                ]),
                createBaseVNode("div", _hoisted_14, [
                  createVNode(_component_el_button, {
                    text: "",
                    onClick: withModifiers(($event) => openProject(project), ["stop"])
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(folder_opened_default))
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
          ])) : (openBlock(), createElementBlock("div", _hoisted_15, [
            createVNode(_component_el_empty, { description: "暂无剧集项目" }, {
              image: withCtx(() => [
                createVNode(_component_el_icon, {
                  size: "80",
                  color: "#c0c4cc"
                }, {
                  default: withCtx(() => [
                    createVNode(unref(video_camera_default))
                  ]),
                  _: 1
                })
              ]),
              default: withCtx(() => [
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: _cache[1] || (_cache[1] = ($event) => showCreateDialog.value = true)
                }, {
                  default: withCtx(() => [..._cache[13] || (_cache[13] = [
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
          "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => showCreateDialog.value = $event),
          title: "新建剧集项目",
          width: "600px",
          "close-on-click-modal": false
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[9] || (_cache[9] = ($event) => showCreateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[15] || (_cache[15] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              disabled: !createForm.name,
              loading: unref(store).loading,
              onClick: createProject
            }, {
              default: withCtx(() => [..._cache[16] || (_cache[16] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["disabled", "loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: createForm,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "项目名称",
                  required: ""
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: createForm.name,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => createForm.name = $event),
                      placeholder: "请输入项目名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "关联长文" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: createForm.longWritingProjectId,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => createForm.longWritingProjectId = $event),
                      placeholder: "选择关联的长文项目（可选）",
                      clearable: "",
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(longWritingProjects.value, (project) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: project.id,
                            label: project.name,
                            value: project.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_divider, { "content-position": "left" }, {
                  default: withCtx(() => [..._cache[14] || (_cache[14] = [
                    createTextVNode("视频配置", -1)
                  ])]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "画幅比例" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: createForm.config.aspectRatio,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => createForm.config.aspectRatio = $event),
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
                      modelValue: createForm.config.resolution,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => createForm.config.resolution = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "4K (3840×2160)",
                          value: 2160
                        }),
                        createVNode(_component_el_option, {
                          label: "2K (2560×1440)",
                          value: 1440
                        }),
                        createVNode(_component_el_option, {
                          label: "Full HD (1920×1080)",
                          value: 1080
                        }),
                        createVNode(_component_el_option, {
                          label: "HD (1280×720)",
                          value: 720
                        }),
                        createVNode(_component_el_option, {
                          label: "SD (854×480)",
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
                      modelValue: createForm.config.fps,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => createForm.config.fps = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "24 fps (电影)",
                          value: 24
                        }),
                        createVNode(_component_el_option, {
                          label: "25 fps (PAL)",
                          value: 25
                        }),
                        createVNode(_component_el_option, {
                          label: "30 fps (标准)",
                          value: 30
                        }),
                        createVNode(_component_el_option, {
                          label: "60 fps (高帧率)",
                          value: 60
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "默认转场" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: createForm.config.defaultTransition,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => createForm.config.defaultTransition = $event),
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
                          label: "滑动",
                          value: "slide"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "风格提示词" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: createForm.config.stylePrompt,
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => createForm.config.stylePrompt = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "输入视频风格描述，如：动漫风格、写实风格、水墨画风等"
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
const StoryToVideo = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-fc3c6974"]]);
export {
  StoryToVideo as default
};
