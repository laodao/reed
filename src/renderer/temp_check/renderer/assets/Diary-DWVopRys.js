import { d as defineComponent, r as ref, w as watch, ap as onUnmounted, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, X as arrow_left_default, e as createTextVNode, aq as download_default, ar as arrow_down_default, ah as withDirectives, as as vModelText, L as toDisplayString, h as computed, f as resolveComponent, o as openBlock, E as ElMessage, _ as _export_sfc, at as normalizeStyle, J as normalizeClass, T as withModifiers, N as arrow_right_default, al as folder_default, am as more_filled_default, P as plus_default, ao as edit_default, U as delete_default, G as Fragment, H as renderList, c as createBlock, Y as createCommentVNode, O as onMounted, ad as loading_default, S as folder_opened_default, aj as withKeys, y as document_default, V as ElMessageBox } from "./index-CEiunyEa.js";
import { _ as _sfc_main$3 } from "./MarkdownEditor.vue_vue_type_style_index_0_lang-Dkwf67xc.js";
const _hoisted_1$2 = { class: "diary-editor" };
const _hoisted_2$2 = { class: "editor-header" };
const _hoisted_3$2 = { class: "header-left" };
const _hoisted_4$2 = { class: "header-right" };
const _hoisted_5$2 = { class: "editor-title" };
const _hoisted_6$2 = { class: "editor-content" };
const _hoisted_7$2 = { class: "editor-footer" };
const _hoisted_8$1 = { class: "word-count" };
const _hoisted_9$1 = { class: "last-saved" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "DiaryEditor",
  props: {
    entry: {}
  },
  emits: ["back", "updated"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const title = ref(props.entry.title);
    const content = ref(props.entry.content || "");
    const lastSavedTime = ref((/* @__PURE__ */ new Date()).toLocaleTimeString());
    const saveTimeout = ref(null);
    const wordCount = computed(() => {
      return content.value.replace(/\s/g, "").length;
    });
    watch(content, () => {
      if (saveTimeout.value) {
        clearTimeout(saveTimeout.value);
      }
      saveTimeout.value = window.setTimeout(() => {
        saveEntry();
      }, 1e3);
    });
    async function saveEntry() {
      try {
        const result = await window.electronAPI.diary.updateEntry(props.entry.id, {
          title: title.value,
          content: content.value
        });
        if (result.success) {
          lastSavedTime.value = (/* @__PURE__ */ new Date()).toLocaleTimeString();
          emit("updated");
        }
      } catch (error) {
        console.error("保存失败:", error);
      }
    }
    async function handleTitleChange() {
      if (title.value !== props.entry.title) {
        await saveEntry();
      }
    }
    function handleContentChange() {
    }
    async function handleExport(format) {
      try {
        const filters = [];
        let ext = "";
        switch (format) {
          case "html":
            filters.push({ name: "HTML 文件", extensions: ["html", "htm"] });
            ext = "html";
            break;
          case "pdf":
            filters.push({ name: "PDF 文件", extensions: ["pdf"] });
            ext = "pdf";
            break;
          case "docx":
            filters.push({ name: "Word 文档", extensions: ["docx"] });
            ext = "docx";
            break;
        }
        const dialogResult = await window.electronAPI.file.saveFile({
          defaultPath: `${props.entry.title}.${ext}`,
          filters
        });
        if (!dialogResult.success || !dialogResult.filePath) {
          return;
        }
        const savePath = dialogResult.filePath;
        let result;
        switch (format) {
          case "html":
            result = await window.electronAPI.diary.exportHtml(props.entry.id, savePath);
            break;
          case "pdf":
            result = await window.electronAPI.diary.exportPdf(props.entry.id, savePath);
            break;
          case "docx":
            result = await window.electronAPI.diary.exportDocx(props.entry.id, savePath);
            break;
        }
        if (result?.success) {
          ElMessage.success(`导出成功`);
        } else {
          ElMessage.error(result?.error || "导出失败");
        }
      } catch (error) {
        console.error("导出失败:", error);
        ElMessage.error("导出失败");
      }
    }
    onUnmounted(() => {
      if (saveTimeout.value) {
        clearTimeout(saveTimeout.value);
      }
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dropdown_item = resolveComponent("el-dropdown-item");
      const _component_el_dropdown_menu = resolveComponent("el-dropdown-menu");
      const _component_el_dropdown = resolveComponent("el-dropdown");
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          createBaseVNode("div", _hoisted_3$2, [
            createVNode(_component_el_button, {
              text: "",
              onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("back"))
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(arrow_left_default))
                  ]),
                  _: 1
                }),
                _cache[3] || (_cache[3] = createTextVNode(" 返回列表 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_4$2, [
            createVNode(_component_el_dropdown, { onCommand: handleExport }, {
              dropdown: withCtx(() => [
                createVNode(_component_el_dropdown_menu, null, {
                  default: withCtx(() => [
                    createVNode(_component_el_dropdown_item, { command: "html" }, {
                      default: withCtx(() => [..._cache[5] || (_cache[5] = [
                        createTextVNode("导出 HTML", -1)
                      ])]),
                      _: 1
                    }),
                    createVNode(_component_el_dropdown_item, { command: "pdf" }, {
                      default: withCtx(() => [..._cache[6] || (_cache[6] = [
                        createTextVNode("导出 PDF", -1)
                      ])]),
                      _: 1
                    }),
                    createVNode(_component_el_dropdown_item, { command: "docx" }, {
                      default: withCtx(() => [..._cache[7] || (_cache[7] = [
                        createTextVNode("导出 Word", -1)
                      ])]),
                      _: 1
                    })
                  ]),
                  _: 1
                })
              ]),
              default: withCtx(() => [
                createVNode(_component_el_button, null, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(download_default))
                      ]),
                      _: 1
                    }),
                    _cache[4] || (_cache[4] = createTextVNode(" 导出 ", -1)),
                    createVNode(_component_el_icon, { class: "el-icon--right" }, {
                      default: withCtx(() => [
                        createVNode(unref(arrow_down_default))
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_5$2, [
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => title.value = $event),
            type: "text",
            placeholder: "日记标题",
            class: "title-input",
            onBlur: handleTitleChange
          }, null, 544), [
            [vModelText, title.value]
          ])
        ]),
        createBaseVNode("div", _hoisted_6$2, [
          createVNode(_sfc_main$3, {
            modelValue: content.value,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => content.value = $event),
            placeholder: "开始写日记...",
            onChange: handleContentChange
          }, null, 8, ["modelValue"])
        ]),
        createBaseVNode("div", _hoisted_7$2, [
          createBaseVNode("span", _hoisted_8$1, toDisplayString(wordCount.value) + " 字", 1),
          createBaseVNode("span", _hoisted_9$1, "最后保存: " + toDisplayString(lastSavedTime.value), 1)
        ])
      ]);
    };
  }
});
const DiaryEditor = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-87c00c75"]]);
const _hoisted_1$1 = { class: "folder-tree-item" };
const _hoisted_2$1 = {
  key: 1,
  class: "expand-placeholder"
};
const _hoisted_3$1 = { class: "folder-icon" };
const _hoisted_4$1 = { class: "folder-name" };
const _hoisted_5$1 = { class: "folder-right" };
const _hoisted_6$1 = { class: "folder-stats" };
const _hoisted_7$1 = {
  key: 0,
  class: "folder-children"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "FolderTreeItem",
  props: {
    folder: {},
    allFolders: {},
    currentFolder: {},
    expandedFolders: {},
    level: { default: 0 }
  },
  emits: ["select", "toggle", "action", "create-subfolder"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const isExpanded = computed(() => props.expandedFolders.has(props.folder.id));
    const children = computed(() => props.allFolders.filter((f) => f.parentId === props.folder.id));
    const hasChildren = computed(() => children.value.length > 0);
    function handleClick() {
      emit("select", props.folder);
      if (hasChildren.value) {
        emit("toggle", props.folder.id);
      }
    }
    function handleCommand(command) {
      if (command === "create-subfolder") {
        emit("create-subfolder", props.folder);
      } else {
        emit("action", command, props.folder);
      }
    }
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dropdown_item = resolveComponent("el-dropdown-item");
      const _component_el_dropdown_menu = resolveComponent("el-dropdown-menu");
      const _component_el_dropdown = resolveComponent("el-dropdown");
      const _component_FolderTreeItem = resolveComponent("FolderTreeItem", true);
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", {
          class: normalizeClass(["folder-item", { active: __props.currentFolder?.id === __props.folder.id }]),
          style: normalizeStyle({ paddingLeft: `${__props.level * 16 + 12}px` })
        }, [
          hasChildren.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "expand-btn",
            onClick: _cache[0] || (_cache[0] = withModifiers(($event) => _ctx.$emit("toggle", __props.folder.id), ["stop"]))
          }, [
            createVNode(_component_el_icon, {
              class: normalizeClass({ expanded: isExpanded.value })
            }, {
              default: withCtx(() => [
                createVNode(unref(arrow_right_default))
              ]),
              _: 1
            }, 8, ["class"])
          ])) : (openBlock(), createElementBlock("div", _hoisted_2$1)),
          createBaseVNode("div", {
            class: "folder-content",
            onClick: handleClick
          }, [
            createBaseVNode("div", _hoisted_3$1, [
              createVNode(_component_el_icon, null, {
                default: withCtx(() => [
                  createVNode(unref(folder_default))
                ]),
                _: 1
              })
            ]),
            createBaseVNode("div", _hoisted_4$1, toDisplayString(__props.folder.name), 1)
          ]),
          createBaseVNode("div", _hoisted_5$1, [
            createBaseVNode("span", _hoisted_6$1, toDisplayString(__props.folder.entryCount || 0) + " 篇", 1),
            createBaseVNode("div", {
              class: "folder-actions",
              onClick: _cache[1] || (_cache[1] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createVNode(_component_el_dropdown, {
                trigger: "click",
                onCommand: handleCommand
              }, {
                dropdown: withCtx(() => [
                  createVNode(_component_el_dropdown_menu, null, {
                    default: withCtx(() => [
                      createVNode(_component_el_dropdown_item, { command: "create-subfolder" }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(plus_default))
                            ]),
                            _: 1
                          }),
                          _cache[6] || (_cache[6] = createTextVNode(" 新建子目录 ", -1))
                        ]),
                        _: 1
                      }),
                      createVNode(_component_el_dropdown_item, { command: "rename" }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(edit_default))
                            ]),
                            _: 1
                          }),
                          _cache[7] || (_cache[7] = createTextVNode(" 重命名 ", -1))
                        ]),
                        _: 1
                      }),
                      createVNode(_component_el_dropdown_item, {
                        command: "delete",
                        divided: ""
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_icon, null, {
                            default: withCtx(() => [
                              createVNode(unref(delete_default))
                            ]),
                            _: 1
                          }),
                          _cache[8] || (_cache[8] = createTextVNode(" 删除 ", -1))
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })
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
                _: 1
              })
            ])
          ])
        ], 6),
        isExpanded.value && hasChildren.value ? (openBlock(), createElementBlock("div", _hoisted_7$1, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(children.value, (child) => {
            return openBlock(), createBlock(_component_FolderTreeItem, {
              key: child.id,
              folder: child,
              "all-folders": __props.allFolders,
              "current-folder": __props.currentFolder,
              "expanded-folders": __props.expandedFolders,
              level: __props.level + 1,
              onSelect: _cache[2] || (_cache[2] = (f) => _ctx.$emit("select", f)),
              onToggle: _cache[3] || (_cache[3] = (id) => _ctx.$emit("toggle", id)),
              onAction: _cache[4] || (_cache[4] = (cmd, f) => _ctx.$emit("action", cmd, f)),
              onCreateSubfolder: _cache[5] || (_cache[5] = (f) => _ctx.$emit("create-subfolder", f))
            }, null, 8, ["folder", "all-folders", "current-folder", "expanded-folders", "level"]);
          }), 128))
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const FolderTreeItem = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-0ee4f155"]]);
const _hoisted_1 = { class: "diary-page" };
const _hoisted_2 = { class: "page-sidebar" };
const _hoisted_3 = { class: "sidebar-header" };
const _hoisted_4 = { class: "sidebar-content" };
const _hoisted_5 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_6 = {
  key: 1,
  class: "empty-state"
};
const _hoisted_7 = {
  key: 2,
  class: "folder-tree"
};
const _hoisted_8 = { class: "page-main" };
const _hoisted_9 = {
  key: 0,
  class: "empty-main"
};
const _hoisted_10 = { class: "main-header" };
const _hoisted_11 = { class: "header-left" };
const _hoisted_12 = { class: "header-right" };
const _hoisted_13 = { class: "main-content" };
const _hoisted_14 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_15 = {
  key: 1,
  class: "empty-entries"
};
const _hoisted_16 = {
  key: 2,
  class: "entry-list"
};
const _hoisted_17 = ["onClick"];
const _hoisted_18 = { class: "entry-content" };
const _hoisted_19 = { class: "entry-date" };
const _hoisted_20 = { class: "entry-title" };
const _hoisted_21 = { class: "entry-preview" };
const _hoisted_22 = { class: "entry-meta" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "Diary",
  setup(__props) {
    const folders = ref([]);
    const currentFolder = ref(null);
    const isLoadingFolders = ref(false);
    const showCreateFolderDialog = ref(false);
    const newFolderForm = ref({ name: "", parentId: "" });
    const expandedFolders = ref(/* @__PURE__ */ new Set());
    const entries = ref([]);
    const currentEntry = ref(null);
    const isLoadingEntries = ref(false);
    const searchKeyword = ref("");
    async function loadFolders() {
      isLoadingFolders.value = true;
      try {
        const result = await window.electronAPI.diary.getAllFolders();
        if (result.success) {
          folders.value = result.data || [];
        } else {
          ElMessage.error(result.error || "加载目录失败");
        }
      } catch (error) {
        console.error("加载目录失败:", error);
        ElMessage.error("加载目录失败");
      } finally {
        isLoadingFolders.value = false;
      }
    }
    const rootFolders = computed(() => {
      return folders.value.filter((f) => !f.parentId);
    });
    function toggleFolderExpand(folderId) {
      if (expandedFolders.value.has(folderId)) {
        expandedFolders.value.delete(folderId);
      } else {
        expandedFolders.value.add(folderId);
      }
    }
    function openCreateSubfolderDialog(parentFolder) {
      newFolderForm.value.parentId = parentFolder.id;
      showCreateFolderDialog.value = true;
    }
    function getParentFolderName(parentId) {
      const parent = folders.value.find((f) => f.id === parentId);
      return parent?.name || "";
    }
    async function selectFolder(folder) {
      currentFolder.value = folder;
      currentEntry.value = null;
      await loadEntries();
    }
    async function loadEntries() {
      if (!currentFolder.value) return;
      isLoadingEntries.value = true;
      try {
        const result = await window.electronAPI.diary.listEntries(currentFolder.value.id);
        if (result.success) {
          entries.value = result.data || [];
        }
      } catch (error) {
        console.error("加载日记列表失败:", error);
      } finally {
        isLoadingEntries.value = false;
      }
    }
    async function createNewEntry() {
      if (!currentFolder.value) return;
      try {
        const result = await window.electronAPI.diary.createEntry({
          folderId: currentFolder.value.id
        });
        if (result.success && result.data) {
          currentEntry.value = result.data;
          await loadEntries();
        } else {
          ElMessage.error(result.error || "创建日记失败");
        }
      } catch (error) {
        console.error("创建日记失败:", error);
        ElMessage.error("创建日记失败");
      }
    }
    async function selectEntry(entry) {
      try {
        const result = await window.electronAPI.diary.getEntry(entry.id);
        if (result.success && result.data) {
          currentEntry.value = result.data;
        }
      } catch (error) {
        console.error("获取日记详情失败:", error);
      }
    }
    async function handleCreateFolder() {
      if (!newFolderForm.value.name.trim()) {
        ElMessage.warning("请输入目录名称");
        return;
      }
      try {
        const result = await window.electronAPI.diary.createFolder({
          name: newFolderForm.value.name.trim(),
          parentId: newFolderForm.value.parentId || void 0
        });
        if (result.success) {
          showCreateFolderDialog.value = false;
          if (newFolderForm.value.parentId) {
            expandedFolders.value.add(newFolderForm.value.parentId);
          }
          newFolderForm.value.name = "";
          newFolderForm.value.parentId = "";
          await loadFolders();
          ElMessage.success("目录创建成功");
        } else {
          ElMessage.error(result.error || "创建失败");
        }
      } catch (error) {
        console.error("创建目录失败:", error);
        ElMessage.error("创建目录失败");
      }
    }
    async function handleFolderAction(command, folder) {
      switch (command) {
        case "rename":
          const { value } = await ElMessageBox.prompt("请输入新名称", "重命名", {
            inputValue: folder.name
          });
          if (value) {
            const result2 = await window.electronAPI.diary.updateFolder(folder.id, { name: value });
            if (result2.success) {
              await loadFolders();
              ElMessage.success("重命名成功");
            }
          }
          break;
        case "delete":
          await ElMessageBox.confirm("确定删除该目录及其所有日记吗？", "删除确认", { type: "warning" });
          const result = await window.electronAPI.diary.deleteFolder(folder.id);
          if (result.success) {
            if (currentFolder.value?.id === folder.id) {
              currentFolder.value = null;
            }
            await loadFolders();
            ElMessage.success("删除成功");
          }
          break;
      }
    }
    async function handleSearch() {
      if (!searchKeyword.value.trim()) {
        await loadEntries();
        return;
      }
    }
    async function handleEntryUpdated() {
      await loadEntries();
    }
    async function handleDeleteEntry(entry) {
      try {
        await ElMessageBox.confirm(`确定删除日记「${entry.title}」吗？`, "删除确认", { type: "warning" });
        const result = await window.electronAPI.diary.deleteEntry(entry.id);
        if (result.success) {
          if (currentEntry.value?.id === entry.id) {
            currentEntry.value = null;
          }
          await loadEntries();
          ElMessage.success("删除成功");
        } else {
          ElMessage.error(result.error || "删除失败");
        }
      } catch (error) {
        if (error !== "cancel") {
          console.error("删除日记失败:", error);
          ElMessage.error("删除失败");
        }
      }
    }
    function formatDate(date) {
      const d = new Date(date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    onMounted(() => {
      loadFolders();
    });
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_scrollbar = resolveComponent("el-scrollbar");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            _cache[11] || (_cache[11] = createBaseVNode("h3", null, "日记目录", -1)),
            createVNode(_component_el_button, {
              type: "primary",
              size: "small",
              onClick: _cache[0] || (_cache[0] = ($event) => showCreateFolderDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[10] || (_cache[10] = createTextVNode(" 新建 ", -1))
              ]),
              _: 1
            })
          ]),
          createBaseVNode("div", _hoisted_4, [
            createVNode(_component_el_scrollbar, null, {
              default: withCtx(() => [
                isLoadingFolders.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
                  createVNode(_component_el_icon, { class: "is-loading" }, {
                    default: withCtx(() => [
                      createVNode(unref(loading_default))
                    ]),
                    _: 1
                  }),
                  _cache[12] || (_cache[12] = createBaseVNode("span", null, "加载中...", -1))
                ])) : folders.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_6, [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(folder_opened_default))
                    ]),
                    _: 1
                  }),
                  _cache[14] || (_cache[14] = createBaseVNode("span", null, "暂无目录", -1)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    text: "",
                    onClick: _cache[1] || (_cache[1] = ($event) => showCreateFolderDialog.value = true)
                  }, {
                    default: withCtx(() => [..._cache[13] || (_cache[13] = [
                      createTextVNode(" 创建第一个目录 ", -1)
                    ])]),
                    _: 1
                  })
                ])) : (openBlock(), createElementBlock("div", _hoisted_7, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(rootFolders.value, (folder) => {
                    return openBlock(), createBlock(FolderTreeItem, {
                      key: folder.id,
                      folder,
                      "all-folders": folders.value,
                      "current-folder": currentFolder.value,
                      "expanded-folders": expandedFolders.value,
                      onSelect: selectFolder,
                      onToggle: toggleFolderExpand,
                      onAction: handleFolderAction,
                      onCreateSubfolder: openCreateSubfolderDialog
                    }, null, 8, ["folder", "all-folders", "current-folder", "expanded-folders"]);
                  }), 128))
                ]))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_8, [
          !currentFolder.value ? (openBlock(), createElementBlock("div", _hoisted_9, [
            createVNode(_component_el_icon, {
              size: 64,
              color: "#c0c4cc"
            }, {
              default: withCtx(() => [
                createVNode(unref(folder_opened_default))
              ]),
              _: 1
            }),
            _cache[16] || (_cache[16] = createBaseVNode("h3", null, "选择或创建目录", -1)),
            _cache[17] || (_cache[17] = createBaseVNode("p", null, "从左侧选择一个目录，或创建新的目录开始写日记", -1)),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: _cache[2] || (_cache[2] = ($event) => showCreateFolderDialog.value = true)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[15] || (_cache[15] = createTextVNode(" 新建目录 ", -1))
              ]),
              _: 1
            })
          ])) : !currentEntry.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_10, [
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("h2", null, toDisplayString(currentFolder.value.name), 1)
              ]),
              createBaseVNode("div", _hoisted_12, [
                createVNode(_component_el_input, {
                  modelValue: searchKeyword.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => searchKeyword.value = $event),
                  placeholder: "搜索日记...",
                  "prefix-icon": "Search",
                  clearable: "",
                  style: { "width": "200px" },
                  onKeyup: withKeys(handleSearch, ["enter"])
                }, null, 8, ["modelValue"]),
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: createNewEntry
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(plus_default))
                      ]),
                      _: 1
                    }),
                    _cache[18] || (_cache[18] = createTextVNode(" 新建日记 ", -1))
                  ]),
                  _: 1
                })
              ])
            ]),
            createBaseVNode("div", _hoisted_13, [
              createVNode(_component_el_scrollbar, null, {
                default: withCtx(() => [
                  isLoadingEntries.value ? (openBlock(), createElementBlock("div", _hoisted_14, [
                    createVNode(_component_el_icon, { class: "is-loading" }, {
                      default: withCtx(() => [
                        createVNode(unref(loading_default))
                      ]),
                      _: 1
                    })
                  ])) : entries.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_15, [
                    createVNode(_component_el_icon, {
                      size: 48,
                      color: "#c0c4cc"
                    }, {
                      default: withCtx(() => [
                        createVNode(unref(document_default))
                      ]),
                      _: 1
                    }),
                    _cache[20] || (_cache[20] = createBaseVNode("p", null, "暂无日记", -1)),
                    createVNode(_component_el_button, {
                      type: "primary",
                      onClick: createNewEntry
                    }, {
                      default: withCtx(() => [..._cache[19] || (_cache[19] = [
                        createTextVNode("写第一篇日记", -1)
                      ])]),
                      _: 1
                    })
                  ])) : (openBlock(), createElementBlock("div", _hoisted_16, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(entries.value, (entry) => {
                      return openBlock(), createElementBlock("div", {
                        key: entry.id,
                        class: "entry-item",
                        onClick: ($event) => selectEntry(entry)
                      }, [
                        createBaseVNode("div", _hoisted_18, [
                          createBaseVNode("div", _hoisted_19, toDisplayString(formatDate(entry.createdAt)), 1),
                          createBaseVNode("div", _hoisted_20, toDisplayString(entry.title), 1),
                          createBaseVNode("div", _hoisted_21, toDisplayString(entry.preview), 1),
                          createBaseVNode("div", _hoisted_22, [
                            createBaseVNode("span", null, toDisplayString(entry.wordCount) + " 字", 1)
                          ])
                        ]),
                        createBaseVNode("div", {
                          class: "entry-actions",
                          onClick: _cache[4] || (_cache[4] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          createVNode(_component_el_button, {
                            text: "",
                            size: "small",
                            onClick: ($event) => handleDeleteEntry(entry)
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
                  ]))
                ]),
                _: 1
              })
            ])
          ], 64)) : (openBlock(), createBlock(DiaryEditor, {
            key: 2,
            entry: currentEntry.value,
            onBack: _cache[5] || (_cache[5] = ($event) => currentEntry.value = null),
            onUpdated: handleEntryUpdated
          }, null, 8, ["entry"]))
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showCreateFolderDialog.value,
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => showCreateFolderDialog.value = $event),
          title: newFolderForm.value.parentId ? "新建子目录" : "新建目录",
          width: "400px",
          onClosed: _cache[9] || (_cache[9] = ($event) => newFolderForm.value.parentId = "")
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[7] || (_cache[7] = ($event) => showCreateFolderDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[21] || (_cache[21] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: handleCreateFolder
            }, {
              default: withCtx(() => [..._cache[22] || (_cache[22] = [
                createTextVNode("确定", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: newFolderForm.value,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                newFolderForm.value.parentId ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 0,
                  label: "父目录"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("span", null, toDisplayString(getParentFolderName(newFolderForm.value.parentId)), 1)
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                createVNode(_component_el_form_item, { label: "目录名称" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: newFolderForm.value.name,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => newFolderForm.value.name = $event),
                      placeholder: "请输入目录名称",
                      onKeyup: withKeys(handleCreateFolder, ["enter"])
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
const Diary = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-77bd03ea"]]);
export {
  Diary as default
};
