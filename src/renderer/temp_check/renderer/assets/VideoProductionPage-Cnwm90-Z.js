import { d as defineComponent, W as useTabsStore, O as onMounted, w as watch, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, X as arrow_left_default, e as createTextVNode, L as toDisplayString, c as createBlock, Y as createCommentVNode, x as picture_default, G as Fragment, H as renderList, a3 as headset_default, Z as video_play_default, $ as info_filled_default, a0 as useRoute, h as computed, r as ref, R as reactive, E as ElMessage, f as resolveComponent, I as useRouter, o as openBlock, J as normalizeClass, T as withModifiers, a1 as zoom_in_default, a2 as refresh_right_default, U as delete_default, a4 as video_pause_default, V as ElMessageBox, _ as _export_sfc } from "./index-CEiunyEa.js";
import { u as useStoryToVideoStore } from "./story-to-video--As1mzZs.js";
const _hoisted_1 = { class: "video-production-page" };
const _hoisted_2 = { class: "production-header" };
const _hoisted_3 = { class: "header-left" };
const _hoisted_4 = { class: "scene-name" };
const _hoisted_5 = { class: "header-right" };
const _hoisted_6 = { class: "production-content" };
const _hoisted_7 = { class: "storyboard-panel" };
const _hoisted_8 = { class: "panel-header" };
const _hoisted_9 = { class: "panel-actions" };
const _hoisted_10 = { class: "storyboard-grid" };
const _hoisted_11 = ["onClick"];
const _hoisted_12 = { class: "card-preview" };
const _hoisted_13 = ["onClick"];
const _hoisted_14 = ["src", "alt"];
const _hoisted_15 = { class: "preview-overlay" };
const _hoisted_16 = {
  key: 1,
  class: "preview-placeholder"
};
const _hoisted_17 = { class: "card-actions" };
const _hoisted_18 = { class: "card-status" };
const _hoisted_19 = { class: "card-info" };
const _hoisted_20 = { class: "card-meta" };
const _hoisted_21 = { class: "card-description" };
const _hoisted_22 = { class: "operation-panel" };
const _hoisted_23 = {
  key: 0,
  class: "panel-header-fixed"
};
const _hoisted_24 = { class: "panel-content" };
const _hoisted_25 = {
  key: 0,
  class: "detail-section"
};
const _hoisted_26 = { class: "description-text" };
const _hoisted_27 = {
  key: 0,
  class: "detail-preview"
};
const _hoisted_28 = ["src"];
const _hoisted_29 = { class: "detail-actions" };
const _hoisted_30 = {
  key: 2,
  class: "audio-section"
};
const _hoisted_31 = {
  key: 0,
  class: "audio-list"
};
const _hoisted_32 = { class: "audio-info" };
const _hoisted_33 = { class: "audio-character" };
const _hoisted_34 = { class: "audio-text" };
const _hoisted_35 = { class: "audio-controls" };
const _hoisted_36 = {
  key: 1,
  class: "audio-empty"
};
const _hoisted_37 = {
  key: 1,
  class: "bottom-actions-fixed"
};
const _hoisted_38 = { class: "action-buttons" };
const _hoisted_39 = {
  key: 0,
  class: "action-hint"
};
const _hoisted_40 = { class: "preview-container" };
const _hoisted_41 = ["src"];
const _hoisted_42 = { class: "generate-info" };
const _hoisted_43 = { class: "synthesis-progress" };
const _hoisted_44 = { class: "progress-label" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "VideoProductionPage",
  setup(__props) {
    const route = useRoute();
    const router = useRouter();
    const store = useStoryToVideoStore();
    const tabsStore = useTabsStore();
    function truncateTitle(title, maxLength = 5) {
      if (!title) return "";
      if (title.length <= maxLength) return title;
      return title.substring(0, maxLength) + "...";
    }
    const projectId = computed(() => route.params.projectId);
    const sceneId = computed(() => route.params.sceneId);
    const selectedStoryboard = ref(null);
    const generatingAll = ref(false);
    const generatingSingle = ref(false);
    const generatingAudio = ref(false);
    const showRegenerateDialog = ref(false);
    const showImagePreview = ref(false);
    const showSynthesisDialog = ref(false);
    const previewImageUrl = ref("");
    const regeneratingStoryboard = ref(null);
    const regenerateForm = reactive({
      styleName: "cinematic",
      additionalPrompt: ""
    });
    const synthesisForm = reactive({
      quality: "standard"
    });
    const synthesisProgress = reactive({
      phase: "",
      progress: 0
    });
    const currentPlayingId = ref(null);
    const isPlaying = ref(false);
    const audioElements = /* @__PURE__ */ new Map();
    const completedCount = computed(() => store.storyboards.filter((s) => s.frameImage).length);
    const hasAllImages = computed(() => store.storyboards.length > 0 && store.storyboards.every((s) => s.frameImage));
    const sceneDialoguesWithAudio = computed(() => {
      if (!store.currentScene || !store.currentScene.dialogues) return [];
      return store.currentScene.dialogues.filter((d) => d.audioAsset);
    });
    function getAudioSrc(audioAsset) {
      if (audioAsset.audioPath) {
        return `file://${audioAsset.audioPath}`;
      }
      return "";
    }
    function toggleAudioPlay(dialogue) {
      if (!dialogue.audioAsset) return;
      const audioId = dialogue.id;
      if (currentPlayingId.value === audioId && isPlaying.value) {
        const audio2 = audioElements.get(audioId);
        if (audio2) {
          audio2.pause();
          isPlaying.value = false;
        }
        return;
      }
      audioElements.forEach((audio2, id) => {
        if (id !== audioId) {
          audio2.pause();
          audio2.currentTime = 0;
        }
      });
      let audio = audioElements.get(audioId);
      if (!audio) {
        audio = new Audio(getAudioSrc(dialogue.audioAsset));
        audio.onended = () => {
          if (currentPlayingId.value === audioId) {
            currentPlayingId.value = null;
            isPlaying.value = false;
          }
        };
        audio.onerror = () => {
          ElMessage.error("音频加载失败");
          currentPlayingId.value = null;
          isPlaying.value = false;
        };
        audioElements.set(audioId, audio);
      }
      audio.currentTime = 0;
      audio.play();
      currentPlayingId.value = audioId;
      isPlaying.value = true;
    }
    const shotTypeLabels = {
      extreme_long: "大远景",
      long: "远景",
      full: "全景",
      medium: "中景",
      medium_close: "中近景",
      close: "近景",
      extreme_close: "特写",
      detail: "细节特写"
    };
    const cameraAngleLabels = {
      eye_level: "平视",
      high: "俯视",
      low: "仰视",
      dutch: "倾斜",
      birds_eye: "鸟瞰",
      worms_eye: "虫视"
    };
    const cameraMovementLabels = {
      static: "固定",
      pan_left: "左摇",
      pan_right: "右摇",
      tilt_up: "上仰",
      tilt_down: "下俯",
      dolly_in: "推近",
      dolly_out: "拉远",
      zoom_in: "放大",
      zoom_out: "缩小",
      tracking: "跟拍",
      crane: "升降"
    };
    function getShotTypeLabel(type) {
      return shotTypeLabels[type] || type;
    }
    function getCameraAngleLabel(angle) {
      return cameraAngleLabels[angle] || angle;
    }
    function getCameraMovementLabel(movement) {
      return cameraMovementLabels[movement] || movement;
    }
    function getSynthesisPhaseLabel(phase) {
      const labels = {
        shots: "生成镜头视频",
        audio: "合成音频",
        merge: "合并视频片段",
        final: "最终合成"
      };
      return labels[phase] || phase;
    }
    function goBack() {
      router.push(`/story-to-video/${projectId.value}`);
    }
    function selectStoryboard(storyboard) {
      selectedStoryboard.value = storyboard;
    }
    function openImagePreview(storyboard) {
      if (storyboard.frameImage) {
        previewImageUrl.value = storyboard.frameImage.filePath || storyboard.frameImage.url;
        showImagePreview.value = true;
      }
    }
    function openRegenerateDialog(storyboard) {
      regeneratingStoryboard.value = storyboard;
      regenerateForm.styleName = "cinematic";
      regenerateForm.additionalPrompt = "";
      showRegenerateDialog.value = true;
    }
    async function generateSingleImage(storyboard) {
      try {
        generatingSingle.value = true;
        const result = await store.generateStoryboardImage(
          storyboard.id,
          regenerateForm.styleName,
          void 0,
          void 0,
          regenerateForm.additionalPrompt
        );
        if (result) {
          ElMessage.success("画面生成成功");
          showRegenerateDialog.value = false;
        } else {
          ElMessage.error("画面生成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "画面生成失败");
      } finally {
        generatingSingle.value = false;
      }
    }
    async function regenerateImage() {
      if (!regeneratingStoryboard.value) return;
      await generateSingleImage(regeneratingStoryboard.value);
    }
    async function generateAllImages() {
      const pendingStoryboards = store.storyboards.filter((s) => !s.frameImage);
      if (pendingStoryboards.length === 0) {
        ElMessage.info("所有画面已生成");
        return;
      }
      try {
        generatingAll.value = true;
        let successCount = 0;
        for (const storyboard of pendingStoryboards) {
          const result = await store.generateStoryboardImage(storyboard.id, "cinematic");
          if (result) {
            successCount++;
          }
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
        ElMessage.success(`成功生成 ${successCount}/${pendingStoryboards.length} 个画面`);
      } catch (error) {
        ElMessage.error(error.message || "批量生成失败");
      } finally {
        generatingAll.value = false;
      }
    }
    async function confirmDeleteImage(storyboard) {
      try {
        await ElMessageBox.confirm("确定要删除这个画面吗？删除后可以重新生成。", "删除画面", {
          type: "warning"
        });
        ElMessage.success("画面已删除");
      } catch {
      }
    }
    async function generateAudio() {
      if (!store.currentScene) return;
      try {
        generatingAudio.value = true;
        const result = await store.generateSceneAudio(store.currentScene.id);
        if (result) {
          ElMessage.success("音频生成完成");
          await store.loadScene(store.currentScene.id);
        } else {
          ElMessage.error(store.error || "生成音频失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "生成音频失败");
      } finally {
        generatingAudio.value = false;
      }
    }
    async function synthesizeVideo() {
      if (!store.currentScene) return;
      try {
        synthesisProgress.phase = "shots";
        synthesisProgress.progress = 0;
        const result = await store.synthesizeSceneVideo(
          store.currentScene.id,
          synthesisForm.quality,
          (phase, progress) => {
            synthesisProgress.phase = phase;
            synthesisProgress.progress = Math.round(progress);
          }
        );
        if (result) {
          ElMessage.success(`视频合成成功，时长 ${result.duration} 秒`);
          showSynthesisDialog.value = false;
        } else {
          ElMessage.error(store.error || "视频合成失败");
        }
      } catch (error) {
        ElMessage.error(error.message || "视频合成失败");
      } finally {
        synthesisProgress.phase = "";
        synthesisProgress.progress = 0;
      }
    }
    onMounted(async () => {
      await store.loadProject(projectId.value);
      await store.loadEpisodes(projectId.value);
      await store.loadScene(sceneId.value);
      await store.loadStoryboards(sceneId.value);
      if (store.currentScene?.location) {
        tabsStore.updateTabTitle(route.path, truncateTitle(store.currentScene.location));
      }
    });
    watch(
      () => store.currentScene?.location,
      (location) => {
        if (location) {
          tabsStore.updateTabTitle(route.path, truncateTitle(location));
        }
      }
    );
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_divider = resolveComponent("el-divider");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_tooltip = resolveComponent("el-tooltip");
      const _component_el_descriptions_item = resolveComponent("el-descriptions-item");
      const _component_el_descriptions = resolveComponent("el-descriptions");
      const _component_el_empty = resolveComponent("el-empty");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_progress = resolveComponent("el-progress");
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
                _cache[11] || (_cache[11] = createTextVNode(" 返回项目 ", -1))
              ]),
              _: 1
            }),
            createVNode(_component_el_divider, { direction: "vertical" }),
            _cache[12] || (_cache[12] = createBaseVNode("h2", { class: "page-title" }, "视频制作", -1)),
            createBaseVNode("span", _hoisted_4, toDisplayString(unref(store).currentScene?.location || "加载中..."), 1)
          ]),
          createBaseVNode("div", _hoisted_5, [
            createVNode(_component_el_tag, { type: "info" }, {
              default: withCtx(() => [
                createTextVNode("共 " + toDisplayString(unref(store).storyboards.length) + " 个镜头", 1)
              ]),
              _: 1
            }),
            completedCount.value === unref(store).storyboards.length ? (openBlock(), createBlock(_component_el_tag, {
              key: 0,
              type: "success"
            }, {
              default: withCtx(() => [..._cache[13] || (_cache[13] = [
                createTextVNode("画面已全部生成", -1)
              ])]),
              _: 1
            })) : createCommentVNode("", true)
          ])
        ]),
        createBaseVNode("div", _hoisted_6, [
          createBaseVNode("div", _hoisted_7, [
            createBaseVNode("div", _hoisted_8, [
              _cache[14] || (_cache[14] = createBaseVNode("h3", null, "分镜列表", -1)),
              createBaseVNode("div", _hoisted_9, [
                createVNode(_component_el_button, {
                  size: "small",
                  onClick: generateAllImages,
                  loading: generatingAll.value,
                  disabled: completedCount.value === unref(store).storyboards.length
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(picture_default))
                      ]),
                      _: 1
                    }),
                    createTextVNode(" " + toDisplayString(generatingAll.value ? "批量生成中..." : "批量生成画面"), 1)
                  ]),
                  _: 1
                }, 8, ["loading", "disabled"])
              ])
            ]),
            createBaseVNode("div", _hoisted_10, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).storyboards, (storyboard) => {
                return openBlock(), createElementBlock("div", {
                  key: storyboard.id,
                  class: normalizeClass(["storyboard-card", { "has-image": storyboard.frameImage, "selected": selectedStoryboard.value?.id === storyboard.id }]),
                  onClick: ($event) => selectStoryboard(storyboard)
                }, [
                  createBaseVNode("div", _hoisted_12, [
                    storyboard.frameImage ? (openBlock(), createElementBlock("div", {
                      key: 0,
                      class: "preview-image",
                      onClick: withModifiers(($event) => openImagePreview(storyboard), ["stop"])
                    }, [
                      createBaseVNode("img", {
                        src: storyboard.frameImage.filePath || storyboard.frameImage.url,
                        alt: `镜头${storyboard.shotNumber}`
                      }, null, 8, _hoisted_14),
                      createBaseVNode("div", _hoisted_15, [
                        createVNode(_component_el_icon, { size: "24" }, {
                          default: withCtx(() => [
                            createVNode(unref(zoom_in_default))
                          ]),
                          _: 1
                        })
                      ])
                    ], 8, _hoisted_13)) : (openBlock(), createElementBlock("div", _hoisted_16, [
                      createVNode(_component_el_icon, { size: "32" }, {
                        default: withCtx(() => [
                          createVNode(unref(picture_default))
                        ]),
                        _: 1
                      }),
                      _cache[15] || (_cache[15] = createBaseVNode("span", null, "待生成", -1))
                    ])),
                    createBaseVNode("div", _hoisted_17, [
                      storyboard.frameImage ? (openBlock(), createBlock(_component_el_tooltip, {
                        key: 0,
                        content: "重新生成",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            circle: "",
                            size: "small",
                            onClick: withModifiers(($event) => openRegenerateDialog(storyboard), ["stop"])
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_el_icon, null, {
                                default: withCtx(() => [
                                  createVNode(unref(refresh_right_default))
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }, 8, ["onClick"])
                        ]),
                        _: 2
                      }, 1024)) : createCommentVNode("", true),
                      storyboard.frameImage ? (openBlock(), createBlock(_component_el_tooltip, {
                        key: 1,
                        content: "删除画面",
                        placement: "top"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_el_button, {
                            circle: "",
                            size: "small",
                            type: "danger",
                            onClick: withModifiers(($event) => confirmDeleteImage(storyboard), ["stop"])
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
                        _: 2
                      }, 1024)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_18, [
                      createVNode(_component_el_tag, {
                        size: "small",
                        type: storyboard.frameImage ? "success" : "info"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(" 镜头 " + toDisplayString(storyboard.shotNumber), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_19, [
                    createBaseVNode("div", _hoisted_20, [
                      createBaseVNode("span", null, toDisplayString(getShotTypeLabel(storyboard.shotType)), 1),
                      createBaseVNode("span", null, toDisplayString(storyboard.duration) + "s", 1)
                    ]),
                    createBaseVNode("div", _hoisted_21, toDisplayString(storyboard.frameDescription || "暂无描述"), 1)
                  ])
                ], 10, _hoisted_11);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_22, [
            selectedStoryboard.value ? (openBlock(), createElementBlock("div", _hoisted_23, [
              createBaseVNode("h3", null, "镜头 " + toDisplayString(selectedStoryboard.value.shotNumber) + " 详情", 1)
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_24, [
              selectedStoryboard.value ? (openBlock(), createElementBlock("div", _hoisted_25, [
                createVNode(_component_el_descriptions, {
                  column: 1,
                  border: "",
                  size: "small"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_descriptions_item, { label: "景别" }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(getShotTypeLabel(selectedStoryboard.value.shotType)), 1)
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_descriptions_item, { label: "角度" }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(getCameraAngleLabel(selectedStoryboard.value.cameraAngle)), 1)
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_descriptions_item, { label: "运镜" }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(getCameraMovementLabel(selectedStoryboard.value.cameraMovement)), 1)
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_descriptions_item, { label: "时长" }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(selectedStoryboard.value.duration) + "秒", 1)
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_descriptions_item, { label: "画面描述" }, {
                      default: withCtx(() => [
                        createBaseVNode("div", _hoisted_26, toDisplayString(selectedStoryboard.value.frameDescription), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                selectedStoryboard.value.frameImage ? (openBlock(), createElementBlock("div", _hoisted_27, [
                  createBaseVNode("img", {
                    src: selectedStoryboard.value.frameImage.filePath || selectedStoryboard.value.frameImage.url,
                    alt: "预览"
                  }, null, 8, _hoisted_28)
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_29, [
                  createVNode(_component_el_button, {
                    type: "primary",
                    onClick: _cache[0] || (_cache[0] = ($event) => openRegenerateDialog(selectedStoryboard.value)),
                    loading: generatingSingle.value
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(selectedStoryboard.value.frameImage ? "重新生成画面" : "生成画面"), 1)
                    ]),
                    _: 1
                  }, 8, ["loading"]),
                  selectedStoryboard.value.frameImage ? (openBlock(), createBlock(_component_el_button, {
                    key: 0,
                    onClick: _cache[1] || (_cache[1] = ($event) => openImagePreview(selectedStoryboard.value))
                  }, {
                    default: withCtx(() => [..._cache[16] || (_cache[16] = [
                      createTextVNode(" 查看大图 ", -1)
                    ])]),
                    _: 1
                  })) : createCommentVNode("", true)
                ])
              ])) : (openBlock(), createBlock(_component_el_empty, {
                key: 1,
                description: "请选择一个分镜",
                "image-size": 80
              })),
              unref(store).currentScene ? (openBlock(), createElementBlock("div", _hoisted_30, [
                _cache[17] || (_cache[17] = createBaseVNode("h4", null, "音频播放", -1)),
                sceneDialoguesWithAudio.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_31, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(sceneDialoguesWithAudio.value, (dialogue, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: dialogue.id,
                      class: "audio-item"
                    }, [
                      createBaseVNode("div", _hoisted_32, [
                        createBaseVNode("span", _hoisted_33, toDisplayString(dialogue.characterName), 1),
                        createBaseVNode("span", _hoisted_34, toDisplayString(dialogue.text), 1)
                      ]),
                      createBaseVNode("div", _hoisted_35, [
                        createVNode(_component_el_button, {
                          circle: "",
                          size: "small",
                          type: currentPlayingId.value === dialogue.id ? "primary" : "default",
                          onClick: ($event) => toggleAudioPlay(dialogue)
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_el_icon, null, {
                              default: withCtx(() => [
                                currentPlayingId.value === dialogue.id && isPlaying.value ? (openBlock(), createBlock(unref(video_pause_default), { key: 0 })) : (openBlock(), createBlock(unref(video_play_default), { key: 1 }))
                              ]),
                              _: 2
                            }, 1024)
                          ]),
                          _: 2
                        }, 1032, ["type", "onClick"])
                      ])
                    ]);
                  }), 128))
                ])) : (openBlock(), createElementBlock("div", _hoisted_36, "暂无音频"))
              ])) : createCommentVNode("", true)
            ]),
            unref(store).storyboards.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_37, [
              createBaseVNode("div", _hoisted_38, [
                createVNode(_component_el_button, {
                  onClick: generateAudio,
                  loading: generatingAudio.value,
                  disabled: !hasAllImages.value
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(headset_default))
                      ]),
                      _: 1
                    }),
                    _cache[18] || (_cache[18] = createTextVNode(" 生成音频 ", -1))
                  ]),
                  _: 1
                }, 8, ["loading", "disabled"]),
                createVNode(_component_el_button, {
                  type: "success",
                  onClick: _cache[2] || (_cache[2] = ($event) => showSynthesisDialog.value = true),
                  disabled: !hasAllImages.value
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(video_play_default))
                      ]),
                      _: 1
                    }),
                    _cache[19] || (_cache[19] = createTextVNode(" 合成视频 ", -1))
                  ]),
                  _: 1
                }, 8, ["disabled"])
              ]),
              !hasAllImages.value ? (openBlock(), createElementBlock("div", _hoisted_39, [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(info_filled_default))
                  ]),
                  _: 1
                }),
                _cache[20] || (_cache[20] = createTextVNode(" 请先为所有分镜生成画面 ", -1))
              ])) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ])
        ]),
        createVNode(_component_el_dialog, {
          modelValue: showRegenerateDialog.value,
          "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => showRegenerateDialog.value = $event),
          title: "重新生成画面",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[5] || (_cache[5] = ($event) => showRegenerateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[21] || (_cache[21] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: regenerateImage,
              loading: generatingSingle.value
            }, {
              default: withCtx(() => [..._cache[22] || (_cache[22] = [
                createTextVNode("开始生成", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, { "label-width": "80px" }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "镜头" }, {
                  default: withCtx(() => [
                    createTextVNode(" 镜头 " + toDisplayString(regeneratingStoryboard.value?.shotNumber), 1)
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "风格" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: regenerateForm.styleName,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => regenerateForm.styleName = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "电影风格",
                          value: "cinematic"
                        }),
                        createVNode(_component_el_option, {
                          label: "动漫风格",
                          value: "anime"
                        }),
                        createVNode(_component_el_option, {
                          label: "写实风格",
                          value: "realistic"
                        }),
                        createVNode(_component_el_option, {
                          label: "奇幻风格",
                          value: "fantasy"
                        }),
                        createVNode(_component_el_option, {
                          label: "古风仙侠",
                          value: "ancient_chinese"
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
                      modelValue: regenerateForm.additionalPrompt,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => regenerateForm.additionalPrompt = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "输入额外的画面描述，如：更暗的光线、增加细节等"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showImagePreview.value,
          "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => showImagePreview.value = $event),
          title: "画面预览",
          width: "90%",
          top: "5vh",
          "destroy-on-close": ""
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_40, [
              createBaseVNode("img", {
                src: previewImageUrl.value,
                alt: "预览图片",
                class: "preview-image-large"
              }, null, 8, _hoisted_41)
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showSynthesisDialog.value,
          "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => showSynthesisDialog.value = $event),
          title: "合成场景视频",
          width: "500px"
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[9] || (_cache[9] = ($event) => showSynthesisDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[23] || (_cache[23] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(store).loading || synthesisProgress.progress > 0,
              onClick: synthesizeVideo
            }, {
              default: withCtx(() => [..._cache[24] || (_cache[24] = [
                createTextVNode(" 开始合成 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              model: synthesisForm,
              "label-width": "80px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "视频质量" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: synthesisForm.quality,
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => synthesisForm.quality = $event),
                      style: { "width": "100%" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_el_option, {
                          label: "标准 (1080p 30fps)",
                          value: "standard"
                        }),
                        createVNode(_component_el_option, {
                          label: "高清 (1080p 高码率)",
                          value: "high"
                        }),
                        createVNode(_component_el_option, {
                          label: "流畅 (720p 24fps)",
                          value: "low"
                        }),
                        createVNode(_component_el_option, {
                          label: "竖屏 (1080x1920)",
                          value: "vertical"
                        })
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, { label: "说明" }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_42, "将合成 " + toDisplayString(unref(store).storyboards.length) + " 个镜头为完整视频", 1)
                  ]),
                  _: 1
                }),
                synthesisProgress.phase ? (openBlock(), createBlock(_component_el_form_item, {
                  key: 0,
                  label: "进度"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_43, [
                      createVNode(_component_el_progress, {
                        percentage: synthesisProgress.progress,
                        status: synthesisProgress.progress === 100 ? "success" : ""
                      }, null, 8, ["percentage", "status"]),
                      createBaseVNode("span", _hoisted_44, toDisplayString(getSynthesisPhaseLabel(synthesisProgress.phase)), 1)
                    ])
                  ]),
                  _: 1
                })) : createCommentVNode("", true)
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
const VideoProductionPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0349cc5b"]]);
export {
  VideoProductionPage as default
};
